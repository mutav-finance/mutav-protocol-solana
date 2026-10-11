/**
 * Node-side signer behind the injected test wallet (TEST-ONLY: e2e/demo/).
 *
 * The secret key never enters the browser: the page's wallet calls an exposed
 * binding with the transaction bytes, and this module signs them with a
 * disposable role keypair read from ~/.config/solana/mutav/demo/<cluster>/.
 *
 * Safety guard: before the first signature it asks the RPC for its genesis
 * hash and refuses to sign anything unless the cluster is devnet (known
 * genesis) or a local validator (a local URL serving no public genesis).
 * Nothing in app/, components/ or lib/ imports this file.
 */
import { readFileSync } from "node:fs";
import {
  createKeyPairSignerFromBytes,
  getBase58Decoder,
  getBase58Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  partiallySignTransaction,
  type KeyPairSigner,
} from "@solana/kit";
import { DEVNET_GENESIS, isLocalUrl, MAINNET_GENESIS, TESTNET_GENESIS } from "../../lib/cluster";
import type { DemoCluster } from "./wallets";

async function rpcCall<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const body = (await res.json()) as { result?: T; error?: { message: string; data?: { logs?: string[] } } };
  if (body.error) {
    const logs = body.error.data?.logs;
    throw new Error(`${body.error.message}${logs ? "\n" + logs.join("\n") : ""}`);
  }
  return body.result as T;
}

/** Throws unless `url` is devnet or a local validator. Returns the genesis hash. */
export async function assertSafeCluster(url: string, cluster: DemoCluster): Promise<string> {
  const hash = await rpcCall<string>(url, "getGenesisHash");
  if (hash === MAINNET_GENESIS || hash === TESTNET_GENESIS) throw new Error(`test wallet refuses to sign: ${new URL(url).host} serves a public non-devnet cluster (${hash})`);
  if (cluster === "devnet" && hash !== DEVNET_GENESIS) throw new Error(`test wallet refuses to sign: genesis ${hash} is not devnet (${DEVNET_GENESIS})`);
  if (cluster === "localnet" && (hash === DEVNET_GENESIS || !isLocalUrl(`${new URL(url).protocol}//${new URL(url).host}`))) {
    throw new Error(`test wallet refuses to sign: ${new URL(url).host} is not a local validator`);
  }
  return hash;
}

export class TestSigner {
  private constructor(
    readonly address: string,
    private readonly signer: KeyPairSigner,
    private readonly rpcUrl: string,
    private readonly cluster: DemoCluster,
    private checked: Promise<string> | null = null,
  ) {}

  /** Loads a role keypair file. Its bytes stay in this process; only the address is exposed. */
  static async fromFile(path: string, rpcUrl: string, cluster: DemoCluster) {
    const bytes = new Uint8Array(JSON.parse(readFileSync(path, "utf8")) as number[]);
    const signer = await createKeyPairSignerFromBytes(bytes);
    bytes.fill(0);
    return new TestSigner(signer.address, signer, rpcUrl, cluster);
  }

  get publicKeyBytes(): number[] {
    return Array.from(getBase58Encoder().encode(this.address));
  }

  private guard() {
    this.checked ??= assertSafeCluster(this.rpcUrl, this.cluster);
    return this.checked;
  }

  /** Sign wire-transaction bytes (our slot only); returns the signed wire bytes. */
  async signTransaction(wire: Uint8Array): Promise<Uint8Array> {
    await this.guard();
    const tx = getTransactionDecoder().decode(wire);
    if (!(this.address in tx.signatures)) throw new Error(`test wallet ${this.address} is not a signer of this transaction`);
    const signed = await partiallySignTransaction([this.signer.keyPair], tx);
    return new Uint8Array(getTransactionEncoder().encode(signed));
  }

  /** Sign, then send through the harness's RPC (the wallet's own RPC); returns the 64-byte signature. */
  async signAndSendTransaction(wire: Uint8Array): Promise<Uint8Array> {
    const signed = await this.signTransaction(wire);
    const b64 = Buffer.from(signed).toString("base64");
    const sig = await rpcCall<string>(this.rpcUrl, "sendTransaction", [b64, { encoding: "base64", preflightCommitment: "confirmed" }]);
    return new Uint8Array(getBase58Encoder().encode(sig));
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    await this.guard();
    const [out] = await this.signer.signMessages([{ content: message, signatures: {} }]);
    return new Uint8Array(out![this.address as keyof typeof out] as Uint8Array);
  }
}

export const b58 = (bytes: Uint8Array) => getBase58Decoder().decode(bytes);
