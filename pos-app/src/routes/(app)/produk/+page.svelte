<script lang="ts">
	import { onMount } from 'svelte';
	import { listBarang, tambahBarang, updateBarang, hapusBarang } from '$lib/db/barang';
	import type { Barang } from '$lib/types';

	type LogEntry = { waktu: string; pesan: string };

	let barangList = $state<Barang[]>([]);
	let loading = $state(true);

	let barcode = $state('');
	let nama = $state('');
	let harga = $state<number | undefined>(undefined);
	let qty = $state<number | undefined>(undefined);
	let editId = $state<number | null>(null);
	let editSebelum = $state<Barang | null>(null);

	let barcodeInput = $state<HTMLInputElement | null>(null);
	let namaInput = $state<HTMLInputElement | null>(null);

	let log = $state<LogEntry[]>([]);
	let formError = $state('');

	function catatLog(pesan: string) {
		const waktu = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		log = [{ waktu, pesan }, ...log].slice(0, 50);
	}

	onMount(async () => {
		barangList = await listBarang();
		loading = false;
	});

	function formatRupiah(n: number) {
		return 'Rp' + n.toLocaleString('id-ID');
	}

	function ringkasPerubahan(
		sebelum: Barang | null,
		sesudah: { nama: string; harga: number; qty: number | null; barcode: string | null }
	): string {
		if (!sebelum) return '';
		const perubahan: string[] = [];

		if (sebelum.nama !== sesudah.nama) {
			perubahan.push(`nama: "${sebelum.nama}" → "${sesudah.nama}"`);
		}
		if (sebelum.harga !== sesudah.harga) {
			perubahan.push(`harga: ${formatRupiah(sebelum.harga)} → ${formatRupiah(sesudah.harga)}`);
		}
		if (sebelum.qty !== sesudah.qty) {
			const lama = sebelum.qty === null ? '-' : sebelum.qty;
			const baru = sesudah.qty === null ? '-' : sesudah.qty;
			perubahan.push(`stok: ${lama} → ${baru}`);
		}
		if (sebelum.barcode !== sesudah.barcode) {
			const lama = sebelum.barcode ?? '-';
			const baru = sesudah.barcode ?? '-';
			perubahan.push(`barcode: ${lama} → ${baru}`);
		}

		return perubahan.length > 0 ? ` (${perubahan.join(', ')})` : ' (tidak ada perubahan)';
	}

	function scanBarcode(event: KeyboardEvent) {
		// scanner USB berperilaku seperti keyboard: ketik cepat lalu tekan Enter
		if (event.key !== 'Enter') return;
		event.preventDefault();

		const kode = barcode.trim();
		if (!kode) return;

		const existing = barangList.find((b) => b.barcode === kode);
		if (existing) {
			edit(existing);
		}

		namaInput?.focus();
	}

	async function simpan(event: Event) {
		event.preventDefault();
		formError = '';

		if (!nama.trim()) {
			formError = 'Nama barang wajib diisi';
			return;
		}
		if (harga === undefined) {
			formError = 'Harga wajib diisi';
			return;
		}
		if (barcode.trim() === '') {
			formError = 'Barcode wajib diisi';
			return;
		}

		const qtyNum = qty === undefined ? null : qty;
		const barcodeVal = barcode.trim();
		const input = { nama: nama.trim(), harga, qty: qtyNum, barcode: barcodeVal };

		if (editId !== null) {
			await updateBarang(editId, input);
			catatLog(`Edit barang ${input.nama}${ringkasPerubahan(editSebelum, input)}`);
		} else {
			await tambahBarang(input);
			catatLog(`Tambah barang ${input.nama}`);
		}

		barangList = await listBarang();
		resetForm();
		barcodeInput?.focus();
	}

	function edit(barang: Barang) {
		editId = barang.id;
		editSebelum = barang;
		barcode = barang.barcode ?? '';
		nama = barang.nama;
		harga = barang.harga;
		qty = barang.qty ?? undefined;
		formError = '';
	}

	async function hapus(id: number) {
		const target = barangList.find((b) => b.id === id);
		await hapusBarang(id);
		barangList = await listBarang();
		if (target) catatLog(`Hapus barang ${target.nama}`);
		if (editId === id) resetForm();
	}

	function resetForm() {
		editId = null;
		editSebelum = null;
		barcode = '';
		nama = '';
		harga = undefined;
		qty = undefined;
		formError = '';
	}
</script>

<div class="produk">
	<div class="side-col">
		<section class="card form-panel">
			<h2>{editId !== null ? 'Edit Barang' : 'Tambah Barang'}</h2>
			<form onsubmit={simpan}>
				<label for="barcode">Barcode <span class="opt required">(wajib, scan atau ketik manual)</span></label>
				<input
					id="barcode"
					bind:value={barcode}
					bind:this={barcodeInput}
					onkeydown={scanBarcode}
					placeholder="Scan barcode di sini..."
					autofocus
				/>

				<label for="nama">Nama Barang</label>
				<input id="nama" bind:value={nama} bind:this={namaInput} placeholder="mis. Beras 5kg" />

				<label for="harga">Harga (Rp) <span class="opt required">(wajib)</span></label>
				<input id="harga" type="number" min="0" bind:value={harga} placeholder="mis. 65000" />

				<label for="qty">Stok / Qty <span class="opt">(opsional)</span></label>
				<input id="qty" type="number" min="0" bind:value={qty} placeholder="kosongkan jika tidak dihitung" />

				{#if formError}
					<p class="error">{formError}</p>
				{/if}

				<div class="form-actions">
					{#if editId !== null}
						<button type="button" onclick={resetForm}>Batal</button>
					{/if}
					<button type="submit" class="primary">{editId !== null ? 'Simpan Perubahan' : 'Tambah Barang'}</button>
				</div>
			</form>
		</section>

		<section class="log-panel card">
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

	<section class="list-panel">
		<h1>Daftar Barang</h1>
		<table>
			<thead>
				<tr>
					<th>Nama Barang</th>
					<th>Barcode</th>
					<th>Harga</th>
					<th>Stok</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr><td colspan="5" class="empty">Memuat data...</td></tr>
				{:else}
					{#each barangList as barang (barang.id)}
						<tr>
							<td>{barang.nama}</td>
							<td class="mono">{barang.barcode ?? '-'}</td>
							<td>{formatRupiah(barang.harga)}</td>
							<td>{barang.qty === null ? '-' : barang.qty}</td>
							<td class="action">
								<button onclick={() => edit(barang)}>Edit</button>
								<button onclick={() => hapus(barang.id)}>Hapus</button>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</section>
</div>

<style>
	.produk {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 1.5rem;
		align-items: start;
	}

	.side-col {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		position: sticky;
		top: 1rem;
	}

	.form-panel {
		padding: 1.25rem;
	}

	.form-panel h2 {
		font-size: 1.05rem;
	}

	form {
		display: flex;
		flex-direction: column;
	}

	label {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0.7rem 0 0.3rem 0;
	}

	.opt {
		font-weight: 400;
		font-size: 0.78rem;
	}

	.opt.required {
		color: var(--danger);
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0.8rem 0 0 0;
	}

	.form-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 1.3rem;
	}

	.form-actions button {
		flex: 1;
	}

	.list-panel h1 {
		font-size: 1.3rem;
	}

	.mono {
		font-family: 'Consolas', 'SF Mono', monospace;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem 0;
	}

	.action {
		text-align: right;
		white-space: nowrap;
	}

	.action button {
		margin-left: 0.4rem;
	}

	.log-panel {
		padding: 1.25rem;
	}

	.log-panel h2 {
		font-size: 0.95rem;
		margin-bottom: 0.75rem;
	}

	.log-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 420px;
		overflow-y: auto;
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
</style>
