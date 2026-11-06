// Sesi (cookie bertandatangan HMAC) dan hash kata laluan (scrypt).
const crypto = require('node:crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_HOURS = 8;
const COOKIE = 'sesi';
// Tetapkan COOKIE_SECURE=1 apabila laman dihidangkan melalui HTTPS.
const SECURE = process.env.COOKIE_SECURE ? '; Secure' : '';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('AMARAN: ADMIN_PASSWORD tidak ditetapkan. Kata laluan mentor lalai "admin123" digunakan. Sila tukar!');
}

const sign = (v) => crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('hex');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// role: 'student' | 'mentor'
function setSession(res, role, id) {
  const payload = `${role}.${id}.${Date.now() + SESSION_HOURS * 3600 * 1000}`;
  const token = `${payload}.${sign(payload)}`;
  res.setHeader('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${SECURE}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${SECURE}`);
}

function readSession(req) {
  const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const token = decodeURIComponent(raw.slice(COOKIE.length + 1));
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [role, id, exp, sig] = parts;
  if (!safeEqual(sig, sign(`${role}.${id}.${exp}`)) || Number(exp) < Date.now()) return null;
  return { role, id: Number(id) };
}

// Middleware: letak req.session pada setiap permintaan.
function sessionMiddleware(req, res, next) {
  req.session = readSession(req);
  next();
}

const requireRole = (role, loginUrl) => (req, res, next) =>
  req.session && req.session.role === role ? next() : res.redirect(loginUrl);

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(String(pw), salt, 64).toString('hex')}`;
}

function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  return safeEqual(crypto.scryptSync(String(pw), salt, 64).toString('hex'), hash);
}

function mentorPasswordMatches(input) {
  const a = crypto.createHash('sha256').update(String(input || '')).digest('hex');
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest('hex');
  return safeEqual(a, b);
}

module.exports = {
  setSession, clearSession, sessionMiddleware, requireRole,
  hashPassword, verifyPassword, mentorPasswordMatches,
};
