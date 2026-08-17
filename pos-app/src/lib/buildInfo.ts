// Identitas build, supaya sekali lihat langsung ketahuan versi mana yang terpasang di
// mesin client — tanpa ini, "installer lama atau baru?" cuma bisa ditebak.
//
// Nilainya disuntikkan oleh workflow .github/workflows/build-windows.yml lewat variabel
// VITE_*. Saat `npm run tauri dev` variabel itu tidak ada, jadi sengaja jatuh ke "dev"
// alih-alih menggagalkan build.

export const BUILD_DATE: string = import.meta.env.VITE_BUILD_DATE ?? 'dev';
export const BUILD_COMMIT: string = import.meta.env.VITE_BUILD_COMMIT ?? 'lokal';

export const BUILD_LABEL = `Build ${BUILD_DATE} · ${BUILD_COMMIT}`;
