import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, KeyRound, ShieldOff, X } from "lucide-react";
import { apiService } from "../../services/api";
import { DeviceCredential, Sensor, Tank } from "../../types";
import { getUnitSystem } from "../../i18n/units.ts";
import { apiErrorMessage } from "../../utils/apiError";
import { lengthToInput, parseLength } from "../../utils/tankForm.ts";

type SensorType = Sensor["type"];
type EditableStatus = "active" | "maintenance" | "inactive";

const SENSOR_TYPES: SensorType[] = [
  "magnetostrictive",
  "radar_level",
  "ultrasonic",
  "pressure",
  "capacitive",
  "float_switch",
];
const SENSOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

interface GaugeFormDialogProps {
  open: boolean;
  /** Haste em edição; null = cadastro novo (somente admin) */
  sensor: Sensor | null;
  tanks: Tank[];
  /** admin: cadastra hastes e gerencia credenciais */
  canManageCredentials: boolean;
  /** Modo de autenticação da ingestão (IOT_AUTH_MODE) informado pela API */
  authMode?: "shared" | "device" | "hybrid" | null;
  onClose: () => void;
  /** Chamado após salvar ou emitir/revogar credencial */
  onSaved: () => void;
}

interface FormState {
  tankId: string;
  name: string;
  sensorId: string;
  type: SensorType;
  model: string;
  manufacturer: string;
  range: string;
  status: EditableStatus;
}

const CopyField: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono = true,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sem permissão de clipboard: o valor continua selecionável
    }
  };
  return (
    <div>
      <p className="label mb-1">{label}</p>
      <div className="flex items-stretch gap-2">
        <code
          className={`flex-1 select-all break-all rounded-md border border-border bg-background px-2.5 py-2 text-xs ${mono ? "font-mono" : ""}`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="btn btn-secondary h-auto px-2.5"
          aria-label={t("gaugeForm.copyAria", { label })}
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
};

const GaugeFormDialog: React.FC<GaugeFormDialogProps> = ({
  open,
  sensor,
  tanks,
  canManageCredentials,
  authMode,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [system, setSystem] = useState(getUnitSystem());
  const levelUnit = system === "imperial" ? "ft" : "m";
  const [form, setForm] = useState<FormState>({
    tankId: "",
    name: "",
    sensorId: "",
    type: "magnetostrictive",
    model: "",
    manufacturer: "",
    range: "",
    status: "active",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<DeviceCredential | null>(null);
  const [confirming, setConfirming] = useState<"rotate" | "revoke" | null>(null);

  const sortedTanks = useMemo(
    () => tanks.slice().sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [tanks],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      const current = getUnitSystem();
      setSystem(current);
      setErrors({});
      setServerError(null);
      setNotice(null);
      setCredential(null);
      setConfirming(null);
      setForm(
        sensor
          ? {
              tankId: sensor.tankId,
              name: sensor.name ?? "",
              sensorId: sensor.sensorId,
              type: sensor.type,
              model: sensor.model ?? "",
              manufacturer: sensor.manufacturer ?? "",
              range: lengthToInput(sensor.measurementRangeMax, current, 2),
              status:
                sensor.status === "maintenance" || sensor.status === "inactive"
                  ? sensor.status
                  : "active",
            }
          : {
              tankId: "",
              name: "",
              sensorId: "",
              type: "magnetostrictive",
              model: "",
              manufacturer: "",
              range: "",
              status: "active",
            },
      );
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, sensor]);

  const selectedTank = sortedTanks.find((tk) => tk.id === form.tankId);
  const tankHeightM = selectedTank ? Number(selectedTank.dimensions?.height) : NaN;

  const set =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = (): {
    rangeM: number | undefined;
    ok: boolean;
  } => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.tankId) errs.tankId = "gaugeForm.errTank";
    if (!sensor && form.sensorId.trim() && !SENSOR_ID_PATTERN.test(form.sensorId.trim())) {
      errs.sensorId = "gaugeForm.errSensorId";
    }
    let rangeM: number | undefined;
    if (form.range.trim()) {
      const v = parseLength(form.range, system);
      if (v == null || v <= 0 || v > 100) errs.range = "gaugeForm.errRange";
      else rangeM = Math.round(v * 1000) / 1000;
    } else if (Number.isFinite(tankHeightM) && tankHeightM > 0) {
      rangeM = tankHeightM; // padrão: altura do tanque
    }
    setErrors(errs);
    return { rangeM, ok: Object.keys(errs).length === 0 };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setNotice(null);
    const { rangeM, ok } = validate();
    if (!ok) return;
    const name =
      form.name.trim() ||
      t("gaugeForm.defaultName", { code: selectedTank?.code ?? "" });
    setBusy(true);
    try {
      if (sensor) {
        await apiService.updateSensor(sensor.id, {
          name,
          tankId: form.tankId,
          type: form.type,
          model: form.model.trim() || undefined,
          manufacturer: form.manufacturer.trim() || undefined,
          measurementRangeMin: 0,
          measurementRangeMax: rangeM,
          status: form.status,
        });
        onSaved();
        onClose();
      } else {
        const issued = await apiService.provisionDevice({
          tankId: form.tankId,
          sensorId: form.sensorId.trim() || undefined,
          name,
          type: form.type,
          model: form.model.trim() || undefined,
          manufacturer: form.manufacturer.trim() || undefined,
          measurementRangeMin: 0,
          measurementRangeMax: rangeM,
        });
        setCredential(issued);
        onSaved();
      }
    } catch (err) {
      setServerError(apiErrorMessage(err, t("gaugeForm.saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!sensor) return;
    setBusy(true);
    setServerError(null);
    try {
      setCredential(await apiService.rotateDeviceCredential(sensor.sensorId));
      setConfirming(null);
      onSaved();
    } catch (err) {
      setServerError(apiErrorMessage(err, t("gaugeForm.saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!sensor) return;
    setBusy(true);
    setServerError(null);
    try {
      await apiService.revokeDeviceCredential(sensor.sensorId);
      setConfirming(null);
      setNotice(t("gaugeForm.revoked"));
      onSaved();
    } catch (err) {
      setServerError(apiErrorMessage(err, t("gaugeForm.saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  const title = credential
    ? t("gaugeForm.credTitle")
    : sensor
      ? t("gaugeForm.editTitle", { id: sensor.sensorId })
      : t("gaugeForm.newTitle");

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="gauge-form-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-foreground backdrop:bg-black/40"
    >
      <div className="flex h-full justify-end">
        <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
        <form
          onSubmit={submit}
          noValidate
          className="toast-enter relative flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <h3 id="gauge-form-title" className="text-lg font-bold text-foreground">
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("gaugeForm.close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {credential ? (
            /* Credencial emitida: aparece uma única vez */
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <p
                role="status"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
              >
                {t("gaugeForm.credNotice")}
              </p>
              {authMode === "shared" && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-800 dark:text-red-200"
                >
                  {t("gaugeForm.sharedModeWarning")}
                </p>
              )}
              <CopyField label={t("gaugeForm.credSensorId")} value={credential.sensorId} />
              <CopyField label={t("gaugeForm.credSecret")} value={credential.secret} />
              <CopyField
                label={t("gaugeForm.credTopic")}
                value={`devices/${credential.sensorId}/telemetry`}
              />
              <CopyField label={t("gaugeForm.credHttp")} value="POST /iot/sensors/data" />
              <p className="text-xs text-muted-foreground">{t("gaugeForm.credContract")}</p>
            </div>
          ) : (
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {!sensor && !canManageCredentials && (
                <p className="text-sm text-muted-foreground">{t("gaugeForm.adminOnly")}</p>
              )}
              {sortedTanks.length === 0 && (
                <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                  {t("gaugeForm.noTanks")}
                </p>
              )}

              <div>
                <label htmlFor="gauge-tank" className="label mb-1 block">
                  {t("gaugeForm.tank")}
                </label>
                <select
                  id="gauge-tank"
                  value={form.tankId}
                  onChange={set("tankId")}
                  aria-invalid={errors.tankId ? true : undefined}
                  className="input"
                >
                  <option value="">{t("gaugeForm.tankPlaceholder")}</option>
                  {sortedTanks.map((tk) => (
                    <option key={tk.id} value={tk.id}>
                      {tk.code} — {tk.name}
                    </option>
                  ))}
                </select>
                {errors.tankId && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t(errors.tankId)}</p>
                )}
              </div>

              <div>
                <label htmlFor="gauge-name" className="label mb-1 block">
                  {t("gaugeForm.name")}
                </label>
                <input
                  id="gauge-name"
                  value={form.name}
                  onChange={set("name")}
                  maxLength={120}
                  placeholder={t("gaugeForm.defaultName", { code: selectedTank?.code ?? "PT-01" })}
                  className="input"
                />
              </div>

              {!sensor && (
                <div>
                  <label htmlFor="gauge-sensorId" className="label mb-1 block">
                    {t("gaugeForm.sensorId")}
                  </label>
                  <input
                    id="gauge-sensorId"
                    value={form.sensorId}
                    onChange={set("sensorId")}
                    maxLength={64}
                    autoComplete="off"
                    aria-invalid={errors.sensorId ? true : undefined}
                    className="input font-mono"
                  />
                  <p className={`mt-1 text-xs ${errors.sensorId ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                    {t(errors.sensorId ?? "gaugeForm.sensorIdHint")}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="gauge-type" className="label mb-1 block">
                    {t("gaugeForm.type")}
                  </label>
                  <select id="gauge-type" value={form.type} onChange={set("type")} className="input">
                    {SENSOR_TYPES.map((ty) => (
                      <option key={ty} value={ty}>
                        {t(`sensorType.${ty}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="gauge-range" className="label mb-1 block">
                    {t("gaugeForm.range", { unit: levelUnit })}
                  </label>
                  <input
                    id="gauge-range"
                    value={form.range}
                    onChange={set("range")}
                    inputMode="decimal"
                    aria-invalid={errors.range ? true : undefined}
                    placeholder={
                      Number.isFinite(tankHeightM) ? lengthToInput(tankHeightM, system, 2) : ""
                    }
                    className="input"
                  />
                  <p className={`mt-1 text-xs ${errors.range ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                    {t(errors.range ?? "gaugeForm.rangeHint")}
                  </p>
                </div>
                <div>
                  <label htmlFor="gauge-model" className="label mb-1 block">
                    {t("gaugeForm.model")}
                  </label>
                  <input id="gauge-model" value={form.model} onChange={set("model")} maxLength={80} className="input" />
                </div>
                <div>
                  <label htmlFor="gauge-manufacturer" className="label mb-1 block">
                    {t("gaugeForm.manufacturer")}
                  </label>
                  <input
                    id="gauge-manufacturer"
                    value={form.manufacturer}
                    onChange={set("manufacturer")}
                    maxLength={80}
                    className="input"
                  />
                </div>
                {sensor && (
                  <div>
                    <label htmlFor="gauge-status" className="label mb-1 block">
                      {t("gaugeForm.status")}
                    </label>
                    <select id="gauge-status" value={form.status} onChange={set("status")} className="input">
                      {(["active", "maintenance", "inactive"] as const).map((st) => (
                        <option key={st} value={st}>
                          {t(`sensorStatus.${st}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Credencial (admin, haste existente) */}
              {sensor && canManageCredentials && (
                <section className="space-y-2 rounded-lg border border-border p-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("gaugeForm.sectionCredential")}
                  </h4>
                  {confirming ? (
                    <div className="space-y-2">
                      <p className="text-sm text-foreground">
                        {t(confirming === "rotate" ? "gaugeForm.rotateConfirm" : "gaugeForm.revokeConfirm")}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={confirming === "rotate" ? rotate : revoke}
                          className={`btn h-9 px-3 ${confirming === "rotate" ? "btn-primary" : "btn-danger"}`}
                        >
                          {t("gaugeForm.confirm")}
                        </button>
                        <button type="button" onClick={() => setConfirming(null)} className="btn btn-secondary h-9 px-3">
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => setConfirming("rotate")} className="btn btn-secondary h-9 px-3">
                        <KeyRound className="mr-1.5 h-4 w-4" />
                        {t("gaugeForm.rotate")}
                      </button>
                      <button type="button" onClick={() => setConfirming("revoke")} className="btn btn-secondary h-9 px-3">
                        <ShieldOff className="mr-1.5 h-4 w-4" />
                        {t("gaugeForm.revoke")}
                      </button>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          <div className="border-t border-border px-5 py-3">
            {serverError && (
              <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
                {serverError}
              </p>
            )}
            {notice && (
              <p role="status" className="mb-2 text-sm text-foreground">
                {notice}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {credential ? (
                <button type="button" onClick={onClose} className="btn btn-primary h-10 px-4">
                  {t("gaugeForm.done")}
                </button>
              ) : (
                <>
                  <button type="button" onClick={onClose} className="btn btn-secondary h-10 px-4">
                    {t("common.cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={busy || (!sensor && !canManageCredentials) || sortedTanks.length === 0}
                    className="btn btn-primary h-10 px-4"
                  >
                    {busy
                      ? t("gaugeForm.saving")
                      : sensor
                        ? t("gaugeForm.save")
                        : t("gaugeForm.register")}
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </dialog>
  );
};

export default GaugeFormDialog;
