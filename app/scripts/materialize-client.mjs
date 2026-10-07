// Postinstall. The protocol client is a `file:../clients/js` dependency on
// this repo's own Codama client. Bun installs it as a tree of symlinks into
// clients/js. Turbopack cannot read a symlinked package.json, and the
// client's own node_modules would bundle a second @solana/kit. Replace the
// install with a real copy of what npm would ship (package.json + dist), so
// the app resolves one @solana/kit (its own).
//
// When clients/js/dist is missing (fresh clone, Vercel), build it first:
// `bun install` at the repo root (the client's toolchain is a root workspace),
// then `bun run build` in clients/js.
// Delete this script once the client is published to npm.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const appRoot = process.cwd();
const repoRoot = resolve(appRoot, "..");
const clientDir = join(repoRoot, "clients", "js");

function run(cmd, args, cwd) {
  console.log(`materialize-client: ${cmd} ${args.join(" ")} (in ${cwd})`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

if (!existsSync(join(clientDir, "dist", "index.js"))) {
  if (!existsSync(join(repoRoot, "node_modules", "typescript"))) run("bun", ["install", "--frozen-lockfile"], repoRoot);
  run("bun", ["run", "build"], clientDir);
}

const dir = join(appRoot, "node_modules", "@mutav-finance", "mutav-protocol-solana");
const pkg = join(dir, "package.json");
if (!existsSync(pkg)) {
  console.error(`materialize-client: ${pkg} is missing; is the dependency installed?`);
  process.exit(1);
}
const source = dirname(realpathSync(pkg));
if (source !== dir) {
  if (!existsSync(join(source, "dist", "index.js"))) {
    console.error(`materialize-client: ${source}/dist is missing; run \`bun run build\` in ${source} first`);
    process.exit(1);
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(source, "package.json"), pkg, { dereference: true });
  cpSync(join(source, "dist"), join(dir, "dist"), { recursive: true, dereference: true });
  console.log(`materialize-client: copied package.json + dist from ${source}`);
}
