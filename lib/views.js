// Templat HTML dikongsi oleh semua halaman.
const { rMultiple, plannedRR, result } = require('./stats');

const CURRENCY = process.env.CURRENCY || 'USD';
const EMOTIONS = ['Tenang', 'Yakin', 'Ragu-ragu', 'Takut', 'Tamak', 'FOMO', 'Marah / Revenge', 'Bosan'];
const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtSize = (b) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const fmtNum = (v, d = 2) => (v == null ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtPrice = (v) => (v == null ? '–' : String(+Number(v).toFixed(6)));
const fmtPct = (v) => (v == null ? '–' : `${v.toFixed(1)}%`);
const fmtR = (v) => (v == null ? '–' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`);

// P/L ada tanda +/− supaya maksud tidak bergantung pada warna sahaja.
function pnl(v) {
  if (v == null) return '<span class="muted">–</span>';
  const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `<span class="${cls}">${sign}${fmtNum(Math.abs(v))}</span>`;
}

const badge = (s) => `<span class="badge badge-${esc(s).toLowerCase().replace(/[^a-z]+/g, '-')}">${esc(s)}</span>`;

function nav(role) {
  if (role === 'student') {
    return `<a href="/pelajar">Dashboard</a><a href="/pelajar/journal">Journal</a>
      <a href="/pelajar/trade/baru">+ Trade</a><a href="/pelajar/laporan">Laporan</a>
      <form method="post" action="/keluar" class="inline"><button class="link">Log Keluar</button></form>`;
  }
  if (role === 'mentor') {
    return `<a href="/guru">Pelajar</a><a href="/guru/laporan">Laporan</a>
      <form method="post" action="/keluar" class="inline"><button class="link">Log Keluar</button></form>`;
  }
  return '<a href="/masuk">Log Masuk</a><a href="/daftar">Daftar</a><a href="/guru/login">Mentor</a>';
}

function page(title, body, { role = null } = {}) {
  return `<!doctype html>
<html lang="ms"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Education Hub</title><link rel="stylesheet" href="/static/style.css"></head>
<body><header><div class="wrap"><a class="brand" href="/">Education Hub <span>Trading</span></a><nav>${nav(role)}</nav></div></header>
<main class="wrap">${body}</main><script src="/static/chart.js" defer></script></body></html>`;
}

const alert = (msg, kind = 'error') => (msg ? `<div class="alert ${kind}">${esc(msg)}</div>` : '');

// ---------- Statistik ----------
function statTiles(s) {
  const tile = (label, value, sub = '') =>
    `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}</div>`;
  return `<div class="tiles">
    ${tile(`Jumlah P/L (${CURRENCY})`, pnl(s.totalPnl), `${s.closed} trade ditutup · ${s.open} terbuka`)}
    ${tile('Win Rate', fmtPct(s.winRate), `${s.wins} untung · ${s.losses} rugi · ${s.breakeven} seri`)}
    ${tile('Profit Factor', s.profitFactor == null ? '–' : fmtNum(s.profitFactor), 'Jumlah untung ÷ jumlah rugi')}
    ${tile('Purata R', fmtR(s.avgR), 'Untung/rugi dalam unit risiko')}
    ${tile('Purata Untung', pnl(s.avgWin), `Terbaik ${pnl(s.best)}`)}
    ${tile('Purata Rugi', pnl(s.avgLoss), `Terburuk ${pnl(s.worst)}`)}
    ${tile('Max Drawdown', pnl(s.maxDrawdown ? -s.maxDrawdown : 0), 'Penurunan terbesar dari puncak')}
    ${tile('Rentetan', `${s.maxWinStreak} / ${s.maxLossStreak}`, 'Untung / rugi berturut-turut')}
  </div>`;
}

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 0.001; v += step) ticks.push(+v.toFixed(10));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

// Lengkung ekuiti: satu siri, jadi tajuk sudah menamakannya (tiada kotak legend).
function equityChart(curve) {
  if (curve.length < 2) {
    return '<div class="card chart-empty muted">Graf ekuiti akan dipaparkan selepas sekurang-kurangnya 2 trade ditutup.</div>';
  }
  const W = 800, H = 260, L = 64, R = 16, T = 16, B = 32;
  const values = [0, ...curve.map((p) => p.equity)];
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const x = (i) => L + (i / curve.length) * (W - L - R);         // i=0 ialah titik mula (0)
  const y = (v) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const pts = [[x(0), y(0)], ...curve.map((p, i) => [x(i + 1), y(p.equity)])];
  const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
  const grid = ticks.map((t) => `<line class="grid${t === 0 ? ' zero' : ''}" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${fmtNum(t, Math.abs(yMax - yMin) < 10 ? 1 : 0)}</text>`).join('');
  const markers = curve.length <= 40
    ? curve.map((p, i) => `<circle class="marker" cx="${x(i + 1)}" cy="${y(p.equity)}" r="4"/>`).join('') : '';
  const data = JSON.stringify(curve.map((p, i) => ({ x: x(i + 1), y: y(p.equity), n: i + 1, ...p }))).replace(/</g, '\\u003c');
  return `<figure class="card chart" data-chart="equity">
    <figcaption><strong>Lengkung Ekuiti</strong> <span class="muted">· P/L terkumpul (${CURRENCY}) mengikut trade</span></figcaption>
    <div class="chart-box">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Graf P/L terkumpul bagi ${curve.length} trade, berakhir pada ${fmtNum(curve[curve.length - 1].equity)}">
        ${grid}
        <text class="axis" x="${L}" y="${H - 8}">Trade 1</text>
        <text class="axis" x="${W - R}" y="${H - 8}" text-anchor="end">Trade ${curve.length}</text>
        <path class="line" d="${d}"/>
        ${markers}
        <line class="crosshair" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
        <circle class="focus" r="5" visibility="hidden"/>
        <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
      </svg>
      <div class="tooltip" hidden></div>
    </div>
    <script type="application/json">${data}</script>
  </figure>`;
}

function groupTable(title, rows) {
  if (!rows.length) return '';
  return `<div class="card"><h3>${esc(title)}</h3><div class="scroll"><table>
    <thead><tr><th>${esc(title.replace('Prestasi ikut ', ''))}</th><th class="num">Trade</th><th class="num">Win Rate</th><th class="num">P/L</th></tr></thead>
    <tbody>${rows.map((g) => `<tr><td>${esc(g.name)}</td><td class="num">${g.count}</td><td class="num">${fmtPct(g.winRate)}</td><td class="num">${pnl(g.pnl)}</td></tr>`).join('')}</tbody>
  </table></div></div>`;
}

function statsSection(s) {
  return `${statTiles(s)}${equityChart(s.curve)}
    <div class="grid3">${groupTable('Prestasi ikut Pair', s.bySymbol)}${groupTable('Prestasi ikut Strategi', s.byStrategy)}${groupTable('Prestasi ikut Emosi', s.byEmotion)}</div>`;
}

// ---------- Trade ----------
function tradeTable(trades, base, { showComment = true } = {}) {
  if (!trades.length) return '<p class="muted">Tiada trade.</p>';
  return `<div class="scroll"><table>
    <thead><tr><th>Tarikh</th><th>Pair</th><th>Arah</th><th class="num">Entry</th><th class="num">Exit</th><th class="num">Lot</th>
      <th class="num">P/L</th><th class="num">R</th><th>Strategi</th><th>Keputusan</th>${showComment ? '<th>Mentor</th>' : ''}<th></th></tr></thead>
    <tbody>${trades.map((t) => `<tr>
      <td class="nowrap">${esc(t.trade_date)}</td><td><strong>${esc(t.symbol)}</strong></td><td>${badge(t.direction)}</td>
      <td class="num">${fmtPrice(t.entry_price)}</td><td class="num">${fmtPrice(t.exit_price)}</td><td class="num">${fmtPrice(t.lot_size)}</td>
      <td class="num">${pnl(t.pnl)}</td><td class="num">${fmtR(rMultiple(t))}</td><td>${esc(t.strategy || '–')}</td>
      <td>${badge(result(t))}</td>${showComment ? `<td>${t.mentor_comment ? '💬' : ''}</td>` : ''}
      <td><a href="${base}/trade/${t.id}">Lihat</a></td></tr>`).join('')}
    </tbody></table></div>`;
}

function tradeDetail(t, base) {
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  return `<div class="card"><dl>
    ${row('Tarikh', esc(t.trade_date))}
    ${row('Pair / Simbol', `<strong>${esc(t.symbol)}</strong> ${badge(t.direction)}`)}
    ${row('Timeframe', esc(t.timeframe || '–'))}
    ${row('Entry', fmtPrice(t.entry_price))}
    ${row('Stop Loss', fmtPrice(t.stop_loss))}
    ${row('Take Profit', fmtPrice(t.take_profit))}
    ${row('Exit', fmtPrice(t.exit_price))}
    ${row('Lot', fmtPrice(t.lot_size))}
    ${row(`P/L (${CURRENCY})`, pnl(t.pnl))}
    ${row('R dirancang', plannedRR(t) == null ? '–' : `1 : ${plannedRR(t).toFixed(2)}`)}
    ${row('R sebenar', fmtR(rMultiple(t)))}
    ${row('Keputusan', badge(result(t)))}
    ${row('Strategi', esc(t.strategy || '–'))}
    ${row('Emosi', esc(t.emotion || '–'))}
    ${row('Analisis / Sebab Entry', esc(t.setup_notes || '–'))}
    ${row('Pengajaran', esc(t.lesson || '–'))}
  </dl></div>
  ${t.has_screenshot ? `<div class="card"><h3>Screenshot Chart</h3><a href="${base}/trade/${t.id}/gambar" target="_blank" rel="noopener"><img class="shot" src="${base}/trade/${t.id}/gambar" alt="Screenshot chart ${esc(t.symbol)}"></a></div>` : ''}`;
}

function tradeForm({ action, values = {}, error = '', editing = false }) {
  const v = (k) => esc(values[k] ?? '');
  const opt = (list, cur) => list.map((o) => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('');
  return `${alert(error)}
  <form method="post" action="${action}" enctype="multipart/form-data" class="card">
    <div class="fields">
      <label>Tarikh <input type="date" name="trade_date" required value="${v('trade_date')}"></label>
      <label>Pair / Simbol <input name="symbol" required maxlength="20" placeholder="cth: XAUUSD, EURUSD, BTCUSD" value="${v('symbol')}"></label>
      <label>Arah <select name="direction">${opt(['BUY', 'SELL'], values.direction)}</select></label>
      <label>Timeframe <select name="timeframe"><option value="">–</option>${opt(TIMEFRAMES, values.timeframe)}</select></label>
      <label>Harga Entry <input name="entry_price" required inputmode="decimal" value="${v('entry_price')}"></label>
      <label>Stop Loss <input name="stop_loss" inputmode="decimal" value="${v('stop_loss')}"></label>
      <label>Take Profit <input name="take_profit" inputmode="decimal" value="${v('take_profit')}"></label>
      <label>Harga Exit <input name="exit_price" inputmode="decimal" placeholder="Kosongkan jika masih terbuka" value="${v('exit_price')}"></label>
      <label>Lot <input name="lot_size" inputmode="decimal" value="${v('lot_size')}"></label>
      <label>P/L (${CURRENCY}) <input name="pnl" inputmode="decimal" placeholder="cth: 25.50 atau -12" value="${v('pnl')}"></label>
      <label>Strategi <input name="strategy" maxlength="60" placeholder="cth: Breakout, SnR, SMC" value="${v('strategy')}"></label>
      <label>Emosi <select name="emotion"><option value="">–</option>${opt(EMOTIONS, values.emotion)}</select></label>
    </div>
    <label>Analisis / Sebab Entry <textarea name="setup_notes" rows="3" maxlength="3000">${v('setup_notes')}</textarea></label>
    <label>Pengajaran <textarea name="lesson" rows="3" maxlength="3000" placeholder="Apa yang betul / salah? Apa yang perlu diperbaiki?">${v('lesson')}</textarea></label>
    <label>Screenshot Chart (pilihan) <input type="file" name="screenshot" accept=".png,.jpg,.jpeg,.webp,.gif"></label>
    ${editing && values.has_screenshot ? '<label class="check"><input type="checkbox" name="remove_screenshot" value="1"> Buang screenshot sedia ada</label>' : ''}
    <small class="muted">P/L diisi sendiri mengikut akaun broker anda. Kosongkan P/L jika trade masih terbuka.</small>
    <button type="submit">${editing ? 'Simpan Perubahan' : 'Simpan Trade'}</button>
  </form>`;
}

module.exports = {
  CURRENCY, EMOTIONS, TIMEFRAMES, esc, fmtSize, fmtNum, pnl, badge, page, alert,
  statsSection, tradeTable, tradeDetail, tradeForm,
};
