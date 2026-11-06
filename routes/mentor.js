// Panel mentor: pantau journal pelajar, komen trade, semak laporan.
const express = require('express');
const db = require('../db');
const { computeStats } = require('../lib/stats');
const { hashPassword } = require('../lib/auth');
const v = require('../lib/views');
const f = require('../lib/forms');
const { sendCsv, TRADE_HEADER, tradeRow } = require('../lib/csv');
const mo = require('../lib/monthly');
const mv = require('../lib/monthly-view');

const router = express.Router();
const BASE = '/guru';
const STATUSES = ['Diterima', 'Sedang Disemak', 'Selesai Disemak', 'Perlu Dibaiki'];
const render = (res, title, body, status = 200) => res.status(status).send(v.page(title, body, { role: 'mentor' }));
const notFound = (res, what = 'Rekod') => render(res, 'Tidak Dijumpai', `<p>${what} tidak dijumpai.</p>`, 404);

// ---------- Pelajar (ringkasan bulanan) ----------
const monthOf = (req) => (mo.isMonth(req.query.bulan) ? req.query.bulan : mo.thisMonth());

router.get('/', (req, res) => {
  const month = monthOf(req);
  const className = f.text(req.query.kelas, 40);
  const rows = db.monthOverview(month, className);
  const classes = db.listStudentClasses();
  const today = mo.today();
  const daysAgo = (d) => (d ? Math.round((Date.parse(today) - Date.parse(d)) / 86400000) : null);
  const q = className ? `&kelas=${encodeURIComponent(className)}` : '';
  render(res, 'Pelajar', `
    <div class="head-row"><h1>Pelajar <span class="muted">(${rows.length})</span></h1>
      <a class="button secondary" href="${BASE}/eksport-trade.csv">Eksport Journal Trade (CSV)</a></div>
    <form method="get" class="card row">
      <input type="month" name="bulan" value="${month}" aria-label="Bulan">
      <select name="kelas"><option value="">Semua kelas</option>
        ${classes.map((c) => `<option ${c === className ? 'selected' : ''}>${v.esc(c)}</option>`).join('')}</select>
      <button>Tapis</button>
    </form>
    ${mv.monthNav(BASE, month).replace(/\?bulan=([0-9-]+)/g, `?bulan=$1${q.replace(/&/g, '&amp;')}`)}
    ${rows.length === 0 ? '<p class="muted">Belum ada pelajar mendaftar. Minta pelajar daftar di halaman <strong>/daftar</strong>.</p>' : `
    <div class="scroll"><table>
      <thead><tr><th>Nama</th><th>Kelas</th><th class="num">Modal Awal</th><th class="num">P/L Bulan</th><th class="num">% Bulan</th>
        <th>Par 1</th><th class="num">Hari</th><th class="num">Win Rate</th><th class="num">P/L Ratio</th><th>Rekod Terakhir</th><th class="num">Laporan</th><th></th></tr></thead>
      <tbody>${rows.map((s) => {
        const pct = s.capital ? s.pnl / s.capital : null;
        const par1 = s.capital ? s.capital * s.base_pct : null;
        const wr = s.wins + s.losses ? (s.wins / (s.wins + s.losses)) * 100 : null;
        const ago = daysAgo(s.last_record);
        const over = s.capital && s.risk_tolerance_pct != null && -s.pnl >= s.capital * s.risk_tolerance_pct;
        return `<tr>
          <td><strong>${v.esc(s.name)}</strong><br><span class="muted">${v.esc(s.student_id)}</span></td><td>${v.esc(s.class_name)}</td>
          <td class="num">${s.capital ? mv.money(s.capital) : '<span class="badge">Tiada pelan</span>'}</td>
          <td class="num">${s.days ? v.pnl(s.pnl) : '–'}</td><td class="num">${s.days ? mv.pct(pct) : '–'}</td>
          <td>${par1 == null ? '–' : s.pnl >= par1 ? '<span class="badge badge-untung">✓ Capai</span>' : `<span class="muted">Baki ${mv.money(par1 - s.pnl)}</span>`}${over ? ' <span class="badge badge-rugi">⚠ Risiko</span>' : ''}</td>
          <td class="num">${s.days}</td><td class="num">${wr == null ? '–' : wr.toFixed(1) + '%'}</td>
          <td class="num">${s.loss ? v.fmtNum(s.profit / s.loss) : '–'}</td>
          <td class="nowrap">${s.last_record ? `${v.esc(s.last_record)}${ago >= 3 ? ` <span class="badge badge-rugi">${ago} hari lalu</span>` : ''}` : '<span class="badge">Belum mula</span>'}</td>
          <td class="num">${s.report_count}</td>
          <td><a href="${BASE}/pelajar/${s.id}?bulan=${month}">Lihat</a></td></tr>`;
      }).join('')}</tbody></table></div>
    <p class="muted">Lencana merah "hari lalu" menandakan pelajar yang tidak mengemas kini rekod selama 3 hari atau lebih.</p>`}`);
});

router.get('/pelajar/:id', (req, res) => {
  const st = db.getStudent(Number(req.params.id));
  if (!st) return notFound(res, 'Pelajar');
  const month = monthOf(req);
  const s = mo.summarize(db.getPlan(st.id, month), db.listDailyForMonth(st.id, month));
  const trades = db.listTrades(st.id);
  const reports = db.listReportsByStudentId(st.student_id);
  render(res, st.name, `
    <p><a href="${BASE}?bulan=${month}">← Senarai pelajar</a></p>
    <div class="head-row"><div><h1>${v.esc(st.name)}</h1><p class="muted">${v.esc(st.student_id)} · ${v.esc(st.class_name)} · Daftar ${v.esc(st.created_at)}</p></div>
      <div><a class="button secondary" href="${BASE}/pelajar/${st.id}/harian.csv">Eksport Rekod Harian</a></div></div>
    ${req.query.reset ? v.alert('Kata laluan pelajar telah ditukar.', 'success') : ''}
    ${mv.renderMonth({ s, month, base: BASE, canEdit: false, navPath: `/pelajar/${st.id}` })}
    <h2>Laporan (${reports.length})</h2>
    ${reports.length ? `<div class="scroll"><table><thead><tr><th>Tajuk</th><th>Tarikh</th><th>Status</th><th>Markah</th><th></th></tr></thead><tbody>
      ${reports.map((r) => `<tr><td>${v.esc(r.title)}</td><td class="nowrap">${v.esc(r.submitted_at)}</td><td>${v.badge(r.status)}</td><td>${v.esc(r.marks || '–')}</td>
        <td><a href="${BASE}/laporan/${r.id}">Semak</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Tiada laporan.</p>'}
    <h2>Journal Trade (${trades.length})</h2>
    ${trades.length ? v.statsSection(computeStats(trades)) + v.tradeTable(trades, BASE) : '<p class="muted">Pelajar ini tidak menggunakan journal trade.</p>'}
    <details class="card"><summary>Tetapkan semula kata laluan pelajar</summary>
      <form method="post" action="${BASE}/pelajar/${st.id}/kata-laluan" class="row">
        <input type="text" name="password" required minlength="6" placeholder="Kata laluan baru (min 6 aksara)">
        <button>Tukar</button>
      </form></details>`);
});

router.get('/pelajar/:id/harian.csv', (req, res) => {
  const st = db.getStudent(Number(req.params.id));
  if (!st) return notFound(res, 'Pelajar');
  const byMonth = new Map();
  for (const r of db.listDailyAll(st.id)) {
    const k = r.record_date.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(r);
  }
  const rows = [];
  for (const [month, recs] of byMonth) {
    for (const d of mo.summarize(db.getPlan(st.id, month), recs).days) {
      rows.push([d.record_date, d.day, `Minggu ${d.week}`, d.setup, d.lot_size, d.total_trades, d.wins, d.losses, d.profit, -d.loss, d.pnl,
        d.pct == null ? '' : (d.pct * 100).toFixed(2), d.capitalAfter, d.notes, d.mentor_comment]);
    }
  }
  sendCsv(res, `rekod-harian-${st.student_id}.csv`,
    ['Tarikh', 'Hari', 'Minggu', 'Setup', 'Lot', 'Trade', 'Win', 'Loss', 'Profit', 'Loss (USD)', 'P/L', '% Modal', 'Modal', 'Catatan', 'Komen Mentor'], rows);
});

// ---------- Rekod harian ----------
const IMG = `${BASE}/harian/gambar`;

router.get('/harian/gambar/:imgId', (req, res) => {
  const img = db.getRecordImage(Number(req.params.imgId));
  if (!img) return res.status(404).send('Tidak dijumpai');
  res.setHeader('Content-Type', img.type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(img.data));
});

router.get('/harian/:id', (req, res) => {
  const d = db.getDaily(Number(req.params.id));
  if (!d) return notFound(res, 'Rekod');
  const month = d.record_date.slice(0, 7);
  render(res, `Rekod ${d.record_date}`, `
    <p><a href="${BASE}/pelajar/${d.student_ref}?bulan=${month}">← ${v.esc(d.student_name)} · ${mo.monthLabel(month)}</a></p>
    <h1>Rekod Harian · ${v.esc(d.record_date)}</h1>
    <p class="muted">${v.esc(d.student_name)} · ${v.esc(d.student_id)} · ${v.esc(d.class_name)}</p>
    ${mv.dailyDetail(d, db.listRecordImages(d.id), IMG)}
    <h2>Komen Mentor</h2>
    <form method="post" action="${BASE}/harian/${d.id}/komen" class="card">
      <label>Komen untuk pelajar <textarea name="comment" rows="4" maxlength="3000" placeholder="cth: Bagus, ikut plan. Kurangkan trade bila sudah capai Par 1.">${v.esc(d.mentor_comment)}</textarea></label>
      <button>Simpan Komen</button>
    </form>`);
});

router.post('/harian/:id/komen', (req, res) => {
  const id = Number(req.params.id);
  if (!db.getDaily(id)) return notFound(res, 'Rekod');
  db.setDailyComment(id, f.text(req.body.comment, 3000));
  res.redirect(`${BASE}/harian/${id}`);
});

// ---------- Tetapan program ----------


router.get('/tetapan', (req, res) => {
  render(res, 'Tetapan', `
    <h1>Tetapan Program</h1>
    ${req.query.ok ? v.alert('Tetapan disimpan.', 'success') : ''}
    <form method="post" action="${BASE}/tetapan" class="card">
      <label>Nama program (dipaparkan di atas setiap halaman)
        <input name="program_name" maxlength="60" value="${v.esc(db.getSetting('program_name', 'Education Hub'))}"></label>
      <label>Peraturan &amp; Mindset (dipaparkan pada dashboard setiap pelajar)
        <textarea name="rules" rows="14" maxlength="4000">${v.esc(db.getSetting('rules', mo.DEFAULT_RULES))}</textarea></label>
      <button>Simpan Tetapan</button>
    </form>`);
});

router.post('/tetapan', (req, res) => {
  db.setSetting('program_name', f.text(req.body.program_name, 60) || 'Education Hub');
  db.setSetting('rules', String(req.body.rules || '').slice(0, 4000));
  res.redirect(`${BASE}/tetapan?ok=1`);
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
