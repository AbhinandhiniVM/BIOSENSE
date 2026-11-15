/*
  BioSense — calculation engine
  Implements the Biosignal Metrics Guide (Part 2 outputs, Part 3 formulas).
  Nothing here is shown on screen: the UI only receives the finished, plain-language results.
*/
(function () {
  "use strict";

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

  // ---------- signal-processing helpers ----------
  function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wlr = Math.cos(ang), wli = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let wr = 1, wi = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const vr = re[b] * wr - im[b] * wi, vi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - vr; im[b] = im[a] - vi;
          re[a] += vr; im[a] += vi;
          const t = wr * wlr - wi * wli; wi = wr * wli + wi * wlr; wr = t;
        }
      }
    }
  }

  // Linear interpolation onto an even time grid
  function resample(ts, vs, fs, t0, t1) {
    const out = [];
    let j = 0;
    for (let t = t0; t <= t1; t += 1 / fs) {
      while (j < ts.length - 2 && ts[j + 1] < t) j++;
      const ta = ts[j], tb = ts[j + 1] ?? ta;
      const va = vs[j], vb = vs[j + 1] ?? va;
      out.push(tb === ta ? va : va + (vb - va) * clamp((t - ta) / (tb - ta), 0, 1));
    }
    return out;
  }

  function linreg(xs, ys) {
    const n = xs.length;
    if (n < 2) return { slope: 0, intercept: ys[0] || 0 };
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
    const slope = sxx ? sxy / sxx : 0;
    return { slope, intercept: my - slope * mx };
  }

  function detrend(x) {
    const xs = x.map((_, i) => i);
    const { slope, intercept } = linreg(xs, x);
    return x.map((v, i) => v - (slope * i + intercept));
  }

  // Welch power spectral density (Hann window, 50% overlap), one-sided, units^2/Hz
  function welch(x, fs, segLen) {
    segLen = Math.min(segLen, x.length);
    const step = Math.max(1, segLen >> 1);
    const nfft = nextPow2(segLen);
    const w = Array.from({ length: segLen }, (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (segLen - 1))));
    const U = w.reduce((s, v) => s + v * v, 0);
    const acc = new Float64Array(nfft / 2 + 1);
    let K = 0;
    for (let s = 0; s + segLen <= x.length; s += step) {
      const seg = detrend(x.slice(s, s + segLen));
      const re = new Float64Array(nfft), im = new Float64Array(nfft);
      for (let i = 0; i < segLen; i++) re[i] = seg[i] * w[i];
      fft(re, im);
      for (let k = 0; k <= nfft / 2; k++) {
        let p = (re[k] * re[k] + im[k] * im[k]) / (fs * U);
        if (k > 0 && k < nfft / 2) p *= 2;
        acc[k] += p;
      }
      K++;
    }
    for (let k = 0; k < acc.length; k++) acc[k] /= K || 1;
    return { df: fs / nfft, p: acc };
  }

  function bandIntegral(spec, f1, f2) {
    let s = 0;
    for (let k = 0; k < spec.p.length; k++) {
      const f = k * spec.df;
      if (f >= f1 && f < f2) s += spec.p[k] * spec.df;
    }
    return s;
  }

  // ---------- engine ----------
  const BAND_CENTERS = { d: 2.25, t: 6, a: 10.5, b: 21.5, g: 37.5 };

  class Engine {
    constructor() {
      this.alphaCheck = null; // result of eyes-closed / eyes-open test, survives resets
      this.reset();
    }

    reset() {
      this.imu = []; this.hr = []; this.beats = []; this.temp = []; this.eeg = []; this.tbrLog = [];
      this.history = [];
      this.lastBeats = null; this.lastUptime = null; this.latest = null;
      this.sessionStart = null; this.lastHistT = -Infinity;
      this.cache = { hrvT: -Infinity, hrv: null, swayT: -Infinity, sway: null };
    }

    ingest(d) {
      if (!d || typeof d.uptime_ms !== "number") return;
      if (this.lastUptime !== null && d.uptime_ms + 2000 < this.lastUptime) this.reset(); // device restarted
      this.lastUptime = d.uptime_ms;
      this.latest = d;
      const t = d.uptime_ms / 1000;
      if (this.sessionStart === null) this.sessionStart = t;

      if (d.imu && d.imu.ok) {
        this.imu.push({ t, x: d.imu.x_g, y: d.imu.y_g, z: d.imu.z_g, mv: !!d.imu.moving });
        trim(this.imu, t, 60);
      }

      if (d.ppg) {
        if (d.ppg.hr_bpm != null) { this.hr.push({ t, v: d.ppg.hr_bpm }); trim(this.hr, t, 300); }
        // Optional: exact beat-to-beat intervals if the firmware sends them
        if (Array.isArray(d.ppg.ibi_ms) && typeof d.ppg.beats === "number") {
          const fresh = this.lastBeats === null ? d.ppg.ibi_ms.length : d.ppg.beats - this.lastBeats;
          if (fresh > 0) {
            const add = d.ppg.ibi_ms.slice(-Math.min(fresh, d.ppg.ibi_ms.length));
            let tb = this.beats.length ? this.beats[this.beats.length - 1].t : t - add.reduce((s, v) => s + v, 0) / 1000;
            for (const ibi of add) { tb += ibi / 1000; this.beats.push({ t: tb, v: ibi }); }
            trim(this.beats, t, 300);
          }
          this.lastBeats = d.ppg.beats;
        }
      }

      if (d.temp && d.temp.ok && d.temp.c != null) { this.temp.push({ t, v: d.temp.c }); trim(this.temp, t, 900); }

      if (d.eeg && d.eeg.ok) {
        const last = this.eeg[this.eeg.length - 1];
        const e = d.eeg;
        if (!last || last.d !== e.delta || last.t_ !== e.theta || last.a !== e.alpha || last.b !== e.beta || last.g !== e.gamma) {
          this.eeg.push({ t, d: e.delta, t_: e.theta, a: e.alpha, b: e.beta, g: e.gamma, sat: !!e.saturated });
          trim(this.eeg, t, 60);
          if (e.beta > 0) { this.tbrLog.push({ t, v: e.theta / e.beta }); trim(this.tbrLog, t, 900); }
        }
      }
    }

    now() { return this.lastUptime === null ? 0 : this.lastUptime / 1000; }
    sessionSeconds() { return this.sessionStart === null ? 0 : this.now() - this.sessionStart; }

    // ---- EEG ----
    brain() {
      const d = this.latest;
      const out = { ok: false, warming: true, saturated: false };
      if (!d || !d.eeg) return out;
      if (!d.eeg.ok) { out.warming = true; return out; }
      const t = this.now();
      const recent = this.eeg.filter((e) => e.t >= t - 5);
      if (!recent.length) return out;
      const bands = {
        d: mean(recent.map((e) => e.d)), t: mean(recent.map((e) => e.t_)), a: mean(recent.map((e) => e.a)),
        b: mean(recent.map((e) => e.b)), g: mean(recent.map((e) => e.g)),
      };
      const total = bands.d + bands.t + bands.a + bands.b + bands.g;
      if (!(total > 0)) return out;
      out.ok = true; out.warming = false;
      out.saturated = recent.some((e) => e.sat);
      out.bands = bands;

      // Output 1 — Vigilance
      const slowFast = (bands.d + bands.t) / Math.max(bands.b + bands.g, 0.01);
      const centroid = (bands.d * BAND_CENTERS.d + bands.t * BAND_CENTERS.t + bands.a * BAND_CENTERS.a +
        bands.b * BAND_CENTERS.b + bands.g * BAND_CENTERS.g) / total;
      const ratioScore = clamp((100 * Math.log(3.5 / slowFast)) / Math.log(3.5 / 0.4), 0, 100);
      const centroidScore = clamp(((centroid - 5) / 15) * 100, 0, 100);
      out.vigilance = Math.round((ratioScore + centroidScore) / 2);
      out.centroid = centroid;
      out.slowFast = slowFast;
      out.vigLabel = out.vigilance >= 55 ? "Alert" : out.vigilance >= 35 ? "Relaxed" : out.vigilance >= 15 ? "Drowsy" : "Very drowsy";
      out.paceLabel = centroid >= 12 ? "Fast — busy, engaged brain" : centroid >= 8 ? "Medium — calm and relaxed" : "Slow — winding down / sleepy";

      // Validity gate (alpha suppression + saturation)
      const ac = this.alphaCheck;
      if (out.saturated) { out.confidence = "low"; out.confidenceText = "Signal overloaded — check the electrodes"; }
      else if (!ac) { out.confidence = "unknown"; out.confidenceText = "Sensor check not done yet"; }
      else if (ac.pct < 20) { out.confidence = "low"; out.confidenceText = "Sensor check weak — readings less reliable"; }
      else { out.confidence = "good"; out.confidenceText = "Sensor check passed"; }

      // Output 2 — Attention / focus tendency
      const tbr = bands.t / Math.max(bands.b, 0.01);
      out.tbr = tbr;
      out.attention = Math.round(clamp((100 * (3.2 - tbr)) / (3.2 - 0.7), 0, 100));
      out.attLabel = tbr < 1.2 ? "Engaged" : tbr <= 2.5 ? "Typical" : "Drifting";
      const win = this.tbrLog.filter((e) => e.t >= t - 600);
      const span = win.length ? win[win.length - 1].t - win[0].t : 0;
      out.trendMinutes = Math.max(0, Math.round(span / 60));
      if (span >= 120) {
        const { slope } = linreg(win.map((e) => e.t), win.map((e) => e.v));
        const change = (slope * span) / Math.max(mean(win.map((e) => e.v)), 0.05);
        out.trend = change > 0.15 ? "falling" : change < -0.15 ? "rising" : "steady"; // focus direction (TBR up = focus down)
      } else out.trend = null;
      return out;
    }

    // ---- PPG / HRV ----
    heart() {
      const d = this.latest;
      const out = { hr: null, spo2: null, rmssd: null, simulated: false };
      if (!d || !d.ppg) return out;
      out.hr = d.ppg.hr_bpm; out.spo2 = d.ppg.spo2_pct; out.rmssd = d.ppg.hrv_rmssd_ms;
      out.simulated = !!d.ppg.simulated;
      out.hrLabel = out.hr == null ? null : out.hr < 50 ? "Low" : out.hr <= 100 ? "Normal" : "High";
      out.spo2Label = out.spo2 == null ? null : out.spo2 >= 95 ? "Normal" : out.spo2 >= 90 ? "A little low" : "Low";
      out.rmssdLabel = out.rmssd == null ? null : out.rmssd < 20 ? "Low — body under load" : out.rmssd <= 50 ? "Typical" : "High — well recovered";

      const t = this.now();
      if (t - this.cache.hrvT >= 2 || !this.cache.hrv) { this.cache.hrv = this.hrv(); this.cache.hrvT = t; }
      out.hrv = this.cache.hrv;
      return out;
    }

    hrv() {
      const NEED = 64, WINDOW = 120, FS = 4;
      let ts, vs, source;
      if (this.beats.length >= 20) { ts = this.beats.map((b) => b.t); vs = this.beats.map((b) => b.v); source = "beats"; }
      else { ts = this.hr.map((h) => h.t); vs = this.hr.map((h) => 60000 / h.v); source = "estimated"; }
      const t = this.now();
      const keep = ts.map((x, i) => i).filter((i) => ts[i] >= t - WINDOW);
      ts = keep.map((i) => ts[i]); vs = keep.map((i) => vs[i]);
      const span = ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0;
      if (span < NEED) return { ready: false, progress: clamp(span / NEED, 0, 1), source };
      const x = resample(ts, vs, FS, ts[0], ts[ts.length - 1]);
      const spec = welch(x, FS, 256);
      const lf = bandIntegral(spec, 0.04, 0.15);
      const hf = bandIntegral(spec, 0.15, 0.4);
      if (!(hf > 0) || !(lf > 0)) return { ready: false, progress: 1, source, flat: true };
      const lfhf = lf / hf;
      return { ready: true, progress: 1, lf, hf, lfhf, hfnu: hf / (lf + hf), source };
    }

    // ---- IMU ----
    motion() {
      const d = this.latest;
      const out = { ok: false };
      if (!d || !d.imu || !d.imu.ok) return out;
      const { x_g: x, y_g: y, z_g: z, noise_sd_g: noise, moving } = d.imu;
      out.ok = true; out.x = x; out.y = y; out.z = z; out.noise = noise; out.moving = !!moving;
      const mag = Math.sqrt(x * x + y * y + z * z) || 1;
      out.tiltDeg = (Math.acos(clamp(Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) / mag, -1, 1)) * 180) / Math.PI;
      out.activity = noise < 0.02 ? "Very still" : noise < 0.08 ? "Small movements" : noise < 0.25 ? "Moving" : "Very active";

      const t = this.now();
      if (t - this.cache.swayT >= 1 || !this.cache.sway) { this.cache.sway = this.sway(out.moving); this.cache.swayT = t; }
      out.sway = this.cache.sway;
      return out;
    }

    sway(moving) {
      const NEED = 20, FS = 4;
      const t = this.now();
      if (moving) return { ready: false, moving: true, progress: 0 };
      // only use samples recorded after the last movement
      let s = this.imu.filter((e) => e.t >= t - 30);
      let lastMove = -1;
      s.forEach((e, i) => { if (e.mv) lastMove = i; });
      s = s.slice(lastMove + 1);
      const span = s.length > 1 ? s[s.length - 1].t - s[0].t : 0;
      if (span < NEED || s.length < NEED * 2) return { ready: false, progress: clamp(span / NEED, 0, 1) };
      const ts = s.map((e) => e.t);
      const axes = ["x", "y", "z"];
      const means = axes.map((a) => Math.abs(mean(s.map((e) => e[a]))));
      const gravity = axes[means.indexOf(Math.max(...means))];
      let power = 0;
      for (const a of axes) {
        if (a === gravity) continue; // keep the two horizontal axes
        const x = resample(ts, s.map((e) => e[a]), FS, ts[0], ts[ts.length - 1]);
        power += bandIntegral(welch(x, FS, 64), 0.1, 1.0);
      }
      const lp = Math.log10(Math.max(power, 1e-9));
      const steadiness = Math.round(clamp((100 * (-2 - lp)) / (-2 - -5), 0, 100));
      const label = steadiness >= 70 ? "Very steady" : steadiness >= 45 ? "Steady" : steadiness >= 25 ? "Some wobble" : "Unsteady";
      return { ready: true, progress: 1, power, steadiness, label };
    }

    // ---- Temperature ----
    temperature() {
      const d = this.latest;
      const out = { ok: false };
      if (!d || !d.temp || !d.temp.ok || d.temp.c == null) return out;
      out.ok = true; out.c = d.temp.c; out.f = d.temp.f;
      out.onSkin = out.c >= 28;
      const t = this.now();
      const w = this.temp.filter((e) => e.t >= t - 120);
      const span = w.length > 1 ? w[w.length - 1].t - w[0].t : 0;
      out.slopeProgress = clamp(span / 30, 0, 1);
      if (span >= 30) {
        out.slope = linreg(w.map((e) => e.t), w.map((e) => e.v)).slope * 60; // per minute
        out.trend = out.slope <= -0.1 ? "cooling" : out.slope >= 0.05 ? "warming" : "stable";
      }
      return out;
    }

    // ---- Output 4 — Autonomic balance, and Composite Stress Index ----
    autonomic(heart, temp) {
      const h = heart.hrv;
      if (!h || !h.ready) return { ready: false, progress: h ? h.progress : 0 };
      const r = h.lfhf;
      const state = r < 1 ? "calm" : r <= 2 ? "balanced" : "stressed";
      const label = state === "calm" ? "Rest & recover mode" : state === "balanced" ? "Balanced" : "Alert / stress mode";
      let agree = null, confidence = "low-to-moderate";
      if (temp.trend) {
        if (state === "stressed" && temp.trend === "cooling") { agree = "Heart and skin temperature agree — a real stress response is likely."; confidence = "moderate"; }
        else if (state === "stressed") agree = "Heart pattern points to stress, but skin temperature does not confirm it yet.";
        else if (state === "calm" && temp.trend !== "cooling") { agree = "Heart and skin temperature agree — your body is calm."; confidence = "moderate"; }
        else if (temp.trend === "cooling") agree = "Skin is cooling while the heart looks calm — the room may be cold.";
        else agree = "Heart and skin temperature are consistent.";
      }
      // position on a calm ↔ stress slider (0..100)
      const pos = clamp((100 * (Math.log(r) - Math.log(0.3))) / (Math.log(5) - Math.log(0.3)), 0, 100);
      return { ready: true, state, label, ratio: r, position: Math.round(pos), agree, confidence };
    }

    stressIndex(brain, heart, motion) {
      const parts = [];
      const W = { tbr: 0.25, lfhf: 0.35, sway: 0.15, hf: 0.25 };
      const h = heart.hrv;
      if (!h || !h.ready) return { ready: false };
      parts.push({ w: W.lfhf, v: clamp((h.lfhf - 0.5) / (3 - 0.5), 0, 1), sign: 1 });
      parts.push({ w: W.hf, v: clamp(h.hfnu, 0, 1), sign: -1 });
      if (brain.ok && !brain.saturated) parts.push({ w: W.tbr, v: clamp((brain.tbr - 1) / (3 - 1), 0, 1), sign: 1 });
      if (motion.ok && motion.sway && motion.sway.ready) parts.push({ w: W.sway, v: 1 - motion.sway.steadiness / 100, sign: 1 });
      let raw = 0, lo = 0, hi = 0;
      for (const p of parts) { raw += p.sign * p.w * p.v; if (p.sign > 0) hi += p.w; else lo -= p.w; }
      const score = Math.round(clamp((100 * (raw - lo)) / (hi - lo), 0, 100));
      const label = score < 30 ? "Low" : score < 55 ? "Moderate" : score < 75 ? "Elevated" : "High";
      return { ready: true, score, label, inputs: parts.length };
    }

    // ---- Everything together ----
    compute() {
      const brain = this.brain();
      const heart = this.heart();
      const motion = this.motion();
      const temp = this.temperature();
      const autonomic = this.autonomic(heart, temp);
      const stress = this.stressIndex(brain, heart, motion);
      const res = { brain, heart, motion, temp, autonomic, stress, session: this.sessionSeconds() };
      res.summary = summarize(res);

      const t = this.now();
      if (t - this.lastHistT >= 5) {
        this.lastHistT = t;
        this.history.push({
          t: Math.round(this.sessionSeconds()),
          alertness: brain.ok ? brain.vigilance : null,
          focus: brain.ok ? brain.attention : null,
          stress: stress.ready ? stress.score : null,
          hr: heart.hr, spo2: heart.spo2, hrv: heart.rmssd,
          balance: autonomic.ready ? autonomic.ratio : null,
          steadiness: motion.sway && motion.sway.ready ? motion.sway.steadiness : null,
          temp: temp.ok ? temp.c : null,
        });
        if (this.history.length > 2880) this.history.shift(); // 4 hours
      }
      return res;
    }

    // alpha power average over recent data (used by the sensor check)
    currentAlpha() {
      const d = this.latest;
      return d && d.eeg && d.eeg.ok ? d.eeg.alpha : null;
    }

    setAlphaCheck(closed, open) {
      if (!(closed > 0)) { this.alphaCheck = { pct: 0, closed, open }; return this.alphaCheck; }
      this.alphaCheck = { pct: ((closed - open) / closed) * 100, closed, open };
      return this.alphaCheck;
    }
  }

  function trim(arr, t, seconds) { while (arr.length && arr[0].t < t - seconds) arr.shift(); }

  function summarize(r) {
    const bits = [];
    if (r.brain.ok) {
      const v = r.brain.vigLabel;
      bits.push(v === "Alert" ? "your brain looks alert and engaged" : v === "Relaxed" ? "your brain looks calm and relaxed" : v === "Drowsy" ? "your brain is showing signs of drowsiness" : "your brain looks very sleepy");
    }
    if (r.autonomic.ready) {
      bits.push(r.autonomic.state === "calm" ? "your body is in rest-and-recover mode" : r.autonomic.state === "balanced" ? "your body is balanced between calm and alert" : "your body is leaning towards a stress response");
    } else if (r.heart.hr != null) {
      bits.push(`your heart rate is ${r.heart.hrLabel.toLowerCase()}`);
    }
    if (r.motion.ok && r.motion.moving) bits.push("you are moving around");
    if (!bits.length) return "Waiting for readings from your device…";
    const s = bits.length === 1 ? bits[0] : bits.slice(0, -1).join(", ") + " and " + bits[bits.length - 1];
    return s.charAt(0).toUpperCase() + s.slice(1) + ".";
  }

  window.BioEngine = Engine;
})();
