(function () {
  "use strict";

  const API_BASE = "/api";
  const POLL_MS = 2000;
  const STATE = {
    session: null,
    question: null,
    timer: null,
    players: [],
    leaderboard: [],
    polling: null,
    currentScreen: "waiting",
    loading: false,
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
    waitingPlayersCount: document.getElementById("waiting-players-count"),

    questionProgressValue: document.getElementById("question-progress-value"),
    questionPointsValue: document.getElementById("question-points-value"),
    questionHintBadge: document.getElementById("question-hint-badge"),
    hintBadgeLabel: document.getElementById("hint-badge-label"),
    displayQuestionText: document.getElementById("display-question-text"),
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

    controls: document.getElementById("display-controls"),
    ctrlStartTimer: document.getElementById("ctrl-start-timer"),
    ctrlPauseTimer: document.getElementById("ctrl-pause-timer"),
    ctrlResumeTimer: document.getElementById("ctrl-resume-timer"),
    ctrlNextHint: document.getElementById("ctrl-next-hint"),
    ctrlRevealAnswer: document.getElementById("ctrl-reveal-answer"),
    ctrlCommitRound: document.getElementById("ctrl-commit-round"),
    ctrlNextQuestion: document.getElementById("ctrl-next-question"),
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
      return new Intl.NumberFormat("en-US").format(n);
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
        opts.body ? { "Content-Type": "application/json" } : {},
        opts.headers || {}
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
      error.data = data;
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

  function toast(message, type) {
    const div = document.createElement("div");
    div.style.cssText =
      "position:fixed;bottom:20px;left:20px;z-index:600;padding:12px 16px;border-radius:14px;font-family:inherit;font-size:0.9rem;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.4);transition:opacity .2s;";
    if (type === "error") {
      div.style.background = "rgba(239,68,68,0.15)";
      div.style.border = "1px solid rgba(239,68,68,0.5)";
      div.style.color = "#fca5a5";
    } else if (type === "success") {
      div.style.background = "rgba(16,185,129,0.15)";
      div.style.border = "1px solid rgba(16,185,129,0.5)";
      div.style.color = "#6ee7b7";
    } else if (type === "warning") {
      div.style.background = "rgba(245,158,11,0.15)";
      div.style.border = "1px solid rgba(245,158,11,0.5)";
      div.style.color = "#fcd34d";
    } else {
      div.style.background = "rgba(30,36,88,0.9)";
      div.style.border = "1px solid rgba(255,255,255,0.12)";
      div.style.color = "#f8fafc";
    }
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(function () {
      div.style.opacity = "0";
      setTimeout(function () {
        if (div.parentNode) div.parentNode.removeChild(div);
      }, 220);
    }, 2800);
  }

  function openHintModal() {
    const q = STATE.question;
    if (!q) return;
    if ((q.type || "who-am-i") !== "who-am-i") {
      toast("التلميحات متاحة فقط لأسئلة «من أنا؟».", "warning");
      return;
    }

    const players = STATE.players || [];

    const overlay = document.createElement("div");
    overlay.className = "display-modal-overlay";

    const optionsHtml =
      '<p class="display-modal-text">كيف تريد إتاحة التلميح التالي؟</p>' +
      '<div class="display-modal-field">' +
        '<label>' +
          '<input type="radio" name="hint-target" value="all" checked /> ' +
          'للجميع (تلميح عام)' +
        '</label>' +
      '</div>' +
      '<div class="display-modal-field">' +
        '<label>' +
          '<input type="radio" name="hint-target" value="player" ' + (players.length === 0 ? "disabled" : "") + ' /> ' +
          'لشخص معين (تلميح خاص)' +
        '</label>' +
      '</div>' +
      '<div class="display-modal-field">' +
        '<label>اختر اللاعب</label>' +
        '<select class="display-modal-select" id="hint-player-select" disabled>' +
          players.map(function (p) {
            return '<option value="' + p.id + '">' + escapeHtml(p.nickname) + "</option>";
          }).join("") +
        "</select>" +
      "</div>";

    overlay.innerHTML =
      '<div class="display-modal" role="dialog" aria-modal="true">' +
        '<h3 class="display-modal-title">إتاحة التلميح التالي</h3>' +
        '<div class="display-modal-body">' + optionsHtml + '</div>' +
        '<div class="display-modal-actions">' +
          '<button type="button" class="display-modal-btn display-modal-btn-ghost" data-role="cancel">إلغاء</button>' +
          '<button type="button" class="display-modal-btn display-modal-btn-primary" data-role="confirm">إتاحة التلميح</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(overlay);

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    overlay.querySelector('[data-role="cancel"]').addEventListener("click", close);

    const select = overlay.querySelector("#hint-player-select");
    const radios = overlay.querySelectorAll('input[name="hint-target"]');
    radios.forEach(function (r) {
      r.addEventListener("change", function () {
        if (select) select.disabled = r.value !== "player" || !r.checked;
      });
    });

    overlay.querySelector('[data-role="confirm"]').addEventListener("click", async function () {
      const target = overlay.querySelector('input[name="hint-target"]:checked');
      const mode = target ? target.value : "all";
      const playerId = mode === "player" && select ? select.value : null;

      close();

      try {
        if (playerId) {
          await api("/game/hint/next", {
            method: "POST",
            body: { playerId: playerId },
          });
        } else {
          await api("/game/hint/next", { method: "POST" });
        }
        await loadState();
      } catch (e) {
        toast(e.message || "تعذر إتاحة التلميح.", "error");
      }
    });
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

    if (els.waitingPlayersCount) {
      els.waitingPlayersCount.textContent = formatNumber(STATE.players.length);
    }
  }

  function buildOptionsForQuestion(q) {
    const type = q.type || "who-am-i";
    if (type === "true-false") {
      return ["صح", "خطأ"];
    }
    return Array.isArray(q.options) ? q.options : [];
  }

  function isCorrectOption(q, opt) {
    const type = q.type || "who-am-i";
    if (type === "true-false") {
      if (typeof q.correctAnswerBool === "boolean") {
        return (q.correctAnswerBool && opt === "صح") || (!q.correctAnswerBool && opt === "خطأ");
      }
      if (q.correctAnswer === "true") return opt === "صح";
      if (q.correctAnswer === "false") return opt === "خطأ";
      return false;
    }
    return !!q.correctAnswer && opt === q.correctAnswer;
  }

  function renderQuestion() {
    const q = STATE.question;
    const s = STATE.session;
    if (!q || !s) return;

    const type = q.type || "who-am-i";

    if (els.questionProgressValue) {
      els.questionProgressValue.textContent = (q.order || 0) + " / " + (s.totalQuestions || "—");
    }

    if (els.questionPointsValue) {
      els.questionPointsValue.textContent = String(q.currentPoints != null ? q.currentPoints : q.basePoints || 10);
    }

    if (els.displayQuestionText) {
      els.displayQuestionText.textContent = q.question || "—";
    }

    const revealed = q.revealedHints || [];
    const isWhoAmI = type === "who-am-i";

    if (els.questionHintBadge) {
      if (!isWhoAmI) {
        els.questionHintBadge.hidden = true;
      } else {
        els.questionHintBadge.hidden = false;
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
    }

    if (els.hintsList) {
      els.hintsList.innerHTML = "";
      if (isWhoAmI) {
        revealed.forEach(function (hint) {
          const li = document.createElement("li");
          li.textContent = hint;
          els.hintsList.appendChild(li);
        });
      }
    }

    if (els.questionOptions) {
      els.questionOptions.innerHTML = "";
      const options = buildOptionsForQuestion(q);
      const showCorrect = q.status === "revealed";

      options.forEach(function (opt) {
        const div = document.createElement("div");
        div.className = "display-option";
        div.dataset.state = "idle";
        if (showCorrect && isCorrectOption(q, opt)) {
          div.dataset.state = "correct";
        }
        div.textContent = opt;
        els.questionOptions.appendChild(div);
      });

      els.questionOptions.dataset.type = type;
    }
  }

  function renderTimer() {
    const t = STATE.timer;
    const q = STATE.question;

    if (!q) {
      if (els.timerValue) els.timerValue.textContent = "--";
      if (els.timerRingFill) {
        els.timerRingFill.style.strokeDashoffset = "326.7";
        els.timerRingFill.removeAttribute("data-state");
      }
      return;
    }

    const total = (t && t.total) || q.timeLimit || 0;
    if (!total) {
      if (els.timerValue) els.timerValue.textContent = "--";
      if (els.timerRingFill) {
        els.timerRingFill.style.strokeDashoffset = "326.7";
        els.timerRingFill.removeAttribute("data-state");
      }
      return;
    }

    const now = Date.now();
    let remaining = total;

    if (t && t.status === "running" && t.endsAt) {
      remaining = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
    } else if (t && t.status === "paused" && t.remainingMs) {
      remaining = Math.max(0, Math.ceil(t.remainingMs / 1000));
    } else if (t && t.status === "ended") {
      remaining = 0;
    }

    if (els.timerValue) els.timerValue.textContent = String(remaining);

    const circumference = 326.7;
    const pct = Math.min(1, Math.max(0, remaining / total));
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

    const type = q.type || "who-am-i";
    let display = "—";

    if (type === "true-false") {
      if (typeof q.correctAnswerBool === "boolean") {
        display = q.correctAnswerBool ? "صح" : "خطأ";
      } else if (q.correctAnswer === "true" || q.correctAnswer === "false") {
        display = q.correctAnswer === "true" ? "صح" : "خطأ";
      }
    } else {
      display = q.correctAnswer || q.answer || "—";
    }

    if (els.revealAnswer) els.revealAnswer.textContent = display;
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
      if (rank <= 3) li.classList.add("top-three");
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

  function renderControls() {
    if (!els.controls) return;
    if (!STATE.session || !STATE.session.id) {
      els.controls.hidden = true;
      return;
    }
    els.controls.hidden = false;

    const q = STATE.question;
    const status = q ? (q.status || "idle") : null;
    const isWhoAmI = q && (q.type || "who-am-i") === "who-am-i";
    const finalized = STATE.session && STATE.session.finalized === true;

    const canStartTimer = !finalized && (status === "idle" || status === "shown");
    const canPause = !finalized && status === "running";
    const canResume = !finalized && status === "paused";
    const canNextHint = !finalized && !!q && isWhoAmI && (q.revealedHints || []).length < (q.hints || []).length && status !== "revealed" && status !== "committed";
    const canReveal = !finalized && !!q && status !== "revealed" && status !== "committed" && status !== "moved";
    const canCommit = !finalized && !!q && status === "revealed" && !q.committed;
    const canNext = !finalized && !!q && status === "committed";

    if (els.ctrlStartTimer) els.ctrlStartTimer.disabled = !canStartTimer;
    if (els.ctrlPauseTimer) els.ctrlPauseTimer.disabled = !canPause;
    if (els.ctrlResumeTimer) els.ctrlResumeTimer.disabled = !canResume;
    if (els.ctrlNextHint) els.ctrlNextHint.disabled = !canNextHint;
    if (els.ctrlRevealAnswer) els.ctrlRevealAnswer.disabled = !canReveal;
    if (els.ctrlCommitRound) els.ctrlCommitRound.disabled = !canCommit;
    if (els.ctrlNextQuestion) els.ctrlNextQuestion.disabled = !canNext;
  }

  function decideScreen() {
    const s = STATE.session;
    const q = STATE.question;

    if (!s || !s.id) {
      setStatusPill("waiting", "بانتظار البدء");
      showScreen("waiting");
      renderControls();
      return;
    }

    if (s.finalized || s.status === "ended") {
      setStatusPill("ended", "انتهت اللعبة");
      renderEnd();
      showScreen("end");
      renderControls();
      return;
    }

    if (!q) {
      setStatusPill("waiting", "بانتظار البدء");
      renderWaiting();
      showScreen("waiting");
      renderControls();
      return;
    }

    if (q.status === "revealed") {
      setStatusPill("revealed", "الإجابة مكشوفة");
      renderReveal();
      showScreen("reveal");
      renderControls();
      return;
    }

    if (q.status === "committed" || q.status === "moved") {
      setStatusPill("active", "الترتيب");
      renderLeaderboard(els.displayLeaderboard, STATE.leaderboard);
      showScreen("leaderboard");
      renderControls();
      return;
    }

    if (s.status === "waiting") {
      setStatusPill("waiting", "بانتظار اللاعبين");
      renderWaiting();
      showScreen("waiting");
      renderControls();
      return;
    }

    setStatusPill("active", "السؤال " + (q.order || ""));
    renderQuestion();
    renderTimer();
    showScreen("question");
    renderControls();
  }

  async function loadState() {
    try {
      const data = await api("/game/viewer-state");
      STATE.session = (data && data.session) || null;
      STATE.question = (data && data.question) || null;
      STATE.timer = (data && data.timer) || null;
      STATE.players = (data && data.players) || [];
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
      if (STATE.currentScreen === "question") renderTimer();
    }, 500);
  }

  async function ctrlStartTimer() {
    try {
      await api("/game/timer/start", { method: "POST" });
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر بدء المؤقت.", "error");
    }
  }

  async function ctrlPauseTimer() {
    try {
      await api("/game/timer/pause", { method: "POST" });
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر إيقاف المؤقت.", "error");
    }
  }

  async function ctrlResumeTimer() {
    try {
      await api("/game/timer/resume", { method: "POST" });
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر استئناف المؤقت.", "error");
    }
  }

  async function ctrlRevealAnswer() {
    if (!window.confirm("هل تريد إظهار الإجابة الصحيحة الآن لجميع اللاعبين؟")) return;
    try {
      await api("/game/question/reveal", { method: "POST" });
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر إظهار الإجابة.", "error");
    }
  }

  async function ctrlCommitRound() {
    if (!window.confirm("هل تريد اعتماد نتيجة هذا السؤال وتثبيت النقاط؟")) return;
    try {
      await api("/game/question/commit", { method: "POST" });
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر اعتماد النتيجة.", "error");
    }
  }

  async function ctrlNextQuestion() {
    try {
      await api("/game/question/next", { method: "POST" });
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر الانتقال للسؤال التالي.", "error");
    }
  }

  function bindControls() {
    if (els.ctrlStartTimer) els.ctrlStartTimer.addEventListener("click", ctrlStartTimer);
    if (els.ctrlPauseTimer) els.ctrlPauseTimer.addEventListener("click", ctrlPauseTimer);
    if (els.ctrlResumeTimer) els.ctrlResumeTimer.addEventListener("click", ctrlResumeTimer);
    if (els.ctrlNextHint) els.ctrlNextHint.addEventListener("click", openHintModal);
    if (els.ctrlRevealAnswer) els.ctrlRevealAnswer.addEventListener("click", ctrlRevealAnswer);
    if (els.ctrlCommitRound) els.ctrlCommitRound.addEventListener("click", ctrlCommitRound);
    if (els.ctrlNextQuestion) els.ctrlNextQuestion.addEventListener("click", ctrlNextQuestion);
  }

  async function init() {
    const ok = await ensureViewerSession();
    if (!ok) return;

    initConnectionWatcher();
    bindControls();
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