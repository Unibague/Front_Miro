import type { Program, ProcessHistoryRecord } from "../types";
import { vigenciaActivaSegunYYYYMMDDoISO } from "./vigenciaActiva";

type DocHist = ProcessHistoryRecord["documentos_proceso"][number] & {
  doc_type?: string | null;
  caso_date_key?: string | null;
  mime_type?: string | null;
};

function docsConEnlace(h: ProcessHistoryRecord): DocHist[] {
  return (h.documentos_proceso ?? []).filter((d) => !!(d?.view_link && String(d.view_link).trim())) as DocHist[];
}

function esDocExcluidoPdfResolucion(d: DocHist): boolean {
  const t = d.doc_type ?? "";
  return t === "constancia_reforma" || t === "respuesta_no_renovacion";
}

function parecePdfResolucion(d: DocHist): boolean {
  const mime = (d.mime_type ?? "").toLowerCase();
  const name = (d.name ?? "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf");
}

/**
 * PDF de resolución archivado en el cierre.
 * Prioriza doc_type guardado en BD; si el snapshot es legacy (sin tipo), infiere por enlace del programa o único candidato.
 */
export function docResolucionEnHistorial(
  h: ProcessHistoryRecord,
  programa?: Program | null,
): DocHist | null {
  const docs = docsConEnlace(h);

  const porTipo =
    docs.find((d) => d.doc_type === "resolucion_cierre")
    ?? docs.find((d) => d.doc_type === "resolucion" || d.doc_type === "resolucion_rc_oficio");
  if (porTipo) return porTipo;

  const actoCaso = docs.find((d) => d.caso_date_key === "fecha_resolucion");
  if (actoCaso) return actoCaso;

  const candidatos = docs.filter((d) => !esDocExcluidoPdfResolucion(d));
  if (h.tipo_proceso === "RC" || h.tipo_proceso === "AV") {
    const ult = h.tipo_proceso === "RC" ? programa?.ultimo_rc : programa?.ultimo_av;
    const linkProg = ult?.link_documento?.trim();
    if (linkProg) {
      const match = candidatos.find((d) => String(d.view_link).trim() === linkProg);
      if (match) return match;
    }
  }

  const pdfs = candidatos.filter(parecePdfResolucion);
  if (pdfs.length === 1) return pdfs[0];
  if (pdfs.length > 1 && programa) {
    const ult = h.tipo_proceso === "RC" ? programa.ultimo_rc : programa.ultimo_av;
    const linkProg = ult?.link_documento?.trim();
    if (linkProg) {
      const m = pdfs.find((d) => String(d.view_link).trim() === linkProg);
      if (m) return m;
    }
    return pdfs[0];
  }

  if (candidatos.length === 1) return candidatos[0];

  /** Resolución vigente en ficha pero snapshot sin archivos tipados (datos viejos). */
  if (programa && (h.tipo_proceso === "RC" || h.tipo_proceso === "AV")) {
    const ult = h.tipo_proceso === "RC" ? programa.ultimo_rc : programa.ultimo_av;
    const link = ult?.link_documento?.trim();
    if (link) {
      return {
        name: "Resolución vigente (ficha del programa)",
        view_link: link,
        doc_type: "resolucion",
      };
    }
  }

  return null;
}

export function docConstanciaReformaEnHistorial(h: ProcessHistoryRecord): DocHist | null {
  const docs = docsConEnlace(h);
  return docs.find((d) => d.doc_type === "constancia_reforma") ?? null;
}

/** ¿Este cierre es el que alimenta la resolución vigente en la ficha del programa? */
export function historialEsResolucionVigentePrograma(
  h: ProcessHistoryRecord,
  programa: Program | null | undefined,
  registrosMismoTipo: ProcessHistoryRecord[],
): boolean {
  if (!programa) return false;
  if (h.tipo_proceso !== "RC" && h.tipo_proceso !== "AV") return false;
  const estado = h.estado_solicitud ?? "APROBADO";
  if (estado === "NEGADO" || estado === "CANCELADO") return false;

  const ult = h.tipo_proceso === "RC" ? programa.ultimo_rc : programa.ultimo_av;
  const vencHist = h.fecha_vencimiento ?? ult?.fecha_vencimiento ?? null;
  if (!vigenciaActivaSegunYYYYMMDDoISO(vencHist)) return false;

  const codH = h.codigo_resolucion != null ? String(h.codigo_resolucion).trim() : "";
  const codU = ult?.codigo_resolucion != null ? String(ult.codigo_resolucion).trim() : "";
  const frH = h.fecha_resolucion?.slice(0, 10) ?? "";
  const frU = ult?.fecha_resolucion?.slice(0, 10) ?? "";
  if (codH && codU && codH === codU && frH && frU && frH === frU) return true;

  const linkH = docResolucionEnHistorial(h, programa)?.view_link?.trim();
  const linkU = ult?.link_documento?.trim();
  if (linkH && linkU && linkH === linkU) return true;

  const aprobados = registrosMismoTipo
    .filter((r) => (r.estado_solicitud ?? "APROBADO") !== "NEGADO" && (r.estado_solicitud ?? "APROBADO") !== "CANCELADO")
    .sort((a, b) => String(b.cerrado_en).localeCompare(String(a.cerrado_en)));
  const ultimo = aprobados[0];
  return ultimo != null && ultimo._id === h._id;
}
