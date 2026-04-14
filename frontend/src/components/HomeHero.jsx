import Disclaimer from './Disclaimer';
import WeddingCountdown from './WeddingCountdown.jsx';

export default function HomeHero({ config, onViewGifts }) {
  const logoUrl = String(config.coupleLogoUrl || '').trim();
  const useLogo = config.heroTitleMode === 'logo' && logoUrl.length > 0;
  const logoAlt =
    String(config.coupleLogoAlt || '').trim() ||
    String(config.coupleNames || '').trim() ||
    'Noivos';

  return (
    <header className="hero">
      <div className="hero-image-wrap">
        <img src={config.bannerImage} alt="" className="hero-image" />
        <div className="hero-overlay" />
      </div>
      <div className="hero-content">
        <p className="hero-kicker animate-in">Lista de casamento</p>
        {useLogo ? (
          <h1 className="hero-title hero-title--logo animate-delay-1 animate-in">
            <img className="hero-couple-logo" src={logoUrl} alt={logoAlt} />
          </h1>
        ) : (
          <h1 className="hero-title couple-name animate-delay-1 animate-in">{config.coupleNames}</h1>
        )}
        <p className="hero-date animate-delay-2 animate-in">{config.weddingDate}</p>
        {config.weddingDateIso && (
          <div className="hero-countdown animate-delay-2 animate-in">
            <WeddingCountdown weddingDateIso={config.weddingDateIso} variant="hero" />
          </div>
        )}
        <p className="hero-text animate-delay-3 animate-in">{config.welcomeText}</p>
        <Disclaimer />
        <button type="button" className="btn btn-primary hero-cta" onClick={onViewGifts}>
          Ver lista de casamento
        </button>
      </div>
    </header>
  );
}
