import { getFieldMaxLength, getFieldContentType, normalizeAgreementCodeField, ConstrainedField } from './fieldConstraints';
import { buildFieldDropdownOptions, isYesNoField, resolveStoredSelectValue, withNoApplyOption } from './validatorOptions';
import { isBlankRequiredValue } from './requiredFields';
import { normalizeCountryFieldName as keyOf, isColombiaCountryOption } from './foreignCountryRules';

interface OnlineField extends ConstrainedField {
  name: string;
  multiple?: boolean;
  dropdown_options?: string[];
  excel_validation_options?: string[];
  min_value?: number;
  max_value?: number;
  integer_only?: boolean;
  percentage_group?: string;
}

export const isStrictOnlineDate = (value: unknown): boolean => {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const text = String(value ?? '').trim();
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4}|\d{2})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(text);
  if (!dmy && !iso) return false;
  const year = dmy ? Number(dmy[3]) + (dmy[3].length === 2 ? 2000 : 0) : Number(iso![1]);
  const month = Number(dmy ? dmy[2] : iso![2]);
  const day = Number(dmy ? dmy[1] : iso![3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    && (!text.includes('T') || !Number.isNaN(Date.parse(text)));
};

export const parseOnlineDate = (value: unknown): Date | null => {
  if (!isStrictOnlineDate(value)) return null;
  if (value instanceof Date) return value;
  const text = String(value).trim();
  const parts = text.split('/');
  if (parts.length === 3) return new Date(Number(parts[2]) + (parts[2].length === 2 ? 2000 : 0), Number(parts[1]) - 1, Number(parts[0]));
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)!;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

export const getOnlineFieldError = (field: OnlineField, value: unknown, catalog: string[] = []): string => {
  field = normalizeAgreementCodeField(field);
  if (isBlankRequiredValue(value)) return '';
  const text = String(value).trim();
  const key = keyOf(field.name);
  if (isYesNoField(field)) return /^[SN]$/.test(text) ? '' : 'Seleccione únicamente S o N.';
  const entity = ['NOMBRE_ENTIDAD_FTE_INTERNAC', 'NOMBRE_ENTIDAD_FTE_INTERNACIONAL'].includes(key);
  const noApply = entity || key === 'ID_PAIS_FINANCIADOR';
  if (noApply && text === '0') return '';
  const country = /^ID_PAIS_(FINANCIADOR|INSTITUCION_ASOCIADA|EXTRANJERO)$/.test(key);
  if (key === 'ID_PAIS_EXTRANJERO' && isColombiaCountryOption(value)) return 'Seleccione un país extranjero distinto de Colombia (170).';
  const activityDate = ['FECHA_INICIO', 'FECHA_FINAL'].includes(key);
  if (activityDate || field.datatype === 'Fecha') return isStrictOnlineDate(value) ? '' : 'Ingrese una fecha válida en formato DD/MM/AAAA o DD/MM/AA.';
  const configured = buildFieldDropdownOptions(field);
  const options = withNoApplyOption(field.name, configured.length ? configured : catalog);
  if (country && !/^\d+$/.test(text) && !(options.length && /^\d+\s+-\s+\S/.test(text))) return 'Ingrese únicamente dígitos.';
  const entityNoApply = entity && text.toUpperCase() === 'N/A';
  if (options.length && !entityNoApply) {
    const values = field.multiple && Array.isArray(value) ? value : [value];
    const select = options.map(option => ({ value: option, label: option }));
    return values.every(item => resolveStoredSelectValue(item, select) !== null) ? '' : 'Seleccione un valor válido del catálogo.';
  }
  const maxLength = getFieldMaxLength(field);
  if (maxLength && text.length > maxLength) return `Admite máximo ${maxLength} caracteres.`;
  const type = getFieldContentType(field);
  if (type === 'alphabetic' && !/^[\p{L}\p{M}\p{P}\p{S}\s]+$/u.test(text)) return 'Admite letras, espacios y puntuación, sin números.';
  if (type === 'numeric' && !/^\d+$/.test(text)) return 'Ingrese únicamente dígitos.';
  if (type === 'alphanumeric' && !/^[\p{L}\p{M}\p{N}\p{P}\p{S}\s]+$/u.test(text)) return 'Admite letras, números, espacios y puntuación.';
  if (field.datatype === 'Entero' && !/^-?\d+$/.test(text)) return 'Ingrese un número entero.';
  if (['Entero', 'Decimal', 'Porcentaje'].includes(field.datatype || '')) {
    const number = Number(text.replace(',', '.'));
    if (!Number.isFinite(number)) return 'Ingrese un número válido.';
    if (field.integer_only && !Number.isInteger(number)) return 'Ingrese un número entero.';
    const min = field.min_value ?? (field.datatype === 'Porcentaje' ? 0 : undefined);
    const max = field.max_value ?? (field.datatype === 'Porcentaje' ? 100 : undefined);
    if (min !== undefined && number < min) return `El mínimo permitido es ${min}.`;
    if (max !== undefined && number > max) return `El máximo permitido es ${max}.`;
  }
  if (field.datatype === 'Link' && !/^https?:\/\/\S+$/i.test(text)) return 'Ingrese un enlace http o https válido.';
  if (field.datatype === 'Fecha Inicial / Fecha Final') {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(isStrictOnlineDate)) return 'Ingrese dos fechas válidas.';
    const timestamp = (date: unknown) => {
      const parts = String(date).split('/');
      return parts.length === 3 ? Date.UTC(Number(parts[2]) + (parts[2].length === 2 ? 2000 : 0), Number(parts[1]) - 1, Number(parts[0])) : new Date(String(date)).getTime();
    };
    if (timestamp(value[0]) > timestamp(value[1])) return 'La fecha inicial debe ser anterior a la final.';
  }
  return '';
};

export const getOnlineDatasetErrors = (fields: OnlineField[], rows: Record<string, unknown>[]): Record<string, string[]> => {
  const errors: Record<string, string[]> = {};
  const add = (name: string, index: number, message: string) => { (errors[name] ??= [])[index] = message; };
  const groups = new Map<string, OnlineField[]>();
  fields.forEach(field => {
    const group = field.percentage_group?.trim() || (keyOf(field.name).startsWith('PORCENTAJE_') ? '__PORCENTAJES__' : '');
    if (group) groups.set(group, [...(groups.get(group) || []), field]);
  });
  groups.forEach(group => {
    if (group.length < 2) return;
    rows.forEach((row, index) => {
      let sum = 0;
      group.forEach(field => {
        if (isBlankRequiredValue(row[field.name])) return;
        const number = Number(String(row[field.name]).replace(',', '.'));
        if (!Number.isFinite(number)) return;
        sum += number;
        if (!Number.isInteger(number)) add(field.name, index, 'El porcentaje debe ser entero.');
      });
      if (sum > 100) add(group[0].name, index, 'La suma de porcentajes no puede superar 100.');
    });
  });
  const document = fields.find(field => ['NUM_DOCUMENTO', 'NUMERO_DOCUMENTO', 'DOCUMENTO', 'IDENTIFICACION'].includes(keyOf(field.name)));
  const type = fields.find(field => ['ID_TIPO_DOCUMENTO', 'TIPO_DOCUMENTO', 'TIPO_DE_DOCUMENTO'].includes(keyOf(field.name)));
  if (document && type) {
    const seen = new Map<string, string>();
    rows.forEach((row, index) => {
      const id = String(row[document.name] ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
      const code = String(row[type.name] ?? '').trim().toUpperCase().split(/\s+-\s+|\s+/)[0];
      if (!id || !code) return;
      if (seen.has(id) && seen.get(id) !== code) add(type.name, index, 'El documento ya está registrado con otro tipo.');
      else seen.set(id, code);
    });
  }
  return errors;
};
