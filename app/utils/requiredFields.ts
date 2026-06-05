type FieldRequirementSource = {
  required?: boolean;
  comment?: string | null;
};

const normalizeRequirementText = (value: unknown): string => {
  if (value === null || value === undefined) return "";

  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
};

const checkLineForRequired = (line: string): boolean => {
  const compact = line.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const word of ["obligatorio", "obligatario"]) {
    const idx = compact.indexOf(word);
    if (idx >= 0 && !compact.slice(0, idx).endsWith("no") && !compact.slice(idx + word.length).startsWith("si")) return true;
  }
  return false;
};

export const isRequiredComment = (comment: unknown): boolean => {
  const str = String(comment ?? "");
  if (!str.trim()) return false;

  // First: check using NFC normalization (composed form — handles standard Spanish accents)
  if (str.normalize("NFC").split(/[\r\n]+/).some(checkLineForRequired)) return true;

  // Fallback: check using full NFD normalization + diacritic removal
  const normalized = normalizeRequirementText(comment);
  return normalized.trim() ? normalized.split("\n").some(checkLineForRequired) : false;
};

export const getEffectiveRequired = (field?: FieldRequirementSource | null): boolean => {
  if (Boolean(field?.required)) return true;
  const comment = field?.comment;
  if (typeof comment !== "string" || !comment.trim()) return false;
  // Simple direct check: fastest path for standard Spanish text
  const lower = comment.toLowerCase();
  for (const w of ["obligatorio", "obligatario"]) {
    if (lower.includes(w) && !lower.includes(`no ${w}`) && !new RegExp(`${w}\\s+si\\b`).test(lower)) return true;
  }
  // Fallback with full normalization (handles special encodings)
  return isRequiredComment(comment);
};

export const isBlankRequiredValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isNaN(value);
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => isBlankRequiredValue(item));
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "" || normalized === "null" || normalized === "nan";
};
