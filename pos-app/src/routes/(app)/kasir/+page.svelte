<script lang="ts">
	import { onMount } from 'svelte';
	import { listBarang, cariBarangByBarcode } from '$lib/db/barang';
	import { simpanPenjualan } from '$lib/db/penjualan';
	import { currentUser } from '$lib/stores/session';
	import { tandaiScan } from '$lib/stores/scanStatus';
	import type { Barang, ItemPenjualan } from '$lib/types';

	type LogEntry = { waktu: string; pesan: string };

	let cari = $state('');
	let scan = $state('');
	let cart = $state<ItemPenjualan[]>([]);
	let daftarBarang = $state<Barang[]>([]);
	let membayar = $state(false);
	let showInvoice = $state(false);
	let log = $state<LogEntry[]>([]);
	let scanInput = $state<HTMLInputElement | null>(null);

	function catatLog(pesan: string) {
		const waktu = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		log = [{ waktu, pesan }, ...log].slice(0, 50);
	}

	function refocusScan() {
		if (showInvoice) return;
		const active = document.activeElement;
		const editable = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
		if (!editable) scanInput?.focus();
	}

	onMount(() => {
		listBarang().then((data) => (daftarBarang = data));

		const handler = () => setTimeout(refocusScan, 50);
		document.addEventListener('focusout', handler);
		document.addEventListener('mouseup', handler);

		return () => {
			document.removeEventListener('focusout', handler);
			document.removeEventListener('mouseup', handler);
		};
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
		catatLog(`Tambah ${barang.nama} x1`);
	}

	function tambahJumlah(barangId: number) {
		const existing = cart.find((c) => c.barangId === barangId);
		if (existing) {
			existing.jumlah += 1;
			catatLog(`Tambah ${existing.nama} x1`);
		}
	}

	function kurangi(barangId: number) {
		const existing = cart.find((c) => c.barangId === barangId);
		if (!existing) return;
		existing.jumlah -= 1;
		if (existing.jumlah <= 0) {
			cart = cart.filter((c) => c.barangId !== barangId);
		}
		catatLog(`Kurangi ${existing.nama} x1`);
	}

	function hapus(barangId: number) {
		const existing = cart.find((c) => c.barangId === barangId);
		cart = cart.filter((c) => c.barangId !== barangId);
		if (existing) catatLog(`Hapus ${existing.nama} dari keranjang`);
	}

	function bersihkan() {
		if (cart.length === 0) return;
		cart = [];
		catatLog('Kosongkan keranjang');
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
		if (barang) {
			tambah(barang);
			tandaiScan();
		}
		scan = '';
	}

	async function bayar() {
		if (cart.length === 0 || !$currentUser) return;
		membayar = true;
		try {
			const totalBayar = total;
			await simpanPenjualan($currentUser.id, cart);
			catatLog(`Bayar — total ${formatRupiah(totalBayar)}`);
			cart = [];
		} finally {
			membayar = false;
			showInvoice = false;
		}
	}
</script>

<div class="kasir">
	<section class="panel cart card">
		<form class="scan-row" onsubmit={submitScan}>
			<input
				class="scan-input"
				bind:value={scan}
				bind:this={scanInput}
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
				<button
					class="primary"
					onclick={() => (showInvoice = true)}
					disabled={membayar || cart.length === 0}
				>
					Bayar
				</button>
			</div>
		</div>
	</section>

	<div class="side-col">
		<section class="panel list-panel card">
			<h1>Jual Barang</h1>
			<input class="search" placeholder="Cari barang..." bind:value={cari} />

			<div class="list-table-wrap">
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
			</div>
		</section>

		<section class="panel log-panel card">
			<h2>Log Aktivitas</h2>
			<div class="log-list">
				{#if log.length === 0}
					<p class="empty">Belum ada aktivitas</p>
				{:else}
					{#each log as entry, i (i)}
						<div class="log-entry">
							<span class="log-time">{entry.waktu}</span>
							<span class="log-msg">{entry.pesan}</span>
						</div>
					{/each}
				{/if}
			</div>
		</section>
	</div>
</div>

{#if showInvoice}
	<div
		class="invoice-overlay"
		role="presentation"
		onclick={() => !membayar && (showInvoice = false)}
		onkeydown={(e) => e.key === 'Escape' && !membayar && (showInvoice = false)}
	>
		<div class="invoice-card card" onclick={(e) => e.stopPropagation()}>
			<h2>Invoice</h2>

			<div class="invoice-items">
				{#each cart as item (item.barangId)}
					<div class="invoice-row">
						<span class="invoice-nama">{item.nama} <span class="invoice-jml">x{item.jumlah}</span></span>
						<span>{formatRupiah(item.harga * item.jumlah)}</span>
					</div>
				{/each}
			</div>

			<div class="invoice-total">
				<span>Total</span>
				<span>{formatRupiah(total)}</span>
			</div>

			<div class="invoice-actions">
				<button onclick={() => (showInvoice = false)} disabled={membayar}>Batal</button>
				<button class="primary" onclick={bayar} disabled={membayar}>
					{membayar ? 'Menyimpan...' : 'Konfirmasi Bayar'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.kasir {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 1.5rem;
		height: calc(100vh - 56px - 4rem);
		overflow: hidden;
	}

	.side-col {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		height: 100%;
		min-height: 0;
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

	.list-panel {
		padding: 1.25rem;
		flex: 3;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.list-panel h1 {
		font-size: 1.1rem;
	}

	.search {
		width: 100%;
		margin-bottom: 1rem;
	}

	.list-table-wrap {
		flex: 1;
		overflow-y: auto;
	}

	.log-panel {
		padding: 1.25rem;
		flex: 2;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.log-panel h2 {
		font-size: 0.95rem;
		margin-bottom: 0.75rem;
	}

	.log-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.log-entry {
		display: flex;
		gap: 0.6rem;
		font-size: 0.82rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.log-entry:last-child {
		border-bottom: none;
	}

	.log-time {
		color: var(--text-muted);
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	.log-msg {
		color: var(--text);
	}

	.invoice-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.invoice-card {
		width: 100%;
		max-width: 380px;
		padding: 1.5rem;
	}

	.invoice-card h2 {
		margin: 0 0 1rem 0;
		font-size: 1.1rem;
	}

	.invoice-items {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 40vh;
		overflow-y: auto;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid var(--border);
	}

	.invoice-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.9rem;
		gap: 1rem;
	}

	.invoice-nama {
		color: var(--text);
	}

	.invoice-jml {
		color: var(--text-muted);
	}

	.invoice-total {
		display: flex;
		justify-content: space-between;
		font-weight: 600;
		font-size: 1.2rem;
		padding: 0.9rem 0;
	}

	.invoice-actions {
		display: flex;
		gap: 0.6rem;
	}

	.invoice-actions button {
		flex: 1;
		padding: 0.75em 1em;
		font-size: 1rem;
	}
</style>
