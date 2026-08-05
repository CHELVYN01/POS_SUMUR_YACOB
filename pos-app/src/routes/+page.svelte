<script lang="ts">
	import { goto } from '$app/navigation';
	import { login as loginQuery } from '$lib/db/users';
	import { currentUser } from '$lib/stores/session';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

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
			currentUser.set(user);
			goto('/kasir');
		} finally {
			loading = false;
		}
	}
</script>

<div class="login-page">
	<form class="card login-box" onsubmit={login}>
		<h1>Kios Sumur Yacob</h1>
		<p class="subtitle">Masuk untuk mulai transaksi</p>

		<label for="username">Username</label>
		<input id="username" bind:value={username} placeholder="Masukkan username" autocomplete="username" />

		<label for="password">Password</label>
		<input
			id="password"
			type="password"
			bind:value={password}
			placeholder="Masukkan password"
			autocomplete="current-password"
		/>

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
	}

	.login-box {
		width: 100%;
		max-width: 320px;
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.subtitle {
		margin: 0 0 1.2rem 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	label {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-top: 0.6rem;
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
