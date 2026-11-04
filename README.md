# Education Hub: Trading Journal & Laporan Trading

Sistem web untuk pelajar trading merekod **trading journal** dan menghantar **laporan trading** kepada mentor. Semua data disimpan dalam database **SQLite** (satu fail sahaja).

## Ciri-ciri

### Pelajar (daftar di `/daftar`, log masuk di `/masuk`)
- **Trading journal**: rekod setiap trade, termasuk tarikh, pair, BUY/SELL, timeframe, entry, stop loss, take profit, exit, lot, P/L, strategi, emosi, analisis, pengajaran dan screenshot chart
- **Dashboard statistik** (dikira automatik):
  - Jumlah P/L, win rate, profit factor dan purata R-multiple
  - Purata untung/rugi, trade terbaik/terburuk, max drawdown, dan rentetan untung/rugi
  - Graf lengkung ekuiti (P/L terkumpul) yang interaktif
  - Prestasi mengikut pair, strategi dan emosi
- Tapis journal mengikut pair, strategi dan julat tarikh
- Edit atau padam trade, dan eksport journal ke CSV
- **Hantar laporan trading** (PDF, Word, Excel, gambar, ZIP), dan lihat status, markah serta komen mentor

### Mentor (`/guru`, kata laluan mentor)
- Senarai semua pelajar dengan ringkasan prestasi (bilangan trade, win rate, jumlah P/L)
- Lihat journal dan statistik penuh setiap pelajar
- Beri komen pada setiap trade (pelajar akan nampak komen ini)
- Semak laporan: status, markah, komen, muat turun dan padam
- Tetapkan semula kata laluan pelajar yang terlupa
- Eksport semua trade dan laporan ke CSV (boleh dibuka dalam Excel)

## Cara Menjalankan

Keperluan: **Node.js 22.13 atau lebih baru**

```bash
npm install
ADMIN_PASSWORD=katalaluanmentor npm start
```

Buka http://localhost:3000

## Tetapan (pembolehubah persekitaran)

| Nama             | Lalai      | Keterangan                                              |
|------------------|------------|---------------------------------------------------------|
| `ADMIN_PASSWORD` | `admin123` | Kata laluan mentor. **Wajib ditukar!**                  |
| `SESSION_SECRET` | rawak      | Tetapkan supaya pengguna kekal log masuk selepas pelayan dimulakan semula |
| `PORT`           | `3000`     | Port pelayan                                            |
| `DATA_DIR`       | `./data`   | Lokasi fail database `reports.db`                       |
| `CURRENCY`       | `USD`      | Mata wang yang dipaparkan untuk P/L                     |
| `MAX_FILE_MB`    | `10`       | Saiz maksimum fail laporan (MB). Had screenshot ialah 5 MB |

## Nota

- **P/L diisi sendiri oleh pelajar**, mengikut akaun broker. Nilai pip berbeza antara pair, emas, indeks dan kripto, jadi P/L tidak dikira daripada harga.
- **R-multiple** dikira daripada entry, stop loss dan exit: untung atau rugi dibandingkan dengan risiko yang diambil.
- **Backup**: salin fail `data/reports.db` sahaja.

## Struktur Kod

```
server.js          Laman utama, daftar, log masuk
routes/student.js  Dashboard, journal, laporan pelajar
routes/mentor.js   Panel mentor
db.js              Jadual dan pertanyaan database
lib/stats.js       Kiraan statistik trading
lib/views.js       Templat HTML, kad statistik, graf ekuiti
lib/forms.js       Muat naik fail dan pengesahan borang
lib/auth.js        Sesi dan hash kata laluan
public/            CSS dan skrip graf
```
