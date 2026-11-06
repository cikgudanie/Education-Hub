# Education Hub: Trading Journal & Laporan Trading

Sistem web untuk pelajar trading merekod **trading journal** dan menghantar **laporan trading** kepada mentor. Semua data disimpan dalam database **SQLite** (satu fail sahaja).

## Ciri-ciri

### Pelajar (daftar di `/daftar`, log masuk di `/masuk`)
- **Pelan Strategi Bulanan**, ikut templat *Strategic Trading Implementation*:
  - Input: modal, USD per pip, lot size, base %, risiko setiap trade, dan toleransi risiko
  - Sasaran **Par 1** (base %) dan **Par 2** (2×) dikira secara bulanan, mingguan dan harian, dalam USD dan pips, termasuk unjuran 10X dan 10X2 Income
  - Bulan baru diisi automatik dengan modal akhir bulan sebelumnya
- **Rekod Harian**, ikut templat *RMI*:
  - Setup (LP1/LP2/No LP), lot, jumlah trade, win, loss, profit, loss, catatan, dan sehingga 6 screenshot sehari
  - Modal berjalan, P/L, % modal, dan status sasaran harian (✓ Par 1 / ✓✓ Par 2 / ✗ Rugi)
  - Jumlah mingguan, % mingguan, % bulanan dan Profit Loss Ratio
- **Dashboard bulanan**: modal semasa, P/L bulan, progress Par 1/Par 2, win rate, P/L ratio, max drawdown, equity curve, serta Peraturan & Mindset program
- **Journal Trade** (pilihan): rekod setiap trade secara terperinci, dengan statistik win rate, profit factor dan R-multiple
- **Laporan**: hantar fail laporan dan terima markah serta komen mentor

### Mentor (`/guru`)
- Ringkasan bulanan semua pelajar: modal, P/L, %, status Par 1, amaran risiko, win rate, P/L ratio, dan **siapa yang belum kemas kini rekod** (3 hari atau lebih)
- Dashboard bulanan setiap pelajar (sama seperti yang pelajar lihat), termasuk screenshot
- Komen pada setiap rekod harian dan setiap trade
- Semak laporan (status, markah, komen), dan tetapkan semula kata laluan pelajar
- **Tetapan**: nama program, serta teks Peraturan & Mindset yang dipaparkan kepada semua pelajar
- Eksport rekod harian dan journal ke CSV

## Cara Menjalankan

Keperluan: **Node.js 22.13 atau lebih baru**

```bash
npm install
ADMIN_PASSWORD=katalaluanmentor npm start
```

Buka http://localhost:3000

## Pasang di Windows VPS (percuma dengan DuckDNS)

Lihat [deploy/windows/PANDUAN-WINDOWS.md](deploy/windows/PANDUAN-WINDOWS.md). Satu skrip memasang semuanya: Node.js, HTTPS automatik (Caddy), auto-mula selepas restart, dan backup harian.

## Tetapan (pembolehubah persekitaran)

| Nama             | Lalai      | Keterangan                                              |
|------------------|------------|---------------------------------------------------------|
| `ADMIN_PASSWORD` | `admin123` | Kata laluan mentor. **Wajib ditukar!**                  |
| `SESSION_SECRET` | rawak      | Tetapkan supaya pengguna kekal log masuk selepas pelayan dimulakan semula |
| `PORT`           | `3000`     | Port pelayan                                            |
| `DATA_DIR`       | `./data`   | Lokasi fail database `reports.db`                       |
| `CURRENCY`       | `USD`      | Mata wang yang dipaparkan untuk P/L                     |
| `HOST`           | `0.0.0.0`  | Alamat dengar. Guna `127.0.0.1` di belakang reverse proxy |
| `TRUST_PROXY`    | –          | Tetapkan `1` jika di belakang reverse proxy tempatan (cth: Caddy) |
| `COOKIE_SECURE`  | –          | Tetapkan `1` apabila laman guna HTTPS                   |
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
