export type Semaforo = "verde" | "amarillo" | "rojo";

export interface PdiConfig {
  nombre: string;
  descripcion: string;
  anio_inicio: number;
  anio_fin: number;
  lema: string;
  anios: number[]; // array derivado [anio_inicio ... anio_fin]
}

export interface Macroproyecto {
  _id: string;
  codigo: string;
  nombre: string;
  lider?: string;
  lider_email?: string;
  peso: number;
  avance: number;
  semaforo: Semaforo;
  presupuesto: number;
  presupuesto_ejecutado: number;
}

export type EstadoAval = "Pendiente" | "Aprobado" | "Rechazado";

export interface RespuestaCampo {
  campo_id: string;
  etiqueta: string;
  tipo: string;
  valor_texto: string;
  nombre_original: string;
  filename: string;
  url: string;
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
  estado_aval: EstadoAval | null;
  lider_email_aval: string;
  aval_por: string;
  aval_comentario: string;
  aval_fecha: string | null;
  createdAt: string;
}

export interface Proyecto {
  _id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  proposito?: string;
  peso: number;
  avance: number;
  semaforo: Semaforo;
  formulador: string;
  responsable: string;
  responsable_email: string;
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
  fila?: number;
  proyecto_codigo?: string;
  presupuesto_ejecutado: number;
}

export interface ImportExecutedResponse {
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
    presupuesto_ejecutado: number;
  };
  actualizados: EjecutadoProyectoImportado[];
  acciones: EjecutadoAccionImportada[];
  acciones_actualizadas_detalle: EjecutadoAccionImportada[];
  no_encontrados: EjecutadoProyectoImportado[];
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
  peso: number;
  avance: number;
  semaforo: Semaforo;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presupuesto: number;
  presupuesto_ejecutado: number;
  proyecto_id: { _id: string; codigo: string; nombre: string };
}

export type EstadoReporte = "Borrador" | "Enviado" | "Aprobado" | "Rechazado";

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
    responsable: string;
    responsable_email: string;
  }[];
}
