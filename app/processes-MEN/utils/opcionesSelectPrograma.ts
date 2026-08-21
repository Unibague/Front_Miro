import type { Program } from "../types";

export function buildOpcionesProgramaSelect(
  programas: Program[],
  incluirTodos = true,
): { value: string; label: string }[] {
  const counts = new Map<string, number>();
  for (const p of programas) {
    const n = (p.nombre ?? "").trim();
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const opts = programas
    .map((p) => {
      const n = (p.nombre ?? "").trim();
      const dup = (counts.get(n) ?? 0) > 1;
      const extra =
        p.dep_code_programa?.trim()
        || p.codigo_snies?.trim()
        || p._id.slice(-6);
      return {
        value: p._id,
        label: dup ? `${n} (${extra})` : n,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
  if (incluirTodos) return [{ value: "Todos", label: "Todos" }, ...opts];
  return opts;
}

export function programaDesdeFiltroId(programas: Program[], filtro: string): Program | undefined {
  if (filtro === "Todos") return undefined;
  return programas.find((p) => p._id === filtro);
}
