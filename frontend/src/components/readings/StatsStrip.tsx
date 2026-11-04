import React from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, TrendingUp, TrendingDown, Droplets, Layers } from 'lucide-react';
import { currentLocale } from '../../i18n';
import { fmtNum } from './TimeseriesChart';

export interface PeriodStats {
  avgLevel: number;
  maxLevel: number;
  minLevel: number;
  avgVolume: number;
  samples: number;
}

interface StatsStripProps {
  stats: PeriodStats | null;
  loading: boolean;
}

const StatCard: React.FC<{
  label: string;
  value: string;
  unit?: string;
  icon: React.ElementType;
}> = ({ label, value, unit, icon: Icon }) => (
  <div className="card px-4 py-3">
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate">
          {label}
        </p>
        <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">
          {value}
          {unit && <span className="text-sm font-medium text-muted-foreground ml-1">{unit}</span>}
        </p>
      </div>
      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
    </div>
  </div>
);

const StatsStrip: React.FC<StatsStripProps> = ({ stats, loading }) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card px-4 py-3">
            <div className="animate-pulse space-y-2">
              <div className="h-3 w-20 rounded bg-muted" />
              <div className="h-6 w-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <StatCard label={t('readings.statAvgLevel')} value={fmtNum(stats.avgLevel)} unit="m" icon={Activity} />
      <StatCard label={t('readings.statMaxLevel')} value={fmtNum(stats.maxLevel)} unit="m" icon={TrendingUp} />
      <StatCard label={t('readings.statMinLevel')} value={fmtNum(stats.minLevel)} unit="m" icon={TrendingDown} />
      <StatCard label={t('readings.statAvgVolume')} value={fmtNum(stats.avgVolume, 0)} unit="L" icon={Droplets} />
      <StatCard
        label={t('readings.statSamples')}
        value={stats.samples.toLocaleString(currentLocale())}
        icon={Layers}
      />
    </div>
  );
};

export default StatsStrip;
