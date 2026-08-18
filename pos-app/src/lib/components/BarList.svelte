<script lang="ts">
	import type { BarangTerjual } from '$lib/types';
	import { formatRupiah } from '$lib/utils/format';

	let { data = [] }: { data?: BarangTerjual[] } = $props();

	let maks = $derived(Math.max(1, ...data.map((d) => d.totalQty)));
</script>

{#if data.length === 0}
	<p class="kosong">Belum ada barang terjual</p>
{:else}
	<ul class="bar-list">
		{#each data as d (d.nama)}
			<li>
				<div class="baris">
					<span class="nama" title={d.nama}>{d.nama}</span>
					<span class="qty">{d.totalQty}x</span>
					<span class="nilai">{formatRupiah(d.totalNilai)}</span>
				</div>
				<div class="track">
					<div class="isi" style="width: {(d.totalQty / maks) * 100}%"></div>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.bar-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.baris {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
	}
	.nama {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.qty {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.nilai {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.track {
		height: 6px;
		background: var(--border);
		border-radius: 3px;
		overflow: hidden;
	}
	.isi {
		height: 100%;
		background: var(--accent);
		border-radius: 3px;
	}
	.kosong {
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 1.5rem 0;
		margin: 0;
	}
</style>
