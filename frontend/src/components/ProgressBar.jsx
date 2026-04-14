import { formatBRL } from '../format';

export default function ProgressBar({ label, goal, raised }) {
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return (
    <section className="progress-section" aria-labelledby="progress-title">
      <div className="progress-head">
        <h4 id="progress-title">{label}</h4>
        <p className="progress-stats">
          <span className="progress-raised">{formatBRL(raised)}</span>
          <span className="progress-of"> de </span>
          <span>{formatBRL(goal)}</span>
        </p>
      </div>
      <div className="progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="progress-pct">{pct}% da meta</p>
    </section>
  );
}
