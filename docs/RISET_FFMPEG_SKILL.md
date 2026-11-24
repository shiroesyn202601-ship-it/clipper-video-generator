# Riset: ffmpeg-skill untuk Clipper Video Podcast

- **Tanggal:** 24 November 2026
- **Yang diteliti:** https://github.com/kajisho5/ffmpeg-skill (v4.7.1, rilis 23 Nov 2026, lisensi MIT)
- **Pertanyaan:**
  1. Apakah cocok dimasukkan ke project ini?
  2. Kalau cocok, apakah dia mengisi ruang kosong atau menggantikan fungsi yang sudah ada?
  3. Apakah transkrip bisa lebih cepat dan lebih akurat dengan ffmpeg-skill?
  4. Kalau menggantikan, mana yang hasil klipnya lebih baik?
- **Tolok ukur:** kualitas klip, bukan kecepatan proses. Klip harus siap pakai, dipotong di momen yang bagus,
  dan enak ditonton sampai habis tanpa di-skip.

---

## 1. Ringkasan jawaban

| Pertanyaan                                | Jawaban singkat                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cocok dipasang sebagai komponen?          | **Tidak.** ffmpeg-skill dibuat sebagai _alat bantu agen AI_ (Claude Code, Cursor) yang mengedit video lewat percakapan. Ia bukan library untuk pipeline otomatis seperti aplikasi kita. Isinya 42 script Python (±42.000 baris) dan 30 di antaranya masih berstatus _beta_. Memasangnya juga berarti menambah tool baru, yang menurut CLAUDE.md §3.4 butuh persetujuan.                                                  |
| Mengisi ruang kosong atau menggantikan?   | **Dua-duanya, tapi tidak seimbang.** Bagian yang _menggantikan_ (cari momen, crop wajah, pembersih suara) **lebih lemah** dari yang kita punya. Bagian yang _mengisi ruang kosong_ (subtitle karaoke per kata, buang jeda/kata pengisi di dalam klip, kartu _hook_ di detik awal) memang berguna. Tapi semua itu bisa kita bangun sendiri dengan ffmpeg + ASS yang sudah ada, tanpa tool baru.                           |
| Transkrip lebih cepat dan akurat?         | **Tidak.** ffmpeg-skill tidak punya mesin transkrip sendiri. Ia hanya memanggil whisper.cpp (atau faster-whisper/Parakeet), dan model bawaannya `base`, yang lebih kecil dan **kurang akurat** dari `medium` yang kita pakai. Satu hal yang layak diambil: flag `-mc 0` untuk mencegah teks halusinasi berulang di audio panjang. Percepatan yang sebenarnya datang dari pengaturan whisper.cpp kita sendiri (bagian 4). |
| Kalau menggantikan, mana yang lebih baik? | **Pipeline kita lebih baik** untuk tiga hal yang paling menentukan apakah klip ditonton: memilih momen, mengikuti wajah, dan kebersihan suara. ffmpeg-skill lebih baik hanya di **tampilan subtitle** (animasi dan sorotan per kata).                                                                                                                                                                                    |

**Rekomendasi:** jangan pasang ffmpeg-skill. Ambil 4 idenya dan bangun di kode kita (bagian 6), lalu ubah
pengaturan whisper.cpp (bagian 4).

---

## 2. Apa itu ffmpeg-skill

- _Agent Skill_ + server MCP. File `SKILL.md` mengajari agen AI kapan memanggil script mana. Setiap script
  mengeluarkan JSON yang bisa dibaca mesin (`--json`).
- 42 tool berbasis FFmpeg, ditulis dengan Python standard library (tanpa dependency pip). Contoh:
  `cut.py`, `silence.py`, `caption.py`, `fit.py`, `scenes.py`, `loudness.py`, `check.py`, `render.py`.
- Hanya 12 tool yang berstatus `stable`, 30 sisanya `beta` (sejak v4.0.0).
- Sepenuhnya lokal, tanpa cloud dan tanpa API key. Ini cocok dengan aturan privasi kita.
- Pola kerjanya _probe dulu → kerjakan → verifikasi_. Agen mengecek hasil dengan ffprobe, contact sheet,
  dan cek spesifikasi platform. Pola ini bagus, dan sebagian besar sudah kita lakukan (render kita
  mengecek ulang durasi serta keberadaan video dan audio).

Kenapa tidak cocok dipasang langsung:

1. **Dirancang untuk manusia + agen yang mengambil keputusan.** Penulisnya sendiri menyebut highlight
   sebagai "_a proposal engine, not a judgement of content_" dan reframe sebagai "_report only, the calling
   agent picks the crop, no auto-reframing_". Artinya keputusan kreatif diserahkan ke agen. Aplikasi kita
   justru harus mengambil keputusan itu sendiri.
2. **Stack ganda.** Server kita (Node) sudah memanggil ffmpeg langsung dengan argumen berupa array. Kalau
   ditambah lapisan script Python di tengah, alurnya jadi lebih panjang, error-nya lebih sulit dibaca, dan
   ada versi lain yang harus diikuti (rilisnya sangat sering: v4.7.1 hanya beberapa minggu setelah v4.0).
3. **Aturan proyek.** Tool baru harus disetujui user dan dicatat di CLAUDE.md §2 dan SETUP.md.

---

## 3. Peta fitur: ffmpeg-skill vs pipeline kita

Keterangan: **Ganti** = ffmpeg-skill punya fungsi yang sama · **Isi** = kita belum punya · **—** = tidak ada padanan.

| Tahap kita                 | Kita pakai                                                                                                        | Padanan di ffmpeg-skill                                                                                                                                          | Jenis   | Mana yang hasilnya lebih baik                                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [1] Ambil sumber           | yt-dlp                                                                                                            | —                                                                                                                                                                | —       | Kita                                                                                                                                                                                                                  |
| [2] Pisahkan suara & musik | Demucs (neural)                                                                                                   | — (`audio.py` hanya mengatur level musik/ducking, tidak memisahkan)                                                                                              | —       | Kita                                                                                                                                                                                                                  |
| [3] Bersihkan noise        | DeepFilterNet (neural)                                                                                            | `audio.py --voice light/medium/strong`, `afftdn` (filter DSP klasik)                                                                                             | Ganti   | **Kita.** Peredam noise neural jauh lebih bersih untuk suara manusia daripada filter FFT, dan lebih sedikit artefak "suara robot".                                                                                    |
| [4] Transkrip              | whisper.cpp `medium`                                                                                              | `caption.py --transcribe` → memanggil whisper.cpp / faster-whisper / Parakeet, model bawaan `base`                                                               | Ganti   | **Kita.** Mesinnya sama, model kita lebih besar. Parakeet hanya untuk bahasa Inggris.                                                                                                                                 |
| [4] Cari momen             | Skor transkrip: hook/pertanyaan pembuka, energi suara, tempo bicara, jeda, kalimat utuh, durasi, kejelasan ucapan | `scenes.py --highlights`, hanya memakai kerasnya suara (`--rank-by audio`) atau panjang adegan                                                                   | Ganti   | **Kita, dengan jarak jauh.** Highlight ffmpeg-skill tidak membaca isi omongan dan bisa memotong di tengah kalimat. Bagi podcast, momen bagus ditentukan oleh _isi_, bukan volume.                                     |
| [5] Crop 9:16              | YuNet (deteksi wajah) + Norfair (tracking) + smoothing per klip                                                   | `fit.py --aspect 9:16 --crop-x 0.27` (posisi tetap, ditentukan manual) dan `cropdetect.py --motion-centre` (titik pusat gerakan per detik, _tanpa_ auto-reframe) | Ganti   | **Kita.** ffmpeg-skill tidak mendeteksi wajah sama sekali. Crop tetap akan memotong wajah saat pembicara bergeser atau giliran bicara berganti.                                                                       |
| [6] Subtitle               | ASS statis, 2 gaya (`bold-center`, `lower-third`), satu potongan kalimat per tampilan                             | `caption.py --animate pop --karaoke` (kata yang sedang diucapkan disorot), `--fit-size`, pemotong baris per frasa, margin aman per platform                      | **Isi** | **ffmpeg-skill.** Sorotan per kata dan animasi _pop_ adalah gaya standar Shorts/Reels/TikTok yang terbukti menahan mata penonton. Kita sudah punya timestamp per kata dari whisper, jadi ini bisa dibuat di `ass.ts`. |
| [6] Loudness               | `normalizeLoudness` (kompresi + gain terukur + limiter, dikoreksi sampai sesuai target)                           | `loudness.py` (loudnorm 2-pass, −14 LUFS)                                                                                                                        | Ganti   | **Setara.** Tidak perlu diubah.                                                                                                                                                                                       |
| —                          | (belum ada)                                                                                                       | `silence.py --speech-aware`: buang jeda panjang _di dalam_ klip, sisakan napas di dalam kalimat                                                                  | **Isi** | Berguna. Jeda mati 1–2 detik di tengah klip adalah titik orang paling sering swipe.                                                                                                                                   |
| —                          | (belum ada)                                                                                                       | `silence.py --filler`: buang "eh/em" dari timestamp kata                                                                                                         | **Isi** | Berguna, tetapi daftar bawaannya **tidak memuat Bahasa Indonesia**. Kita perlu daftar sendiri ("eh", "em", "hmm", "anu", …).                                                                                          |
| —                          | (belum ada)                                                                                                       | `graphics.py` template `hook` (kartu judul 0–3 detik), progress bar                                                                                              | **Isi** | Berguna untuk 3 detik pertama, yang paling menentukan apakah penonton bertahan.                                                                                                                                       |
| —                          | (belum ada)                                                                                                       | `check.py --platform shorts` (cek resolusi, durasi, loudness, ukuran file)                                                                                       | Isi     | Nilai tambahnya kecil. Render kita sudah selalu 1080×1920 dengan loudness terukur.                                                                                                                                    |
| —                          | (belum ada)                                                                                                       | `_review.py`, halaman HTML untuk review hasil                                                                                                                    | Isi     | Tidak perlu. UI React kita sudah berfungsi sebagai halaman review.                                                                                                                                                    |

**Kesimpulan peta:** bagian yang _menggantikan_ semuanya lebih lemah atau setara, jadi tidak ada alasan
mengganti. Bagian yang _mengisi ruang kosong_ (subtitle karaoke, buang jeda/filler, kartu hook) justru
yang paling berpengaruh ke retensi penonton, dan semuanya hanya butuh ffmpeg + libass yang sudah kita punya.

---

## 4. Tahap transkrip: kenapa lambat, dan apa yang benar-benar membantu

### 4.1 Data nyata dari log job

Komputer: Intel i5-1155G7 (4 core / 8 thread), Intel Iris Xe, tanpa GPU NVIDIA.
Binary whisper.cpp `b5907` (`whisper-blas-bin-x64`), model `ggml-medium.bin`, 4 thread.

Job `a55d21ef…` (podcast Bahasa Indonesia, audio **8 menit 9 detik**):

| Tahap                           | Waktu                 | Rasio terhadap durasi audio |
| ------------------------------- | --------------------- | --------------------------- |
| Pisahkan suara (Demucs)         | 9 menit 6 detik       | 1,12×                       |
| Bersihkan noise (DeepFilterNet) | 37 detik              | 0,08×                       |
| **Transkrip (whisper.cpp)**     | **10 menit 41 detik** | **1,31×**                   |

Rincian waktu transkrip dari `whisper_print_timings`:

| Bagian                                   | Waktu     | Porsi   |
| ---------------------------------------- | --------- | ------- |
| _Decoding_ (beam search, 13.197 langkah) | 399 detik | **62%** |
| _Encoding_ (18 jendela × 9,8 detik)      | 177 detik | 28%     |
| _Sampling_                               | 14 detik  | 2%      |
| Muat model                               | 3 detik   | <1%     |

Artinya, podcast **1 jam** butuh sekitar **±80 menit hanya untuk transkrip**, ditambah ±1 jam Demucs kalau
pemisahan suara aktif. Waktu habis paling banyak di _decoding_, karena beam search 5 kandidat (bawaan
whisper-cli: `-bs 5 -bo 5`) dan model `medium` punya 24 lapis decoder.

Kualitas transkrip yang sekarang sebenarnya **sudah baik**: rata-rata probabilitas kata 0,889, hanya 4%
kata di bawah 0,5, dan tidak ada segmen yang berulang di job 8 menit itu.

### 4.2 Apa kata ffmpeg-skill soal transkrip

- Ia **tidak menambah kecepatan maupun akurasi**, karena hanya memanggil mesin yang sama. Model
  bawaannya `base` (lebih cepat, tapi jauh kurang akurat untuk Bahasa Indonesia).
- README-nya menyarankan `large-v3-turbo` sebagai model default "di mesin yang punya model itu". Ini
  saran yang tepat (lihat 4.3).
- Ia selalu menjalankan whisper.cpp dengan **`-mc 0`** (`--max-context 0`). Alasannya tercatat di kode
  mereka (`scripts/_common/asr.py`, issue #318): whisper memakai teks sebelumnya sebagai konteks, dan
  begitu satu kalimat halusinasi masuk ke konteks itu, kalimat tersebut bisa terulang sampai akhir file.
  Kasus mereka: satu kalimat terulang ±300 kali dan ±7 menit omongan hilang. Risiko ini membesar di
  podcast 1 jam. **Ide ini layak diambil.**

### 4.3 Opsi percepatan, diurutkan dari yang tidak mengorbankan akurasi

Semua opsi di bawah memakai whisper.cpp yang sudah ada (tidak ada tool baru). Angka estimasi dihitung dari
rincian waktu di 4.1 dan ukuran arsitektur model, **belum diukur**. Ukur dulu dengan skrip di bagian 7
sebelum memutuskan.

| #   | Perubahan                                                                                           | Pengaruh ke kecepatan                                                                                                                                                                         | Pengaruh ke akurasi                                                                                                                                                                       | Rekomendasi                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Ganti model ke **`large-v3-turbo`** (`ggml-large-v3-turbo.bin` ±1,6 GB, atau versi `-q5_0` ±550 MB) | Estimasi **±25% lebih cepat** (±1,0× durasi audio, dari 1,3×). Encoder-nya ±2× lebih berat dari medium, tapi decoder-nya hanya 4 lapis (medium 24), dan decoder adalah bagian terlambat kita. | **Lebih akurat** dari `medium`, mendekati `large-v3`.                                                                                                                                     | **Ya, prioritas 1.** Satu-satunya opsi yang lebih cepat _dan_ lebih akurat.                                                           |
| B   | Nyalakan **VAD** (`--vad -vm ggml-silero-v5.1.2.bin`, model ±1 MB). Binary kita sudah mendukung.    | Lewati bagian tanpa suara. Hematnya kecil di podcast padat (±5–15%), besar di intro/outro musik atau jeda panjang.                                                                            | **Lebih baik.** Whisper paling sering berhalusinasi di bagian sunyi atau musik.                                                                                                           | **Ya.** Tetap cek bahwa timestamp kata masih akurat setelah VAD.                                                                      |
| C   | Tambah **`-mc 0`** (dari ffmpeg-skill)                                                              | Netral (sedikit lebih cepat).                                                                                                                                                                 | Mencegah halusinasi berulang di audio panjang. Kekurangannya, konsistensi ejaan nama/istilah antar jendela sedikit berkurang. Bisa diimbangi dengan `--prompt` berisi nama host dan tamu. | **Ya.**                                                                                                                               |
| D   | Matikan pemisahan suara (Demucs) untuk podcast tanpa musik                                          | Hemat ±1× durasi audio. Ini **penghemat terbesar** dari seluruh pipeline.                                                                                                                     | Netral kalau memang tidak ada musik latar.                                                                                                                                                | Sudah bisa dilakukan lewat opsi "lewati pemisahan suara" (commit `c384be7`). Perlu dijelaskan lebih jelas di UI kapan aman dimatikan. |
| E   | Pakai iGPU Intel Iris Xe lewat backend **Vulkan** whisper.cpp                                       | Belum pasti. Di iGPU hasilnya bervariasi, bisa 1,5–3× atau malah tidak lebih cepat.                                                                                                           | Sama.                                                                                                                                                                                     | Opsional. Perlu binary build Vulkan dan **wajib diuji** dulu.                                                                         |
| F   | _Greedy decoding_ (`-bs 1 -bo 1`)                                                                   | Estimasi **±2× lebih cepat**, karena decoding adalah 62% waktu.                                                                                                                               | **Turun sedikit.** Lebih banyak salah kata di bagian yang tidak jelas.                                                                                                                    | **Tidak**, karena prioritasnya kualitas klip. Bisa disediakan sebagai mode "draf cepat" di Pengaturan lanjutan.                       |
| G   | `-p 2` (memecah audio ke 2 prosesor)                                                                | Sedikit lebih cepat.                                                                                                                                                                          | **Turun**, karena kata di titik potong bisa rusak dan merusak timestamp.                                                                                                                  | **Tidak.**                                                                                                                            |
| H   | Ganti ke faster-whisper (CTranslate2, int8)                                                         | Di CPU umumnya lebih cepat dari whisper.cpp.                                                                                                                                                  | Setara.                                                                                                                                                                                   | **Tidak sekarang.** Ini tool baru di luar stack dan butuh persetujuan. A + B + C perlu diukur dulu.                                   |

**Kombinasi yang disarankan:** A + B + C (+ D bila tidak ada musik). Estimasi: podcast 1 jam turun dari
±80 menit menjadi **±55–60 menit** untuk transkrip, dengan akurasi **naik**. Kalau Demucs juga dilewati,
total waktu analisis kira-kira terpotong setengah.

Perlu jujur juga: di CPU 4 core tanpa GPU, transkrip berkualitas tinggi untuk 1 jam audio memang akan
tetap memakan waktu puluhan menit. Lompatan besar (5–10× lebih cepat) hanya datang dari GPU NVIDIA.

---

## 5. Perbandingan output: kalau ffmpeg-skill menggantikan pipeline kita

Dinilai dari sisi penonton: _apakah klip ini dipotong di momen bagus dan ditonton sampai habis?_

| Faktor retensi                                                         | Pipeline kita                                                                                                                                                                       | Versi ffmpeg-skill                                                                                   | Pemenang         |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| **Momen yang dipilih**: ada hook, ada isi, selesai di poin yang tuntas | Membaca transkrip. Memberi skor untuk pertanyaan atau frasa pembuka yang memancing, kalimat utuh, tempo bicara, dan minimnya jeda. Klip selalu mulai dan berakhir di batas kalimat. | Memilih bagian paling keras atau adegan terpanjang. Tidak membaca isi, bisa mulai di tengah kalimat. | **Kita**         |
| **Wajah selalu di frame**                                              | Deteksi dan tracking wajah, kamera bergerak halus mengikuti pembicara.                                                                                                              | Crop posisi tetap. Pembicara yang bergeser akan terpotong.                                           | **Kita**         |
| **Suara bersih dan nyaman**                                            | Demucs + DeepFilterNet (neural) + loudness terukur.                                                                                                                                 | Filter DSP + loudness terukur.                                                                       | **Kita**         |
| **Subtitle yang "menarik mata"**                                       | Statis, satu potongan kalimat per tampilan.                                                                                                                                         | Sorotan per kata (karaoke) + animasi pop + ukuran menyesuaikan.                                      | **ffmpeg-skill** |
| **Tempo**: tidak ada jeda mati                                         | Jeda di dalam klip dibiarkan apa adanya (hanya dihukum di skor momen).                                                                                                              | Jeda dan kata pengisi bisa dipotong (_jump cut_).                                                    | **ffmpeg-skill** |
| **3 detik pertama**                                                    | Langsung masuk ke omongan.                                                                                                                                                          | Ada template kartu hook berisi judul.                                                                | **ffmpeg-skill** |

Tiga faktor teratas adalah fondasi, dan di situ kita unggul. Tiga faktor terbawah adalah lapisan
"kemasan" yang membuat klip terasa seperti konten Shorts profesional. Kemasan inilah yang perlu kita
tambahkan, tanpa mengganti fondasinya.

---

## 6. Rekomendasi: yang diambil dari ffmpeg-skill (sebagai ide, bukan dependency)

Semua item memakai ffmpeg, libass, dan whisper.cpp yang sudah ada di stack. **Tidak ada tool baru.**

| Prioritas | Fitur                                                                                                              | Kenapa                                                                                                     | Cara di project kita                                                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**    | Pengaturan transkrip: `large-v3-turbo` + VAD + `-mc 0`                                                             | Lebih akurat dan lebih cepat. Transkrip yang benar membuat subtitle benar dan pemilihan momen lebih tepat. | `WHISPER_MODEL` di `.env`, flag tambahan di [apps/server/src/tools/whisper.ts](../apps/server/src/tools/whisper.ts), model VAD di `tools/`, update SETUP.md langkah 4. Ukur dulu dengan bagian 7.                     |
| **P1**    | Subtitle karaoke: kata yang sedang diucapkan disorot (warna atau sedikit membesar), tampil 2–4 kata per layar      | Gaya standar Shorts. Mata penonton terus "dikejar" teks, dan ini termasuk faktor retensi terbesar.         | Gaya ASS baru di [apps/server/src/pipeline/captions/ass.ts](../apps/server/src/pipeline/captions/ass.ts) memakai tag `\k`/`\t` dari timestamp kata yang sudah ada di transkrip. Tetap patuhi aturan "maks. ±2 baris". |
| **P2**    | Buang jeda mati di dalam klip (mis. jeda > 0,6 detik dipendekkan jadi ±0,25 detik), sisakan napas di dalam kalimat | Jeda mati adalah momen orang swipe.                                                                        | Dari timestamp kata: susun daftar potongan, render dengan `select`/`aselect` atau `trim` + `concat` di ffmpeg, lalu geser waktu subtitle sesuai peta waktu baru. Perlu dijadikan opsi per klip yang bisa dimatikan.   |
| **P2**    | Buang kata pengisi Bahasa Indonesia ("eh", "em", "emm", "hmm")                                                     | Tempo lebih padat, terdengar lebih profesional.                                                            | Mekanismenya sama dengan P2 di atas, dengan daftar kata sendiri. Hati-hati: jangan memotong kata bermakna ("ya", "kan", "gitu"). Default nonaktif, bisa ditinjau di UI.                                               |
| **P3**    | Kartu hook 0–2 detik (judul/pertanyaan di bagian atas layar)                                                       | Memberi alasan untuk tetap menonton di detik pertama.                                                      | Teks dari kalimat pertama klip atau diisi user, digambar sebagai event ASS terpisah di area atas yang aman.                                                                                                           |

Yang **tidak** diambil: `scenes.py --highlights` (lebih lemah dari pencarian momen kita),
`fit.py`/`cropdetect.py` (lebih lemah dari tracking wajah kita), `audio.py --voice` (lebih lemah dari
DeepFilterNet), `check.py`/`_review.py` (nilai tambahnya kecil).

Catatan di luar cakupan ffmpeg-skill: tuas terbesar untuk "momen yang bagus" adalah **memahami makna
omongan** (lucu, kontroversial, punya _punchline_, cerita yang tuntas). Skor kita saat ini masih berbasis
sinyal permukaan (pertanyaan, frasa hook, tempo, energi). ffmpeg-skill tidak membantu di sini. Untuk
meningkatkannya perlu model bahasa lokal, yang merupakan tool baru dan harus diusulkan serta disetujui
terpisah.

---

## 7. Cara mengukur sebelum mengganti pengaturan transkrip

Jalankan saat **tidak ada job yang sedang berjalan**, karena whisper memakai semua core CPU dan angka
akan kacau kalau ada proses lain. Saat riset ini dibuat, ada job transkrip podcast 1 jam yang sedang
berjalan, jadi benchmark sengaja tidak dijalankan.

```powershell
# 1. Unduh model pembanding (sekali saja, ke tools/ yang tidak di-commit)
Invoke-WebRequest https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin -OutFile tools\whisper.cpp\models\ggml-large-v3-turbo-q5_0.bin
Invoke-WebRequest https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin -OutFile tools\whisper.cpp\models\ggml-silero-v5.1.2.bin

# 2. Ambil potongan 2 menit dari audio job yang sudah ada (ganti <job-id>)
ffmpeg -y -ss 120 -t 120 -i workspace\<job-id>\audio\audio16k.wav -c copy bench.wav

# 3. Bandingkan (catat "total time" di akhir output, simpan teksnya)
$cli = "tools\whisper-bin\whisper-cli.exe"
& $cli -m tools\whisper.cpp\models\ggml-medium.bin -f bench.wav -l id -t 4 -otxt -of out_medium
& $cli -m tools\whisper.cpp\models\ggml-medium.bin -f bench.wav -l id -t 4 -mc 0 --vad -vm tools\whisper.cpp\models\ggml-silero-v5.1.2.bin -otxt -of out_medium_vad
& $cli -m tools\whisper.cpp\models\ggml-large-v3-turbo-q5_0.bin -f bench.wav -l id -t 4 -mc 0 --vad -vm tools\whisper.cpp\models\ggml-silero-v5.1.2.bin -otxt -of out_turbo
```

Cara menilai akurasi: dengarkan 2 menit audio itu sambil membaca ketiga file `out_*.txt`. Hitung kata yang
salah, terutama nama orang, istilah, dan bahasa gaul ("gue", "lo", "bang"). Pilih yang salahnya paling
sedikit. Kecepatan hanya jadi penentu kalau akurasinya setara.

---

## 8. Sumber

- Repo ffmpeg-skill, dibaca langsung dari clone commit `bad487c` (23 Nov 2026): `README.md`, `SKILL.md`,
  `references/scripts.md`, `scripts/_common/asr.py`, `templates/shorts.json`, `templates/podcast.json`, `docs/demos.md`.
- Kode project ini: [apps/server/src/tools/whisper.ts](../apps/server/src/tools/whisper.ts),
  [apps/server/src/pipeline/stages/transcribe.ts](../apps/server/src/pipeline/stages/transcribe.ts),
  [apps/server/src/pipeline/moments/](../apps/server/src/pipeline/moments/),
  [apps/server/src/pipeline/captions/ass.ts](../apps/server/src/pipeline/captions/ass.ts),
  [apps/server/src/pipeline/stages/render.ts](../apps/server/src/pipeline/stages/render.ts),
  [apps/server/src/pipeline/stages/reframe.ts](../apps/server/src/pipeline/stages/reframe.ts).
- Log job lokal `workspace/<job-id>/logs/transcribe.log` dan `job.json` (waktu per tahap dan
  `whisper_print_timings`).
- `whisper-cli --help` dari binary lokal `b5907` (memastikan dukungan `--vad`, `-mc`, `-fa`, `-bs`).
