export const faseColors = [
  { fase: 0, color: "#ced4da", label: "Fase 0", fullName: "Fase 0 - Apertura" },
  { fase: 1, color: "#ff6b6b", label: "Fase 1", fullName: "Fase 1 - Preparación" },
  { fase: 2, color: "#ffa94d", label: "Fase 2", fullName: "Fase 2 - Estructuración" },
  { fase: 3, color: "#ffd43b", label: "Fase 3", fullName: "Fase 3 - Verificación y Formalización" },
  { fase: 4, color: "#74c0fc", label: "Fase 4", fullName: "Fase 4 - Radicación" },
  { fase: 5, color: "#a9e34b", label: "Fase 5", fullName: "Fase 5 - Evaluación" },
  { fase: 6, color: "#69db7c", label: "Fase 6", fullName: "Fase 6 - Plan de Mejoramiento" },
  {
    fase: 7,
    color: "#9775fa",
    label: "Contingencia",
    fullName: "Plan de contingencia (No renovación)",
  },
];

export const estadoColor: Record<string, string> = {
  "Completo":                        "#69db7c",
  "Inicio del proceso":              "#ffd43b",
  "Documentación de lectura de par": "#ffa94d",
  "Digitación en SACES":             "#f783ac",
  "Fecha Límite":                    "#ff6b6b",
};

/**
 * DEBT: RC usa «Nuevo» y AV usa «Primera vez» para el mismo concepto; el API/BD los guarda distinto
 * (ver Back_Miro/controllers/processes.js). Unificar criterio y migrar datos cuando toque.
 */
export const SUBTIPOS: Record<"RC" | "AV" | "PM", string[]> = {
  RC: ["Nuevo", "Renovación", "No renovación", "Renovación + reforma", "Reforma curricular"],
  AV: ["Primera vez", "Renovación"],
  PM: ["Autoevaluación Registro calificado", "Autoevaluación Acreditación"],
};

/** Texto corto en badges/tablas. El valor guardado en BD sigue siendo «Renovación + reforma». */
export function etiquetaSubtipoCompacta(subtipo: string): string {
  if (subtipo === "Renovación + reforma") return "Renovacion+Ref.";
  return subtipo;
}

const sortEs = (a: string, b: string) => a.localeCompare(b, "es");

/**
 * En el API: RC usa subtipo «Nuevo» y AV usa «Primera vez» (no son el mismo string).
 * Para el filtro con tipo «Todos», una sola opción agrupa ambos casos.
 */
export const SUBTIPO_FILTRO_PRIMERA_INSTANCIA = "Nuevo o Primera vez";

/** Valores del Select «Subtipo» (tablero y alertas): «Todos» + lista ordenada alfabéticamente (es). */
export function subtipoOpcionesFiltro(
  tipoProcesoUi: "Todos" | "Registro calificado" | "Acreditación voluntaria",
): string[] {
  if (tipoProcesoUi === "Registro calificado") {
    return ["Todos", ...[...SUBTIPOS.RC].sort(sortEs)];
  }
  if (tipoProcesoUi === "Acreditación voluntaria") {
    return ["Todos", ...[...SUBTIPOS.AV].sort(sortEs)];
  }
  const mezcla = [
    ...SUBTIPOS.RC.filter((s) => s !== "Nuevo"),
    ...SUBTIPOS.AV.filter((s) => s !== "Primera vez"),
  ];
  const u = [...new Set(mezcla)];
  u.push(SUBTIPO_FILTRO_PRIMERA_INSTANCIA);
  return ["Todos", ...u.sort(sortEs)];
}

/** Comprueba si el subtipo de un proceso RC/AV coincide con el filtro (incluye SUBTIPO_FILTRO_PRIMERA_INSTANCIA). */
export function procesoCumpleSubtipoFiltro(
  subtipo: string | null | undefined,
  tipoProceso: string,
  filtro: string,
  tipoFiltroUI: string,
): boolean {
  if (filtro === "Todos") return true;
  if (filtro === SUBTIPO_FILTRO_PRIMERA_INSTANCIA) {
    if (tipoFiltroUI === "Todos") {
      return (tipoProceso === "RC" && subtipo === "Nuevo") || (tipoProceso === "AV" && subtipo === "Primera vez");
    }
    if (tipoFiltroUI === "Registro calificado") return tipoProceso === "RC" && subtipo === "Nuevo";
    if (tipoFiltroUI === "Acreditación voluntaria") return tipoProceso === "AV" && subtipo === "Primera vez";
    return false;
  }
  return (subtipo ?? "") === filtro;
}

export const LABEL_PROCESO: Record<string, string> = {
  RC: "Registro calificado",
  AV: "Acreditación voluntaria",
  PM: "Plan de mejoramiento",
  ALERTA: "Alerta",
};

/** Periodicidad de admisión (programa académico) */
export const PERIODICIDAD_ADMISION = ["Anual", "Semestral", "Trimestral", "Bimensual", "Mensual"] as const;

export const COLOR_PROCESO: Record<string, string> = {
  RC: "#74c0fc",
  AV: "#b197fc",
  PM: "#8ce99a",
};

export const COLUMNAS_FECHA_RC_PM = [
  { key: "fecha_vencimiento",      obsKey: "obs_vencimiento",      label: "Fecha vencimiento",                    sub: "calculada con duración resolución" },
  { key: "fecha_inicio",           obsKey: "obs_inicio",           label: "Inicio proceso", sub: "" },
  { key: "fecha_documento_par",    obsKey: "obs_documento_par",    label: "Documento para lectura de vicerrectoría", sub: "" },
  { key: "fecha_digitacion_saces", obsKey: "obs_digitacion_saces", label: "Digitación en el SACES",             sub: "" },
  { key: "fecha_radicado_men",     obsKey: "obs_radicado_men",     label: "Fecha radicado en el MEN",           sub: "" },
] as const;

export const COLUMNAS_FECHA_AV = [
  { key: "fecha_vencimiento",      obsKey: "obs_vencimiento",      label: "Fecha vencimiento",                    sub: "calculada con años de vigencia" },
  { key: "fecha_inicio",           obsKey: "obs_inicio",           label: "Inicio proceso",                     sub: "" },
  { key: "fecha_documento_par",    obsKey: "obs_documento_par",    label: "Documento para lectura de vicerrectoría", sub: "" },
  { key: "fecha_digitacion_saces", obsKey: "obs_digitacion_saces", label: "Digitación en el SACES-CNA",         sub: "" },
  { key: "fecha_radicado_men",     obsKey: "obs_radicado_men",     label: "Radicación solicitud AV",            sub: "" },
] as const;

export const COLUMNAS_FECHA_PM = [
  { key: "fecha_envio_pm_vicerrectoria",     obsKey: "obs_envio_pm_vicerrectoria",     label: "Enviar a Vicerrectoría informe Plan de mejoramiento",         sub: "5 meses después de la resolución" },
  { key: "fecha_entrega_pm_cna",             obsKey: "obs_entrega_pm_cna",             label: "Entrega Plan de mejoramiento al CNA",                         sub: "6 meses después de la resolución" },
  { key: "fecha_envio_avance_vicerrectoria", obsKey: "obs_envio_avance_vicerrectoria", label: "Enviar a Vicerrectoría informe de avance Plan de mejoramiento", sub: "6 meses antes de la mitad de la vigencia" },
  { key: "fecha_radicacion_avance_cna",      obsKey: "obs_radicacion_avance_cna",      label: "Radicación ante CNA informe avance Plan de mejoramiento",     sub: "Mitad de la vigencia" },
] as const;

export const COLS_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const selectorStyle = {
  root: {
    backgroundColor: "var(--mantine-color-blue-light)",
    borderRadius: "10px",
    padding: "8px 10px 10px",
  },
  label: {
    color: "var(--mantine-color-blue-light-color)",
    fontWeight: 600 as const,
    textAlign: "center" as const,
    width: "100%",
    display: "block",
    marginBottom: "6px",
  },
  input: {
    backgroundColor: "white",
    border: "none",
    borderRadius: "6px",
    textAlign: "center" as const,
    color: "#333",
    caretColor: "transparent",
    cursor: "pointer",
  },
  option: {
    borderBottom: "1px solid #dee2e6",
    paddingTop: "8px",
    paddingBottom: "8px",
  },
};

/** Misma apariencia que `selectorStyle`, con un poco menos de padding horizontal (filas de filtros del tablero). */
export const selectorStyleFilters = {
  ...selectorStyle,
  root: {
    ...selectorStyle.root,
    padding: "7px 8px 9px",
  },
  label: {
    ...selectorStyle.label,
    marginBottom: 4,
  },
};
