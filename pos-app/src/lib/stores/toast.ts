import { writable } from 'svelte/store';

export type JenisToast = 'info' | 'sukses' | 'error';
export type Toast = { id: number; jenis: JenisToast; pesan: string };

const DURASI_MS = 3500;

let urutan = 0;
const timer = new Map<number, ReturnType<typeof setTimeout>>();

export const toasts = writable<Toast[]>([]);

export function tutupToast(id: number) {
	const t = timer.get(id);
	if (t) {
		clearTimeout(t);
		timer.delete(id);
	}
	toasts.update((list) => list.filter((toast) => toast.id !== id));
}

function tampilkan(jenis: JenisToast, pesan: string) {
	// Scan yang diulang-ulang menghasilkan pesan yang sama berkali-kali. Menumpuknya
	// cuma menutupi layar, jadi pesan kembar diganti — bukan ditambah — supaya
	// hitungan waktunya ikut mulai dari awal lagi.
	let kembar: number | null = null;
	toasts.update((list) => {
		const sama = list.find((t) => t.jenis === jenis && t.pesan === pesan);
		kembar = sama ? sama.id : null;
		return list;
	});
	if (kembar !== null) tutupToast(kembar);

	const id = ++urutan;
	toasts.update((list) => [...list, { id, jenis, pesan }]);
	timer.set(
		id,
		setTimeout(() => tutupToast(id), DURASI_MS)
	);
}

export const toast = {
	info: (pesan: string) => tampilkan('info', pesan),
	sukses: (pesan: string) => tampilkan('sukses', pesan),
	error: (pesan: string) => tampilkan('error', pesan)
};
