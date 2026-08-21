function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fechaValida(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(`${y}-${pad2(mo)}-${pad2(d)}T12:00:00`);
  return (
    !Number.isNaN(dt.getTime())
    && dt.getFullYear() === y
    && dt.getMonth() + 1 === mo
    && dt.getDate() === d
  );
}

function toISO(y: number, mo: number, d: number): string | null {
  if (!fechaValida(y, mo, d)) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

/**
 * Acepta dd/mm/aaaa, yyyy-mm-dd, ddmmyyyy (ej. 15062006) o ddmmyy (ej. 150606)
 * y devuelve YYYY-MM-DD o null.
 */
export function inputFechaAISO(s: string): string | null {
  const t = String(s).trim();
  if (!t) return null;

  if (/^\d+$/.test(t)) {
    if (t.length === 8) {
      const d = Number(t.slice(0, 2));
      const mo = Number(t.slice(2, 4));
      const y = Number(t.slice(4, 8));
      return toISO(y, mo, d);
    }
    if (t.length === 6) {
      const d = Number(t.slice(0, 2));
      const mo = Number(t.slice(2, 4));
      const yy = Number(t.slice(4, 6));
      const y = yy >= 50 ? 1900 + yy : 2000 + yy;
      return toISO(y, mo, d);
    }
  }

  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return toISO(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dmy = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    return toISO(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  return null;
}

/** dateParser de Mantine DateInput: texto tipeado a Date. */
export function dateParserEspanol(value: string): Date | null {
  const iso = inputFechaAISO(value);
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
