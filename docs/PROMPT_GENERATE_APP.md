# Prompt Generate Aplikasi — Podcast Clipper

> **Cara pakai:** salin seluruh isi dari bagian "PROMPT" ke bawah ke Claude Code (atau agent lain) yang dibuka di root repo ini.
> Untuk melanjutkan pengembangan di kemudian hari, cukup tulis: _"Lanjutkan pembuatan aplikasi sesuai docs/PROMPT_GENERATE_APP.md, mulai dari Fase N."_
>
> Jika ada keputusan baru yang mengubah isi prompt ini, perbarui file ini di commit yang sama agar prompt selalu mencerminkan aplikasi yang sebenarnya.
>
> **Status (24 Nov 2026):** Fase 1–10 selesai dan sudah diimplementasikan. Spesifikasi di bawah sudah disesuaikan dengan
> implementasinya. Perbedaan penting dari rencana awal: render memakai ffmpeg + subtitle ASS (bukan editly),
> normalisasi loudness memakai kompresor + gain terukur + limiter, dan whisper.cpp di Windows memakai binary resmi.

---

# PROMPT

## 0. Peran & Aturan Main

Kamu adalah senior full-stack engineer yang membangun aplikasi **Podcast Clipper** di repo ini.

Sebelum menulis code apa pun, **baca dan patuhi** dokumen berikut. Urutan prioritasnya:

1. [`CLAUDE.md`](../CLAUDE.md) — kontrak kerja: stack resmi, hal wajib, hal terlarang, Definition of Done.
2. [`docs/CODING_STANDARDS.md`](CODING_STANDARDS.md) — aturan penulisan code (penamaan, struktur, pola, testing, commit).
3. Dokumen ini — spesifikasi produk, arsitektur, dan urutan pembangunan.
4. [`SETUP.md`](../SETUP.md) — cara setup. **Wajib** di-update setiap kali cara setup berubah.

Aturan main:

- Kerjakan **per fase** (bagian 9) secara berurutan. Jangan lompat fase.
- Di akhir setiap fase: jalankan `npm run check` dan `npm run check:py` (jika sudah ada), pastikan kriteria selesai terpenuhi, update `SETUP.md` bila perlu, lalu **commit & push**.
- Kode harus **best practice**: type-safe, teruji, aman (tanpa command injection atau path traversal), mudah dibaca, dan konsisten dengan CODING_STANDARDS.
- Jangan menambah library di luar daftar yang disetujui (CLAUDE.md bagian 2). Jika merasa perlu, berhenti dan tanyakan ke user.
- Jangan mengarang perilaku tool eksternal. Jika ragu dengan flag atau format output sebuah tool, cek `--help` atau dokumentasinya, lalu tulis wrapper yang menormalisasi outputnya.
- Jika spesifikasi di sini ambigu, pilih opsi paling sederhana yang konsisten dengan dokumen ini, lalu catat keputusan itu di pesan commit.

---

## 1. Tujuan Produk

Aplikasi **web lokal** untuk mengubah video podcast panjang (30 menit – 3 jam) menjadi **klip pendek vertikal 9:16**
(15–60 detik) yang siap diunggah ke YouTube Shorts, Instagram Reels, dan TikTok, lengkap dengan subtitle yang terbaca jelas.

Pengguna: kreator / editor konten podcast, umumnya berbahasa Indonesia.

**Alur pengguna:**

1. Tempel URL YouTube atau pilih file video lokal → klik **Proses**.
2. Melihat progres per tahap (unduh → audio → pisah vokal → bersihkan noise → transkrip → cari momen).
3. Melihat daftar **kandidat klip** yang diurutkan berdasarkan skor, masing-masing dengan cuplikan transkrip dan alasan skornya.
4. Memilih klip, lalu bisa menggeser awal/akhir (otomatis menempel ke batas kalimat) dan mengedit teks subtitle.
5. Klik **Render** → aplikasi mengunci wajah, crop 9:16, memasang subtitle, dan merender MP4.
6. Pratinjau hasil, lalu unduh atau buka foldernya.

**Prinsip produk:**

- 100% lokal. Tidak ada data yang dikirim ke cloud.
- Bisa dilanjutkan: jika aplikasi ditutup di tengah proses, job bisa dilanjutkan dari stage terakhir yang selesai.
- Jujur: semua angka di UI (skor, durasi, progres) berasal dari data asli, tidak ada nilai palsu.

**Di luar cakupan (jangan dibuat):** login/akun, upload otomatis ke media sosial, layanan cloud, editor video timeline penuh, aplikasi mobile.

---

## 2. Stack Teknis

| Lapisan       | Teknologi                                                                     |
| ------------- | ----------------------------------------------------------------------------- |
| Monorepo      | **npm workspaces** (`apps/*`, `packages/*`) + folder `workers/` (Python)      |
| Frontend      | **React 18 + TypeScript + Vite**, React Router, TanStack Query, CSS Modules   |
| Backend lokal | **Node.js LTS + TypeScript + Fastify**, zod, pino (logger bawaan Fastify)     |
| Shared        | `packages/shared`: zod schema, tipe, konstanta default                        |
| Worker        | **Python 3.10/3.11**: demucs, DeepFilterNet, OpenCV, Norfair, numpy           |
| CLI eksternal | yt-dlp, whisper.cpp (`whisper-cli`), ffmpeg/ffprobe                           |
| Render        | **ffmpeg + subtitle ASS** (libass) — editly diganti, lihat CLAUDE.md bagian 2 |
| Persistensi   | File JSON per job di `workspace/<jobId>/job.json`, **tanpa database**         |
| Test          | Vitest, Testing Library, pytest                                               |
| Kualitas      | ESLint (flat config), Prettier, ruff, `tsc --noEmit`                          |
| UI skill      | hallmark, make-interfaces-feel-better, stageshow (lihat CLAUDE.md)            |

---

## 3. Struktur Repo (Target Akhir)

```
.
├─ CLAUDE.md
├─ SETUP.md
├─ docs/
│  ├─ PROMPT_GENERATE_APP.md
│  └─ CODING_STANDARDS.md
├─ package.json              # workspaces + script root (dev, build, check)
├─ tsconfig.base.json
├─ eslint.config.js
├─ .prettierrc
├─ .env.example
├─ apps/
│  ├─ web/                   # React + Vite (port 5173, proxy /api → server)
│  └─ server/                # Fastify (127.0.0.1:5174)
├─ packages/
│  └─ shared/                # schema zod, tipe, defaults
├─ workers/                  # paket Python clipper_workers
├─ fixtures/                 # video sampel ≤10 detik untuk test
├─ tools/                    # (gitignored) whisper.cpp, model
└─ workspace/                # (gitignored) data job
```

Script root `package.json`:

- `npm run dev` → menjalankan server dan web bersamaan (pakai `npm run dev --workspaces --if-present` atau skrip Node kecil. Jangan menambah dependency hanya untuk ini tanpa persetujuan).
- `npm run build`, `npm run check` (lint + typecheck + test), `npm run check:py` (ruff + pytest, memakai Python di `.venv`).

---

## 4. Konfigurasi (`.env.example`)

```
SERVER_PORT=5174
WORKSPACE_DIR=./workspace
PYTHON_BIN=./.venv/Scripts/python.exe      # macOS/Linux: ./.venv/bin/python
YTDLP_BIN=yt-dlp
FFMPEG_BIN=ffmpeg
FFPROBE_BIN=ffprobe
WHISPER_BIN=./tools/whisper.cpp/build/bin/Release/whisper-cli.exe
WHISPER_MODEL=./tools/whisper.cpp/models/ggml-medium.bin
WHISPER_LANGUAGE=id                           # atau "auto"
WHISPER_THREADS=4
FACE_MODEL=./tools/models/face_detection_yunet_2023mar.onnx
DEMUCS_MODEL=htdemucs
DEMUCS_DEVICE=cpu                             # atau "cuda"
```

`config.ts` di server memvalidasi semua nilai dengan zod saat start. Jika ada binary atau model yang tidak ditemukan, server tetap jalan tetapi endpoint `GET /api/health` melaporkan tool mana yang hilang, dan UI menampilkan banner berisi petunjuk menuju SETUP.md.

---

## 5. Model Data (di `packages/shared`)

Semua didefinisikan sebagai **zod schema**. Tipe TS diturunkan dengan `z.infer`.

```ts
StageId = "download" | "extract-audio" | "separate-vocals" | "denoise"
        | "transcribe" | "find-moments"                   // fase analisis (otomatis)
        // per klip, dipicu user:
        | "track-faces" | "reframe" | "render"

StageStatus = "pending" | "running" | "done" | "failed" | "skipped" | "cancelled"

JobStatus = "queued" | "analyzing" | "ready" | "failed" | "cancelled"
// ready = kandidat klip tersedia, menunggu user memilih dan merender

Job {
  id: string                       // crypto.randomUUID()
  createdAt: string                // ISO
  source: { kind: "url", url: string } | { kind: "file", originalName: string }
  title: string | null             // dari info yt-dlp / nama file
  durationSec: number | null
  status: JobStatus
  stages: Record<StageId, StageState>   // hanya stage analisis
  settings: JobSettings
  artifacts: {                     // path relatif terhadap folder job
    sourceVideo?: string; sourceInfo?: string;
    audio16k?: string; vocals?: string; noVocals?: string; vocalsClean?: string;
    transcript?: string; candidates?: string;
  }
  clips: Clip[]
  error: { code: string; userMessage: string } | null
}

StageState { status: StageStatus; progress: number /*0..1*/; startedAt?: string; finishedAt?: string; message?: string }

JobSettings {
  language: "id" | "en" | "auto"         // default "id"
  minClipSec: number                     // default 20
  maxClipSec: number                     // default 60
  targetClipSec: number                  // default 35
  maxCandidates: number                  // default 10
  denoise: boolean                       // default true
  musicVolume: number                    // 0..1, default 0 (musik latar dibuang)
  subtitleStyle: "bold-center" | "lower-third"  // default "bold-center"
}

TranscriptWord    { text: string; startSec: number; endSec: number; probability: number }
TranscriptSegment { id: number; startSec: number; endSec: number; text: string; words: TranscriptWord[] }
Transcript        { language: string; segments: TranscriptSegment[] }

ClipCandidate {
  id: string; startSec: number; endSec: number; text: string
  score: number                          // 0..100
  reasons: string[]                      // contoh: "Pembuka berupa pertanyaan", "Energi suara tinggi"
  features: Record<string, number>       // nilai mentah tiap fitur, untuk debug
}

Clip {
  id: string; candidateId: string
  startSec: number; endSec: number       // hasil penyesuaian user
  captions: Caption[]                    // bisa diedit user
  stages: Record<"track-faces"|"reframe"|"render", StageState>
  output: string | null                  // path final.mp4
  renderRequestedAt: string | null       // diisi saat Render diklik, dihapus saat klip diedit
  // Status klip (draft/queued/rendering/done/failed/cancelled) diturunkan dengan clipStatus(), tidak disimpan.
}

Caption { startSec: number; endSec: number; text: string }   // waktu relatif terhadap awal klip
```

---

## 6. API Server

Base: `http://127.0.0.1:5174/api`. Request dan response dalam JSON. Semua body divalidasi zod.

| Method | Path                             | Fungsi                                                                                                |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/health`                        | status tiap tool eksternal (ada/tidak, versi)                                                         |
| GET    | `/jobs`                          | daftar job (ringkas), terbaru di atas                                                                 |
| POST   | `/jobs`                          | buat job dari URL: `{ url, settings? }`                                                               |
| POST   | `/jobs/upload`                   | buat job dari file (multipart, stream ke disk, batas ukuran dari config)                              |
| GET    | `/jobs/:id`                      | detail job lengkap                                                                                    |
| POST   | `/jobs/:id/cancel`               | batalkan proses yang sedang berjalan                                                                  |
| POST   | `/jobs/:id/retry`                | lanjutkan dari stage yang gagal                                                                       |
| DELETE | `/jobs/:id`                      | hapus job + foldernya (UI wajib meminta konfirmasi)                                                   |
| GET    | `/jobs/:id/transcript`           | transcript ternormalisasi                                                                             |
| GET    | `/jobs/:id/transcript.vtt`       | transcript sebagai WebVTT (track caption di pratinjau)                                                |
| GET    | `/jobs/:id/candidates`           | daftar kandidat klip                                                                                  |
| POST   | `/jobs/:id/clips`                | buat klip dari kandidat: `{ candidateId, startSec?, endSec? }`                                        |
| PATCH  | `/jobs/:id/clips/:clipId`        | ubah rentang (caption dibangun ulang, semua stage di-reset) atau caption saja (stage render di-reset) |
| POST   | `/jobs/:id/clips/:clipId/render` | jalankan track-faces → reframe → render                                                               |
| POST   | `/jobs/:id/clips/:clipId/cancel` | batalkan render klip                                                                                  |
| POST   | `/jobs/:id/clips/:clipId/reveal` | buka folder klip di file manager OS (khusus aplikasi lokal)                                           |
| DELETE | `/jobs/:id/clips/:clipId`        | hapus klip + foldernya                                                                                |
| GET    | `/jobs/:id/media/*`              | stream file dari folder job (mendukung HTTP Range, hanya di dalam folder job)                         |
| GET    | `/jobs/:id/events`               | **SSE**: `job-update` (snapshot job lengkap, termasuk klip) dan `job-deleted`                         |

Format error seragam: `{ error: { code: string, message: string } }` dengan HTTP status yang tepat (400 validasi, 404 tidak ada, 409 konflik state, 500 tak terduga). `message` berisi teks bahasa Indonesia untuk user.

**Antrian:** satu job berat diproses dalam satu waktu (CPU/GPU terbatas). Job lain berstatus `queued`. Implementasikan antrian sederhana di memori dan pulihkan dari `job.json` saat server start: stage yang berstatus `running` diubah menjadi `pending`, lalu dilanjutkan.

---

## 7. Detail Pipeline

Setiap stage berada di `apps/server/src/pipeline/stages/<stage>.ts`, idempoten, menulis log ke `logs/<stage>.log`, melaporkan progres (0..1), dan mencatat artefak di `job.json`.

### 7.1 `download` — yt-dlp

- Hanya untuk sumber URL. Validasi URL (`http`/`https`), lalu panggil dengan `--` sebelum URL agar tidak bisa dibaca sebagai flag.
- Argumen inti: `--no-playlist`, `-f "bv*[height<=1080]+ba/b[height<=1080]"`, `--merge-output-format mp4`, `--write-info-json`, `-o source/source.%(ext)s`, `--newline`, `--progress-template` untuk parsing progres.
- Untuk sumber file: salin atau pindahkan file upload ke `source/` (stream, jangan dibaca penuh ke memori).
- Ambil `title` dan `durationSec` dari info.json atau `ffprobe`.

### 7.2 `extract-audio` — ffmpeg

- `ffmpeg -i source.mp4 -vn -ac 2 -ar 44100 audio/audio_full.wav` (untuk demucs).
- Progres dihitung dari `-progress pipe:1` (`out_time_ms` dibagi durasi).

### 7.3 `separate-vocals` — demucs (worker Python)

- `python -m clipper_workers.separate_vocals --input audio/audio_full.wav --output audio/ --model htdemucs --device cpu`
- Di dalam worker: `demucs --two-stems=vocals -n <model> -d <device> -o <tmp>`, lalu pindahkan hasilnya ke `audio/vocals.wav` dan `audio/no_vocals.wav`.
- Untuk audio panjang, demucs boleh memakai `--segment` agar hemat memori. Progres diparse dari output demucs.

### 7.4 `denoise` — DeepFilterNet (worker Python)

- Dilewati (`skipped`) jika `settings.denoise = false`. Dalam kasus itu, `vocalsClean = vocals`.
- `python -m clipper_workers.denoise --input audio/vocals.wav --output audio/`
- Hasil dinamai ulang menjadi `audio/vocals_clean.wav`. Jangan bergantung pada nama file bawaan DeepFilterNet. Cari outputnya di folder sementara.

### 7.5 `transcribe` — whisper.cpp

- Konversi dulu: `ffmpeg -i audio/vocals_clean.wav -ar 16000 -ac 1 -c:a pcm_s16le audio/audio16k.wav`.
- `whisper-cli -m <model> -f audio16k.wav -l <lang> -t <threads> -ojf -of transcript/raw --print-progress` (`-ojf` = JSON lengkap dengan token dan timestamp).
- **Normalisasi** `raw.json` menjadi schema `Transcript`: gabungkan token sub-kata menjadi kata, buang token khusus (`[_BEG_]`, `[_TT_…]`), dan ubah waktu ke detik. Tulis hasilnya ke `transcript/transcript.json`.
- Fungsi normalisasi adalah fungsi murni dan **wajib diuji** dengan fixture `raw.json` kecil.

### 7.6 `find-moments` — scoring lokal & deterministik

Tanpa AI cloud. Algoritma di `apps/server/src/pipeline/moments/` dipecah menjadi fungsi murni yang diuji:

1. **Pecah kalimat:** satukan kata menjadi kalimat berdasarkan tanda baca akhir (`. ? !`) atau jeda > 0,7 detik.
2. **Bangkitkan jendela:** untuk setiap kalimat sebagai titik awal, perpanjang kalimat demi kalimat selama durasi ≤ `maxClipSec`. Simpan jendela dengan durasi di antara `minClipSec` dan `maxClipSec`. Awal dan akhir selalu jatuh di batas kalimat.
3. **Fitur per jendela** (dinormalisasi 0..1):
   - `hook`: kalimat pertama berupa pertanyaan, atau mengandung pola pembuka kuat (daftar kata di `packages/shared/src/moment-lexicon.ts`, ID + EN: "kenapa", "rahasia", "jangan", "ternyata", "masalahnya", "the truth", "nobody"…).
   - `energy`: rata-rata RMS dan variasi energi vokal pada rentang itu (dari worker `audio_energy.py`, yang dihitung sekali per job dengan resolusi 0,5 detik dan disimpan di `audio/energy.json`).
   - `speechDensity`: kata per detik, ideal 2,2–3,5.
   - `silencePenalty`: total jeda > 1,5 detik.
   - `completeness`: kalimat terakhir diakhiri tanda baca dan bukan kata sambung ("dan", "tapi", "jadi", "karena").
   - `durationFit`: kedekatan dengan `targetClipSec`.
   - `confidence`: rata-rata probabilitas kata dari whisper.
4. **Skor** = jumlah berbobot (bobot di `defaults.ts`, total 1) × 100. `reasons` (bahasa Indonesia) berisi maksimal 3 fitur yang lolos ambang, diurutkan dari yang paling membedakan kandidat ini dari kandidat lain (hook selalu pertama). Menampilkan semua fitur yang lolos membuat semua kandidat terlihat sama.
5. **Seleksi:** urutkan berdasarkan skor, ambil secara greedy tanpa tumpang tindih (overlap ≤ 20%), sebanyak maksimal `maxCandidates`.
6. Tulis ke `moments/candidates.json`. Setelah stage ini, status job berubah menjadi `ready`.

### 7.7 `track-faces` — OpenCV + Norfair (worker Python, per klip)

- `python -m clipper_workers.track_faces --input source.mp4 --start <s> --end <e> --model <yunet.onnx> --output clips/<id>/`
- Deteksi wajah dengan `cv2.FaceDetectorYN` (model YuNet) setiap ~5 fps (`DETECT_FPS = 5`). Frame diperkecil ke lebar 640 untuk kecepatan.
- Tracking dengan **Norfair** (`Tracker`, jarak euclidean pada titik pusat wajah) agar ID wajah stabil antar frame.
- **Pilih subjek per waktu:** utamakan wajah dengan aktivitas mulut terbesar (variasi landmark mulut dari YuNet), lalu pertimbangkan ukuran wajah. Pergantian subjek hanya diizinkan jika subjek baru dominan ≥ 1,0 detik (histeresis), supaya kamera tidak berganti-ganti.
- **Smoothing:** pusat crop dihaluskan dengan EMA + dead-zone (abaikan geseran < 3% lebar frame). Kecepatan pan dibatasi.
- Jika tidak ada wajah, pakai crop tengah.
- Output `faces.json`: `{ fps, sourceWidth, sourceHeight, crop: { width, height }, keyframes: [{ timeSec, centerX }] }`.
- Logika smoothing dan histeresis dibuat sebagai fungsi murni dan **wajib diuji** dengan pytest.

### 7.8 `reframe` — worker Python + ffmpeg pipe (per klip)

- `python -m clipper_workers.reframe --input source.mp4 --faces faces.json --start <s> --end <e> --output clips/<id>/`
- Baca frame dengan OpenCV, crop 9:16 setinggi penuh mengikuti `centerX` yang diinterpolasi per frame, resize ke **1080×1920**, lalu kirim frame mentah ke `ffmpeg` lewat stdin (`-f rawvideo -pix_fmt bgr24`) → `libx264 -crf 18 -preset medium -pix_fmt yuv420p`, **tanpa audio**. Jangan memakai `cv2.VideoWriter` karena kualitasnya buruk.
- Potong audio klip dari `vocals_clean.wav`. Jika `musicVolume > 0`, campur dengan `no_vocals.wav` × volume.
- Normalisasi ke −14 LUFS (true peak −2 dB): kompresor ringan → gain sebesar (target − hasil ukur) → limiter, lalu ukur hasilnya dan koreksi gain sampai selisih ≤ 0,5 LU. `loudnorm` saja tidak dipakai karena pada audio bicara ia jatuh ke mode dinamis dan hasilnya kurang (terukur −17 LUFS). Hasil: `clips/<id>/audio.wav`.

### 7.9 `render` — ffmpeg + subtitle ASS (per klip)

- Server menyusun file `captions.ass` (fungsi murni, diuji) dari `clip.captions`: resolusi 1080×1920, gaya sesuai `subtitleStyle`, teks di-escape agar tidak bisa menyisipkan tag ASS.
- `ffmpeg -i reframed.mp4 -i audio.wav -vf ass=captions.ass -c:v libx264 -crf 20 -c:a aac -b:a 192k -movflags +faststart -shortest final.mp4`, dijalankan dengan `cwd` di folder klip agar path filter tidak perlu di-escape (penting di Windows).
- **Pemecahan caption** (fungsi murni, diuji): dari kata-kata transcript dalam rentang klip, buat potongan berisi maksimal 3–5 kata / ±1,5 detik / maksimal 2 baris dengan ±18 karakter per baris. Jangan memotong di tengah frasa jika ada tanda baca.
- Gaya subtitle mengikuti `subtitleStyle`: huruf tebal, putih dengan outline atau latar gelap, dan berada di zona aman (tidak tertutup UI TikTok/Reels: hindari 15% bawah dan 10% atas).
- Output: `clips/<id>/final.mp4`. Verifikasi dengan `ffprobe` (durasi sesuai, ada stream video dan audio).

### 7.10 Pembatalan & error

- Setiap job punya `AbortController`. Cancel akan menghentikan proses anak (kill tree di Windows) dan menandai stage sebagai `cancelled`.
- Kegagalan: stage menjadi `failed`, `job.error` diisi `userMessage` yang jelas, misalnya "Video tidak bisa diunduh. Pastikan URL publik dan yt-dlp sudah versi terbaru." Log lengkap ada di file log dan bisa dibuka dari UI.

---

## 8. UI / UX (apps/web)

Saat membangun halaman, jalankan skill **hallmark** (`/hallmark`). Setelahnya, rapikan dengan prinsip **make-interfaces-feel-better**. Patuhi larangan anti-slop di CLAUDE.md bagian 5.

**Karakter visual:** alat kerja yang tenang dan padat informasi, seperti software editor video, bukan landing page. Gunakan tema gelap sebagai default (editor video umumnya gelap agar warna video terlihat akurat), dengan tema terang tersedia. Satu warna aksen. Tipografi jelas dengan angka `tabular-nums`.

**Halaman:**

1. **Beranda / Job baru** (`/`)
   - Input URL besar + tombol "Proses", atau area drop/pilih file video.
   - Pengaturan lanjutan dalam panel yang bisa dilipat: bahasa, durasi klip, jumlah kandidat, denoise, volume musik.
   - Di bawahnya, daftar job terakhir: judul, durasi, status, waktu dibuat.
   - Banner peringatan jika `/health` melaporkan ada tool yang hilang.

2. **Detail job** (`/jobs/:id`)
   - Header: judul, durasi, sumber, tombol Batalkan / Ulangi / Hapus.
   - Daftar stage vertikal dengan status, progres, dan durasi pengerjaan. Klik stage untuk melihat log.
   - Saat status `ready`: daftar **kandidat klip** berupa kartu berisi skor, rentang waktu, cuplikan teks, `reasons`, dan tombol "Pratinjau" serta "Jadikan klip".

3. **Editor klip** (`/jobs/:id/clips/:clipId`)
   - Kiri: pratinjau video sumber pada rentang klip (elemen `<video>` dengan media dari server).
   - Kanan: daftar caption yang bisa diedit inline. Kontrol geser awal/akhir per kalimat (tombol "kalimat sebelumnya/berikutnya", bukan slider bebas, supaya potongan selalu rapi).
   - Tombol **Render**, progres tiga stage per klip, lalu pratinjau `final.mp4` dalam bingkai 9:16, tombol Unduh, dan tombol buka folder.

**Status wajib di setiap tampilan data:** loading (skeleton yang sesuai bentuk konten), kosong (penjelasan + aksi berikutnya), dan error (pesan dari `userMessage` + tombol coba lagi).

---

## 9. Urutan Pembangunan (Fase)

Setiap fase diakhiri dengan: `check` lolos → kriteria terpenuhi → `SETUP.md` di-update bila perlu → **commit & push** (Conventional Commits).

### Fase 1 — Fondasi monorepo

- `package.json` root dengan workspaces, `tsconfig.base.json`, ESLint, Prettier, `.env.example`.
- Scaffold `apps/web` (Vite React TS), `apps/server` (Fastify TS), `packages/shared`, `workers/` (pyproject, ruff, pytest).
- `GET /api/health` yang memeriksa keberadaan dan versi setiap tool.
- Web menampilkan hasil health.
- **Selesai jika:** `npm run dev` menjalankan keduanya, halaman menampilkan status tool, `npm run check` dan `npm run check:py` lolos. SETUP.md bagian "Menjalankan aplikasi" sudah terisi.

### Fase 2 — Model data & job store

- Schema zod di `shared` (bagian 5) + `defaults.ts`.
- Job store berbasis file (tulis atomik), antrian satu-per-satu, pemulihan saat start, SSE.
- Endpoint CRUD job (tanpa stage nyata dulu, gunakan stage tiruan untuk menguji alur progres).
- **Selesai jika:** job bisa dibuat, progres tiruan tampil real-time di UI, dan job bertahan setelah server restart.

### Fase 3 — Helper proses & stage download + extract-audio

- `runProcess()` sesuai CODING_STANDARDS bagian 5, beserta test.
- Stage `download` (URL + upload file) dan `extract-audio`.
- Endpoint media dengan dukungan Range.
- **Selesai jika:** URL YouTube menghasilkan `source.mp4` + `audio_full.wav`, progres akurat, dan cancel benar-benar menghentikan proses.

### Fase 4 — Worker Python: separate-vocals & denoise

- Paket `clipper_workers` + kontrak JSON Lines + helper `emit()`.
- Wrapper server `runWorker()` di atas `runProcess()` yang memparse JSON Lines.
- **Selesai jika:** `vocals.wav`, `no_vocals.wav`, dan `vocals_clean.wav` terbentuk. Test pytest untuk parsing argumen dan emit lolos.

### Fase 5 — Transkrip

- Stage `transcribe` + normalisasi + test fixture.
- UI: tampilan transcript (bisa digulir, klik kalimat untuk melompat ke waktu di video).
- **Selesai jika:** transcript Bahasa Indonesia rapi dengan timestamp per kata.

### Fase 6 — Cari momen

- Worker `audio_energy` + modul `moments/` (pecah kalimat, jendela, fitur, skor, seleksi), semuanya fungsi murni dengan unit test.
- UI daftar kandidat + pratinjau rentang.
- **Selesai jika:** kandidat masuk akal pada contoh podcast nyata, tidak tumpang tindih, dan selalu berada di batas kalimat.

### Fase 7 — Klip, face tracking & reframe

- Endpoint klip, worker `track_faces` + `reframe`, test untuk smoothing dan histeresis.
- Unduh model YuNet → **update SETUP.md**.
- **Selesai jika:** `reframed.mp4` 1080×1920 mengikuti pembicara dengan gerakan halus pada video dua orang.

### Fase 8 — Subtitle & render (ffmpeg + ASS)

- Pemecah caption (fungsi murni + test), editor caption di UI, stage `render`.
- **Selesai jika:** `final.mp4` 9:16 dengan subtitle tersinkron, audio bersih, dan loudness konsisten.

### Fase 9 — Pemolesan UI

- Jalankan `/hallmark audit` pada setiap halaman dan perbaiki temuannya.
- Terapkan checklist make-interfaces-feel-better (radius konsentris, tabular-nums, transisi, area klik, reduced motion).
- Gunakan stageshow jika butuh tampilan demo produk.
- **Selesai jika:** tidak ada temuan "Floor" dari hallmark, semua halaman bisa dipakai dengan keyboard, dan tampilan rapi di lebar 1280 maupun 1920.

### Fase 10 — Ketahanan & dokumentasi

- Uji end-to-end dengan fixture, pesan error untuk semua kegagalan tool yang umum, pembersihan file sementara.
- Lengkapi SETUP.md (troubleshooting: yt-dlp kedaluwarsa, CUDA, PATH ffmpeg di Windows).
- **Selesai jika:** pengguna baru bisa setup dari nol hanya dengan SETUP.md, dan Definition of Done di CLAUDE.md terpenuhi.

---

## 10. Checklist Kualitas (setiap perubahan)

- [ ] Mengikuti CLAUDE.md dan CODING_STANDARDS.md.
- [ ] Tidak ada `any`, `exec`/shell string, `console.log`, code yang di-comment-out, atau string UI di luar `copy.ts`.
- [ ] Input user divalidasi (zod). Path dibatasi di dalam workspace.
- [ ] Logika murni punya unit test. Test lama tetap lolos.
- [ ] Error tool eksternal menghasilkan `userMessage` yang jelas di UI.
- [ ] UI memiliki state loading, kosong, dan error, serta lolos aturan aksesibilitas.
- [ ] `SETUP.md` diperbarui jika cara setup berubah. Dokumen ini diperbarui jika spesifikasi berubah.
- [ ] Commit (Conventional Commits) **dan push**.
