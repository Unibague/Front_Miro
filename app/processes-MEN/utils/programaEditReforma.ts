import type { Program } from "../types";

export type ProgramaEditReformaState = {
  dep_code_programa: string;
  nombre: string;
  codigo_snies: string;
  modalidad: string;
  nivel_academico: string;
  nivel_formacion: string;
  num_creditos: string | number;
  num_semestres: string | number;
  admision_estudiantes: string;
  num_estudiantes_saces: string | number;
  cine_f: { campo_amplio: string; campo_especifico: string; campo_detallado: string };
  nbc: { area_conocimiento: string; nbc: string };
};

export const CAMPOS_REFORMA_UI: {
  key: keyof Omit<ProgramaEditReformaState, "cine_f" | "nbc">;
  label: string;
  tipo: "text" | "number" | "select";
  opciones?: string[];
}[] = [
  { key: "dep_code_programa", label: "Código del programa", tipo: "text" },
  { key: "nombre", label: "Nombre del programa", tipo: "text" },
  { key: "codigo_snies", label: "Código SNIES", tipo: "text" },
  { key: "modalidad", label: "Modalidad", tipo: "select", opciones: ["Presencial", "Virtual", "Híbrido"] },
  { key: "nivel_academico", label: "Nivel académico", tipo: "select", opciones: ["Pregrado", "Posgrado"] },
  {
    key: "nivel_formacion",
    label: "Nivel de formación",
    tipo: "select",
    opciones: ["Profesional", "Tecnológico", "Técnico", "Especialización", "Maestría", "Doctorado"],
  },
  { key: "num_creditos", label: "N° de créditos", tipo: "number" },
  { key: "num_semestres", label: "N° de semestres", tipo: "number" },
  { key: "admision_estudiantes", label: "Admisión de estudiantes", tipo: "text" },
  { key: "num_estudiantes_saces", label: "N° estudiantes SACES", tipo: "number" },
];

export function buildProgramaEditReforma(p: Program): ProgramaEditReformaState {
  return {
    dep_code_programa: p.dep_code_programa?.trim() ?? "",
    nombre: p.nombre ?? "",
    codigo_snies: p.codigo_snies ?? "",
    modalidad: p.modalidad ?? "",
    nivel_academico: p.nivel_academico ?? "",
    nivel_formacion: p.nivel_formacion ?? "",
    num_creditos: p.num_creditos ?? "",
    num_semestres: p.num_semestres ?? "",
    admision_estudiantes: p.admision_estudiantes ?? "",
    num_estudiantes_saces: p.num_estudiantes_saces ?? "",
    cine_f: {
      campo_amplio: p.cine_f?.campo_amplio ?? "",
      campo_especifico: p.cine_f?.campo_especifico ?? "",
      campo_detallado: p.cine_f?.campo_detallado ?? "",
    },
    nbc: {
      area_conocimiento: p.nbc?.area_conocimiento ?? "",
      nbc: p.nbc?.nbc ?? "",
    },
  };
}

export function buildProgramaNuevosValoresApi(pe: ProgramaEditReformaState): Record<string, unknown> {
  const normTxtNull = (s: string) => {
    const t = String(s).trim();
    return t === "" ? null : t;
  };
  const normNumNull = (v: string | number) => {
    if (v === "" || v === undefined || v === null) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  return {
    dep_code_programa: normTxtNull(pe.dep_code_programa),
    nombre: normTxtNull(pe.nombre),
    codigo_snies: normTxtNull(pe.codigo_snies),
    modalidad: normTxtNull(pe.modalidad),
    nivel_academico: normTxtNull(pe.nivel_academico),
    nivel_formacion: normTxtNull(pe.nivel_formacion),
    num_creditos: normNumNull(pe.num_creditos),
    num_semestres: normNumNull(pe.num_semestres),
    admision_estudiantes: normTxtNull(pe.admision_estudiantes),
    num_estudiantes_saces: normNumNull(pe.num_estudiantes_saces),
    cine_f: {
      campo_amplio: normTxtNull(pe.cine_f?.campo_amplio ?? ""),
      campo_especifico: normTxtNull(pe.cine_f?.campo_especifico ?? ""),
      campo_detallado: normTxtNull(pe.cine_f?.campo_detallado ?? ""),
    },
    nbc: {
      area_conocimiento: normTxtNull(pe.nbc?.area_conocimiento ?? ""),
      nbc: normTxtNull(pe.nbc?.nbc ?? ""),
    },
  };
}

export function esSubtipoReformaHistorial(subtipo: string | null | undefined): boolean {
  const n = String(subtipo ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return n === "reforma curricular" || n === "renovación + reforma";
}

export function esSubtipoReformaCurricularSoloHistorial(subtipo: string | null | undefined): boolean {
  return String(subtipo ?? "").trim().replace(/\s+/g, " ").toLowerCase() === "reforma curricular";
}

export function esSubtipoRenovacionReformaHistorial(subtipo: string | null | undefined): boolean {
  return String(subtipo ?? "").trim().replace(/\s+/g, " ").toLowerCase() === "renovación + reforma";
}

export function esSubtipoRcOficioHistorial(subtipo: string | null | undefined): boolean {
  return String(subtipo ?? "").trim().replace(/\s+/g, " ").toLowerCase() === "registro calificado de oficio";
}
