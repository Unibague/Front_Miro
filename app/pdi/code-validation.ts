export function normalizePdiCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function getEntityId(value: unknown) {
  const maybeEntity = value as { _id?: unknown; id?: unknown } | null | undefined;
  return String(maybeEntity?._id ?? maybeEntity?.id ?? value ?? "").trim();
}

export function getCodeSegment(value: unknown, letter: "M" | "P" | "A" | "I") {
  const regex = new RegExp(`^${letter}[1-9]\\d*$`);
  return normalizePdiCode(value).split("-").find((part) => regex.test(part)) ?? null;
}

export function extractNumberSegment(value: unknown, letter: "M" | "P" | "A" | "I") {
  const segment = getCodeSegment(value, letter);
  return segment ? Number(segment.slice(1)) : null;
}

export function getFirstAvailableNumber(usedNumbers: Set<number>) {
  let next = 1;
  while (usedNumbers.has(next)) next += 1;
  return next;
}

export function getProjectPrefix(macroCode?: string) {
  const macroSegment = getCodeSegment(macroCode, "M");
  return macroSegment ? `${macroSegment}-P` : null;
}

export function getActionPrefix(projectCode?: string) {
  const normalized = normalizePdiCode(projectCode);
  return /^M[1-9]\d*-P[1-9]\d*$/.test(normalized) ? `${normalized}-A` : null;
}

export function getIndicatorPrefix(macroCode?: string, projectCode?: string, actionCode?: string) {
  const macroSegment = getCodeSegment(macroCode, "M");
  const projectSegment = getCodeSegment(projectCode, "P");
  const actionSegment = getCodeSegment(actionCode, "A");
  if (!macroSegment || !projectSegment || !actionSegment) return null;
  return `${macroSegment}-${projectSegment}-${actionSegment}-I`;
}
