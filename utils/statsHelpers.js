// دوال نقية (بدون قاعدة بيانات) لتجميع الإحصاءات، سهلة الاختبار
const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

/** الاسم الكامل من ملف شخصي (الاسم الأول + الكنية) */
const fullName = (p) => {
  if (!p) return null;
  const n = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
  return n || null;
};

/** يدمج قوائم [{_id, n}] من عدة مجموعات في خريطة واحدة بمفتاح نصي */
function mergeCounts(lists) {
  const m = new Map();
  for (const list of lists) {
    for (const { _id, n } of list) {
      if (_id == null) continue;
      const k = String(_id);
      m.set(k, (m.get(k) || 0) + n);
    }
  }
  return m;
}

/** أعلى n عناصر من خريطة [مفتاح -> عدد] */
const topN = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

/** يوزّع التواريخ على `weeks` أسبوعًا متدرجًا (الفهرس 0 هو الأقدم) */
function bucketByWeek(dates, weeks, now) {
  const out = Array(weeks).fill(0);
  for (const raw of dates) {
    const t = raw ? new Date(raw).getTime() : NaN;
    if (Number.isNaN(t)) continue;
    const ago = Math.floor((now - t) / WEEK);
    if (ago < 0 || ago >= weeks) continue;
    out[weeks - 1 - ago]++;
  }
  return out;
}

/** بداية كل أسبوع متدرج كنص ISO، بنفس ترتيب bucketByWeek */
const weekStarts = (weeks, now) =>
  Array.from({ length: weeks }, (_, i) => new Date(now - (weeks - i) * WEEK).toISOString());

const round1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const percent = (part, total) => (total > 0 ? round1((part / total) * 100) : 0);

module.exports = { DAY, WEEK, fullName, mergeCounts, topN, bucketByWeek, weekStarts, round1, percent };
