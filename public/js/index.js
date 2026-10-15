(function () {
  "use strict";

  const API_BASE = "/api";

  const els = {
    connection: document.getElementById("connection-indicator"),
    connectionLabel: document.querySelector("#connection-indicator .label"),
    statPlayers: document.getElementById("stat-players"),
    statSessions: document.getElementById("stat-sessions"),
    footerYear: document.getElementById("footer-year"),
  };

  function setYear() {
    if (els.footerYear) {
      els.footerYear.textContent = String(new Date().getFullYear());
    }
  }

  function setConnectionState(state) {
    if (!els.connection) return;
    els.connection.dataset.state = state;
    if (els.connectionLabel) {
      els.connectionLabel.textContent = state === "online" ? "متصل" : "غير متصل";
    }
  }

  function initConnectionWatcher() {
    function update() {
      setConnectionState(navigator.onLine ? "online" : "offline");
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  }

  function formatNumber(n) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    try {
      return new Intl.NumberFormat("ar-EG").format(n);
    } catch (e) {
      return String(n);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch(API_BASE + "/game/public-stats", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("stats failed");
      const data = await res.json();
      if (els.statPlayers) {
        els.statPlayers.textContent = formatNumber(Number(data.activePlayers) || 0);
      }
      if (els.statSessions) {
        els.statSessions.textContent = formatNumber(Number(data.activeSessions) || 0);
      }
    } catch (e) {
      if (els.statPlayers) els.statPlayers.textContent = "—";
      if (els.statSessions) els.statSessions.textContent = "—";
    }
  }

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function (e) {
        const id = link.getAttribute("href");
        if (!id || id === "#") return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function init() {
    setYear();
    initConnectionWatcher();
    initSmoothScroll();
    fetchStats();
    setInterval(fetchStats, 30000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();