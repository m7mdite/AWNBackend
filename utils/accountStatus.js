// ============================================================
// 🚫 ACCOUNT STATUS (حالة الحساب: active / suspended / banned)
// ============================================================
const { User } = require('../models/User');

const CACHE_TTL_MS = 30 * 1000; // كاش قصير حتى لا نستعلم DB مع كل طلب
const cache = new Map();        // userId -> { info, at }

const fmt = (d) => {
    try {
        return new Date(d).toLocaleString('ar-SY', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: process.env.APP_TIMEZONE || 'Asia/Damascus'
        });
    } catch (_) {
        return new Date(d).toISOString();
    }
};

/**
 * يقيّم وثيقة مستخدم ويرجع null إذا الحساب نشط، أو { type, until, message } إذا محظور/موقوف.
 * الأدمن لا يُحظر أبداً. الإيقاف المؤقت المنتهي يُرفع تلقائياً.
 */
const getBlockInfo = (u) => {
    if (!u || u.isAdmin) return null;

    if (u.status === 'banned') {
        return {
            type: 'banned',
            until: null,
            message: `تم حظر حسابك${u.banReason ? `. السبب: ${u.banReason}` : ''}`
        };
    }

    if (u.status === 'suspended') {
        if (!u.suspendedUntil || new Date(u.suspendedUntil) > new Date()) {
            return {
                type: 'suspended',
                until: u.suspendedUntil || null,
                message: `تم إيقاف حسابك مؤقتاً${u.suspendedUntil ? ` حتى ${fmt(u.suspendedUntil)}` : ''}${u.banReason ? `. السبب: ${u.banReason}` : ''}`
            };
        }
        // انتهت مدة الإيقاف: نعيده نشطاً (بدون انتظار)
        User.updateOne(
            { _id: u._id, status: 'suspended' },
            { $set: { status: 'active' }, $unset: { suspendedUntil: '', banReason: '' } }
        ).catch(() => {});
    }
    return null;
};

/** للـ verifyToken: يرجع null أو معلومات الحظر. لا يرمي أخطاء (الفشل = لا نحظر). */
const checkUserBlocked = async (userId) => {
    if (!userId) return null;
    const key = String(userId);

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.info;

    try {
        const u = await User.findById(key).select('status suspendedUntil banReason isAdmin').lean();
        const info = getBlockInfo(u);
        cache.set(key, { info, at: Date.now() });
        return info;
    } catch (err) {
        console.error('checkUserBlocked failed:', err.message);
        return null;
    }
};

/** يمسح الكاش بعد أي تغيير على حالة مستخدم (ليسري الحظر/الرفع فوراً). */
const invalidateAccountStatus = (userId) => cache.delete(String(userId));

/** مجموعة (Set) بمعرّفات المحظورين/الموقوفين من قائمة مستخدمين. */
const getBlockedUserIds = async (userIds = []) => {
    const users = await User.find({
        _id: { $in: userIds },
        status: { $in: ['suspended', 'banned'] }
    }).select('status suspendedUntil banReason isAdmin').lean();

    return new Set(users.filter((u) => getBlockInfo(u)).map((u) => String(u._id)));
};

module.exports = { getBlockInfo, checkUserBlocked, invalidateAccountStatus, getBlockedUserIds };
