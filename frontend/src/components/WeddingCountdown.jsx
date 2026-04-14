import { useEffect, useMemo, useState } from 'react';
import { parseWeddingDateIsoToTargetMs } from '../weddingCountdown.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function WeddingCountdown({ weddingDateIso, variant = 'hero' }) {
  const targetMs = useMemo(() => parseWeddingDateIsoToTargetMs(weddingDateIso), [weddingDateIso]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetMs == null) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  if (targetMs == null) return null;

  const diff = targetMs - now;
  const rootClass =
    variant === 'footer' ? 'wedding-countdown wedding-countdown--footer' : 'wedding-countdown';

  if (diff <= 0) {
    return (
      <div className={rootClass} role="status" aria-live="polite">
        <p className="wedding-countdown-title">Chegou o grande dia!</p>
        <p className="wedding-countdown-sub">Muita alegria para esta celebração.</p>
      </div>
    );
  }

  const sec = Math.floor(diff / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  return (
    <div className={rootClass} role="timer" aria-live="polite" aria-atomic="true">
      <p className="wedding-countdown-title">Faltam</p>
      <div className="wedding-countdown-grid" aria-label="Tempo até o casamento">
        <div className="wedding-countdown-unit">
          <span className="wedding-countdown-num">{days}</span>
          <span className="wedding-countdown-unit-label">dias</span>
        </div>
        <div className="wedding-countdown-unit">
          <span className="wedding-countdown-num">{pad(hours)}</span>
          <span className="wedding-countdown-unit-label">horas</span>
        </div>
        <div className="wedding-countdown-unit">
          <span className="wedding-countdown-num">{pad(minutes)}</span>
          <span className="wedding-countdown-unit-label">min</span>
        </div>
        <div className="wedding-countdown-unit">
          <span className="wedding-countdown-num">{pad(seconds)}</span>
          <span className="wedding-countdown-unit-label">seg</span>
        </div>
      </div>
    </div>
  );
}
