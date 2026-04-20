export interface Macroproyecto {
  _id: string;
  codigo: string;
  nombre: string;
  peso: number;
  avance: number;
  semaforo: "verde" | "amarillo" | "rojo";
}

export interface Proyecto {
  _id: string;
  codigo: string;
  nombre: string;
  peso: number;
  avance: number;
  semaforo: "verde" | "amarillo" | "rojo";
  formulador: string;
  macroproyecto_id: { _id: string; codigo: string; nombre: string };
}

export interface Accion {
  _id: string;
  codigo: string;
  nombre: string;
  alcance: string;
  peso: number;
  avance: number;
  semaforo: "verde" | "amarillo" | "rojo";
  proyecto_id: { _id: string; codigo: string; nombre: string };
}

export interface Periodo {
  periodo: string;
  meta: number | string | null;
  avance: number | string | null;
}

export interface Indicador {
  _id: string;
  codigo: string;
  nombre: string;
  indicador_resultado: string;
  peso: number;
  avance: number;
  semaforo: "verde" | "amarillo" | "rojo";
  tipo_seguimiento: string;
  fecha_seguimiento: string;
  tipo_calculo: string;
  meta_final_2029: number | null;
  entregable: string;
  responsable: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  observaciones: string;
  periodos: Periodo[];
  avances_por_anio: Record<string, number>;
  avance_total_real: number | null;
  accion_id: { _id: string; codigo: string; nombre: string };
}

export type Semaforo = "verde" | "amarillo" | "rojo";
