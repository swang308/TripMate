function normalizeDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function dateOnlyToUtcDate(value) {
  const key = normalizeDateOnly(value);
  if (!key) return new Date(Number.NaN);
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function eachDate(startDate, endDate) {
  const out = [];
  const start = dateOnlyToUtcDate(startDate);
  const end = dateOnlyToUtcDate(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function isEndBeforeStart(startDate, endDate) {
  return dateOnlyToUtcDate(endDate) < dateOnlyToUtcDate(startDate);
}

module.exports = { eachDate, normalizeDateOnly, dateOnlyToUtcDate, isEndBeforeStart };
