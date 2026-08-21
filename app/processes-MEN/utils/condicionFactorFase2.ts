import { CONDICIONES_RC, FACTORES_AV } from "../constants";
import type { Process } from "../types";

export function actividadEsReunionesParciales(actividad: string | null | undefined): boolean {
  return (actividad ?? "").toLowerCase().includes("reuniones parciales");
}

export function actividadEsViabilidadFinanciera(actividad: string | null | undefined): boolean {
  return (actividad ?? "").toLowerCase().includes("viabilidad financiera");
}

export function getOpcionesCondicionFactor(tipo: Process["tipo_proceso"]) {
  if (tipo === "RC") return CONDICIONES_RC;
  if (tipo === "AV") return FACTORES_AV;
  return [];
}

export function etiquetaCondicionFactor(tipo: Process["tipo_proceso"]): "Condición" | "Factor" | null {
  if (tipo === "RC") return "Condición";
  if (tipo === "AV") return "Factor";
  return null;
}

export function lookupCondicionFactorLabel(
  tipo: Process["tipo_proceso"],
  num: number | null | undefined,
): string | null {
  if (num == null) return null;
  const base = etiquetaCondicionFactor(tipo);
  const opciones = getOpcionesCondicionFactor(tipo);
  const key = String(num);
  return opciones.find((o) => o.value === key)?.label ?? (base ? `${base} ${num}` : null);
}

/** Textos para ficha del programa (reuniones + viabilidad legacy si aplica). */
export function textoCondicionFactorFase2(
  proc: Pick<Process, "tipo_proceso" | "fase_actual" | "condicion" | "factor_condicion_actual">,
) {
  if (proc.fase_actual !== 2 || (proc.tipo_proceso !== "RC" && proc.tipo_proceso !== "AV")) return null;
  const baseLabel = etiquetaCondicionFactor(proc.tipo_proceso) ?? "Condición";
  return {
    baseLabel,
    textoReuniones: lookupCondicionFactorLabel(proc.tipo_proceso, proc.factor_condicion_actual),
    textoViabilidad: lookupCondicionFactorLabel(proc.tipo_proceso, proc.condicion),
  };
}

export function debeMostrarSelectorReunionesFase2(
  proc: Pick<Process, "tipo_proceso" | "fase_actual">,
  actividadActual: string | null | undefined,
): boolean {
  return (
    proc.fase_actual === 2 &&
    (proc.tipo_proceso === "RC" || proc.tipo_proceso === "AV") &&
    actividadEsReunionesParciales(actividadActual)
  );
}
