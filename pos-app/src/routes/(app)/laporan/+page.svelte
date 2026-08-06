<script lang="ts">
	import { onMount } from 'svelte';
	import { listPenjualan } from '$lib/db/penjualan';
	import { listKasBon } from '$lib/db/kasbon';
	import { exportLaporanExcel } from '$lib/export/excel';
	import type { Penjualan, KasBon } from '$lib/types';

	let tab = $state<'penjualan' | 'bon'>('penjualan');

	let daftarPenjualan = $state<Penjualan[]>([]);
	let daftarKasBon = $state<KasBon[]>([]);
	let loading = $state(true);
	let expanded = $state<number | null>(null);
	let mengekspor = $state(false);
	let exportError = $state('');

	onMount(async () => {
		[daftarPenjualan, daftarKasBon] = await Promise.all([listPenjualan(), listKasBon()]);
		loading = false;
	});

	let totalPenjualan = $derived(daftarPenjualan.reduce((sum, p) => sum + p.total, 0));

	let bonAktif = $derived(daftarKasBon.filter((k) => k.status === 'belum_lunas'));
	let bonLunas = $derived(daftarKasBon.filter((k) => k.status === 'lunas'));
	let totalBon = $derived(daftarKasBon.reduce((sum, k) => sum + k.total, 0));
	let totalBelumLunas = $derived(bonAktif.reduce((sum, k) => sum + k.sisa, 0));

	function formatRupiah(n: number) {
		return 'Rp' + n.toLocaleString('id-ID');
	}

	function formatTanggal(iso: string) {
		return new Date(iso.replace(' ', 'T')).toLocaleDateString('id-ID', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function toggle(id: number) {
		expanded = expanded === id ? null : id;
	}

	async function eksporExcel() {
		exportError = '';
		mengekspor = true;
		try {
			await exportLaporanExcel(daftarPenjualan, daftarKasBon);
		} catch (e) {
			exportError = 'Gagal mengekspor: ' + (e instanceof Error ? e.message : String(e));
		} finally {
			mengekspor = false;
		}
	}
</script>

<div class="laporan">
	<div class="header">
		<h1>Laporan</h1>
		<button onclick={eksporExcel} disabled={mengekspor || loading}>
			{mengekspor ? 'Mengekspor...' : 'Export Excel'}
		</button>
	</div>

	{#if exportError}
		<p class="error">{exportError}</p>
	{/if}

	<div class="tabs">
		<button class="tab-btn" class:active={tab === 'penjualan'} onclick={() => (tab = 'penjualan')}>
			Penjualan
		</button>
		<button class="tab-btn" class:active={tab === 'bon'} onclick={() => (tab = 'bon')}>
			Kas Bon
		</button>
	</div>

	{#if tab === 'penjualan'}
		<div class="summary card">
			<div>
				<div class="summary-label">Total Transaksi</div>
				<div class="summary-value">{daftarPenjualan.length}</div>
			</div>
			<div>
				<div class="summary-label">Total Penjualan</div>
				<div class="summary-value">{formatRupiah(totalPenjualan)}</div>
			</div>
		</div>

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
				{#if loading}
					<tr><td colspan="5" class="action" style="text-align: center;">Memuat data...</td></tr>
				{:else if daftarPenjualan.length === 0}
					<tr><td colspan="5" class="action" style="text-align: center;">Belum ada penjualan</td></tr>
				{:else}
					{#each daftarPenjualan as p (p.id)}
						<tr class="row" onclick={() => toggle(p.id)}>
							<td>{p.tanggal}</td>
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
	{:else}
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
				{#if loading}
					<tr><td colspan="6" class="action" style="text-align: center;">Memuat data...</td></tr>
				{:else if bonAktif.length === 0}
					<tr><td colspan="6" class="action" style="text-align: center;">Tidak ada bon aktif</td></tr>
				{:else}
					{#each bonAktif as bon (bon.id)}
						<tr>
							<td>{bon.namaPengutang}</td>
							<td>{formatTanggal(bon.tanggal)}</td>
							<td>{bon.jatuhTempo ? formatTanggal(bon.jatuhTempo) : '-'}</td>
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
				{#if loading}
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
		margin: 1.5rem 0 0.75rem 0;
	}

	.section-title:first-of-type {
		margin-top: 0;
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
