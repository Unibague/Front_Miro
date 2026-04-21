export type Dependency = {
  _id: string;
  dep_code: string;
  name: string;
  dep_father: string | null;
};

export type Program = {
  _id: string;
  nombre: string;
  dep_code_facultad: string;
  dep_code_programa: string;
  codigo_snies: string | null;
  modalidad: string | null;
  nivel_academico: string | null;
  nivel_formacion: string | null;
  num_creditos: number | null;
  num_semestres: number | null;
  admision_estudiantes?: string | null;
  num_estudiantes_saces?: number | null;
  estado: string;
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
  program_code: string;
  tipo_proceso: "RC" | "AV" | "PM" | "ALERTA";
  subtipo?: string | null;
  alert_para_tipo?: "RC" | "AV" | null;
  cerrado_process_history_id?: string | null;
  snapshot_codigo_resolucion?: string | null;
  snapshot_fecha_resolucion?: string | null;
  snapshot_duracion_anos?: number | null;
  parent_process_id?: string | null;
  parent_tipo_proceso?: "RC" | "AV" | null;
  fase_actual: number;
  observaciones: string;
  condicion: number | null;
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
};

export type ProcessDocument = {
  _id: string;
  phase_id: string | null;
  process_id?: string | null;
  actividad_id?: string | null;
  subactividad_id?: string | null;
  doc_type?: 'resolucion' | 'proceso';
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
  /** Procesos en fase 7 (plan de contingencia / no renovación); se dibuja al final de la barra */
  fase_contingencia: number;
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
  cerrado: boolean;
  createdAt?: string;
};

/** Fechas proyectadas al cerrar un proceso (para notificaciones por correo). */
export type ProcessReminderRecord = {
  _id: string;
  process_history_id: string;
  program_code: string;
  dep_code_facultad: string | null;
  nombre_programa: string;
  nivel_academico: string | null;
  tipo_proceso: "RC" | "AV";
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
  documentos: Array<{ name: string; view_link: string }>;
  createdAt?: string;
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
  tipo_proceso: "RC" | "AV" | "PM";
  nombre_proceso: string;
  subtipo: string | null;
  codigo_resolucion: string | null;
  fecha_resolucion: string | null;
  duracion_resolucion: number | null;
  fecha_vencimiento: string | null;
  fecha_inicio: string | null;
  fecha_documento_par: string | null;
  fecha_digitacion_saces: string | null;
  fecha_radicado_men: string | null;
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
  documentos_proceso: Array<{ name: string; view_link: string; subido_en?: string | null }>;
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
