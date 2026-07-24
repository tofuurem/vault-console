import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const assetsDirectory = new URL('../dist/assets/', import.meta.url);
const distDirectory = new URL('../dist/', import.meta.url);
const files = await readdir(assetsDirectory);
const entryFile = files.find((name) => /^index-[^.]+\.js$/.test(name));
const editorFile = files.find((name) => /^CodeMirrorJsonEditor-[^.]+\.js$/.test(name));

if (!entryFile || !editorFile) {
  throw new Error('Expected production entry and lazy CodeMirror chunks were not found.');
}

async function gzipBytes(name) {
  return gzipSync(await readFile(new URL(name, assetsDirectory))).byteLength;
}

const entryBytes = await gzipBytes(entryFile);
const editorBytes = await gzipBytes(editorFile);
const entryBudget = 165 * 1024;
const editorBudget = 100 * 1024;

if (entryBytes > entryBudget) {
  throw new Error(`Production entry is ${entryBytes} bytes gzip; budget is ${entryBudget}.`);
}
if (editorBytes > editorBudget) {
  throw new Error(`Lazy JSON editor is ${editorBytes} bytes gzip; budget is ${editorBudget}.`);
}

if (process.env.VAULT_UI_BUILD_SOURCEMAPS !== 'true') {
  const distFiles = await readdir(distDirectory, { recursive: true });
  const publicMap = distFiles.find((name) => name.endsWith('.map'));
  if (publicMap) throw new Error(`Default production build contains a source map: ${publicMap}`);
}

process.stdout.write(
  `Bundle budgets passed: entry ${(entryBytes / 1024).toFixed(1)} KiB gzip, `
  + `lazy editor ${(editorBytes / 1024).toFixed(1)} KiB gzip.\n`,
);
