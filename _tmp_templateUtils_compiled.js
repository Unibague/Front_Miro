"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchNoteBackgroundColor = exports.patchNoteSize = exports.reorderWorkbookSheets = exports.ensureMissingWorkbookSheets = exports.createFieldsWorksheet = exports.applyDatatypeValidation = exports.applyFieldCommentNote = exports.fetchValidatorOptionsForFields = exports.applyWorkbookSheetDropdowns = exports.applyValidatorDropdowns = exports.extractWorkbookCommentsFromBase64 = exports.appendMissingFieldComments = exports.injectWorkbookSheetHeaderComments = exports.getExcelCellAddress = exports.populateWorksheetWithMergedRows = exports.populateWorksheetWithFilledData = exports.mergeFilledDataAcrossDependencies = exports.formatTemplateDateValue = exports.toExcelCellValue = exports.copyCellPresentation = exports.applyAdditionalFieldHeaderStyle = exports.getSheetDataStartRow = exports.cloneExcelValue = exports.loadWorkbookFromBase64 = exports.base64ToArrayBuffer = exports.arrayBufferToBase64 = exports.getConfiguredFieldPosition = exports.shouldAddWorksheet = exports.sanitizeSheetName = void 0;
const exceljs_1 = __importDefault(require("exceljs"));
const jszip_1 = __importDefault(require("jszip"));
const sanitizeSheetName = (name) => {
    return name.replace(/[/\\?*[\]]/g, '').substring(0, 31);
};
exports.sanitizeSheetName = sanitizeSheetName;
const shouldAddWorksheet = (workbook, sheetName) => {
    return !workbook.getWorksheet(sheetName);
};
exports.shouldAddWorksheet = shouldAddWorksheet;
// Cuando `allFields` se provee, los campos sin `column`/`header_row` propio
// (típicamente campos adicionales agregados a una plantilla ya publicada,
// que se guardan con locked:false y sin posición) reciben una columna libre
// real (después de la última columna configurada del archivo original) en
// vez de `fieldIndex + 1`, que podía coincidir con la columna de otro campo
// base y pisar sus valores al exportar.
const getConfiguredFieldPosition = (field, fieldIndex, allFields) => {
    const configuredColumn = Number(field.column);
    const configuredHeaderRow = Number(field.header_row);
    const hasConfiguredColumn = Number.isFinite(configuredColumn) && configuredColumn > 0;
    const hasConfiguredHeaderRow = Number.isFinite(configuredHeaderRow) && configuredHeaderRow > 0;
    if (hasConfiguredColumn) {
        return {
            col: configuredColumn,
            headerRow: hasConfiguredHeaderRow ? configuredHeaderRow : 1,
            isFallbackColumn: false,
        };
    }
    if (allFields?.length) {
        const maxConfiguredCol = allFields.reduce((max, f) => {
            const c = Number(f.column);
            return Number.isFinite(c) && c > 0 ? Math.max(max, c) : max;
        }, 0);
        const unconfiguredBefore = allFields.slice(0, fieldIndex).filter((f) => {
            const c = Number(f.column);
            return !(Number.isFinite(c) && c > 0);
        }).length;
        const defaultHeaderRow = allFields.reduce((row, f) => {
            const hr = Number(f.header_row);
            return Number.isFinite(hr) && hr > 0 ? hr : row;
        }, 1);
        return {
            col: maxConfiguredCol + 1 + unconfiguredBefore,
            headerRow: hasConfiguredHeaderRow ? configuredHeaderRow : defaultHeaderRow,
            isFallbackColumn: true,
        };
    }
    return {
        col: fieldIndex + 1,
        headerRow: hasConfiguredHeaderRow ? configuredHeaderRow : 1,
        isFallbackColumn: true,
    };
};
exports.getConfiguredFieldPosition = getConfiguredFieldPosition;
const getValidateWithText = (validateWith) => {
    if (!validateWith)
        return "";
    if (typeof validateWith === "string")
        return validateWith.trim();
    return String(validateWith.name || validateWith.id || "").trim();
};
const splitValidateWithReference = (validateWith) => {
    const text = getValidateWithText(validateWith);
    const parts = text.split(" - ");
    return {
        text,
        validatorName: (parts[0] || "").trim(),
        columnName: parts.slice(1).join(" - ").trim(),
    };
};
const findValidatorByName = (validators, name = "") => validators.find((item) => normalizeToken(item.name) === normalizeToken(name));
// Nombre de columna EXACTAMENTE "DESCRIPCION"/"NOMBRE": la columna compañera
// genérica que casi toda tabla de validación tiene junto a su columna de
// código. Emparejar un campo contra ella por solo coincidir el nombre daba
// falsos positivos (ej. un campo de texto libre llamado "Descripción"
// enganchándose con la primera tabla que tuviera esa columna). Debe ser
// coincidencia EXACTA, no "contiene": nombres compuestos como
// "NOMBRE_PROGRAMA" o "DESCRIPCION_DERECHO_PECUNIARIO" son columnas
// específicas y válidas para el auto-match, no la genérica.
const isGenericDescriptionColumnName = (name) => {
    const normalized = normalizeToken(name);
    return normalized === "DESCRIPCION" || normalized === "NOMBRE";
};
const findValidatorForField = (field, validators) => {
    const { validatorName, columnName } = splitValidateWithReference(field.validate_with);
    if (validatorName) {
        const validator = findValidatorByName(validators, validatorName);
        if (validator)
            return { validator, columnName: columnName || field.name };
    }
    const fieldNorm = normalizeToken(field.name);
    for (const validator of validators) {
        const columnMatch = (validator.columns?.some((column) => !isGenericDescriptionColumnName(column.name) && normalizeToken(column.name) === fieldNorm)) ||
            (validator.values.length > 0 &&
                Object.keys(validator.values[0]).some((key) => !isGenericDescriptionColumnName(key) && normalizeToken(key) === fieldNorm));
        if (columnMatch)
            return { validator, columnName: field.name };
    }
    return null;
};
const getFieldCommentForNote = (field) => {
    return field.comment
        ? String(field.comment).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
        : "";
};
const applyHeaderCommentNote = (worksheet, field, fieldIndex, startRow = 2, endRow = 1000, _fallbackOptions = []) => {
    const comment = getFieldCommentForNote(field);
    if (!comment)
        return;
    const { col, headerRow } = (0, exports.getConfiguredFieldPosition)(field, fieldIndex);
    const firstDataRow = Math.max(startRow, headerRow + 1);
    for (let row = firstDataRow; row <= endRow; row++) {
        (0, exports.applyFieldCommentNote)(worksheet.getCell(row, col), comment);
    }
};
const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize);
        binary += String.fromCharCode(...Array.from(chunk));
    }
    return btoa(binary);
};
exports.arrayBufferToBase64 = arrayBufferToBase64;
const base64ToArrayBuffer = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
};
exports.base64ToArrayBuffer = base64ToArrayBuffer;
const loadWorkbookFromBase64 = async (base64) => {
    const workbook = new exceljs_1.default.Workbook();
    await workbook.xlsx.load((0, exports.base64ToArrayBuffer)(base64));
    // Bug de ExcelJS: si el .xlsx original no trae su propia parte "theme"
    // (algunos archivos no la incluyen), el workbook queda con `themes: {}`
    // (objeto vacío, no undefined). Al reescribir con writeBuffer(), el XML
    // writer de ExcelJS de todas formas declara la relación/Content-Type hacia
    // "xl/theme/theme1.xml" (fallback solo aplica cuando `themes` es falsy),
    // pero como el objeto está vacío nunca escribe ese archivo → queda una
    // referencia rota en el paquete .xlsx. Excel detecta esto al abrirlo y
    // dispara su reparación automática, que de paso descarta validaciones de
    // datos y otras partes del archivo. clearThemes() deja `themes` en
    // `undefined`, activando el fallback real de ExcelJS (su tema por
    // defecto), que sí se escribe completo.
    if (!workbook.model.themes || Object.keys(workbook.model.themes).length === 0) {
        workbook.clearThemes();
    }
    return workbook;
};
exports.loadWorkbookFromBase64 = loadWorkbookFromBase64;
const cloneExcelValue = (value) => {
    if (value === undefined || value === null)
        return value;
    return JSON.parse(JSON.stringify(value));
};
exports.cloneExcelValue = cloneExcelValue;
const getSheetDataStartRow = (fields) => {
    const headerRows = fields
        .map((field, index) => (0, exports.getConfiguredFieldPosition)(field, index, fields).headerRow)
        .filter((row) => Number.isFinite(row) && row > 0);
    return (headerRows.length ? Math.min(...headerRows) : 1) + 1;
};
exports.getSheetDataStartRow = getSheetDataStartRow;
// Mismo estilo de encabezado verde que usa la descarga de la plantilla base
// (app/admin/templates/page.tsx) para los campos agregados (locked: false),
// para que un campo adicional se vea igual sin importar desde qué pantalla se descargue.
const applyAdditionalFieldHeaderStyle = (worksheet, cell, fieldName, col) => {
    cell.value = fieldName;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    const colObj = worksheet.getColumn(col);
    if (!colObj.width || colObj.width < 20)
        colObj.width = 20;
};
exports.applyAdditionalFieldHeaderStyle = applyAdditionalFieldHeaderStyle;
const copyCellPresentation = (target, source) => {
    target.style = (0, exports.cloneExcelValue)(source.style || {});
    if (source.dataValidation)
        target.dataValidation = (0, exports.cloneExcelValue)(source.dataValidation);
    if (source.note)
        target.note = (0, exports.cloneExcelValue)(source.note);
};
exports.copyCellPresentation = copyCellPresentation;
const toExcelCellValue = (value) => {
    if (value === undefined || value === null || value === "")
        return null;
    if (Array.isArray(value))
        return value.join(", ");
    if (typeof value === "object") {
        if ("text" in value || "hyperlink" in value)
            return value;
        return JSON.stringify(value);
    }
    return value;
};
exports.toExcelCellValue = toExcelCellValue;
const padDatePart = (value) => String(value).padStart(2, "0");
const JS_DATE_TOSTRING_MONTHS = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
// Formatea fechas de datos de plantilla sin aplicar la zona horaria local.
// Excel suele serializar una fecha sin hora como medianoche UTC; convertirla
// a America/Bogota desplaza el valor al dia anterior. Usar UTC conserva el dia
// calendario que el productor envio originalmente.
const formatTemplateDateValue = (value, fieldName = "") => {
    if (value === null || value === undefined || value === "")
        return null;
    const raw = value instanceof Date ? value.toISOString() : String(value).trim();
    const isDateField = /(^|[^A-Z])(FECHA|DATE)([^A-Z]|$)/i.test(fieldName);
    const isRecognizableDate = /^\d{2}\/\d{2}\/\d{4}$/.test(raw) ||
        /^\d{4}[-/]\d{2}[-/]\d{2}(?:T.*)?$/.test(raw) ||
        /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s/i.test(raw) ||
        /GMT[+-]\d{4}/i.test(raw);
    if (!isDateField && !isRecognizableDate && !(value instanceof Date))
        return null;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw))
        return raw;
    const calendarMatch = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (calendarMatch) {
        return `${calendarMatch[3]}/${calendarMatch[2]}/${calendarMatch[1]}`;
    }
    // Salida cruda de Date.toString() en JS, ej. "Mon Mar 02 2026 19:00:00
    // GMT-0500 (hora estandar de Colombia)". El dia/mes/anio ya impresos ahi
    // son la fecha calendario local que se guardo; si en cambio se reconvierte
    // con new Date(raw) y se leen los campos en UTC, el offset de zona horaria
    // incluido en el propio texto desplaza el resultado un dia.
    const jsDateStringMatch = raw.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\s+(\d{4})/i);
    if (jsDateStringMatch) {
        const month = JS_DATE_TOSTRING_MONTHS[jsDateStringMatch[1]];
        if (month) {
            return `${jsDateStringMatch[2]}/${padDatePart(month)}/${jsDateStringMatch[3]}`;
        }
    }
    const parsed = value instanceof Date ? value : new Date(raw);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return `${padDatePart(parsed.getUTCDate())}/${padDatePart(parsed.getUTCMonth() + 1)}/${parsed.getUTCFullYear()}`;
};
exports.formatTemplateDateValue = formatTemplateDateValue;
// Combina el filled_data de varias dependencias en uno solo, concatenando los
// valores de cada campo (por nombre de campo + hoja) para reportes que
// consolidan la informacion de todos los productores en un solo archivo.
const mergeFilledDataAcrossDependencies = (entries) => {
    const byKey = new Map();
    for (const entry of entries) {
        for (const fd of entry.filled_data || []) {
            const sheetKey = fd.sheet_name || fd.sheet || fd.sheetName || '';
            const key = `${fd.field_name}::${sheetKey}`;
            const existing = byKey.get(key);
            if (existing) {
                existing.values = [...(existing.values || []), ...(fd.values || [])];
            }
            else {
                byKey.set(key, { ...fd, values: [...(fd.values || [])] });
            }
        }
    }
    return Array.from(byKey.values());
};
exports.mergeFilledDataAcrossDependencies = mergeFilledDataAcrossDependencies;
// El backend guarda las filas combinadas (mergedData) con las claves normalizadas
// a MAYUSCULAS_CON_GUIONES (ver normalizeFieldName en publishedTemplates.js), pero
// el nombre de campo configurado en la plantilla puede tener otra mayúscula/minúscula,
// espacios o tildes distintas. Sin esta normalización, cualquier campo cuyo nombre no
// coincida caracter a caracter queda vacío aunque el dato sí llegó del backend.
const normalizeFieldKey = (value) => normalizeToken(String(value ?? "")).replace(/[^A-Z0-9]/g, "");
const findRowValueByFieldName = (row, fieldName) => {
    if (Object.prototype.hasOwnProperty.call(row, fieldName))
        return row[fieldName];
    const target = normalizeFieldKey(fieldName);
    const matchedKey = Object.keys(row).find((key) => normalizeFieldKey(key) === target);
    return matchedKey ? row[matchedKey] : undefined;
};
// Rellena la hoja de la plantilla ORIGINAL (tal cual fue subida) con el
// filled_data crudo (por campo, con su arreglo de valores), preservando el
// estilo/validacion de cada celda base pero SIN volver a aplicar dropdowns:
// es para generar un archivo final de solo lectura, no para editarlo de nuevo.
const populateWorksheetWithFilledData = (worksheet, fields, filledData, sheetName) => {
    if (!fields.length)
        return;
    let relevant = sheetName
        ? filledData.filter((fd) => (fd.sheet_name || fd.sheet || fd.sheetName) === sheetName)
        : filledData;
    if (relevant.length === 0 && sheetName) {
        const sheetFieldNames = new Set(fields.map((field) => field.name));
        relevant = filledData.filter((fd) => sheetFieldNames.has(fd.field_name));
    }
    const numRows = relevant.reduce((max, fd) => (Math.max(max, Array.isArray(fd.values) ? fd.values.length : 0)), 0);
    if (!numRows)
        return;
    const startRow = (0, exports.getSheetDataStartRow)(fields);
    const templateRow = worksheet.getRow(startRow);
    if (numRows > 1) {
        worksheet.insertRows(startRow + 1, Array.from({ length: numRows - 1 }, () => []));
    }
    const positions = fields.map((field, index) => (0, exports.getConfiguredFieldPosition)(field, index, fields));
    const headerRow = Math.max(1, startRow - 1);
    for (let i = 0; i < numRows; i++) {
        const dataRow = startRow + i;
        fields.forEach((field, colIdx) => {
            const { col: fieldCol } = positions[colIdx];
            const fd = relevant.find((entry) => normalizeFieldKey(entry.field_name) === normalizeFieldKey(field.name));
            const val = fd?.values?.[i] ?? null;
            const targetCell = worksheet.getCell(dataRow, fieldCol);
            (0, exports.copyCellPresentation)(targetCell, templateRow.getCell(fieldCol));
            targetCell.value = (0, exports.toExcelCellValue)((0, exports.formatTemplateDateValue)(val, field.name) ?? val);
        });
    }
    // Los campos sin columna configurada (agregados a la plantilla ya publicada)
    // caen en una columna que no existía en el archivo original: su encabezado
    // no está escrito físicamente, hay que agregarlo con el mismo estilo verde
    // que usa la descarga de la plantilla base para campos añadidos.
    fields.forEach((field, colIdx) => {
        const { col, isFallbackColumn } = positions[colIdx];
        if (!isFallbackColumn)
            return;
        (0, exports.applyAdditionalFieldHeaderStyle)(worksheet, worksheet.getCell(headerRow, col), field.name, col);
    });
};
exports.populateWorksheetWithFilledData = populateWorksheetWithFilledData;
// Rellena la hoja de la plantilla ORIGINAL con datos YA CONSOLIDADOS por
// fila (un objeto {nombre_campo: valor} por fila, ej. la respuesta de
// /pTemplates/dimension/mergedData que ya junta el envío de TODAS las
// dependencias en una tabla), a diferencia de populateWorksheetWithFilledData
// que espera el formato "por campo con arreglo de valores". Se usa para las
// descargas administrativas que muestran una fila por envío, preservando la
// estructura/colores/hojas del archivo original y agregando columnas extra
// (ej. "Dependencia") que no forman parte de los campos propios de la plantilla.
const populateWorksheetWithMergedRows = (worksheet, fields, rows, extraColumns = []) => {
    if (!fields.length || !rows.length)
        return;
    const startRow = (0, exports.getSheetDataStartRow)(fields);
    const headerRow = Math.max(1, startRow - 1);
    const templateRow = worksheet.getRow(startRow);
    if (rows.length > 1) {
        worksheet.insertRows(startRow + 1, Array.from({ length: rows.length - 1 }, () => []));
    }
    const positions = fields.map((field, index) => (0, exports.getConfiguredFieldPosition)(field, index, fields));
    const maxCol = positions.length ? Math.max(...positions.map((p) => p.col)) : 0;
    rows.forEach((row, i) => {
        const dataRow = startRow + i;
        fields.forEach((field, colIdx) => {
            const { col } = positions[colIdx];
            const cell = worksheet.getCell(dataRow, col);
            (0, exports.copyCellPresentation)(cell, templateRow.getCell(col));
            const rawValue = findRowValueByFieldName(row, field.name);
            cell.value = (0, exports.toExcelCellValue)((0, exports.formatTemplateDateValue)(rawValue, field.name) ?? rawValue);
        });
        extraColumns.forEach((key, extraIdx) => {
            const col = maxCol + 1 + extraIdx;
            const cell = worksheet.getCell(dataRow, col);
            (0, exports.copyCellPresentation)(cell, templateRow.getCell(col));
            cell.value = (0, exports.toExcelCellValue)(findRowValueByFieldName(row, key));
        });
    });
    // Los campos sin columna configurada (agregados a la plantilla ya publicada)
    // caen en una columna que no existía en el archivo original, así que su
    // encabezado no está escrito físicamente: hay que agregarlo con el mismo
    // estilo verde que usa la descarga de la plantilla base para campos añadidos.
    fields.forEach((field, colIdx) => {
        const { col, isFallbackColumn } = positions[colIdx];
        if (!isFallbackColumn)
            return;
        (0, exports.applyAdditionalFieldHeaderStyle)(worksheet, worksheet.getCell(headerRow, col), field.name, col);
    });
    extraColumns.forEach((key, extraIdx) => {
        const col = maxCol + 1 + extraIdx;
        const headerCell = worksheet.getCell(headerRow, col);
        if (headerCell.value == null || headerCell.value === "")
            headerCell.value = key;
    });
};
exports.populateWorksheetWithMergedRows = populateWorksheetWithMergedRows;
const toColumnLetter = (index) => {
    let n = index;
    let letters = "";
    while (n > 0) {
        const rem = (n - 1) % 26;
        letters = String.fromCharCode(65 + rem) + letters;
        n = Math.floor((n - 1) / 26);
    }
    return letters;
};
const getExcelCellAddress = (row, col) => `${toColumnLetter(col)}${row}`;
exports.getExcelCellAddress = getExcelCellAddress;
const resolveZipPath = (fromPath, target) => {
    const normalizedTarget = target.replace(/\\/g, "/");
    if (normalizedTarget.startsWith("/"))
        return normalizedTarget.replace(/^\/+/, "");
    const parts = fromPath.split("/").slice(0, -1);
    normalizedTarget.split("/").forEach((part) => {
        if (!part || part === ".")
            return;
        if (part === "..") {
            parts.pop();
            return;
        }
        parts.push(part);
    });
    return parts.join("/");
};
const parseXml = (xml) => new DOMParser().parseFromString(xml, "application/xml");
const getRelTargets = (relsXml) => {
    const rels = new Map();
    const doc = parseXml(relsXml);
    Array.from(doc.getElementsByTagName("Relationship")).forEach((node) => {
        const id = node.getAttribute("Id") || "";
        const target = node.getAttribute("Target") || "";
        const type = node.getAttribute("Type") || "";
        if (id && target)
            rels.set(id, { target, type });
    });
    return rels;
};
const getCommentNodeText = (node) => {
    const textNodes = Array.from(node.getElementsByTagName("t"));
    if (textNodes.length > 0) {
        return textNodes.map((item) => item.textContent || "").join("").trim();
    }
    return (node.textContent || "").trim();
};
const getWorksheetPathMap = async (zip) => {
    const worksheetPathByName = new Map();
    const workbookPath = "xl/workbook.xml";
    const workbookXml = await zip.file(workbookPath)?.async("text");
    const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
    if (!workbookXml || !workbookRelsXml)
        return worksheetPathByName;
    const workbookRels = getRelTargets(workbookRelsXml);
    const workbookDoc = parseXml(workbookXml);
    const sheets = Array.from(workbookDoc.getElementsByTagName("sheet"));
    sheets.forEach((sheetNode) => {
        const sheetName = sheetNode.getAttribute("name") || "";
        const relId = sheetNode.getAttribute("r:id") ||
            sheetNode.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ||
            sheetNode.getAttribute("id") ||
            "";
        const sheetRel = workbookRels.get(relId);
        if (!sheetName || !sheetRel?.target)
            return;
        worksheetPathByName.set(sheetName, resolveZipPath(workbookPath, sheetRel.target));
    });
    return worksheetPathByName;
};
const getWorksheetRelsPath = (worksheetPath) => {
    const parts = worksheetPath.split("/");
    const worksheetFileName = parts.pop() || "";
    return `${parts.join("/")}/_rels/${worksheetFileName}.rels`;
};
const createRelationshipsDoc = () => parseXml('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
const getNextRelId = (relsDoc) => {
    const used = new Set(Array.from(relsDoc.getElementsByTagName("Relationship"))
        .map((node) => node.getAttribute("Id") || "")
        .filter(Boolean));
    let index = 1;
    while (used.has(`rIdMiroComments${index}`))
        index += 1;
    return `rIdMiroComments${index}`;
};
const getSheetCommentsFromRelationships = async (zip, worksheetPath) => {
    const comments = new Map();
    const relsXml = await zip.file(getWorksheetRelsPath(worksheetPath))?.async("text");
    if (!relsXml)
        return comments;
    const sheetRels = getRelTargets(relsXml);
    for (const rel of sheetRels.values()) {
        const normalizedType = rel.type.toLowerCase();
        if (!normalizedType.includes("/comments") || normalizedType.includes("/threadedcomments")) {
            continue;
        }
        const commentsPath = resolveZipPath(worksheetPath, rel.target);
        const commentsXml = await zip.file(commentsPath)?.async("text");
        if (!commentsXml)
            continue;
        const commentsDoc = parseXml(commentsXml);
        Array.from(commentsDoc.getElementsByTagName("comment")).forEach((commentNode) => {
            const ref = commentNode.getAttribute("ref") || "";
            const text = getCommentNodeText(commentNode);
            if (ref && text)
                comments.set(ref.replace(/\$/g, ""), text);
        });
    }
    return comments;
};
const columnLettersToNumber = (letters) => {
    return letters.toUpperCase().split("").reduce((total, char) => {
        const value = char.charCodeAt(0) - 64;
        return value >= 1 && value <= 26 ? total * 26 + value : total;
    }, 0);
};
const parseCellAddress = (ref) => {
    const match = /^([A-Z]+)(\d+)$/i.exec(ref.replace(/\$/g, ""));
    if (!match)
        return null;
    return {
        columnNumber: columnLettersToNumber(match[1]),
        rowNumber: Number(match[2]),
    };
};
const escapeXmlText = (str) => str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const buildCommentsXml = (comments) => {
    const commentElements = comments
        .map((c) => `<comment ref="${c.ref}" authorId="0"><text><r><t xml:space="preserve">${escapeXmlText(c.text)}</t></r></text></comment>`)
        .join("");
    return (`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<authors><author></author></authors>` +
        `<commentList>${commentElements}</commentList>` +
        `</comments>`);
};
const buildVmlShapeNodes = (comments, startShapeId = 1025) => comments
    .map((comment, index) => {
    const startColumn = Math.max(comment.columnNumber - 1, 0);
    const startRow = Math.max(comment.rowNumber - 1, 0);
    const endColumn = startColumn + 5;
    const endRow = startRow + 20;
    return (`<v:shape id="_x0000_s${startShapeId + index}" type="#_x0000_t202"` +
        ` style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:200pt;height:60pt;z-index:1;visibility:hidden"` +
        ` fillcolor="#ffffe1" o:insetmode="auto">` +
        `<v:fill color2="#ffffe1"/>` +
        `<v:shadow on="t" color="black" obscured="t"/>` +
        `<v:path o:connecttype="none"/>` +
        `<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>` +
        `<x:ClientData ObjectType="Note">` +
        `<x:MoveWithCells/><x:SizeWithCells/>` +
        `<x:Anchor>${startColumn}, 0, ${startRow}, 0, ${endColumn}, 0, ${endRow}, 0</x:Anchor>` +
        `<x:AutoFill>False</x:AutoFill>` +
        `<x:Row>${startRow}</x:Row><x:Column>${startColumn}</x:Column>` +
        `</x:ClientData></v:shape>`);
})
    .join("");
const buildVmlCommentsXml = (comments) => {
    const shapeNodes = buildVmlShapeNodes(comments);
    return (`<?xml version="1.0" encoding="UTF-8"?>` +
        `<xml xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
        `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>` +
        `<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe">` +
        `<v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/>` +
        `</v:shapetype>` +
        shapeNodes +
        `</xml>`);
};
const getVmlCellRefs = (vmlText) => {
    const refs = new Set();
    for (const match of vmlText.matchAll(/<x:Row>(\d+)<\/x:Row>[\s\S]*?<x:Column>(\d+)<\/x:Column>/g)) {
        const row = parseInt(match[1], 10) + 1;
        const col = parseInt(match[2], 10) + 1;
        refs.add((0, exports.getExcelCellAddress)(row, col));
    }
    return refs;
};
const appendMissingVmlShapes = (vmlText, comments) => {
    const existingRefs = getVmlCellRefs(vmlText);
    const missing = comments.filter((comment) => !existingRefs.has(comment.ref));
    if (missing.length === 0)
        return vmlText;
    const idMatches = [...vmlText.matchAll(/id="_x0000_s(\d+)"/g)];
    const maxId = idMatches.length > 0
        ? Math.max(...idMatches.map((match) => parseInt(match[1], 10)))
        : 1024;
    const newShapes = buildVmlShapeNodes(missing, maxId + 1);
    return vmlText.includes("</xml>")
        ? vmlText.replace("</xml>", `${newShapes}</xml>`)
        : `${vmlText}${newShapes}`;
};
const ensureWorksheetLegacyDrawing = async (zip, worksheetPath, vmlRelId) => {
    const worksheetXml = await zip.file(worksheetPath)?.async("text");
    if (!worksheetXml)
        return;
    const legacyDrawing = `<legacyDrawing r:id="${vmlRelId}"/>`;
    const withoutLegacyDrawing = worksheetXml
        .replace(/<legacyDrawing\b[\s\S]*?(?:\/>|>[\s\S]*?<\/legacyDrawing>)/g, "");
    zip.file(worksheetPath, withoutLegacyDrawing.replace("</worksheet>", `${legacyDrawing}</worksheet>`));
};
const ensureContentTypeEntry = (typesDoc, selector, createEntry) => {
    if (selector())
        return;
    typesDoc.getElementsByTagName("Types")[0]?.appendChild(createEntry(typesDoc));
};
const upsertWorksheetComments = async (zip, worksheetPath, comments, commentIndex) => {
    const serializer = new XMLSerializer();
    const relsPath = getWorksheetRelsPath(worksheetPath);
    const relsXml = await zip.file(relsPath)?.async("text");
    const relsDoc = relsXml ? parseXml(relsXml) : createRelationshipsDoc();
    const relationshipsNode = relsDoc.getElementsByTagName("Relationships")[0];
    if (!relationshipsNode)
        return null;
    let commentsTarget = "";
    let vmlTarget = "";
    let vmlRelId = "";
    const relationshipNodes = Array.from(relsDoc.getElementsByTagName("Relationship"));
    relationshipNodes.forEach((relationship) => {
        const type = String(relationship.getAttribute("Type") || "");
        const normalizedType = type.toLowerCase();
        if (normalizedType.includes("/comments") && !normalizedType.includes("/threadedcomments")) {
            commentsTarget || (commentsTarget = String(relationship.getAttribute("Target") || ""));
            return;
        }
        if (normalizedType.includes("/vmldrawing")) {
            vmlTarget || (vmlTarget = String(relationship.getAttribute("Target") || ""));
            vmlRelId || (vmlRelId = String(relationship.getAttribute("Id") || ""));
        }
    });
    if (commentsTarget && vmlTarget && vmlRelId) {
        const commentsPath = resolveZipPath(worksheetPath, commentsTarget);
        const vmlPath = resolveZipPath(worksheetPath, vmlTarget);
        const vmlText = await zip.file(vmlPath)?.async("text");
        if (vmlText) {
            zip.file(commentsPath, buildCommentsXml(comments));
            zip.file(vmlPath, appendMissingVmlShapes(vmlText, comments));
            await ensureWorksheetLegacyDrawing(zip, worksheetPath, vmlRelId);
            return commentsPath;
        }
    }
    relationshipNodes.forEach((relationship) => {
        const type = String(relationship.getAttribute("Type") || "");
        const normalizedType = type.toLowerCase();
        if ((normalizedType.includes("/comments") && !normalizedType.includes("/threadedcomments")) ||
            normalizedType.includes("/vmldrawing")) {
            relationship.parentNode?.removeChild(relationship);
        }
    });
    commentsTarget = `../commentsMiro${commentIndex}.xml`;
    vmlTarget = `../drawings/vmlDrawingMiro${commentIndex}.vml`;
    const commentsPath = resolveZipPath(worksheetPath, commentsTarget);
    const vmlPath = resolveZipPath(worksheetPath, vmlTarget);
    const commentsRelId = getNextRelId(relsDoc);
    vmlRelId = `${commentsRelId}Vml`;
    const commentsRel = relsDoc.createElement("Relationship");
    commentsRel.setAttribute("Id", commentsRelId);
    commentsRel.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments");
    commentsRel.setAttribute("Target", commentsTarget);
    relationshipsNode.appendChild(commentsRel);
    const vmlRel = relsDoc.createElement("Relationship");
    vmlRel.setAttribute("Id", vmlRelId);
    vmlRel.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing");
    vmlRel.setAttribute("Target", vmlTarget);
    relationshipsNode.appendChild(vmlRel);
    zip.file(relsPath, serializer.serializeToString(relsDoc));
    await ensureWorksheetLegacyDrawing(zip, worksheetPath, vmlRelId);
    zip.file(commentsPath, buildCommentsXml(comments));
    zip.file(vmlPath, buildVmlCommentsXml(comments));
    return commentsPath;
};
const injectWorkbookSheetHeaderComments = async (buffer, workbookSheets) => {
    if (!Array.isArray(workbookSheets) || workbookSheets.length === 0)
        return buffer;
    const zip = await jszip_1.default.loadAsync(buffer);
    const worksheetPathByName = await getWorksheetPathMap(zip);
    const contentTypeComments = [];
    let commentIndex = 1;
    for (const sheet of workbookSheets) {
        if (!sheet?.name || !Array.isArray(sheet.fields) || sheet.fields.length === 0)
            continue;
        const worksheetPath = worksheetPathByName.get(sheet.name);
        if (!worksheetPath || !zip.file(worksheetPath))
            continue;
        const commentsByRef = await getSheetCommentsFromRelationships(zip, worksheetPath);
        sheet.fields.forEach((field, fieldIndex) => {
            const comment = getFieldCommentForNote(field);
            if (!comment)
                return;
            const { col, headerRow } = (0, exports.getConfiguredFieldPosition)(field, fieldIndex, sheet.fields);
            commentsByRef.set((0, exports.getExcelCellAddress)(headerRow, col), comment);
        });
        const comments = Array.from(commentsByRef.entries())
            .map(([ref, text]) => {
            const parsed = parseCellAddress(ref);
            if (!parsed || !text)
                return null;
            return { ref, text, ...parsed };
        })
            .filter((item) => Boolean(item));
        if (comments.length === 0)
            continue;
        const commentsPath = await upsertWorksheetComments(zip, worksheetPath, comments, commentIndex);
        if (commentsPath)
            contentTypeComments.push(`/${commentsPath}`);
        commentIndex += 1;
    }
    const contentTypesXml = await zip.file("[Content_Types].xml")?.async("text");
    if (contentTypesXml && contentTypeComments.length > 0) {
        const serializer = new XMLSerializer();
        const typesDoc = parseXml(contentTypesXml);
        ensureContentTypeEntry(typesDoc, () => Array.from(typesDoc.getElementsByTagName("Default")).some((node) => node.getAttribute("Extension") === "vml" &&
            node.getAttribute("ContentType") === "application/vnd.openxmlformats-officedocument.vmlDrawing"), (doc) => {
            const node = doc.createElement("Default");
            node.setAttribute("Extension", "vml");
            node.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.vmlDrawing");
            return node;
        });
        contentTypeComments.forEach((partName) => {
            ensureContentTypeEntry(typesDoc, () => Array.from(typesDoc.getElementsByTagName("Override")).some((node) => node.getAttribute("PartName") === partName &&
                node.getAttribute("ContentType") === "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"), (doc) => {
                const node = doc.createElement("Override");
                node.setAttribute("PartName", partName);
                node.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml");
                return node;
            });
        });
        zip.file("[Content_Types].xml", serializer.serializeToString(typesDoc));
    }
    return zip.generateAsync({ type: "arraybuffer" });
};
exports.injectWorkbookSheetHeaderComments = injectWorkbookSheetHeaderComments;
/**
 * Appends VML comment shapes and comment entries for fields that don't yet have them
 * in the existing VML/comments files. Used for workbooks loaded from base64 where
 * ExcelJS preserves original VML but doesn't add shapes for newly set cell.note values.
 */
const appendMissingFieldComments = async (buffer, workbookSheets) => {
    if (!Array.isArray(workbookSheets) || workbookSheets.length === 0)
        return buffer;
    const zip = await jszip_1.default.loadAsync(buffer);
    const worksheetPathByName = await getWorksheetPathMap(zip);
    for (const sheet of workbookSheets) {
        if (!sheet?.name || !Array.isArray(sheet.fields) || sheet.fields.length === 0)
            continue;
        const worksheetPath = worksheetPathByName.get(sheet.name);
        if (!worksheetPath || !zip.file(worksheetPath))
            continue;
        const relsXml = await zip.file(getWorksheetRelsPath(worksheetPath))?.async("text");
        if (!relsXml)
            continue;
        const sheetRels = getRelTargets(relsXml);
        let commentsPath = "";
        let vmlPath = "";
        for (const rel of sheetRels.values()) {
            const type = rel.type.toLowerCase();
            if (type.includes("/comments") && !type.includes("threadedcomments")) {
                commentsPath = resolveZipPath(worksheetPath, rel.target);
            }
            if (type.includes("vmldrawing")) {
                vmlPath = resolveZipPath(worksheetPath, rel.target);
            }
        }
        if (!commentsPath || !vmlPath)
            continue;
        const vmlText = await zip.file(vmlPath)?.async("text");
        if (!vmlText)
            continue;
        // Find which cells already have VML shapes so we don't duplicate
        const existingVmlRefs = new Set();
        const vmlCellRegex = /<x:Row>(\d+)<\/x:Row>[\s\S]*?<x:Column>(\d+)<\/x:Column>/g;
        let vmlCellMatch;
        while ((vmlCellMatch = vmlCellRegex.exec(vmlText)) !== null) {
            const row = parseInt(vmlCellMatch[1], 10) + 1;
            const col = parseInt(vmlCellMatch[2], 10) + 1;
            existingVmlRefs.add((0, exports.getExcelCellAddress)(row, col));
        }
        // Collect fields that are missing VML shapes
        const fieldsToAdd = [];
        sheet.fields.forEach((field, fieldIndex) => {
            const comment = getFieldCommentForNote(field);
            if (!comment)
                return;
            const { col, headerRow } = (0, exports.getConfiguredFieldPosition)(field, fieldIndex, sheet.fields);
            const ref = (0, exports.getExcelCellAddress)(headerRow, col);
            if (!existingVmlRefs.has(ref)) {
                fieldsToAdd.push({ ref, text: comment, rowNumber: headerRow, columnNumber: col });
            }
        });
        if (fieldsToAdd.length === 0)
            continue;
        // Find cells already in comments XML so we don't duplicate entries
        const commentsXml = await zip.file(commentsPath)?.async("text");
        const existingCommentRefs = new Set();
        if (commentsXml) {
            const refRegex = /\bref="([^"]+)"/g;
            let refMatch;
            while ((refMatch = refRegex.exec(commentsXml)) !== null) {
                existingCommentRefs.add(refMatch[1].replace(/\$/g, ""));
            }
        }
        // Append comment entries for cells not already in comments XML
        const newCommentElements = fieldsToAdd
            .filter((f) => !existingCommentRefs.has(f.ref))
            .map((c) => `<comment ref="${c.ref}" authorId="0"><text><r><t xml:space="preserve">${escapeXmlText(c.text)}</t></r></text></comment>`)
            .join("");
        if (commentsXml && newCommentElements) {
            zip.file(commentsPath, commentsXml.replace("</commentList>", `${newCommentElements}</commentList>`));
        }
        // Find highest existing shape ID so new shapes don't conflict
        const shapeIdRegex = /id="_x0000_s(\d+)"/g;
        const shapeIds = [];
        let shapeIdMatch;
        while ((shapeIdMatch = shapeIdRegex.exec(vmlText)) !== null) {
            shapeIds.push(parseInt(shapeIdMatch[1], 10));
        }
        const maxId = shapeIds.length > 0 ? Math.max(...shapeIds) : 1024;
        // Append VML shapes for missing cells
        const newShapes = fieldsToAdd
            .map((comment, idx) => {
            const startColumn = Math.max(comment.columnNumber - 1, 0);
            const startRow = Math.max(comment.rowNumber - 1, 0);
            const endColumn = startColumn + 5;
            const endRow = startRow + 20;
            return (`<v:shape id="_x0000_s${maxId + 1 + idx}" type="#_x0000_t202"` +
                ` style="position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:200pt;height:60pt;z-index:1;visibility:hidden"` +
                ` fillcolor="#ffffe1" o:insetmode="auto">` +
                `<v:fill color2="#ffffe1"/>` +
                `<v:shadow on="t" color="black" obscured="t"/>` +
                `<v:path o:connecttype="none"/>` +
                `<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>` +
                `<x:ClientData ObjectType="Note">` +
                `<x:MoveWithCells/><x:SizeWithCells/>` +
                `<x:Anchor>${startColumn}, 0, ${startRow}, 0, ${endColumn}, 0, ${endRow}, 0</x:Anchor>` +
                `<x:AutoFill>False</x:AutoFill>` +
                `<x:Row>${startRow}</x:Row><x:Column>${startColumn}</x:Column>` +
                `</x:ClientData></v:shape>`);
        })
            .join("");
        zip.file(vmlPath, vmlText.replace("</xml>", `${newShapes}</xml>`));
    }
    return zip.generateAsync({ type: "arraybuffer" });
};
exports.appendMissingFieldComments = appendMissingFieldComments;
const extractWorkbookCommentsFromBase64 = async (base64) => {
    const commentsBySheet = new Map();
    if (!base64)
        return commentsBySheet;
    const zip = await jszip_1.default.loadAsync((0, exports.base64ToArrayBuffer)(base64));
    const workbookPath = "xl/workbook.xml";
    const workbookXml = await zip.file(workbookPath)?.async("text");
    const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
    if (!workbookXml || !workbookRelsXml)
        return commentsBySheet;
    const workbookRels = getRelTargets(workbookRelsXml);
    const workbookDoc = parseXml(workbookXml);
    const sheets = Array.from(workbookDoc.getElementsByTagName("sheet"));
    for (const sheetNode of sheets) {
        const sheetName = sheetNode.getAttribute("name") || "";
        const relId = sheetNode.getAttribute("r:id") ||
            sheetNode.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ||
            sheetNode.getAttribute("id") ||
            "";
        const sheetRel = workbookRels.get(relId);
        if (!sheetName || !sheetRel?.target)
            continue;
        const sheetPath = resolveZipPath(workbookPath, sheetRel.target);
        const sheetParts = sheetPath.split("/");
        const sheetFileName = sheetParts.pop();
        if (!sheetFileName)
            continue;
        const sheetRelsPath = `${sheetParts.join("/")}/_rels/${sheetFileName}.rels`;
        const sheetRelsXml = await zip.file(sheetRelsPath)?.async("text");
        if (!sheetRelsXml)
            continue;
        const sheetRels = getRelTargets(sheetRelsXml);
        const comments = new Map();
        for (const rel of sheetRels.values()) {
            const normalizedType = rel.type.toLowerCase();
            if (!normalizedType.includes("/comments") && !normalizedType.includes("/threadedcomments")) {
                continue;
            }
            // Targets in .rels files are relative to the parent document (sheetPath), not the .rels file itself
            const commentsPath = resolveZipPath(sheetPath, rel.target);
            const commentsXml = await zip.file(commentsPath)?.async("text");
            if (!commentsXml)
                continue;
            const commentsDoc = parseXml(commentsXml);
            const legacyComments = Array.from(commentsDoc.getElementsByTagName("comment"));
            const threadedComments = Array.from(commentsDoc.getElementsByTagName("threadedComment"));
            [...legacyComments, ...threadedComments].forEach((commentNode) => {
                const ref = commentNode.getAttribute("ref") || "";
                const text = getCommentNodeText(commentNode);
                if (ref && text)
                    comments.set(ref.replace(/\$/g, ""), text);
            });
        }
        if (comments.size > 0)
            commentsBySheet.set(sheetName, comments);
    }
    return commentsBySheet;
};
exports.extractWorkbookCommentsFromBase64 = extractWorkbookCommentsFromBase64;
const normalizeToken = (value) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
const collapseRepeatedCompositeOption = (value) => {
    const option = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!option)
        return "";
    const dashParts = option.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
    if (dashParts.length >= 4 && dashParts.length % 2 === 0) {
        const midpoint = dashParts.length / 2;
        const left = dashParts.slice(0, midpoint).join(" - ");
        const right = dashParts.slice(midpoint).join(" - ");
        if (normalizeToken(left) === normalizeToken(right)) {
            return left;
        }
    }
    return option;
};
const normalizeDropdownOptionTexts = (options) => {
    const seen = new Set();
    return options.flatMap((option) => {
        const cleaned = collapseRepeatedCompositeOption(String(option || "").trim());
        if (!cleaned)
            return [];
        const key = normalizeOptionKey(cleaned);
        if (!key || seen.has(key))
            return [];
        seen.add(key);
        return [cleaned];
    });
};
const resolveValueByKey = (row, targetKey) => {
    if (Object.prototype.hasOwnProperty.call(row, targetKey))
        return row[targetKey];
    const normalizedTarget = normalizeToken(targetKey);
    const matchedKey = Object.keys(row).find((key) => normalizeToken(key) === normalizedTarget);
    return matchedKey ? row[matchedKey] : undefined;
};
const toOptionText = (value) => {
    if (value === null || value === undefined)
        return "";
    if (typeof value === "string")
        return value.trim();
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    if (typeof value === "object" && "$numberInt" in value) {
        return String(value.$numberInt ?? "").trim();
    }
    return String(value).trim();
};
const getValidatorOptions = (validator, preferredColumnName) => {
    const options = [];
    const seen = new Set();
    validator.values.forEach((row) => {
        const keys = Object.keys(row || {});
        if (keys.length === 0)
            return;
        const preferredKey = preferredColumnName
            ? keys.find((key) => normalizeToken(key) === normalizeToken(preferredColumnName))
            : undefined;
        const configuredValidatorKey = validator.columns
            ?.find((column) => column?.is_validator)
            ?.name;
        const validatorKey = configuredValidatorKey
            ? keys.find((key) => normalizeToken(key) === normalizeToken(configuredValidatorKey))
            : undefined;
        const idKey = preferredKey || validatorKey || keys[0];
        const idValue = resolveValueByKey(row, idKey);
        if (idValue === null || idValue === undefined)
            return;
        const descKey = keys.find((key) => {
            if (key === idKey)
                return false;
            const normalized = normalizeToken(key);
            return (normalized.includes("DESCRIPCION") ||
                normalized.includes("NOMBRE") ||
                normalized.startsWith("DESC"));
        });
        const rawIdText = collapseRepeatedCompositeOption(toOptionText(idValue));
        if (!rawIdText)
            return;
        const descValue = descKey ? resolveValueByKey(row, descKey) : undefined;
        const descText = collapseRepeatedCompositeOption(toOptionText(descValue));
        if (descKey && !descText)
            return;
        // When there is no separate description column, detect "CODE description" in a single value
        // e.g. "CC Cédula de ciudadanía" → storedValue = "CC"
        // e.g. "1 Posdoctorado"         → storedValue = "1"
        let storedValue = rawIdText;
        if (!descKey) {
            const codeMatch = /^([A-Z0-9]{1,6})\s+.+$/.exec(rawIdText);
            if (codeMatch)
                storedValue = codeMatch[1];
        }
        const displayLabel = collapseRepeatedCompositeOption(descText ? `${rawIdText} - ${descText}` : rawIdText);
        const seenKey = normalizeOptionKey(displayLabel);
        if (seen.has(storedValue) || seen.has(seenKey))
            return;
        seen.add(storedValue);
        seen.add(seenKey);
        options.push({ value: storedValue, displayLabel });
    });
    return options;
};
const extractOptionsFromCommentValidators = (comment) => {
    if (!comment)
        return [];
    const lines = comment.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    const options = [];
    let inValidSection = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (inValidSection && options.length > 0) {
                inValidSection = false;
            }
            continue;
        }
        const normalized = trimmed
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toUpperCase();
        // Detect "Los valores válidos/posibles/permitidos son:" marker (MUST end with ":")
        const hasValueWord = normalized.includes("VALORES") ||
            normalized.includes("VALOSRES") ||
            normalized.includes("VALOSR");
        const looksLikeInstruction = (normalized.includes("OBLIGAT") || normalized.includes("OPCIONAL")) &&
            (normalized.includes("NUMERIC") ||
                normalized.includes("TEXTO") ||
                normalized.includes("FECHA") ||
                normalized.includes("DECIMAL") ||
                normalized.includes("CARACTER"));
        if (normalized.endsWith(":") &&
            hasValueWord &&
            (normalized.includes("VALIDOS") || normalized.includes("POSIBLES") || normalized.includes("PERMITIDOS"))) {
            inValidSection = true;
            continue;
        }
        if (inValidSection) {
            if (looksLikeInstruction)
                continue;
            options.push(trimmed.replace(/\s+/g, " "));
        }
    }
    return normalizeDropdownOptionTexts(options);
};
const parseCommentTypeHint = (comment) => {
    if (!comment)
        return null;
    const normalized = comment.normalize("NFD").replace(/[̀-ͯ]/g, "");
    const match = /(alfanumeric[oa]|alfabetic[oa]|numeric[oa])\s*\(\s*(\d+)\s*\)/i.exec(normalized);
    if (!match)
        return null;
    const maxLength = parseInt(match[2], 10);
    if (!Number.isFinite(maxLength) || maxLength <= 0)
        return null;
    const rawKind = match[1].toLowerCase();
    const kind = rawKind.startsWith("alfanumeric")
        ? "alfanumerico"
        : rawKind.startsWith("alfabetic")
            ? "alfabetico"
            : "numerico";
    return { kind, maxLength };
};
const buildTypeHintValidation = (hint, anchorCell) => {
    if (hint.kind === "numerico") {
        // Se valida como texto numérico (LEN + coerción con *1) en vez del tipo
        // "whole" nativo de Excel: muchos de estos códigos (DIVIPOLA, ISO de
        // país, etc.) necesitan conservar ceros a la izquierda, que Excel
        // eliminaría si tratara la celda como un número real.
        return {
            type: "custom",
            allowBlank: true,
            formulae: [`AND(LEN(${anchorCell})<=${hint.maxLength},ISNUMBER(${anchorCell}*1))`],
            showErrorMessage: true,
            errorTitle: "Valor no válido",
            error: `Este campo debe ser numérico y de máximo ${hint.maxLength} caracteres.`,
        };
    }
    if (hint.kind === "alfabetico") {
        return {
            type: "custom",
            allowBlank: true,
            formulae: [
                `AND(LEN(${anchorCell})<=${hint.maxLength},SUMPRODUCT(--ISERROR(SEARCH({"0","1","2","3","4","5","6","7","8","9"},${anchorCell})))=10)`,
            ],
            showErrorMessage: true,
            errorTitle: "Valor no válido",
            error: `Este campo debe ser alfabético (sin números) y de máximo ${hint.maxLength} caracteres.`,
        };
    }
    return {
        type: "textLength",
        operator: "lessThanOrEqual",
        allowBlank: true,
        formulae: [hint.maxLength],
        showErrorMessage: true,
        errorTitle: "Valor no válido",
        error: `Este campo admite máximo ${hint.maxLength} caracteres.`,
    };
};
// Muchos comentarios de campo son preguntas de si/no terminadas en "(S/N)"
// o "(S/N)?" (ej. "¿Incluye actividades administrativas (S/N)?"), sin la
// sección "Valores válidos son:" que detecta extractOptionsFromCommentValidators.
// Se detecta ese patrón para ofrecer S/N como lista desplegable en cualquier
// descarga que aplique dropdowns a partir de comentarios.
const SI_NO_COMMENT_PATTERN = /\(\s*S\s*\/\s*N\s*\)\s*\??\s*$/i;
const extractYesNoOptionsFromComment = (comment) => {
    if (!comment)
        return [];
    const normalized = comment.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    return SI_NO_COMMENT_PATTERN.test(normalized) ? ["S", "N"] : [];
};
const stripOptionPrefix = (value) => value.replace(/^\s*(?:[-*•]|\d+[).:\-\s]+)\s*/, "").replace(/\s+/g, " ").trim();
const normalizeOptionKey = (value) => {
    const stripped = stripOptionPrefix(value);
    return normalizeToken(stripped || value);
};
const appendOptionTexts = (options, optionTexts) => {
    const seen = new Set(options.map((option) => normalizeOptionKey(option.displayLabel)));
    const merged = [...options];
    optionTexts.forEach((optionText) => {
        const displayLabel = collapseRepeatedCompositeOption(String(optionText || "").trim());
        if (!displayLabel)
            return;
        const key = normalizeOptionKey(displayLabel);
        if (seen.has(key))
            return;
        seen.add(key);
        merged.push({ value: displayLabel, displayLabel });
    });
    return merged;
};
const applyValidatorDropdowns = ({ workbook, worksheet, fields, validators, startRow = 2, endRow = 1000, preloadedValidatorOptions = {}, }) => {
    const sourcesSheetName = "_Listas";
    // Reusar o crear la hoja _Listas; si ya existe, continuar desde la última columna usada
    let sourcesSheet = workbook.getWorksheet(sourcesSheetName);
    if (!sourcesSheet) {
        sourcesSheet = workbook.addWorksheet(sourcesSheetName);
        sourcesSheet.state = "veryHidden";
    }
    let sourceCol = Math.max(1, sourcesSheet.columnCount + 1);
    fields.forEach((field, fieldIndex) => {
        let options = [];
        // 1. Extraer del comentario
        if (field.comment) {
            options = extractOptionsFromCommentValidators(field.comment);
        }
        // 1.5 Respaldo: el comentario es una pregunta de si/no terminada en "(S/N)"
        if (options.length === 0 && field.comment) {
            options = extractYesNoOptionsFromComment(field.comment);
        }
        // 2. Respaldo: dropdown_options ya almacenadas
        if (options.length === 0 && Array.isArray(field.dropdown_options) && field.dropdown_options.length > 0) {
            const seen = new Set();
            options = field.dropdown_options
                .map((o) => collapseRepeatedCompositeOption(String(o || "").trim()))
                .filter((o) => o && !seen.has(o) && !!seen.add(o));
        }
        // 3. Respaldo: validador conectado explícitamente al campo (solo si el
        // campo no trae ya sus propias opciones en el comentario/dropdown_options)
        if (options.length === 0) {
            const validatorMatch = validators.length > 0 ? findValidatorForField(field, validators) : null;
            if (validatorMatch) {
                const matched = getValidatorOptions(validatorMatch.validator, validatorMatch.columnName || field.name);
                if (matched.length > 0) {
                    options = matched.map((option) => option.displayLabel);
                }
            }
        }
        // 4. Respaldo: valores del validador del período (precargados)
        if (options.length === 0 && preloadedValidatorOptions[field.name]?.length) {
            options = preloadedValidatorOptions[field.name];
        }
        // 5. Auto-detección: buscar en validadores cuya columna coincida con el
        // nombre del campo, excluyendo columnas de descripción genéricas (ver
        // isGenericDescriptionColumnName) para no enganchar campos de texto libre
        // sin relación real con la tabla.
        if (options.length === 0 && validators.length > 0) {
            const fieldNorm = normalizeToken(field.name);
            for (const validator of validators) {
                const columnMatch = (validator.columns?.some((c) => !isGenericDescriptionColumnName(c.name) && normalizeToken(c.name) === fieldNorm)) ||
                    (validator.values.length > 0 &&
                        Object.keys(validator.values[0]).some((k) => !isGenericDescriptionColumnName(k) && normalizeToken(k) === fieldNorm));
                if (!columnMatch)
                    continue;
                const matched = getValidatorOptions(validator, field.name);
                if (matched.length > 0) {
                    options = matched.map((o) => o.displayLabel);
                    break;
                }
            }
        }
        options = normalizeDropdownOptionTexts(options);
        if (options.length === 0) {
            // Sin lista de opciones: si el comentario trae la convención SNIES
            // "numérico/alfabético/alfanumérico (N)", igual se aplica una
            // validación real (tipo de caracter + largo máximo) en vez de dejar
            // la celda totalmente libre.
            const hint = parseCommentTypeHint(field.comment);
            if (!hint)
                return;
            const { col: hintCol, headerRow: hintHeaderRow } = (0, exports.getConfiguredFieldPosition)(field, fieldIndex, fields);
            const hintFirstDataRow = Math.max(startRow, hintHeaderRow + 1);
            const anchorCell = `${toColumnLetter(hintCol)}${hintFirstDataRow}`;
            const hintRangeAddress = `${anchorCell}:${toColumnLetter(hintCol)}${endRow}`;
            const hintComment = field.comment
                ? String(field.comment).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
                : "";
            const hintPromptText = hintComment.length > 220 ? `${hintComment.slice(0, 217)}...` : hintComment;
            const hintValidation = buildTypeHintValidation(hint, anchorCell);
            if (hintPromptText) {
                hintValidation.showInputMessage = true;
                hintValidation.promptTitle = field.name.slice(0, 32);
                hintValidation.prompt = hintPromptText;
            }
            worksheet.dataValidations.add(hintRangeAddress, hintValidation);
            return;
        }
        const { col: templateCol, headerRow } = (0, exports.getConfiguredFieldPosition)(field, fieldIndex, fields);
        const firstDataRow = Math.max(startRow, headerRow + 1);
        const rangeAddress = `${toColumnLetter(templateCol)}${firstDataRow}:${toColumnLetter(templateCol)}${endRow}`;
        // Escribir opciones en hoja oculta _Listas
        options.forEach((opt, i) => {
            sourcesSheet.getCell(i + 1, sourceCol).value = opt;
        });
        const colLetter = toColumnLetter(sourceCol);
        const rangeRef = `'${sourcesSheetName}'!$${colLetter}$1:$${colLetter}$${options.length}`;
        sourceCol += 1;
        // Limpiar validaciones de celda individuales para esta columna (evitar conflictos)
        const dvModel = worksheet.dataValidations?.model;
        if (dvModel && typeof dvModel === "object" && !Array.isArray(dvModel)) {
            Object.keys(dvModel).forEach((key) => {
                const col = key.replace(/[0-9]/g, "");
                if (col === toColumnLetter(templateCol))
                    delete dvModel[key];
            });
        }
        const normalizedComment = field.comment
            ? String(field.comment).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
            : "";
        const promptText = normalizedComment.length > 220
            ? `${normalizedComment.slice(0, 217)}...`
            : normalizedComment;
        const validation = {
            type: "list",
            allowBlank: true,
            formulae: [rangeRef],
            showErrorMessage: !field.multiple,
            errorTitle: "Valor no valido",
            error: "Selecciona un valor de la lista desplegable.",
        };
        if (promptText) {
            validation.showInputMessage = true;
            validation.promptTitle = field.name.slice(0, 32);
            validation.prompt = promptText;
        }
        worksheet.dataValidations.add(rangeAddress, validation);
    });
};
exports.applyValidatorDropdowns = applyValidatorDropdowns;
const applyWorkbookSheetDropdowns = ({ workbook, workbookSheets, validators, originalCommentsBySheet, endRow = 1000, preloadedValidatorOptions = {}, }) => {
    // Remove the existing _Listas sheet so it is rebuilt from scratch with code-only values.
    // Without this, the original workbook's full-text options would remain in the sheet and
    // sourceCol would start after them, leaving old cell references pointing to stale data.
    const existingListasSheet = workbook.getWorksheet("_Listas");
    if (existingListasSheet) {
        workbook.removeWorksheet(existingListasSheet.id);
    }
    workbookSheets.forEach((sheet) => {
        if (!Array.isArray(sheet.fields) || sheet.fields.length === 0)
            return;
        const worksheet = workbook.getWorksheet(sheet.name);
        if (!worksheet)
            return;
        // Clear all existing data validations from the worksheet before rebuilding.
        // The original workbook's validations reference the old _Listas layout, which is
        // now stale after removing and rebuilding the _Listas sheet.
        worksheet.dataValidations.model = {};
        const originalComments = originalCommentsBySheet?.get(sheet.name);
        const fields = originalComments
            ? sheet.fields.map((field, fieldIndex) => {
                const { col, headerRow } = (0, exports.getConfiguredFieldPosition)(field, fieldIndex, sheet.fields);
                // Los comentarios pueden estar en la celda de encabezado (fila 1) o
                // en la primera fila de datos (fila 2+), dependiendo de cómo se generó el workbook
                const firstDataRow = Math.max(2, headerRow + 1);
                const originalComment = originalComments.get((0, exports.getExcelCellAddress)(headerRow, col)) ||
                    originalComments.get((0, exports.getExcelCellAddress)(firstDataRow, col));
                // Always prefer the fresh JSZip-extracted comment; fall back to stored comment
                const resolvedComment = originalComment ?? field.comment;
                return resolvedComment !== field.comment ? { ...field, comment: resolvedComment } : field;
            })
            : sheet.fields;
        (0, exports.applyValidatorDropdowns)({
            workbook,
            worksheet,
            fields,
            validators,
            startRow: 2,
            endRow: Math.max(endRow, worksheet.rowCount + 500),
            preloadedValidatorOptions,
        });
    });
};
exports.applyWorkbookSheetDropdowns = applyWorkbookSheetDropdowns;
const fetchValidatorOptionsForFields = async (fields, periodId, apiUrl) => {
    const result = {};
    await Promise.all(fields.map(async (field) => {
        if (!field.validate_with)
            return;
        try {
            let validatorId = '';
            if (typeof field.validate_with === 'string') {
                // validate_with tiene el formato "NombreValidador - NombreColumna":
                // el backend (/validators/id) busca por nombre/_id del VALIDADOR,
                // no de la columna, así que se usa la primera parte (antes se
                // mandaba la última = el nombre de columna, ej. "ID_PROGRAMA" en
                // vez de "PROGRAMAS", y el endpoint respondía 404 siempre).
                const parts = field.validate_with.split(' - ');
                validatorId = parts.length >= 2 ? parts[0].trim() : field.validate_with.trim();
            }
            else {
                validatorId = field.validate_with.id ?? '';
            }
            if (!validatorId)
                return;
            const res = await fetch(`${apiUrl}/validators/id?id=${encodeURIComponent(validatorId)}&periodId=${encodeURIComponent(periodId)}`);
            if (!res.ok)
                return;
            const data = await res.json();
            const validator = data.validator;
            if (!validator?.columns?.length)
                return;
            const idCol = validator.columns.find((c) => c.is_validator) ?? validator.columns[0];
            if (!idCol?.values?.length)
                return;
            const descCol = validator.columns.find((c) => !c.is_validator && /desc/i.test(c.name)) ?? validator.columns.find((c) => !c.is_validator);
            result[field.name] = idCol.values.map((v, i) => {
                const id = collapseRepeatedCompositeOption(String(v ?? '').trim());
                const desc = descCol ? collapseRepeatedCompositeOption(String(descCol.values[i] ?? '').trim()) : '';
                return collapseRepeatedCompositeOption(desc ? `${id} - ${desc}` : id);
            }).filter(Boolean);
        }
        catch { /* ignorar errores individuales */ }
    }));
    return result;
};
exports.fetchValidatorOptionsForFields = fetchValidatorOptionsForFields;
const normalizeMultilineText = (text) => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
const wrapTextByLength = (text, maxLen = 52) => {
    const input = normalizeMultilineText(text);
    if (!input)
        return "";
    const wrappedLines = [];
    const paragraphs = input.split("\n");
    paragraphs.forEach((paragraph) => {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            wrappedLines.push("");
            return;
        }
        let line = "";
        words.forEach((word) => {
            const candidate = line ? `${line} ${word}` : word;
            if (candidate.length > maxLen && line) {
                wrappedLines.push(line);
                line = word;
            }
            else {
                line = candidate;
            }
        });
        if (line)
            wrappedLines.push(line);
    });
    return wrappedLines.join("\n");
};
const applyFieldCommentNote = (cell, rawComment, options = {}) => {
    if (!rawComment)
        return;
    const cleanComment = normalizeMultilineText(rawComment).replace(/^"+|"+$/g, "");
    if (!cleanComment)
        return;
    cell.note = options.preserveText ? cleanComment : wrapTextByLength(cleanComment, 68);
};
exports.applyFieldCommentNote = applyFieldCommentNote;
const applyDatatypeValidation = (cell, field) => {
    switch (field.datatype) {
        case "Entero":
            cell.dataValidation = { type: "whole", operator: "between", formulae: [1, Number.MAX_SAFE_INTEGER], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un número entero." };
            break;
        case "Decimal":
            cell.dataValidation = { type: "decimal", operator: "between", formulae: [0.0, Number.MAX_SAFE_INTEGER], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un número decimal." };
            break;
        case "Porcentaje":
            cell.dataValidation = { type: "decimal", operator: "between", formulae: [0.0, 100.0], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un número decimal entre 0.0 y 100.0." };
            break;
        case "Texto Corto":
            cell.dataValidation = { type: "textLength", operator: "lessThanOrEqual", formulae: [60], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un texto de hasta 60 caracteres." };
            break;
        case "Texto Largo":
            cell.dataValidation = { type: "textLength", operator: "lessThanOrEqual", formulae: [500], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un texto de hasta 500 caracteres." };
            break;
        case "True/False":
            cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"Si,No"'], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, selecciona Si o No." };
            break;
        case "Fecha":
        case "Fecha Inicial / Fecha Final":
            cell.dataValidation = { type: "date", operator: "between", formulae: [new Date(1900, 0, 1), new Date(9999, 11, 31)], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce una fecha válida en el formato DD/MM/AAAA." };
            cell.numFmt = "DD/MM/YYYY";
            break;
        case "Link":
            cell.dataValidation = { type: "textLength", operator: "greaterThan", formulae: [0], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un enlace válido." };
            break;
        default:
            break;
    }
    if (field.comment && cell.dataValidation) {
        const normalizedComment = String(field.comment).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
        const promptBase = normalizedComment.slice(0, 220);
        cell.dataValidation = {
            ...cell.dataValidation,
            showInputMessage: true,
            promptTitle: field.name.slice(0, 32),
            prompt: normalizedComment.length > 220 ? `${promptBase}...` : promptBase,
        };
    }
};
exports.applyDatatypeValidation = applyDatatypeValidation;
// Crea desde cero una hoja para un sheet que aun no existe en el workbook
// cargado (p. ej. una hoja nueva creada en el editor que no viene del xlsx
// original subido). Encabezados + validaciones por tipo de dato.
const createFieldsWorksheet = (workbook, worksheetName, fields, maxRows = 1000) => {
    const worksheet = workbook.addWorksheet(worksheetName);
    const headerRow = worksheet.addRow(fields.map((f) => f.name));
    headerRow.eachCell((cell, colNumber) => {
        const field = fields[colNumber - 1];
        // Una hoja completamente nueva no tiene "campos base": todos sus campos
        // son contenido añadido por el usuario, asi que se resaltan en verde
        // igual que los campos añadidos en las hojas originales.
        const isAdded = field?.locked !== true;
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isAdded ? "FF166534" : "FF0f1f39" } };
        cell.border = {
            top: { style: "thin" }, left: { style: "thin" },
            bottom: { style: "thin" }, right: { style: "thin" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        (0, exports.applyFieldCommentNote)(cell, field?.comment);
    });
    worksheet.columns.forEach((col) => { col.width = 20; });
    fields.forEach((field, index) => {
        const colNumber = index + 1;
        for (let rowNumber = 2; rowNumber <= maxRows; rowNumber++) {
            (0, exports.applyDatatypeValidation)(worksheet.getRow(rowNumber).getCell(colNumber), field);
        }
    });
    return worksheet;
};
exports.createFieldsWorksheet = createFieldsWorksheet;
// Crea en el workbook cualquier hoja de workbookSheets que aun no exista
// (hojas nuevas creadas en el editor que no vienen del xlsx original). Debe
// llamarse ANTES de applyWorkbookSheetDropdowns para que esa funcion tambien
// aplique los dropdowns de validacion sobre las hojas recien creadas.
const ensureMissingWorkbookSheets = (workbook, workbookSheets) => {
    workbookSheets.forEach((sheet) => {
        if (!sheet?.name || workbook.getWorksheet(sheet.name))
            return;
        if (sheet.preserveOriginalContent) {
            const worksheet = workbook.addWorksheet(sheet.name);
            (sheet.rawRows || []).forEach((row) => worksheet.addRow(row || []));
            (sheet.columnWidths || []).forEach((width, index) => {
                worksheet.getColumn(index + 1).width = width || 20;
            });
            (sheet.cellNotes || []).forEach((note) => {
                if (!note?.row || !note?.col || !note?.note)
                    return;
                (0, exports.applyFieldCommentNote)(worksheet.getCell(note.row, note.col), note.note, { preserveText: true });
            });
            return;
        }
        if (Array.isArray(sheet.fields) && sheet.fields.length > 0) {
            (0, exports.createFieldsWorksheet)(workbook, sheet.name, sheet.fields);
        }
    });
};
exports.ensureMissingWorkbookSheets = ensureMissingWorkbookSheets;
// Reordena las pestanas del workbook segun el orden actual de workbookSheets
// (que puede haber sido cambiado por drag-and-drop en el editor). Las hojas
// no rastreadas (p. ej. _Listas u otras hojas de soporte del xlsx original)
// se dejan al final, preservando su orden relativo original.
const reorderWorkbookSheets = (workbook, orderedNames) => {
    const originalOrder = workbook.worksheets;
    const seen = new Set();
    let orderNo = 1;
    orderedNames.forEach((name) => {
        const ws = workbook.getWorksheet(name);
        if (!ws || seen.has(name))
            return;
        ws.orderNo = orderNo++;
        seen.add(name);
    });
    originalOrder
        .filter((ws) => !seen.has(ws.name))
        .forEach((ws) => {
        ws.orderNo = orderNo++;
    });
};
exports.reorderWorkbookSheets = reorderWorkbookSheets;
const NOTE_WIDTH_PT = 360;
const NOTE_LINE_HEIGHT_PT = 14;
const NOTE_VERTICAL_PAD_PT = 20;
const NOTE_MIN_HEIGHT_PT = 60;
const NOTE_CHARS_PER_LINE = Math.floor((NOTE_WIDTH_PT - 20) / 5);
const computeNoteHeight = (text) => {
    let lines = 0;
    for (const line of text.split("\n")) {
        lines += Math.max(1, Math.ceil((line.length || 1) / NOTE_CHARS_PER_LINE));
    }
    return Math.max(NOTE_MIN_HEIGHT_PT, lines * NOTE_LINE_HEIGHT_PT + NOTE_VERTICAL_PAD_PT);
};
const patchNoteSize = async (buffer) => {
    const zip = await jszip_1.default.loadAsync(buffer);
    // Step 1: Map vmlPath → commentsPath using each sheet's .rels file.
    // The relationship between VML drawing and comments is declared in
    // xl/worksheets/_rels/sheetN.xml.rels, NOT in a VML-level .rels file.
    const vmlToComments = new Map();
    for (const relsPath of Object.keys(zip.files)) {
        if (!/xl\/worksheets\/_rels\/.+\.xml\.rels$/.test(relsPath))
            continue;
        const relsXml = await zip.files[relsPath].async("text");
        const doc = new DOMParser().parseFromString(relsXml, "application/xml");
        // The document that owns these rels (remove /_rels/ and .rels suffix)
        const docPath = relsPath.replace("/_rels/", "/").replace(/\.rels$/, "");
        let vmlPath = "";
        let commentsPath = "";
        for (const rel of Array.from(doc.getElementsByTagName("Relationship"))) {
            const type = (rel.getAttribute("Type") || "").toLowerCase();
            const target = rel.getAttribute("Target") || "";
            if (type.includes("vmldrawing")) {
                vmlPath = resolveZipPath(docPath, target);
            }
            if (type.includes("/comments") && !type.includes("threadedcomments")) {
                commentsPath = resolveZipPath(docPath, target);
            }
        }
        if (vmlPath && commentsPath)
            vmlToComments.set(vmlPath, commentsPath);
    }
    // Step 2: Parse each unique comments file to get (cellRef → full text)
    const textByFile = new Map();
    for (const commentsPath of new Set(vmlToComments.values())) {
        const file = zip.file(commentsPath);
        if (!file)
            continue;
        const xml = await file.async("text");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const refMap = new Map();
        for (const node of Array.from(doc.getElementsByTagName("comment"))) {
            const ref = node.getAttribute("ref") || "";
            const text = Array.from(node.getElementsByTagName("t"))
                .map((t) => t.textContent || "")
                .join("")
                .trim();
            if (ref && text)
                refMap.set(ref, text);
        }
        textByFile.set(commentsPath, refMap);
    }
    // Step 3: Patch VML note shapes with computed dimensions
    const vmlPaths = Object.keys(zip.files).filter((p) => p.endsWith(".vml"));
    await Promise.all(vmlPaths.map(async (vmlPath) => {
        const refMap = textByFile.get(vmlToComments.get(vmlPath) ?? "");
        const vmlText = await zip.files[vmlPath].async("text");
        // Matches both single- and double-quoted style attributes containing visibility:hidden
        const patched = vmlText.replace(/<v:shape\b([^>]*?)style=(["'])([^"']*?visibility:hidden[^"']*)\2([^>]*>[\s\S]*?<\/v:shape>)/g, (_match, beforeStyle, quote, styleContent, afterTag) => {
            const rowMatch = /<x:Row>(\d+)<\/x:Row>/.exec(afterTag);
            const colMatch = /<x:Column>(\d+)<\/x:Column>/.exec(afterTag);
            if (!rowMatch || !colMatch)
                return _match;
            const row = parseInt(rowMatch[1], 10) + 1;
            const col = parseInt(colMatch[1], 10) + 1;
            const cellRef = `${toColumnLetter(col)}${row}`;
            const noteText = refMap?.get(cellRef) || "";
            const height = computeNoteHeight(noteText);
            const newStyle = styleContent
                .replace(/width:\d+(?:\.\d+)?pt/, `width:${NOTE_WIDTH_PT}pt`)
                .replace(/height:\d+(?:\.\d+)?pt/, `height:${height}pt`);
            return `<v:shape${beforeStyle}style=${quote}${newStyle}${quote}${afterTag}`;
        });
        zip.file(vmlPath, patched);
    }));
    return zip.generateAsync({ type: "arraybuffer" });
};
exports.patchNoteSize = patchNoteSize;
const patchNoteBackgroundColor = async (buffer, hexColor = "#ffffff") => {
    const zip = await jszip_1.default.loadAsync(buffer);
    const vmlPaths = Object.keys(zip.files).filter((p) => p.endsWith(".vml"));
    await Promise.all(vmlPaths.map(async (path) => {
        const text = await zip.files[path].async("text");
        const patched = text
            .replace(/fillcolor="[^"]+"/g, `fillcolor="${hexColor}"`)
            .replace(/(<v:fill[^>]*?)color2="[^"]+"/g, `$1color2="${hexColor}"`);
        zip.file(path, patched);
    }));
    return zip.generateAsync({ type: "arraybuffer" });
};
exports.patchNoteBackgroundColor = patchNoteBackgroundColor;
