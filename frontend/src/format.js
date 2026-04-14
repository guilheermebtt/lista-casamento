export function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/** Aceita "100", "100,50", "100.50" */
export function parseContributionAmount(raw) {
  if (raw == null || String(raw).trim() === '') return NaN;
  const n = Number(String(raw).trim().replace(/\./g, '').replace(',', '.'));
  return n;
}
