(function () {
  "use strict";

  const API_BASE = "/api";
  const POLL_MS = 2000;
  const STATE = {
    session: null,
    question: null,
    timer: null,
    players: [],
    teams: [],
    leaderboard: [],
    polling: null,
    currentScreen: "waiting",
  };

  const els = {
    connection: document.getElementById("connection-indicator"),
    connectionLabel: document.querySelector("#connection-indicator .label"),

    statusPill: document.getElementById("display-status-pill"),

    screenWaiting: document.getElementById("screen-waiting"),
    screenQuestion: document.getElementById("screen-question"),
    screenReveal: document.getElementById("screen-reveal"),
    screenLeaderboard: document.getElementById("screen-leaderboard"),
    screenEnd: document.getElementById("screen-end"),

    waitingCode: document.getElementById("waiting-code"),
    waitingQr: document.getElementById("waiting-qr"),
    waitingQrImage: document.getElementById("waiting-qr-image"),
    waitingQrPlaceholder: document.getElementById("waiting-qr-placeholder"),
    waitingUrl: document.getElementById("waiting-url"),
    waitingPlayersCount: document.getElementById("waiting-players-count"),

    questionProgressValue: document.getElementById("question-progress-value"),
    questionPointsValue: document.getElementById("question-points-value"),
    questionHintBadge: document.getElementById("question-hint-badge"),
    hintBadgeLabel: document.getElementById("hint-badge-label"),
    questionImageWrap: document.getElementById("question-image-wrap"),
    questionImage: document.getElementById("question-image"),
    questionDescription: document.getElementById("question-description"),
    hintsList: document.getElementById("hints-list"),
    questionOptions: document.getElementById("question-options"),
    timerValue: document.getElementById("timer-value"),
    timerRingFill: document.getElementById("timer-ring-fill"),

    revealAnswer: document.getElementById("reveal-answer"),
    revealReference: document.getElementById("reveal-reference"),

    leaderboardTitle: document.getElementById("leaderboard-title"),
    displayLeaderboard: document.getElementById("display-leaderboard"),

    endWinner: document.getElementById("end-winner"),
    endSub: document.getElementById("end-sub"),
    displayLeaderboardFinal: document.getElementById("display-leaderboard-final"),
  };

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

  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function api(path, options) {
    const opts = options || {};
    const res = await fetch(API_BASE + path, {
      method: opts.method || "GET",
      headers: Object.assign(
        { Accept: "application/json" },
        opts.body ? { "Content-Type": "application/json" } : {}
      ),
      credentials: "same-origin",
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }

    if (!res.ok) {
      if (res.status === 401) {
        window.location.replace("/admin-login");
        return { success: false };
      }
      const message = (data && data.message) || "تعذر تنفيذ العملية.";
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  async function ensureViewerSession() {
    try {
      const res = await fetch(API_BASE + "/auth/session", {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!res.ok) {
        window.location.replace("/admin-login");
        return false;
      }

      const data = await res.json().catch(function () { return null; });
      if (!data || !data.success || (data.role !== "admin" && data.role !== "viewer")) {
        window.location.replace("/admin-login");
        return false;
      }

      return true;
    } catch (e) {
      window.location.replace("/admin-login");
      return false;
    }
  }

  function showScreen(name) {
    if (STATE.currentScreen === name) return;
    STATE.currentScreen = name;

    const screens = {
      waiting: els.screenWaiting,
      question: els.screenQuestion,
      reveal: els.screenReveal,
      leaderboard: els.screenLeaderboard,
      end: els.screenEnd,
    };

    Object.keys(screens).forEach(function (key) {
      const el = screens[key];
      if (!el) return;
      if (key === name) {
        el.hidden = false;
        el.style.animation = "none";
        void el.offsetWidth;
        el.style.animation = "";
      } else {
        el.hidden = true;
      }
    });
  }

  function setStatusPill(state, label) {
    if (!els.statusPill) return;
    els.statusPill.dataset.state = state;
    els.statusPill.textContent = label;
  }

  function renderWaiting() {
    const s = STATE.session;
    if (!s) return;

    if (els.waitingCode) els.waitingCode.textContent = s.code || "------";

    if (s.qrDataUrl) {
      if (els.waitingQrImage) {
        els.waitingQrImage.src = s.qrDataUrl;
        els.waitingQrImage.hidden = false;
      }
      if (els.waitingQrPlaceholder) els.waitingQrPlaceholder.hidden = true;
    } else {
      if (els.waitingQrImage) {
        els.waitingQrImage.hidden = true;
        els.waitingQrImage.removeAttribute("src");
      }
      if (els.waitingQrPlaceholder) els.waitingQrPlaceholder.hidden = false;
    }

    if (s.joinUrl) {
      if (els.waitingUrl) {
        els.waitingUrl.textContent = s.joinUrl;
        els.waitingUrl.hidden = false;
      }
    } else if (els.waitingUrl) {
      els.waitingUrl.hidden = true;
    }

    if (els.waitingPlayersCount) {
      els.waitingPlayersCount.textContent = formatNumber(STATE.players.length);
    }
  }

  function renderQuestion() {
    const q = STATE.question;
    const s = STATE.session;
    if (!q || !s) return;

    if (els.questionProgressValue) {
      els.questionProgressValue.textContent = (q.order || 0) + " / " + (s.totalQuestions || "—");
    }

    if (els.questionPointsValue) {
      els.questionPointsValue.textContent = String(q.currentPoints != null ? q.currentPoints : q.basePoints || 10);
    }

    const revealed = q.revealedHints || [];
    if (els.questionHintBadge) {
      if (revealed.length === 0) {
        els.questionHintBadge.dataset.state = "idle";
        if (els.hintBadgeLabel) els.hintBadgeLabel.textContent = "لم يُتاح تلميح بعد";
      } else {
        els.questionHintBadge.dataset.state = "active";
        if (els.hintBadgeLabel) {
          els.hintBadgeLabel.textContent = "التلميحات المتاحة (" + revealed.length + ")";
        }
      }
    }

    if (els.hintsList) {
      els.hintsList.innerHTML = "";
      revealed.forEach(function (hint) {
        const li = document.createElement("li");
        li.textContent = hint;
        els.hintsList.appendChild(li);
      });
    }

    if (q.imageUrl && els.questionImage && els.questionImageWrap) {
      els.questionImage.src = q.imageUrl;
      els.questionImageWrap.hidden = false;
    } else if (els.questionImageWrap) {
      els.questionImageWrap.hidden = true;
    }

    if (els.questionDescription) {
      els.questionDescription.textContent = q.description || "اختر الإجابة الصحيحة على هاتفك.";
    }

    if (els.questionOptions) {
      els.questionOptions.innerHTML = "";
      const options = q.options || [];
      options.forEach(function (opt) {
        const div = document.createElement("div");
        div.className = "display-option";
        div.dataset.state = "idle";
        if (q.status === "revealed" && q.correctAnswer && opt === q.correctAnswer) {
          div.dataset.state = "correct";
        }
        div.textContent = opt;
        els.questionOptions.appendChild(div);
      });
    }
  }

  function renderTimer() {
    const t = STATE.timer;
    if (!t || !t.total) {
      if (els.timerValue) els.timerValue.textContent = "--";
      if (els.timerRingFill) {
        els.timerRingFill.style.strokeDashoffset = "326.7";
        els.timerRingFill.removeAttribute("data-state");
      }
      return;
    }

    const now = Date.now();
    let remaining = 0;

    if (t.status === "running" && t.endsAt) {
      remaining = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
    } else if (t.status === "paused" && t.remainingMs) {
      remaining = Math.max(0, Math.ceil(t.remainingMs / 1000));
    }

    if (els.timerValue) els.timerValue.textContent = String(remaining);

    const circumference = 326.7;
    const pct = Math.min(1, Math.max(0, remaining / t.total));
    const offset = circumference * (1 - pct);

    if (els.timerRingFill) {
      els.timerRingFill.style.strokeDashoffset = String(offset);
      if (pct <= 0.2) els.timerRingFill.dataset.state = "danger";
      else if (pct <= 0.5) els.timerRingFill.dataset.state = "warning";
      else els.timerRingFill.removeAttribute("data-state");
    }
  }

  function renderReveal() {
    const q = STATE.question;
    if (!q) return;
    if (els.revealAnswer) els.revealAnswer.textContent = q.correctAnswer || q.answer || "—";
    if (els.revealReference) {
      els.revealReference.textContent = q.reference ? "المرجع: " + q.reference : "";
    }
  }

  function renderLeaderboard(target, data) {
    if (!target) return;
    target.innerHTML = "";

    if (!data || data.length === 0) {
      const li = document.createElement("li");
      li.textContent = "لا يوجد ترتيب بعد.";
      target.appendChild(li);
      return;
    }

    data.forEach(function (entry, i) {
      const rank = i + 1;
      const rankClass = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "";
      const li = document.createElement("li");
      li.innerHTML =
        '<span class="rank ' + rankClass + '">' + rank + "</span>" +
        '<span class="name">' + escapeHtml(entry.name) + "</span>" +
        '<span class="score">' + formatNumber(entry.score || 0) + "</span>";
      target.appendChild(li);
    });
  }

  function renderEnd() {
    const data = STATE.leaderboard || [];
    if (data.length > 0) {
      if (els.endWinner) els.endWinner.textContent = data[0].name;
      if (els.endSub) {
        els.endSub.textContent = "برصيد " + formatNumber(data[0].score || 0) + " نقطة";
      }
    } else {
      if (els.endWinner) els.endWinner.textContent = "—";
      if (els.endSub) els.endSub.textContent = "شكرًا لمشاركتكم";
    }
    renderLeaderboard(els.displayLeaderboardFinal, data);
  }

  function decideScreen() {
    const s = STATE.session;
    const q = STATE.question;

    if (!s || !s.id) {
      setStatusPill("waiting", "بانتظار البدء");
      showScreen("waiting");
      return;
    }

    if (s.status === "ended") {
      setStatusPill("ended", "انتهت اللعبة");
      renderEnd();
      showScreen("end");
      return;
    }

    if (!q) {
      setStatusPill("waiting", "بانتظار البدء");
      renderWaiting();
      showScreen("waiting");
      return;
    }

    if (q.status === "revealed" || q.status === "committed") {
      setStatusPill("revealed", "الإجابة مكشوفة");
      renderReveal();
      showScreen("reveal");
      return;
    }

    if (q.status === "moved") {
      setStatusPill("active", "الترتيب");
      renderLeaderboard(els.displayLeaderboard, STATE.leaderboard);
      showScreen("leaderboard");
      return;
    }

    if (s.status === "waiting") {
      setStatusPill("waiting", "بانتظار اللاعبين");
      renderWaiting();
      showScreen("waiting");
      return;
    }

    setStatusPill("active", "السؤال " + (q.order || ""));
    renderQuestion();
    renderTimer();
    showScreen("question");
  }

  async function loadState() {
    try {
      const data = await api("/game/viewer-state");
      STATE.session = (data && data.session) || null;
      STATE.question = (data && data.question) || null;
      STATE.timer = (data && data.timer) || null;
      STATE.players = (data && data.players) || [];
      STATE.teams = (data && data.teams) || [];
      STATE.leaderboard = (data && data.leaderboard) || [];
      decideScreen();
    } catch (e) {
    }
  }

  function startPolling() {
    if (STATE.polling) clearInterval(STATE.polling);
    STATE.polling = setInterval(function () {
      if (!document.hidden) loadState();
    }, POLL_MS);
  }

  function startTimerTicker() {
    setInterval(function () {
      if (STATE.timer && STATE.timer.status === "running" && STATE.currentScreen === "question") {
        renderTimer();
      }
    }, 500);
  }

  async function init() {
    const ok = await ensureViewerSession();
    if (!ok) return;

    initConnectionWatcher();
    await loadState();
    startPolling();
    startTimerTicker();

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) loadState();
    });

    window.addEventListener("focus", function () { loadState(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
