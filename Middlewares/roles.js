// التحقق من الدور على السيرفر. يأتي بعد verifyToken.
// الدور الفعلي: الأدمن يُعرَّف بـ isAdmin (كما في تسجيل الدخول)
const effectiveRole = (u) => (u && u.isAdmin ? 'admin' : u && u.role);

const requireRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(effectiveRole(req.user))) {
    return res.status(403).json({ status: 'error', message: 'غير مصرح لك بهذا الإجراء' });
  }
  next();
};

module.exports = {
  requireRoles,
  requireAdmin: requireRoles('admin'),
  requireOverseer: requireRoles('overseer'),
  requireAdminOrOverseer: requireRoles('admin', 'overseer')
};
