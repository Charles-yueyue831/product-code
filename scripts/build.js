import { build } from 'esbuild';
await build({entryPoints:['dashboard/app.js'],bundle:true,outfile:'dashboard/dist/app.js',minify:true,format:'iife',target:['es2022'],legalComments:'inline'});
