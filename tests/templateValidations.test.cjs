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
    assert.match(validation.formulae[0], /SEARCH\(\{"0","1","2","3","4","5","6","7","8","9"\}/);
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
