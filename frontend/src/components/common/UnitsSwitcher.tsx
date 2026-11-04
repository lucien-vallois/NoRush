import { useEffect, useState } from "react";
import { Ruler } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  getUnitSystem,
  setUnitSystem,
  subscribeUnitSystem,
} from "../../i18n/units.ts";

/**
 * Alterna o sistema de unidades do console: imperial (ft/bbl — padrão do
 * oilfield americano) ⇄ métrico (m/L). Persiste em localStorage; a troca
 * re-renderiza os valores convertidos (o armazenamento segue métrico).
 */
export default function UnitsSwitcher({ inverse = false }: { inverse?: boolean }) {
  const { t } = useTranslation();
  const [units, setUnits] = useState(getUnitSystem());

  useEffect(() => subscribeUnitSystem(() => setUnits(getUnitSystem())), []);

  const isImperial = units === "imperial";

  return (
    <button
      type="button"
      onClick={() => setUnitSystem(isImperial ? "metric" : "imperial")}
      aria-label={t("nav.units")}
      title={isImperial ? t("nav.unitsImperial") : t("nav.unitsMetric")}
      className={`btn gap-1.5 p-2 text-muted-foreground hover:bg-accent ${inverse ? "hover:text-white" : ""}`}
    >
      <Ruler className="h-4 w-4" />
      <span className="text-[10px] font-semibold">
        {isImperial ? "ft·bbl" : "m·L"}
      </span>
    </button>
  );
}
