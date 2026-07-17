export function normalizePeso(peso: number | string | null | undefined) {
  const value = Number(peso) || 0;
  return value <= 1 ? value * 100 : value;
}

export function clampAvance(value: number | string | null | undefined) {
  return Math.min(Math.max(Number(value) || 0, 0), 100);
}

// Recomputo de solo lectura para tarjetas de detalle (proyecto/acción): no se
// persiste ni alimenta ningún otro cálculo, así que redondear aquí es solo
// para mostrar un número legible, no genera arrastre de error como redondear
// a nivel de Acción/Proyecto en el backend.
export function getWeightedContribution<T extends { peso: number | string | null | undefined }>(
  items: T[],
  getValue: (item: T) => number | string | null | undefined,
) {
  return Math.round(
    items.reduce((acc, item) => acc + clampAvance(getValue(item)) * normalizePeso(item.peso), 0) / 100,
  );
}

export function getSemaforoByAvance(avance: number | string | null | undefined) {
  const value = Number(avance) || 0;
  if (value >= 90) return "verde";
  if (value >= 60) return "amarillo";
  return "rojo";
}

// Formatea un numero decimal para mostrarlo siempre con coma (formato es-CO),
// sin importar si vino como 0.8 o 0,8. Se usa en cualquier lugar donde se
// muestre el avance/meta de un indicador para que quede estandarizado.
// true si el texto parece un numero decimal escrito con punto (ej: "2.1", "80.5%")
export function hasDecimalDot(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  return /^-?\d+\.\d+%?$/.test(String(value).trim());
}

// Si el valor es un numero decimal escrito con punto lo convierte a coma
// (2.1 -> 2,1). Deja intacto cualquier otro valor (texto libre como
// "Implementado", numeros ya con coma, vacios, etc.).
export function normalizeDecimalComma(value: string): string {
  return hasDecimalDot(value) ? value.replace(".", ",") : value;
}

export function formatNumeroEs(
  value: number | string | null | undefined,
  maxDecimals = 2,
  minDecimals = 0
): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("es-CO", { minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals });
}

type PeriodoAvanceAnio = {
  periodo: string;
  meta: number | string | null;
  avance: number | string | null;
  estado_reporte?: string | null;
};

type IndicadorAvanceAnio = {
  tipo_calculo: string;
  periodos: PeriodoAvanceAnio[];
};

function toNumeroFlexible(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace("%", "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function ordenarPeriodosPorNombre(periodos: PeriodoAvanceAnio[]) {
  return [...periodos].sort((a, b) => String(a.periodo ?? "").localeCompare(String(b.periodo ?? "")));
}

// Un periodo recien agregado guarda avance:0 por defecto aunque nadie lo haya
// reportado (estado_reporte queda en "Borrador"). Si solo filtraramos por
// "avance no nulo" ese 0 de relleno se confundiria con un reporte real.
function fueReportado(p: PeriodoAvanceAnio) {
  return Boolean(p.estado_reporte) && p.estado_reporte !== "Borrador";
}

// Cumplimiento del indicador EN un año puntual, frente a la meta programada
// para ESE mismo año (no la Meta final 2029): replica exactamente la lógica
// de controllers/pdiDashboard.js (cumplimientoIndicadorAnio) para que el
// "avance del año" se calcule igual en todo el sistema.
export function cumplimientoIndicadorAnio(ind: IndicadorAvanceAnio, anio: string): number {
  const periodosAnio = ordenarPeriodosPorNombre(ind.periodos || [])
    .filter((p) => String(p.periodo ?? "").slice(0, 4) === anio);
  if (!periodosAnio.length) return 0;

  const tipo = ind.tipo_calculo || "promedio";

  if (tipo === "ultimo_valor") {
    const conAvance = periodosAnio.filter((p) => fueReportado(p) && toNumeroFlexible(p.avance) !== null);
    if (!conAvance.length) return 0;
    const ultimo = conAvance[conAvance.length - 1];
    const avance = toNumeroFlexible(ultimo.avance);
    const meta = toNumeroFlexible(ultimo.meta);
    if (avance === null) return 0;
    if (meta !== null && meta > 0) return Math.round(Math.min(avance / meta, 1) * 100 * 100) / 100;
    return Math.round(Math.min(avance, 100) * 100) / 100;
  }

  if (tipo === "promedio") {
    const avances = periodosAnio.map((p) => toNumeroFlexible(p.avance)).filter((v): v is number => v !== null);
    const metas = periodosAnio.map((p) => toNumeroFlexible(p.meta)).filter((v): v is number => v !== null);
    if (!avances.length || !metas.length) return 0;
    const avanceProm = avances.reduce((a, b) => a + b, 0) / avances.length;
    const metaProm = metas.reduce((a, b) => a + b, 0) / metas.length;
    if (!(metaProm > 0)) return 0;
    return Math.round(Math.min(avanceProm / metaProm, 1) * 100 * 100) / 100;
  }

  // acumulado
  const sumaAvance = periodosAnio.reduce((s, p) => s + (toNumeroFlexible(p.avance) ?? 0), 0);
  const sumaMeta = periodosAnio.reduce((s, p) => s + (toNumeroFlexible(p.meta) ?? 0), 0);
  if (!(sumaMeta > 0)) return 0;
  return Math.round(Math.min(sumaAvance / sumaMeta, 1) * 100 * 100) / 100;
}

// Meta absoluta de un indicador EN un año (no el %): suma/promedia/toma el
// último valor de la meta de cada periodo de ese año según tipo_calculo.
// Se usa para mostrar "Meta del año" junto a la meta propia de cada periodo
// (A, B, ...) en el formulario de reporte, sin alterar lo que se guarda.
export function absMetaAnio(ind: IndicadorAvanceAnio, anio: string): number | null {
  const periodosAnio = ordenarPeriodosPorNombre(ind.periodos || [])
    .filter((p) => String(p.periodo ?? "").slice(0, 4) === anio && toNumeroFlexible(p.meta) !== null);
  if (!periodosAnio.length) return null;

  const tipo = ind.tipo_calculo || "promedio";
  if (tipo === "ultimo_valor") {
    return toNumeroFlexible(periodosAnio[periodosAnio.length - 1].meta);
  }
  if (tipo === "promedio") {
    const metas = periodosAnio.map((p) => toNumeroFlexible(p.meta)).filter((v): v is number => v !== null);
    return metas.length ? metas.reduce((a, b) => a + b, 0) / metas.length : null;
  }
  return periodosAnio.reduce((s, p) => s + (toNumeroFlexible(p.meta) ?? 0), 0);
}

// Avance absoluto de un indicador EN un año (no el %): misma composición que
// absMetaAnio pero sobre el avance, respetando "fueReportado" para
// ultimo_valor (igual que cumplimientoIndicadorAnio). Se usa para previsualizar
// en vivo "esto es lo que quedaría como avance del año" mientras se reporta un
// periodo puntual (A, B, ...), sin sumar/guardar nada distinto de lo que ya
// guarda cada periodo por su cuenta.
export function absAvanceAnio(ind: IndicadorAvanceAnio, anio: string): number | null {
  const periodosAnio = ordenarPeriodosPorNombre(ind.periodos || [])
    .filter((p) => String(p.periodo ?? "").slice(0, 4) === anio && toNumeroFlexible(p.avance) !== null);
  if (!periodosAnio.length) return null;

  const tipo = ind.tipo_calculo || "promedio";
  if (tipo === "ultimo_valor") {
    const conAvance = periodosAnio.filter((p) => fueReportado(p));
    if (!conAvance.length) return null;
    return toNumeroFlexible(conAvance[conAvance.length - 1].avance);
  }
  if (tipo === "promedio") {
    const avances = periodosAnio.map((p) => toNumeroFlexible(p.avance)).filter((v): v is number => v !== null);
    return avances.length ? avances.reduce((a, b) => a + b, 0) / avances.length : null;
  }
  return periodosAnio.reduce((s, p) => s + (toNumeroFlexible(p.avance) ?? 0), 0);
}

// Avance real de un año para un conjunto de indicadores (proyecto, acción,
// macroproyecto, etc.): promedio simple del % de cumplimiento individual de
// los indicadores que tienen meta en ese año. Misma metodología que el
// "Avance del año" del tablero general (sin ponderar por peso ni jerarquía).
export function getAvanceAnioSimple(indicadores: IndicadorAvanceAnio[], anio: string): number {
  const conMeta = indicadores.filter((ind) =>
    (ind.periodos || []).some((p) => String(p.periodo ?? "").slice(0, 4) === anio && toNumeroFlexible(p.meta) !== null)
  );
  if (!conMeta.length) return 0;

  const suma = conMeta.reduce((acc, ind) => acc + cumplimientoIndicadorAnio(ind, anio), 0);
  return Math.round((suma / conMeta.length) * 100) / 100;
}
