import type { Program } from "../types";

/** ¿Existe otro programa con el mismo código institucional (`dep_code_programa`)? */
export function otroProgramaConMismoCodigoInstitucional(
  codigo: string | null | undefined,
  programaIdActual: string,
  programas: Program[],
): Program | undefined {
  const t = String(codigo ?? "").trim();
  if (!t || !programas.length) return undefined;
  const idAct = String(programaIdActual);
  return programas.find(
    (p) => String(p._id) !== idAct && (p.dep_code_programa?.trim() ?? "") === t,
  );
}
