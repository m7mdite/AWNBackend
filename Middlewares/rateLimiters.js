const rl = require('express-rate-limit');

const make = ({ windowMs, limit, message, byEmail }) =>
  rl.rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true, // نعدّ المحاولات الفاشلة فقط
    // ipKeyGenerator يعالج عناوين IPv6 (موجود في الإصدارات الحديثة)
    keyGenerator: (req) => {
      const ip = rl.ipKeyGenerator ? rl.ipKeyGenerator(req.ip) : req.ip;
      const email = byEmail ? String((req.body && req.body.email) || '').toLowerCase().trim() : '';
      return `${ip}|${email}`;
    },
    handler: (req, res) => res.status(429).json({ status: 'error', message })
  });

const msg = 'محاولات كثيرة، حاول مجددًا بعد قليل';

// 10 محاولات فاشلة لكل (IP + بريد) كل 15 دقيقة، وسقف أوسع لكل IP
module.exports.loginLimiter = [
  make({ windowMs: 15 * 60 * 1000, limit: 60, message: msg }),
  make({ windowMs: 15 * 60 * 1000, limit: 10, message: msg, byEmail: true })
];

// إنشاء الحسابات: 10 محاولات فاشلة في الساعة لكل IP
module.exports.registerLimiter = make({ windowMs: 60 * 60 * 1000, limit: 10, message: msg });
