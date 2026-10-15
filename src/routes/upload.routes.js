const express = require("express");
const multer = require("multer");

const { adminAuth } = require("../middleware/admin-auth");
const {
  isCloudinaryConfigured,
  uploadImage,
  deleteImage,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  TRANSFORMATION_PRESETS,
  buildUrl,
} = require("../config/cloudinary");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: function (req, file, cb) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(Object.assign(new Error("نوع الملف غير مدعوم. المسموح: JPG، PNG، WEBP، GIF."), { status: 400 }));
    }
    return cb(null, true);
  },
});

router.get("/status", adminAuth, function (req, res) {
  return res.json({
    success: true,
    configured: isCloudinaryConfigured(),
    allowedMimeTypes: ALLOWED_MIME_TYPES,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    presets: Object.keys(TRANSFORMATION_PRESETS),
  });
});

router.post("/character-image", adminAuth, function (req, res, next) {
  upload.single("image")(req, res, function (err) {
    if (err) {
      const status = err.status || (err.code === "LIMIT_FILE_SIZE" ? 413 : 400);
      const message = err.code === "LIMIT_FILE_SIZE"
        ? "حجم الصورة أكبر من الحد المسموح (5 ميجابايت)."
        : (err.message || "تعذر رفع الصورة.");
      return res.status(status).json({ success: false, message: message });
    }
    return next();
  });
}, async function (req, res) {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        success: false,
        message: "خدمة رفع الصور غير مُهيّأة. أضف بيانات Cloudinary إلى متغيرات البيئة.",
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: "لم يتم استلام أي ملف." });
    }

    const result = await uploadImage(req.file.buffer, { folder: "who-am-i/characters" });

    return res.json({
      success: true,
      image: {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        thumbUrl: buildUrl(result.public_id, "thumb"),
        cardUrl: buildUrl(result.public_id, "card"),
        displayUrl: buildUrl(result.public_id, "display"),
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || "تعذر رفع الصورة." });
  }
});

router.post("/delete", adminAuth, async function (req, res) {
  try {
    const publicId = req.body && req.body.publicId;
    if (!publicId || typeof publicId !== "string") {
      return res.status(400).json({ success: false, message: "معرّف الصورة مطلوب." });
    }
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ success: false, message: "خدمة الصور غير مُهيّأة." });
    }
    const result = await deleteImage(publicId);
    return res.json({ success: true, result: result });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || "تعذر حذف الصورة." });
  }
});

module.exports = router;