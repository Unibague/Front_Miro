export function normalizePeso(peso: number | string | null | undefined) {
  const value = Number(peso) || 0;
  return value <= 1 ? value * 100 : value;
}

export function clampAvance(value: number | string | null | undefined) {
  return Math.min(Math.max(Number(value) || 0, 0), 100);
}

export function getWeightedContribution<T extends { peso: number | string | null | undefined }>(
  items: T[],
  getValue: (item: T) => number | string | null | undefined,
) {
  return Math.round(
    items.reduce((acc, item) => acc + clampAvance(getValue(item)) * normalizePeso(item.peso), 0) / 100,
  );
}

export function getWeightedAverage<T extends { peso: number | string | null | undefined }>(
  items: T[],
  getValue: (item: T) => number | string | null | undefined,
) {
  const totalPeso = items.reduce((acc, item) => acc + normalizePeso(item.peso), 0);
  if (totalPeso <= 0) return 0;

  return Math.round(
    items.reduce((acc, item) => acc + clampAvance(getValue(item)) * normalizePeso(item.peso), 0) / totalPeso,
  );
}

export function getSemaforoByAvance(avance: number | string | null | undefined) {
  const value = Number(avance) || 0;
  if (value >= 90) return "verde";
  if (value >= 60) return "amarillo";
  return "rojo";
}
