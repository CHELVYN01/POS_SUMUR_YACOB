export type User = {
	id: number;
	nama: string;
	username: string;
	role: 'admin' | 'kasir';
};

export type Barang = {
	id: number;
	nama: string;
	/** Harga jual. */
	harga: number;
	/**
	 * Harga beli/kulakan. `null` berarti BELUM DIISI, bukan gratis — laba barang ini
	 * tidak ikut dihitung sampai angkanya ada. Menyamakannya dengan 0 akan membuat
	 * seluruh harga jualnya terbaca sebagai untung.
	 */
	hargaBeli: number | null;
	qty: number | null;
	barcode: string | null;
	/** `null` = belum dikategorikan. Di laporan muncul sebagai "Tanpa Kategori". */
	kategoriId: number | null;
	/** Nama kategori, ikut dibaca lewat JOIN supaya daftar produk tidak perlu query kedua. */
	kategoriNama: string | null;
};

export type Kategori = {
	id: number;
	nama: string;
	/** Banyaknya produk yang memakai kategori ini — untuk peringatan sebelum dihapus. */
	jumlahProduk: number;
};

export type ItemPenjualan = {
	barangId: number;
	nama: string;
	harga: number;
	/** Harga beli saat transaksi terjadi — disalin, bukan dibaca ulang dari produk. */
	hargaBeli?: number | null;
	/**
	 * Nama kategori saat transaksi terjadi — disalin dengan alasan yang sama seperti
	 * harga beli: memindahkan produk ke kategori lain hari ini tidak boleh mengubah
	 * laporan bulan lalu. `null` = produknya belum berkategori waktu itu.
	 */
	kategori?: string | null;
	jumlah: number;
};

export type Penjualan = {
	id: number;
	tanggal: string;
	kasir: string;
	items: ItemPenjualan[];
	total: number;
};

export type ItemKasBon = {
	barangId: number;
	nama: string;
	harga: number;
	jumlah: number;
};

export type PembayaranKasBon = {
	id: number;
	tanggal: string;
	jumlah: number;
};

export type KasBon = {
	id: number;
	namaPengutang: string;
	kasir: string;
	tanggal: string;
	jatuhTempo: string | null;
	total: number;
	status: 'belum_lunas' | 'lunas';
	items: ItemKasBon[];
	pembayaran: PembayaranKasBon[];
	sudahDibayar: number;
	sisa: number;
};

export type TitikGrafik = {
	/** Kunci mentah dari SQL — "2026-08-18" untuk harian, "14" untuk per jam. */
	kunci: string;
	/** Label pendek yang ditampilkan di sumbu X. */
	label: string;
	nilai: number;
	/** Deret kedua, dipakai grafik bon (nilai = bon baru, nilai2 = bon dibayar). */
	nilai2?: number;
	jumlah?: number;
};

export type Ringkasan = {
	totalPenjualan: number;
	jumlahTransaksi: number;
	rataRata: number;
	bonBaru: number;
	jumlahBon: number;
	bonDibayar: number;
	/** Laba kotor, HANYA dari barang yang harga belinya sudah diisi. */
	labaKotor: number;
	/** Nilai penjualan yang labanya bisa dihitung — penyebut margin. */
	omzetTerhitung: number;
	/** Nilai penjualan yang harga belinya kosong, jadi labanya tidak diketahui. */
	omzetBelumTerhitung: number;
	/** Banyaknya baris transaksi yang harga belinya kosong. */
	barisBelumTerhitung: number;
};

/** Satu baris laporan penjualan per kategori. */
export type PenjualanKategori = {
	/** `null` = baris transaksi yang produknya belum berkategori saat terjual. */
	kategori: string | null;
	totalQty: number;
	totalNilai: number;
	/** `null` = tidak ada baris kategori ini yang punya harga beli, jadi labanya tak diketahui. */
	totalLaba: number | null;
	/** Nilai penjualan yang harga belinya kosong — modal & labanya belum bisa dihitung. */
	nilaiBelumTerhitung: number;
	/** Modal (harga beli x jumlah) dari baris yang harga belinya tercatat. */
	totalModal: number;
};

export type BarangTerjual = {
	nama: string;
	totalQty: number;
	totalNilai: number;
	/** `null` = tidak ada baris produk ini yang punya harga beli, jadi labanya tidak diketahui. */
	totalLaba: number | null;
};
