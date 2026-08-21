/** Fechas en pantalla: dd/mm/aa (año de2 dígitos). */
export function formatFechaDDMMYY(iso?: string | null): string {
  if (iso == null || String(iso).trim() === "") return "—";
  const s = String(iso).trim();
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}
