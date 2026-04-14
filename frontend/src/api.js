/**
 * Chamadas ao backend (credenciais MP só no servidor)
 */
const base = import.meta.env.VITE_API_URL || '';

const ADMIN_SESSION = 'lista_casamento_admin';

export function getAdminToken() {
  return sessionStorage.getItem(ADMIN_SESSION) || '';
}

export function setAdminToken(token) {
  if (token) sessionStorage.setItem(ADMIN_SESSION, token);
  else sessionStorage.removeItem(ADMIN_SESSION);
}

/** Presentes: API do backend ou fallback para public/gifts.json (site estático) */
export async function fetchGiftsWithFallback() {
  try {
    const res = await fetch(`${base}/api/gifts`);
    if (res.ok) {
      const g = await res.json();
      if (Array.isArray(g)) return g;
    }
  } catch {
    /* backend off-line */
  }
  const res = await fetch('/gifts.json');
  if (!res.ok) throw new Error('Falha ao carregar presentes');
  const g = await res.json();
  return Array.isArray(g) ? g : [];
}

/** Config do site (hero, meta lua de mel) — API ou fallback public/config.json */
export async function fetchConfigWithFallback() {
  try {
    const res = await fetch(`${base}/api/config`, { cache: 'no-store' });
    if (res.ok) {
      const c = await res.json();
      if (c && typeof c === 'object') return c;
    }
  } catch {
    /* backend off-line */
  }
  const res = await fetch('/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao carregar configuração');
  return res.json();
}

/**
 * Só GET /api/config — não usa config.json estático.
 * Use ao atualizar em segundo plano para não sobrescrever a meta com valores antigos do fallback.
 */
export async function fetchSiteConfigFromApi() {
  try {
    const res = await fetch(`${base}/api/config`, { cache: 'no-store' });
    if (!res.ok) return null;
    const c = await res.json();
    return c && typeof c === 'object' ? c : null;
  } catch {
    return null;
  }
}

async function adminFetch(path, options = {}) {
  const token = getAdminToken();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

export async function adminCheck() {
  return adminFetch('/api/admin/check');
}

export async function adminGetRegistry() {
  return adminFetch('/api/admin/registry');
}

export async function adminGetGifts() {
  return adminFetch('/api/admin/gifts');
}

export async function adminPutGifts(gifts) {
  return adminFetch('/api/admin/gifts', {
    method: 'PUT',
    body: JSON.stringify(gifts),
  });
}

export async function adminGetConfig() {
  return adminFetch('/api/admin/config');
}

export async function adminPutConfig(config) {
  return adminFetch('/api/admin/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function createCardPayment(payload) {
  const res = await fetch(`${base}/api/payments/card`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível processar o cartão');
  }
  return data;
}

export async function createPixPayment({
  amount,
  description,
  payerEmail,
  payerDocument,
  externalReference,
  buyerName,
  guestMessage,
}) {
  const body = {
    amount,
    description,
    payerEmail,
    payerDocument,
    externalReference,
  };
  if (buyerName != null) body.buyerName = buyerName;
  if (guestMessage != null && String(guestMessage).trim() !== '') {
    body.guestMessage = String(guestMessage).trim().slice(0, 500);
  }

  const res = await fetch(`${base}/api/payments/pix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível criar o pagamento PIX');
  }
  return data;
}

export async function getPaymentStatus(paymentId) {
  const res = await fetch(`${base}/api/payments/${paymentId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Falha ao consultar pagamento');
  }
  return data;
}

/** Total arrecadado só para a lua de mel */
export async function getContributionsTotal() {
  const res = await fetch(`${base}/api/contributions`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Falha ao carregar total');
  }
  return data.luaDeMelTotal ?? data.totalRaised;
}

/** Presentes já escolhidos + total lua de mel */
export async function getRegistry() {
  const res = await fetch(`${base}/api/registry`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Falha ao carregar lista de presentes');
  }
  return data;
}

export async function applyContribution(paymentId) {
  const res = await fetch(`${base}/api/contributions/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível confirmar o pagamento');
  }
  return data;
}
