import { useEffect } from "react";
import { NavLink } from "react-router";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Droplets,
  Radio,
  Activity,
  AlertTriangle,
  ClipboardList,
  UserRound,
  X,
  ArrowUpRight,
  FlaskConical,
} from "lucide-react";
import { useWebSocket } from "../../contexts/WebSocketContext";
import Brand from "../common/Brand";

const navigation = [
  { nameKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard, number: "01" },
  { nameKey: "nav.tanks", href: "/tanks", icon: Droplets, number: "02" },
  { nameKey: "nav.sensors", href: "/sensors", icon: Radio, number: "03" },
  { nameKey: "nav.readings", href: "/readings", icon: Activity, number: "04" },
  { nameKey: "nav.alerts", href: "/alerts", icon: AlertTriangle, number: "05" },
  { nameKey: "nav.gaugeReport", href: "/gauge-report", icon: ClipboardList, number: "06" },
];

export default function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { isConnected } = useWebSocket();
  const { t } = useTranslation();
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [isOpen, onClose]);

  return (
    <aside
      id="main-navigation"
      aria-label={t("nav.monitoring")}
      className={`console-sidebar print:hidden fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-200 lg:visible lg:translate-x-0 ${isOpen ? "visible translate-x-0" : "invisible -translate-x-full"}`}
    >
      <div className="flex items-center justify-between px-6 py-8">
        <Brand inverse />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("nav.closeMenu")}
          className="rounded-lg p-2 text-slate-300 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mx-5 mb-8 rounded-lg border border-slate-700/70 bg-white/[0.03] px-3 py-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
          {t("nav.workspace")}
        </p>
        <p className="mt-1 flex items-center justify-between text-sm font-medium text-slate-100">
          {t("nav.flowbackOps")}{" "}
          <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
        </p>
      </div>
      <p className="px-6 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {t("nav.monitoring")}
      </p>
      <nav className="mt-3 flex-1 space-y-1 px-3">
        {navigation.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            onClick={onClose}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-lg px-3 py-3 text-[13px] font-medium transition-colors ${isActive ? "bg-teal-400/10 text-teal-300 shadow-[inset_2px_0_0_#2dd4bf]" : "text-slate-400 hover:bg-white/5 hover:text-white"}`
            }
          >
            <item.icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
            <span className="flex-1">{t(item.nameKey)}</span>
            <span className="font-mono text-[10px] opacity-40">
              {item.number}
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="mx-5 mb-6 rounded-xl border border-amber-400/15 bg-amber-400/5 p-4">
        <FlaskConical className="mb-2 h-4 w-4 text-amber-400" />
        <p className="text-xs font-semibold text-slate-200">
          {t("nav.demoEnv")}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
          {t("nav.demoTelemetry")}
        </p>
        <a
          href={`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/docs`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-300"
        >
          {t("nav.exploreApi")} <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
      <div className="border-t border-slate-800 px-6 py-4">
        <NavLink
          to="/profile"
          onClick={onClose}
          className="mb-4 flex items-center gap-2 text-xs text-slate-400 hover:text-white"
        >
          <UserRound className="h-4 w-4" /> {t("nav.account")}
        </NavLink>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-teal-400" : "bg-amber-400"}`}
          />
          {isConnected
            ? t("nav.channelConnected")
            : t("nav.channelDisconnected")}
        </div>
      </div>
    </aside>
  );
}
