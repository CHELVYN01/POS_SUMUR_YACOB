<script lang="ts">
	import type { TitikGrafik } from '$lib/types';

	let {
		data = [],
		tinggi = 180,
		formatNilai = (n: number) => String(n),
		labelSeri = '',
		labelSeri2 = ''
	}: {
		data?: TitikGrafik[];
		tinggi?: number;
		formatNilai?: (n: number) => string;
		labelSeri?: string;
		labelSeri2?: string;
	} = $props();

	/**
	 * Lebar diukur dari container, bukan pakai viewBox + preserveAspectRatio="none",
	 * supaya label teks tidak ikut ter-stretch saat jendela diperbesar.
	 */
	let lebar = $state(0);

	const TINGGI_LABEL = 18;

	let punyaSeri2 = $derived(data.some((d) => d.nilai2 !== undefined));
	let areaTinggi = $derived(Math.max(tinggi - TINGGI_LABEL, 10));
	let maks = $derived(
		Math.max(1, ...data.map((d) => Math.max(d.nilai, d.nilai2 ?? 0)))
	);
	let slot = $derived(data.length > 0 ? lebar / data.length : 0);

	/** Kalau titiknya banyak, label X diselang-seling supaya tidak tumpang tindih. */
	let stepLabel = $derived(slot > 0 ? Math.max(1, Math.ceil(34 / slot)) : 1);

	function batang(nilai: number) {
		const t = (nilai / maks) * areaTinggi;
		// Nilai bukan-nol selalu digambar minimal 2px agar tetap terlihat.
		return nilai > 0 ? Math.max(t, 2) : 0;
	}
</script>

<div class="chart" bind:clientWidth={lebar}>
	{#if data.length === 0}
		<p class="kosong">Belum ada data</p>
	{:else}
		{#if punyaSeri2 && (labelSeri || labelSeri2)}
			<div class="legenda">
				<span><i class="kotak seri1"></i>{labelSeri}</span>
				<span><i class="kotak seri2"></i>{labelSeri2}</span>
			</div>
		{/if}

		<svg width={lebar} height={tinggi} role="img" aria-label="Grafik batang">
			<line
				x1="0"
				y1={areaTinggi + 0.5}
				x2={lebar}
				y2={areaTinggi + 0.5}
				class="sumbu"
			/>

			{#each data as d, i (d.kunci)}
				{@const lebarBatang = punyaSeri2 ? (slot - 6) / 2 : slot - 6}
				{@const x = i * slot + 3}
				{@const t1 = batang(d.nilai)}
				<rect
					x={x}
					y={areaTinggi - t1}
					width={Math.max(lebarBatang, 1)}
					height={t1}
					rx="2"
					class="seri1"
				>
					<title>{d.label}: {formatNilai(d.nilai)}</title>
				</rect>

				{#if punyaSeri2}
					{@const t2 = batang(d.nilai2 ?? 0)}
					<rect
						x={x + lebarBatang + 1}
						y={areaTinggi - t2}
						width={Math.max(lebarBatang, 1)}
						height={t2}
						rx="2"
						class="seri2"
					>
						<title>{d.label}: {formatNilai(d.nilai2 ?? 0)}</title>
					</rect>
				{/if}

				{#if i % stepLabel === 0}
					<text x={i * slot + slot / 2} y={tinggi - 5} class="label">{d.label}</text>
				{/if}
			{/each}
		</svg>

		<div class="maks">Tertinggi: {formatNilai(maks)}</div>
	{/if}
</div>

<style>
	.chart {
		width: 100%;
	}
	svg {
		display: block;
		overflow: visible;
	}
	.seri1 {
		fill: var(--accent);
	}
	.seri2 {
		fill: var(--accent);
		opacity: 0.35;
	}
	.sumbu {
		stroke: var(--border);
		stroke-width: 1;
	}
	.label {
		font-size: 0.65rem;
		fill: var(--text-muted);
		text-anchor: middle;
	}
	.kosong {
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 1.5rem 0;
		margin: 0;
	}
	.maks {
		font-size: 0.7rem;
		color: var(--text-muted);
		text-align: right;
		margin-top: 0.35rem;
	}
	.legenda {
		display: flex;
		gap: 1rem;
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-bottom: 0.4rem;
	}
	.legenda span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.kotak {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		display: inline-block;
	}
	.kotak.seri1 {
		background: var(--accent);
	}
	.kotak.seri2 {
		background: var(--accent);
		opacity: 0.35;
	}
</style>
