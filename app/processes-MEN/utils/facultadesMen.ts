import type { Dependency, Program, Process } from "../types";

/** Prefijo de las 3 facultades nuevas (con espacio tras «DE»). */
export const PREFIJO_FACULTAD_MEN = "FACULTAD DE ";

/**
 * Facultades vigentes en processes-MEN: nombre institucional "FACULTAD DE …".
 * Las dependencias antiguas suelen ser solo "FACULTAD …" sin "DE".
 */
export function esNombreFacultadMen(name: string | null | undefined): boolean {
  return (name ?? "").trim().toUpperCase().startsWith(PREFIJO_FACULTAD_MEN);
}

export function filterFacultadesMen(deps: Dependency[]): Dependency[] {
  return deps.filter((d) => esNombreFacultadMen(d.name));
}

export function filterProgramasMen(programas: Program[], facultades: Dependency[]): Program[] {
  const codes = new Set(filterFacultadesMen(facultades).map((f) => f.dep_code));
  if (codes.size === 0) return [];
  return programas.filter((p) => p.dep_code_facultad != null && codes.has(p.dep_code_facultad));
}

export function filterProcesosMen(procesos: Process[], programas: Program[], facultades: Dependency[]): Process[] {
  const ids = new Set(filterProgramasMen(programas, facultades).map((p) => p._id));
  return procesos.filter((p) => ids.has(p.program_code));
}

export function parseDependenciesAllResponse(raw: unknown): Dependency[] {
  if (Array.isArray(raw)) return raw as Dependency[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { dependencies?: Dependency[] }).dependencies)) {
    return (raw as { dependencies: Dependency[] }).dependencies;
  }
  return [];
}
