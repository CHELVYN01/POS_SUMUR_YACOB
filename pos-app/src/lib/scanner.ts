import type { Action } from 'svelte/action';

/**
 * Satu halaman = satu kolom scan.
 *
 * Scanner USB berperilaku seperti keyboard: mengetik sangat cepat lalu menekan
 * Enter. Kalau fokus kebetulan ada di kolom lain (mis. "Cari produk" atau
 * "Nama Produk"), barcode-nya nyasar ke situ — inilah sumber scan dobel.
 *
 * Action `manualSaja` dipasang di kolom-kolom yang HANYA untuk ketik manual.
 * Kalau kolom itu menerima ketikan secepat scanner yang diakhiri Enter, isinya
 * dikembalikan seperti semula dan kodenya dialihkan ke kolom scan halaman.
 *
 * Deteksinya dua lapis, karena lapis pertama saja pernah meleset:
 *   1. burst cepat — jeda antar karakter di bawah ambang manusia (barcode apa pun,
 *      termasuk yang beralfabet);
 *   2. deret angka panjang — apa pun kecepatannya. Ini yang menangkap scan tersendat
 *      saat app sedang sibuk, yang dulu lolos dan berakhir nempel di Nama Produk.
 */

/** rata-rata jarak antar karakter dari scanner USB, manusia jauh lebih lambat dari ini */
const JEDA_MAX_MS = 50;
/**
 * Enter penutup boleh lebih lambat dari karakter biasa: sebagian scanner menahan
 * terminator sesaat. Dulu ambangnya disamakan dengan JEDA_MAX_MS, dan itulah sebab
 * scan "kadang" lolos ke kolom nama produk — burst-nya dinilai ketikan manual.
 */
const JEDA_ENTER_MS = 200;
/** barcode terpendek yang masuk akal — di bawah ini dianggap ketikan manual */
const PANJANG_MIN = 4;
/**
 * Jaring pengaman kedua, tanpa lihat kecepatan sama sekali: deretan angka sepanjang
 * ini praktis cuma datang dari scanner (EAN-13 / UPC-12). Deteksi berbasis kecepatan
 * saja bisa meleset kalau app sedang sibuk (mis. habis memuat produk untuk diedit),
 * dan barcode-nya berakhir nempel di kolom Nama Produk.
 *
 * Ambangnya sengaja 12, bukan 8: harga 8 digit (Rp10.000.000) masih wajar diketik
 * manual, sedangkan angka 12 digit di kolom harga/stok tidak masuk akal.
 */
const PANJANG_DIGIT_MIN = 12;
/** jeda yang memutus deret angka — scanner mengirim seluruh barcode jauh di bawah ini */
const JEDA_DERET_MS = 1000;
/**
 * Tombol yang tidak menghasilkan karakter tapi memang dikirim scanner di tengah
 * burst — Shift dipakai untuk huruf kapital pada barcode alfanumerik. Sebelumnya
 * tombol seperti ini me-reset buffer, sehingga barcode berhuruf besar tidak pernah
 * terdeteksi sebagai scan sama sekali.
 */
const TOMBOL_DIABAIKAN = new Set(['Shift', 'CapsLock', 'AltGraph', 'Dead', 'Process', 'Unidentified']);

export type AlihkanScan = (kode: string) => void;

export const manualSaja: Action<HTMLInputElement, AlihkanScan> = (node, alihkan) => {
	let handler = alihkan;
	let buffer = '';
	let nilaiSebelum = node.value;
	let waktuMulai = 0;
	let waktuTerakhir = 0;

	/**
	 * Deretan angka berurutan yang baru diketik, terlepas dari kecepatannya. Buffer di
	 * atas di-reset tiap ada jeda lambat, jadi ia buta terhadap scan yang tersendat —
	 * runtutan angka ini yang menangkapnya.
	 */
	let deretAngka = '';
	let nilaiSebelumDeret = node.value;

	function reset() {
		buffer = '';
		waktuMulai = 0;
		waktuTerakhir = 0;
		deretAngka = '';
	}

	/**
	 * Menilai seluruh burst, bukan cuma jeda terakhir. Satu karakter yang kebetulan
	 * telat (mis. saat app sedang sibuk) tidak lagi membatalkan deteksi.
	 */
	function rataJeda() {
		if (buffer.length < 2) return Infinity;
		return (waktuTerakhir - waktuMulai) / (buffer.length - 1);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.ctrlKey || event.altKey || event.metaKey) {
			reset();
			return;
		}

		const now = performance.now();

		if (event.key === 'Enter') {
			const burst =
				buffer.length >= PANJANG_MIN &&
				now - waktuTerakhir <= JEDA_ENTER_MS &&
				rataJeda() <= JEDA_MAX_MS;

			// isi kolom dikembalikan ke keadaan sebelum bagian yang dianggap barcode masuk
			const kode = burst ? buffer : deretAngka;
			const pulihkan = burst ? nilaiSebelum : nilaiSebelumDeret;
			const scan = burst || deretAngka.length >= PANJANG_DIGIT_MIN;
			reset();
			if (!scan) return;

			// bukan ketikan user — kembalikan isi kolom, lalu alihkan ke kolom scan
			event.preventDefault();
			node.value = pulihkan;
			node.dispatchEvent(new Event('input', { bubbles: true }));
			handler(kode);
			return;
		}

		if (TOMBOL_DIABAIKAN.has(event.key)) return;

		if (event.key.length !== 1) {
			reset();
			return;
		}

		if (event.key >= '0' && event.key <= '9') {
			if (now - waktuTerakhir > JEDA_DERET_MS) deretAngka = '';
			// catat isi kolom di awal deret, sebelum angka pertama masuk
			if (deretAngka === '') nilaiSebelumDeret = node.value;
			deretAngka += event.key;
		} else {
			deretAngka = '';
		}

		if (now - waktuTerakhir > JEDA_MAX_MS) {
			// awal burst baru — catat isi kolom sebelum "kotor"
			buffer = '';
			nilaiSebelum = node.value;
			waktuMulai = now;
		}
		buffer += event.key;
		waktuTerakhir = now;
	}

	node.addEventListener('keydown', onKeydown);

	return {
		update(alihkanBaru: AlihkanScan) {
			handler = alihkanBaru;
		},
		destroy() {
			node.removeEventListener('keydown', onKeydown);
		}
	};
};
