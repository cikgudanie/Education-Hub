// Halaman pelajar: dashboard, trading journal dan penghantaran laporan.
const express = require('express');
const db = require('../db');
const { computeStats } = require('../lib/stats');
const v = require('../lib/views');
const f = require('../lib/forms');
const { sendCsv, TRADE_HEADER, tradeRow } = require('../lib/csv');

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

router.get('/', (req, res) => {
  const trades = db.listTrades(req.student.id);
  const s = computeStats(trades);
  render(res, 'Dashboard', `
    <div class="head-row"><div><h1>Assalamualaikum, ${v.esc(req.student.name)}</h1>
      <p class="muted">${v.esc(req.student.student_id)} · ${v.esc(req.student.class_name)}</p></div>
      <a class="button" href="${BASE}/trade/baru">+ Rekod Trade</a></div>
    ${trades.length ? v.statsSection(s) : `<div class="card center"><h2>Journal anda masih kosong</h2>
      <p>Mula rekod trade pertama anda untuk melihat statistik prestasi.</p>
      <p><a class="button" href="${BASE}/trade/baru">+ Rekod Trade Pertama</a></p></div>`}
    ${trades.length ? `<h2>Trade Terkini</h2>${v.tradeTable(trades.slice(0, 10), BASE)}
      <p><a href="${BASE}/journal">Lihat semua trade →</a></p>` : ''}`);
});

router.get('/journal', (req, res) => {
  const q = {
    symbol: f.text(req.query.pair, 20), strategy: f.text(req.query.strategi, 60),
    from: f.text(req.query.dari, 10), to: f.text(req.query.hingga, 10),
  };
  const trades = db.listTrades(req.student.id, q);
  const opts = (list, cur) => list.map((o) => `<option ${o === cur ? 'selected' : ''}>${v.esc(o)}</option>`).join('');
  render(res, 'Journal', `
    <div class="head-row"><h1>Trading Journal <span class="muted">(${trades.length})</span></h1>
      <div><a class="button" href="${BASE}/trade/baru">+ Rekod Trade</a> <a class="button secondary" href="${BASE}/eksport.csv">Eksport CSV</a></div></div>
    <form method="get" class="card row">
      <select name="pair"><option value="">Semua pair</option>${opts(db.distinctTradeValues(req.student.id, 'symbol'), q.symbol)}</select>
      <select name="strategi"><option value="">Semua strategi</option>${opts(db.distinctTradeValues(req.student.id, 'strategy'), q.strategy)}</select>
      <label class="inline-label">Dari <input type="date" name="dari" value="${v.esc(q.from)}"></label>
      <label class="inline-label">Hingga <input type="date" name="hingga" value="${v.esc(q.to)}"></label>
      <button>Tapis</button>
    </form>
    ${trades.length && (q.symbol || q.strategy || q.from || q.to) ? v.statsSection(computeStats(trades)) : ''}
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
