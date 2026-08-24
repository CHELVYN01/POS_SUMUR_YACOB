<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { open } from '@tauri-apps/plugin-dialog';
	import { readFile } from '@tauri-apps/plugin-fs';
	import { aktivasiLisensi, labelPerangkat, labelTier } from '$lib/lisensi';
	import { lisensi, segarkanLisensi } from '$lib/stores/lisensi';
	import { APP_AUTHOR, APP_VERSION } from '$lib/buildInfo';

	let kode = $state('');
	let idMesinTampil = $state('');
	let alasan = $state('');
	let error = $state('');
	let loading = $state(false);
	let memuat = $state(true);
	let tersalin = $state(false);
	let berhasil = $state<{ tier: string; perangkat: string; nama: string } | null>(null);

	onMount(async () => {
		try {
			const status = await segarkanLisensi();
			idMesinTampil = status.idMesin;
			// Kalau lisensinya ternyata sah, tidak ada gunanya menahan orang di sini.
			if (status.aktif) {
				goto('/');
				return;
			}
			// "Belum diaktifkan" bukan kesalahan — tidak perlu dipajang sebagai peringatan.
			alasan = status.alasan && !status.alasan.startsWith('Aplikasi belum') ? status.alasan : '';
		} catch (e) {
			error = `Gagal membaca status lisensi: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			memuat = false;
		}
	});

	async function salinIdMesin() {
		try {
			await navigator.clipboard.writeText(idMesinTampil);
			tersalin = true;
			setTimeout(() => (tersalin = false), 2000);
		} catch {
			// Tanpa clipboard, ID-nya tetap terbaca di layar untuk dibacakan/ditulis.
		}
	}

	async function imporBerkas() {
		error = '';
		try {
			const path = await open({
				multiple: false,
				filters: [{ name: 'Berkas Lisensi', extensions: ['lic', 'txt'] }]
			});
			if (typeof path !== 'string') return;
			// readFile, bukan readTextFile: capability yang ada baru `fs:allow-read-file`
			// (dipasang di fase 18) dan ini jalur baca berkas yang sudah terbukti jalan.
			// Baris komentar '#' dan spasi dibersihkan di sisi Rust, jadi isi berkas
			// dari website bisa dimasukkan apa adanya.
			kode = new TextDecoder().decode(await readFile(path));
		} catch (e) {
			error = `Gagal membaca berkas: ${e instanceof Error ? e.message : String(e)}`;
		}
	}

	async function aktifkan(event: Event) {
		event.preventDefault();
		if (!kode.trim()) {
			error = 'Kode lisensi masih kosong.';
			return;
		}
		error = '';
		loading = true;
		try {
			const status = await aktivasiLisensi(kode);
			// WAJIB: penjaga di (app)/+layout membaca store ini, bukan memanggil Rust
			// sendiri. Tanpa baris ini store masih memegang status "belum aktif" yang
			// dibaca saat aplikasi dibuka, dan login berhasil pun langsung dilempar
			// balik ke sini — terlihat seperti login yang gagal.
			lisensi.set(status);
			berhasil = {
				tier: labelTier(status),
				perangkat: labelPerangkat(status),
				nama: status.nama ?? ''
			};
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<div class="aktivasi-page">
	<div class="aktivasi-box card">
		{#if memuat}
			<h1>Memeriksa lisensi…</h1>
		{:else if berhasil}
			<h1>Aplikasi aktif</h1>
			<p class="subtitle">Terima kasih. Lisensi sudah terpasang di komputer ini.</p>
			<dl class="ringkas">
				<div><dt>Paket</dt><dd>{berhasil.tier}</dd></div>
				<div><dt>Berlisensi kepada</dt><dd>{berhasil.nama}</dd></div>
				<div><dt>Perangkat</dt><dd>{berhasil.perangkat}</dd></div>
			</dl>
			<button class="primary" onclick={() => goto('/')}>Lanjut ke Login</button>
		{:else}
			<h1>Aktivasi Aplikasi</h1>
			<p class="subtitle">
				Masukkan kode lisensi yang kamu terima setelah pembelian untuk mulai memakai aplikasi.
			</p>

			{#if alasan}
				<p class="peringatan">{alasan}</p>
			{/if}

			<div class="mesin">
				<span class="mesin-label">ID Mesin komputer ini</span>
				<div class="mesin-baris">
					<code>{idMesinTampil || '—'}</code>
					<button type="button" class="tautan" onclick={salinIdMesin}>
						{tersalin ? 'Tersalin' : 'Salin'}
					</button>
				</div>
				<span class="mesin-catatan">
					Sebutkan ID ini kalau kamu perlu meminta kode pengganti ke penjual.
				</span>
			</div>

			<form onsubmit={aktifkan}>
				<label for="kode">Kode Lisensi</label>
				<textarea
					id="kode"
					bind:value={kode}
					rows="5"
					spellcheck="false"
					placeholder="KIOS1.…"
				></textarea>

				{#if error}
					<p class="error">{error}</p>
				{/if}

				<div class="aksi">
					<button type="button" onclick={imporBerkas}>Impor berkas .lic</button>
					<button type="submit" class="primary" disabled={loading}>
						{loading ? 'Memeriksa…' : 'Aktifkan'}
					</button>
				</div>
			</form>

			<!-- Data pemilik toko tidak boleh jadi sandera lisensi: Database Manager tetap
			     bisa dibuka dari sini supaya backup selalu bisa diambil. -->
			<a href="/database-manager" class="back-link">Kelola Database (backup data)</a>
		{/if}

		<p class="versi">v{APP_VERSION} · oleh {APP_AUTHOR}</p>
	</div>
</div>

<style>
	.aktivasi-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		background: var(--bg);
	}

	.aktivasi-box {
		width: 100%;
		max-width: 480px;
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

	.peringatan {
		margin: 0 0 1.2rem 0;
		padding: 0.7rem 0.85rem;
		border-radius: 8px;
		border: 1px solid var(--danger);
		color: var(--danger);
		font-size: 0.85rem;
		line-height: 1.5;
	}

	.mesin {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.85rem;
		margin-bottom: 1.2rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-subtle, transparent);
	}

	.mesin-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.mesin-baris {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.mesin-baris code {
		font-size: 1rem;
		letter-spacing: 0.06em;
	}

	.mesin-catatan {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	form {
		display: flex;
		flex-direction: column;
	}

	label {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0 0 0.3rem 0;
	}

	textarea {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.75rem;
		line-height: 1.5;
		resize: vertical;
		/* Kode lisensi satu blok tanpa spasi — tanpa ini ia melebar keluar kotak. */
		word-break: break-all;
	}

	.error {
		margin: 0.7rem 0 0 0;
		font-size: 0.85rem;
	}

	.aksi {
		display: flex;
		gap: 0.6rem;
		margin-top: 1.2rem;
	}

	.aksi button {
		flex: 1;
	}

	.tautan {
		border: none;
		background: none;
		padding: 0;
		font-size: 0.8rem;
		color: var(--text-muted);
		cursor: pointer;
		text-decoration: underline;
	}

	.ringkas {
		margin: 0 0 1.2rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.ringkas div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		font-size: 0.9rem;
	}

	.ringkas dt {
		color: var(--text-muted);
	}

	.ringkas dd {
		margin: 0;
		font-weight: 600;
	}

	.back-link {
		display: block;
		text-align: center;
		margin-top: 1.2rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.versi {
		margin: 1.5rem 0 0 0;
		text-align: center;
		font-size: 0.72rem;
		color: var(--text-muted);
	}
</style>
