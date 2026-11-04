// Education Hub: sistem penghantaran laporan pelajar.
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const db = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 10;

const ALLOWED_EXT = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt', '.jpg', '.jpeg', '.png', '.zip'];
const STATUSES = ['Diterima', 'Sedang Disemak', 'Selesai Disemak', 'Perlu Dibaiki'];

if (!process.env.ADMIN_PASSWORD) {
  console.warn('AMARAN: ADMIN_PASSWORD tidak ditetapkan. Kata laluan lalai "admin123" digunakan. Sila tukar!');
}

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use('/static', express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.includes(ext)) cb(null, true);
    else cb(new Error(`Jenis fail tidak dibenarkan. Dibenarkan: ${ALLOWED_EXT.join(', ')}`));
  },
});

// ---------- Utiliti ----------
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtSize = (b) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

const statusBadge = (s) => `<span class="badge badge-${esc(s).toLowerCase().replace(/\s+/g, '-')}">${esc(s)}</span>`;

function page(title, body, { admin = false } = {}) {
  const nav = admin
    ? `<a href="/guru">Senarai Laporan</a><a href="/guru/eksport.csv">Eksport CSV</a>
       <form method="post" action="/guru/logout" class="inline"><button class="link">Log Keluar</button></form>`
    : `<a href="/">Hantar Laporan</a><a href="/semak">Semak Status</a><a href="/guru">Guru</a>`;
  return `<!doctype html>
<html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Education Hub</title><link rel="stylesheet" href="/static/style.css"></head>
<body><header><div class="wrap"><strong class="brand">Education Hub</strong><nav>${nav}</nav></div></header>
<main class="wrap">${body}</main></body></html>`;
}

// ---------- Sesi guru (cookie bertandatangan HMAC) ----------
const sign = (v) => crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('hex');

function makeToken() {
  const exp = String(Date.now() + 8 * 60 * 60 * 1000); // 8 jam
  return `${exp}.${sign(exp)}`;
}

function isValidToken(token) {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

function getCookie(req, name) {
  const match = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function requireAdmin(req, res, next) {
  if (isValidToken(getCookie(req, 'guru'))) return next();
  res.redirect('/guru/login');
}

function passwordMatches(input) {
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- Halaman pelajar ----------
function studentForm({ error = '', values = {} } = {}) {
  const v = (k) => esc(values[k]);
  return page('Hantar Laporan', `
    <h1>Hantar Laporan</h1>
    <p class="muted">Isi maklumat di bawah dan muat naik fail laporan anda (maksimum ${MAX_FILE_MB} MB).</p>
    ${error ? `<div class="alert error">${esc(error)}</div>` : ''}
    <form method="post" action="/hantar" enctype="multipart/form-data" class="card">
      <label>Nama Penuh <input name="student_name" required maxlength="120" value="${v('student_name')}"></label>
      <label>No. Matrik / No. Pelajar <input name="student_id" required maxlength="40" value="${v('student_id')}"></label>
      <label>Kelas <input name="class_name" required maxlength="40" placeholder="cth: 5 Bestari" value="${v('class_name')}"></label>
      <label>Tajuk Laporan <input name="title" required maxlength="200" value="${v('title')}"></label>
      <label>Catatan (pilihan) <textarea name="description" rows="3" maxlength="2000">${v('description')}</textarea></label>
      <label>Fail Laporan <input type="file" name="report_file" required accept="${ALLOWED_EXT.join(',')}"></label>
      <small class="muted">Format dibenarkan: ${ALLOWED_EXT.join(', ')}</small>
      <button type="submit">Hantar</button>
    </form>`);
}

app.get('/', (req, res) => res.send(studentForm()));

app.post('/hantar', (req, res) => {
  upload.single('report_file')(req, res, (err) => {
    const values = req.body || {};
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? `Fail terlalu besar. Had maksimum ${MAX_FILE_MB} MB.` : err.message;
      return res.status(400).send(studentForm({ error: msg, values }));
    }
    const fields = ['student_name', 'student_id', 'class_name', 'title'].map((k) => String(values[k] || '').trim());
    if (fields.some((f) => !f)) {
      return res.status(400).send(studentForm({ error: 'Sila lengkapkan semua maklumat wajib.', values }));
    }
    if (!req.file || req.file.size === 0) {
      return res.status(400).send(studentForm({ error: 'Sila pilih fail laporan.', values }));
    }
    const [studentName, studentId, className, title] = fields;
    const id = db.createReport({
      studentName, studentId, className, title,
      description: String(values.description || '').trim(),
      fileName: req.file.originalname,
      fileType: req.file.mimetype || 'application/octet-stream',
      fileSize: req.file.size,
      fileData: req.file.buffer,
    });
    res.send(page('Berjaya', `
      <div class="card center">
        <h1>✅ Laporan berjaya dihantar</h1>
        <p>No. rujukan: <strong>#${id}</strong></p>
        <p>${esc(title)} — ${esc(req.file.originalname)}</p>
        <p><a href="/semak?student_id=${encodeURIComponent(studentId)}">Semak status laporan saya</a> · <a href="/">Hantar laporan lain</a></p>
      </div>`));
  });
});

app.get('/semak', (req, res) => {
  const sid = String(req.query.student_id || '').trim();
  const rows = sid ? db.listByStudentId(sid) : [];
  const table = !sid ? '' : rows.length === 0
    ? '<p class="muted">Tiada laporan dijumpai untuk nombor ini.</p>'
    : `<table><thead><tr><th>#</th><th>Tajuk</th><th>Tarikh</th><th>Status</th><th>Markah</th><th>Komen Guru</th></tr></thead><tbody>
       ${rows.map((r) => `<tr><td>${r.id}</td><td>${esc(r.title)}</td><td>${esc(r.submitted_at)}</td>
         <td>${statusBadge(r.status)}</td><td>${esc(r.marks || '-')}</td><td>${esc(r.teacher_note || '-')}</td></tr>`).join('')}
       </tbody></table>`;
  res.send(page('Semak Status', `
    <h1>Semak Status Laporan</h1>
    <form method="get" class="card row">
      <input name="student_id" placeholder="Masukkan No. Matrik / No. Pelajar" required value="${esc(sid)}">
      <button>Semak</button>
    </form>${table}`));
});

// ---------- Halaman guru ----------
app.get('/guru/login', (req, res) => {
  const error = req.query.ralat ? '<div class="alert error">Kata laluan salah.</div>' : '';
  res.send(page('Log Masuk Guru', `
    <h1>Log Masuk Guru</h1>${error}
    <form method="post" action="/guru/login" class="card narrow">
      <label>Kata Laluan <input type="password" name="password" required autofocus></label>
      <button>Log Masuk</button>
    </form>`));
});

app.post('/guru/login', (req, res) => {
  if (!passwordMatches(req.body.password)) return res.redirect('/guru/login?ralat=1');
  res.setHeader('Set-Cookie', `guru=${encodeURIComponent(makeToken())}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
  res.redirect('/guru');
});

app.post('/guru/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'guru=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.redirect('/guru/login');
});

app.get('/guru', requireAdmin, (req, res) => {
  const search = String(req.query.cari || '').trim();
  const className = String(req.query.kelas || '').trim();
  const rows = db.listReports({ search, className });
  const classes = db.listClasses();
  res.send(page('Senarai Laporan', `
    <h1>Senarai Laporan <span class="muted">(${rows.length})</span></h1>
    <form method="get" class="card row">
      <input name="cari" placeholder="Cari nama, no. matrik atau tajuk" value="${esc(search)}">
      <select name="kelas"><option value="">Semua kelas</option>
        ${classes.map((c) => `<option ${c === className ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <button>Tapis</button>
    </form>
    ${rows.length === 0 ? '<p class="muted">Tiada laporan.</p>' : `
    <div class="scroll"><table><thead><tr><th>#</th><th>Nama</th><th>No. Matrik</th><th>Kelas</th><th>Tajuk</th><th>Tarikh</th><th>Status</th><th>Markah</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr>
      <td>${r.id}</td><td>${esc(r.student_name)}</td><td>${esc(r.student_id)}</td><td>${esc(r.class_name)}</td>
      <td>${esc(r.title)}</td><td>${esc(r.submitted_at)}</td><td>${statusBadge(r.status)}</td><td>${esc(r.marks || '-')}</td>
      <td class="nowrap"><a href="/guru/laporan/${r.id}">Semak</a> · <a href="/guru/laporan/${r.id}/muat-turun">Muat turun</a></td>
    </tr>`).join('')}
    </tbody></table></div>`}`, { admin: true }));
});

app.get('/guru/laporan/:id', requireAdmin, (req, res) => {
  const r = db.getReport(Number(req.params.id));
  if (!r) return res.status(404).send(page('Tidak Dijumpai', '<p>Laporan tidak dijumpai.</p>', { admin: true }));
  res.send(page(`Laporan #${r.id}`, `
    <p><a href="/guru">← Kembali</a></p>
    <h1>${esc(r.title)}</h1>
    <div class="card">
      <dl>
        <dt>Nama</dt><dd>${esc(r.student_name)}</dd>
        <dt>No. Matrik</dt><dd>${esc(r.student_id)}</dd>
        <dt>Kelas</dt><dd>${esc(r.class_name)}</dd>
        <dt>Tarikh Hantar</dt><dd>${esc(r.submitted_at)}</dd>
        <dt>Catatan Pelajar</dt><dd>${esc(r.description || '-')}</dd>
        <dt>Fail</dt><dd><a href="/guru/laporan/${r.id}/muat-turun">${esc(r.file_name)}</a> (${fmtSize(r.file_size)})</dd>
        <dt>Status</dt><dd>${statusBadge(r.status)}</dd>
      </dl>
    </div>
    <h2>Semakan Guru</h2>
    <form method="post" action="/guru/laporan/${r.id}" class="card">
      <label>Status <select name="status">${STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>Markah <input name="marks" maxlength="20" value="${esc(r.marks)}" placeholder="cth: 85/100 atau A"></label>
      <label>Komen <textarea name="teacher_note" rows="4" maxlength="2000">${esc(r.teacher_note)}</textarea></label>
      <button>Simpan Semakan</button>
    </form>
    <form method="post" action="/guru/laporan/${r.id}/padam" onsubmit="return confirm('Padam laporan ini secara kekal?')">
      <button class="danger">Padam Laporan</button>
    </form>`, { admin: true }));
});

app.post('/guru/laporan/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'Diterima';
  db.updateReview(id, {
    status,
    marks: String(req.body.marks || '').trim().slice(0, 20),
    teacherNote: String(req.body.teacher_note || '').trim().slice(0, 2000),
  });
  res.redirect(`/guru/laporan/${id}`);
});

app.get('/guru/laporan/:id/muat-turun', requireAdmin, (req, res) => {
  const f = db.getReportFile(Number(req.params.id));
  if (!f) return res.status(404).send('Fail tidak dijumpai');
  res.setHeader('Content-Type', f.file_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.attachment(f.file_name);
  res.send(Buffer.from(f.file_data));
});

app.post('/guru/laporan/:id/padam', requireAdmin, (req, res) => {
  db.deleteReport(Number(req.params.id));
  res.redirect('/guru');
});

app.get('/guru/eksport.csv', requireAdmin, (req, res) => {
  const rows = db.listReports();
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s; // elak suntikan formula Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ['ID', 'Nama', 'No. Matrik', 'Kelas', 'Tajuk', 'Fail', 'Tarikh Hantar', 'Status', 'Markah'];
  const lines = rows.map((r) =>
    [r.id, r.student_name, r.student_id, r.class_name, r.title, r.file_name, r.submitted_at, r.status, r.marks].map(cell).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.attachment('laporan-pelajar.csv');
  res.send('﻿' + [header.map(cell).join(','), ...lines].join('\r\n'));
});

app.listen(PORT, () => console.log(`Education Hub berjalan di http://localhost:${PORT}`));
