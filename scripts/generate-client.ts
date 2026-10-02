/**
 * Generate the TypeScript client from the Anchor IDL.
 *
 *   anchor build && bun run generate:client
 *
 * Reads target/idl/mutav.json and writes clients/js/src/generated (Kit 8,
 * root `@solana/kit` imports). CI regenerates and fails on any diff.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rootNodeFromAnchor, type AnchorIdl } from '@codama/nodes-from-anchor';
import { renderVisitor } from '@codama/renderers-js';
import { createFromRoot } from 'codama';

const root = join(import.meta.dir, '..');
const idlPath = join(root, 'target', 'idl', 'mutav.json');

let idl: AnchorIdl;
try {
  idl = JSON.parse(readFileSync(idlPath, 'utf8')) as AnchorIdl;
} catch (err) {
  throw new Error(`Cannot read ${idlPath}; run \`anchor build\` first.`, { cause: err });
}

const codama = createFromRoot(rootNodeFromAnchor(idl));

await codama.accept(
  renderVisitor(join(root, 'clients', 'js'), {
    generatedFolder: 'src/generated',
    deleteFolderBeforeRendering: true,
    formatCode: true,
    kitImportStrategy: 'rootOnly',
    syncPackageJson: false,
  }),
);

console.log('Generated clients/js/src/generated from target/idl/mutav.json');
