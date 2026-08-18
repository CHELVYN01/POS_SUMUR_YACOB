<script lang="ts">
	import { onMount } from 'svelte';
	import {
		listBarangTerlaris,
		cariBarang,
		cariBarangByBarcode,
		cariStokHabis,
		kurangiStokBarang
	} from '$lib/db/barang';
	import { catatLog as tulisLog, listLog, type LogAktivitas } from '$lib/db/log';
	import { simpanPenjualan } from '$lib/db/penjualan';
	import { currentUser } from '$lib/stores/session';
	import { tandaiScan } from '$lib/stores/scanStatus';
	import { keranjangState, nextKeranjangIdAndIncrement } from '$lib/stores/keranjang.svelte';
	import { manualSaja } from '$lib/scanner';
	import type { Barang, ItemPenjualan } from '$lib/types';
	import { formatRupiah, formatWaktu } from '$lib/utils/format';

	/** daftar pintasan di Kasir — bukan seluruh katalog, sisanya lewat pencarian */
	const JUMLAH_TERLARIS = 30;

	type Struk = {
		nomor: string;
		waktu: string;
		items: ItemPenjualan[];
		total: number;
		tunai: number;
		kembalian: number;
	};

	let cari = $state('');
	let scan = $state('');
	let daftarTerlaris = $state<Barang[]>([]);
	let hasilCari = $state<Barang[]>([]);
	let mencari = $state(false);
	let membayar = $state(false);
	let showInvoice = $state(false);
	let uangDibayar = $state('');
	let struk = $state<Struk | null>(null);
	let showStokHabis = $state(false);
	/** produk stok habis yang sedang ditanyakan sebelum masuk keranjang */
	let konfirmStok = $state<Barang | null>(null);
	/** `keranjangId:barangId` yang stok habisnya sudah disetujui kasir */
	let stokDisetujui = $state<string[]>([]);
	let log = $state<LogAktivitas[]>([]);
	let scanInput = $state<HTMLInputElement | null>(null);
	let uangInput = $state<HTMLInputElement | null>(null);

	async function muatLog() {
		try {
			log = await listLog('kasir');
		} catch (e) {
			console.error('Gagal memuat log:', e);
		}
	}

	async function catatLog(pesan: string) {
		await tulisLog('kasir', pesan, $currentUser);
		await muatLog();
	}

	function refocusScan() {
		// jangan tarik fokus balik selagi ada popup — scan berikutnya harus menunggu
		// kasir menjawab dulu, bukan diam-diam menambah barang di belakang popup
		if (showInvoice || konfirmStok) return;
		const active = document.activeElement;
		const editable = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA';
		if (!editable) scanInput?.focus();
	}

	async function muatTerlaris() {
		daftarTerlaris = await listBarangTerlaris(JUMLAH_TERLARIS);
	}

	onMount(() => {
		muatTerlaris();
		muatLog();

		const handler = () => setTimeout(refocusScan, 50);
		document.addEventListener('focusout', handler);
		document.addEventListener('mouseup', handler);

		return () => {
			document.removeEventListener('focusout', handler);
			document.removeEventListener('mouseup', handler);
		};
	});

	/**
	 * Pencarian dijalankan di SQL supaya menjangkau SELURUH katalog, bukan cuma
	 * menyaring 30 terlaris yang tampil — kalau begitu, produk di luar 30 teratas
	 * mustahil ditemukan kasir. Diberi jeda singkat supaya tiap ketikan tidak
	 * langsung jadi satu query.
	 */
	$effect(() => {
		const kata = cari.trim();
		if (!kata) {
			hasilCari = [];
			mencari = false;
			return;
		}

		let dibatalkan = false;
		mencari = true;
		const timer = setTimeout(async () => {
			try {
				const hasil = await cariBarang(kata);
				if (!dibatalkan) hasilCari = hasil;
			} catch (e) {
				console.error('Pencarian produk gagal:', e);
			} finally {
				if (!dibatalkan) mencari = false;
			}
		}, 180);

		return () => {
			dibatalkan = true;
			clearTimeout(timer);
		};
	});

	let sedangCari = $derived(cari.trim().length > 0);
	let barangTampil = $derived(sedangCari ? hasilCari : daftarTerlaris);

	let activeKeranjang = $derived(keranjangState.list.find((k) => k.id === keranjangState.activeId)!);
	let cart = $derived(activeKeranjang.cart);

	let total = $derived(cart.reduce((sum, item) => sum + item.harga * item.jumlah, 0));
	let uangDibayarNum = $derived(Number(uangDibayar) || 0);
	let kembalian = $derived(uangDibayarNum - total);
	let bayarValid = $derived(uangDibayarNum >= total);

	/** kunci persetujuan stok habis, per keranjang — keranjang lain tanya lagi */
	function kunciStok(barangId: number, keranjangId = keranjangState.activeId) {
		return `${keranjangId}:${barangId}`;
	}

	/**
	 * Peringatan stok habis muncul di sini, saat produknya dipilih — bukan menunggu
	 * sampai kasir menekan Bayar. Pembeli masih di depan meja, jadi masih sempat
	 * diberi tahu barangnya kosong sebelum keranjangnya terlanjur panjang.
	 *
	 * Ditanya sekali saja per produk per keranjang; menambah jumlah produk yang
	 * sudah disetujui tidak memunculkannya lagi.
	 */
	function tambah(barang: Barang) {
		if (barang.qty === 0 && !stokDisetujui.includes(kunciStok(barang.id))) {
			konfirmStok = barang;
			return;
		}
		masukKeranjang(barang);
	}

	function masukKeranjang(barang: Barang, stokHabis = false) {
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
		catatLog(
			`[${activeKeranjang.nama}] Tambah ${barang.nama} x1${stokHabis ? ' (stok habis, dilanjutkan)' : ''}`
		);
	}

	/** baris daftar produk berperan sebagai tombol, jadi Enter/Spasi harus ikut menambah */
	function barisKeydown(event: KeyboardEvent, barang: Barang) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		tambah(barang);
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
		uangDibayar = '';
	}

	function tutupKeranjang(id: number) {
		if (showInvoice) return;
		keranjangState.list = keranjangState.list.filter((k) => k.id !== id);
		// persetujuan stok habis ikut hangus bersama keranjangnya
		stokDisetujui = stokDisetujui.filter((k) => !k.startsWith(`${id}:`));
		uangDibayar = '';
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
		uangDibayar = '';
	}

	async function prosesKode(kode: string) {
		const kunci = kode.trim();
		if (!kunci || konfirmStok) return;

		let barang = await cariBarangByBarcode(kunci);
		if (!barang) {
			// bukan barcode — coba nama persis, dicari ke seluruh katalog lewat SQL
			const kandidat = await cariBarang(kunci, 5);
			barang = kandidat.find((b) => b.nama.toLowerCase() === kunci.toLowerCase()) ?? null;
		}
		if (barang) {
			tambah(barang);
			tandaiScan();
		}
		scan = '';
	}

	async function submitScan(event: Event) {
		event.preventDefault();
		await prosesKode(scan);
	}

	/** scanner nembak ke kolom lain — tarik balik ke kolom scan */
	function alihkanScan(kode: string) {
		if (showInvoice || konfirmStok) return;
		scanInput?.focus();
		prosesKode(kode);
	}

	/** tutup struk — transaksi sudah tersimpan, keranjangnya ikut ditutup */
	function tutupInvoice() {
		if (!showInvoice) return;
		const idSelesaiBayar = keranjangState.activeId;
		showInvoice = false;
		struk = null;
		tutupKeranjang(idSelesaiBayar);
	}

	/** struk ditutup dari keyboard di mana pun fokusnya berada */
	function strukKeydown(event: KeyboardEvent) {
		if (!showInvoice) return;
		if (event.key !== 'Escape' && event.key !== 'Enter') return;
		event.preventDefault();
		tutupInvoice();
	}

	function uangPas() {
		uangDibayar = String(total);
		uangInput?.focus();
	}

	function uangKeydown(event: KeyboardEvent) {
		// Enter dari scanner sudah ditangani manualSaja (defaultPrevented)
		if (event.key !== 'Enter' || event.defaultPrevented) return;
		event.preventDefault();
		if (membayar || cart.length === 0 || !bayarValid) return;
		klikBayar();
	}

	/**
	 * Stok ditanyakan ke DB, bukan dibaca dari daftar yang tampil — daftar itu
	 * sekarang cuma 30 terlaris, jadi produk keranjang bisa saja tidak ada di sana.
	 */
	async function klikBayar() {
		if (cart.length === 0) return;
		try {
			const habis = await cariStokHabis(cart.map((item) => item.barangId));
			// Yang sudah ditanyakan saat masuk keranjang tidak ditanya dua kali. Sisanya
			// tetap dicegat di sini: stok bisa habis setelah produknya masuk keranjang,
			// mis. dijual lewat keranjang lain atau diubah dari halaman Produk.
			const belumDisetujui = habis.filter((id) => !stokDisetujui.includes(kunciStok(id)));
			if (belumDisetujui.length > 0) {
				showStokHabis = true;
				return;
			}
		} catch (e) {
			// gagal memeriksa stok jangan sampai menghalangi pembayaran
			console.error('Gagal memeriksa stok:', e);
		}
		bayar();
	}

	function lanjutkanMeskiStokHabis() {
		showStokHabis = false;
		bayar();
	}

	function setujuiStokHabis() {
		const barang = konfirmStok;
		if (!barang) return;
		stokDisetujui.push(kunciStok(barang.id));
		konfirmStok = null;
		masukKeranjang(barang, true);
		refocusScan();
	}

	function batalkanStokHabis() {
		konfirmStok = null;
		refocusScan();
	}

	async function bayar() {
		if (cart.length === 0 || !$currentUser || !bayarValid) return;
		membayar = true;
		try {
			const totalBayar = total;
			const tunai = uangDibayarNum;
			const kembalianAkhir = kembalian;
			const namaKeranjang = activeKeranjang.nama;
			const items = cart.map((item) => ({ ...item }));

			const penjualanId = await simpanPenjualan($currentUser.id, cart);
			await kurangiStokBarang(cart.map((item) => ({ barangId: item.barangId, jumlah: item.jumlah })));
			// stok & peringkat terlaris ikut berubah setelah transaksi
			await muatTerlaris();
			await catatLog(
				`[${namaKeranjang}] Bayar — total ${formatRupiah(totalBayar)}, kembalian ${formatRupiah(kembalianAkhir)}`
			);

			activeKeranjang.cart = [];
			uangDibayar = '';
			struk = {
				nomor: String(penjualanId).padStart(4, '0'),
				waktu: new Date().toLocaleString('id-ID', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				}),
				items,
				total: totalBayar,
				tunai,
				kembalian: kembalianAkhir
			};
			showInvoice = true;
		} finally {
			membayar = false;
		}
	}
</script>

<svelte:window onkeydown={strukKeydown} />

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
			<div class="bayar-panel">
				<div class="total-row">
					<span>Total</span>
					<span class="total-amount">{formatRupiah(total)}</span>
				</div>

				<div class="panel-sep"></div>

				<div class="bayar-input-row">
					<label for="uang-dibayar">Uang Dibayar</label>
					<div class="uang-input-wrap">
						<button
							type="button"
							class="chip"
							onclick={uangPas}
							disabled={membayar || cart.length === 0}
						>
							Uang Pas
						</button>
						<input
							id="uang-dibayar"
							type="number"
							min="0"
							step="500"
							bind:value={uangDibayar}
							bind:this={uangInput}
							placeholder="0"
							disabled={membayar}
							onkeydown={uangKeydown}
							use:manualSaja={alihkanScan}
						/>
					</div>
				</div>

				<div class="panel-sep"></div>

				<div class="kembalian-row" class:kurang={!bayarValid && uangDibayarNum > 0}>
					<span>Kembalian</span>
					<span>{formatRupiah(Math.max(kembalian, 0))}</span>
				</div>
				{#if uangDibayarNum > 0 && !bayarValid}
					<p class="kurang-msg">Uang belum cukup — kurang {formatRupiah(total - uangDibayarNum)}</p>
				{/if}
			</div>

			<div class="cart-actions">
				<button onclick={bersihkan} disabled={membayar}>Kosongkan</button>
				<button
					class="primary"
					onclick={klikBayar}
					disabled={membayar || cart.length === 0 || !bayarValid}
				>
					{membayar ? 'Menyimpan...' : 'Bayar'}
				</button>
			</div>
		</div>
	</section>

	<div class="side-col">
		<section class="panel list-panel card">
			<div class="list-head">
				<h1>Daftar Produk</h1>
				<span class="list-ket">{sedangCari ? 'Hasil pencarian' : `${JUMLAH_TERLARIS} terlaris`}</span>
			</div>
			<input
				class="search"
				placeholder="Cari nama produk atau barcode..."
				bind:value={cari}
				use:manualSaja={alihkanScan}
			/>

			<div class="list-table-wrap">
				<table>
					<thead>
						<tr>
							<th>Nama Produk</th>
							<th>Harga</th>
						</tr>
					</thead>
					<tbody>
						{#each barangTampil as barang (barang.id)}
							<tr
								class="row-tambah"
								role="button"
								tabindex="0"
								aria-label="Tambah {barang.nama} ke keranjang"
								onclick={() => tambah(barang)}
								onkeydown={(e) => barisKeydown(e, barang)}
							>
								<td>{barang.nama}</td>
								<td>{formatRupiah(barang.harga)}</td>
							</tr>
						{/each}
						{#if barangTampil.length === 0}
							<tr>
								<td colspan="2" class="empty">
									{#if mencari}
										Mencari...
									{:else if sedangCari}
										Produk tidak ditemukan
									{:else}
										Belum ada produk
									{/if}
								</td>
							</tr>
						{/if}
					</tbody>
				</table>
			</div>
		</section>

		<section class="panel log-panel card">
			<div class="list-head">
				<h2>Log Aktivitas</h2>
				<span class="list-ket">24 jam terakhir</span>
			</div>
			<div class="log-list">
				{#if log.length === 0}
					<p class="empty">Belum ada aktivitas</p>
				{:else}
					{#each log as entry (entry.id)}
						<div class="log-entry">
							<span class="log-time">{formatWaktu(entry.waktu)}</span>
							<span class="log-msg">
								{entry.pesan}
								{#if entry.userNama}<span class="log-user">· {entry.userNama}</span>{/if}
							</span>
						</div>
					{/each}
				{/if}
			</div>
		</section>
	</div>
</div>

{#if showInvoice && struk}
	<div
		class="invoice-overlay"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && tutupInvoice()}
	>
		<div class="invoice-card card" role="dialog" aria-modal="true" aria-label="Invoice">
			<div class="invoice-head">
				<h2>Invoice</h2>
				<span class="invoice-meta">#{struk.nomor} · {struk.waktu}</span>
			</div>

			<div class="invoice-items">
				{#each struk.items as item (item.barangId)}
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
				<span>{formatRupiah(struk.total)}</span>
			</div>

			<div class="invoice-sub">
				<span>Tunai</span>
				<span>{formatRupiah(struk.tunai)}</span>
			</div>

			<div class="invoice-total kembalian">
				<span>Kembalian</span>
				<span>{formatRupiah(struk.kembalian)}</span>
			</div>

			<div class="invoice-actions">
				<button class="primary" onclick={tutupInvoice}>Selesai</button>
			</div>
		</div>
	</div>
{/if}

{#if konfirmStok}
	<div class="invoice-overlay" role="presentation">
		<div class="stok-warning-card card">
			<h2>Stok Habis</h2>
			<p>
				Stok <strong>{konfirmStok.nama}</strong> sudah 0. Tetap masukkan ke keranjang?
			</p>
			<div class="invoice-actions">
				<button onclick={batalkanStokHabis}>Batal</button>
				<button class="primary" onclick={setujuiStokHabis}>Tetap Tambahkan</button>
			</div>
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
		min-height: 0;
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
		/* Tanpa min-height:0 flex item tidak boleh menyusut di bawah tinggi isinya,
		   jadi daftar keranjang yang panjang memanjangkan kotaknya (bukan menggulung)
		   dan mendorong .cart-footer — Total, Uang Dibayar, tombol Bayar — keluar
		   layar, lalu terpotong .kasir { overflow: hidden }. */
		min-height: 0;
		overflow-y: auto;
	}

	/* header tabel tetap terlihat saat daftar keranjang digulung */
	.cart-table-wrap th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--surface);
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
		/* jangan ikut menyusut saat keranjang penuh — ini bagian yang wajib terlihat */
		flex-shrink: 0;
		border-top: 1px solid var(--border);
		padding-top: 0.9rem;
	}

	/* panel ringkasan bayar — nempel kanan, label & nominal dua kolom rata kanan */
	.bayar-panel {
		margin-left: auto;
		width: min(290px, 100%);
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		justify-items: end;
		column-gap: 0.75rem;
		row-gap: 0.45rem;
		background: transparent;
		border: none;
		padding: 0.2rem 0.25rem 0 0.25rem;
	}

	.panel-sep {
		grid-column: 1 / -1;
		width: 100%;
		height: 1px;
		background: var(--border);
	}

	/* display:contents — barisnya lebur jadi sel grid, tapi style tetap diwarisi */
	.total-row {
		display: contents;
		font-weight: 600;
		font-size: 1.05rem;
		font-variant-numeric: tabular-nums;
	}

	/* label rata kiri, nominal rata kanan */
	.total-row > span:first-child,
	.kembalian-row > span:first-child,
	.bayar-input-row > label {
		justify-self: start;
	}

	/* disamakan dengan inset teks di dalam input (border 1px + padding 0.6rem) */
	.total-amount,
	.kembalian-row span:last-child {
		padding-right: 0.65rem;
	}

	.kembalian-row {
		display: contents;
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--accent);
		font-variant-numeric: tabular-nums;
	}

	.kembalian-row.kurang {
		color: var(--danger);
	}

	.kembalian-row.kurang {
		color: var(--danger, #c0392b);
	}

	.cart-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 0.9rem;
	}

	.cart-actions button {
		flex: 1;
		padding: 0.6em 1em;
		font-size: 0.9rem;
	}

	/* tombol utama dibikin dominan */
	.cart-actions button.primary {
		flex: 2;
		font-weight: 600;
	}

	.cart-actions button:disabled {
		opacity: 0.55;
		cursor: default;
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

	.list-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.list-head h1,
	.list-head h2 {
		margin-bottom: 0.5rem;
	}

	.list-ket {
		font-size: 0.75rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.search {
		width: 100%;
		margin-bottom: 1rem;
	}

	.list-table-wrap {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.list-table-wrap th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--surface);
	}

	.row-tambah {
		cursor: pointer;
		/* klik cepat berturut-turut jangan menyeleksi teks barisnya */
		user-select: none;
	}

	.row-tambah:hover,
	.row-tambah:focus-visible {
		background: var(--bg);
		outline: none;
	}

	.row-tambah:active {
		/* umpan balik singkat bahwa kliknya masuk — barisnya tidak berubah tampak lain */
		opacity: 0.65;
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
		min-height: 0;
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

	.log-user {
		color: var(--text-muted);
		white-space: nowrap;
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

	.invoice-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.invoice-card h2 {
		margin: 0;
		font-size: 1.1rem;
	}

	.invoice-meta {
		font-size: 0.78rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.invoice-sub {
		display: flex;
		justify-content: space-between;
		font-size: 0.95rem;
		color: var(--text-muted);
		padding-bottom: 0.3rem;
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

	.bayar-input-row {
		display: contents;
	}

	.bayar-input-row label {
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	/* tombol ditaruh sebelum input supaya angka input lurus dengan Total & Kembalian */
	.uang-input-wrap {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
	}

	.uang-input-wrap input {
		flex: 1;
		min-width: 0;
		font-size: 0.95rem;
		padding: 0.4em 0.6rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
		/* panah spinner bikin angka nggak lurus dengan Total & Kembalian */
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.uang-input-wrap input::-webkit-outer-spin-button,
	.uang-input-wrap input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.uang-input-wrap button.chip {
		flex-shrink: 0;
		padding: 0.35em 0.6em;
		font-size: 0.72rem;
		color: var(--text-muted);
		background: transparent;
	}

	.uang-input-wrap button.chip:hover:not(:disabled) {
		background: var(--bg);
		color: var(--text);
	}

	.uang-input-wrap button.chip:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.kurang-msg {
		grid-column: 1 / -1;
		color: var(--danger);
		font-size: 0.75rem;
		text-align: right;
		padding-right: 0.65rem;
		margin: -0.2rem 0 0 0;
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
