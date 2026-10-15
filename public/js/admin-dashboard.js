(function () {
  "use strict";

  const API_BASE = "/api";
  const POLL_MS = 2500;
  const STATE = {
    session: null,
    question: null,
    timer: null,
    players: [],
    teams: [],
    leaderboard: [],
    questions: [],
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

    sessionStatusBadge: document.getElementById("session-status-badge"),
    sessionCode: document.getElementById("session-code"),
    copyCodeBtn: document.getElementById("copy-code-btn"),
    sessionQr: document.getElementById("session-qr"),
    sessionQrPlaceholder: document.getElementById("session-qr-placeholder"),
    sessionQrImage: document.getElementById("session-qr-image"),
    sessionJoinState: document.getElementById("session-join-state"),
    sessionMode: document.getElementById("session-mode"),
    sessionPlayersCount: document.getElementById("session-players-count"),
    sessionTeamsCount: document.getElementById("session-teams-count"),
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
    commitRoundBtn: document.getElementById("commit-round-btn"),
    nextQuestionBtn: document.getElementById("next-question-btn"),

    roundQuestionIndex: document.getElementById("round-question-index"),
    roundHintsCount: document.getElementById("round-hints-count"),
    roundPointsValue: document.getElementById("round-points-value"),
    roundAnswersCount: document.getElementById("round-answers-count"),

    playersList: document.getElementById("players-list"),
    playersCountLabel: document.getElementById("players-count-label"),
    teamsList: document.getElementById("teams-list"),
    teamsCountLabel: document.getElementById("teams-count-label"),
    leaderboard: document.getElementById("leaderboard"),

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
        return { success: false, message: "انتهت الجلسة، يرجى تسجيل الدخول مجددًا." };
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
      if (els.sessionMode) els.sessionMode.textContent = "—";
      if (els.sessionPlayersCount) els.sessionPlayersCount.textContent = "0";
      if (els.sessionTeamsCount) els.sessionTeamsCount.textContent = "0";
      toggleSessionControls(false);
      return;
    }

    if (els.sessionBanner) els.sessionBanner.hidden = true;
    if (els.sessionCode) els.sessionCode.textContent = s.code || "------";
    if (els.sessionJoinState) els.sessionJoinState.textContent = s.joinOpen ? "مفتوح" : "مغلق";
    if (els.sessionMode) els.sessionMode.textContent = s.mode === "teams" ? "فرق" : "فردي";
    if (els.sessionPlayersCount) els.sessionPlayersCount.textContent = formatNumber(STATE.players.length);
    if (els.sessionTeamsCount) els.sessionTeamsCount.textContent = formatNumber(STATE.teams.length);

    if (els.sessionStatusBadge) {
      if (s.status === "ended") {
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
    if (!t || !t.total) {
      if (els.timerValue) els.timerValue.textContent = "--";
      if (els.timerBarFill) {
        els.timerBarFill.style.width = "0%";
        els.timerBarFill.removeAttribute("data-state");
      }
      return;
    }

    const now = Date.now();
    let remaining = 0;

    if (t.status === "running" && t.endsAt) {
      remaining = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
    } else if (t.status === "paused" && t.remainingMs) {
      remaining = Math.max(0, Math.ceil(t.remainingMs / 1000));
    } else {
      remaining = 0;
    }

    if (els.timerValue) els.timerValue.textContent = String(remaining);

    const pct = Math.min(100, Math.max(0, (remaining / t.total) * 100));
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
    if (els.roundHintsCount) els.roundHintsCount.textContent = String((q.revealedHints || []).length);
    if (els.roundPointsValue) els.roundPointsValue.textContent = String(q.currentPoints != null ? q.currentPoints : q.basePoints);
    if (els.roundAnswersCount) els.roundAnswersCount.textContent = String(q.answersCount || 0);

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

    toggleGameControls({
      canStartTimer: status === "idle" || status === "shown",
      canPause: status === "running",
      canResume: status === "paused",
      canNextHint: (q.revealedHints || []).length < (q.hints || []).length && status !== "revealed" && status !== "committed",
      canReveal: status !== "revealed" && status !== "committed" && status !== "moved",
      canCommit: status === "revealed" && !q.committed,
      canNext: status === "committed" || status === "revealed",
    });
  }

  function toggleGameControls(states) {
    if (els.startTimerBtn) els.startTimerBtn.disabled = !states.canStartTimer;
    if (els.pauseTimerBtn) els.pauseTimerBtn.disabled = !states.canPause;
    if (els.resumeTimerBtn) els.resumeTimerBtn.disabled = !states.canResume;
    if (els.nextHintBtn) els.nextHintBtn.disabled = !states.canNextHint;
    if (els.revealAnswerBtn) els.revealAnswerBtn.disabled = !states.canReveal;
    if (els.commitRoundBtn) els.commitRoundBtn.disabled = !states.canCommit;
    if (els.nextQuestionBtn) els.nextQuestionBtn.disabled = !states.canNext;
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

    STATE.players.forEach(function (player) {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML =
        '<div class="list-item-main">' +
          '<span class="list-item-name">' + escapeHtml(player.nickname) + "</span>" +
          '<span class="list-item-meta">' +
            (player.teamName ? "الفريق: " + escapeHtml(player.teamName) : "فردي") +
            " — " + formatNumber(player.score || 0) + " نقطة" +
          "</span>" +
        "</div>" +
        '<div class="list-item-actions">' +
          '<button type="button" class="icon-btn" data-action="kick" data-id="' + escapeHtml(player.id) + '" title="استبعاد">' +
            '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
          "</button>" +
        "</div>";

      div.querySelector('[data-action="kick"]').addEventListener("click", function () {
        confirmModal(
          "استبعاد لاعب",
          "هل تريد استبعاد اللاعب " + player.nickname + " من الجلسة؟",
          function () {
            kickPlayer(player.id);
          }
        );
      });

      els.playersList.appendChild(div);
    });
  }

  function renderTeams() {
    if (!els.teamsList) return;
    els.teamsList.innerHTML = "";

    if (els.teamsCountLabel) {
      els.teamsCountLabel.textContent = formatNumber(STATE.teams.length) + " فريق";
    }

    if (STATE.teams.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-note";
      p.textContent = "لا توجد فرق بعد.";
      els.teamsList.appendChild(p);
      return;
    }

    STATE.teams.forEach(function (team) {
      const div = document.createElement("div");
      div.className = "list-item";
      div.innerHTML =
        '<div class="list-item-main">' +
          '<span class="list-item-name">' + escapeHtml(team.name) + "</span>" +
          '<span class="list-item-meta">' +
            formatNumber(team.membersCount || 0) + " عضو — " +
            formatNumber(team.score || 0) + " نقطة" +
          "</span>" +
        "</div>";

      els.teamsList.appendChild(div);
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
      const item = document.createElement("div");
      item.className = "question-item";
      item.innerHTML =
        '<div class="question-item-main">' +
          '<span class="question-item-title">' + escapeHtml(q.answer) + "</span>" +
          '<span class="question-item-meta">' +
            "<span>المرجع: " + escapeHtml(q.reference || "—") + "</span>" +
            "<span>النقاط: " + formatNumber(q.basePoints || 10) + "</span>" +
            "<span>التلميحات: " + (q.hints ? q.hints.length : 0) + "</span>" +
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
          "هل تريد حذف سؤال \"" + q.answer + "\"؟ لا يمكن التراجع عن هذه العملية.",
          function () {
            deleteQuestion(q.id);
          }
        );
      });

      els.questionsList.appendChild(item);
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

  async function loadState() {
    try {
      const data = await api("/game/state");
      STATE.session = (data && data.session) || null;
      STATE.question = (data && data.question) || null;
      STATE.timer = (data && data.timer) || null;
      STATE.players = (data && data.players) || [];
      STATE.teams = (data && data.teams) || [];
      STATE.leaderboard = (data && data.leaderboard) || [];

      renderSession();
      renderTimer();
      renderGameStatus();
      renderPlayers();
      renderTeams();
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
      const mode = await askSessionMode();
      if (!mode) return;

      const data = await api("/game/session", {
        method: "POST",
        body: { mode: mode },
      });

      STATE.session = data && data.session;
      toast("تم إنشاء جلسة جديدة بنجاح.", "success");
      pushLog("تم إنشاء جلسة جديدة — الوضع: " + (mode === "teams" ? "فرق" : "فردي"), "success");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر إنشاء الجلسة.", "error");
    } finally {
      STATE.loading = false;
    }
  }

  function askSessionMode() {
    return new Promise(function (resolve) {
      openModal(
        "وضع اللعب",
        '<p class="confirm-text">اختر وضع اللعب لهذه الجلسة:</p>' +
          '<div class="form-field">' +
            '<label for="session-mode-select">الوضع</label>' +
            '<select id="session-mode-select">' +
              '<option value="solo">فردي</option>' +
              '<option value="teams">فرق</option>' +
            "</select>" +
          "</div>",
        [
          {
            label: "إلغاء",
            className: "btn-outline",
            onClick: function () {
              closeModal();
              resolve(null);
            },
          },
          {
            label: "إنشاء الجلسة",
            className: "btn-primary",
            onClick: function () {
              const select = document.getElementById("session-mode-select");
              const val = select ? select.value : "solo";
              closeModal();
              resolve(val);
            },
          },
        ]
      );
    });
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
    try {
      await api("/game/hint/next", { method: "POST" });
      pushLog("تم إتاحة تلميح إضافي.", "info");
      await loadState();
    } catch (e) {
      toast(e.message || "تعذر إتاحة التلميح.", "error");
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

  async function commitRound() {
    confirmModal(
      "اعتماد النتيجة",
      "هل تريد اعتماد نتيجة هذا السؤال وتثبيت النقاط؟",
      async function () {
        try {
          await api("/game/question/commit", { method: "POST" });
          pushLog("تم اعتماد نتيجة السؤال.", "success");
          await loadState();
        } catch (e) {
          toast(e.message || "تعذر اعتماد النتيجة.", "error");
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

  function openQuestionForm(question) {
    const isEdit = !!question;
    const q = question || {
      answer: "",
      reference: "",
      options: ["", "", "", ""],
      correctIndex: 0,
      hints: ["", "", ""],
      basePoints: 10,
      timeLimit: 30,
    };

    const optionsHtml = (q.options || ["", "", "", ""]).map(function (opt, i) {
      return (
        '<div class="form-field">' +
          '<label for="q-option-' + i + '">الاختيار ' + (i + 1) + "</label>" +
          '<input id="q-option-' + i + '" type="text" value="' + escapeHtml(opt) + '" />' +
        "</div>"
      );
    }).join("");

    const hintsHtml = (q.hints || ["", "", ""]).map(function (h, i) {
      return (
        '<div class="form-field">' +
          '<label for="q-hint-' + i + '">التلميح ' + (i + 1) + "</label>" +
          '<input id="q-hint-' + i + '" type="text" value="' + escapeHtml(h) + '" />' +
        "</div>"
      );
    }).join("");

    openModal(
      isEdit ? "تعديل سؤال" : "إضافة سؤال",
      '<div class="form-field">' +
        '<label for="q-answer">اسم الشخصية (الإجابة الصحيحة)</label>' +
        '<input id="q-answer" type="text" value="' + escapeHtml(q.answer) + '" />' +
      "</div>" +
      '<div class="form-field">' +
        '<label for="q-reference">المرجع الكتابي</label>' +
        '<input id="q-reference" type="text" value="' + escapeHtml(q.reference) + '" />' +
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
      '<div class="form-field">' +
        '<label for="q-correct">الاختيار الصحيح</label>' +
        '<select id="q-correct">' +
          [0, 1, 2, 3].map(function (i) {
            return '<option value="' + i + '"' + (i === (q.correctIndex || 0) ? " selected" : "") + ">الاختيار " + (i + 1) + "</option>";
          }).join("") +
        "</select>" +
      "</div>" +
      '<h4 class="form-field" style="margin:8px 0 0;">الاختيارات</h4>' +
      optionsHtml +
      '<h4 class="form-field" style="margin:8px 0 0;">التلميحات</h4>' +
      hintsHtml,
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
  }

  function collectQuestionForm(id) {
    const answer = (document.getElementById("q-answer") || {}).value || "";
    const reference = (document.getElementById("q-reference") || {}).value || "";
    const basePoints = Number((document.getElementById("q-points") || {}).value) || 10;
    const timeLimit = Number((document.getElementById("q-time") || {}).value) || 30;
    const correctIndex = Number((document.getElementById("q-correct") || {}).value) || 0;

    const options = [0, 1, 2, 3].map(function (i) {
      const el = document.getElementById("q-option-" + i);
      return el ? el.value.trim() : "";
    });

    const hints = [0, 1, 2].map(function (i) {
      const el = document.getElementById("q-hint-" + i);
      return el ? el.value.trim() : "";
    }).filter(function (h) { return h.length > 0; });

    if (!answer.trim()) {
      toast("يرجى إدخال اسم الشخصية.", "error");
      return null;
    }

    if (options.some(function (o) { return !o; })) {
      toast("يرجى إدخال جميع الاختيارات الأربعة.", "error");
      return null;
    }

    if (!options[correctIndex]) {
      toast("الاختيار الصحيح غير محدد.", "error");
      return null;
    }

    const payload = {
      answer: answer.trim(),
      reference: reference.trim(),
      options: options,
      correctIndex: correctIndex,
      hints: hints,
      basePoints: basePoints,
      timeLimit: timeLimit,
    };

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
        pushLog("تم تحديث سؤال: " + payload.answer, "success");
      } else {
        await api("/questions", {
          method: "POST",
          body: payload,
        });
        toast("تمت إضافة السؤال.", "success");
        pushLog("تمت إضافة سؤال جديد: " + payload.answer, "success");
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
    if (els.openJoinBtn) els.openJoinBtn.addEventListener("click", openJoin);
    if (els.closeJoinBtn) els.closeJoinBtn.addEventListener("click", closeJoin);
    if (els.endSessionBtn) els.endSessionBtn.addEventListener("click", endSession);
    if (els.copyCodeBtn) els.copyCodeBtn.addEventListener("click", copyCode);

    if (els.startTimerBtn) els.startTimerBtn.addEventListener("click", startTimer);
    if (els.pauseTimerBtn) els.pauseTimerBtn.addEventListener("click", pauseTimer);
    if (els.resumeTimerBtn) els.resumeTimerBtn.addEventListener("click", resumeTimer);
    if (els.nextHintBtn) els.nextHintBtn.addEventListener("click", nextHint);
    if (els.revealAnswerBtn) els.revealAnswerBtn.addEventListener("click", revealAnswer);
    if (els.commitRoundBtn) els.commitRoundBtn.addEventListener("click", commitRound);
    if (els.nextQuestionBtn) els.nextQuestionBtn.addEventListener("click", nextQuestion);

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
    startPolling();

    setInterval(function () {
      if (STATE.timer && STATE.timer.status === "running") renderTimer();
    }, 500);

    pushLog("تم فتح لوحة التحكم.", "info");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();