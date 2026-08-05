<script lang="ts">
	import { onMount } from 'svelte';
	import { listBarang, cariBarangByBarcode } from '$lib/db/barang';
	import { simpanPenjualan } from '$lib/db/penjualan';
	import { currentUser } from '$lib/stores/session';
	import type { Barang, ItemPenjualan } from '$lib/types';

	let cari = $state('');
	let scan = $state('');
	let cart = $state<ItemPenjualan[]>([]);
	let daftarBarang = $state<Barang[]>([]);
	let membayar = $state(false);

	onMount(async () => {
		daftarBarang = await listBarang();
	});

	let barangFiltered = $derived(
		daftarBarang.filter((b) => b.nama.toLowerCase().includes(cari.trim().toLowerCase()))
	);

	let total = $derived(cart.reduce((sum, item) => sum + item.harga * item.jumlah, 0));

	function tambah(barang: Barang) {
		const existing = cart.find((c) => c.barangId === barang.id);
		if (existing) {
			existing.jumlah += 1;
		} else {
			cart.push({ barangId: barang.id, nama: barang.nama, harga: barang.harga, jumlah: 1 });
		}
	}

	function tambahJumlah(barangId: number) {
		const existing = cart.find((c) => c.barangId === barangId);
		if (existing) existing.jumlah += 1;
	}

	function kurangi(barangId: number) {
		const existing = cart.find((c) => c.barangId === barangId);
		if (!existing) return;
		existing.jumlah -= 1;
		if (existing.jumlah <= 0) {
			cart = cart.filter((c) => c.barangId !== barangId);
		}
	}

	function hapus(barangId: number) {
		cart = cart.filter((c) => c.barangId !== barangId);
	}

	function bersihkan() {
		cart = [];
	}

	function formatRupiah(n: number) {
		return 'Rp' + n.toLocaleString('id-ID');
	}

	async function submitScan(event: Event) {
		event.preventDefault();
		const kode = scan.trim();
		if (!kode) return;

		let barang = await cariBarangByBarcode(kode);
		if (!barang) {
			barang = daftarBarang.find((b) => b.nama.toLowerCase() === kode.toLowerCase()) ?? null;
		}
		if (barang) tambah(barang);
		scan = '';
	}

	async function bayar() {
		if (cart.length === 0 || !$currentUser) return;
		membayar = true;
		try {
			await simpanPenjualan($currentUser.id, cart);
			cart = [];
		} finally {
			membayar = false;
		}
	}
</script>

<div class="kasir">
	<section class="panel cart card">
		<form class="scan-row" onsubmit={submitScan}>
			<input
				class="scan-input"
				bind:value={scan}
				placeholder="Scan barcode atau ketik nama barang..."
				autofocus
			/>
		</form>

		<div class="cart-table-wrap">
			{#if cart.length === 0}
				<p class="empty">Belum ada barang dipilih — scan barcode untuk mulai</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th>Barang</th>
							<th>Jml</th>
							<th>Subtotal</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each cart as item (item.barangId)}
							<tr>
								<td>{item.nama}</td>
								<td class="qty">
									<div class="qty-inner">
										<button onclick={() => kurangi(item.barangId)}>-</button>
										<span>{item.jumlah}</span>
										<button onclick={() => tambahJumlah(item.barangId)}>+</button
										>
									</div>
								</td>
								<td>{formatRupiah(item.harga * item.jumlah)}</td>
								<td class="action">
									<button onclick={() => hapus(item.barangId)}>Hapus</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

		<div class="cart-footer">
			<div class="total-row">
				<span>Total</span>
				<span class="total-amount">{formatRupiah(total)}</span>
			</div>

			<div class="cart-actions">
				<button onclick={bersihkan} disabled={membayar}>Kosongkan</button>
				<button class="primary" onclick={bayar} disabled={membayar || cart.length === 0}>
					{membayar ? 'Menyimpan...' : 'Bayar'}
				</button>
			</div>
		</div>
	</section>

	<section class="panel list-panel">
		<h1>Jual Barang</h1>
		<input class="search" placeholder="Cari barang..." bind:value={cari} />

		<table>
			<thead>
				<tr>
					<th>Nama Barang</th>
					<th>Harga</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each barangFiltered as barang (barang.id)}
					<tr>
						<td>{barang.nama}</td>
						<td>{formatRupiah(barang.harga)}</td>
						<td class="action">
							<button onclick={() => tambah(barang)}>+</button>
						</td>
					</tr>
				{/each}
				{#if barangFiltered.length === 0}
					<tr><td colspan="3" class="empty">Barang tidak ditemukan</td></tr>
				{/if}
			</tbody>
		</table>
	</section>
</div>

<style>
	.kasir {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 1.5rem;
		align-items: start;
		height: calc(100vh - 56px - 4rem);
	}

	.cart {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.scan-row {
		margin-bottom: 1rem;
	}

	.scan-input {
		width: 100%;
		font-size: 1.1rem;
		padding: 0.75em 1em;
	}

	.cart-table-wrap {
		flex: 1;
		overflow-y: auto;
	}

	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 2rem 0;
	}

	.action {
		text-align: right;
	}

	.qty-inner {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.qty button {
		padding: 0.2em 0.6em;
	}

	.cart-footer {
		margin-top: auto;
		border-top: 1px solid var(--border);
		padding-top: 0.9rem;
	}

	.total-row {
		display: flex;
		justify-content: space-between;
		font-weight: 600;
		padding: 0 0.25rem;
		font-size: 1.3rem;
	}

	.cart-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 1rem;
	}

	.cart-actions button {
		flex: 1;
		padding: 0.75em 1em;
		font-size: 1rem;
	}

	.list-panel h1 {
		font-size: 1.1rem;
	}

	.search {
		width: 100%;
		margin-bottom: 1rem;
	}
</style>
