<script lang="ts">
	import { onMount } from 'svelte';
	import { listBarang } from '$lib/db/barang';
	import { listKasBon, simpanKasBon, bayarKasBon } from '$lib/db/kasbon';
	import { currentUser } from '$lib/stores/session';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import type { Barang, ItemKasBon, KasBon } from '$lib/types';

	let cari = $state('');
	let cart = $state<ItemKasBon[]>([]);
	let daftarBarang = $state<Barang[]>([]);
	let daftarKasBon = $state<KasBon[]>([]);
	let loading = $state(true);
	let menyimpan = $state(false);

	let namaPengutang = $state('');
	let jatuhTempo = $state('');
	let formError = $state('');

	let dialogTambahEl = $state<HTMLDialogElement | null>(null);
	let dialogBayarEl = $state<HTMLDialogElement | null>(null);
	let kasbonAktif = $state<KasBon | null>(null);
	let jumlahBayar = $state('');
	let bayarError = $state('');
	let membayar = $state(false);

	onMount(async () => {
		daftarBarang = await listBarang();
		daftarKasBon = await listKasBon();
		loading = false;
	});

	let barangFiltered = $derived(
		daftarBarang.filter((b) => b.nama.toLowerCase().includes(cari.trim().toLowerCase()))
	);

	let total = $derived(cart.reduce((sum, item) => sum + item.harga * item.jumlah, 0));

	let bonAktif = $derived(daftarKasBon.filter((k) => k.status === 'belum_lunas'));
	let bonLunas = $derived(daftarKasBon.filter((k) => k.status === 'lunas'));

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

	function bukaTambah() {
		cari = '';
		cart = [];
		namaPengutang = '';
		jatuhTempo = '';
		formError = '';
		dialogTambahEl?.showModal();
	}

	function tutupTambah() {
		dialogTambahEl?.close();
	}

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

	async function konfirmasiBon(event: Event) {
		event.preventDefault();
		formError = '';

		if (!namaPengutang.trim()) {
			formError = 'Nama pengutang wajib diisi';
			return;
		}
		if (cart.length === 0) {
			formError = 'Pilih minimal satu produk';
			return;
		}
		if (!$currentUser) {
			formError = 'Sesi login tidak ditemukan — silakan login ulang';
			return;
		}

		menyimpan = true;
		try {
			await simpanKasBon({
				kasirId: $currentUser.id,
				namaPengutang: namaPengutang.trim(),
				jatuhTempo: jatuhTempo || null,
				items: cart
			});
			daftarKasBon = await listKasBon();
			tutupTambah();
		} finally {
			menyimpan = false;
		}
	}

	function bukaBayar(kasbon: KasBon) {
		kasbonAktif = kasbon;
		jumlahBayar = '';
		bayarError = '';
		dialogBayarEl?.showModal();
	}

	function tutupBayar() {
		dialogBayarEl?.close();
		kasbonAktif = null;
	}

	async function submitBayar(event: Event) {
		event.preventDefault();
		bayarError = '';
		if (!kasbonAktif) return;

		const jumlah = Number(jumlahBayar);
		if (!jumlah || jumlah <= 0) {
			bayarError = 'Jumlah bayar harus lebih dari 0';
			return;
		}
		if (jumlah > kasbonAktif.sisa) {
			bayarError = `Maksimal ${formatRupiah(kasbonAktif.sisa)} (sisa utang)`;
			return;
		}

		membayar = true;
		try {
			await bayarKasBon(kasbonAktif.id, jumlah);
			daftarKasBon = await listKasBon();
			tutupBayar();
		} finally {
			membayar = false;
		}
	}
</script>

<div class="kasbon-page">
	<div class="page-header">
		<h1>Kas Bon</h1>
		<button class="primary" onclick={bukaTambah}>+ Tambah Bon</button>
	</div>

	<section class="card daftar-bon">
		{#if loading}
			<p class="empty">Memuat data...</p>
		{:else}
			<h3>Belum Lunas ({bonAktif.length})</h3>
			{#if bonAktif.length === 0}
				<p class="empty">Tidak ada bon aktif</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th>Pengutang</th>
							<th>Tanggal</th>
							<th>Jatuh Tempo</th>
							<th>Total</th>
							<th>Sudah Dibayar</th>
							<th>Sisa</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each bonAktif as bon (bon.id)}
							<tr>
								<td>{bon.namaPengutang}</td>
								<td>{formatTanggal(bon.tanggal)}</td>
								<td>{bon.jatuhTempo ? formatTanggal(bon.jatuhTempo) : '-'}</td>
								<td>{formatRupiah(bon.total)}</td>
								<td>{formatRupiah(bon.sudahDibayar)}</td>
								<td class="sisa">{formatRupiah(bon.sisa)}</td>
								<td class="action">
									<button onclick={() => bukaBayar(bon)}>Bayar</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

			<h3>Lunas ({bonLunas.length})</h3>
			{#if bonLunas.length === 0}
				<p class="empty">Belum ada bon lunas</p>
			{:else}
				<table>
					<thead>
						<tr>
							<th>Pengutang</th>
							<th>Tanggal</th>
							<th>Total</th>
						</tr>
					</thead>
					<tbody>
						{#each bonLunas as bon (bon.id)}
							<tr>
								<td>{bon.namaPengutang}</td>
								<td>{formatTanggal(bon.tanggal)}</td>
								<td>{formatRupiah(bon.total)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		{/if}
	</section>
</div>

<dialog bind:this={dialogTambahEl} class="dialog-tambah" onclose={() => (cart = [])}>
	<form class="bon-form" onsubmit={konfirmasiBon}>
		<h2>Tambah Kas Bon</h2>

		<div class="form-row">
			<div class="field">
				<label for="nama-pengutang">Nama Pengutang</label>
				<input id="nama-pengutang" bind:value={namaPengutang} placeholder="mis. Budi" autofocus />
			</div>
			<div class="field">
				<label for="jatuh-tempo">Tanggal Bayar (opsional)</label>
				<DatePicker id="jatuh-tempo" bind:value={jatuhTempo} placeholder="Pilih tanggal" />
			</div>
		</div>

		<div class="pilih-barang">
			<input class="search" placeholder="Cari produk..." bind:value={cari} />
			<div class="barang-list-wrap">
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
									<button type="button" onclick={() => tambah(barang)}>+</button>
								</td>
							</tr>
						{/each}
						{#if barangFiltered.length === 0}
							<tr><td colspan="3" class="empty">Produk tidak ditemukan</td></tr>
						{/if}
					</tbody>
				</table>
			</div>
		</div>

		<div class="cart-table-wrap">
			{#if cart.length === 0}
				<p class="empty">Belum ada produk dipilih</p>
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
										<button type="button" onclick={() => kurangi(item.barangId)}>-</button>
										<span>{item.jumlah}</span>
										<button type="button" onclick={() => tambahJumlah(item.barangId)}>+</button>
									</div>
								</td>
								<td>{formatRupiah(item.harga * item.jumlah)}</td>
								<td class="action">
									<button type="button" onclick={() => hapus(item.barangId)}>Hapus</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

		{#if formError}
			<p class="error">{formError}</p>
		{/if}

		<div class="dialog-footer">
			<div class="total-row">
				<span>Total</span>
				<span class="total-amount">{formatRupiah(total)}</span>
			</div>
			<div class="dialog-actions">
				<button type="button" onclick={tutupTambah} disabled={menyimpan}>Batal</button>
				<button type="submit" class="primary" disabled={menyimpan}>
					{menyimpan ? 'Menyimpan...' : 'Konfirmasi Bon'}
				</button>
			</div>
		</div>
	</form>
</dialog>

<dialog bind:this={dialogBayarEl} onclose={() => (kasbonAktif = null)}>
	{#if kasbonAktif}
		<form onsubmit={submitBayar}>
			<h2>Bayar Kas Bon — {kasbonAktif.namaPengutang}</h2>
			<p class="dialog-info">Sisa utang: <strong>{formatRupiah(kasbonAktif.sisa)}</strong></p>

			<label for="jumlah-bayar">Jumlah Bayar</label>
			<input
				id="jumlah-bayar"
				type="number"
				min="1"
				max={kasbonAktif.sisa}
				bind:value={jumlahBayar}
				placeholder="mis. 20000"
				autofocus
			/>
			<button
				type="button"
				class="lunas-btn"
				onclick={() => (jumlahBayar = String(kasbonAktif?.sisa ?? ''))}
			>
				Bayar Lunas ({formatRupiah(kasbonAktif.sisa)})
			</button>

			{#if bayarError}
				<p class="error">{bayarError}</p>
			{/if}

			<div class="dialog-actions">
				<button type="button" onclick={tutupBayar}>Batal</button>
				<button type="submit" class="primary" disabled={membayar}>
					{membayar ? 'Menyimpan...' : 'Konfirmasi Bayar'}
				</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.kasbon-page {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.page-header h1 {
		font-size: 1.3rem;
		margin: 0;
	}

	.daftar-bon {
		padding: 1.25rem;
	}

	.daftar-bon h3 {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin: 0 0 0.75rem 0;
	}

	.daftar-bon h3:not(:first-child) {
		margin-top: 1.5rem;
	}

	.sisa {
		font-weight: 600;
	}

	.empty {
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem 0;
	}

	.action {
		text-align: right;
	}

	.error {
		color: var(--danger);
		font-size: 0.85rem;
		margin: 0.6rem 0 0 0;
	}

	dialog {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0;
		background: var(--surface);
		color: var(--text);
		width: 100%;
		max-width: 360px;
	}

	dialog.dialog-tambah {
		max-width: 640px;
	}

	dialog::backdrop {
		background: rgba(0, 0, 0, 0.35);
	}

	dialog form {
		display: flex;
		flex-direction: column;
		padding: 1.5rem;
	}

	dialog h2 {
		margin: 0 0 1.1rem 0;
		font-size: 1.05rem;
	}

	.bon-form .form-row {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.field {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.field label {
		font-size: 0.85rem;
		color: var(--text-muted);
	}


	.pilih-barang {
		margin-bottom: 1rem;
	}

	.search {
		width: 100%;
		margin-bottom: 0.6rem;
	}

	.barang-list-wrap {
		max-height: 160px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.barang-list-wrap table {
		margin: 0;
	}

	.cart-table-wrap {
		max-height: 180px;
		overflow-y: auto;
		margin-bottom: 0.5rem;
	}

	.qty-inner {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.qty button {
		padding: 0.2em 0.6em;
	}

	.dialog-footer {
		border-top: 1px solid var(--border);
		padding-top: 0.9rem;
		margin-top: 0.5rem;
	}

	.total-row {
		display: flex;
		justify-content: space-between;
		font-weight: 600;
		padding: 0 0.25rem 0.9rem 0.25rem;
		font-size: 1.2rem;
	}

	dialog label {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0 0 0.3rem 0;
	}

	.dialog-info {
		margin: 0 0 1.1rem 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.lunas-btn {
		margin-top: 0.6rem;
		font-size: 0.85rem;
	}

	.dialog-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 0.5rem;
	}

	.dialog-actions button {
		flex: 1;
	}
</style>
