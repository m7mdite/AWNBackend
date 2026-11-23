const mongoose = require('mongoose');

// صورة واحدة للحالة (قبل أو بعد المعالجة)
const casePhotoSchema = new mongoose.Schema({
    url: { type: String, required: true },
    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['patient', 'student', 'overseer'] },
    uploaded_at: { type: Date, default: Date.now }
}, { _id: false });

// طلب المشرف من الطالب إعادة تصوير صورة (قبل أو بعد)
const retakeRequestSchema = new mongoose.Schema({
    which: { type: String, enum: ['before', 'after'], required: true },
    note: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now }
}, { _id: false });

module.exports = { casePhotoSchema, retakeRequestSchema };
