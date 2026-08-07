# Fase 16 — Multi-keranjang di halaman Penjualan

## Context
Client sering menghadapi kasus dua pembeli dilayani bersamaan: pembeli 1 masih memilih barang (belum bayar), lalu pembeli 2 datang, mau beli barang lain dan langsung bayar duluan. Saat ini `cart` di [pos-app/src/routes/(app)/kasir/+page.svelte](pos-app/src/routes/(app)/kasir/+page.svelte) adalah satu `$state<ItemPenjualan[]>` tunggal — kalau kasir mulai transaksi baru, keranjang pembeli 1 akan tertimpa/hilang. Tujuan fase ini: kasir bisa punya beberapa keranjang aktif sekaligus (tab), pindah-pindah antar keranjang, dan bayar salah satu tanpa mengganggu keranjang lain.

Ini murni perubahan state & UI di frontend — `simpanPenjualan(kasirId, items)` di [pos-app/src/lib/db/penjualan.ts](pos-app/src/lib/db/penjualan.ts) sudah menerima array item langsung per transaksi, tidak bergantung pada struktur cart di UI, jadi tidak perlu perubahan skema database atau layer db/.

## Keputusan desain (dikonfirmasi user)
- UI: tab horizontal di atas keranjang, contoh `[Keranjang 1] [Keranjang 2] [+]`, klik tab untuk pindah keranjang aktif.
- Setiap tab punya cart, scan-input, dan status stok-habis independen.
- Setelah pembayaran tab tersebut sukses dan invoice ditutup ("Selesai") → tab otomatis ditutup/dihapus dari daftar. Kalau itu tab terakhir, otomatis buat 1 tab kosong baru (kasir selalu punya minimal 1 keranjang aktif).
- Maksimal 5 tab bersamaan — tombol `+` disabled/beri feedback kalau sudah 5.
- Log aktivitas tetap satu daftar global (tidak per-tab) tapi tiap entry log diberi label keranjang, misal `[Keranjang 2] Tambah Permen Karet x1`, supaya kasir tetap bisa lacak semua aktivitas dari satu tempat.

## Perubahan state di `+page.svelte`

Ganti representasi cart tunggal jadi array keranjang:

```ts
type Keranjang = {
  id: number;           // id lokal, incrementing counter
  nama: string;         // "Keranjang 1", "Keranjang 2", dst — label statis by index, bisa dihitung ulang saat render
  cart: ItemPenjualan[];
};

let keranjangs = $state<Keranjang[]>([{ id: 1, nama: 'Keranjang 1', cart: [] }]);
let activeId = $state(1);
let nextKeranjangId = 2; // counter biasa, bukan reactive state
```

Semua variabel/fungsi yang sekarang beroperasi pada `cart` tunggal (`total`, `adaStokHabis`, `tambah`, `tambahJumlah`, `kurangi`, `hapus`, `bersihkan`, `bukaInvoice`, `bayar`, dst.) diubah untuk beroperasi pada keranjang aktif:

```ts
let activeKeranjang = $derived(keranjangs.find((k) => k.id === activeId)!);
let cart = $derived(activeKeranjang.cart); // dipakai read-only di template yang sudah ada
```

Untuk mutasi, tulis balik ke `keranjangs` via helper, misal:

```ts
function updateActiveCart(fn: (cart: ItemPenjualan[]) => ItemPenjualan[]) {
  const k = keranjangs.find((k) => k.id === activeId)!;
  k.cart = fn(k.cart);
}
```

`tambah`, `kurangi`, `hapus`, `bersihkan` dipanggil pada `activeKeranjang.cart` langsung (karena Svelte 5 `$state` array/objects reactive secara deep, sama seperti pola `cart.push(...)` yang sudah dipakai sekarang) — jadi cukup ganti referensi `cart` → `activeKeranjang.cart` di fungsi-fungsi itu, tidak perlu helper tambahan kalau mutasi in-place tetap dipakai.

`showInvoice`, `sudahBayar`, `uangDibayar`, `ringkasanBayar`, `showStokHabis`, `membayar` — tetap top-level `$state` (bukan per-tab), karena invoice/pembayaran hanya bisa berlangsung untuk satu tab pada satu waktu (kasir fokus satu transaksi saat proses bayar). Saat `bukaInvoice()` dipanggil, ia otomatis terkait ke `activeId` saat itu — tapi karena user tetap bisa switch tab sebelum menyelesaikan invoice, **kunci `activeId` selama modal invoice terbuka**: disable klik-pindah-tab saat `showInvoice === true` (mencegah kasir pindah tab lalu bayar keranjang yang salah).

Fungsi baru:
```ts
function bukaKeranjangBaru() {
  if (keranjangs.length >= 5) return;
  const id = nextKeranjangId++;
  keranjangs.push({ id, nama: `Keranjang ${id}`, cart: [] });
  activeId = id;
}

function tutupKeranjang(id: number) {
  keranjangs = keranjangs.filter((k) => k.id !== id);
  if (keranjangs.length === 0) {
    const newId = nextKeranjangId++;
    keranjangs.push({ id: newId, nama: `Keranjang ${newId}`, cart: [] });
    activeId = newId;
  } else if (activeId === id) {
    activeId = keranjangs[0].id;
  }
}

function pindahKeranjang(id: number) {
  if (showInvoice) return; // kunci saat invoice terbuka
  activeId = id;
}
```

`bayar()` di akhir (setelah `sudahBayar = true` dan user klik "Selesai" → `tutupInvoice()`) memanggil `tutupKeranjang(activeId)` supaya tab otomatis hilang sesuai keputusan desain. Perlu pisahkan: `tutupInvoice()` yang dipanggil dari tombol "Selesai" pasca-bayar berbeda perilaku dari `tutupInvoice()` yang dipanggil dari "Batal" (belum bayar) — batal hanya menutup modal, tidak menutup tab.

Label tab yang ditampilkan sebaiknya dihitung dari index render (`Keranjang 1`, `Keranjang 2`, ...) bukan dari `nama` yang tersimpan di object, supaya penomoran selalu rapat berurutan meski tab di tengah ditutup — atau tetap pakai `nama` statis per keputusan sederhana ("Keranjang 1" tetap nama tab pertama meski tab lain ditutup, tidak reindex). **Pilihan: pakai `nama` statis (lebih simpel, dan mencegah nomor tab "melompat" membingungkan kasir saat transaksi lain sedang berjalan)** — ini yang diimplementasikan.

## Perubahan UI (template)

Tambah baris tab tepat di atas `.scan-row` di dalam `.panel.cart.card`:

```svelte
<div class="tab-row">
  {#each keranjangs as k (k.id)}
    <button
      class="tab"
      class:active={k.id === activeId}
      disabled={showInvoice}
      onclick={() => pindahKeranjang(k.id)}
    >
      {k.nama}
      {#if keranjangs.length > 1}
        <span class="tab-close" onclick={(e) => { e.stopPropagation(); tutupKeranjang(k.id); }}>×</span>
      {/if}
    </button>
  {/each}
  <button class="tab tab-add" disabled={keranjangs.length >= 5 || showInvoice} onclick={bukaKeranjangBaru}>+</button>
</div>
```

Sisanya template (`.cart-table-wrap`, invoice overlay, dll.) tetap sama karena sudah dibaca dari `cart` (yang sekarang jadi `$derived` alias ke `activeKeranjang.cart`).

`catatLog` diberi parameter tambahan nama keranjang, atau cukup prefix manual di setiap call site: `catatLog(\`[${activeKeranjang.nama}] Tambah ${barang.nama} x1\`)`.

## File yang diubah
- [pos-app/src/routes/(app)/kasir/+page.svelte](pos-app/src/routes/(app)/kasir/+page.svelte) — satu-satunya file yang perlu diubah (state, fungsi, template, style tab baru).

Tidak ada perubahan di `$lib/db/`, `$lib/types/`, atau backend Rust.

## Verifikasi
Karena ini perubahan UI/state, minta user yang jalankan dev server sendiri (`npm run tauri dev` di `pos-app/`) sesuai preferensi mereka, lalu cek manual:
1. Buka Penjualan, ada 1 tab default "Keranjang 1".
2. Scan/tambah barang ke Keranjang 1, klik `+` untuk buka Keranjang 2, scan barang lain — pastikan Keranjang 1 tidak berubah saat pindah ke tab 2.
3. Bayar Keranjang 2 sampai selesai → tab Keranjang 2 hilang, kembali ke Keranjang 1 dengan isi cart yang masih sama seperti sebelumnya.
4. Coba buka tab sampai 5, pastikan tombol `+` disabled setelah 5 tab.
5. Coba tutup satu-satunya tab yang ada (klik ×) → pastikan otomatis muncul tab kosong baru, tidak pernah 0 tab.
6. Saat modal invoice terbuka, pastikan klik tab lain tidak berpindah (tombol tab disabled).
7. `npm run check` (svelte-check) untuk pastikan tidak ada type error dari perubahan `cart` → `activeKeranjang.cart`.

Setelah selesai dan dikonfirmasi user, catat di [docs/list_done.md](docs/list_done.md) sesuai format project: `tanggal - fase 16: multi-keranjang penjualan - <commit hash>` (commit hanya dibuat saat diminta eksplisit).
