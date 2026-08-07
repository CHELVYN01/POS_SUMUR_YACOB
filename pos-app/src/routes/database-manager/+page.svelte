<script lang="ts">
	import { goto } from '$app/navigation';
	import { save, open } from '@tauri-apps/plugin-dialog';
	import { getDb } from '$lib/db';
	import {
		verifyMasterPassword,
		backupDatabase,
		validateZipBackup,
		restoreDatabase,
		resetDatabase,
		relaunchApp
	} from '$lib/db-manager';

	type Tampilan =
		| 'auth'
		| 'menu'
		| 'restore-confirm'
		| 'reset-form'
		| 'processing'
		| 'done'
		| 'error';

	let tampilan = $state<Tampilan>('auth');
	let masterPassword = $state('');
	let authError = $state('');
	let authLoading = $state(false);

	let pesanProses = $state('');
	let pesanSukses = $state('');
	let pesanError = $state('');

	let zipTerpilih = $state('');
	let restoreConfirmText = $state('');

	let adminNama = $state('');
	let adminUsername = $state('');
	let adminPassword = $state('');
	let adminPasswordUlang = $state('');
	let resetFormError = $state('');
	let resetConfirmText = $state('');

	function pad(n: number) {
		return String(n).padStart(2, '0');
	}

	function namaBackupDefault() {
		const d = new Date();
		const tanggal = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
		const jam = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
		return `backup-pos-${tanggal}-${jam}.zip`;
	}

	async function submitAuth(event: Event) {
		event.preventDefault();
		authError = '';
		authLoading = true;
		try {
			const ok = await verifyMasterPassword(masterPassword);
			if (!ok) {
				authError = 'Password salah';
				return;
			}
			masterPassword = '';
			tampilan = 'menu';
		} catch (err) {
			authError = String(err);
		} finally {
			authLoading = false;
		}
	}

	async function mulaiBackup() {
		try {
			const dest = await save({
				defaultPath: namaBackupDefault(),
				filters: [{ name: 'Backup POS', extensions: ['zip'] }]
			});
			if (!dest) return;

			tampilan = 'processing';
			pesanProses = 'Membuat backup...';

			const db = await getDb();
			await db.execute('PRAGMA wal_checkpoint(TRUNCATE);');
			await backupDatabase(dest);

			pesanSukses = `Backup berhasil disimpan ke:\n${dest}`;
			tampilan = 'done';
		} catch (err) {
			pesanError = String(err);
			tampilan = 'error';
		}
	}

	async function pilihFileRestore() {
		try {
			const dipilih = await open({
				multiple: false,
				filters: [{ name: 'Backup POS', extensions: ['zip'] }]
			});
			if (!dipilih || Array.isArray(dipilih)) return;

			tampilan = 'processing';
			pesanProses = 'Memvalidasi file backup...';
			await validateZipBackup(dipilih);

			zipTerpilih = dipilih;
			restoreConfirmText = '';
			tampilan = 'restore-confirm';
		} catch (err) {
			pesanError = String(err);
			tampilan = 'error';
		}
	}

	async function jalankanRestore() {
		if (restoreConfirmText.trim().toUpperCase() !== 'RESTORE') return;

		tampilan = 'processing';
		pesanProses = 'Memulihkan data, aplikasi akan dimulai ulang...';
		try {
			await restoreDatabase(zipTerpilih);
			await relaunchApp();
		} catch (err) {
			pesanError = String(err);
			tampilan = 'error';
		}
	}

	function bukaFormReset() {
		adminNama = '';
		adminUsername = '';
		adminPassword = '';
		adminPasswordUlang = '';
		resetFormError = '';
		resetConfirmText = '';
		tampilan = 'reset-form';
	}

	async function jalankanReset(event: Event) {
		event.preventDefault();
		resetFormError = '';

		if (!adminNama.trim() || !adminUsername.trim() || !adminPassword) {
			resetFormError = 'Semua field admin wajib diisi';
			return;
		}
		if (adminPassword !== adminPasswordUlang) {
			resetFormError = 'Konfirmasi password tidak cocok';
			return;
		}
		if (resetConfirmText.trim().toUpperCase() !== 'RESET') {
			resetFormError = 'Ketik RESET untuk konfirmasi';
			return;
		}

		tampilan = 'processing';
		pesanProses = 'Membuat database baru, aplikasi akan dimulai ulang...';
		try {
			await resetDatabase({
				nama: adminNama.trim(),
				username: adminUsername.trim(),
				password: adminPassword
			});
			await relaunchApp();
		} catch (err) {
			pesanError = String(err);
			tampilan = 'error';
		}
	}

	function kembaliKeMenu() {
		pesanError = '';
		pesanSukses = '';
		tampilan = 'menu';
	}
</script>

<div class="dbm-page">
	<div class="dbm-box card">
		<h1>Database Manager</h1>

		{#if tampilan === 'auth'}
			<p class="subtitle">Masukkan master password untuk mengelola database</p>
			<form onsubmit={submitAuth}>
				<label for="master-password">Master Password</label>
				<input
					id="master-password"
					type="password"
					bind:value={masterPassword}
					autocomplete="off"
					autofocus
				/>
				{#if authError}
					<p class="error">{authError}</p>
				{/if}
				<button type="submit" class="primary" disabled={authLoading}>
					{authLoading ? 'Memeriksa...' : 'Masuk'}
				</button>
			</form>
			<a href="/" class="back-link">Kembali ke Login</a>
		{/if}

		{#if tampilan === 'menu'}
			<p class="subtitle">Pilih tindakan yang ingin dilakukan</p>
			<div class="menu-actions">
				<button onclick={mulaiBackup}>
					<span class="action-title">Backup Data</span>
					<span class="action-desc">Simpan salinan database saat ini ke file .zip</span>
				</button>
				<button onclick={pilihFileRestore}>
					<span class="action-title">Restore Data</span>
					<span class="action-desc">Timpa database saat ini dengan file backup .zip</span>
				</button>
				<button class="danger-action" onclick={bukaFormReset}>
					<span class="action-title">Buat Baru</span>
					<span class="action-desc">Kosongkan database dan buat admin baru</span>
				</button>
			</div>
			<a href="/" class="back-link">Kembali ke Login</a>
		{/if}

		{#if tampilan === 'restore-confirm'}
			<div class="warning">
				<strong>Peringatan</strong>
				<p>
					Semua data saat ini akan ditimpa total oleh isi file backup dan tidak bisa dibatalkan.
					Data lama akan otomatis dicadangkan sebagai jaring pengaman, tapi database aktif akan
					berubah sepenuhnya.
				</p>
			</div>
			<label for="restore-confirm">Ketik <strong>RESTORE</strong> untuk melanjutkan</label>
			<input id="restore-confirm" bind:value={restoreConfirmText} autocomplete="off" />
			<div class="form-actions">
				<button onclick={kembaliKeMenu}>Batal</button>
				<button
					class="danger-action"
					disabled={restoreConfirmText.trim().toUpperCase() !== 'RESTORE'}
					onclick={jalankanRestore}
				>
					Restore Sekarang
				</button>
			</div>
		{/if}

		{#if tampilan === 'reset-form'}
			<div class="warning">
				<strong>Peringatan</strong>
				<p>
					Semua data saat ini akan dihapus total dan tidak bisa dibatalkan. Data lama akan
					otomatis dicadangkan sebagai jaring pengaman. Database baru akan kosong, hanya berisi 1
					akun admin yang Anda buat di bawah ini.
				</p>
			</div>
			<form onsubmit={jalankanReset}>
				<label for="admin-nama">Nama Admin</label>
				<input id="admin-nama" bind:value={adminNama} autocomplete="off" />

				<label for="admin-username">Username</label>
				<input id="admin-username" bind:value={adminUsername} autocomplete="off" />

				<label for="admin-password">Password</label>
				<input
					id="admin-password"
					type="password"
					bind:value={adminPassword}
					autocomplete="new-password"
				/>

				<label for="admin-password-ulang">Ulangi Password</label>
				<input
					id="admin-password-ulang"
					type="password"
					bind:value={adminPasswordUlang}
					autocomplete="new-password"
				/>

				<label for="reset-confirm">Ketik <strong>RESET</strong> untuk konfirmasi</label>
				<input id="reset-confirm" bind:value={resetConfirmText} autocomplete="off" />

				{#if resetFormError}
					<p class="error">{resetFormError}</p>
				{/if}

				<div class="form-actions">
					<button type="button" onclick={kembaliKeMenu}>Batal</button>
					<button type="submit" class="danger-action">Buat Database Baru</button>
				</div>
			</form>
		{/if}

		{#if tampilan === 'processing'}
			<p class="subtitle">{pesanProses}</p>
		{/if}

		{#if tampilan === 'done'}
			<p class="success">{pesanSukses}</p>
			<div class="form-actions">
				<button class="primary" onclick={kembaliKeMenu}>Kembali ke Menu</button>
			</div>
		{/if}

		{#if tampilan === 'error'}
			<p class="error">{pesanError}</p>
			<div class="form-actions">
				<button class="primary" onclick={kembaliKeMenu}>Kembali ke Menu</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.dbm-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		background: var(--bg);
	}

	.dbm-box {
		width: 100%;
		max-width: 420px;
		padding: 2rem;
	}

	h1 {
		font-size: 1.2rem;
		margin-bottom: 0.3rem;
	}

	.subtitle {
		margin: 0 0 1.2rem 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	form {
		display: flex;
		flex-direction: column;
	}

	label {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0.6rem 0 0.3rem 0;
	}

	label:first-of-type {
		margin-top: 0;
	}

	button.primary,
	form > button[type='submit'] {
		margin-top: 1.2rem;
	}

	.back-link {
		display: block;
		text-align: center;
		margin-top: 1.2rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.menu-actions {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.menu-actions button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
		padding: 0.8em 1em;
		text-align: left;
	}

	.action-title {
		font-weight: 600;
	}

	.action-desc {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.danger-action {
		border-color: var(--danger);
		color: var(--danger);
	}

	.danger-action:hover {
		background: var(--danger);
		color: #fff;
	}

	.warning {
		background: color-mix(in srgb, var(--danger) 12%, transparent);
		border: 1px solid var(--danger);
		border-radius: var(--radius);
		padding: 0.8em 1em;
		margin-bottom: 1rem;
	}

	.warning strong {
		color: var(--danger);
	}

	.warning p {
		margin: 0.4em 0 0 0;
		font-size: 0.85rem;
	}

	.form-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 1.3rem;
	}

	.form-actions button {
		flex: 1;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		white-space: pre-wrap;
	}

	.success {
		color: var(--accent);
		font-size: 0.9rem;
		white-space: pre-wrap;
	}
</style>
