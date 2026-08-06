import { writable } from 'svelte/store';

export const scanAktif = writable(false);

let timer: ReturnType<typeof setTimeout> | undefined;

export function tandaiScan() {
	scanAktif.set(true);
	clearTimeout(timer);
	timer = setTimeout(() => scanAktif.set(false), 2000);
}
