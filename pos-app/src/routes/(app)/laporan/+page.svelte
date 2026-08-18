<script lang="ts">
	import { listPenjualan } from '$lib/db/penjualan';
	import { listKasBon } from '$lib/db/kasbon';
	import {
		ringkasanPeriode,
		penjualanPerHari,
		bonPerHari,
		penjualanPerJam,
		barangTerlaris
	} from '$lib/db/laporan';
	import { exportLaporanExcel } from '$lib/export/excel';
	import BarChart from '$lib/components/BarChart.svelte';
	import BarList from '$lib/components/BarList.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import { formatRupiah, formatTanggal, formatTanggalJam, formatTanggalLokal } from '$lib/utils/format';
	import {
		hariIni,
		bulanIni,
		nHariTerakhir,
		sepanjangWaktu,
		periodeDariPreset,
		labelPeriode,
		slugPeriode,
		tanggalHariIni,
		type Periode,
		type PresetPeriode
	} from '$lib/utils/periode';
	import type { BarangTerjual, KasBon, Penjualan, Ringkasan, TitikGrafik } from '$lib/types';

	type Tab = 'dashboard' | 'hariIni' | 'keseluruhan' | 'bon';
	let tab = $state<Tab>('dashboard');

	const RINGKASAN_KOSONG: Ringkasan = {
		totalPenjualan: 0,
		jumlahTransaksi: 0,
		rataRata: 0,
		bonBaru: 0,
		jumlahBon: 0,
		bonDibayar: 0
	};

	// --- Dashboard ---
	let ringkasanHariIni = $state<Ringkasan>(RINGKASAN_KOSONG);
	let ringkasanBulan = $state<Ringkasan>(RINGKASAN_KOSONG);
	let ringkasanSemua = $state<Ringkasan>(RINGKASAN_KOSONG);
	let grafikPenjualan7 = $state<TitikGrafik[]>([]);
	let grafikBon7 = $state<TitikGrafik[]>([]);
	let terlaris = $state<BarangTerjual[]>([]);
	let memuatDashboard = $state(true);

	// --- Hari Ini ---
	let tanggalAktif = $state(tanggalHariIni());
	let ringkasanHari = $state<Ringkasan>(RINGKASAN_KOSONG);
	let grafikJam = $state<TitikGrafik[]>([]);
	let penjualanHari = $state<Penjualan[]>([]);
	let memuatHari = $state(true);

	// --- Keseluruhan ---
	let preset = $state<PresetPeriode>('semua');
	let dariKustom = $state('');
	let sampaiKustom = $state('');
	let ringkasanPeriodeAktif = $state<Ringkasan>(RINGKASAN_KOSONG);
	let grafikPeriode = $state<TitikGrafik[]>([]);
	let penjualanPeriode = $state<Penjualan[]>([]);
	let memuatPeriode = $state(true);

	// --- Kas Bon ---
	let daftarKasBon = $state<KasBon[]>([]);
	let memuatBon = $state(true);

	let expanded = $state<number | null>(null);
	let mengekspor = $state(false);
	let pesanError = $state('');

	/**
	 * Rentang custom baru dipakai kalau dua-duanya sudah diisi dan urutannya benar;
	 * sebelum itu jatuh ke bulan ini supaya tabel tidak sempat kosong sesaat.
	 */
	let periodeAktif = $derived.by((): Periode => {
		if (preset !== 'custom') return periodeDariPreset(preset);
		if (dariKustom && sampaiKustom && dariKustom <= sampaiKustom) {
			return { dari: dariKustom, sampai: sampaiKustom };
		}
		return bulanIni();
	});

	let labelPeriodeAktif = $derived(
		preset === 'semua' ? 'Semua Data' : labelPeriode(periodeAktif)
	);

	/** Grafik harian tidak masuk akal untuk rentang "Semua Data" yang tak terbatas. */
	let tampilkanGrafikPeriode = $derived(preset !== 'semua');

	async function muatDashboard() {
		memuatDashboard = true;
		try {
			const p7 = nHariTerakhir(7);
			const p30 = nHariTerakhir(30);
			[
				ringkasanHariIni,
				ringkasanBulan,
				ringkasanSemua,
				grafikPenjualan7,
				grafikBon7,
				terlaris
			] = await Promise.all([
				ringkasanPeriode(hariIni()),
				ringkasanPeriode(bulanIni()),
				ringkasanPeriode(sepanjangWaktu()),
				penjualanPerHari(p7),
				bonPerHari(p7),
				barangTerlaris(p30, 8)
			]);
		} catch (e) {
			pesanError = pesan(e);
		} finally {
			memuatDashboard = false;
		}
	}

	async function muatHariIni() {
		memuatHari = true;
		try {
			const p = hariIni();
			tanggalAktif = p.dari;
			[ringkasanHari, grafikJam, penjualanHari] = await Promise.all([
				ringkasanPeriode(p),
				penjualanPerJam(p),
				listPenjualan(p)
			]);
		} catch (e) {
			pesanError = pesan(e);
		} finally {
			memuatHari = false;
		}
	}

	async function muatKeseluruhan(p: Periode, pakaiGrafik: boolean) {
		memuatPeriode = true;
		try {
			const [r, daftar] = await Promise.all([ringkasanPeriode(p), listPenjualan(p)]);
			ringkasanPeriodeAktif = r;
			penjualanPeriode = daftar;
			grafikPeriode = pakaiGrafik ? await penjualanPerHari(p) : [];
		} catch (e) {
			pesanError = pesan(e);
		} finally {
			memuatPeriode = false;
		}
	}

	async function muatBon() {
		memuatBon = true;
		try {
			daftarKasBon = await listKasBon();
		} catch (e) {
			pesanError = pesan(e);
		} finally {
			memuatBon = false;
		}
	}

	function pesan(e: unknown) {
		return e instanceof Error ? e.message : String(e);
	}

	// Data dimuat saat tabnya dibuka, bukan sekaligus di awal — tiap tab punya
	// query sendiri dan kasir biasanya cuma melihat satu tab.
	$effect(() => {
		if (tab === 'dashboard') muatDashboard();
		else if (tab === 'hariIni') muatHariIni();
		else if (tab === 'bon') muatBon();
	});

	$effect(() => {
		if (tab !== 'keseluruhan') return;
		muatKeseluruhan(periodeAktif, tampilkanGrafikPeriode);
	});

	/**
	 * App di kios bisa menyala semalaman. Tanpa ini, angka "hari ini" akan tetap
	 * menampilkan hari kemarin sampai aplikasinya dibuka ulang.
	 */
	$effect(() => {
		const id = setInterval(() => {
			if (tanggalHariIni() === tanggalAktif) return;
			if (tab === 'hariIni') muatHariIni();
			else if (tab === 'dashboard') muatDashboard();
			else tanggalAktif = tanggalHariIni();
		}, 60_000);
		return () => clearInterval(id);
	});

	function toggle(id: number) {
		expanded = expanded === id ? null : id;
	}

	/** Ekspor mengikuti tab yang sedang dibuka, bukan selalu seluruh riwayat. */
	async function eksporExcel() {
		pesanError = '';
		mengekspor = true;
		try {
			let p: Periode | undefined;
			let label: string | undefined;

			if (tab === 'hariIni') {
				p = hariIni();
				label = labelPeriode(p);
			} else if (tab === 'keseluruhan' && preset !== 'semua') {
				p = periodeAktif;
				label = labelPeriodeAktif;
			}

			// Sheet "Hari Ini" selalu diisi data hari ini, apa pun tab/rentang yang
			// sedang aktif — itu angka yang paling sering dicari saat file dibuka.
			const pHari = hariIni();
			const [pj, kb, rHari, pjHari] = await Promise.all([
				listPenjualan(p),
				listKasBon(p),
				ringkasanPeriode(pHari),
				listPenjualan(pHari)
			]);

			await exportLaporanExcel(pj, kb, {
				periode: label,
				namaFile: p ? `Laporan-${slugPeriode(p)}` : undefined,
				hariIni: {
					label: labelPeriode(pHari),
					ringkasan: rHari,
					penjualan: pjHari
				}
			});
		} catch (e) {
			pesanError = 'Gagal mengekspor: ' + pesan(e);
		} finally {
			mengekspor = false;
		}
	}

	let bonAktif = $derived(daftarKasBon.filter((k) => k.status === 'belum_lunas'));
	let bonLunas = $derived(daftarKasBon.filter((k) => k.status === 'lunas'));
	let totalBon = $derived(daftarKasBon.reduce((sum, k) => sum + k.total, 0));
	let totalBelumLunas = $derived(bonAktif.reduce((sum, k) => sum + k.sisa, 0));

	/**
	 * Rentang custom diisi awal dengan bulan berjalan supaya kartu "Periode" tidak
	 * sempat menampilkan rentang yang berbeda dari isi kedua DatePicker.
	 */
	function pilihPreset(nilai: PresetPeriode) {
		if (nilai === 'custom' && (!dariKustom || !sampaiKustom)) {
			const b = bulanIni();
			dariKustom = b.dari;
			sampaiKustom = b.sampai;
		}
		preset = nilai;
	}

	const PRESET: { nilai: PresetPeriode; label: string }[] = [
		{ nilai: 'semua', label: 'Semua' },
		{ nilai: 'hari', label: 'Hari Ini' },
		{ nilai: 'minggu', label: 'Minggu Ini' },
		{ nilai: 'bulan', label: 'Bulan Ini' },
		{ nilai: 'tahun', label: 'Tahun Ini' },
		{ nilai: 'custom', label: 'Pilih Tanggal' }
	];
</script>

{#snippet tabelPenjualan(rows: Penjualan[], memuat: boolean)}
	<table>
		<thead>
			<tr>
				<th>Waktu</th>
				<th>Kasir</th>
				<th>Jml Item</th>
				<th>Total</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#if memuat}
				<tr><td colspan="5" class="action" style="text-align: center;">Memuat data...</td></tr>
			{:else if rows.length === 0}
				<tr><td colspan="5" class="action" style="text-align: center;">Belum ada penjualan</td></tr>
			{:else}
				{#each rows as p (p.id)}
					<tr class="row" onclick={() => toggle(p.id)}>
						<td>{formatTanggalJam(p.tanggal)}</td>
						<td>{p.kasir}</td>
						<td>{p.items.length}</td>
						<td>{formatRupiah(p.total)}</td>
						<td class="action">{expanded === p.id ? '▲' : '▼'}</td>
					</tr>
					{#if expanded === p.id}
						<tr class="detail-row">
							<td colspan="5">
								<ul class="detail-list">
									{#each p.items as item}
										<li>{item.nama} × {item.jumlah} — {formatRupiah(item.harga * item.jumlah)}</li>
									{/each}
								</ul>
							</td>
						</tr>
					{/if}
				{/each}
			{/if}
		</tbody>
	</table>
{/snippet}

{#snippet kartu(label: string, nilai: string, sub?: string)}
	<div class="kartu card">
		<div class="kartu-label">{label}</div>
		<div class="kartu-nilai">{nilai}</div>
		{#if sub}<div class="kartu-sub">{sub}</div>{/if}
	</div>
{/snippet}

<div class="laporan">
	<div class="header">
		<h1>Laporan</h1>
		<button onclick={eksporExcel} disabled={mengekspor}>
			{mengekspor ? 'Mengekspor...' : 'Export Excel'}
		</button>
	</div>

	{#if pesanError}
		<p class="error">{pesanError}</p>
	{/if}

	<div class="tabs">
		<button class="tab-btn" class:active={tab === 'dashboard'} onclick={() => (tab = 'dashboard')}>
			Dashboard
		</button>
		<button class="tab-btn" class:active={tab === 'hariIni'} onclick={() => (tab = 'hariIni')}>
			Hari Ini
		</button>
		<button
			class="tab-btn"
			class:active={tab === 'keseluruhan'}
			onclick={() => (tab = 'keseluruhan')}
		>
			Keseluruhan
		</button>
		<button class="tab-btn" class:active={tab === 'bon'} onclick={() => (tab = 'bon')}>
			Kas Bon
		</button>
	</div>

	{#if tab === 'dashboard'}
		<div class="kartu-grid">
			{@render kartu(
				'Hari Ini',
				formatRupiah(ringkasanHariIni.totalPenjualan),
				`${ringkasanHariIni.jumlahTransaksi} transaksi`
			)}
			{@render kartu(
				'Bulan Ini',
				formatRupiah(ringkasanBulan.totalPenjualan),
				`${ringkasanBulan.jumlahTransaksi} transaksi`
			)}
			{@render kartu(
				'Keseluruhan',
				formatRupiah(ringkasanSemua.totalPenjualan),
				`${ringkasanSemua.jumlahTransaksi} transaksi`
			)}
			{@render kartu(
				'Bon Belum Lunas',
				formatRupiah(ringkasanSemua.bonBaru - ringkasanSemua.bonDibayar),
				`${ringkasanSemua.jumlahBon} bon tercatat`
			)}
		</div>

		{#if memuatDashboard}
			<p class="memuat">Memuat data...</p>
		{:else}
			<div class="card panel">
				<h3 class="section-title">Penjualan 7 Hari Terakhir</h3>
				<BarChart data={grafikPenjualan7} formatNilai={formatRupiah} />
			</div>

			<div class="panel-grid">
				<div class="card panel">
					<h3 class="section-title">Kas Bon 7 Hari Terakhir</h3>
					<BarChart
						data={grafikBon7}
						formatNilai={formatRupiah}
						labelSeri="Bon baru"
						labelSeri2="Bon dibayar"
					/>
				</div>

				<div class="card panel">
					<h3 class="section-title">Barang Terlaris (30 hari)</h3>
					<BarList data={terlaris} />
				</div>
			</div>
		{/if}
	{/if}

	{#if tab === 'hariIni'}
		<div class="hero card">
			<div class="hero-label">Penjualan Hari Ini · {formatTanggalLokal(tanggalAktif)}</div>
			<div class="hero-nilai">{formatRupiah(ringkasanHari.totalPenjualan)}</div>
			<div class="hero-sub">
				{ringkasanHari.jumlahTransaksi} transaksi · rata-rata {formatRupiah(ringkasanHari.rataRata)}
			</div>
		</div>

		<div class="kartu-grid">
			{@render kartu(
				'Bon Baru',
				formatRupiah(ringkasanHari.bonBaru),
				`${ringkasanHari.jumlahBon} bon`
			)}
			{@render kartu('Bon Dibayar', formatRupiah(ringkasanHari.bonDibayar))}
			{@render kartu(
				'Uang Masuk',
				formatRupiah(ringkasanHari.totalPenjualan + ringkasanHari.bonDibayar),
				'tunai + bon dibayar'
			)}
		</div>

		<div class="card panel">
			<h3 class="section-title">Penjualan per Jam</h3>
			<BarChart data={grafikJam} formatNilai={formatRupiah} />
		</div>

		<h3 class="section-title">Transaksi Hari Ini</h3>
		{@render tabelPenjualan(penjualanHari, memuatHari)}
	{/if}

	{#if tab === 'keseluruhan'}
		<div class="filter">
			{#each PRESET as p (p.nilai)}
				<button
					class="chip"
					class:active={preset === p.nilai}
					onclick={() => pilihPreset(p.nilai)}
				>
					{p.label}
				</button>
			{/each}
		</div>

		{#if preset === 'custom'}
			<div class="rentang">
				<label for="dari">Dari</label>
				<DatePicker id="dari" bind:value={dariKustom} placeholder="Tanggal mulai" />
				<label for="sampai">Sampai</label>
				<DatePicker id="sampai" bind:value={sampaiKustom} placeholder="Tanggal akhir" />
			</div>
			{#if dariKustom && sampaiKustom && dariKustom > sampaiKustom}
				<p class="error">Tanggal mulai melewati tanggal akhir — rentang belum dipakai.</p>
			{/if}
		{/if}

		<div class="kartu-grid">
			{@render kartu('Periode', labelPeriodeAktif)}
			{@render kartu(
				'Total Penjualan',
				formatRupiah(ringkasanPeriodeAktif.totalPenjualan),
				`${ringkasanPeriodeAktif.jumlahTransaksi} transaksi`
			)}
			{@render kartu('Rata-rata per Transaksi', formatRupiah(ringkasanPeriodeAktif.rataRata))}
			{@render kartu(
				'Bon Baru',
				formatRupiah(ringkasanPeriodeAktif.bonBaru),
				`${ringkasanPeriodeAktif.jumlahBon} bon`
			)}
		</div>

		{#if tampilkanGrafikPeriode}
			<div class="card panel">
				<h3 class="section-title">Penjualan per Hari</h3>
				<BarChart data={grafikPeriode} formatNilai={formatRupiah} />
			</div>
		{/if}

		<h3 class="section-title">Daftar Transaksi</h3>
		{@render tabelPenjualan(penjualanPeriode, memuatPeriode)}
	{/if}

	{#if tab === 'bon'}
		<div class="summary card">
			<div>
				<div class="summary-label">Total Bon</div>
				<div class="summary-value">{formatRupiah(totalBon)}</div>
			</div>
			<div>
				<div class="summary-label">Belum Lunas</div>
				<div class="summary-value">{formatRupiah(totalBelumLunas)}</div>
			</div>
			<div>
				<div class="summary-label">Jumlah Bon</div>
				<div class="summary-value">{daftarKasBon.length}</div>
			</div>
		</div>

		<h3 class="section-title">Belum Lunas ({bonAktif.length})</h3>
		<table>
			<thead>
				<tr>
					<th>Pengutang</th>
					<th>Tanggal</th>
					<th>Jatuh Tempo</th>
					<th>Total</th>
					<th>Sudah Dibayar</th>
					<th>Sisa</th>
				</tr>
			</thead>
			<tbody>
				{#if memuatBon}
					<tr><td colspan="6" class="action" style="text-align: center;">Memuat data...</td></tr>
				{:else if bonAktif.length === 0}
					<tr><td colspan="6" class="action" style="text-align: center;">Tidak ada bon aktif</td></tr>
				{:else}
					{#each bonAktif as bon (bon.id)}
						<tr>
							<td>{bon.namaPengutang}</td>
							<td>{formatTanggal(bon.tanggal)}</td>
							<td>{bon.jatuhTempo ? formatTanggalLokal(bon.jatuhTempo) : '-'}</td>
							<td>{formatRupiah(bon.total)}</td>
							<td>{formatRupiah(bon.sudahDibayar)}</td>
							<td class="sisa">{formatRupiah(bon.sisa)}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>

		<h3 class="section-title">Lunas ({bonLunas.length})</h3>
		<table>
			<thead>
				<tr>
					<th>Pengutang</th>
					<th>Tanggal</th>
					<th>Total</th>
				</tr>
			</thead>
			<tbody>
				{#if memuatBon}
					<tr><td colspan="3" class="action" style="text-align: center;">Memuat data...</td></tr>
				{:else if bonLunas.length === 0}
					<tr><td colspan="3" class="action" style="text-align: center;">Belum ada bon lunas</td></tr>
				{:else}
					{#each bonLunas as bon (bon.id)}
						<tr>
							<td>{bon.namaPengutang}</td>
							<td>{formatTanggal(bon.tanggal)}</td>
							<td>{formatRupiah(bon.total)}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	{/if}
</div>

<style>
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	.header h1 {
		margin: 0;
		font-size: 1.3rem;
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

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: -0.6rem 0 1rem 0;
	}

	.memuat {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.kartu-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.kartu {
		padding: 0.9rem 1.1rem;
	}

	.kartu-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.kartu-nilai {
		font-size: 1.25rem;
		font-weight: 600;
		margin-top: 0.2rem;
	}

	.kartu-sub {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-top: 0.15rem;
	}

	.hero {
		padding: 1.5rem 1.5rem 1.35rem;
		margin-bottom: 1rem;
		border-left: 4px solid var(--accent);
	}

	.hero-label {
		font-size: 0.8rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.hero-nilai {
		font-size: 2.4rem;
		font-weight: 700;
		line-height: 1.1;
		margin: 0.35rem 0 0.25rem;
		font-variant-numeric: tabular-nums;
	}

	.hero-sub {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.panel {
		padding: 1rem 1.25rem 1.1rem;
		margin-bottom: 1.25rem;
	}

	.panel-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}

	.panel-grid .panel {
		margin-bottom: 1.25rem;
	}

	.filter {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}

	.chip {
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-muted);
		border-radius: 999px;
		padding: 0.4em 0.95em;
		font-size: 0.82rem;
	}

	.chip:hover {
		color: var(--text);
		background: var(--surface);
	}

	.chip.active {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
		font-weight: 600;
	}

	.rentang {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}

	.rentang label {
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.summary {
		display: flex;
		gap: 2.5rem;
		padding: 1rem 1.25rem;
		margin-bottom: 1.25rem;
	}

	.summary-label {
		font-size: 0.78rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.summary-value {
		font-size: 1.3rem;
		font-weight: 600;
		margin-top: 0.15rem;
	}

	.section-title {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin: 0 0 0.75rem 0;
	}

	.laporan > .section-title {
		margin-top: 1.5rem;
	}

	.row {
		cursor: pointer;
	}

	.row:hover {
		background: var(--bg);
	}

	.action {
		text-align: right;
		color: var(--text-muted);
	}

	.sisa {
		font-weight: 600;
	}

	.detail-row td {
		background: var(--bg);
	}

	.detail-list {
		margin: 0;
		padding-left: 1.1rem;
		font-size: 0.88rem;
		color: var(--text-muted);
	}
</style>
