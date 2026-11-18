const jwt = require('jsonwebtoken');
const BlacklistService = require('./blacklistService');

const unauthorized = (res, message) =>
  res.status(401).json({ status: 'error', message });

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'توكن غير موجود أو غير صالح');
  }

  const token = authHeader.split(' ')[1];
  try {
    if (await BlacklistService.isBlacklisted(token)) {
      return unauthorized(res, 'جلسة غير صالحة، يرجى تسجيل الدخول مرة أخرى');
    }

    // فك التوكن والتحقق منه
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    req.token = token; // يستخدمه logout و changePassword
    next();
  } catch (error) {
    // 401 (وليس 403) حتى يعتبرها التطبيق انتهاء جلسة. لا نُرجع تفاصيل الخطأ.
    return unauthorized(res, 'جلسة منتهية أو غير صالحة، يرجى تسجيل الدخول مرة أخرى');
  }
};

module.exports = verifyToken;
