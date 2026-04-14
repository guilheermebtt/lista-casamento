import { formatBRL } from '../format';

export default function GiftCard({ gift, sold, onPresentear }) {
  return (
    <article className={`gift-card${sold ? ' gift-card--sold' : ''}`}>
      {gift.image ? (
        <div className="gift-card-image-wrap">
          <img
            className="gift-card-image"
            src={gift.image}
            alt={gift.name}
            loading="lazy"
            width={800}
            height={520}
          />
          {sold && <span className="gift-card-badge">Já presenteado 🤩</span>}
        </div>
      ) : (
        <div className="gift-card-image-wrap gift-card-image-placeholder" aria-hidden />
      )}
      <div className="gift-card-inner">
        <h3 className="gift-name">{gift.name}</h3>
        <p className="gift-desc">{gift.description}</p>
        <p className="gift-price">
          <span className="gift-price-value">{formatBRL(gift.amount)}</span>
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={sold}
          onClick={() => !sold && onPresentear(gift)}
        >
          {sold ? 'Indisponível' : 'Presentear'}
        </button>
      </div>
    </article>
  );
}
