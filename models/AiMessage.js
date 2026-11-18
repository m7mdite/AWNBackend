const Joi = require('joi');
const mongoose = require('mongoose');

// رسائل محادثة المساعد الذكي، رسالة واحدة في كل وثيقة، لكل مستخدم
const AiMessageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true }, // نفس تسمية Ollama
  content: { type: String, required: true, maxlength: 20000 },
  createdAt: { type: Date, default: Date.now }
});

AiMessageSchema.index({ user: 1, createdAt: -1 });

// حذف تلقائي للرسائل القديمة (اختياري): AI_HISTORY_TTL_DAYS=30 مثلًا، و0 يعني بلا حذف
const ttlDays = Number(process.env.AI_HISTORY_TTL_DAYS) || 0;
if (ttlDays > 0) {
  AiMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: ttlDays * 86400 });
}

const validateAiMessage = (data) => {
  const maxChars = Number(process.env.AI_MAX_MESSAGE_CHARS) || 2000;
  const schema = Joi.object({
    message: Joi.string().trim().min(1).max(maxChars).required()
  });
  return schema.validate(data);
};

const AiMessage = mongoose.model('AiMessage', AiMessageSchema);

module.exports = { AiMessage, validateAiMessage };
