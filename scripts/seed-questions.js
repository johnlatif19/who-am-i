require("dotenv").config();

const { initFirebase, getFirestore, COLLECTIONS } = require("../src/config/firebase");

const questions = [
  {
    question: "أنا شاب واجهت محاربًا عملاقًا، ولم أعتمد على السيف أو الرمح، بل على إيماني بالله. فمن أنا؟",
    answer: "داود",
    reference: "1 صموئيل 17: 45–50",
    options: ["شاول", "داود", "يشوع", "شمشون"],
    correctIndex: 1,
    hints: [
      "كنت راعيًا للغنم.",
      "استخدمت مقلاعًا وخمسة حجارة ملساء.",
      "خصمي كان اسمه جليات.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
  {
    question: "أنا شخص باعني إخوتي، ومررت بظروف صعبة، لكن الله رفعني حتى أصبحت صاحب مكانة كبيرة في مصر. فمن أنا؟",
    answer: "يوسف",
    reference: "تكوين 37: 3–28؛ تكوين 41: 39–43",
    options: ["بنيامين", "إسحاق", "يوسف", "يعقوب"],
    correctIndex: 2,
    hints: [
      "كان أبي يحبني حبًا خاصًا.",
      "ارتبط اسمي بقميص ملون.",
      "فسرت أحلام فرعون وصرت مسؤولًا عن أرض مصر.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
  {
    question: "كنت أريد أن أرى يسوع، لكنني واجهت مشكلة بسبب قصر قامتي، فوجدت طريقة غير معتادة لأراه. فمن أنا؟",
    answer: "زكا",
    reference: "لوقا 19: 1–10",
    options: ["نيقوديموس", "زكا", "برتيماوس", "متى"],
    correctIndex: 1,
    hints: [
      "كنت رئيسًا للعشارين.",
      "كنت غنيًا.",
      "صعدت على جميزة لأرى يسوع.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
  {
    question: "وجدت نفسي في مكانة ملكية، وكان عليّ أن أخاطر بحياتي من أجل إنقاذ شعبي. فمن أنا؟",
    answer: "أستير",
    reference: "أستير 4: 13–16؛ أستير 7: 3–6",
    options: ["راعوث", "دبورة", "أستير", "مريم أخت موسى"],
    correctIndex: 2,
    hints: [
      "كنت فتاة يهودية يتيمة.",
      "أصبحت ملكة في بلاد فارس.",
      "طلبت من شعبي الصوم قبل دخولي إلى الملك.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
  {
    question: "لم أصدق خبر قيامة يسوع عندما أخبرني التلاميذ، وأردت أن أتأكد بنفسي. فمن أنا؟",
    answer: "توما الرسول",
    reference: "يوحنا 20: 24–29",
    options: ["بطرس", "فيلبس", "أندراوس", "توما"],
    correctIndex: 3,
    hints: [
      "كنت واحدًا من الاثني عشر.",
      "لم أكن موجودًا عندما ظهر يسوع للتلاميذ أول مرة بعد القيامة.",
      "قلت إنني لن أؤمن إلا إذا رأيت أثر المسامير.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
  {
    question: "شعرت أنني من أضعف الأشخاص، لكن الله دعاني لقيادة شعبه والانتصار على جيش كبير بعدد قليل جدًا. فمن أنا؟",
    answer: "جدعون",
    reference: "قضاة 6: 11–16؛ قضاة 7: 19–22",
    options: ["باراق", "جدعون", "يفتاح", "شمشون"],
    correctIndex: 1,
    hints: [
      "كنت من سبط منسى.",
      "طلبت علامة من الله باستخدام جزة صوف.",
      "انتصرت على المديانيين بجيش تقلص إلى 300 رجل.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
  {
    question: "سمعت عن خراب مدينتي، فحزنت وطلبت من الله، ثم ذهبت لأعيد بناء أسوارها رغم المعارضة. فمن أنا؟",
    answer: "نحميا",
    reference: "نحميا 2: 11–18؛ نحميا 6: 15–16",
    options: ["عزرا", "زربابل", "نحميا", "دانيال"],
    correctIndex: 2,
    hints: [
      "كنت أعمل في قصر الملك.",
      "كنت ساقيًا للملك أرتحشستا.",
      "أعدت بناء أسوار أورشليم في 52 يومًا.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
  {
    question: "بعد أن فقدت زوجي، اخترت أن أظل مع حماتي وأذهب معها إلى شعب لم يكن شعبي الأصلي. فمن أنا؟",
    answer: "راعوث",
    reference: "راعوث 1: 14–17؛ راعوث 4: 13–17",
    options: ["حنة", "راعوث", "أليصابات", "مريم المجدلية"],
    correctIndex: 1,
    hints: [
      "كنت من موآب.",
      "كانت حماتي تُدعى نعمي.",
      "تزوجت بوعز وأصبحت من أسلاف داود.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
  {
    question: "طلب مني قائد جيش أجنبي الشفاء من مرضه، فطلبت منه أن يغتسل في نهر سبع مرات، رغم أنه لم يعجبه طلبي في البداية. فمن أنا؟",
    answer: "أليشع",
    reference: "2 ملوك 5: 1–14",
    options: ["إيليا", "إشعياء", "أليشع", "إرميا"],
    correctIndex: 2,
    hints: [
      "كنت تلميذًا للنبي إيليا وخليفته.",
      "القائد الذي طلب الشفاء كان سوريًا.",
      "اسم القائد نعمان، والنهر الذي اغتسل فيه هو الأردن.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
  {
    question: "قادني الروح إلى رجل كان يقرأ من سفر إشعياء ولا يفهم ما يقرأ، فشرحت له البشارة بيسوع. فمن أنا؟",
    answer: "فيلبس المبشر",
    reference: "أعمال الرسل 8: 26–39",
    options: ["استفانوس", "فيلبس المبشر", "برنابا", "تيموثاوس"],
    correctIndex: 1,
    hints: [
      "كنت واحدًا من السبعة الذين اختارتهم الكنيسة الأولى للخدمة.",
      "قابلت رجلًا حبشيًا مسؤولًا عن خزائن كنداكة.",
      "شرحت له نبوة إشعياء، ثم عمدته في الماء.",
    ],
    basePoints: 10,
    timeLimit: 30,
  },
];

async function run() {
  console.log("جارٍ تهيئة Firebase...");
  initFirebase();
  const db = getFirestore();

  console.log("جارٍ التحقق من الأسئلة الموجودة مسبقًا...");
  const existingSnap = await db.collection(COLLECTIONS.QUESTIONS).get();
  const existingAnswers = new Set();
  existingSnap.forEach(function (doc) {
    const data = doc.data();
    if (data && data.answer) existingAnswers.add(data.answer);
  });

  let added = 0;
  let skipped = 0;
  const now = Date.now();

  for (const q of questions) {
    if (existingAnswers.has(q.answer)) {
      console.log("- تخطي (موجود مسبقًا): " + q.answer);
      skipped++;
      continue;
    }

    const doc = {
      question: q.question,
      answer: q.answer,
      reference: q.reference || "",
      description: "",
      options: q.options,
      correctIndex: q.correctIndex,
      hints: q.hints || [],
      basePoints: q.basePoints != null ? q.basePoints : 10,
      timeLimit: q.timeLimit != null ? q.timeLimit : 30,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await db.collection(COLLECTIONS.QUESTIONS).add(doc);
    console.log("+ تمت إضافة: " + q.answer + " (id: " + ref.id + ")");
    added++;
  }

  console.log("");
  console.log("تمت الإضافة: " + added);
  console.log("تم التخطي: " + skipped);
  console.log("المجموع: " + questions.length);
  process.exit(0);
}

run().catch(function (err) {
  console.error("فشل السكريبت:", err.message || err);
  process.exit(1);
});