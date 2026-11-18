const { rateLimit } = require('express-rate-limit');

// حد لعدد رسائل المساعد لكل مستخدم (الافتراضي 10 في الدقيقة)
// يجب أن يأتي بعد verifyToken لأن المفتاح هو معرّف المستخدم
module.exports = rateLimit({
  windowMs: 60 * 1000,
  limit: () => Number(process.env.AI_RATE_LIMIT_PER_MIN) || 10,
  keyGenerator: (req) => String(req.user.id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      status: 'error',
      message: 'أرسلت رسائل كثيرة، انتظر قليلًا ثم حاول مجددًا'
    })
});
