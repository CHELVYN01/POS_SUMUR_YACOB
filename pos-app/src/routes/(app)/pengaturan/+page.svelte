<script lang="ts">
	import { onMount } from 'svelte';
	import { listUsers, tambahUser, ubahUser, hapusUser, usernameTersedia } from '$lib/db/users';
	import { currentUser } from '$lib/stores/session';
	import { tokoInfo } from '$lib/stores/toko';
	import { setMasterPassword, getAutoBackupDir, setAutoBackupDir } from '$lib/db-manager';
	import { open } from '@tauri-apps/plugin-dialog';
	import { BUILD_DATE, BUILD_COMMIT, APP_VERSION, APP_AUTHOR } from '$lib/buildInfo';
	import { stokLonggar, ubahStokLonggar } from '$lib/stores/pengaturanStok';
	import { laporanKasirHariIni, ubahLaporanKasirHariIni } from '$lib/stores/pengaturanLaporan';
	import { hitungBarangTanpaStok } from '$lib/db/barang';
	import { toast } from '$lib/stores/toast';
	import type { User } from '$lib/types';

	let users = $state<User[]>([]);
	let loading = $state(true);

	let dialogEl = $state<HTMLDialogElement | null>(null);
	/** null = dialog dipakai untuk Tambah; ada isinya = Edit user dengan id ini. */
	let editId = $state<number | null>(null);
	let nama = $state('');
	let username = $state('');
	let password = $state('');
	let role = $state<'admin' | 'kasir'>('kasir');
	let formError = $state('');
	let saving = $state(false);
	let listError = $state('');

	let isAdmin = $derived($currentUser?.role === 'admin');

	let produkTanpaStok = $state(0);
	let menyimpanStok = $state(false);

	async function gantiModeStok(longgar: boolean, target: HTMLInputElement) {
		// Mematikan centang ini bisa menghentikan penjualan banyak produk sekaligus.
		// Kalau ada produk yang stoknya belum diisi, admin harus menyadarinya dulu —
		// bukan baru tahu saat kasir tidak bisa melayani pembeli.
		if (!longgar && produkTanpaStok > 0) {
			const lanjut = confirm(
				`${produkTanpaStok} produk stoknya belum diisi.\n\n` +
					'Kalau mode stok ketat dinyalakan, produk itu TIDAK BISA DIJUAL sampai stoknya diisi ' +
					'di halaman Produk.\n\nLanjutkan?'
			);
			if (!lanjut) {
				target.checked = true;
				return;
			}
		}

		menyimpanStok = true;
		try {
			await ubahStokLonggar(longgar);
			produkTanpaStok = await hitungBarangTanpaStok();
			toast.sukses(longgar ? 'Mode stok longgar aktif' : 'Mode stok ketat aktif');
		} catch (e) {
			console.error('Gagal menyimpan pengaturan stok:', e);
			toast.error('Gagal menyimpan pengaturan stok');
		} finally {
			menyimpanStok = false;
		}
	}

	let menyimpanLaporan = $state(false);

	async function gantiHakAksesLaporan(batasi: boolean, target: HTMLInputElement) {
		menyimpanLaporan = true;
		try {
			await ubahLaporanKasirHariIni(batasi);
			toast.sukses(
				batasi ? 'Kasir dibatasi ke laporan hari ini' : 'Kasir bisa melihat semua laporan'
			);
		} catch (e) {
			console.error('Gagal menyimpan hak akses laporan:', e);
			toast.error('Gagal menyimpan hak akses laporan');
			target.checked = !batasi;
		} finally {
			menyimpanLaporan = false;
		}
	}

	type Tab = 'umum' | 'produk' | 'laporan' | 'user' | 'sinkronisasi' | 'keamanan';
	let tab = $state<Tab>('umum');

	/**
	 * Non-admin cuma punya tab Umum. Penjaganya di sini, bukan sekadar
	 * menyembunyikan tombol tab: `tab` bisa terlanjur berisi nilai lain kalau
	 * user berganti (mis. admin logout lalu kasir masuk tanpa reload).
	 */
	$effect(() => {
		if (!isAdmin && tab !== 'umum') tab = 'umum';
	});

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

	// Selain tab Umum, seluruh isi halaman ini admin-only — jadi datanya pun tidak
	// perlu diambil untuk kasir.
	onMount(async () => {
		if (!isAdmin) {
			loading = false;
			return;
		}

		users = await listUsers();
		loading = false;
		try {
			produkTanpaStok = await hitungBarangTanpaStok();
		} catch (e) {
			console.error('Gagal menghitung produk tanpa stok:', e);
		}
		autoBackupDir = await getAutoBackupDir();
	});

	function simpanToko(event: Event) {
		event.preventDefault();
		tokoInfo.set({ nama: namaToko.trim() || 'Kios Sumur Yacob', alamat: alamatToko.trim() });
		tokoTersimpan = true;
		setTimeout(() => (tokoTersimpan = false), 2000);
	}

	function bukaModal() {
		formError = '';
		editId = null;
		nama = '';
		username = '';
		password = '';
		role = 'kasir';
		dialogEl?.showModal();
	}

	function bukaEdit(user: User) {
		formError = '';
		editId = user.id;
		nama = user.nama;
		username = user.username;
		password = '';
		role = user.role;
		dialogEl?.showModal();
	}

	function tutupModal() {
		dialogEl?.close();
	}

	async function simpanUser(event: Event) {
		event.preventDefault();
		formError = '';

		// Saat Edit, password boleh kosong (= tidak diganti).
		if (!nama.trim() || !username.trim() || (editId === null && !password)) {
			formError = 'Semua field wajib diisi';
			return;
		}

		saving = true;
		try {
			if (!(await usernameTersedia(username.trim(), editId ?? undefined))) {
				formError = 'Username sudah dipakai';
				return;
			}

			const data = { nama: nama.trim(), username: username.trim(), role };
			if (editId === null) {
				await tambahUser({ ...data, password });
			} else {
				const result = await ubahUser(editId, { ...data, password: password || undefined });
				if (!result.ok) {
					formError = result.error ?? 'Gagal menyimpan user';
					return;
				}
				// Kalau yang diedit adalah diri sendiri, sidebar & hak akses harus ikut
				// berubah sekarang — bukan menunggu login ulang.
				if (editId === $currentUser?.id) {
					currentUser.set({ id: editId, ...data });
				}
			}
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
		{#if isAdmin}
			<button class="tab-btn" class:active={tab === 'produk'} onclick={() => (tab = 'produk')}>
				Produk
			</button>
			<button class="tab-btn" class:active={tab === 'laporan'} onclick={() => (tab = 'laporan')}>
				Laporan
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

		<section class="card section">
			<h2>Versi Aplikasi</h2>
			<div class="me">
				<div class="me-name">v{APP_VERSION}</div>
				<div class="me-meta">{BUILD_DATE} · commit {BUILD_COMMIT}</div>
				<div class="me-meta">Dibuat oleh {APP_AUTHOR}</div>
			</div>
			<p class="muted">
				Sebutkan baris-baris ini kalau melaporkan masalah — dari sini ketahuan installer versi
				mana yang sedang terpasang.
			</p>
		</section>
	{/if}

	{#if tab === 'produk' && isAdmin}
		<section class="card section">
			<h2>Stok Produk</h2>
			<label class="setel">
				<input
					type="checkbox"
					checked={$stokLonggar}
					disabled={menyimpanStok}
					onchange={(e) => gantiModeStok(e.currentTarget.checked, e.currentTarget)}
				/>
				<span>
					<strong>Boleh jual walau stok habis</strong>
					<span class="setel-desc">
						{#if $stokLonggar}
							Sedang aktif. Barang berstok 0 masih bisa masuk keranjang setelah kasir menyetujui
							peringatannya, dan stok tidak wajib diisi saat menambah produk.
						{:else}
							Sedang mati — <strong>mode stok ketat</strong>. Barang berstok 0 atau yang stoknya
							belum diisi ditolak, tidak bisa menjual melebihi stok, dan stok wajib diisi saat
							menambah produk.
						{/if}
					</span>
				</span>
			</label>

			<!--
				Jumlah produk tanpa stok ditampilkan di KEDUA mode, bukan cuma saat ketat:
				saat masih longgar ia jadi peringatan sebelum tombolnya dimatikan, saat
				sudah ketat ia jadi daftar pekerjaan yang harus dibereskan.
			-->
			{#if produkTanpaStok > 0}
				<p class="catatan">
					{#if $stokLonggar}
						<strong>{produkTanpaStok} produk</strong> stoknya belum diisi (tertulis "-" di Daftar
						Produk). Kalau centang ini dimatikan, produk itu tidak bisa dijual sampai stoknya
						diisi.
					{:else}
						<strong>{produkTanpaStok} produk</strong> stoknya belum diisi dan
						<strong>sedang tidak bisa dijual</strong>. Isi stoknya lewat halaman Produk.
					{/if}
				</p>
			{/if}
		</section>
	{/if}

	{#if tab === 'laporan' && isAdmin}
		<section class="card section">
			<h2>Hak Akses Laporan</h2>
			<label class="setel">
				<input
					type="checkbox"
					checked={$laporanKasirHariIni}
					disabled={menyimpanLaporan}
					onchange={(e) => gantiHakAksesLaporan(e.currentTarget.checked, e.currentTarget)}
				/>
				<span>
					<strong>Kasir hanya boleh melihat laporan hari ini</strong>
					<span class="setel-desc">
						{#if $laporanKasirHariIni}
							Sedang aktif. User dengan role <strong>kasir</strong> cuma melihat tab "Hari Ini" dan
							"Kas Bon"; Dashboard dan Keseluruhan disembunyikan, dan Export Excel-nya terkunci ke
							hari ini.
						{:else}
							Sedang mati. User dengan role <strong>kasir</strong> melihat seluruh laporan —
							termasuk omzet dan laba sepanjang waktu.
						{/if}
					</span>
				</span>
			</label>

			<p class="catatan">
				Admin tidak terpengaruh pengaturan ini — admin selalu melihat semua laporan. Perubahan
				baru terasa di mesin lain setelah aplikasinya dibuka ulang.
			</p>
		</section>
	{/if}

	{#if tab === 'user' && isAdmin}
		<section class="card section">
			<div class="section-header">
				<h2>Daftar User</h2>
				<button onclick={bukaModal}>+ Tambah User</button>
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
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#if loading}
						<tr><td colspan="4" class="empty">Memuat data...</td></tr>
					{:else}
						{#each users as user (user.id)}
							<tr>
								<td>{user.nama}</td>
								<td>{user.username}</td>
								<td class="role">{user.role}</td>
								<td class="action">
									<button onclick={() => bukaEdit(user)}>Edit</button>
									<button onclick={() => hapus(user)} disabled={user.id === $currentUser?.id}>
										Hapus
									</button>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</section>
	{/if}

	{#if tab === 'sinkronisasi' && isAdmin}
		<section class="card section">
			<h2>Sinkronisasi Data</h2>
			<p class="muted">Backup data ke cloud (Supabase) belum aktif — akan tersedia di fase berikutnya.</p>
			<button disabled>Sinkronkan Sekarang</button>
		</section>

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
	<form onsubmit={simpanUser}>
		<h2>{editId === null ? 'Tambah User' : 'Edit User'}</h2>

		<label for="nama">Nama</label>
		<input id="nama" bind:value={nama} placeholder="mis. Wati" autofocus />

		<label for="username">Username</label>
		<input id="username" bind:value={username} placeholder="mis. wati" autocomplete="off" />

		<label for="password">{editId === null ? 'Password' : 'Password Baru'}</label>
		<input
			id="password"
			type="password"
			bind:value={password}
			autocomplete="new-password"
			placeholder={editId === null ? '' : 'Kosongkan kalau tidak diganti'}
		/>

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
				{saving ? 'Menyimpan...' : editId === null ? 'Tambah User' : 'Simpan'}
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
		white-space: nowrap;
	}

	.action button + button {
		margin-left: 0.4rem;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0 0 0.9rem 0;
	}

	.setel {
		display: flex;
		align-items: flex-start;
		gap: 0.7rem;
		cursor: pointer;
	}

	.setel input[type='checkbox'] {
		width: 1.1rem;
		height: 1.1rem;
		margin-top: 0.15rem;
		flex-shrink: 0;
		cursor: pointer;
	}

	.setel-desc {
		display: block;
		margin-top: 0.25rem;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-muted);
	}

	.catatan {
		margin: 0.9rem 0 0 0;
		padding: 0.7rem 0.85rem;
		border: 1px solid var(--border);
		border-left: 3px solid var(--warning, #b54708);
		border-radius: 6px;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-muted);
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
