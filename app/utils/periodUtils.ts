// Los periodos académicos se nombran como "2026A" o "2026B": el año seguido de
// una letra que indica el semestre (A = 1, B = 2).
const PERIOD_NAME_PATTERN = /^(\d{4})\s*([AB])$/i;

export const getYearFromPeriodName = (periodName?: string | null): number | null => {
  const match = PERIOD_NAME_PATTERN.exec(String(periodName ?? "").trim());
  return match ? Number(match[1]) : null;
};

export const getSemesterFromPeriodName = (periodName?: string | null): 1 | 2 | null => {
  const match = PERIOD_NAME_PATTERN.exec(String(periodName ?? "").trim());
  if (!match) return null;
  return match[2].toUpperCase() === "A" ? 1 : 2;
};
