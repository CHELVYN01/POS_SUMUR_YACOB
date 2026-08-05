import { getDb } from './index';
import type { ItemPenjualan, Penjualan } from '$lib/types';

type PenjualanRow = {
	id: number;
	tanggal: string;
	kasir: string;
	total: number;
};

type ItemRow = {
	penjualan_id: number;
	barang_id: number | null;
	nama: string;
	harga: number;
	jumlah: number;
};

export async function listPenjualan(): Promise<Penjualan[]> {
	const db = await getDb();

	const penjualanRows = await db.select<PenjualanRow[]>(
		`SELECT p.id, p.tanggal, u.nama AS kasir, p.total
		 FROM penjualan p
		 JOIN users u ON u.id = p.kasir_id
		 ORDER BY p.tanggal DESC`
	);

	if (penjualanRows.length === 0) return [];

	const itemRows = await db.select<ItemRow[]>(
		`SELECT penjualan_id, barang_id, nama, harga, jumlah FROM item_penjualan
		 WHERE penjualan_id IN (${penjualanRows.map((p) => p.id).join(',')})`
	);

	return penjualanRows.map((p) => ({
		id: p.id,
		tanggal: p.tanggal,
		kasir: p.kasir,
		total: p.total,
		items: itemRows
			.filter((i) => i.penjualan_id === p.id)
			.map(
				(i): ItemPenjualan => ({
					barangId: i.barang_id ?? 0,
					nama: i.nama,
					harga: i.harga,
					jumlah: i.jumlah
				})
			)
	}));
}

export async function simpanPenjualan(kasirId: number, items: ItemPenjualan[]): Promise<number> {
	const db = await getDb();
	const total = items.reduce((sum, item) => sum + item.harga * item.jumlah, 0);

	const result = await db.execute('INSERT INTO penjualan (kasir_id, total) VALUES ($1, $2)', [
		kasirId,
		total
	]);
	const penjualanId = result.lastInsertId as number;

	for (const item of items) {
		await db.execute(
			'INSERT INTO item_penjualan (penjualan_id, barang_id, nama, harga, jumlah) VALUES ($1, $2, $3, $4, $5)',
			[penjualanId, item.barangId, item.nama, item.harga, item.jumlah]
		);
	}

	return penjualanId;
}
