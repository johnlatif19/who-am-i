const cloudinary = require("cloudinary").v2;

let initialized = false;

function initCloudinary() {
  if (initialized) return cloudinary;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  initialized = true;
  return cloudinary;
}

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function getCloudinary() {
  if (!isCloudinaryConfigured()) return null;
  if (!initialized) initCloudinary();
  return cloudinary;
}

const UPLOAD_FOLDER = "who-am-i/characters";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const TRANSFORMATION_PRESETS = {
  thumb: [
    { width: 200, height: 200, crop: "fill", gravity: "face" },
    { quality: "auto:good", fetch_format: "auto" },
  ],
  card: [
    { width: 600, height: 600, crop: "limit" },
    { quality: "auto:good", fetch_format: "auto" },
  ],
  display: [
    { width: 1200, height: 1200, crop: "limit" },
    { quality: "auto:best", fetch_format: "auto" },
  ],
};

function buildUrl(publicId, preset) {
  const cl = getCloudinary();
  if (!cl || !publicId) return null;
  const transformation = TRANSFORMATION_PRESETS[preset] || TRANSFORMATION_PRESETS.card;
  return cl.url(publicId, { transformation: transformation, secure: true });
}

async function uploadImage(buffer, options) {
  const cl = getCloudinary();
  if (!cl) {
    const err = new Error("خدمة رفع الصور غير مُهيّأة حاليًا.");
    err.status = 503;
    throw err;
  }

  const opts = options || {};

  return new Promise(function (resolve, reject) {
    const stream = cl.uploader.upload_stream(
      {
        folder: opts.folder || UPLOAD_FOLDER,
        resource_type: "image",
        overwrite: false,
        unique_filename: true,
        use_filename: false,
        transformation: [{ quality: "auto:good", fetch_format: "auto" }],
      },
      function (error, result) {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
}

async function deleteImage(publicId) {
  const cl = getCloudinary();
  if (!cl || !publicId) return { result: "not_configured" };
  try {
    return await cl.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
  } catch (e) {
    return { result: "error", error: e.message };
  }
}

module.exports = {
  initCloudinary,
  getCloudinary,
  isCloudinaryConfigured,
  uploadImage,
  deleteImage,
  buildUrl,
  UPLOAD_FOLDER,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  TRANSFORMATION_PRESETS,
};