# Aturan Penulisan Code (Coding Standards)

Dokumen ini **mengikat**. Semua code di repo ini, baik yang ditulis manusia maupun AI, wajib mengikuti aturan di sini.
Tujuannya: siapa pun yang melanjutkan project di kemudian hari menulis code dengan **gaya yang sama**, dan hasil program tetap **konsisten**.

Urutan prioritas jika ada konflik: **CLAUDE.md → CODING_STANDARDS.md → PROMPT_GENERATE_APP.md → selera pribadi.**

Kata kunci:

- **WAJIB** = tidak boleh dilanggar. Pelanggaran dianggap bug.
- **DIANJURKAN** = default. Boleh menyimpang hanya dengan alasan yang ditulis di komentar atau di pesan commit.
- **DILARANG** = tidak boleh ada di codebase.

---

## 1. Prinsip Umum

1. **Sederhana dulu.** Tulis solusi paling sederhana yang benar. Jangan membuat abstraksi untuk kebutuhan yang belum ada.
2. **Satu sumber kebenaran.** Tipe data, konstanta, dan konfigurasi didefinisikan sekali lalu di-import. Jangan copy-paste.
3. **Eksplisit lebih baik dari implisit.** Nama jelas, tipe jelas, alur jelas. Tidak ada "magic".
4. **Gagal dengan jelas.** Error tidak boleh ditelan diam-diam. Setiap error punya pesan yang bisa dibaca manusia.
5. **Deterministik.** Input yang sama harus menghasilkan output yang sama. Setiap angka acak atau heuristik diberi seed atau ditulis sebagai konstanta.
6. **Ubah seperlunya.** Saat memperbaiki atau menambah fitur, ubah hanya yang relevan. Refactor besar dikerjakan di commit terpisah.

---

## 2. Bahasa & Penamaan

### Bahasa

- **Code** (nama variabel, fungsi, file, tipe, komentar teknis) WAJIB dalam **bahasa Inggris**.
- **Teks yang dilihat user** (label UI, pesan error di UI) dalam **bahasa Indonesia**, dan dikumpulkan di `apps/web/src/lib/copy.ts`. Jangan menyebar string UI di banyak komponen.
- **Dokumentasi** (`*.md`) dalam bahasa Indonesia.

### Konvensi nama

| Hal                              | Format                             | Contoh                       |
| -------------------------------- | ---------------------------------- | ---------------------------- |
| File komponen React              | `PascalCase.tsx`                   | `ClipCard.tsx`               |
| File non-komponen TS             | `kebab-case.ts`                    | `job-store.ts`               |
| File Python                      | `snake_case.py`                    | `face_track.py`              |
| Folder                           | `kebab-case`                       | `clip-review/`               |
| Komponen, tipe, interface, class | `PascalCase`                       | `JobStatus`, `ClipCandidate` |
| Fungsi & variabel (TS)           | `camelCase`                        | `findMoments()`              |
| Fungsi & variabel (Python)       | `snake_case`                       | `track_faces()`              |
| Konstanta global                 | `UPPER_SNAKE_CASE`                 | `MAX_CLIP_SECONDS`           |
| Boolean                          | awali `is/has/can/should`          | `isRendering`, `hasFace`     |
| Event handler React              | `handleX` (di dalam), `onX` (prop) | `handleSubmit`, `onSubmit`   |
| Custom hook                      | `useX`                             | `useJobProgress`             |
| ID stage pipeline                | `kebab-case` string literal        | `"separate-vocals"`          |

- Satuan WAJIB ditulis di nama jika ada ambiguitas: `durationSec`, `startMs`, `widthPx`, `fileSizeBytes`.
- **Waktu internal selalu dalam detik (float) dengan nama berakhiran `Sec`.** Konversi ke ms/frame hanya di tepi sistem (saat memanggil tool).
- DILARANG singkatan yang tidak umum (`clpCnd`, `tmpVal2`). Singkatan yang boleh: `id`, `url`, `fps`, `ms`, `sec`, `px`, `ui`, `api`.

---

## 3. TypeScript (web & server)

### Konfigurasi

- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`.
- Modul: **ESM** (`"type": "module"`). Import relatif **selalu menyertakan ekstensi `.ts`/`.tsx`**
  (`import { config } from "./config.ts"`). Server dijalankan langsung oleh Node (type stripping, Node ≥ 22.18)
  tanpa langkah build, jadi hanya sintaks TS yang bisa dihapus (`erasableSyntaxOnly`): DILARANG `enum`,
  `namespace`, dan parameter property di constructor.

### Aturan

- **DILARANG `any`.** Untuk data yang belum diketahui, pakai `unknown` lalu validasi dengan **zod**.
- **DILARANG** non-null assertion `!` kecuali ada komentar alasannya.
- **DILARANG** `@ts-ignore`. Kalau terpaksa, pakai `@ts-expect-error` dengan komentar alasan.
- Gunakan `type` untuk bentuk data dan `interface` hanya untuk kontrak yang di-extend. Pilih satu per kasus dan konsisten.
- Tipe yang dipakai bersama web dan server ditaruh di **`packages/shared`**, berupa **zod schema** + tipe hasil `z.infer`. Jangan menulis tipe yang sama dua kali.
- Union string literal lebih disukai daripada `enum`:
  ```ts
  export const STAGE_IDS = [
    "download",
    "extract-audio",
    "separate-vocals",
    "denoise",
    "transcribe",
    "find-moments",
    "track-faces",
    "reframe",
    "render",
  ] as const;
  export type StageId = (typeof STAGE_IDS)[number];
  ```
- Fungsi publik (di-export) WAJIB punya tipe return eksplisit.
- Parameter lebih dari 3 → gunakan satu objek bernama (`function renderClip(options: RenderClipOptions)`).
- Gunakan `async/await`. DILARANG mencampur dengan `.then()` di fungsi yang sama.
- Promise WAJIB di-`await` atau ditangani. DILARANG floating promise (aktifkan rule ESLint `no-floating-promises`).
- Lebih suka `const`. `let` hanya jika memang di-reassign. DILARANG `var`.
- Lebih suka fungsi murni dan data immutable. Hindari mutasi parameter.
- DILARANG `export default`, kecuali jika diwajibkan oleh tool (mis. file config Vite). Gunakan named export.

### Error handling

- Error domain memakai class turunan `AppError` dengan field `code` (string stabil, mis. `"YTDLP_FAILED"`), `message` (bahasa Inggris untuk log), dan `userMessage` (bahasa Indonesia untuk UI).
- `try/catch` hanya di tempat yang benar-benar bisa menangani atau menambah konteks. Jangan membungkus semua hal.
- DILARANG `catch (e) {}` kosong.

---

## 4. React (apps/web)

### Struktur

```
apps/web/src/
  app/            # router, provider, layout utama
  pages/          # satu folder per halaman (route)
  features/       # logika + komponen per fitur (job, clips, settings)
  components/ui/  # komponen dasar reusable (Button, Card, Progress…)
  lib/            # api client, copy.ts, format.ts, util umum
  styles/         # tokens.css, global.css
```

- Satu komponen per file. Nama file = nama komponen.
- File komponen DIANJURKAN di bawah ±200 baris. Jika lebih, pecah.

### Pola wajib

- Hanya **function component** + hooks. DILARANG class component.
- Props diberi tipe `type XProps = {...}` tepat di atas komponen.
- **Server state** (data dari API) WAJIB lewat **TanStack Query**. DILARANG `useEffect` + `fetch` manual untuk ambil data.
- **UI state lokal** memakai `useState`/`useReducer`. Tidak memakai global store. Jika suatu saat perlu, ajukan dulu sesuai CLAUDE.md.
- Progres real-time memakai **SSE** (`EventSource`) yang dibungkus di satu hook (`useJobEvents`). Hook ini meng-update cache TanStack Query.
- Semua panggilan HTTP lewat `apps/web/src/lib/api.ts`. Komponen DILARANG memanggil `fetch` langsung.
- `useEffect` hanya untuk sinkronisasi dengan sistem luar (SSE, video element, event listener). Bukan untuk menghitung state turunan.
- `key` pada list WAJIB memakai ID yang stabil, bukan index array.
- Tidak memakai `useMemo`/`useCallback` secara refleks. Pakai hanya jika ada masalah performa yang terukur atau dibutuhkan untuk referential equality.

### Styling

- **CSS Modules** (`Component.module.css`) + CSS custom properties di `styles/tokens.css`.
- WAJIB memakai token (warna, spacing, radius, font, durasi animasi). DILARANG hardcode nilai warna atau spacing di komponen.
- Skala spacing: `4 8 12 16 24 32 48 64` px. Skala radius mengikuti aturan **radius konsentris** (luar = dalam + padding).
- Angka yang berubah (timestamp, durasi, persen) WAJIB memakai `font-variant-numeric: tabular-nums`.
- Transisi: sebutkan properti spesifik. DILARANG `transition: all`. Efek tekan `transform: scale(0.96)`.
- WAJIB menghormati `@media (prefers-reduced-motion: reduce)`.
- Ikuti aturan anti-slop di CLAUDE.md bagian 5.

### Audit UI (hallmark sloplint)

Jalankan audit statis sebelum menyelesaikan pekerjaan UI (skill terpasang, SETUP.md langkah 7):

```bash
node .claude/skills/hallmark/scripts/sloplint.mjs apps/web/src apps/web/index.html --scope app --genre modern-minimal
```

Semua temuan WAJIB diperbaiki, kecuali waiver yang sudah disetujui berikut:

| Kode | Waiver                                     | Alasan                                                                                                            |
| ---- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 19   | Tanda "–" pada rentang waktu (`4:16–4:50`) | En dash untuk rentang angka adalah konvensi tipografi, bukan tanda pisah di kalimat                               |
| 20   | Tidak ada stempel Hallmark di CSS          | Stempel hanya untuk halaman yang dibangun lewat alur Hallmark; app ini punya design system sendiri (`tokens.css`) |
| 28b  | Video tanpa `poster`                       | `preload="metadata"` sudah menampilkan frame pertama, dan video bukan LCP                                         |

Waiver baru hanya boleh ditambahkan ke tabel ini dengan alasan yang jelas.

### Aksesibilitas (WAJIB)

- Elemen interaktif memakai elemen semantik (`button`, `a`, `input`). DILARANG `div` dengan `onClick`.
- Setiap input punya `label`. Setiap ikon tanpa teks punya `aria-label`.
- Fokus keyboard terlihat jelas (`:focus-visible`).
- Kontras teks minimal WCAG AA.
- Area klik minimal 40×40px (desktop) / 44×44px (sentuh).

---

## 5. Node.js Server (apps/server)

### Struktur

```
apps/server/src/
  index.ts          # bootstrap saja: load config, buat app, listen
  config.ts         # baca & validasi env (zod), export objek config beku
  http/             # route Fastify (tipis: validasi → panggil service → balas)
  jobs/             # job store, queue, state machine
  pipeline/
    run-pipeline.ts # orkestrator stage
    stages/         # satu file per stage: download.ts, transcribe.ts, ...
  tools/            # wrapper proses eksternal: run-process.ts, ytdlp.ts, whisper.ts, ...
  lib/              # logger, errors, fs helpers
```

### Aturan

- **Route tipis.** Route hanya memvalidasi input (zod), memanggil service, lalu mengembalikan response. Logika bisnis tidak boleh ada di route.
- Semua env dibaca **hanya** di `config.ts`. File lain DILARANG membaca `process.env`.
- **Proses eksternal WAJIB lewat satu helper `runProcess()`** di `tools/run-process.ts`, yang:
  - memakai `child_process.spawn(command, args[])` dengan **`shell: false`**;
  - mengalirkan stdout/stderr ke file log job;
  - mendukung `AbortSignal` untuk membatalkan job;
  - melempar `AppError` berisi exit code dan 20 baris terakhir stderr jika gagal.
- DILARANG `exec`, `execSync`, atau menyusun perintah sebagai string shell.
- Input dari user (URL, nama file) WAJIB divalidasi: URL harus `http(s)`, nama file disanitasi. DILARANG mengoper input user sebagai flag CLI (argumen yang diawali `-`).
- Semua path dibentuk dengan `node:path` dan berakar di `config.workspaceDir`. Tolak path yang keluar dari workspace (path traversal).
- Server hanya listen di `127.0.0.1`.
- Logging memakai logger bawaan Fastify (pino), dengan format terstruktur dan field `jobId` serta `stage`. DILARANG `console.log` di code final.
- File I/O memakai `node:fs/promises`. Penulisan file state (`job.json`) WAJIB atomik: tulis ke `*.tmp`, lalu `rename`.

---

## 6. Python Workers (workers/)

### Struktur

```
workers/
  pyproject.toml          # konfigurasi ruff, pytest
  requirements.txt        # versi dipin
  clipper_workers/
    __init__.py
    common/               # io.py (emit progress/result), errors.py
    separate_vocals.py    # demucs
    denoise.py            # DeepFilterNet
    track_faces.py        # OpenCV + Norfair
    reframe.py            # tulis video 9:16 lewat ffmpeg pipe
    audio_energy.py       # fitur energi audio untuk scoring momen
  tests/
```

### Kontrak CLI worker (WAJIB sama untuk semua worker)

- Dijalankan sebagai modul: `python -m clipper_workers.<name> --input <path> --output <path> [--opsi]`.
- Argumen diparse dengan `argparse`. Semua path di-resolve dengan `pathlib.Path`.
- **stdout hanya berisi JSON Lines**:
  ```json
  {"type": "progress", "percent": 42.5, "message": "Tracking faces"}
  {"type": "result", "outputs": {"video": "workspace/abc/clips/c1/reframed.mp4"}}
  ```
- Log manusia dan debug ditulis ke **stderr**.
- Exit code `0` = sukses. Selain `0` = gagal, dan baris terakhir stdout berisi `{"type": "error", "code": "...", "message": "..."}`.
- Worker DILARANG memanggil server, membaca state job, atau menulis di luar folder `--output`.

### Gaya

- Python 3.10+, **type hints wajib** di semua fungsi.
- Format & lint memakai **ruff** (`ruff format`, `ruff check`). Panjang baris 100.
- Gunakan `dataclass(frozen=True)` untuk struktur data.
- Konstanta tuning (threshold, smoothing) ditaruh di atas file sebagai `UPPER_SNAKE_CASE` dengan komentar satuan.
- DILARANG `print()` untuk log. Pakai `logging` (ke stderr) atau helper `emit()` (ke stdout).

---

## 7. Pipeline & Data

- Setiap stage adalah fungsi dengan kontrak: `run(ctx: StageContext): Promise<StageResult>`.
- Stage WAJIB **idempoten**. Status `done`/`skipped` di `job.json` adalah penanda selesai: saat job dilanjutkan, stage itu di-skip. Stage menulis output ke file sementara lalu rename, sehingga file setengah jadi tidak pernah dianggap selesai.
- Stage hanya membaca output stage sebelumnya **lewat path yang tercatat di `job.json`**, bukan dengan menebak nama file.
- Layout workspace WAJIB tetap:
  ```
  workspace/<jobId>/
    job.json
    logs/<stage>.log
    source/        # video asli + info.json
    audio/         # audio.wav (16k mono), vocals.wav, no_vocals.wav, vocals_clean.wav
    transcript/    # transcript.json (ternormalisasi)
    moments/       # candidates.json
    clips/<clipId>/ faces.json, reframed.mp4, audio.wav, captions.ass, final.mp4
  ```
- Format data antar stage (transcript, candidates, faces) didefinisikan sebagai zod schema di `packages/shared`. Output tool mentah WAJIB **dinormalisasi** ke schema ini sebelum disimpan.
- Semua parameter tuning (durasi klip, jumlah kandidat, model whisper, bahasa) ada di `packages/shared/src/defaults.ts` dan bisa di-override per job.

---

## 8. Testing

- **TS**: Vitest. **React**: Vitest + Testing Library. **Python**: pytest.
- Wajib diuji (unit test):
  - logika murni: scoring momen, pemecahan subtitle, smoothing crop, normalisasi transcript, validasi input;
  - helper `runProcess` (gunakan perintah palsu kecil).
- Integration test pipeline memakai fixture video pendek (≤10 detik) di `fixtures/`, dan boleh di-skip jika tool eksternal tidak terpasang (`it.skipIf`).
- Nama test menjelaskan perilaku: `it("aligns clip end to sentence boundary")`.
- Bug yang diperbaiki WAJIB disertai test yang sebelumnya gagal.

---

## 9. Format, Lint, dan Script

- **Prettier** (default + `printWidth: 100`) untuk TS/TSX/CSS/JSON/MD.
- **ESLint** (flat config) dengan `typescript-eslint` strict, `react-hooks`, `jsx-a11y`.
- Sebelum commit WAJIB lolos:
  ```bash
  npm run check        # = lint + typecheck + test (semua workspace)
  npm run check:py     # = ruff check + ruff format --check + pytest
  ```
- Jangan menonaktifkan rule lint per baris tanpa komentar alasan.

---

## 10. Git & Commit

- Mengikuti CLAUDE.md: setiap perubahan atas perintah user langsung di-**commit & push**.
- Format pesan commit: **Conventional Commits** dalam bahasa Inggris.
  ```
  feat(pipeline): add face tracking stage
  fix(web): keep progress bar from jumping backwards
  docs(setup): document YuNet model download
  refactor(server): extract runProcess helper
  chore(deps): pin demucs to 4.0.1
  ```
  Scope yang dipakai: `web`, `server`, `shared`, `workers`, `pipeline`, `setup`, `docs`, `deps`.
- Satu commit = satu perubahan logis. Jangan mencampur fitur dengan refactor.
- Perubahan cara setup → `SETUP.md` ikut di commit yang sama.

---

## 11. Dependency

- Daftar library yang disetujui ada di CLAUDE.md bagian 2. Library di luar daftar WAJIB diajukan ke user dulu.
- Versi dipin di lockfile (`package-lock.json`) dan di `requirements.txt` (`==`).
- Sebelum menambah dependency, pastikan kebutuhan tidak bisa dipenuhi dengan standard library atau dependency yang sudah ada.

---

## 12. Komentar & Dokumentasi Code

- Komentar menjelaskan **kenapa**, bukan **apa**. Code yang jelas tidak perlu komentar "apa".
- Fungsi publik yang tidak trivial diberi JSDoc / docstring singkat (1–3 baris).
- Angka ajaib WAJIB diberi nama konstanta atau komentar asalnya.
- DILARANG meninggalkan code yang di-comment-out. Hapus saja, karena riwayatnya tersimpan di git.
- `TODO` wajib berformat `TODO(scope): penjelasan`.
