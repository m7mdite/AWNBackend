const mongoose = require('mongoose');
const { casePhotoSchema, retakeRequestSchema } = require('./CasePhotoSchema');

const inProcessSchema = mongoose.Schema({
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    Requestion: {
        type: Object
    },
    overseer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Overseer',
    },
    date_of_accepting: {
        type: String,
        required: true
    },
    case_type: {
        type: String,
    },
    stage_evaluations: [
        {
            text: { type: String, required: true },
            date: { type: Date, default: Date.now }
        }
    ],

    // ===== صور الحالة: قبل / بعد المعالجة =====
    photos: {
        before: { type: casePhotoSchema, default: undefined },
        after: { type: casePhotoSchema, default: undefined }
    },

    // طلب إعادة تصوير معلّق من المشرف (يُمسح عندما يرفع الطالب الصورة الجديدة)
    retake_request: { type: retakeRequestSchema, default: undefined },

    // ===== الموعد (يحدده الطالب) =====
    appointment: {
        date: { type: Date },                       // الموعد الحالي المؤكد
        note: { type: String, maxlength: 200 },
        kind: { type: String, enum: ['initial', 'review', 'changed'] },
        set_at: { type: Date },
        // true بعد كل تقييم مرحلي إلى أن يحدد الطالب موعد المراجعة القادمة
        needs_next: { type: Boolean, default: false },
        // اقتراح تغيير الموعد من الطالب بانتظار موافقة المريض
        pending_change: {
            type: new mongoose.Schema({
                date: { type: Date, required: true },
                reason: { type: String, maxlength: 200 },
                proposed_at: { type: Date, default: Date.now }
            }, { _id: false }),
            default: undefined
        }
    }
});

const InProcess_request = mongoose.model('InProcess_request', inProcessSchema);
module.exports = InProcess_request;
