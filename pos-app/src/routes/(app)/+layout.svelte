<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { currentUser } from '$lib/stores/session';
	import { lisensi } from '$lib/stores/lisensi';
	import { theme, toggleTheme } from '$lib/stores/theme';
	import { scanAktif } from '$lib/stores/scanStatus';
	import { tokoInfo } from '$lib/stores/toko';
	import { getDb } from '$lib/db';
	import { runAutoBackupIfDue } from '$lib/db-manager';
	import { hapusLogKedaluwarsa } from '$lib/db/log';
	import { muatPengaturanStok } from '$lib/stores/pengaturanStok';
	import { laporanKasirHariIni, muatPengaturanLaporan } from '$lib/stores/pengaturanLaporan';
	import { APP_VERSION, APP_AUTHOR } from '$lib/buildInfo';
	import Toast from '$lib/components/Toast.svelte';

	let { children } = $props();

	onMount(() => {
		const unsubscribe = currentUser.subscribe((user) => {
			if (!user) goto('/');
		});

		// Penjaga kedua, setelah yang di root layout. `null` berarti pemeriksaannya
		// belum selesai — jangan diperlakukan sebagai "tidak berlisensi".
		const lepasLisensi = lisensi.subscribe((status) => {
			if (status && !status.aktif) goto('/aktivasi');
		});

		(async () => {
			try {
				const db = await getDb();
				await db.execute('PRAGMA wal_checkpoint(TRUNCATE);');
				await runAutoBackupIfDue();
			} catch (e) {
				console.error('Auto-backup gagal:', e);
			}

			// Retensi log aktivitas 24 jam. Dipisah dari blok auto-backup supaya
			// backup yang gagal tidak ikut membatalkan pembersihan log.
			try {
				await hapusLogKedaluwarsa();
			} catch (e) {
				console.error('Pembersihan log gagal:', e);
			}

			// Mode stok dibaca sebelum kasir sempat menjual apa pun. Gagal membacanya
			// berarti tetap longgar — menolak penjualan karena pengaturan tidak terbaca
			// jauh lebih merugikan daripada meloloskan satu transaksi stok kosong.
			try {
				await muatPengaturanStok();
			} catch (e) {
				console.error('Gagal membaca pengaturan stok:', e);
			}

			// Hak akses laporan justru sebaliknya: gagal membacanya berarti MEMBATASI.
			// Salah menyembunyikan laporan cuma bikin kasir harus memanggil admin;
			// salah membukanya berarti angka omzet & laba terlanjur terlihat.
			try {
				await muatPengaturanLaporan();
			} catch (e) {
				console.error('Gagal membaca pengaturan laporan:', e);
				laporanKasirHariIni.set(true);
			}
		})();

		return () => {
			unsubscribe();
			lepasLisensi();
		};
	});

	const menu = [
		{
			href: '/kasir',
			label: 'Penjualan',
			icon: 'M3 4h2l1.4 10.6A2 2 0 0 0 8.4 16.6h8.2a2 2 0 0 0 2-1.6L20 8H6.2 M9 20.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z M16.5 20.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z'
		},
		{
			href: '/produk',
			label: 'Produk',
			icon: 'M3.5 7.5 12 3l8.5 4.5-8.5 4.5-8.5-4.5Z M3.5 7.5V16.5L12 21l8.5-4.5V7.5 M12 12v9'
		},
		{
			href: '/kasbon',
			label: 'Kas Bon',
			icon: 'M4 6.5h16v11H4z M4 10h16 M8 15.5h4'
		},
		{
			href: '/laporan',
			label: 'Laporan',
			icon: 'M6 3.5h9l3 3V20.5H6V3.5Z M9 9.5h6 M9 13h6 M9 16.5h4'
		}
	];

	const pengaturanIcon =
		'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 13.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19.5a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6.1 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H10.5a1.65 1.65 0 0 0 1-1.51V4.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10.5a1.65 1.65 0 0 0 1.51 1H19.5a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z';

	// Menu akun dibuka dari avatar di kanan atas. Ditutup saat klik di luar atau Esc —
	// tanpa itu menunya menggantung terbuka dan menutupi tombol tema di sebelahnya.
	let menuAkunTerbuka = $state(false);
	let akunEl = $state<HTMLDivElement | null>(null);

	function tutupMenuAkun(e: MouseEvent) {
		if (akunEl && !akunEl.contains(e.target as Node)) menuAkunTerbuka = false;
	}

	function tombolEsc(e: KeyboardEvent) {
		if (e.key === 'Escape') menuAkunTerbuka = false;
	}

	function logout() {
		menuAkunTerbuka = false;
		currentUser.set(null);
		goto('/');
	}
</script>

<svelte:window onclick={tutupMenuAkun} onkeydown={tombolEsc} />

<div class="shell">
	<header class="topbar">
		<div class="topbar-kiri">
			<div class="brand">
				<img src="/img/logo-bar.png" alt="" class="brand-logo" />
				<div class="brand-teks">
					<span class="brand-nama">{$tokoInfo.nama}</span>
					{#if $tokoInfo.alamat}
						<span class="brand-alamat">{$tokoInfo.alamat}</span>
					{/if}
				</div>
			</div>

			<nav aria-label="Menu utama">
				{#each menu as item (item.href)}
					<a
						href={item.href}
						class:active={page.url.pathname === item.href}
						aria-current={page.url.pathname === item.href ? 'page' : undefined}
					>
						<svg class="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
							<path d={item.icon} />
						</svg>
						{item.label}
					</a>
				{/each}
			</nav>
		</div>

		<div class="topbar-kanan">
			<div class="scan-indicator" title="Status scanner barcode">
				<span class="scan-dot" class:active={$scanAktif}></span>
				<span class="scan-teks">{$scanAktif ? 'Scan Aktif' : 'Scan Idle'}</span>
			</div>

			<button class="icon-btn" onclick={toggleTheme} title="Ganti tema" aria-label="Ganti tema">
				{#if $theme === 'light'}
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 12.5A8.5 8.5 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5Z" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="4.5" />
						<line x1="12" y1="2" x2="12" y2="4.5" />
						<line x1="12" y1="19.5" x2="12" y2="22" />
						<line x1="2" y1="12" x2="4.5" y2="12" />
						<line x1="19.5" y1="12" x2="22" y2="12" />
						<line x1="4.9" y1="4.9" x2="6.6" y2="6.6" />
						<line x1="17.4" y1="17.4" x2="19.1" y2="19.1" />
						<line x1="4.9" y1="19.1" x2="6.6" y2="17.4" />
						<line x1="17.4" y1="6.6" x2="19.1" y2="4.9" />
					</svg>
				{/if}
			</button>

			{#if $currentUser}
				<div class="akun" bind:this={akunEl}>
					<button
						class="akun-tombol"
						onclick={() => (menuAkunTerbuka = !menuAkunTerbuka)}
						aria-expanded={menuAkunTerbuka}
						aria-haspopup="true"
					>
						<span class="avatar" aria-hidden="true">{$currentUser.nama.charAt(0).toUpperCase()}</span>
						<span class="akun-teks">
							<span class="akun-nama">{$currentUser.nama}</span>
							<span class="akun-role">{$currentUser.role}</span>
						</span>
						<svg class="akun-panah" class:buka={menuAkunTerbuka} viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="m6 9 6 6 6-6" />
						</svg>
					</button>

					{#if menuAkunTerbuka}
						<div class="akun-menu">
							<a
								href="/pengaturan"
								class="akun-item"
								class:active={page.url.pathname === '/pengaturan'}
								onclick={() => (menuAkunTerbuka = false)}
							>
								<svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
									<path d={pengaturanIcon} />
								</svg>
								Pengaturan
							</a>

							<button class="akun-item akun-keluar" onclick={logout}>
								<svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
									<path d="M15 17l5-5-5-5 M20 12H9 M12 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6" />
								</svg>
								Keluar
							</button>

							<!-- Versi sengaja ikut di menu ini supaya sekali lihat ketahuan build mana
							     yang terpasang di mesin client, tanpa perlu membuka Pengaturan dulu. -->
							<div class="app-meta">
								<span class="app-versi">v{APP_VERSION}</span>
								<span aria-hidden="true">·</span>
								<span>oleh {APP_AUTHOR}</span>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</header>

	<main class="content">
		{@render children()}
	</main>
</div>

<Toast />

<style>
	.shell {
		display: flex;
		flex-direction: column;
		/* Tinggi dikunci setinggi layar supaya yang menggulung hanya .content.
		   Kalau seluruh halaman yang menggulung, panel sticky di dalam halaman
		   (mis. form Tambah Produk) ikut naik keluar layar. */
		height: 100vh;
	}

	/* ---------- Top bar ---------- */

	.topbar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		height: 60px;
		padding: 0 1.25rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.topbar-kiri {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		min-width: 0;
	}

	.topbar-kanan {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding-right: 1.25rem;
		border-right: 1px solid var(--border);
		min-width: 0;
	}

	/* Logonya sendiri sudah hijau, jadi latarnya dibuat terang — bukan --accent,
	   yang bikin logo menyatu dengan kotaknya. Putih polos dipakai di kedua tema
	   supaya logo hijau tetap kontras saat mode gelap; border tipis menahan
	   kotak putih itu agar tidak menyolok di atas permukaan gelap. */
	.brand-logo {
		width: 34px;
		height: 34px;
		object-fit: contain;
		flex-shrink: 0;
		border-radius: 8px;
		background: #fff;
		border: 1px solid var(--border);
		padding: 4px;
	}

	.brand-teks {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.brand-nama {
		font-weight: 600;
		font-size: 0.9rem;
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.brand-alamat {
		font-size: 0.72rem;
		color: var(--text-muted);
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ---------- Menu ---------- */

	nav {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}

	nav::-webkit-scrollbar {
		display: none;
	}

	nav a {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		text-decoration: none;
		color: var(--text-muted);
		padding: 0.5rem 0.8rem;
		border-radius: var(--radius);
		font-size: 0.88rem;
		font-weight: 500;
		white-space: nowrap;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.nav-icon {
		flex-shrink: 0;
	}

	nav a:hover {
		background: var(--bg);
		color: var(--text);
	}

	nav a.active {
		background: var(--accent);
		color: #fff;
	}

	/* ---------- Status scan ---------- */

	.scan-indicator {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 0.78rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.scan-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-muted);
		flex-shrink: 0;
		transition: background 0.2s ease;
	}

	.scan-dot.active {
		background: #22c55e;
	}

	.icon-btn {
		width: 36px;
		height: 36px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.icon-btn:hover {
		color: var(--text);
	}

	/* ---------- Menu akun ---------- */

	.akun {
		position: relative;
	}

	.akun-tombol {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.5rem 0.3rem 0.3rem;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius);
		cursor: pointer;
		color: var(--text);
	}

	.akun-tombol:hover {
		background: var(--bg);
		border-color: var(--border);
	}

	.avatar {
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--accent);
		color: #fff;
		font-size: 0.82rem;
		font-weight: 600;
	}

	.akun-teks {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.2;
	}

	.akun-nama {
		font-size: 0.84rem;
		font-weight: 500;
	}

	.akun-role {
		font-size: 0.7rem;
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.akun-panah {
		color: var(--text-muted);
		flex-shrink: 0;
		transition: transform 0.15s ease;
	}

	.akun-panah.buka {
		transform: rotate(180deg);
	}

	.akun-menu {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 50;
		min-width: 200px;
		padding: 0.35rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
	}

	.akun-item {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		padding: 0.55rem 0.65rem;
		border: none;
		border-radius: 7px;
		background: none;
		color: var(--text);
		font-size: 0.86rem;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
	}

	.akun-item:hover {
		background: var(--bg);
	}

	.akun-item.active {
		background: var(--accent);
		color: #fff;
	}

	.akun-keluar {
		color: var(--danger);
	}

	.app-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.35rem;
		padding: 0.5rem 0.65rem 0.15rem 0.65rem;
		border-top: 1px solid var(--border);
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.app-versi {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	/* ---------- Konten ---------- */

	.content {
		flex: 1;
		padding: 1.75rem 2rem 2rem 2rem;
		min-height: 0;
		overflow: auto;
	}

	/* Layar sempit (laptop kasir 1366px ke bawah): identitas toko diringkas jadi
	   logo saja dan label akun disembunyikan, supaya menu utama tidak terdorong
	   sampai harus digulung ke samping. */
	@media (max-width: 1100px) {
		.brand-teks,
		.akun-teks,
		.scan-teks {
			display: none;
		}

		.scan-indicator {
			padding: 0.35rem 0.5rem;
		}

		.content {
			padding: 1.5rem 1.25rem;
		}
	}
</style>
