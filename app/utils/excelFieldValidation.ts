import ExcelJS from 'exceljs';
import { ConstrainedField, getFieldMaxLength, getFieldContentType, normalizeAgreementCodeField } from './fieldConstraints';
import { getEffectiveRequired } from './requiredFields';
import { isYesNoField } from './validatorOptions';
import { normalizeCountryFieldName as keyOf } from './foreignCountryRules';

export interface ExcelRuleField extends ConstrainedField {
  name: string;
  required?: boolean;
  required_override?: boolean;
  min_value?: number;
  max_value?: number;
  integer_only?: boolean;
  percentage_group?: string;
}

// Coerción numérica por sí sola acepta "1e2", "+12" o "1.2". Se cuenta la
// presencia de los diez dígitos en todo el texto, conservando códigos como 063.
const removeExcelDigits = (address: string): string => {
  let result = address;
  for (const digit of '0123456789') result = `SUBSTITUTE(${result},"${digit}","")`;
  return result;
};

export const excelDigitsFormula = (address: string): string =>
  `AND(LEN(${address})>0,LEN(${removeExcelDigits(address)})=0)`;

export const applyExcelFieldValidation = (cell: ExcelJS.Cell, field: ExcelRuleField): void => {
  field = normalizeAgreementCodeField(field);
  const ref = cell.address;
  const key = keyOf(field.name);
  if (key === 'CODIGO_CONVENIO') cell.numFmt = '@';
  const content = getFieldContentType(field);
  const maxLength = getFieldMaxLength(field);
  const required = getEffectiveRequired(field);
  const base = { allowBlank: !required, showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Valor no válido' };
  let validation: ExcelJS.DataValidation | undefined;
  const rules: string[] = [];
  let message = 'Revise el tipo, la longitud y los límites indicados para este campo.';
  const date = field.datatype === 'Fecha' || ['FECHA_INICIO', 'FECHA_FINAL'].includes(key);
  if (isYesNoField(field)) {
    validation = { ...base, type: 'list', formulae: ['"S,N"'], error: 'Seleccione únicamente S o N.' };
  } else if (date || field.datatype === 'Fecha Inicial / Fecha Final') {
    validation = { ...base, type: 'date', operator: 'between', formulae: [new Date(1900, 0, 1), new Date(9999, 11, 31)], error: 'Ingrese una fecha válida (DD/MM/AAAA o DD/MM/AA).' };
    cell.numFmt = 'DD/MM/YYYY';
  } else if (field.datatype === 'True/False') {
    validation = { ...base, type: 'list', formulae: ['"Si,No"'], error: 'Seleccione Si o No.' };
  } else {
    if (content === 'numeric') {
      rules.push(excelDigitsFormula(ref));
      message = `Ingrese únicamente dígitos${maxLength ? `, máximo ${maxLength}` : ''}.`;
      cell.numFmt = '@';
    } else if (content === 'alphabetic') {
      rules.push(`LEN(${removeExcelDigits(ref)})=LEN(${ref})`);
      message = 'Admite letras, espacios y puntuación, sin números; respete la longitud máxima.';
    }
    if (maxLength) rules.push(`LEN(${ref})<=${maxLength}`);
    if (['Entero', 'Decimal', 'Porcentaje'].includes(field.datatype || '')) {
      const min = field.min_value ?? (field.datatype === 'Porcentaje' ? 0 : -Number.MAX_SAFE_INTEGER);
      const max = field.max_value ?? (field.datatype === 'Porcentaje' ? 100 : Number.MAX_SAFE_INTEGER);
      if (!content && !maxLength) {
        validation = { ...base, type: field.datatype === 'Entero' || field.integer_only ? 'whole' : 'decimal', operator: 'between', formulae: [min, max], error: `Ingrese un número${field.datatype === 'Entero' || field.integer_only ? ' entero' : ''} entre ${min} y ${max}.` };
      } else {
        rules.push(`ISNUMBER(--${ref})`, `--${ref}>=${min}`, `--${ref}<=${max}`);
        if (field.datatype === 'Entero' || field.integer_only) rules.push(`--${ref}=INT(--${ref})`);
      }
    }
    if (key === 'ID_PAIS_EXTRANJERO') rules.push(`--${ref}<>170`);
    if (field.datatype === 'Link') {
      rules.push(`OR(LEFT(LOWER(${ref}),7)="http://",LEFT(LOWER(${ref}),8)="https://")`, `ISERROR(SEARCH(" ",${ref}))`, `LEN(${ref})>IF(LEFT(LOWER(${ref}),8)="https://",8,7)`);
      message = 'Ingrese un enlace http o https válido, sin espacios.';
    }
    if (!validation && rules.length === 1 && maxLength) {
      validation = { ...base, type: 'textLength', operator: 'lessThanOrEqual', formulae: [maxLength], error: `Admite máximo ${maxLength} caracteres, incluidos signos de puntuación.` };
    } else if (!validation && rules.length) {
      validation = { ...base, type: 'custom', formulae: [`IFERROR(AND(${rules.join(',')}),FALSE)`], error: message };
    }
  }
  if (!validation) return;
  if (key === 'ID_PAIS_EXTRANJERO') {
    validation.errorTitle = 'País extranjero no válido';
    validation.error = `El código 170 corresponde a Colombia y no es válido como país extranjero. Ingrese el código de otro país, solo dígitos${maxLength ? `, máximo ${maxLength}` : ''}.`;
  }
  if (field.comment) {
    validation.showInputMessage = true;
    validation.promptTitle = field.name.slice(0, 32);
    validation.prompt = field.comment.slice(0, 255);
  }
  cell.dataValidation = validation;
};

export const excelValidationFormula = (validation: ExcelJS.DataValidation, ref: string): string => {
  const [min, max] = validation.formulae || [];
  if (validation.type === 'custom') return String(min);
  if (validation.type === 'whole' || validation.type === 'decimal') return `AND(ISNUMBER(${ref}),${ref}>=${min},${ref}<=${max}${validation.type === 'whole' ? `,${ref}=INT(${ref})` : ''})`;
  if (validation.type === 'textLength') return `LEN(${ref})<=${min}`;
  if (validation.type === 'date') return `AND(ISNUMBER(${ref}),${ref}>=1,${ref}<=2958465)`;
  if (validation.type === 'list') {
    const source = String(min);
    if (source.startsWith('"')) return `OR(${source.slice(1, -1).split(',').map(value => `${ref}="${value.replace(/"/g, '""')}"`).join(',')})`;
    return `COUNTIF(${source},${ref})>0`;
  }
  return 'TRUE';
};

export const excelMultiSelectFormula = (source: string, ref: string): string => {
  const count = `LEN(${ref})-LEN(SUBSTITUTE(${ref},",",""))+1`;
  const tokens = `TRIM(MID(SUBSTITUTE(${ref},",",REPT(" ",LEN(${ref}))),(ROW(INDIRECT("1:"&(${count})))-1)*LEN(${ref})+1,LEN(${ref})))`;
  return `IFERROR(OR(COUNTIF(${source},${ref})>0,SUMPRODUCT(--(COUNTIF(${source},${tokens})>0))=${count}),FALSE)`;
};

export const highlightExcelValidation = (worksheet: ExcelJS.Worksheet, range: string, ref: string, formula: string): void => {
  worksheet.addConditionalFormatting({ ref: range, rules: [{ type: 'expression', priority: 1,
    formulae: [`AND(${ref}<>"",NOT(IFERROR(${formula},FALSE)))`],
    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } },
  }] });
};

// Excel limita Formula1 a 255 caracteres. Las reglas largas se calculan en
// columnas de soporte de _Listas y la validación consulta el resultado booleano.
// No son macros: se recalculan al cambiar las celdas originales.
export const compactExcelValidationFormulas = (workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet): void => {
  const model: Record<string, ExcelJS.DataValidation> = (worksheet as any).dataValidations.model;
  const entries = Object.entries(model).filter(([, rule]) => rule.type === 'custom' && String(rule.formulae?.[0] || '').length > 255);
  if (!entries.length) return;
  const support = workbook.getWorksheet('_Listas') || workbook.addWorksheet('_Listas');
  support.state = 'veryHidden';
  const columns = new Map<string, { col: number; end: number; name: string }>();
  const sheetRef = `'${worksheet.name.replace(/'/g, "''")}'!`;
  entries.forEach(([range, validation]) => {
    const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(range);
    if (!match || (match[3] && match[1] !== match[3])) return;
    const first = Number(match[2]);
    const last = Number(match[4] || match[2]);
    let column = columns.get(match[1]);
    if (!column) {
      const col = support.columnCount + 1;
      column = { col, end: last, name: `_MIRO_RULE_${support.getColumn(col).letter}` };
      columns.set(match[1], column);
    }
    column.end = Math.max(column.end, last);
    for (let row = first; row <= last; row++) {
      const formula = String(validation.formulae![0]).split(/("(?:[^"]|"")*")/).map((part, index) => {
        if (index % 2) return part;
        return part.replace(/(^|[^A-Za-z0-9_!])(\$?[A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_])/g, (_match, prefix: string, col: string, absolute: string, originalRow: string) =>
          `${prefix}${sheetRef}${col}${absolute}${absolute ? originalRow : Number(originalRow) + row - first}`);
      }).join('');
      support.getCell(row, column.col).value = { formula };
    }
    model[range] = { ...validation, formulae: [`INDEX(${column.name},ROW())`] };
  });
  columns.forEach(({ col, end, name }) => workbook.definedNames.add(`'_Listas'!$${support.getColumn(col).letter}$1:$${support.getColumn(col).letter}$${end}`, name));
  workbook.calcProperties.fullCalcOnLoad = true;
};

interface PositionedField { field: ExcelRuleField; col: number; firstRow: number }

// Las listas conservan su desplegable. Las comprobaciones entre campos también
// se resaltan para detectar cambios de otra celda y pegados que omiten el diálogo.
export const applyExcelDatasetValidation = (worksheet: ExcelJS.Worksheet, fields: PositionedField[], endRow: number): void => {
  if (!fields.length) return;
  const groups = new Map<string, PositionedField[]>();
  const firstCol = Math.min(...fields.map(item => item.col));
  const lastCol = Math.max(...fields.map(item => item.col));
  const letter = (col: number) => worksheet.getColumn(col).letter;
  const mark = (item: PositionedField, expression: string) => worksheet.addConditionalFormatting({
    ref: `${letter(item.col)}${item.firstRow}:${letter(item.col)}${endRow}`,
    rules: [{ type: 'expression', priority: 1, formulae: [expression], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } } }],
  });
  fields.forEach(item => {
    const { field, firstRow, col } = item;
    const ref = `${letter(col)}${firstRow}`;
    if (getEffectiveRequired(field)) mark(item, `AND(COUNTA($${letter(firstCol)}${firstRow}:$${letter(lastCol)}${firstRow})>0,LEN(TRIM(${ref}&""))=0)`);
    const group = field.percentage_group?.trim() || (keyOf(field.name).startsWith('PORCENTAJE_') ? '__PORCENTAJES__' : '');
    if (group) groups.set(group, [...(groups.get(group) || []), item]);
  });
  groups.forEach(group => {
    if (group.length < 2) return;
    group.forEach(item => {
      const ref = `${letter(item.col)}${item.firstRow}`;
      const refs = group.map(other => `$${letter(other.col)}${item.firstRow}`);
      const rule = `AND(${ref}=INT(${ref}),SUM(${refs.join(',')})<=100)`;
      mark(item, `AND(${ref}<>"",NOT(IFERROR(${rule},FALSE)))`);
      const model = (worksheet as any).dataValidations.model;
      const range = `${ref}:${letter(item.col)}${endRow}`;
      const validation: ExcelJS.DataValidation = model[range] || worksheet.getCell(item.firstRow, item.col).dataValidation;
      if (validation.type === 'list') return;
      const base = excelValidationFormula(validation, ref);
      const combined = { ...validation, type: 'custom', formulae: [`IFERROR(AND(${base},${rule}),FALSE)`], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Porcentaje no válido', error: 'Ingrese un porcentaje entero; la suma del grupo no puede superar 100.' };
      delete combined.operator;
      model[range] = combined;

    });
  });
  const id = fields.find(item => ['NUM_DOCUMENTO', 'NUMERO_DOCUMENTO', 'DOCUMENTO', 'IDENTIFICACION'].includes(keyOf(item.field.name)));
  const type = fields.find(item => ['ID_TIPO_DOCUMENTO', 'TIPO_DOCUMENTO', 'TIPO_DE_DOCUMENTO'].includes(keyOf(item.field.name)));
  if (id && type) {
    const clean = (ref: string) => `UPPER(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${ref}&""," ",""),".",""),"-",""),"/",""))`;
    const code = (ref: string) => `UPPER(LEFT(${ref},FIND(" ",${ref}&" ")-1))`;
    [id, type].forEach(item => {
      const docRef = `$${letter(id.col)}${item.firstRow}`;
      const typeRef = `$${letter(type.col)}${item.firstRow}`;
      const idRange = `$${letter(id.col)}$${id.firstRow}:$${letter(id.col)}$${endRow}`;
      const typeRange = `$${letter(type.col)}$${type.firstRow}:$${letter(type.col)}$${endRow}`;
      mark(item, `AND(${docRef}<>"",${typeRef}<>"",SUMPRODUCT(--(${clean(idRange)}=${clean(docRef)}),--(${typeRange}<>""),--(${code(typeRange)}<>${code(typeRef)}))>0)`);
    });
  }
};
