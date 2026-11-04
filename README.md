# Education Hub: Sistem Penghantaran Laporan Pelajar

Sistem web ringkas untuk pelajar menghantar laporan secara dalam talian. Semua laporan (termasuk fail) disimpan dalam database **SQLite**.

## Ciri-ciri

**Pelajar**
- Hantar laporan: nama, no. matrik, kelas, tajuk, catatan dan fail (PDF, Word, PowerPoint, Excel, gambar, ZIP; maksimum 10 MB)
- Semak status, markah dan komen guru menggunakan no. matrik

**Guru** (`/guru`, perlu kata laluan)
- Senarai semua laporan, dengan carian dan tapisan mengikut kelas
- Muat turun fail laporan
- Kemas kini status (Diterima / Sedang Disemak / Selesai Disemak / Perlu Dibaiki), markah dan komen
- Padam laporan
- Eksport senarai ke CSV (boleh dibuka dalam Excel)

## Cara Menjalankan

Keperluan: **Node.js 22.13 atau lebih baru**

```bash
npm install
ADMIN_PASSWORD=katalaluananda npm start
```

Buka http://localhost:3000

## Tetapan (pembolehubah persekitaran)

| Nama             | Lalai      | Keterangan                                   |
|------------------|------------|----------------------------------------------|
| `ADMIN_PASSWORD` | `admin123` | Kata laluan guru. **Wajib ditukar!**         |
| `PORT`           | `3000`     | Port pelayan                                 |
| `DATA_DIR`       | `./data`   | Lokasi fail database `reports.db`            |
| `MAX_FILE_MB`    | `10`       | Saiz maksimum fail (MB)                      |
| `SESSION_SECRET` | rawak      | Tetapkan supaya guru kekal log masuk selepas pelayan dimulakan semula |

## Database

Fail database: `data/reports.db` (jadual `reports`). Untuk backup, salin fail ini sahaja.
