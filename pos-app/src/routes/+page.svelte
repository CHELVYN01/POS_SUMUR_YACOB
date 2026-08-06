<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { login as loginQuery } from '$lib/db/users';
	import { currentUser } from '$lib/stores/session';

	const STORAGE_KEY = 'pos-remember-login';

	let username = $state('');
	let password = $state('');
	let ingat = $state(false);
	let lihatPassword = $state(false);
	let error = $state('');
	let loading = $state(false);

	onMount(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				username = parsed.username ?? '';
				password = parsed.password ?? '';
				ingat = true;
			} catch {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	});

	async function login(event: Event) {
		event.preventDefault();
		loading = true;
		error = '';
		try {
			const user = await loginQuery(username.trim(), password);
			if (!user) {
				error = 'Username atau password salah';
				return;
			}

			if (ingat) {
				localStorage.setItem(STORAGE_KEY, JSON.stringify({ username: username.trim(), password }));
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}

			currentUser.set(user);
			goto('/kasir');
		} finally {
			loading = false;
		}
	}
</script>

<div class="login-page">
	<form class="card login-box" onsubmit={login} autocomplete="off">
		<img class="logo" src="/img/logo-login.png" alt="Kios Sumur Yacob" />
		<p class="subtitle">Masuk untuk mulai transaksi</p>

		<label for="username">Username</label>
		<input
			id="username"
			name="pos-username-field"
			bind:value={username}
			placeholder="Masukkan username"
			autocomplete="off"
		/>

		<label for="password">Password</label>
		<div class="password-field">
			<input
				id="password"
				name="pos-password-field"
				type={lihatPassword ? 'text' : 'password'}
				bind:value={password}
				placeholder="Masukkan password"
				autocomplete="off"
			/>
			<button
				type="button"
				class="toggle-password"
				onclick={() => (lihatPassword = !lihatPassword)}
				title={lihatPassword ? 'Sembunyikan password' : 'Lihat password'}
				aria-label={lihatPassword ? 'Sembunyikan password' : 'Lihat password'}
			>
				{#if lihatPassword}
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
						<circle cx="12" cy="12" r="3" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
						<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
						<circle cx="12" cy="12" r="3" />
						<line x1="3" y1="21" x2="21" y2="3" />
					</svg>
				{/if}
			</button>
		</div>

		<label class="checkbox-row">
			<input type="checkbox" bind:checked={ingat} />
			<span>Ingat saya di perangkat ini</span>
		</label>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button type="submit" class="primary" disabled={loading}>{loading ? 'Memeriksa...' : 'Masuk'}</button>
	</form>
</div>

<style>
	.login-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		background: linear-gradient(180deg, #eaf7f0 0%, #ffffff 60%);
	}

	.login-box {
		width: 100%;
		max-width: 320px;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		background: linear-gradient(160deg, #b9e8cd 0%, #eefaf3 45%, #ffffff 85%);
	}

	.logo {
		display: block;
		width: 140px;
		margin: 0 auto 0.8rem auto;
	}

	.subtitle {
		margin: 0 0 1.2rem 0;
		color: var(--text-muted);
		font-size: 0.9rem;
		text-align: center;
	}

	label {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-top: 0.6rem;
	}

	.password-field {
		position: relative;
		display: flex;
		align-items: center;
	}

	.password-field input {
		width: 100%;
		padding-right: 2.5em;
	}

	.toggle-password {
		position: absolute;
		right: 0.4em;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		padding: 0.4em;
		color: var(--text-muted);
		cursor: pointer;
	}

	.toggle-password:hover {
		background: transparent;
		color: var(--text);
	}

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 1rem;
		font-size: 0.85rem;
		color: var(--text);
		cursor: pointer;
	}

	.checkbox-row input {
		width: auto;
		margin: 0;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0.6rem 0 0 0;
	}

	button.primary {
		margin-top: 1.4rem;
	}
</style>
