import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { CardPayment } from '@mercadopago/sdk-react';
import {
  applyContribution,
  createCardPayment,
  createPixPayment,
  getPaymentStatus,
} from '../api';
import { formatBRL, parseContributionAmount } from '../format';

const POLL_MS = 3500;
const MAX_POLLS = 120;
/** Se o Brick não chamar onReady (ex.: API MP 404), evita loading infinito */
const CARD_BRICK_LOAD_TIMEOUT_MS = 25000;

const MP_PUBLIC_KEY = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY?.trim();
const MP_PUBLIC_KEY_MODE = MP_PUBLIC_KEY?.startsWith('TEST-')
  ? 'TEST'
  : MP_PUBLIC_KEY?.startsWith('APP_USR-')
    ? 'PROD'
    : '';

function messageForCardStatusDetail(detail) {
  if (!detail || typeof detail !== 'string') return 'Pagamento não aprovado.';
  if (detail.startsWith('cc_rejected_')) {
    return `Pagamento recusado (${detail}). Confira os dados do cartão/titular ou tente outro cartão.`;
  }
  return detail;
}

const cardCustomization = {
  paymentMethods: {
    minInstallments: 1,
    maxInstallments: 12,
  },
};

function pickFirstString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return '';
}

export default function PaymentModal({ gift, onClose, onPaymentSuccess }) {
  const reactId = useId();
  const brickDomId = `cardBrick_${reactId.replace(/:/g, '')}_${gift?.id ?? 'g'}`;

  const [buyerName, setBuyerName] = useState('');
  const [email, setEmail] = useState('');
  const [guestMessage, setGuestMessage] = useState('');
  const [contributionAmount, setContributionAmount] = useState('50');
  const [phase, setPhase] = useState('form');
  const [error, setError] = useState('');
  const [payment, setPayment] = useState(null);
  const [copied, setCopied] = useState(false);
  /** Evita referência nova a cada render — o Brick do MP reinicia o efeito se onReady/onError mudarem */
  const [cardBrickLoaded, setCardBrickLoaded] = useState(false);
  const pollCount = useRef(0);

  const cardPayCtxRef = useRef({});

  const isFlexible = Boolean(gift?.isFlexibleAmount);
  const showCard = Boolean(MP_PUBLIC_KEY);

  const resolvedAmount = useMemo(() => {
    if (isFlexible) {
      const v = parseContributionAmount(contributionAmount);
      return Number.isFinite(v) ? v : NaN;
    }
    return Number(gift?.amount);
  }, [isFlexible, contributionAmount, gift?.amount]);

  useEffect(() => {
    setBuyerName('');
    setEmail('');
    setGuestMessage('');
    setContributionAmount('50');
    setPhase('form');
    setError('');
    setPayment(null);
    setCopied(false);
    setCardBrickLoaded(false);
  }, [gift?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const finalizeApproved = useCallback(
    async (paymentId) => {
      try {
        await applyContribution(paymentId);
      } catch {
        /* webhook pode registrar */
      }
      onPaymentSuccess?.();
      setPhase('success');
    },
    [onPaymentSuccess]
  );

  const pollPayment = useCallback(
    async (paymentId) => {
      try {
        const data = await getPaymentStatus(paymentId);
        if (data.status === 'approved') {
          await finalizeApproved(paymentId);
          return true;
        }
        if (
          ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(data.status)
        ) {
          setError('Pagamento não concluído. Você pode tentar novamente.');
          setPhase('error');
          return true;
        }
      } catch {
        /* mantém polling */
      }
      return false;
    },
    [finalizeApproved]
  );

  const polling = phase === 'pix' || phase === 'cardWait';

  useEffect(() => {
    if (!polling || !payment?.id) return undefined;

    pollCount.current = 0;
    const t = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > MAX_POLLS) {
        clearInterval(t);
        return;
      }
      const done = await pollPayment(payment.id);
      if (done) clearInterval(t);
    }, POLL_MS);

    return () => clearInterval(t);
  }, [polling, payment?.id, pollPayment]);

  useEffect(() => {
    if (phase !== 'card' || !showCard) return undefined;
    const t = window.setTimeout(() => {
      setCardBrickLoaded((loaded) => {
        if (loaded) return loaded;
        setError(
          'O formulário do cartão não carregou. No painel do Mercado Pago, copie a Chave pública (não o Access Token do servidor). Use teste com teste e produção com produção. Depois reinicie o npm run dev.'
        );
        return true;
      });
    }, CARD_BRICK_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase, showCard, gift?.id]);

  const onCardBrickReady = useCallback(() => {
    setCardBrickLoaded(true);
  }, []);

  const onCardBrickError = useCallback((err) => {
    console.warn('[Mercado Pago Brick]', err);
    setCardBrickLoaded(true);
    setError(
      'Não foi possível carregar o formulário do cartão. Confira se VITE_MERCADOPAGO_PUBLIC_KEY é a Chave pública do painel (não o Access Token). Erros 404 ou "site ID" no console costumam indicar chave errada ou revogada.'
    );
  }, []);

  function validateBase() {
    if (!email.trim().includes('@')) {
      setError('Informe um e-mail válido (obrigatório para o Mercado Pago — pode ser de um familiar).');
      return false;
    }
    if (!isFlexible) {
      const n = buyerName.trim();
      if (n.length < 2) {
        setError('Informe seu nome completo para registrarmos seu presente.');
        return false;
      }
    }
    if (isFlexible) {
      if (!Number.isFinite(resolvedAmount) || resolvedAmount < 1) {
        setError('Informe um valor válido de pelo menos R$ 1,00.');
        return false;
      }
    }
    return true;
  }

  async function handlePayPix() {
    setError('');
    if (!validateBase()) return;

    const value = isFlexible ? resolvedAmount : Number(gift.amount);

    setPhase('loading');
    try {
      const payload = {
        amount: value,
        description: isFlexible
          ? 'Contribuição — Lua de mel (lista de casamento)'
          : `Lista de casamento — ${gift.name}`,
        payerEmail: email.trim(),
        externalReference: gift.id,
        guestMessage: guestMessage.trim() || undefined,
      };
      if (!isFlexible) {
        payload.buyerName = buyerName.trim();
      }

      const data = await createPixPayment(payload);
      setPayment(data);
      if (data.status === 'approved') {
        await finalizeApproved(data.id);
        return;
      }
      setPhase('pix');
    } catch (e) {
      setError(e.message || 'Erro ao gerar PIX');
      setPhase('error');
    }
  }

  function goToCard() {
    setError('');
    if (!validateBase()) return;
    if (!showCard) return;
    setCardBrickLoaded(false);
    setPhase('card');
  }

  const cardInitialization = useMemo(() => {
    const amt = Number(Number(resolvedAmount).toFixed(2));
    const payer = { email: email.trim() };
    if (!isFlexible && buyerName.trim()) {
      const parts = buyerName.trim().split(/\s+/);
      payer.first_name = parts[0];
      if (parts.length > 1) payer.last_name = parts.slice(1).join(' ');
    }
    return { amount: amt, payer };
  }, [resolvedAmount, email, isFlexible, buyerName]);

  cardPayCtxRef.current = {
    gift,
    email,
    buyerName,
    guestMessage,
    isFlexible,
    resolvedAmount,
    finalizeApproved,
  };

  const onCardBrickSubmit = useCallback(async (submitData) => {
    const ctx = cardPayCtxRef.current;
    const g = ctx.gift;
    setError('');
    setPhase('loading');
    try {
      const raw =
        submitData && typeof submitData === 'object' && submitData.formData
          ? submitData.formData
          : submitData || {};

      const token = pickFirstString(
        raw?.token,
        raw?.cardToken,
        raw?.card_token,
        raw?.data?.token,
        raw?.cardFormData?.token
      );
      if (!token) {
        throw new Error(
          'Nao foi possivel gerar o token do cartao. Recarregue a pagina e tente novamente.'
        );
      }

      const paymentMethodId = pickFirstString(
        raw?.payment_method_id,
        raw?.paymentMethodId,
        raw?.paymentMethod?.id
      );
      const issuerId = raw?.issuer_id ?? raw?.issuerId ?? raw?.issuer?.id;
      const installments = raw?.installments ?? raw?.payment_method_option_id;
      const transactionAmount = raw?.transaction_amount ?? raw?.transactionAmount;
      const payer = raw?.payer || raw?.payerData || {};

      const value = ctx.isFlexible ? ctx.resolvedAmount : Number(g.amount);
      const payload = {
        token,
        paymentMethodId,
        issuerId,
        installments,
        transactionAmount,
        payer,
        publicKeyMode: MP_PUBLIC_KEY_MODE || undefined,
        description: ctx.isFlexible
          ? 'Contribuição — Lua de mel (lista de casamento)'
          : `Lista de casamento — ${g.name}`,
        payerEmail: ctx.email.trim(),
        externalReference: g.id,
        guestMessage: ctx.guestMessage?.trim() || undefined,
      };
      if (!ctx.isFlexible) {
        payload.buyerName = ctx.buyerName.trim();
      }

      const data = await createCardPayment(payload);
      setPayment({ id: data.id, status: data.status });
      if (data.status === 'approved') {
        await ctx.finalizeApproved(data.id);
        return;
      }
      if (['pending', 'in_process', 'authorized'].includes(data.status)) {
        setPhase('cardWait');
        return;
      }
      throw new Error(messageForCardStatusDetail(data.status_detail));
    } catch (e) {
      setError(e.message || 'Erro no cartão');
      setPhase('card');
    }
  }, []);

  function copyCode() {
    const code = payment?.qr_code;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const qrSrc =
    payment?.qr_code_base64 &&
    `data:image/png;base64,${payment.qr_code_base64.replace(/^data:image\/\w+;base64,/, '')}`;

  const displayAmount = isFlexible
    ? parseContributionAmount(contributionAmount)
    : gift.amount;
  const amountLabel =
    isFlexible && Number.isFinite(displayAmount) ? formatBRL(displayAmount) : formatBRL(gift.amount);

  const wideModal = phase === 'card';

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`modal ${wideModal ? 'modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" aria-label="Fechar" onClick={onClose}>
          ×
        </button>

        {phase === 'form' && (
          <>
            {gift.image && (
              <div className="modal-gift-thumb">
                <img src={gift.image} alt="" width={400} height={260} />
              </div>
            )}
            <h2 id="modal-title">{isFlexible ? 'Contribuir' : 'Reservar presente'}</h2>
            <p className="modal-gift-name">{gift.name}</p>
            {!isFlexible && <p className="modal-amount">{formatBRL(gift.amount)}</p>}
            {isFlexible && (
              <>
                <label className="modal-label" htmlFor="contribution-amount">
                  Valor (R$)
                </label>
                <input
                  id="contribution-amount"
                  type="text"
                  inputMode="decimal"
                  className="modal-input"
                  placeholder="Ex.: 100 ou 50,00"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  autoComplete="off"
                />
                {Number.isFinite(displayAmount) && displayAmount >= 1 && (
                  <p className="modal-amount-preview">{amountLabel}</p>
                )}
              </>
            )}
            {!isFlexible && (
              <>
                <label className="modal-label" htmlFor="buyer-name">
                  Seu nome completo
                </label>
                <input
                  id="buyer-name"
                  type="text"
                  className="modal-input"
                  placeholder="Como aparecerá no nosso registro"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  autoComplete="name"
                />
              </>
            )}
            <label className="modal-label" htmlFor="payer-email">
              E-mail para o pagamento
            </label>
            <input
              id="payer-email"
              type="email"
              className="modal-input"
              placeholder="ex.: voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <p className="modal-hint--email">
              O Mercado Pago exige um e-mail válido para gerar o PIX ou o cartão. Se não tiver, pode usar o de um
              familiar — serve para o comprovante e avisos do pagamento.
            </p>
            <label className="modal-label" htmlFor="guest-message">
              Recado para os noivos <span className="modal-optional">(opcional)</span>
            </label>
            <textarea
              id="guest-message"
              className="modal-textarea"
              rows={3}
              maxLength={500}
              placeholder="Um carinho, um votinho de felicidade…"
              value={guestMessage}
              onChange={(e) => setGuestMessage(e.target.value)}
            />
            <p className="modal-char-hint">{guestMessage.length}/500</p>
            {error && <p className="modal-error">{error}</p>}
            <div className="pay-methods">
              <button type="button" className="btn btn-primary pay-methods-btn" onClick={handlePayPix}>
                Pagar com PIX
              </button>
              {showCard && (
                <button type="button" className="btn btn-secondary pay-methods-btn" onClick={goToCard}>
                  Cartão (parcelado)
                </button>
              )}
            </div>
            {!showCard && (
              <p className="modal-hint">
                Para habilitar cartão, configure <code>VITE_MERCADOPAGO_PUBLIC_KEY</code> no ambiente
                do frontend (chave pública de teste ou produção).
              </p>
            )}
          </>
        )}

        {phase === 'card' && showCard && (
          <div className="card-brick-wrap">
            <button type="button" className="link-back modal-back-inline" onClick={() => setPhase('form')}>
              ← Voltar
            </button>
            <h2 id="modal-title">Cartão de crédito</h2>
            <p className="modal-gift-name">{gift.name}</p>
            <p className="modal-amount">{formatBRL(resolvedAmount)}</p>
            <p className="modal-hint">
              Preencha os dados do cartão e do titular. Parcelamento disponível conforme regras do
              Mercado Pago.
            </p>
            {error && <p className="modal-error">{error}</p>}
            <div className="card-brick-mount">
              {!cardBrickLoaded && (
                <p className="card-brick-loading">Carregando formulário do cartão…</p>
              )}
              {Number.isFinite(cardInitialization.amount) && cardInitialization.amount >= 1 && (
                <CardPayment
                  key={`${brickDomId}_${cardInitialization.amount}`}
                  id={brickDomId}
                  locale="pt-BR"
                  initialization={cardInitialization}
                  customization={cardCustomization}
                  onSubmit={onCardBrickSubmit}
                  onReady={onCardBrickReady}
                  onError={onCardBrickError}
                />
              )}
            </div>
          </div>
        )}

        {phase === 'loading' && (
          <div className="modal-center">
            <div className="spinner" aria-hidden />
            <p>Processando…</p>
          </div>
        )}

        {phase === 'pix' && payment && (
          <>
            {gift.image && (
              <div className="modal-gift-thumb modal-gift-thumb--small">
                <img src={gift.image} alt="" width={320} height={200} />
              </div>
            )}
            <h2 id="modal-title">Pague com PIX</h2>
            <p className="modal-status">
              Status: <strong>{payment.status}</strong>
              {payment.status === 'pending' && (
                <span className="status-hint"> — aguardando pagamento</span>
              )}
            </p>
            {qrSrc && (
              <div className="qr-wrap">
                <img src={qrSrc} alt="QR Code PIX" className="qr-img" width={220} height={220} />
              </div>
            )}
            {payment.qr_code && (
              <div className="copy-box">
                <p className="copy-label">Pix copia e cola</p>
                <div className="copy-row">
                  <code className="pix-code">{payment.qr_code}</code>
                  <button type="button" className="btn btn-ghost" onClick={copyCode}>
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}
            <p className="modal-footnote">
              Abra o app do seu banco, escaneie o QR ou cole o código. Confirmaremos aqui quando o
              pagamento for aprovado.
            </p>
          </>
        )}

        {phase === 'cardWait' && payment && (
          <div className="modal-center">
            <div className="spinner" aria-hidden />
            <h2 id="modal-title">Confirmando cartão</h2>
            <p className="modal-footnote">
              Status: <strong>{payment.status}</strong>. Aguarde a confirmação do banco emissor.
            </p>
          </div>
        )}

        {phase === 'success' && (
          <div className="modal-center modal-success">
            <div className="success-icon" aria-hidden>
              ✓
            </div>
            <h2 id="modal-title">Muito obrigado!</h2>
            <p className="thanks-text">
              {isFlexible
                ? 'Sua contribuição para a lua de mel chegou com muito carinho. Obrigado por fazer parte da nossa história.'
                : 'Seu presente foi registrado com carinho. Obrigado por nos mimar nesta nova fase.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Fechar
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="modal-center">
            <p className="modal-error">{error || 'Algo deu errado.'}</p>
            <button type="button" className="btn btn-primary" onClick={() => setPhase('form')}>
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
