const { z } = require("zod");

const SESSION_CODE_REGEX = /^\d{6}$/;
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 24;
const ANSWER_MAX = 200;
const USERNAME_MIN = 3;
const USERNAME_MAX = 60;
const PASSWORD_MIN = 5;
const PASSWORD_MAX = 120;

const sessionModeSchema = z.enum(["solo", "teams"]);

const sessionCodeSchema = z
  .string()
  .trim()
  .regex(SESSION_CODE_REGEX, "رمز الجلسة يجب أن يكون 6 أرقام.");

const nicknameSchema = z
  .string()
  .trim()
  .min(NICKNAME_MIN, "الاسم المستعار قصير جدًا.")
  .max(NICKNAME_MAX, "الاسم المستعار طويل جدًا.")
  .regex(/^[\p{L}\p{N}\s_'\-\.]+$/u, "الاسم المستعار يحتوي على رموز غير مسموح بها.");

const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN, "اسم المستخدم قصير جدًا.")
    .max(USERNAME_MAX, "اسم المستخدم طويل جدًا."),
  password: z
    .string()
    .min(PASSWORD_MIN, "كلمة المرور قصيرة جدًا.")
    .max(PASSWORD_MAX, "كلمة المرور طويلة جدًا."),
});

const createSessionSchema = z.object({
  mode: sessionModeSchema.optional().default("solo"),
});

const joinSessionSchema = z.object({
  code: sessionCodeSchema,
  nickname: nicknameSchema,
});

const answerSchema = z.object({
  questionId: z.string().trim().min(1, "معرّف السؤال مطلوب."),
  answer: z
    .string()
    .trim()
    .min(1, "الإجابة مطلوبة.")
    .max(ANSWER_MAX, "الإجابة طويلة جدًا."),
});

const questionOptionSchema = z
  .string()
  .trim()
  .min(1, "الاختيار لا يمكن أن يكون فارغًا.")
  .max(120, "الاختيار طويل جدًا.");

const questionHintSchema = z
  .string()
  .trim()
  .min(1, "التلميح لا يمكن أن يكون فارغًا.")
  .max(300, "التلميح طويل جدًا.");

const questionSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "نص السؤال مطلوب.")
    .max(300, "نص السؤال طويل جدًا."),
  answer: z
    .string()
    .trim()
    .min(1, "اسم الشخصية مطلوب.")
    .max(120, "اسم الشخصية طويل جدًا."),
  reference: z
    .string()
    .trim()
    .max(200, "المرجع الكتابي طويل جدًا.")
    .optional()
    .default(""),
  description: z
    .string()
    .trim()
    .max(500, "النبذة طويلة جدًا.")
    .optional()
    .default(""),
  options: z
    .array(questionOptionSchema)
    .length(4, "يجب إدخال 4 اختيارات بالضبط."),
  correctIndex: z
    .number()
    .int()
    .min(0, "فهرس الإجابة الصحيحة غير صالح.")
    .max(3, "فهرس الإجابة الصحيحة غير صالح."),
  hints: z
    .array(questionHintSchema)
    .min(0)
    .max(6, "لا يمكن إضافة أكثر من 6 تلميحات."),
  basePoints: z
    .number()
    .int()
    .min(0, "قيمة السؤال لا يمكن أن تكون سالبة.")
    .max(100, "قيمة السؤال كبيرة جدًا.")
    .default(10),
  timeLimit: z
    .number()
    .int()
    .min(5, "مدة المؤقت قصيرة جدًا.")
    .max(300, "مدة المؤقت طويلة جدًا.")
    .default(30),
});

const questionUpdateSchema = questionSchema.partial().extend({
  id: z.string().trim().min(1, "معرّف السؤال مطلوب."),
});

const sessionIdSchema = z.string().trim().min(1, "معرّف الجلسة مطلوب.");
const playerIdSchema = z.string().trim().min(1, "معرّف اللاعب مطلوب.");
const questionIdSchema = z.string().trim().min(1, "معرّف السؤال مطلوب.");

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const firstIssue = result.error.issues && result.error.issues[0];
  const message = firstIssue ? firstIssue.message : "بيانات غير صالحة.";
  const field = firstIssue && firstIssue.path && firstIssue.path.length > 0
    ? firstIssue.path.join(".")
    : null;
  return { ok: false, message: message, field: field };
}

function validateBody(schema) {
  return function (req, res, next) {
    const result = validate(schema, req.body || {});
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: result.message,
        field: result.field,
      });
    }
    req.validatedBody = result.data;
    return next();
  };
}

function validateQuery(schema) {
  return function (req, res, next) {
    const result = validate(schema, req.query || {});
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        message: result.message,
        field: result.field,
      });
    }
    req.validatedQuery = result.data;
    return next();
  };
}

function isValidSessionCode(code) {
  return typeof code === "string" && SESSION_CODE_REGEX.test(code.trim());
}

function normalizeNickname(nickname) {
  if (typeof nickname !== "string") return "";
  return nickname.trim().replace(/\s+/g, " ");
}

function normalizeText(text, maxLength) {
  if (typeof text !== "string") return "";
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (typeof maxLength === "number" && cleaned.length > maxLength) {
    return cleaned.slice(0, maxLength);
  }
  return cleaned;
}

function safeString(value, fallback) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback || "";
  return String(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidObjectId(value) {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function stripUndefined(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  Object.keys(obj).forEach(function (key) {
    if (obj[key] !== undefined) {
      out[key] = obj[key];
    }
  });
  return out;
}

function parsePositiveInt(value, fallback) {
  const n = Number(value);
  if (!isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

module.exports = {
  z,

  sessionModeSchema,
  sessionCodeSchema,
  nicknameSchema,
  loginSchema,
  createSessionSchema,
  joinSessionSchema,
  answerSchema,
  questionSchema,
  questionUpdateSchema,
  questionOptionSchema,
  questionHintSchema,

  sessionIdSchema,
  playerIdSchema,
  questionIdSchema,

  validate,
  validateBody,
  validateQuery,

  isValidSessionCode,
  normalizeNickname,
  normalizeText,
  safeString,
  isNonEmptyString,
  isValidObjectId,
  stripUndefined,
  parsePositiveInt,

  SESSION_CODE_REGEX,
  NICKNAME_MIN,
  NICKNAME_MAX,
  ANSWER_MAX,
  USERNAME_MIN,
  USERNAME_MAX,
  PASSWORD_MIN,
  PASSWORD_MAX,
};
