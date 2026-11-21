const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const { User } = require('../../models/User');
const Student_profile = require('../../models/Student_profile');
const { Overseer_profile } = require('../../models/Overseer_profile');
const { Pending_request } = require('../../models/Pending_request');
const InProcess_request = require('../../models/InProcess_request');
const Finished_request = require('../../models/Finished_request');
const Rejected_request = require('../../models/Rejected_request');
const Treatment = require('../../models/Treatment');
const Report = require('../../models/Report');
const PendingPost = require('../../models/Correspondence/Pending_posts');
const { Verify_request } = require('../../models/VerifyRequest');
const H = require('../../utils/statsHelpers');

// تخزين مؤقت قصير حتى لا تُعاد الاستعلامات عند كل تحديث متتابع
const cache = new Map();
const CACHE_MS = 30 * 1000;

const countByType = (Model) =>
  Model.aggregate([
    { $match: { case_type: { $ne: null } } },
    { $group: { _id: '$case_type', n: { $sum: 1 } } }
  ]);

/**
 * @desc إحصاءات لوحة الأدمن
 * @route GET /api/admin/stats?weeks=8
 * @access Admin
 */
module.exports.getStats = asyncHandler(async (req, res) => {
  const weeks = Math.min(Math.max(parseInt(req.query.weeks, 10) || 8, 1), 26);
  const hit = cache.get(weeks);
  if (hit && Date.now() - hit.t < CACHE_MS) return res.status(200).json(hit.body);

  const now = Date.now();
  const since = new Date(now - weeks * H.WEEK);

  const queries = {
    // المستخدمون
    patients: User.countDocuments({ role: 'patient', isAdmin: { $ne: true } }),
    students: User.countDocuments({ role: 'student' }),
    overseers: User.countDocuments({ role: 'overseer' }),
    admins: User.countDocuments({ isAdmin: true }),
    verifiedStudents: Student_profile.countDocuments({ is_verified: true }),
    // حالات الطلبات
    pending: Pending_request.countDocuments(),
    processing: InProcess_request.countDocuments(),
    finished: Finished_request.countDocuments(),
    rejected: Rejected_request.countDocuments(),
    // ما يحتاج إجراء
    pendingReports: Report.countDocuments({ status: 'pending' }),
    pendingPosts: PendingPost.countDocuments(),
    pendingVerifications: Verify_request.aggregate([
      { $lookup: { from: Student_profile.collection.name, localField: 'student_profile', foreignField: '_id', as: 'sp' } },
      { $match: { 'sp.0': { $exists: true }, 'sp.is_verified': { $ne: true } } },
      { $count: 'n' }
    ]).then((r) => (r[0] ? r[0].n : 0)),
    // الأداء
    finAgg: Finished_request.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          avgMs: {
            $avg: {
              $cond: [
                { $and: ['$originalCreatedAt', '$completedAt'] },
                { $subtract: ['$completedAt', '$originalCreatedAt'] },
                null
              ]
            }
          }
        }
      }
    ]),
    // التواريخ لتوزيعها على الأسابيع
    pendDates: Pending_request.find({ createdAt: { $gte: since } }).select('createdAt').lean(),
    procDates: InProcess_request.find({}).select('Requestion.createdAt').lean(),
    finDates: Finished_request.find({
      $or: [{ originalCreatedAt: { $gte: since } }, { completedAt: { $gte: since } }]
    }).select('originalCreatedAt completedAt').lean(),
    rejDates: Rejected_request.find({ originalCreatedAt: { $gte: since } }).select('originalCreatedAt').lean(),
    // أكثر أنواع المعالجة طلبًا
    typePend: countByType(Pending_request),
    typeProc: countByType(InProcess_request),
    typeFin: countByType(Finished_request),
    typeRej: countByType(Rejected_request),
    // الأكثر نشاطًا
    finByStudent: Finished_request.aggregate([
      { $group: { _id: '$student', n: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
      { $sort: { n: -1 } },
      { $limit: 5 }
    ]),
    procByOverseer: InProcess_request.aggregate([
      { $match: { overseer: { $ne: null } } },
      { $group: { _id: '$overseer', n: { $sum: 1 } } }
    ]),
    finByOverseer: Finished_request.aggregate([{ $group: { _id: '$overseer', n: { $sum: 1 } } }])
  };

  const keys = Object.keys(queries);
  const values = await Promise.all(Object.values(queries));
  const r = Object.fromEntries(keys.map((k, i) => [k, values[i]]));

  // ---- الطلبات والأداء ----
  const total = r.pending + r.processing + r.finished + r.rejected;
  const fin = r.finAgg[0] || {};

  // ---- الأسابيع ----
  const newDates = [
    ...r.pendDates.map((d) => d.createdAt),
    ...r.procDates.map((d) => d.Requestion && d.Requestion.createdAt),
    ...r.finDates.map((d) => d.originalCreatedAt),
    ...r.rejDates.map((d) => d.originalCreatedAt)
  ];
  const doneDates = r.finDates.map((d) => d.completedAt);
  const newPerWeek = H.bucketByWeek(newDates, weeks, now);
  const donePerWeek = H.bucketByWeek(doneDates, weeks, now);
  const starts = H.weekStarts(weeks, now);
  const weekly = starts.map((weekStart, i) => ({
    weekStart,
    newRequests: newPerWeek[i],
    completed: donePerWeek[i]
  }));

  // ---- أنواع المعالجة ----
  const typeMap = H.mergeCounts([r.typePend, r.typeProc, r.typeFin, r.typeRej]);
  const topTypes = H.topN(typeMap, 5);
  const typeIds = topTypes.map(([k]) => k).filter((k) => mongoose.isValidObjectId(k));
  const treatments = typeIds.length
    ? await Treatment.find({ _id: { $in: typeIds } }).select('case_type').lean()
    : [];
  const treatmentName = new Map(treatments.map((t) => [String(t._id), t.case_type]));
  const topTreatments = topTypes.map(([k, count]) => ({
    // إن كان المخزَّن نصًا (اسمًا) لا معرّفًا نعرضه كما هو
    name: treatmentName.get(k) || (mongoose.isValidObjectId(k) && k.length === 24 ? 'غير معروف' : k),
    count
  }));

  // ---- أفضل الطلاب ----
  const studentIds = r.finByStudent.map((s) => s._id).filter(Boolean);
  const studentProfiles = studentIds.length
    ? await Student_profile.find({ user: { $in: studentIds } }).select('user first_name last_name').lean()
    : [];
  const studentName = new Map(studentProfiles.map((p) => [String(p.user), H.fullName(p)]));
  const topStudents = r.finByStudent.map((s) => ({
    name: studentName.get(String(s._id)) || 'غير معروف',
    finished: s.n,
    avgRating: H.round1(s.avgRating)
  }));

  // ---- حمل المشرفين ----
  const procMap = H.mergeCounts([r.procByOverseer]);
  const finMap = H.mergeCounts([r.finByOverseer]);
  const overseerKeys = [...new Set([...procMap.keys(), ...finMap.keys()])];
  const overseerProfiles = overseerKeys.length
    ? await Overseer_profile.find({
        $or: [{ user: { $in: overseerKeys } }, { _id: { $in: overseerKeys } }]
      }).select('user first_name last_name').lean()
    : [];
  const overseerName = new Map();
  overseerProfiles.forEach((p) => {
    const n = H.fullName(p);
    overseerName.set(String(p.user), n);
    overseerName.set(String(p._id), n);
  });
  const overseerLoad = overseerKeys
    .map((k) => ({
      name: overseerName.get(k) || 'غير معروف',
      processing: procMap.get(k) || 0,
      finished: finMap.get(k) || 0
    }))
    .sort((a, b) => b.processing - a.processing || b.finished - a.finished)
    .slice(0, 5);

  const body = {
    status: 'success',
    message: 'تم',
    data: {
      generatedAt: new Date(now).toISOString(),
      weeks,
      users: {
        patients: r.patients,
        students: r.students,
        verifiedStudents: r.verifiedStudents,
        overseers: r.overseers,
        admins: r.admins
      },
      requests: {
        total,
        pending: r.pending,
        processing: r.processing,
        finished: r.finished,
        rejected: r.rejected,
        completionRate: H.percent(r.finished, total),
        rejectionRate: H.percent(r.rejected, total)
      },
      performance: {
        avgRating: H.round1(fin.avgRating),
        avgDays: fin.avgMs ? H.round1(fin.avgMs / H.DAY) : null
      },
      weekly,
      topTreatments,
      topStudents,
      overseerLoad,
      attention: {
        pendingRequests: r.pending,
        pendingVerifications: r.pendingVerifications,
        pendingReports: r.pendingReports,
        pendingPosts: r.pendingPosts
      }
    }
  };

  cache.set(weeks, { t: now, body });
  res.status(200).json(body);
});
