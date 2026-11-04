// Muat naik fail dan pengesahan borang.
const path = require('node:path');
const multer = require('multer');
const { EMOTIONS, TIMEFRAMES } = require('./views');

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 10;
const MAX_SHOT_MB = 5;

const REPORT_EXT = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.csv', '.txt', '.jpg', '.jpeg', '.png', '.zip'];
// Jenis imej ditentukan oleh sambungan fail, bukan oleh pelayar, supaya hanya imej sebenar dihidangkan.
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

function makeUpload(field, allowedExt, maxMb) {
  const mw = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 40 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedExt.includes(ext)) cb(null, true);
      else cb(new Error(`Jenis fail tidak dibenarkan. Dibenarkan: ${allowedExt.join(', ')}`));
    },
  }).single(field);
  // Pulangkan mesej ralat (atau null) tanpa melempar.
  return (req, res) => new Promise((resolve) => {
    mw(req, res, (err) => {
      if (!err) return resolve(null);
      resolve(err.code === 'LIMIT_FILE_SIZE' ? `Fail terlalu besar. Had maksimum ${maxMb} MB.` : err.message);
    });
  });
}

const uploadReport = makeUpload('report_file', REPORT_EXT, MAX_FILE_MB);
const uploadScreenshot = makeUpload('screenshot', Object.keys(IMAGE_TYPES), MAX_SHOT_MB);

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

module.exports = { uploadReport, uploadScreenshot, screenshotFromFile, parseTrade, text, MAX_FILE_MB, REPORT_EXT };
