/**
 * On-chain reads for the route handlers, through the protocol client's
 * decoders and PDA helpers. Read-only: nothing here signs or sends.
 */
import {
  createSolanaRpc,
  getBase58Decoder,
  getBase64Encoder,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  AGENCY_EXPOSURE_DISCRIMINATOR,
  CLAIM_FILING_DISCRIMINATOR,
  FEE_RECEIPT_DISCRIMINATOR,
  PAYOUT_DISCRIMINATOR,
  fetchAllMaybeDepositRequest,
  fetchAllMaybeRedeemRequest,
  fetchGuaranteesForReserve,
  fetchVaultConfig,
  fetchVaultState,
  findAgencyExposurePda,
  findDepositRequestPda,
  findFeeReceiptPda,
  findRedeemRequestPda,
  findReserveAddresses,
  getAgencyExposureDecoder,
  getClaimFilingDecoder,
  getFeeReceiptDecoder,
  getPayoutDecoder,
  solvencyFromAccounts,
} from "@mutav-finance/mutav-protocol-solana";
import { fetchEncodedAccount, getAddressDecoder } from "@solana/kit";
import type { Ledger, ReserveView, Row, TokenFacts } from "../view";
import { serverEnv, type ServerEnv } from "./env";

export class NotConfiguredError extends Error {
  override name = "NotConfiguredError";
}

let cached: { url: string; rpc: ReturnType<typeof createSolanaRpc> } | null = null;
export function rpcFor(env: ServerEnv) {
  if (!cached || cached.url !== env.rpcUrl) cached = { url: env.rpcUrl, rpc: createSolanaRpc(env.rpcUrl) };
  return cached.rpc;
}

const b58 = getBase58Decoder();
const b64 = getBase64Encoder();

/** Cluster time: block time of the current slot, falling back to the wall clock. */
async function clusterNow(env: ServerEnv): Promise<{ slot: bigint; now: bigint }> {
  const rpc = rpcFor(env);
  const slot = await rpc.getSlot({ commitment: "confirmed" }).send();
  let t: bigint | null = null;
  try {
    t = (await rpc.getBlockTime(slot).send()) as unknown as bigint | null;
  } catch {
    t = null;
  }
  return { slot, now: t !== null ? BigInt(t) : BigInt(Math.floor(Date.now() / 1000)) };
}

export async function readReserve(env = serverEnv()): Promise<ReserveView> {
  if (!env.configAddress) throw new NotConfiguredError("CONFIG_ADDRESS is not set");
  const rpc = rpcFor(env);
  const o = { programAddress: env.programId };
  const config = await fetchVaultConfig(rpc, env.configAddress);
  const addresses = await findReserveAddresses(config.data.reserveMint, o);
  if (addresses.config !== env.configAddress) {
    throw new Error(`CONFIG_ADDRESS ${env.configAddress} is not the config PDA of its reserve mint under ${env.programId}`);
  }
  const [state, clock, token] = await Promise.all([
    fetchVaultState(rpc, addresses.state),
    clusterNow(env),
    readTokenFacts(env, config.data.reserveMint, addresses.reserve),
  ]);
  return {
    cluster: env.cluster,
    programId: env.programId,
    explorerRpc: env.explorerRpc,
    addresses,
    config: config.data,
    state: state.data,
    solvency: solvencyFromAccounts(config.data, state.data),
    now: clock.now,
    slot: clock.slot,
    token,
  };
}

/**
 * SPL Token facts the disclosures need, decoded from the raw accounts:
 * Mint: [0..4) mint-authority option, [4..36) authority, [36..44) supply,
 * [44] decimals, [45] initialized, [46..50) freeze-authority option, [50..82) freeze authority.
 * Token account: [108] state (1 = initialized, 2 = frozen).
 */
async function readTokenFacts(env: ServerEnv, mint: Address, reserve: Address): Promise<TokenFacts> {
  const rpc = rpcFor(env);
  const [m, r] = await Promise.all([fetchEncodedAccount(rpc, mint), fetchEncodedAccount(rpc, reserve)]);
  const ad = getAddressDecoder();
  let freezeAuthority: string | null = null;
  let supply: bigint | null = null;
  if (m.exists && m.data.length >= 82) {
    const d = m.data as Uint8Array;
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    supply = dv.getBigUint64(36, true);
    if (dv.getUint32(46, true) === 1) freezeAuthority = ad.decode(d.subarray(50, 82));
  }
  const reserveFrozen = r.exists && (r.data as Uint8Array).length > 108 ? (r.data as Uint8Array)[108] === 2 : false;
  return { mint, mintOwner: m.exists ? m.programAddress : null, freezeAuthority, supply, reserveFrozen };
}

/** Every program account of one type (by discriminator), decoded. */
async function scan<T>(env: ServerEnv, discriminator: ReadonlyUint8Array, decode: (b: Uint8Array) => T): Promise<Row<T>[]> {
  const rows = (await rpcFor(env)
    .getProgramAccounts(env.programId, {
      encoding: "base64",
      filters: [{ memcmp: { offset: 0n, bytes: b58.decode(discriminator), encoding: "base58" } }],
    } as never)
    .send()) as unknown as { pubkey: Address; account: { data: [string, string] } }[];
  return rows.map(({ pubkey, account }) => ({ address: pubkey, data: decode(b64.encode(account.data[0]) as Uint8Array) }));
}

/** Most queue seqs read per side; the pilot queue is far shorter. */
const MAX_SEQS = 256n;

const seqRange = (next: bigint) => {
  const from = next > MAX_SEQS ? next - MAX_SEQS : 0n;
  return Array.from({ length: Number(next - from) }, (_, i) => from + BigInt(i));
};

export async function readLedger(env = serverEnv(), reserve?: ReserveView): Promise<Ledger> {
  const r = reserve ?? (await readReserve(env));
  const rpc = rpcFor(env);
  const o = { programAddress: env.programId };
  const config = r.addresses.config as Address;

  const [guarantees, filingsAll, payoutsAll, exposuresAll, feesAll] = await Promise.all([
    fetchGuaranteesForReserve(rpc, config, o),
    scan(env, CLAIM_FILING_DISCRIMINATOR, (b) => getClaimFilingDecoder().decode(b)),
    scan(env, PAYOUT_DISCRIMINATOR, (b) => getPayoutDecoder().decode(b)),
    scan(env, AGENCY_EXPOSURE_DISCRIMINATOR, (b) => getAgencyExposureDecoder().decode(b)),
    scan(env, FEE_RECEIPT_DISCRIMINATOR, (b) => getFeeReceiptDecoder().decode(b)),
  ]);

  // Keep only accounts of this reserve: filings and payouts by guarantee, the
  // rest by re-deriving their PDA under this config.
  const mine = new Set(guarantees.map((g) => g.address as string));
  const filings = filingsAll.filter((f) => mine.has(f.data.guarantee));
  const payouts = payoutsAll.filter((p) => mine.has(p.data.guarantee));
  const exposureOk = await Promise.all(
    exposuresAll.map(async (e) => (await findAgencyExposurePda({ config, agencyId: e.data.agencyId }, o))[0] === e.address),
  );
  const feeOk = await Promise.all(
    feesAll.map(async (f) => (await findFeeReceiptPda({ config, invoiceRefHash: f.data.invoiceRefHash }, o))[0] === f.address),
  );
  const exposures = exposuresAll.filter((_, i) => exposureOk[i]);
  const feeRows = feesAll.filter((_, i) => feeOk[i]);
  const fees = await Promise.all(
    feeRows.map(async (f) => {
      let blockTime: bigint | null = null;
      try {
        const t = await rpc.getBlockTime(f.data.slot).send();
        blockTime = t === null ? null : BigInt(t as unknown as number);
      } catch {
        blockTime = null;
      }
      return { ...f, blockTime };
    }),
  );

  const depSeqs = seqRange(r.state.nextDepositSeq);
  const redSeqs = seqRange(r.state.nextRedeemSeq);
  const [depAddrs, redAddrs] = await Promise.all([
    Promise.all(depSeqs.map(async (seq) => (await findDepositRequestPda({ config, seq }, o))[0])),
    Promise.all(redSeqs.map(async (seq) => (await findRedeemRequestPda({ config, seq }, o))[0])),
  ]);
  const [depAccs, redAccs] = await Promise.all([
    depAddrs.length ? fetchAllMaybeDepositRequest(rpc, depAddrs) : Promise.resolve([]),
    redAddrs.length ? fetchAllMaybeRedeemRequest(rpc, redAddrs) : Promise.resolve([]),
  ]);

  return {
    guarantees: guarantees.map((g) => ({ address: g.address, data: g.data })),
    filings,
    payouts,
    exposures,
    fees,
    deposits: depAccs.flatMap((a) => (a.exists ? [{ address: a.address, data: a.data }] : [])),
    redeems: redAccs.flatMap((a) => (a.exists ? [{ address: a.address, data: a.data }] : [])),
  };
}
