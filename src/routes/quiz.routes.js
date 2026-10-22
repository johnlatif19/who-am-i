const express = require("express");

const { adminAuth } = require("../middleware/admin-auth");
const {
  listQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz,
  getQuizQuestions,
} = require("../services/quiz.service");

const router = express.Router();

router.get("/", adminAuth, async function (req, res) {
  try {
    const quizzes = await listQuizzes();
    return res.json({ success: true, quizzes: quizzes });
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر تحميل المسابقات." });
  }
});

router.get("/:id", adminAuth, async function (req, res) {
  try {
    const quiz = await getQuizById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ success: false, message: "المسابقة غير موجودة." });
    }
    return res.json({ success: true, quiz: quiz });
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر تحميل المسابقة." });
  }
});

router.post("/", adminAuth, async function (req, res) {
  try {
    const created = await createQuiz(req.body || {});
    return res.json({ success: true, quiz: created });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر إنشاء المسابقة." });
  }
});

router.put("/:id", adminAuth, async function (req, res) {
  try {
    const updated = await updateQuiz(req.params.id, req.body || {});
    return res.json({ success: true, quiz: updated });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر تحديث المسابقة." });
  }
});

router.delete("/:id", adminAuth, async function (req, res) {
  try {
    await deleteQuiz(req.params.id);
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر حذف المسابقة." });
  }
});

router.get("/:id/questions", adminAuth, async function (req, res) {
  try {
    const result = await getQuizQuestions(req.params.id);
    return res.json({ success: true, quiz: result.quiz, questions: result.questions });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر تحميل أسئلة المسابقة." });
  }
});

module.exports = router;