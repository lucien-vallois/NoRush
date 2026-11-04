import React from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, Activity, Wifi, BatteryWarning, Wrench } from 'lucide-react';
import { currentLocale } from '../../i18n';

/** KPIs derivados da lista de sensores (calculados no cliente) */
export interface SensorKpiData {
  total: number;
  active: number;
  online: number;
  lowBattery: number;
  maintenance: number;
}

interface SensorKpiCardsProps {
  kpis: SensorKpiData;
}

interface KpiDef {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
  subtitle: string;
  /** Classe extra para o valor (ex.: vermelho quando há ocorrências) */
  valueClassName?: string;
}

const SensorKpiCards: React.FC<SensorKpiCardsProps> = ({ kpis }) => {
  const { t } = useTranslation();
  const cards: KpiDef[] = [
    {
      title: t('sensors.kpiTotal'),
      value: kpis.total,
      icon: Radio,
      color: 'bg-blue-500',
      subtitle: t('sensors.kpiTotalSub'),
    },
    {
      title: t('sensors.kpiActive'),
      value: kpis.active,
      icon: Activity,
      color: 'bg-emerald-500',
      subtitle: t('sensors.kpiActiveSub'),
    },
    {
      title: t('sensors.kpiOnline'),
      value: kpis.online,
      icon: Wifi,
      color: 'bg-green-500',
      subtitle: t('sensors.kpiOnlineSub'),
    },
    {
      title: t('sensors.kpiLowBattery'),
      value: kpis.lowBattery,
      icon: BatteryWarning,
      color: 'bg-amber-500',
      subtitle: t('sensors.kpiLowBatterySub'),
      valueClassName:
        kpis.lowBattery > 0 ? 'text-red-600 dark:text-red-400' : undefined,
    },
    {
      title: t('sensors.kpiMaintenance'),
      value: kpis.maintenance,
      icon: Wrench,
      color: 'bg-sky-500',
      subtitle: t('sensors.kpiMaintenanceSub'),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((c) => (
        <div key={c.title} className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground truncate">{c.title}</p>
              <p className={`text-2xl font-bold text-foreground ${c.valueClassName ?? ''}`}>
                {c.value.toLocaleString(currentLocale())}
              </p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{c.subtitle}</p>
            </div>
            <div className={`p-2.5 rounded-full ${c.color} shrink-0`}>
              <c.icon className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SensorKpiCards;
