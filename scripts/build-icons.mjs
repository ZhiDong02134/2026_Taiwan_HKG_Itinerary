import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const modules = path.resolve(process.argv[2] || 'node_modules');
const { parse } = require(path.join(modules, 'parse5'));
const { build } = require(path.join(modules, 'esbuild'));
const lucide = require(path.join(modules, 'lucide'));
const { version } = require(path.join(modules, 'lucide/package.json'));
assert.equal(version, '1.43.0', 'Use the pinned Lucide version.');

const pagePath = new URL('../index.html', import.meta.url);
const html = await readFile(pagePath, 'utf8');
const document = parse(html, { sourceCodeLocationInfo: true });
const runtimes = [];
const staticNames = new Set();

function visit(node) {
  const attributes = Object.fromEntries((node.attrs || []).map(attribute => [attribute.name, attribute.value]));
  if (attributes['data-embedded-runtime']) runtimes.push(node);
  if (attributes['data-lucide']) staticNames.add(attributes['data-lucide']);
  for (const child of node.childNodes || []) visit(child);
  if (node.content) visit(node.content);
}

visit(document);
const runtime = runtimes.find(node => node.attrs.some(attribute => attribute.value === `lucide-${version}`));
assert.ok(runtime?.sourceCodeLocation?.endTag, 'Embedded Lucide runtime not found.');

let authoredHtml = html;
for (const node of [...runtimes].sort((left, right) => right.sourceCodeLocation.startOffset - left.sourceCodeLocation.startOffset)) {
  const location = node.sourceCodeLocation;
  authoredHtml = authoredHtml.slice(0, location.startOffset) + authoredHtml.slice(location.endOffset);
}

const pascalCase = name => name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
for (const name of staticNames) assert.ok(Array.isArray(lucide[pascalCase(name)]), `Unknown icon: ${name}`);
const candidates = [...authoredHtml.matchAll(/["']([a-z][a-z0-9]*(?:-[a-z0-9]+)*)["']/g)].map(match => pascalCase(match[1]));
const names = [...new Set(candidates.filter(name => Array.isArray(lucide[name])))].sort();
assert.ok(names.length > 20 && names.length < 150, 'Unexpected icon inventory.');

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
assert.ok(Buffer.byteLength(compiled) < 80000, 'Icon bundle exceeded its budget.');
const location = runtime.sourceCodeLocation;
const nextHtml = html.slice(0, location.startTag.endOffset) + '\n' + compiled + '  ' + html.slice(location.endTag.startOffset);
await writeFile(pagePath, nextHtml);
console.log(`${names.length} icons bundled: ${Buffer.byteLength(compiled)} bytes. HTML: ${Buffer.byteLength(html)} -> ${Buffer.byteLength(nextHtml)} bytes.`);