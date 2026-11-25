// سجل إجراءات الأدمن (تحذير / إيقاف / حظر / رفع)
const mongoose = require('mongoose');

const adminActionSchema = new mongoose.Schema({
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    target: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['warn', 'suspend', 'ban', 'reactivate'], required: true },
    reason: { type: String, maxlength: 300 },
    days: { type: Number },
    until: { type: Date },
    report: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
    affected_cases: { type: Number, default: 0 }
}, { timestamps: true });

adminActionSchema.index({ target: 1, createdAt: -1 });
adminActionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminAction', adminActionSchema);
