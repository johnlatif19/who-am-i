const admin = require("firebase-admin");

let initialized = false;
let firestoreDb = null;

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (raw && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.private_key && typeof parsed.private_key === "string") {
        parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      }
      return parsed;
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON غير صالح. تأكد من نسخه كسطر JSON واحد.");
      }
      console.error("[firebase] FIREBASE_SERVICE_ACCOUNT_JSON is invalid.");
      throw new Error("تعذر تهيئة Firebase.");
    }
  }

  const projectId = process.env.FIRESTORE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return {
      projectId: projectId,
      clientEmail: clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

function initFirebase() {
  if (initialized) return admin;

  const serviceAccount = parseServiceAccount();

  if (serviceAccount) {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || process.env.FIRESTORE_PROJECT_ID,
      });
    }
  } else {
    if (admin.apps.length === 0) {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
      } else {
        if (process.env.NODE_ENV !== "production") {
          throw new Error(
            "لم يتم ضبط بيانات Firebase. أضف FIREBASE_SERVICE_ACCOUNT_JSON أو GOOGLE_APPLICATION_CREDENTIALS."
          );
        }
        console.error("[firebase] Missing credentials.");
        throw new Error("تعذر تهيئة Firebase.");
      }
    }
  }

  firestoreDb = admin.firestore();
  firestoreDb.settings({ ignoreUndefinedProperties: true });

  initialized = true;
  return admin;
}

function getFirestore() {
  if (!firestoreDb) initFirebase();
  return firestoreDb;
}

function getAuth() {
  if (!initialized) initFirebase();
  return admin.auth();
}

function getAdmin() {
  if (!initialized) initFirebase();
  return admin;
}

const COLLECTIONS = {
  SESSIONS: "sessions",
  QUESTIONS: "questions",
  PLAYERS: "players",
  ANSWERS: "answers",
  EVENTS: "events",
  CONFIG: "config",
  QUIZZES: "quizzes",
};

const SESSION_SUBCOLLECTIONS = {
  PLAYERS: "players",
  ANSWERS: "answers",
  EVENTS: "events",
};

module.exports = {
  admin,
  initFirebase,
  getFirestore,
  getAuth,
  getAdmin,
  COLLECTIONS,
  SESSION_SUBCOLLECTIONS,
};