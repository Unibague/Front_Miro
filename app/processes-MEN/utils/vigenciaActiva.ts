import type { Program } from "../types";
import { fechaVencimientoPrograma, normalizarFechaYMD } from "./fechaVencimientoPrograma";

/** Hoy en calendario local (no UTC), formato YYYY-MM-DD. */
export function hoyYMDLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Vencimiento (YYYY-MM-DD) ≥ hoy (calendario local). El día de vencimiento sigue vigente. */
export function vigenciaActivaSegunYYYYMMDDoISO(fechaIso: string | null | undefined): boolean {
  const ymd = normalizarFechaYMD(fechaIso);
  if (!ymd) return false;
  return ymd >= hoyYMDLocal();
}

/** AV cerrada con RC de oficio pendiente: el RC en ficha se trata como vigente (transitoria) hasta registrar el oficio. */
export function esRcVigenciaTransitoriaPostAv(programa: Program): boolean {
  return Boolean(programa.av_rc_oficio_pendiente);
}

/** ¿RC o AV del programa tiene vigencia activa según fecha de vencimiento? */
export function esVigenciaActivaPrograma(programa: Program, tipo: "RC" | "AV"): boolean {
  if (tipo === "RC" && esRcVigenciaTransitoriaPostAv(programa)) return true;
  return vigenciaActivaSegunYYYYMMDDoISO(fechaVencimientoPrograma(programa, tipo));
}
