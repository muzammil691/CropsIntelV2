/**
 * Safely convert Supabase BIGINT values to JavaScript numbers.
 *
 * PostgreSQL BIGINT columns are returned as strings by Supabase JS client
 * because JS Number can't safely represent values > 2^53. Since our almond
 * industry values (billions of lbs) fit safely in Number, we convert here.
 *
 * This prevents:
 * - String concatenation in reduce() (0 + "123" = "0123")
 * - Recharts failing to scale string values
 * - toLocaleString() returning unformatted strings
 */
export function toNum(v) {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Normalize crop-year strings to the short format "YYYY/YY".
 *
 * Over the life of the project, different sources wrote the crop_year
 * field in different formats:
 *   - seed-data.js and older position reports use "2025/2026"
 *   - the backfill generator uses "2025/26"
 *   - some PDF-parsed values use "2025/2026"
 *
 * That inconsistency made /destinations show two chip variants of the
 * same year (e.g., "2016/17" + "2016/2017"). Canonicalizing at the UI
 * layer collapses them. The long-term fix is a DB migration but this
 * keeps the display honest in the meantime.
 */
export function normalizeCropYear(s) {
  if (!s || typeof s !== 'string') return s;
  const m = s.match(/^(\d{4})\s*[/\-]\s*(\d{2,4})$/);
  if (!m) return s;
  const start = m[1];
  let end = m[2];
  if (end.length === 4) end = end.slice(2);
  return `${start}/${end}`;
}
