# من أنا؟ | Who am I؟

لعبة كنسية تفاعلية للشباب تعتمد على تخمين شخصيات الكتاب المقدس من خلال التلميحات والاختيارات المتعددة.

تُدار اللعبة من ثلاثة أنظمة منفصلة تمامًا:

1. **نظام الأدمن** — إنشاء الجلسات، إدارة الأسئلة، التحكم بالمؤقت، اعتماد النتائج.
2. **نظام اللاعب** — الانضمام من الهاتف، قراءة التلميحات، إرسال الإجابة.
3. **شاشة العرض** — عرض الحالة للبروجكتور، بدون أي صلاحيات إدارية.

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
│ ├── js/
│ └── assets/images/who_am_i/logo.png
├── src/
│ ├── config/
│ ├── routes/
│ ├── middleware/
│ ├── services/
│ └── utils/
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