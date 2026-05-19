import type { Program } from "../types";
import { fechaVencimientoDesdeResolucion } from "./calcularFechasProceso";

/** Normaliza a YYYY-MM-DD (calendario) para comparar vigencia. */
export function normalizarFechaYMD(fecha: string | null | undefined): string | null {
  if (fecha == null) return null;
  const s = String(fecha).trim();
  if (!s) return null;
  const head = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Fecha de vencimiento vigente del programa (RC/AV).
 * Misma lógica que la ficha: `ultimo_*`, vencimiento guardado o resolución + años.
 */
export function fechaVencimientoPrograma(programa: Program, tipo: "RC" | "AV"): string | null {
  const ult = tipo === "RC" ? programa.ultimo_rc : programa.ultimo_av;
  const fechaRes =
    ult?.fecha_resolucion
    ?? (tipo === "RC" ? programa.fecha_resolucion_rc : programa.fecha_resolucion_av);
  const duracion =
    ult?.duracion_resolucion != null
      ? ult.duracion_resolucion
      : (tipo === "RC" ? programa.duracion_resolucion_rc : programa.duracion_resolucion_av);
  const vencGuardado = normalizarFechaYMD(ult?.fecha_vencimiento ?? null);
  if (vencGuardado) return vencGuardado;
  const fr =
    typeof fechaRes === "string" && fechaRes.length >= 8
      ? normalizarFechaYMD(fechaRes)
      : null;
  return fechaVencimientoDesdeResolucion(fr, duracion != null ? Number(duracion) : undefined);
}
