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
  return Math.max(MIN_POINTS, value);
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

async function recordAnswer(sessionId, questionId, playerId, answer, isCorrect) {
  const ts = now();
  const ref = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.ANSWERS)
    .add({
      questionId: questionId,
      playerId: playerId,
      answer: answer,
      isCorrect: !!isCorrect,
      at: ts,
    });
  return Object.assign({ id: ref.id }, {
    questionId: questionId,
    playerId: playerId,
    answer: answer,
    isCorrect: !!isCorrect,
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
  if (!points || points <= 0) return;
  const ref = db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .doc(playerId);
  const doc = await ref.get();
  if (!doc.exists) return;
  const current = Number(doc.data().score) || 0;
  await ref.set({ score: current + points }, { merge: true });
}

async function incrementTeamScore(sessionId, teamName, points) {
  if (!points || points <= 0 || !teamName) return;
  const snap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.TEAMS)
    .where("name", "==", teamName)
    .limit(1)
    .get();
  if (snap.empty) return;
  const ref = snap.docs[0].ref;
  const current = Number(snap.docs[0].data().score) || 0;
  await ref.set({ score: current + points }, { merge: true });
}

async function commitRound(sessionId, question) {
  const s = await getSessionFromFirestore(sessionId);
  if (!s) throw Object.assign(new Error("الجلسة غير موجودة."), { status: 404 });
  if (!question) throw Object.assign(new Error("لا يوجد سؤال حالي."), { status: 400 });
  if (question.committed) {
    return { alreadyCommitted: true, committedCount: 0, correctCount: 0 };
  }

  const answers = await getAnswersForQuestion(sessionId, question.id);
  const points = computeQuestionValue(question.basePoints, (question.revealedHints || []).length);

  let committedCount = 0;
  let correctCount = 0;

  if (s.mode === "teams") {
    const teamScores = {};
    answers.forEach(function (a) {
      if (!a.isCorrect) return;
      const teamName = a.teamName || a.playerTeam || "";
      if (!teamName) return;
      teamScores[teamName] = (teamScores[teamName] || 0) + 1;
    });

    for (const teamName of Object.keys(teamScores)) {
      const correct = teamScores[teamName] > 0;
      if (correct) {
        await incrementTeamScore(sessionId, teamName, points);
        committedCount++;
        correctCount++;
      }
    }
  } else {
    const awarded = new Set();
    for (const a of answers) {
      if (!a.isCorrect) continue;
      if (awarded.has(a.playerId)) continue;
      awarded.add(a.playerId);
      await incrementPlayerScore(sessionId, a.playerId, points);
      committedCount++;
      correctCount++;
    }
  }

  return { alreadyCommitted: false, committedCount: committedCount, correctCount: correctCount, points: points };
}

async function getSessionFromFirestore(sessionId) {
  const doc = await db().collection(COLLECTIONS.SESSIONS).doc(sessionId).get();
  if (!doc.exists) return null;
  return Object.assign({ id: doc.id }, doc.data());
}

async function buildLeaderboard(sessionId) {
  const s = await getSessionFromFirestore(sessionId);
  if (!s) return [];

  if (s.mode === "teams") {
    const teamsSnap = await db()
      .collection(COLLECTIONS.SESSIONS)
      .doc(sessionId)
      .collection(SESSION_SUBCOLLECTIONS.TEAMS)
      .get();
    const teams = teamsSnap.docs.map(function (d) {
      const data = d.data();
      return { name: data.name, score: Number(data.score) || 0, type: "team" };
    });
    teams.sort(function (a, b) { return b.score - a.score; });
    return teams;
  }

  const playersSnap = await db()
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(SESSION_SUBCOLLECTIONS.PLAYERS)
    .where("kicked", "==", false)
    .get();

  const players = playersSnap.docs.map(function (d) {
    const data = d.data();
    return { name: data.nickname, score: Number(data.score) || 0, type: "player" };
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
  incrementTeamScore,
  commitRound,
  buildLeaderboard,
  getPlayerRank,
};