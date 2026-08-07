import type { ItemPenjualan } from '$lib/types';

export type Keranjang = {
	id: number;
	nama: string;
	cart: ItemPenjualan[];
};

export const keranjangState = $state<{ list: Keranjang[]; activeId: number }>({
	list: [{ id: 1, nama: 'Keranjang 1', cart: [] }],
	activeId: 1
});

let nextKeranjangId = 2;
export function nextKeranjangIdAndIncrement() {
	return nextKeranjangId++;
}
