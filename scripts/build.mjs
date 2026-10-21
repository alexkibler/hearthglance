import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const {version} = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const iconLicense = await readFile(new URL('../docs/third-party-icons.txt', import.meta.url), 'utf8');
await build({
  entryPoints: ['src/hearthglance-card.js'], outfile: 'dist/hearthglance-card.js',
  bundle: true, format: 'esm', target: ['es2020'], minify: true,
  banner: {js: `/*! Hearthglance Card v${version} | MIT License | See LICENSE */
/*! ${iconLicense} */`},
  legalComments: 'none',
});
console.log(`Built Hearthglance ${version}`);
