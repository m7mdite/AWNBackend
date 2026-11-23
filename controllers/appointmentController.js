// ============================================================
// 📅 APPOINTMENT CONTROLLER (مواعيد الحالة)
// ============================================================
// القواعد:
// - الطالب يحدد الموعد الأول -> إشعار للمريض والمشرف.
// - بعد كل تقييم مرحلي يصير needs_next=true، والطالب يحدد موعد المراجعة القادمة
//   -> إشعار للمريض (موعد جديد + تم إجراء تقييم مرحلي) وللمشرف.
// - تغيير موعد قائم: الطالب يرسل اقتراحاً (pending_change) والمريض يقبل أو يرفض.
// - الموعد الحالي يظهر للجميع ضمن بيانات الطلب (حقل appointment).

const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const InProcess_request = require('../models/InProcess_request');
const { notifyUser, formatWhen } = require('../utils/notifyUser');

const MIN_LEAD_MS = 5 * 60 * 1000; // لازم الموعد بعد 5 دقائق على الأقل من الآن

const clean = (s) => (typeof s === 'string' ? s.trim().slice(0, 200) : '');

const formatAppointment = (apt) => {
    if (!apt) return null;
    return {
        date: apt.date || null,
        note: apt.note || null,
        kind: apt.kind || null,
        set_at: apt.set_at || null,
        needs_next: apt.needs_next === true,
        pending_change: apt.pending_change?.date
            ? {
                date: apt.pending_change.date,
                reason: apt.pending_change.reason || null,
                proposed_at: apt.pending_change.proposed_at || null
            }
            : null
    };
};

/**
 * @description Student sets the appointment (first / next review) or proposes a change
 * @route PUT /api/request/processing/:id/appointment
 * @body { date: ISO string, note?: String, reason?: String (عند اقتراح تغيير) }
 * @access Private (Student only, his own in-process case)
 */
module.exports.setAppointment = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (req.user.role !== 'student') {
        return res.status(403).json({ status: 'error', message: 'غير مسموح، تحديد الموعد للطلاب فقط' });
    }
    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ status: 'error', message: 'معرّف الطلب غير صحيح' });
    }

    const when = new Date(req.body.date);
    if (!req.body.date || Number.isNaN(when.getTime())) {
        return res.status(400).json({ status: 'error', message: 'التاريخ غير صحيح' });
    }
    if (when.getTime() < Date.now() + MIN_LEAD_MS) {
        return res.status(400).json({ status: 'error', message: 'يجب أن يكون الموعد في المستقبل' });
    }

    const request = await InProcess_request.findOne({ _id: id, student: req.user.id });
    if (!request) {
        return res.status(404).json({ status: 'error', message: 'الطلب غير موجود أو أنه ليس من الحالات التي قبلتها' });
    }

    const apt = request.toObject().appointment || {};
    const hasCurrent = !!apt.date;
    const needsNext = apt.needs_next === true;
    const whenText = formatWhen(when);

    // ---- 1) موعد جديد مباشر: أول موعد، أو موعد المراجعة بعد تقييم مرحلي ----
    if (!hasCurrent || needsNext) {
        const kind = needsNext ? 'review' : 'initial';

        request.set('appointment', {
            date: when,
            note: clean(req.body.note) || undefined,
            kind,
            set_at: new Date(),
            needs_next: false
        });
        await request.save();

        if (kind === 'initial') {
            notifyUser(request.patient, 'تم تحديد موعد معالجتك', `حدد الطالب موعد معالجتك: ${whenText}`);
            notifyUser(request.overseer, 'تم تحديد موعد حالة', `حدد الطالب موعد الحالة: ${whenText}`);
        } else {
            notifyUser(
                request.patient,
                'تقييم مرحلي وموعد مراجعة جديد',
                `تم إجراء تقييم مرحلي لحالتك، وموعد المراجعة القادمة: ${whenText}`
            );
            notifyUser(request.overseer, 'تم تحديد موعد المراجعة', `حدد الطالب موعد المراجعة القادمة: ${whenText}`);
        }

        return res.status(200).json({
            status: 'success',
            message: kind === 'initial' ? 'تم تحديد الموعد وإشعار المريض والمشرف' : 'تم تحديد موعد المراجعة وإشعار المريض',
            data: { appointment: formatAppointment(request.toObject().appointment) }
        });
    }

    // ---- 2) تغيير موعد قائم: اقتراح يحتاج موافقة المريض ----
    if (when.getTime() === new Date(apt.date).getTime()) {
        return res.status(400).json({ status: 'error', message: 'هذا هو الموعد الحالي نفسه' });
    }

    const reason = clean(req.body.reason);
    request.set('appointment.pending_change', {
        date: when,
        reason: reason || undefined,
        proposed_at: new Date()
    });
    await request.save();

    notifyUser(
        request.patient,
        'طلب تغيير موعد',
        `يقترح الطالب تغيير موعدك إلى ${whenText}${reason ? ` (السبب: ${reason})` : ''}. يرجى القبول أو الرفض من تفاصيل الحالة.`
    );

    res.status(200).json({
        status: 'success',
        message: 'تم إرسال اقتراح تغيير الموعد للمريض بانتظار موافقته',
        data: { appointment: formatAppointment(request.toObject().appointment) }
    });
});

/**
 * @description Patient accepts or rejects the student's proposed new appointment
 * @route PUT /api/request/processing/:id/appointment/respond
 * @body { accept: Boolean }
 * @access Private (Patient only, his own case)
 */
module.exports.respondToAppointmentChange = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (req.user.role !== 'patient') {
        return res.status(403).json({ status: 'error', message: 'غير مسموح، الرد على الموعد للمرضى فقط' });
    }
    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ status: 'error', message: 'معرّف الطلب غير صحيح' });
    }

    const accept = req.body.accept === true || req.body.accept === 'true';

    const request = await InProcess_request.findOne({ _id: id, patient: req.user.id });
    if (!request) {
        return res.status(404).json({ status: 'error', message: 'الطلب غير موجود' });
    }

    const pending = request.toObject().appointment?.pending_change;
    if (!pending?.date) {
        return res.status(400).json({ status: 'error', message: 'لا يوجد اقتراح تغيير موعد معلّق' });
    }

    if (accept) {
        const whenText = formatWhen(pending.date);
        request.set('appointment.date', pending.date);
        request.set('appointment.kind', 'changed');
        request.set('appointment.set_at', new Date());
        request.set('appointment.pending_change', undefined);
        await request.save();

        notifyUser(request.student, 'وافق المريض على الموعد', `تم اعتماد الموعد الجديد: ${whenText}`);
        notifyUser(request.overseer, 'تغيّر موعد حالة', `تم اعتماد الموعد الجديد للحالة: ${whenText}`);
    } else {
        request.set('appointment.pending_change', undefined);
        await request.save();

        notifyUser(request.student, 'رفض المريض الموعد المقترح', 'يمكنك اقتراح موعد آخر من تفاصيل الحالة.');
    }

    res.status(200).json({
        status: 'success',
        message: accept ? 'تم اعتماد الموعد الجديد' : 'تم رفض الموعد المقترح',
        data: { appointment: formatAppointment(request.toObject().appointment) }
    });
});
