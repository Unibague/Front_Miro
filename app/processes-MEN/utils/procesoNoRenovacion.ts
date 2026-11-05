import type { Process } from "../types";

export function esAvNoRenovacion(proceso: Process | null | undefined): boolean {
  const subtipo = String(proceso?.subtipo ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
  return proceso?.tipo_proceso === "AV" && subtipo === "no renovacion";
}
