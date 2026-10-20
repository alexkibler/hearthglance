import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const {version} = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
await build({
  entryPoints: ['src/hearthglance-card.js'], outfile: 'dist/hearthglance-card.js',
  bundle: true, format: 'esm', target: ['es2020'], minify: true,
  banner: {js: `/*! Hearthglance Card v${version} | MIT License | See LICENSE */`},
  legalComments: 'none',
});
console.log(`Built Hearthglance ${version}`);
