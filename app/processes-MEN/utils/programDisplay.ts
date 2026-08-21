import type { Program } from "../types";

/** Código institucional (no confundir con `program_code`/ObjectId técnico de procesos). */
export function formatoCodigoProgramaUsuario(dep: string | null | undefined): string {
  const t = dep?.trim();
  return t && t !== "" ? t : "—";
}

export function formatoCodigoSnies(snies: string | null | undefined): string {
  const t = snies?.trim();
  return t && t !== "" ? t : "—";
}

/**
 * Líneas auxiliares bajo el nombre del programa (solo lectura).
 * No muestra la clave técnica `program_code` ni el ObjectId.
 */
export function lineasAuxPrograma(p: Pick<Program, "dep_code_programa" | "codigo_snies">): string[] {
  const out: string[] = [];
  out.push(`Código programa: ${formatoCodigoProgramaUsuario(p.dep_code_programa)}`);
  out.push(`SNIES: ${formatoCodigoSnies(p.codigo_snies)}`);
  return out;
}
