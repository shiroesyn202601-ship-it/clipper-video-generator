# Panduan Setup (Lokal)

> **Aturan:** setiap perubahan yang mengubah cara setup (dependency, versi, env var, script, model, folder)
> wajib meng-update file ini di commit yang sama. Lihat [CLAUDE.md](CLAUDE.md) bagian 3.

Status saat ini: **tahap persiapan tools.** Kode aplikasi (`apps/web`, `apps/server`, `workers/`) belum dibuat.
Langkah di bawah menyiapkan semua tool yang akan dipakai.

---

## 1. Prasyarat

| Tool | Versi | Cek |
|------|-------|-----|
| Git | terbaru | `git --version` |
| Node.js | LTS (≥ 20) | `node -v` |
| Python | 3.10 – 3.11 (disarankan, kompatibel dengan demucs & DeepFilterNet) | `python --version` |
| ffmpeg + ffprobe | terbaru, ada di PATH | `ffmpeg -version` · `ffprobe -version` |
| CMake + compiler C/C++ | untuk build whisper.cpp | `cmake --version` |
| (Opsional) GPU NVIDIA + CUDA | mempercepat demucs & whisper | `nvidia-smi` |

### Windows
```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.11
winget install Gyan.FFmpeg
winget install Kitware.CMake
# Compiler: install "Visual Studio Build Tools" dengan workload "Desktop development with C++"
winget install Microsoft.VisualStudio.2022.BuildTools
```
Tutup & buka ulang terminal setelah instalasi agar PATH ter-update.

### macOS
```bash
brew install git node python@3.11 ffmpeg cmake
```

### Linux (Debian/Ubuntu)
```bash
sudo apt install git nodejs npm python3.11 python3.11-venv ffmpeg cmake build-essential
```

---

## 2. Clone repo

```bash
git clone https://github.com/shiroesyn202601-ship-it/clipper-video-generator.git
cd clipper-video-generator
```

---

## 3. Python environment (yt-dlp, demucs, DeepFilterNet, OpenCV, Norfair)

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

python -m pip install --upgrade pip
pip install yt-dlp demucs deepfilternet opencv-python norfair
```

> Untuk GPU NVIDIA, install PyTorch versi CUDA **sebelum** demucs sesuai petunjuk https://pytorch.org/get-started/locally/

Cek:
```bash
yt-dlp --version
demucs --help
deepFilter --help
python -c "import cv2, norfair; print(cv2.__version__)"
```

---

## 4. whisper.cpp (transkrip)

Build di dalam folder `tools/` (folder ini tidak di-commit):

```bash
mkdir -p tools && cd tools
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build            # tambahkan -DGGML_CUDA=1 jika memakai GPU NVIDIA
cmake --build build --config Release
```

Unduh model (contoh `medium` — cukup akurat untuk Bahasa Indonesia):
```bash
# macOS / Linux
sh ./models/download-ggml-model.sh medium
# Windows (PowerShell)
.\models\download-ggml-model.cmd medium
```

Cek (binary ada di `build/bin/`, di Windows `build/bin/Release/`):
```bash
./build/bin/whisper-cli -m models/ggml-medium.bin -f samples/jfk.wav
```

---

## 5. editly (subtitle + render)

```bash
npm i -g editly
editly --help
```
editly membutuhkan `ffmpeg` dan `ffprobe` di PATH (langkah 1). Nanti di `apps/server` editly juga dipasang sebagai dependency project.

---

## 6. Skill UI untuk Claude Code

Dipakai saat mengerjakan UI (lihat [CLAUDE.md](CLAUDE.md) bagian 4). Jalankan dari root repo:

```bash
npx skills add nutlope/hallmark --agent claude-code
npx skills add jakubkrehel/make-interfaces-feel-better
npx skills add benjitaylor/skills --skill stageshow
```

Tambahkan `-g` bila ingin dipasang global untuk semua project.
Opsional untuk pengecekan visual hallmark: `npm i -g puppeteer-core` + Google Chrome.

---

## 7. Checklist akhir

- [ ] `node -v`, `python --version`, `ffmpeg -version` berjalan
- [ ] `yt-dlp`, `demucs`, `deepFilter` berjalan di dalam `.venv`
- [ ] `import cv2, norfair` sukses
- [ ] whisper.cpp ter-build dan model `ggml-medium.bin` ada di `tools/whisper.cpp/models/`
- [ ] `editly --help` berjalan
- [ ] Skill hallmark, make-interfaces-feel-better, stageshow terpasang

---

## 8. Menjalankan aplikasi

_Belum tersedia — akan diisi saat `apps/web` dan `apps/server` dibuat._
