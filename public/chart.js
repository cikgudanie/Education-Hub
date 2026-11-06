// Crosshair + tooltip untuk graf garis. Label ditulis dengan textContent (data daripada pengguna).
(function () {
  const num = (v) => Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(v);

  document.querySelectorAll('[data-chart="line"]').forEach((fig) => {
    const svg = fig.querySelector('svg');
    const hit = fig.querySelector('.hit');
    const cross = fig.querySelector('.crosshair');
    const focus = fig.querySelector('.focus');
    const tip = fig.querySelector('.tooltip');
    const points = JSON.parse(fig.querySelector('script[type="application/json"]').textContent);
    const fmt = fig.dataset.signed === '1' ? signed : (v) => (v < 0 ? '−' : '') + num(v);
    if (!points.length) return;

    function show(i) {
      const p = points[i];
      cross.setAttribute('x1', p.x); cross.setAttribute('x2', p.x);
      focus.setAttribute('cx', p.x); focus.setAttribute('cy', p.y);
      cross.setAttribute('visibility', 'visible'); focus.setAttribute('visibility', 'visible');

      tip.replaceChildren();
      const v = document.createElement('div'); v.className = 'tip-value'; v.textContent = fmt(p.value);
      const l = document.createElement('div'); l.className = 'tip-label'; l.textContent = fig.dataset.valueLabel || '';
      const d = document.createElement('div'); d.className = 'tip-meta'; d.textContent = p.meta || '';
      tip.append(v, l, d);
      tip.hidden = false;

      const box = svg.getBoundingClientRect();
      const scale = box.width / svg.viewBox.baseVal.width;
      const left = Math.min(Math.max(p.x * scale - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth);
      tip.style.left = left + 'px';
      tip.style.top = Math.max(p.y * scale - tip.offsetHeight - 14, 0) + 'px';
    }

    function hide() {
      cross.setAttribute('visibility', 'hidden'); focus.setAttribute('visibility', 'hidden'); tip.hidden = true;
    }

    function nearest(clientX) {
      const box = svg.getBoundingClientRect();
      const x = ((clientX - box.left) / box.width) * svg.viewBox.baseVal.width;
      let best = 0;
      points.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(points[best].x - x)) best = i; });
      return best;
    }

    let current = points.length - 1;
    hit.addEventListener('pointermove', (e) => { current = nearest(e.clientX); show(current); });
    hit.addEventListener('pointerleave', hide);
    // Papan kekunci: fokus pada graf, guna anak panah kiri/kanan.
    svg.setAttribute('tabindex', '0');
    svg.addEventListener('focus', () => show(current));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') current = Math.max(0, current - 1);
      else if (e.key === 'ArrowRight') current = Math.min(points.length - 1, current + 1);
      else return;
      e.preventDefault(); show(current);
    });
  });
})();
