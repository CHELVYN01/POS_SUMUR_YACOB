<script lang="ts">
	import { dummyPenjualan } from '$lib/data/dummy';

	let expanded = $state<number | null>(null);

	let totalHariIni = $derived(dummyPenjualan.reduce((sum, p) => sum + p.total, 0));

	function formatRupiah(n: number) {
		return 'Rp' + n.toLocaleString('id-ID');
	}

	function toggle(id: number) {
		expanded = expanded === id ? null : id;
	}
</script>

<div class="laporan">
	<div class="header">
		<h1>List Penjualan</h1>
		<button disabled title="Belum tersambung ke data asli">Export Excel</button>
	</div>

	<div class="summary card">
		<div>
			<div class="summary-label">Total Transaksi</div>
			<div class="summary-value">{dummyPenjualan.length}</div>
		</div>
		<div>
			<div class="summary-label">Total Penjualan Hari Ini</div>
			<div class="summary-value">{formatRupiah(totalHariIni)}</div>
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
			{#each dummyPenjualan as p (p.id)}
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
		</tbody>
	</table>
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
