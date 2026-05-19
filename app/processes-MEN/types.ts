export type Dependency = {
  _id: string;
  dep_code: string;
  name: string;
  dep_father: string | null;
};

export type UltimoProcesoPrograma = {
  codigo_resolucion:   string | null;
  fecha_resolucion:    string | null;
  duracion_resolucion: number | null;
  fecha_vencimiento:   string | null;
  link_documento:      string | null;
};

export type CineF = {
  campo_amplio:     string | null;
  campo_especifico: string | null;
  campo_detallado:  string | null;
};

export type Nbc = {
  area_conocimiento: string | null;
  nbc:               string | null;
};

export type Program = {
  /** Clave técnica (MongoDB). No debe mostrarse como “código del programa”. */
  _id: string;
  nombre: string;
  dep_code_facultad: string;
  /** Código del programa cargado por la dependencia (negocio). Distinto de SNIES y de `_id`. */
  dep_code_programa: string | null;
  codigo_snies: string | null;
  modalidad: string | null;
  nivel_academico: string | null;
  nivel_formacion: string | null;
  num_creditos: number | null;
  num_semestres: number | null;
  admision_estudiantes?: string | null;
  num_estudiantes_saces?: number | null;
  estado: string;
  // Clasificaciones
  cine_f?: CineF | null;
  nbc?: Nbc | null;
  // Último proceso vigente
  ultimo_rc?: UltimoProcesoPrograma | null;
  ultimo_av?: UltimoProcesoPrograma | null;
  // Vigencia (actualizada por cron diario)
  tiene_rc_vigente?: boolean;
  tiene_av_vigente?: boolean;
  /** Cierre AV con RC de oficio aún no entregado: el sistema mantiene el RC como vigente en ficha hasta registrar el oficio. */
  av_rc_oficio_pendiente?: boolean;
  // Totales históricos
  total_rc?: number;
  total_av?: number;
  // Legacy (compatibilidad)
  fecha_resolucion_rc: string | null;
  codigo_resolucion_rc: string | null;
  duracion_resolucion_rc: number | null;
  fecha_resolucion_av: string | null;
  codigo_resolucion_av: string | null;
  duracion_resolucion_av: number | null;
};

export type Process = {
  _id: string;
  name: string;
  /**
   * Enlace al programa: **`_id` Mongo** (canónico). En datos antiguos puede coincidir con un `dep_code_programa` vigente al migrar.
   */
  program_code: string;
  tipo_proceso: "RC" | "AV" | "AE" | "PM" | "ALERTA";
  subtipo?: string | null;
  /** Solo AV: legado; la decisión de RC de oficio es al cerrar en el modal de cierre. */
  av_espera_rc_oficio?: boolean;
  alert_para_tipo?: "RC" | "AV" | "AE" | "PM" | null;
  cerrado_process_history_id?: string | null;
  snapshot_codigo_resolucion?: string | null;
  snapshot_fecha_resolucion?: string | null;
  snapshot_duracion_anos?: number | null;
  parent_process_id?: string | null;
  parent_tipo_proceso?: "RC" | "AV" | "AE" | null;
  /** Solo AE: referencia informativa al proceso RC/AV al que está vinculado */
  linked_process_id?: string | null;
  linked_process_tipo?: "RC" | "AV" | null;
  fase_actual: number;
  observaciones: string;
  condicion: number | null;
  factor_condicion_actual: number | null;
  fecha_vencimiento: string | null;
  fecha_inicio: string | null;
  fecha_documento_par: string | null;
  fecha_digitacion_saces: string | null;
  fecha_radicado_men: string | null;
  obs_vencimiento: string;
  obs_inicio: string;
  obs_documento_par: string;
  obs_digitacion_saces: string;
  obs_radicado_men: string;
  obs_envio_pm_vicerrectoria: string;
  obs_entrega_pm_cna: string;
  obs_envio_avance_vicerrectoria: string;
  obs_radicacion_avance_cna: string;
  meses_inicio_antes_venc?: number | null;
  meses_doc_par_antes_venc?: number | null;
  meses_digitacion_antes_venc?: number | null;
  meses_radicado_antes_venc?: number | null;
  fecha_envio_pm_vicerrectoria?: string | null;
  fecha_entrega_pm_cna?: string | null;
  fecha_envio_avance_vicerrectoria?: string | null;
  fecha_radicacion_avance_cna?: string | null;
  // Etiquetas personalizables de las fechas del PM (para RC)
  label_envio_pm_vicerrectoria?: string | null;
  label_entrega_pm_cna?: string | null;
  label_envio_avance_vicerrectoria?: string | null;
  label_radicacion_avance_cna?: string | null;
  // Meses de cálculo guardados
  meses_envio_pm?: number | null;
  meses_entrega_pm_cna?: number | null;
  meses_envio_avance?: number | null;
  meses_radicacion_avance?: number | null;
  /** RC de oficio tras vigencia de gracia (cierre AV pendiente de oficio). */
  rc_oficio_contexto?: "post_av_gracia" | null;
  rc_gracia_vigente_snapshot?: UltimoProcesoPrograma | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProcessDocument = {
  _id: string;
  phase_id: string | null;
  process_id?: string | null;
  actividad_id?: string | null;
  subactividad_id?: string | null;
  doc_type?: "resolucion" | "resolucion_cierre" | "resolucion_rc_oficio" | "constancia_reforma" | "respuesta_no_renovacion" | "proceso";
  /** Campo de fecha del caso al que pertenecen (información del caso) */
  caso_date_key?: string | null;
  name: string;
  drive_id: string;
  view_link: string;
  download_link: string;
  mime_type?: string | null;
  size?: number | null;
  createdAt?: string;
};

export type Subactividad = {
  _id: string;
  nombre: string;
  completada: boolean;
  no_aplica?: boolean;
  fecha_completado: string | null;
  observaciones: string;
  grupo?: string | null;
};

export type Actividad = {
  _id: string;
  nombre: string;
  responsables: string;
  completada: boolean;
  no_aplica?: boolean;
  acto_admin_modo?: string | null;
  fecha_completado: string | null;
  observaciones: string;
  subactividades: Subactividad[];
};

/** Campos de fecha en «Información del caso» (observaciones: obs_<clave>) */
export type CasoFechaKey =
  | "fecha_solicitud_radicado"
  | "fecha_notificacion_completitud"
  | "fecha_respuesta_completitud"
  | "fecha_resolucion"
  | "fecha_resolucion_apelacion"
  | "fecha_respuesta_men";

/** Caso archivado en historial (sin _id ni proceso_id). */
export type CasoSnapshotHistorial = {
  codigo_caso: string | null;
  fecha_solicitud_radicado: string | null;
  fecha_notificacion_completitud: string | null;
  fecha_respuesta_completitud: string | null;
  fecha_resolucion: string | null;
  resolucion_aprobada: boolean | null;
  aplica_apelacion?: boolean;
  fecha_resolucion_apelacion?: string | null;
  fecha_respuesta_men?: string | null;
  obs_fecha_solicitud_radicado?: string;
  obs_fecha_notificacion_completitud?: string;
  obs_fecha_respuesta_completitud?: string;
  obs_fecha_resolucion?: string;
  obs_fecha_resolucion_apelacion?: string;
  obs_fecha_respuesta_men?: string;
  documentos_por_fecha?: Record<
    string,
    Array<{ name: string; view_link: string; subido_en?: string | null }>
  >;
};

export type Caso = {
  _id: string;
  proceso_id: string;
  codigo_caso: string | null;
  fecha_solicitud_radicado: string | null;
  fecha_notificacion_completitud: string | null;
  fecha_respuesta_completitud: string | null;
  fecha_resolucion: string | null;
  resolucion_aprobada: boolean | null;
  aplica_apelacion?: boolean;
  fecha_resolucion_apelacion?: string | null;
  fecha_respuesta_men?: string | null;
  obs_fecha_solicitud_radicado?: string;
  obs_fecha_notificacion_completitud?: string;
  obs_fecha_respuesta_completitud?: string;
  obs_fecha_resolucion?: string;
  obs_fecha_resolucion_apelacion?: string;
  obs_fecha_respuesta_men?: string;
};

export type Phase = {
  _id: string;
  proceso_id: string;
  numero: number;
  nombre: string;
  actividades: Actividad[];
};

export type BarRow = {
  nombre: string;
  /** Código de facultad para filtrar programas al hacer clic en un segmento */
  dep_code: string;
  fase_0: number; fase_1: number; fase_2: number;
  fase_3: number; fase_4: number; fase_5: number; fase_6: number;
  /** Procesos en fase 7 (no renovación / plan de contingencia permanente); se dibuja al final de la barra */
  fase_contingencia: number;
  /** Programas con Plan de Mejoramiento activo (solo AV) */
  fase_pm: number;
};

export type ProcesoRow = {
  programa: Program;
  acreditacion: number | null;
  registro: number | null;
  pmFase: number | null;
  pmLigadoA: string | null;
  pmSubtipo: string | null;
  /** Actividad actual (texto breve) bajo la fase RC */
  actividadRc?: string | null;
  /** Actividad actual bajo la fase AV */
  actividadAv?: string | null;
};

export type ProcesoDetalleProps = {
  proceso: Process;
  programa: Program;
  fases: Phase[];
  onUpdateProceso: (updated: Process) => void;
  onUpdateFases: (updated: Phase[]) => void;
  onUpdatePrograma: (updated: Program) => void;
  onRefreshProcesos: (programCode: string) => Promise<void>;
  /** Lista completa de programas (gestión) para validar duplicado de código institucional al abrir cierre de reforma. */
  todosProgramas?: Program[];
};

export type PQR = {
  _id: string;
  nombre_solicitud: string;
  programa_id?: string | null;
  fecha_radicacion?: string | null;
  hora?: string | null;
  numero_radicado?: string | null;
  medio_realizado?: string | null;
  fecha_respuesta?: string | null;
  observacion_respuesta?: string | null;
  /** Documento de identidad de quien atiende o gestiona el PQR. */
  cedula_encargado?: string | null;
  cerrado: boolean;
  createdAt?: string;
  updatedAt?: string;
};

/** Fechas proyectadas al cerrar un proceso (para notificaciones por correo). */
export type ProcessReminderRecord = {
  _id: string;
  process_history_id: string | null;
  program_code: string;
  dep_code_facultad: string | null;
  nombre_programa: string;
  nivel_academico: string | null;
  tipo_proceso: "RC" | "AV" | "AE" | "PM";
  /** Subtipo del proceso ALERTA (si aplica); legacy puede venir sin valor. */
  subtipo?: string | null;
  codigo_resolucion: string | null;
  fecha_resolucion: string | null;
  duracion_resolucion: number | null;
  fecha_vencimiento: string | null;
  fecha_inicio: string | null;
  fecha_documento_par: string | null;
  fecha_digitacion_saces: string | null;
  fecha_radicado_men: string | null;
  /** Campos originales del PM (cuando tipo_proceso === "PM") */
  fecha_envio_pm_vicerrectoria?: string | null;
  fecha_entrega_pm_cna?: string | null;
  fecha_envio_avance_vicerrectoria?: string | null;
  fecha_radicacion_avance_cna?: string | null;
  parent_process_id?: string | null;
  documentos: Array<{ name: string; view_link: string }>;
  createdAt?: string;
  updatedAt?: string;
  __origen?: "ALERTA" | "legacy";
  /** Observaciones congeladas al cierre (alerta) */
  obs_vencimiento?: string | null;
  obs_inicio?: string | null;
  obs_documento_par?: string | null;
  obs_digitacion_saces?: string | null;
  obs_radicado_men?: string | null;
};

export type ProcessHistoryRecord = {
  _id: string;
  program_code: string;
  dep_code_facultad: string | null;
  nombre_programa: string;
  tipo_proceso: "RC" | "AV" | "AE" | "PM";
  nombre_proceso: string;
  subtipo: string | null;
  estado_solicitud?: "APROBADO" | "NEGADO" | "CANCELADO";
  /** Solo AV/AE: ID del proceso PM activo mientras no haya sido cerrado */
  pm_proceso_id?: string | null;
  /** Solo AV/AE: ID del historial del PM una vez cerrado */
  pm_history_id?: string | null;
  /** Solo PM: ID del historial del proceso AV/AE padre */
  parent_history_id?: string | null;
  /** Solo AV con RC de oficio: ID del historial RC de oficio creado al cerrar */
  rc_oficio_history_id?: string | null;
  /** Solo AV con RC de oficio pendiente de entrega: historial RC «Vigencia transitoria» (solo archivo). */
  rc_vigencia_transitoria_history_id?: string | null;
  rc_oficio?: {
    codigo_resolucion: string | null;
    fecha_resolucion: string | null;
    duracion_resolucion: number | null;
    documentos: Array<{ name: string; view_link: string; subido_en?: string | null }>;
  } | null;
  /** Solo AV aprobado en cierre: modo de RC de oficio en el AV. La prolongación efectiva por archivo es la fila RC «Vigencia transitoria». */
  av_rc_oficio_modo?: 'ninguno' | 'incluido' | 'pendiente';
  /** Solo RC historial «Vigencia transitoria»: id del cierre AV que lo originó. */
  origen_av_history_id?: string | null;
  /** RC no renovación: resolución MEN vigente al gestionar el trámite (no es la respuesta al cierre). */
  resolucion_vigente_snapshot?: {
    codigo_resolucion: string | null;
    fecha_resolucion: string | null;
    fecha_vencimiento: string | null;
    duracion_resolucion?: number | null;
    documentos: Array<{ name: string; view_link: string; subido_en?: string | null }>;
  } | null;
  codigo_resolucion: string | null;
  fecha_resolucion: string | null;
  duracion_resolucion: number | null;
  fecha_vencimiento: string | null;
  fecha_inicio: string | null;
  fecha_documento_par: string | null;
  fecha_digitacion_saces: string | null;
  fecha_radicado_men: string | null;
  obs_vencimiento?: string;
  obs_inicio?: string;
  obs_documento_par?: string;
  obs_digitacion_saces?: string;
  obs_radicado_men?: string;
  obs_envio_pm_vicerrectoria?: string;
  obs_entrega_pm_cna?: string;
  obs_envio_avance_vicerrectoria?: string;
  obs_radicacion_avance_cna?: string;
  /** Snapshot de información del caso al cerrar (null en cierres anteriores al archivo). */
  caso_snapshot?: CasoSnapshotHistorial | null;
  fase_al_cierre: number;
  observaciones: string;
  condicion: number | null;
  cerrado_en: string;
  pm_ligado: {
    subtipo: string | null;
    fecha_envio_pm_vicerrectoria: string | null;
    fecha_entrega_pm_cna: string | null;
    fecha_envio_avance_vicerrectoria: string | null;
    fecha_radicacion_avance_cna: string | null;
    observaciones: string;
  } | null;
  /** Solo historial de PM: fechas del plan */
  fecha_envio_pm_vicerrectoria?: string | null;
  fecha_entrega_pm_cna?: string | null;
  fecha_envio_avance_vicerrectoria?: string | null;
  fecha_radicacion_avance_cna?: string | null;
  documentos_proceso: Array<{
    name: string;
    view_link: string;
    subido_en?: string | null;
    doc_type?: string | null;
    caso_date_key?: string | null;
  }>;
  /** Solo RC reforma curricular / renovación + reforma: campos del programa que cambiaron */
  programa_cambios?: Array<{
    campo:   string;
    label:   string;
    antes:   string | number | null;
    despues: string | number | null;
  }>;
  /** Snapshot completo de la ficha del programa tras cierre aprobado de reforma */
  programa_ficha_al_cierre?: {
    dep_code_programa?: string | null;
    nombre?: string | null;
    codigo_snies?: string | null;
    modalidad?: string | null;
    nivel_academico?: string | null;
    nivel_formacion?: string | null;
    num_creditos?: number | null;
    num_semestres?: number | null;
    admision_estudiantes?: string | null;
    num_estudiantes_saces?: number | null;
    cine_f?: CineF | null;
    nbc?: Nbc | null;
  } | null;
  fases: Array<{
    fase_numero: number;
    fase_nombre: string;
    actividades_completadas: number;
    actividades_total: number;
    documentos: Array<{ name: string; view_link: string; subido_en?: string | null }>;
    actividades: Array<{
      nombre: string;
      responsables: string;
      completada: boolean;
      no_aplica?: boolean;
      fecha_completado: string | null;
      observaciones: string;
      documentos: Array<{ name: string; view_link: string; subido_en?: string | null }>;
      subactividades: Array<{
        nombre: string;
        completada: boolean;
        no_aplica?: boolean;
        fecha_completado: string | null;
        observaciones: string;
        documentos: Array<{ name: string; view_link: string; subido_en?: string | null }>;
      }>;
    }>;
  }>;
};
