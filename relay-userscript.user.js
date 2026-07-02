// ==UserScript==
// @name         Mars OTP Relay
// @namespace    mars-relay
// @version      1.7
// @description  Polling infoOrder overlap dari browser (RDP) + anti-throttle + auto-reload watchdog + deteksi & tunggu challenge CF (gak spam pas challenge), kirim ke VPS Mars. Jalan di tab ditznesia.com.
// @match        https://ditznesia.com/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ====== KONFIGURASI — GANTI INI ======
  const VPS_INGEST_URL = "https://api.clowatch.com/api/ingest"; // domain VPS lo
  const INGEST_SECRET = "f89041cf9f0079f90017483b1d5ec0f0733c718854e277c0"; // samain dengan INGEST_SECRET di .env VPS
  const ENDPOINT = "/orderv2?nomor=&status=&limit=100&page=1&action=infoOrder"; // endpoint infoOrder
  const POLL_INTERVAL_MS = 5000; // polling tiap 5 detik (samain kayak ditznesia, overlap)
  const MAX_INFLIGHT = 2; // max request barengan ke ditz (rendah = gak keliatan bot; RDP responsnya cepet jadi gak butuh banyak overlap)
  const STALL_RELOAD_MS = 90000; // kalau gak ada poll SUKSES selama 90 detik → reload tab otomatis
  const WATCHDOG_INTERVAL_MS = 10000; // cek kesehatan tiap 10 detik
  const CHALLENGE_RELOAD_AFTER = 5; // reload kalau 5x berturut respons bukan JSON (kena challenge CF)
  const GRACE_MS = 45000; // JANGAN reload dalam 45 detik pertama sejak load (anti reload-loop; kasih waktu ditz yg lemot + CF settle)
  // ======================================

  const pageLoadedAt = Date.now();
  let inflight = 0;
  let lastAppliedAt = 0; // timestamp poll terakhir yang ke-relay (anti stale)
  let lastSuccessAt = Date.now(); // timestamp poll SUKSES terakhir (buat watchdog auto-reload)
  let badStreak = 0; // hitung respons bukan-JSON berturut (indikasi challenge CF)
  let reloading = false;

  function doReload(reason) {
    if (reloading) return;
    // Grace period: jangan reload kalau halaman baru aja load. Ini nyegah
    // reload-loop pas ditznesia lagi lemot / CF masih proses challenge.
    const age = Date.now() - pageLoadedAt;
    if (age < GRACE_MS) {
      log(`${reason} — tapi baru load ${Math.round(age / 1000)}s, tunggu grace ${GRACE_MS / 1000}s dulu (anti loop)`);
      return;
    }
    reloading = true;
    log(reason + " → reload tab otomatis (browser bakal auto-solve challenge Cloudflare)");
    location.reload();
  }

  function log(...a) { console.log("[mars-relay]", ...a); }

  // ── Deteksi halaman challenge Cloudflare ──
  // Kalau lagi di halaman "Performing security verification / Just a moment",
  // browser HARUS dibiarin diem biar bisa jalanin JS challenge & lolos.
  // Kalau kita spam fetch/reload di sini, challenge gak akan pernah kelar
  // dan malah keliatan makin kayak bot. Jadi pas challenge kedeteksi:
  // STOP polling, STOP reload — tunggu browser solve, nanti CF auto-redirect.
  function isChallengePage() {
    const t = (document.title || "").toLowerCase();
    if (t.includes("just a moment") || t.includes("attention required")) return true;
    const b = (document.body && document.body.innerText || "").toLowerCase();
    if (b.includes("performing security verification")) return true;
    if (b.includes("verifies you are not a bot")) return true;
    if (b.includes("checking if the site connection is secure")) return true;
    // Elemen khas challenge CF
    if (document.getElementById("challenge-running")) return true;
    if (document.getElementById("cf-challenge-running")) return true;
    return false;
  }

  // ── Anti-throttle: bikin Chrome anggap tab "selalu aktif" ──
  // Chrome ngelambatin setInterval jadi ~1x/menit kalau tab di background.
  // Trik: putar audio silent (oscillator volume 0) terus-terusan → tab
  // dianggap "playing audio" → throttling dimatiin. Jadi polling tetep
  // jalan 5 detik walau Windows 365 disconnect / tab di-minimize.
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

  // ── Watchdog: reload tab otomatis kalau polling macet ──
  // Kalau udah STALL_RELOAD_MS gak ada poll sukses (tab ketutup/dibekukan,
  // cookie expired, atau kena challenge Cloudflare), reload halaman biar
  // sesi & cookie ke-refresh dan polling jalan lagi. Ini yang bikin lo gak
  // perlu refresh manual lagi.
  function watchdog() {
    if (reloading) return;
    // Lagi di halaman challenge? Jangan reload — biarin browser solve dulu.
    // Reset lastSuccessAt biar stall-timer gak numpuk selama nunggu challenge.
    if (isChallengePage()) {
      lastSuccessAt = Date.now();
      return;
    }
    const idle = Date.now() - lastSuccessAt;
    if (idle >= STALL_RELOAD_MS) {
      doReload(`macet ${Math.round(idle / 1000)}s tanpa poll sukses`);
    }
  }

  async function pollOnce() {
    // Lagi di halaman challenge CF? JANGAN fetch — biarin browser diem &
    // solve challenge-nya. Spam fetch di sini bikin challenge gak kelar.
    if (isChallengePage()) {
      if (!pollOnce._warned) { log("halaman challenge Cloudflare kedeteksi — pause polling, nunggu browser solve..."); pollOnce._warned = true; }
      return;
    }
    pollOnce._warned = false;
    // Overlap: jangan nunggu poll sebelumnya kelar (kayak ditznesia sendiri).
    // Tapi cap MAX_INFLIGHT biar gak numpuk tak terhingga kalau ditz mati.
    if (inflight >= MAX_INFLIGHT) return;
    inflight++;
    const startedAt = Date.now();
    const t0 = performance.now();
    try {
      const res = await fetch(ENDPOINT, {
        headers: { "x-requested-with": "XMLHttpRequest" },
        credentials: "include",
      });
      if (!res.ok) {
        log("fetch HTTP", res.status);
        // 403/503 = challenge Cloudflare. Hitung sbg respons buruk.
        if (res.status === 403 || res.status === 503) {
          if (++badStreak >= CHALLENGE_RELOAD_AFTER) doReload(`${badStreak}x HTTP ${res.status} (challenge CF)`);
        }
        return;
      }
      const text = await res.text();
      let orders;
      try {
        orders = JSON.parse(text);
      } catch {
        log("respons bukan JSON (cookie expired / challenge?)");
        if (++badStreak >= CHALLENGE_RELOAD_AFTER) doReload(`${badStreak}x respons bukan JSON`);
        return;
      }
      if (!Array.isArray(orders)) { log("respons bukan array"); return; }
      // Sampai sini = poll SUKSES (dapet data valid). Reset watchdog + streak.
      lastSuccessAt = Date.now();
      badStreak = 0;
      // Take-first: cuma relay kalau poll ini LEBIH BARU dari yg udah ke-relay.
      // Poll lama yang balik belakangan diabaikan (data udah keduluan yg baru).
      if (startedAt <= lastAppliedAt) { log("skip stale (keduluan poll lebih baru)"); return; }
      lastAppliedAt = startedAt;
      const dur = Math.round(performance.now() - t0);
      sendToVps(orders, dur);
    } catch (e) {
      log("error", e.message);
    } finally {
      inflight--;
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
  setInterval(watchdog, WATCHDOG_INTERVAL_MS);
  pollOnce();
})();
