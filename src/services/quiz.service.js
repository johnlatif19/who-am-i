const { getFirestore, COLLECTIONS } = require("../config/firebase");

function now() {
  return Date.now();
}

function db() {
  return getFirestore();
}

function sanitizeName(name) {
  if (typeof name !== "string") return "";
  return name.trim().slice(0, 120);
}

function sanitizeDescription(desc) {
  if (typeof desc !== "string") return "";
  return desc.trim().slice(0, 500);
}

function sanitizeQuestionIds(ids) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

async function listQuizzes() {
  const snap = await db().collection(COLLECTIONS.QUIZZES).get();
  const list = snap.docs.map(function (d) {
    return Object.assign({ id: d.id }, d.data());
  });
  list.sort(function (a, b) {
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
  return list;
}

async function getQuizById(quizId) {
  if (!quizId) return null;
  const doc = await db().collection(COLLECTIONS.QUIZZES).doc(quizId).get();
  if (!doc.exists) return null;
  return Object.assign({ id: doc.id }, doc.data());
}

async function createQuiz(data) {
  const ts = now();
  const quiz = {
    name: sanitizeName(data.name),
    description: sanitizeDescription(data.description),
    questionIds: sanitizeQuestionIds(data.questionIds),
    createdAt: ts,
    updatedAt: ts,
  };

  if (!quiz.name) {
    throw Object.assign(new Error("اسم المسابقة مطلوب."), { status: 400 });
  }
  if (quiz.questionIds.length === 0) {
    throw Object.assign(new Error("أضف سؤالًا واحدًا على الأقل للمسابقة."), { status: 400 });
  }

  const ref = await db().collection(COLLECTIONS.QUIZZES).add(quiz);
  return Object.assign({ id: ref.id }, quiz);
}

async function updateQuiz(quizId, data) {
  const ref = db().collection(COLLECTIONS.QUIZZES).doc(quizId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw Object.assign(new Error("المسابقة غير موجودة."), { status: 404 });
  }

  const patch = { updatedAt: now() };

  if (data.name !== undefined) {
    const n = sanitizeName(data.name);
    if (!n) throw Object.assign(new Error("اسم المسابقة مطلوب."), { status: 400 });
    patch.name = n;
  }
  if (data.description !== undefined) {
    patch.description = sanitizeDescription(data.description);
  }
  if (data.questionIds !== undefined) {
    const ids = sanitizeQuestionIds(data.questionIds);
    if (ids.length === 0) {
      throw Object.assign(new Error("أضف سؤالًا واحدًا على الأقل للمسابقة."), { status: 400 });
    }
    patch.questionIds = ids;
  }

  await ref.set(patch, { merge: true });
  const updated = await ref.get();
  return Object.assign({ id: updated.id }, updated.data());
}

async function deleteQuiz(quizId) {
  const ref = db().collection(COLLECTIONS.QUIZZES).doc(quizId);
  const doc = await ref.get();
  if (!doc.exists) {
    throw Object.assign(new Error("المسابقة غير موجودة."), { status: 404 });
  }
  await ref.delete();
  return { id: quizId };
}

async function getQuizQuestions(quizId) {
  const quiz = await getQuizById(quizId);
  if (!quiz) {
    throw Object.assign(new Error("المسابقة غير موجودة."), { status: 404 });
  }

  const ids = Array.isArray(quiz.questionIds) ? quiz.questionIds : [];
  if (ids.length === 0) return { quiz: quiz, questions: [] };

  const questions = [];
  for (let i = 0; i < ids.length; i++) {
    const doc = await db().collection(COLLECTIONS.QUESTIONS).doc(ids[i]).get();
    if (!doc.exists) continue;
    questions.push(Object.assign({ id: doc.id }, doc.data()));
  }

  const ordered = ids
    .map(function (id) {
      return questions.find(function (q) { return q.id === id; });
    })
    .filter(function (q) { return !!q; });

  return { quiz: quiz, questions: ordered };
}

module.exports = {
  listQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getQuizQuestions,
};