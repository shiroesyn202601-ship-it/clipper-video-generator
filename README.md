# Podcast Clipper

Aplikasi **lokal** untuk mengubah video podcast panjang menjadi klip vertikal 9:16 bersubtitle, siap untuk
YouTube Shorts, Reels, dan TikTok. Proses berjalan di komputer sendiri secara default. Layanan online gratis hanya dipakai bila diaktifkan,
dengan fallback ke proses lokal.

```
URL / file ─► yt-dlp ─► Demucs (pisah vokal) ─► DeepFilterNet (bersihkan noise) ─► whisper.cpp (transkrip)
          ─► cari momen (skor lokal) ─► OpenCV + Norfair (kunci wajah, crop 9:16) ─► ffmpeg + ASS (subtitle, render)
```

## Cara pakai

1. Tempel URL video atau pilih file, lalu klik **Proses**.
2. Tunggu analisis selesai. Hasilnya: transkrip dan daftar **kandidat klip** berskor beserta alasannya.
3. Klik **Jadikan klip**. Di editor, geser awal/akhir per kalimat dan perbaiki teks subtitle bila perlu.
4. Klik **Render**, lalu **Unduh MP4**.

## Mulai

Ikuti [SETUP.md](SETUP.md) (prasyarat, model, `.env`), lalu:

```bash
npm install
npm run dev        # web http://127.0.0.1:5173, API http://127.0.0.1:5174
```

Halaman **Status tools** di aplikasi menunjukkan tool mana yang belum siap.

## Dokumen

| Dokumen                                                    | Isi                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| [CLAUDE.md](CLAUDE.md)                                     | Kontrak kerja: stack resmi, hal wajib dan terlarang, Definition of Done |
| [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md)       | Aturan penulisan code                                                   |
| [docs/PROMPT_GENERATE_APP.md](docs/PROMPT_GENERATE_APP.md) | Spesifikasi produk, arsitektur, API, detail pipeline                    |
| [SETUP.md](SETUP.md)                                       | Instalasi, menjalankan aplikasi, troubleshooting                        |

## Pemeriksaan kualitas

```bash
npm run check      # lint + format + typecheck + test (TypeScript)
npm run check:py   # ruff + pytest (worker Python)
```
