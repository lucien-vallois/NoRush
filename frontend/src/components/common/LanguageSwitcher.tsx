import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../../i18n";

/**
 * Seletor de idioma (EN / PT / ES). Fecha ao clicar fora ou pressionar Escape.
 * English é a língua base; a escolha persiste em localStorage.
 */
export default function LanguageSwitcher({ inverse = false }: { inverse?: boolean }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current =
    LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("nav.language")}
        className={`btn gap-1.5 p-2 text-muted-foreground hover:bg-accent ${inverse ? "hover:text-white" : ""}`}
      >
        <Languages className="h-4 w-4" />
        <span className="text-[10px] font-semibold">{current.short}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t("nav.language")}
          className={`absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-lg border py-1 shadow-xl ${inverse ? "border-slate-700 bg-[#101e2e] text-white" : "border-border bg-card text-foreground"}`}
        >
          {LANGUAGES.map((lang) => (
            <li key={lang.code}>
              <button
                type="button"
                role="option"
                aria-selected={lang.code === current.code}
                onClick={() => {
                  void i18n.changeLanguage(lang.code);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium transition-colors ${inverse ? "hover:bg-white/5" : "hover:bg-muted"} ${lang.code === current.code ? (inverse ? "text-teal-300" : "text-primary") : inverse ? "text-slate-300" : "text-foreground"}`}
              >
                {lang.label}
                {lang.code === current.code && (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
