# من أنا؟ | Who am I؟

منصة مسابقات تفاعلية مخصصة لاجتماعات الشباب الكنسية. تدعم ثلاثة أنواع من الأسئلة، وإدارة مسابقات محفوظة، ونظام نقاط مرن، وشاشة عرض منفصلة للبروجكتور.

---

## المحتويات

- [المتطلبات](#المتطلبات)
- [هيكل المشروع](#هيكل-المشروع)
- [التشغيل المحلي](#التشغيل-المحلي)
- [متغيرات البيئة](#متغيرات-البيئة)
- [أنواع الأسئلة](#أنواع-الأسئلة)
- [آلية اللعب](#آلية-اللعب)
- [إدارة المسابقات](#إدارة-المسابقات)
- [نظام النقاط](#نظام-النقاط)
- [المؤقت التلقائي](#المؤقت-التلقائي)
- [واجهات المستخدم](#واجهات-المستخدم)
- [مسارات API](#مسارات-api)
- [الأمان](#الأمان)
- [النشر على Vercel](#النشر-على-vercel)
- [استكشاف الأخطاء](#استكشاف-الأخطاء)

---

## المتطلبات

- Node.js `>= 18`
- حساب Firebase مع Firestore مُفعّل
- حساب Cloudinary (اختياري، للصور)
- حساب Vercel (للنشر)

---

## هيكل المشروع
who-am-i-game/
├── public/
│ ├── index.html
│ ├── admin-login.html
│ ├── admin-dashboard.html
│ ├── people.html
│ ├── church-youth-meeting-dashboard.html
│ ├── css/
│ │ ├── index.css
│ │ ├── admin-login.css
│ │ ├── admin-dashboard.css
│ │ ├── people.css
│ │ └── church-youth-meeting-dashboard.css
│ ├── js/
│ │ ├── index.js
│ │ ├── admin-login.js
│ │ ├── admin-dashboard.js
│ │ ├── people.js
│ │ └── church-youth-meeting-dashboard.js
│ └── assets/
│ └── images/
│ └── who-am-i.webp
├── src/
│ ├── config/
│ │ ├── firebase.js
│ │ └── cloudinary.js
│ ├── routes/
│ │ ├── auth.routes.js
│ │ ├── game.routes.js
│ │ ├── questions.routes.js
│ │ ├── upload.routes.js
│ │ └── quiz.routes.js
│ ├── middleware/
│ │ └── admin-auth.js
│ ├── services/
│ │ ├── game.service.js
│ │ ├── scoring.service.js
│ │ ├── realtime.service.js
│ │ └── quiz.service.js
│ └── utils/
│ └── validation.js
├── tests/
│ ├── validation.test.js
│ ├── scoring.test.js
│ └── quiz.test.js
├── scripts/
│ └── seed-questions.js
├── server.js
├── package.json
├── vercel.json
├── .env.example
└── README.md

text

---

## التشغيل المحلي

### 1. تثبيت الاعتماديات

```bash
npm install
