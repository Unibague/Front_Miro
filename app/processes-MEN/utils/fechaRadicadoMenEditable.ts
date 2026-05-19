/** Subtipos en los que la fecha de radicado en el MEN puede editarse manualmente. */
export function puedeEditarFechaRadicadoMen(subtipo: string | null | undefined): boolean {
  const s = String(subtipo ?? "").trim();
  return (
    s === "Nuevo"
    || s === "Primera vez"
    || s === "Reactivación"
    || s === "Renovación"
    || s === "Renovación + reforma"
    || s === "Reforma curricular"
  );
}
