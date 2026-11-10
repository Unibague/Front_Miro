export interface ConstrainedField {
  name?: string;
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


export const normalizeAgreementCodeField = <T extends ConstrainedField>(field: T): T => {
  const key = String(field.name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (key !== 'CODIGO_CONVENIO') return field;
  const configured = Number(field.max_length);
  const maxLength = Number.isSafeInteger(configured) && configured > 0 ? configured : (parseCommentMaxLength(field.comment) ?? 30);
  return {
    ...field,
    datatype: 'Texto Corto',
    content_type: 'alphanumeric',
    max_length: maxLength,
    comment: String(field.comment || '').trim()
      ? String(field.comment).replace(/\b(?:alfab[eé]tico|num[eé]rico)\b/gi, 'alfanumérico')
      : `Alfanumérico (${maxLength}). Código o número del convenio.`,
  };
};

export const getFieldMaxLength = (field: ConstrainedField): number | undefined => {
  field = normalizeAgreementCodeField(field);
  const configured = Number(field.max_length);
  if (Number.isSafeInteger(configured) && configured > 0) return configured;
  return parseCommentMaxLength(field.comment) ??
    (field.datatype === "Texto Corto" ? 60 : field.datatype === "Texto Largo" ? 800 : undefined);
};

export const getFieldContentType = (field: ConstrainedField & { name?: string }): string => {
  const key = String(field.name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (key === 'CODIGO_CONVENIO') return 'alphanumeric';
  if (field.datatype === 'Fecha' || field.datatype === 'Fecha Inicial / Fecha Final') return '';
  if (/^ID_PAIS_(FINANCIADOR|INSTITUCION_ASOCIADA|EXTRANJERO)$/.test(key)) return 'numeric';
  if (['DESCRIPCION_ACTIVIDAD', 'NOMBRE_ENTIDAD_FTE_INTERNAC', 'NOMBRE_ENTIDAD_FTE_INTERNACIONAL'].includes(key)) return 'alphanumeric';
  const comment = String(field.comment ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const type = /\b(alfabetico|alfanumerico|numerico)\s*\(/i.exec(comment)?.[1].toLowerCase();
  const types: Record<string, string> = { alfabetico: 'alphabetic', alfanumerico: 'alphanumeric', numerico: 'numeric' };
  return field.content_type || types[type || ''] || '';
};

// Se comprueba el valor completo: pegar "12abc" no lo convierte silenciosamente en "12".
export const acceptsFieldTextInput = (field: ConstrainedField & { name?: string }, value: string): boolean => {
  if (value === '') return true;
  const type = getFieldContentType(field);
  if (type === 'numeric') return /^\d+$/.test(value);
  if (type === 'alphabetic') return /^[\p{L}\p{M}\p{P}\p{S}\s]+$/u.test(value);
  if (type === 'alphanumeric') return /^[\p{L}\p{M}\p{N}\p{P}\p{S}\s]+$/u.test(value);
  return true;
};
