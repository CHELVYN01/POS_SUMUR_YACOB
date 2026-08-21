/**
 * Screen Wake Lock di sisi WebView (fase 19).
 *
 * Penahan utama layar mati ada di Rust (`src-tauri/src/keep_awake.rs`) lewat
 * SetThreadExecutionState. Ini pelengkapnya: WebView2 punya idle timer sendiri,
 * dan wake lock membuatnya ikut menganggap halaman ini "aktif".
 *
 * Semua kegagalan sengaja didiamkan — kalau WebView-nya tidak mendukung
 * navigator.wakeLock, penahan di Rust sudah cukup dan tidak ada yang perlu
 * dikeluhkan ke kasir.
 */

type WakeLockSentinelLike = { released: boolean; release(): Promise<void> };

/**
 * Mulai menahan layar. Wake lock otomatis lepas saat tab/jendela disembunyikan,
 * jadi ia diambil ulang setiap halaman kembali terlihat.
 *
 * @returns fungsi pembersih untuk dipanggil di onMount teardown.
 */
export function mulaiTahanLayar(): () => void {
	const wakeLock = (
		navigator as Navigator & {
			wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
		}
	).wakeLock;

	if (!wakeLock) return () => {};

	let sentinel: WakeLockSentinelLike | null = null;
	let dibatalkan = false;

	async function ambil() {
		if (dibatalkan || document.visibilityState !== 'visible') return;
		if (sentinel && !sentinel.released) return;
		try {
			sentinel = await wakeLock!.request('screen');
		} catch {
			// Ditolak atau tidak didukung — biarkan, Rust yang menahan.
		}
	}

	function saatTerlihat() {
		void ambil();
	}

	void ambil();
	document.addEventListener('visibilitychange', saatTerlihat);

	return () => {
		dibatalkan = true;
		document.removeEventListener('visibilitychange', saatTerlihat);
		void sentinel?.release().catch(() => {});
		sentinel = null;
	};
}
