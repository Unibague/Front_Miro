import type { Program } from "../types";

export function normalizarNombrePrograma(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ");
}

export function programaConNombreDuplicado(
  programas: Program[],
  nombre: string,
  excludeId?: string | null,
): Program | undefined {
  const target = normalizarNombrePrograma(nombre).toLowerCase();
  if (!target) return undefined;
  return programas.find(
    (p) =>
      p._id !== excludeId
      && normalizarNombrePrograma(p.nombre ?? "").toLowerCase() === target,
  );
}

export const MENSAJE_NOMBRE_PROGRAMA_DUPLICADO =
  "Ya existe un programa con ese nombre. Usa otro nombre o edita el programa existente.";
