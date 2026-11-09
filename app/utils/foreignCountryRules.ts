export const normalizeCountryFieldName = (value: unknown): string => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

export const isColombiaCountryOption = (value: unknown): boolean => {
  const match = /^(\d+)(?:\s*[-.:)]\s+.*)?$/.exec(String(value ?? '').trim());
  return Boolean(match && Number(match[1]) === 170);
};

export const filterForeignCountryOptions = (fieldName: string, options: string[]): string[] =>
  normalizeCountryFieldName(fieldName) === 'ID_PAIS_EXTRANJERO'
    ? options.filter(option => !isColombiaCountryOption(option)) : options;

export const getForeignCountryErrors = (rows: Record<string, unknown>[], fields: { name: string }[], sheetName?: string) =>
  fields.filter(field => normalizeCountryFieldName(field.name) === 'ID_PAIS_EXTRANJERO').map(field => ({
    column: sheetName ? `${sheetName} - ${field.name}` : field.name,
    errors: rows.flatMap((row, index) => isColombiaCountryOption(row[field.name]) ? [{
      register: index + 1, value: row[field.name],
      message: `El campo "${field.name}" no admite 170 (Colombia); seleccione un país extranjero (fila ${index + 1})`,
    }] : []),
  })).filter(detail => detail.errors.length > 0);
