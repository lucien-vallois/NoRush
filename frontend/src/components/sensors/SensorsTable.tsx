import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Radar,
  Layers,
  Gauge,
  Waves,
  Cpu,
  BatteryFull,
  BatteryWarning,
  BatteryLow,
  Wrench,
  Wifi,
  WifiOff,
  Pencil,
} from 'lucide-react';
import { Sensor } from '../../types';
import { currentLocale } from '../../i18n';
import { formatElapsed, formatTimeOfDay } from '../../utils/format';

/** Janela em que a linha permanece "piscando" após uma leitura ao vivo */
export const ROW_FLASH_MS = 2_000;

/** Sensor enriquecido com campos derivados (defensivos quanto a tipos da API) */
export interface SensorRowView extends Sensor {
  /** batteryLevel normalizado (0–100); null quando desconhecido */
  batteryPct: number | null;
  /** lastTransmissionAt em ms; null quando o sensor nunca transmitiu */
  lastTxMs: number | null;
  /** Valor original de lastTransmissionAt (ISO string da API ou Date), p/ hora do dia */
  lastTxIso: string | number | Date | null;
  /** true quando transmitiu há menos de 5 minutos */
  online: boolean;
}

interface SensorsTableProps {
  rows: SensorRowView[];
  /** ticker (ms) para recomputar "há X" e o decaimento do flash */
  now: number;
  /** map sensorId (business id) → ms do último evento 'reading' recebido */
  flash: Record<string, number>;
  /** Presente quando o usuário pode editar hastes */
  onEdit?: (sensor: SensorRowView) => void;
}

/** Ícone + classe de estilo por tipo de sensor (rótulo vem do i18n) */
const TYPE_META: Record<
  string,
  { labelKey: string; icon: React.ElementType; cls: string }
> = {
  magnetostrictive: {
    labelKey: 'sensorType.magnetostrictive',
    icon: Layers,
    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
  },
  ultrasonic: {
    labelKey: 'sensorType.ultrasonic',
    icon: Radar,
    cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  },
  capacitive: {
    labelKey: 'sensorType.capacitive',
    icon: Layers,
    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  },
  radar_level: {
    labelKey: 'sensorType.radar_level',
    icon: Gauge,
    cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  },
  float_switch: {
    labelKey: 'sensorType.float_switch',
    icon: Waves,
    cls: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300',
  },
  pressure: {
    labelKey: 'sensorType.pressure',
    icon: Gauge,
    cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  },
};

const STATUS_BADGE_CLS: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  maintenance: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  offline: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

/** Célula de bateria: barra colorida (verde/âmbar/vermelho) + percentual */
const BatteryCell: React.FC<{ pct: number | null }> = ({ pct }) => {
  if (pct === null || !isFinite(pct)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const color =
    pct < 20 ? 'bg-red-500' : pct < 60 ? 'bg-amber-500' : 'bg-green-500';
  const text =
    pct < 20
      ? 'text-red-600 dark:text-red-400 font-bold'
      : 'text-foreground font-medium';
  const Icon = pct < 20 ? BatteryLow : pct < 60 ? BatteryWarning : BatteryFull;
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={`h-4 w-4 shrink-0 ${
          pct < 20
            ? 'text-red-500'
            : pct < 60
              ? 'text-amber-500'
              : 'text-green-500'
        }`}
      />
      <div className="w-14 h-2 rounded-full bg-muted overflow-hidden shrink-0">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
      <span className={`text-sm tabular-nums ${text}`}>
        {pct.toLocaleString(currentLocale(), { maximumFractionDigits: 1 })}%
      </span>
    </div>
  );
};

const SensorsTable: React.FC<SensorsTableProps> = ({ rows, now, flash, onEdit }) => {
  const { t } = useTranslation();
  return (
    <div className="card overflow-hidden">
      {/* Keyframes locais do "pisca" de leitura ao vivo */}
      <style>{`
        @keyframes sensor-row-flash-kf {
          0% { background-color: rgb(34 197 94 / 0.30); }
          100% { background-color: transparent; }
        }
        .sensor-row-flash { animation: sensor-row-flash-kf 1.8s ease-out; }
      `}</style>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left font-semibold">{t('sensors.colSensor')}</th>
              <th className="px-4 py-3 text-left font-semibold">{t('sensors.colType')}</th>
              <th className="px-4 py-3 text-left font-semibold">{t('sensors.colTank')}</th>
              <th className="px-4 py-3 text-left font-semibold">{t('sensors.colBattery')}</th>
              <th className="px-4 py-3 text-left font-semibold">{t('sensors.colStatus')}</th>
              <th className="px-4 py-3 text-left font-semibold">{t('sensors.colLastTx')}</th>
              <th className="px-4 py-3 text-right font-semibold">{t('sensors.colTxCount')}</th>
              {onEdit && (
                <th className="px-4 py-3 text-right font-semibold">
                  <span className="sr-only">{t('gaugeForm.editButton')}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const critical = s.batteryPct !== null && s.batteryPct < 20;
              const flashAt = flash[s.sensorId];
              const flashing = flashAt !== undefined && now - flashAt < ROW_FLASH_MS;
              const typeMeta = TYPE_META[s.type] ?? {
                labelKey: 'sensorType.unknown',
                icon: Cpu,
                cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
              };
              const statusCls =
                STATUS_BADGE_CLS[s.status] ?? STATUS_BADGE_CLS.inactive;
              const txCount = Number(s.transmissionCount);
              const errCount = Number(s.errorCount) || 0;

              return (
                <tr
                  key={s.id}
                  className={[
                    'border-t border-border transition-colors',
                    critical
                      ? 'bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/40'
                      : 'hover:bg-muted/50',
                    flashing ? 'sensor-row-flash' : '',
                  ].join(' ')}
                >
                  {/* ID + nome */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {critical && (
                        <span
                          className="h-8 w-1 rounded-full bg-red-500 shrink-0"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0">
                        <div
                          className={`font-semibold ${
                            critical
                              ? 'text-red-700 dark:text-red-300'
                              : 'text-foreground'
                          }`}
                        >
                          {s.sensorId}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                          {s.name}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Tipo */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${typeMeta.cls}`}
                    >
                      <typeMeta.icon className="h-3.5 w-3.5" />
                      {t(typeMeta.labelKey)}
                    </span>
                  </td>

                  {/* Tanque */}
                  <td className="px-4 py-3">
                    {s.tank ? (
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          {s.tank.code}
                          {s.tank.status === 'maintenance' && (
                            <Wrench
                              className="h-3.5 w-3.5 text-blue-500"
                              aria-label={t('sensors.tankInMaintenance')}
                            />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {s.tank.name}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        {s.tankId ? `${s.tankId.slice(0, 8)}…` : '—'}
                      </span>
                    )}
                  </td>

                  {/* Bateria */}
                  <td className="px-4 py-3">
                    <BatteryCell pct={s.batteryPct} />
                  </td>

                  {/* Status (cadastro + conectividade calculada) */}
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCls}`}
                      >
                        {t(`sensorStatus.${s.status}`)}
                      </span>
                      {s.online ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                          </span>
                          <Wifi className="h-3 w-3" />
                          {t('sensors.online')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          <WifiOff className="h-3 w-3" />
                          {t('sensors.offline')}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Última transmissão */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {s.lastTxMs !== null ? (
                      <span
                        className={
                          s.online
                            ? 'text-green-700 dark:text-green-300 font-medium'
                            : 'text-muted-foreground'
                        }
                      >
                        <span className="tabular-nums">
                          {formatElapsed(s.lastTxMs, now)}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {formatTimeOfDay(s.lastTxIso ?? s.lastTxMs)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">{t('sensors.neverTx')}</span>
                    )}
                  </td>

                  {/* Contagem de transmissões */}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <span className="font-medium text-foreground tabular-nums">
                      {isFinite(txCount)
                        ? txCount.toLocaleString(currentLocale())
                        : '—'}
                    </span>
                    {errCount > 0 && (
                      <div className="text-xs text-red-600 dark:text-red-400">
                        {t('sensors.errors', { count: errCount })}
                      </div>
                    )}
                  </td>
                  {onEdit && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onEdit(s)}
                        className="btn btn-secondary h-8 px-2.5 text-xs"
                        aria-label={t('gaugeForm.editAria', { id: s.sensorId })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="ml-1.5 hidden lg:inline">{t('gaugeForm.editButton')}</span>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>{t('sensors.footerOnline')}</span>
        <span>{t('sensors.footerBattery')}</span>
        <span>{t('sensors.footerFlash')}</span>
      </div>
    </div>
  );
};

export default SensorsTable;
