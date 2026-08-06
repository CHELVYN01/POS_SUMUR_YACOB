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
