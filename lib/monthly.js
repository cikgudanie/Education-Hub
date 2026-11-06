// Kiraan pelan bulanan (Par 1 / Par 2) dan ringkasan rekod harian,
// mengikut templat "Strategic Trading Implementation" dan "RMI".

const TRADING_DAYS = 20; // 5 hari x 4 minggu
const DAY_NAMES = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const MONTH_NAMES = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];

const DEFAULT_RULES = `Rules
- I close all trades daily, either profit or loss
- I always start fresh state
- I always start base capital
- My goal is survival

Mindset
- Market is random
- Market is high adversity
- I accept losses

1USD = 10X
1 REWARD = 3 RISK`;

const DEFAULT_PLAN = { capital: 1000, usd_per_pip: 0.1, lot_size: 0.01, base_pct: 0.05, risk_pct: 0.015, risk_tolerance_pct: 0.1 };

// Tarikh/bulan tempatan pelayan.
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
const thisMonth = () => today().slice(0, 7);
const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const dayName = (s) => DAY_NAMES[parseDate(s).getUTCDay()];

// Minggu dalam bulan (minggu bermula Isnin): Minggu 1 = minggu yang mengandungi 1hb.
function weekOfMonth(s) {
  const d = parseDate(s);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const offset = (first.getUTCDay() + 6) % 7; // Isnin = 0
  let w = Math.floor((d.getUTCDate() - 1 + offset) / 7) + 1;
  // Jika 1hb jatuh pada Sabtu/Ahad, hujung minggu itu digabung ke minggu bekerja pertama.
  if (first.getUTCDay() === 0 || first.getUTCDay() === 6) w -= 1;
  return Math.max(1, w);
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

// Senarai minggu W1..W5 bagi sesuatu bulan, berdasarkan hari bekerja (Isnin-Jumaat).
function monthWeeks(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = new Map();
  for (let d = 1; d <= last; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    const dow = parseDate(iso).getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const w = weekOfMonth(iso);
    const cur = weeks.get(w) || { week: w, start: iso, end: iso, tradingDays: 0 };
    cur.end = iso;
    cur.tradingDays += 1;
    weeks.set(w, cur);
  }
  return [...weeks.values()].map((w) => ({
    ...w,
    label: w.start === w.end ? `${Number(w.start.slice(8))} ${MONTH_SHORT[m - 1]}` : `${Number(w.start.slice(8))}–${Number(w.end.slice(8))} ${MONTH_SHORT[m - 1]}`,
  }));
}

// Sasaran daripada pelan (sama seperti sheet "Monthly Strategy").
function targets(plan) {
  if (!plan) return null;
  const par1 = plan.capital * plan.base_pct;
  const par2 = par1 * 2;
  const mk = (monthly) => {
    const daily = monthly / TRADING_DAYS;
    const dailyPips = plan.usd_per_pip ? daily / plan.usd_per_pip : null;
    return {
      monthly, daily, dailyPips,
      weekly: daily * 5,
      weeklyPips: dailyPips == null ? null : dailyPips * 5,
      monthlyPips: dailyPips == null ? null : dailyPips * 20,
    };
  };
  return {
    par1: mk(par1),
    par2: mk(par2),
    riskPerTrade: plan.risk_pct != null ? plan.capital * plan.risk_pct : null,
    riskTolerance: plan.risk_tolerance_pct != null ? plan.capital * plan.risk_tolerance_pct : null,
    // Unjuran "10X Income" dan "10X2 Income".
    x10: { capital: plan.capital * 10, par1: plan.capital * 10 * plan.base_pct, par2: plan.capital * 10 * plan.base_pct * 2 },
    x100: { capital: plan.capital * 100, par1: plan.capital * 100 * plan.base_pct, par2: plan.capital * 100 * plan.base_pct * 2 },
  };
}

function totals(rows) {
  const t = rows.reduce((a, r) => {
    a.pnl += r.profit - r.loss;
    a.profit += r.profit;
    a.loss += r.loss;
    a.trades += r.total_trades;
    a.wins += r.wins;
    a.losses += r.losses;
    a.lots += (r.lot_size || 0) * r.total_trades;
    return a;
  }, { pnl: 0, profit: 0, loss: 0, trades: 0, wins: 0, losses: 0, lots: 0 });
  t.days = rows.length;
  t.winRate = t.wins + t.losses ? t.wins / (t.wins + t.losses) : null;
  t.plRatio = t.loss ? t.profit / t.loss : null; // "Profit Loss Ratio"
  return t;
}

// plan boleh null (tiada pelan): kiraan % dan sasaran akan kosong.
function summarize(plan, records, monthArg) {
  const tg = targets(plan);
  const start = plan ? plan.capital : 0;
  let capital = start;
  let peak = start;
  let maxDrawdown = 0;

  const days = [...records].sort((a, b) => (a.record_date < b.record_date ? -1 : 1)).map((r) => {
    const pnl = r.profit - r.loss;
    const before = capital;
    capital += pnl;
    peak = Math.max(peak, capital);
    maxDrawdown = Math.max(maxDrawdown, peak - capital);
    return {
      ...r,
      pnl,
      capitalBefore: before,
      capitalAfter: capital,
      pct: plan ? pnl / plan.capital : null,
      week: weekOfMonth(r.record_date),
      day: dayName(r.record_date),
      hitPar1: tg ? pnl >= tg.par1.daily : null,
      hitPar2: tg ? pnl >= tg.par2.daily : null,
    };
  });

  const weekNums = [...new Set(days.map((d) => d.week))].sort((a, b) => a - b);
  let cumPct = 0;
  const weeks = weekNums.map((w) => {
    const rows = days.filter((d) => d.week === w);
    const t = totals(rows);
    const pct = plan ? t.pnl / plan.capital : null;
    if (pct != null) cumPct += pct;
    return { week: w, rows, ...t, pct, cumPct: plan ? cumPct : null };
  });

  // Ringkasan W1..W5 untuk semua minggu dalam bulan, termasuk minggu tanpa rekod.
  const month = monthArg || (plan && plan.month) || (days[0] && days[0].record_date.slice(0, 7)) || thisMonth();
  const now = today();
  let cum = 0;
  const weekPlan = monthWeeks(month).map((info) => {
    const found = weeks.find((w) => w.week === info.week);
    const t = found || { ...totals([]), rows: [] };
    const wpct = plan ? t.pnl / plan.capital : null;
    if (wpct != null) cum += wpct;
    const par1 = tg ? tg.par1.daily * info.tradingDays : null;
    const par2 = tg ? tg.par2.daily * info.tradingDays : null;
    let status;
    if (info.start > now && !t.days) status = 'future';
    else if (!t.days) status = 'none';
    else if (t.pnl < 0) status = 'loss';
    else if (tg && t.pnl >= par2) status = 'par2';
    else if (tg && t.pnl >= par1) status = 'par1';
    else status = 'below';
    return { ...info, ...t, pct: wpct, cumPct: plan ? cum : null, par1, par2, progress: par1 ? t.pnl / par1 : null, status };
  });
  weeks.forEach((w) => { const i = weekPlan.find((x) => x.week === w.week); if (i) { w.label = i.label; w.tradingDays = i.tradingDays; } });

  const m = totals(days);
  const pct = plan ? m.pnl / plan.capital : null;
  return {
    plan, targets: tg, days, weeks, weekPlan, monthKey: month,
    month: {
      ...m,
      pct,
      startCapital: start,
      endCapital: capital,
      maxDrawdown,
      bestDay: days.length ? Math.max(...days.map((d) => d.pnl)) : null,
      worstDay: days.length ? Math.min(...days.map((d) => d.pnl)) : null,
      greenDays: days.filter((d) => d.pnl > 0).length,
      redDays: days.filter((d) => d.pnl < 0).length,
      daysHitPar1: tg ? days.filter((d) => d.hitPar1).length : null,
      par1Remaining: tg ? tg.par1.monthly - m.pnl : null,
      par2Remaining: tg ? tg.par2.monthly - m.pnl : null,
      par1Done: tg ? m.pnl >= tg.par1.monthly : false,
      par2Done: tg ? m.pnl >= tg.par2.monthly : false,
      overTolerance: tg && tg.riskTolerance != null ? -m.pnl >= tg.riskTolerance : false,
    },
  };
}

module.exports = {
  monthWeeks, DEFAULT_RULES, DEFAULT_PLAN, TRADING_DAYS, today, thisMonth, isMonth, shiftMonth, monthLabel, dayName, weekOfMonth, targets, summarize,
};
