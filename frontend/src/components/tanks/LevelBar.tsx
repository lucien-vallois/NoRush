import React from "react";
import { useTranslation } from "react-i18next";
import { formatLevel } from "../../utils/units.ts";
import type { TankView } from "../../utils/tankView.ts";

interface LevelBarProps {
  view: TankView;
}

interface Tick {
  key: string;
  pct: number;
  className: string;
  title: string;
}

const LevelBar: React.FC<LevelBarProps> = ({ view }) => {
  const { t } = useTranslation();
  const { tank, level, readingFresh } = view;
  const thresholds = {
    low: tank.lowLevelThreshold,
    max: tank.maxLevelThreshold,
    overflow: tank.overflowThreshold,
  };
  const h = Number(tank.dimensions.height);
  const lvlRaw = level != null ? Number(level) : null;
  const lvl = lvlRaw != null && isFinite(lvlRaw) ? lvlRaw : null;
  const span = isFinite(h) && h > 0 ? h : null;
  const pct =
    lvl != null && span ? Math.min(100, Math.max(0, (lvl / span) * 100)) : 0;

  let fillClass = "bg-slate-400 dark:bg-slate-500";
  if (readingFresh && lvl != null) {
    fillClass = "bg-green-500";
    const of = thresholds.overflow != null ? Number(thresholds.overflow) : null;
    const mx = thresholds.max != null ? Number(thresholds.max) : null;
    const lo = thresholds.low != null ? Number(thresholds.low) : null;
    const mn = tank.minLevelThreshold != null ? Number(tank.minLevelThreshold) : null;
    if (of != null && isFinite(of) && lvl >= of) fillClass = "bg-red-500";
    else if (mx != null && isFinite(mx) && lvl >= mx) fillClass = "bg-orange-500";
    else if (
      (lo != null && isFinite(lo) && lvl <= lo) ||
      (mn != null && isFinite(mn) && lvl <= mn)
    ) {
      fillClass = "bg-sky-500";
    }
  }

  const ticks: Tick[] = [];
  if (span) {
    const defs: Array<{
      key: string;
      v?: number | null;
      className: string;
      title: string;
    }> = [
      {
        key: "overflow",
        v: thresholds.overflow,
        className: "bg-red-500",
        title: t("tankCard.thresholdOverflow"),
      },
      {
        key: "max",
        v: thresholds.max,
        className: "bg-orange-500",
        title: t("tankCard.thresholdMax"),
      },
      {
        key: "low",
        v: thresholds.low,
        className: "bg-sky-500",
        title: t("tankCard.thresholdLow"),
      },
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
    <div
      className="relative w-full"
      role="img"
      aria-label={`${t("tankCard.currentLevel")}: ${
        readingFresh ? t("tankReading.fresh") : t("tankReading.stale")
      }`}
    >
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
