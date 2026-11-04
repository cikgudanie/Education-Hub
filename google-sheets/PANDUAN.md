# Panduan: Versi Google Forms + Sheets (Percuma)

Versi ini tidak memerlukan hosting. Semuanya berjalan dalam akaun Google anda.

## Apa yang anda dapat
- **Borang Rekod Trade** (Google Form): pelajar isi untuk setiap trade
- **Borang Hantar Laporan** (Google Form): pelajar hantar fail laporan
- **Google Sheet** dengan tab:
  - `Pautan`: pautan borang untuk dikongsi dengan pelajar, beserta arahan
  - `Journal`: semua trade pelajar
  - `Ringkasan Pelajar`: trade, untung/rugi, win rate, jumlah P/L dan purata R bagi setiap pelajar
  - `Dashboard Pelajar`: pilih no. matrik untuk lihat statistik, graf ekuiti, senarai trade, serta prestasi ikut pair, strategi dan emosi
  - `Laporan`: laporan yang dihantar, dengan lajur Status, Markah dan Komen Mentor

## Langkah pemasangan (±5 minit, sekali sahaja)
1. Buka **https://sheets.new** untuk mencipta Google Sheet kosong.
2. Klik menu **Extensions → Apps Script**.
3. Padam kod yang ada, kemudian tampal **semua** kandungan fail `EducationHub.gs`. Klik ikon 💾 **Save**.
4. Di bahagian atas, pastikan fungsi **`sediakanSistem`** dipilih, kemudian klik **▶ Run**.
5. Google akan meminta kebenaran:
   - Klik **Review permissions** dan pilih akaun Google anda.
   - Jika keluar amaran *"Google hasn't verified this app"*, klik **Advanced**, kemudian **Go to ... (unsafe)**. Ini normal kerana skrip ini anda sendiri yang cipta.
   - Klik **Allow**.
6. Kembali ke tab Google Sheet. Tunggu mesej **"Siap!"**, kemudian buka tab **Pautan**.
7. **Tambah soalan muat naik fail** pada Borang Laporan:
   - Klik pautan **Edit Borang Laporan** dalam tab Pautan.
   - Klik ➕, tukar jenis soalan kepada **File upload**, letak tajuk *Fail Laporan*, dan hidupkan **Required**.
   - Kembali ke Sheet dan klik menu **Education Hub → 2. Tambah lajur semakan laporan**.
8. Kongsi 2 pautan **UNTUK PELAJAR** dengan pelajar anda.

## Cara guna harian
- **Lihat semua pelajar:** tab `Ringkasan Pelajar`
- **Lihat seorang pelajar:** tab `Dashboard Pelajar`, kemudian pilih no. matrik di sel kuning B2
- **Semak laporan:** tab `Laporan`. Klik pautan fail, kemudian isi Status, Markah dan Komen

## Perlu tahu
- Pelajar perlu log masuk akaun Google untuk memuat naik fail laporan. Fail disimpan dalam Google Drive anda.
- Pelajar mesti guna **No. Matrik yang sama** setiap kali. Huruf besar/kecil tidak mengira.
- **Jangan ubah susunan soalan** dalam Borang Trade, dan **jangan hidupkan "Collect email addresses"**. Formula statistik bergantung pada susunan lajur. Soalan baru hanya boleh ditambah di hujung borang.
- Pelajar tidak nampak statistik mereka sendiri secara automatik. Anda boleh muat turun Dashboard sebagai PDF dan hantar kepada mereka.
