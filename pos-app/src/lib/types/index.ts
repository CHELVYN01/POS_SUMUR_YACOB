export type User = {
	id: number;
	nama: string;
	username: string;
	role: 'admin' | 'kasir';
};

export type Barang = {
	id: number;
	nama: string;
	harga: number;
	qty: number | null;
	barcode: string | null;
};

export type ItemPenjualan = {
	barangId: number;
	nama: string;
	harga: number;
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
};

export type BarangTerjual = {
	nama: string;
	totalQty: number;
	totalNilai: number;
};
