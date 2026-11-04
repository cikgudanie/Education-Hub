// Lapisan database: SQLite terbina dalam Node.js (node:sqlite), tiada server berasingan.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'reports.db'));

db.exec(`
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

// Senarai tanpa kandungan fail (supaya ringan).
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

function listClasses() {
  return db
    .prepare('SELECT DISTINCT class_name FROM reports ORDER BY class_name')
    .all()
    .map((r) => r.class_name);
}

function getReport(id) {
  return db
    .prepare(
      `SELECT id, student_name, student_id, class_name, title, description,
              file_name, file_type, file_size, status, marks, teacher_note, submitted_at
         FROM reports WHERE id = ?`
    )
    .get(id);
}

function getReportFile(id) {
  return db
    .prepare('SELECT file_name, file_type, file_data FROM reports WHERE id = ?')
    .get(id);
}

function updateReview(id, { status, marks, teacherNote }) {
  db.prepare('UPDATE reports SET status = ?, marks = ?, teacher_note = ? WHERE id = ?')
    .run(status, marks || null, teacherNote || null, id);
}

function deleteReport(id) {
  db.prepare('DELETE FROM reports WHERE id = ?').run(id);
}

// Untuk pelajar semak status laporan sendiri.
function listByStudentId(studentId) {
  return db
    .prepare(
      `SELECT id, title, file_name, status, marks, teacher_note, submitted_at
         FROM reports WHERE student_id = ? ORDER BY submitted_at DESC, id DESC`
    )
    .all(studentId);
}

module.exports = {
  createReport, listReports, listClasses, getReport, getReportFile,
  updateReview, deleteReport, listByStudentId,
};
