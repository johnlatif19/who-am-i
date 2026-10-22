const crypto = require("crypto");
const { getFirestore, COLLECTIONS, SESSION_SUBCOLLECTIONS } = require("../config/firebase");
const { isCloudinaryConfigured } = require("../config/cloudinary");

const DEFAULT_BASE_POINTS = 10;
const DEFAULT_TIME_LIMIT = 30;
const HINT_PENALTY = 5;
const MAX_HINTS_PER_QUESTION = 3;
const CODE_RETRIES = 12;
const CODE_LENGTH = 6;
const MAX_PLAYERS_PER_SESSION = Number(process.env.MAX_PLAYERS_PER_SESSION) || 50;

const SESSION_STATUS = {
  WAITING: "waiting",
  ACTIVE: "active",
  ENDED: "ended",
};

const QUESTION_STATUS = {
  IDLE: "idle",
  SHOWN: "shown",
  RUNNING: "running",
  PAUSED: "paused",
  ENDED: "ended",
  REVEALED: "revealed",
  COMMITTED: "committed",
  MOVED: "moved",
};

const TIMER_STATUS = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  ENDED: "ended",
};

function now() {
  return Date.now();
}

function db() {
  return getFirestore();
}

function validatePublicBaseUrl() {
  const url = process.env.PUBLIC_BASE_URL;
  const isDev = process.env.NODE_ENV !== "production";
  
  if (!url) {
    console.warn("[WARNING] PUBLIC_BASE_URL is not set. QR Codes will not be generated.");
    return;
  }

  try {
    const parsed = new URL(url);
    if (!isDev && parsed.protocol !== "https:") {
      console.error("[ERROR] PUBLIC_BASE_URL must use HTTPS in production.");
    }
    if (url.endsWith("/")) {
      console.warn("[WARNING] PUBLIC_BASE_URL should not end with a slash.");
    }
  } catch (e) {
    console.error("[ERROR] PUBLIC_BASE_URL is not a valid URL.");
  }
}

function generateSessionCode() {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += String(Math.floor(Math.random() * 10));
  }
  return code;
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

async function findFreeCode() {
  const ref = db().collection(COLLECTIONS.SESSIONS);
  for (let i = 0; i < CODE_RETRIES; i++) {
    const code = generateSessionCode();
    const snap = await ref
      .where("code", "==", code)
      .where("status", "in", [SESSION_STATUS.WAITING, SESSION_STATUS.ACTIVE])
      .limit(1)
      .get();
    if (snap.empty) return code;
  }
  throw Object.assign(new Error("تعذر توليد رمز جلسة فريد. حاول مرة أخرى."), { status: 500 });
}

async function buildJoinUrl(code) {
  const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  return base + "/people?code=" + code;
}

async function buildQrDataUrl(joinUrl) {
  if (!joinUrl) return null;
  try {
    const QRCode = require("qrcode");
    return await QRCode.toDataURL(joinUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 512,
      color: { dark: "#0a0e27", light: "#ffffff" },
    });
  } catch (e) {
    return null;
  }
}

async function createSession(mode, adminUsername) {
  const safeMode = "solo";
  const code = await findFreeCode();
  const joinUrl = await buildJoinUrl(code);
  const qrDataUrl = await buildQrDataUrl(joinUrl);
  const ts = now();

  const session = {
    code: code,
    mode: safeMode,
    status: SESSION_STATUS.WAITING,
    joinOpen: true,
    createdAt: ts,
    createdBy: adminUsername || "admin",
    endedAt: null,
    currentQuestionId: null,
    currentQuestionOrder: 0,
    totalQuestions: 0,
    joinUrl: joinUrl,
    qrDataUrl: qrDataUrl,
    timer: null,
    lastEventAt: ts,
  };

  const ref = await db().collection(COLLECTIONS.SESSIONS).add(session);
  await logEvent(ref.id, "session_created", "تم إنشاء جلسة جديدة");
  return Object.assign({ id: ref.id }, session);
}

async function getActiveSession() {
  const ref = db().collection(COLLECTIONS.SESSIONS);
  const snap = await ref
    .where("status", "in", [SESSION_STATUS.WAITING, SESSION_STATUS.ACTIVE])
    .limit(20)
    .get();
  if (snap.empty) return null;
  const docs = snap.docs.map(function (d) {
    return Object.assign({ id: d.id }, d.data());
  });
  docs.sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
  return docs[0];
}

async function getSessionById(sessionId) {
  if (!sessionId) return null;
  const doc = await db().collection(COLLECTIONS.SESSIONS).doc(sessionId).get();
  if (!doc.exists) return null;
  return Object.assign({ id: doc.id }, doc.data());
}

async function getSessionByCode(code) {
  if (!code) return null;
  const snap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .where("code", "==", code)
    .where("status", "in", [SESSION_STATUS.WAITING, SESSION_STATUS.ACTIVE])
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return Object.assign({ id: doc.id }, doc.data());
}

async function updateSession(sessionId, patch) {
  const ref = db().collection(COLLECTIONS.SESSIONS).doc(sessionId);
  await ref.set(Object.assign({}, patch, { lastEventAt: now() }), { merge: true });
  return getSessionById(sessionId);
}

async function openJoin(sessionId) {
  const s = await getSessionById(sessionId);
  if (!s) throw Object.assign(new Error("الجلسة غير موجودة."), { status: 404 });
  if (s.status === SESSION_STATUS.ENDED) {
    throw Object.assign(new Error("الجلسة منتهية."), { status: 400 });
  }
  await updateSession(sessionId, { joinOpen: true });
  await logEvent(sessionId, "join_opened", "تم فتح باب الانضمام");
  return true;
}

async function closeJoin(sessionId) {
  const s = await getSessionById(sessionId);
  if (!s) throw Object.assign(new Error("الجلسة غير موجودة."), { status: 404 });
  await updateSession(sessionId, { joinOpen: false });
  await logEvent(sessionId, "join_closed", "تم إغلاق باب الانضمام");
  return true;
}

async function endSession(sessionId) {
  const s = await getSessionById(sessionId);
  if (!s) throw Object.assign(new Error("الجلسة غير موجودة."), { status: 404 });
  await updateSession(sessionId, {
    status: SESSION_STATUS.ENDED,
    joinOpen: false,
    endedAt: now(),
  });
  await logEvent(sessionId, "session_ended", "تم إنهاء الجلسة");
  return true;
}

async function logEvent(sessionId, type, message) {
  if (!sessionId) return;
  try {
    await db()
      .collection(COLLECTIONS.SESSIONS)
      .doc(sessionId)
      .collection(SESSION_SUBCOLLECTIONS.EVENTS)
      .add({
        type: type,
        message: message,
        at: now(),
      });
  } catch (e) {
  }
}

async function listEvents(sessionId, limit) {
  const snap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.EVENTS)
    .orderBy("at", "desc")
    .limit(limit || 50)
    .get();
  return snap.docs.map(function (d) {
    return Object.assign({ id: d.id }, d.data());
  });
}

async function isNicknameTaken(sessionId, nickname) {
  const snap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .where("nicknameLower", "==", nickname.toLowerCase())
    .limit(1)
    .get();
  return !snap.empty;
}

async function addPlayer(sessionId, nickname) {
  const s = await getSessionById(sessionId);
  if (!s) throw Object.assign(new Error("الجلسة غير موجودة."), { status: 404 });
  if (s.status === SESSION_STATUS.ENDED) {
    throw Object.assign(new Error("الجلسة منتهية."), { status: 400 });
  }
  if (!s.joinOpen) {
    throw Object.assign(new Error("باب الانضمام مغلق حاليًا."), { status: 403 });
  }

  const taken = await isNicknameTaken(sessionId, nickname);
  if (taken) {
    throw Object.assign(new Error("الاسم المستعار مستخدم بالفعل في هذه الجلسة."), { status: 409 });
  }

  const sessionRef = db().collection(COLLECTIONS.SESSIONS).doc(sessionId);
  const playersRef = sessionRef.collection(SESSION_SUBCOLLECTIONS.PLAYERS);

  const token = generateToken();
  const ts = now();
  const player = {
    nickname: nickname,
    nicknameLower: nickname.toLowerCase(),
    token: token,
    score: 0,
    joinedAt: ts,
    lastSeenAt: ts,
    active: true,
    kicked: false,
  };

  let newPlayerId = null;

  await db().runTransaction(async (transaction) => {
    const playersQuery = playersRef.where("kicked", "==", false);
    const playersSnap = await transaction.get(playersQuery);

    if (playersSnap.size >= MAX_PLAYERS_PER_SESSION) {
      throw Object.assign(new Error("عذرًا، الجلسة ممتلئة (الحد الأقصى " + MAX_PLAYERS_PER_SESSION + " لاعب)."), { status: 403 });
    }

    const newPlayerRef = playersRef.doc();
    transaction.set(newPlayerRef, player);
    newPlayerId = newPlayerRef.id;
  });

  await logEvent(sessionId, "player_joined", "انضم اللاعب: " + nickname);
  return Object.assign({ id: newPlayerId }, player);
}

async function getPlayerByToken(sessionId, token) {
  if (!sessionId || !token) return null;
  const snap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .where("token", "==", token)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  if (data.kicked || data.active === false) return null;
  return Object.assign({ id: doc.id }, data);
}

async function getPlayerById(sessionId, playerId) {
  if (!sessionId || !playerId) return null;
  const doc = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .doc(playerId)
    .get();
  if (!doc.exists) return null;
  return Object.assign({ id: doc.id }, doc.data());
}

async function listPlayers(sessionId) {
  const snap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .where("kicked", "==", false)
    .get();
  return snap.docs.map(function (d) {
    return Object.assign({ id: d.id }, d.data());
  });
}

async function kickPlayer(sessionId, playerId) {
  const ref = db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .doc(playerId);
  const doc = await ref.get();
  if (!doc.exists) throw Object.assign(new Error("اللاعب غير موجود."), { status: 404 });
  await ref.set({ kicked: true, active: false }, { merge: true });
  await logEvent(sessionId, "player_kicked", "تم استبعاد لاعب من الجلسة");
  return true;
}

async function leaveSession(sessionId, playerId) {
  const ref = db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .doc(playerId);
  const doc = await ref.get();
  if (!doc.exists) return true;
  await ref.set({ active: false, token: null, leftAt: now() }, { merge: true });
  return true;
}

async function pickQuestions(count) {
  const snap = await db().collection(COLLECTIONS.QUESTIONS).get();
  const all = snap.docs.map(function (d) {
    return Object.assign({ id: d.id }, d.data());
  });
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = all[i];
    all[i] = all[j];
    all[j] = tmp;
  }
  return all.slice(0, Math.max(0, count || all.length));
}

function buildSessionQuestionItem(q, idx) {
  const base = {
    questionId: q.id,
    order: idx + 1,
    status: QUESTION_STATUS.IDLE,
    type: q.type || "who-am-i",
    basePoints: q.basePoints || DEFAULT_BASE_POINTS,
    currentPoints: q.basePoints || DEFAULT_BASE_POINTS,
    timeLimit: q.timeLimit || DEFAULT_TIME_LIMIT,
    revealedHints: [],
    playerHints: {},
    committed: false,
    answersCount: 0,
    correctCount: 0,
    startedAt: null,
    endsAt: null,
    remainingMs: null,
    revealedAt: null,
    committedAt: null,
    reference: q.reference || "",
  };

  if (base.type === "who-am-i") {
    base.answer = q.answer || "";
    base.options = q.options || [];
    base.correctIndex = typeof q.correctIndex === "number" ? q.correctIndex : 0;
    base.hints = q.hints || [];
  } else if (base.type === "multiple-choice") {
    base.options = q.options || [];
    base.correctIndex = typeof q.correctIndex === "number" ? q.correctIndex : 0;
  } else if (base.type === "true-false") {
    base.correctAnswer = !!q.correctAnswer;
  }

  return base;
}

async function attachQuestionsToSession(sessionId, questions) {
  const list = questions.map(function (q, idx) {
    return buildSessionQuestionItem(q, idx);
  });

  await updateSession(sessionId, {
    status: SESSION_STATUS.ACTIVE,
    totalQuestions: list.length,
    currentQuestionOrder: 0,
    currentQuestionId: null,
    questions: list,
  });

  return list;
}

async function getQuestionById(questionId) {
  if (!questionId) return null;
  const doc = await db().collection(COLLECTIONS.QUESTIONS).doc(questionId).get();
  if (!doc.exists) return null;
  return Object.assign({ id: doc.id }, doc.data());
}

async function listAllQuestions() {
  const snap = await db().collection(COLLECTIONS.QUESTIONS).orderBy("createdAt", "desc").get();
  return snap.docs.map(function (d) {
    return Object.assign({ id: d.id }, d.data());
  });
}

async function createQuestion(data) {
  const ts = now();
  const doc = {
    type: data.type || "who-am-i",
    question: data.question,
    reference: data.reference || "",
    basePoints: data.basePoints != null ? data.basePoints : DEFAULT_BASE_POINTS,
    timeLimit: data.timeLimit != null ? data.timeLimit : DEFAULT_TIME_LIMIT,
    createdAt: ts,
    updatedAt: ts,
  };

  if (doc.type === "who-am-i") {
    doc.answer = data.answer;
    doc.description = data.description || "";
    doc.options = data.options;
    doc.correctIndex = data.correctIndex;
    doc.hints = data.hints || [];
  } else if (doc.type === "multiple-choice") {
    doc.description = data.description || "";
    doc.options = data.options;
    doc.correctIndex = data.correctIndex;
  } else if (doc.type === "true-false") {
    doc.description = data.description || "";
    doc.correctAnswer = !!data.correctAnswer;
  }

  const ref = await db().collection(COLLECTIONS.QUESTIONS).add(doc);
  return Object.assign({ id: ref.id }, doc);
}

async function updateQuestion(questionId, data) {
  const ref = db().collection(COLLECTIONS.QUESTIONS).doc(questionId);
  const doc = await ref.get();
  if (!doc.exists) throw Object.assign(new Error("السؤال غير موجود."), { status: 404 });

  const patch = Object.assign({}, data, { updatedAt: now() });
  delete patch.id;

  await ref.set(patch, { merge: true });
  const updated = await ref.get();
  return Object.assign({ id: updated.id }, updated.data());
}

async function deleteQuestion(questionId) {
  const ref = db().collection(COLLECTIONS.QUESTIONS).doc(questionId);
  const doc = await ref.get();
  if (!doc.exists) throw Object.assign(new Error("السؤال غير موجود."), { status: 404 });
  await ref.delete();
  return { id: questionId };
}

async function setCurrentQuestion(sessionId, order, options) {
  const s = await getSessionById(sessionId);
  if (!s) throw Object.assign(new Error("الجلسة غير موجودة."), { status: 404 });

  const list = s.questions || [];
  const idx = order - 1;
  if (idx < 0 || idx >= list.length) {
    throw Object.assign(new Error("ترتيب السؤال غير صالح."), { status: 400 });
  }

  const autoStartTimer = !options || options.autoStartTimer !== false;
  const ts = now();

  const item = list[idx];
  const total = item.timeLimit || DEFAULT_TIME_LIMIT;
  item.status = autoStartTimer ? QUESTION_STATUS.RUNNING : QUESTION_STATUS.SHOWN;
  item.startedAt = ts;
  item.endsAt = autoStartTimer ? ts + total * 1000 : null;
  item.remainingMs = null;
  item.revealedHints = [];
  item.playerHints = {};
  item.committed = false;
  item.currentPoints = item.basePoints;
  item.answersCount = 0;
  item.correctCount = 0;
  item.revealedAt = null;
  item.committedAt = null;

  list[idx] = item;

  await updateSession(sessionId, {
    currentQuestionId: item.questionId,
    currentQuestionOrder: order,
    questions: list,
    timer: {
      status: autoStartTimer ? TIMER_STATUS.RUNNING : TIMER_STATUS.IDLE,
      total: total,
      startedAt: item.startedAt,
      endsAt: item.endsAt,
      remainingMs: null,
    },
  });

  await logEvent(sessionId, "question_shown", "تم عرض السؤال رقم " + order);
  return item;
}

async function getCurrentQuestion(sessionId, playerId) {
  const s = await getSessionById(sessionId);
  if (!s) return null;
  const list = s.questions || [];
  const idx = s.currentQuestionOrder - 1;
  if (idx < 0 || idx >= list.length) return null;
  const item = list[idx];
  const q = await getQuestionById(item.questionId);
  if (!q) return null;

  const globalHints = item.revealedHints || [];
  const playerHintsMap = item.playerHints || {};
  const personalHints = playerId && playerHintsMap[playerId] ? playerHintsMap[playerId] : [];
  const mergedHints = globalHints.concat(personalHints);

  const base = Object.assign({}, q, {
    order: item.order,
    status: item.status,
    type: item.type || q.type || "who-am-i",
    basePoints: item.basePoints,
    currentPoints: item.currentPoints,
    timeLimit: item.timeLimit,
    revealedHints: mergedHints,
    globalHints: globalHints,
    personalHints: personalHints,
    playerHints: playerHintsMap,
    committed: item.committed,
    answersCount: item.answersCount,
    correctCount: item.correctCount,
    startedAt: item.startedAt,
    endsAt: item.endsAt,
    remainingMs: item.remainingMs,
    reference: item.reference || q.reference || "",
  });

  if (base.type === "who-am-i") {
    base.answer = item.answer || q.answer || "";
    base.options = item.options || q.options || [];
    base.correctIndex = typeof item.correctIndex === "number" ? item.correctIndex : q.correctIndex;
    base.hints = item.hints || q.hints || [];
  } else if (base.type === "multiple-choice") {
    base.options = item.options || q.options || [];
    base.correctIndex = typeof item.correctIndex === "number" ? item.correctIndex : q.correctIndex;
  } else if (base.type === "true-false") {
    base.correctAnswer = typeof item.correctAnswer === "boolean" ? item.correctAnswer : !!q.correctAnswer;
  }

  return base;
}

async function updateQuestionInSession(sessionId, updater) {
  const s = await getSessionById(sessionId);
  if (!s) throw Object.assign(new Error("الجلسة غير موجودة."), { status: 404 });
  const list = s.questions || [];
  const idx = s.currentQuestionOrder - 1;
  if (idx < 0 || idx >= list.length) {
    throw Object.assign(new Error("لا يوجد سؤال حالي."), { status: 400 });
  }
  const item = list[idx];
  const next = updater(Object.assign({}, item)) || item;
  list[idx] = next;
  await updateSession(sessionId, { questions: list });
  return next;
}

async function startTimer(sessionId) {
  return updateQuestionInSession(sessionId, function (item) {
    if (item.status === QUESTION_STATUS.REVEALED || item.status === QUESTION_STATUS.COMMITTED) return item;
    const total = item.timeLimit || DEFAULT_TIME_LIMIT;
    item.status = QUESTION_STATUS.RUNNING;
    item.startedAt = now();
    item.endsAt = item.startedAt + total * 1000;
    item.remainingMs = null;

    db().collection(COLLECTIONS.SESSIONS).doc(sessionId).set({
      timer: {
        status: TIMER_STATUS.RUNNING,
        total: total,
        startedAt: item.startedAt,
        endsAt: item.endsAt,
        remainingMs: null,
      },
      lastEventAt: now(),
    }, { merge: true }).catch(function () {});

    return item;
  });
}

async function pauseTimer(sessionId) {
  const s = await getSessionById(sessionId);
  if (!s || !s.timer || s.timer.status !== TIMER_STATUS.RUNNING) {
    throw Object.assign(new Error("المؤقت لا يعمل حاليًا."), { status: 400 });
  }
  const remainingMs = Math.max(0, (s.timer.endsAt || 0) - now());

  await updateSession(sessionId, {
    timer: {
      status: TIMER_STATUS.PAUSED,
      total: s.timer.total,
      startedAt: s.timer.startedAt,
      endsAt: null,
      remainingMs: remainingMs,
    },
  });

  await updateQuestionInSession(sessionId, function (item) {
    item.status = QUESTION_STATUS.PAUSED;
    item.remainingMs = remainingMs;
    item.endsAt = null;
    return item;
  });

  await logEvent(sessionId, "timer_paused", "تم إيقاف المؤقت مؤقتًا");
  return true;
}

async function resumeTimer(sessionId) {
  const s = await getSessionById(sessionId);
  if (!s || !s.timer || s.timer.status !== TIMER_STATUS.PAUSED) {
    throw Object.assign(new Error("المؤقت غير متوقف."), { status: 400 });
  }
  const remainingMs = Math.max(0, s.timer.remainingMs || 0);
  const endsAt = now() + remainingMs;

  await updateSession(sessionId, {
    timer: {
      status: TIMER_STATUS.RUNNING,
      total: s.timer.total,
      startedAt: now(),
      endsAt: endsAt,
      remainingMs: null,
    },
  });

  await updateQuestionInSession(sessionId, function (item) {
    item.status = QUESTION_STATUS.RUNNING;
    item.endsAt = endsAt;
    item.remainingMs = null;
    return item;
  });

  await logEvent(sessionId, "timer_resumed", "تم استئناف المؤقت");
  return true;
}

async function revealNextHint(sessionId, playerId) {
  const q = await getCurrentQuestion(sessionId, playerId);
  if (!q) throw Object.assign(new Error("لا يوجد سؤال حالي."), { status: 400 });

  if (q.status === QUESTION_STATUS.REVEALED || q.status === QUESTION_STATUS.COMMITTED) {
    throw Object.assign(new Error("لا يمكن إتاحة تلميح بعد كشف الإجابة."), { status: 400 });
  }

  if (q.type !== "who-am-i") {
    throw Object.assign(new Error("التلميحات متاحة فقط لأسئلة «من أنا؟»."), { status: 400 });
  }

  const hints = q.hints || [];
  const globalHints = q.globalHints || [];
  const personalHints = q.personalHints || [];

  if (hints.length === 0) {
    throw Object.assign(new Error("لا توجد تلميحات متاحة لهذا السؤال."), { status: 400 });
  }

  if (playerId) {
    const seenForPlayer = globalHints.length + personalHints.length;
    if (seenForPlayer >= hints.length) {
      throw Object.assign(new Error("تم إتاحة كل التلميحات لهذا اللاعب."), { status: 400 });
    }
    if (seenForPlayer >= MAX_HINTS_PER_QUESTION) {
      throw Object.assign(
        new Error("تم الوصول للحد الأقصى من التلميحات لهذا السؤال (" + MAX_HINTS_PER_QUESTION + ")."),
        { status: 400 }
      );
    }
    const nextHint = hints[seenForPlayer];

    await updateQuestionInSession(sessionId, function (item) {
      const map = Object.assign({}, item.playerHints || {});
      const arr = map[playerId] ? map[playerId].slice() : [];
      arr.push(nextHint);
      map[playerId] = arr;
      item.playerHints = map;
      return item;
    });

    await logEvent(sessionId, "hint_revealed_personal", "تم إتاحة تلميح خاص للاعب");
    return { personal: true, playerId: playerId, hint: nextHint };
  }

  if (globalHints.length >= hints.length) {
    throw Object.assign(new Error("تم إتاحة كل التلميحات."), { status: 400 });
  }
  if (globalHints.length >= MAX_HINTS_PER_QUESTION) {
    throw Object.assign(
      new Error("تم الوصول للحد الأقصى من التلميحات العامة (" + MAX_HINTS_PER_QUESTION + ")."),
      { status: 400 }
    );
  }

  const nextHint = hints[globalHints.length];
  const updatedGlobal = globalHints.concat([nextHint]);

  await updateQuestionInSession(sessionId, function (item) {
    item.revealedHints = updatedGlobal;
    item.currentPoints = Math.max(0, item.basePoints - HINT_PENALTY * updatedGlobal.length);
    return item;
  });

  await logEvent(sessionId, "hint_revealed", "تم إتاحة تلميح رقم " + updatedGlobal.length);
  return { personal: false, hint: nextHint };
}

async function revealAnswer(sessionId) {
  await updateQuestionInSession(sessionId, function (item) {
    item.status = QUESTION_STATUS.REVEALED;
    item.revealedAt = now();
    item.endsAt = null;
    item.remainingMs = null;
    return item;
  });

  const s = await getSessionById(sessionId);
  if (s && s.timer && s.timer.status !== TIMER_STATUS.IDLE) {
    await updateSession(sessionId, {
      timer: {
        status: TIMER_STATUS.ENDED,
        total: s.timer.total,
        startedAt: s.timer.startedAt,
        endsAt: null,
        remainingMs: 0,
      },
    });
  }

  await logEvent(sessionId, "answer_revealed", "تم كشف الإجابة الصحيحة");
  return true;
}

async function markQuestionCommitted(sessionId) {
  await updateQuestionInSession(sessionId, function (item) {
    item.status = QUESTION_STATUS.COMMITTED;
    item.committed = true;
    item.committedAt = now();
    return item;
  });
  return true;
}

async function markQuestionMoved(sessionId) {
  await updateQuestionInSession(sessionId, function (item) {
    item.status = QUESTION_STATUS.MOVED;
    return item;
  });
  return true;
}

async function getSessionStats(sessionId) {
  const players = await listPlayers(sessionId);
  return { playersCount: players.length };
}

function canStartTimer(item) {
  if (!item) return false;
  return item.status === QUESTION_STATUS.IDLE || item.status === QUESTION_STATUS.SHOWN;
}

function isCloudinaryReady() {
  return isCloudinaryConfigured();
}

module.exports = {
  SESSION_STATUS,
  QUESTION_STATUS,
  TIMER_STATUS,
  DEFAULT_BASE_POINTS,
  DEFAULT_TIME_LIMIT,
  HINT_PENALTY,
  MAX_HINTS_PER_QUESTION,

  createSession,
  getActiveSession,
  getSessionById,
  getSessionByCode,
  updateSession,
  openJoin,
  closeJoin,
  endSession,

  logEvent,
  listEvents,

  addPlayer,
  getPlayerByToken,
  getPlayerById,
  listPlayers,
  kickPlayer,
  leaveSession,

  pickQuestions,
  attachQuestionsToSession,
  getCurrentQuestion,
  setCurrentQuestion,
  getQuestionById,
  listAllQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,

  startTimer,
  pauseTimer,
  resumeTimer,
  revealNextHint,
  revealAnswer,
  markQuestionCommitted,
  markQuestionMoved,
  updateQuestionInSession,

  getSessionStats,
  canStartTimer,
  isCloudinaryReady,
  validatePublicBaseUrl,

  buildJoinUrl,
  buildQrDataUrl,
  generateSessionCode,
  generateToken,
};