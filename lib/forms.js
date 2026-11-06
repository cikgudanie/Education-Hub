// Muat naik fail dan pengesahan borang.
const path = require('node:path');
const multer = require('multer');
const { EMOTIONS, TIMEFRAMES } = require('./views');

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 10;
const MAX_SHOT_MB = 5;

const REPORT_EXT = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.csv', '.txt', '.jpg', '.jpeg', '.png', '.zip'];
// Jenis imej ditentukan oleh sambungan fail, bukan oleh pelayar, supaya hanya imej sebenar dihidangkan.
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

function makeUpload(field, allowedExt, maxMb, maxCount = 1) {
  const mw = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: maxCount, fields: 60 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExt.includes(ext)) cb(null, true);
      else cb(new Error(`Jenis fail tidak dibenarkan. Dibenarkan: ${allowedExt.join(', ')}`));
    },
  });
  const handler = maxCount > 1 ? mw.array(field, maxCount) : mw.single(field);
  // Pulangkan mesej ralat (atau null) tanpa melempar.
  return (req, res) => new Promise((resolve) => {
    handler(req, res, (err) => {
      if (!err) return resolve(null);
      if (err.code === 'LIMIT_FILE_SIZE') return resolve(`Fail terlalu besar. Had maksimum ${maxMb} MB setiap fail.`);
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return resolve(`Maksimum ${maxCount} fail sekali muat naik.`);
      resolve(err.message);
    });
  });
}

const uploadReport = makeUpload('report_file', REPORT_EXT, MAX_FILE_MB);
const uploadScreenshot = makeUpload('screenshot', Object.keys(IMAGE_TYPES), MAX_SHOT_MB);
const MAX_DAILY_IMAGES = 6;
const uploadScreenshots = makeUpload('screenshots', Object.keys(IMAGE_TYPES), MAX_SHOT_MB, MAX_DAILY_IMAGES);

function screenshotFromFile(file) {
  if (!file || !file.size) return null;
  return { data: file.buffer, type: IMAGE_TYPES[path.extname(file.originalname).toLowerCase()] };
}

const text = (v, max) => String(v ?? '').trim().slice(0, max);

function num(v) {
  const s = String(v ?? '').trim().replace(/,/g, '').replace(/^−/, '-');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Pulangkan { trade, error }.
function parseTrade(body) {
  const t = {
    trade_date: text(body.trade_date, 10),
    symbol: text(body.symbol, 20).toUpperCase().replace(/\s+/g, ''),
    direction: body.direction === 'SELL' ? 'SELL' : 'BUY',
    entry_price: num(body.entry_price),
    exit_price: num(body.exit_price),
    stop_loss: num(body.stop_loss),
    take_profit: num(body.take_profit),
    lot_size: num(body.lot_size),
    pnl: num(body.pnl),
    strategy: text(body.strategy, 60) || null,
    timeframe: TIMEFRAMES.includes(body.timeframe) ? body.timeframe : null,
    setup_notes: text(body.setup_notes, 3000) || null,
    emotion: EMOTIONS.includes(body.emotion) ? body.emotion : null,
    lesson: text(body.lesson, 3000) || null,
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.trade_date) || Number.isNaN(Date.parse(t.trade_date))) {
    return { trade: t, error: 'Sila masukkan tarikh yang sah.' };
  }
  if (!t.symbol) return { trade: t, error: 'Sila masukkan pair / simbol.' };
  if (t.entry_price == null || !(t.entry_price > 0)) return { trade: t, error: 'Harga entry mesti nombor lebih besar daripada 0.' };
  const bad = ['exit_price', 'stop_loss', 'take_profit', 'lot_size', 'pnl'].find((k) => Number.isNaN(t[k]));
  if (bad) return { trade: t, error: 'Sila pastikan semua harga, lot dan P/L ialah nombor yang sah.' };
  if (t.lot_size != null && t.lot_size <= 0) return { trade: t, error: 'Lot mesti lebih besar daripada 0.' };
  return { trade: t, error: null };
}

// ---------- Pelan bulanan ----------
// Peratus dimasukkan sebagai nombor biasa (5 = 5%) dan disimpan sebagai pecahan.
function parsePlan(body) {
  const p = {
    capital: num(body.capital),
    usd_per_pip: num(body.usd_per_pip),
    lot_size: num(body.lot_size),
    base_pct: num(body.base_pct),
    risk_pct: num(body.risk_pct),
    risk_tolerance_pct: num(body.risk_tolerance_pct),
  };
  const bad = Object.keys(p).find((k) => Number.isNaN(p[k]));
  if (bad) return { plan: body, error: 'Sila pastikan semua medan ialah nombor yang sah.' };
  if (!(p.capital > 0)) return { plan: body, error: 'Modal mesti lebih besar daripada 0.' };
  if (!(p.usd_per_pip > 0)) return { plan: body, error: 'USD per pip mesti lebih besar daripada 0.' };
  if (!(p.lot_size > 0)) return { plan: body, error: 'Lot size mesti lebih besar daripada 0.' };
  if (!(p.base_pct > 0 && p.base_pct <= 100)) return { plan: body, error: 'Base percentage mesti antara 0 dan 100.' };
  for (const k of ['risk_pct', 'risk_tolerance_pct']) {
    if (p[k] != null && !(p[k] >= 0 && p[k] <= 100)) return { plan: body, error: 'Peratus risiko mesti antara 0 dan 100.' };
  }
  for (const k of ['base_pct', 'risk_pct', 'risk_tolerance_pct']) if (p[k] != null) p[k] = p[k] / 100;
  return { plan: p, error: null };
}

// ---------- Rekod harian ----------
function parseDaily(body) {
  const int = (v) => { const n = num(v); return n == null ? 0 : n; };
  const d = {
    record_date: text(body.record_date, 10),
    setup: text(body.setup, 60) || null,
    lot_size: num(body.lot_size),
    total_trades: int(body.total_trades),
    wins: int(body.wins),
    losses: int(body.losses),
    profit: num(body.profit),
    loss: num(body.loss),
    notes: text(body.notes, 3000) || null,
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.record_date) || Number.isNaN(Date.parse(d.record_date))) {
    return { daily: d, error: 'Sila masukkan tarikh yang sah.' };
  }
  if ([d.lot_size, d.total_trades, d.wins, d.losses, d.profit, d.loss].some((x) => Number.isNaN(x))) {
    return { daily: d, error: 'Sila pastikan lot, bilangan trade, win, loss, profit dan loss ialah nombor.' };
  }
  for (const k of ['total_trades', 'wins', 'losses']) {
    if (!Number.isInteger(d[k]) || d[k] < 0) return { daily: d, error: 'Bilangan trade, win dan loss mesti nombor bulat 0 atau lebih.' };
  }
  if (d.wins + d.losses > d.total_trades) return { daily: d, error: 'Win + Loss tidak boleh melebihi jumlah trade.' };
  if (d.lot_size != null && d.lot_size <= 0) return { daily: d, error: 'Lot size mesti lebih besar daripada 0.' };
  d.profit = Math.abs(d.profit || 0);
  d.loss = Math.abs(d.loss || 0); // pelajar boleh tulis -12 atau 12
  return { daily: d, error: null };
}

function imagesFromFiles(files) {
  return (files || []).filter((f) => f.size).map((f) => ({ data: f.buffer, type: IMAGE_TYPES[path.extname(f.originalname).toLowerCase()] }));
}

module.exports = {
  uploadReport, uploadScreenshot, uploadScreenshots, screenshotFromFile, imagesFromFiles, parseTrade, parsePlan, parseDaily,
  text, num, MAX_FILE_MB, REPORT_EXT, MAX_DAILY_IMAGES,
};
