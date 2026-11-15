/* BioSense — app: routing, access code, connection, sensor check and live rendering */
(function () {
  "use strict";
  const CFG = window.BIOSENSE_CONFIG || {};
  const engine = new window.BioEngine();
  const link = new window.BioDevice.DeviceLink();
  const { sparkline, multiLine, scope, fmtT } = window.BioCharts;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---------- tiny storage wrappers (storage can be blocked) ----------
  const mem = {};
  const store = {
    get(k, session) { try { return (session ? sessionStorage : localStorage).getItem(k); } catch (e) { return mem[k] ?? null; } },
    set(k, v, session) { try { (session ? sessionStorage : localStorage).setItem(k, v); } catch (e) { mem[k] = v; } },
    del(k, session) { try { (session ? sessionStorage : localStorage).removeItem(k); } catch (e) { delete mem[k]; } },
  };

  // ---------- DOM binding helpers ----------
  const B = (k, v) => $$(`[data-b="${k}"]`).forEach((el) => { const s = String(v); if (el.textContent !== s) el.textContent = s; });
  const T = (k, tone) => $$(`[data-t="${k}"]`).forEach((el) => { el.dataset.tone = tone; });
  const W = (k, pct) => $$(`[data-w="${k}"]`).forEach((el) => { el.style.width = clampPct(pct) + "%"; });
  const V = (k, show) => $$(`[data-v="${k}"]`).forEach((el) => el.classList.toggle("hidden", !show));
  const S = (k, pct) => $$(`[data-s="${k}"]`).forEach((el) => {
    if (pct == null || !isFinite(pct)) { el.classList.add("off"); return; }
    el.classList.remove("off"); el.style.left = clampPct(pct) + "%";
  });
  const CIRC = 2 * Math.PI * 44;
  const R = (k, frac) => $$(`[data-r="${k}"]`).forEach((el) => {
    el.style.strokeDasharray = CIRC; el.style.strokeDashoffset = CIRC * (1 - Math.max(0, Math.min(1, frac || 0)));
  });
  const clampPct = (p) => Math.max(0, Math.min(100, Number(p) || 0));
  const setIcon = (sel, id) => $$(sel).forEach((el) => { const u = el.querySelector("use"); if (u && u.getAttribute("href") !== "#" + id) u.setAttribute("href", "#" + id); });

  // ---------- theme ----------
  function syncThemeIcon() { setIcon("#themeBtn", document.documentElement.dataset.theme === "light" ? "i-moon" : "i-sun"); }
  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next; store.set("bs-theme", next); syncThemeIcon(); render(true);
  });
  syncThemeIcon();

  // ---------- routing ----------
  const SHELL = ["dashboard", "brain", "heart", "body", "learn"];
  const NEEDS_LINK = ["dashboard", "brain", "heart", "body", "check"];
  const NAMES = { landing: "Monitor", login: "Access", connect: "Connect", check: "Sensor check", dashboard: "Overview", brain: "Brain", heart: "Heart", body: "Body", learn: "Learn" };
  const authed = () => store.get("bs-auth", true) === "1";
  let current = "landing";

  function route() {
    let r = location.hash.replace(/^#\/?/, "");
    let anchor = null;
    if (r === "how") { anchor = "how"; r = ""; }
    let name = r === "" ? "landing" : r;
    if (!NAMES[name]) name = "landing";
    if (name !== "landing" && name !== "login" && !authed()) { location.hash = "#/login"; return; }
    if (name === "login" && authed()) { location.hash = link.mode ? "#/dashboard" : "#/connect"; return; }
    if (NEEDS_LINK.includes(name) && !link.mode) { location.hash = "#/connect"; return; }

    current = name;
    $$(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    const inShell = SHELL.includes(name);
    $("#shell").classList.toggle("hidden", !inShell);
    $("#bottomnav").classList.toggle("hidden", !inShell);
    $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
    $("#lockBtn").classList.toggle("hidden", !authed());
    B("page-name", NAMES[name]);
    document.title = name === "landing" ? "BioSense Monitor" : `${NAMES[name]} · BioSense`;

    if (name === "landing") { startScope(); if (anchor) setTimeout(() => $("#" + anchor)?.scrollIntoView({ behavior: "smooth" }), 30); else window.scrollTo(0, 0); }
    else { stopScope(); window.scrollTo(0, 0); }
    if (name === "login") setTimeout(() => $("#pw").focus(), 50);
    if (name === "connect") enterConnect();
    if (name === "check") enterCheck();
    if (inShell) render(true);
  }
  window.addEventListener("hashchange", route);

  // ---------- 2. access code ----------
  $("#loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const pw = $("#pw").value;
    if (pw === String(CFG.password ?? "")) {
      store.set("bs-auth", "1", true); $("#pw").value = ""; $("#pwErr").textContent = "";
      location.hash = "#/connect";
    } else {
      $("#pwErr").textContent = pw ? "That code is not right. Please try again." : "Please type the access code.";
      const card = $("#loginForm"); card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      $("#pw").select();
    }
  });
  $("#pwReveal").addEventListener("click", () => {
    const i = $("#pw"); const show = i.type === "password"; i.type = show ? "text" : "password";
    $("#pwReveal").textContent = show ? "Hide" : "Show";
  });
  $("#lockBtn").addEventListener("click", () => {
    link.stop(); engine.reset(); store.del("bs-auth", true); location.hash = "#/";
  });

  // ---------- 3. connect ----------
  function enterConnect() {
    V("https-warn", location.protocol === "https:");
    const ip = $("#ip");
    if (!ip.value) ip.value = store.get("bs-ip") || CFG.defaultDeviceIP || "";
    $("#sensorCard").classList.toggle("hidden", !link.mode);
    $("#connectCard").classList.toggle("hidden", !!link.mode);
    updateSensorList();
  }

  $("#connectBtn").addEventListener("click", connectDevice);
  $("#ip").addEventListener("keydown", (e) => { if (e.key === "Enter") connectDevice(); });

  async function connectDevice() {
    const btn = $("#connectBtn"), err = $("#ipErr"), ip = $("#ip").value.trim();
    err.textContent = "";
    if (!ip) { err.textContent = "Please type the device address first."; return; }
    btn.disabled = true; btn.textContent = "Connecting…";
    try {
      await link.test(ip);
      store.set("bs-ip", ip);
      engine.reset();
      link.startDevice(ip);
      B("found-title", "Device connected");
      showSensors();
    } catch (e) {
      const blocked = location.protocol === "https:";
      err.textContent = e && e.name === "AbortError"
        ? "No answer from that address. Check the device is switched on and on the same Wi-Fi as this computer."
        : e && e.message && !/fetch|network|load/i.test(e.message)
          ? e.message
          : blocked
            ? "The browser blocked the connection because this page is on https. Open index.html directly from your computer."
            : "Could not reach the device. Check the address and that both are on the same Wi-Fi.";
    } finally { btn.disabled = false; btn.textContent = "Connect"; }
  }

  $("#demoBtn").addEventListener("click", () => {
    engine.reset(); link.startDemo(); B("found-title", "Demo device connected"); showSensors();
  });
  function showSensors() {
    $("#connectCard").classList.add("hidden"); $("#sensorCard").classList.remove("hidden"); updateSensorList();
  }
  function disconnect() { link.stop(); engine.reset(); sparks.clear(); }
  $("#changeDevBtn").addEventListener("click", () => { disconnect(); enterConnect(); });
  $("#disconnectBtn").addEventListener("click", () => { disconnect(); location.hash = "#/connect"; });

  function updateSensorList() {
    const d = engine.latest;
    const set = (k, tone, text) => { T(k, tone); B(k, text); };
    if (!d) { ["s-eeg", "s-ppg", "s-imu", "s-temp"].forEach((k) => set(k, "info", "Waiting…")); return; }
    if (d.eeg && d.eeg.ok) set("s-eeg", d.eeg.saturated ? "warn" : "good", d.eeg.saturated ? "Check electrodes" : "Working");
    else set("s-eeg", "info", "Warming up…");
    if (d.ppg && d.ppg.hr_bpm != null) set("s-ppg", d.ppg.simulated && link.mode === "device" ? "warn" : "good", d.ppg.simulated && link.mode === "device" ? "Sample data" : "Working");
    else set("s-ppg", "info", "Waiting…");
    set("s-imu", d.imu && d.imu.ok ? "good" : "bad", d.imu && d.imu.ok ? "Working" : "Not found");
    set("s-temp", d.temp && d.temp.ok ? "good" : "bad", d.temp && d.temp.ok ? "Working" : "Not found");
  }

  // connection chip
  link.onStatus = (s) => updateConn(s);
  function updateConn(s) {
    const chip = $("#connChip");
    chip.classList.toggle("hidden", !link.mode);
    const map = { live: ["good", link.mode === "demo" ? "Demo live" : "Live"], retrying: ["warn", "Reconnecting…"], lost: ["bad", "Connection lost"], idle: ["muted", "Not connected"] };
    const [tone, text] = map[s] || map.idle;
    T("conn", tone); B("conn-text", text);
  }

  // ---------- 4. sensor check (eyes closed vs open) ----------
  const check = { running: false, phase: null, closed: [], open: [], t0: 0, timer: null };
  const PHASE_LEN = 10;

  function enterCheck() {
    if (check.running) return;
    resetCheckUI();
  }
  function resetCheckUI() {
    B("check-count", "20"); R("check", 0);
    B("check-instr", "Sit comfortably and press Start.");
    B("check-sub", "We will beep when it is time to open your eyes.");
    V("check-result", false);
    $("#checkStart").classList.remove("hidden");
    $("#checkStart").innerHTML = '<svg class="ic sm"><use href="#i-eye"/></svg> Start check';
    $("#checkDone").classList.toggle("hidden", !engine.alphaCheck);
  }
  $("#checkStart").addEventListener("click", () => {
    beep.init();
    check.running = true; check.phase = "closed"; check.closed = []; check.open = []; check.t0 = performance.now();
    link.setEyesClosed(true);
    $("#checkStart").classList.add("hidden"); $("#checkDone").classList.add("hidden"); V("check-result", false);
    B("check-instr", "Close your eyes and relax…"); B("check-sub", "Keep still. You will hear a beep in 10 seconds.");
    beep();
    clearInterval(check.timer);
    check.timer = setInterval(tickCheck, 100);
  });
  function tickCheck() {
    const el = (performance.now() - check.t0) / 1000;
    const left = Math.max(0, 2 * PHASE_LEN - el);
    B("check-count", Math.ceil(left)); R("check", el / (2 * PHASE_LEN));
    if (check.phase === "closed" && el >= PHASE_LEN) {
      check.phase = "open"; link.setEyesClosed(false); beep();
      B("check-instr", "Open your eyes and look at the screen"); B("check-sub", "Keep your eyes open and stay still.");
    }
    if (el >= 2 * PHASE_LEN) finishCheck();
  }
  function sampleCheck() {
    if (!check.running) return;
    const a = engine.currentAlpha();
    if (a == null) return;
    const el = (performance.now() - check.t0) / 1000;
    if (check.phase === "closed" && el >= 2) check.closed.push(a);
    if (check.phase === "open" && el >= PHASE_LEN + 2) check.open.push(a);
  }
  function finishCheck() {
    clearInterval(check.timer); check.running = false; link.setEyesClosed(false); beep();
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    V("check-result", true);
    $("#checkStart").classList.remove("hidden");
    $("#checkStart").innerHTML = '<svg class="ic sm"><use href="#i-refresh"/></svg> Try again';
    if (check.closed.length < 3 || check.open.length < 3) {
      T("check-res", "bad");
      B("check-result", "The brain sensor did not send enough data. Wait a few seconds for it to warm up, then try again.");
      B("check-instr", "Check incomplete"); B("check-sub", "");
      return;
    }
    const res = engine.setAlphaCheck(avg(check.closed), avg(check.open));
    const pct = Math.round(res.pct);
    if (res.pct >= 20) {
      T("check-res", "good");
      B("check-result", `Passed: your calm rhythm dropped ${pct}% when you opened your eyes. The brain sensor is working well.`);
      B("check-instr", "All good!");
    } else {
      T("check-res", "warn");
      B("check-result", `Weak result: only a ${Math.max(pct, 0)}% drop. Press the electrodes firmly onto clean skin and try again, or continue. Brain readings will be marked as less reliable.`);
      B("check-instr", "Sensor contact may be poor");
    }
    B("check-sub", "");
    $("#checkDone").classList.remove("hidden");
  }
  $("#checkDone").addEventListener("click", () => { location.hash = "#/dashboard"; });
  $("#checkSkip").addEventListener("click", () => {
    if (check.running) { clearInterval(check.timer); check.running = false; link.setEyesClosed(false); }
    location.hash = "#/dashboard";
  });

  function beep() {
    try {
      const ctx = beep.ctx; if (!ctx) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
    } catch (e) { /* sound is optional */ }
  }
  beep.init = () => { try { if (!beep.ctx) beep.ctx = new (window.AudioContext || window.webkitAudioContext)(); beep.ctx.resume?.(); } catch (e) {} };

  // ---------- live data ----------
  link.onData = (d) => {
    engine.ingest(d);
    sampleCheck();
    if (current === "connect") updateSensorList();
    render();
  };

  const sparks = {
    data: { hr: [], spo2: [], hrv: [], temp: [], motion: [], pace: [] }, last: 0,
    push(r) {
      const now = performance.now(); if (now - this.last < 1000) return; this.last = now;
      const add = (k, v) => { const a = this.data[k]; a.push(v ?? null); if (a.length > 60) a.shift(); };
      add("hr", r.heart.hr); add("spo2", r.heart.spo2); add("hrv", r.heart.rmssd);
      add("temp", r.temp.ok ? r.temp.c : null); add("motion", r.motion.ok ? r.motion.noise : null);
      add("pace", r.brain.ok ? r.brain.centroid : null);
    },
    clear() { for (const k in this.data) this.data[k] = []; },
  };

  let lastRender = 0;
  function render(force) {
    const now = performance.now();
    if (!force && now - lastRender < 450) return;
    lastRender = now;
    if (!link.mode || !engine.latest) return;
    const r = engine.compute();
    sparks.push(r);
    const { brain: b, heart: h, motion: m, temp: tp, autonomic: a, stress: s } = r;

    B("summary", r.summary);
    B("session", fmtT(r.session));
    V("demo", link.mode === "demo");
    V("simulated", h.simulated && link.mode === "device");

    // --- stress ---
    if (s.ready) {
      B("stress-score", s.score); B("stress-label", s.label);
      T("stress", s.score < 30 ? "good" : s.score < 55 ? "info" : s.score < 75 ? "warn" : "bad");
      R("stress", s.score / 100); V("stress-progress", false);
      const src = ["heart rhythm"];
      if (b.ok && !b.saturated) src.push("brain focus");
      if (m.sway && m.sway.ready) src.push("balance");
      B("stress-note", "Combines your " + (src.length > 1 ? src.slice(0, -1).join(", ") + " and " + src[src.length - 1] : src[0]) + " into one number.");
    } else {
      const p = Math.round((h.hrv?.progress || 0) * 100);
      B("stress-score", "--"); B("stress-label", "Collecting"); T("stress", "muted"); R("stress", 0);
      V("stress-progress", true); W("stress-progress", p);
      B("stress-note", h.hrv?.flat ? "Heart rhythm is too even to read. Check the finger sensor." : `Reading your heart rhythm (${p}%). Sit still for about a minute.`);
    }

    // --- brain ---
    if (b.ok) {
      B("vig", b.vigilance); B("vig-label", b.vigLabel); W("vig", b.vigilance); S("vig", b.vigilance);
      B("att", b.attention); B("att-label", b.attLabel); W("att", b.attention);
      B("pace", b.centroid.toFixed(1)); S("pace", ((b.centroid - 5) / 15) * 100);
      B("pace-word", b.centroid >= 12 ? "Fast" : b.centroid >= 8 ? "Medium" : "Slow"); B("pace-label", b.paceLabel);
      B("vig-explain", {
        Alert: "Your brain is dominated by fast, active rhythms: you are awake and switched on.",
        Relaxed: "A balanced mix of rhythms: awake, but calm and unhurried.",
        Drowsy: "Slow rhythms are growing. You may be getting tired. Consider a short break.",
        "Very drowsy": "Slow, sleep-like rhythms dominate. Avoid tasks that need full attention, like driving.",
      }[b.vigLabel]);
      const bd = b.bands;
      [["b-d", bd.d], ["b-t", bd.t], ["b-a", bd.a], ["b-b", bd.b], ["b-g", bd.g]].forEach(([k, v]) => { B(k, Math.round(v) + "%"); W(k, v); });
      T("conf", b.confidence === "good" ? "good" : b.confidence === "low" ? "warn" : "muted"); B("conf-text", b.confidenceText);
      const tr = { rising: ["i-up", "Focus is improving"], falling: ["i-down", "Focus may be dipping"], steady: ["i-flat", "Focus is holding steady"] }[b.trend];
      if (tr) { setIcon("[data-trend-icon]", tr[0]); B("trend-text", tr[1]); B("trend-sub", `Over the last ${Math.max(2, b.trendMinutes)} minutes · low-to-moderate confidence`); }
      else { setIcon("[data-trend-icon]", "i-flat"); B("trend-text", "Building a trend…"); B("trend-sub", "Needs about 2 minutes of brain data."); }
    } else {
      ["vig", "att", "pace"].forEach((k) => B(k, "--"));
      B("vig-label", b.warming ? "Warming up" : "No signal"); B("att-label", "—"); B("pace-word", "—"); B("pace-label", "—");
      W("vig", 0); W("att", 0); S("vig", null); S("pace", null);
      T("conf", "muted"); B("conf-text", "Brain sensor warming up");
    }
    V("eeg-warming", !b.ok); V("eeg-sat", b.ok && b.saturated); V("eeg-nocheck", b.ok && !engine.alphaCheck);
    const ac = engine.alphaCheck;
    if (ac) { B("asm", Math.max(0, Math.round(ac.pct))); B("asm-label", ac.pct >= 20 ? "Passed" : "Weak"); T("asm", ac.pct >= 20 ? "good" : "warn"); }
    else { B("asm", "--"); B("asm-label", "Not done"); T("asm", "muted"); }

    // --- heart ---
    if (h.hr != null) { B("hr", h.hr); B("hr-label", h.hrLabel); T("hr", h.hrLabel === "Normal" ? "good" : "warn"); S("hr", ((h.hr - 40) / 100) * 100); }
    else { B("hr", "--"); B("hr-label", "Waiting"); T("hr", "muted"); S("hr", null); }
    if (h.spo2 != null) { B("spo2", h.spo2); B("spo2-label", h.spo2Label); T("spo2", h.spo2 >= 95 ? "good" : h.spo2 >= 90 ? "warn" : "bad"); S("spo2", ((h.spo2 - 85) / 15) * 100); }
    else { B("spo2", "--"); B("spo2-label", "Waiting"); T("spo2", "muted"); S("spo2", null); }
    if (h.rmssd != null) {
      B("hrv", h.rmssd); B("hrv-tag", h.rmssd < 20 ? "Low" : h.rmssd <= 50 ? "Typical" : "High"); T("hrv", h.rmssd < 20 ? "warn" : "good"); S("hrv", h.rmssd);
      B("hrv-label", `${h.rmssdLabel}. More variation between beats usually means a rested, recovered body.`);
    } else { B("hrv", "--"); B("hrv-tag", "Collecting"); T("hrv", "muted"); S("hrv", null); }

    if (a.ready) {
      B("auto-label", a.label); S("auto", a.position); W("auto", Math.max(a.position, 4)); V("auto-progress", false);
      T("auto", a.state === "calm" ? "good" : a.state === "balanced" ? "info" : "bad");
      B("auto-conf", a.confidence + " confidence");
      B("auto-progress-text", `Balance reading ${a.ratio.toFixed(2)}: under 1 is calm, 1 to 2 is balanced, over 2 leans towards stress.` + (h.hrv.source === "estimated" ? " Estimated from heart-rate readings." : ""));
      B("auto-agree", a.agree || "Your skin temperature trend is still being measured. It is used to double-check this reading.");
    } else {
      const p = Math.round((a.progress || 0) * 100);
      B("auto-label", "Collecting…"); S("auto", null); W("auto", 0); T("auto", "muted"); V("auto-progress", true); W("auto-progress", p);
      B("auto-conf", "waiting");
      B("auto-progress-text", h.hrv?.flat ? "Heart rhythm is too even to read. Check the finger sensor." : `Listening to your heartbeat pattern (${p}%). This needs about a minute of data.`);
    }

    // --- motion ---
    if (m.ok) {
      B("activity", m.activity); B("moving", m.moving ? "Moving" : "Still"); T("moving", m.moving ? "warn" : "good");
      const g = (v) => (v >= 0 ? "+" : "") + v.toFixed(2) + " g";
      B("ax", g(m.x)); B("ay", g(m.y)); B("az", g(m.z)); B("tilt", Math.round(m.tiltDeg) + "°");
      const sw = m.sway;
      if (sw && sw.ready) {
        B("steady", sw.steadiness); B("steady-label", sw.label); W("steady", sw.steadiness); S("steady", sw.steadiness);
        V("sway-progress", false); B("sway-note", "Measured from your natural sway over the last 30 seconds.");
      } else {
        const p = Math.round((sw?.progress || 0) * 100);
        B("steady", "--"); B("steady-label", sw?.moving ? "Moving" : "Hold still"); W("steady", 0); S("steady", null);
        V("sway-progress", !sw?.moving); W("sway-progress", p);
        B("sway-note", sw?.moving ? "You are moving. Stand still to measure your balance." : `Hold still… ${p}%`);
      }
    } else {
      B("activity", "Sensor not found"); B("moving", "—"); T("moving", "muted");
      ["ax", "ay", "az", "tilt", "steady"].forEach((k) => B(k, "--")); B("steady-label", "—"); S("steady", null);
      V("sway-progress", false); B("sway-note", "The motion sensor is not connected.");
    }

    // --- temperature ---
    if (tp.ok) {
      B("temp", tp.c.toFixed(1)); B("tempf", tp.f.toFixed(1) + " °F"); S("temp", ((tp.c - 26) / 12) * 100); V("offskin", !tp.onSkin);
      if (tp.trend) {
        const map = {
          cooling: ["info", "Cooling", "Cooling down", "i-down", "Your skin is cooling. This can happen during stress, or simply in a cold room."],
          warming: ["warn", "Warming", "Warming up", "i-up", "Your skin is warming up. This is common when relaxing or recovering after stress."],
          stable: ["good", "Stable", "Steady", "i-flat", "Your skin temperature is steady. Nothing unusual."],
        }[tp.trend];
        T("ttrend", map[0]); B("ttrend", map[1]); B("ttrend-big", map[2]); setIcon("[data-ttrend-icon]", map[3]); B("ttrend-explain", map[4]);
        B("tslope", `${tp.slope >= 0 ? "+" : ""}${tp.slope.toFixed(2)} °C per minute`);
      } else {
        T("ttrend", "muted"); B("ttrend", "Measuring"); B("ttrend-big", "Measuring…");
        B("tslope", `${Math.round(tp.slopeProgress * 100)}% (needs 30 seconds)`);
      }
    } else {
      B("temp", "--"); B("tempf", "-- °F"); S("temp", null); V("offskin", false);
      T("ttrend", "muted"); B("ttrend", "No sensor"); B("ttrend-big", "Sensor not found"); B("tslope", "--");
    }

    drawCharts();
  }

  function drawCharts() {
    const sp = sparks.data;
    if (current === "dashboard") {
      sparkline($('[data-spark="hr"]'), sp.hr, "--ppg", { minSpan: 6 });
      sparkline($('[data-spark="spo2"]'), sp.spo2, "--ppg", { minSpan: 3 });
      sparkline($('[data-spark="hrv"]'), sp.hrv, "--ppg", { minSpan: 10 });
      sparkline($('[data-spark="temp"]'), sp.temp, "--temp", { minSpan: 0.4 });
      sparkline($('[data-spark="motion"]'), sp.motion, "--imu", { min: 0, minSpan: 0.05 });
      sparkline($('[data-spark="pace"]'), sp.pace, "--eeg", { minSpan: 2 });
    }
    const hist = engine.history;
    const times = hist.map((x) => x.t);
    const col = (k) => hist.map((x) => x[k]);
    const c = $(`[data-chart="${current === "dashboard" ? "overview" : current}"]`);
    if (!c) return;
    if (current === "dashboard") multiLine(c, times, [
      { values: col("alertness"), color: "--eeg", min: 0, max: 100 },
      { values: col("stress"), color: "--ppg", min: 0, max: 100 },
      { values: col("hr"), color: "--imu", min: 40, max: 140 },
    ]);
    if (current === "brain") multiLine(c, times, [
      { values: col("alertness"), color: "--eeg", min: 0, max: 100 },
      { values: col("focus"), color: "--primary", min: 0, max: 100 },
    ]);
    if (current === "heart") multiLine(c, times, [
      { values: col("hr"), color: "--ppg" },
      { values: col("hrv"), color: "--imu", min: 0, max: 100 },
    ]);
    if (current === "body") multiLine(c, times, [
      { values: col("temp"), color: "--temp" },
      { values: col("steadiness"), color: "--imu", min: 0, max: 100 },
    ]);
  }
  window.addEventListener("resize", () => render(true));

  // ---------- export ----------
  $("#exportBtn").addEventListener("click", () => {
    const cols = [["t", "seconds"], ["alertness", "alertness_0_100"], ["focus", "focus_0_100"], ["stress", "stress_level_0_100"],
      ["hr", "heart_rate_bpm"], ["spo2", "blood_oxygen_pct"], ["hrv", "recovery_hrv_ms"], ["balance", "body_balance_reading"],
      ["steadiness", "steadiness_0_100"], ["temp", "skin_temp_c"]];
    const lines = [cols.map((c) => c[1]).join(",")];
    for (const row of engine.history) lines.push(cols.map(([k]) => (row[k] == null ? "" : typeof row[k] === "number" ? +row[k].toFixed(3) : row[k])).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `biosense-session-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  // ---------- landing scope animation ----------
  let scopeRaf = null;
  const SCOPE_ROWS = [
    { color: "--eeg", fn: (x, t) => 0.55 * Math.sin(2 * Math.PI * (x * 9 + t * 1.3)) + 0.3 * Math.sin(2 * Math.PI * (x * 23 - t * 2.1)) + 0.15 * Math.sin(2 * Math.PI * (x * 51 + t * 3)) },
    { color: "--ppg", fn: (x, t) => { const p = (((x * 4 - t * 1.2) % 1) + 1) % 1; return 0.7 - 1.6 * (Math.exp(-(((p - 0.2) / 0.06) ** 2)) + 0.35 * Math.exp(-(((p - 0.42) / 0.07) ** 2))); } },
    { color: "--imu", fn: (x, t) => 0.45 * Math.sin(2 * Math.PI * (x * 2 + t * 0.4)) + 0.08 * Math.sin(x * 140 + t * 9) },
    { color: "--temp", fn: (x, t) => 0.25 * Math.sin(2 * Math.PI * (x * 0.7 + t * 0.05)) },
  ];
  function startScope() {
    if (scopeRaf) return;
    const canvas = $("#scopeCanvas");
    const loop = (ts) => { scope(canvas, SCOPE_ROWS, ts / 1000); scopeRaf = requestAnimationFrame(loop); };
    scopeRaf = requestAnimationFrame(loop);
  }
  function stopScope() { if (scopeRaf) cancelAnimationFrame(scopeRaf); scopeRaf = null; }

  // ---------- learn content (plain English, no formulas) ----------
  const LEARN = [
    ["m-eeg", "Brainwave breakdown", "The foundation of every brain reading",
      "Your raw brain signal is like a messy chord played on a piano. We work out which individual notes (rhythms) are playing and how loudly.",
      "You never see this directly, but it is why a low-cost headband can give a clean, stable reading instead of random static."],
    ["m-eeg", "Brainwave mix", "How much of each brainwave type",
      "Once we know which rhythms are playing, we add them up into five groups: slow, sleepy ones (deep rest, dreamy) through to fast, alert ones (thinking, intense).",
      "This is the idea behind the \"focus\" and \"calm\" scores on meditation headbands and the deep-sleep percentage on sleep trackers."],
    ["m-eeg", "Brainwave pace", "One number for how alert your brain is",
      "Instead of watching five groups, this squeezes everything into one number: the \"centre of gravity\" of your brain activity. Higher means faster, more alert activity.",
      "Drowsy-driver warning systems in cars use this kind of single trend line."],
    ["m-eeg", "Alertness", "Awake and sharp, or drifting towards sleep?",
      "We combine the brainwave mix with the brainwave pace. Using two views of the same signal protects you from a misleading reading caused by noise in either one.",
      "Shown on your Overview and Brain pages, with a note on whether the sensor check passed."],
    ["m-eeg", "Focus", "A popular but debated attention score",
      "Compares \"daydreaming\" rhythms with \"concentrating\" rhythms. A shift towards daydreaming rhythms may mean attention is wandering.",
      "Common in attention-training apps. Newer research questions how reliable it is, so we show it as a trend, not a verdict."],
    ["m-eeg", "Sensor check", "Making sure the brain sensor is working",
      "A healthy brain shows a strong calm rhythm with eyes closed, which drops when the eyes open. We measure how much it drops.",
      "Every EEG lab uses this check. If the drop does not appear, the usual cause is a poor electrode connection, not the person."],
    ["m-ppg", "Heart rate", "Your smartwatch's heart rate number",
      "A small light shines into your skin and reads each pulse of blood, then counts beats per minute.",
      "The same number shown on fitness watches and rings."],
    ["m-ppg", "Recovery and body mode", "The \"stress\" and \"recovery\" score",
      "Your heartbeat does not tick like a clock. The gaps between beats constantly stretch and shrink, and that pattern shows whether your body is in \"rest and digest\" or \"fight or flight\" mode.",
      "This is behind the stress, recovery and readiness scores on fitness wearables. Doctors also use heart-rhythm variation as a health marker."],
    ["m-imu", "Steadiness", "Balance and wobble",
      "The motion sensor measures the tiny, almost invisible wobbles you make while just standing still.",
      "Used in balance and fall-risk checks for older adults. More slow wobble is linked to a higher chance of falling."],
    ["m-temp", "Skin temperature trend", "A supporting stress clue",
      "When stress kicks in, blood vessels near the skin tighten and the skin cools within minutes. We track how fast your skin is warming or cooling.",
      "This is why \"cold hands\" is a real stress sign. A cold room can cause the same effect, so it is never used on its own."],
    ["m-ppg", "Stress level", "Everything combined into one score",
      "Blends the focus score, your heart-rhythm pattern, your steadiness and your calm-body signal into one simple 0–100 number.",
      "This is how a wearable turns lots of messy sensor data into the single \"Stress: 62/100\" you glance at."],
  ];
  $("#learnGrid").innerHTML = LEARN.map(([m, title, tag, what, life]) => `
    <div class="card learn-item ${m}">
      <div class="row" style="margin-bottom:6px"><span class="dot"></span><h3>${title}</h3></div>
      <div class="tag">${tag}</div>
      <p>${what}</p>
      <div class="life"><b>In real life:</b> ${life}</div>
    </div>`).join("");

  // ---------- go ----------
  route();
})();
