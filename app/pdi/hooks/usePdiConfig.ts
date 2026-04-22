import { useEffect, useState } from "react";
import axios from "axios";
import { PDI_ROUTES } from "../api";
import type { PdiConfig } from "../types";

const DEFAULT_CONFIG: PdiConfig = {
  nombre:      "PDI 2026–2029",
  descripcion: "Plan de Desarrollo Institucional",
  anio_inicio: 2026,
  anio_fin:    2029,
  lema:        "Tejiendo futuros: soñar, actuar y transformar juntos",
  anios:       [2026, 2027, 2028, 2029],
};

// Cache módulo-nivel para no repetir el fetch en cada componente
let cachedConfig: PdiConfig | null = null;
let fetchPromise: Promise<PdiConfig> | null = null;

async function fetchConfig(): Promise<PdiConfig> {
  if (cachedConfig) return cachedConfig;
  if (!fetchPromise) {
    fetchPromise = axios
      .get(PDI_ROUTES.config())
      .then((res) => {
        cachedConfig = res.data as PdiConfig;
        return cachedConfig;
      })
      .catch(() => DEFAULT_CONFIG);
  }
  return fetchPromise;
}

export function usePdiConfig() {
  const [config, setConfig] = useState<PdiConfig>(cachedConfig ?? DEFAULT_CONFIG);
  const [loading, setLoading] = useState(!cachedConfig);

  useEffect(() => {
    let cancelled = false;
    fetchConfig().then((cfg) => {
      if (!cancelled) {
        setConfig(cfg);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const refresh = async () => {
    cachedConfig = null;
    fetchPromise = null;
    setLoading(true);
    const cfg = await fetchConfig();
    setConfig(cfg);
    setLoading(false);
  };

  return { config, loading, refresh };
}
