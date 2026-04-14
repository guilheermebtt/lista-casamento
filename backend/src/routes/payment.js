/**
 * Rotas: PIX, registro (lua de mel vs presentes), webhook
 */
import { randomUUID } from 'crypto';
import { Router } from 'express';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import {
  LUA_DE_MEL_REF,
  assertGiftCanBePurchased,
  getPublicRegistrySnapshot,
  paymentMethodLabelFromCardMethodId,
  readRegistry,
  recordGiftPaymentPending,
  recordLuaDeMelPending,
  registerApprovedPaymentIfNeeded,
} from '../lib/registryStore.js';

export const paymentRouter = Router();

const MAX_INSTALLMENTS = 12;
const MP_PAYMENTS_URL = 'https://api.mercadopago.com/v1/payments';

/** CPF do exemplo oficial da documentação MP (curl PIX). */
const MP_EXAMPLE_TEST_CPF = '19119119100';

/** Endereço de exemplo da documentação MP para payer.address (PIX BR). */
const MP_EXAMPLE_PAYER_ADDRESS = {
  zip_code: '06233200',
  street_name: 'Av. das Nações Unidas',
  street_number: '3003',
  neighborhood: 'Bonfim',
  city: 'Osasco',
  federal_unit: 'SP',
};

/**
 * Access Token do .env (só servidor). Trim evita falha silenciosa; MP retorna erro 5 sem Bearer válido.
 */
function getMercadoPagoAccessToken() {
  const raw = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const token = typeof raw === 'string' ? raw.trim() : '';
  if (!token) {
    throw new Error(
      'MERCADOPAGO_ACCESS_TOKEN não configurado no backend. Crie/edite backend/.env e reinicie a API (npm run dev).'
    );
  }
  return token;
}

function getClient() {
  return new MercadoPagoConfig({ accessToken: getMercadoPagoAccessToken() });
}

/**
 * Webhook do MP exige HTTPS; http:// normalizado para https://.
 * PIX: em várias contas a API devolve "http is unavailable for request create_ti" ao registrar webhook
 * mesmo com URL correta — por isso o PIX não envia notification_url por padrão (confirmação via polling no site).
 * Para reativar webhook no PIX: MERCADOPAGO_PIX_WEBHOOK=true e PUBLIC_URL=https://...
 */
function mercadopagoNotificationUrl() {
  const raw = process.env.PUBLIC_URL;
  if (!raw || typeof raw !== 'string') return undefined;
  let base = raw.trim().replace(/\/+$/, '');
  if (base.startsWith('http://')) {
    base = `https://${base.slice('http://'.length)}`;
  }
  if (!base.startsWith('https://')) return undefined;
  return `${base}/api/webhooks/mercadopago`;
}

function pixNotificationUrl() {
  if (process.env.MERCADOPAGO_PIX_WEBHOOK !== 'true') return undefined;
  return mercadopagoNotificationUrl();
}

/**
 * Cria pagamento com Authorization explícito (evita edge cases do SDK com headers).
 */
async function createPaymentRest(body) {
  const accessToken = getMercadoPagoAccessToken();
  const res = await fetch(MP_PAYMENTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'X-Idempotency-Key': randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data.message ||
      data.error ||
      (Array.isArray(data.cause) && data.cause.map((c) => c.description || c.code).join('; ')) ||
      `HTTP ${res.status}`;
    const err = new Error(msg);
    err.statusCode = res.status;
    err.api = data;
    throw err;
  }
  return data;
}

/**
 * Cria pagamento via SDK oficial (envia headers PRODUCT_ID, TRACKING_ID, User-Agent, etc.).
 * O fetch manual em createPaymentRest não replica isso; em PIX isso pode causar internal_error na API.
 */
async function createPaymentWithSdk(body) {
  const client = getClient();
  const paymentApi = new Payment(client);
  const idempotencyKey = randomUUID();
  try {
    const data = await paymentApi.create({
      body,
      requestOptions: { idempotencyKey },
    });
    if (data && typeof data === 'object' && 'api_response' in data) {
      const { api_response: _ar, ...rest } = data;
      return rest;
    }
    return data;
  } catch (e) {
    const msg =
      e?.message ||
      e?.error ||
      (Array.isArray(e?.cause) &&
        e.cause.map((c) => c?.description || c?.code).filter(Boolean).join('; ')) ||
      'Falha ao criar pagamento';
    const err = new Error(msg);
    err.statusCode = e?.status;
    err.api = e;
    throw err;
  }
}

/**
 * PIX no BR: a API costuma devolver internal_error sem payer.identification (cartão já manda via Brick).
 * Nome/e-mail continuam sendo os do convidado; o documento segue o padrão de testes MP ou MERCADOPAGO_PIX_PAYER_CPF.
 */
function buildPayerForPix(email, buyerFullName) {
  const em = typeof email === 'string' ? email.trim() : '';
  const name = typeof buyerFullName === 'string' ? buyerFullName.trim() : '';
  let first;
  let last;
  if (name.length >= 2) {
    const parts = name.split(/\s+/);
    first = parts[0].slice(0, 255);
    last =
      parts.length > 1
        ? parts.slice(1).join(' ').slice(0, 255)
        : first.slice(0, 255);
  } else {
    first = 'Convidado';
    last = 'Lista de casamento';
  }
  const envDigits = String(process.env.MERCADOPAGO_PIX_PAYER_CPF ?? '').replace(/\D/g, '');
  let identification;
  if (envDigits.length === 11) {
    identification = { type: 'CPF', number: envDigits };
  } else if (envDigits.length === 14) {
    identification = { type: 'CNPJ', number: envDigits };
  } else {
    identification = { type: 'CPF', number: MP_EXAMPLE_TEST_CPF };
  }
  return {
    email: em,
    first_name: first,
    last_name: last,
    identification,
    address: { ...MP_EXAMPLE_PAYER_ADDRESS },
  };
}

/**
 * GET /api/registry — presentes já escolhidos + total lua de mel (público)
 */
paymentRouter.get('/registry', (_req, res) => {
  try {
    return res.json(getPublicRegistrySnapshot());
  } catch (e) {
    console.error('registry get error', e);
    return res.status(500).json({ error: 'Falha ao ler registro' });
  }
});

/**
 * POST /api/payments/pix
 * Body: { amount, description, payerEmail, externalReference?, buyerName?, guestMessage? }
 * Presentes: buyerName obrigatório; lua de mel: não usar buyerName na meta
 */
paymentRouter.post('/payments/pix', async (req, res) => {
  try {
    const { amount, description, payerEmail, externalReference, buyerName, guestMessage } =
      req.body || {};
    const value = Number(amount);

    if (!Number.isFinite(value) || value < 1) {
      return res.status(400).json({ error: 'Valor inválido (mínimo R$ 1,00)' });
    }
    const email =
      typeof payerEmail === 'string' && payerEmail.includes('@')
        ? payerEmail.trim()
        : null;
    if (!email) {
      return res.status(400).json({ error: 'E-mail do pagador é obrigatório' });
    }

    const ext =
      externalReference != null ? String(externalReference).slice(0, 256) : '';
    const isLuaDeMel = ext === LUA_DE_MEL_REF;

    let buyerTrim = '';
    if (!isLuaDeMel) {
      buyerTrim = typeof buyerName === 'string' ? buyerName.trim() : '';
      if (buyerTrim.length < 2) {
        return res.status(400).json({
          error: 'Informe seu nome completo (mínimo 2 caracteres) para identificarmos o presente.',
        });
      }
      const check = assertGiftCanBePurchased(ext);
      if (!check.ok) {
        return res.status(409).json({ error: check.error });
      }
    }

    const desc = String(description || 'Lista de casamento').slice(0, 255);
    const body = {
      transaction_amount: Math.round(value * 100) / 100,
      description: desc,
      payment_method_id: 'pix',
      payer: buildPayerForPix(email, isLuaDeMel ? '' : buyerTrim),
      external_reference: ext || undefined,
      notification_url: pixNotificationUrl(),
    };

    const created = await createPaymentWithSdk(body);
    const tid = created.point_of_interaction?.transaction_data;
    const pid = String(created.id);

    if (isLuaDeMel) {
      recordLuaDeMelPending({
        paymentId: pid,
        buyerEmail: email,
        amount: value,
        guestMessage,
        paymentMethod: 'PIX',
      });
    } else {
      recordGiftPaymentPending({
        paymentId: pid,
        giftId: ext,
        buyerName: buyerTrim,
        buyerEmail: email,
        amount: value,
        guestMessage,
        paymentMethod: 'PIX',
      });
    }

    return res.json({
      id: created.id,
      status: created.status,
      status_detail: created.status_detail,
      qr_code: tid?.qr_code ?? null,
      qr_code_base64: tid?.qr_code_base64 ?? null,
      ticket_url: tid?.ticket_url ?? null,
    });
  } catch (e) {
    console.error('create pix error', e?.api || e);
    const msg = e?.cause?.message || e?.message || 'Falha ao criar pagamento';
    return res.status(502).json({ error: msg });
  }
});

/**
 * POST /api/payments/card
 * Checkout transparente: token gerado no frontend (Card Brick) + parcelas.
 * Body: token, paymentMethodId, issuerId?, installments, transactionAmount, payer,
 *       description, payerEmail, buyerName?, externalReference
 */
paymentRouter.post('/payments/card', async (req, res) => {
  try {
    const {
      token,
      paymentMethodId,
      issuerId,
      installments,
      transactionAmount,
      payer,
      description,
      payerEmail,
      buyerName,
      externalReference,
      guestMessage,
    } = req.body || {};

    const inst = Number(installments);
    if (!Number.isFinite(inst) || inst < 1 || inst > MAX_INSTALLMENTS) {
      return res.status(400).json({ error: 'Parcelamento inválido' });
    }
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token do cartão ausente' });
    }
    if (!paymentMethodId || typeof paymentMethodId !== 'string') {
      return res.status(400).json({ error: 'Bandeira do cartão ausente' });
    }

    const tx = Number(transactionAmount);
    if (!Number.isFinite(tx) || tx < 1) {
      return res.status(400).json({ error: 'Valor inválido' });
    }
    const value = Math.round(tx * 100) / 100;

    const email =
      typeof payerEmail === 'string' && payerEmail.includes('@')
        ? payerEmail.trim()
        : payer?.email?.includes('@')
          ? String(payer.email).trim()
          : null;
    if (!email) {
      return res.status(400).json({ error: 'E-mail do pagador é obrigatório' });
    }

    const ext =
      externalReference != null ? String(externalReference).slice(0, 256) : '';
    const isLuaDeMel = ext === LUA_DE_MEL_REF;

    let buyerTrim = '';
    if (!isLuaDeMel) {
      buyerTrim = typeof buyerName === 'string' ? buyerName.trim() : '';
      if (buyerTrim.length < 2) {
        return res.status(400).json({
          error: 'Informe seu nome completo (mínimo 2 caracteres) para identificarmos o presente.',
        });
      }
      const check = assertGiftCanBePurchased(ext);
      if (!check.ok) {
        return res.status(409).json({ error: check.error });
      }
    }

    if (!payer || typeof payer !== 'object') {
      return res.status(400).json({ error: 'Dados do pagador incompletos' });
    }

    const idNumber = payer.identification?.number
      ? String(payer.identification.number).replace(/\D/g, '')
      : '';
    if (!idNumber || (idNumber.length !== 11 && idNumber.length !== 14)) {
      return res.status(400).json({
        error: 'CPF (11 dígitos) ou CNPJ (14 dígitos) do titular é obrigatório para cartão.',
      });
    }

    const payerObj = {
      email,
      first_name: payer.first_name || undefined,
      last_name: payer.last_name || undefined,
      identification: {
        type: String(payer.identification?.type || 'CPF'),
        number: idNumber,
      },
    };

    const desc = String(description || 'Lista de casamento').slice(0, 255);

    const body = {
      transaction_amount: value,
      token: token.trim(),
      description: desc,
      installments: inst,
      payment_method_id: paymentMethodId,
      payer: payerObj,
      external_reference: ext || undefined,
      notification_url: mercadopagoNotificationUrl(),
      statement_descriptor: 'LISTA CASAMENTO'.slice(0, 22),
    };
    if (issuerId != null && String(issuerId).trim() !== '') {
      const iss = Number(issuerId);
      body.issuer_id = Number.isFinite(iss) ? iss : issuerId;
    }

    const created = await createPaymentRest(body);
    const pid = String(created.id);
    const cardMethodLabel = paymentMethodLabelFromCardMethodId(paymentMethodId);

    if (isLuaDeMel) {
      recordLuaDeMelPending({
        paymentId: pid,
        buyerEmail: email,
        amount: value,
        guestMessage,
        paymentMethod: cardMethodLabel,
      });
    } else {
      recordGiftPaymentPending({
        paymentId: pid,
        giftId: ext,
        buyerName: buyerTrim,
        buyerEmail: email,
        amount: value,
        guestMessage,
        paymentMethod: cardMethodLabel,
      });
    }

    return res.json({
      id: created.id,
      status: created.status,
      status_detail: created.status_detail,
    });
  } catch (e) {
    console.error('create card error', e);
    let msg = e?.cause?.message || e?.message || 'Falha ao processar cartão';
    if (
      typeof msg === 'string' &&
      (msg.includes('access_token') || msg.includes('Must provide your access_token'))
    ) {
      msg =
        'Access Token do Mercado Pago ausente ou inválido no servidor. No arquivo backend/.env use MERCADOPAGO_ACCESS_TOKEN com o token de Credenciais (o mesmo do PIX), salve e reinicie o backend.';
    }
    return res.status(502).json({ error: msg });
  }
});

/**
 * GET /api/contributions — só total da lua de mel
 */
paymentRouter.get('/contributions', (_req, res) => {
  try {
    const { luaDeMelTotal } = readRegistry();
    return res.json({ luaDeMelTotal, totalRaised: luaDeMelTotal });
  } catch (e) {
    console.error('contributions get error', e);
    return res.status(500).json({ error: 'Falha ao ler total' });
  }
});

/**
 * POST /api/contributions/apply
 */
paymentRouter.post('/contributions/apply', async (req, res) => {
  try {
    const paymentId = req.body?.paymentId;
    if (paymentId == null || String(paymentId).trim() === '') {
      return res.status(400).json({ error: 'paymentId obrigatório' });
    }
    const client = getClient();
    const paymentApi = new Payment(client);
    const result = await registerApprovedPaymentIfNeeded(paymentApi, paymentId);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json({
      luaDeMelTotal: result.luaDeMelTotal,
      totalRaised: result.luaDeMelTotal,
      changed: result.changed,
      already: result.already,
      pending: result.pending,
      kind: result.kind,
    });
  } catch (e) {
    console.error('contributions apply error', e);
    return res.status(502).json({ error: e?.message || 'Falha ao registrar' });
  }
});

paymentRouter.get('/payments/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const client = getClient();
    const paymentApi = new Payment(client);
    const data = await paymentApi.get({ id });
    return res.json({
      id: data.id,
      status: data.status,
      status_detail: data.status_detail,
      transaction_amount: data.transaction_amount,
    });
  } catch (e) {
    console.error('get payment error', e);
    return res.status(502).json({ error: e?.message || 'Falha ao consultar pagamento' });
  }
});

paymentRouter.post('/webhooks/mercadopago', async (req, res) => {
  res.status(200).send('OK');

  try {
    let paymentId =
      req.query['data.id'] || req.query.id || req.body?.data?.id;

    if (!paymentId && req.body?.type === 'payment' && req.body?.data?.id) {
      paymentId = req.body.data.id;
    }

    const id = paymentId != null ? String(paymentId) : null;
    if (id && /^\d+$/.test(id)) {
      const client = getClient();
      const paymentApi = new Payment(client);
      const reg = await registerApprovedPaymentIfNeeded(paymentApi, id);
      console.log('[webhook] payment registered:', reg);
    }
  } catch (e) {
    console.error('webhook process error', e);
  }
});
