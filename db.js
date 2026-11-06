// Lapisan database: SQLite terbina dalam Node.js (node:sqlite), tiada server berasingan.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'reports.db'));
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id    TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT    NOT NULL,
    class_name    TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS trades (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    student_ref     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    trade_date      TEXT    NOT NULL,
    symbol          TEXT    NOT NULL,
    direction       TEXT    NOT NULL CHECK (direction IN ('BUY', 'SELL')),
    entry_price     REAL    NOT NULL,
    exit_price      REAL,
    stop_loss       REAL,
    take_profit     REAL,
    lot_size        REAL,
    pnl             REAL,
    strategy        TEXT,
    timeframe       TEXT,
    setup_notes     TEXT,
    emotion         TEXT,
    lesson          TEXT,
    screenshot      BLOB,
    screenshot_type TEXT,
    mentor_comment  TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_trades_student ON trades(student_ref, trade_date);

  CREATE TABLE IF NOT EXISTS reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    student_name  TEXT    NOT NULL,
    student_id    TEXT    NOT NULL,
    class_name    TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    description   TEXT,
    file_name     TEXT    NOT NULL,
    file_type     TEXT    NOT NULL,
    file_size     INTEGER NOT NULL,
    file_data     BLOB    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'Diterima',
    marks         TEXT,
    teacher_note  TEXT,
    submitted_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_reports_class ON reports(class_name);

  -- Pelan strategi bulanan (ikut "Strategic Trading Implementation").
  CREATE TABLE IF NOT EXISTS plans (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    student_ref        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    month              TEXT    NOT NULL,              -- 'YYYY-MM'
    capital            REAL    NOT NULL,
    usd_per_pip        REAL    NOT NULL,
    lot_size           REAL    NOT NULL,
    base_pct           REAL    NOT NULL,              -- pecahan, cth 0.05 = 5%
    risk_pct           REAL,                          -- risiko setiap trade
    risk_tolerance_pct REAL,                          -- had kerugian bulanan
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (student_ref, month)
  );

  -- Rekod harian (ikut "RMI Template").
  CREATE TABLE IF NOT EXISTS daily_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    student_ref    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    record_date    TEXT    NOT NULL,                  -- 'YYYY-MM-DD'
    setup          TEXT,
    lot_size       REAL,
    total_trades   INTEGER NOT NULL DEFAULT 0,
    wins           INTEGER NOT NULL DEFAULT 0,
    losses         INTEGER NOT NULL DEFAULT 0,
    profit         REAL    NOT NULL DEFAULT 0,        -- jumlah untung (positif)
    loss           REAL    NOT NULL DEFAULT 0,        -- jumlah rugi (disimpan positif)
    notes          TEXT,
    mentor_comment TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (student_ref, record_date)
  );

  CREATE TABLE IF NOT EXISTS record_images (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id  INTEGER NOT NULL REFERENCES daily_records(id) ON DELETE CASCADE,
    data       BLOB    NOT NULL,
    type       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_record_images ON record_images(record_id);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ---------- Pelajar ----------
function createStudent({ studentId, name, className, passwordHash }) {
  const r = db
    .prepare('INSERT INTO students (student_id, name, class_name, password_hash) VALUES (?, ?, ?, ?)')
    .run(studentId, name, className, passwordHash);
  return Number(r.lastInsertRowid);
}

const getStudentByStudentId = (sid) => db.prepare('SELECT * FROM students WHERE student_id = ?').get(sid);
const getStudent = (id) => db.prepare('SELECT id, student_id, name, class_name, created_at FROM students WHERE id = ?').get(id);

function setStudentPassword(id, passwordHash) {
  db.prepare('UPDATE students SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function listStudents({ className = '' } = {}) {
  return db
    .prepare(
      `SELECT s.id, s.student_id, s.name, s.class_name,
              COUNT(t.id)                                   AS trade_count,
              SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END)    AS wins,
              SUM(CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END)    AS losses,
              COALESCE(SUM(t.pnl), 0)                       AS total_pnl,
              MAX(t.trade_date)                             AS last_trade,
              (SELECT COUNT(*) FROM reports r WHERE r.student_id = s.student_id) AS report_count
         FROM students s LEFT JOIN trades t ON t.student_ref = s.id
        WHERE (? = '' OR s.class_name = ?)
        GROUP BY s.id
        ORDER BY s.class_name, s.name`
    )
    .all(className, className);
}

const listStudentClasses = () =>
  db.prepare('SELECT DISTINCT class_name FROM students ORDER BY class_name').all().map((r) => r.class_name);

// ---------- Trade ----------
const TRADE_FIELDS = [
  'trade_date', 'symbol', 'direction', 'entry_price', 'exit_price', 'stop_loss', 'take_profit',
  'lot_size', 'pnl', 'strategy', 'timeframe', 'setup_notes', 'emotion', 'lesson',
];

function createTrade(studentRef, t, shot) {
  const r = db
    .prepare(
      `INSERT INTO trades (student_ref, ${TRADE_FIELDS.join(', ')}, screenshot, screenshot_type)
       VALUES (?, ${TRADE_FIELDS.map(() => '?').join(', ')}, ?, ?)`
    )
    .run(studentRef, ...TRADE_FIELDS.map((f) => t[f]), shot ? shot.data : null, shot ? shot.type : null);
  return Number(r.lastInsertRowid);
}

function updateTrade(id, studentRef, t, shot, removeShot) {
  db.prepare(
    `UPDATE trades SET ${TRADE_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ? AND student_ref = ?`
  ).run(...TRADE_FIELDS.map((f) => t[f]), id, studentRef);
  if (shot) {
    db.prepare('UPDATE trades SET screenshot = ?, screenshot_type = ? WHERE id = ? AND student_ref = ?')
      .run(shot.data, shot.type, id, studentRef);
  } else if (removeShot) {
    db.prepare('UPDATE trades SET screenshot = NULL, screenshot_type = NULL WHERE id = ? AND student_ref = ?')
      .run(id, studentRef);
  }
}

const TRADE_COLS = `t.id, t.student_ref, ${TRADE_FIELDS.map((f) => 't.' + f).join(', ')},
  t.mentor_comment, t.created_at, (t.screenshot IS NOT NULL) AS has_screenshot`;

function listTrades(studentRef, { symbol = '', strategy = '', from = '', to = '' } = {}) {
  return db
    .prepare(
      `SELECT ${TRADE_COLS} FROM trades t
        WHERE t.student_ref = ?
          AND (? = '' OR t.symbol = ?)
          AND (? = '' OR t.strategy = ?)
          AND (? = '' OR t.trade_date >= ?)
          AND (? = '' OR t.trade_date <= ?)
        ORDER BY t.trade_date DESC, t.id DESC`
    )
    .all(studentRef, symbol, symbol, strategy, strategy, from, from, to, to);
}

function listAllTrades() {
  return db
    .prepare(
      `SELECT ${TRADE_COLS}, s.student_id, s.name AS student_name, s.class_name
         FROM trades t JOIN students s ON s.id = t.student_ref
        ORDER BY s.class_name, s.name, t.trade_date, t.id`
    )
    .all();
}

const getTrade = (id) =>
  db.prepare(
    `SELECT ${TRADE_COLS}, s.student_id, s.name AS student_name, s.class_name
       FROM trades t JOIN students s ON s.id = t.student_ref WHERE t.id = ?`
  ).get(id);

const getTradeScreenshot = (id) =>
  db.prepare('SELECT student_ref, screenshot, screenshot_type FROM trades WHERE id = ? AND screenshot IS NOT NULL').get(id);

function deleteTrade(id, studentRef) {
  db.prepare('DELETE FROM trades WHERE id = ? AND student_ref = ?').run(id, studentRef);
}

function setMentorComment(id, comment) {
  db.prepare('UPDATE trades SET mentor_comment = ? WHERE id = ?').run(comment || null, id);
}

function distinctTradeValues(studentRef, column) {
  if (!['symbol', 'strategy'].includes(column)) throw new Error('lajur tidak sah');
  return db
    .prepare(`SELECT DISTINCT ${column} AS v FROM trades WHERE student_ref = ? AND ${column} IS NOT NULL AND ${column} <> '' ORDER BY v`)
    .all(studentRef)
    .map((r) => r.v);
}

// ---------- Laporan ----------
function createReport(r) {
  const result = db
    .prepare(
      `INSERT INTO reports
         (student_name, student_id, class_name, title, description,
          file_name, file_type, file_size, file_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      r.studentName, r.studentId, r.className, r.title, r.description || null,
      r.fileName, r.fileType, r.fileSize, r.fileData
    );
  return Number(result.lastInsertRowid);
}

function listReports({ search = '', className = '' } = {}) {
  const like = `%${search}%`;
  return db
    .prepare(
      `SELECT id, student_name, student_id, class_name, title, file_name,
              file_size, status, marks, submitted_at
         FROM reports
        WHERE (? = '' OR class_name = ?)
          AND (student_name LIKE ? OR student_id LIKE ? OR title LIKE ?)
        ORDER BY submitted_at DESC, id DESC`
    )
    .all(className, className, like, like, like);
}

const listReportClasses = () =>
  db.prepare('SELECT DISTINCT class_name FROM reports ORDER BY class_name').all().map((r) => r.class_name);

const getReport = (id) =>
  db.prepare(
    `SELECT id, student_name, student_id, class_name, title, description,
            file_name, file_type, file_size, status, marks, teacher_note, submitted_at
       FROM reports WHERE id = ?`
  ).get(id);

const getReportFile = (id) =>
  db.prepare('SELECT student_id, file_name, file_type, file_data FROM reports WHERE id = ?').get(id);

function updateReview(id, { status, marks, teacherNote }) {
  db.prepare('UPDATE reports SET status = ?, marks = ?, teacher_note = ? WHERE id = ?')
    .run(status, marks || null, teacherNote || null, id);
}

function deleteReport(id) {
  db.prepare('DELETE FROM reports WHERE id = ?').run(id);
}

const listReportsByStudentId = (sid) =>
  db.prepare(
    `SELECT id, title, file_name, status, marks, teacher_note, submitted_at
       FROM reports WHERE student_id = ? COLLATE NOCASE ORDER BY submitted_at DESC, id DESC`
  ).all(sid);

// ---------- Pelan bulanan ----------
const PLAN_FIELDS = ['capital', 'usd_per_pip', 'lot_size', 'base_pct', 'risk_pct', 'risk_tolerance_pct'];

const getPlan = (studentRef, month) =>
  db.prepare('SELECT * FROM plans WHERE student_ref = ? AND month = ?').get(studentRef, month);

// Pelan terkini sebelum bulan ini (untuk isian lalai bulan baru).
const getPreviousPlan = (studentRef, month) =>
  db.prepare('SELECT * FROM plans WHERE student_ref = ? AND month < ? ORDER BY month DESC LIMIT 1').get(studentRef, month);

function savePlan(studentRef, month, p) {
  db.prepare(
    `INSERT INTO plans (student_ref, month, ${PLAN_FIELDS.join(', ')})
     VALUES (?, ?, ${PLAN_FIELDS.map(() => '?').join(', ')})
     ON CONFLICT (student_ref, month) DO UPDATE SET
       ${PLAN_FIELDS.map((f) => `${f} = excluded.${f}`).join(', ')}, updated_at = datetime('now', 'localtime')`
  ).run(studentRef, month, ...PLAN_FIELDS.map((f) => p[f]));
}

// ---------- Rekod harian ----------
const DAILY_FIELDS = ['record_date', 'setup', 'lot_size', 'total_trades', 'wins', 'losses', 'profit', 'loss', 'notes'];
const DAILY_COLS = `r.id, r.student_ref, ${DAILY_FIELDS.map((f) => 'r.' + f).join(', ')}, r.mentor_comment, r.created_at, r.updated_at,
  (SELECT COUNT(*) FROM record_images i WHERE i.record_id = r.id) AS image_count`;

function createDaily(studentRef, d) {
  const r = db
    .prepare(`INSERT INTO daily_records (student_ref, ${DAILY_FIELDS.join(', ')}) VALUES (?, ${DAILY_FIELDS.map(() => '?').join(', ')})`)
    .run(studentRef, ...DAILY_FIELDS.map((f) => d[f]));
  return Number(r.lastInsertRowid);
}

function updateDaily(id, studentRef, d) {
  db.prepare(
    `UPDATE daily_records SET ${DAILY_FIELDS.map((f) => `${f} = ?`).join(', ')}, updated_at = datetime('now', 'localtime')
      WHERE id = ? AND student_ref = ?`
  ).run(...DAILY_FIELDS.map((f) => d[f]), id, studentRef);
}

const getDaily = (id) =>
  db.prepare(
    `SELECT ${DAILY_COLS}, s.student_id, s.name AS student_name, s.class_name
       FROM daily_records r JOIN students s ON s.id = r.student_ref WHERE r.id = ?`
  ).get(id);

const getDailyByDate = (studentRef, date) =>
  db.prepare('SELECT id FROM daily_records WHERE student_ref = ? AND record_date = ?').get(studentRef, date);

const listDailyForMonth = (studentRef, month) =>
  db.prepare(`SELECT ${DAILY_COLS} FROM daily_records r WHERE r.student_ref = ? AND r.record_date LIKE ? ORDER BY r.record_date`)
    .all(studentRef, `${month}-%`);

const listDailyAll = (studentRef) =>
  db.prepare(`SELECT ${DAILY_COLS} FROM daily_records r WHERE r.student_ref = ? ORDER BY r.record_date`).all(studentRef);

const listRecordMonths = (studentRef) =>
  db.prepare(
    `SELECT month FROM plans WHERE student_ref = ?
     UNION SELECT substr(record_date, 1, 7) FROM daily_records WHERE student_ref = ?
     ORDER BY 1 DESC`
  ).all(studentRef, studentRef).map((r) => r.month);

function deleteDaily(id, studentRef) {
  db.prepare('DELETE FROM daily_records WHERE id = ? AND student_ref = ?').run(id, studentRef);
}

function setDailyComment(id, comment) {
  db.prepare('UPDATE daily_records SET mentor_comment = ? WHERE id = ?').run(comment || null, id);
}

// ---------- Gambar rekod harian ----------
function addRecordImage(recordId, img) {
  db.prepare('INSERT INTO record_images (record_id, data, type) VALUES (?, ?, ?)').run(recordId, img.data, img.type);
}

const listRecordImages = (recordId) =>
  db.prepare('SELECT id FROM record_images WHERE record_id = ? ORDER BY id').all(recordId).map((r) => r.id);

const getRecordImage = (imageId) =>
  db.prepare(
    `SELECT i.data, i.type, i.record_id, r.student_ref
       FROM record_images i JOIN daily_records r ON r.id = i.record_id WHERE i.id = ?`
  ).get(imageId);

function deleteRecordImage(imageId, studentRef) {
  db.prepare(
    `DELETE FROM record_images WHERE id = ?
       AND record_id IN (SELECT id FROM daily_records WHERE student_ref = ?)`
  ).run(imageId, studentRef);
}

// ---------- Ringkasan bulanan semua pelajar (mentor) ----------
function monthOverview(month, className = '') {
  return db
    .prepare(
      `SELECT s.id, s.student_id, s.name, s.class_name,
              p.capital, p.base_pct, p.risk_tolerance_pct,
              COUNT(r.id)                     AS days,
              COALESCE(SUM(r.profit - r.loss), 0) AS pnl,
              COALESCE(SUM(r.total_trades), 0) AS trades,
              COALESCE(SUM(r.wins), 0)        AS wins,
              COALESCE(SUM(r.losses), 0)      AS losses,
              COALESCE(SUM(r.profit), 0)      AS profit,
              COALESCE(SUM(r.loss), 0)        AS loss,
              (SELECT MAX(record_date) FROM daily_records d WHERE d.student_ref = s.id) AS last_record,
              (SELECT COUNT(*) FROM reports x WHERE x.student_id = s.student_id) AS report_count
         FROM students s
         LEFT JOIN plans p ON p.student_ref = s.id AND p.month = ?
         LEFT JOIN daily_records r ON r.student_ref = s.id AND r.record_date LIKE ?
        WHERE (? = '' OR s.class_name = ?)
        GROUP BY s.id
        ORDER BY s.class_name, s.name`
    )
    .all(month, `${month}-%`, className, className);
}

// Rekod ringkas semua pelajar bagi satu bulan (untuk lajur W1-W5 mentor).
const listDailyForMonthAll = (month) =>
  db.prepare('SELECT student_ref, record_date, profit, loss FROM daily_records WHERE record_date LIKE ?').all(`${month}-%`);

// ---------- Tetapan program ----------
const getSetting = (key, fallback = '') => {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return r && r.value != null ? r.value : fallback;
};

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

module.exports = {
  getPlan, getPreviousPlan, savePlan,
  createDaily, updateDaily, getDaily, getDailyByDate, listDailyForMonth, listDailyAll, listRecordMonths,
  deleteDaily, setDailyComment,
  addRecordImage, listRecordImages, getRecordImage, deleteRecordImage,
  monthOverview, listDailyForMonthAll, getSetting, setSetting,
  createStudent, getStudentByStudentId, getStudent, setStudentPassword, listStudents, listStudentClasses,
  createTrade, updateTrade, listTrades, listAllTrades, getTrade, getTradeScreenshot, deleteTrade,
  setMentorComment, distinctTradeValues,
  createReport, listReports, listReportClasses, getReport, getReportFile, updateReview, deleteReport,
  listReportsByStudentId,
};
