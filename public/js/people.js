(function () {
  "use strict";

  const API_BASE = "/api";
  const POLL_MS = 1500;
  const STORAGE_KEY = "who_am_i_player";

  const STATE = {
    sessionId: null,
    playerId: null,
    playerToken: null,
    nickname: "",
    screen: "join",
    questionId: null,
    submittedAnswer: null,
    score: 0,
    polling: null,
    submitting: false,
    timeUp: false,
    scanner: {
      stream: null,
      raf: null,
      active: false,
    },
  };

  const els = {
    connection: document.getElementById("connection-indicator"),
    connectionLabel: document.querySelector("#connection-indicator .label"),

    screenJoin: document.getElementById("screen-join"),
    screenWait: document.getElementById("screen-wait"),
    screenQuestion: document.getElementById("screen-question"),
    screenReveal: document.getElementById("screen-reveal"),
    screenScoreboard: document.getElementById("screen-scoreboard"),
    screenEnded: document.getElementById("screen-ended"),

    joinForm: document.getElementById("join-form"),
    joinCode: document.getElementById("join-code"),
    joinNickname: document.getElementById("join-nickname"),
    joinAlert: document.getElementById("join-alert"),
    joinSubmit: document.getElementById("join-submit"),
    joinSubmitLabel: document.querySelector("#join-submit .btn-label"),
    joinSubmitSpinner: document.querySelector("#join-submit .btn-spinner"),

    scanCodeBtn: document.getElementById("scan-code-btn"),
    scannerOverlay: document.getElementById("scanner-overlay"),
    scannerVideo: document.getElementById("scanner-video"),
    scannerHint: document.getElementById("scanner-hint"),
    scannerCloseBtn: document.getElementById("scanner-close-btn"),
    scannerCancelBtn: document.getElementById("scanner-cancel-btn"),
    scannerManualBtn: document.getElementById("scanner-manual-btn"),

    waitPlayerName: document.getElementById("wait-player-name"),
    leaveSessionBtn: document.getElementById("leave-session-btn"),

    qProgress: document.getElementById("q-progress"),
    qPoints: document.getElementById("q-points"),
    qQuestionText: document.getElementById("q-question-text"),
    qHintBadge: document.getElementById("q-hint-badge"),
    qHintBadgeLabel: document.getElementById("q-hint-badge-label"),
    playerHints: document.getElementById("player-hints"),
    optionsGrid: document.getElementById("options-grid"),
    answerStatus: document.getElementById("answer-status"),
    questionTimerFill: document.getElementById("question-timer-fill"),

    revealAnswer: document.getElementById("reveal-answer"),
    revealReference: document.getElementById("reveal-reference"),
    revealResult: document.getElementById("reveal-result"),

    scoreboardTitle: document.getElementById("scoreboard-title"),
    myScoreValue: document.getElementById("my-score-value"),
    myRank: document.getElementById("my-rank"),
    scoreboardLeaderboard: document.getElementById("scoreboard-leaderboard"),

    endedTitle: document.getElementById("ended-title"),
    endedSub: document.getElementById("ended-sub"),
    endedScoreValue: document.getElementById("ended-score-value"),
    endedLeaderboard: document.getElementById("ended-leaderboard"),
    backToJoinBtn: document.getElementById("back-to-join-btn"),

    playerScoreBadge: document.getElementById("player-score-badge"),
    playerScoreValue: document.getElementById("player-score-value"),
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
    if (typeof n !== "number" || !isFinite(n)) return "0";
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
    const headers = Object.assign(
      { Accept: "application/json" },
      opts.body ? { "Content-Type": "application/json" } : {}
    );
    if (STATE.playerToken) {
      headers["X-Player-Token"] = STATE.playerToken;
    }

    const res = await fetch(API_BASE + path, {
      method: opts.method || "GET",
      headers: headers,
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
      const message = (data && data.message) || "تعذر تنفيذ العملية.";
      const error = new Error(message);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function saveSession() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          sessionId: STATE.sessionId,
          playerId: STATE.playerId,
          playerToken: STATE.playerToken,
          nickname: STATE.nickname,
        })
      );
    } catch (e) {
    }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.playerToken || !data.sessionId || !data.playerId) return false;
      STATE.sessionId = data.sessionId;
      STATE.playerId = data.playerId;
      STATE.playerToken = data.playerToken;
      STATE.nickname = data.nickname || "";
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
    }
    STATE.sessionId = null;
    STATE.playerId = null;
    STATE.playerToken = null;
    STATE.nickname = "";
    STATE.submittedAnswer = null;
    STATE.questionId = null;
    STATE.timeUp = false;
  }

  function showScreen(name) {
    if (STATE.screen === name) return;
    STATE.screen = name;

    const map = {
      join: els.screenJoin,
      wait: els.screenWait,
      question: els.screenQuestion,
      reveal: els.screenReveal,
      scoreboard: els.screenScoreboard,
      ended: els.screenEnded,
    };

    Object.keys(map).forEach(function (key) {
      const el = map[key];
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

  function showAlert(type, message) {
    if (!els.joinAlert) return;
    els.joinAlert.dataset.type = type;
    els.joinAlert.textContent = message;
    els.joinAlert.hidden = false;
  }

  function hideAlert() {
    if (!els.joinAlert) return;
    els.joinAlert.hidden = true;
    els.joinAlert.textContent = "";
    els.joinAlert.removeAttribute("data-type");
  }

  function setFieldError(fieldId, message) {
    const err = document.querySelector('.field-error[data-error-for="' + fieldId + '"]');
    const input = document.getElementById(fieldId);
    if (err) {
      err.textContent = message;
      err.hidden = false;
    }
    if (input && input.parentElement) {
      input.parentElement.classList.add("invalid");
    }
  }

  function clearFieldErrors() {
    document.querySelectorAll(".field-error").forEach(function (el) {
      el.hidden = true;
      el.textContent = "";
    });
    document.querySelectorAll(".input-wrap").forEach(function (el) {
      el.classList.remove("invalid");
    });
  }

  function setJoinSubmitting(state) {
    STATE.submitting = state;
    if (els.joinSubmit) els.joinSubmit.disabled = state;
    if (els.joinSubmitLabel) {
      els.joinSubmitLabel.textContent = state ? "جارٍ الانضمام..." : "انضم الآن";
    }
    if (els.joinSubmitSpinner) {
      els.joinSubmitSpinner.hidden = !state;
    }
  }

  function validateJoin() {
    clearFieldErrors();
    let ok = true;
    const code = (els.joinCode.value || "").trim();
    const nickname = (els.joinNickname.value || "").trim();

    if (!/^\d{6}$/.test(code)) {
      setFieldError("join-code", "أدخل رمزًا مكوّنًا من 6 أرقام.");
      ok = false;
    }

    if (!nickname) {
      setFieldError("join-nickname", "أدخل اسمك المستعار.");
      ok = false;
    } else if (nickname.length < 2) {
      setFieldError("join-nickname", "الاسم قصير جدًا.");
      ok = false;
    } else if (nickname.length > 24) {
      setFieldError("join-nickname", "الاسم طويل جدًا.");
      ok = false;
    }

    return ok;
  }

  function updateScoreBadge() {
    if (!els.playerScoreBadge) return;
    if (STATE.screen === "join" || STATE.screen === "ended") {
      els.playerScoreBadge.hidden = true;
      return;
    }
    els.playerScoreBadge.hidden = false;
    if (els.playerScoreValue) {
      els.playerScoreValue.textContent = formatNumber(STATE.score);
    }
  }

  function renderWait() {
    if (els.waitPlayerName) els.waitPlayerName.textContent = STATE.nickname || "—";
    updateScoreBadge();
    showScreen("wait");
  }

  function applyTimeUpUI() {
    if (!els.optionsGrid) return;
    const buttons = els.optionsGrid.querySelectorAll(".option-btn");
    buttons.forEach(function (btn) {
      btn.disabled = true;
      if (!STATE.submittedAnswer) {
        btn.dataset.state = "locked";
      }
    });
    if (els.answerStatus && !STATE.submittedAnswer) {
      els.answerStatus.dataset.type = "info";
      els.answerStatus.textContent = "انتهى الوقت. لم يتم إرسال إجابة.";
      els.answerStatus.hidden = false;
    }
  }

  function renderQuestion(state) {
    const q = state.question;
    if (!q) return;

    if (els.qProgress) {
      els.qProgress.textContent = (q.order || 0) + " / " + (state.session.totalQuestions || "—");
    }
    if (els.qPoints) {
      els.qPoints.textContent = String(q.currentPoints != null ? q.currentPoints : q.basePoints || 10);
    }
    if (els.qQuestionText) {
      els.qQuestionText.textContent = q.question || "—";
    }

    const hints = q.revealedHints || [];
    if (els.qHintBadge) {
      if (hints.length === 0) {
        els.qHintBadge.dataset.state = "idle";
        if (els.qHintBadgeLabel) els.qHintBadgeLabel.textContent = "لم يُتاح تلميح بعد";
      } else {
        els.qHintBadge.dataset.state = "active";
        if (els.qHintBadgeLabel) {
          els.qHintBadgeLabel.textContent = "التلميحات المتاحة (" + hints.length + ")";
        }
      }
    }

    if (els.playerHints) {
      els.playerHints.innerHTML = "";
      hints.forEach(function (h) {
        const li = document.createElement("li");
        li.textContent = h;
        els.playerHints.appendChild(li);
      });
    }

    const options = q.options || [];
    const isSameQuestion = STATE.questionId === q.id;

    if (!isSameQuestion) {
      STATE.questionId = q.id;
      STATE.submittedAnswer = null;
      STATE.timeUp = false;
    }

    if (els.optionsGrid) {
      els.optionsGrid.innerHTML = "";
      options.forEach(function (opt) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "option-btn";
        btn.textContent = opt;
        btn.dataset.option = opt;

        if (STATE.submittedAnswer === opt) {
          btn.dataset.state = "selected";
          btn.disabled = true;
        } else if (STATE.submittedAnswer) {
          btn.disabled = true;
          btn.dataset.state = "locked";
        } else if (STATE.timeUp) {
          btn.disabled = true;
          btn.dataset.state = "locked";
        } else {
          btn.addEventListener("click", function () {
            submitAnswer(opt);
          });
        }

        els.optionsGrid.appendChild(btn);
      });
    }

    if (els.answerStatus) {
      if (STATE.submittedAnswer) {
        els.answerStatus.dataset.type = "success";
        els.answerStatus.textContent = "تم إرسال إجابتك. في انتظار كشف الإجابة.";
        els.answerStatus.hidden = false;
      } else if (STATE.timeUp) {
        els.answerStatus.dataset.type = "info";
        els.answerStatus.textContent = "انتهى الوقت. لم يتم إرسال إجابة.";
        els.answerStatus.hidden = false;
      } else {
        els.answerStatus.hidden = true;
      }
    }

    updateScoreBadge();
    showScreen("question");
  }

  function renderTimer(state) {
    const t = state.timer;
    if (!t || !t.total || !els.questionTimerFill) return;

    const now = Date.now();
    let remaining = 0;

    if (t.status === "running" && t.endsAt) {
      remaining = Math.max(0, Math.ceil((t.endsAt - now) / 1000));
    } else if (t.status === "paused" && t.remainingMs) {
      remaining = Math.max(0, Math.ceil(t.remainingMs / 1000));
    }

    const pct = Math.min(100, Math.max(0, (remaining / t.total) * 100));
    els.questionTimerFill.style.width = pct + "%";

    if (pct <= 20) els.questionTimerFill.dataset.state = "danger";
    else if (pct <= 50) els.questionTimerFill.dataset.state = "warning";
    else els.questionTimerFill.removeAttribute("data-state");

    if (t.status === "running" && remaining <= 0) {
      STATE.timeUp = true;
      applyTimeUpUI();
    }
  }

  function renderReveal(state) {
    const q = state.question;
    if (!q) return;

    if (els.revealAnswer) els.revealAnswer.textContent = q.correctAnswer || q.answer || "—";
    if (els.revealReference) {
      els.revealReference.textContent = q.reference ? "المرجع: " + q.reference : "";
    }

    if (els.revealResult) {
      if (!STATE.submittedAnswer) {
        els.revealResult.dataset.type = "neutral";
        els.revealResult.textContent = "لم تُرسل إجابة على هذا السؤال.";
        els.revealResult.hidden = false;
      } else if (STATE.submittedAnswer === q.correctAnswer) {
        els.revealResult.dataset.type = "correct";
        els.revealResult.textContent = "إجابتك صحيحة.";
        els.revealResult.hidden = false;
      } else {
        els.revealResult.dataset.type = "wrong";
        els.revealResult.textContent = "إجابتك غير صحيحة. الإجابة الصحيحة: " + q.correctAnswer;
        els.revealResult.hidden = false;
      }
    }

    if (state.me && typeof state.me.score === "number") {
      STATE.score = state.me.score;
    }

    updateScoreBadge();
    showScreen("reveal");
  }

  function renderLeaderboardInto(target, data) {
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

  function renderScoreboard(state) {
    const lb = state.leaderboard || [];
    const me = state.me || {};
    const myName = me.nickname || STATE.nickname;

    let rank = "—";
    for (let i = 0; i < lb.length; i++) {
      if (lb[i].name === myName) {
        rank = "ترتيبك: " + (i + 1) + " من " + lb.length;
        break;
      }
    }

    if (els.myScoreValue) els.myScoreValue.textContent = formatNumber(me.score || 0);
    if (els.myRank) els.myRank.textContent = rank;
    if (els.scoreboardTitle) els.scoreboardTitle.textContent = "ترتيبك";

    renderLeaderboardInto(els.scoreboardLeaderboard, lb);

    if (typeof me.score === "number") STATE.score = me.score;
    updateScoreBadge();
    showScreen("scoreboard");
  }

  function renderEnded(state) {
    const lb = state.leaderboard || [];
    const me = state.me || {};

    if (typeof me.score === "number") STATE.score = me.score;
    if (els.endedScoreValue) els.endedScoreValue.textContent = formatNumber(STATE.score);

    let winnerText = "";
    if (lb.length > 0) {
      winnerText = "الفائز: " + lb[0].name;
    }
    if (els.endedTitle) els.endedTitle.textContent = winnerText || "شكرًا لمشاركتك";
    if (els.endedSub) {
      els.endedSub.textContent = "برصيدك النهائي: " + formatNumber(STATE.score) + " نقطة";
    }

    renderLeaderboardInto(els.endedLeaderboard, lb);

    updateScoreBadge();
    showScreen("ended");
  }

  function decideScreen(state) {
    const s = state.session;
    const q = state.question;

    if (!s || !s.id) {
      clearSession();
      showScreen("join");
      return;
    }

    if (state.me && typeof state.me.score === "number") {
      STATE.score = state.me.score;
    }

    if (s.status === "ended") {
      renderEnded(state);
      return;
    }

    if (q) {
      if (q.status === "revealed") {
        renderReveal(state);
        return;
      }

      if (q.status === "committed" || q.status === "moved") {
        renderScoreboard(state);
        return;
      }

      if (
        q.status === "idle" ||
        q.status === "shown" ||
        q.status === "running" ||
        q.status === "paused" ||
        q.status === "ended"
      ) {
        renderQuestion(state);
        renderTimer(state);
        return;
      }
    }

    renderWait();
  }

  async function fetchState() {
    if (!STATE.playerToken) return;
    try {
      const data = await api("/game/player-state");
      decideScreen(data);
    } catch (e) {
      if (e.status === 401 || e.status === 404) {
        clearSession();
        showScreen("join");
      }
    }
  }

  function startPolling() {
    if (STATE.polling) clearInterval(STATE.polling);
    STATE.polling = setInterval(function () {
      if (!document.hidden && STATE.playerToken) fetchState();
    }, POLL_MS);
  }

  function stopPolling() {
    if (STATE.polling) {
      clearInterval(STATE.polling);
      STATE.polling = null;
    }
  }

  async function submitAnswer(answer) {
    if (STATE.submitting) return;
    if (STATE.submittedAnswer) return;
    if (STATE.timeUp) return;
    if (!STATE.playerToken) return;

    STATE.submitting = true;
    try {
      await api("/game/answer", {
        method: "POST",
        body: {
          questionId: STATE.questionId,
          answer: answer,
        },
      });

      STATE.submittedAnswer = answer;

      const buttons = els.optionsGrid ? els.optionsGrid.querySelectorAll(".option-btn") : [];
      buttons.forEach(function (btn) {
        if (btn.dataset.option === answer) {
          btn.dataset.state = "selected";
        } else {
          btn.dataset.state = "locked";
        }
        btn.disabled = true;
      });

      if (els.answerStatus) {
        els.answerStatus.dataset.type = "success";
        els.answerStatus.textContent = "تم إرسال إجابتك. في انتظار كشف الإجابة.";
        els.answerStatus.hidden = false;
      }
    } catch (e) {
      if (els.answerStatus) {
        els.answerStatus.dataset.type = "error";
        els.answerStatus.textContent = e.message || "تعذر إرسال الإجابة. حاول مجددًا.";
        els.answerStatus.hidden = false;
      }
    } finally {
      STATE.submitting = false;
    }
  }

  async function lookupSession(code) {
    return api("/game/session/lookup?code=" + encodeURIComponent(code));
  }

  async function joinSession(event) {
    event.preventDefault();
    if (STATE.submitting) return;
    hideAlert();

    const code = (els.joinCode.value || "").trim();

    if (!/^\d{6}$/.test(code)) {
      setFieldError("join-code", "أدخل رمزًا مكوّنًا من 6 أرقام.");
      return;
    }

    try {
      const lookup = await lookupSession(code);
      if (!lookup || !lookup.session) {
        setFieldError("join-code", "لا توجد جلسة بهذا الرمز.");
        return;
      }

      if (!validateJoin()) return;

      setJoinSubmitting(true);

      const res = await api("/game/join", {
        method: "POST",
        body: {
          code: code,
          nickname: (els.joinNickname.value || "").trim(),
        },
      });

      if (!res || !res.player) {
        showAlert("error", "تعذر الانضمام. حاول مرة أخرى.");
        return;
      }

      STATE.sessionId = res.session.id;
      STATE.playerId = res.player.id;
      STATE.playerToken = res.player.token;
      STATE.nickname = res.player.nickname;

      saveSession();

      showAlert("success", "تم الانضمام بنجاح.");
      renderWait();

      await fetchState();
      startPolling();
    } catch (e) {
      if (e.status === 404) {
        setFieldError("join-code", "لا توجد جلسة بهذا الرمز.");
      } else if (e.status === 403) {
        showAlert("error", e.message || "باب الانضمام مغلق حاليًا.");
      } else {
        showAlert("error", e.message || "تعذر الانضمام. حاول مرة أخرى.");
      }
    } finally {
      setJoinSubmitting(false);
    }
  }

  async function leaveSession() {
    if (!STATE.playerToken) return;
    try {
      await api("/game/leave", { method: "POST" });
    } catch (e) {
    }
    clearSession();
    stopPolling();
    showScreen("join");
  }

  function backToJoin() {
    clearSession();
    stopPolling();
    showScreen("join");
    if (els.joinForm) els.joinForm.reset();
    hideAlert();
    clearFieldErrors();
  }

  function openScanner() {
    if (!els.scannerOverlay) return;

    if (typeof window.jsQR !== "function") {
      showAlert("error", "خدمة مسح الرمز غير متاحة حاليًا. استخدم الإدخال اليدوي.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showAlert("error", "الكاميرا غير مدعومة على هذا الجهاز.");
      return;
    }

    els.scannerOverlay.hidden = false;
    els.scannerHint.dataset.state = "";
    els.scannerHint.textContent = "وجّه الكاميرا نحو رمز QR الخاص بالجلسة";

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(function (stream) {
        STATE.scanner.stream = stream;
        STATE.scanner.active = true;
        els.scannerVideo.srcObject = stream;
        els.scannerVideo.play().catch(function () {});
        scanLoop();
      })
      .catch(function () {
        els.scannerHint.dataset.state = "error";
        els.scannerHint.textContent = "تعذر فتح الكاميرا. تأكد من منح الإذن أو استخدم الإدخال اليدوي.";
      });
  }

  function closeScanner() {
    STATE.scanner.active = false;

    if (STATE.scanner.raf) {
      cancelAnimationFrame(STATE.scanner.raf);
      STATE.scanner.raf = null;
    }

    if (STATE.scanner.stream) {
      STATE.scanner.stream.getTracks().forEach(function (t) { t.stop(); });
      STATE.scanner.stream = null;
    }

    if (els.scannerVideo) {
      els.scannerVideo.pause();
      els.scannerVideo.srcObject = null;
    }

    if (els.scannerOverlay) els.scannerOverlay.hidden = true;
  }

  function scanLoop() {
    if (!STATE.scanner.active) return;
    if (!els.scannerVideo || els.scannerVideo.readyState !== els.scannerVideo.HAVE_ENOUGH_DATA) {
      STATE.scanner.raf = requestAnimationFrame(scanLoop);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = els.scannerVideo.videoWidth;
    canvas.height = els.scannerVideo.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(els.scannerVideo, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let result = null;
    try {
      result = window.jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });
    } catch (e) {
      result = null;
    }

    if (result && result.data) {
      const extracted = extractCodeFromQr(result.data);
      if (extracted) {
        els.joinCode.value = extracted;
        els.joinCode.dispatchEvent(new Event("input", { bubbles: true }));
        closeScanner();
        showAlert("success", "تم التقاط رمز الجلسة: " + extracted);
        return;
      }
    }

    STATE.scanner.raf = requestAnimationFrame(scanLoop);
  }

  function extractCodeFromQr(text) {
    if (!text || typeof text !== "string") return null;

    const trimmed = text.trim();

    if (/^\d{6}$/.test(trimmed)) return trimmed;

    try {
      const url = new URL(trimmed);
      const codeParam = url.searchParams.get("code");
      if (codeParam && /^\d{6}$/.test(codeParam)) return codeParam;
    } catch (e) {
    }

    const match = trimmed.match(/(\d{6})/);
    if (match) return match[1];

    return null;
  }

  function bindEvents() {
    if (els.joinForm) els.joinForm.addEventListener("submit", joinSession);
    if (els.leaveSessionBtn) els.leaveSessionBtn.addEventListener("click", leaveSession);
    if (els.backToJoinBtn) els.backToJoinBtn.addEventListener("click", backToJoin);

    if (els.scanCodeBtn) els.scanCodeBtn.addEventListener("click", openScanner);
    if (els.scannerCloseBtn) els.scannerCloseBtn.addEventListener("click", closeScanner);
    if (els.scannerCancelBtn) els.scannerCancelBtn.addEventListener("click", closeScanner);
    if (els.scannerManualBtn) {
      els.scannerManualBtn.addEventListener("click", function () {
        closeScanner();
        if (els.joinCode) els.joinCode.focus();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.scannerOverlay && !els.scannerOverlay.hidden) {
        closeScanner();
      }
    });

    if (els.joinCode) {
      els.joinCode.addEventListener("input", function () {
        els.joinCode.value = els.joinCode.value.replace(/\D/g, "").slice(0, 6);
        const wrap = els.joinCode.parentElement;
        if (wrap) wrap.classList.remove("invalid");
        const err = document.querySelector('.field-error[data-error-for="join-code"]');
        if (err) {
          err.hidden = true;
          err.textContent = "";
        }
      });
    }

    if (els.joinNickname) {
      els.joinNickname.addEventListener("input", function () {
        const wrap = els.joinNickname.parentElement;
        if (wrap) wrap.classList.remove("invalid");
        const err = document.querySelector('.field-error[data-error-for="join-nickname"]');
        if (err) {
          err.hidden = true;
          err.textContent = "";
        }
      });
    }

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && STATE.playerToken) fetchState();
    });

    window.addEventListener("focus", function () {
      if (STATE.playerToken) fetchState();
    });
  }

  async function init() {
    initConnectionWatcher();
    bindEvents();

    if (loadSession()) {
      renderWait();
      await fetchState();
      startPolling();
    } else {
      showScreen("join");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
