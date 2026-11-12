import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronRight,
  Menu,
  Moon,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "../../contexts/ThemeContext";
import { useWebSocket } from "../../contexts/WebSocketContext";
import { User } from "../../types";
import LanguageSwitcher from "../common/LanguageSwitcher";
import UnitsSwitcher from "../common/UnitsSwitcher";

const titleKeys: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/tanks": "nav.tanks",
  "/sensors": "nav.sensors",
  "/readings": "nav.readings",
  "/alerts": "nav.alerts",
  "/profile": "nav.account",
};

export default function Header({
  onMenuClick,
  user,
}: {
  onMenuClick: () => void;
  user: User | null;
}) {
  const { pathname } = useLocation();
  const { setTheme, actualTheme } = useTheme();
  const { isConnected } = useWebSocket();
  const { t } = useTranslation();
  return (
    <header className="print:hidden sticky top-0 z-30 flex h-[76px] items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-md lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label={t("nav.openMenu")}
          aria-controls="main-navigation"
          className="btn p-2 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
          <span>{t("nav.workspace")}</span>
          <ChevronRight className="h-3 w-3" />
        </div>
        <span className="truncate text-sm font-semibold">
          {titleKeys[pathname] ? t(titleKeys[pathname]) : "NoRush"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <span
          className={`hidden items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10px] font-medium sm:flex ${isConnected ? "border-teal-500/20 bg-teal-500/5 text-teal-700 dark:text-teal-300" : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-teal-500" : "bg-amber-500"}`}
          />
          {isConnected
            ? t("nav.eventsConnected")
            : t("nav.eventsDisconnected")}
        </span>
        <LanguageSwitcher />
        <UnitsSwitcher />
        <button
          type="button"
          onClick={() => setTheme(actualTheme === "dark" ? "light" : "dark")}
          aria-label={
            actualTheme === "dark"
              ? t("nav.themeLight")
              : t("nav.themeDark")
          }
          className="btn p-2 text-muted-foreground hover:bg-accent"
        >
          {actualTheme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
        <Link
          to="/alerts"
          aria-label={t("nav.openAlerts")}
          className="btn p-2 text-muted-foreground hover:bg-accent"
        >
          <AlertTriangle className="h-4 w-4" />
        </Link>
        <Link
          to="/profile"
          className="flex items-center gap-2 border-l border-border pl-3"
          aria-label={t("nav.openAccount")}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="hidden text-xs font-medium md:block">
            {user?.name}
          </span>
        </Link>
      </div>
    </header>
  );
}
