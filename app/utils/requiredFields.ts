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

export const isRequiredComment = (comment: unknown): boolean => {
  const normalized = normalizeRequirementText(comment);
  if (!normalized.trim()) return false;

  return normalized.split("\n").some((line) => {
    const text = line.trim().replace(/\s+/g, " ").toLowerCase();
    const compactText = text.replace(/[^a-z0-9]+/g, "");
    const requiredIndex = compactText.indexOf("obligatorio");
    if (requiredIndex < 0) return false;

    const beforeRequired = compactText.slice(0, requiredIndex);
    const afterRequired = compactText.slice(requiredIndex + "obligatorio".length);
    return !beforeRequired.endsWith("no") && !afterRequired.startsWith("si");
  });
};

export const getEffectiveRequired = (field?: FieldRequirementSource | null): boolean => {
  if (Boolean(field?.required)) return true;
  const comment = field?.comment;
  if (typeof comment === "string" && comment.trim()) {
    return isRequiredComment(comment);
  }
  return false;
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
