const express = require("express");

const { adminAuth } = require("../middleware/admin-auth");
const {
  validateBody,
  questionSchema,
  questionUpdateSchema,
} = require("../utils/validation");

const {
  listAllQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestionById,
} = require("../services/game.service");

const { deleteImage, isCloudinaryConfigured } = require("../config/cloudinary");

const router = express.Router();

function mapQuestionForClient(q) {
  return {
    id: q.id,
    type: q.type || "who-am-i",
    question: q.question || "",
    answer: q.answer || "",
    reference: q.reference || "",
    description: q.description || "",
    options: q.options || [],
    correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
    correctAnswer: typeof q.correctAnswer === "boolean" ? q.correctAnswer : null,
    hints: q.hints || [],
    basePoints: q.basePoints,
    timeLimit: q.timeLimit,
    imageUrl: q.imageUrl || "",
    imagePublicId: q.imagePublicId || "",
    createdAt: q.createdAt || null,
    updatedAt: q.updatedAt || null,
  };
}

router.get("/", adminAuth, async function (req, res) {
  try {
    const questions = await listAllQuestions();
    const safe = questions.map(mapQuestionForClient);
    return res.json({ success: true, questions: safe });
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر تحميل الأسئلة." });
  }
});

router.get("/:id", adminAuth, async function (req, res) {
  try {
    const q = await getQuestionById(req.params.id);
    if (!q) {
      return res.status(404).json({ success: false, message: "السؤال غير موجود." });
    }
    return res.json({ success: true, question: mapQuestionForClient(q) });
  } catch (e) {
    return res.status(500).json({ success: false, message: "تعذر تحميل السؤال." });
  }
});

router.post("/", adminAuth, validateBody(questionSchema), async function (req, res) {
  try {
    const data = req.validatedBody;

    if (Array.isArray(data.options) && typeof data.correctIndex === "number") {
      if (data.correctIndex < 0 || data.correctIndex >= data.options.length) {
        return res.status(400).json({ success: false, message: "فهرس الإجابة الصحيحة غير صالح." });
      }
    }

    const created = await createQuestion(data);
    return res.json({ success: true, question: mapQuestionForClient(created) });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || "تعذر إنشاء السؤال." });
  }
});

router.put("/:id", adminAuth, validateBody(questionUpdateSchema), async function (req, res) {
  try {
    const data = Object.assign({}, req.validatedBody);
    data.id = req.params.id;

    if (Array.isArray(data.options) && typeof data.correctIndex === "number") {
      if (data.correctIndex < 0 || data.correctIndex >= data.options.length) {
        return res.status(400).json({ success: false, message: "فهرس الإجابة الصحيحة غير صالح." });
      }
    }

    const updated = await updateQuestion(req.params.id, data);
    return res.json({ success: true, question: mapQuestionForClient(updated) });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر تحديث السؤال." });
  }
});

router.delete("/:id", adminAuth, async function (req, res) {
  try {
    const removed = await deleteQuestion(req.params.id);

    if (removed.imagePublicId && isCloudinaryConfigured()) {
      try {
        await deleteImage(removed.imagePublicId);
      } catch (e) {
      }
    }

    return res.json({ success: true });
  } catch (e) {
    return res.status(e.status || 500).json({ success: false, message: e.message || "تعذر حذف السؤال." });
  }
});

module.exports = router;