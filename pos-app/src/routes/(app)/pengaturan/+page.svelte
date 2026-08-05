<script lang="ts">
	import { dummyUsers } from '$lib/data/dummy';
	import { currentUser } from '$lib/stores/session';
</script>

<div class="pengaturan">
	<h1>Pengaturan</h1>

	<section class="card section">
		<h2>Akun Saya</h2>
		{#if $currentUser}
			<div class="me">
				<div class="me-name">{$currentUser.nama}</div>
				<div class="me-meta">@{$currentUser.username} · {$currentUser.role}</div>
			</div>
		{/if}
	</section>

	<section class="card section">
		<h2>Daftar User</h2>
		<table>
			<thead>
				<tr>
					<th>Nama</th>
					<th>Username</th>
					<th>Role</th>
				</tr>
			</thead>
			<tbody>
				{#each dummyUsers as user (user.id)}
					<tr>
						<td>{user.nama}</td>
						<td>{user.username}</td>
						<td class="role">{user.role}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section class="card section">
		<h2>Sinkronisasi Data</h2>
		<p class="muted">Backup data ke cloud (Supabase) belum aktif — akan tersedia di fase berikutnya.</p>
		<button disabled>Sinkronkan Sekarang</button>
	</section>
</div>

<style>
	.pengaturan {
		max-width: 560px;
	}

	h1 {
		font-size: 1.3rem;
	}

	.section {
		padding: 1.25rem;
		margin-bottom: 1.25rem;
	}

	.section h2 {
		font-size: 1rem;
		margin-bottom: 0.9rem;
	}

	.me-name {
		font-weight: 600;
	}

	.me-meta {
		font-size: 0.85rem;
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.role {
		text-transform: capitalize;
	}

	.muted {
		color: var(--text-muted);
		font-size: 0.88rem;
		margin-top: 0;
	}
</style>
