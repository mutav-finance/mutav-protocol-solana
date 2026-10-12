// Postinstall (and `bun run client:refresh`). The protocol client is a
// `file:../clients/js` dependency on this repo's own Codama client. Bun
// installs it as a tree of symlinks into clients/js. Turbopack cannot read a
// symlinked package.json, and the client's own node_modules would bundle a
// second @solana/kit. Replace the install with a real copy of what npm would
// ship (package.json + dist), so the app resolves one @solana/kit (its own).
//
// When clients/js/dist is missing (fresh clone, Vercel) or older than
// clients/js/src, build it first: `bun install` at the repo root (the client's
// toolchain is a root workspace), then `bun run build` in clients/js. The copy
// is refreshed whenever it is a symlink, or its dist or package.json is stale.
// Delete this script once the client is published to npm.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const appRoot = process.cwd();
const repoRoot = resolve(appRoot, "..");
const clientDir = join(repoRoot, "clients", "js");
const clientDist = join(clientDir, "dist", "index.js");

function run(cmd, args, cwd) {
  console.log(`materialize-client: ${cmd} ${args.join(" ")} (in ${cwd})`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

function mtime(path) {
  return existsSync(path) ? statSync(path).mtimeMs : 0;
}

function newestMtime(path) {
  if (!statSync(path).isDirectory()) return mtime(path);
  return Math.max(0, ...readdirSync(path).map((name) => newestMtime(join(path, name))));
}

if (mtime(clientDist) < newestMtime(join(clientDir, "src"))) {
  if (!existsSync(join(repoRoot, "node_modules", "typescript"))) run("bun", ["install", "--frozen-lockfile"], repoRoot);
  run("bun", ["run", "build"], clientDir);
}

const dir = join(appRoot, "node_modules", "@mutav-finance", "mutav-protocol-solana");
const pkg = join(dir, "package.json");
if (!existsSync(pkg)) {
  console.error(`materialize-client: ${pkg} is missing; is the dependency installed?`);
  process.exit(1);
}
const linked = realpathSync(pkg) !== pkg;
const stale =
  mtime(join(dir, "dist", "index.js")) < mtime(clientDist) ||
  readFileSync(pkg, "utf8") !== readFileSync(join(clientDir, "package.json"), "utf8");
if (linked || stale) {
  if (!existsSync(clientDist)) {
    console.error(`materialize-client: ${clientDir}/dist is missing; run \`bun run build\` in ${clientDir} first`);
    process.exit(1);
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(clientDir, "package.json"), pkg, { dereference: true });
  cpSync(join(clientDir, "dist"), join(dir, "dist"), { recursive: true, dereference: true });
  console.log(`materialize-client: ${linked ? "copied" : "refreshed (stale)"} package.json + dist from ${clientDir}`);
} else {
  console.log("materialize-client: up to date");
}
