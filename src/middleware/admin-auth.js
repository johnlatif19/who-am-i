const jwt = require("jsonwebtoken");

const COOKIE_NAME = "admin_token";

function getTokenFromRequest(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }

  const authHeader = req.headers && req.headers.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || typeof payload !== "object") return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function buildUnauthorized(res, message) {
  return res.status(401).json({
    success: false,
    message: message || "غير مصرح. يرجى تسجيل الدخول.",
  });
}

function adminAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return buildUnauthorized(res);
  }

  const payload = verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return buildUnauthorized(res, "جلسة غير صالحة أو منتهية.");
  }

  req.admin = {
    username: payload.sub,
    role: payload.role,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };

  return next();
}

function viewerOrAdminAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return buildUnauthorized(res);
  }

  const payload = verifyToken(token);
  if (!payload || (payload.role !== "admin" && payload.role !== "viewer")) {
    return buildUnauthorized(res, "جلسة غير صالحة أو منتهية.");
  }

  req.viewer = {
    username: payload.sub,
    role: payload.role,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };

  return next();
}

function optionalAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.admin = {
        username: payload.sub,
        role: payload.role,
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      };
    }
  }
  return next();
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return function (req, res, next) {
    const actor = req.admin || req.viewer;
    if (!actor) {
      return buildUnauthorized(res);
    }
    if (!allowed.includes(actor.role)) {
      return res.status(403).json({
        success: false,
        message: "لا تملك الصلاحية لتنفيذ هذه العملية.",
      });
    }
    return next();
  };
}

module.exports = {
  adminAuth,
  viewerOrAdminAuth,
  optionalAuth,
  requireRole,
  COOKIE_NAME,
  getTokenFromRequest,
  verifyToken,
};