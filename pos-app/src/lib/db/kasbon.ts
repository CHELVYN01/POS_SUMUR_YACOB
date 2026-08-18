import { getDb } from './index';
import type { ItemKasBon, KasBon, PembayaranKasBon } from '$lib/types';
import type { Periode } from '$lib/utils/periode';

type KasBonRow = {
	id: number;
	nama_pengutang: string;
	kasir: string;
	tanggal: string;
	jatuh_tempo: string | null;
	total: number;
	status: 'belum_lunas' | 'lunas';
};

type ItemRow = {
	kasbon_id: number;
	barang_id: number | null;
	nama: string;
	harga: number;
	jumlah: number;
};

type PembayaranRow = {
	id: number;
	kasbon_id: number;
	tanggal: string;
	jumlah: number;
};

/** Sama seperti listPenjualan: `periode` opsional, disaring pakai 'localtime'. */
export async function listKasBon(periode?: Periode): Promise<KasBon[]> {
	const db = await getDb();

	const kasbonRows = await db.select<KasBonRow[]>(
		`SELECT k.id, k.nama_pengutang, u.nama AS kasir, k.tanggal, k.jatuh_tempo, k.total, k.status
		 FROM kasbon k
		 JOIN users u ON u.id = k.kasir_id
		 ${periode ? "WHERE date(k.tanggal, 'localtime') BETWEEN $1 AND $2" : ''}
		 ORDER BY k.status ASC, k.tanggal DESC`,
		periode ? [periode.dari, periode.sampai] : []
	);

	if (kasbonRows.length === 0) return [];

	const ids = kasbonRows.map((k) => k.id).join(',');

	const itemRows = await db.select<ItemRow[]>(
		`SELECT kasbon_id, barang_id, nama, harga, jumlah FROM item_kasbon WHERE kasbon_id IN (${ids})`
	);

	const pembayaranRows = await db.select<PembayaranRow[]>(
		`SELECT id, kasbon_id, tanggal, jumlah FROM pembayaran_kasbon WHERE kasbon_id IN (${ids}) ORDER BY tanggal ASC`
	);

	return kasbonRows.map((k): KasBon => {
		const items: ItemKasBon[] = itemRows
			.filter((i) => i.kasbon_id === k.id)
			.map((i) => ({ barangId: i.barang_id ?? 0, nama: i.nama, harga: i.harga, jumlah: i.jumlah }));

		const pembayaran: PembayaranKasBon[] = pembayaranRows
			.filter((p) => p.kasbon_id === k.id)
			.map((p) => ({ id: p.id, tanggal: p.tanggal, jumlah: p.jumlah }));

		const sudahDibayar = pembayaran.reduce((sum, p) => sum + p.jumlah, 0);

		return {
			id: k.id,
			namaPengutang: k.nama_pengutang,
			kasir: k.kasir,
			tanggal: k.tanggal,
			jatuhTempo: k.jatuh_tempo,
			total: k.total,
			status: k.status,
			items,
			pembayaran,
			sudahDibayar,
			sisa: k.total - sudahDibayar
		};
	});
}

export async function simpanKasBon(input: {
	kasirId: number;
	namaPengutang: string;
	jatuhTempo: string | null;
	items: ItemKasBon[];
}): Promise<number> {
	const db = await getDb();
	const total = input.items.reduce((sum, item) => sum + item.harga * item.jumlah, 0);

	const result = await db.execute(
		'INSERT INTO kasbon (nama_pengutang, kasir_id, jatuh_tempo, total) VALUES ($1, $2, $3, $4)',
		[input.namaPengutang, input.kasirId, input.jatuhTempo, total]
	);
	const kasbonId = result.lastInsertId as number;

	for (const item of input.items) {
		await db.execute(
			'INSERT INTO item_kasbon (kasbon_id, barang_id, nama, harga, jumlah) VALUES ($1, $2, $3, $4, $5)',
			[kasbonId, item.barangId, item.nama, item.harga, item.jumlah]
		);
	}

	return kasbonId;
}

export async function bayarKasBon(kasbonId: number, jumlah: number): Promise<void> {
	const db = await getDb();

	await db.execute('INSERT INTO pembayaran_kasbon (kasbon_id, jumlah) VALUES ($1, $2)', [
		kasbonId,
		jumlah
	]);

	const totalRows = await db.select<{ total: number }[]>('SELECT total FROM kasbon WHERE id = $1', [
		kasbonId
	]);
	const bayarRows = await db.select<{ total: number }[]>(
		'SELECT COALESCE(SUM(jumlah), 0) AS total FROM pembayaran_kasbon WHERE kasbon_id = $1',
		[kasbonId]
	);

	const total = totalRows[0]?.total ?? 0;
	const sudahDibayar = bayarRows[0]?.total ?? 0;

	if (sudahDibayar >= total) {
		await db.execute("UPDATE kasbon SET status = 'lunas' WHERE id = $1", [kasbonId]);
	}
}
