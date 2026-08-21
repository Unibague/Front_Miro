import type { Actividad, Caso, CasoFechaKey, Phase, ProcessDocument, Subactividad } from "../types";

/** Normaliza título para emparejar con actividades plantilla (ignora tildes y mayúsculas). */
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

/** Fase 4 + nombre de actividad → campo de fecha en información del caso */
const F4_ACT: Record<string, CasoFechaKey> = {
  [norm("Montaje en plataforma")]: "fecha_solicitud_radicado",
  /** Nombre frecuente en plantilla radicación */
  [norm("Montaje en plataforma nuevo SACES")]: "fecha_solicitud_radicado",
};

/** Cualquier actividad de fase 4 cuyo título contenga esto se enlaza a «Solicitud de radicado». */
const F4_MONTAJE_INCLUYE = norm("montaje en plataforma");

/** Fase 5 + actividad */
const F5_ACT: Record<string, CasoFechaKey> = {
  [norm("Acto administrativo")]: "fecha_resolucion",
};

/** Fase 4 + subactividad (plantilla actual sin subs; listo por si se añaden). */
const F4_SUB: Record<string, CasoFechaKey> = {};

/** Fase 5 + subactividad */
const F5_SUB: Record<string, CasoFechaKey> = {
  // Acto administrativo — notificación MEN (satisfactorio o no): ambas llenan fecha_resolucion
  [norm("Notificación del acto administrativo satisfactorio por parte del MEN")]:    "fecha_resolucion",
  [norm("Notificación del acto administrativo no satisfactorio por parte del MEN")]: "fecha_resolucion",
  // Flujo de completitud
  [norm("Notificación de solicitud de completitud por parte del MEN")]: "fecha_notificacion_completitud",
  [norm("Elaboración de respuesta de la completitud")]:                 "fecha_respuesta_completitud",
  // Recurso de reposición
  [norm("Radicación del recurso de reposición en plataforma del MEN")]: "fecha_resolucion_apelacion",
  [norm("Notificación de respuesta del MEN")]:                          "fecha_respuesta_men",
};

export function getCasoFechaKeyForActividad(faseNumero: number, nombre: string): CasoFechaKey | null {
  if (faseNumero === 4) {
    const n = norm(nombre);
    const exact = F4_ACT[n];
    if (exact) return exact;
    if (n.includes(F4_MONTAJE_INCLUYE)) return "fecha_solicitud_radicado";
    return null;
  }
  if (faseNumero === 5) return F5_ACT[norm(nombre)] ?? null;
  return null;
}

export function getCasoFechaKeyForSubactividad(faseNumero: number, nombre: string): CasoFechaKey | null {
  const n = norm(nombre);
  if (faseNumero === 4) return F4_SUB[n] ?? null;
  if (faseNumero !== 5) return null;
  return F5_SUB[n] ?? null;
}

export function findActividadByCasoKey(
  fases: Phase[],
  key: CasoFechaKey
): { fase: Phase; act: Actividad } | null {
  for (const f of fases) {
    for (const a of f.actividades) {
      if (getCasoFechaKeyForActividad(f.numero, a.nombre) === key) {
        return { fase: f, act: a };
      }
    }
  }
  return null;
}

export function findSubactividadByCasoKey(
  fases: Phase[],
  key: CasoFechaKey
): { fase: Phase; act: Actividad; sub: Subactividad } | null {
  for (const f of fases) {
    for (const a of f.actividades) {
      for (const s of a.subactividades) {
        if (getCasoFechaKeyForSubactividad(f.numero, s.nombre) === key) {
          return { fase: f, act: a, sub: s };
        }
      }
    }
  }
  return null;
}

export function mergeDocsUniq(a: ProcessDocument[], b: ProcessDocument[]): ProcessDocument[] {
  const m = new Map<string, ProcessDocument>();
  for (const d of a) m.set(d._id, d);
  for (const d of b) m.set(d._id, d);
  return Array.from(m.values()).sort(
    (x, y) => new Date(y.createdAt ?? 0).getTime() - new Date(x.createdAt ?? 0).getTime()
  );
}

export function getCasoFechaString(c: Caso | null, key: CasoFechaKey): string | null {
  if (!c) return null;
  const v = c[key] as string | null | undefined;
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

export function getCasoObsString(c: Caso | null, key: CasoFechaKey): string {
  if (!c) return "";
  const k = `obs_${key}` as keyof Caso;
  return String((c[k] as string | undefined) ?? "");
}
