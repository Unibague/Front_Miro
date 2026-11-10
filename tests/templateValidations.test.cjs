const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const ExcelJS = require('exceljs');

require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(outputText, filename);
};

const { applyValidatorDropdowns, applyDatatypeValidation } = require('../app/utils/templateUtils.ts');
const { extractDropdownOptionsFromComment, withNoApplyOption } = require('../app/utils/validatorOptions.ts');
const { getForeignCountryErrors } = require('../app/utils/foreignCountryRules.ts');

test('Excel conserva validación de fecha al reconstruir listas y permite cero en financiación', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Actividades');
  const fields = [
    { name: 'FECHA_INICIO', datatype: 'Fecha', comment: 'Fecha en formato DD/MM/AAAA' },
    { name: 'OTRAS_ACTIVIDADES_COOPERACIÓN', datatype: 'Texto Corto', dropdown_options: ['S', 'N'], comment: 'Seleccione S/N.\nValores permitidos:\nS\nN' },
    { name: 'ID_PAIS_FINANCIADOR', datatype: 'Entero', dropdown_options: ['840 - Estados Unidos'] },
    { name: 'ID_TIPO_ACTIVIDAD_BIENESTAR', dropdown_options: ['10 - Actividad nacional'] },
    { name: 'DESCRIPCION_ACTIVIDAD', datatype: 'Texto Largo', comment: 'Obligatorio, alfanumérico (300).' },
  ];
  applyValidatorDropdowns({ workbook, worksheet, fields, validators: [], endRow: 4 });
  const downloaded = new ExcelJS.Workbook();
  await downloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = downloaded.getWorksheet('Actividades');
  assert.equal(sheet.getCell('A2').dataValidation.type, 'date');
  assert.equal(sheet.getCell('A4').dataValidation.type, 'date');
  assert.equal(sheet.getCell('A2').numFmt, 'DD/MM/YYYY');
  assert.equal(sheet.getCell('B2').dataValidation.type, 'list');
  assert.equal(sheet.getCell('D2').dataValidation.type, 'list');
  assert.equal(sheet.getCell('E2').dataValidation.type, 'textLength');
  assert.deepEqual(sheet.getCell('E2').dataValidation.formulae, [300]);
  assert.equal(sheet.getCell('E4').dataValidation.type, 'textLength');
  const sources = downloaded.getWorksheet('_Listas');
  const options = [];
  sources.eachRow(row => row.eachCell(cell => options.push(cell.value)));
  assert.ok(options.includes('0'));
  assert.ok(options.includes('S'));
  assert.ok(options.includes('N'));
  assert.ok(options.includes('10 - Actividad nacional'));
});

test('formularios muestran S y N por separado y agregan cero sin reemplazar el catálogo', () => {
  assert.deepEqual(extractDropdownOptionsFromComment('Seleccione S/N.\nValores permitidos:\nS\nN'), ['S', 'N']);
  assert.deepEqual(withNoApplyOption('ID_PAIS_FINANCIADOR', ['840 - Estados Unidos']), ['840 - Estados Unidos', '0']);
  assert.deepEqual(withNoApplyOption('NOMBRE_ENTIDAD_FTE_INTERNACIONAL', ['Entidad 2026', '0']), ['Entidad 2026', '0', 'N/A']);
  assert.deepEqual(withNoApplyOption('NOMBRE_ENTIDAD_FTE_INTERNAC', ['Entidad 2026', 'N/A']), ['Entidad 2026', 'N/A', '0']);
  assert.deepEqual(withNoApplyOption('ID_PAIS_FINANCIADOR', []), []);
  assert.deepEqual(withNoApplyOption('ID_FUENTE_NACIONAL', ['10 - Nacional']), ['10 - Nacional']);
});

test('Excel admite N/A en los nombres completos y abreviados de entidad internacional', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Financiacion');
  const fields = ['NOMBRE_ENTIDAD_FTE_INTERNAC', 'NOMBRE_ENTIDAD_FTE_INTERNACIONAL'].map(name => ({
    name, datatype: 'Texto Largo', comment: 'Obligatorio, alfabético (100).',
  }));
  applyValidatorDropdowns({ workbook, worksheet, fields, validators: [], endRow: 9 });
  for (let row = 2; row <= 9; row++) worksheet.getCell(row, 1).value = 'N/A';
  const downloaded = new ExcelJS.Workbook();
  await downloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = downloaded.getWorksheet('Financiacion');
  assert.equal(sheet.getCell('A2').dataValidation.type, 'textLength');
  assert.equal(sheet.getCell('B2').dataValidation.type, 'textLength');
  assert.deepEqual(sheet.getCell('A2').dataValidation.formulae, [100]);
  assert.equal(sheet.getCell('A9').value, 'N/A');
});

test('Excel permite puntuación en todos los textos, desde comentarios o configuración explícita', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Instituciones');
  const fields = [
    { name: 'INSTITUCION_ASOCIADA', datatype: 'Texto Largo', comment: 'Obligatorio, alfabético (300).' },
    { name: 'OTRO_TEXTO', datatype: 'Texto Largo', comment: 'Alfanumérico (500).' },
    { name: 'NOMBRE_CONFIGURADO', datatype: 'Texto Largo', content_type: 'alphabetic', max_length: 120 },
  ];
  applyValidatorDropdowns({ workbook, worksheet, fields, validators: [], endRow: 9 });
  applyDatatypeValidation(worksheet.getCell('D2'), { name: 'OTRO_NOMBRE', datatype: 'Texto Largo', content_type: 'alphabetic', max_length: 200 });
  worksheet.getCell('A2').value = 'INTERASEO S.A.S. E.S.P.';
  const downloaded = new ExcelJS.Workbook();
  await downloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = downloaded.getWorksheet('Instituciones');
  for (const address of ['A2', 'C2', 'D2']) {
    const validation = sheet.getCell(address).dataValidation;
    assert.equal(validation.type, 'custom');
    assert.match(validation.formulae[0], /SUBSTITUTE/);
    assert.doesNotMatch(validation.formulae[0], /[{}]/);
    assert.match(validation.error, /puntuación/);
    assert.doesNotMatch(validation.formulae[0], /ABCDEFGHIJKLMNOPQRSTUVWXYZ/);
  }
  assert.match(sheet.getCell('A2').dataValidation.formulae[0], /<=300/);
  assert.match(sheet.getCell('C2').dataValidation.formulae[0], /<=120/);
  assert.equal(sheet.getCell('B2').dataValidation.type, 'textLength');
  assert.deepEqual(sheet.getCell('B2').dataValidation.formulae, [500]);
  assert.equal(sheet.getCell('A2').value, 'INTERASEO S.A.S. E.S.P.');
});

test('país 170 se informa aun cuando falta otro campo obligatorio', () => {
  const errors = getForeignCountryErrors([
    { ID_PAIS_EXTRANJERO: '063' }, { ID_PAIS_EXTRANJERO: '589' },
    { ID_PAIS_EXTRANJERO: '063' }, { ID_PAIS_EXTRANJERO: 170 },
  ], [{ name: 'ID_PAIS_EXTRANJERO' }, { name: 'PROGRAMA ACADÉMICO' }], 'MOV_ESTUD_HACIA_COLOMBIA');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].column, 'MOV_ESTUD_HACIA_COLOMBIA - ID_PAIS_EXTRANJERO');
  assert.equal(errors[0].errors[0].register, 4);
  assert.match(errors[0].errors[0].message, /170 \(Colombia\)/);
  assert.deepEqual(withNoApplyOption('ID_PAIS_EXTRANJERO', ['063 - Argentina', '170 - Colombia', '589', '170', '0170']), ['063 - Argentina', '589']);
  assert.deepEqual(withNoApplyOption('ID_PAIS_FINANCIADOR', ['170 - Colombia']), ['170 - Colombia', '0']);
});

test('Excel excluye Colombia del desplegable y bloquea 170 si no hay lista', async () => {
  const workbook = new ExcelJS.Workbook();
  const listSheet = workbook.addWorksheet('Con lista');
  const numericSheet = workbook.addWorksheet('Sin lista');
  applyValidatorDropdowns({ workbook, worksheet: listSheet,
    fields: [{ name: 'ID_PAIS_EXTRANJERO', dropdown_options: ['063 - Argentina', '170 - Colombia', '589'] }],
    validators: [], endRow: 5 });
  applyValidatorDropdowns({ workbook, worksheet: numericSheet,
    fields: [{ name: 'ID_PAIS_EXTRANJERO', datatype: 'Texto Largo', content_type: 'numeric', max_length: 3 }],
    validators: [], endRow: 5 });
  const downloaded = new ExcelJS.Workbook();
  await downloaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const listValidation = downloaded.getWorksheet('Con lista').getCell('A2').dataValidation;
  assert.equal(listValidation.type, 'list');
  assert.equal(listValidation.showErrorMessage, true);
  assert.equal(listValidation.errorStyle, 'stop');
  const values = [];
  downloaded.getWorksheet('_Listas').eachRow(row => row.eachCell(cell => values.push(cell.value)));
  assert.deepEqual(values, ['063 - Argentina', '589']);
  const numericValidation = downloaded.getWorksheet('Sin lista').getCell('A5').dataValidation;
  assert.equal(numericValidation.type, 'custom');
  assert.match(numericValidation.formulae[0], /<>170/);
  assert.equal(numericValidation.showErrorMessage, true);
  assert.equal(numericValidation.errorStyle, 'stop');
});

const { getOnlineFieldError: onlineError, getOnlineDatasetErrors, isStrictOnlineDate } = require('../app/utils/onlineValidation.ts');
const { buildFieldDropdownOptions } = require('../app/utils/validatorOptions.ts');

test('online: pregunta de formación de la captura solo acepta S o N', () => {
  const field = { name: 'FORMACION', datatype: 'Texto Largo', multiple: true,
    comment: 'Obligatorio, alfabético (1). El convenio dentro de sus principales actividades incluye actividades de formación (S/N)?',
    dropdown_options: ['f'] };
  assert.deepEqual(buildFieldDropdownOptions(field), ['S', 'N']);
  assert.deepEqual(extractDropdownOptionsFromComment(field.comment), ['S', 'N']);
  for (const value of ['S', 'N']) assert.equal(onlineError(field, value), '');
  for (const value of ['f', 'SN', 'Sí', 'No', 's', 1, ['S', 'N']]) assert.match(onlineError(field, value), /S o N/);
});

test('online: fechas, contenido, catálogos, longitud, rangos y enlaces', () => {
  for (const date of ['31/02/2026', '22 de octubre de 2026', '29/02/26', '2026-02-31']) assert.equal(isStrictOnlineDate(date), false);
  for (const date of ['22/10/26', '29/02/2024', '2026-10-22T00:00:00.000Z']) assert.equal(isStrictOnlineDate(date), true);
  assert.ok(onlineError({ name: 'FECHA_INICIO', datatype: 'Texto Largo' }, '31/02/2026'));
  assert.equal(onlineError({ name: 'NOMBRE', comment: 'Alfabético (50)' }, 'INTERASEO S.A.S. E.S.P.'), '');
  assert.ok(onlineError({ name: 'NOMBRE', comment: 'Alfabético (50)' }, 'Entidad 2026'));
  assert.ok(onlineError({ name: 'NOMBRE', comment: 'Alfabético (3)' }, 'ABCD'));
  assert.equal(onlineError({ name: 'DESCRIPCION_ACTIVIDAD', comment: 'Alfabético (100)' }, 'Actividad 2026: área_A/B.'), '');
  for (const name of ['ID_TIPO_ACTIVIDAD_BIENESTAR', 'ID_FUENTE_NACIONAL']) {
    const field = { name, comment: 'Numérico (2)', dropdown_options: ['10 - Nacional', '20 - Internacional'] };
    for (const value of [10, '10 - Nacional', 20]) assert.equal(onlineError(field, value), '');
    for (const value of [1, '10 - Inventada', '99 - Nacional']) assert.ok(onlineError(field, value));
  }
  assert.ok(onlineError({ name: 'PAIS', content_type: 'numeric' }, '170abc'));
  assert.ok(onlineError({ name: 'NUM', datatype: 'Entero', min_value: 2, max_value: 5 }, 1));
  assert.ok(onlineError({ name: 'NUM', datatype: 'Entero', max_value: 5 }, 6));
  assert.ok(onlineError({ name: 'NUM', datatype: 'Entero' }, '1.2'));
  assert.ok(onlineError({ name: 'P', datatype: 'Porcentaje' }, 101));
  assert.ok(onlineError({ name: 'URL', datatype: 'Link' }, 'texto'));
});

test('online: financiación, países y reglas entre columnas', () => {
  for (const name of ['NOMBRE_ENTIDAD_FTE_INTERNAC', 'NOMBRE_ENTIDAD_FTE_INTERNACIONAL']) {
    for (const value of ['N/A', 0, 'Fundación 2026 S.A.']) assert.equal(onlineError({ name, comment: 'Alfabético (100)' }, value), '');
  }
  assert.equal(onlineError({ name: 'ID_PAIS_FINANCIADOR', dropdown_options: ['840 - Estados Unidos'] }, 0), '');
  assert.ok(onlineError({ name: 'ID_PAIS_FINANCIADOR' }, 'N/A'));
  assert.ok(onlineError({ name: 'ID_PAIS_INSTITUCION_ASOCIADA' }, 'Colombia'));
  for (const value of [170, '0170', '170 - Colombia']) assert.ok(onlineError({ name: 'ID_PAIS_EXTRANJERO' }, value));
  assert.equal(onlineError({ name: 'ID_PAIS_EXTRANJERO' }, '840'), '');
  const errors = getOnlineDatasetErrors([{ name: 'PORCENTAJE_A' }, { name: 'PORCENTAJE_B' }, { name: 'NUM_DOCUMENTO' }, { name: 'ID_TIPO_DOCUMENTO' }], [
    { PORCENTAJE_A: 60, PORCENTAJE_B: 50, NUM_DOCUMENTO: '123', ID_TIPO_DOCUMENTO: 'CC' },
    { PORCENTAJE_A: 1.5, NUM_DOCUMENTO: '123', ID_TIPO_DOCUMENTO: 'TI' },
  ]);
  assert.match(errors.PORCENTAJE_A[0], /100/);
  assert.match(errors.PORCENTAJE_A[1], /entero/);
  assert.match(errors.ID_TIPO_DOCUMENTO[1], /otro tipo/);
});

const { acceptsFieldTextInput, getFieldContentType } = require('../app/utils/fieldConstraints.ts');
const { excelDigitsFormula } = require('../app/utils/excelFieldValidation.ts');
const { applyWorkbookSheetDropdowns, createFieldsWorksheet } = require('../app/utils/templateUtils.ts');

test('online: numérico del comentario bloquea letras, pegados mixtos y conserva ceros', () => {
  const field = { name: 'ID_PAIS_INSTITUCION_ASOCIADA', datatype: 'Texto Largo', comment: 'Obligatorio si la institución NO es multilateral, numérico (3). País de institución asociada. Consultar lista de países.' };
  assert.equal(getFieldContentType(field), 'numeric');
  for (const value of ['', '0', '063', '170', '840']) assert.equal(acceptsFieldTextInput(field, value), true);
  for (const value of ['ddd', 'CO', 'US', '12a', '1e2', '1.2', '+12', '-12', ' 12', '1\n2']) assert.equal(acceptsFieldTextInput(field, value), false, value);
  assert.equal(getFieldContentType({ name: 'OTRO_CODIGO', datatype: 'Texto Largo', comment: 'Numérico (10)' }), 'numeric');
  assert.equal(acceptsFieldTextInput({ comment: 'Alfabético (100)' }, 'Entidad 2026'), false);
  assert.equal(acceptsFieldTextInput({ comment: 'Alfabético (100)' }, 'Fundación S.A.S. & Asociados'), true);
  assert.equal(acceptsFieldTextInput({ name: 'DESCRIPCION_ACTIVIDAD', comment: 'Alfabético (100)' }, 'Plan 2026: área_A/B.'), true);
});

// Evalúa el subconjunto real de la fórmula de dígitos, sin abrir Excel.
// Así se comprueban valores inválidos, no solo la presencia de XML.
const evaluateDigitRule = (formula, value) => {
  const expression = formula.replace(/\{/g, '[').replace(/\}/g, ']').replace(/([^<>=])=([^=])/g, '$1===$2');
  return require('node:vm').runInNewContext(expression, {
    A2: value, String,
    AND: (...values) => values.every(Boolean),
    LEN: value => Array.isArray(value) ? value.map(item => String(item ?? '').length) : String(value ?? '').length,
    SUBSTITUTE: (value, search, replacement) => Array.isArray(search) ? search.map(item => String(value).split(item).join(replacement)) : String(value).split(search).join(replacement),
    SUMPRODUCT: values => values.flat(Infinity).reduce((sum, value) => sum + Number(value), 0),
  });
};

test('Excel: regla de dígitos rechaza letras, decimales, signos y notación científica', () => {
  const formula = excelDigitsFormula('A2');
  for (const value of ['063', '001', '170', 170, 0]) assert.equal(evaluateDigitRule(formula, value), true, String(value));
  for (const value of ['', 'CO', 'ddd', '1e2', '1.2', '1,2', '-12', '+12', '12a', ' 12']) assert.equal(evaluateDigitRule(formula, value), false, value);
});

test('Excel descargable conserva reglas de todos los tipos tras guardar y abrir', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Convenios');
  const fields = [
    { name: 'ID_PAIS_INSTITUCION_ASOCIADA', datatype: 'Texto Largo', comment: 'Obligatorio si la institución NO es multilateral, numérico (3).' },
    { name: 'OTRO_CODIGO', datatype: 'Texto Largo', comment: 'Obligatorio, numérico (5).' },
    { name: 'CANTIDAD', datatype: 'Entero', min_value: 2, max_value: 5 },
    { name: 'VALOR', datatype: 'Decimal', min_value: 0.5, max_value: 10.5 },
    { name: 'PORCENTAJE', datatype: 'Porcentaje', integer_only: true },
    { name: 'FECHA_INICIO', datatype: 'Texto Largo', comment: 'Obligatorio, numérico (8)' },
    { name: 'URL', datatype: 'Link', max_length: 100 },
    { name: 'FORMACION', datatype: 'Texto Largo', comment: 'Alfabético (1). ¿Incluye formación (S/N)?', dropdown_options: ['X'] },
    { name: 'NOMBRE', datatype: 'Texto Largo', comment: 'Alfabético (100)' },
    { name: 'DESCRIPCION_ACTIVIDAD', datatype: 'Texto Largo', comment: 'Alfabético (300)' },
    { name: 'NOMBRE_ENTIDAD_FTE_INTERNAC', datatype: 'Texto Largo', comment: 'Alfabético (100)' },
  ];
  applyValidatorDropdowns({ workbook: book, worksheet: sheet, fields, validators: [], endRow: 6 });
  const downloaded = new ExcelJS.Workbook();
  await downloaded.xlsx.load(await book.xlsx.writeBuffer());
  const saved = downloaded.getWorksheet('Convenios');
  for (let col = 1; col <= fields.length; col++) {
    for (const row of [2, 6]) {
      const validation = saved.getCell(row, col).dataValidation;
      assert.ok(validation.type, `${fields[col - 1].name}, fila ${row}`);
      assert.equal(validation.showErrorMessage, true);
      assert.equal(validation.errorStyle, 'stop');
    }
  }
  assert.match(saved.getCell('A2').dataValidation.formulae[0], /SUBSTITUTE/);
  assert.match(saved.getCell('A2').dataValidation.formulae[0], /LEN\(A2\)<=3/);
  assert.equal(saved.getCell('A2').numFmt, '@');
  assert.match(saved.getCell('B2').dataValidation.formulae[0], /LEN\(B2\)<=5/);
  assert.equal(Boolean(saved.getCell('B2').dataValidation.allowBlank), false);
  assert.deepEqual(saved.getCell('C2').dataValidation.formulae, [2, 5]);
  assert.equal(saved.getCell('D2').dataValidation.type, 'decimal');
  assert.equal(saved.getCell('E2').dataValidation.type, 'whole');
  assert.deepEqual(saved.getCell('E2').dataValidation.formulae, [0, 100]);
  assert.equal(saved.getCell('F2').dataValidation.type, 'date');
  assert.match(saved.getCell('G2').dataValidation.formulae[0], /https:\/\//);
  assert.match(saved.getCell('I2').dataValidation.formulae[0], /SUBSTITUTE/);
  assert.equal(saved.getCell('J2').dataValidation.type, 'textLength');
  assert.deepEqual(saved.getCell('J2').dataValidation.formulae, [300]);
  assert.equal(saved.getCell('K2').dataValidation.type, 'textLength');
  const sn = saved.getCell('H2').dataValidation;
  assert.equal(sn.type, 'list');
  assert.match(sn.formulae[0], /^_MIRO_LIST_/);
  assert.ok(downloaded.definedNames.model.some(item => item.name === sn.formulae[0]));
  assert.ok(saved.conditionalFormattings.some(item => item.rules.some(rule => rule.formulae?.some(formula => formula.includes('COUNTA(')))));
});

test('Excel: reconstruir varias hojas no pierde reglas ni mantiene nombres de listas viejas', async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Primera');
  book.addWorksheet('Segunda');
  const sheets = [
    { name: 'Primera', fields: [{ name: 'CODIGO', datatype: 'Texto Largo', comment: 'Numérico (3)' }, { name: 'CATALOGO', dropdown_options: ['10 - Nacional', '20 - Internacional'] }] },
    { name: 'Segunda', fields: [{ name: 'FORMACION', comment: 'Formación (S/N)?' }, { name: 'GRUPO', multiple: true, dropdown_options: ['1 - Nacional', '2 - Internacional'] }] },
  ];
  applyWorkbookSheetDropdowns({ workbook: book, workbookSheets: sheets, validators: [], endRow: 4 });
  const before = book.definedNames.model.length;
  applyWorkbookSheetDropdowns({ workbook: book, workbookSheets: sheets, validators: [], endRow: 4 });
  assert.equal(book.definedNames.model.length, before);
  const downloaded = new ExcelJS.Workbook();
  await downloaded.xlsx.load(await book.xlsx.writeBuffer());
  assert.match(downloaded.getWorksheet('Primera').getCell('A4').dataValidation.formulae[0], /SUBSTITUTE/);
  assert.equal(downloaded.getWorksheet('Primera').getCell('B4').dataValidation.type, 'list');
  const multiple = downloaded.getWorksheet('Segunda').getCell('B4').dataValidation;
  assert.equal(multiple.type, 'custom');
  assert.equal(multiple.showErrorMessage, true);
  assert.match(multiple.formulae[0], /COUNTIF/);
  assert.match(multiple.formulae[0], /SUBSTITUTE/);
  const created = createFieldsWorksheet(book, 'Nueva', [{ name: 'CODIGO', datatype: 'Texto Largo', comment: 'Numérico (3)' }], 4);
  assert.match(created.getCell('A2').worksheet.dataValidations.model['A2:A4'].formulae[0], /SUBSTITUTE/);
});

test('Excel: porcentajes y tipos de documento incluyen controles entre campos', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Reglas');
  const fields = [
    { name: 'PORCENTAJE_A', datatype: 'Porcentaje' }, { name: 'PORCENTAJE_B', datatype: 'Porcentaje' },
    { name: 'NUM_DOCUMENTO', datatype: 'Texto Largo', comment: 'Numérico (15)' },
    { name: 'ID_TIPO_DOCUMENTO', dropdown_options: ['CC - Cédula', 'TI - Tarjeta'] },
  ];
  applyValidatorDropdowns({ workbook: book, worksheet: sheet, fields, validators: [], endRow: 4 });
  const downloaded = new ExcelJS.Workbook();
  await downloaded.xlsx.load(await book.xlsx.writeBuffer());
  const saved = downloaded.getWorksheet('Reglas');
  for (const address of ['A2', 'B4']) {
    assert.match(saved.getCell(address).dataValidation.formulae[0], /INT\(/);
    assert.match(saved.getCell(address).dataValidation.formulae[0], /SUM\(\$A\d,\$B\d\)<=100/);
  }
  assert.equal(saved.getCell('D2').dataValidation.type, 'list');
  assert.ok(saved.conditionalFormattings.some(item => item.rules.some(rule => rule.formulae?.some(formula => formula.includes('SUMPRODUCT') && formula.includes('$C$2:$C$4')))));
});

test('Excel: las fórmulas largas usan soporte y ninguna validación supera 255 caracteres', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Convenios O'Brien");
  applyValidatorDropdowns({ workbook: book, worksheet: sheet, fields: [
    { name: 'OPCIONES', column: 28, header_row: 1000, multiple: true, dropdown_options: ['1 - Nacional', '2 - Internacional'] },
  ], validators: [], endRow: 1002 });
  const downloaded = new ExcelJS.Workbook();
  await downloaded.xlsx.load(await book.xlsx.writeBuffer());
  const saved = downloaded.getWorksheet("Convenios O'Brien");
  for (const address of ['AB1001', 'AB1002']) {
    assert.match(saved.getCell(address).dataValidation.formulae[0], /^INDEX\(_MIRO_RULE_/);
    assert.ok(saved.getCell(address).dataValidation.formulae[0].length <= 255);
  }
  const formulas = [];
  downloaded.getWorksheet('_Listas').eachRow(row => row.eachCell(cell => { if (cell.value?.formula) formulas.push(cell.value.formula); }));
  assert.ok(formulas.some(formula => formula.includes("'Convenios O''Brien'!AB1001")));
  assert.ok(formulas.some(formula => formula.includes("'Convenios O''Brien'!AB1002")));
  assert.equal(book.calcProperties.fullCalcOnLoad, true);
});

test('países: los catálogos descartan etiquetas ISO y conservan códigos numéricos registrados', () => {
  assert.deepEqual(withNoApplyOption('ID_PAIS_INSTITUCION_ASOCIADA', ['CO', 'US', 'Colombia', '170 - Colombia', '063']), ['170 - Colombia', '063']);
});

test('Excel compatible: sin matrices en reglas, sin rangos solapados y prioridades únicas', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Movilidad');
  const fields = [
    { name: 'NOMBRE', datatype: 'Texto Largo', required: true, comment: 'Obligatorio, alfabético (50)' },
    { name: 'ID_PAIS_EXTRANJERO', datatype: 'Texto Largo', comment: 'Numérico (3)' },
    { name: 'ID_FUENTE_NACIONAL', dropdown_options: ['1 - Recursos IES', '2 - Recursos públicos'], comment: 'Numérico (2)' },
    { name: 'PORCENTAJE_A', datatype: 'Porcentaje' }, { name: 'PORCENTAJE_B', datatype: 'Porcentaje' },
  ];
  applyValidatorDropdowns({ workbook: book, worksheet: sheet, fields, validators: [], endRow: 1000 });
  const buffer = await book.xlsx.writeBuffer();
  const zip = await require('jszip').loadAsync(buffer);
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const validations = [...xml.matchAll(/<dataValidation\b[^>]*\bsqref="([^"]+)"[^>]*>([\s\S]*?)<\/dataValidation>/g)];
  assert.equal(validations.length, fields.length);
  const occupied = new Set();
  for (const [, range, content] of validations) {
    assert.doesNotMatch(content, /[{}]/);
    const match = /^([A-Z]+)(\d+):\1(\d+)$/.exec(range);
    assert.ok(match, range);
    for (let row = Number(match[2]); row <= Number(match[3]); row++) {
      const cell = `${match[1]}${row}`;
      assert.equal(occupied.has(cell), false, `Validación duplicada: ${cell}`);
      occupied.add(cell);
    }
  }
  const formats = [...xml.matchAll(/<cfRule\b[^>]*priority="(\d+)"[^>]*>([\s\S]*?)<\/cfRule>/g)];
  assert.ok(formats.length > 0);
  assert.equal(new Set(formats.map(match => match[1])).size, formats.length);
  formats.forEach(([, , content]) => assert.doesNotMatch(content, /[{}]/));
});

test('ID_FUENTE_NACIONAL acepta la etiqueta exacta con o sin guion, no etiquetas inventadas', () => {
  const field = { name: 'ID_FUENTE_NACIONAL', datatype: 'Texto Largo', comment: 'Numérico (2)', dropdown_options: ['1 - Recursos IES', '2 - Recursos públicos'] };
  assert.equal(onlineError(field, '1 Recursos IES'), '');
  assert.equal(onlineError(field, '1 - Recursos IES'), '');
  assert.ok(onlineError(field, '1 Recursos inventados'));
});

const { clearTemplateWorkbookInputs } = require('../app/utils/templateUtils.ts');

test('descarga vacía conserva encabezados, notas, formatos, validaciones y hojas auxiliares', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Captura');
  sheet.addRow(['AÑO', 'CODIGO', 'NOMBRE']);
  sheet.addRow([2026, '063', 'Dato del Excel original']);
  sheet.addRow([2026, '170', 'Dato guardado']);
  sheet.getCell('C2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FF00' } };
  sheet.getCell('C1').note = 'Nombre del registro';
  const fields = [{ name: 'AÑO', datatype: 'Entero' }, { name: 'CODIGO', comment: 'Numérico (3)' }, { name: 'NOMBRE', comment: 'Alfabético (100)' }];
  applyValidatorDropdowns({ workbook: book, worksheet: sheet, fields, validators: [], endRow: 5 });
  const info = book.addWorksheet('INFO');
  info.addRow(['Instrucciones']);
  info.addRow(['Consultar los códigos antes de diligenciar.']);
  const sources = book.getWorksheet('_Listas');
  sources.getCell('Z1').value = 'Catálogo auxiliar';
  clearTemplateWorkbookInputs(book, [{ name: 'Captura', fields }, { name: 'INFO', fields: [] }]);
  const saved = new ExcelJS.Workbook();
  await saved.xlsx.load(await book.xlsx.writeBuffer());
  const capture = saved.getWorksheet('Captura');
  assert.equal(capture.getCell('A1').value, 'AÑO');
  assert.ok(capture.getCell('C1').note);
  for (const address of ['A2', 'B2', 'C2', 'A3', 'B3', 'C3']) assert.equal(capture.getCell(address).value, null, address);
  assert.equal(capture.getCell('B2').dataValidation.type, 'custom');
  assert.equal(capture.getCell('B2').numFmt, '@');
  assert.equal(capture.getCell('C2').fill.fgColor.argb, 'FF00FF00');
  assert.equal(saved.getWorksheet('INFO').getCell('A2').value, 'Consultar los códigos antes de diligenciar.');
  assert.equal(saved.getWorksheet('_Listas').getCell('Z1').value, 'Catálogo auxiliar');
});

test('descarga vacía respeta encabezados desplazados y nombres de hoja ajustados', () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Nombre ajustado');
  sheet.getCell('A1').value = 'Instrucciones';
  sheet.getCell('C3').value = 'CODIGO';
  sheet.getCell('C4').value = '123';
  sheet.getCell('D3').value = 'CAMPO_NUEVO';
  sheet.getCell('D4').value = 'Texto de ejemplo';
  const fields = [{ name: 'CODIGO', column: 3, header_row: 3 }, { name: 'CAMPO_NUEVO' }];
  clearTemplateWorkbookInputs(book, [{ name: 'Nombre largo original', fields }], [], new Map([['Nombre largo original', 'Nombre ajustado']]));
  assert.equal(sheet.getCell('A1').value, 'Instrucciones');
  assert.equal(sheet.getCell('C3').value, 'CODIGO');
  assert.equal(sheet.getCell('D3').value, 'CAMPO_NUEVO');
  assert.equal(sheet.getCell('C4').value, null);
  assert.equal(sheet.getCell('D4').value, null);
});

test('CODIGO_CONVENIO online acepta letras, números y separadores hasta 30 caracteres', () => {
  const { normalizeAgreementCodeField, getFieldMaxLength } = require('../app/utils/fieldConstraints.ts');
  const field = { name: 'CODIGO_CONVENIO', datatype: 'Texto Largo', content_type: 'alphabetic', comment: 'Obligatario si la movilidad se realiza en virtud de algún convenio, alfabético (30). Código o número del convenio' };
  for (const value of ['032-2023', 'CV-001/2026', '0032', 'Convenio 12', 'ABC']) {
    assert.equal(acceptsFieldTextInput(field, value), true, value);
    assert.equal(onlineError(field, value), '', value);
  }
  assert.ok(onlineError(field, 'x'.repeat(31)));
  const normalized = normalizeAgreementCodeField(field);
  assert.equal(normalized.content_type, 'alphanumeric');
  assert.match(normalized.comment, /alfanumérico \(30\)/);
  assert.match(normalized.comment, /si la movilidad/);
  assert.equal(getFieldMaxLength({ name: 'CODIGO_CONVENIO' }), 30);
  assert.equal(acceptsFieldTextInput({ name: 'OTRO_NOMBRE', content_type: 'alphabetic' }, 'Entidad 2026'), false);
});

test('CODIGO_CONVENIO Excel corrige notas antiguas y mantiene códigos como texto', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Movilidad');
  const oldComment = 'Obligatario si la movilidad se realiza en virtud de algún convenio, alfabético (30). Código o número del convenio';
  sheet.getCell('A1').value = 'CODIGO_CONVENIO';
  sheet.getCell('A1').note = oldComment;
  const field = { name: 'CODIGO_CONVENIO', datatype: 'Texto Largo', content_type: 'alphabetic', comment: oldComment };
  applyWorkbookSheetDropdowns({ workbook: book, workbookSheets: [{ name: 'Movilidad', fields: [field] }], validators: [],
    originalCommentsBySheet: new Map([['Movilidad', new Map([['A1', oldComment]])]]), endRow: 5 });
  sheet.getCell('A2').value = '032-2023';
  sheet.getCell('A3').value = '0032';
  const saved = new ExcelJS.Workbook();
  await saved.xlsx.load(await book.xlsx.writeBuffer());
  const result = saved.getWorksheet('Movilidad');
  const note = result.getCell('A1').note;
  const text = typeof note === 'string' ? note : note.texts.map(item => item.text).join('');
  assert.match(text, /alfanumérico \(30\)/);
  assert.doesNotMatch(text, /\balfabético\b/);
  assert.match(text, /si la movilidad/);
  assert.equal(result.getCell('A2').value, '032-2023');
  assert.equal(result.getCell('A3').value, '0032');
  assert.equal(result.getCell('A3').numFmt, '@');
  for (const address of ['A2', 'A5']) {
    const validation = result.getCell(address).dataValidation;
    assert.equal(validation.type, 'textLength');
    assert.deepEqual(validation.formulae, [30]);
    assert.equal(validation.errorStyle, 'stop');
    assert.match(validation.prompt, /alfanumérico/);
  }
});
