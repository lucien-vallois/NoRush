import React from 'react';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { currentLocale } from '../../i18n';
import { Reading } from '../../types';
import { fmtNum } from './TimeseriesChart';
import { levelValue, formatVolumeL, unitSuffixes } from '../../utils/units.ts';

interface RawReadingsTableProps {
  readings: Reading[];
  loading: boolean;
}

/** "31/10/2026 09:00:12" (hora local, formatada pelo idioma ativo) */
function formatLocalTime(timestamp: string | Date): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(currentLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function qualityClass(q?: number): string {
  if (q == null) return 'badge badge-secondary';
  if (q >= 90) return 'inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900 dark:text-green-300';
  if (q >= 70) return 'inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  return 'inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-300';
}

const RawReadingsTable: React.FC<RawReadingsTableProps> = ({ readings, loading }) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 rounded bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (readings.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">
          {t('readings.rawEmpty')}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t('readings.colLocalTime')}</th>
            <th className="py-2 pr-4 font-medium">{t('readings.colLevel')} ({unitSuffixes().level})</th>
            <th className="py-2 pr-4 font-medium">{t('readings.colVolume')} ({unitSuffixes().volume})</th>
            <th className="py-2 pr-4 font-medium">{t('readings.colQuality')}</th>
            <th className="py-2 pr-4 font-medium">{t('readings.colInterface')}</th>
            <th className="py-2 font-medium">{t('readings.colStatus')}</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r) => {
            const anomaly = Boolean((r.metadata as { anomaly?: boolean } | undefined)?.anomaly);
            const itf = r.oilWaterInterface;
            return (
              <tr key={r.id} className="border-t border-border">
                <td className="py-2 pr-4 tabular-nums text-foreground whitespace-nowrap">
                  {formatLocalTime(r.timestamp)}
                </td>
                <td className="py-2 pr-4 tabular-nums text-foreground">
                  {levelValue(r.level)}
                </td>
                <td className="py-2 pr-4 tabular-nums text-foreground">
                  {formatVolumeL(r.volume)}
                </td>
                <td className="py-2 pr-4">
                  <span className={qualityClass(r.quality)}>{r.quality != null ? fmtNum(r.quality, 0) : '—'}</span>
                </td>
                <td className="py-2 pr-4 tabular-nums text-muted-foreground whitespace-nowrap">
                  {itf ? (
                    <>
                      <span className="text-amber-600 dark:text-amber-400">{t('readings.oil')} {levelValue(itf.oilLevel)} {unitSuffixes().level}</span>
                      {' · '}
                      <span className="text-cyan-700 dark:text-cyan-400">{t('readings.water')} {levelValue(itf.waterLevel)} {unitSuffixes().level}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2">
                  {anomaly ? (
                    <span className="badge badge-destructive inline-flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      {t('readings.anomaly')}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('readings.normal')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default RawReadingsTable;
