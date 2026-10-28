import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'dist', 'standalone');
await mkdir(destination, { recursive: true });
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  outfile: path.join(destination, 'game.js'),
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
});
const javascript = result.outputFiles.find((file) => file.path.endsWith('.js')).text;
const css = result.outputFiles.find((file) => file.path.endsWith('.css')).text;
if (javascript.includes('__roadtrip')) throw new Error('Test travel controls must not ship.');
const favicon = encodeURIComponent(await readFile(path.join(root, 'public/favicon.svg'), 'utf8'));
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#263e36">
<title>Road Trip — The Mountain Weekend</title>
<link rel="icon" href="data:image/svg+xml,${favicon}">
<style>${css}</style>
</head>
<body>
<canvas id="world" aria-label="Road Trip 3D game"></canvas>
<div id="app"></div>
<script>${javascript.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
await writeFile(path.join(destination, 'RoadTrip.html'), html);
console.log('Built dist/standalone/RoadTrip.html — all game code, styles, and physics embedded.');
