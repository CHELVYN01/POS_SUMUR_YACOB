<script lang="ts">
	import type { PenjualanKategori } from '$lib/types';
	import { formatRupiah } from '$lib/utils/format';

	/**
	 * Pemasukan dipecah per kategori — jawaban atas kebutuhan client: ada produk
	 * yang uangnya dipisah dari dagangan biasa, dan tiap kelompok harus bisa
	 * dibaca angkanya sendiri.
	 *
	 * Kolom laba disembunyikan untuk kasir (`tampilkanLaba = false`), mengikuti
	 * aturan yang sudah dipakai kartu "Laba Hari Ini" di halaman Laporan.
	 */
	let {
		data = [],
		tampilkanLaba = true,
		memuat = false
	}: { data?: PenjualanKategori[]; tampilkanLaba?: boolean; memuat?: boolean } = $props();

	let total = $derived(data.reduce((s, d) => s + d.totalNilai, 0));

	/** Total laba: baris yang labanya tak diketahui dilewati, bukan dihitung 0. */
	let totalLaba = $derived(data.reduce((s, d) => s + (d.totalLaba ?? 0), 0));
	let totalModal = $derived(data.reduce((s, d) => s + d.totalModal, 0));
	let totalQty = $derived(data.reduce((s, d) => s + d.totalQty, 0));
	let adaYangBelum = $derived(data.some((d) => d.nilaiBelumTerhitung > 0));

	function persen(nilai: number): number {
		return total > 0 ? Math.round((nilai / total) * 100) : 0;
	}

	/** Baris tanpa kategori tetap ditampilkan; menyembunyikannya bikin jumlah kolom
	    tidak sama dengan total penjualan, seolah ada uang yang hilang. */
	function labelKategori(nama: string | null): string {
		return nama ?? 'Tanpa Kategori';
	}
</script>

{#if memuat}
	<p class="kosong">Memuat data...</p>
{:else if data.length === 0}
	<p class="kosong">Belum ada penjualan pada periode ini</p>
{:else}
	<div class="tabel-wrap">
		<table>
			<thead>
				<tr>
					<th>Kategori</th>
					<th class="num">Terjual</th>
					<th class="num">Pemasukan</th>
					<th class="num">Porsi</th>
					{#if tampilkanLaba}
						<th class="num">Modal</th>
						<th class="num">Laba</th>
					{/if}
				</tr>
			</thead>
			<tbody>
				{#each data as d (d.kategori ?? '__tanpa__')}
					<tr>
						<td class="nama" class:tanpa={d.kategori === null}>
							{labelKategori(d.kategori)}
						</td>
						<td class="num">{d.totalQty}</td>
						<td class="num tebal">{formatRupiah(d.totalNilai)}</td>
						<td class="num porsi">
							<span class="porsi-angka">{persen(d.totalNilai)}%</span>
							<span class="track"><span class="isi" style="width: {persen(d.totalNilai)}%"></span></span>
						</td>
						{#if tampilkanLaba}
							<td class="num">{formatRupiah(d.totalModal)}</td>
							<!-- null = tidak satu pun baris kategori ini punya harga beli.
							     Ditulis "—", bukan Rp0: Rp0 terbaca "jualan tanpa untung". -->
							<td class="num laba" class:rugi={(d.totalLaba ?? 0) < 0}>
								{d.totalLaba === null ? '—' : formatRupiah(d.totalLaba)}
								{#if d.nilaiBelumTerhitung > 0}
									<span
										class="tanda"
										title="{formatRupiah(d.nilaiBelumTerhitung)} penjualan di kategori ini belum dihitung labanya karena harga belinya kosong"
									>*</span>
								{/if}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
			<tfoot>
				<tr>
					<td>Total</td>
					<td class="num">{totalQty}</td>
					<td class="num tebal">{formatRupiah(total)}</td>
					<td class="num">100%</td>
					{#if tampilkanLaba}
						<td class="num">{formatRupiah(totalModal)}</td>
						<td class="num laba" class:rugi={totalLaba < 0}>{formatRupiah(totalLaba)}</td>
					{/if}
				</tr>
			</tfoot>
		</table>
	</div>

	{#if tampilkanLaba && adaYangBelum}
		<p class="catatan">
			* sebagian penjualan di kategori itu belum dihitung labanya karena harga belinya kosong —
			angka labanya lebih kecil dari yang sebenarnya.
		</p>
	{/if}
{/if}

<style>
	.tabel-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.88rem;
	}

	th,
	td {
		padding: 0.55rem 0.6rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}

	th {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	/* Angka rata kanan dengan lebar digit seragam supaya kolom uang berbaris lurus
	   ke bawah dan bisa dibandingkan sekilas. */
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.nama {
		font-weight: 500;
	}

	/* Produk yang belum dikelompokkan — dibedakan supaya kelihatan masih ada yang
	   perlu dirapikan, bukan dibaca sebagai nama kategori sungguhan. */
	.nama.tanpa {
		color: var(--text-muted);
		font-style: italic;
		font-weight: 400;
	}

	.tebal {
		font-weight: 600;
	}

	.laba {
		color: var(--success, #2f6e4f);
	}

	.laba.rugi {
		color: var(--danger);
	}

	.tanda {
		color: var(--text-muted);
		cursor: help;
	}

	.porsi {
		min-width: 6.5rem;
	}

	.porsi-angka {
		display: block;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.track {
		display: block;
		height: 4px;
		margin-top: 2px;
		background: var(--border);
		border-radius: 2px;
		overflow: hidden;
	}

	.isi {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: 2px;
	}

	tfoot td {
		font-weight: 600;
		border-top: 2px solid var(--border);
		border-bottom: none;
	}

	.kosong {
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 1.5rem 0;
		margin: 0;
	}

	.catatan {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin: 0.6rem 0 0 0;
	}
</style>
