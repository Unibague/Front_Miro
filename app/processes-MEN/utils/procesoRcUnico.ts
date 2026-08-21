import type { Process } from "../types";

/** Timestamp para elegir el RC “canónico” si hubiera duplicados legacy en BD. */
export function procTimeMs(p: Process): number {
  return new Date(p.updatedAt || p.createdAt || 0).getTime();
}

/**
 * Un programa solo debe tener un proceso RC activo a la vez (cualquier subtipo).
 * Si existieran varios en datos antiguos, se toma el más reciente.
 */
export function procesoRcActivoDePrograma(
  procesos: Process[],
  programCode: string,
): Process | undefined {
  const rcs = procesos.filter(
    (x) => x.program_code === programCode && x.tipo_proceso === "RC",
  );
  if (rcs.length === 0) return undefined;
  return rcs.reduce((a, b) => (procTimeMs(b) > procTimeMs(a) ? b : a));
}
