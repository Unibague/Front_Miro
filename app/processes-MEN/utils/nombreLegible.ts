const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "en", "a"]);

/** «FACULTAD DE CIENCIAS, INGENIERIA E INNOVACION» → «Facultad de Ciencias, Ingenieria e Innovacion». */
export function nombreLegible(nombre: string | null | undefined): string {
  return String(nombre ?? "")
    .toLocaleLowerCase("es")
    .split(" ")
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toLocaleUpperCase("es") + w.slice(1)))
    .join(" ");
}
