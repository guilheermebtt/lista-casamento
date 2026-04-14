/**
 * weddingDateIso: YYYY-MM-DD — alvo às 12h em Brasília (UTC−3 → 15:00 UTC).
 */
export function parseWeddingDateIsoToTargetMs(weddingDateIso) {
  if (weddingDateIso == null || typeof weddingDateIso !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weddingDateIso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d, 15, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;
  return dt.getTime();
}
