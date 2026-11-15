/* BioSense — lightweight canvas charts (no libraries, works offline) */
(function () {
  "use strict";

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function prep(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  // values: array of numbers (nulls skipped). color: CSS var name or color
  function sparkline(canvas, values, color, opts = {}) {
    const p = prep(canvas); if (!p) return;
    const { ctx, w, h } = p;
    const pts = values.map((v, i) => [i, v]).filter((q) => q[1] != null && isFinite(q[1]));
    if (pts.length < 2) return;
    let min = opts.min ?? Math.min(...pts.map((q) => q[1]));
    let max = opts.max ?? Math.max(...pts.map((q) => q[1]));
    if (max - min < (opts.minSpan || 1e-6)) { const m = (max + min) / 2; min = m - (opts.minSpan || 1) / 2; max = m + (opts.minSpan || 1) / 2; }
    const n = values.length - 1 || 1;
    const X = (i) => 2 + (i / n) * (w - 4), Y = (v) => h - 3 - ((v - min) / (max - min)) * (h - 6);
    const col = color.startsWith("--") ? css(color) : color;
    ctx.beginPath();
    pts.forEach(([i, v], k) => (k ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.strokeStyle = col; ctx.lineWidth = 1.75; ctx.lineJoin = "round"; ctx.stroke();
    if (opts.fill !== false) {
      ctx.lineTo(X(pts[pts.length - 1][0]), h); ctx.lineTo(X(pts[0][0]), h); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hexA(col, 0.22)); g.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = g; ctx.fill();
    }
  }

  // series: [{values, color, label, min, max}] each normalized to its own range; xs labels in seconds
  function multiLine(canvas, times, series, opts = {}) {
    const p = prep(canvas); if (!p) return;
    const { ctx, w, h } = p;
    const padL = 8, padR = 8, padT = 10, padB = 22;
    const grid = css("--grid"), muted = css("--muted");
    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    for (let i = 0; i <= 4; i++) {
      const y = padT + (i / 4) * (h - padT - padB);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    if (times.length < 2) {
      ctx.fillStyle = muted; ctx.font = "12px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(opts.empty || "Collecting data — the chart fills in as the session runs", w / 2, h / 2);
      return;
    }
    const t0 = times[0], t1 = times[times.length - 1] || 1;
    const X = (t) => padL + ((t - t0) / Math.max(t1 - t0, 1)) * (w - padL - padR);
    for (const s of series) {
      const vals = s.values;
      const real = vals.filter((v) => v != null && isFinite(v));
      if (real.length < 2) continue;
      let min = s.min ?? Math.min(...real), max = s.max ?? Math.max(...real);
      if (max - min < 1e-6) { min -= 1; max += 1; }
      const Y = (v) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);
      ctx.beginPath(); let started = false;
      vals.forEach((v, i) => {
        if (v == null || !isFinite(v)) { started = false; return; }
        const x = X(times[i]), y = Y(Math.max(min, Math.min(max, v)));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color.startsWith("--") ? css(s.color) : s.color;
      ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    }
    ctx.fillStyle = muted; ctx.font = "10px 'JetBrains Mono', ui-monospace, monospace";
    ctx.textAlign = "left"; ctx.fillText(fmtT(t0), padL, h - 6);
    ctx.textAlign = "right"; ctx.fillText(fmtT(t1), w - padR, h - 6);
  }

  // animated waveform rows for the landing page preview
  function scope(canvas, rows, t) {
    const p = prep(canvas); if (!p) return;
    const { ctx, w, h } = p;
    const rh = h / rows.length;
    rows.forEach((r, i) => {
      const cy = rh * i + rh / 2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const y = cy + r.fn(x / w, t) * rh * 0.36;
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = css(r.color); ctx.lineWidth = 1.6; ctx.stroke();
    });
  }

  function fmtT(s) {
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s / 60), sec = s % 60;
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}:${String(sec).padStart(2, "0")}`;
  }

  function hexA(col, a) {
    const m = col.match(/^#([0-9a-f]{6})$/i);
    if (!m) return col;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  window.BioCharts = { sparkline, multiLine, scope, fmtT };
})();
