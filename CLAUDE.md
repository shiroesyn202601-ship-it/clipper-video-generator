# CLAUDE.md — Kontrak Kerja Project Clipper Video (Podcast)

Dokumen ini adalah **landasan** untuk setiap pembuatan fitur baru dan pengembangan fitur yang sudah ada.
Semua aturan di sini **wajib** diikuti oleh siapa pun (manusia maupun AI) yang mengubah kode di repo ini.
Kalau ada aturan yang perlu diubah, ubah file ini lewat commit tersendiri.

---

## 1. Tentang Aplikasi

Aplikasi **lokal** untuk memotong (clipping) video podcast panjang menjadi klip pendek vertikal (9:16)
yang siap diunggah ke Shorts / Reels / TikTok.

Alur utama (pipeline):

```
URL / file video
   │
   ▼
[1] Ambil sumber ............ yt-dlp
[2] Pisahkan suara & musik .. demucs
[3] Bersihkan noise ......... DeepFilterNet
[4] Transkrip + cari momen .. whisper.cpp
[5] Kunci wajah + crop 9:16 . OpenCV + Norfair
[6] Susun subtitle + render . ffmpeg + subtitle ASS (libass)
   │
   ▼
Klip 9:16 + subtitle
```

Aplikasi berjalan **di komputer lokal** (server Node + worker Python lokal, tanpa backend cloud milik sendiri).
Proses default tetap lokal. Sejak 24 Nov 2026, atas persetujuan user, tahap tertentu (mis. transkrip) **boleh**
memakai layanan online pihak ketiga **asalkan gratis**. Aturan lengkapnya ada di bagian 4 ("Layanan online").

---

## 2. Tools & Library (Stack Resmi)

| #   | Kebutuhan                                 | Tool                                                                             | Repo                                                                   |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Bahasa / framework aplikasi               | **React** (UI)                                                                   | https://react.dev                                                      |
| 2   | Ambil video sumber                        | **yt-dlp**                                                                       | https://github.com/yt-dlp/yt-dlp                                       |
| 3   | Transkrip & cari momen                    | **whisper.cpp**                                                                  | https://github.com/ggml-org/whisper.cpp                                |
| 4   | Bersihkan suara dari noise                | **DeepFilterNet**                                                                | https://github.com/rikorose/deepfilternet                              |
| 5   | Pisahkan suara dari musik                 | **Demucs**                                                                       | https://github.com/facebookresearch/demucs                             |
| 6   | Kunci wajah & auto-crop 9:16              | **OpenCV** + **Norfair**                                                         | https://github.com/opencv/opencv · https://github.com/tryolabs/norfair |
| 7   | Susun subtitle + render                   | **ffmpeg + subtitle ASS (libass)** — menggantikan editly, lihat catatan di bawah | https://ffmpeg.org · https://github.com/libass/libass                  |
| 8   | UI anti "AI slop"                         | **hallmark** (agent skill)                                                       | https://github.com/nutlope/hallmark                                    |
| 9   | Beresin detail kecil UI                   | **make-interfaces-feel-better** (agent skill)                                    | https://github.com/jakubkrehel/make-interfaces-feel-better             |
| 10  | Finishing UI                              | **benjitaylor/skills** (skill _stageshow_)                                       | https://github.com/benjitaylor/skills                                  |
| 11  | Transkrip online cepat (opsional, gratis) | **Groq API** (whisper-large-v3-turbo, free tier) — fallback ke whisper.cpp       | https://console.groq.com/docs/speech-to-text                           |
| 12  | Tulis komentar kreator (opsional, gratis) | **Groq API chat** (llama-3.3-70b-versatile, free tier, key yang sama dengan #11) | https://console.groq.com/docs/text-chat                                |
| 13  | Suara komentar kreator (opsional, gratis) | **Edge-TTS** (suara online Microsoft, paket Python `edge-tts`)                   | https://github.com/rany2/edge-tts                                      |

> **Catatan tool #7 (24 Nov 2026):** editly (https://github.com/mifi/editly) awalnya dipilih, tetapi dependency native-nya
> (`gl@5`, `canvas@2`) hanya punya binary untuk Node 12–16 dan gagal di-compile pada Node modern di Windows.
> Atas persetujuan user, render memakai ffmpeg langsung dengan subtitle ASS (libass, sudah termasuk di build ffmpeg).

Pendukung wajib: **Node.js LTS**, **Python 3.10+**, **ffmpeg + ffprobe** di PATH, **Git**.

### Library pendukung yang disetujui

| Area            | Library                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Frontend        | Vite, TypeScript, React Router, TanStack Query, CSS Modules                                        |
| Backend         | Fastify (+ pino bawaan), zod, `@fastify/multipart`, `@fastify/static`                              |
| Shared          | zod                                                                                                |
| Python worker   | numpy (selain demucs, deepfilternet, opencv-python, norfair, yt-dlp)                               |
| Kualitas & test | ESLint (typescript-eslint, react-hooks, jsx-a11y), Prettier, Vitest, Testing Library, ruff, pytest |
| Model           | YuNet face detector (`face_detection_yunet_2023mar.onnx`, OpenCV Zoo)                              |

### Arsitektur yang disepakati

- `apps/web` — frontend **React** (Vite + TypeScript). Hanya UI; tidak menjalankan proses berat.
- `apps/server` — backend **Node.js** lokal. Mengorkestrasi pipeline: memanggil CLI (yt-dlp, whisper.cpp, ffmpeg), memanggil Groq API untuk transkrip online (opsional, dengan rotasi beberapa API key), menyusun subtitle ASS untuk render, dan memanggil worker Python.
- `workers/` — script **Python** untuk demucs, DeepFilterNet, OpenCV + Norfair, dan Edge-TTS (suara komentar). Dipanggil oleh server lewat proses anak (child process) dengan input/output berupa path file + JSON.
- `tools/` — binary lokal (mis. build whisper.cpp) dan model (mis. `ggml-*.bin`). **Tidak di-commit.**
- `workspace/` — file kerja per job (video sumber, audio, transkrip, hasil render). **Tidak di-commit.**

Kalau arsitektur ini perlu diubah, update bagian ini **dan** `SETUP.md` dalam commit yang sama.

---

## 3. Aturan Proses Kerja (WAJIB)

1. **Setiap perubahan kode atas perintah user langsung di-commit & di-push** ke `origin` (GitHub).
   - Satu perintah = minimal satu commit yang jelas. Pesan commit menjelaskan _apa_ dan _kenapa_.
   - Push ke branch aktif segera setelah commit. Jangan menumpuk perubahan yang belum di-push.
   - Jangan commit file rahasia (`.env`, token, cookie yt-dlp, kredensial).
2. **Panduan setup harus selalu benar.** Setiap perubahan yang berpotensi mengubah cara setup
   (dependency baru, versi tool, env var, script, port, struktur folder, model yang perlu diunduh,
   langkah instalasi) **wajib** meng-update [SETUP.md](SETUP.md) dalam commit yang sama.
3. **Kontrak ini dibaca sebelum mengerjakan fitur.** Fitur baru maupun perubahan fitur harus mengikuti bagian 4 & 5,
   serta dua dokumen pendamping yang juga **mengikat**:
   - [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) — aturan penulisan code (penamaan, struktur, pola, testing, commit).
   - [docs/PROMPT_GENERATE_APP.md](docs/PROMPT_GENERATE_APP.md) — spesifikasi produk, arsitektur, API, detail pipeline, dan urutan fase pembangunan.
     Jika spesifikasi berubah, file ini wajib di-update di commit yang sama.
4. **Tool di luar daftar bagian 2 tidak boleh ditambahkan tanpa persetujuan user.** Kalau perlu, usulkan dulu beserta alasannya,
   lalu catat di tabel bagian 2 dan di SETUP.md setelah disetujui.

---

## 4. Yang HARUS Dilakukan

### Umum

- Gunakan **React** untuk seluruh UI. Gunakan **TypeScript** untuk kode JS/TS baru.
- Pakai tool sesuai fungsinya di bagian 2 — jangan menulis ulang fungsi yang sudah disediakan tool tersebut.
- Setiap tahap pipeline berdiri sendiri: input jelas (path file) → output jelas (path file / JSON) → bisa dijalankan ulang tanpa mengulang tahap sebelumnya (pakai cache di `workspace/<job-id>/`).
- Semua path lokal disusun dengan modul `path` (Node) / `pathlib` (Python) agar jalan di Windows, macOS, dan Linux.
- Saat memanggil proses eksternal, kirim argumen sebagai **array** (bukan string shell gabungan) untuk mencegah command injection dari URL/nama file.
- Tampilkan progres tiap tahap pipeline ke UI (status, persen, error yang bisa dibaca manusia).
- Tangani error tool eksternal: cek exit code, simpan stderr ke log job, tampilkan pesan ringkas ke user.
- Konfigurasi (path binary, model whisper, port) diletakkan di file `.env` / config, dengan contoh di `.env.example`.

### Layanan online (pihak ketiga)

Disetujui user pada 24 Nov 2026: video, audio, atau transkrip **boleh** dikirim ke layanan online **asalkan gratis**.

- Hanya layanan yang benar-benar **gratis**: free tier tanpa biaya dan tanpa kartu kredit/billing aktif. Layanan berbayar per pemakaian tidak boleh dipakai.
- Saat kuota gratis habis, layanan gagal, atau tidak ada internet, aplikasi **kembali ke tool lokal** (mis. whisper.cpp) dan memberi tahu user di UI. Aplikasi tidak boleh memicu tagihan secara diam-diam.
- Tool lokal di bagian 2 tetap ada sebagai fallback. Jangan menghapusnya.
- Layanan online bisa dimatikan dari setting job/`.env`, dan UI menunjukkan tahap mana yang memakai layanan online.
- API key disimpan di `.env` (contoh kosong di `.env.example`), tidak pernah di-commit, dan tidak dikirim ke browser.
- Layanan yang dipakai tetap harus disetujui user dan dicatat di tabel bagian 2 serta di SETUP.md (aturan proses kerja no. 4).

### Fitur podcast

- Prioritaskan kualitas suara: pisahkan vokal (demucs) dan bersihkan noise (DeepFilterNet) **sebelum** transkrip, agar transkrip lebih akurat.
- Pencarian momen memakai hasil transkrip whisper.cpp yang ber-timestamp; klip harus mulai & berakhir di batas kalimat, bukan memotong kata.
- Crop 9:16 mengikuti wajah pembicara yang sedang aktif (OpenCV untuk deteksi, Norfair untuk tracking), dengan pergerakan kamera yang halus (smoothing), bukan melompat-lompat.
- Subtitle diambil dari timestamp transkrip; mudah dibaca di layar HP (ukuran besar, kontras tinggi, maksimal ±2 baris).

### UI / UX

- Saat membangun atau mendesain ulang halaman, gunakan skill **hallmark** (`/hallmark`, `/hallmark redesign`, `/hallmark audit`).
- Untuk merapikan detail, ikuti prinsip **make-interfaces-feel-better**, antara lain:
  - radius konsentris (radius luar = radius dalam + padding);
  - `font-variant-numeric: tabular-nums` untuk angka yang berubah (durasi, timestamp, progres);
  - transisi CSS untuk state interaktif, efek tekan `scale(0.96)`;
  - area klik minimal 40×40px (desktop) / 44×44px (sentuh).
- Untuk tampilan demo / mock UI produk, gunakan skill **stageshow** dari benjitaylor/skills.
- Semua UI wajib lolos dasar aksesibilitas: kontras cukup, fokus keyboard terlihat, menghormati `prefers-reduced-motion`.

---

## 5. Yang HARUS Dihindari

### Umum

- ❌ Menambah framework UI selain React (Vue, Svelte, Angular, dll.).
- ❌ Menambah library/tool baru di luar bagian 2 tanpa persetujuan user.
- ❌ Mengirim video, audio, atau transkrip ke layanan cloud/API pihak ketiga yang **berbayar**, atau ke layanan gratis yang belum disetujui user. Lihat "Layanan online" di bagian 4.
- ❌ Commit file besar atau hasil generate: video, audio, model (`*.bin`, `*.pt`, `*.onnx`), `node_modules/`, `.venv/`, `workspace/`, `tools/`.
- ❌ Commit rahasia: `.env`, cookies browser untuk yt-dlp, token.
- ❌ Menyusun perintah shell dari string mentah input user (`exec("yt-dlp " + url)`).
- ❌ Menjalankan proses berat (transkrip, separasi, render) di thread UI / di browser.
- ❌ Mengubah kode tanpa commit & push, atau mengubah cara setup tanpa meng-update SETUP.md.
- ❌ Menghapus data job user (`workspace/`) tanpa konfirmasi.
- ❌ Hardcode path absolut milik satu komputer (mis. `D:\Berdikari\...`).

### UI ("AI slop" yang dilarang — mengacu ke hallmark)

- ❌ Label kecil huruf kapital (eyebrow) di atas setiap judul.
- ❌ Satu kata berwarna mencolok di tengah judul sebagai gimmick.
- ❌ Gradien ungu-biru generik, kartu-kartu kosong, ikon dekoratif tanpa fungsi.
- ❌ Teks / angka / testimoni karangan. Tampilkan data asli dari job.
- ❌ `transition: all`, animasi pada aksi yang sangat sering dipakai, animasi sebagai satu-satunya tanda feedback.
- ❌ Efek tekan di bawah `scale(0.95)`.

---

## 6. Definition of Done (setiap fitur)

- [ ] Fitur jalan di lokal sesuai alur di bagian 1.
- [ ] Mengikuti bagian 4, tidak melanggar bagian 5.
- [ ] Error dari tool eksternal tertangani dan terlihat di UI.
- [ ] `SETUP.md` sudah di-update bila cara setup berubah.
- [ ] `CLAUDE.md` di-update bila ada keputusan arsitektur / tool baru.
- [ ] Sudah di-commit **dan** di-push.
