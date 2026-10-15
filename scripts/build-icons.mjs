import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const modules = path.resolve(process.argv[2] || path.join(root, 'node_modules'));
const { parse } = require(path.join(modules, 'parse5'));
const { build } = require(path.join(modules, 'esbuild'));
const lucide = require(path.join(modules, 'lucide'));
const { version } = require(path.join(modules, 'lucide/package.json'));
assert.equal(version, '1.43.0', 'Use the pinned Lucide version from package.json.');

const html = await readFile(path.join(root, 'index.html'), 'utf8');
const appJs = await readFile(path.join(root, 'assets', 'app.js'), 'utf8');
const document = parse(html);
const staticNames = new Set();

function visit(node) {
  const attributes = Object.fromEntries((node.attrs || []).map(attribute => [attribute.name, attribute.value]));
  if (attributes['data-lucide']) staticNames.add(attributes['data-lucide']);
  for (const child of node.childNodes || []) visit(child);
  if (node.content) visit(node.content);
}
visit(document);

const pascalCase = name => name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
for (const name of staticNames) assert.ok(Array.isArray(lucide[pascalCase(name)]), `Unknown static icon: ${name}`);

// Dynamic icon names live in itinerary data and computed helpers inside app.js. Scan quoted
// kebab-case tokens, then retain only tokens exported by Lucide.
const corpus = `${html}\n${appJs}`;
const candidates = [...corpus.matchAll(/["']([a-z][a-z0-9]*(?:-[a-z0-9]+)*)["']/g)]
  .map(match => pascalCase(match[1]));
const names = [...new Set(candidates.filter(name => Array.isArray(lucide[name])))].sort();
assert.ok(names.length > 20 && names.length < 180, `Unexpected icon inventory: ${names.length}`);

const entry = `
  import { createIcons, createElement, ${names.join(', ')} } from 'lucide';
  const icons = { ${names.join(', ')} };
  window.lucide = {
    icons,
    createElement,
    createIcons(options = {}) { return createIcons({ icons, ...options }); }
  };
`;
const result = await build({
  stdin: { contents: entry, resolveDir: modules, sourcefile: 'trip-icons.mjs' },
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['safari16.4', 'chrome111'],
  legalComments: 'inline'
});
const compiled = result.outputFiles[0].text;
assert.ok(Buffer.byteLength(compiled) < 90000, 'Icon bundle exceeded its 90 KB budget.');
await writeFile(path.join(root, 'assets', 'vendor', 'lucide.js'), compiled);
console.log(`${names.length} icons bundled: ${Buffer.byteLength(compiled)} bytes.`);
