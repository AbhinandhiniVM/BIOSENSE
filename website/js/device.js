/*
  BioSense — device connection
  Talks to the ESP32 (heartwifi.ino) at http://<IP>/data, or runs a built-in demo
  that produces the same JSON shape.
*/
(function () {
  "use strict";
  const CFG = window.BIOSENSE_CONFIG || {};

  function dataUrl(input) {
    let s = String(input || "").trim();
    if (!s) return null;
    s = s.replace(/^https?:\/\//i, "").replace(/\/+$/, "").replace(/\/data$/i, "");
    return "http://" + s + "/data";
  }

  async function fetchJson(url, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  // ---------------- demo simulator ----------------
  const PHASES = [
    { name: "focused", eeg: [20, 22, 16, 28, 14], ibi: 760, lf: 26, hf: 20, temp: 0.0, sway: 0.006 },
    { name: "relaxed", eeg: [22, 16, 36, 18, 8], ibi: 900, lf: 18, hf: 38, temp: 0.08, sway: 0.004 },
    { name: "drowsy", eeg: [34, 32, 15, 13, 6], ibi: 980, lf: 22, hf: 30, temp: 0.03, sway: 0.008 },
    { name: "stressed", eeg: [18, 12, 10, 42, 18], ibi: 640, lf: 34, hf: 12, temp: -0.18, sway: 0.012 },
  ];
  const PHASE_SEC = 120;

  class Simulator {
    constructor() {
      this.start = performance.now();
      this.eyesClosed = false;
      this.beatT = 0; this.beats = 0; this.ibis = [];
      this.eeg = PHASES[0].eeg.slice(); this.lastEegSec = -1;
      this.spo2 = 98; this.tempC = 33.4; this.lastT = 0;
      this.moveUntil = -1;
    }
    phaseAt(t) { return PHASES[Math.floor(t / PHASE_SEC) % PHASES.length]; }

    next() {
      const t = (performance.now() - this.start) / 1000;
      const ph = this.phaseAt(t);
      const dt = Math.max(0, t - this.lastT); this.lastT = t;

      // heart beats up to "now"
      while (this.beatT < t) {
        const ibi = ph.ibi + ph.lf * Math.sin(2 * Math.PI * 0.1 * this.beatT) +
          ph.hf * Math.sin(2 * Math.PI * 0.25 * this.beatT) + (Math.random() - 0.5) * 12;
        this.beatT += ibi / 1000; this.beats++;
        this.ibis.push(Math.round(ibi)); if (this.ibis.length > 30) this.ibis.shift();
      }
      const last5 = this.ibis.slice(-5);
      const hr = last5.length >= 3 ? 60000 / (last5.reduce((s, v) => s + v, 0) / last5.length) : null;
      let rmssd = null;
      if (this.ibis.length >= 8) {
        let s = 0; for (let i = 1; i < this.ibis.length; i++) s += (this.ibis[i] - this.ibis[i - 1]) ** 2;
        rmssd = Math.sqrt(s / (this.ibis.length - 1));
      }
      this.spo2 = 0.97 * this.spo2 + 0.03 * (97 + Math.random() * 2);

      // EEG updates once per second like the firmware
      const sec = Math.floor(t);
      if (sec !== this.lastEegSec) {
        this.lastEegSec = sec;
        const target = ph.eeg.slice();
        if (this.eyesClosed) { target[2] *= 2.4; }
        const noisy = target.map((v) => Math.max(0.5, v * (1 + (Math.random() - 0.5) * 0.25)));
        this.eeg = this.eeg.map((v, i) => 0.6 * v + 0.4 * noisy[i]);
      }
      const tot = this.eeg.reduce((s, v) => s + v, 0);
      const b = this.eeg.map((v) => (100 * v) / tot);

      // IMU — gravity on Z, small postural sway, occasional movement
      if (this.moveUntil < t && Math.random() < 0.0015) this.moveUntil = t + 4;
      const moving = t < this.moveUntil;
      const amp = moving ? 0.25 : ph.sway;
      const n = () => (Math.random() - 0.5) * 0.004;
      const x = 0.03 + amp * Math.sin(2 * Math.PI * 0.3 * t) + (moving ? (Math.random() - 0.5) * 0.4 : 0) + n();
      const y = -0.02 + amp * 0.7 * Math.sin(2 * Math.PI * 0.45 * t + 1) + (moving ? (Math.random() - 0.5) * 0.4 : 0) + n();
      const z = 0.985 + (moving ? (Math.random() - 0.5) * 0.3 : 0) + n();

      // skin temperature drifts by phase
      this.tempC += (ph.temp / 60) * dt + (Math.random() - 0.5) * 0.004;
      this.tempC = Math.max(30.5, Math.min(35.5, this.tempC));

      return {
        uptime_ms: Math.round(t * 1000),
        ppg: {
          simulated: true, hr_bpm: hr ? Math.round(hr) : null, hrv_rmssd_ms: rmssd ? Math.round(rmssd) : null,
          spo2_pct: Math.round(this.spo2), ir: 120000, ibi_ms: this.ibis.slice(), beats: this.beats,
        },
        eeg: {
          ok: t > 3, delta: +b[0].toFixed(1), theta: +b[1].toFixed(1), alpha: +b[2].toFixed(1),
          beta: +b[3].toFixed(1), gamma: +b[4].toFixed(1), saturated: false,
        },
        imu: { ok: true, x_g: +x.toFixed(3), y_g: +y.toFixed(3), z_g: +z.toFixed(3), noise_sd_g: moving ? 0.18 : 0.004 + ph.sway, moving },
        temp: { ok: true, c: +this.tempC.toFixed(2), f: +(this.tempC * 9 / 5 + 32).toFixed(2) },
      };
    }
  }

  // ---------------- link ----------------
  class DeviceLink {
    constructor() {
      this.mode = null; // "device" | "demo"
      this.url = null; this.sim = null;
      this.running = false; this.fails = 0; this.status = "idle";
      this.onData = () => {}; this.onStatus = () => {};
    }

    async test(ip) {
      const url = dataUrl(ip);
      if (!url) throw new Error("Please type the device address first.");
      const d = await fetchJson(url, CFG.requestTimeoutMs || 2500);
      if (!d || typeof d.uptime_ms !== "number") throw new Error("That address answered, but it is not a BioSense device.");
      return d;
    }

    startDevice(ip) { this.stop(); this.mode = "device"; this.url = dataUrl(ip); this._run(); }
    startDemo() { this.stop(); this.mode = "demo"; this.sim = new Simulator(); this._run(); }

    stop() { this.running = false; clearTimeout(this.timer); this.mode = null; this.sim = null; this._set("idle"); }

    setEyesClosed(v) { if (this.sim) this.sim.eyesClosed = v; }

    _set(s) { if (s !== this.status) { this.status = s; this.onStatus(s); } }

    _run() {
      this.running = true; this.fails = 0;
      const tick = async () => {
        if (!this.running) return;
        const started = performance.now();
        try {
          const d = this.mode === "demo" ? this.sim.next() : await fetchJson(this.url, CFG.requestTimeoutMs || 2500);
          if (!this.running) return;
          this.fails = 0; this._set("live"); this.onData(d);
        } catch (e) {
          this.fails++;
          this._set(this.fails >= 12 ? "lost" : this.fails >= 2 ? "retrying" : this.status);
        }
        const wait = Math.max(30, (CFG.pollMs || 250) - (performance.now() - started));
        this.timer = setTimeout(tick, this.fails >= 2 ? 1000 : wait);
      };
      tick();
    }
  }

  window.BioDevice = { DeviceLink, dataUrl };
})();
