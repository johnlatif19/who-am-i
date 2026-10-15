const {
  getSessionById,
  getCurrentQuestion,
  listPlayers,
  TIMER_STATUS,
  QUESTION_STATUS,
} = require("./game.service");
const { buildLeaderboard } = require("./scoring.service");

function now() {
  return Date.now();
}

function computeTimerView(timer) {
  if (!timer || !timer.total) {
    return { status: TIMER_STATUS.IDLE, total: 0, remaining: 0, endsAt: null };
  }

  const ts = now();
  let remaining = 0;

  if (timer.status === TIMER_STATUS.RUNNING && timer.endsAt) {
    remaining = Math.max(0, Math.ceil((timer.endsAt - ts) / 1000));
  } else if (timer.status === TIMER_STATUS.PAUSED && timer.remainingMs) {
    remaining = Math.max(0, Math.ceil(timer.remainingMs / 1000));
  } else if (timer.status === TIMER_STATUS.ENDED) {
    remaining = 0;
  }

  return {
    status: timer.status,
    total: timer.total,
    remaining: remaining,
    endsAt: timer.endsAt || null,
  };
}

function isRevealed(status) {
  return status === QUESTION_STATUS.REVEALED || status === QUESTION_STATUS.COMMITTED;
}

async function buildAdminState() {
  const session = await getActiveSessionSafe();
  if (!session) {
    return {
      session: null,
      question: null,
      timer: null,
      players: [],
      leaderboard: [],
    };
  }

  const question = await getCurrentQuestion(session.id);
  const players = await listPlayers(session.id);
  const leaderboard = await buildLeaderboard(session.id);

  const viewerQuestion = question
    ? {
        id: question.id,
        order: question.order,
        status: question.status,
        basePoints: question.basePoints,
        currentPoints: question.currentPoints,
        timeLimit: question.timeLimit,
        revealedHints: question.revealedHints || [],
        hints: question.hints || [],
        options: question.options || [],
        answersCount: question.answersCount || 0,
        correctCount: question.correctCount || 0,
        committed: !!question.committed,
        reference: question.reference || "",
        answer: isRevealed(question.status) ? question.answer : null,
        correctAnswer: isRevealed(question.status) ? question.answer : null,
      }
    : null;

  return {
    session: {
      id: session.id,
      code: session.code,
      mode: session.mode,
      status: session.status,
      joinOpen: !!session.joinOpen,
      totalQuestions: session.totalQuestions || 0,
      currentQuestionOrder: session.currentQuestionOrder || 0,
      qrDataUrl: session.qrDataUrl || null,
      joinUrl: session.joinUrl || null,
    },
    question: viewerQuestion,
    timer: computeTimerView(session.timer),
    players: players.map(function (p) {
      return {
        id: p.id,
        nickname: p.nickname,
        score: Number(p.score) || 0,
        joinedAt: p.joinedAt || null,
      };
    }),
    leaderboard: leaderboard,
  };
}

async function buildPlayerState(player, session) {
  if (!session) {
    return { session: null, question: null, timer: null, me: null, leaderboard: [] };
  }

  const question = await getCurrentQuestion(session.id);
  const leaderboard = await buildLeaderboard(session.id);

  const viewerQuestion = question
    ? {
        id: question.id,
        order: question.order,
        status: question.status,
        basePoints: question.basePoints,
        currentPoints: question.currentPoints,
        timeLimit: question.timeLimit,
        revealedHints: question.revealedHints || [],
        options: question.options || [],
        reference: isRevealed(question.status) ? question.reference || "" : "",
        correctAnswer: isRevealed(question.status) ? question.answer : null,
        answer: isRevealed(question.status) ? question.answer : null,
      }
    : null;

  return {
    session: {
      id: session.id,
      code: session.code,
      mode: session.mode,
      status: session.status,
      totalQuestions: session.totalQuestions || 0,
      currentQuestionOrder: session.currentQuestionOrder || 0,
    },
    question: viewerQuestion,
    timer: computeTimerView(session.timer),
    me: {
      id: player.id,
      nickname: player.nickname,
      score: Number(player.score) || 0,
    },
    leaderboard: leaderboard,
  };
}

async function buildViewerState() {
  const session = await getActiveSessionSafe();
  if (!session) {
    return { session: null, question: null, timer: null, players: [], leaderboard: [] };
  }

  const question = await getCurrentQuestion(session.id);
  const players = await listPlayers(session.id);
  const leaderboard = await buildLeaderboard(session.id);

  const viewerQuestion = question
    ? {
        id: question.id,
        order: question.order,
        status: question.status,
        basePoints: question.basePoints,
        currentPoints: question.currentPoints,
        timeLimit: question.timeLimit,
        revealedHints: question.revealedHints || [],
        options: question.options || [],
        reference: isRevealed(question.status) ? question.reference || "" : "",
        correctAnswer: isRevealed(question.status) ? question.answer : null,
      }
    : null;

  return {
    session: {
      id: session.id,
      code: session.code,
      mode: session.mode,
      status: session.status,
      joinOpen: !!session.joinOpen,
      totalQuestions: session.totalQuestions || 0,
      currentQuestionOrder: session.currentQuestionOrder || 0,
      qrDataUrl: session.qrDataUrl || null,
      joinUrl: session.joinUrl || null,
    },
    question: viewerQuestion,
    timer: computeTimerView(session.timer),
    players: players.map(function (p) {
      return { id: p.id, nickname: p.nickname };
    }),
    leaderboard: leaderboard,
  };
}

async function getActiveSessionSafe() {
  try {
    const { getActiveSession } = require("./game.service");
    return await getActiveSession();
  } catch (e) {
    return null;
  }
}

function buildPublicStats(activeSessions, activePlayers) {
  return {
    activeSessions: Number(activeSessions) || 0,
    activePlayers: Number(activePlayers) || 0,
    at: now(),
  };
}

module.exports = {
  computeTimerView,
  buildAdminState,
  buildPlayerState,
  buildViewerState,
  buildPublicStats,
  isRevealed,
};
