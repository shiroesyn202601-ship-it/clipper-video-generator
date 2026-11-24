/** All user-facing UI text lives here (Bahasa Indonesia). Components must not inline strings. */
export const copy = {
  appName: "Podcast Clipper",
  nav: {
    home: "Job baru",
    jobs: "Semua job",
  },
  common: {
    retry: "Coba lagi",
    loading: "Memuat…",
    cancel: "Batal",
    close: "Tutup",
  },
  errors: {
    serverUnreachable:
      "Server lokal tidak merespons. Pastikan `npm run dev` masih berjalan, lalu coba lagi.",
    unexpected: "Terjadi kesalahan yang tidak terduga.",
    notFoundTitle: "Halaman tidak ditemukan",
    notFoundBody: "Alamat ini tidak ada. Kembali ke halaman awal untuk membuat job baru.",
    backHome: "Kembali ke awal",
  },
  health: {
    title: "Status tools",
    allReady: "Semua tools siap.",
    missingTitle: (count: number) => `${count} tools belum siap`,
    missingBody: "Proses yang membutuhkan tools ini akan gagal. Ikuti SETUP.md untuk memasangnya.",
    showDetails: "Lihat detail",
    hideDetails: "Sembunyikan",
    available: "Siap",
    missing: "Belum ada",
    recheck: "Cek ulang",
  },
} as const;
