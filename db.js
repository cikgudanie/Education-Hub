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

module.exports = {
  createStudent, getStudentByStudentId, getStudent, setStudentPassword, listStudents, listStudentClasses,
  createTrade, updateTrade, listTrades, listAllTrades, getTrade, getTradeScreenshot, deleteTrade,
  setMentorComment, distinctTradeValues,
  createReport, listReports, listReportClasses, getReport, getReportFile, updateReview, deleteReport,
  listReportsByStudentId,
};
