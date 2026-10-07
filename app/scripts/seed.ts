/**
 * Seed a LOCAL validator into the /demo starting state (docs/spec.md, "Seed
 * scenario"):
 *
 *   - a funded reserve: MUTAV's capital wallet deposits R$30,000 through the
 *     FIFO queue, the admin fulfils it and the shares are claimed;
 *   - two guarantees (R$22,000 of cover against R$30,000; at c = 0.10 they
 *     need R$2,200 of coverage);
 *   - one paid guarantee fee (R$1,000 gross, 20% take to the treasury);
 *   - one settled claim (filed → paid → settled by PIX) for the timeline.
 *
 * The under-coverage scenario for demo step 5 is a toggle
 * (`bun scripts/localnet.ts scenario under-covered|normal`), so step 2 can
 * still register guarantees first.
 *
 * Usage (against a validator already running with the program loaded):
 *   bun scripts/seed.ts --url http://127.0.0.1:8899 [--keys-dir DIR] [--admin-keypair PATH] [--operator PUBKEY]
 * Normally run through `bun run localnet:up`.
 *
 * Localnet only: refuses any non-local URL. App-side instructions are built
 * by the app's own composer (lib/server/compose.ts), exactly as the UI builds
 * them; the protocol's deploy composers build `initialize` and the root.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { address, createSolanaRpc, type Address, type KeyPairSigner } from "@solana/kit";
import {
  buildAllowlist,
  findGuaranteePda,
  findReserveAddresses,
  getSetRolesInstruction,
  MUTAV_PROGRAM_ADDRESS,
} from "@mutav-finance/mutav-protocol-solana";
import { readReserve } from "../lib/server/chain";
import { composeInstructions } from "../lib/server/compose";
import { serverEnv } from "../lib/server/env";
import { REF } from "../lib/refs";
import { fromHex } from "../lib/serde";
import type { TxRequest } from "../lib/tx-kinds";
import { assertLocal, defaultKeysDir, localKeys, protocolLib, signAndSend, type Role } from "./lib/local";

const BRL = 1_000_000n;
const log = (s: string) => console.log(`  · ${s}`);

export type SeedResult = {
  url: string;
  programId: string;
  config: string;
  reserveMint: string;
  allowlist: string[];
  keysDir: string;
  keys: Record<Role, { path: string; address: string }>;
  operator: string;
};

export function appEnv(url: string, config?: string, allowlist: string[] = []) {
  return serverEnv({
    NEXT_PUBLIC_CLUSTER: "localnet",
    RPC_URL: url,
    PROGRAM_ID: MUTAV_PROGRAM_ADDRESS,
    CONFIG_ADDRESS: config,
    ALLOWLIST: allowlist.join(","),
  });
}

/** Compose with the app's composer, sign with a local key, send. */
async function act(url: string, config: string, allowlist: string[], signer: KeyPairSigner, req: TxRequest, label: string) {
  const env = appEnv(url, config, allowlist);
  const reserve = await readReserve(env);
  const ixs = await composeInstructions(req, signer.address, { reserve, allowlist, env });
  const sig = await signAndSend(createSolanaRpc(url), signer.address, [signer], ixs);
  log(`${label} (${sig.slice(0, 10)}…)`);
  return sig;
}

export async function seed(opts: { url: string; keysDir?: string; adminKeypair?: string; operator?: string }): Promise<SeedResult> {
  const url = assertLocal(opts.url);
  const p = await protocolLib();
  const keysDir = opts.keysDir ?? defaultKeysDir();
  const k = await localKeys(keysDir, p.run, opts.adminKeypair ? { admin: opts.adminKeypair } : {});
  const rpc = createSolanaRpc(url);
  const s = (r: Role) => k[r].signer;

  console.log("\n== seed: wallets and the test BRS mint");
  for (const r of ["admin", "operator", "pauser", "capital"] as Role[]) await p.airdrop(rpc, s(r).address, 10);
  const cliConfig = join(keysDir, "cli.yml");
  writeFileSync(cliConfig, `json_rpc_url: "${url}"\nwebsocket_url: ""\nkeypair_path: "${k.deployer.path}"\ncommitment: confirmed\n`);
  const spl = (args: string[]) => p.run(["spl-token", "--config", cliConfig, "--fee-payer", k.deployer.path, ...args], { quiet: true });
  // Like Nora's BRS: 6 decimals and a freeze authority (here the local deployer).
  const mint = address(JSON.parse(spl(["create-token", "--decimals", "6", "--enable-freeze", "--output", "json"])).commandOutput.address);
  const ata = async (owner: Address) => {
    spl(["create-account", mint, "--owner", owner]);
    return p.associatedTokenAddress(owner, mint);
  };
  const treasury = await ata(s("treasuryOwner").address);
  const payments = await ata(s("paymentsOwner").address);
  spl(["mint", mint, "10000", await ata(s("operator").address)]);
  spl(["mint", mint, "60000", await ata(s("capital").address)]);
  log(`BRS mint ${mint} (freeze authority: local deployer)`);

  console.log("\n== seed: initialize the reserve (protocol deploy composers)");
  const allowlist = [s("capital").address];
  const cfg = p.parseConfig({
    cluster: "localnet",
    programId: MUTAV_PROGRAM_ADDRESS,
    reserveMint: mint,
    reserveTokenProgram: p.TOKEN_PROGRAM,
    squads: { multisig: s("deployer").address, vaultIndex: 0, timeLockFloorSecs: 0 },
    admin: s("admin").address,
    upgradeAuthority: s("admin").address,
    operator: s("operator").address,
    pauser: s("pauser").address,
    mutavCapitalWallet: s("capital").address,
    treasuryAccount: treasury,
    paymentsAccount: payments,
    // c = 0.10 and the caps of scripts/devnet/devnet.example.json (ADR 0016),
    // so localnet mirrors devnet.
    coverageRatioBps: 1_000,
    feeTakeBps: 2_000,
    payoutSlaSecs: 172_800,
    caps: {
      maxTvl: "300000000000",
      maxCoverPerGuarantee: "40000000000",
      maxCoverPerAgency: "3000000000000",
      maxClaimPerCall: "10000000000",
      maxClaimPerPeriod: "20000000000",
      claimPeriodSecs: 2_592_000,
      maxTesouroShareBps: 0,
      minRequest: "1000000000",
      maxRequest: "100000000000",
      minFillAssets: "500000000",
    },
    price: { tesouroPriceAccount: "11111111111111111111111111111111", p0: 1_000_000_000, t0: 0, yMaxBps: 1_500, maxStalenessSecs: 86_400, maxDeviationBps: 200, maxNavMoveBps: 10_000 },
    allowlist,
  });
  await p.send(rpc, s("admin"), [await p.composeInitialize(cfg, { upgradeAuthority: s("admin"), payer: s("admin") })]);
  const tree = await buildAllowlist(allowlist);
  await p.send(rpc, s("admin"), [await p.composeSetAllowlistRoot(cfg, tree.root, s("admin"))]);
  const config = (await findReserveAddresses(mint)).config;
  log(`VaultConfig ${config}`);

  console.log("\n== seed: MUTAV capital in (request → fulfil → claim shares)");
  const go = (who: Role, req: TxRequest, label: string) => act(url, config, allowlist, s(who), req, label);
  await go("capital", { kind: "request_deposit", assets: 30_000n * BRL }, "request_deposit R$30,000 from the capital wallet");
  await go("admin", { kind: "fulfil_deposits", count: 1 }, "fulfil_deposits (admin)");
  await go("capital", { kind: "claim_shares", seq: 0n }, "claim_shares");

  console.log("\n== seed: two guarantees");
  const lease = async (leaseLabel: string, agency: string, rent: bigint) =>
    go(
      "operator",
      {
        kind: "register_guarantee",
        id: await REF.guaranteeId(leaseLabel),
        agencyId: await REF.agencyId(agency),
        refsHash: await REF.refsHash(leaseLabel),
        rent: rent * BRL,
        defaultMultiplierBps: 30_000,
        exitMultiplierBps: 10_000,
        defaultCover: 3n * rent * BRL,
        exitCover: rent * BRL,
      },
      `register_guarantee ${leaseLabel} (${agency}, rent R$${rent})`,
    );
  await lease("lease-sp-001", "Imobiliária Paulista", 2_500n);
  await lease("lease-rj-001", "Rio Imóveis", 3_000n);

  console.log("\n== seed: one guarantee fee");
  await go("operator", { kind: "contribute_fees", invoiceRefHash: await REF.invoice("INV-2026-0001"), amount: 1_000n * BRL }, "contribute_fees R$1,000 (20% take to the treasury)");

  console.log("\n== seed: one settled claim (timeline history)");
  const [guarantee] = await findGuaranteePda({ config, id: fromHex(await REF.guaranteeId("lease-sp-001")) });
  const notice = await REF.notice("notice-sp-001-2026-09");
  await go("operator", { kind: "file_claim", guarantee, leg: 0, amount: 2_500n * BRL, noticeRefHash: notice }, "file_claim R$2,500 (default leg)");
  await go("operator", { kind: "pay_claim", guarantee, leg: 0, amount: 2_500n * BRL, noticeRefHash: notice }, "pay_claim R$2,500");
  await go("operator", { kind: "settle_payout", guarantee, noticeRefHash: notice, pixE2eHash: await REF.pixE2e("E1234567820261006120000demo0001") }, "settle_payout (PIX E2E hash)");

  let operator = s("operator").address as string;
  if (opts.operator) {
    console.log("\n== seed: hand the operator role to your wallet");
    const op = address(opts.operator);
    await p.airdrop(rpc, op, 10);
    spl(["mint", mint, "10000", await ata(op)]);
    const a = await findReserveAddresses(mint);
    await signAndSend(rpc, s("admin").address, [s("admin")], [
      getSetRolesInstruction({ admin: s("admin"), config, eventAuthority: a.eventAuthority, program: MUTAV_PROGRAM_ADDRESS, operator: op, pauser: s("pauser").address }),
    ]);
    operator = op;
    log(`set_roles: operator = ${op} (funded with 10 SOL and R$10,000 BRS)`);
  }

  await go("pauser", { kind: "refresh" }, "refresh (publish NAV, coverage and mode)");

  const keys = Object.fromEntries(Object.entries(k).map(([r, v]) => [r, { path: v.path, address: v.signer.address }])) as unknown as SeedResult["keys"];
  return { url, programId: MUTAV_PROGRAM_ADDRESS, config, reserveMint: mint, allowlist, keysDir, keys, operator };
}

/** Demo step 5: raise the coverage ratio so the reserve is under-covered (or restore it), then refresh. */
export async function setScenario(url: string, keysDir: string, scenario: "under-covered" | "normal", config: string) {
  assertLocal(url);
  const p = await protocolLib();
  const k = await localKeys(keysDir, p.run);
  // Restores the seeded c = 0.10 (ADR 0016).
  const ratio = scenario === "under-covered" ? 15_000 : 1_000;
  await act(url, config, [], k.admin.signer, { kind: "set_config", coverageRatioBps: ratio }, `set_config coverage_ratio_bps = ${ratio}`);
  await act(url, config, [], k.pauser.signer, { kind: "refresh" }, "refresh");
}

if (import.meta.main) {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce<[string, string][]>((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] ?? ""]] : acc), []),
  );
  const r = await seed({ url: args.url ?? "http://127.0.0.1:8899", keysDir: args["keys-dir"], adminKeypair: args["admin-keypair"], operator: args.operator });
  console.log(JSON.stringify(r, null, 2));
}
