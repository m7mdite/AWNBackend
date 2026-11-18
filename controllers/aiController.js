const asyncHandler = require('express-async-handler');
const { AiMessage, validateAiMessage } = require('../models/AiMessage');
const { getSystemPrompt } = require('../utils/aiPrompts');
const aiService = require('../services/aiService');

// الدور الفعلي: الأدمن يُعرَّف بـ isAdmin (كما في تسجيل الدخول)
const effectiveRole = (u) => (u.isAdmin ? 'admin' : u.role);
const historyLimit = () => Number(process.env.AI_HISTORY_MESSAGES) || 20;

/**
 * @desc إرسال رسالة للمساعد والحصول على الرد
 * @route POST /api/ai/chat
 * @access Private
 */
module.exports.chat = asyncHandler(async (req, res) => {
  const { error, value } = validateAiMessage(req.body);
  if (error) {
    return res.status(400).json({
      status: 'error',
      message: error.details.map((e) => e.message).join(', ')
    });
  }

  const systemPrompt = getSystemPrompt(effectiveRole(req.user));
  if (!systemPrompt) {
    return res.status(403).json({ status: 'error', message: 'غير مصرح لك باستخدام المساعد' });
  }

  // آخر رسائل المستخدم كسياق للنموذج
  const recent = await AiMessage.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .limit(historyLimit())
    .lean();
  const history = recent.reverse();

  if (!aiService.tryAcquire()) {
    return res.status(503).json({ status: 'error', message: 'المساعد مشغول حاليًا، حاول بعد قليل' });
  }

  let reply;
  try {
    reply = await aiService.chat({ systemPrompt, history, message: value.message });
  } catch (e) {
    if (e instanceof aiService.AiError) {
      return res.status(e.status).json({ status: 'error', message: e.message });
    }
    throw e;
  } finally {
    aiService.release();
  }

  // لا نحفظ شيئًا إلا بعد نجاح الرد
  const now = Date.now();
  const [, assistantMsg] = await AiMessage.insertMany([
    { user: req.user.id, role: 'user', content: value.message, createdAt: new Date(now) },
    { user: req.user.id, role: 'assistant', content: reply, createdAt: new Date(now + 1) }
  ]);

  res.status(200).json({
    status: 'success',
    message: 'تم',
    data: {
      reply: { _id: assistantMsg._id, role: 'assistant', content: reply, createdAt: assistantMsg.createdAt }
    }
  });
});

/**
 * @desc سجل محادثة المستخدم (الأقدم أولًا)
 * @route GET /api/ai/history?limit=50
 * @access Private
 */
module.exports.getHistory = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const msgs = await AiMessage.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('role content createdAt')
    .lean();

  res.status(200).json({ status: 'success', message: 'تم', data: msgs.reverse() });
});

/**
 * @desc مسح سجل محادثة المستخدم
 * @route DELETE /api/ai/history
 * @access Private
 */
module.exports.clearHistory = asyncHandler(async (req, res) => {
  const result = await AiMessage.deleteMany({ user: req.user.id });
  res.status(200).json({
    status: 'success',
    message: 'تم مسح المحادثة',
    data: { deleted: result.deletedCount }
  });
});
