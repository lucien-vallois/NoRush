import { FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  Radio,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import Brand from "../components/common/Brand";
import LoadingSpinner from "../components/common/LoadingSpinner";
import LanguageSwitcher from "../components/common/LanguageSwitcher";

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorKey, setErrorKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated)
    return (
      <Navigate to={location.state?.from?.pathname || "/dashboard"} replace />
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorKey("");
    try {
      await login({ email, password });
    } catch (err: any) {
      setErrorKey(
        err.response?.status === 401
          ? "login.errUnauthorized"
          : err.response?.status === 429
            ? "login.errRateLimited"
            : "login.errApi",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="industrial-grid relative hidden flex-col overflow-hidden bg-[#101e2e] p-12 text-white lg:flex xl:p-16">
        <Brand inverse />
        <div className="relative z-10 my-auto max-w-xl py-12">
          <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.3em] text-teal-400">
            {t("login.heroEyebrow")}
          </p>
          <h1 className="text-5xl font-semibold leading-[1.12] tracking-tight xl:text-6xl">
            {t("login.heroLine1")}
            <br />
            {t("login.heroLine2")}
            <br />
            <span className="text-teal-400">{t("login.heroLine3")}</span>
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-slate-400">
            {t("login.heroSub")}
          </p>
          <svg
            viewBox="0 0 480 215"
            className="mt-10 w-full max-w-lg"
            role="img"
            aria-label={t("login.heroDiagram")}
          >
            <defs>
              <pattern
                id="fluid-lines"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M0 8 8 0"
                  stroke="#2dd4bf"
                  strokeWidth="0.5"
                  opacity="0.25"
                />
              </pattern>
            </defs>
            <path
              d="M85 28V12h145v16M230 12h145v16"
              fill="none"
              stroke="#41546a"
              strokeDasharray="4 4"
            />
            {[
              { x: 35, h: 74, n: "01" },
              { x: 180, h: 108, n: "02" },
              { x: 325, h: 51, n: "03" },
            ].map((tank) => (
              <g key={tank.n}>
                <rect
                  x={tank.x}
                  y="38"
                  width="100"
                  height="132"
                  rx="10"
                  fill="#142637"
                  stroke="#496075"
                />
                <path
                  d={`M${tank.x} 62h100M${tank.x} 146h100`}
                  stroke="#496075"
                  opacity="0.5"
                />
                <rect
                  x={tank.x + 6}
                  y={164 - tank.h}
                  width="88"
                  height={tank.h}
                  rx="5"
                  fill="#14b8a6"
                  fillOpacity="0.12"
                />
                <rect
                  x={tank.x + 6}
                  y={164 - tank.h}
                  width="88"
                  height={tank.h}
                  rx="5"
                  fill="url(#fluid-lines)"
                />
                <path
                  d={`M${tank.x + 6} ${164 - tank.h}h88`}
                  stroke="#2dd4bf"
                  strokeWidth="2"
                />
                <path
                  d={`M${tank.x + 10} 75h80`}
                  stroke="#fbbf24"
                  strokeDasharray="4 4"
                  opacity="0.6"
                />
                <rect
                  x={tank.x + 41}
                  y="24"
                  width="18"
                  height="14"
                  rx="3"
                  fill="#193e44"
                  stroke="#2dd4bf"
                />
                <circle cx={tank.x + 50} cy="31" r="2" fill="#2dd4bf" />
                <path
                  d={`M${tank.x + 16} 170v10M${tank.x + 84} 170v10`}
                  stroke="#496075"
                  strokeWidth="3"
                />
                <text
                  x={tank.x + 50}
                  y="201"
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  TANK / {tank.n}
                </text>
              </g>
            ))}
            <circle cx="230" cy="12" r="4" fill="#2dd4bf" />
          </svg>
          <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-slate-500">
            {t("login.heroSchematic")}
          </p>
        </div>
        <div className="flex flex-wrap gap-6 border-t border-slate-700/60 pt-6 text-[11px] text-slate-400">
          <span className="flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-teal-400" /> {t("login.heroMqtt")}
          </span>
          <span className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-teal-400" />{" "}
            {t("login.heroSeries")}
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />{" "}
            {t("login.heroRbac")}
          </span>
        </div>
      </section>
      <section className="relative flex flex-col bg-card px-6 py-8 sm:px-12">
        <div className="flex items-center justify-end">
          <LanguageSwitcher />
        </div>
        <div className="my-auto w-full max-w-sm self-center py-12">
          <div className="mb-9">
            <span className="eyebrow">{t("login.eyebrow")}</span>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              {t("login.welcome")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t("login.subtitle")}
            </p>
          </div>
          <form
            onSubmit={submit}
            className="space-y-5"
            aria-label={t("login.formAria")}
          >
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-xs font-semibold"
              >
                {t("login.email")}
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                className="input h-12 bg-background/50"
                placeholder={t("login.emailPlaceholder")}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorKey("");
                }}
                disabled={submitting}
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-xs font-semibold"
              >
                {t("login.password")}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  maxLength={72}
                  className="input h-12 bg-background/50 pr-12"
                  placeholder={t("login.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorKey("");
                  }}
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={
                    showPassword
                      ? t("login.hidePassword")
                      : t("login.showPassword")
                  }
                  className="absolute inset-y-0 right-0 px-4 text-muted-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {errorKey && (
              <div
                role="alert"
                className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {t(errorKey)}
              </div>
            )}
            <button
              type="submit"
              className="btn btn-primary h-12 w-full justify-between px-4"
              disabled={submitting || loading}
            >
              {submitting ? t("login.submitting") : t("login.submit")}
              {submitting ? (
                <LoadingSpinner size="small" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </button>
          </form>
          <div className="mt-8 rounded-xl border border-border bg-background/70 p-4">
            <p className="text-xs font-semibold">{t("login.demoTitle")}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {t("login.demoDesc")}
            </p>
            <button
              type="button"
              onClick={() => {
                setEmail("operador@flowback.com");
                setPassword("operador123");
                setErrorKey("");
              }}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
              disabled={submitting}
            >
              {t("login.demoFill")} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </div>
        <p className="text-center text-[10px] text-muted-foreground">
          {t("login.footer")}
        </p>
      </section>
    </div>
  );
}
