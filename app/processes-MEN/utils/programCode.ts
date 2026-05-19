import type { Program } from "../types";

/**
 * Clave de enlace proceso ↔ programa en API y BD (`Process.program_code`): **siempre** el `_id` del programa.
 * `dep_code_programa` y `codigo_snies` son solo datos de ficha; no se usan para este enlace en flujos nuevos.
 * `findProgramByCode` acepta también `dep_code_programa` solo para compatibilidad con datos legados.
 */
export function programCodeKey(p: Pick<Program, "_id">): string {
  return p._id;
}

export function findProgramByCode(programas: Program[], code: string | null | undefined): Program | undefined {
  if (!code) return undefined;
  const c = String(code).trim();
  if (!c) return undefined;
  return programas.find(
    (p) => p._id === c || (p.dep_code_programa?.trim() ?? "") === c,
  );
}
