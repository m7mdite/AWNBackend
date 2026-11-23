// ============================================================
// 🔔 NOTIFY USER (إشعار فوري عبر Socket.IO بنفس حدث 'notify' الذي يعالجه التطبيقان)
// ============================================================
const socket = require('../socket/init');

/**
 * يرسل إشعاراً للمستخدم إذا كان متصلاً (غرفة باسم id المستخدم).
 * لا يرمي أخطاء أبداً حتى لا يفشل الطلب الأساسي بسبب الإشعار.
 */
module.exports.notifyUser = (userId, title, body, extra = {}) => {
    try {
        const io = socket.getIO();
        if (!io || !userId) return;
        io.to(String(userId)).emit('notify', {
            title,
            body,
            timestamp: new Date().toISOString(),
            ...extra
        });
    } catch (err) {
        console.error('notifyUser failed:', err.message);
    }
};

// تنسيق تاريخ/وقت للعرض داخل نص الإشعار (توقيت سوريا افتراضياً، قابل للتغيير من .env)
module.exports.formatWhen = (date) => {
    try {
        return new Date(date).toLocaleString('ar-SY', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: process.env.APP_TIMEZONE || 'Asia/Damascus'
        });
    } catch (_) {
        return new Date(date).toISOString();
    }
};
