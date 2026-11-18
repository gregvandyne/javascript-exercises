import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default {
	preprocess: vitePreprocess(),
	// The vendored math field is kept as it came: its own warnings aren't ours to fix
	onwarn: (w, handler) => {
		if (w.filename && w.filename.includes('vendor/')) return;
		handler(w);
	}
};
