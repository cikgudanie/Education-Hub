// Panel mentor: pantau journal pelajar, komen trade, semak laporan.
const express = require('express');
const db = require('../db');
const { computeStats } = require('../lib/stats');
const { hashPassword } = require('../lib/auth');
const v = require('../lib/views');
const f = require('../lib/forms');
const { sendCsv, TRADE_HEADER, tradeRow } = require('../lib/csv');

const router = express.Router();
const BASE = '/guru';
const STATUSES = ['Diterima', 'Sedang Disemak', 'Selesai Disemak', 'Perlu Dibaiki'];
const render = (res, title, body, status = 200) => res.status(status).send(v.page(title, body, { role: 'mentor' }));
const notFound = (res, what = 'Rekod') => render(res, 'Tidak Dijumpai', `<p>${what} tidak dijumpai.</p>`, 404);

// ---------- Pelajar ----------
router.get('/', (req, res) => {
  const className = f.text(req.query.kelas, 40);
  const students = db.listStudents({ className });
  const classes = db.listStudentClasses();
  render(res, 'Pelajar', `
    <div class="head-row"><h1>Pelajar <span class="muted">(${students.length})</span></h1>
      <a class="button secondary" href="${BASE}/eksport-trade.csv">Eksport Semua Trade (CSV)</a></div>
    <form method="get" class="card row">
      <select name="kelas"><option value="">Semua kelas</option>
        ${classes.map((c) => `<option ${c === className ? 'selected' : ''}>${v.esc(c)}</option>`).join('')}</select>
      <button>Tapis</button>
    </form>
    ${students.length === 0 ? '<p class="muted">Belum ada pelajar mendaftar. Minta pelajar daftar di halaman <strong>/daftar</strong>.</p>' : `
    <div class="scroll"><table>
      <thead><tr><th>Nama</th><th>No. Matrik</th><th>Kelas</th><th class="num">Trade</th><th class="num">Win Rate</th>
        <th class="num">Jumlah P/L</th><th>Trade Terakhir</th><th class="num">Laporan</th><th></th></tr></thead>
      <tbody>${students.map((s) => {
        const wr = s.wins + s.losses ? (s.wins / (s.wins + s.losses)) * 100 : null;
        return `<tr><td><strong>${v.esc(s.name)}</strong></td><td>${v.esc(s.student_id)}</td><td>${v.esc(s.class_name)}</td>
          <td class="num">${s.trade_count}</td><td class="num">${wr == null ? '–' : wr.toFixed(1) + '%'}</td>
          <td class="num">${s.trade_count ? v.pnl(s.total_pnl) : '–'}</td><td class="nowrap">${v.esc(s.last_trade || '–')}</td>
          <td class="num">${s.report_count}</td><td><a href="${BASE}/pelajar/${s.id}">Lihat Journal</a></td></tr>`;
      }).join('')}</tbody></table></div>`}`);
});

router.get('/pelajar/:id', (req, res) => {
  const s = db.getStudent(Number(req.params.id));
  if (!s) return notFound(res, 'Pelajar');
  const trades = db.listTrades(s.id);
  render(res, s.name, `
    <p><a href="${BASE}">← Senarai pelajar</a></p>
    <div class="head-row"><div><h1>${v.esc(s.name)}</h1><p class="muted">${v.esc(s.student_id)} · ${v.esc(s.class_name)} · Daftar ${v.esc(s.created_at)}</p></div>
      <a class="button secondary" href="${BASE}/pelajar/${s.id}/eksport.csv">Eksport CSV</a></div>
    ${req.query.reset ? v.alert('Kata laluan pelajar telah ditukar.', 'success') : ''}
    ${trades.length ? v.statsSection(computeStats(trades)) : ''}
    <h2>Semua Trade (${trades.length})</h2>
    ${v.tradeTable(trades, BASE)}
    <details class="card"><summary>Tetapkan semula kata laluan pelajar</summary>
      <form method="post" action="${BASE}/pelajar/${s.id}/kata-laluan" class="row">
        <input type="text" name="password" required minlength="6" placeholder="Kata laluan baru (min 6 aksara)">
        <button>Tukar</button>
      </form></details>`);
});

router.post('/pelajar/:id/kata-laluan', (req, res) => {
  const s = db.getStudent(Number(req.params.id));
  if (!s) return notFound(res, 'Pelajar');
  const pw = String(req.body.password || '');
  if (pw.length < 6) return res.redirect(`${BASE}/pelajar/${s.id}`);
  db.setStudentPassword(s.id, hashPassword(pw));
  res.redirect(`${BASE}/pelajar/${s.id}?reset=1`);
});

router.get('/pelajar/:id/eksport.csv', (req, res) => {
  const s = db.getStudent(Number(req.params.id));
  if (!s) return notFound(res, 'Pelajar');
  sendCsv(res, `journal-${s.student_id}.csv`, TRADE_HEADER, db.listTrades(s.id).reverse().map(tradeRow));
});

router.get('/eksport-trade.csv', (req, res) => {
  sendCsv(res, 'semua-trade.csv', ['Nama', 'No. Matrik', 'Kelas', ...TRADE_HEADER],
    db.listAllTrades().map((t) => [t.student_name, t.student_id, t.class_name, ...tradeRow(t)]));
});

// ---------- Trade ----------
router.get('/trade/:id', (req, res) => {
  const t = db.getTrade(Number(req.params.id));
  if (!t) return notFound(res, 'Trade');
  render(res, `Trade ${t.symbol}`, `
    <p><a href="${BASE}/pelajar/${t.student_ref}">← Journal ${v.esc(t.student_name)}</a></p>
    <h1>${v.esc(t.symbol)} · ${v.esc(t.trade_date)}</h1>
    <p class="muted">${v.esc(t.student_name)} · ${v.esc(t.student_id)} · ${v.esc(t.class_name)}</p>
    ${v.tradeDetail(t, BASE)}
    <h2>Komen Mentor</h2>
    <form method="post" action="${BASE}/trade/${t.id}/komen" class="card">
      <label>Komen untuk pelajar <textarea name="comment" rows="4" maxlength="3000" placeholder="cth: Entry terlalu awal, tunggu konfirmasi candle.">${v.esc(t.mentor_comment)}</textarea></label>
      <button>Simpan Komen</button>
    </form>`);
});

router.post('/trade/:id/komen', (req, res) => {
  const id = Number(req.params.id);
  if (!db.getTrade(id)) return notFound(res, 'Trade');
  db.setMentorComment(id, f.text(req.body.comment, 3000));
  res.redirect(`${BASE}/trade/${id}`);
});

router.get('/trade/:id/gambar', (req, res) => {
  const s = db.getTradeScreenshot(Number(req.params.id));
  if (!s) return res.status(404).send('Tidak dijumpai');
  res.setHeader('Content-Type', s.screenshot_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(s.screenshot));
});

// ---------- Laporan ----------
router.get('/laporan', (req, res) => {
  const search = f.text(req.query.cari, 100);
  const className = f.text(req.query.kelas, 40);
  const rows = db.listReports({ search, className });
  const classes = db.listReportClasses();
  render(res, 'Laporan', `
    <div class="head-row"><h1>Laporan <span class="muted">(${rows.length})</span></h1>
      <a class="button secondary" href="${BASE}/eksport-laporan.csv">Eksport CSV</a></div>
    <form method="get" class="card row">
      <input name="cari" placeholder="Cari nama, no. matrik atau tajuk" value="${v.esc(search)}">
      <select name="kelas"><option value="">Semua kelas</option>
        ${classes.map((c) => `<option ${c === className ? 'selected' : ''}>${v.esc(c)}</option>`).join('')}</select>
      <button>Tapis</button>
    </form>
    ${rows.length === 0 ? '<p class="muted">Tiada laporan.</p>' : `
    <div class="scroll"><table><thead><tr><th>#</th><th>Nama</th><th>No. Matrik</th><th>Kelas</th><th>Tajuk</th><th>Tarikh</th><th>Status</th><th>Markah</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td>${r.id}</td><td>${v.esc(r.student_name)}</td><td>${v.esc(r.student_id)}</td><td>${v.esc(r.class_name)}</td>
      <td>${v.esc(r.title)}</td><td class="nowrap">${v.esc(r.submitted_at)}</td><td>${v.badge(r.status)}</td><td>${v.esc(r.marks || '–')}</td>
      <td class="nowrap"><a href="${BASE}/laporan/${r.id}">Semak</a> · <a href="${BASE}/laporan/${r.id}/muat-turun">Muat turun</a></td>
    </tr>`).join('')}
    </tbody></table></div>`}`);
});

router.get('/laporan/:id', (req, res) => {
  const r = db.getReport(Number(req.params.id));
  if (!r) return notFound(res, 'Laporan');
  render(res, `Laporan #${r.id}`, `
    <p><a href="${BASE}/laporan">← Kembali</a></p>
    <h1>${v.esc(r.title)}</h1>
    <div class="card"><dl>
      <dt>Nama</dt><dd>${v.esc(r.student_name)}</dd>
      <dt>No. Matrik</dt><dd>${v.esc(r.student_id)}</dd>
      <dt>Kelas</dt><dd>${v.esc(r.class_name)}</dd>
      <dt>Tarikh Hantar</dt><dd>${v.esc(r.submitted_at)}</dd>
      <dt>Catatan Pelajar</dt><dd>${v.esc(r.description || '–')}</dd>
      <dt>Fail</dt><dd><a href="${BASE}/laporan/${r.id}/muat-turun">${v.esc(r.file_name)}</a> (${v.fmtSize(r.file_size)})</dd>
      <dt>Status</dt><dd>${v.badge(r.status)}</dd>
    </dl></div>
    <h2>Semakan Mentor</h2>
    <form method="post" action="${BASE}/laporan/${r.id}" class="card">
      <label>Status <select name="status">${STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Markah <input name="marks" maxlength="20" value="${v.esc(r.marks)}" placeholder="cth: 85/100 atau A"></label>
      <label>Komen <textarea name="teacher_note" rows="4" maxlength="2000">${v.esc(r.teacher_note)}</textarea></label>
      <button>Simpan Semakan</button>
    </form>
    <form method="post" action="${BASE}/laporan/${r.id}/padam" onsubmit="return confirm('Padam laporan ini secara kekal?')">
      <button class="danger">Padam Laporan</button>
    </form>`);
});

router.post('/laporan/:id', (req, res) => {
  const id = Number(req.params.id);
  db.updateReview(id, {
    status: STATUSES.includes(req.body.status) ? req.body.status : 'Diterima',
    marks: f.text(req.body.marks, 20),
    teacherNote: f.text(req.body.teacher_note, 2000),
  });
  res.redirect(`${BASE}/laporan/${id}`);
});

router.get('/laporan/:id/muat-turun', (req, res) => {
  const file = db.getReportFile(Number(req.params.id));
  if (!file) return res.status(404).send('Fail tidak dijumpai');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.attachment(file.file_name);
  res.send(Buffer.from(file.file_data));
});

router.post('/laporan/:id/padam', (req, res) => {
  db.deleteReport(Number(req.params.id));
  res.redirect(`${BASE}/laporan`);
});

router.get('/eksport-laporan.csv', (req, res) => {
  sendCsv(res, 'laporan-pelajar.csv', ['ID', 'Nama', 'No. Matrik', 'Kelas', 'Tajuk', 'Fail', 'Tarikh Hantar', 'Status', 'Markah'],
    db.listReports().map((r) => [r.id, r.student_name, r.student_id, r.class_name, r.title, r.file_name, r.submitted_at, r.status, r.marks]));
});

module.exports = router;
