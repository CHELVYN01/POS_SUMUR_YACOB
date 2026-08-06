<script lang="ts">
	import { onMount } from 'svelte';
	import '../app.css';
	let { children } = $props();

	let showSplash = $state(true);

	onMount(() => {
		const timer = setTimeout(() => {
			showSplash = false;
		}, 1500);

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
			clearTimeout(timer);
			window.removeEventListener('keydown', toggleFullscreen);
		};
	});
</script>

{#if showSplash}
	<div class="splash">
		<img src="/img/splash.png" alt="Kios Sumur Yacob" />
	</div>
{:else}
	{@render children()}
{/if}

<style>
	.splash {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(180deg, #eaf7f0 0%, #ffffff 60%);
		z-index: 9999;
	}

	.splash img {
		max-width: 60%;
		max-height: 60%;
		object-fit: contain;
	}
</style>
