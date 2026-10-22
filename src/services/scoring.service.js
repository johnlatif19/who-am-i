const { getFirestore, COLLECTIONS, SESSION_SUBCOLLECTIONS } = require("../config/firebase");

const HINT_PENALTY = 5;
const MIN_POINTS = 0;

function db() {
  return getFirestore();
}

function now() {
  return Date.now();
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function resolveCorrectAnswerForQuestion(question) {
  if (!question) return null;
  const type = question.type || "who-am-i";

  if (type === "who-am-i" || type === "multiple-choice") {
    if (Array.isArray(question.options) && typeof question.correctIndex === "number") {
      const opt = question.options[question.correctIndex];
      if (typeof opt === "string" && opt.length > 0) return opt;
    }
    if (typeof question.answer === "string" && question.answer.length > 0) {
      return question.answer;
    }
    return null;
  }

  if (type === "true-false") {
    if (typeof question.correctAnswer === "boolean") {
      return question.correctAnswer ? "true" : "false";
    }
    if (typeof question.correctAnswer === "string") {
      const v = question.correctAnswer.toLowerCase().trim();
      if (v === "true" || v === "false") return v;
    }
    return null;
  }

  return null;
}

function isAnswerCorrect(givenAnswer, question) {
  if (typeof givenAnswer !== "string") return false;
  const given = givenAnswer.trim();
  if (!given) return false;

  const resolved = resolveCorrectAnswerForQuestion(question);
  if (resolved == null) return false;

  const type = question.type || "who-am-i";
  if (type === "true-false") {
    const givenNorm = given.toLowerCase();
    const truthy = ["true", "صح", "صحيح", "1", "نعم", "yes"];
    const falsy = ["false", "خطأ", "غلط", "0", "لا", "no"];
    if (resolved === "true") return truthy.includes(givenNorm);
    if (resolved === "false") return falsy.includes(givenNorm);
    return false;
  }

  return normalizeText(given) === normalizeText(resolved);
}

async function hasAlreadyAnswered(sessionId, questionId, playerId) {
  const snap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.ANSWERS)
    .where("questionId", "==", questionId)
    .where("playerId", "==", playerId)
    .limit(1)
    .get();
  return !snap.empty;
}

async function recordAnswer(sessionId, questionId, playerId, answer, isCorrect, hintsSeen) {
  const ts = now();
  const hints = Number(hintsSeen) || 0;
  const ref = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.ANSWERS)
    .add({
      questionId: questionId,
      playerId: playerId,
      answer: answer,
      isCorrect: !!isCorrect,
      hintsSeen: hints,
      committed: false,
      committedPoints: 0,
      at: ts,
    });
  return Object.assign({ id: ref.id }, {
    questionId: questionId,
    playerId: playerId,
    answer: answer,
    isCorrect: !!isCorrect,
    hintsSeen: hints,
    at: ts,
  });
}

async function getAllAnswersForSession(sessionId) {
  const snap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.ANSWERS)
    .get();
  return snap.docs.map(function (d) {
    return Object.assign({ id: d.id }, d.data());
  });
}

async function getAnswersForQuestion(sessionId, questionId) {
  const snap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.ANSWERS)
    .where("questionId", "==", questionId)
    .get();
  return snap.docs.map(function (d) {
    return Object.assign({ id: d.id }, d.data());
  });
}

async function getOriginalQuestionDoc(questionId) {
  if (!questionId) return null;
  const doc = await db().collection(COLLECTIONS.QUESTIONS).doc(questionId).get();
  if (!doc.exists) return null;
  return Object.assign({ id: doc.id }, doc.data());
}

async function incrementPlayerScore(sessionId, playerId, points) {
  const value = Number(points) || 0;
  if (value === 0) return;
  const ref = db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .doc(playerId);
  const doc = await ref.get();
  if (!doc.exists) return;
  const current = Number(doc.data().score) || 0;
  await ref.set({ score: current + value }, { merge: true });
}

async function markAnswerCommitted(sessionId, answerId, points, correct) {
  const ref = db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.ANSWERS)
    .doc(answerId);
  await ref.set({
    committed: true,
    committedPoints: Number(points) || 0,
    committedAt: now(),
    isCorrect: !!correct,
  }, { merge: true });
}

async function commitRound(sessionId, question) {
  if (!question) {
    throw Object.assign(new Error("لا يوجد سؤال حالي."), { status: 400 });
  }

  const originalDoc = await getOriginalQuestionDoc(question.id);
  const source = originalDoc || question;

  const answers = await getAnswersForQuestion(sessionId, question.id);
  const base = typeof question.basePoints === "number" ? question.basePoints : 10;
  const type = source.type || question.type || "who-am-i";
  const allowHintPenalty = type === "who-am-i";

  let committedCount = 0;
  let correctCount = 0;
  let totalPointsAwarded = 0;
  let newlyCommitted = 0;
  const awarded = new Set();

  for (const a of answers) {
    if (a.committed) continue;
    if (awarded.has(a.playerId)) continue;

    const isCorrect = isAnswerCorrect(a.answer, source);

    if (!isCorrect) {
      if (allowHintPenalty) {
        const hintsSeen = Number(a.hintsSeen) || 0;
        const penalty = hintsSeen * HINT_PENALTY;
        if (penalty > 0) {
          await incrementPlayerScore(sessionId, a.playerId, -penalty);
          await markAnswerCommitted(sessionId, a.id, -penalty, false);
          totalPointsAwarded += -penalty;
        } else {
          await markAnswerCommitted(sessionId, a.id, 0, false);
        }
      } else {
        await markAnswerCommitted(sessionId, a.id, 0, false);
      }
      continue;
    }

    awarded.add(a.playerId);

    const hintsSeen = allowHintPenalty ? (Number(a.hintsSeen) || 0) : 0;
    const penalty = hintsSeen * HINT_PENALTY;
    const points = base - penalty;

    if (points !== 0) {
      await incrementPlayerScore(sessionId, a.playerId, points);
    }
    await markAnswerCommitted(sessionId, a.id, points, true);

    committedCount++;
    correctCount++;
    newlyCommitted++;
    totalPointsAwarded += points;
  }

  return {
    alreadyCommitted: newlyCommitted === 0,
    committedCount: committedCount,
    correctCount: correctCount,
    totalPointsAwarded: totalPointsAwarded,
  };
}

async function finalizeSession(sessionId, session) {
  if (!session) {
    throw Object.assign(new Error("الجلسة غير موجودة."), { status: 404 });
  }

  if (session.finalized) {
    throw Object.assign(new Error("تم اعتماد النتيجة النهائية بالفعل لهذه الجلسة."), { status: 400 });
  }

  const questions = Array.isArray(session.questions) ? session.questions : [];
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q.status !== "committed") {
      throw Object.assign(new Error("يجب اعتماد نتيجة كل الأسئلة قبل اعتماد النتيجة النهائية."), { status: 400 });
    }
  }

  const allAnswers = await getAllAnswersForSession(sessionId);

  const answersByQuestion = {};
  for (const a of allAnswers) {
    if (!answersByQuestion[a.questionId]) answersByQuestion[a.questionId] = [];
    answersByQuestion[a.questionId].push(a);
  }

  let totalPoints = 0;
  let totalCorrect = 0;
  let totalAnswers = 0;

  for (const q of questions) {
    const originalDoc = await getOriginalQuestionDoc(q.questionId);
    const source = originalDoc || q;
    const type = source.type || q.type || "who-am-i";
    const allowHintPenalty = type === "who-am-i";
    const base = typeof q.basePoints === "number" ? q.basePoints : 10;

    const qAnswers = answersByQuestion[q.questionId] || [];
    const awarded = new Set();

    for (const a of qAnswers) {
      if (a.committed) continue;
      if (awarded.has(a.playerId)) continue;

      const isCorrect = isAnswerCorrect(a.answer, source);
      totalAnswers++;

      if (!isCorrect) {
        if (allowHintPenalty) {
          const hintsSeen = Number(a.hintsSeen) || 0;
          const penalty = hintsSeen * HINT_PENALTY;
          if (penalty > 0) {
            await incrementPlayerScore(sessionId, a.playerId, -penalty);
            await markAnswerCommitted(sessionId, a.id, -penalty, false);
            totalPoints += -penalty;
          } else {
            await markAnswerCommitted(sessionId, a.id, 0, false);
          }
        } else {
          await markAnswerCommitted(sessionId, a.id, 0, false);
        }
        continue;
      }

      awarded.add(a.playerId);

      const hintsSeen = allowHintPenalty ? (Number(a.hintsSeen) || 0) : 0;
      const penalty = hintsSeen * HINT_PENALTY;
      const points = base - penalty;

      if (points !== 0) {
        await incrementPlayerScore(sessionId, a.playerId, points);
      }
      await markAnswerCommitted(sessionId, a.id, points, true);

      totalPoints += points;
      totalCorrect++;
    }
  }

  const playersSnap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .where("kicked", "==", false)
    .get();

  const updatedQuestions = questions.map(function (q) {
    return Object.assign({}, q, { committed: true, status: "committed" });
  });

  await db().collection(COLLECTIONS.SESSIONS).doc(sessionId).set({
    status: "active",
    finalized: true,
    finalizedAt: now(),
    joinOpen: false,
    questions: updatedQuestions,
    lastEventAt: now(),
  }, { merge: true });

  await logEvent(
    sessionId,
    "session_finalized",
    "تم اعتماد النتيجة النهائية. عدد الإجابات: " + totalAnswers +
    "، الإجابات الصحيحة: " + totalCorrect +
    "، مجموع النقاط: " + totalPoints
  );

  return {
    success: true,
    totalQuestions: questions.length,
    totalAnswers: totalAnswers,
    totalCorrect: totalCorrect,
    totalPoints: totalPoints,
    playersCount: playersSnap.size,
  };
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

async function getSessionFromFirestore(sessionId) {
  const doc = await db().collection(COLLECTIONS.SESSIONS).doc(sessionId).get();
  if (!doc.exists) return null;
  return Object.assign({ id: doc.id }, doc.data());
}

async function buildLeaderboard(sessionId) {
  const s = await getSessionFromFirestore(sessionId);
  if (!s) return [];

  const playersSnap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .where("kicked", "==", false)
    .get();

  const players = playersSnap.docs.map(function (d) {
    const data = d.data();
    return { name: data.nickname, score: Number(data.score) || 0 };
  });
  players.sort(function (a, b) { return b.score - a.score; });
  return players;
}

async function getPlayerRank(sessionId, playerId) {
  const s = await getSessionFromFirestore(sessionId);
  if (!s) return null;
  const lb = await buildLeaderboard(sessionId);
  const playerDoc = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .doc(playerId)
    .get();
  if (!playerDoc.exists) return null;
  const nickname = playerDoc.data().nickname;
  const idx = lb.findIndex(function (e) { return e.name === nickname; });
  return { rank: idx >= 0 ? idx + 1 : null, total: lb.length, score: Number(playerDoc.data().score) || 0 };
}

module.exports = {
  HINT_PENALTY,
  MIN_POINTS,
  resolveCorrectAnswerForQuestion,
  isAnswerCorrect,
  hasAlreadyAnswered,
  recordAnswer,
  getAllAnswersForSession,
  getAnswersForQuestion,
  getOriginalQuestionDoc,
  incrementPlayerScore,
  markAnswerCommitted,
  commitRound,
  finalizeSession,
  buildLeaderboard,
  getPlayerRank,
  logEvent,
};