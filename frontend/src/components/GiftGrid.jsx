import { useMemo } from 'react';
import GiftCard from './GiftCard';
import Disclaimer from './Disclaimer';
import ProgressBar from './ProgressBar';
import WeddingCountdown from './WeddingCountdown.jsx';
import { HONEYMOON_GIFT } from '../honeymoonGift.js';

export default function GiftGrid({
  gifts,
  config,
  raisedDisplay,
  soldGiftIds,
  onPresentear,
  onBack,
}) {
  const showMeta = config.metaLuaDeMel > 0;
  const soldSet = useMemo(() => new Set(soldGiftIds || []), [soldGiftIds]);

  /** Itens já presenteados no final; ordem relativa dentro de cada grupo preservada. */
  const orderedGifts = useMemo(() => {
    const list = Array.isArray(gifts) ? gifts : [];
    return [...list].sort((a, b) => {
      const sa = soldSet.has(a.id);
      const sb = soldSet.has(b.id);
      if (sa === sb) return 0;
      return sa ? 1 : -1;
    });
  }, [gifts, soldSet]);

  const honeymoonGiftResolved = useMemo(() => {
    const url = String(config.luaDeMelImage || '').trim();
    return {
      ...HONEYMOON_GIFT,
      image: url || HONEYMOON_GIFT.image,
    };
  }, [config.luaDeMelImage]);

  return (
    <section className="gifts-page">
      <div className="container">
        <button type="button" className="link-back" onClick={onBack}>
          ← Voltar ao início
        </button>
        <div className="section-head">
          <h2>Lista de Casamento</h2>
          <p className="section-sub">
            Itens para o nosso lar e a vida a dois. Pagamento seguro via Mercado Pago. 
            O valor dos presentes da lista não entra na meta da lua de mel (bloco
            separado ao final da página).
          </p>
          <Disclaimer />
        </div>

        <h3 className="gift-section-title">Itens da Lista</h3>
        <div className="gift-grid">
          {orderedGifts.map((g) => (
            <GiftCard
              key={g.id}
              gift={g}
              sold={soldSet.has(g.id)}
              onPresentear={onPresentear}
            />
          ))}
        </div>

        <section className="honeymoon-panel" aria-labelledby="honeymoon-heading">
          <h3 id="honeymoon-heading" className="honeymoon-panel-title">
            Lua de mel
          </h3>
          <p className="honeymoon-panel-lead">
            Doações voluntárias feitas neste bloco. Compras dos presentes acima não alteram este total.
          </p>
          {showMeta && (
            <ProgressBar
              label={config.metaLabel || 'Meta da lua de mel'}
              goal={config.metaLuaDeMel}
              raised={raisedDisplay ?? 0}
            />
          )}
          <div className="honeymoon-cta">
            <div
              className="honeymoon-cta-image"
              style={{ backgroundImage: `url(${honeymoonGiftResolved.image})` }}
              role="img"
              aria-hidden
            />
            <div className="honeymoon-cta-body">
              <h4 className="honeymoon-cta-title">Contribuir para a viagem</h4>
              <p className="honeymoon-cta-text">
                Escolha o valor que desejar ❤️
              </p>
              <button
                type="button"
                className="btn btn-primary honeymoon-cta-btn"
                onClick={() => onPresentear(honeymoonGiftResolved)}
              >
                Contribuir para a lua de mel
              </button>
            </div>
          </div>
        </section>

        {config.weddingDateIso && (
          <section className="gifts-page-footer-countdown" aria-label="Contagem até o casamento">
            <WeddingCountdown weddingDateIso={config.weddingDateIso} variant="footer" />
          </section>
        )}
      </div>
    </section>
  );
}
