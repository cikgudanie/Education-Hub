// Backup database dengan selamat (salinan konsisten walaupun sistem sedang berjalan).
// Guna: node scripts/backup.js <fail-database> <folder-backup> [bilangan-simpan]
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const [dbFile, outDir, keepArg] = process.argv.slice(2);
if (!dbFile || !outDir) {
  console.error('Guna: node scripts/backup.js <fail-database> <folder-backup> [bilangan-simpan]');
  process.exit(1);
}
const keep = Number(keepArg) || 30;
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const target = path.join(outDir, `reports-${stamp}.db`);
const db = new DatabaseSync(dbFile, { readOnly: true });
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();
console.log(`Backup disimpan: ${target}`);

// Simpan hanya N backup terbaru.
fs.readdirSync(outDir)
  .filter((f) => /^reports-.*\.db$/.test(f))
  .sort()
  .reverse()
  .slice(keep)
  .forEach((f) => fs.rmSync(path.join(outDir, f)));
