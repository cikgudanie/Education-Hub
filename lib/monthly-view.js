// Paparan pelan bulanan dan rekod harian (dikongsi oleh pelajar dan mentor).
const v = require('./views');
const m = require('./monthly');

const { esc, fmtNum, pnl, CURRENCY } = v;
const pct = (x, d = 2) => (x == null ? '–' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(d)}%`);
const money = (x) => (x == null ? '–' : fmtNum(x));
const pips = (x) => (x == null ? '–' : fmtNum(x, 1));

function monthNav(base, month, path = '') {
  const prev = m.shiftMonth(month, -1);
  const next = m.shiftMonth(month, 1);
  return `<div class="month-nav">
    <a class="button secondary" href="${base}${path}?bulan=${prev}" aria-label="Bulan sebelum">‹</a>
    <strong>${m.monthLabel(month)}</strong>
    <a class="button secondary" href="${base}${path}?bulan=${next}" aria-label="Bulan seterusnya">›</a>
    ${month !== m.thisMonth() ? `<a href="${base}${path}">Bulan ini</a>` : ''}
  </div>`;
}

// Status sasaran harian: simbol + teks, bukan warna sahaja.
function parBadge(d) {
  if (d.pnl < 0) return '<span class="badge badge-rugi">✗ Rugi</span>';
  if (d.hitPar2) return '<span class="badge badge-untung">✓✓ Par 2</span>';
  if (d.hitPar1) return '<span class="badge badge-untung">✓ Par 1</span>';
  if (d.hitPar1 === false && d.pnl > 0) return '<span class="badge">Bawah sasaran</span>';
  return '<span class="badge">–</span>';
}

function planCard(s, { base, month, canEdit }) {
  if (!s.plan) {
    return `<div class="card center">
      <h2>Tiada pelan untuk ${m.monthLabel(month)}</h2>
      <p class="muted">Tetapkan modal dan peratus sasaran supaya Par 1, Par 2 dan sasaran harian dapat dikira.</p>
      ${canEdit ? `<p><a class="button" href="${base}/pelan?bulan=${month}">Tetapkan Pelan Bulan Ini</a></p>` : ''}
    </div>`;
  }
  const p = s.plan, t = s.targets;
  return `<div class="card">
    <div class="head-row"><h3>Pelan Strategi: ${m.monthLabel(month)}</h3>
      ${canEdit ? `<a href="${base}/pelan?bulan=${month}">Ubah pelan</a>` : ''}</div>
    <div class="plan-meta">
      <span>Modal: <strong>${money(p.capital)} ${CURRENCY}</strong></span>
      <span>USD/pip: <strong>${fmtNum(p.usd_per_pip, 2)}</strong></span>
      <span>Lot: <strong>${fmtNum(p.lot_size, 2)}</strong></span>
      <span>Base: <strong>${(p.base_pct * 100).toFixed(1)}%</strong></span>
      ${p.risk_pct != null ? `<span>Risiko/trade: <strong>${(p.risk_pct * 100).toFixed(1)}%</strong> (${money(t.riskPerTrade)})</span>` : ''}
      ${p.risk_tolerance_pct != null ? `<span>Toleransi risiko: <strong>${(p.risk_tolerance_pct * 100).toFixed(1)}%</strong> (${money(t.riskTolerance)})</span>` : ''}
    </div>
    <div class="scroll"><table>
      <thead><tr><th>Sasaran</th><th class="num">Bulanan (${CURRENCY})</th><th class="num">Mingguan</th><th class="num">Harian</th>
        <th class="num">Pips Harian</th><th class="num">Pips Mingguan</th><th class="num">Pips Bulanan</th></tr></thead>
      <tbody>
        ${[['Par 1', p.base_pct, t.par1], ['Par 2', p.base_pct * 2, t.par2]].map(([n, b, x]) => `<tr>
          <td><strong>${n}</strong> <span class="muted">(${(b * 100).toFixed(1)}%)</span></td>
          <td class="num">${money(x.monthly)}</td><td class="num">${money(x.weekly)}</td><td class="num">${money(x.daily)}</td>
          <td class="num">${pips(x.dailyPips)}</td><td class="num">${pips(x.weeklyPips)}</td><td class="num">${pips(x.monthlyPips)}</td></tr>`).join('')}
      </tbody></table></div>
    <details><summary>Unjuran 10X Income</summary>
      <div class="scroll"><table><thead><tr><th>Skala</th><th class="num">Modal</th><th class="num">Par 1 / bulan</th><th class="num">Par 2 / bulan</th></tr></thead>
      <tbody>
        <tr><td>Base</td><td class="num">${money(p.capital)}</td><td class="num">${money(t.par1.monthly)}</td><td class="num">${money(t.par2.monthly)}</td></tr>
        <tr><td>10X Income</td><td class="num">${money(t.x10.capital)}</td><td class="num">${money(t.x10.par1)}</td><td class="num">${money(t.x10.par2)}</td></tr>
        <tr><td>10X2 Income</td><td class="num">${money(t.x100.capital)}</td><td class="num">${money(t.x100.par1)}</td><td class="num">${money(t.x100.par2)}</td></tr>
      </tbody></table></div>
    </details>
  </div>`;
}

function kpis(s) {
  const x = s.month, t = s.targets;
  const tile = (label, value, sub = '') =>
    `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div>${sub ? `<div class="tile-sub">${sub}</div>` : ''}</div>`;
  const parStatus = (done, remaining) => done ? '✓ Tercapai' : remaining == null ? '–' : `Baki ${money(remaining)}`;
  return `<div class="tiles">
    ${tile('Modal Semasa', s.plan ? money(x.endCapital) : '–', s.plan ? `Mula ${money(x.startCapital)} ${CURRENCY}` : 'Tiada pelan')}
    ${tile(`P/L Bulan Ini (${CURRENCY})`, pnl(x.pnl), `${pct(x.pct)} daripada modal`)}
    ${tile('Par 1', t ? (x.par1Done ? '✓' : pct(x.pct)) + ` <span class="tile-of">/ ${(s.plan.base_pct * 100).toFixed(1)}%</span>` : '–', parStatus(x.par1Done, x.par1Remaining))}
    ${tile('Par 2', t ? (x.par2Done ? '✓' : pct(x.pct)) + ` <span class="tile-of">/ ${(s.plan.base_pct * 200).toFixed(1)}%</span>` : '–', parStatus(x.par2Done, x.par2Remaining))}
    ${tile('Win Rate', x.winRate == null ? '–' : `${(x.winRate * 100).toFixed(1)}%`, `${x.wins} win · ${x.losses} loss · ${x.trades} trade`)}
    ${tile('Profit Loss Ratio', x.plRatio == null ? '–' : fmtNum(x.plRatio), x.plRatio == null ? 'Tiada kerugian lagi' : x.plRatio >= 1 ? 'Lebih 1 = Winning' : 'Kurang 1 = Losing')}
    ${tile('Hari Direkod', `${x.days}`, `${x.greenDays} untung · ${x.redDays} rugi${t ? ` · ${x.daysHitPar1} capai Par 1` : ''}`)}
    ${tile('Max Drawdown', pnl(x.maxDrawdown ? -x.maxDrawdown : 0), x.overTolerance ? '⚠ Melebihi toleransi risiko' : 'Penurunan terbesar dari puncak')}
  </div>
  ${x.overTolerance ? `<div class="alert error">⚠ Kerugian bulan ini (${money(-x.pnl)}) sudah mencapai had toleransi risiko (${money(t.riskTolerance)}). Berhenti dan semak semula strategi bersama mentor.</div>` : ''}`;
}

function capitalChart(s) {
  if (!s.plan) return '';
  return v.lineChart({
    points: s.days.map((d) => ({ value: d.capitalAfter, meta: `${d.day} ${d.record_date} · P/L ${v.signedNum(d.pnl)}` })),
    start: s.plan.capital,
    title: 'Equity Curve', subtitle: `modal (${CURRENCY}) selepas setiap hari dagangan`, valueLabel: 'Modal',
    xStart: 'Mula', xEnd: s.days.length ? s.days[s.days.length - 1].record_date : '',
    ariaLabel: s.days.length ? `Graf modal bagi ${s.days.length} hari, berakhir pada ${money(s.month.endCapital)}` : '',
    emptyText: 'Equity curve akan dipaparkan selepas sekurang-kurangnya 2 hari direkod.',
  });
}

function weekTables(s, base) {
  if (!s.days.length) return '<p class="muted">Belum ada rekod harian untuk bulan ini.</p>';
  return s.weeks.map((w) => `
    <h3 class="week-title">Minggu ${w.week}</h3>
    <div class="scroll"><table class="rmi">
      <thead><tr><th>Tarikh</th><th>Hari</th><th>Setup</th><th class="num">Lot</th><th class="num">Trade</th><th class="num">Win</th><th class="num">Loss</th>
        <th class="num">Profit</th><th class="num">Loss</th><th class="num">P/L</th><th class="num">% Modal</th><th class="num">Modal</th><th>Sasaran</th><th></th></tr></thead>
      <tbody>${w.rows.map((d) => `<tr>
        <td class="nowrap">${esc(d.record_date)}</td><td>${esc(d.day)}</td><td>${esc(d.setup || '–')}</td>
        <td class="num">${d.lot_size == null ? '–' : fmtNum(d.lot_size)}</td><td class="num">${d.total_trades}</td>
        <td class="num">${d.wins}</td><td class="num">${d.losses}</td>
        <td class="num">${money(d.profit)}</td><td class="num">${d.loss ? '−' + money(d.loss) : money(0)}</td>
        <td class="num">${pnl(d.pnl)}</td><td class="num">${pct(d.pct)}</td><td class="num">${s.plan ? money(d.capitalAfter) : '–'}</td>
        <td>${parBadge(d)}</td>
        <td class="nowrap"><a href="${base}/harian/${d.id}">Lihat</a>${d.image_count ? ` 📷${d.image_count}` : ''}${d.mentor_comment ? ' 💬' : ''}</td>
      </tr>`).join('')}
      <tr class="total"><td colspan="4">Jumlah Minggu ${w.week}</td><td class="num">${w.trades}</td><td class="num">${w.wins}</td><td class="num">${w.losses}</td>
        <td class="num">${money(w.profit)}</td><td class="num">${w.loss ? '−' + money(w.loss) : money(0)}</td><td class="num">${pnl(w.pnl)}</td>
        <td class="num">${pct(w.pct)}</td><td colspan="3" class="muted">P/L Ratio ${w.plRatio == null ? '–' : fmtNum(w.plRatio)} · Bulanan ${pct(w.cumPct)}</td></tr>
      </tbody></table></div>`).join('');
}

function rulesCard(rules) {
  if (!rules || !rules.trim()) return '';
  return `<div class="card rules"><h3>Peraturan &amp; Mindset</h3><div class="rules-text">${esc(rules)}</div></div>`;
}

function renderMonth({ s, month, base, canEdit, rules = '', navPath = '' }) {
  return `${monthNav(base, month, navPath)}
    ${kpis(s)}
    <div class="grid-main">
      <div>${capitalChart(s)}</div>
      ${rulesCard(rules)}
    </div>
    ${planCard(s, { base, month, canEdit })}
    <h2>Rekod Harian</h2>
    ${weekTables(s, base)}`;
}

// ---------- Borang ----------
function planForm({ action, values, error = '', month }) {
  const val = (k, mult = 1) => (values[k] == null || values[k] === '' ? '' : esc(+(values[k] * mult).toFixed(6)));
  return `${v.alert(error)}
    <form method="post" action="${action}" class="card">
      <input type="hidden" name="month" value="${esc(month)}">
      <div class="fields">
        <label>Modal (${CURRENCY}) <input name="capital" required inputmode="decimal" value="${val('capital')}"></label>
        <label>USD per Pip <input name="usd_per_pip" required inputmode="decimal" value="${val('usd_per_pip')}"><small class="muted">cth: 0.1 bagi 0.01 lot XAUUSD</small></label>
        <label>Lot Size <input name="lot_size" required inputmode="decimal" value="${val('lot_size')}"></label>
        <label>Base Percentage (%) <input name="base_pct" required inputmode="decimal" value="${val('base_pct', 100)}"><small class="muted">Par 1. Par 2 = 2 kali ganda</small></label>
        <label>Risiko setiap trade (%) <input name="risk_pct" inputmode="decimal" value="${val('risk_pct', 100)}"></label>
        <label>Toleransi risiko bulanan (%) <input name="risk_tolerance_pct" inputmode="decimal" value="${val('risk_tolerance_pct', 100)}"><small class="muted">Had kerugian sebulan</small></label>
      </div>
      <button>Simpan Pelan</button>
    </form>`;
}

function dailyForm({ action, values = {}, error = '', editing = false, images = [], imgBase = '' }) {
  const val = (k) => esc(values[k] ?? '');
  return `${v.alert(error)}
    <form method="post" action="${action}" enctype="multipart/form-data" class="card">
      <div class="fields">
        <label>Tarikh <input type="date" name="record_date" required value="${val('record_date')}"></label>
        <label>Setup <input name="setup" maxlength="60" list="setups" placeholder="cth: LP1, LP2, No LP" value="${val('setup')}">
          <datalist id="setups"><option>LP1</option><option>LP2</option><option>No LP</option></datalist></label>
        <label>Lot Size <input name="lot_size" inputmode="decimal" value="${val('lot_size')}"></label>
        <label>Jumlah Trade <input name="total_trades" required inputmode="numeric" value="${val('total_trades')}"></label>
        <label>Win (bilangan) <input name="wins" required inputmode="numeric" value="${val('wins')}"></label>
        <label>Loss (bilangan) <input name="losses" required inputmode="numeric" value="${val('losses')}"></label>
        <label>Profit (${CURRENCY}) <input name="profit" inputmode="decimal" placeholder="Jumlah untung" value="${val('profit')}"></label>
        <label>Loss (${CURRENCY}) <input name="loss" inputmode="decimal" placeholder="Jumlah rugi, cth 12.50" value="${val('loss')}"></label>
      </div>
      <label>Catatan / Pengajaran Hari Ini <textarea name="notes" rows="3" maxlength="3000">${val('notes')}</textarea></label>
      <label>Screenshot (boleh pilih beberapa gambar, maks 6) <input type="file" name="screenshots" multiple accept=".png,.jpg,.jpeg,.webp,.gif"></label>
      ${editing && images.length ? `<div class="thumbs">${images.map((id) => `<label class="thumb"><img src="${imgBase}/${id}" alt="Screenshot"><span><input type="checkbox" name="remove_images" value="${id}"> Buang</span></label>`).join('')}</div>` : ''}
      <small class="muted">P/L hari ini = Profit − Loss. Modal dikira secara automatik daripada pelan bulanan.</small>
      <button>${editing ? 'Simpan Perubahan' : 'Simpan Rekod'}</button>
    </form>`;
}

function dailyDetail(d, images, imgBase) {
  const row = (k, val) => `<dt>${k}</dt><dd>${val}</dd>`;
  const net = d.profit - d.loss;
  return `<div class="card"><dl>
    ${row('Tarikh', `${esc(d.record_date)} (${m.dayName(d.record_date)})`)}
    ${row('Setup', esc(d.setup || '–'))}
    ${row('Lot Size', d.lot_size == null ? '–' : fmtNum(d.lot_size))}
    ${row('Jumlah Trade', d.total_trades)}
    ${row('Win / Loss', `${d.wins} / ${d.losses}`)}
    ${row(`Profit (${CURRENCY})`, money(d.profit))}
    ${row(`Loss (${CURRENCY})`, d.loss ? '−' + money(d.loss) : money(0))}
    ${row('P/L Hari Ini', pnl(net))}
    ${row('Catatan', esc(d.notes || '–'))}
  </dl></div>
  ${images.length ? `<div class="card"><h3>Screenshot (${images.length})</h3><div class="gallery">
    ${images.map((id) => `<a href="${imgBase}/${id}" target="_blank" rel="noopener"><img src="${imgBase}/${id}" alt="Screenshot ${esc(d.record_date)}"></a>`).join('')}
  </div></div>` : ''}`;
}

module.exports = { renderMonth, planForm, dailyForm, dailyDetail, monthNav, pct, money };
