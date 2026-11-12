import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Calendar, Info, LogOut, Mail, ShieldCheck } from "lucide-react";
import { apiService } from "../services/api";
import { User } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { currentLocale } from "../i18n";

const ROLE_STYLES: Record<User["role"], string> = {
  admin: "bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300",
  operator: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  maintenance: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
};

function formatDateTime(value?: Date | string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(currentLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name?: string): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

const Profile: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // Busca o perfil atualizado no backend; em caso de falha usa o usuário do contexto
  useEffect(() => {
    let cancelled = false;
    apiService
      .getProfile()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        /* mantém o fallback do AuthContext */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const display = profile ?? user;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          {t("profile.heading")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("profile.sub")}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Dados do usuário */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <h3 className="card-title text-lg">{t("profile.personalData")}</h3>
            <p className="card-description">{t("profile.personalDesc")}</p>
          </div>
          <div className="card-content">
            {loading && !display ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                {t("profile.loading")}
              </div>
            ) : !display ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {t("profile.loadFailed")}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
                    {initials(display.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-foreground">
                      {display.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ROLE_STYLES[display.role] ?? ROLE_STYLES.operator
                        }`}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {display.role
                          ? t(`roles.${display.role}`)
                          : display.role}
                      </span>
                      {display.isActive && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          {t("profile.activeAccount")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <dl className="mt-6 grid grid-cols-1 gap-3 border-t border-border pt-5 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t("profile.email")}
                      </dt>
                      <dd className="truncate text-sm font-medium text-foreground">
                        {display.email}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t("profile.role")}
                      </dt>
                      <dd className="text-sm font-medium text-foreground">
                        {display.role
                          ? t(`roles.${display.role}`)
                          : display.role}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t("profile.lastLogin")}
                      </dt>
                      <dd className="text-sm font-medium text-foreground tabular-nums">
                        {formatDateTime(display.lastLoginAt)}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        {t("profile.memberSince")}
                      </dt>
                      <dd className="text-sm font-medium text-foreground tabular-nums">
                        {formatDateTime(display.createdAt)}
                      </dd>
                    </div>
                  </div>
                </dl>

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="btn btn-danger mt-6 h-10 w-full sm:w-auto sm:px-6"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="ml-2">
                    {loggingOut ? t("profile.loggingOut") : t("profile.logout")}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sobre */}
        <div className="card h-fit">
          <div className="card-header">
            <h3 className="card-title text-lg flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              {t("profile.aboutTitle")}
            </h3>
          </div>
          <div className="card-content space-y-2 text-sm text-muted-foreground">
            <p>{t("profile.about1")}</p>
            <p>{t("profile.about2")}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
