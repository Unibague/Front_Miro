/** Replica la lógica de `Back_Miro/controllers/processes.js` (calcularFechas) para vista previa en el cliente. */

function sumarMeses(fechaStr: string, meses: number): string | null {
  if (!fechaStr || meses == null) return null;
  const d = new Date(`${fechaStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().split("T")[0];
}

function siguienteDiaHabil(fechaStr: string | null): string | null {
  if (!fechaStr) return null;
  const d = new Date(`${fechaStr}T12:00:00`);
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2);
  if (dow === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

const OFFSETS_RC = {
  meses_inicio_antes_venc: 29,
  meses_doc_par_antes_venc: 17,
  meses_digitacion_antes_venc: 15,
  meses_radicado_antes_venc: 12,
};

const OFFSETS_AV = {
  meses_inicio_antes_venc: 33,
  meses_doc_par_antes_venc: 16,
  meses_digitacion_antes_venc: 15,
  meses_radicado_antes_venc: 12,
};

export type FechasCalculadas = {
  fecha_vencimiento: string | null;
  fecha_inicio: string | null;
  fecha_documento_par: string | null;
  fecha_digitacion_saces: string | null;
  fecha_radicado_men: string | null;
};

/** Solo fecha de vencimiento (p. ej. reforma curricular / no renovación). */
export function fechaVencimientoDesdeResolucion(
  fecha_resolucion: string | null | undefined,
  duracion_anos: number | null | undefined
): string | null {
  if (!fecha_resolucion || duracion_anos == null) return null;
  const duracion_meses = Number(duracion_anos) * 12;
  return sumarMeses(fecha_resolucion, duracion_meses);
}

export function calcularFechasProceso(
  tipo_proceso: "RC" | "AV",
  fecha_resolucion: string | null | undefined,
  duracion_anos: number | null | undefined,
  offsets?: Partial<typeof OFFSETS_RC>
): FechasCalculadas | null {
  if (!fecha_resolucion || duracion_anos == null) return null;
  const duracion_meses = Number(duracion_anos) * 12;
  const vencimiento = sumarMeses(fecha_resolucion, duracion_meses);
  if (!vencimiento) return null;

  const base = tipo_proceso === "AV" ? OFFSETS_AV : OFFSETS_RC;
  const cfg = {
    meses_inicio_antes_venc: offsets?.meses_inicio_antes_venc ?? base.meses_inicio_antes_venc,
    meses_doc_par_antes_venc: offsets?.meses_doc_par_antes_venc ?? base.meses_doc_par_antes_venc,
    meses_digitacion_antes_venc: offsets?.meses_digitacion_antes_venc ?? base.meses_digitacion_antes_venc,
    meses_radicado_antes_venc: offsets?.meses_radicado_antes_venc ?? base.meses_radicado_antes_venc,
  };

  return {
    fecha_vencimiento: vencimiento,
    fecha_inicio: siguienteDiaHabil(sumarMeses(vencimiento, -cfg.meses_inicio_antes_venc)),
    fecha_documento_par: siguienteDiaHabil(sumarMeses(vencimiento, -cfg.meses_doc_par_antes_venc)),
    fecha_digitacion_saces: siguienteDiaHabil(sumarMeses(vencimiento, -cfg.meses_digitacion_antes_venc)),
    fecha_radicado_men: sumarMeses(vencimiento, -cfg.meses_radicado_antes_venc),
  };
}
