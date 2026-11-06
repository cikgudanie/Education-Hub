// Halaman pelajar: dashboard, trading journal dan penghantaran laporan.
const express = require('express');
const db = require('../db');
const { computeStats } = require('../lib/stats');
const v = require('../lib/views');
const f = require('../lib/forms');
const { sendCsv, TRADE_HEADER, tradeRow } = require('../lib/csv');
const mo = require('../lib/monthly');
const mv = require('../lib/monthly-view');

const router = express.Router();
const BASE = '/pelajar';
const render = (res, title, body, status = 200) => res.status(status).send(v.page(title, body, { role: 'student' }));

// Pastikan akaun masih wujud dan sediakan req.student.
router.use((req, res, next) => {
  req.student = db.getStudent(req.session.id);
  if (!req.student) return res.redirect('/masuk');
  next();
});

const ownTrade = (req) => {
  const t = db.getTrade(Number(req.params.id));
  return t && t.student_ref === req.student.id ? t : null;
};
const notFound = (res) => render(res, 'Tidak Dijumpai', '<p>Trade tidak dijumpai.</p>', 404);

// ---------- Dashboard bulanan (Pelan + Rekod Harian) ----------
const monthOf = (req) => (mo.isMonth(req.query.bulan) ? req.query.bulan : mo.thisMonth());

router.get('/', (req, res) => {
  const month = monthOf(req);
  const s = mo.summarize(db.getPlan(req.student.id, month), db.listDailyForMonth(req.student.id, month));
  const todayDone = db.getDailyByDate(req.student.id, mo.today());
  render(res, 'Dashboard', `
    <div class="head-row"><div><h1>Assalamualaikum, ${v.esc(req.student.name)}</h1>
      <p class="muted">${v.esc(req.student.student_id)} · ${v.esc(req.student.class_name)}</p></div>
      ${todayDone ? `<a class="button secondary" href="${BASE}/harian/${todayDone.id}">✓ Rekod hari ini sudah diisi</a>`
        : `<a class="button" href="${BASE}/harian/baru">+ Rekod Hari Ini</a>`}</div>
    ${mv.renderMonth({ s, month, base: BASE, canEdit: true, rules: db.getSetting('rules', mo.DEFAULT_RULES) })}`);
});

// ---------- Pelan bulanan ----------
router.get('/pelan', (req, res) => {
  const month = monthOf(req);
  let values = db.getPlan(req.student.id, month);
  let note = '';
  if (!values) {
    const prev = db.getPreviousPlan(req.student.id, month);
    if (prev) {
      // Modal bulan baru = modal akhir bulan sebelumnya.
      const end = mo.summarize(prev, db.listDailyForMonth(req.student.id, prev.month)).month.endCapital;
      values = { ...prev, capital: +end.toFixed(2) };
      note = `Diisi daripada pelan ${mo.monthLabel(prev.month)}, dengan modal akhir bulan itu. Semak dan simpan.`;
    } else {
      values = mo.DEFAULT_PLAN;
      note = 'Nilai contoh diisi mengikut templat Strategic Trading Implementation. Ubah ikut akaun anda.';
    }
  }
  render(res, 'Pelan Bulanan', `
    <p><a href="${BASE}?bulan=${month}">← Dashboard</a></p>
    <h1>Pelan Strategi Bulanan</h1>
    ${mv.monthNav(BASE, month, '/pelan')}
    ${note ? v.alert(note, 'info') : ''}
    ${mv.planForm({ action: `${BASE}/pelan`, values, month })}`);
});

router.post('/pelan', (req, res) => {
  const month = mo.isMonth(req.body.month) ? req.body.month : mo.thisMonth();
  const { plan, error } = f.parsePlan(req.body);
  if (error) {
    return render(res, 'Pelan Bulanan', `<h1>Pelan Strategi Bulanan</h1>${mv.monthNav(BASE, month, '/pelan')}
      ${mv.planForm({ action: `${BASE}/pelan`, values: req.body, error, month })}`, 400);
  }
  db.savePlan(req.student.id, month, plan);
  res.redirect(`${BASE}?bulan=${month}`);
});

// ---------- Rekod harian ----------
const IMG = `${BASE}/harian/gambar`;
const ownDaily = (req) => {
  const d = db.getDaily(Number(req.params.id));
  return d && d.student_ref === req.student.id ? d : null;
};
const dailyNotFound = (res) => render(res, 'Tidak Dijumpai', '<p>Rekod tidak dijumpai.</p>', 404);

router.get('/harian/baru', (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.tarikh || '')) ? req.query.tarikh : mo.today();
  const existing = db.getDailyByDate(req.student.id, date);
  if (existing) return res.redirect(`${BASE}/harian/${existing.id}/edit`);
  const plan = db.getPlan(req.student.id, date.slice(0, 7));
  render(res, 'Rekod Harian', `<h1>Rekod Harian</h1>
    ${plan ? '' : v.alert(`Anda belum ada pelan untuk ${mo.monthLabel(date.slice(0, 7))}. Rekod tetap boleh disimpan, tetapi modal dan sasaran Par hanya dikira selepas pelan ditetapkan.`, 'info')}
    ${mv.dailyForm({ action: `${BASE}/harian/baru`, values: { record_date: date, lot_size: plan ? plan.lot_size : '' } })}`);
});

router.post('/harian/baru', async (req, res) => {
  const uploadErr = await f.uploadScreenshots(req, res);
  const { daily, error } = f.parseDaily(req.body || {});
  let err = uploadErr || error;
  if (!err && db.getDailyByDate(req.student.id, daily.record_date)) {
    err = `Rekod untuk ${daily.record_date} sudah ada. Buka rekod itu untuk mengubahnya.`;
  }
  if (err) return render(res, 'Rekod Harian', `<h1>Rekod Harian</h1>${mv.dailyForm({ action: `${BASE}/harian/baru`, values: req.body || {}, error: err })}`, 400);
  const id = db.createDaily(req.student.id, daily);
  f.imagesFromFiles(req.files).forEach((img) => db.addRecordImage(id, img));
  res.redirect(`${BASE}?bulan=${daily.record_date.slice(0, 7)}`);
});

router.get('/harian/gambar/:imgId', (req, res) => {
  const img = db.getRecordImage(Number(req.params.imgId));
  if (!img || img.student_ref !== req.student.id) return res.status(404).send('Tidak dijumpai');
  res.setHeader('Content-Type', img.type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(img.data));
});

router.get('/harian/:id', (req, res) => {
  const d = ownDaily(req);
  if (!d) return dailyNotFound(res);
  render(res, `Rekod ${d.record_date}`, `
    <p><a href="${BASE}?bulan=${d.record_date.slice(0, 7)}">← Dashboard ${mo.monthLabel(d.record_date.slice(0, 7))}</a></p>
    <div class="head-row"><h1>Rekod Harian · ${v.esc(d.record_date)}</h1>
      <a class="button secondary" href="${BASE}/harian/${d.id}/edit">Edit</a></div>
    ${d.mentor_comment ? `<div class="alert info"><strong>Komen Mentor:</strong> ${v.esc(d.mentor_comment)}</div>` : ''}
    ${mv.dailyDetail(d, db.listRecordImages(d.id), IMG)}
    <form method="post" action="${BASE}/harian/${d.id}/padam" onsubmit="return confirm('Padam rekod hari ini secara kekal?')">
      <button class="danger">Padam Rekod</button></form>`);
});

router.get('/harian/:id/edit', (req, res) => {
  const d = ownDaily(req);
  if (!d) return dailyNotFound(res);
  render(res, 'Edit Rekod', `<h1>Edit Rekod Harian</h1>
    ${mv.dailyForm({ action: `${BASE}/harian/${d.id}/edit`, values: d, editing: true, images: db.listRecordImages(d.id), imgBase: IMG })}`);
});

router.post('/harian/:id/edit', async (req, res) => {
  const d = ownDaily(req);
  if (!d) return dailyNotFound(res);
  const uploadErr = await f.uploadScreenshots(req, res);
  const { daily, error } = f.parseDaily(req.body || {});
  let err = uploadErr || error;
  const clash = !err && db.getDailyByDate(req.student.id, daily.record_date);
  if (clash && clash.id !== d.id) err = `Rekod untuk ${daily.record_date} sudah ada.`;
  const removeIds = [].concat(req.body?.remove_images || []).map(Number);
  const keep = db.listRecordImages(d.id).filter((id) => !removeIds.includes(id)).length;
  if (!err && keep + (req.files || []).length > f.MAX_DAILY_IMAGES) err = `Maksimum ${f.MAX_DAILY_IMAGES} screenshot bagi setiap hari.`;
  if (err) {
    return render(res, 'Edit Rekod', `<h1>Edit Rekod Harian</h1>
      ${mv.dailyForm({ action: `${BASE}/harian/${d.id}/edit`, values: req.body || {}, error: err, editing: true, images: db.listRecordImages(d.id), imgBase: IMG })}`, 400);
  }
  db.updateDaily(d.id, req.student.id, daily);
  removeIds.forEach((id) => db.deleteRecordImage(id, req.student.id));
  f.imagesFromFiles(req.files).forEach((img) => db.addRecordImage(d.id, img));
  res.redirect(`${BASE}/harian/${d.id}`);
});

router.post('/harian/:id/padam', (req, res) => {
  const d = ownDaily(req);
  if (!d) return dailyNotFound(res);
  db.deleteDaily(d.id, req.student.id);
  res.redirect(`${BASE}?bulan=${d.record_date.slice(0, 7)}`);
});

router.get('/harian-eksport.csv', (req, res) => {
  const rows = [];
  const byMonth = new Map();
  for (const r of db.listDailyAll(req.student.id)) {
    const k = r.record_date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(r);
  }
  for (const [month, recs] of byMonth) {
    for (const d of mo.summarize(db.getPlan(req.student.id, month), recs).days) {
      rows.push([d.record_date, d.day, `Minggu ${d.week}`, d.setup, d.lot_size, d.total_trades, d.wins, d.losses, d.profit, -d.loss, d.pnl,
        d.pct == null ? '' : (d.pct * 100).toFixed(2), d.capitalAfter, d.notes, d.mentor_comment]);
    }
  }
  sendCsv(res, `rekod-harian-${req.student.student_id}.csv`,
    ['Tarikh', 'Hari', 'Minggu', 'Setup', 'Lot', 'Trade', 'Win', 'Loss', 'Profit', 'Loss (USD)', 'P/L', '% Modal', 'Modal', 'Catatan', 'Komen Mentor'], rows);
});

router.get('/journal', (req, res) => {
  const q = {
    symbol: f.text(req.query.pair, 20), strategy: f.text(req.query.strategi, 60),
    from: f.text(req.query.dari, 10), to: f.text(req.query.hingga, 10),
  };
  const trades = db.listTrades(req.student.id, q);
  const opts = (list, cur) => list.map((o) => `<option ${o === cur ? 'selected' : ''}>${v.esc(o)}</option>`).join('');
  render(res, 'Journal', `
    <div class="head-row"><h1>Journal Trade <span class="muted">(${trades.length})</span></h1>
      <div><a class="button" href="${BASE}/trade/baru">+ Rekod Trade</a> <a class="button secondary" href="${BASE}/eksport.csv">Eksport CSV</a></div></div>
    <form method="get" class="card row">
      <select name="pair"><option value="">Semua pair</option>${opts(db.distinctTradeValues(req.student.id, 'symbol'), q.symbol)}</select>
      <select name="strategi"><option value="">Semua strategi</option>${opts(db.distinctTradeValues(req.student.id, 'strategy'), q.strategy)}</select>
      <label class="inline-label">Dari <input type="date" name="dari" value="${v.esc(q.from)}"></label>
      <label class="inline-label">Hingga <input type="date" name="hingga" value="${v.esc(q.to)}"></label>
      <button>Tapis</button>
    </form>
    ${trades.length ? v.statsSection(computeStats(trades)) : '<p class="muted">Journal trade ialah pilihan tambahan untuk merekod setiap trade secara terperinci (entry, SL, TP, emosi). Rekod utama ialah Rekod Harian di Dashboard.</p>'}
    ${v.tradeTable(trades, BASE)}`);
});

router.get('/trade/baru', (req, res) => {
  render(res, 'Rekod Trade', `<h1>Rekod Trade Baru</h1>
    ${v.tradeForm({ action: `${BASE}/trade/baru`, values: { trade_date: new Date().toISOString().slice(0, 10) } })}`);
});

router.post('/trade/baru', async (req, res) => {
  const uploadErr = await f.uploadScreenshot(req, res);
  const { trade, error } = f.parseTrade(req.body || {});
  if (uploadErr || error) {
    return render(res, 'Rekod Trade', `<h1>Rekod Trade Baru</h1>
      ${v.tradeForm({ action: `${BASE}/trade/baru`, values: req.body || {}, error: uploadErr || error })}`, 400);
  }
  const id = db.createTrade(req.student.id, trade, f.screenshotFromFile(req.file));
  res.redirect(`${BASE}/trade/${id}`);
});

router.get('/trade/:id', (req, res) => {
  const t = ownTrade(req);
  if (!t) return notFound(res);
  render(res, `Trade ${t.symbol}`, `
    <p><a href="${BASE}/journal">← Kembali ke journal</a></p>
    <div class="head-row"><h1>${v.esc(t.symbol)} · ${v.esc(t.trade_date)}</h1>
      <div><a class="button secondary" href="${BASE}/trade/${t.id}/edit">Edit</a></div></div>
    ${t.mentor_comment ? `<div class="alert info"><strong>Komen Mentor:</strong> ${v.esc(t.mentor_comment)}</div>` : ''}
    ${v.tradeDetail(t, BASE)}
    <form method="post" action="${BASE}/trade/${t.id}/padam" onsubmit="return confirm('Padam trade ini secara kekal?')">
      <button class="danger">Padam Trade</button></form>`);
});

router.get('/trade/:id/edit', (req, res) => {
  const t = ownTrade(req);
  if (!t) return notFound(res);
  render(res, 'Edit Trade', `<h1>Edit Trade</h1>${v.tradeForm({ action: `${BASE}/trade/${t.id}/edit`, values: t, editing: true })}`);
});

router.post('/trade/:id/edit', async (req, res) => {
  const t = ownTrade(req);
  if (!t) return notFound(res);
  const uploadErr = await f.uploadScreenshot(req, res);
  const { trade, error } = f.parseTrade(req.body || {});
  if (uploadErr || error) {
    return render(res, 'Edit Trade', `<h1>Edit Trade</h1>
      ${v.tradeForm({ action: `${BASE}/trade/${t.id}/edit`, values: { ...req.body, has_screenshot: t.has_screenshot }, error: uploadErr || error, editing: true })}`, 400);
  }
  db.updateTrade(t.id, req.student.id, trade, f.screenshotFromFile(req.file), req.body.remove_screenshot === '1');
  res.redirect(`${BASE}/trade/${t.id}`);
});

router.post('/trade/:id/padam', (req, res) => {
  db.deleteTrade(Number(req.params.id), req.student.id);
  res.redirect(`${BASE}/journal`);
});

router.get('/trade/:id/gambar', (req, res) => {
  const s = db.getTradeScreenshot(Number(req.params.id));
  if (!s || s.student_ref !== req.student.id) return res.status(404).send('Tidak dijumpai');
  res.setHeader('Content-Type', s.screenshot_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(s.screenshot));
});

router.get('/eksport.csv', (req, res) => {
  sendCsv(res, `journal-${req.student.student_id}.csv`, TRADE_HEADER, db.listTrades(req.student.id).reverse().map(tradeRow));
});

// ---------- Laporan ----------
function reportsPage(req, { error = '', ok = '', values = {} } = {}) {
  const rows = db.listReportsByStudentId(req.student.student_id);
  const val = (k) => v.esc(values[k]);
  return `<h1>Laporan Trading</h1>
    <p class="muted">Hantar laporan (cth: laporan bulanan, analisis pasaran, rumusan journal) kepada mentor. Maksimum ${f.MAX_FILE_MB} MB.</p>
    ${v.alert(error)}${v.alert(ok, 'success')}
    <form method="post" action="${BASE}/laporan" enctype="multipart/form-data" class="card">
      <label>Tajuk Laporan <input name="title" required maxlength="200" placeholder="cth: Laporan Trading Oktober 2026" value="${val('title')}"></label>
      <label>Catatan (pilihan) <textarea name="description" rows="3" maxlength="2000">${val('description')}</textarea></label>
      <label>Fail Laporan <input type="file" name="report_file" required accept="${f.REPORT_EXT.join(',')}"></label>
      <small class="muted">Format dibenarkan: ${f.REPORT_EXT.join(', ')}</small>
      <button type="submit">Hantar Laporan</button>
    </form>
    <h2>Laporan Saya</h2>
    ${rows.length === 0 ? '<p class="muted">Belum ada laporan dihantar.</p>' : `<div class="scroll"><table>
      <thead><tr><th>#</th><th>Tajuk</th><th>Fail</th><th>Tarikh</th><th>Status</th><th>Markah</th><th>Komen Mentor</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${r.id}</td><td>${v.esc(r.title)}</td>
        <td><a href="${BASE}/laporan/${r.id}/muat-turun">${v.esc(r.file_name)}</a></td><td class="nowrap">${v.esc(r.submitted_at)}</td>
        <td>${v.badge(r.status)}</td><td>${v.esc(r.marks || '–')}</td><td>${v.esc(r.teacher_note || '–')}</td></tr>`).join('')}
      </tbody></table></div>`}`;
}

router.get('/laporan', (req, res) => {
  render(res, 'Laporan', reportsPage(req, { ok: req.query.berjaya ? `Laporan #${Number(req.query.berjaya)} berjaya dihantar.` : '' }));
});

router.post('/laporan', async (req, res) => {
  const uploadErr = await f.uploadReport(req, res);
  const values = req.body || {};
  const title = f.text(values.title, 200);
  const error = uploadErr || (!title && 'Sila masukkan tajuk laporan.') || ((!req.file || !req.file.size) && 'Sila pilih fail laporan.');
  if (error) return render(res, 'Laporan', reportsPage(req, { error, values }), 400);
  const id = db.createReport({
    studentName: req.student.name, studentId: req.student.student_id, className: req.student.class_name,
    title, description: f.text(values.description, 2000),
    fileName: req.file.originalname, fileType: req.file.mimetype || 'application/octet-stream',
    fileSize: req.file.size, fileData: req.file.buffer,
  });
  res.redirect(`${BASE}/laporan?berjaya=${id}`);
});

router.get('/laporan/:id/muat-turun', (req, res) => {
  const file = db.getReportFile(Number(req.params.id));
  if (!file || file.student_id.toLowerCase() !== req.student.student_id.toLowerCase()) return res.status(404).send('Tidak dijumpai');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.attachment(file.file_name);
  res.send(Buffer.from(file.file_data));
});

module.exports = router;
