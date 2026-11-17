import React from "react";
import { useTranslation } from "react-i18next";
import { currentLocale } from "../../i18n";
import { formatLevel } from "../../utils/units.ts";
import type { TankView } from "../../utils/tankView.ts";

interface TankReadingSummaryProps {
  view: TankView;
}

const TankReadingSummary: React.FC<TankReadingSummaryProps> = ({ view }) => {
  const { t } = useTranslation();
  const timestamp = view.readingTimestamp
    ? new Date(view.readingTimestamp)
    : null;
  const formattedTime =
    timestamp && Number.isFinite(timestamp.getTime())
      ? timestamp.toLocaleString(currentLocale(), {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <div className="space-y-2 text-[11px] text-muted-foreground">
      <p>
        <span className={view.readingFresh ? "text-green-600 dark:text-green-400" : ""}>
          {view.readingFresh
            ? t("tankReading.fresh")
            : t("tankReading.stale")}
        </span>
        {" · "}
        {formattedTime
          ? t("tankReading.lastAt", { time: formattedTime })
          : t("tankReading.noReading")}
      </p>
      {view.communicationFailed && (
        <p className="text-slate-600 dark:text-slate-400">
          {t("tankReading.communicationUnavailable")}
        </p>
      )}
      {view.oilWaterInterface && (
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-2 text-center tabular-nums">
          <span>
            {t("tankReading.interface")}: {formatLevel(view.oilWaterInterface.interfaceLevel)}
          </span>
          <span>
            {t("tankReading.oil")}: {formatLevel(view.oilWaterInterface.oilLevel)}
          </span>
          <span>
            {t("tankReading.water")}: {formatLevel(view.oilWaterInterface.waterLevel)}
          </span>
        </div>
      )}
    </div>
  );
};

export default TankReadingSummary;
