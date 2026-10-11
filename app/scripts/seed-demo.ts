/**
 * Seed a LOCAL validator into the demo-video starting state (the World's Fair
 * storyboard, "Devnet starting state"), for e2e/demo/ (the capture harness):
 *
 *   - wallets funded, the test BRS mint, the reserve initialized;
 *   - MUTAV capital in: request_deposit of c × R$100,000, fulfilled by the
 *     admin (the Squads stand-in, direct signing on localnet), shares claimed;
 *   - a pending withdrawal: request_redeem of about R$1,500 of shares (it
 *     only escrows shares, so free capital does not move);
 *   - 5 guarantees of R$18,000 (rent R$2,000 × 6 default + 3 exit);
 *   - no fees, no claims, then `refresh`.
 *
 * So free capital is c × R$10,000: Ana's R$6,000 lease (c × R$6,000) fits,
 * and a second one of the same size is refused (InsufficientFreeCapital).
 * At c = 0.10 that is the storyboard's 10,000 / 9,000 / 1,000 / 5.
 *
 * DEMO_PARAMS picks the config: `storyboard` (default; c = 0.10 and the caps
 * of ADR 0016) or `adr0028` (the pilot parameters: c = 0.25, R$1M TVL,
 * R$120k per guarantee, R$15k / R$20k claims, R$19k stress buffer).
 *
 * Run through `bun scripts/localnet.ts up --seed demo`. Localnet only: it
 * refuses any non-local URL, and signs only with the throwaway keys in
 * `--keys-dir` (outside the repo).
 */
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { address, createSolanaRpc, type Address, type KeyPairSigner } from "@solana/kit";
import { buildAllowlist, findReserveAddresses, MUTAV_PROGRAM_ADDRESS } from "@mutav-finance/mutav-protocol-solana";
import { readReserve } from "../lib/server/chain";
import { composeInstructions } from "../lib/server/compose";
import { randomRef, REF } from "../lib/refs";
import type { TxRequest } from "../lib/tx-kinds";
import { assertLocal, defaultKeysDir, localKeys, protocolLib, signAndSend, type Role } from "./lib/local";
import { appEnv, type SeedResult } from "./seed";

const BRL = 1_000_000n;
const log = (s: string) => console.log(`  · ${s}`);

export const DEMO_PARAMS = {
  storyboard: {
    coverageRatioBps: 1_000,
    caps: { maxTvl: "300000000000", maxCoverPerGuarantee: "40000000000", maxClaimPerCall: "10000000000", maxClaimPerPeriod: "20000000000" },
  },
  adr0028: {
    coverageRatioBps: 2_500,
    caps: { maxTvl: "1000000000000", maxCoverPerGuarantee: "120000000000", maxClaimPerCall: "15000000000", maxClaimPerPeriod: "20000000000", stressBuffer: "19000000000" },
  },
} as const;
export type DemoParams = keyof typeof DEMO_PARAMS;

/** Value of the pre-staged withdrawal (≥ min_request). */
export const REDEEM_VALUE = 1_500n * BRL;

/** The deposit that leaves free capital at c × R$10,000 after 5 × R$18,000 of cover. */
export const setupDeposit = (coverageRatioBps: number) => (BigInt(coverageRatioBps) * 100_000n * BRL) / 10_000n;
export const SETUP_LEASES = Array.from({ length: 5 }, (_, i) => ({ lease: `MTV-PF-000${i + 1}`, agency: ["Imobiliária Planalto", "Casa Gaúcha Imóveis", "Imobiliária Planalto", "Rio Grande Lar", "Casa Gaúcha Imóveis"][i]!, rent: 2_000n }));

export async function seedDemo(opts: { url: string; keysDir?: string; adminKeypair?: string; operator?: string }): Promise<SeedResult> {
  const url = assertLocal(opts.url);
  const params = DEMO_PARAMS[(process.env.DEMO_PARAMS ?? "storyboard") as DemoParams];
  if (!params) throw new Error(`DEMO_PARAMS must be one of ${Object.keys(DEMO_PARAMS).join(", ")}`);
  const p = await protocolLib();
  const keysDir = opts.keysDir ?? defaultKeysDir();
  const k = await localKeys(keysDir, p.run, opts.adminKeypair ? { admin: opts.adminKeypair } : {});
  const rpc = createSolanaRpc(url);
  const s = (r: Role) => k[r].signer;

  console.log(`\n== demo seed (${process.env.DEMO_PARAMS ?? "storyboard"}): wallets and the test BRS mint`);
  for (const r of ["admin", "operator", "pauser", "capital"] as Role[]) await p.airdrop(rpc, s(r).address, 10);
  const cliConfig = join(keysDir, "cli.yml");
  writeFileSync(cliConfig, `json_rpc_url: "${url}"\nwebsocket_url: ""\nkeypair_path: "${k.deployer.path}"\ncommitment: confirmed\n`, { mode: 0o600 });
  const spl = (args: string[]) => p.run(["spl-token", "--config", cliConfig, "--fee-payer", k.deployer.path, ...args], { quiet: true });
  const mint = address(JSON.parse(spl(["create-token", "--decimals", "6", "--enable-freeze", "--output", "json"])).commandOutput.address);
  const ata = async (owner: Address) => {
    spl(["create-account", mint, "--owner", owner]);
    return p.associatedTokenAddress(owner, mint);
  };
  const treasury = await ata(s("treasuryOwner").address);
  const payments = await ata(s("paymentsOwner").address);
  spl(["mint", mint, "10000", await ata(s("operator").address)]);
  spl(["mint", mint, "60000", await ata(s("capital").address)]);
  log(`BRS mint ${mint}`);

  console.log("\n== demo seed: initialize");
  const allowlist = [s("capital").address];
  // One local key stands in for both multisigs (as in the protocol's dry run).
  const standIn = { multisig: s("deployer").address, vaultIndex: 0, members: [s("deployer").address], threshold: 1, timeLockFloorSecs: 0 };
  const cfg = p.parseConfig({
    cluster: "localnet",
    programId: MUTAV_PROGRAM_ADDRESS,
    reserveMint: mint,
    reserveTokenProgram: p.TOKEN_PROGRAM,
    squads: standIn,
    upgradeSquads: standIn,
    admin: s("admin").address,
    upgradeAuthority: s("admin").address,
    operator: s("operator").address,
    pauser: s("pauser").address,
    mutavCapitalWallet: s("capital").address,
    treasuryAccount: treasury,
    paymentsAccount: payments,
    coverageRatioBps: params.coverageRatioBps,
    feeTakeBps: 2_000,
    caps: { ...params.caps, minRequest: "1000000000", maxRequest: "100000000000", maxNavMoveBps: 10_000 },
    allowlist,
  });
  await p.send(rpc, s("admin"), [await p.composeInitialize(cfg, { upgradeAuthority: s("admin"), payer: s("admin") })]);
  const tree = await buildAllowlist(allowlist);
  await p.send(rpc, s("admin"), [await p.composeSetAllowlistRoot(cfg, tree.root, s("admin"))]);
  const config = (await findReserveAddresses(mint)).config;
  log(`VaultConfig ${config} (c = ${params.coverageRatioBps / 10_000})`);

  const go = async (signer: KeyPairSigner, req: TxRequest, label: string) => {
    const env = appEnv(url, config, allowlist);
    const ixs = await composeInstructions(req, signer.address, { reserve: await readReserve(env), allowlist, env });
    const sig = await signAndSend(rpc, signer.address, [signer], ixs);
    log(`${label} (${sig.slice(0, 10)}…)`);
  };

  console.log("\n== demo seed: setup (capital in, 5 guarantees)");
  const deposit = setupDeposit(params.coverageRatioBps);
  await go(s("capital"), { kind: "request_deposit", assets: deposit }, `request_deposit R$${deposit / BRL}`);
  await go(s("admin"), { kind: "fulfil_deposits", count: 1 }, "fulfil_deposits (admin stand-in, direct)");
  await go(s("capital"), { kind: "claim_shares", seq: 0n }, "claim_shares");
  // A pending withdrawal for the capital beat: it waits in the redeem queue,
  // and once a claim takes the reserve under its target it cannot be filled.
  // Requesting only escrows shares: stable assets and free capital don't move.
  const r0 = await readReserve(appEnv(url, config, allowlist));
  const redeemShares = (REDEEM_VALUE * r0.state.sharesOutstanding + r0.solvency.netAssets - 1n) / r0.solvency.netAssets;
  await go(s("capital"), { kind: "request_redeem", shares: redeemShares }, `request_redeem (≈ R$${REDEEM_VALUE / BRL} of shares)`);
  const agencyIds = new Map<string, string>();
  for (const l of SETUP_LEASES) {
    if (!agencyIds.has(l.agency)) agencyIds.set(l.agency, randomRef());
    await go(
      s("operator"),
      {
        kind: "register_guarantee",
        id: await REF.guaranteeId(l.lease),
        agencyId: agencyIds.get(l.agency)!,
        refsHash: await REF.refsHash(l.lease, randomRef()),
        defaultCover: 6n * l.rent * BRL,
        exitCover: 3n * l.rent * BRL,
      },
      `register_guarantee ${l.lease} (R$18,000)`,
    );
  }
  await go(s("pauser"), { kind: "refresh" }, "refresh");

  const keys = Object.fromEntries(Object.entries(k).map(([r, v]) => [r, { path: v.path, address: v.signer.address }])) as unknown as SeedResult["keys"];
  return { url, programId: MUTAV_PROGRAM_ADDRESS, config, reserveMint: mint, allowlist, keysDir, keys, operator: s("operator").address };
}
