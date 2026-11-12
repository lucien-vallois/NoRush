import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Radio, Wifi, WifiOff, Zap, AlertTriangle } from 'lucide-react';
import { LiveAlert, ReadingEventPayload } from '../../types';
import { formatElapsed, formatTimeOfDay } from '../../utils/format';
import { formatLevel, formatVolumeL } from '../../utils/units.ts';

/** Janela de exibição do badge de anomalia (decai até sumir) */
const ANOMALY_WINDOW_MS = 60_000;

interface LiveStripProps {
  isConnected: boolean;
  lastReading: ReadingEventPayload | null;
  eventCount: number;
  anomalyAt: string | null;
  alerts: LiveAlert[];
}

const LiveStrip: React.FC<LiveStripProps> = ({
  isConnected,
  lastReading,
  eventCount,
  anomalyAt,
  alerts,
}) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const anomalyAge = anomalyAt ? now - new Date(anomalyAt).getTime() : Infinity;
  const showAnomaly = anomalyAge < ANOMALY_WINDOW_MS;
  // Degrada opacidade de 1 → 0.3 ao longo da janela
  const anomalyOpacity = showAnomaly
    ? Math.max(0.3, 1 - anomalyAge / ANOMALY_WINDOW_MS)
    : 0;

  const recentAlerts = [...alerts].reverse().slice(0, 3);

  return (
    <div className="card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Badge AO VIVO */}
        <div className="flex items-center space-x-2 shrink-0">
          <span className="relative flex h-3 w-3">
            {isConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                isConnected ? 'bg-green-500' : 'bg-gray-400'
              }`}
            />
          </span>
          <span className="text-sm font-bold tracking-wide text-foreground uppercase">
            {t('common.live')}
          </span>
        </div>

        {/* Última leitura */}
        <div className="flex items-center gap-2 min-w-0">
          <Radio className="h-4 w-4 text-muted-foreground shrink-0" />
          {lastReading ? (
            <span className="text-sm text-foreground truncate">
              <span className="font-semibold">{lastReading.sensorId}</span>
              <span className="text-muted-foreground"> • </span>
              {formatLevel(lastReading.level)}
              {typeof lastReading.volume === 'number' && (
                <>
                  <span className="text-muted-foreground"> • </span>
                  {formatVolumeL(lastReading.volume)}
                </>
              )}
              <span className="text-muted-foreground"> • </span>
              {formatTimeOfDay(lastReading.timestamp)}{' '}
              <span className="text-muted-foreground">
                ({formatElapsed(new Date(lastReading.timestamp).getTime(), now)})
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t('common.awaitingFirst')}
            </span>
          )}
        </div>

        {/* Contador de eventos */}
        <div className="flex items-center gap-2 shrink-0">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-foreground">
            <span className="font-semibold tabular-nums">{eventCount}</span>{' '}
            <span className="text-muted-foreground">{t('common.eventsSinceLoad')}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Anomalia (decai) */}
          {showAnomaly && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/60 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 transition-opacity duration-1000 dark:bg-amber-950 dark:text-amber-300"
              style={{ opacity: anomalyOpacity }}
            >
              <Zap className="h-3.5 w-3.5" />
              {t('common.anomalyDetected', {
                elapsed: formatElapsed(new Date(anomalyAt!).getTime(), now),
              })}
            </span>
          )}

          {/* Badge de conexão WS */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isConnected
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            {isConnected ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            {isConnected ? t('common.wsConnected') : t('common.wsOffline')}
          </span>
        </div>
      </div>

      {/* Histórico dos últimos 3 alertas */}
      {recentAlerts.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('common.lastAlerts')}
          </span>
          {recentAlerts.map((a) => (
            <span key={a.id} className="text-xs text-muted-foreground truncate">
              <span className="font-medium text-foreground">{a.sensorId}</span>
              {' — '}
              {a.reason}
              {typeof a.level === 'number' && ` (${formatLevel(a.level)})`}
              <span className="ml-1 tabular-nums">{formatTimeOfDay(a.timestamp)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveStrip;
