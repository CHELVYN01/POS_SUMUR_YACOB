<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { currentUser } from '$lib/stores/session';
	import { theme, toggleTheme } from '$lib/stores/theme';
	import { scanAktif } from '$lib/stores/scanStatus';
	import { tokoInfo } from '$lib/stores/toko';
	import { getDb } from '$lib/db';
	import { runAutoBackupIfDue } from '$lib/db-manager';
	import Toast from '$lib/components/Toast.svelte';

	let { children } = $props();

	onMount(() => {
		const unsubscribe = currentUser.subscribe((user) => {
			if (!user) goto('/');
		});

		(async () => {
			try {
				const db = await getDb();
				await db.execute('PRAGMA wal_checkpoint(TRUNCATE);');
				await runAutoBackupIfDue();
			} catch (e) {
				console.error('Auto-backup gagal:', e);
			}
		})();

		return unsubscribe;
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
			href: '/laporan',
			label: 'Laporan',
			icon: 'M6 3.5h9l3 3V20.5H6V3.5Z M9 9.5h6 M9 13h6 M9 16.5h4'
		},
		{
			href: '/kasbon',
			label: 'Kas Bon',
			icon: 'M4 6.5h16v11H4z M4 10h16 M8 15.5h4'
		}
	];

	const pengaturanIcon =
		'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 13.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19.5a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H4.5a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 6.1 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H10.5a1.65 1.65 0 0 0 1-1.51V4.5a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V10.5a1.65 1.65 0 0 0 1.51 1H19.5a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z';

	let judulHalaman = $derived(menu.find((m) => m.href === page.url.pathname)?.label ?? '');

	function logout() {
		currentUser.set(null);
		goto('/');
	}
</script>

<div class="shell">
	<aside class="sidebar">
		<div class="brand">
			<img src="/img/logo-bar.png" alt="Logo" class="brand-logo" />
			<span class="brand-nama">{$tokoInfo.nama}</span>
			{#if $tokoInfo.alamat}
				<span class="brand-alamat">{$tokoInfo.alamat}</span>
			{/if}
		</div>

		<nav>
			{#each menu as item (item.href)}
				<a href={item.href} class:active={page.url.pathname === item.href}>
					<svg class="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path d={item.icon} />
					</svg>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="sidebar-footer">
			<a href="/pengaturan" class="settings-link" class:active={page.url.pathname === '/pengaturan'}>
				<svg class="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
					<path d={pengaturanIcon} />
				</svg>
				Pengaturan
			</a>

			{#if $currentUser}
				<div class="user">
					<div class="user-name">{$currentUser.nama}</div>
					<div class="user-role">{$currentUser.role}</div>
				</div>
			{/if}
			<button onclick={logout}>Keluar</button>
		</div>
	</aside>

	<div class="main">
		<header class="navbar">
			<h2 class="page-title">{judulHalaman}</h2>

			<div class="navbar-actions">
				<div class="scan-indicator" title="Status scanner barcode">
					<span class="scan-dot" class:active={$scanAktif}></span>
					{$scanAktif ? 'Scan Aktif' : 'Scan Idle'}
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
			</div>
		</header>

		<main class="content">
			{@render children()}
		</main>
	</div>
</div>

<Toast />

<style>
	.shell {
		display: flex;
		min-height: 100vh;
	}

	.sidebar {
		width: 260px;
		flex-shrink: 0;
		background: var(--surface);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		padding: 0 1rem 1.25rem 1rem;
		/* Tanpa ini sidebar ikut meregang setinggi isi halaman, sehingga footer-nya
		   (Pengaturan, nama user, Keluar) terdorong ke dasar halaman dan tidak terlihat
		   begitu daftar produk jadi panjang. */
		position: sticky;
		top: 0;
		align-self: flex-start;
		height: 100vh;
	}

	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		font-weight: 600;
		font-size: 1rem;
		text-align: center;
		height: 148px;
		margin: 0 -1rem 1.25rem -1rem;
		padding: 0 0.75rem;
		background: linear-gradient(160deg, #003d38 0%, #002420 100%);
		color: #fff;
	}

	.brand-logo {
		width: 44px;
		height: 44px;
		object-fit: contain;
		flex-shrink: 0;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.15);
		padding: 6px;
	}

	.brand-nama {
		line-height: 1.25;
	}

	.brand-alamat {
		font-weight: 400;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.75);
		line-height: 1.3;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1;
		/* Kalau menunya nanti bertambah banyak, yang menggulung cukup daftar menunya —
		   footer sidebar tetap menempel di bawah. */
		overflow-y: auto;
		min-height: 0;
	}

	nav a {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		text-decoration: none;
		color: var(--text);
		padding: 0.6em 0.75em;
		border-radius: var(--radius);
		font-size: 0.9rem;
	}

	.nav-icon {
		flex-shrink: 0;
	}

	nav a:hover {
		background: var(--bg);
	}

	nav a.active {
		background: var(--accent);
		color: #fff;
	}

	.sidebar-footer {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.settings-link {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		text-decoration: none;
		color: var(--text);
		padding: 0.6em 0.75em;
		border-radius: var(--radius);
		font-size: 0.9rem;
		border-top: 1px solid var(--border);
		margin-top: 0.6rem;
		padding-top: calc(0.6em + 0.6rem);
	}

	.settings-link:hover {
		background: var(--bg);
	}

	.settings-link.active {
		background: var(--accent);
		color: #fff;
	}

	.user {
		padding: 0 0.5rem;
	}

	.user-name {
		font-size: 0.88rem;
		font-weight: 500;
	}

	.user-role {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.navbar {
		height: 56px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 1.5rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}

	.page-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.navbar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.scan-indicator {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.scan-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--text-muted);
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
	}

	.icon-btn:hover {
		color: var(--text);
	}

	.content {
		flex: 1;
		padding: 2rem;
		max-width: 100%;
		overflow-x: auto;
	}
</style>
