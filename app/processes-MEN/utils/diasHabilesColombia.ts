/**
 * Días hábiles en Colombia (fines de semana + festivos).
 * Misma lógica que Back_Miro/helpers/diasHabilesColombia.js
 */
import Holidays from "date-holidays";

let hdColombia: Holidays | null = null;

function getHolidaysCo(): Holidays {
  if (!hdColombia) {
    hdColombia = new Holidays("CO");
  }
  return hdColombia;
}

function parseYmd(fechaStr: string): Date {
  const [y, m, d] = fechaStr.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(fechaStr: string, days: number): string {
  const d = parseYmd(fechaStr);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

export function esFinDeSemana(fechaStr: string | null | undefined): boolean {
  if (!fechaStr) return false;
  const dow = parseYmd(fechaStr).getDay();
  return dow === 0 || dow === 6;
}

export function esFestivoColombia(fechaStr: string | null | undefined): boolean {
  if (!fechaStr) return false;
  const result = getHolidaysCo().isHoliday(parseYmd(fechaStr));
  if (!result) return false;
  return Array.isArray(result) ? result.length > 0 : true;
}

export function esDiaInhabil(fechaStr: string | null | undefined): boolean {
  return esFinDeSemana(fechaStr) || esFestivoColombia(fechaStr);
}

/** Avanza al siguiente día hábil (no sábado, domingo ni festivo CO). */
export function siguienteDiaHabil(fechaStr: string | null | undefined): string | null {
  if (!fechaStr) return null;
  let cur = fechaStr.slice(0, 10);
  let guard = 0;
  while (esDiaInhabil(cur) && guard < 366) {
    cur = addDays(cur, 1);
    guard += 1;
  }
  return cur;
}
