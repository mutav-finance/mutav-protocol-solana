// Postinstall. Bun installs the `file:` protocol-client dependency as a tree
// of symlinks into the sibling repo. Turbopack cannot read a symlinked
// package.json, and the client's own node_modules would bundle a second
// @solana/kit. Replace the install with a real copy of what npm would ship
// (package.json + dist), so the app resolves one @solana/kit (its own).
// Delete this script once the client is published to npm or vendored.
import { cpSync, existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const dir = join(process.cwd(), "node_modules", "@mutav-finance", "mutav-protocol-solana");
const pkg = join(dir, "package.json");
if (existsSync(pkg)) {
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
}
