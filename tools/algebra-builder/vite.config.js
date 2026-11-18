// Algebra Builder: one self-contained page (vite-plugin-singlefile inlines the script and the CSS), which
// build.mjs turns into seed-games/algebra-builder.html. $lib is the original app's alias for src/lib.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [tailwindcss(), svelte(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false, modulePreload: false, target: 'es2020' },
});
