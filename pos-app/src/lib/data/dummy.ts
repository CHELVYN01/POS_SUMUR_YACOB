import type { User, Barang, Penjualan } from '$lib/types';

export const dummyUsers: User[] = [
	{ id: 1, nama: 'Yacob', username: 'admin', role: 'admin' },
	{ id: 2, nama: 'Siti', username: 'siti', role: 'kasir' },
	{ id: 3, nama: 'Budi', username: 'budi', role: 'kasir' }
];

export const dummyBarang: Barang[] = [
	{ id: 1, nama: 'Beras 5kg', harga: 65000, qty: 20, barcode: '8991002100017' },
	{ id: 2, nama: 'Minyak Goreng 1L', harga: 18000, qty: 30, barcode: '8991002100024' },
	{ id: 3, nama: 'Gula Pasir 1kg', harga: 16000, qty: 25, barcode: '8991002100031' },
	{ id: 4, nama: 'Telur Ayam 1kg', harga: 28000, qty: 15, barcode: null },
	{ id: 5, nama: 'Kopi Sachet', harga: 2000, qty: null, barcode: '8991002100048' },
	{ id: 6, nama: 'Mie Instan', harga: 3500, qty: 50, barcode: '8991002100055' },
	{ id: 7, nama: 'Air Mineral 600ml', harga: 4000, qty: 40, barcode: '8991002100062' },
	{ id: 8, nama: 'Sabun Mandi', harga: 5000, qty: 12, barcode: null }
];

export const dummyPenjualan: Penjualan[] = [
	{
		id: 1,
		tanggal: '2026-08-06 08:15',
		kasir: 'Siti',
		items: [
			{ barangId: 1, nama: 'Beras 5kg', harga: 65000, jumlah: 1 },
			{ barangId: 2, nama: 'Minyak Goreng 1L', harga: 18000, jumlah: 2 }
		],
		total: 101000
	},
	{
		id: 2,
		tanggal: '2026-08-06 09:40',
		kasir: 'Budi',
		items: [{ barangId: 6, nama: 'Mie Instan', harga: 3500, jumlah: 5 }],
		total: 17500
	},
	{
		id: 3,
		tanggal: '2026-08-06 10:05',
		kasir: 'Siti',
		items: [
			{ barangId: 7, nama: 'Air Mineral 600ml', harga: 4000, jumlah: 3 },
			{ barangId: 5, nama: 'Kopi Sachet', harga: 2000, jumlah: 4 }
		],
		total: 20000
	}
];
