const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const { validateBody, loginSchema } = require("../utils/validation");
const { COOKIE_NAME, verifyToken } = require("../middleware/admin-auth");

const router = express.Router();

const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_MAX_AGE_MS = (Number(process.env.SESSION_TTL_SECONDS) || 8 * 60 * 60) * 1000;

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_PER_MIN) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "محاولات تسجيل دخول كثيرة. حاول بعد قليل." },
});

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
  });
}

function signToken(username, role) {
  return jwt.sign(
    { sub: username, role: role || "admin" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
  );
}

router.post("/login", loginLimiter, validateBody(loginSchema), async function (req, res) {
  try {
    const { username, password } = req.validatedBody;

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminUsername || !adminHash) {
      return res.status(500).json({
        success: false,
        message: "إعدادات حساب الأدمن غير مكتملة على السيرفر.",
      });
    }

    const usernameOk = username === adminUsername;
    const passwordOk = await bcrypt.compare(password, adminHash);

    if (!usernameOk || !passwordOk) {
      return res.status(401).json({
        success: false,
        message: "اسم المستخدم أو كلمة المرور غير صحيحة.",
      });
    }

    const token = signToken(adminUsername, "admin");
    setAuthCookie(res, token);

    return res.json({
      success: true,
      role: "admin",
      user: adminUsername,
      expiresIn: COOKIE_MAX_AGE_MS,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "تعذر إتمام عملية تسجيل الدخول.",
    });
  }
});

router.post("/logout", function (req, res) {
  clearAuthCookie(res);
  return res.json({ success: true, message: "تم تسجيل الخروج." });
});

router.get("/session", function (req, res) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ success: false, message: "لا توجد جلسة." });
  }

  const payload = verifyToken(token);
  if (!payload || (payload.role !== "admin" && payload.role !== "viewer")) {
    return res.status(401).json({ success: false, message: "جلسة غير صالحة." });
  }

  return res.json({
    success: true,
    role: payload.role,
    user: payload.sub,
    expiresAt: payload.exp ? payload.exp * 1000 : null,
  });
});

router.post("/viewer-token", function (req, res) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ success: false, message: "غير مصرح." });
  }
  const payload = verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return res.status(403).json({ success: false, message: "هذه العملية للأدمن فقط." });
  }

  const viewerToken = jwt.sign(
    { sub: payload.sub + ":viewer", role: "viewer" },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  return res.json({ success: true, viewerToken: viewerToken });
});

module.exports = router;