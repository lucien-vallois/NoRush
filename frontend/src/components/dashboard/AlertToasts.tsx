import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import { LiveAlert } from '../../types';
import { formatTimeOfDay } from '../../utils/format';
import { formatLevel } from '../../utils/units.ts';

/** Tempo de exibição de cada toast de alerta */
const TOAST_TTL_MS = 8_000;
const MAX_VISIBLE = 4;

interface AlertToastsProps {
  alerts: LiveAlert[];
}

/**
 * Fila transitória de alertas: banners flutuantes urgentes que somem sozinhos
 * após ~8s (a severidade não vem no evento — tudo é tratado como urgente).
 */
const AlertToasts: React.FC<AlertToastsProps> = ({ alerts }) => {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  // Limpa ids descartados que já saíram da lista
  useEffect(() => {
    setDismissed((prev) => {
      const ids = new Set(alerts.map((a) => a.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [alerts]);

  const visible = alerts
    .filter((a) => now - a.receivedAtMs < TOAST_TTL_MS && !dismissed.has(a.id))
    .slice(-MAX_VISIBLE);

  const dismiss = (id: number) =>
    setDismissed((prev) => new Set(prev).add(id));

  if (visible.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {visible.map((a) => (
        <div
          key={a.id}
          role="alert"
          className="toast-enter rounded-lg border-l-4 border-red-700 bg-red-600 text-white shadow-lg px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-red-100">
                {t('toast.alert')}
              </p>
              <p className="text-sm font-semibold truncate">
                {a.sensorId}
                {typeof a.level === 'number' && (
                  <span className="font-normal"> — {formatLevel(a.level)}</span>
                )}
              </p>
              <p className="text-sm text-red-50 break-words">{a.reason}</p>
              <p className="text-[11px] text-red-200 mt-0.5 tabular-nums">
                {formatTimeOfDay(a.timestamp)}
              </p>
            </div>
            <button
              onClick={() => dismiss(a.id)}
              className="p-1 rounded hover:bg-red-500 transition-colors"
              aria-label={t('toast.dismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AlertToasts;
