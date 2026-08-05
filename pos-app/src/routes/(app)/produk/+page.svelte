<script lang="ts">
	import { dummyBarang } from '$lib/data/dummy';
	import type { Barang } from '$lib/types';

	let barangList = $state<Barang[]>([...dummyBarang]);

	let barcode = $state('');
	let nama = $state('');
	let harga = $state('');
	let qty = $state('');
	let editId = $state<number | null>(null);

	let barcodeInput = $state<HTMLInputElement | null>(null);
	let namaInput = $state<HTMLInputElement | null>(null);

	function formatRupiah(n: number) {
		return 'Rp' + n.toLocaleString('id-ID');
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

	function simpan(event: Event) {
		event.preventDefault();
		if (!nama.trim() || !harga) return;

		const hargaNum = Number(harga);
		const qtyNum = qty.trim() === '' ? null : Number(qty);
		const barcodeVal = barcode.trim() === '' ? null : barcode.trim();

		if (editId !== null) {
			barangList = barangList.map((b) =>
				b.id === editId
					? { ...b, nama: nama.trim(), harga: hargaNum, qty: qtyNum, barcode: barcodeVal }
					: b
			);
		} else {
			const nextId = Math.max(0, ...barangList.map((b) => b.id)) + 1;
			barangList = [
				...barangList,
				{ id: nextId, nama: nama.trim(), harga: hargaNum, qty: qtyNum, barcode: barcodeVal }
			];
		}

		resetForm();
		barcodeInput?.focus();
	}

	function edit(barang: Barang) {
		editId = barang.id;
		barcode = barang.barcode ?? '';
		nama = barang.nama;
		harga = String(barang.harga);
		qty = barang.qty === null ? '' : String(barang.qty);
	}

	function hapus(id: number) {
		barangList = barangList.filter((b) => b.id !== id);
		if (editId === id) resetForm();
	}

	function resetForm() {
		editId = null;
		barcode = '';
		nama = '';
		harga = '';
		qty = '';
	}
</script>

<div class="produk">
	<section class="card form-panel">
		<h2>{editId !== null ? 'Edit Barang' : 'Tambah Barang'}</h2>
		<form onsubmit={simpan}>
			<label for="barcode">Barcode <span class="opt">(scan atau ketik manual)</span></label>
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

			<label for="harga">Harga (Rp)</label>
			<input id="harga" type="number" min="0" bind:value={harga} placeholder="mis. 65000" />

			<label for="qty">Stok / Qty <span class="opt">(opsional)</span></label>
			<input id="qty" type="number" min="0" bind:value={qty} placeholder="kosongkan jika tidak dihitung" />

			<div class="form-actions">
				{#if editId !== null}
					<button type="button" onclick={resetForm}>Batal</button>
				{/if}
				<button type="submit" class="primary">{editId !== null ? 'Simpan Perubahan' : 'Tambah Barang'}</button>
			</div>
		</form>
	</section>

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

	.form-panel {
		padding: 1.25rem;
		position: sticky;
		top: 1rem;
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

	.action {
		text-align: right;
		white-space: nowrap;
	}

	.action button {
		margin-left: 0.4rem;
	}
</style>
