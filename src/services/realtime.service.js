const {
  getSessionById,
  getCurrentQuestion,
  listPlayers,
  TIMER_STATUS,
  QUESTION_STATUS,
} = require("./game.service");
const { buildLeaderboard, resolveCorrectAnswerForQuestion } = require("./scoring.service");

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

function buildTrueFalseOptions() {
  return ["صح", "خطأ"];
}

function resolveAnswerForPayload(question) {
  try {
    if (!question) return null;
    return resolveCorrectAnswerForQuestion(question);
  } catch (e) {
    return null;
  }
}

function buildQuestionPayloadForPlayer(question) {
  if (!question) return null;

  const type = question.type || "who-am-i";
  const revealed = isRevealed(question.status);

  const base = {
    id: question.id,
    order: question.order,
    status: question.status,
    type: type,
    question: question.question || "",
    basePoints: question.basePoints,
    currentPoints: question.currentPoints,
    timeLimit: question.timeLimit,
    revealedHints: question.revealedHints || [],
    reference: revealed ? (question.reference || "") : "",
  };

  if (type === "who-am-i") {
    base.options = question.options || [];
    base.hints = question.hints || [];
    base.correctAnswer = revealed ? resolveAnswerForPayload(question) : null;
    base.answer = revealed ? (question.answer || null) : null;
  } else if (type === "multiple-choice") {
    base.options = question.options || [];
    base.correctAnswer = revealed ? resolveAnswerForPayload(question) : null;
  } else if (type === "true-false") {
    base.options = buildTrueFalseOptions();
    if (revealed) {
      base.correctAnswer = resolveAnswerForPayload(question);
      base.correctAnswerBool = !!question.correctAnswer;
    } else {
      base.correctAnswer = null;
    }
  }

  return base;
}

function buildQuestionPayloadForViewer(question) {
  if (!question) return null;

  const type = question.type || "who-am-i";
  const revealed = isRevealed(question.status);

  const base = {
    id: question.id,
    order: question.order,
    status: question.status,
    type: type,
    question: question.question || "",
    basePoints: question.basePoints,
    currentPoints: question.currentPoints,
    timeLimit: question.timeLimit,
    revealedHints: question.globalHints || question.revealedHints || [],
    options: question.options || [],
    reference: revealed ? (question.reference || "") : "",
    personalHintsCount: question.playerHints ? Object.keys(question.playerHints).length : 0,
    answersCount: question.answersCount || 0,
    correctCount: question.correctCount || 0,
  };

  if (type === "who-am-i") {
    base.hints = question.hints || [];
    base.correctAnswer = revealed ? resolveAnswerForPayload(question) : null;
    base.answer = revealed ? (question.answer || null) : null;
  } else if (type === "multiple-choice") {
    base.correctAnswer = revealed ? resolveAnswerForPayload(question) : null;
  } else if (type === "true-false") {
    base.options = buildTrueFalseOptions();
    if (revealed) {
      base.correctAnswer = resolveAnswerForPayload(question);
      base.correctAnswerBool = !!question.correctAnswer;
    } else {
      base.correctAnswer = null;
    }
  }

  return base;
}

async function buildAdminState() {
  try {
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
      ? Object.assign({}, buildQuestionPayloadForViewer(question), {
          hints: question.hints || [],
          globalHints: question.globalHints || [],
          playerHints: question.playerHints || {},
          committed: !!question.committed,
        })
      : null;

    return {
      session: {
        id: session.id,
        code: session.code,
        mode: session.mode,
        status: session.status,
        finalized: !!session.finalized,
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
  } catch (e) {
    return {
      session: null,
      question: null,
      timer: null,
      players: [],
      leaderboard: [],
      error: "state_build_failed",
    };
  }
}

async function buildPlayerState(player, session) {
  try {
    if (!session) {
      return { session: null, question: null, timer: null, me: null, leaderboard: [] };
    }

    const question = await getCurrentQuestion(session.id, player.id);
    const leaderboard = await buildLeaderboard(session.id);

    const viewerQuestion = buildQuestionPayloadForPlayer(question);

    return {
      session: {
        id: session.id,
        code: session.code,
        mode: session.mode,
        status: session.status,
        finalized: !!session.finalized,
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
  } catch (e) {
    return {
      session: null,
      question: null,
      timer: null,
      me: null,
      leaderboard: [],
      error: "player_state_failed",
    };
  }
}

async function buildViewerState() {
  try {
    const session = await getActiveSessionSafe();
    if (!session) {
      return { session: null, question: null, timer: null, players: [], leaderboard: [] };
    }

    const question = await getCurrentQuestion(session.id);
    const players = await listPlayers(session.id);
    const leaderboard = await buildLeaderboard(session.id);

    const viewerQuestion = buildQuestionPayloadForViewer(question);

    return {
      session: {
        id: session.id,
        code: session.code,
        mode: session.mode,
        status: session.status,
        finalized: !!session.finalized,
        joinOpen: !!session.joinOpen,
        totalQuestions: session.totalQuestions || 0,
        currentQuestionOrder: session.currentQuestionOrder || 0,
        qrDataUrl: session.qrDataUrl || null,
        joinUrl: session.joinUrl || null,
      },
      question: viewerQuestion,
      timer: computeTimerView(session.timer),
      players: players.map(function (p) { return { id: p.id, nickname: p.nickname }; }),
      leaderboard: leaderboard,
    };
  } catch (e) {
    return {
      session: null,
      question: null,
      timer: null,
      players: [],
      leaderboard: [],
      error: "viewer_state_failed",
    };
  }
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