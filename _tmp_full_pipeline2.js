global.DOMParser = require('C:/Users/UNIBAGUE/Documents/Miro/Back_Miro/node_modules/@xmldom/xmldom').DOMParser;
global.XMLSerializer = require('C:/Users/UNIBAGUE/Documents/Miro/Back_Miro/node_modules/@xmldom/xmldom').XMLSerializer;
const fs = require('fs');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const {
  loadWorkbookFromBase64,
  extractWorkbookCommentsFromBase64,
  applyWorkbookSheetDropdowns,
  ensureMissingWorkbookSheets,
  applyFieldCommentNote,
  reorderWorkbookSheets,
  appendMissingFieldComments,
  patchNoteSize,
} = require('./_tmp_templateUtils_compiled.js');

const SCRATCH = 'C:/Users/UNIBAGUE/AppData/Local/Temp/claude/c--Users-UNIBAGUE-Documents-Miro-Back-Miro/282eb1dc-730c-4458-88eb-4175bc6a5660/scratchpad';

const getTemplateWorksheets = (template) => {
  const workbookSheets = (template.workbook_sheets || []).filter(
    (sheet) => sheet.preserveOriginalContent || sheet.rawRows?.length || sheet.fields?.length > 0
  );
  if (workbookSheets.length > 0) return workbookSheets;
  return [{ name: template.name, fields: template.fields }];
};

async function main() {
  const base64 = fs.readFileSync(`${SCRATCH}/mov_est_base64.txt`, 'utf8');
  const template = JSON.parse(fs.readFileSync(`${SCRATCH}/mov_est_template.json`, 'utf8'));
  template.original_workbook_base64 = base64;
  template.validators = [];

  const worksheets = getTemplateWorksheets(template);

  const workbook = await loadWorkbookFromBase64(base64);
  const originalCommentsBySheet = await extractWorkbookCommentsFromBase64(base64);
  ensureMissingWorkbookSheets(workbook, worksheets);
  workbook.worksheets.forEach((ws) => {
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell({ includeEmpty: false }, (cell) => {
        const m = cell._model;
        if (m && 'note' in m) delete m.note;
      });
    });
  });
  for (const [sheetName, sheetComments] of originalCommentsBySheet.entries()) {
    const ws = workbook.getWorksheet(sheetName);
    if (!ws) continue;
    for (const [cellRef, noteText] of sheetComments.entries()) {
      const rowNum = parseInt(cellRef.replace(/[A-Za-z$]/g, ''), 10);
      if (rowNum !== 1 || !noteText) continue;
      applyFieldCommentNote(ws.getCell(cellRef), noteText);
    }
  }
  (template.workbook_sheets || []).forEach((sheet) => {
    const ws = workbook.getWorksheet(sheet.name);
    if (!ws || !sheet.cellNotes?.length) return;
    sheet.cellNotes.forEach((note) => {
      if (note?.row === 1 && note?.col && note?.note) {
        applyFieldCommentNote(ws.getCell(note.row, note.col), note.note);
      }
    });
  });
  applyWorkbookSheetDropdowns({
    workbook,
    workbookSheets: worksheets,
    validators: template.validators,
    originalCommentsBySheet,
    preloadedValidatorOptions: {},
  });
  reorderWorkbookSheets(workbook, worksheets.map((sheet) => sheet.name));

  let buffer = await workbook.xlsx.writeBuffer();
  const fieldCommentByName = new Map(
    (template.fields || [])
      .filter((f) => f?.name && f.comment)
      .map((f) => [f.name, f.comment])
  );
  const augmentedForInjection = worksheets.map((sheet) => ({
    ...sheet,
    fields: (sheet.fields || []).map((field) => ({
      ...field,
      comment: field.comment || fieldCommentByName.get(field.name) || "",
    })),
  }));
  buffer = await appendMissingFieldComments(buffer, augmentedForInjection);
  buffer = await patchNoteSize(buffer);

  fs.writeFileSync(`${SCRATCH}/final_output2.xlsx`, Buffer.from(buffer));
  console.log('Guardado. Tamano:', buffer.byteLength);

  // ---- DEEP CHECKS ----
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
  console.log('\nArchivos:', names);

  // 1. Check all worksheet XMLs for formula length + basic sanity
  for (const name of names.filter(n => /xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
    const xml = await zip.file(name).async('text');
    const formulas = [...xml.matchAll(/<formula1>([\s\S]*?)<\/formula1>/g)].map(m => m[1]);
    const maxLen = formulas.reduce((max, f) => Math.max(max, f.length), 0);
    console.log(`\n${name}: ${formulas.length} formula1, longitud max (con escapes xml)=${maxLen}`);
    // decode xml entities roughly to get real char count
    const decode = (s) => s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
    const realMaxLen = formulas.reduce((max, f) => Math.max(max, decode(f).length), 0);
    console.log(`  longitud max real (decodificada)=${realMaxLen}`);
    if (realMaxLen > 255) {
      console.log('  *** POSIBLE PROBLEMA: formula mayor a 255 caracteres (limite historico de Excel para validacion) ***');
      const longest = formulas.map(decode).sort((a,b)=>b.length-a.length)[0];
      console.log('  formula mas larga:', longest);
    }
    // sqref overlap check
    const sqrefs = [...xml.matchAll(/sqref=\"([^\"]+)\"/g)].map(m => m[1]);
    console.log('  sqrefs:', sqrefs.length, sqrefs.slice(0,25));
  }

  // 2. workbook.xml sheets vs rels vs Content_Types cross-check
  const wbXml = await zip.file('xl/workbook.xml').async('text');
  console.log('\nworkbook.xml <sheets>:', wbXml.match(/<sheets>[\s\S]*?<\/sheets>/)?.[0]);

  const wbRels = await zip.file('xl/_rels/workbook.xml.rels').async('text');
  console.log('\nworkbook.xml.rels:', wbRels);
}

main().catch(e => { console.error('ERROR FATAL:', e); process.exit(1); });
