// ============================================================
// 🛡️ MODERATION CONTROLLER (تحذير / إيقاف مؤقت / حظر / رفع)
// ============================================================

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const { User } = require('../../models/User');
const Report = require('../../models/Report');
const AdminAction = require('../../models/AdminAction');
const InProcess_request = require('../../models/InProcess_request');
const getUserProfile = require('../../utils/users');
const { notifyUser, formatWhen } = require('../../utils/notifyUser');
const { invalidateAccountStatus } = require('../../utils/accountStatus');

const ACTIONS = ['warn', 'suspend', 'ban', 'reactivate'];
const ACTION_LABEL = { warn: 'تحذير', suspend: 'إيقاف مؤقت', ban: 'حظر', reactivate: 'رفع الإيقاف/الحظر' };

const fullName = (p) => (p ? [p.first_name, p.father_name, p.last_name].filter(Boolean).join(' ') : '');

/**
 * @description Apply a moderation action on a user (optionally resolving a report)
 * @route PUT /api/admin/users/:id/moderation
 * @body { action: 'warn'|'suspend'|'ban'|'reactivate', reason?: String, days?: Number, reportId?: String }
 * @access Private (Admin only)
 */
module.exports.moderateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { action, reportId } = req.body;
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ status: 'error', message: 'معرّف المستخدم غير صحيح' });
    }
    if (!ACTIONS.includes(action)) {
        return res.status(400).json({ status: 'error', message: 'الإجراء غير صحيح' });
    }
    if (action !== 'reactivate' && reason.length < 3) {
        return res.status(400).json({ status: 'error', message: 'يرجى كتابة سبب الإجراء (3 أحرف على الأقل)' });
    }

    let days = null;
    if (action === 'suspend') {
        days = parseInt(req.body.days, 10);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
            return res.status(400).json({ status: 'error', message: 'مدة الإيقاف يجب أن تكون بين 1 و 365 يوماً' });
        }
    }

    const target = await User.findById(id);
    if (!target) {
        return res.status(404).json({ status: 'error', message: 'المستخدم غير موجود' });
    }
    if (target.isAdmin) {
        return res.status(403).json({ status: 'error', message: 'لا يمكن اتخاذ إجراء ضد حساب أدمن' });
    }
    if (String(target._id) === String(req.user.id)) {
        return res.status(400).json({ status: 'error', message: 'لا يمكنك اتخاذ إجراء ضد حسابك' });
    }

    const current = target.status || 'active';
    if (action === 'reactivate' && current === 'active') {
        return res.status(400).json({ status: 'error', message: 'الحساب نشط أصلاً' });
    }
    if ((action === 'warn' || action === 'suspend') && current === 'banned') {
        return res.status(400).json({ status: 'error', message: 'الحساب محظور أصلاً، ارفع الحظر أولاً إن أردت تغيير الإجراء' });
    }

    let report = null;
    if (reportId) {
        if (!mongoose.isValidObjectId(reportId)) {
            return res.status(400).json({ status: 'error', message: 'معرّف البلاغ غير صحيح' });
        }
        report = await Report.findById(reportId);
        if (!report || String(report.reported) !== String(target._id)) {
            return res.status(400).json({ status: 'error', message: 'البلاغ غير موجود أو لا يخص هذا المستخدم' });
        }
    }

    // ===== تطبيق الإجراء على الحساب =====
    const now = new Date();
    let until = null;
    const set = { statusChangedAt: now, statusChangedBy: req.user.id };
    const unset = {};

    if (action === 'suspend') {
        until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        Object.assign(set, { status: 'suspended', suspendedUntil: until, banReason: reason });
    } else if (action === 'ban') {
        Object.assign(set, { status: 'banned', banReason: reason });
        unset.suspendedUntil = '';
    } else if (action === 'reactivate') {
        set.status = 'active';
        Object.assign(unset, { suspendedUntil: '', banReason: '' });
    }

    if (action !== 'warn') {
        await User.updateOne({ _id: target._id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
        invalidateAccountStatus(target._id); // يسري الحظر/الرفع فوراً
    }

    // ===== أثر الإجراء على الحالات الجارية =====
    let affected = 0;
    let unassigned = 0;
    if (action === 'suspend' || action === 'ban') {
        const field = { student: 'student', overseer: 'overseer', patient: 'patient' }[target.role];
        const cases = field ? await InProcess_request.find({ [field]: target._id }).select('student patient overseer') : [];
        affected = cases.length;

        for (const c of cases) {
            if (target.role === 'student') {
                notifyUser(c.patient, 'تغيّر وضع حالتك', 'تعذر متابعة حالتك مع الطالب مؤقتاً، ستتواصل معك الإدارة بخصوص ذلك.');
            } else if (target.role === 'overseer') {
                if (action === 'ban') {
                    // الحظر النهائي: نفك ارتباط المشرف ليختار الطالب مشرفاً بديلاً (زر "تعيين مشرف")
                    c.overseer = null;
                    await c.save();
                    unassigned++;
                    notifyUser(c.student, 'المشرف غير متاح', 'لم يعد مشرف حالتك متاحاً. اختر مشرفاً بديلاً من تفاصيل الحالة.');
                } else {
                    notifyUser(c.student, 'المشرف موقوف مؤقتاً', 'مشرف حالتك موقوف مؤقتاً، قد تتأخر مراجعة حالتك.');
                }
            } else {
                notifyUser(c.student, 'تغيّر وضع حالة', 'تم إيقاف حساب المريض مؤقتاً/نهائياً، تواصل مع الإدارة قبل المتابعة.');
            }
        }
    }

    // ===== إشعار صاحب الحساب =====
    if (action === 'warn') {
        notifyUser(target._id, 'تحذير من الإدارة', reason);
    } else if (action === 'suspend') {
        notifyUser(target._id, 'تم إيقاف حسابك مؤقتاً', `حتى ${formatWhen(until)}. السبب: ${reason}`);
    } else if (action === 'ban') {
        notifyUser(target._id, 'تم حظر حسابك', `السبب: ${reason}`);
    } else {
        notifyUser(target._id, 'تم رفع الإيقاف عن حسابك', 'يمكنك استخدام التطبيق من جديد.');
    }

    // ===== إغلاق البلاغ المرتبط =====
    if (report && report.status === 'pending') {
        report.status = 'reviewed';
        report.reviewedBy = req.user.id;
        report.reviewedAt = now;
        report.action = action;
        report.adminNotes = report.adminNotes || `الإجراء: ${ACTION_LABEL[action]}${reason ? ` — ${reason}` : ''}`;
        await report.save();
    }

    // ===== سجل الإجراءات =====
    await AdminAction.create({
        admin: req.user.id,
        target: target._id,
        action,
        reason: reason || undefined,
        days: days || undefined,
        until: until || undefined,
        report: report ? report._id : undefined,
        affected_cases: affected
    });

    res.status(200).json({
        status: 'success',
        message: `تم تنفيذ الإجراء: ${ACTION_LABEL[action]}`,
        data: {
            status: action === 'warn' ? current : set.status,
            suspended_until: until,
            ban_reason: action === 'reactivate' ? null : (action === 'warn' ? (target.banReason || null) : reason),
            role: target.role,
            affected_cases: affected,
            unassigned_cases: unassigned
        }
    });
});

/**
 * @description Moderation info for one user (status, history, open reports, active cases)
 * @route GET /api/admin/users/:id/moderation
 * @access Private (Admin only)
 */
module.exports.getModerationInfo = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ status: 'error', message: 'معرّف المستخدم غير صحيح' });
    }

    const target = await User.findById(id).select('role isAdmin status suspendedUntil banReason').lean();
    if (!target) {
        return res.status(404).json({ status: 'error', message: 'المستخدم غير موجود' });
    }

    const profile = await getUserProfile(id, target.role);
    const field = { student: 'student', overseer: 'overseer', patient: 'patient' }[target.role];

    const [recent, warnings, openReports, activeCases] = await Promise.all([
        AdminAction.find({ target: id }).sort({ createdAt: -1 }).limit(5).lean(),
        AdminAction.countDocuments({ target: id, action: 'warn' }),
        Report.countDocuments({ reported: id, status: 'pending' }),
        field ? InProcess_request.countDocuments({ [field]: id }) : 0
    ]);

    // الإيقاف المنتهي يُعرض كنشط
    let status = target.status || 'active';
    if (status === 'suspended' && target.suspendedUntil && new Date(target.suspendedUntil) <= new Date()) {
        status = 'active';
    }

    res.status(200).json({
        status: 'success',
        data: {
            name: fullName(profile),
            role: target.role,
            is_admin: !!target.isAdmin,
            account_status: status,
            suspended_until: status === 'suspended' ? target.suspendedUntil : null,
            ban_reason: status === 'active' ? null : (target.banReason || null),
            warnings_count: warnings,
            open_reports: openReports,
            active_cases: activeCases,
            recent_actions: recent.map((a) => ({
                _id: a._id,
                action: a.action,
                reason: a.reason || null,
                days: a.days || null,
                created_at: a.createdAt
            }))
        }
    });
});

/**
 * @description Audit log of admin moderation actions
 * @route GET /api/admin/actions?page=1&limit=20
 * @access Private (Admin only)
 */
module.exports.listAdminActions = asyncHandler(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);

    const [total, actions] = await Promise.all([
        AdminAction.countDocuments(),
        AdminAction.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
            .populate('admin', 'role isAdmin').populate('target', 'role').lean()
    ]);

    const data = await Promise.all(actions.map(async (a) => {
        const [adminProfile, targetProfile] = await Promise.all([
            a.admin ? getUserProfile(a.admin._id, a.admin.role) : null,
            a.target ? getUserProfile(a.target._id, a.target.role) : null
        ]);
        return {
            _id: a._id,
            action: a.action,
            reason: a.reason || null,
            days: a.days || null,
            affected_cases: a.affected_cases || 0,
            created_at: a.createdAt,
            admin_name: fullName(adminProfile),
            target_name: fullName(targetProfile),
            target_role: a.target?.role || null
        };
    }));

    res.status(200).json({ status: 'success', total, page, has_more: page * limit < total, data });
});
