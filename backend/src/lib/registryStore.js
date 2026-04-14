/**
 * Registro de vendas (presentes únicos) e total só da lua de mel.
 * Arquivo: backend/data/registry.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const REGISTRY_FILE = join(DATA_DIR, 'registry.json');
const RAISED_LEGACY = join(DATA_DIR, 'raised.json');

export const LUA_DE_MEL_REF = 'lua-de-mel';
const RESERVATION_MS = 45 * 60 * 1000;

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function defaultRegistry() {
  return {
    luaDeMelTotal: 0,
    processedPaymentIds: [],
    soldGifts: {},
    pendingByPaymentId: {},
    giftReservations: {},
    /** Recados de contribuições lua de mel já aprovadas (histórico) */
    luaDeMelNotes: [],
  };
}

function sanitizeGuestMessage(raw) {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  return s.length > 500 ? s.slice(0, 500) : s;
}

const CARD_BRAND_LABELS = {
  visa: 'Visa',
  master: 'Mastercard',
  mastercard: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  naranja: 'Naranja',
  debvisa: 'Visa (débito)',
  debmaster: 'Mastercard (débito)',
  debelo: 'Elo (débito)',
  consumer_credits: 'Crédito MP',
};

/** Rótulo ao criar pagamento de cartão (bandeira escolhida no Brick). */
export function paymentMethodLabelFromCardMethodId(methodId) {
  if (methodId == null || methodId === '') return 'Cartão';
  const k = String(methodId).toLowerCase();
  if (CARD_BRAND_LABELS[k]) return `Cartão — ${CARD_BRAND_LABELS[k]}`;
  return `Cartão — ${String(methodId)}`;
}

/**
 * Rótulo a partir do GET /v1/payments (webhook / apply) — fonte de verdade após aprovação.
 */
export function paymentMethodLabelFromMp(pay) {
  if (!pay || typeof pay !== 'object') return undefined;
  const pm = pay.payment_method_id != null ? String(pay.payment_method_id).toLowerCase() : '';
  const ptype = pay.payment_type_id != null ? String(pay.payment_type_id).toLowerCase() : '';
  if (pm === 'pix' || ptype === 'bank_transfer') return 'PIX';
  if (pm === 'account_money' || ptype === 'account_money') return 'Saldo Mercado Pago';
  if (CARD_BRAND_LABELS[pm]) return `Cartão — ${CARD_BRAND_LABELS[pm]}`;
  if (pm) return `Cartão — ${pm}`;
  if (ptype === 'credit_card' || ptype === 'debit_card') return 'Cartão';
  return undefined;
}

function migrateLegacyRaised() {
  if (existsSync(REGISTRY_FILE)) return;
  if (!existsSync(RAISED_LEGACY)) return;
  try {
    const old = JSON.parse(readFileSync(RAISED_LEGACY, 'utf8'));
    const reg = defaultRegistry();
    reg.luaDeMelTotal = Number(old.totalRaised) || 0;
    reg.processedPaymentIds = Array.isArray(old.processedPaymentIds)
      ? old.processedPaymentIds
      : [];
    writeRegistry(reg);
    console.log('[registry] Migrado de raised.json para registry.json');
  } catch (e) {
    console.warn('[registry] Falha ao migrar raised.json', e);
  }
}

export function readRegistry() {
  ensureDir();
  migrateLegacyRaised();
  if (!existsSync(REGISTRY_FILE)) {
    const initial = defaultRegistry();
    writeRegistry(initial);
    return initial;
  }
  try {
    const raw = readFileSync(REGISTRY_FILE, 'utf8');
    const data = JSON.parse(raw);
    return normalizeRegistry(data);
  } catch {
    return defaultRegistry();
  }
}

function normalizeRegistry(data) {
  const d = defaultRegistry();
  d.luaDeMelTotal = Number(data.luaDeMelTotal) || 0;
  d.processedPaymentIds = Array.isArray(data.processedPaymentIds)
    ? data.processedPaymentIds.map(String)
    : [];
  d.soldGifts = data.soldGifts && typeof data.soldGifts === 'object' ? data.soldGifts : {};
  d.pendingByPaymentId =
    data.pendingByPaymentId && typeof data.pendingByPaymentId === 'object'
      ? data.pendingByPaymentId
      : {};
  d.giftReservations =
    data.giftReservations && typeof data.giftReservations === 'object'
      ? data.giftReservations
      : {};
  d.luaDeMelNotes = Array.isArray(data.luaDeMelNotes) ? data.luaDeMelNotes : [];
  return d;
}

export function writeRegistry(state) {
  ensureDir();
  writeFileSync(REGISTRY_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function pruneStaleReservations(registry) {
  const now = Date.now();
  const gr = registry.giftReservations || {};
  for (const giftId of Object.keys(gr)) {
    const r = gr[giftId];
    const t = r?.reservedAt ? new Date(r.reservedAt).getTime() : 0;
    if (!t || now - t > RESERVATION_MS) {
      delete gr[giftId];
    }
  }
}

/**
 * Antes de criar PIX de um presente: presente disponível e sem reserva ativa de outro pagamento.
 */
export function assertGiftCanBePurchased(giftId) {
  const registry = readRegistry();
  pruneStaleReservations(registry);
  writeRegistry(registry);

  const gid = String(giftId);
  if (gid === LUA_DE_MEL_REF) {
    return { ok: true, registry };
  }
  if (registry.soldGifts[gid]) {
    return { ok: false, error: 'Este presente já foi escolhido por outro convidado.' };
  }
  const res = registry.giftReservations[gid];
  if (res && res.paymentId) {
    const t = res.reservedAt ? new Date(res.reservedAt).getTime() : 0;
    if (t && Date.now() - t <= RESERVATION_MS) {
      return {
        ok: false,
        error:
          'Este presente está reservado enquanto outro pagamento está em andamento. Tente outro item ou aguarde alguns minutos.',
      };
    }
  }
  return { ok: true, registry };
}

/**
 * Após criar pagamento MP para presente: reserva + pending.
 */
export function recordGiftPaymentPending({
  paymentId,
  giftId,
  buyerName,
  buyerEmail,
  amount,
  guestMessage,
  paymentMethod,
}) {
  const registry = readRegistry();
  const pid = String(paymentId);
  const gid = String(giftId);
  registry.giftReservations[gid] = {
    paymentId: pid,
    reservedAt: new Date().toISOString(),
  };
  const msg = sanitizeGuestMessage(guestMessage);
  const pm =
    typeof paymentMethod === 'string' && paymentMethod.trim()
      ? paymentMethod.trim().slice(0, 80)
      : undefined;
  registry.pendingByPaymentId[pid] = {
    type: 'gift',
    giftId: gid,
    buyerName: String(buyerName).trim(),
    buyerEmail: String(buyerEmail).trim(),
    amount: Number(amount),
    createdAt: new Date().toISOString(),
    ...(msg ? { guestMessage: msg } : {}),
    ...(pm ? { paymentMethod: pm } : {}),
  };
  writeRegistry(registry);
}

export function recordLuaDeMelPending({
  paymentId,
  buyerEmail,
  amount,
  guestMessage,
  paymentMethod,
}) {
  const registry = readRegistry();
  const pid = String(paymentId);
  const msg = sanitizeGuestMessage(guestMessage);
  const pm =
    typeof paymentMethod === 'string' && paymentMethod.trim()
      ? paymentMethod.trim().slice(0, 80)
      : undefined;
  registry.pendingByPaymentId[pid] = {
    type: 'lua-de-mel',
    buyerEmail: String(buyerEmail).trim(),
    amount: Number(amount),
    createdAt: new Date().toISOString(),
    ...(msg ? { guestMessage: msg } : {}),
    ...(pm ? { paymentMethod: pm } : {}),
  };
  writeRegistry(registry);
}

/**
 * Processa pagamento aprovado no MP: lua de mel OU presente (uma vez).
 */
export async function registerApprovedPaymentIfNeeded(paymentApi, paymentId) {
  const sid = String(paymentId);
  if (!/^\d+$/.test(sid)) {
    return {
      luaDeMelTotal: readRegistry().luaDeMelTotal,
      changed: false,
      error: 'id inválido',
    };
  }

  let registry = readRegistry();
  if (registry.processedPaymentIds.includes(sid)) {
    return {
      luaDeMelTotal: registry.luaDeMelTotal,
      changed: false,
      already: true,
    };
  }

  const pay = await paymentApi.get({ id: sid });
  if (pay.status !== 'approved') {
    return { luaDeMelTotal: registry.luaDeMelTotal, changed: false, pending: true };
  }

  const amt = Number(pay.transaction_amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return { luaDeMelTotal: registry.luaDeMelTotal, changed: false };
  }

  const extRef = pay.external_reference != null ? String(pay.external_reference).trim() : '';

  if (!extRef) {
    registry.processedPaymentIds.push(sid);
    writeRegistry(registry);
    return { luaDeMelTotal: registry.luaDeMelTotal, changed: false };
  }

  if (extRef === LUA_DE_MEL_REF) {
    const pend = registry.pendingByPaymentId[sid];
    const gmsg = pend?.guestMessage ? sanitizeGuestMessage(pend.guestMessage) : '';
    const methodLabel =
      paymentMethodLabelFromMp(pay) ||
      (pend?.paymentMethod ? String(pend.paymentMethod).slice(0, 80) : undefined);
    if (!Array.isArray(registry.luaDeMelNotes)) registry.luaDeMelNotes = [];
    registry.luaDeMelNotes.push({
      paymentId: sid,
      buyerEmail: pend?.buyerEmail ? String(pend.buyerEmail).slice(0, 120) : '',
      amount: amt,
      paidAt: new Date().toISOString(),
      ...(gmsg ? { guestMessage: gmsg } : {}),
      ...(methodLabel ? { paymentMethod: methodLabel } : {}),
    });
    registry.luaDeMelTotal = Math.round((registry.luaDeMelTotal + amt) * 100) / 100;
    registry.processedPaymentIds.push(sid);
    delete registry.pendingByPaymentId[sid];
    writeRegistry(registry);
    return { luaDeMelTotal: registry.luaDeMelTotal, changed: true, kind: 'lua-de-mel' };
  }

  const giftId = extRef;
  const pending = registry.pendingByPaymentId[sid];
  const buyerName =
    pending?.type === 'gift' ? pending.buyerName : (pay.payer?.first_name || '—');
  const buyerEmail =
    pending?.type === 'gift'
      ? pending.buyerEmail
      : pay.payer?.email || '';

  if (registry.soldGifts[giftId]) {
    registry.processedPaymentIds.push(sid);
    delete registry.pendingByPaymentId[sid];
    delete registry.giftReservations[giftId];
    writeRegistry(registry);
    return {
      luaDeMelTotal: registry.luaDeMelTotal,
      changed: false,
      alreadySold: true,
    };
  }

  const gmsg =
    pending?.type === 'gift' && pending?.guestMessage
      ? sanitizeGuestMessage(pending.guestMessage)
      : '';
  const methodLabel =
    paymentMethodLabelFromMp(pay) ||
    (pending?.paymentMethod ? String(pending.paymentMethod).slice(0, 80) : undefined);
  registry.soldGifts[giftId] = {
    buyerName: String(buyerName || '—').slice(0, 120),
    buyerEmail: String(buyerEmail || '').slice(0, 120),
    paymentId: sid,
    amount: amt,
    paidAt: new Date().toISOString(),
    ...(gmsg ? { guestMessage: gmsg } : {}),
    ...(methodLabel ? { paymentMethod: methodLabel } : {}),
  };
  registry.processedPaymentIds.push(sid);
  delete registry.pendingByPaymentId[sid];
  delete registry.giftReservations[giftId];
  writeRegistry(registry);

  return {
    luaDeMelTotal: registry.luaDeMelTotal,
    changed: true,
    kind: 'gift',
    giftId,
  };
}

function sumPendingLuaDeMel(registry) {
  const p = registry.pendingByPaymentId || {};
  let s = 0;
  for (const row of Object.values(p)) {
    if (row?.type === 'lua-de-mel' && Number.isFinite(Number(row.amount))) {
      s += Number(row.amount);
    }
  }
  return Math.round(s * 100) / 100;
}

export function getPublicRegistrySnapshot() {
  const r = readRegistry();
  pruneStaleReservations(r);
  writeRegistry(r);
  return {
    luaDeMelTotal: r.luaDeMelTotal,
    /** Soma de contribuições lua de mel ainda não aprovadas (PIX/cartão em análise) — para exibir na barra */
    luaDeMelPendingTotal: sumPendingLuaDeMel(r),
    soldGiftIds: Object.keys(r.soldGifts || {}),
  };
}
