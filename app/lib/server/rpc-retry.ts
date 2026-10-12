/**
 * Rate-limit handling for the server's RPC client. The public devnet RPC
 * limits each IP per method and per 10 s window (getTransaction,
 * getProgramAccounts, getBlockTime, getSignaturesForAddress and
 * getSignatureStatuses: 10 calls; answered with HTTP 429 and Retry-After: 10
 * past that). Two layers keep the routes inside it:
 *
 * - On the public devnet RPC, a per-method scheduler spaces calls to the
 *   published limits instead of bursting into 429s. A call that would wait
 *   longer than MAX_QUEUE_MS is refused at once (RpcBusyError).
 * - Every call (any RPC) is retried on 429 with exponential backoff and
 *   jitter, within a small budget. Retrying is safe for every call the server
 *   makes: reads, blockhash and status lookups, and the localnet relay (a 429
 *   means the request was not processed).
 */
import { isSolanaError, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR, type RpcTransport } from "@solana/kit";

export const RETRY = {
  /** Retries after the first attempt. */
  retries: 3,
  baseMs: 250,
  /** Longest single wait; a Retry-After beyond it is not waited out. */
  maxDelayMs: 2_000,
  /** Total time spent waiting before the error is surfaced. */
  budgetMs: 4_000,
};

/**
 * Per-method limits of the public devnet RPC, per IP per WINDOW_MS (its
 * `x-ratelimit-method-limit` headers, read 2026-10-12). Methods not listed
 * are limited at 100+ per window, far above what a route needs.
 */
export const PUBLIC_DEVNET_LIMITS: Readonly<Record<string, number>> = {
  getTransaction: 10,
  getProgramAccounts: 10,
  getBlockTime: 10,
  getSignaturesForAddress: 10,
  getSignatureStatuses: 10,
  getAccountInfo: 50,
  getMultipleAccounts: 50,
};
export const WINDOW_MS = 10_000;
/** Longest a call waits for a slot before it is refused as busy. */
export const MAX_QUEUE_MS = 15_000;
export const PUBLIC_DEVNET_HOST = "api.devnet.solana.com";

/** The server refused to queue a call: the RPC's per-method budget is spent for longer than MAX_QUEUE_MS. */
export class RpcBusyError extends Error {
  override name = "RpcBusyError";
  constructor(readonly method: string, readonly retryAfterMs: number) {
    super(`RPC busy: ${method} is rate limited for ${Math.ceil(retryAfterMs / 1000)} s`);
  }
}

type RetryOpts = Partial<typeof RETRY> & { sleep?: (ms: number) => Promise<void>; random?: () => number };

/** The upstream HTTP status of an RPC error: kit's transport error, or a status in a web3.js message. */
export function upstreamStatus(e: unknown): number | null {
  if (isSolanaError(e, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR)) return e.context.statusCode;
  const m = /\b(429|50[234])\b(?: Too Many Requests| Bad Gateway| Service Unavailable| Gateway Timeout)/.exec(e instanceof Error ? e.message : String(e));
  return m ? Number(m[1]) : null;
}

export const isRateLimited = (e: unknown) => upstreamStatus(e) === 429;

/**
 * The RPC is busy or unreachable (rate limit, upstream 5xx, network failure),
 * as opposed to a refusal or a decode error: worth a stale value or a retry later.
 */
export function isUpstreamError(e: unknown): boolean {
  if (e instanceof RpcBusyError) return true;
  const status = upstreamStatus(e);
  if (status !== null) return status === 429 || status >= 500;
  const msg = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : String(e);
  return /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(msg);
}

/** A 429's Retry-After (seconds form), or a queue refusal's wait, in ms; else null. */
export function retryAfterMs(e: unknown): number | null {
  if (e instanceof RpcBusyError) return e.retryAfterMs;
  if (!isSolanaError(e, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR)) return null;
  const h = e.context.headers;
  const v = h && typeof h.get === "function" ? h.get("retry-after") : null;
  const s = v === null ? NaN : Number(v);
  return Number.isFinite(s) && s >= 0 ? s * 1000 : null;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Run `fn`, retrying on HTTP 429 with exponential backoff and equal jitter, within the budget. */
export async function withRateLimitRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const o = { ...RETRY, ...opts };
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  let waited = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRateLimited(e) || attempt >= o.retries) throw e;
      const after = retryAfterMs(e);
      // The RPC says wait longer than a request can: surface it now.
      if (after !== null && after > o.maxDelayMs) throw e;
      const exp = Math.min(o.maxDelayMs, o.baseMs * 2 ** attempt);
      const delay = Math.max(exp / 2 + random() * (exp / 2), after ?? 0);
      if (waited + delay > o.budgetMs) throw e;
      waited += delay;
      await sleep(delay);
    }
  }
}

/**
 * Spaces calls per method to `limits` per WINDOW_MS: each call gets the
 * earliest send time that keeps every window under the limit, and a 429's
 * Retry-After pushes that method's next slot past it.
 */
export class MethodScheduler {
  private sends = new Map<string, number[]>();
  private blockedUntil = new Map<string, number>();
  constructor(
    private readonly limits: Readonly<Record<string, number>>,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  /** Wait for a slot for `method`; throws RpcBusyError if it is more than MAX_QUEUE_MS away. */
  async acquire(method: string): Promise<void> {
    const limit = this.limits[method];
    if (!limit) return;
    const now = this.now();
    const list = (this.sends.get(method) ?? []).filter((t) => t > now - WINDOW_MS);
    let at = Math.max(now, this.blockedUntil.get(method) ?? 0);
    if (list.length >= limit) at = Math.max(at, list[list.length - limit]! + WINDOW_MS);
    if (at - now > MAX_QUEUE_MS) {
      this.sends.set(method, list);
      throw new RpcBusyError(method, at - now);
    }
    list.push(at);
    this.sends.set(method, list);
    if (at > now) await this.sleep(at - now);
  }

  /** The RPC answered 429: no call of `method` before `retryAfterMs` from now. */
  penalize(method: string, retryAfterMs: number) {
    this.blockedUntil.set(method, Math.max(this.blockedUntil.get(method) ?? 0, this.now() + retryAfterMs));
  }
}

const methodOf = (config: Parameters<RpcTransport>[0]) => String((config.payload as { method?: unknown } | null)?.method ?? "");

/** A kit transport that waits for a scheduler slot (when given) and retries each request on 429. */
export function retryingTransport(inner: RpcTransport, opts: RetryOpts & { scheduler?: MethodScheduler } = {}): RpcTransport {
  const { scheduler } = opts;
  return (<T>(config: Parameters<RpcTransport>[0]) => {
    const method = methodOf(config);
    return withRateLimitRetry(async () => {
      await scheduler?.acquire(method);
      try {
        return await inner<T>(config);
      } catch (e) {
        if (scheduler && isRateLimited(e)) scheduler.penalize(method, retryAfterMs(e) ?? WINDOW_MS);
        throw e;
      }
    }, opts);
  }) as RpcTransport;
}

/** The scheduler for an RPC URL: the public devnet's published limits, or none (a dedicated RPC). */
export function schedulerFor(url: string): MethodScheduler | undefined {
  try {
    return new URL(url).hostname === PUBLIC_DEVNET_HOST ? new MethodScheduler(PUBLIC_DEVNET_LIMITS) : undefined;
  } catch {
    return undefined;
  }
}
