const jwt = require('jsonwebtoken');
const BlacklistService = require('./blacklistService');
const { checkUserBlocked } = require('../utils/accountStatus');

const unauthorized = (res, message) =>
  res.status(401).json({ status: 'error', message });

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'توكن غير موجود أو غير صالح');
  }

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    if (await BlacklistService.isBlacklisted(token)) {
      return unauthorized(res, 'جلسة غير صالحة، يرجى تسجيل الدخول مرة أخرى');
    }

    // فك التوكن والتحقق منه
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    // 401 (وليس 403) حتى يعتبرها التطبيق انتهاء جلسة. لا نُرجع تفاصيل الخطأ.
    return unauthorized(res, 'جلسة منتهية أو غير صالحة، يرجى تسجيل الدخول مرة أخرى');
  }

  // حساب موقوف/محظور: 401 مع سبب واضح حتى يخرج التطبيق من الجلسة ويعرض الرسالة
  const block = await checkUserBlocked(decoded.id);
  if (block) {
    return res.status(401).json({
      status: 'error',
      code: block.type === 'banned' ? 'ACCOUNT_BANNED' : 'ACCOUNT_SUSPENDED',
      message: block.message
    });
  }

  req.user = decoded;
  req.token = token; // يستخدمه logout و changePassword
  next();
};

module.exports = verifyToken;
