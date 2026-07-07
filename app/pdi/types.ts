export type Semaforo = "verde" | "amarillo" | "rojo";

export interface PdiConfig {
  nombre: string;
  descripcion: string;
  anio_inicio: number;
  anio_fin: number;
  lema: string;
  anios: number[]; // array derivado [anio_inicio ... anio_fin]
  num_macroproyectos: number;
  proyectos_por_macro: number;
  acciones_por_proyecto: number;
  indicadores_por_accion: number;
}

export interface Macroproyecto {
  _id: string;
  codigo: string;
  nombre: string;
  lider?: string;
  lider_email?: string;
  lideres?: Array<{ nombre: string; email: string }>;
  num_proyectos?: number;
  peso: number;
  avance: number;
  semaforo: Semaforo;
  presupuesto: number;
  presupuesto_ejecutado: number;
}

export type EstadoAval = "Pendiente" | "Aprobado" | "Rechazado";

export interface RespuestaCampo {
  _id?: string;
  campo_id: string;
  etiqueta: string;
  tipo: string;
  valor_texto: string;
  nombre_original: string;
  filename: string;
  url: string;
  comentario_lider?: string;
  comentario_lider_resuelto?: boolean;
}

export interface DocumentoEvidenciaFormulario {
  _id?: string;
  nombre_original?: string;
  filename?: string;
  url?: string;
  mimetype?: string;
  size?: number;
}

export interface RespuestaFormulario {
  _id: string;
  formulario_id: string | { _id: string; nombre: string; campos: any[] };
  indicador_id: string | { _id: string; codigo: string; nombre: string } | null;
  respondido_por: string;
  corte: string;
  respuestas: RespuestaCampo[];
  estado: "Borrador" | "Enviado";
  fecha_envio: string | null;
  word_filename: string;
  word_url: string;
  word_nombre_original: string;
  documento_filename: string;
  documento_url: string;
  documento_nombre_original: string;
  documento_mimetype: string;
  documento_size?: number;
  documentos?: DocumentoEvidenciaFormulario[];
  estado_aval_proyecto?: EstadoAval | null;
  proyecto_email_aval?: string;
  aval_proyecto_por?: string;
  aval_proyecto_comentario?: string;
  aval_proyecto_razones?: string[];
  aval_proyecto_otro_cual?: string;
  aval_proyecto_fecha?: string | null;
  estado_aval: EstadoAval | null;
  lider_email_aval: string;
  aval_por: string;
  aval_comentario: string;
  aval_razones?: string[];
  aval_otro_cual?: string;
  aval_fecha: string | null;
  aval_planeacion?: "Pendiente" | "Validado" | "Devuelto" | null;
  aval_planeacion_por?: string;
  aval_planeacion_comentario?: string;
  aval_planeacion_fecha?: string | null;
  createdAt: string;
}

export interface Proyecto {
  _id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  proposito?: string;
  num_acciones?: number;
  peso: number;
  avance: number;
  semaforo: Semaforo;
  formulador: string;
  responsable: string;
  responsable_email: string;
  responsables?: Array<{ nombre: string; email: string }>;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presupuesto: number;
  presupuesto_ejecutado: number;
  macroproyecto_id: { _id: string; codigo: string; nombre: string };
}

export interface PresupuestoProyectoImportado {
  _id?: string;
  codigo: string;
  nombre?: string;
  presupuesto: number;
  acciones_importadas: number;
  acciones_actualizadas?: number;
}

export interface PresupuestoAccionImportada {
  _id?: string;
  codigo?: string;
  codigo_accion?: string;
  codigo_proyecto?: string;
  nombre?: string;
  nombre_accion?: string;
  fila?: number;
  proyecto_codigo?: string;
  presupuesto: number;
}

export interface ImportBudgetResponse {
  archivo: string;
  hoja: string;
  proyecto_excel: string | null;
  filas_leidas: number;
  acciones_detectadas: number;
  acciones_actualizadas: number;
  proyectos_detectados: number;
  proyectos_actualizados: number;
  proyectos_no_encontrados: number;
  totales_importados: {
    presupuesto: number;
  };
  actualizados: PresupuestoProyectoImportado[];
  acciones: PresupuestoAccionImportada[];
  acciones_actualizadas_detalle: PresupuestoAccionImportada[];
  no_encontrados: PresupuestoProyectoImportado[];
  criterio: {
    presupuesto: string;
  };
  observacion?: string;
}

export interface EjecutadoProyectoImportado {
  _id?: string;
  codigo: string;
  nombre?: string;
  presupuesto_ejecutado: number;
  acciones_importadas: number;
  acciones_actualizadas?: number;
}

export interface EjecutadoAccionImportada {
  _id?: string;
  codigo?: string;
  codigo_accion?: string;
  codigo_proyecto?: string;
  nombre?: string;
  nombre_accion?: string;
  nombre_proyecto?: string;
  fila?: number;
  fila_excel?: number;
  proyecto_codigo?: string;
  tipo?: "gasto" | "inversion" | "mixto" | "general";
  gasto?: number;
  inversion?: number;
  presupuesto_ejecutado: number;
  fecha_pago?: string;
  observacion?: string;
}

export interface ImportExecutedResponse {
  archivo: string;
  hoja: string;
  proyecto_excel: string | null;
  macro_detectado?: { _id: string; codigo: string; nombre: string };
  filas_leidas: number;
  acciones_detectadas: number;
  acciones_actualizadas: number;
  proyectos_detectados: number;
  proyectos_actualizados: number;
  proyectos_no_encontrados: number;
  totales_importados: {
    presupuesto_ejecutado: number;
    gasto?: number;
    inversion?: number;
  };
  actualizados: EjecutadoProyectoImportado[];
  acciones: EjecutadoAccionImportada[];
  acciones_actualizadas_detalle: EjecutadoAccionImportada[];
  no_encontrados: {
    proyectos: EjecutadoProyectoImportado[];
    acciones: EjecutadoAccionImportada[];
  };
  criterio: {
    presupuesto_ejecutado: string;
  };
  observacion?: string;
}

export interface Accion {
  _id: string;
  codigo: string;
  nombre: string;
  alcance: string;
  responsable: string;
  responsable_email: string;
  responsables?: Array<{ nombre: string; email: string }>;
  num_indicadores?: number;
  peso: number;
  avance: number;
  semaforo: Semaforo;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presupuesto: number;
  presupuesto_ejecutado: number;
  fecha_pago?: string;
  gasto: number;
  inversion: number;
  presupuesto_por_anio?: Record<string, number>;
  presupuesto_ejecutado_por_anio?: Record<string, number>;
  proyecto_id: { _id: string; codigo: string; nombre: string };
}

export type EstadoReporte = "Borrador" | "Enviado" | "Aprobado" | "Rechazado" | "Validado";

export interface Periodo {
  periodo: string;
  meta: number | string | null;
  avance: number | string | null;
  presupuesto_ejecutado: number;
  // Campos cualitativos del reporte de avance por corte
  resultados_alcanzados: string;
  logros: string;
  alertas: string;
  justificacion_retrasos: string;
  estado_reporte: EstadoReporte;
  fecha_envio: string | null;
  reportado_por: string;
}

export interface Evidencia {
  _id: string;
  nombre_original: string;
  filename: string;
  url: string;
  subido_por: string;
  periodo: string;
  descripcion: string;
  fecha_subida: string;
  estado: "En Revisión" | "Aprobado" | "Rechazado";
  comentario_revision: string;
}

export interface Indicador {
  _id: string;
  codigo: string;
  nombre: string;
  indicador_resultado: string;
  peso: number;
  avance: number;
  semaforo: Semaforo;
  tipo_seguimiento: string;
  fecha_seguimiento: string;
  tipo_calculo: string;
  meta_final_2029: number | string | null;
  entregable: string;
  presupuesto: number;
  presupuesto_ejecutado: number;
  responsable: string;
  responsable_email: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  observaciones: string;
  periodos: Periodo[];
  avances_por_anio: Record<string, number>;
  avance_total_real: number | null;
  accion_id: { _id: string; codigo: string; nombre: string };
  evidencias: Evidencia[];
}

// ── Solicitud de cambio ────────────────────────────────────────────────────

export type TipoCambio = "alcance" | "meta" | "cronograma" | "presupuesto" | "responsable" | "otro";
export type TipoEntidad = "macroproyecto" | "proyecto" | "accion" | "indicador";
export type EstadoCambio = "Pendiente" | "En Revisión" | "Aprobado" | "Rechazado";

export interface SolicitudCambio {
  _id: string;
  entidad_tipo: TipoEntidad;
  entidad_id: string;
  entidad_codigo: string;
  entidad_nombre: string;
  tipo_cambio: TipoCambio;
  descripcion: string;
  justificacion: string;
  valor_anterior: unknown;
  valor_propuesto: unknown;
  campo_afectado: string;
  estado: EstadoCambio;
  solicitado_por: string;
  solicitado_email: string;
  revisado_por: string;
  revisado_email: string;
  comentario_revision: string;
  fecha_solicitud: string;
  fecha_revision: string | null;
  periodo: string;
  createdAt: string;
}

// ── Dashboard / Tablero de control ────────────────────────────────────────

export interface ConteoSemaforos {
  verde: number;
  amarillo: number;
  rojo: number;
}

export interface DashboardResumen {
  avance_global: number;
  semaforo_global: Semaforo;
  avances_por_nivel: {
    macroproyectos: number;
    proyectos: number;
    acciones: number;
    indicadores: number;
  };
  estructura: {
    macroproyectos: number;
    proyectos: number;
    acciones: number;
    indicadores: number;
  };
  semaforos: {
    macroproyectos: ConteoSemaforos;
    proyectos: ConteoSemaforos;
    acciones: ConteoSemaforos;
    indicadores: ConteoSemaforos;
  };
  presupuesto: {
    total: number;
    ejecutado: number;
    porcentaje_ejecucion: number;
  };
  alertas: {
    indicadores_con_alertas: number;
    detalle: {
      _id: string;
      codigo: string;
      nombre: string;
      avance: number;
      semaforo: Semaforo;
      alertas: { periodo: string; alertas: string }[];
    }[];
  };
  retrasos: {
    indicadores_con_retrasos: number;
  };
}

export interface DashboardMacroproyecto {
  macroproyecto: Macroproyecto;
  avances_por_nivel: {
    macroproyecto: number;
    proyectos: number;
    acciones: number;
    indicadores: number;
  };
  estructura: {
    proyectos: number;
    acciones: number;
    indicadores: number;
  };
  semaforos: {
    proyectos: ConteoSemaforos;
    acciones: ConteoSemaforos;
    indicadores: ConteoSemaforos;
  };
  avances_por_anio: Record<string, number>;
  presupuesto: {
    total: number;
    ejecutado: number;
    porcentaje_ejecucion: number;
  };
  proyectos: {
    _id: string;
    codigo: string;
    nombre: string;
    avance: number;
    semaforo: Semaforo;
    presupuesto: number;
    presupuesto_ejecutado: number;
  }[];
}

export interface DashboardCorte {
  periodo: string;
  total_indicadores: number;
  con_reporte: number;
  sin_reporte: number;
  porcentaje_cobertura: number;
  estados_reporte: Record<EstadoReporte, number>;
  semaforos: ConteoSemaforos;
  con_alertas: number;
  con_retrasos: number;
  indicadores_reportados: {
    _id: string;
    codigo: string;
    nombre: string;
    responsable: string;
    responsable_email: string;
    avance: number | null;
    meta: number | string | null;
    semaforo: Semaforo;
    estado_reporte: EstadoReporte;
    fecha_envio: string | null;
    tiene_alertas: boolean;
    tiene_retrasos: boolean;
    resultados_alcanzados: string;
    logros: string;
    alertas: string;
    justificacion_retrasos: string;
  }[];
  indicadores_pendientes: {
    _id: string;
    codigo: string;
    nombre: string;
    meta: number | string | null;
    responsable: string;
    responsable_email: string;
  }[];
}

export type PdiNodeIntensity = "Baja" | "Media" | "Alta";

export interface PdiNetworkNode {
  id: string;
  codigo: string;
  nombre: string;
  macro_codigo: string;
  macro_nombre: string;
  puntaje_total: number;
  nivel_articulacion: string;
  prioridad_gestion: string;
  relaciones_salientes: number;
  relaciones_entrantes: number;
  total_relaciones: number;
  puntaje_saliente: number;
  puntaje_entrante: number;
  x?: number;
  y?: number;
}

export interface PdiNetworkEdge {
  id: string;
  origen: string;
  destino: string;
  tipo_relacion: string;
  intensidad: PdiNodeIntensity;
  puntaje: 1 | 3 | 5 | number;
  justificacion?: string;
  recomendacion?: string;
}

export interface PdiNetworkResponse {
  nodes: PdiNetworkNode[];
  edges: PdiNetworkEdge[];
  summary: {
    total_nodos: number;
    total_conexiones: number;
    por_intensidad: Record<string, number>;
    por_tipo: Record<string, number>;
    macroproyectos: {
      codigo: string;
      nombre: string;
      nodos: number;
      conexiones: number;
    }[];
  };
  catalogos: {
    intensidades: PdiNodeIntensity[];
    puntajes: number[];
    tipos_relacion: string[];
  };
  source: {
    type: "excel" | "override" | string;
    name: string;
    saved_at?: string | null;
    path?: string;
  };
}
