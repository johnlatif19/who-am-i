(function () {
  "use strict";

  const API_BASE = "/api";
  const POLL_MS = 2500;

  const STATE = {
    session: null,
    question: null,
    timer: null,
    players: [],
    leaderboard: [],
    questions: [],
    quizzes: [],
    log: [],
    polling: null,
    loading: false,
  };

  const els = {
    connection: document.getElementById("connection-indicator"),
    connectionLabel: document.querySelector("#connection-indicator .label"),

    sessionBanner: document.getElementById("session-banner"),
    sessionBannerTitle: document.getElementById("session-banner-title"),
    sessionBannerSub: document.getElementById("session-banner-sub"),
    createSessionBtn: document.getElementById("create-session-btn"),

    startBanner: document.getElementById("start-banner"),
    startBannerTitle: document.getElementById("start-banner-title"),
    startBannerSub: document.getElementById("start-banner-sub"),
    startGameBtn: document.getElementById("start-game-btn"),

    sessionStatusBadge: document.getElementById("session-status-badge"),
    sessionCode: document.getElementById("session-code"),
    copyCodeBtn: document.getElementById("copy-code-btn"),
    sessionQrPlaceholder: document.getElementById("session-qr-placeholder"),
    sessionQrImage: document.getElementById("session-qr-image"),
    sessionJoinState: document.getElementById("session-join-state"),
    sessionPlayersCount: document.getElementById("session-players-count"),
    openJoinBtn: document.getElementById("open-join-btn"),
    closeJoinBtn: document.getElementById("close-join-btn"),
    endSessionBtn: document.getElementById("end-session-btn"),

    gameStatusBadge: document.getElementById("game-status-badge"),
    timerValue: document.getElementById("timer-value"),
    timerBarFill: document.getElementById("timer-bar-fill"),
    startTimerBtn: document.getElementById("start-timer-btn"),
    pauseTimerBtn: document.getElementById("pause-timer-btn"),
    resumeTimerBtn: document.getElementById("resume-timer-btn"),
    nextHintBtn: document.getElementById("next-hint-btn"),
    revealAnswerBtn: document.getElementById("reveal-answer-btn"),
    nextQuestionBtn: document.getElementById("next-question-btn"),
    finalizeSessionBtn: document.getElementById("finalize-session-btn"),

    roundQuestionIndex: document.getElementById("round-question-index"),
    roundHintsCount: document.getElementById("round-hints-count"),
    roundPointsValue: document.getElementById("round-points-value"),
    roundAnswersCount: document.getElementById("round-answers-count"),

    playersList: document.getElementById("players-list"),
    playersCountLabel: document.getElementById("players-count-label"),
    leaderboard: document.getElementById("leaderboard"),

    quizzesList: document.getElementById("quizzes-list"),
    addQuizBtn: document.getElementById("add-quiz-btn"),
    reloadQuizzesBtn: document.getElementById("reload-quizzes-btn"),

    questionsList: document.getElementById("questions-list"),
    addQuestionBtn: document.getElementById("add-question-btn"),
    reloadQuestionsBtn: document.getElementById("reload-questions-btn"),

    logList: document.getElementById("log-list"),
    clearLogBtn: document.getElementById("clear-log-btn"),

    logoutBtn: document.getElementById("logout-btn"),

    modalOverlay: document.getElementById("modal-overlay"),
    modalTitle: document.getElementById("modal-title"),
    modalBody: document.getElementById("modal-body"),
    modalFoot: document.getElementById("modal-foot"),
    modalCloseBtn: document.getElementById("modal-close-btn"),

    toastContainer: document.getElementById("toast-container"),
  };

  const QUESTION_TYPE_LABELS = {
    "who-am-i": "من أنا؟",
    "multiple-choice": "اختيار من متعدد",
    "true-false": "صح أو غلط",
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

  function formatTime(ts) {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (e) {
      return "";
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
        return { success: false, message: "انتهت الجلسة." };
      }
      const message = (data && data.message) || "تعذر تنفيذ العملية.";
      const error = new Error(message);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  async function ensureAdminSession() {
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
      if (!data || !data.success || data.role !== "admin") {
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
    if (!els.toastContainer) return;
    const div = document.createElement("div");
    div.className = "toast";
    div.dataset.type = type || "info";
    div.textContent = message;
    els.toastContainer.appendChild(div);
    setTimeout(function () {
      div.style.opacity = "0";
      div.style.transform = "translateY(10px)";
      setTimeout(function () {
        if (div.parentNode) div.parentNode.removeChild(div);
      }, 220);
    }, 3000);
  }

  function openModal(title, bodyHtml, footButtons) {
    if (!els.modalOverlay) return;
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = bodyHtml;
    els.modalFoot.innerHTML = "";

    (footButtons || []).forEach(function (btn) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn " + (btn.className || "btn-outline") + " btn-sm";
      b.textContent = btn.label;
      b.addEventListener("click", function () {
        if (typeof btn.onClick === "function") btn.onClick();
      });
      els.modalFoot.appendChild(b);
    });

    els.modalOverlay.hidden = false;
  }

  function closeModal() {
    if (!els.modalOverlay) return;
    els.modalOverlay.hidden = true;
    els.modalBody.innerHTML = "";
    els.modalFoot.innerHTML = "";
  }

  function confirmModal(title, message, onConfirm) {
    openModal(
      title,
      '<p class="confirm-text">' + escapeHtml(message) + "</p>",
      [
        { label: "إلغاء", className: "btn-outline", onClick: closeModal },
        {
          label: "تأكيد",
          className: "btn-danger",
          onClick: function () {
            closeModal();
            onConfirm();
          },
        },
      ]
    );
  }

  function renderLog() {
    if (!els.logList) return;
    els.logList.innerHTML = "";

    if (STATE.log.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-note";
      li.textContent = "لا توجد أحداث بعد.";
      els.logList.appendChild(li);
      return;
    }

    STATE.log.forEach(function (entry) {
      const li = document.createElement("li");
      li.className = "log-entry";
      li.dataset.type = entry.type || "info";
      li.innerHTML =
        '<span class="log-type">' + escapeHtml(entry.typeLabel || "معلومة") + "</span>" +
        "<span>" + escapeHtml(entry.message || "") + "</span>" +
        "<time>" + formatTime(entry.at) + "</time>";
      els.logList.appendChild(li);
    });
  }

  function pushLog(message, type) {
    const labels = { success: "نجاح", warning: "تحذير", error: "خطأ", info: "معلومة" };
    STATE.log.unshift({
      message: message,
      type: type || "info",
      typeLabel: labels[type] || "معلومة",
      at: Date.now(),
    });
    if (STATE.log.length > 100) STATE.log.pop();
    renderLog();
  }

  function renderSession() {
    const s = STATE.session;

    if (!s || !s.id) {
      if (els.sessionBanner) els.sessionBanner.hidden = false;
      if (els.startBanner) els.startBanner.hidden = true;
      if (els.sessionBannerTitle) els.sessionBannerTitle.textContent = "لا توجد جلسة نشطة";
      if (els.sessionBannerSub) els.sessionBannerSub.textContent = "ابدأ بإنشاء جلسة جديدة لبدء اللعبة.";
      if (els.sessionStatusBadge) {
        els.sessionStatusBadge.textContent = "غير نشطة";
        els.sessionStatusBadge.dataset.state = "idle";
      }
      if (els.sessionCode) els.sessionCode.textContent = "------";
      if (els.sessionQrPlaceholder) els.sessionQrPlaceholder.hidden = false;
      if (els.sessionQrImage) {
        els.sessionQrImage.hidden = true;
        els.sessionQrImage.removeAttribute("src");
      }
      if (els.sessionJoinState) els.sessionJoinState.textContent = "—";
      if (els.sessionPlayersCount) els.sessionPlayersCount.textContent = "0";
      toggleSessionControls(false);
      return;
    }

    if (els.sessionBanner) els.sessionBanner.hidden = true;

    if (els.sessionCode) els.sessionCode.textContent = s.code || "------";
    if (els.sessionJoinState) els.sessionJoinState.textContent = s.joinOpen ? "مفتوح" : "مغلق";
    if (els.sessionPlayersCount) els.sessionPlayersCount.textContent = formatNumber(STATE.players.length);

    const hasQuestions = (s.totalQuestions || 0) > 0;

    if (els.startBanner) {
      if (!hasQuestions && s.status !== "ended") {
        els.startBanner.hidden = false;
        if (els.startBannerTitle) els.startBannerTitle.textContent = "الجلسة جاهزة";
        if (els.startBannerSub) {
          els.startBannerSub.textContent = STATE.players.length > 0
            ? "هناك " + formatNumber(STATE.players.length) + " لاعب. اضغط «ابدأ اللعبة» لتحميل الأسئلة."
            : "اضغط «ابدأ اللعبة» لتحميل الأسئلة وعرض السؤال الأول.";
        }
      } else {
        els.startBanner.hidden = true;
      }
    }

    if (els.sessionStatusBadge) {
      if (s.finalized) {
        els.sessionStatusBadge.textContent = "تم اعتماد النتيجة";
        els.sessionStatusBadge.dataset.state = "active";
      } else if (s.status === "ended") {
        els.sessionStatusBadge.textContent = "منتهية";
        els.sessionStatusBadge.dataset.state = "ended";
      } else if (s.status === "active") {
        els.sessionStatusBadge.textContent = "نشطة";
        els.sessionStatusBadge.dataset.state = "active";
      } else {
        els.sessionStatusBadge.textContent = "بانتظار البدء";
        els.sessionStatusBadge.dataset.state = "waiting";
      }
    }

    if (s.qrDataUrl) {
      if (els.sessionQrImage) {
        els.sessionQrImage.src = s.qrDataUrl;
        els.sessionQrImage.hidden = false;
      }
      if (els.sessionQrPlaceholder) els.sessionQrPlaceholder.hidden = true;
    } else {
      if (els.sessionQrImage) {
        els.sessionQrImage.hidden = true;
        els.sessionQrImage.removeAttribute("src");
      }
      if (els.sessionQrPlaceholder) els.sessionQrPlaceholder.hidden = false;
    }

    toggleSessionControls(true);
  }

  function toggleSessionControls(enabled) {
    if (els.openJoinBtn) els.openJoinBtn.disabled = !enabled;
    if (els.closeJoinBtn) els.closeJoinBtn.disabled = !enabled;
    if (els.endSessionBtn) els.endSessionBtn.disabled = !enabled;
    if (els.copyCodeBtn) els.copyCodeBtn.disabled = !enabled;
  }

  function renderTimer() {
    const t = STATE.timer;
    const q = STATE.question;

    if (!q) {
      if (els.timerValue) els.timerValue.textContent = "--";
      if (els.timerBarFill) {
        els.timerBarFill.style.width = "0%";
        els.timerBarFill.removeAttribute("data-state");
      }
      return;
    }

    const total = (t && t.total) || q.timeLimit || 0;
    if (!total) {
      if (els.timerValue) els.timerValue.textContent = "--";
      if (els.timerBarFill) {
        els.timerBarFill.style.width = "0%";
        els.timerBarFill.removeAttribute("data-state");
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

    const pct = Math.min(100, Math.max(0, (remaining / total) * 100));
    if (els.timerBarFill) {
      els.timerBarFill.style.width = pct + "%";
      if (pct <= 20) els.timerBarFill.dataset.state = "danger";
      else if (pct <= 50) els.timerBarFill.dataset.state = "warning";
      else els.timerBarFill.removeAttribute("data-state");
    }
  }

  function renderGameStatus() {
    const s = STATE.session;
    const q = STATE.question;

    if (!s || !q) {
      if (els.gameStatusBadge) {
        els.gameStatusBadge.textContent = "بانتظار البدء";
        els.gameStatusBadge.dataset.state = "waiting";
      }
      if (els.roundQuestionIndex) els.roundQuestionIndex.textContent = "—";
      if (els.roundHintsCount) els.roundHintsCount.textContent = "0";
      if (els.roundPointsValue) els.roundPointsValue.textContent = "0";
      if (els.roundAnswersCount) els.roundAnswersCount.textContent = "0";
      toggleGameControls({});
      return;
    }

    if (els.roundQuestionIndex) {
      els.roundQuestionIndex.textContent = (q.order || 0) + " / " + (s.totalQuestions || STATE.questions.length || 0);
    }
    if (els.roundHintsCount) {
      els.roundHintsCount.textContent = String((q.globalHints || q.revealedHints || []).length);
    }
    if (els.roundPointsValue) {
      els.roundPointsValue.textContent = String(q.currentPoints != null ? q.currentPoints : q.basePoints);
    }
    if (els.roundAnswersCount) {
      els.roundAnswersCount.textContent = String(q.answersCount || 0);
    }

    const status = q.status || "idle";
    const labels = {
      idle: "السؤال جاهز",
      shown: "السؤال معروض",
      running: "المؤقت يعمل",
      paused: "متوقف مؤقتًا",
      ended: "انتهى الوقت",
      revealed: "الإجابة مكشوفة",
      committed: "تم اعتماد النتيجة",
      moved: "الانتقال للسؤال التالي",
    };
    if (els.gameStatusBadge) {
      els.gameStatusBadge.textContent = labels[status] || "السؤال";
      if (status === "idle") els.gameStatusBadge.dataset.state = "waiting";
      else if (status === "revealed" || status === "committed") els.gameStatusBadge.dataset.state = "active";
      else if (status === "ended") els.gameStatusBadge.dataset.state = "ended";
      else els.gameStatusBadge.dataset.state = "active";
    }

    const isWhoAmI = (q.type || "who-am-i") === "who-am-i";
    const hasHints = isWhoAmI && (q.hints || []).length > 0;
    const isLastQuestion = s && q && (q.order || 0) >= (s.totalQuestions || 0);
    const sessionActive = s && s.status === "active";
    const sessionFinalized = s && s.finalized === true;

    toggleGameControls({
      canStartTimer: !sessionFinalized && (status === "idle" || status === "shown"),
      canPause: !sessionFinalized && status === "running",
      canResume: !sessionFinalized && status === "paused",
      canNextHint:
        !sessionFinalized &&
        hasHints &&
        (q.globalHints || []).length < (q.hints || []).length &&
        status !== "revealed" &&
        status !== "committed",
      canReveal: !sessionFinalized && status !== "revealed" && status !== "committed" && status !== "moved",
      canNext: sessionActive && !sessionFinalized && !isLastQuestion && status === "committed",
      canFinalize: sessionActive && !sessionFinalized && isLastQuestion && status === "committed",
    });
  }

  function toggleGameControls(states) {
    if (els.startTimerBtn) els.startTimerBtn.disabled = !states.canStartTimer;
    if (els.pauseTimerBtn) els.pauseTimerBtn.disabled = !states.canPause;
    if (els.resumeTimerBtn) els.resumeTimerBtn.disabled = !states.canResume;
    if (els.nextHintBtn) els.nextHintBtn.disabled = !states.canNextHint;
    if (els.revealAnswerBtn) els.revealAnswerBtn.disabled = !states.canReveal;
    if (els.nextQuestionBtn) els.nextQuestionBtn.disabled = !states.canNext;
    if (els.finalizeSessionBtn) els.finalizeSessionBtn.disabled = !states.canFinalize;
  }

  function renderPlayers() {
    if (!els.playersList) return;
    els.playersList.innerHTML = "";

    if (els.playersCountLabel) {
      els.playersCountLabel.textContent = formatNumber(STATE.players.length) + " لاعب";
    }

    if (STATE.players.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "لا يوجد لاعبون بعد.";
      els.playersList.appendChild(p);
      return;
    }

    const q = STATE.question;
    const isWhoAmI = q && (q.type || "who-am-i") === "who-am-i";
    const globalCount = (q && (q.globalHints || q.revealedHints || []).length) || 0;
    const totalHints = (q && isWhoAmI && (q.hints || []).length) || 0;
    const sessionFinalized = STATE.session && STATE.session.finalized === true;
    const canGivePersonalHint =
      !!q &&
      !sessionFinalized &&
      isWhoAmI &&
      q.status !== "revealed" &&
      q.status !== "committed" &&
      q.status !== "moved" &&
      globalCount < totalHints;

    STATE.players.forEach(function (player) {
      const personalCount = (q && q.playerHints && q.playerHints[player.id])
        ? q.playerHints[player.id].length
        : 0;
      const playerSeenTotal = globalCount + personalCount;
      const playerHintDisabled = !canGivePersonalHint || playerSeenTotal >= totalHints;

      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML =
        '<div class="list-item-main">' +
          '<span class="list-item-name">' + escapeHtml(player.nickname) + "</span>" +
          '<span class="list-item-meta">' +
            formatNumber(player.score || 0) + " نقطة" +
          "</span>" +
        "</div>" +
        '<div class="list-item-actions">' +
          '<button type="button" class="icon-btn icon-btn-hint" data-action="hint" data-id="' + escapeHtml(player.id) + '" title="إتاحة تلميح خاص لهذا اللاعب"' +
            (playerHintDisabled ? " disabled" : "") +
          ">" +
            '<svg viewBox="0 0 24 24">' +
              '<path d="M9 18h6M10 21h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
              '<path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
            "</svg>" +
          "</button>" +
          '<button type="button" class="icon-btn" data-action="kick" data-id="' + escapeHtml(player.id) + '" title="استبعاد"' +
            (sessionFinalized ? " disabled" : "") +
          ">" +
            '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
          "</button>" +
        "</div>";

      const hintBtn = div.querySelector('[data-action="hint"]');
      if (hintBtn && !playerHintDisabled) {
        hintBtn.addEventListener("click", function () {
          givePersonalHint(player.id, player.nickname);
        });
      }

      const kickBtn = div.querySelector('[data-action="kick"]');
      if (kickBtn && !sessionFinalized) {
        kickBtn.addEventListener("click", function () {
          confirmModal(
            "استبعاد لاعب",
            "هل تريد استبعاد اللاعب " + player.nickname + " من الجلسة؟",
            function () {
              kickPlayer(player.id);
            }
          );
        });
      }

      els.playersList.appendChild(div);
    });
  }

  function renderLeaderboard() {
    if (!els.leaderboard) return;
    els.leaderboard.innerHTML = "";

    const data = STATE.leaderboard || [];
    if (data.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-note";
      li.textContent = "لا يوجد ترتيب بعد.";
      els.leaderboard.appendChild(li);
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
      els.leaderboard.appendChild(li);
    });
  }

  function buildQuestionSummary(q) {
    const type = q.type || "who-am-i";
    if (type === "who-am-i") {
      return q.answer || q.question || "—";
    }
    return q.question || "—";
  }

  function renderQuestions() {
    if (!els.questionsList) return;
    els.questionsList.innerHTML = "";

    if (STATE.questions.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "لا توجد أسئلة. أضف سؤالًا جديدًا للبدء.";
      els.questionsList.appendChild(p);
      return;
    }

    STATE.questions.forEach(function (q) {
      const type = q.type || "who-am-i";
      const typeLabel = QUESTION_TYPE_LABELS[type] || type;
      const item = document.createElement("div");
      item.className = "question-item";
      item.innerHTML =
        '<div class="question-item-main">' +
          '<span class="question-item-title">' + escapeHtml(buildQuestionSummary(q)) + "</span>" +
          '<span class="question-item-question">' + escapeHtml(q.question || "—") + "</span>" +
          '<span class="question-item-meta">' +
            "<span>النوع: " + escapeHtml(typeLabel) + "</span>" +
            "<span>المرجع: " + escapeHtml(q.reference || "—") + "</span>" +
            "<span>النقاط: " + formatNumber(q.basePoints || 10) + "</span>" +
            (type === "who-am-i"
              ? "<span>التلميحات: " + (q.hints ? q.hints.length : 0) + "</span>"
              : "") +
          "</span>" +
        "</div>" +
        '<div class="question-item-actions">' +
          '<button type="button" class="icon-btn" data-action="edit" data-id="' + escapeHtml(q.id) + '" title="تعديل">' +
            '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>' +
          "</button>" +
          '<button type="button" class="icon-btn" data-action="delete" data-id="' + escapeHtml(q.id) + '" title="حذف">' +
            '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>" +
        "</div>";

      item.querySelector('[data-action="edit"]').addEventListener("click", function () {
        openQuestionForm(q);
      });

      item.querySelector('[data-action="delete"]').addEventListener("click", function () {
        confirmModal(
          "حذف سؤال",
          "هل تريد حذف هذا السؤال؟ لا يمكن التراجع عن هذه العملية.",
          function () {
            deleteQuestion(q.id);
          }
        );
      });

      els.questionsList.appendChild(item);
    });
  }

  function renderQuizzes() {
    if (!els.quizzesList) return;
    els.quizzesList.innerHTML = "";

    if (STATE.quizzes.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "لا توجد مسابقات محفوظة. أنشئ مسابقة جديدة للبدء.";
      els.quizzesList.appendChild(p);
      return;
    }

    STATE.quizzes.forEach(function (quiz) {
      const count = Array.isArray(quiz.questionIds) ? quiz.questionIds.length : 0;
      const item = document.createElement("div");
      item.className = "quiz-item";
      item.innerHTML =
        '<div class="quiz-item-main">' +
          '<span class="quiz-item-title">' + escapeHtml(quiz.name || "بدون اسم") + "</span>" +
          (quiz.description
            ? '<span class="quiz-item-desc">' + escapeHtml(quiz.description) + "</span>"
            : "") +
          '<span class="quiz-item-meta">' +
            "<span>عدد الأسئلة: " + formatNumber(count) + "</span>" +
            (quiz.updatedAt ? "<span>آخر تحديث: " + formatTime(quiz.updatedAt) + "</span>" : "") +
          "</span>" +
        "</div>" +
        '<div class="quiz-item-actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="start" data-id="' + escapeHtml(quiz.id) + '">بدء اللعب</button>' +
          '<button type="button" class="icon-btn" data-action="edit" data-id="' + escapeHtml(quiz.id) + '" title="تعديل">' +
            '<svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>' +
          "</button>" +
          '<button type="button" class="icon-btn" data-action="delete" data-id="' + escapeHtml(quiz.id) + '" title="حذف">' +
            '<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>" +
        "</div>";

      item.querySelector('[data-action="start"]').addEventListener("click", function () {
        confirmModal(
          "بدء اللعب من المسابقة",
          "سيتم إنشاء جلسة جديدة من المسابقة \"" + (quiz.name || "") + "\". هل تريد المتابعة؟",
          function () {
            startSessionFromQuiz(quiz.id);
          }
        );
      });

      item.querySelector('[data-action="edit"]').addEventListener("click", function () {
        openQuizForm(quiz);
      });

      item.querySelector('[data-action="delete"]').addEventListener("click", function () {
        confirmModal(
          "حذف مسابقة",
          "هل تريد حذف المسابقة \"" + (quiz.name || "") + "\"؟ لا يمكن التراجع.",
          function () {
            deleteQuiz(quiz.id);
          }
        );
      });

      els.quizzesList.appendChild(item);
    });
  }

  async function loadQuestions() {
    try {
      const data = await api("/questions");
      STATE.questions = (data && data.questions) || [];
      renderQuestions();
    } catch (e) {
      toast(e.message || "تعذر تحميل الأسئلة.", "error");
    }
  }

  async function loadQuizzes() {
    try {
      const data = await api("/quizzes");
      STATE.quizzes = (data && data.quizzes) || [];
      renderQuizzes();
    } catch (e) {
      toast(e.message || "تعذر تحميل المسابقات.", "error");
    }
  }

  async function loadState() {
    try {
      const data = await api("/game/state");
      STATE.session = (data && data.session) || null;
      STATE.question = (data && data.question) || null;
      STATE.timer = (data && data.timer) || null;
      STATE.players = (data && data.players) || [];
      STATE.leaderboard = (data && data.leaderboard) || [];

      renderSession();
      renderTimer();
      renderGameStatus();
      renderPlayers();
      renderLeaderboard();
    } catch (e) {
      if (e.status !== 401) {
        toast(e.message || "تعذر تحديث حالة اللعبة.", "error");
      }
    }
  }

  function startPolling() {
    if (STATE.polling) clearInterval(STATE.polling);
    STATE.polling = setInterval(function () {
      if (!document.hidden) loadState();
    }, POLL_MS);
  }

  async function createSession() {
    if (STATE.loading) return;
    STATE.loading = true;
    try {
      const data = await api("/game/session", {
        method: "POST",
        body: { mode: "solo" },
      });

      STATE.session = data && data.session;
      toast("تم إنشاء جلسة جديدة بنجاح.", "success");
      pushLog("تم إنشاء جلسة جديدة.", "success");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر إنشاء الجلسة.", "error");
    } finally {
      STATE.loading = false;
    }
  }

  async function startGame() {
    if (STATE.loading) return;
    STATE.loading = true;
    try {
      await api("/game/questions/load", { method: "POST" });
      toast("تم تحميل الأسئلة. اللعبة جاهزة للبدء.", "success");
      pushLog("تم تحميل الأسئلة وبدء السؤال الأول.", "success");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر تحميل الأسئلة.", "error");
    } finally {
      STATE.loading = false;
    }
  }

  async function startSessionFromQuiz(quizId) {
    if (STATE.loading) return;
    STATE.loading = true;
    try {
      await api("/game/session/start-from-quiz", {
        method: "POST",
        body: { quizId: quizId },
      });
      toast("تم بدء الجلسة من المسابقة.", "success");
      pushLog("تم بدء جلسة جديدة من مسابقة محفوظة.", "success");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر بدء الجلسة من المسابقة.", "error");
    } finally {
      STATE.loading = false;
    }
  }

  async function openJoin() {
    try {
      await api("/game/session/join/open", { method: "POST" });
      toast("تم فتح باب الانضمام.", "success");
      pushLog("تم فتح باب الانضمام.", "success");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر فتح باب الانضمام.", "error");
    }
  }

  async function closeJoin() {
    try {
      await api("/game/session/join/close", { method: "POST" });
      toast("تم إغلاق باب الانضمام.", "warning");
      pushLog("تم إغلاق باب الانضمام.", "warning");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر إغلاق باب الانضمام.", "error");
    }
  }

  function endSession() {
    confirmModal(
      "إنهاء الجلسة",
      "هل تريد إنهاء الجلسة الحالية؟ سيتم إغلاق الانضمام وإيقاف كل العمليات.",
      async function () {
        try {
          await api("/game/session/end", { method: "POST" });
          toast("تم إنهاء الجلسة.", "warning");
          pushLog("تم إنهاء الجلسة.", "warning");
          await loadState();
        } catch (e) {
          toast(e.message || "تعذر إنهاء الجلسة.", "error");
        }
      }
    );
  }

  function finalizeSession() {
    confirmModal(
      "اعتماد النتيجة النهائية",
      "سيتم حساب النقاط لكل الأسئلة وإظهار الترتيب النهائي. لا يمكن التراجع عن هذه العملية. هل تريد المتابعة؟",
      async function () {
        try {
          const data = await api("/game/session/finalize", { method: "POST" });
          const r = (data && data.result) || {};
          toast("تم اعتماد النتيجة النهائية. مجموع النقاط: " + formatNumber(r.totalPoints || 0), "success");
          pushLog(
            "تم اعتماد النتيجة النهائية. الإجابات: " + (r.totalAnswers || 0) +
            "، الصح: " + (r.totalCorrect || 0) +
            "، النقاط: " + (r.totalPoints || 0),
            "success"
          );
          await loadState();
        } catch (e) {
          toast(e.message || "تعذر اعتماد النتيجة النهائية.", "error");
        }
      }
    );
  }

  async function startTimer() {
    try {
      await api("/game/timer/start", { method: "POST" });
      pushLog("تم بدء المؤقت.", "info");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر بدء المؤقت.", "error");
    }
  }

  async function pauseTimer() {
    try {
      await api("/game/timer/pause", { method: "POST" });
      pushLog("تم إيقاف المؤقت مؤقتًا.", "info");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر إيقاف المؤقت.", "error");
    }
  }

  async function resumeTimer() {
    try {
      await api("/game/timer/resume", { method: "POST" });
      pushLog("تم استئناف المؤقت.", "info");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر استئناف المؤقت.", "error");
    }
  }

  async function nextHint() {
    const q = STATE.question;
    if (!q) return;

    if ((q.type || "who-am-i") !== "who-am-i") {
      toast("التلميحات متاحة فقط لأسئلة «من أنا؟».", "warning");
      return;
    }

    const globalCount = (q.globalHints || q.revealedHints || []).length;
    const totalHints = (q.hints || []).length;
    if (globalCount >= totalHints) {
      toast("تم إتاحة كل التلميحات العامة.", "warning");
      return;
    }

    try {
      await api("/game/hint/next", { method: "POST" });
      pushLog("تم إتاحة تلميح عام.", "info");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر إتاحة التلميح.", "error");
    }
  }

  async function givePersonalHint(playerId, playerName) {
    try {
      await api("/game/hint/next", {
        method: "POST",
        body: { playerId: playerId },
      });
      toast("تم إتاحة تلميح خاص للاعب " + playerName + ".", "success");
      pushLog("تم إتاحة تلميح خاص للاعب: " + playerName, "info");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر إتاحة التلميح الخاص.", "error");
    }
  }

  async function revealAnswer() {
    confirmModal(
      "إظهار الإجابة الصحيحة",
      "هل تريد إظهار الإجابة الصحيحة الآن لجميع اللاعبين؟",
      async function () {
        try {
          await api("/game/question/reveal", { method: "POST" });
          pushLog("تم إظهار الإجابة الصحيحة.", "success");
          await loadState();
        } catch (e) {
          toast(e.message || "تعذر إظهار الإجابة.", "error");
        }
      }
    );
  }

  async function nextQuestion() {
    try {
      await api("/game/question/next", { method: "POST" });
      pushLog("تم الانتقال إلى السؤال التالي.", "info");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر الانتقال للسؤال التالي.", "error");
    }
  }

  async function kickPlayer(playerId) {
    try {
      await api("/game/players/" + encodeURIComponent(playerId) + "/kick", { method: "POST" });
      toast("تم استبعاد اللاعب.", "warning");
      pushLog("تم استبعاد لاعب من الجلسة.", "warning");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر استبعاد اللاعب.", "error");
    }
  }

  function buildOptionsInputs(options, count) {
    const list = Array.isArray(options) ? options.slice() : [];
    while (list.length < count) list.push("");
    return list.slice(0, count).map(function (opt, i) {
      return (
        '<div class="form-field">' +
          '<label for="q-option-' + i + '">الاختيار ' + (i + 1) + "</label>" +
          '<input id="q-option-' + i + '" type="text" value="' + escapeHtml(opt) + '" />' +
        "</div>"
      );
    }).join("");
  }

  function buildHintsInputs(hints) {
    const list = Array.isArray(hints) ? hints.slice() : [];
    while (list.length < 3) list.push("");
    return list.slice(0, 3).map(function (h, i) {
      return (
        '<div class="form-field">' +
          '<label for="q-hint-' + i + '">التلميح ' + (i + 1) + "</label>" +
          '<input id="q-hint-' + i + '" type="text" value="' + escapeHtml(h) + '" />' +
        "</div>"
      );
    }).join("");
  }

  function openQuestionForm(question) {
    const isEdit = !!question;
    const q = question || {
      type: "who-am-i",
      question: "",
      answer: "",
      reference: "",
      options: ["", "", "", ""],
      correctIndex: 0,
      correctAnswer: true,
      hints: ["", "", ""],
      basePoints: 10,
      timeLimit: 30,
    };

    const type = q.type || "who-am-i";
    const isTrueFalse = type === "true-false";
    const isWhoAmI = type === "who-am-i";

    const typeOptions =
      '<option value="who-am-i"' + (type === "who-am-i" ? " selected" : "") + ">من أنا؟</option>" +
      '<option value="multiple-choice"' + (type === "multiple-choice" ? " selected" : "") + ">اختيار من متعدد</option>" +
      '<option value="true-false"' + (type === "true-false" ? " selected" : "") + ">صح أو غلط</option>";

    const trueFalseSelect =
      '<div id="q-true-false-container" class="form-field"' + (isTrueFalse ? "" : ' style="display:none;"') + ">" +
        '<label for="q-true-false-answer">الإجابة الصحيحة</label>' +
        '<select id="q-true-false-answer">' +
          '<option value="true"' + (q.correctAnswer !== false ? " selected" : "") + ">صح</option>" +
          '<option value="false"' + (q.correctAnswer === false ? " selected" : "") + ">خطأ</option>" +
        "</select>" +
      "</div>";

    const answerContainer =
      '<div id="q-answer-container"' + (isWhoAmI ? "" : ' style="display:none;"') + ">" +
        '<div class="form-field">' +
          '<label for="q-answer">اسم الشخصية (الإجابة الصحيحة)</label>' +
          '<input id="q-answer" type="text" value="' + escapeHtml(q.answer || "") + '" />' +
        "</div>" +
      "</div>";

    const optionsContainer =
      '<div id="q-options-container"' + (isTrueFalse ? ' style="display:none;"' : "") + ">" +
        '<div class="form-row">' +
          '<div class="form-field">' +
            '<label for="q-correct">الاختيار الصحيح</label>' +
            '<select id="q-correct">' +
              [0, 1, 2, 3].map(function (i) {
                return '<option value="' + i + '"' + (i === (q.correctIndex || 0) ? " selected" : "") + ">الاختيار " + (i + 1) + "</option>";
              }).join("") +
            "</select>" +
          "</div>" +
        "</div>" +
        '<h4 class="form-section-title">الاختيارات</h4>' +
        buildOptionsInputs(q.options, 4) +
      "</div>";

    const hintsContainer =
      '<div id="q-hints-container"' + (isWhoAmI ? "" : ' style="display:none;"') + ">" +
        '<h4 class="form-section-title">التلميحات</h4>' +
        buildHintsInputs(q.hints) +
      "</div>";

    openModal(
      isEdit ? "تعديل سؤال" : "إضافة سؤال",
      '<div class="form-field">' +
        '<label for="q-type">نوع السؤال</label>' +
        '<select id="q-type">' + typeOptions + "</select>" +
      "</div>" +
      '<div class="form-field">' +
        '<label for="q-question">نص السؤال</label>' +
        '<textarea id="q-question" rows="2" placeholder="اكتب صيغة السؤال التي ستظهر للاعبين">' +
          escapeHtml(q.question || "") +
        "</textarea>" +
      "</div>" +
      answerContainer +
      '<div class="form-field">' +
        '<label for="q-reference">المرجع الكتابي</label>' +
        '<input id="q-reference" type="text" value="' + escapeHtml(q.reference || "") + '" />' +
        '<span class="hint">مثال: 1 صموئيل 17</span>' +
      "</div>" +
      '<div class="form-row">' +
        '<div class="form-field">' +
          '<label for="q-points">قيمة السؤال</label>' +
          '<input id="q-points" type="number" min="0" max="100" value="' + (q.basePoints || 10) + '" />' +
        "</div>" +
        '<div class="form-field">' +
          '<label for="q-time">مدة المؤقت (ثانية)</label>' +
          '<input id="q-time" type="number" min="5" max="300" value="' + (q.timeLimit || 30) + '" />' +
        "</div>" +
      "</div>" +
      optionsContainer +
      trueFalseSelect +
      hintsContainer,
      [
        { label: "إلغاء", className: "btn-outline", onClick: closeModal },
        {
          label: isEdit ? "حفظ التعديلات" : "إضافة السؤال",
          className: "btn-primary",
          onClick: function () {
            const payload = collectQuestionForm(q.id);
            if (payload) saveQuestion(payload, isEdit);
          },
        },
      ]
    );

    const typeSelect = document.getElementById("q-type");
    if (typeSelect) {
      typeSelect.addEventListener("change", function () {
        const nextType = typeSelect.value;
        const answerEl = document.getElementById("q-answer-container");
        const optionsEl = document.getElementById("q-options-container");
        const trueFalseEl = document.getElementById("q-true-false-container");
        const hintsEl = document.getElementById("q-hints-container");

        if (answerEl) answerEl.style.display = nextType === "who-am-i" ? "block" : "none";
        if (optionsEl) optionsEl.style.display = nextType === "true-false" ? "none" : "block";
        if (trueFalseEl) trueFalseEl.style.display = nextType === "true-false" ? "block" : "none";
        if (hintsEl) hintsEl.style.display = nextType === "who-am-i" ? "block" : "none";
      });
    }
  }

  function collectQuestionForm(id) {
    const type = (document.getElementById("q-type") || {}).value || "who-am-i";
    const questionText = (document.getElementById("q-question") || {}).value || "";
    const reference = (document.getElementById("q-reference") || {}).value || "";
    const basePoints = Number((document.getElementById("q-points") || {}).value) || 10;
    const timeLimit = Number((document.getElementById("q-time") || {}).value) || 30;

    if (!questionText.trim()) {
      toast("يرجى إدخال نص السؤال.", "error");
      return null;
    }

    const payload = {
      type: type,
      question: questionText.trim(),
      reference: reference.trim(),
      basePoints: basePoints,
      timeLimit: timeLimit,
    };

    if (type === "who-am-i") {
      const answer = (document.getElementById("q-answer") || {}).value || "";
      if (!answer.trim()) {
        toast("يرجى إدخال اسم الشخصية.", "error");
        return null;
      }
      const options = [0, 1, 2, 3].map(function (i) {
        const el = document.getElementById("q-option-" + i);
        return el ? el.value.trim() : "";
      });
      if (options.some(function (o) { return !o; })) {
        toast("يرجى إدخال جميع الاختيارات الأربعة.", "error");
        return null;
      }
      const correctIndex = Number((document.getElementById("q-correct") || {}).value) || 0;
      const hints = [0, 1, 2].map(function (i) {
        const el = document.getElementById("q-hint-" + i);
        return el ? el.value.trim() : "";
      }).filter(function (h) { return h.length > 0; });

      payload.answer = answer.trim();
      payload.options = options;
      payload.correctIndex = correctIndex;
      payload.hints = hints;
    } else if (type === "multiple-choice") {
      const options = [0, 1, 2, 3].map(function (i) {
        const el = document.getElementById("q-option-" + i);
        return el ? el.value.trim() : "";
      });
      const nonEmpty = options.filter(function (o) { return !!o; });
      if (nonEmpty.length < 2) {
        toast("يرجى إدخال اختيارين على الأقل.", "error");
        return null;
      }
      const correctIndex = Number((document.getElementById("q-correct") || {}).value) || 0;
      if (!options[correctIndex]) {
        toast("الاختيار الصحيح غير محدد أو فارغ.", "error");
        return null;
      }
      payload.options = options;
      payload.correctIndex = correctIndex;
    } else if (type === "true-false") {
      const tfVal = (document.getElementById("q-true-false-answer") || {}).value || "true";
      payload.correctAnswer = tfVal === "true";
    }

    if (id) payload.id = id;
    return payload;
  }

  async function saveQuestion(payload, isEdit) {
    try {
      if (isEdit) {
        await api("/questions/" + encodeURIComponent(payload.id), {
          method: "PUT",
          body: payload,
        });
        toast("تم تحديث السؤال.", "success");
        pushLog("تم تحديث سؤال.", "success");
      } else {
        await api("/questions", {
          method: "POST",
          body: payload,
        });
        toast("تمت إضافة السؤال.", "success");
        pushLog("تمت إضافة سؤال جديد.", "success");
      }
      closeModal();
      await loadQuestions();
    } catch (e) {
      toast(e.message || "تعذر حفظ السؤال.", "error");
    }
  }

  async function deleteQuestion(id) {
    try {
      await api("/questions/" + encodeURIComponent(id), { method: "DELETE" });
      toast("تم حذف السؤال.", "warning");
      pushLog("تم حذف سؤال.", "warning");
      await loadQuestions();
    } catch (e) {
      toast(e.message || "تعذر حذف السؤال.", "error");
    }
  }

  function openQuizForm(quiz) {
    const isEdit = !!quiz;
    const q = quiz || { name: "", description: "", questionIds: [] };
    const selectedSet = new Set(Array.isArray(q.questionIds) ? q.questionIds : []);

    const questionsHtml = STATE.questions.length === 0
      ? '<p class="empty-note">لا توجد أسئلة في المكتبة. أضف أسئلة أولًا.</p>'
      : STATE.questions.map(function (question) {
          const checked = selectedSet.has(question.id) ? " checked" : "";
          const summary = buildQuestionSummary(question);
          const typeLabel = QUESTION_TYPE_LABELS[question.type || "who-am-i"] || "—";
          return (
            '<label class="quiz-question-item">' +
              '<input type="checkbox" name="quiz-question" value="' + escapeHtml(question.id) + '"' + checked + " />" +
              '<span class="quiz-question-text">' + escapeHtml(summary) + "</span>" +
              '<span class="quiz-question-type">' + escapeHtml(typeLabel) + "</span>" +
            "</label>"
          );
        }).join("");

    openModal(
      isEdit ? "تعديل مسابقة" : "إنشاء مسابقة جديدة",
      '<div class="form-field">' +
        '<label for="quiz-name">اسم المسابقة</label>' +
        '<input id="quiz-name" type="text" maxlength="120" value="' + escapeHtml(q.name || "") + '" placeholder="مثال: مسابقة اجتماع الجمعة" />' +
      "</div>" +
      '<div class="form-field">' +
        '<label for="quiz-description">الوصف (اختياري)</label>' +
        '<textarea id="quiz-description" rows="2" maxlength="500" placeholder="وصف مختصر للمسابقة">' +
          escapeHtml(q.description || "") +
        "</textarea>" +
      "</div>" +
      '<div class="form-field">' +
        '<label>اختر الأسئلة</label>' +
        '<div class="quiz-questions-list">' + questionsHtml + "</div>" +
        '<span class="hint">سيتم عرض الأسئلة بترتيب ظهورها في المكتبة. يمكنك اختيار أي عدد.</span>' +
      "</div>",
      [
        { label: "إلغاء", className: "btn-outline", onClick: closeModal },
        {
          label: isEdit ? "حفظ التعديلات" : "إنشاء المسابقة",
          className: "btn-primary",
          onClick: function () {
            const payload = collectQuizForm(q.id);
            if (payload) saveQuiz(payload, isEdit);
          },
        },
      ]
    );
  }

  function collectQuizForm(id) {
    const name = ((document.getElementById("quiz-name") || {}).value || "").trim();
    const description = ((document.getElementById("quiz-description") || {}).value || "").trim();

    if (!name) {
      toast("يرجى إدخال اسم المسابقة.", "error");
      return null;
    }

    const ids = [];
    const checkboxes = document.querySelectorAll('input[name="quiz-question"]:checked');
    checkboxes.forEach(function (cb) {
      if (cb.value) ids.push(cb.value);
    });

    if (ids.length === 0) {
      toast("اختر سؤالًا واحدًا على الأقل.", "error");
      return null;
    }

    const orderedIds = [];
    STATE.questions.forEach(function (q) {
      if (ids.indexOf(q.id) !== -1) orderedIds.push(q.id);
    });

    const payload = {
      name: name,
      description: description,
      questionIds: orderedIds,
    };

    if (id) payload.id = id;
    return payload;
  }

  async function saveQuiz(payload, isEdit) {
    try {
      if (isEdit) {
        await api("/quizzes/" + encodeURIComponent(payload.id), {
          method: "PUT",
          body: payload,
        });
        toast("تم تحديث المسابقة.", "success");
        pushLog("تم تحديث مسابقة.", "success");
      } else {
        await api("/quizzes", {
          method: "POST",
          body: payload,
        });
        toast("تم إنشاء المسابقة.", "success");
        pushLog("تم إنشاء مسابقة جديدة.", "success");
      }
      closeModal();
      await loadQuizzes();
    } catch (e) {
      toast(e.message || "تعذر حفظ المسابقة.", "error");
    }
  }

  async function deleteQuiz(id) {
    try {
      await api("/quizzes/" + encodeURIComponent(id), { method: "DELETE" });
      toast("تم حذف المسابقة.", "warning");
      pushLog("تم حذف مسابقة.", "warning");
      await loadQuizzes();
    } catch (e) {
      toast(e.message || "تعذر حذف المسابقة.", "error");
    }
  }

  async function copyCode() {
    if (!STATE.session || !STATE.session.code) return;
    try {
      await navigator.clipboard.writeText(STATE.session.code);
      toast("تم نسخ الرمز.", "success");
    } catch (e) {
      toast("تعذر نسخ الرمز. يمكنك نسخه يدويًا.", "warning");
    }
  }

  function clearLog() {
    STATE.log = [];
    renderLog();
    toast("تم تفريغ السجل.", "info");
  }

  async function logout() {
    confirmModal(
      "تسجيل الخروج",
      "هل تريد تسجيل الخروج من لوحة التحكم؟",
      async function () {
        try {
          await api("/auth/logout", { method: "POST" });
        } catch (e) {
        }
        window.location.replace("/admin-login");
      }
    );
  }

  function bindEvents() {
    if (els.createSessionBtn) els.createSessionBtn.addEventListener("click", createSession);
    if (els.startGameBtn) els.startGameBtn.addEventListener("click", startGame);
    if (els.openJoinBtn) els.openJoinBtn.addEventListener("click", openJoin);
    if (els.closeJoinBtn) els.closeJoinBtn.addEventListener("click", closeJoin);
    if (els.endSessionBtn) els.endSessionBtn.addEventListener("click", endSession);
    if (els.copyCodeBtn) els.copyCodeBtn.addEventListener("click", copyCode);

    if (els.startTimerBtn) els.startTimerBtn.addEventListener("click", startTimer);
    if (els.pauseTimerBtn) els.pauseTimerBtn.addEventListener("click", pauseTimer);
    if (els.resumeTimerBtn) els.resumeTimerBtn.addEventListener("click", resumeTimer);
    if (els.nextHintBtn) els.nextHintBtn.addEventListener("click", nextHint);
    if (els.revealAnswerBtn) els.revealAnswerBtn.addEventListener("click", revealAnswer);
    if (els.nextQuestionBtn) els.nextQuestionBtn.addEventListener("click", nextQuestion);
    if (els.finalizeSessionBtn) els.finalizeSessionBtn.addEventListener("click", finalizeSession);

    if (els.addQuizBtn) els.addQuizBtn.addEventListener("click", function () { openQuizForm(null); });
    if (els.reloadQuizzesBtn) els.reloadQuizzesBtn.addEventListener("click", loadQuizzes);

    if (els.addQuestionBtn) els.addQuestionBtn.addEventListener("click", function () { openQuestionForm(null); });
    if (els.reloadQuestionsBtn) els.reloadQuestionsBtn.addEventListener("click", loadQuestions);
    if (els.clearLogBtn) els.clearLogBtn.addEventListener("click", clearLog);
    if (els.logoutBtn) els.logoutBtn.addEventListener("click", logout);
    if (els.modalCloseBtn) els.modalCloseBtn.addEventListener("click", closeModal);

    if (els.modalOverlay) {
      els.modalOverlay.addEventListener("click", function (e) {
        if (e.target === els.modalOverlay) closeModal();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.modalOverlay && !els.modalOverlay.hidden) {
        closeModal();
      }
    });

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) loadState();
    });

    window.addEventListener("focus", function () { loadState(); });
  }

  async function init() {
    const ok = await ensureAdminSession();
    if (!ok) return;

    initConnectionWatcher();
    bindEvents();

    loadState();
    loadQuestions();
    loadQuizzes();
    startPolling();

    setInterval(function () {
      if (STATE.question) renderTimer();
    }, 500);

    pushLog("تم فتح لوحة التحكم.", "info");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();