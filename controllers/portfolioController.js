// ============================================================
// 🖼️ PORTFOLIO CONTROLLER (معرض الحالات المكتملة)
// ============================================================

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const { User } = require('../models/User');
const Finished_request = require('../models/Finished_request');
const { formateImageUrl } = require('../utils/formate');

// أي حقل في Finished_request يمثل صاحب البورتفوليو حسب دوره
const ROLE_FIELD = { student: 'student', overseer: 'overseer', patient: 'patient' };

const PUBLIC_LIMIT = 3;      // ما يراه الآخرون: آخر 3 فقط
const OWNER_PAGE_SIZE = 10;  // صاحب الملف: كل الحالات مع صفحات

/**
 * @description Portfolio of completed cases (before/after photos)
 * @route GET /api/users/:id/portfolio?page=1      (:id can be "me")
 * @access Private (any logged-in user)
 *
 * - صاحب الملف (أو الأدمن): كل الحالات المكتملة التي لها صورتان، مع صفحات.
 * - غيره: آخر 3 حالات فقط، وفقط الحالات التي وافق المريض على عرضها (allow_portfolio).
 * - لا يُرجع أي اسم مريض.
 */
module.exports.getPortfolio = asyncHandler(async (req, res) => {
    const targetId = req.params.id === 'me' ? req.user.id : req.params.id;

    if (!mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ status: 'error', message: 'معرّف المستخدم غير صحيح' });
    }

    const target = await User.findById(targetId).select('role isAdmin');
    if (!target) {
        return res.status(404).json({ status: 'error', message: 'المستخدم غير موجود' });
    }

    const isOwner = String(req.user.id) === String(targetId);
    const field = ROLE_FIELD[target.role];

    // أدمن أو دور غير مدعوم: لا يوجد بورتفوليو
    if (!field || target.isAdmin) {
        return res.status(200).json({
            status: 'success', message: 'لا يوجد معرض لهذا المستخدم',
            is_owner: isOwner, total: 0, count: 0, has_more: false, data: []
        });
    }

    const seeAll = isOwner || !!req.user.isAdmin;

    const filter = {
        [field]: targetId,
        'photos.before.url': { $exists: true, $ne: null },
        'photos.after.url': { $exists: true, $ne: null }
    };
    // الآخرون يرون فقط ما وافق المريض على عرضه
    if (!seeAll) filter['Requestion.allow_portfolio'] = true;

    const page = seeAll ? Math.max(parseInt(req.query.page, 10) || 1, 1) : 1;
    const limit = seeAll ? OWNER_PAGE_SIZE : PUBLIC_LIMIT;

    const [total, docs] = await Promise.all([
        Finished_request.countDocuments(filter),
        Finished_request.find(filter)
            .sort({ completedAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('case_type', 'case_type')
            .lean()
    ]);

    const data = docs.map((d) => ({
        _id: d._id,
        case_type: d.case_type?.case_type || null,
        tooth_location: d.Requestion?.tooth_location || null,
        completed_at: d.completedAt,
        before_url: formateImageUrl(d.photos.before.url),
        after_url: formateImageUrl(d.photos.after.url),
        // التقييم يظهر فقط ببورتفوليو الطالب
        rating: target.role === 'student' ? d.rating : null
    }));

    res.status(200).json({
        status: 'success',
        message: 'معرض الحالات المكتملة',
        is_owner: isOwner,
        total,
        count: data.length,
        has_more: seeAll && page * limit < total,
        data
    });
});
