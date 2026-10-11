/**
 * Disposable role wallets for the demo capture (test-only, never imported by
 * the app bundle).
 *
 *   bun e2e/demo/wallets.ts [localnet|devnet]
 *
 * One keypair file per role in ~/.config/solana/mutav/demo/<cluster>/ (dir
 * 0700, files 0600), created with `solana-keygen` when missing. The files stay
 * outside the repository; only addresses and paths are printed, never key
 * bytes. On localnet the seed (scripts/seed-demo.ts) funds them; on devnet
 * this prints what needs funding.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type DemoCluster = "localnet" | "devnet";

/**
 * The roles. `operator`, `capital` and `pauser` use the file names the
 * localnet seed (scripts/lib/local.ts) expects, so the seed adopts them.
 * `squads-1` stands in as the admin on localnet (direct signing).
 */
export const DEMO_ROLES = {
  operator: "operator",
  capital: "capital",
  pauser: "pauser",
  squads1: "squads-1",
  squads2: "squads-2",
  viewer: "viewer",
} as const;
export type DemoRole = keyof typeof DEMO_ROLES;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function walletDir(cluster: DemoCluster): string {
  const dir = process.env.DEMO_WALLET_DIR ?? join(homedir(), ".config", "solana", "mutav", "demo", cluster);
  const abs = resolve(dir);
  if (abs === REPO_ROOT || abs.startsWith(REPO_ROOT + sep)) throw new Error(`wallet dir ${abs} is inside the repository; keep keys outside it`);
  return abs;
}

export const walletPath = (cluster: DemoCluster, role: DemoRole) => join(walletDir(cluster), `${DEMO_ROLES[role]}.json`);

/** Public key of a keypair file, via the Solana CLI (never reads the bytes here). */
export const pubkeyOf = (path: string) => execFileSync("solana-keygen", ["pubkey", path], { encoding: "utf8" }).trim();

/** Make sure every role has a keypair; tighten permissions on everything in the dir. */
export function ensureWallets(cluster: DemoCluster): Record<DemoRole, { path: string; address: string }> {
  const dir = walletDir(cluster);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const out = {} as Record<DemoRole, { path: string; address: string }>;
  for (const role of Object.keys(DEMO_ROLES) as DemoRole[]) {
    const path = walletPath(cluster, role);
    if (!existsSync(path)) {
      execFileSync("solana-keygen", ["new", "--no-bip39-passphrase", "--silent", "--force", "-o", path], { stdio: ["ignore", "ignore", "inherit"] });
    }
    out[role] = { path, address: pubkeyOf(path) };
  }
  tightenPermissions(cluster);
  return out;
}

/** 0600 on every file in the wallet dir (the seed may add its own role files there). */
export function tightenPermissions(cluster: DemoCluster) {
  const dir = walletDir(cluster);
  if (!existsSync(dir)) return;
  chmodSync(dir, 0o700);
  for (const f of readdirSync(dir)) chmodSync(join(dir, f), 0o600);
}

function printFunding(cluster: DemoCluster, w: Record<DemoRole, { path: string; address: string }>) {
  if (cluster === "localnet") {
    console.log("localnet: `bun run demo:capture` seeds and funds these (airdrop + test BRS).");
    return;
  }
  console.log("\ndevnet funding (manual; this script sends nothing):");
  for (const role of ["operator", "capital", "pauser", "squads1", "squads2", "viewer"] as DemoRole[]) {
    console.log(`  solana airdrop 2 ${w[role].address} --url devnet   # ${role}: fees`);
  }
  console.log(
    [
      "",
      "BRS (Nora's sandbox mint BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4) comes from the funded dev wallet:",
      `  capital  ${w.capital.address}: >= the setup deposit (c × R$100,000; R$10,000 at c = 0.10, R$25,000 at c = 0.25) + R$5,000 for the coverage restore`,
      `  operator ${w.operator.address}: only if the fee beat runs (contribute_fees)`,
      "  spl-token transfer BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4 <amount> <owner> --fund-recipient --url devnet",
      "",
      "Roles on devnet are set by the deployed VaultConfig: the operator and capital wallet of the",
      "deploy must be these addresses (or hand the operator role over with propose_role / accept_role),",
      "and the capital wallet must be on the allowlist. squads-1/2 only stand in on localnet; on devnet the",
      "admin is the real Squads multisig.",
    ].join("\n"),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cluster = (process.argv[2] ?? "localnet") as DemoCluster;
  if (cluster !== "localnet" && cluster !== "devnet") throw new Error("usage: wallets.ts localnet|devnet");
  const w = ensureWallets(cluster);
  console.log(`demo wallets (${cluster}) in ${walletDir(cluster)} (0600):`);
  for (const [role, v] of Object.entries(w)) console.log(`  ${role.padEnd(9)} ${v.address}`);
  printFunding(cluster, w);
}
