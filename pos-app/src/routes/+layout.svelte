<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	let { children } = $props();

	onMount(() => {
		async function toggleFullscreen(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				event.preventDefault();
				try {
					const { getCurrentWindow } = await import('@tauri-apps/api/window');
					const win = getCurrentWindow();
					const isFullscreen = await win.isFullscreen();
					await win.setFullscreen(!isFullscreen);
				} catch (err) {
					console.error('Gagal toggle fullscreen:', err);
				}
			}
		}

		window.addEventListener('keydown', toggleFullscreen);
		return () => {
			window.removeEventListener('keydown', toggleFullscreen);
		};
	});
</script>

{@render children()}
