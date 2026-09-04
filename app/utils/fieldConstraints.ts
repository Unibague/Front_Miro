export interface ConstrainedField {
  datatype?: string;
  comment?: string;
  content_type?: "" | "alphabetic" | "numeric" | "alphanumeric";
  max_length?: number;
}

export const parseCommentMaxLength = (comment = ""): number | undefined => {
  const normalized = comment.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const match = normalized.match(/\b(?:alfabetico|alfanumerico|numerico)\s*\(\s*(\d+)\s*\)/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
};

export const getFieldMaxLength = (field: ConstrainedField): number | undefined => {
  const configured = Number(field.max_length);
  if (Number.isSafeInteger(configured) && configured > 0) return configured;
  return parseCommentMaxLength(field.comment) ??
    (field.datatype === "Texto Corto" ? 60 : field.datatype === "Texto Largo" ? 800 : undefined);
};
