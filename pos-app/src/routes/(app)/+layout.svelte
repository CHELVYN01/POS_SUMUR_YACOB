<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { currentUser } from '$lib/stores/session';
	import { theme, toggleTheme } from '$lib/stores/theme';

	let { children } = $props();

	const menu = [
		{ href: '/kasir', label: 'Jual Barang' },
		{ href: '/produk', label: 'Input Barang' },
		{ href: '/laporan', label: 'List Penjualan' },
		{ href: '/pengaturan', label: 'Pengaturan' }
	];

	let judulHalaman = $derived(menu.find((m) => m.href === page.url.pathname)?.label ?? '');

	function logout() {
		currentUser.set(null);
		goto('/');
	}
</script>

<div class="shell">
	<aside class="sidebar">
		<div class="brand">Kios Sumur Yacob</div>

		<nav>
			{#each menu as item (item.href)}
				<a href={item.href} class:active={page.url.pathname === item.href}>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="sidebar-footer">
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
				<button class="icon-btn" onclick={toggleTheme} title="Ganti tema">
					{#if $theme === 'light'}
						🌙
					{:else}
						☀️
					{/if}
				</button>
			</div>
		</header>

		<main class="content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.shell {
		display: flex;
		min-height: 100vh;
	}

	.sidebar {
		width: 220px;
		flex-shrink: 0;
		background: var(--surface);
		border-right: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		padding: 1.25rem 1rem;
	}

	.brand {
		font-weight: 600;
		font-size: 1rem;
		padding: 0 0.5rem 1.25rem 0.5rem;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1;
	}

	nav a {
		text-decoration: none;
		color: var(--text);
		padding: 0.6em 0.75em;
		border-radius: var(--radius);
		font-size: 0.9rem;
	}

	nav a:hover {
		background: var(--bg);
	}

	nav a.active {
		background: var(--accent);
		color: #fff;
	}

	.sidebar-footer {
		border-top: 1px solid var(--border);
		padding-top: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
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

	.icon-btn {
		width: 36px;
		height: 36px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.05rem;
		line-height: 1;
	}

	.content {
		flex: 1;
		padding: 2rem;
		max-width: 100%;
		overflow-x: auto;
	}
</style>
