/**
 * Education Hub: Trading Journal & Laporan Trading (versi Google Forms + Sheets)
 *
 * CARA GUNA (sekali sahaja):
 *   1. Buka https://sheets.new (Google Sheet kosong baru).
 *   2. Menu Extensions > Apps Script. Padam kod sedia ada, tampal SEMUA kod ini, klik Save.
 *   3. Pilih fungsi "sediakanSistem" di atas, klik Run, dan benarkan akses (Allow).
 *   4. Kembali ke Google Sheet. Pautan borang untuk pelajar ada dalam tab "Pautan".
 */

const TETAPAN = {
  mataWang: 'USD',
  emosi: ['Tenang', 'Yakin', 'Ragu-ragu', 'Takut', 'Tamak', 'FOMO', 'Marah / Revenge', 'Bosan'],
  timeframe: ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'],
  statusLaporan: ['Diterima', 'Sedang Disemak', 'Selesai Disemak', 'Perlu Dibaiki'],
};

const NAMA = {
  journal: 'Journal',
  laporan: 'Laporan',
  data: 'Data',
  ringkasan: 'Ringkasan Pelajar',
  dashboard: 'Dashboard Pelajar',
  pautan: 'Pautan',
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Education Hub')
    .addItem('1. Sediakan sistem (sekali sahaja)', 'sediakanSistem')
    .addItem('2. Tambah lajur semakan laporan', 'tambahLajurSemakan')
    .addToUi();
}

function sediakanSistem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(NAMA.dashboard)) {
    throw new Error('Sistem sudah disediakan dalam Sheet ini. Lihat tab "Pautan".');
  }
  ss.rename('Education Hub: Trading Journal');

  const formJournal = binaFormJournal_();
  const formLaporan = binaFormLaporan_();

  formJournal.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  formLaporan.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  namakanSheetJawapan_(ss, formJournal, NAMA.journal);
  namakanSheetJawapan_(ss, formLaporan, NAMA.laporan);

  binaData_(ss);
  binaRingkasan_(ss);
  binaDashboard_(ss);
  binaPautan_(ss, formJournal, formLaporan);

  // Buang sheet kosong asal.
  ss.getSheets().forEach((sh) => {
    if (!Object.values(NAMA).includes(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sh);
    }
  });

  ss.setActiveSheet(ss.getSheetByName(NAMA.pautan));
  SpreadsheetApp.getUi().alert(
    'Siap!\n\nPautan borang untuk pelajar ada dalam tab "Pautan".\n\n' +
    'Langkah seterusnya: buka Form Laporan dan tambah soalan "File upload" (lihat arahan dalam tab Pautan).'
  );
}

// ---------- Borang ----------
function nombor_() {
  return FormApp.createTextValidation().requireNumber().setHelpText('Sila masukkan nombor sahaja, cth: 2650.5 atau -12').build();
}

function binaFormJournal_() {
  const f = FormApp.create('Trading Journal: Rekod Trade');
  f.setDescription('Isi borang ini untuk SETIAP trade. Gunakan No. Matrik yang sama setiap kali supaya statistik anda dikira dengan betul.')
    .setProgressBar(false)
    .setAllowResponseEdits(true);

  f.addTextItem().setTitle('Nama Penuh').setRequired(true);
  f.addTextItem().setTitle('No. Matrik / No. Pelajar').setRequired(true).setHelpText('Mesti sama setiap kali.');
  f.addTextItem().setTitle('Kelas / Kumpulan').setRequired(true);
  f.addDateItem().setTitle('Tarikh Trade').setRequired(true);
  f.addTextItem().setTitle('Pair / Simbol').setRequired(true).setHelpText('cth: XAUUSD, EURUSD, BTCUSD');
  f.addMultipleChoiceItem().setTitle('Arah').setChoiceValues(['BUY', 'SELL']).setRequired(true);
  f.addListItem().setTitle('Timeframe').setChoiceValues(TETAPAN.timeframe);
  f.addTextItem().setTitle('Harga Entry').setRequired(true).setValidation(nombor_());
  f.addTextItem().setTitle('Stop Loss').setValidation(nombor_());
  f.addTextItem().setTitle('Take Profit').setValidation(nombor_());
  f.addTextItem().setTitle('Harga Exit').setValidation(nombor_()).setHelpText('Kosongkan jika trade masih terbuka.');
  f.addTextItem().setTitle('Lot').setValidation(nombor_());
  f.addTextItem().setTitle(`P/L (${TETAPAN.mataWang})`).setValidation(nombor_())
    .setHelpText('Untung/rugi sebenar dari broker. Rugi = nombor negatif, cth: -25. Kosongkan jika masih terbuka.');
  f.addTextItem().setTitle('Strategi').setHelpText('cth: Breakout, SnR, SMC');
  f.addListItem().setTitle('Emosi').setChoiceValues(TETAPAN.emosi);
  f.addParagraphTextItem().setTitle('Analisis / Sebab Entry');
  f.addParagraphTextItem().setTitle('Pengajaran').setHelpText('Apa yang betul / salah? Apa yang perlu diperbaiki?');
  f.addTextItem().setTitle('Link Screenshot Chart').setHelpText('Pilihan. cth: pautan snapshot TradingView.');
  return f;
}

function binaFormLaporan_() {
  const f = FormApp.create('Hantar Laporan Trading');
  f.setDescription('Hantar laporan trading anda (cth: laporan bulanan, analisis pasaran) kepada mentor.')
    .setProgressBar(false);
  f.addTextItem().setTitle('Nama Penuh').setRequired(true);
  f.addTextItem().setTitle('No. Matrik / No. Pelajar').setRequired(true);
  f.addTextItem().setTitle('Kelas / Kumpulan').setRequired(true);
  f.addTextItem().setTitle('Tajuk Laporan').setRequired(true).setHelpText('cth: Laporan Trading Oktober 2026');
  f.addParagraphTextItem().setTitle('Catatan');
  return f;
}

function namakanSheetJawapan_(ss, form, nama) {
  const id = form.getId();
  for (let i = 0; i < 20; i++) {
    SpreadsheetApp.flush();
    const sh = ss.getSheets().find((s) => (s.getFormUrl() || '').indexOf(id) !== -1);
    if (sh) {
      sh.setName(nama);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#e8f1fc');
      return sh;
    }
    Utilities.sleep(500);
  }
  throw new Error('Sheet jawapan untuk "' + form.getTitle() + '" tidak dijumpai. Cuba jalankan semula.');
}

// ---------- Sheet kiraan (tersembunyi) ----------
// Lajur Journal: A Timestamp, B Nama, C No. Matrik, D Kelas, E Tarikh, F Pair, G Arah, H Timeframe,
// I Entry, J SL, K TP, L Exit, M Lot, N P/L, O Strategi, P Emosi, Q Analisis, R Pengajaran, S Screenshot
function binaData_(ss) {
  const sh = ss.insertSheet(NAMA.data);
  const J = `'${NAMA.journal}'!`;
  const ada = `${J}A2:A=""`;
  const tajuk = ['No. Matrik', 'Nama', 'Kelas', 'Tarikh', 'Pair', 'P/L', 'Untung', 'Rugi', 'R', 'Strategi', 'Emosi', 'Arah'];
  sh.getRange(1, 1, 1, tajuk.length).setValues([tajuk]).setFontWeight('bold');
  const f = [
    `=ARRAYFORMULA(IF(${ada},,UPPER(TRIM(${J}C2:C))))`,
    `=ARRAYFORMULA(IF(${ada},,TRIM(${J}B2:B)))`,
    `=ARRAYFORMULA(IF(${ada},,TRIM(${J}D2:D)))`,
    `=ARRAYFORMULA(IF(${ada},,${J}E2:E))`,
    `=ARRAYFORMULA(IF(${ada},,UPPER(TRIM(${J}F2:F))))`,
    `=ARRAYFORMULA(IF((${ada})+(${J}N2:N=""),,${J}N2:N))`,
    `=ARRAYFORMULA(IF(ISNUMBER(F2:F),--(F2:F>0),))`,
    `=ARRAYFORMULA(IF(ISNUMBER(F2:F),--(F2:F<0),))`,
    `=ARRAYFORMULA(IF((${ada})+(${J}L2:L="")+(${J}J2:J="")+(${J}I2:I=${J}J2:J),,` +
      `IFERROR(IF(${J}G2:G="SELL",-1,1)*(${J}L2:L-${J}I2:I)/ABS(${J}I2:I-${J}J2:J))))`,
    `=ARRAYFORMULA(IF(${ada},,TRIM(${J}O2:O)))`,
    `=ARRAYFORMULA(IF(${ada},,${J}P2:P))`,
    `=ARRAYFORMULA(IF(${ada},,${J}G2:G))`,
  ];
  sh.getRange(2, 1, 1, f.length).setFormulas([f]);
  sh.getRange('D:D').setNumberFormat('yyyy-mm-dd');
  sh.hideSheet();
}

// ---------- Ringkasan semua pelajar ----------
function binaRingkasan_(ss) {
  const sh = ss.insertSheet(NAMA.ringkasan);
  const D = `'${NAMA.data}'!`;
  sh.getRange('A1').setFormula(
    `=IFERROR(QUERY(${D}A1:L,"select A, max(B), max(C), count(F), sum(G), sum(H), sum(F), avg(I), max(D) ` +
    `where A is not null and F is not null group by A order by max(C), max(B) ` +
    `label A 'No. Matrik', max(B) 'Nama', max(C) 'Kelas', count(F) 'Trade', sum(G) 'Untung', sum(H) 'Rugi', ` +
    `sum(F) 'Jumlah P/L', avg(I) 'Purata R', max(D) 'Trade Terakhir'",1),"Belum ada trade direkodkan")`
  );
  sh.getRange('J1').setValue('Win Rate');
  sh.getRange('J2').setFormula('=ARRAYFORMULA(IF(A2:A="",,IFERROR(E2:E/(E2:E+F2:F),"")))');
  sh.getRange('A1:J1').setFontWeight('bold').setBackground('#e8f1fc');
  sh.getRange('G:G').setNumberFormat('+#,##0.00;-#,##0.00;0.00');
  sh.getRange('H:H').setNumberFormat('+0.00"R";-0.00"R"');
  sh.getRange('I:I').setNumberFormat('yyyy-mm-dd');
  sh.getRange('J:J').setNumberFormat('0.0%');
  sh.setFrozenRows(1);
  sh.setColumnWidth(2, 180);

  const aturan = sh.getConditionalFormatRules();
  const g = sh.getRange('G2:G');
  aturan.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#0a7d0a').setRanges([g]).build());
  aturan.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#c42f2f').setRanges([g]).build());
  sh.setConditionalFormatRules(aturan);
}

// ---------- Dashboard seorang pelajar ----------
function binaDashboard_(ss) {
  const sh = ss.insertSheet(NAMA.dashboard);
  const D = `'${NAMA.data}'!`;
  const R = `'${NAMA.ringkasan}'!`;
  const ada = `${D}A2:A=$B$2`;

  sh.getRange('A1').setValue('Dashboard Pelajar').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Pilih No. Matrik ▶').setFontWeight('bold');
  sh.getRange('B2').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(ss.getSheetByName(NAMA.ringkasan).getRange('A2:A1000'), true).build()
  ).setBackground('#fff8d6').setFontWeight('bold');

  const statistik = [
    ['Nama', `=IFERROR(VLOOKUP($B$2,${R}A:B,2,0),"")`],
    ['Kelas', `=IFERROR(VLOOKUP($B$2,${R}A:C,3,0),"")`],
    ['Trade ditutup', `=SUMPRODUCT((${ada})*ISNUMBER(${D}F2:F))`],
    ['Untung / Rugi', `=COUNTIFS(${D}A2:A,$B$2,${D}F2:F,">0")&" / "&COUNTIFS(${D}A2:A,$B$2,${D}F2:F,"<0")`],
    ['Win Rate', `=IFERROR(COUNTIFS(${D}A2:A,$B$2,${D}F2:F,">0")/(COUNTIFS(${D}A2:A,$B$2,${D}F2:F,">0")+COUNTIFS(${D}A2:A,$B$2,${D}F2:F,"<0")),"")`],
    [`Jumlah P/L (${TETAPAN.mataWang})`, `=SUMIFS(${D}F2:F,${D}A2:A,$B$2)`],
    ['Profit Factor', `=IFERROR(SUMIFS(${D}F2:F,${D}A2:A,$B$2,${D}F2:F,">0")/-SUMIFS(${D}F2:F,${D}A2:A,$B$2,${D}F2:F,"<0"),"")`],
    ['Purata R', `=IFERROR(AVERAGE(FILTER(${D}I2:I,${ada},ISNUMBER(${D}I2:I))),"")`],
    ['Trade terbaik', `=IF(B5=0,"",MAXIFS(${D}F2:F,${D}A2:A,$B$2))`],
    ['Trade terburuk', `=IF(B5=0,"",MINIFS(${D}F2:F,${D}A2:A,$B$2))`],
    ['Max Drawdown', `=IFERROR(MAX(ARRAYFORMULA(SCAN(0,FILTER(H16:H,H16:H<>""),LAMBDA(a,x,MAX(a,x)))-FILTER(H16:H,H16:H<>""))),"")`],
  ];
  sh.getRange(3, 1, statistik.length, 2).setValues(statistik);
  sh.getRange('A3:A13').setFontWeight('bold').setFontColor('#52514e');
  sh.getRange('B7').setNumberFormat('0.0%');
  sh.getRange('B8').setNumberFormat('+#,##0.00;-#,##0.00;0.00');
  sh.getRange('B9').setNumberFormat('0.00');
  sh.getRange('B10').setNumberFormat('+0.00"R";-0.00"R"');
  sh.getRange('B11:B13').setNumberFormat('+#,##0.00;-#,##0.00;0.00');
  sh.getRange('B3:B13').setHorizontalAlignment('right');

  // Senarai trade pelajar (ikut tarikh) + P/L terkumpul.
  const tajuk = ['Tarikh', 'Pair', 'Arah', 'P/L', 'R', 'Strategi', 'Emosi', 'P/L Terkumpul'];
  sh.getRange(15, 1, 1, tajuk.length).setValues([tajuk]).setFontWeight('bold').setBackground('#e8f1fc');
  sh.getRange('A16').setFormula(
    `=IFERROR(SORT(FILTER({${D}D2:D,${D}E2:E,${D}L2:L,${D}F2:F,${D}I2:I,${D}J2:J,${D}K2:K},${ada},ISNUMBER(${D}F2:F)),1,TRUE),"Pilih No. Matrik di B2")`
  );
  sh.getRange('H16').setFormula('=IFERROR(SCAN(0,FILTER(D16:D,ISNUMBER(D16:D)),LAMBDA(a,x,a+x)),"")');
  sh.getRange('A16:A').setNumberFormat('yyyy-mm-dd');
  sh.getRange('D16:D').setNumberFormat('+#,##0.00;-#,##0.00;0.00');
  sh.getRange('E16:E').setNumberFormat('+0.00"R";-0.00"R"');
  sh.getRange('H16:H').setNumberFormat('#,##0.00');

  // Prestasi ikut pair / strategi / emosi.
  const kumpulan = (sel, lajur, label) => sh.getRange(sel).setFormula(
    `=IFERROR(QUERY(${D}A2:L,"select ${lajur}, count(F), sum(F) where A = '"&SUBSTITUTE($B$2,"'","")&"' and F is not null ` +
    `group by ${lajur} order by sum(F) desc label ${lajur} '${label}', count(F) 'Trade', sum(F) 'P/L'",0),"")`
  );
  kumpulan('J15', 'E', 'Pair');
  kumpulan('N15', 'J', 'Strategi');
  kumpulan('R15', 'K', 'Emosi');
  ['J15:L15', 'N15:P15', 'R15:T15'].forEach((a) => sh.getRange(a).setFontWeight('bold'));
  ['L16:L', 'P16:P', 'T16:T'].forEach((a) => sh.getRange(a).setNumberFormat('+#,##0.00;-#,##0.00;0.00'));

  // Warna P/L: hijau untung, merah rugi (nombor tetap ada tanda +/−).
  const julatPL = [sh.getRange('D16:D'), sh.getRange('B8'), sh.getRange('L16:L'), sh.getRange('P16:P'), sh.getRange('T16:T')];
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0).setFontColor('#0a7d0a').setRanges(julatPL).build(),
    SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0).setFontColor('#c42f2f').setRanges(julatPL).build(),
  ]);

  // Graf lengkung ekuiti.
  const graf = sh.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sh.getRange('H15:H1000'))
    .setNumHeaders(1)
    .setPosition(1, 4, 0, 0)
    .setOption('title', `Lengkung Ekuiti: P/L terkumpul (${TETAPAN.mataWang})`)
    .setOption('legend', { position: 'none' })
    .setOption('colors', ['#2a78d6'])
    .setOption('lineWidth', 2)
    .setOption('pointSize', 6)
    .setOption('hAxis', { title: 'Trade ke-' })
    .setOption('width', 620)
    .setOption('height', 270)
    .build();
  sh.insertChart(graf);

  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 140);
  sh.setFrozenRows(2);
}

// ---------- Pautan & arahan ----------
function binaPautan_(ss, formJournal, formLaporan) {
  const sh = ss.insertSheet(NAMA.pautan, 0);
  const baris = [
    ['Education Hub: Trading Journal', ''],
    ['', ''],
    ['UNTUK PELAJAR (kongsi pautan ini)', ''],
    ['Borang Rekod Trade', formJournal.getPublishedUrl()],
    ['Borang Hantar Laporan', formLaporan.getPublishedUrl()],
    ['', ''],
    ['UNTUK MENTOR SAHAJA (jangan kongsi)', ''],
    ['Edit Borang Trade', formJournal.getEditUrl()],
    ['Edit Borang Laporan', formLaporan.getEditUrl()],
    ['', ''],
    ['CARA GUNA', ''],
    ['1', 'Kongsi 2 pautan pelajar di atas (WhatsApp / Telegram / Google Classroom).'],
    ['2', 'Buka "Edit Borang Laporan" > tambah soalan baru > pilih jenis "File upload" > tajuk "Fail Laporan" > Required. Kemudian klik menu Education Hub > "2. Tambah lajur semakan laporan".'],
    ['3', 'Tab "Journal": semua trade pelajar (data mentah).'],
    ['4', 'Tab "Ringkasan Pelajar": prestasi setiap pelajar (bilangan trade, win rate, jumlah P/L, purata R).'],
    ['5', 'Tab "Dashboard Pelajar": pilih No. Matrik di sel B2 untuk lihat statistik, graf dan senarai trade seorang pelajar.'],
    ['6', 'Tab "Laporan": laporan yang dihantar. Isi lajur Status, Markah dan Komen Mentor.'],
    ['', ''],
    ['PENTING', 'Jangan ubah susunan soalan dalam Borang Trade, dan jangan hidupkan "Collect email addresses", kerana formula statistik bergantung pada susunan lajur. Soalan baru boleh ditambah di HUJUNG borang sahaja.'],
  ];
  sh.getRange(1, 1, baris.length, 2).setValues(baris);
  sh.getRange('A1').setFontSize(16).setFontWeight('bold');
  ['A3', 'A7', 'A11', 'A19'].forEach((a) => sh.getRange(a).setFontWeight('bold').setFontColor('#1c5cab'));
  sh.getRange('A4:A9').setFontWeight('bold');
  sh.setColumnWidth(1, 260);
  sh.setColumnWidth(2, 700);
  sh.getRange('B12:B19').setWrap(true);
}

// Jalankan SELEPAS menambah soalan "File upload" pada Borang Laporan.
function tambahLajurSemakan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(NAMA.laporan);
  if (!sh) throw new Error('Tab "Laporan" tidak dijumpai. Jalankan "Sediakan sistem" dahulu.');
  const tajuk = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (tajuk.indexOf('Status') !== -1) {
    SpreadsheetApp.getUi().alert('Lajur semakan sudah ada.');
    return;
  }
  const c = sh.getLastColumn() + 1;
  sh.getRange(1, c, 1, 3).setValues([['Status', 'Markah', 'Komen Mentor']]).setFontWeight('bold').setBackground('#fff8d6');
  sh.getRange(2, c, sh.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(TETAPAN.statusLaporan, true).build()
  );
  sh.setColumnWidth(c + 2, 320);
  SpreadsheetApp.getUi().alert('Lajur Status, Markah dan Komen Mentor telah ditambah dalam tab "Laporan".');
}
