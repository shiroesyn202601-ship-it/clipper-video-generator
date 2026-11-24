# Panduan Setup (Lokal)

> **Aturan:** setiap perubahan yang mengubah cara setup (dependency, versi, env var, script, model, folder)
> wajib meng-update file ini di commit yang sama. Lihat [CLAUDE.md](CLAUDE.md) bagian 3.

Setelah semua langkah selesai, buka aplikasi dan pastikan halaman **Status tools** menampilkan semua tool dengan status siap (titik hijau).

---

## 1. Prasyarat

| Tool                         | Versi                                                                                         | Cek                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| Git                          | terbaru                                                                                       | `git --version`                        |
| Node.js                      | **≥ 22.18** (disarankan 24 LTS), karena server memakai type stripping bawaan Node             | `node -v`                              |
| Python                       | **3.11** (versi yang diuji dengan torch 2.1.2)                                                | `python --version`                     |
| ffmpeg + ffprobe             | terbaru, ada di PATH, build dengan **libass** (Gyan "full", Homebrew, dan apt sudah termasuk) | `ffmpeg -version` · `ffprobe -version` |
| Deno                         | terbaru, ada di PATH. Dipakai yt-dlp untuk memecahkan tantangan JavaScript YouTube            | `deno --version`                       |
| (macOS/Linux) CMake + C/C++  | untuk build whisper.cpp                                                                       | `cmake --version`                      |
| (Opsional) GPU NVIDIA + CUDA | mempercepat demucs & whisper                                                                  | `nvidia-smi`                           |

### Windows

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.11
winget install Gyan.FFmpeg
winget install DenoLand.Deno
```

Tutup lalu buka ulang terminal setelah instalasi agar PATH ter-update. Di Windows, whisper.cpp memakai binary resmi siap pakai, jadi **tidak perlu** CMake atau Visual Studio Build Tools.

### macOS

```bash
brew install git node python@3.11 ffmpeg cmake deno
```

### Linux (Debian/Ubuntu)

```bash
sudo apt install git nodejs npm python3.11 python3.11-venv ffmpeg cmake build-essential
curl -fsSL https://deno.land/install.sh | sh   # Deno
```

---

## 2. Clone repo & dependency Node

```bash
git clone https://github.com/shiroesyn202601-ship-it/clipper-video-generator.git
cd clipper-video-generator
npm install
```

---

## 3. Python environment (yt-dlp, demucs, DeepFilterNet, OpenCV, Norfair)

Semua versi dipin di [workers/requirements.txt](workers/requirements.txt).

```bash
# Windows
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install --upgrade pip
.venv\Scripts\python -m pip install -r workers/requirements-dev.txt

# macOS / Linux
python3.11 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r workers/requirements-dev.txt
```

> **Jangan menaikkan versi torch/torchaudio sendiri.** DeepFilterNet 0.5.6 masih memakai API `torchaudio.backend`
> yang sudah dihapus setelah torchaudio 2.1. Peringatan `torchaudio.backend.common.AudioMetaData has been moved` saat
> DeepFilterNet dijalankan itu normal.
>
> Untuk GPU NVIDIA: setelah langkah di atas, pasang `torch==2.1.2`/`torchaudio==2.1.2` versi CUDA dari
> https://pytorch.org/get-started/previous-versions/, lalu set `DEMUCS_DEVICE=cuda` di `.env`.

Cek:

```bash
.venv/Scripts/yt-dlp --version            # macOS/Linux: .venv/bin/yt-dlp
.venv/Scripts/python -c "import cv2, norfair, demucs, df; print('ok')"
```

> **Unduhan otomatis saat pertama kali dipakai:** model Demucs `htdemucs` (±80 MB, ke `~/.cache/torch/hub`) dan
> model DeepFilterNet3 (±10 MB, ke cache DeepFilterNet) diunduh sekali saat job pertama berjalan. Butuh koneksi internet.
>
> **Perkiraan waktu di CPU:** pemisahan suara Demucs ±1× durasi audio (podcast 1 jam ≈ 1 jam). GPU NVIDIA
> mempercepat jauh (lihat catatan GPU di atas).

---

## 4. whisper.cpp (transkrip) + model

Semua file di folder `tools/` tidak di-commit.

### Windows: binary resmi

1. Unduh `whisper-blas-bin-x64.zip` dari https://github.com/ggml-org/whisper.cpp/releases (yang sudah diuji: rilis `b5907`).
2. Ekstrak isi folder `Release/` ke `tools/whisper-bin/`, sehingga ada file `tools/whisper-bin/whisper-cli.exe`.

```powershell
New-Item -ItemType Directory -Force tools\tmp | Out-Null
Invoke-WebRequest https://github.com/ggml-org/whisper.cpp/releases/download/b5907/whisper-blas-bin-x64.zip -OutFile tools\tmp\whisper.zip
Expand-Archive tools\tmp\whisper.zip -DestinationPath tools\tmp
Move-Item tools\tmp\Release tools\whisper-bin
Remove-Item -Recurse tools\tmp
```

### macOS / Linux: build dari source

```bash
mkdir -p tools && cd tools
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build            # tambahkan -DGGML_CUDA=1 jika memakai GPU NVIDIA
cmake --build build --config Release -j
cd ../..
```

### Model Whisper (semua OS)

Model disimpan di `tools/whisper.cpp/models/ggml-medium.bin` (±1,5 GB; `medium` cukup akurat untuk Bahasa Indonesia).

```bash
mkdir -p tools/whisper.cpp/models
curl -L -o tools/whisper.cpp/models/ggml-medium.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin
```

---

## 5. Model deteksi wajah (YuNet)

```bash
mkdir -p tools/models
curl -L -o tools/models/face_detection_yunet_2023mar.onnx https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
```

---

## 6. Konfigurasi `.env`

```bash
cp .env.example .env
```

Default sudah sesuai dengan langkah di atas untuk Windows. Untuk macOS/Linux, ubah `PYTHON_BIN`, `YTDLP_BIN`, dan `WHISPER_BIN` sesuai komentar di file tersebut. Path relatif dihitung dari root repo. Jika `.env` tidak ada, server memakai nilai default yang sama.

---

## 7. Skill UI untuk Claude Code

Dipakai saat mengerjakan UI (lihat [CLAUDE.md](CLAUDE.md) bagian 4). Jalankan dari root repo:

```bash
npx skills add nutlope/hallmark --agent claude-code
npx skills add jakubkrehel/make-interfaces-feel-better
npx skills add benjitaylor/skills --skill stageshow
```

Tambahkan `-g` bila ingin dipasang global untuk semua project. Folder `.claude/skills/` tidak di-commit (kode pihak ketiga);
versi yang sudah direview dicatat di `skills-lock.json`.
Opsional untuk pengecekan visual hallmark: `npm i -g puppeteer-core` + Google Chrome.

---

## 8. Menjalankan aplikasi

### Mode pengembangan

```bash
npm run dev
```

- Web: http://127.0.0.1:5173 (Vite, hot reload)
- Server API: http://127.0.0.1:5174/api (restart otomatis saat file berubah)

### Mode pakai (satu proses)

```bash
npm run build
npm start
```

Lalu buka http://127.0.0.1:5174.

### Pemeriksaan kualitas

```bash
npm run check       # lint + format + typecheck + test (TypeScript)
npm run check:py    # ruff + pytest (Python worker)
```

---

## 9. Checklist akhir

- [ ] `node -v` ≥ 22.18, `ffmpeg -version` berjalan
- [ ] `npm install` sukses
- [ ] `.venv` terbentuk dan `import cv2, norfair, demucs, df` sukses
- [ ] `tools/whisper-bin/whisper-cli.exe` (Windows) atau `tools/whisper.cpp/build/bin/whisper-cli` ada
- [ ] `tools/whisper.cpp/models/ggml-medium.bin` dan `tools/models/face_detection_yunet_2023mar.onnx` ada
- [ ] `npm run dev`, lalu halaman Status tools menampilkan semua tool dengan status siap

---

## 10. Troubleshooting

| Gejala                                         | Penyebab & solusi                                                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ffmpeg` "Belum ada" padahal sudah di-install  | Terminal atau VS Code dibuka sebelum instalasi. Tutup semua terminal/VS Code lalu buka lagi.                                                                                 |
| yt-dlp gagal mengunduh                         | YouTube sering berubah. Perbarui dengan `.venv/Scripts/python -m pip install -U "yt-dlp[default]"`. Pastikan `deno --version` berjalan (status tools menampilkan Deno siap). |
| Log yt-dlp berisi "n challenge solving failed" | Deno belum ada di PATH atau paket `yt-dlp-ejs` belum terpasang. Pasang Deno, lalu ulangi `pip install -r workers/requirements.txt`.                                          |
| `ModuleNotFoundError: torchaudio.backend`      | torchaudio terlalu baru. Ulangi `pip install -r workers/requirements.txt`.                                                                                                   |
