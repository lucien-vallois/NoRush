import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Download, Printer, RefreshCw } from "lucide-react";
import { apiService } from "../services/api";
import { currentLocale } from "../i18n";
import { subscribeUnitSystem } from "../i18n/units.ts";
import { formatGauge, reportUnits, reportVolume } from "../utils/units.ts";
import { apiErrorMessage } from "../utils/apiError";
import LoadingSpinner from "../components/common/LoadingSpinner";
import type { GaugeReport as Report, GaugeReportPeriod, GaugeReportTank } from "../types";

const START_HOUR_KEY = "norush.gaugeDayStartHour";
const PERIODS: GaugeReportPeriod[] = ["daily", "day", "night"];

function readStartHour(): number {
  try {
    const stored = Number(localStorage.getItem(START_HOUR_KEY));
    return Number.isInteger(stored) && stored >= 0 && stored <= 23 && localStorage.getItem(START_HOUR_KEY) !== null
      ? stored
      : 7;
  } catch {
    return 7;
  }
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

const hh = (hour: number) => `${String(hour % 24).padStart(2, "0")}:00`;

export default function GaugeReport() {
  const { t } = useTranslation();
  const [, setUnitsTick] = useState(0);
  const [period, setPeriod] = useState<GaugeReportPeriod>("daily");
  const [date, setDate] = useState<string | undefined>(undefined);
  const [startHour, setStartHour] = useState<number>(readStartHour);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const tz = useMemo(browserTimeZone, []);

  useEffect(() => subscribeUnitSystem(() => setUnitsTick((n) => n + 1)), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getGaugeReport({ period, date, startHour, tz });
      setReport(data);
      if (!date) setDate(data.period.date);
    } catch (err) {
      setError(apiErrorMessage(err, t("gaugeReport.error")));
    } finally {
      setLoading(false);
    }
  }, [period, date, startHour, tz, t]);

  useEffect(() => {
    // The first response fills in the date; that alone is no reason to fetch the same report again.
    if (
      report &&
      report.period.date === date &&
      report.period.kind === period &&
      report.period.startHour === startHour
    ) {
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const changeStartHour = (hour: number) => {
    setStartHour(hour);
    try {
      localStorage.setItem(START_HOUR_KEY, String(hour));
    } catch {
      // private mode: keep it for this visit only
    }
  };

  const download = async () => {
    if (!report) return;
    setDownloading(true);
    try {
      const blob = await apiService.downloadGaugeReportCsv({ period, date: report.period.date, startHour, tz });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `norush-gauge-report-${report.period.date}-${report.period.kind}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err, t("gaugeReport.downloadError")));
    } finally {
      setDownloading(false);
    }
  };

  const units = reportUnits();
  const zone = report?.period.timeZone ?? tz;
  const time = (iso: string, withDate = false) =>
    new Date(iso).toLocaleString(currentLocale(), {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      ...(withDate ? { weekday: "short", month: "short", day: "numeric" } : {}),
    });
  const periodLabel = (p: GaugeReportPeriod) =>
    p === "daily"
      ? t("gaugeReport.periodDaily")
      : p === "day"
        ? t("gaugeReport.periodDay", { from: hh(startHour), to: hh(startHour + 12) })
        : t("gaugeReport.periodNight", { from: hh(startHour + 12), to: hh(startHour) });
  const inProgress = report ? Date.parse(report.period.end) > Date.now() : false;

  const notes = (tank: GaugeReportTank): string[] => {
    const out: string[] = [];
    if (!tank.gaugeId) out.push(t("gaugeReport.noteNoGauge"));
    else if (tank.samples === 0) out.push(t("gaugeReport.noteNoReadings"));
    if (tank.gaugeId && !tank.opening) out.push(t("gaugeReport.noteNoOpening"));
    if (tank.gaugeId && !tank.closing && !inProgress) out.push(t("gaugeReport.noteNoClosing"));
    if (tank.gaugeId && tank.samples > 0 && !tank.hasInterface) {
      out.push(
        t("gaugeReport.noteSingleFloat", { amount: reportVolume(tank.total.produced), unit: units.volume }),
      );
    }
    for (const r of tank.removals) {
      out.push(
        t("gaugeReport.noteRemoval", {
          layer: t(`gaugeReport.layer_${r.layer}`),
          from: time(r.start),
          to: time(r.end),
          amount: reportVolume(r.amountL),
          unit: units.volume,
        }),
      );
    }
    if (tank.alarms.highLevel > 0) out.push(t("gaugeReport.noteHighLevel", { count: tank.alarms.highLevel }));
    if (tank.samples > 0 && tank.longestGapMinutes >= 60) {
      out.push(t("gaugeReport.noteGap", { minutes: tank.longestGapMinutes }));
    }
    if (tank.status === "maintenance") out.push(t("gaugeReport.noteMaintenance"));
    return out;
  };

  const produced = (value: number | null | undefined) => (
    <span
      className={value != null && value < 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "font-semibold"}
      title={
        value != null && value < 0 ? t("gaugeReport.negativeHint", { inches: report?.deadbandInches ?? 2 }) : undefined
      }
    >
      {reportVolume(value)}
    </span>
  );

  const kpis = report
    ? [
        { label: t("gaugeReport.kpiOilProduced"), value: report.totals.oilProducedL, sub: t("gaugeReport.kpiClosing", { value: reportVolume(report.totals.oilClosingL), unit: units.volume }) },
        { label: t("gaugeReport.kpiWaterProduced"), value: report.totals.waterProducedL, sub: t("gaugeReport.kpiClosing", { value: reportVolume(report.totals.waterClosingL), unit: units.volume }) },
        { label: t("gaugeReport.kpiOilRemoved"), value: report.totals.oilRemovedL, sub: t("gaugeReport.kpiRemovedSub") },
        { label: t("gaugeReport.kpiWaterRemoved"), value: report.totals.waterRemovedL, sub: t("gaugeReport.kpiRemovedSub") },
      ]
    : [];

  const th = "px-3 py-2 font-medium";
  const td = "whitespace-nowrap px-3 py-3 text-right tabular-nums";

  return (
    <div className="gauge-report space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t("gaugeReport.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {t("gaugeReport.heading")}
            <span className="text-primary">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("gaugeReport.sub")}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={() => void load()} disabled={loading} className="btn border border-border bg-card text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </button>
          <button onClick={() => void download()} disabled={!report || downloading} className="btn border border-border bg-card text-xs">
            <Download className="h-3.5 w-3.5" />
            {downloading ? t("gaugeReport.downloading") : t("gaugeReport.download")}
          </button>
          <button onClick={() => window.print()} disabled={!report} className="btn btn-primary text-xs">
            <Printer className="h-3.5 w-3.5" />
            {t("gaugeReport.print")}
          </button>
        </div>
      </div>

      <div className="card p-4 print:hidden">
        <div className="flex flex-wrap items-end gap-4">
          <div role="group" aria-label={t("gaugeReport.periodAria")} className="inline-flex flex-wrap rounded-lg border border-border p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {periodLabel(p)}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="gauge-day" className="label mb-1 block text-xs">
              {t("gaugeReport.date")}
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={t("gaugeReport.prevAria")}
                disabled={!date}
                onClick={() => date && setDate(shiftDate(date, -1))}
                className="btn border border-border bg-card px-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <input
                id="gauge-day"
                type="date"
                className="input w-[160px]"
                value={date ?? ""}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
              <button
                type="button"
                aria-label={t("gaugeReport.nextAria")}
                disabled={!date}
                onClick={() => date && setDate(shiftDate(date, 1))}
                className="btn border border-border bg-card px-2"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="gauge-start" className="label mb-1 block text-xs">
              {t("gaugeReport.startsAt")}
            </label>
            <select
              id="gauge-start"
              className="input w-[110px]"
              value={startHour}
              onChange={(e) => changeStartHour(Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hh(h)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {report && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <p>
            <span className="font-semibold">{periodLabel(report.period.kind)}</span>
            <span className="text-muted-foreground">
              {" · "}
              {t("gaugeReport.range", {
                from: time(report.period.start, true),
                to: time(report.period.end, true),
                tz: report.period.timeZone,
                hours: report.period.hours,
              })}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {t("gaugeReport.generated", { time: new Date(report.generatedAt).toLocaleString(currentLocale()) })}
          </p>
        </div>
      )}

      {inProgress && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          {t("gaugeReport.inProgress")}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {loading && !report ? (
        <div className="flex min-h-[30vh] items-center justify-center gap-3 text-sm text-muted-foreground">
          <LoadingSpinner />
          {t("gaugeReport.loading")}
        </div>
      ) : report ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="card p-5">
                <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
                <p className="mt-3 text-3xl font-semibold tabular-nums">
                  {reportVolume(k.value)}
                  <span className="ml-1 text-base font-medium text-muted-foreground">{units.volume}</span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{k.sub}</p>
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            {report.tanks.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{t("gaugeReport.empty")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border">
                      <th rowSpan={2} className={`${th} pl-5`}>{t("gaugeReport.colTank")}</th>
                      <th colSpan={2} className={`${th} border-l border-border text-center`}>
                        {t("gaugeReport.colOpening", { unit: units.level })}
                      </th>
                      <th colSpan={2} className={`${th} border-l border-border text-center`}>
                        {t("gaugeReport.colClosing", { unit: units.level })}
                      </th>
                      <th colSpan={4} className={`${th} border-l border-border text-center`}>
                        {t("gaugeReport.colOil", { unit: units.volume })}
                      </th>
                      <th colSpan={4} className={`${th} border-l border-border text-center`}>
                        {t("gaugeReport.colWater", { unit: units.volume })}
                      </th>
                      <th rowSpan={2} className={`${th} border-l border-border pr-5`}>{t("gaugeReport.colNotes")}</th>
                    </tr>
                    <tr className="border-b border-border">
                      {[t("gaugeReport.colTop"), t("gaugeReport.colInterface"), t("gaugeReport.colTop"), t("gaugeReport.colInterface")].map((label, i) => (
                        <th key={`g${i}`} className={`${th} text-right ${i % 2 === 0 ? "border-l border-border" : ""}`}>{label}</th>
                      ))}
                      {[0, 1].flatMap((group) =>
                        [t("gaugeReport.colOpen"), t("gaugeReport.colClose"), t("gaugeReport.colRemoved"), t("gaugeReport.colProduced")].map((label, i) => (
                          <th key={`v${group}${i}`} className={`${th} text-right ${i === 0 ? "border-l border-border" : ""}`}>{label}</th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.tanks.map((tank) => (
                      <tr key={tank.tankId} className="align-top">
                        <td className="whitespace-nowrap px-3 py-3 pl-5">
                          <p className="font-mono text-sm font-semibold">{tank.code}</p>
                          <p className="text-[11px] text-muted-foreground">{tank.gaugeId ?? "—"}</p>
                        </td>
                        <td className={`${td} border-l border-border font-mono`}>{formatGauge(tank.opening?.level)}</td>
                        <td className={`${td} font-mono`}>{formatGauge(tank.opening?.interfaceLevel)}</td>
                        <td className={`${td} border-l border-border font-mono`}>{formatGauge(tank.closing?.level)}</td>
                        <td className={`${td} font-mono`}>{formatGauge(tank.closing?.interfaceLevel)}</td>
                        <td className={`${td} border-l border-border`}>{reportVolume(tank.oil?.opening)}</td>
                        <td className={td}>{reportVolume(tank.oil?.closing)}</td>
                        <td className={td}>{tank.oil ? reportVolume(tank.oil.removed) : "—"}</td>
                        <td className={td}>{produced(tank.oil?.produced)}</td>
                        <td className={`${td} border-l border-border`}>{reportVolume(tank.water?.opening)}</td>
                        <td className={td}>{reportVolume(tank.water?.closing)}</td>
                        <td className={td}>{tank.water ? reportVolume(tank.water.removed) : "—"}</td>
                        <td className={td}>{produced(tank.water?.produced)}</td>
                        <td className="min-w-[220px] border-l border-border px-3 py-3 pr-5 text-[11px] text-muted-foreground">
                          {notes(tank).map((note) => (
                            <p key={note}>{note}</p>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
                    <tr>
                      <td className="px-3 py-3 pl-5">{t("gaugeReport.total")}</td>
                      <td colSpan={4} className="border-l border-border" />
                      <td className={`${td} border-l border-border`} />
                      <td className={td}>{reportVolume(report.totals.oilClosingL)}</td>
                      <td className={td}>{reportVolume(report.totals.oilRemovedL)}</td>
                      <td className={td}>{reportVolume(report.totals.oilProducedL)}</td>
                      <td className={`${td} border-l border-border`} />
                      <td className={td}>{reportVolume(report.totals.waterClosingL)}</td>
                      <td className={td}>{reportVolume(report.totals.waterRemovedL)}</td>
                      <td className={td}>{reportVolume(report.totals.waterProducedL)}</td>
                      <td className="border-l border-border" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
            {t("gaugeReport.method", { inches: report.deadbandInches })}
          </p>
        </>
      ) : null}
    </div>
  );
}
