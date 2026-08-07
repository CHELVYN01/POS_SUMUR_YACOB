<script lang="ts">
	import { onMount } from 'svelte';
	import { listUsers, tambahUser, hapusUser, usernameTersedia } from '$lib/db/users';
	import { currentUser } from '$lib/stores/session';
	import { tokoInfo } from '$lib/stores/toko';
	import { setMasterPassword, getAutoBackupDir, setAutoBackupDir } from '$lib/db-manager';
	import { open } from '@tauri-apps/plugin-dialog';
	import type { User } from '$lib/types';

	let users = $state<User[]>([]);
	let loading = $state(true);

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let nama = $state('');
	let username = $state('');
	let password = $state('');
	let role = $state<'admin' | 'kasir'>('kasir');
	let formError = $state('');
	let saving = $state(false);
	let listError = $state('');

	let isAdmin = $derived($currentUser?.role === 'admin');

	type Tab = 'umum' | 'user' | 'sinkronisasi' | 'keamanan';
	let tab = $state<Tab>('umum');

	let namaToko = $state($tokoInfo.nama);
	let alamatToko = $state($tokoInfo.alamat);
	let tokoTersimpan = $state(false);

	let masterOldPassword = $state('');
	let masterNewPassword = $state('');
	let masterNewPasswordUlang = $state('');
	let masterPasswordError = $state('');
	let masterPasswordSaving = $state(false);
	let masterPasswordTersimpan = $state(false);

	let autoBackupDir = $state('');
	let autoBackupError = $state('');
	let autoBackupTersimpan = $state(false);

	onMount(async () => {
		users = await listUsers();
		loading = false;
		if (isAdmin) {
			autoBackupDir = await getAutoBackupDir();
		}
	});

	function simpanToko(event: Event) {
		event.preventDefault();
		tokoInfo.set({ nama: namaToko.trim() || 'Kios Sumur Yacob', alamat: alamatToko.trim() });
		tokoTersimpan = true;
		setTimeout(() => (tokoTersimpan = false), 2000);
	}

	function bukaModal() {
		formError = '';
		nama = '';
		username = '';
		password = '';
		role = 'kasir';
		dialogEl?.showModal();
	}

	function tutupModal() {
		dialogEl?.close();
	}

	async function tambah(event: Event) {
		event.preventDefault();
		formError = '';

		if (!nama.trim() || !username.trim() || !password) {
			formError = 'Semua field wajib diisi';
			return;
		}

		saving = true;
		try {
			if (!(await usernameTersedia(username.trim()))) {
				formError = 'Username sudah dipakai';
				return;
			}

			await tambahUser({ nama: nama.trim(), username: username.trim(), password, role });
			users = await listUsers();
			tutupModal();
		} finally {
			saving = false;
		}
	}

	async function hapus(user: User) {
		listError = '';
		const result = await hapusUser(user.id);
		if (!result.ok) {
			listError = result.error ?? 'Gagal menghapus user';
			return;
		}
		users = await listUsers();
	}

	async function simpanMasterPassword(event: Event) {
		event.preventDefault();
		masterPasswordError = '';

		if (!masterOldPassword || !masterNewPassword) {
			masterPasswordError = 'Semua field wajib diisi';
			return;
		}
		if (masterNewPassword !== masterNewPasswordUlang) {
			masterPasswordError = 'Konfirmasi password baru tidak cocok';
			return;
		}

		masterPasswordSaving = true;
		try {
			await setMasterPassword(masterOldPassword, masterNewPassword);
			masterOldPassword = '';
			masterNewPassword = '';
			masterNewPasswordUlang = '';
			masterPasswordTersimpan = true;
			setTimeout(() => (masterPasswordTersimpan = false), 2000);
		} catch (err) {
			masterPasswordError = String(err);
		} finally {
			masterPasswordSaving = false;
		}
	}

	async function pilihFolderBackup() {
		autoBackupError = '';
		try {
			const dipilih = await open({ directory: true, defaultPath: autoBackupDir || undefined });
			if (!dipilih || Array.isArray(dipilih)) return;

			await setAutoBackupDir(dipilih);
			autoBackupDir = dipilih;
			autoBackupTersimpan = true;
			setTimeout(() => (autoBackupTersimpan = false), 2000);
		} catch (err) {
			autoBackupError = String(err);
		}
	}
</script>

<div class="pengaturan">
	<h1>Pengaturan</h1>

	<div class="tabs">
		<button class="tab-btn" class:active={tab === 'umum'} onclick={() => (tab = 'umum')}>
			Umum
		</button>
		<button class="tab-btn" class:active={tab === 'user'} onclick={() => (tab = 'user')}>
			User
		</button>
		<button
			class="tab-btn"
			class:active={tab === 'sinkronisasi'}
			onclick={() => (tab = 'sinkronisasi')}
		>
			Sinkronisasi
		</button>
		{#if isAdmin}
			<button
				class="tab-btn"
				class:active={tab === 'keamanan'}
				onclick={() => (tab = 'keamanan')}
			>
				Keamanan
			</button>
		{/if}
	</div>

	{#if tab === 'umum'}
		{#if isAdmin}
			<section class="card section">
				<h2>Info Toko</h2>
				<form class="toko-form" onsubmit={simpanToko}>
					<label for="nama-toko">Nama Toko</label>
					<input id="nama-toko" bind:value={namaToko} placeholder="mis. Kios Sumur Yacob" />

					<label for="alamat-toko">Alamat</label>
					<input id="alamat-toko" bind:value={alamatToko} placeholder="mis. Jl. Sumur Yacob No. 1" />

					<div class="toko-actions">
						<button type="submit" class="primary">Simpan</button>
						{#if tokoTersimpan}
							<span class="saved-hint">Tersimpan</span>
						{/if}
					</div>
				</form>
			</section>
		{/if}

		<section class="card section">
			<h2>Akun Saya</h2>
			{#if $currentUser}
				<div class="me">
					<div class="me-name">{$currentUser.nama}</div>
					<div class="me-meta">@{$currentUser.username} · {$currentUser.role}</div>
				</div>
			{/if}
		</section>
	{/if}

	{#if tab === 'user'}
		<section class="card section">
			<div class="section-header">
				<h2>Daftar User</h2>
				{#if isAdmin}
					<button onclick={bukaModal}>+ Tambah User</button>
				{/if}
			</div>

			{#if listError}
				<p class="error">{listError}</p>
			{/if}

			<table>
				<thead>
					<tr>
						<th>Nama</th>
						<th>Username</th>
						<th>Role</th>
						{#if isAdmin}
							<th></th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#if loading}
						<tr><td colspan={isAdmin ? 4 : 3} class="empty">Memuat data...</td></tr>
					{:else}
						{#each users as user (user.id)}
							<tr>
								<td>{user.nama}</td>
								<td>{user.username}</td>
								<td class="role">{user.role}</td>
								{#if isAdmin}
									<td class="action">
										<button onclick={() => hapus(user)} disabled={user.id === $currentUser?.id}>
											Hapus
										</button>
									</td>
								{/if}
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</section>
	{/if}

	{#if tab === 'sinkronisasi'}
		<section class="card section">
			<h2>Sinkronisasi Data</h2>
			<p class="muted">Backup data ke cloud (Supabase) belum aktif — akan tersedia di fase berikutnya.</p>
			<button disabled>Sinkronkan Sekarang</button>
		</section>

		{#if isAdmin}
			<section class="card section">
				<h2>Lokasi Auto-Backup</h2>
				<p class="muted">
					Setiap 7 hari, aplikasi otomatis membuat backup database ke folder ini (4 file terbaru
					disimpan). Kalau folder ini tidak ditemukan lagi, backup akan otomatis dipindah ke
					Documents/POS-Backup.
				</p>
				<div class="folder-row">
					<input value={autoBackupDir} readonly placeholder="Documents/POS-Backup" />
					<button onclick={pilihFolderBackup}>Pilih Folder</button>
				</div>
				{#if autoBackupError}
					<p class="error">{autoBackupError}</p>
				{/if}
				{#if autoBackupTersimpan}
					<span class="saved-hint">Tersimpan</span>
				{/if}
			</section>
		{/if}
	{/if}

	{#if tab === 'keamanan' && isAdmin}
		<section class="card section">
			<h2>Master Password Database Manager</h2>
			<p class="muted">
				Password ini melindungi halaman Database Manager (Backup/Restore/Buat Baru) di layar
				login.
			</p>
			<form class="toko-form" onsubmit={simpanMasterPassword}>
				<label for="master-old">Password Saat Ini</label>
				<input
					id="master-old"
					type="password"
					bind:value={masterOldPassword}
					autocomplete="off"
				/>

				<label for="master-new">Password Baru</label>
				<input
					id="master-new"
					type="password"
					bind:value={masterNewPassword}
					autocomplete="new-password"
				/>

				<label for="master-new-ulang">Ulangi Password Baru</label>
				<input
					id="master-new-ulang"
					type="password"
					bind:value={masterNewPasswordUlang}
					autocomplete="new-password"
				/>

				{#if masterPasswordError}
					<p class="error">{masterPasswordError}</p>
				{/if}

				<div class="toko-actions">
					<button type="submit" class="primary" disabled={masterPasswordSaving}>
						{masterPasswordSaving ? 'Menyimpan...' : 'Simpan Password'}
					</button>
					{#if masterPasswordTersimpan}
						<span class="saved-hint">Tersimpan</span>
					{/if}
				</div>
			</form>
		</section>
	{/if}
</div>

<dialog bind:this={dialogEl} onclose={() => (formError = '')}>
	<form onsubmit={tambah}>
		<h2>Tambah User</h2>

		<label for="nama">Nama</label>
		<input id="nama" bind:value={nama} placeholder="mis. Wati" autofocus />

		<label for="username">Username</label>
		<input id="username" bind:value={username} placeholder="mis. wati" autocomplete="off" />

		<label for="password">Password</label>
		<input id="password" type="password" bind:value={password} autocomplete="new-password" />

		<label for="role">Role</label>
		<select id="role" bind:value={role}>
			<option value="kasir">Kasir</option>
			<option value="admin">Admin</option>
		</select>

		{#if formError}
			<p class="error">{formError}</p>
		{/if}

		<div class="dialog-actions">
			<button type="button" onclick={tutupModal}>Batal</button>
			<button type="submit" class="primary" disabled={saving}>
				{saving ? 'Menyimpan...' : 'Tambah User'}
			</button>
		</div>
	</form>
</dialog>

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

	.tabs {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 1.25rem;
		border-bottom: 1px solid var(--border);
	}

	.tab-btn {
		border: none;
		border-radius: 0;
		background: transparent;
		padding: 0.6em 1em;
		font-size: 0.9rem;
		color: var(--text-muted);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}

	.tab-btn:hover {
		background: transparent;
		color: var(--text);
	}

	.tab-btn.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
		font-weight: 600;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.9rem;
	}

	.section-header h2 {
		margin-bottom: 0;
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

	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 1rem 0;
	}

	.action {
		text-align: right;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0 0 0.9rem 0;
	}

	.muted {
		color: var(--text-muted);
		font-size: 0.88rem;
		margin-top: 0;
	}

	.toko-form {
		display: flex;
		flex-direction: column;
	}

	.toko-form label {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0.6rem 0 0.3rem 0;
	}

	.toko-form label:first-of-type {
		margin-top: 0;
	}

	.toko-actions {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 1rem;
	}

	.folder-row {
		display: flex;
		gap: 0.6rem;
	}

	.folder-row input {
		flex: 1;
		min-width: 0;
	}

	.saved-hint {
		font-size: 0.85rem;
		color: var(--accent);
	}

	dialog {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0;
		background: var(--surface);
		color: var(--text);
		width: 100%;
		max-width: 340px;
	}

	dialog::backdrop {
		background: rgba(0, 0, 0, 0.35);
	}

	dialog form {
		display: flex;
		flex-direction: column;
		padding: 1.5rem;
	}

	dialog h2 {
		margin: 0 0 1.1rem 0;
		font-size: 1.05rem;
	}

	dialog label {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0.7rem 0 0.3rem 0;
	}

	dialog label:first-of-type {
		margin-top: 0;
	}

	.dialog-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 1.3rem;
	}

	.dialog-actions button {
		flex: 1;
	}
</style>
