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
