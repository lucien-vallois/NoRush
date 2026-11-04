import React from 'react';
import { useTranslation } from 'react-i18next';
import { currentLocale } from '../../i18n';
import { formatLevel } from '../../utils/units.ts';

interface LevelBarProps {
  /** Nível atual em metros (null = sem leitura) */
  level: number | null;
  /** Altura total do tanque em metros */
  height?: number;
  /** Thresholds em metros para zonas de cor e marcações */
  thresholds?: {
    min?: number | null;
    low?: number | null;
    max?: number | null;
    overflow?: number | null;
  };
}

interface Tick {
  key: string;
  pct: number;
  className: string;
  title: string;
}

/** Barra horizontal de nível com zonas de cor e marcações de thresholds */
const LevelBar: React.FC<LevelBarProps> = ({ level, height, thresholds = {} }) => {
  const { t } = useTranslation();
  const h = Number(height);
  const lvlRaw = level != null ? Number(level) : null;
  const lvl = lvlRaw != null && isFinite(lvlRaw) ? lvlRaw : null;
  const span = isFinite(h) && h > 0 ? h : null;
  const pct = lvl != null && span ? Math.min(100, Math.max(0, (lvl / span) * 100)) : 0;

  // Cor do preenchimento conforme zona
  let fillClass = 'bg-green-500';
  if (lvl != null) {
    const of = thresholds.overflow != null ? Number(thresholds.overflow) : null;
    const mx = thresholds.max != null ? Number(thresholds.max) : null;
    const lo = thresholds.low != null ? Number(thresholds.low) : null;
    const mn = thresholds.min != null ? Number(thresholds.min) : null;
    if (of != null && isFinite(of) && lvl >= of) fillClass = 'bg-red-500';
    else if (mx != null && isFinite(mx) && lvl >= mx) fillClass = 'bg-orange-500';
    else if (
      (lo != null && isFinite(lo) && lvl <= lo) ||
      (mn != null && isFinite(mn) && lvl <= mn)
    ) {
      fillClass = 'bg-sky-500';
    }
  }

  // Marcações de threshold (apenas dentro da barra)
  const ticks: Tick[] = [];
  if (span) {
    const defs: Array<{
      key: string;
      v?: number | null;
      className: string;
      title: string;
    }> = [
      { key: 'overflow', v: thresholds.overflow, className: 'bg-red-500', title: t('tankCard.thresholdOverflow') },
      { key: 'max', v: thresholds.max, className: 'bg-orange-500', title: t('tankCard.thresholdMax') },
      { key: 'low', v: thresholds.low, className: 'bg-sky-500', title: t('tankCard.thresholdLow') },
    ];
    for (const d of defs) {
      const val = d.v != null ? Number(d.v) : null;
      if (val == null || !isFinite(val) || val < 0 || val > span) continue;
      ticks.push({
        key: d.key,
        pct: (val / span) * 100,
        className: d.className,
        title: `${d.title}: ${formatLevel(val)}`,
      });
    }
  }

  return (
    <div className="relative w-full" role="img" aria-label={t('tankCard.currentLevel')}>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${fillClass} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {ticks.map((tick) => (
        <div
          key={tick.key}
          title={tick.title}
          className={`absolute -top-[3px] h-4 w-0.5 rounded ${tick.className}`}
          style={{ left: `${tick.pct}%` }}
        />
      ))}
    </div>
  );
};

export default LevelBar;
