import type { CasoFechaKey } from "./types";

export const faseColors = [
  { fase: 0, color: "#ced4da", label: "Fase 0", fullName: "Fase 0 - Apertura" },
  { fase: 1, color: "#ff6b6b", label: "Fase 1", fullName: "Fase 1 - Preparación" },
  { fase: 2, color: "#ffa94d", label: "Fase 2", fullName: "Fase 2 - Estructuración" },
  { fase: 3, color: "#ffd43b", label: "Fase 3", fullName: "Fase 3 - Verificación y Formalización" },
  { fase: 4, color: "#74c0fc", label: "Fase 4", fullName: "Fase 4 - Radicación" },
  { fase: 5, color: "#a9e34b", label: "Fase 5", fullName: "Fase 5 - Evaluación" },
  { fase: 7, color: "#20c997", label: "Contingencia", fullName: "Plan de contingencia (no renovación)" },
  { fase: 8, color: "#9775fa", label: "Plan de mejoramiento", fullName: "Plan de mejoramiento (fase 8 en flujo AV — tramo de PM)." },
];

/** Meta de fase por número guardado en BD (no indexar `faseColors[fase]`: el array no coincide con el número de fase). */
export function infoFasePorNumero(fase: number | null | undefined): (typeof faseColors)[number] | null {
  if (fase === null || fase === undefined) return null;
  return faseColors.find((c) => c.fase === fase) ?? null;
}

export const estadoColor: Record<string, string> = {
  "Completo":                        "#69db7c",
  "Inicio del proceso":              "#ffd43b",
  "Documentación de lectura de par": "#ffa94d",
  "Digitación en SACES":             "#f783ac",
  "Fecha Límite":                    "#ff6b6b",
};

export const SUBTIPOS: Record<"RC" | "AV" | "AE" | "PM", string[]> = {
  RC: ["Nuevo", "Renovación", "No renovación", "Renovación + reforma", "Reforma curricular", "Reactivación", "Registro calificado de oficio"],
  AV: ["Nuevo", "Renovación", "No renovación", "Reactivación"],
  AE: ["Autoevaluación"],
  PM: ["Plan de Mejoramiento AV", "Plan de Mejoramiento AE"],
};

/** Valor persistido en BD/API: `Reforma curricular`. Texto solo para UI en selects y textos de una línea. */
export const SUBTIPO_MODIFICACION_REFORMA_LABEL = "Modificación";

/** Texto compacto en badges/tablas (una sola línea, al lado de RC/AV). */
export const SUBTIPO_MODIFICACION_REFORMA_BADGE = "Modificación";

/** Estilos de Badge/Text cuando el subtipo es largo (sin truncar con puntos suspensivos). */
export const stylesSubtipoLargo = {
  root: {
    maxWidth: "8.25rem",
    minWidth: 0,
    height: "auto",
    whiteSpace: "normal" as const,
  },
  label: {
    textTransform: "none" as const,
    whiteSpace: "pre-line" as const,
    lineHeight: 1.25,
    wordBreak: "break-word" as const,
    textAlign: "center" as const,
  },
};

/** Subtipo en celdas de tabla: ancho máximo razonable; la columna «Tipo» define el hueco real (colgroup). */
export const stylesSubtipoTabla = {
  ...stylesSubtipoLargo,
  root: {
    ...stylesSubtipoLargo.root,
    maxWidth: "9.5rem",
    minWidth: "3.25rem",
    overflow: "visible" as const,
  },
  label: {
    ...stylesSubtipoLargo.label,
    overflow: "visible" as const,
    wordBreak: "normal" as const,
    overflowWrap: "break-word" as const,
  },
};

/** Subtipo en una línea (Nuevo, Renovacion+Mod./Reforma, etc.) — al lado del badge RC/AV sin salto de fila. */
export const stylesSubtipoTablaUnaLinea = {
  root: {
    maxWidth: "none",
    height: "auto",
    flexShrink: 0,
  },
  label: {
    textTransform: "none" as const,
    whiteSpace: "nowrap" as const,
    lineHeight: 1.25,
    fontSize: 11,
  },
};

/** Estilos de subtipo en tablas de alertas/historial: siempre una línea horizontal. */
export function stylesSubtipoBadgeTabla(_subtipo?: string | null) {
  return stylesSubtipoTablaUnaLinea;
}

/** Select Mantine: `value` = clave en BD; `label` = texto mostrado. */
export function subtipoOpcionesConEtiquetas(opciones: string[]): { value: string; label: string }[] {
  return opciones.map((v) => ({
    value: v,
    label:
      v === "Reforma curricular"
        ? SUBTIPO_MODIFICACION_REFORMA_LABEL
        : v === "Renovación + reforma"
          ? "Renovación + modificación"
          : v,
  }));
}

/** Texto corto en badges/tablas. El valor guardado en BD sigue siendo «Renovación + reforma». */
export function etiquetaSubtipoCompacta(subtipo: string): string {
  if (subtipo === "Vigencia transitoria") return "Vigencia transitoria (archivo)";
  if (subtipo === "Renovación + reforma") return "Renovación + mod.";
  if (subtipo === "Registro calificado de oficio") return "RC de oficio";
  if (subtipo === "Reactivación") return "Reactivación";
  if (subtipo === "Reforma curricular") return SUBTIPO_MODIFICACION_REFORMA_BADGE;
  /** Procesos viejos con «Primera vez»; se muestra como «Nuevo» (mismo criterio que RC). */
  if (subtipo === "Primera vez") return "Nuevo";
  return subtipo;
}

const sortEs = (a: string, b: string) => a.localeCompare(b, "es");

/**
 * Misma idea que en RC: acreditación «Nuevo» = primera instancia. El filtro «Nuevo» con tipo «Todos» agrupa RC+AV.
 * Procesos antiguos con subtipo almacenado «Primera vez» siguen emparejando con el filtro.
 */
export const SUBTIPO_FILTRO_PRIMERA_INSTANCIA = "Nuevo";

/** Valores del Select «Subtipo» (tablero y alertas): «Todos» + lista ordenada alfabéticamente (es). */
export function subtipoOpcionesFiltro(
  tipoProcesoUi: "Todos" | "Registro calificado" | "Acreditación voluntaria" | "Autoevaluación",
): string[] {
  if (tipoProcesoUi === "Registro calificado") {
    return ["Todos", ...[...SUBTIPOS.RC].sort(sortEs)];
  }
  if (tipoProcesoUi === "Acreditación voluntaria") {
    return ["Todos", ...[...SUBTIPOS.AV].sort(sortEs)];
  }
  if (tipoProcesoUi === "Autoevaluación") {
    return ["Todos", ...[...SUBTIPOS.AE].sort(sortEs)];
  }
  const mezcla = [
    ...SUBTIPOS.RC.filter((s) => s !== "Nuevo"),
    ...SUBTIPOS.AV.filter((s) => s !== "Nuevo"),
    ...SUBTIPOS.AE,
  ];
  const u = [...new Set(mezcla)];
  u.push("Nuevo");
  return ["Todos", ...u.sort(sortEs)];
}

/** Comprueba si el subtipo de un proceso RC/AV coincide con el filtro. */
export function procesoCumpleSubtipoFiltro(
  subtipo: string | null | undefined,
  tipoProceso: string,
  filtro: string,
  tipoFiltroUI: string,
): boolean {
  if (filtro === "Todos") return true;
  if (filtro === "Nuevo" && tipoFiltroUI === "Todos") {
    return (tipoProceso === "RC" && subtipo === "Nuevo")
      || (tipoProceso === "AV" && (subtipo === "Nuevo" || subtipo === "Primera vez"));
  }
  if (filtro === "Nuevo" && tipoFiltroUI === "Registro calificado") {
    return tipoProceso === "RC" && subtipo === "Nuevo";
  }
  if (filtro === "Nuevo" && tipoFiltroUI === "Acreditación voluntaria") {
    return tipoProceso === "AV" && (subtipo === "Nuevo" || subtipo === "Primera vez");
  }
  if (filtro === "Nuevo o Primera vez" && tipoFiltroUI === "Todos") {
    return (tipoProceso === "RC" && subtipo === "Nuevo")
      || (tipoProceso === "AV" && (subtipo === "Nuevo" || subtipo === "Primera vez"));
  }
  return (subtipo ?? "") === filtro;
}

export const LABEL_PROCESO: Record<string, string> = {
  RC: "Registro calificado",
  AV: "Acreditación voluntaria",
  AE: "Autoevaluación",
  PM: "Plan de mejoramiento",
  ALERTA: "Alerta",
};

/** Periodicidad de admisión (programa académico) */
export const PERIODICIDAD_ADMISION = ["Anual", "Semestral", "Trimestral", "Bimensual", "Mensual"] as const;

export const COLOR_PROCESO: Record<string, string> = {
  RC: "#74c0fc",
  AV: "#b197fc",
  AE: "#8ce99a",
  PM: "#9775fa",
};

/**
 * Colores de fondo (fila completa) para la tabla de alertas.
 * RC=azul claro, AV=morado claro, PM=morado oscuro, AE=verde claro.
 * Las filas ALERTA usan el mismo fondo que `alert_para_tipo` (RC/AV/PM/AE); ya no hay naranja fijo.
 */
export const ROW_BG_PROCESO: Record<string, string> = {
  RC:     "#e8f4fd",
  AV:     "#f3e8ff",
  PM:     "#d8b4fe33",  // morado más marcado pero suave
  AE:     "#dcfce7",
  /** @deprecated Reservado por compatibilidad; el tablero ya no pinta alertas con este color. */
  ALERTA: "#fff3cd",
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

/** Etiquetas de columnas en «Información del caso». */
export const CASO_FECHA_LABELS: Record<CasoFechaKey, string> = {
  fecha_solicitud_radicado: "Solicitud de radicado",
  fecha_notificacion_completitud: "Notificación de completitud",
  fecha_respuesta_completitud: "Respuesta de completitud",
  fecha_resolucion: "Acto administrativo MEN",
  fecha_resolucion_apelacion: "Recurso de reposición radicado",
  fecha_respuesta_men: "Recurso reposición respuesta MEN",
};

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

/** Base de filtros (solo depende de `selectorStyle`); evita TDZ si alguien reordena exports respecto a `selectorStyleFiltersSubtipo`. */
const selectorStyleFiltersShared = {
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

/** Misma apariencia que `selectorStyle`, con un poco menos de padding horizontal (filas de filtros del tablero). */
export const selectorStyleFilters = selectorStyleFiltersShared;

/** Fila de filtros: subtipo con etiqueta larga — el input cerrado usa elipsis; las opciones del menú pueden partirse en varias líneas. */
export const selectorStyleFiltersSubtipo = {
  ...selectorStyleFiltersShared,
  root: {
    ...selectorStyleFiltersShared.root,
    minWidth: 0,
    flexShrink: 1,
  },
  input: {
    ...selectorStyle.input,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  option: {
    ...selectorStyle.option,
    whiteSpace: "normal",
    wordBreak: "break-word",
  },
} as const;

/** Condiciones de calidad — Registro Calificado (RC) */
export const CONDICIONES_RC = [
  { value: "1", label: "Condición 1. Denominación del programa." },
  { value: "2", label: "Condición 2. Justificación del programa." },
  { value: "3", label: "Condición 3. Aspectos curriculares." },
  { value: "4", label: "Condición 4. Organización de actividades académicas y proceso formativo." },
  { value: "5", label: "Condición 5. Investigación, innovación y/o creación artística y cultural." },
  { value: "6", label: "Condición 6. Relación con el sector externo." },
  { value: "7", label: "Condición 7. Profesores." },
  { value: "8", label: "Condición 8. Medios educativos." },
  { value: "9", label: "Condición 9. Infraestructura física y tecnológica." },
];

/** Factores de calidad — Acreditación Voluntaria (AV) */
export const FACTORES_AV = [
  { value: "1",  label: "Factor 1. Proyecto educativo del programa e identidad institucional." },
  { value: "2",  label: "Factor 2. Comunidad de estudiantes." },
  { value: "3",  label: "Factor 3. Comunidad de profesores." },
  { value: "4",  label: "Factor 4. Comunidad de egresados." },
  { value: "5",  label: "Factor 5. Aspectos académicos y evaluación." },
  { value: "6",  label: "Factor 6. Permanencia y graduación." },
  { value: "7",  label: "Factor 7. Proyección e interacción con el entorno." },
  { value: "8",  label: "Factor 8. Aportes de la investigación, la innovación, el desarrollo tecnológico, la creación e investigación-creación artística y cultural, asociados al programa académico." },
  { value: "9",  label: "Factor 9. Bienestar de la comunidad académica del programa." },
  { value: "10", label: "Factor 10. Recursos físicos, tecnológicos, medios educativos y ambientes de aprendizaje." },
  { value: "11", label: "Factor 11. Organización, administración y financiación del programa académico." },
  { value: "12", label: "Factor 12. Aseguramiento de la alta calidad del programa." },
];
