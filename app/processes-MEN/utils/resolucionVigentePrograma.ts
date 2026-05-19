import type { Program } from "../types";

/** RC/AV sin resolución previa en ficha (trámite nuevo). */
export function resolucionVigenteEsInexistente(subtipo: string | null | undefined): boolean {
  const s = String(subtipo ?? "").trim();
  return s === "Nuevo" || s === "Primera vez";
}

/** Resolución vigente del programa: último cierre (`ultimo_rc` / `ultimo_av`) o campos legados. */
export function getResolucionVigenteDisplay(programa: Program, tipo: "RC" | "AV") {
  const ult = tipo === "RC" ? programa.ultimo_rc : programa.ultimo_av;
  const fechaRaw =
    ult?.fecha_resolucion
    ?? (tipo === "RC" ? programa.fecha_resolucion_rc : programa.fecha_resolucion_av);
  const codigoRaw =
    ult?.codigo_resolucion
    ?? (tipo === "RC" ? programa.codigo_resolucion_rc : programa.codigo_resolucion_av);
  const fecha = fechaRaw != null && String(fechaRaw).trim() !== "" ? String(fechaRaw).trim() : null;
  const codigo = codigoRaw != null && String(codigoRaw).trim() !== "" ? String(codigoRaw).trim() : null;
  const linkPdf = ult?.link_documento != null && String(ult.link_documento).trim() !== ""
    ? String(ult.link_documento).trim()
    : null;
  const tieneDatos = !!(fecha || codigo || linkPdf);
  return { fecha, codigo, linkPdf, tieneDatos };
}

/** Datos completos de RC para alta de proceso con autocalculo (renovación / renovación + reforma). */
export function getResolucionRcParaAltaProceso(programa: Program) {
  const vig = getResolucionVigenteDisplay(programa, "RC");
  const durRaw = programa.ultimo_rc?.duracion_resolucion ?? programa.duracion_resolucion_rc;
  const dur = durRaw != null && !Number.isNaN(Number(durRaw)) ? Number(durRaw) : null;
  if (vig.fecha && vig.codigo && dur != null) {
    return {
      fecha_resolucion: vig.fecha,
      codigo_resolucion: vig.codigo,
      duracion_resolucion: dur,
    };
  }
  return null;
}
