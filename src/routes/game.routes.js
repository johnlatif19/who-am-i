const express = require("express");

const { adminAuth, viewerOrAdminAuth } = require("../middleware/admin-auth");
const {
  validateBody,
  createSessionSchema,
  joinSessionSchema,
  answerSchema,
  isValidSessionCode,
  normalizeNickname,
} = require("../utils/validation");

const {
  createSession,
  getActiveSession,
  getSessionByCode,
  getSessionById,
  openJoin,
  closeJoin,
  endSession,
  addPlayer,
  getPlayerByToken,
  getPlayerById,
  listPlayers,
  kickPlayer,
  leaveSession,
  pickQuestions,
  attachQuestionsToSession,
  setCurrentQuestion,
  getCurrentQuestion,
  startTimer,
  pauseTimer,
  resumeTimer,
  revealNextHint,
  revealAnswer,
  markQuestionCommitted,
  markQuestionMoved,
  logEvent,
  listEvents,
  SESSION_STATUS,
  QUESTION_STATUS,
} = require("../services/game.service");

const {
  hasAlreadyAnswered,
  recordAnswer,
  isAnswerCorrect,
  commitRound,
  finalizeSession,
  getOriginalQuestionDoc,
} = require("../services/scoring.service");

const {
  buildAdminState,
  buildPlayerState,
  buildViewerState,
  buildPublicStats,
} = require("../services/realtime.service");

const { getQuizQuestions } = require("../services/quiz.service");

const { getFirestore, COLLECTIONS } = require("../config/firebase");

const router = express.Router();

const PLAYER_TOKEN_HEADER = "x-player-token";

function getPlayerToken(req) {
  const h = req.headers[PLAYER_TOKEN_HEADER];
  if (typeof h === "string" && h.length > 0) return h;
  return null;
}

async function requireActiveSession(req, res, next) {
  const session = await getActiveSession();
  if (!session) {
    return res.status(404).json({ success: false, message: "لا توجد جلسة نشطة." });
  }
  req.session = session;
  return next();
}

async function requireCurrentQuestion(req, res, next) {
  const session = req.session || (await getSessionById(req.params.sessionId));
  if (!session) {
    return res.status(404).json({ success: false, message: "الجلسة غير موجودة." });
  }
  const question = await getCurrentQuestion(session.id);
  if (!question) {
    return res.status(404).json({ success: false, message: "لا يوجد سؤال حالي." });
  }
  req.session = session;
  req.question = question;
  return next();
}

router.get("/public-stats", async function (req, res) {
  try {
    const snapshot = await getFirestore()
      .collection(COLLECTIONS.SESSIONS)
      .where("status", "in", [SESSION_STATUS.WAITING, SESSION_STATUS.ACTIVE])
      .get();

    let playersCount = 0;
    for (const doc of snapshot.docs) {
      const ps = await getFirestore()
        .collection(COLLECTIONS.SESSIONS)
        .doc(doc.id)
        .collection("players")
        .where("kicked", "==", false)
        .get();
      playersCount += ps.size;
    }

    return res.json(buildPublicStats(snapshot.size, playersCount));
  } catch (e) {
    return res.json({ activeSessions: 0, activePlayers: 0, at: Date.now() });
  }
});

router.get("/session/lookup", async function (req, res) {
  try {
    const code = String(req.query.code || "").trim();
    if (!isValidSessionCode(code)) {
      return res.status(400).json({ success: false, message: "رمز الجلسة غير صالح." });
    }

    const session = await getSessionByCode(code);
    if (!session) {
      return res.status(404).json({ success: false, message: "لا توجد جلسة بهذا الرمز." });
    }

    return res.json({
      success: true,
      session: {
        id: session.id,
        code: session.code,
        mode: session.mode,
        status: session.status,
        joinOpen: !!session.joinOpen,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر التحقق من الجلسة." });
  }
});

router.get("/state", adminAuth, async function (req, res) {
  try {
    const state = await buildAdminState();
    return res.json(Object.assign({ success: true }, state));
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر تحميل حالة اللعبة." });
  }
});

router.get("/viewer-state", viewerOrAdminAuth, async function (req, res) {
  try {
    const state = await buildViewerState();
    return res.json(Object.assign({ success: true }, state));
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر تحميل حالة العرض." });
  }
});

router.post("/session", adminAuth, validateBody(createSessionSchema), async function (req, res) {
  try {
    const existing = await getActiveSession();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "توجد جلسة نشطة بالفعل. أنهِ الجلسة الحالية قبل إنشاء واحدة جديدة.",
      });
    }

    const session = await createSession("solo", req.admin ? req.admin.username : "admin");
    return res.json({ success: true, session: session });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر إنشاء الجلسة." });
  }
});

router.post("/session/start-from-quiz", adminAuth, async function (req, res) {
  try {
    const quizId = req.body && typeof req.body.quizId === "string" ? req.body.quizId.trim() : "";
    if (!quizId) {
      return res.status(400).json({ success: false, message: "معرّف المسابقة مطلوب." });
    }

    const existing = await getActiveSession();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "توجد جلسة نشطة بالفعل. أنهِ الجلسة الحالية قبل إنشاء واحدة جديدة.",
      });
    }

    const result = await getQuizQuestions(quizId);
    if (!result.questions || result.questions.length === 0) {
      return res.status(400).json({ success: false, message: "المسابقة لا تحتوي على أسئلة صالحة." });
    }

    const session = await createSession("solo", req.admin ? req.admin.username : "admin");
    await attachQuestionsToSession(session.id, result.questions);
    await setCurrentQuestion(session.id, 1);

    await logEvent(session.id, "quiz_started", "تم بدء جلسة من مسابقة: " + (result.quiz.name || ""));

    const updated = await getSessionById(session.id);
    return res.json({ success: true, session: updated });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر بدء الجلسة من المسابقة." });
  }
});

router.post("/session/join/open", adminAuth, requireActiveSession, async function (req, res) {
  try {
    await openJoin(req.session.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر فتح باب الانضمام." });
  }
});

router.post("/session/join/close", adminAuth, requireActiveSession, async function (req, res) {
  try {
    await closeJoin(req.session.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر إغلاق باب الانضمام." });
  }
});

router.post("/session/end", adminAuth, requireActiveSession, async function (req, res) {
  try {
    await endSession(req.session.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر إنهاء الجلسة." });
  }
});

router.post("/session/finalize", adminAuth, requireActiveSession, async function (req, res) {
  try {
    if (req.session.finalized) {
      return res.status(400).json({ success: false, message: "تم اعتماد النتيجة النهائية بالفعل لهذه الجلسة." });
    }
    const result = await finalizeSession(req.session.id, req.session);
    return res.json({ success: true, result: result });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر اعتماد النتيجة النهائية." });
  }
});

router.get("/events", adminAuth, requireActiveSession, async function (req, res) {
  try {
    const events = await listEvents(req.session.id, 50);
    return res.json({ success: true, events: events });
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر تحميل سجل الأحداث." });
  }
});

router.post("/join", validateBody(joinSessionSchema), async function (req, res) {
  try {
    const { code, nickname } = req.validatedBody;

    const session = await getSessionByCode(code);
    if (!session) {
      return res.status(404).json({ success: false, message: "لا توجد جلسة بهذا الرمز." });
    }

    if (session.status === SESSION_STATUS.ENDED) {
      return res.status(400).json({ success: false, message: "الجلسة منتهية." });
    }

    if (!session.joinOpen) {
      return res.status(403).json({ success: false, message: "باب الانضمام مغلق حاليًا." });
    }

    const cleanNickname = normalizeNickname(nickname);
    const player = await addPlayer(session.id, cleanNickname);

    return res.json({
      success: true,
      session: {
        id: session.id,
        code: session.code,
        mode: session.mode,
        status: session.status,
      },
      player: {
        id: player.id,
        nickname: player.nickname,
        token: player.token,
        score: 0,
      },
    });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر الانضمام." });
  }
});

router.get("/player-state", async function (req, res) {
  try {
    const token = getPlayerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "لا توجد هوية لاعب." });
    }

    const session = await getActiveSession();
    if (!session) {
      return res.status(404).json({ success: false, message: "لا توجد جلسة نشطة." });
    }

    const player = await getPlayerByToken(session.id, token);
    if (!player) {
      return res.status(401).json({ success: false, message: "هوية اللاعب غير صالحة." });
    }

    const state = await buildPlayerState(player, session);
    return res.json(Object.assign({ success: true }, state));
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر تحميل حالة اللاعب." });
  }
});

router.post("/answer", validateBody(answerSchema), async function (req, res) {
  try {
    const token = getPlayerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "لا توجد هوية لاعب." });
    }

    const session = await getActiveSession();
    if (!session) {
      return res.status(404).json({ success: false, message: "لا توجد جلسة نشطة." });
    }

    const player = await getPlayerByToken(session.id, token);
    if (!player) {
      return res.status(401).json({ success: false, message: "هوية اللاعب غير صالحة." });
    }

    const { questionId, answer } = req.validatedBody;
    const question = await getCurrentQuestion(session.id, player.id);
    if (!question || question.id !== questionId) {
      return res.status(400).json({ success: false, message: "السؤال غير مطابق للسؤال الحالي." });
    }

    if (question.status !== QUESTION_STATUS.RUNNING) {
      return res.status(400).json({ success: false, message: "لا يمكن إرسال الإجابة الآن. المؤقت لم يبدأ أو انتهى." });
    }

    const already = await hasAlreadyAnswered(session.id, questionId, player.id);
    if (already) {
      return res.status(409).json({ success: false, message: "لقد أرسلت إجابتك بالفعل على هذا السؤال." });
    }

    const globalHintsSeen = (question.globalHints || []).length;
    const personalHintsSeen = (question.personalHints || []).length;
    const hintsSeen = globalHintsSeen + personalHintsSeen;

    const originalDoc = await getOriginalQuestionDoc(question.id);
    const correct = isAnswerCorrect(answer, originalDoc || question);
    await recordAnswer(session.id, questionId, player.id, answer, correct, hintsSeen);

    return res.json({
      success: true,
      message: "تم إرسال إجابتك.",
      received: true,
      hintsSeen: hintsSeen,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر إرسال الإجابة." });
  }
});

router.post("/leave", async function (req, res) {
  try {
    const token = getPlayerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "لا توجد هوية لاعب." });
    }
    const session = await getActiveSession();
    if (!session) {
      return res.json({ success: true });
    }
    const player = await getPlayerByToken(session.id, token);
    if (!player) {
      return res.json({ success: true });
    }
    await leaveSession(session.id, player.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر مغادرة الجلسة." });
  }
});

router.post("/timer/start", adminAuth, requireActiveSession, requireCurrentQuestion, async function (req, res) {
  try {
    await startTimer(req.session.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر بدء المؤقت." });
  }
});

router.post("/timer/pause", adminAuth, requireActiveSession, requireCurrentQuestion, async function (req, res) {
  try {
    await pauseTimer(req.session.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر إيقاف المؤقت." });
  }
});

router.post("/timer/resume", adminAuth, requireActiveSession, requireCurrentQuestion, async function (req, res) {
  try {
    await resumeTimer(req.session.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر استئناف المؤقت." });
  }
});

router.post("/hint/request", async function (req, res) {
  try {
    const token = getPlayerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "لا توجد هوية لاعب." });
    }

    const session = await getActiveSession();
    if (!session) {
      return res.status(404).json({ success: false, message: "لا توجد جلسة نشطة." });
    }

    const player = await getPlayerByToken(session.id, token);
    if (!player) {
      return res.status(401).json({ success: false, message: "هوية اللاعب غير صالحة." });
    }

    const question = await getCurrentQuestion(session.id, player.id);
    if (!question) {
      return res.status(400).json({ success: false, message: "لا يوجد سؤال حالي." });
    }

    if (question.status !== QUESTION_STATUS.RUNNING) {
      return res.status(400).json({ success: false, message: "لا يمكن طلب تلميح في الوقت الحالي." });
    }

    const alreadyAnswered = await hasAlreadyAnswered(session.id, question.id, player.id);
    if (alreadyAnswered) {
      return res.status(400).json({ success: false, message: "لقد أرسلت إجابتك بالفعل." });
    }

    const result = await revealNextHint(session.id, player.id);
    return res.json({ success: true, hint: result });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر إتاحة التلميح." });
  }
});

router.post("/hint/next", adminAuth, requireActiveSession, requireCurrentQuestion, async function (req, res) {
  try {
    const playerId =
      req.body && typeof req.body.playerId === "string" && req.body.playerId.length > 0
        ? req.body.playerId
        : null;

    if (playerId) {
      const player = await getPlayerById(req.session.id, playerId);
      if (!player) {
        return res.status(404).json({ success: false, message: "اللاعب غير موجود." });
      }
      const result = await revealNextHint(req.session.id, playerId);
      return res.json({ success: true, hint: result });
    }

    const result = await revealNextHint(req.session.id);
    return res.json({ success: true, hint: result });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر إتاحة التلميح." });
  }
});

router.post("/question/reveal", adminAuth, requireActiveSession, requireCurrentQuestion, async function (req, res) {
  try {
    await revealAnswer(req.session.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر إظهار الإجابة." });
  }
});

router.post("/question/commit", adminAuth, requireActiveSession, requireCurrentQuestion, async function (req, res) {
  try {
    const question = req.question;
    if (question.status !== QUESTION_STATUS.REVEALED) {
      return res.status(400).json({ success: false, message: "يجب إظهار الإجابة أولاً قبل اعتماد النتيجة." });
    }
    if (question.committed) {
      return res.status(400).json({ success: false, message: "تم اعتماد نتيجة هذا السؤال بالفعل." });
    }

    const result = await commitRound(req.session.id, question);
    await markQuestionCommitted(req.session.id);
    await logEvent(req.session.id, "round_committed", "تم اعتماد نتيجة السؤال");

    return res.json({ success: true, result: result });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر اعتماد النتيجة." });
  }
});

router.post("/question/next", adminAuth, requireActiveSession, async function (req, res) {
  try {
    const s = req.session;
    const nextOrder = (s.currentQuestionOrder || 0) + 1;
    const totalQuestions = s.totalQuestions || 0;

    if (nextOrder > totalQuestions) {
      return res.status(400).json({
        success: false,
        message: "لا يمكن الانتقال لسؤال جديد. اضغط «اعتماد النتيجة النهائية» لإظهار الترتيب.",
      });
    }

    const currentQuestion = await getCurrentQuestion(s.id);
    if (currentQuestion) {
      if (currentQuestion.status !== QUESTION_STATUS.COMMITTED) {
        return res.status(400).json({ 
          success: false, 
          message: "يجب إظهار الإجابة واعتماد النتيجة قبل الانتقال للسؤال التالي." 
        });
      }
      await markQuestionMoved(s.id);
    }

    const item = await setCurrentQuestion(s.id, nextOrder);

    const question = await getCurrentQuestion(s.id);
    return res.json({ success: true, order: item.order, questionId: question ? question.id : null });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر الانتقال للسؤال التالي." });
  }
});

router.post("/questions/load", adminAuth, requireActiveSession, async function (req, res) {
  try {
    const questions = await pickQuestions(10);
    if (!questions || questions.length === 0) {
      return res.status(400).json({ success: false, message: "لا توجد أسئلة في المكتبة." });
    }
    await attachQuestionsToSession(req.session.id, questions);
    await setCurrentQuestion(req.session.id, 1);
    return res.json({ success: true, count: questions.length });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر تحميل الأسئلة." });
  }
});

router.post("/players/:playerId/kick", adminAuth, requireActiveSession, async function (req, res) {
  try {
    await kickPlayer(req.session.id, req.params.playerId);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر استبعاد اللاعب." });
  }
});

module.exports = router;