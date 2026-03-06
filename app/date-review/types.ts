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
  tipo_proceso: "RC" | "AV" | "PM";
  subtipo?: string | null;
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
};

export type ProcessDocument = {
  _id: string;
  phase_id: string | null;
  process_id?: string | null;
  name: string;
  drive_id: string;
  view_link: string;
  download_link: string;
  mime_type?: string | null;
  size?: number | null;
  createdAt?: string;
};

export type Actividad = {
  _id: string;
  nombre: string;
  responsables: string;
  completada: boolean;
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
  fase_0: number; fase_1: number; fase_2: number;
  fase_3: number; fase_4: number; fase_5: number; fase_6: number;
};

export type ProcesoRow = {
  programa: Program;
  acreditacion: number | null;
  registro: number | null;
  pmFase: number | null;
  pmLigadoA: string | null;
  pmSubtipo: string | null;
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
  documentos_proceso: Array<{ name: string; view_link: string }>;
  fases: Array<{
    fase_numero: number;
    fase_nombre: string;
    actividades_completadas: number;
    actividades_total: number;
    documentos: Array<{ name: string; view_link: string }>;
  }>;
};
