// Eksport CSV yang selamat dibuka dalam Excel.
const { rMultiple, result } = require('./stats');

function cell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // elak suntikan formula
  return `"${s.replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, header, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.attachment(filename);
  res.send('﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n'));
}

const TRADE_HEADER = ['ID', 'Tarikh', 'Pair', 'Arah', 'Timeframe', 'Entry', 'Stop Loss', 'Take Profit', 'Exit',
  'Lot', 'P/L', 'R', 'Keputusan', 'Strategi', 'Emosi', 'Analisis', 'Pengajaran', 'Komen Mentor'];

const tradeRow = (t) => {
  const r = rMultiple(t);
  return [t.id, t.trade_date, t.symbol, t.direction, t.timeframe, t.entry_price, t.stop_loss, t.take_profit, t.exit_price,
    t.lot_size, t.pnl, r == null ? '' : r.toFixed(2), result(t), t.strategy, t.emotion, t.setup_notes, t.lesson, t.mentor_comment];
};

module.exports = { sendCsv, TRADE_HEADER, tradeRow };
