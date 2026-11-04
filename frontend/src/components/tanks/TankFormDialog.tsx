import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Crosshair, Wand2, X } from "lucide-react";
import { apiService } from "../../services/api";
import { Tank } from "../../types";
import { getUnitSystem } from "../../i18n/units.ts";
import { formatVolumeL } from "../../utils/units.ts";
import { apiErrorMessage } from "../../utils/apiError";
import {
  EMPTY_TANK_FORM,
  FieldError,
  TankFormErrors,
  TankFormValues,
  lengthToInput,
  nominalCapacityLiters,
  parseLength,
  parseStrappingTable,
  suggestThresholds,
  tankToFormValues,
  validateTankForm,
} from "../../utils/tankForm.ts";

interface TankFormDialogProps {
  open: boolean;
  /** Tanque em edição; null = cadastro novo */
  tank: Tank | null;
  onClose: () => void;
  onSaved: (tank: Tank) => void;
}

const Field: React.FC<{
  id: string;
  label: string;
  hint?: string;
  error?: FieldError;
  children: React.ReactNode;
}> = ({ id, label, hint, error, children }) => {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={id} className="label mb-1 block">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {t(error.key, error.params)}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
};

const TankFormDialog: React.FC<TankFormDialogProps> = ({
  open,
  tank,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Sistema de unidades fixado ao abrir: trocar ft↔m com o formulário aberto
  // não reinterpreta o que já foi digitado
  const [system, setSystem] = useState(getUnitSystem());
  const sfx =
    system === "imperial"
      ? { level: "ft", volume: "bbl" }
      : { level: "m", volume: "L" };
  const [values, setValues] = useState<TankFormValues>(EMPTY_TANK_FORM);
  const [errors, setErrors] = useState<TankFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      const current = getUnitSystem();
      setSystem(current);
      setValues(tank ? tankToFormValues(tank, current) : EMPTY_TANK_FORM);
      setErrors({});
      setServerError(null);
      setLocationError(false);
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, tank]);

  const set =
    (field: keyof TankFormValues) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setValues((v) => ({ ...v, [field]: e.target.value }));

  const heightM = parseLength(values.height, system);
  const diameterM = parseLength(values.diameter, system);
  const strapping = useMemo(
    () =>
      values.strapping.trim()
        ? parseStrappingTable(values.strapping, system)
        : null,
    [values.strapping, system],
  );
  const capacityL =
    heightM && diameterM && heightM > 0 && diameterM > 0
      ? nominalCapacityLiters(
          heightM,
          diameterM,
          strapping && strapping.errorLine == null ? strapping.rows : null,
        )
      : null;

  const suggest = () => {
    if (!heightM || heightM <= 0) {
      setErrors((e) => ({ ...e, height: { key: "tankForm.errSuggestNeedsHeight" } }));
      return;
    }
    const s = suggestThresholds(heightM);
    setValues((v) => ({
      ...v,
      overflow: lengthToInput(s.overflow, system, 1),
      high: lengthToInput(s.high, system, 1),
      low: lengthToInput(s.low, system, 1),
      min: lengthToInput(s.min, system, 1),
    }));
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }
    setLocating(true);
    setLocationError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValues((v) => ({
          ...v,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
      },
      () => {
        setLocationError(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { errors: errs, payload } = validateTankForm(values, system);
    setErrors(errs);
    setServerError(null);
    if (!payload) return;
    setSubmitting(true);
    try {
      let saved: Tank;
      if (tank) {
        saved = await apiService.updateTank(tank.id, payload);
      } else {
        // status não faz parte do cadastro (todo tanque novo nasce ativo)
        const { status: _status, ...create } = payload;
        saved = await apiService.createTank(create);
      }
      onSaved(saved);
    } catch (err) {
      setServerError(apiErrorMessage(err, t("tankForm.saveFailed")));
    } finally {
      setSubmitting(false);
    }
  };

  const describedBy = (field: keyof TankFormValues) =>
    errors[field] ? `tank-${field}-error` : undefined;
  const input = (
    field: keyof TankFormValues,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <input
      id={`tank-${field}`}
      value={values[field]}
      onChange={set(field)}
      aria-invalid={errors[field] ? true : undefined}
      aria-describedby={describedBy(field)}
      className="input"
      {...extra}
    />
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="tank-form-title"
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
            <div>
              <h3 id="tank-form-title" className="text-lg font-bold text-foreground">
                {tank ? t("tankForm.editTitle", { code: tank.code }) : t("tankForm.newTitle")}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("tankForm.unitsNote", { level: sfx.level, volume: sfx.volume })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("tankForm.close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {/* Identificação */}
            <fieldset className="space-y-3">
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("tankForm.sectionIdentity")}
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field id="tank-code" label={t("tankForm.code")} error={errors.code}>
                  {input("code", { maxLength: 32, autoComplete: "off", placeholder: "PT-01" })}
                </Field>
                <div className="sm:col-span-2">
                  <Field id="tank-name" label={t("tankForm.name")} error={errors.name}>
                    {input("name", { maxLength: 120 })}
                  </Field>
                </div>
              </div>
              <Field id="tank-description" label={t("tankForm.description")}>
                <textarea
                  id="tank-description"
                  value={values.description}
                  onChange={set("description")}
                  maxLength={500}
                  rows={2}
                  className="input h-auto py-2"
                />
              </Field>
              {tank && (
                <Field id="tank-status" label={t("tankForm.status")}>
                  <select
                    id="tank-status"
                    value={values.status}
                    onChange={set("status")}
                    className="input"
                  >
                    {(["active", "maintenance", "inactive"] as const).map((s) => (
                      <option key={s} value={s}>
                        {t(`tankStatus.${s}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </fieldset>

            {/* Geometria */}
            <fieldset className="space-y-3">
              <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("tankForm.sectionGeometry")}
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="tank-height"
                  label={t("tankForm.height", { unit: sfx.level })}
                  error={errors.height}
                >
                  {input("height", { inputMode: "decimal", placeholder: system === "imperial" ? "20" : "6.1" })}
                </Field>
                <Field
                  id="tank-diameter"
                  label={t("tankForm.diameter", { unit: sfx.level })}
                  error={errors.diameter}
                >
                  {input("diameter", { inputMode: "decimal", placeholder: system === "imperial" ? "12" : "3.66" })}
                </Field>
              </div>
              <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("tankForm.capacity")}: </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {capacityL != null ? formatVolumeL(capacityL) : "—"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("tankForm.capacityHint")}
                </span>
              </p>
            </fieldset>

            {/* Limites */}
            <fieldset className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("tankForm.sectionLimits")}
                </legend>
                <button
                  type="button"
                  onClick={suggest}
                  className="btn btn-secondary h-8 px-2.5 text-xs"
                >
                  <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                  {t("tankForm.suggest")}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t("tankForm.limitsHint")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field id="tank-overflow" label={t("tankForm.overflow", { unit: sfx.level })} error={errors.overflow}>
                  {input("overflow", { inputMode: "decimal" })}
                </Field>
                <Field id="tank-high" label={t("tankForm.high", { unit: sfx.level })} error={errors.high}>
                  {input("high", { inputMode: "decimal" })}
                </Field>
                <Field id="tank-low" label={t("tankForm.low", { unit: sfx.level })} error={errors.low}>
                  {input("low", { inputMode: "decimal" })}
                </Field>
                <Field id="tank-min" label={t("tankForm.min", { unit: sfx.level })} error={errors.min}>
                  {input("min", { inputMode: "decimal" })}
                </Field>
              </div>
            </fieldset>

            {/* Tabela de arqueação */}
            <fieldset className="space-y-2">
              <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("tankForm.sectionStrapping")}
              </legend>
              <Field
                id="tank-strapping"
                label={t("tankForm.strapping", { level: sfx.level, volume: sfx.volume })}
                hint={t("tankForm.strappingHint")}
                error={errors.strapping}
              >
                <textarea
                  id="tank-strapping"
                  value={values.strapping}
                  onChange={set("strapping")}
                  rows={5}
                  spellCheck={false}
                  aria-invalid={errors.strapping ? true : undefined}
                  aria-describedby={describedBy("strapping")}
                  placeholder={system === "imperial" ? "0'0\"\t0\n1'0\"\t20.0\n2'0\"\t40.1" : "0\t0\n0.5\t5260\n1.0\t10520"}
                  className="input h-auto py-2 font-mono text-xs"
                />
              </Field>
              {strapping && strapping.errorLine == null && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t("tankForm.strappingRows", { count: strapping.rows.length })}
                </p>
              )}
            </fieldset>

            {/* Localização */}
            <fieldset className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("tankForm.sectionLocation")}
                </legend>
                <button
                  type="button"
                  onClick={locate}
                  disabled={locating}
                  className="btn btn-secondary h-8 px-2.5 text-xs"
                >
                  <Crosshair className="mr-1.5 h-3.5 w-3.5" />
                  {locating ? t("tankForm.locating") : t("tankForm.useLocation")}
                </button>
              </div>
              {locationError && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {t("tankForm.locationFailed")}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field id="tank-latitude" label={t("tankForm.latitude")} error={errors.latitude}>
                  {input("latitude", { inputMode: "decimal", placeholder: "48.1470" })}
                </Field>
                <Field id="tank-longitude" label={t("tankForm.longitude")} error={errors.longitude}>
                  {input("longitude", { inputMode: "decimal", placeholder: "-103.6180" })}
                </Field>
              </div>
            </fieldset>
          </div>

          <div className="border-t border-border px-5 py-3">
            {serverError && (
              <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
                {serverError}
              </p>
            )}
            {Object.keys(errors).length > 0 && !serverError && (
              <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
                {t("tankForm.fixErrors")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn btn-secondary h-10 px-4">
                {t("common.cancel")}
              </button>
              <button type="submit" disabled={submitting} className="btn btn-primary h-10 px-4">
                {submitting ? t("tankForm.saving") : t("tankForm.save")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </dialog>
  );
};

export default TankFormDialog;
