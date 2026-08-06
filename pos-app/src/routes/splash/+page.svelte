<script lang="ts">
	import { onMount } from 'svelte';

	const DURASI = 5000;
	let persen = $state(0);

	onMount(() => {
		const mulai = Date.now();
		const interval = setInterval(() => {
			persen = Math.min(100, Math.round(((Date.now() - mulai) / DURASI) * 100));
		}, 50);

		const timer = setTimeout(async () => {
			clearInterval(interval);
			persen = 100;
			try {
				const { getCurrentWindow, getAllWindows } = await import('@tauri-apps/api/window');
				const windows = await getAllWindows();
				const main = windows.find((w) => w.label === 'main');
				if (main) {
					await main.show();
					await main.setFocus();
				}
				await getCurrentWindow().close();
			} catch (err) {
				console.error('Gagal berpindah dari splash ke window utama:', err);
			}
		}, DURASI);

		return () => {
			clearInterval(interval);
			clearTimeout(timer);
		};
	});
</script>

<div class="splash">
	<img src="/img/splash.png" alt="Kios Sumur Yacob" />
	<div class="splash-loading">
		<div class="splash-track">
			<div class="splash-bar" style="width: {persen}%"></div>
		</div>
		<span class="splash-percent">{persen}%</span>
	</div>
</div>

<style>
	:global(html body) {
		background: transparent !important;
	}

	.splash {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.splash img {
		width: 100%;
		object-fit: contain;
	}

	.splash-loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.splash-track {
		width: 180px;
		height: 4px;
		border-radius: 999px;
		background: rgba(13, 148, 87, 0.2);
		overflow: hidden;
	}

	.splash-bar {
		height: 100%;
		border-radius: 999px;
		background: #0d9457;
		transition: width 0.1s linear;
	}

	.splash-percent {
		min-width: 2.5em;
		font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		color: #0d9457;
	}
</style>
