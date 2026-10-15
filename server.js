require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const compression = require("compression");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const authRoutes = require("./src/routes/auth.routes");
const gameRoutes = require("./src/routes/game.routes");
const questionsRoutes = require("./src/routes/questions.routes");
const uploadRoutes = require("./src/routes/upload.routes");

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(compression());

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser(process.env.COOKIE_SECRET || "dev-cookie-secret"));

app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_PER_MIN) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "تم تجاوز عدد الطلبات المسموح. حاول بعد قليل." },
}));

app.use("/api/auth/login", rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_PER_MIN) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "محاولات تسجيل دخول كثيرة. حاول بعد قليل." },
}));

app.use(express.static(path.join(__dirname, "public"), {
  index: false,
  maxAge: IS_PROD ? "1y" : 0,
  setHeaders: function (res, filePath) {
    if (filePath.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
    }
  },
}));

app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/questions", questionsRoutes);
app.use("/api/upload", uploadRoutes);

function verifyAdminFromCookie(req) {
  const token = req.cookies && req.cookies.admin_token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || (payload.role !== "admin" && payload.role !== "viewer")) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function sendHtml(res, file) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.sendFile(path.join(__dirname, "public", file));
}

app.get(["/", "/index", "/index.html"], function (req, res) {
  sendHtml(res, "index.html");
});

app.get(["/admin-login", "/admin-login.html"], function (req, res) {
  const payload = verifyAdminFromCookie(req);
  if (payload && payload.role === "admin") {
    return res.redirect("/admin-dashboard");
  }
  sendHtml(res, "admin-login.html");
});

app.get(["/admin-dashboard", "/admin-dashboard.html"], function (req, res) {
  const payload = verifyAdminFromCookie(req);
  if (!payload || payload.role !== "admin") {
    return res.redirect("/admin-login");
  }
  sendHtml(res, "admin-dashboard.html");
});

app.get(["/church-youth-meeting-dashboard", "/church-youth-meeting-dashboard.html"], function (req, res) {
  const payload = verifyAdminFromCookie(req);
  if (!payload || (payload.role !== "admin" && payload.role !== "viewer")) {
    return res.redirect("/admin-login");
  }
  sendHtml(res, "church-youth-meeting-dashboard.html");
});

app.get(["/people", "/people.html"], function (req, res) {
  sendHtml(res, "people.html");
});

app.use("/api", function (req, res) {
  res.status(404).json({ success: false, message: "المسار غير موجود." });
});

app.use(function (err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  const message = IS_PROD
    ? "حدث خطأ غير متوقع."
    : (err.message || "حدث خطأ غير متوقع.");
  if (!IS_PROD) console.error("[error]", err);
  res.status(status).json({ success: false, message: message });
});

app.use(function (req, res) {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ success: false, message: "المسار غير موجود." });
  }
  res.status(404);
  sendHtml(res, "index.html");
});

if (require.main === module) {
  app.listen(PORT, function () {
    console.log("من أنا؟ | Who am I؟ — السيرفر يعمل على المنفذ " + PORT);
  });
}

module.exports = app;