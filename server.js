// Education Hub: trading journal dan penghantaran laporan trading pelajar.
const path = require('node:path');
const express = require('express');
const db = require('./db');
const auth = require('./lib/auth');
const v = require('./lib/views');
const { text } = require('./lib/forms');

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(auth.sessionMiddleware);

// Had cubaan log masuk ringkas (dalam memori): 10 cubaan gagal setiap 15 minit bagi setiap IP.
const failures = new Map();
const tooManyAttempts = (ip) => {
  const f = failures.get(ip);
  return f && f.count >= 10 && Date.now() - f.first < 15 * 60 * 1000;
};
const recordFailure = (ip) => {
  const f = failures.get(ip);
  if (!f || Date.now() - f.first > 15 * 60 * 1000) failures.set(ip, { count: 1, first: Date.now() });
  else f.count += 1;
};

const guestPage = (res, title, body, status = 200) => res.status(status).send(v.page(title, body));

// ---------- Umum ----------
app.get('/', (req, res) => {
  if (req.session?.role === 'student') return res.redirect('/pelajar');
  if (req.session?.role === 'mentor') return res.redirect('/guru');
  guestPage(res, 'Selamat Datang', `
    <section class="hero card">
      <h1>Trading Journal &amp; Laporan Trading</h1>
      <p>Rekod setiap trade, lihat statistik prestasi anda secara automatik, dan hantar laporan trading kepada mentor.</p>
      <p><a class="button" href="/masuk">Log Masuk Pelajar</a> <a class="button secondary" href="/daftar">Daftar Akaun</a></p>
    </section>
    <div class="grid3">
      <div class="card"><h3>📒 Journal</h3><p class="muted">Pair, entry, SL, TP, exit, lot, P/L, strategi, emosi, pengajaran dan screenshot chart.</p></div>
      <div class="card"><h3>📊 Statistik</h3><p class="muted">Win rate, profit factor, purata R, drawdown, graf ekuiti, prestasi ikut pair dan strategi.</p></div>
      <div class="card"><h3>📝 Laporan</h3><p class="muted">Hantar laporan trading (PDF, Word, Excel) dan terima markah serta komen mentor.</p></div>
    </div>`);
});

function registerForm({ error = '', values = {} } = {}) {
  const val = (k) => v.esc(values[k]);
  return `<h1>Daftar Akaun Pelajar</h1>${v.alert(error)}
    <form method="post" action="/daftar" class="card narrow">
      <label>Nama Penuh <input name="name" required maxlength="120" value="${val('name')}"></label>
      <label>No. Matrik / No. Pelajar <input name="student_id" required maxlength="40" value="${val('student_id')}"></label>
      <label>Kelas / Kumpulan <input name="class_name" required maxlength="40" placeholder="cth: Batch Jan 2026" value="${val('class_name')}"></label>
      <label>Kata Laluan <input type="password" name="password" required minlength="6"></label>
      <label>Sahkan Kata Laluan <input type="password" name="password2" required minlength="6"></label>
      <button>Daftar</button>
      <p class="muted">Sudah ada akaun? <a href="/masuk">Log masuk</a></p>
    </form>`;
}

app.get('/daftar', (req, res) => guestPage(res, 'Daftar', registerForm()));

app.post('/daftar', (req, res) => {
  const values = req.body;
  const name = text(values.name, 120);
  const studentId = text(values.student_id, 40);
  const className = text(values.class_name, 40);
  const pw = String(values.password || '');
  let error = '';
  if (!name || !studentId || !className) error = 'Sila lengkapkan semua maklumat.';
  else if (pw.length < 6) error = 'Kata laluan mesti sekurang-kurangnya 6 aksara.';
  else if (pw !== values.password2) error = 'Kata laluan tidak sepadan.';
  else if (db.getStudentByStudentId(studentId)) error = 'No. matrik ini sudah didaftarkan. Sila log masuk.';
  if (error) return guestPage(res, 'Daftar', registerForm({ error, values }), 400);
  const id = db.createStudent({ studentId, name, className, passwordHash: auth.hashPassword(pw) });
  auth.setSession(res, 'student', id);
  res.redirect('/pelajar');
});

function loginForm({ error = '', sid = '' } = {}) {
  return `<h1>Log Masuk Pelajar</h1>${v.alert(error)}
    <form method="post" action="/masuk" class="card narrow">
      <label>No. Matrik / No. Pelajar <input name="student_id" required value="${v.esc(sid)}" autofocus></label>
      <label>Kata Laluan <input type="password" name="password" required></label>
      <button>Log Masuk</button>
      <p class="muted">Belum ada akaun? <a href="/daftar">Daftar</a>. Lupa kata laluan? Hubungi mentor anda.</p>
    </form>`;
}

app.get('/masuk', (req, res) => guestPage(res, 'Log Masuk', loginForm()));

app.post('/masuk', (req, res) => {
  const sid = text(req.body.student_id, 40);
  if (tooManyAttempts(req.ip)) return guestPage(res, 'Log Masuk', loginForm({ error: 'Terlalu banyak cubaan. Cuba lagi dalam 15 minit.', sid }), 429);
  const s = db.getStudentByStudentId(sid);
  if (!s || !auth.verifyPassword(req.body.password, s.password_hash)) {
    recordFailure(req.ip);
    return guestPage(res, 'Log Masuk', loginForm({ error: 'No. matrik atau kata laluan salah.', sid }), 401);
  }
  auth.setSession(res, 'student', s.id);
  res.redirect('/pelajar');
});

app.get('/guru/login', (req, res) => {
  guestPage(res, 'Log Masuk Mentor', `<h1>Log Masuk Mentor</h1>
    ${req.query.ralat ? v.alert(req.query.ralat === 'had' ? 'Terlalu banyak cubaan. Cuba lagi dalam 15 minit.' : 'Kata laluan salah.') : ''}
    <form method="post" action="/guru/login" class="card narrow">
      <label>Kata Laluan Mentor <input type="password" name="password" required autofocus></label>
      <button>Log Masuk</button>
    </form>`);
});

app.post('/guru/login', (req, res) => {
  if (tooManyAttempts(req.ip)) return res.redirect('/guru/login?ralat=had');
  if (!auth.mentorPasswordMatches(req.body.password)) {
    recordFailure(req.ip);
    return res.redirect('/guru/login?ralat=1');
  }
  auth.setSession(res, 'mentor', 0);
  res.redirect('/guru');
});

app.post('/keluar', (req, res) => {
  auth.clearSession(res);
  res.redirect('/');
});

// ---------- Kawasan dilindungi ----------
app.use('/pelajar', auth.requireRole('student', '/masuk'), require('./routes/student'));
app.use('/guru', auth.requireRole('mentor', '/guru/login'), require('./routes/mentor'));

app.use((req, res) => guestPage(res, 'Tidak Dijumpai', '<h1>404</h1><p>Halaman tidak dijumpai.</p>', 404));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(v.page('Ralat', '<h1>Ralat</h1><p>Berlaku ralat pada pelayan. Sila cuba lagi.</p>'));
});

app.listen(PORT, () => console.log(`Education Hub berjalan di http://localhost:${PORT}`));
