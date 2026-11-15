// KPI tiles (count-up) and progress bars (fill from the reading start edge).

import { Link } from 'react-router-dom';
import { useCountUp } from './hooks.js';

export function KpiTile({ label, value, to, icon: Icon, attention = false }) {
  const shown = useCountUp(value);
  return (
    <Link
      to={to}
      className={`group flex flex-col gap-2 rounded-[10px] border bg-surface p-4 shadow-e1 transition-[box-shadow,transform] transition-ui hover:-translate-y-0.5 hover:shadow-e2 ${attention ? 'border-signal' : 'border-line'}`}
    >
      <span className="flex items-center justify-between text-sm text-muted">
        {label}
        {Icon && <Icon aria-hidden="true" size={18} className={attention ? 'text-signal-fg' : 'text-subtle'} />}
      </span>
      <span className="tabular text-[32px] font-bold leading-10 text-fg">{shown}</span>
    </Link>
  );
}

const BAR_TONES = { chart: 'bg-chart', success: 'bg-success', signal: 'bg-signal' };

export function ProgressBar({ value, max, tone = 'chart', label }) {
  const ratio = max <= 0 ? 0 : Math.min(1, value / max);
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className="h-2.5 w-full overflow-hidden rounded-full bg-chart-track">
      <div className={`bar-fill h-full w-full rounded-full ${BAR_TONES[tone]}`} style={{ transform: `scaleX(${ratio})` }} />
    </div>
  );
}
