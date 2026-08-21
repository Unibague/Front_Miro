/** Color del semáforo para filas de alerta RC/AV/AE/PM en el tablero. */
export type AlertaSemaforoNivel = "green" | "yellow" | "red" | "gray";

function normFechaYmd(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (t.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  return null;
}

/** Hoy en calendario local (`YYYY-MM-DD`), coherente con fechas guardadas como ISO día. */
export function fechaLocalHoyYmd(fechaReferencia = new Date()): string {
  const d = fechaReferencia;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * - Verde: antes del día de digitación (SACES / avance PM según mapeo de recordatorio).
 * - Amarillo: desde ese día inclusivo hasta antes del día de radicado.
 * - Rojo: desde radicado inclusivo hasta antes del vencimiento.
 * - Gris: desde el vencimiento inclusivo (o datos incompletivos / no ordenables).
 */
export function nivelSemaforoAlerta(
  r: {
    fecha_digitacion_saces?: string | null;
    fecha_radicado_men?: string | null;
    fecha_vencimiento?: string | null;
  },
  hoyYmd?: string,
): AlertaSemaforoNivel {
  const hoy = hoyYmd ?? fechaLocalHoyYmd();
  const digit = normFechaYmd(r.fecha_digitacion_saces);
  const rad = normFechaYmd(r.fecha_radicado_men);
  const venc = normFechaYmd(r.fecha_vencimiento);
  if (!digit || !rad || !venc) return "gray";
  if (hoy < digit) return "green";
  if (hoy < rad) return "yellow";
  if (hoy < venc) return "red";
  return "gray";
}
