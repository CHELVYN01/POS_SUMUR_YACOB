<script lang="ts">
	import { onMount } from 'svelte';
	import { listBarang, cariBarangByBarcode, kurangiStokBarang } from '$lib/db/barang';
	import { simpanPenjualan } from '$lib/db/penjualan';
	import { currentUser } from '$lib/stores/session';
	import { tandaiScan } from '$lib/stores/scanStatus';
	import { keranjangState, nextKeranjangIdAndIncrement } from '$lib/stores/keranjang.svelte';
	import type { Barang } from '$lib/types';

	type LogEntry = { waktu: string; pesan: string };

	let cari = $state('');
	let scan = $state('');
	let daftarBarang = $state<Barang[]>([]);
	let membayar = $state(false);
	let showInvoice = $state(false);
	let sudahBayar = $state(false);
	let uangDibayar = $state('');
	let ringkasanBayar = $state<{ total: number; kembalian: number } | null>(null);
	let showStokHabis = $state(false);
	let log = $state<LogEntry[]>([]);
	let scanInput = $state<HTMLInputElement | null>(null);
	let uangInput = $state<HTMLInputElement | null>(null);

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

	let activeKeranjang = $derived(keranjangState.list.find((k) => k.id === keranjangState.activeId)!);
	let cart = $derived(activeKeranjang.cart);

	let total = $derived(cart.reduce((sum, item) => sum + item.harga * item.jumlah, 0));
	let uangDibayarNum = $derived(Number(uangDibayar) || 0);
	let kembalian = $derived(uangDibayarNum - total);
	let bayarValid = $derived(uangDibayarNum >= total);
	let adaStokHabis = $derived(
		cart.some((item) => daftarBarang.find((b) => b.id === item.barangId)?.qty === 0)
	);

	function tambah(barang: Barang) {
		const existing = activeKeranjang.cart.find((c) => c.barangId === barang.id);
		if (existing) {
			existing.jumlah += 1;
		} else {
			activeKeranjang.cart.push({
				barangId: barang.id,
				nama: barang.nama,
				harga: barang.harga,
				jumlah: 1
			});
		}
		catatLog(`[${activeKeranjang.nama}] Tambah ${barang.nama} x1`);
	}

	function tambahJumlah(barangId: number) {
		const existing = activeKeranjang.cart.find((c) => c.barangId === barangId);
		if (existing) {
			existing.jumlah += 1;
			catatLog(`[${activeKeranjang.nama}] Tambah ${existing.nama} x1`);
		}
	}

	function kurangi(barangId: number) {
		const existing = activeKeranjang.cart.find((c) => c.barangId === barangId);
		if (!existing) return;
		existing.jumlah -= 1;
		if (existing.jumlah <= 0) {
			activeKeranjang.cart = activeKeranjang.cart.filter((c) => c.barangId !== barangId);
		}
		catatLog(`[${activeKeranjang.nama}] Kurangi ${existing.nama} x1`);
	}

	function hapus(barangId: number) {
		const existing = activeKeranjang.cart.find((c) => c.barangId === barangId);
		activeKeranjang.cart = activeKeranjang.cart.filter((c) => c.barangId !== barangId);
		if (existing) catatLog(`[${activeKeranjang.nama}] Hapus ${existing.nama} dari keranjang`);
	}

	function bersihkan() {
		if (activeKeranjang.cart.length === 0) return;
		activeKeranjang.cart = [];
		catatLog(`[${activeKeranjang.nama}] Kosongkan keranjang`);
	}

	function bukaKeranjangBaru() {
		if (keranjangState.list.length >= 5 || showInvoice) return;
		const id = nextKeranjangIdAndIncrement();
		keranjangState.list.push({ id, nama: `Keranjang ${id}`, cart: [] });
		keranjangState.activeId = id;
	}

	function tutupKeranjang(id: number) {
		if (showInvoice) return;
		keranjangState.list = keranjangState.list.filter((k) => k.id !== id);
		if (keranjangState.list.length === 0) {
			const newId = nextKeranjangIdAndIncrement();
			keranjangState.list.push({ id: newId, nama: `Keranjang ${newId}`, cart: [] });
			keranjangState.activeId = newId;
		} else if (keranjangState.activeId === id) {
			keranjangState.activeId = keranjangState.list[0].id;
		}
	}

	function pindahKeranjang(id: number) {
		if (showInvoice) return;
		keranjangState.activeId = id;
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

	function bukaInvoice() {
		uangDibayar = '';
		sudahBayar = false;
		ringkasanBayar = null;
		showInvoice = true;
		setTimeout(() => uangInput?.focus(), 50);
	}

	function tutupInvoice() {
		const idSelesaiBayar = sudahBayar ? keranjangState.activeId : null;
		showInvoice = false;
		sudahBayar = false;
		uangDibayar = '';
		ringkasanBayar = null;
		if (idSelesaiBayar !== null) tutupKeranjang(idSelesaiBayar);
	}

	function uangPas() {
		uangDibayar = String(total);
		uangInput?.focus();
	}

	function klikBayar() {
		if (adaStokHabis) {
			showStokHabis = true;
			return;
		}
		bayar();
	}

	function lanjutkanMeskiStokHabis() {
		showStokHabis = false;
		bayar();
	}

	async function bayar() {
		if (cart.length === 0 || !$currentUser || !bayarValid) return;
		membayar = true;
		try {
			const totalBayar = total;
			const kembalianAkhir = kembalian;
			const namaKeranjang = activeKeranjang.nama;
			await simpanPenjualan($currentUser.id, cart);
			await kurangiStokBarang(cart.map((item) => ({ barangId: item.barangId, jumlah: item.jumlah })));
			daftarBarang = await listBarang();
			catatLog(
				`[${namaKeranjang}] Bayar — total ${formatRupiah(totalBayar)}, kembalian ${formatRupiah(kembalianAkhir)}`
			);
			activeKeranjang.cart = [];
			ringkasanBayar = { total: totalBayar, kembalian: kembalianAkhir };
			sudahBayar = true;
		} finally {
			membayar = false;
		}
	}
</script>

<div class="kasir">
	<section class="panel cart card">
		<div class="tab-row">
			{#each keranjangState.list as k (k.id)}
				<div class="tab" class:active={k.id === keranjangState.activeId}>
					<button
						type="button"
						class="tab-label"
						disabled={showInvoice}
						onclick={() => pindahKeranjang(k.id)}
					>
						{k.nama}
					</button>
					{#if keranjangState.list.length > 1}
						<button
							type="button"
							class="tab-close"
							disabled={showInvoice}
							onclick={() => tutupKeranjang(k.id)}
						>
							×
						</button>
					{/if}
				</div>
			{/each}
			<button
				type="button"
				class="tab tab-add"
				disabled={keranjangState.list.length >= 5 || showInvoice}
				onclick={bukaKeranjangBaru}
			>
				+
			</button>
		</div>

		<form class="scan-row" onsubmit={submitScan}>
			<input
				class="scan-input"
				bind:value={scan}
				bind:this={scanInput}
				placeholder="Scan barcode atau ketik nama produk..."
				autofocus
			/>
		</form>

		<div class="cart-table-wrap">
			{#if cart.length === 0}
				<p class="empty">Belum ada produk dipilih — scan barcode untuk mulai</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th>Produk</th>
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
				<button class="primary" onclick={bukaInvoice} disabled={membayar || cart.length === 0}>
					Bayar
				</button>
			</div>
		</div>
	</section>

	<div class="side-col">
		<section class="panel list-panel card">
			<h1>Daftar Produk</h1>
			<input class="search" placeholder="Cari produk..." bind:value={cari} />

			<div class="list-table-wrap">
				<table>
					<thead>
						<tr>
							<th>Nama Produk</th>
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
							<tr><td colspan="3" class="empty">Produk tidak ditemukan</td></tr>
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
		onclick={() => !membayar && !sudahBayar && tutupInvoice()}
		onkeydown={(e) => e.key === 'Escape' && !membayar && !sudahBayar && tutupInvoice()}
	>
		<div class="invoice-card card" onclick={(e) => e.stopPropagation()}>
			<h2>Invoice</h2>

			{#if !sudahBayar}
				<div class="invoice-items">
					{#each cart as item (item.barangId)}
						<div class="invoice-row">
							<span class="invoice-nama"
								>{item.nama} <span class="invoice-jml">x{item.jumlah}</span></span
							>
							<span>{formatRupiah(item.harga * item.jumlah)}</span>
						</div>
					{/each}
				</div>

				<div class="invoice-total">
					<span>Total</span>
					<span>{formatRupiah(total)}</span>
				</div>

				<div class="bayar-input-row">
					<label for="uang-dibayar">Uang Dibayar</label>
					<div class="uang-input-wrap">
						<input
							id="uang-dibayar"
							type="number"
							min="0"
							step="500"
							bind:value={uangDibayar}
							bind:this={uangInput}
							placeholder="0"
							disabled={membayar}
						/>
						<button type="button" onclick={uangPas} disabled={membayar}>Uang Pas</button>
					</div>
				</div>

				<div class="invoice-total kembalian" class:kurang={!bayarValid && uangDibayarNum > 0}>
					<span>Kembalian</span>
					<span>{formatRupiah(Math.max(kembalian, 0))}</span>
				</div>
				{#if uangDibayarNum > 0 && !bayarValid}
					<p class="kurang-msg">Uang belum cukup — kurang {formatRupiah(total - uangDibayarNum)}</p>
				{/if}

				<div class="invoice-actions">
					<button onclick={tutupInvoice} disabled={membayar}>Batal</button>
					<button class="primary" onclick={klikBayar} disabled={membayar || !bayarValid}>
						{membayar ? 'Menyimpan...' : 'Konfirmasi Bayar'}
					</button>
				</div>
			{:else if ringkasanBayar}
				<div class="invoice-total">
					<span>Total</span>
					<span>{formatRupiah(ringkasanBayar.total)}</span>
				</div>

				<div class="invoice-total kembalian">
					<span>Kembalian</span>
					<span>{formatRupiah(ringkasanBayar.kembalian)}</span>
				</div>

				<div class="invoice-actions">
					<button class="primary" onclick={tutupInvoice}>Selesai</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if showStokHabis}
	<div class="invoice-overlay" role="presentation">
		<div class="stok-warning-card card">
			<h2>Stok Habis</h2>
			<p>
				Ada produk di keranjang yang stoknya sudah 0. Apakah kamu mau lanjutkan pembayaran?
			</p>
			<div class="invoice-actions">
				<button onclick={() => (showStokHabis = false)}>Batal</button>
				<button class="primary" onclick={lanjutkanMeskiStokHabis}>Lanjutkan Bayar</button>
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

	.tab-row {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.tab {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.2em 0.3em 0.2em 0.2em;
		font-size: 0.85rem;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
	}

	.tab.active {
		background: var(--accent, #2f8a4e);
		border-color: var(--accent, #2f8a4e);
		color: #fff;
	}

	.tab-label {
		padding: 0.3em 0.5em;
		background: transparent;
		border: none;
		color: inherit;
		font-size: inherit;
	}

	.tab-add {
		font-weight: 600;
		padding: 0.4em 0.9em;
	}

	.tab-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.1em;
		height: 1.1em;
		border-radius: 50%;
		font-size: 0.9em;
		line-height: 1;
		border: none;
		background: transparent;
		color: inherit;
	}

	.tab-close:hover {
		background: rgba(0, 0, 0, 0.15);
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

	.invoice-total.kembalian {
		border-top: 1px solid var(--border);
		color: var(--accent, #2f8a4e);
	}

	.invoice-total.kembalian.kurang {
		color: var(--danger, #c0392b);
	}

	.bayar-input-row {
		padding-top: 0.9rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.bayar-input-row label {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.uang-input-wrap {
		display: flex;
		gap: 0.5rem;
	}

	.uang-input-wrap input {
		flex: 1;
		font-size: 1.1rem;
		padding: 0.6em 0.8em;
	}

	.uang-input-wrap button {
		flex-shrink: 0;
		padding: 0 0.9em;
		font-size: 0.85rem;
	}

	.kurang-msg {
		color: var(--danger, #c0392b);
		font-size: 0.82rem;
		margin: -0.4rem 0 0.4rem 0;
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

	.stok-warning-card {
		width: 100%;
		max-width: 380px;
		padding: 1.5rem;
	}

	.stok-warning-card h2 {
		margin: 0 0 0.75rem 0;
		font-size: 1.1rem;
		color: var(--danger, #c0392b);
	}

	.stok-warning-card p {
		margin: 0 0 1.25rem 0;
		color: var(--text);
		font-size: 0.92rem;
		line-height: 1.5;
	}
</style>
