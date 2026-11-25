// Arithmetic Lab (arithmetic-lab): one self-contained page (vite-plugin-singlefile inlines the script and the CSS), which build.mjs turns
// into seed-games/arithmetic-lab.html. $lib is src/lib.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

// The game's name from src/lib/name.ts (the one place it is written), into index.html's <title> (%NAME%).
const NAME = fs.readFileSync(new URL('./src/lib/name.ts', import.meta.url), 'utf8').match(/export const NAME = '([^']+)'/)[1];
const gameName = { name: 'game-name', transformIndexHtml: (html) => html.replace('%NAME%', NAME) };

export default defineConfig({
  plugins: [gameName, tailwindcss(), svelte(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false, modulePreload: false, target: 'es2020' },
});
