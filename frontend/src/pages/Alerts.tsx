import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { subscribeUnitSystem } from "../i18n/units.ts";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { apiService } from "../services/api";
import { Alert, AlertSeverity, AlertStatus } from "../types";
import { currentLocale } from "../i18n";
import { formatLevel } from "../utils/units.ts";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { useWebSocketEvent } from "../hooks/useWebSocketEvent";

const REFRESH_INTERVAL_MS = 30_000;

const STATUS_KEYS: Record<AlertStatus, string> = {
  active: "alertStatus.active",
  acknowledged: "alertStatus.acknowledged",
  resolved: "alertStatus.resolved",
  false_positive: "alertStatus.false_positive",
};
const SEVERITY_KEYS: Record<AlertSeverity, string> = {
  critical: "severity.critical",
  high: "severity.high",
  medium: "severity.medium",
  low: "severity.low",
};
const severityStyles: Record<AlertSeverity, string> = {
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  high: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  low: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

interface Feedback {
  key: string;
  vars?: Record<string, string>;
}

function ResolutionDialog({
  alert,
  busy,
  errorKey,
  onClose,
  onResolve,
}: {
  alert: Alert;
  busy: boolean;
  errorKey: string;
  onClose: () => void;
  onResolve: (notes: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const [notes, setNotes] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (notes.trim().length >= 8) onResolve(notes.trim());
  };
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="resolution-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-slate-950/60"
    >
      <form onSubmit={submit}>
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 id="resolution-title" className="text-base font-semibold">
            {t("alerts.dialogTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("alerts.dialogClose")}
            className="btn p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm font-medium">
            {alert.tank?.code} · {alert.title}
          </p>
          <p className="text-xs leading-6 text-muted-foreground">
            {t("alerts.dialogDesc")}
          </p>
          <label
            htmlFor="resolution-notes"
            className="block text-xs font-semibold"
          >
            {t("alerts.dialogLabel")}
          </label>
          <textarea
            id="resolution-notes"
            autoFocus
            required
            minLength={8}
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={busy}
            placeholder={t("alerts.dialogPlaceholder")}
            className="input min-h-28 resize-y"
          />
          {errorKey && (
            <p role="alert" className="text-xs text-destructive">
              {t(errorKey)}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="btn btn-secondary"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy || notes.trim().length < 8}
            className="btn btn-primary"
          >
            {busy ? t("alerts.dialogSubmitting") : t("alerts.dialogConfirm")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function Alerts() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Alert | null>(null);
  const [actionErrorKey, setActionErrorKey] = useState("");
  const requestId = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const result = await apiService.getAlerts({
        page,
        limit: 12,
        status: status === "all" ? undefined : status,
        severity: severity === "all" ? undefined : severity,
        search: query || undefined,
      });
      if (current !== requestId.current) return;
      setAlerts(result.alerts);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setError(false);
    } catch {
      if (current === requestId.current) setError(true);
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [page, status, severity, query]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);
  useWebSocketEvent("alert", () => {
    void load();
  });

  // Mensagens de alerta vêm traduzidas do backend (Accept-Language) e na
  // unidade ativa (units): troca de idioma ou de unidades → refaz a consulta
  useEffect(() => {
    const reload = () => void load();
    i18n.on("languageChanged", reload);
    const offUnits = subscribeUnitSystem(reload);
    return () => {
      i18n.off("languageChanged", reload);
      offUnits();
    };
  }, [load]);

  const acknowledge = async (alert: Alert) => {
    setBusy(alert.id);
    setFeedback(null);
    setActionErrorKey("");
    try {
      await apiService.acknowledgeAlert(alert.id);
      setFeedback({
        key: "alerts.ackOk",
        vars: { tank: alert.tank?.code || t("dashboard.operationFallback") },
      });
      await load();
    } catch {
      setActionErrorKey("alerts.errAck");
    } finally {
      setBusy(null);
    }
  };
  const resolve = async (notes: string) => {
    if (!resolving) return;
    setBusy(resolving.id);
    setActionErrorKey("");
    try {
      await apiService.resolveAlert(resolving.id, notes);
      setFeedback({ key: "alerts.resolveOk" });
      setResolving(null);
      await load();
    } catch {
      setActionErrorKey("alerts.errResolve");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t("alerts.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {t("alerts.heading")}
            <span className="text-primary">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("alerts.sub")}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn border border-border bg-card text-xs"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          {t("common.refresh")}
        </button>
      </div>
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_190px_190px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              aria-label={t("alerts.searchAria")}
              placeholder={t("alerts.searchPlaceholder")}
              className="input pl-9"
              maxLength={200}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label={t("alerts.filterStatusAria")}
            className="input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t("alerts.allStatuses")}</option>
            {(Object.keys(STATUS_KEYS) as AlertStatus[]).map((key) => (
              <option key={key} value={key}>
                {t(STATUS_KEYS[key])}
              </option>
            ))}
          </select>
          <select
            aria-label={t("alerts.filterSeverityAria")}
            className="input"
            value={severity}
            onChange={(event) => {
              setSeverity(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t("alerts.allSeverities")}</option>
            {(Object.keys(SEVERITY_KEYS) as AlertSeverity[]).map((key) => (
              <option key={key} value={key}>
                {t(SEVERITY_KEYS[key])}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setStatus("all");
              setSeverity("all");
              setSearch("");
              setPage(1);
            }}
            className="btn btn-secondary text-xs"
          >
            {t("common.clearFilters")}
          </button>
        </div>
      </div>
      {feedback && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary"
        >
          <CheckCircle2 className="h-4 w-4" />
          {t(feedback.key, feedback.vars)}
        </p>
      )}
      {(error || (actionErrorKey && !resolving)) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"
        >
          {error ? t("alerts.errLoad") : t(actionErrorKey)}
        </p>
      )}
      <section
        className="card overflow-hidden"
        aria-label={t("alerts.listAria")}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="text-sm font-semibold">{t("alerts.listTitle")}</p>
          <span className="text-xs text-muted-foreground">
            {error
              ? t("alerts.resultsUnavailable")
              : t("alerts.results", { count: total })}
          </span>
        </div>
        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-3">
            <LoadingSpinner />
            <span className="text-xs text-muted-foreground">
              {t("alerts.loading")}
            </span>
          </div>
        ) : !error && alerts.length === 0 ? (
          <div className="py-16 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-4 text-sm font-semibold">
              {t("alerts.emptyTitle")}
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("alerts.emptyDesc")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">
                    {t("alerts.colOccurrence")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("alerts.colSeverity")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("alerts.colStatus")}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {t("alerts.colRecord")}
                  </th>
                  <th className="px-5 py-3 text-right font-medium">
                    {t("alerts.colActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {alerts.map((alert) => (
                  <tr key={alert.id} className="align-top hover:bg-muted/20">
                    <td className="max-w-[360px] px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                          {alert.tank?.code || "—"}
                        </span>
                        <p className="font-semibold">{alert.title}</p>
                      </div>
                      <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted-foreground">
                        {alert.message}
                      </p>
                      {alert.currentLevel != null && (
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                          {t("alerts.readingLine", {
                            level: formatLevel(Number(alert.currentLevel)),
                          })}
                          {alert.thresholdValue != null
                            ? t("alerts.thresholdLine", {
                                value: formatLevel(Number(alert.thresholdValue)),
                              })
                            : ""}
                        </p>
                      )}
                      {alert.resolutionNotes && (
                        <p className="mt-2 text-[11px] leading-5 text-primary">
                          {t("alerts.resolutionPrefix", {
                            notes: alert.resolutionNotes,
                          })}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${severityStyles[alert.severity]}`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {t(SEVERITY_KEYS[alert.severity])}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-block rounded-md border px-2 py-1 text-[10px] ${alert.status === "resolved" ? "border-primary/20 text-primary" : "border-border text-muted-foreground"}`}
                      >
                        {t(STATUS_KEYS[alert.status])}
                      </span>
                      {(alert.resolvedBy || alert.acknowledgedBy) && (
                        <p className="mt-2 max-w-28 text-[10px] text-muted-foreground">
                          {(alert.resolvedBy || alert.acknowledgedBy)?.name}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-[11px] text-muted-foreground">
                      {new Date(alert.createdAt).toLocaleDateString(
                        currentLocale(),
                      )}
                      <br />
                      <span className="font-mono">
                        {new Date(alert.createdAt).toLocaleTimeString(
                          currentLocale(),
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {alert.status === "active" && (
                          <button
                            onClick={() => acknowledge(alert)}
                            disabled={busy != null}
                            aria-label={t("alerts.ackAria", {
                              title: alert.title,
                              tank: alert.tank?.code ?? "",
                            })}
                            className="btn btn-secondary px-2.5 text-[10px]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {t("alerts.acknowledge")}
                          </button>
                        )}
                        {(alert.status === "active" ||
                          alert.status === "acknowledged") && (
                          <button
                            onClick={() => {
                              setResolving(alert);
                              setActionErrorKey("");
                            }}
                            disabled={busy != null}
                            aria-label={t("alerts.resolveAria", {
                              title: alert.title,
                              tank: alert.tank?.code ?? "",
                            })}
                            className="btn border border-primary/20 px-2.5 text-[10px] text-primary"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {t("alerts.resolve")}
                          </button>
                        )}
                        {alert.status === "resolved" && (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-[11px] text-muted-foreground">
          <span>
            {t("alerts.pageOf", {
              page,
              total: Math.max(1, totalPages),
            })}
          </span>
          <div className="flex gap-2">
            <button
              aria-label={t("alerts.prevAria")}
              onClick={() => setPage((value) => value - 1)}
              disabled={page <= 1 || loading}
              className="btn btn-secondary text-xs"
            >
              <ArrowLeft className="h-3 w-3" />
              {t("alerts.prev")}
            </button>
            <button
              aria-label={t("alerts.nextAria")}
              onClick={() => setPage((value) => value + 1)}
              disabled={page >= totalPages || loading}
              className="btn btn-secondary text-xs"
            >
              {t("alerts.next")}
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </section>
      {resolving && (
        <ResolutionDialog
          alert={resolving}
          busy={busy != null}
          errorKey={actionErrorKey}
          onClose={() => {
            if (!busy) {
              setResolving(null);
              setActionErrorKey("");
            }
          }}
          onResolve={resolve}
        />
      )}
    </div>
  );
}
