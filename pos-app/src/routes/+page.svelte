<script lang="ts">
	import { goto } from '$app/navigation';
	import { dummyUsers } from '$lib/data/dummy';
	import { currentUser } from '$lib/stores/session';

	let username = $state('');
	let password = $state('');
	let error = $state('');

	function login(event: Event) {
		event.preventDefault();
		const user = dummyUsers.find((u) => u.username === username.trim());
		if (!user || password.length === 0) {
			error = 'Username atau password salah';
			return;
		}
		currentUser.set(user);
		goto('/kasir');
	}
</script>

<div class="login-page">
	<form class="card login-box" onsubmit={login}>
		<h1>Kios Sumur Yacob</h1>
		<p class="subtitle">Masuk untuk mulai transaksi</p>

		<label for="username">Username</label>
		<input id="username" bind:value={username} placeholder="mis. admin" autocomplete="username" />

		<label for="password">Password</label>
		<input
			id="password"
			type="password"
			bind:value={password}
			placeholder="bebas, ini masih dummy"
			autocomplete="current-password"
		/>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button type="submit" class="primary">Masuk</button>

		<p class="hint">Coba: admin / siti / budi (password bebas)</p>
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

	.hint {
		margin: 1rem 0 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
		text-align: center;
	}
</style>
