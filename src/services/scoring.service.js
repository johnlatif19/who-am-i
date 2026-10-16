const { getFirestore, COLLECTIONS, SESSION_SUBCOLLECTIONS } = require("../config/firebase");

const HINT_PENALTY = 5;
const MIN_POINTS = 0;

function db() {
  return getFirestore();
}

function now() {
  return Date.now();
}

function computeQuestionValue(basePoints, hintsRevealedCount) {
  const base = typeof basePoints === "number" ? basePoints : 10;
  const hints = typeof hintsRevealedCount === "number" ? hintsRevealedCount : 0;
  const value = base - hints * HINT_PENALTY;
  return value;
}

function isAnswerCorrect(givenAnswer, correctAnswer) {
  if (typeof givenAnswer !== "string" || typeof correctAnswer !== "string") return false;
  return givenAnswer.trim() === correctAnswer.trim();
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

async function commitRound(sessionId, question) {
  const s = await getSessionFromFirestore(sessionId);
  if (!s) throw Object.assign(new Error("الجلسة غير موجودة."), { status: 404 });
  if (!question) throw Object.assign(new Error("لا يوجد سؤال حالي."), { status: 400 });
  if (question.committed) {
    return { alreadyCommitted: true, committedCount: 0, correctCount: 0 };
  }

  const answers = await getAnswersForQuestion(sessionId, question.id);
  const base = typeof question.basePoints === "number" ? question.basePoints : 10;

  let committedCount = 0;
  let correctCount = 0;
  const awarded = new Set();

  for (const a of answers) {
    if (!a.isCorrect) continue;
    if (awarded.has(a.playerId)) continue;
    awarded.add(a.playerId);

    const hintsSeen = Number(a.hintsSeen) || 0;
    const points = base - hintsSeen * HINT_PENALTY;

    await incrementPlayerScore(sessionId, a.playerId, points);

    committedCount++;
    correctCount++;
  }

  return {
    alreadyCommitted: false,
    committedCount: committedCount,
    correctCount: correctCount,
  };
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
  computeQuestionValue,
  isAnswerCorrect,
  hasAlreadyAnswered,
  recordAnswer,
  getAnswersForQuestion,
  incrementPlayerScore,
  commitRound,
  buildLeaderboard,
  getPlayerRank,
};
