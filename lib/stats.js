// Kiraan statistik trading journal.

// R-multiple: untung/rugi dalam unit risiko (jarak entry ke stop loss).
function rMultiple(t) {
  if (t.exit_price == null || t.stop_loss == null) return null;
  const risk = Math.abs(t.entry_price - t.stop_loss);
  if (!risk) return null;
  const dir = t.direction === 'SELL' ? -1 : 1;
  return (dir * (t.exit_price - t.entry_price)) / risk;
}

// Nisbah risk:reward yang dirancang (entry, SL, TP).
function plannedRR(t) {
  if (t.stop_loss == null || t.take_profit == null) return null;
  const risk = Math.abs(t.entry_price - t.stop_loss);
  if (!risk) return null;
  return Math.abs(t.take_profit - t.entry_price) / risk;
}

function result(t) {
  if (t.pnl == null) return 'Terbuka';
  if (t.pnl > 0) return 'Untung';
  if (t.pnl < 0) return 'Rugi';
  return 'Seri';
}

function groupBy(closed, key) {
  const map = new Map();
  for (const t of closed) {
    const k = t[key] || '(tiada)';
    const g = map.get(k) || { name: k, count: 0, wins: 0, losses: 0, pnl: 0 };
    g.count += 1;
    if (t.pnl > 0) g.wins += 1;
    if (t.pnl < 0) g.losses += 1;
    g.pnl += t.pnl;
    map.set(k, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, winRate: g.wins + g.losses ? (g.wins / (g.wins + g.losses)) * 100 : null }))
    .sort((a, b) => b.pnl - a.pnl);
}

// trades: senarai trade (sebarang susunan). Pulangkan ringkasan + lengkung ekuiti.
function computeStats(trades) {
  const closed = trades
    .filter((t) => t.pnl != null)
    .sort((a, b) => (a.trade_date === b.trade_date ? a.id - b.id : a.trade_date < b.trade_date ? -1 : 1));

  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const curve = closed.map((t) => {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    return { id: t.id, date: t.trade_date, symbol: t.symbol, pnl: t.pnl, equity };
  });

  // Rentetan untung/rugi berturut-turut terpanjang.
  let curW = 0, curL = 0, maxWinStreak = 0, maxLossStreak = 0;
  for (const t of closed) {
    if (t.pnl > 0) { curW += 1; curL = 0; } else if (t.pnl < 0) { curL += 1; curW = 0; } else { curW = 0; curL = 0; }
    maxWinStreak = Math.max(maxWinStreak, curW);
    maxLossStreak = Math.max(maxLossStreak, curL);
  }

  const rs = closed.map(rMultiple).filter((r) => r != null);

  return {
    total: trades.length,
    open: trades.length - closed.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: closed.length - wins.length - losses.length,
    winRate: wins.length + losses.length ? (wins.length / (wins.length + losses.length)) * 100 : null,
    totalPnl: equity,
    avgWin: wins.length ? grossWin / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    profitFactor: grossLoss ? grossWin / grossLoss : null,
    avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null,
    best: closed.length ? Math.max(...closed.map((t) => t.pnl)) : null,
    worst: closed.length ? Math.min(...closed.map((t) => t.pnl)) : null,
    maxDrawdown,
    maxWinStreak,
    maxLossStreak,
    curve,
    bySymbol: groupBy(closed, 'symbol'),
    byStrategy: groupBy(closed, 'strategy'),
    byEmotion: groupBy(closed, 'emotion'),
  };
}

module.exports = { computeStats, rMultiple, plannedRR, result };
