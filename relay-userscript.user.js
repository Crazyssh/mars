// ==UserScript==
// @name         Mars OTP Relay
// @namespace    mars-relay
// @version      1.2
// @description  Polling infoOrder dari browser (RDP/PC) + anti-throttle audio, kirim ke VPS Mars. Jalan di tab ditznesia.com.
// @match        https://ditznesia.com/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ====== KONFIGURASI — GANTI INI ======
  const VPS_INGEST_URL = "https://api.clowatch.com/api/ingest"; // domain VPS lo
  const INGEST_SECRET = "GANTI_DENGAN_SECRET_YANG_SAMA_DI_ENV"; // samain dengan INGEST_SECRET di .env VPS
  const ENDPOINT = "/orderv2?nomor=&status=&limit=100&page=1&action=infoOrder"; // endpoint infoOrder
  const POLL_INTERVAL_MS = 3000; // polling tiap 3 detik
  // ======================================

  let inflight = false;

  function log(...a) { console.log("[mars-relay]", ...a); }

  // ── Anti-throttle: bikin Chrome anggap tab "selalu aktif" ──
  // Chrome ngelambatin setInterval jadi ~1x/menit kalau tab di background.
  // Trik: putar audio silent (oscillator volume 0) terus-terusan → tab
  // dianggap "playing audio" → throttling dimatiin. Jadi polling tetep
  // jalan 3 detik walau Windows 365 disconnect / tab di-minimize.
  function keepAwake() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { log("AudioContext gak ada, skip anti-throttle"); return; }
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0; // volume 0 = bener-bener silent
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      // Resume kalau ke-suspend (autoplay policy)
      const resume = () => { if (ctx.state === "suspended") ctx.resume().catch(() => {}); };
      resume();
      setInterval(resume, 5000);
      // Resume juga pas ada interaksi user (kalau autoplay diblok)
      ["click", "keydown", "visibilitychange"].forEach((ev) =>
        document.addEventListener(ev, resume, { once: false })
      );
      log("anti-throttle audio aktif (tab gak akan ke-throttle)");
    } catch (e) {
      log("anti-throttle gagal:", e.message);
    }
  }

  async function pollOnce() {
    if (inflight) return;
    inflight = true;
    const t0 = performance.now();
    try {
      const res = await fetch(ENDPOINT, {
        headers: { "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
      });
      if (!res.ok) { log("fetch HTTP", res.status); return; }
      const text = await res.text();
      let orders;
      try { orders = JSON.parse(text); } catch { log("respons bukan JSON (cookie expired?)"); return; }
      if (!Array.isArray(orders)) { log("respons bukan array"); return; }
      const dur = Math.round(performance.now() - t0);
      sendToVps(orders, dur);
    } catch (e) {
      log("error", e.message);
    } finally {
      inflight = false;
    }
  }

  function sendToVps(orders, dur) {
    GM_xmlhttpRequest({
      method: "POST",
      url: VPS_INGEST_URL,
      headers: { "Content-Type": "application/json", "X-Ingest-Secret": INGEST_SECRET },
      data: JSON.stringify({ orders }),
      timeout: 30000,
      onload: function (r) {
        if (r.status === 200) log(`relay OK (${orders.length} orders, fetch ${dur}ms)`, r.responseText);
        else log("relay gagal HTTP", r.status, r.responseText);
      },
      onerror: function () { log("relay network error"); },
      ontimeout: function () { log("relay timeout"); },
    });
  }

  log("started — polling tiap", POLL_INTERVAL_MS, "ms → relay ke", VPS_INGEST_URL);
  keepAwake();
  setInterval(pollOnce, POLL_INTERVAL_MS);
  pollOnce();
})();
