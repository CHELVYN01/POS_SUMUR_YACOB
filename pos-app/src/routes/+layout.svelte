<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import '../app.css';
	import { mulaiTahanLayar } from '$lib/keepAwake';
	import { segarkanLisensi } from '$lib/stores/lisensi';
	let { children } = $props();

	/**
	 * Halaman yang tetap boleh dibuka tanpa lisensi.
	 *
	 * `/database-manager` sengaja termasuk: mengunci aplikasi tidak boleh berarti
	 * menyandera data pemilik toko — backup harus selalu bisa diambil.
	 * `/splash` jendela terpisah, tidak ada hubungannya dengan lisensi.
	 */
	const TANPA_LISENSI = ['/aktivasi', '/database-manager', '/splash'];

	onMount(() => {
		const lepasTahanLayar = mulaiTahanLayar();

		(async () => {
			try {
				const status = await segarkanLisensi();
				if (!status.aktif && !TANPA_LISENSI.includes(page.url.pathname)) {
					goto('/aktivasi');
				}
			} catch (e) {
				// Kalau statusnya sendiri tidak bisa dibaca, jangan kunci kasir di tengah
				// jam sibuk karena masalah baca berkas — catat saja dan biarkan lewat.
				console.error('Gagal memeriksa lisensi:', e);
			}
		})();

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
			lepasTahanLayar();
		};
	});
</script>

{@render children()}
