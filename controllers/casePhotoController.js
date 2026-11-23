// ============================================================
// 📸 CASE PHOTO CONTROLLER (صور الحالة: قبل / بعد المعالجة)
// ============================================================

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const InProcess_request = require('../models/InProcess_request');
const { notifyUser } = require('../utils/notifyUser');
const { formateImageUrl } = require('../utils/formate');

const VALID_WHICH = ['before', 'after'];

// يحذف صورة الطالب القديمة فقط (مجلد images/cases). صورة المريض الأصلية تبقى كما هي.
const removeOldCaseFile = (relativeUrl) => {
    try {
        if (!relativeUrl || !relativeUrl.startsWith('images/cases/')) return;
        fs.unlink(path.join(__dirname, '..', relativeUrl), () => {});
    } catch (_) { /* تجاهل */ }
};

const formatPhotos = (photos) => {
    const out = {};
    for (const key of VALID_WHICH) {
        const p = photos?.[key];
        if (p?.url) {
            out[key] = { url: formateImageUrl(p.url), role: p.role, uploaded_at: p.uploaded_at };
        }
    }
    return out;
};

/**
 * @description Student uploads / replaces the before or after photo of a case he accepted
 * @route PUT /api/request/processing/:id/photo/:which   (which = before | after)
 * @form photo (file)
 * @access Private (Student only, and only for his own in-process case)
 */
module.exports.uploadCasePhoto = asyncHandler(async (req, res) => {
    const { id: requestId, which } = req.params;

    // أي رفض بعد وصول الملف لازم يحذفه حتى ما يتراكم على السيرفر
    const reject = (code, message) => {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(code).json({ status: 'error', message });
    };

    if (req.user.role !== 'student') {
        return reject(403, 'غير مسموح، رفع صور الحالة للطلاب فقط');
    }
    if (!VALID_WHICH.includes(which)) {
        return reject(400, 'نوع الصورة غير صحيح (before أو after)');
    }
    if (!req.file) {
        return reject(400, 'يرجى اختيار صورة');
    }
    if (!mongoose.isValidObjectId(requestId)) {
        return reject(400, 'معرّف الطلب غير صحيح');
    }

    // الصلاحية: لازم يكون الطلب قيد المعالجة وهو الطالب الذي قبله
    const request = await InProcess_request.findOne({ _id: requestId, student: req.user.id });
    if (!request) {
        return reject(404, 'الطلب غير موجود أو أنه ليس من الحالات التي قبلتها');
    }

    const photos = request.toObject().photos || {};

    if (which === 'before' && request.stage_evaluations.length > 0) {
        return reject(403, 'لا يمكن تعديل صورة قبل المعالجة بعد بدء التقييم المرحلي');
    }
    if (which === 'after' && !photos.before?.url) {
        return reject(400, 'أضف صورة السن قبل المعالجة أولاً');
    }

    const oldUrl = photos[which]?.url;

    request.set(`photos.${which}`, {
        url: `images/cases/${req.file.filename}`,
        uploaded_by: req.user.id,
        role: 'student',
        uploaded_at: new Date()
    });

    // إذا كان المشرف طلب إعادة تصوير هذه الصورة، ينتهي الطلب برفع الصورة الجديدة
    if (request.retake_request?.which === which) {
        request.retake_request = undefined;
    }

    await request.save();
    removeOldCaseFile(oldUrl);

    // إشعار المشرف أن صورة بعد المعالجة جاهزة للمراجعة
    if (which === 'after') {
        notifyUser(request.overseer, 'صورة بعد المعالجة جاهزة', 'رفع الطالب صورة بعد المعالجة، الحالة جاهزة للمراجعة');
    }

    const plain = request.toObject();
    res.status(200).json({
        status: 'success',
        message: which === 'before' ? 'تم حفظ صورة قبل المعالجة' : 'تم حفظ صورة بعد المعالجة',
        data: {
            photos: formatPhotos(plain.photos),
            retake_request: plain.retake_request || null
        }
    });
});
