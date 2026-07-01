/**
 * @file scripts/copyAssets.js
 * @description Copies non-TypeScript static assets (the Web Chat demo UI)
 * from src/ into dist/ after `tsc` runs, since the TypeScript compiler only
 * emits .ts files. Run automatically as part of `npm run build`.
 */

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'channels', 'web', 'public');
const dest = path.join(__dirname, '..', 'dist', 'channels', 'web', 'public');

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });

console.log(`[build] Copied Web Chat static assets -> ${path.relative(process.cwd(), dest)}`);
