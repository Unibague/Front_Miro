"use client";

import { useEffect, useState, FormEvent } from "react";
import { Container, Table, Button, Pagination, Center, TextInput, Group, Modal, Select, Tooltip, Text, Checkbox, ActionIcon, FileInput, Stack } from "@mantine/core";
import axios,{ AxiosError } from "axios";
import { showNotification } from "@mantine/notifications";
import { IconEdit, IconTrash, IconDownload, IconUser, IconArrowRight, IconArrowLeft, IconCirclePlus, IconArrowsTransferDown, IconArrowBigUpFilled, IconArrowBigDownFilled, IconCopy, IconHistory, IconFileSpreadsheet, IconUpload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ExcelJS from "exceljs";
import { saveAs } from 'file-saver';
import { useDisclosure } from '@mantine/hooks';
import { useSort } from "../../hooks/useSort";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { DatePickerInput } from "@mantine/dates";
import {
  applyFieldCommentNote,
  applyValidatorDropdowns,
  applyWorkbookSheetDropdowns,
  arrayBufferToBase64,
  extractWorkbookCommentsFromBase64,
  getExcelCellAddress,
  loadWorkbookFromBase64,
  sanitizeSheetName,
} from "@/app/utils/templateUtils";
import { usePeriod } from "@/app/context/PeriodContext";
import { logTemplateChange } from "@/app/utils/auditUtils";
import ConfigAuditModal from "@/app/components/ConfigAuditModal";
import { modals } from "@mantine/modals";

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  validate_with?: string;
  comment?: string;
  multiple?: boolean;
  locked?: boolean;
  dropdown_options?: string[];
  has_excel_validation?: boolean;
  excel_validation_options?: string[];
  header_row?: number;
  column?: number;
}

interface Validator { 
  name: string;
  values: any[];
}

interface Dependency {
  _id: string;
  dep_code: string;
  name: string;
  responsible: string;
}

interface Dimension {
  _id: string;
  name: string;
  responsible: Dependency;
}

interface Template {
  _id: string;
  name: string;
  file_name: string;
  file_description: string;
  fields: Field[];
  workbook_sheets?: TemplateWorksheet[];
  original_workbook_base64?: string;
  active: boolean;
  dimensions: [Dimension];
  created_by: {
    email: string;
    full_name: string;
  };
  validators: Validator[]
  published: boolean;
  lastModified?: {
    user: string;
    date: string;
  };
}

interface Period {
  _id: string;
  name: string;
  producer_start_date: Date;
  producer_end_date: Date;
}

interface Producer {
  _id: string;
  dep_code: string;
  name: string;
}

interface BaseTemplateDraft {
  name: string;
  fileName: string;
  fields: Field[];
  workbookSheets: TemplateWorksheet[];
  originalWorkbookBase64: string;
}

interface TemplateWorksheet {
  name: string;
  fields: Field[];
  preserveOriginalContent?: boolean;
  rawRows?: any[][];
  cellNotes?: SheetCellNote[];
  columnWidths?: number[];
}

interface SheetCellNote {
  row: number;
  col: number;
  note: string;
}

interface FieldMetadata {
  comment?: string;
  dropdownOptions?: string[];
}

const getCellText = (value: any): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value?.richText)) {
    return value.richText.map((item: any) => item?.text || "").join("").trim();
  }
  if (value?.text) return String(value.text).trim();
  if (value?.result !== undefined) return getCellText(value.result);
  if (value?.formula) return String(value.formula).trim();
  return String(value).trim();
};

const cleanTemplateName = (value: string, fallback: string) => {
  const cleaned = value
    .replace(/\.[^.]+$/, "")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (cleaned || fallback).slice(0, 90);
};

const cleanFileName = (value: string) =>
  cleanTemplateName(value, "plantilla_base")
    .replace(/\s+/g, "_")
    .slice(0, 90);

const makeUnique = (value: string, usedValues: Map<string, number>) => {
  const base = value.trim() || "Campo";
  const normalized = base.toLowerCase();
  const count = usedValues.get(normalized) || 0;
  usedValues.set(normalized, count + 1);
  return count === 0 ? base : `${base} (${count + 1})`;
};

const normalizeLookupKey = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const combineCommentParts = (...parts: Array<string | undefined>) => {
  const seen = new Set<string>();
  return parts
    .map((part) => (part || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim())
    .filter((part) => {
      if (!part || seen.has(part)) return false;
      seen.add(part);
      return true;
    })
    .join("\n\n");
};

const getCommentTextFromValue = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(getCommentTextFromValue).filter(Boolean).join("").trim();
  }
  if (Array.isArray(value.texts)) {
    return value.texts.map((item: any) => item?.text || item?.value || "").join("").trim();
  }
  if (Array.isArray(value.richText)) {
    return value.richText.map((item: any) => item?.text || item?.value || "").join("").trim();
  }
  if (typeof value.text === "string") return value.text.trim();
  if (typeof value.value === "string") return value.value.trim();
  if (typeof value.plainText === "string") return value.plainText.trim();
  if (typeof value.comment === "string") return value.comment.trim();
  return "";
};

const getCellNoteText = (cell: ExcelJS.Cell): string => {
  return getCommentTextFromValue(cell.note) || getCommentTextFromValue((cell as any).model?.comment);
};

const getCellPromptText = (cell: ExcelJS.Cell): string => {
  const prompt = (cell.dataValidation as ExcelJS.DataValidation | undefined)?.prompt;
  return typeof prompt === "string" ? prompt.trim() : "";
};

const cleanOptionCandidate = (value: string): string =>
  value
    .replace(/^[\s\-*\u2022]+/, "")
    .replace(/^\d+[\).\-\s]+/, "")
    .replace(/^[a-zA-Z][\).\-\s]+/, "")
    .replace(/^"+|"+$/g, "")
    .trim();

const uniqueOptions = (options: string[]): string[] => {
  const seen = new Set<string>();
  return options
    .map(cleanOptionCandidate)
    .filter((option) => {
      const key = normalizeLookupKey(option);
      if (!option || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const splitOptionCandidates = (value: string, includeSingle = false): string[] => {
  const cleaned = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!cleaned) return [];

  const separators =
    cleaned.includes("\n") ||
    cleaned.includes(";") ||
    cleaned.includes("|") ||
    cleaned.includes(",") ||
    cleaned.includes("/");
  if (!separators) return includeSingle ? uniqueOptions([cleaned]) : [];

  return uniqueOptions(cleaned.split(/\n|;|\||,|\//g));
};

const extractDropdownOptionsFromText = (value: string): string[] => {
  const text = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const markerIndex = lines.findIndex((line) => {
    const normalizedLine = normalizeLookupKey(line);
    return (
      line.includes(":") &&
      (
        normalizedLine.includes("OPCION") ||
        normalizedLine.includes("RESPUESTA") ||
        normalizedLine.includes("VALORPERMITIDO") ||
        normalizedLine.includes("VALORESVALIDO") ||
        normalizedLine.includes("VALORPOSIBLE") ||
        normalizedLine.includes("VALORVALIDO") ||
        normalizedLine.includes("VALORESPOSIBLE") ||
        normalizedLine.includes("LISTA") ||
        normalizedLine.includes("SELECCION") ||
        normalizedLine.includes("ALTERNATIVA") ||
        normalizedLine.includes("VALIDO") ||
        normalizedLine.includes("POSIBLE")
      )
    );
  });

  if (markerIndex >= 0) {
    const markedLine = lines[markerIndex];
    const markedValue = markedLine.slice(markedLine.indexOf(":") + 1);
    const followingLines = lines.slice(markerIndex + 1);
    return splitOptionCandidates([markedValue, ...followingLines].join("\n"), true);
  }

  const bulletOptions = lines
    .filter((line) => /^\s*(?:[-*\u2022]|\d+[\).])\s+/.test(line))
    .map(cleanOptionCandidate);

  if (bulletOptions.length >= 2) return uniqueOptions(bulletOptions);

  const directOptions = splitOptionCandidates(text);
  return directOptions.length >= 2 ? directOptions : [];
};

// Versión estricta: solo extrae opciones cuando hay una línea marcadora explícita del tipo
// "Los valores válidos/posibles/permitidos son:" (debe terminar en ":" y tener "VALORES" plural
// + "VALIDOS"/"POSIBLES"/"PERMITIDOS"). Coincide con la lógica de extractOptionsFromCommentValidators
// en templateUtils.ts para evitar falsos positivos con descripciones como "Valor: texto libre".
const extractExplicitListOptionsFromText = (value: string): string[] => {
  const text = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const options: string[] = [];
  let inSection = false;
  let hasStartedOptions = false;
  const normalizeMarkerText = (line: string) =>
    line
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inSection && !hasStartedOptions) continue;
      if (inSection) break; // Línea en blanco termina la sección de opciones
      continue;
    }

    if (!inSection) {
      const normalizedMarker = normalizeMarkerText(trimmed);
      if (
        normalizedMarker.endsWith(":") &&
        normalizedMarker.includes("VALORES") &&
        (
          normalizedMarker.includes("VALIDOS") ||
          normalizedMarker.includes("POSIBLES") ||
          normalizedMarker.includes("PERMITIDOS")
        )
      ) {
        inSection = true;
        continue;
      }
      const n = trimmed
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase();
      // Solo coincide con frases como "Los valores válidos son:", "Valores posibles:", etc.
      // La línea DEBE terminar con ":" y contener "VALORES" + "VALIDOS/POSIBLES/PERMITIDOS"
      if (
        n.endsWith(":") &&
        n.includes("VALORES") &&
        (n.includes("VALIDOS") || n.includes("POSIBLES") || n.includes("PERMITIDOS"))
      ) {
        inSection = true;
      }
    } else {
      hasStartedOptions = true;
      options.push(trimmed.replace(/\s+/g, " "));
    }
  }

  const seen = new Set<string>();
  return options.filter((option) => {
    const key = normalizeLookupKey(option);
    if (!option || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const columnLetterToNumber = (letters: string): number => {
  let result = 0;
  letters.toUpperCase().split("").forEach((letter) => {
    result = result * 26 + (letter.charCodeAt(0) - 64);
  });
  return result;
};

const parseCellRef = (ref: string): { row: number; col: number } | null => {
  const match = ref.replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return { col: columnLetterToNumber(match[1]), row: Number(match[2]) };
};

// Resuelve una fórmula de validación Excel (inline "A,B,C" o referencia de rango) a un array de opciones
const resolveFormulaToOptions = (formula: string, workbook: ExcelJS.Workbook): string[] => {
  formula = formula.replace(/^=/, "").trim();
  if (!formula) return [];
  if (formula.startsWith('"') && formula.endsWith('"')) {
    return splitOptionCandidates(formula.slice(1, -1), true);
  }
  const bangIndex = formula.lastIndexOf("!");
  if (bangIndex < 0) return [];
  const rawSheetName = formula.slice(0, bangIndex);
  const rangeRef = formula.slice(bangIndex + 1);
  const sheetName = rawSheetName.replace(/^'|'$/g, "").replace(/''/g, "'");
  const sourceSheet = workbook.getWorksheet(sheetName);
  if (!sourceSheet) return [];
  const [startRef, endRef = startRef] = rangeRef.replace(/\$/g, "").split(":");
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);
  if (!start || !end) return [];
  const opts: string[] = [];
  for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
    for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col += 1) {
      const opt = getCellText(sourceSheet.getCell(row, col).value);
      if (opt) opts.push(opt);
    }
  }
  return uniqueOptions(opts);
};

// Agrega las columnas de un sqref ("C2:C1048576" o múltiples separados por espacio) al mapa
const addSqrefToColumnMap = (sqref: string, options: string[], map: Map<number, string[]>) => {
  if (options.length === 0) return;
  for (const ref of sqref.trim().split(/\s+/)) {
    const cols = new Set<number>();
    for (const part of ref.replace(/\$/g, "").split(":")) {
      const parsed = parseCellRef(part);
      if (parsed) cols.add(parsed.col);
    }
    for (const col of cols) {
      const existing = map.get(col);
      map.set(col, existing ? uniqueOptions([...existing, ...options]) : [...options]);
    }
  }
};

// Lee el XLSX como ZIP y extrae las validaciones de lista (estándar x00 y extendidas x14)
// porque ExcelJS no lee el formato extendido que usa Excel 365
const parseXlsxListValidations = async (
  buffer: ArrayBuffer,
  workbook: ExcelJS.Workbook
): Promise<Map<string, Map<number, string[]>>> => {
  const result = new Map<string, Map<number, string[]>>();
  try {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buffer);

    // Leer xl/workbook.xml para mapear rId → nombre de hoja con DOMParser
    const workbookXml = await zip.file("xl/workbook.xml")?.async("string") || "";
    const xmlParser = new DOMParser();
    const workbookDoc = xmlParser.parseFromString(workbookXml, "text/xml");
    const rIdToSheetName = new Map<string, string>();
    const sheetEls = workbookDoc.getElementsByTagName("sheet");
    for (let i = 0; i < sheetEls.length; i++) {
      const el = sheetEls[i];
      const name = el.getAttribute("name");
      const rId = el.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"
      ) || el.getAttribute("r:id");
      if (name && rId) rIdToSheetName.set(rId, name);
    }
    // Leer xl/_rels/workbook.xml.rels para mapear rId → path del archivo de hoja
    const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string") || "";
    const rIdToPath = new Map<string, string>();
    for (const m of relsXml.matchAll(/Id="([^"]*)"[^>]*Target="([^"]*)"/g)) {
      if (m[1] && m[2]) rIdToPath.set(m[1], `xl/${m[2].replace(/^\.\.\//, "")}`);
    }

    for (const [rId, sheetName] of rIdToSheetName) {
      const path = rIdToPath.get(rId);
      if (!path) continue;
      const sheetXml = await zip.file(path)?.async("string");
      if (!sheetXml) continue;

      const columnMap = new Map<number, string[]>();
      const sheetDoc = xmlParser.parseFromString(sheetXml, "text/xml");
      const allEls = sheetDoc.getElementsByTagName("*");

      for (let i = 0; i < allEls.length; i++) {
        const el = allEls[i];
        if (el.localName !== "dataValidation") continue;
        if (el.getAttribute("type") !== "list") continue;

        const isExtended = (el.namespaceURI || "").includes("microsoft.com");
        let sqref = "";
        let formula = "";

        if (!isExtended) {
          sqref = el.getAttribute("sqref") || "";
          for (let j = 0; j < el.childNodes.length; j++) {
            const child = el.childNodes[j] as Element;
            if (child.localName === "formula1") {
              formula = child.textContent?.trim() || "";
              break;
            }
          }
        } else {
          for (let j = 0; j < el.childNodes.length; j++) {
            const child = el.childNodes[j] as Element;
            if (child.localName === "sqref") {
              sqref = child.textContent?.trim() || "";
            } else if (child.localName === "formula1") {
              for (let k = 0; k < child.childNodes.length; k++) {
                const gc = child.childNodes[k] as Element;
                if (gc.localName === "f") formula = gc.textContent?.trim() || "";
              }
            }
          }
        }

        if (!sqref || !formula) continue;
        const options = resolveFormulaToOptions(formula, workbook);
        addSqrefToColumnMap(sqref, options, columnMap);
      }

      if (columnMap.size > 0) result.set(sheetName, columnMap);
    }
  } catch (e) {
    console.warn("[parseXlsxListValidations]", e);
  }
  return result;
};

const extractDropdownOptionsFromValidation = (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  cell: ExcelJS.Cell
): string[] => {
  const validation = cell.dataValidation as ExcelJS.DataValidation | undefined;
  if (!validation || validation.type !== "list" || !validation.formulae?.length) return [];

  const formula = String(validation.formulae[0] || "").replace(/^=/, "").trim();
  if (!formula) return [];

  if (formula.startsWith('"') && formula.endsWith('"')) {
    return splitOptionCandidates(formula.slice(1, -1), true);
  }

  const bangIndex = formula.lastIndexOf("!");
  const rawSheetName = bangIndex >= 0 ? formula.slice(0, bangIndex) : worksheet.name;
  const rangeRef = bangIndex >= 0 ? formula.slice(bangIndex + 1) : formula;
  const sheetName = rawSheetName.replace(/^'|'$/g, "").replace(/''/g, "'");
  const sourceSheet = workbook.getWorksheet(sheetName);
  if (!sourceSheet) return [];

  const [startRef, endRef = startRef] = rangeRef.split(":");
  const start = parseCellRef(startRef);
  const end = parseCellRef(endRef);
  if (!start || !end) return [];

  const options: string[] = [];
  const startRow = Math.min(start.row, end.row);
  const endRow = Math.max(start.row, end.row);
  const startCol = Math.min(start.col, end.col);
  const endCol = Math.max(start.col, end.col);

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const option = getCellText(sourceSheet.getCell(row, col).value);
      if (option) options.push(option);
    }
  }

  return uniqueOptions(options);
};

const getColumnCellsToInspect = (
  worksheet: ExcelJS.Worksheet,
  headerRowNumber: number,
  colNumber: number
): ExcelJS.Cell[] => {
  const cells = [worksheet.getCell(headerRowNumber, colNumber)];
  const maxRowToInspect = Math.max(
    headerRowNumber + 20,
    Math.min(worksheet.rowCount || headerRowNumber, headerRowNumber + 50)
  );

  for (let rowNumber = headerRowNumber + 1; rowNumber <= maxRowToInspect; rowNumber += 1) {
    cells.push(worksheet.getCell(rowNumber, colNumber));
  }

  return cells;
};

const getColumnCommentText = (
  worksheet: ExcelJS.Worksheet,
  headerRowNumber: number,
  colNumber: number
) => combineCommentParts(
  ...getColumnCellsToInspect(worksheet, headerRowNumber, colNumber).map((cell) =>
    combineCommentParts(getCellNoteText(cell), getCellPromptText(cell))
  )
);

const extractDropdownOptionsForColumn = (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  headerRowNumber: number,
  colNumber: number,
  comment: string
) => uniqueOptions([
  ...getColumnCellsToInspect(worksheet, headerRowNumber, colNumber).flatMap((cell) =>
    extractDropdownOptionsFromValidation(workbook, worksheet, cell)
  ),
  ...extractDropdownOptionsFromText(comment),
]);

const columnHasExcelValidation = (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  headerRowNumber: number,
  colNumber: number
): boolean =>
  getColumnCellsToInspect(worksheet, headerRowNumber, colNumber).some(
    (cell) => extractDropdownOptionsFromValidation(workbook, worksheet, cell).length > 0
  );

const getInfoSheetFieldMetadata = (workbook: ExcelJS.Workbook): Map<string, FieldMetadata> => {
  const metadata = new Map<string, FieldMetadata>();
  const infoSheet = workbook.worksheets.find((sheet) => normalizeLookupKey(sheet.name) === "INFO");
  if (!infoSheet) return metadata;

  let headerRowNumber = 0;
  let fieldColumn = 0;
  let commentColumns: number[] = [];
  let optionColumns: number[] = [];

  for (let rowNumber = 1; rowNumber <= Math.min(15, infoSheet.rowCount); rowNumber += 1) {
    const columns: Array<{ col: number; text: string; normalized: string }> = [];
    infoSheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = getCellText(cell.value);
      if (text) columns.push({ col: colNumber, text, normalized: normalizeLookupKey(text) });
    });

    const fieldHeader = columns.find((item) =>
      item.normalized.includes("CAMPO") ||
      item.normalized.includes("VARIABLE") ||
      item.normalized.includes("COLUMNA") ||
      item.normalized === "NOMBRE"
    );

    const comments = columns
      .filter((item) =>
        item.normalized.includes("COMENTARIO") ||
        item.normalized.includes("PISTA") ||
        item.normalized.includes("DESCRIPCION") ||
        item.normalized.includes("INSTRUCCION") ||
        item.normalized.includes("DETALLE")
      )
      .map((item) => item.col);

    const options = columns
      .filter((item) =>
        item.normalized.includes("OPCION") ||
        item.normalized.includes("RESPUESTA") ||
        item.normalized.includes("VALOR") ||
        item.normalized.includes("LISTA") ||
        item.normalized.includes("SELECCION") ||
        item.normalized.includes("ALTERNATIVA")
      )
      .map((item) => item.col);

    if (fieldHeader && (comments.length > 0 || options.length > 0)) {
      headerRowNumber = rowNumber;
      fieldColumn = fieldHeader.col;
      commentColumns = comments.filter((col) => col !== fieldColumn);
      optionColumns = options.filter((col) => col !== fieldColumn);
      break;
    }
  }

  if (!headerRowNumber || !fieldColumn) return metadata;

  let currentFieldKey = "";
  for (let rowNumber = headerRowNumber + 1; rowNumber <= infoSheet.rowCount; rowNumber += 1) {
    const row = infoSheet.getRow(rowNumber);
    const fieldName = getCellText(row.getCell(fieldColumn).value);
    if (fieldName) currentFieldKey = normalizeLookupKey(fieldName);
    if (!currentFieldKey) continue;

    const comment = combineCommentParts(
      ...commentColumns.map((col) => getCellText(row.getCell(col).value))
    );
    const optionTexts = optionColumns.map((col) => getCellText(row.getCell(col).value)).filter(Boolean);
    const options = uniqueOptions([
      ...optionTexts.flatMap((optionText) => splitOptionCandidates(optionText, true)),
      ...extractDropdownOptionsFromText(comment),
    ]);

    const existing = metadata.get(currentFieldKey);
    metadata.set(currentFieldKey, {
      comment: combineCommentParts(existing?.comment, comment),
      dropdownOptions: uniqueOptions([...(existing?.dropdownOptions || []), ...options]),
    });
  }

  return metadata;
};

const getWorksheetHeaderFields = (
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  infoMetadata: Map<string, FieldMetadata>,
  originalComments: Map<string, string> = new Map(),
  validationMap: Map<number, string[]> = new Map()
) => {

  for (let rowNumber = 1; rowNumber <= Math.min(10, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const fields: Field[] = [];
    const usedHeaders = new Map<string, number>();

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = getCellText(cell.value);
      if (!header) return;

      const fieldName = makeUnique(header, usedHeaders);
      const metadata = infoMetadata.get(normalizeLookupKey(header));
      const columnComment = combineCommentParts(
        originalComments.get(getExcelCellAddress(rowNumber, colNumber)),
        getColumnCommentText(worksheet, rowNumber, colNumber)
      );
      const comment = combineCommentParts(columnComment, metadata?.comment);

      // Opciones directas de la columna: validación XML + marcador explícito en comentario (sin INFO sheet)
      // Usa la función estricta que solo extrae si hay "Los valores válidos/posibles son: ..."
      const columnDirectOptions = uniqueOptions([
        ...(validationMap.get(colNumber) || []),
        ...getColumnCellsToInspect(worksheet, rowNumber, colNumber).flatMap((c) =>
          extractDropdownOptionsFromValidation(workbook, worksheet, c)
        ),
        ...extractExplicitListOptionsFromText(columnComment),
      ]);

      const dropdownOptions = uniqueOptions([
        ...columnDirectOptions,
        ...(metadata?.dropdownOptions || []),
      ]);

      fields.push({
        name: fieldName,
        datatype: "Texto Largo",
        required: true,
        validate_with: "",
        comment,
        multiple: false,
        locked: true,
        dropdown_options: dropdownOptions,
        has_excel_validation: columnHasExcelValidation(workbook, worksheet, rowNumber, colNumber),
        excel_validation_options: columnDirectOptions,
        header_row: rowNumber,
        column: colNumber,
      });
    });

    if (fields.length > 0) return fields;
  }

  return [];
};

const getRawWorksheetSnapshot = (
  worksheet: ExcelJS.Worksheet,
  originalComments: Map<string, string> = new Map()
) => {
  let maxRow = 0;
  let maxCol = 0;
  const cellNotes: SheetCellNote[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    maxRow = Math.max(maxRow, rowNumber);
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      maxCol = Math.max(maxCol, colNumber);
      const note =
        originalComments.get(getExcelCellAddress(rowNumber, colNumber)) ||
        getCellNoteText(cell) ||
        getCellPromptText(cell);
      if (note) cellNotes.push({ row: rowNumber, col: colNumber, note });
    });
  });

  const rawRows: any[][] = [];
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const rowValues: any[] = [];
    for (let colNumber = 1; colNumber <= maxCol; colNumber += 1) {
      rowValues.push(getCellText(worksheet.getCell(rowNumber, colNumber).value));
    }
    rawRows.push(rowValues);
  }

  const columnWidths = Array.from({ length: maxCol }, (_, index) => worksheet.getColumn(index + 1).width || 20);
  return { rawRows, cellNotes, columnWidths };
};

const getTemplateWorksheets = (template: Template): TemplateWorksheet[] => {
  const workbookSheets = (template.workbook_sheets || []).filter(
    (sheet) => sheet.preserveOriginalContent || sheet.rawRows?.length || sheet.fields?.length > 0
  );
  if (workbookSheets.length > 0) return workbookSheets;
  return [{ name: template.name, fields: template.fields }];
};

const AdminTemplatesPage = () => {
  const { selectedPeriodId } = usePeriod();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { data: session } = useSession();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [modalOpen, { open, close }] = useDisclosure(false);
  const [baseUploadOpened, { open: openBaseUpload, close: closeBaseUpload }] = useDisclosure(false);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [selectedProducers, setSelectedProducers] = useState<string[]>([]);
  const [baseTemplateFiles, setBaseTemplateFiles] = useState<File[]>([]);
  const [publicationName, setPublicationName] = useState<string>('');
  const [deadline, setDeadline] = useState<Date | null>();
  const [customDeadline, setCustomDeadline] = useState<boolean>(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [creatingBaseTemplates, setCreatingBaseTemplates] = useState(false);
  const [auditModalOpened, setAuditModalOpened] = useState(false);
  const [selectedTemplateForAudit, setSelectedTemplateForAudit] = useState<Template | null>(null);

  const { sortedItems: sortedTemplates, handleSort, sortConfig } = useSort<Template>(templates, { key: null, direction: "asc" });

  const fetchTemplates = async (page: number, search: string) => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/all`, {
        params: { page, limit: 10, search, periodId: selectedPeriodId, onlyPublishedInPeriod: true },
      });
      if (response.data) {
        console.log(response.data.templates);
        const templatesWithAudit = await Promise.all(
          (response.data.templates || []).map(async (template: Template) => {
            try {
              const auditResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/config-audit/template/${template._id}`, {
                params: { email: session?.user?.email },
              });
              const lastAudit = auditResponse.data.audits?.[0]; // Más reciente
              return {
                ...template,
                lastModified: lastAudit ? {
                  user: lastAudit.user.full_name,
                  date: new Date(lastAudit.timestamp).toLocaleDateString('es-ES')
                } : undefined
              };
            } catch {
              return template;
            }
          })
        );
        setTemplates(templatesWithAudit);
        setTotalPages(response.data.pages || 1);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      setTemplates([]);
    }
  };

  useEffect(() => {
    fetchTemplates(page, search);
  }, [page, selectedPeriodId]);

  useEffect(() => {
    setPage(1);
  }, [selectedPeriodId]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchTemplates(page, search);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search, selectedPeriodId]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const email = session?.user?.email;
        const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/feedOptions`, {
          params: { email },
        });
        
        console.log('🔍 Full API response:', data);
        console.log('📅 Periods array:', data.periods);
        console.log('📅 Periods length:', data.periods?.length);
        
        setPeriods(data.periods || []);
        setProducers(data.producers || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    if (modalOpen && selectedTemplate) {
      fetchData();
    }
  }, [modalOpen, session, selectedTemplate]);

  const handleDelete = async (id: string) => {
    const templateToDelete = templates.find(t => t._id === id);
    
    modals.openConfirmModal({
      title: 'Confirmar eliminación',
      children: (
        <Text size="sm">
          ¿Estás seguro de que deseas eliminar la plantilla &quot;{templateToDelete?.name}&quot;? 
          Esta acción no se puede deshacer.
        </Text>
      ),
      labels: { confirm: 'Eliminar', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/templates/delete`, { 
            data: { 
              id,
              userEmail: session?.user?.email,
              userName: session?.user?.name
            } 
          });
          
          // Registrar en auditoría
          if (templateToDelete && session?.user?.email) {
            await logTemplateChange(
              id,
              templateToDelete.name,
              'delete',
              session.user.email,
              {
                templateId: id,
                templateName: templateToDelete.name,
                action: 'Eliminó la plantilla'
              }
            );
          }
          
          showNotification({
            title: "Eliminado",
            message: "Plantilla eliminada exitosamente",
            color: "teal",
          });
          fetchTemplates(page, search);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const mensaje = error.response?.data?.mensaje || "Hubo un error al eliminar la plantilla";
            showNotification({ title: "Error borrando plantilla", message: mensaje, color: "red" });
          } else {
            showNotification({ title: "Error borrando plantilla", message: "Error inesperado", color: "red" });
          }
        }
      },
    });
  };

  const resetBaseUpload = () => {
    setBaseTemplateFiles([]);
  };

  const openBaseUploadModal = () => {
    resetBaseUpload();
    openBaseUpload();
  };

  const closeBaseUploadModal = () => {
    if (creatingBaseTemplates) return;
    resetBaseUpload();
    closeBaseUpload();
  };

  const buildBaseTemplateDrafts = async () => {
    const drafts: BaseTemplateDraft[] = [];
    const usedTemplateNames = new Map<string, number>();

    for (const file of baseTemplateFiles) {
      const workbook = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      const originalWorkbookBase64 = arrayBufferToBase64(buffer);
      const originalCommentsBySheet = await extractWorkbookCommentsFromBase64(originalWorkbookBase64);
      await workbook.xlsx.load(buffer);

      const fileBaseName = cleanTemplateName(file.name, "Plantilla base");
      const infoMetadata = getInfoSheetFieldMetadata(workbook);
      const worksheets = workbook.worksheets.filter((worksheet) => worksheet.state !== "veryHidden");
      const workbookSheets: TemplateWorksheet[] = [];
      const flatFields: Field[] = [];
      const usedFieldNames = new Map<string, number>();

      // Parsea el XLSX como ZIP para leer validaciones de lista (estándar y formato extendido x14)
      const xlsxValidations = await parseXlsxListValidations(buffer, workbook);

      worksheets.forEach((worksheet) => {
        const sheetName = cleanTemplateName(worksheet.name, "Hoja");
        const worksheetValidationMap = xlsxValidations.get(worksheet.name) || new Map<number, string[]>();

        const sheetFields = normalizeLookupKey(worksheet.name) === "INFO"
          ? []
          : getWorksheetHeaderFields(
              workbook,
              worksheet,
              infoMetadata,
              originalCommentsBySheet.get(worksheet.name),
              worksheetValidationMap
            );

        workbookSheets.push({
          name: sheetName,
          fields: sheetFields,
          preserveOriginalContent: true,
          ...getRawWorksheetSnapshot(worksheet, originalCommentsBySheet.get(worksheet.name)),
        });

        sheetFields.forEach((field) => {
          flatFields.push({
            ...field,
            name: makeUnique(field.name, usedFieldNames),
          });
        });
      });

      if (flatFields.length > 0) {
        const name = makeUnique(fileBaseName, usedTemplateNames);

        drafts.push({
          name,
          fileName: cleanFileName(name),
          fields: flatFields,
          workbookSheets,
          originalWorkbookBase64,
        });
      }
    }

    return drafts;
  };
  const getRequestErrorMessage = (error: unknown) => {
    if (axios.isAxiosError(error)) {
      return error.response?.data?.mensaje || error.response?.data?.status || error.response?.data?.error || error.message;
    }

    return error instanceof Error ? error.message : "Error inesperado";
  };

  const handleCreateBaseTemplates = async () => {
    const email = session?.user?.email;
    if (!email) {
      showNotification({ title: "Error", message: "Usuario no autenticado", color: "red" });
      return;
    }

    if (baseTemplateFiles.length === 0) {
      showNotification({ title: "Faltan datos", message: "Selecciona al menos un archivo Excel.", color: "red" });
      return;
    }

    if (!selectedPeriodId) {
      showNotification({ title: "Error", message: "Selecciona un periodo antes de subir plantillas base.", color: "red" });
      return;
    }

    setCreatingBaseTemplates(true);
    try {
      const drafts = await buildBaseTemplateDrafts();
      if (drafts.length === 0) {
        showNotification({ title: "Sin encabezados", message: "No se encontraron hojas con encabezados para crear plantillas.", color: "yellow" });
        return;
      }

      let createdCount = 0;
      const errors: string[] = [];

      for (const draft of drafts) {
        try {
          await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/templates/create`, {
            name: draft.name,
            file_name: draft.fileName,
            file_description: `Importada desde plantilla base`,
            fields: draft.fields,
            active: true,
            workbook_sheets: draft.workbookSheets,
            original_workbook_base64: draft.originalWorkbookBase64,
            email,
            full_name: session?.user?.name,
            period: selectedPeriodId,
            dimensions: [],
            producers: [],
            auto_rename: true,
          });

          createdCount += 1;
        } catch (error) {
          errors.push(`${draft.name}: ${getRequestErrorMessage(error)}`);
        }
      }

      if (createdCount > 0) {
        showNotification({
          title: "Plantillas creadas",
          message: `${createdCount} plantilla(s) base fueron creadas en el periodo actual. Usa Asignar para publicarlas.`,
          color: "teal",
        });
        resetBaseUpload();
        closeBaseUpload();
        fetchTemplates(1, search);
        setPage(1);
      }

      if (errors.length > 0) {
        showNotification({
          title: "Algunas plantillas no se crearon",
          message: errors.slice(0, 2).join(" | "),
          color: createdCount > 0 ? "yellow" : "red",
          autoClose: 9000,
        });
      }
    } catch (error) {
      console.error("Error creating base templates:", error);
      showNotification({ title: "Error", message: getRequestErrorMessage(error), color: "red" });
    } finally {
      setCreatingBaseTemplates(false);
    }
  };

  const resolveUniqueSheetName = (workbook: ExcelJS.Workbook, rawName: string, fallback: string): string => {
    const base = sanitizeSheetName(rawName || fallback) || fallback;
    let candidate = base;
    let counter = 1;

    while (workbook.getWorksheet(candidate)) {
      const suffix = `_${counter}`;
      candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
      counter += 1;
    }

    return candidate;
  };

  const applyFieldValidationByDatatype = (cell: ExcelJS.Cell, field: Field) => {
    switch (field.datatype) {
      case 'Entero':
        cell.dataValidation = {
          type: 'whole',
          operator: 'between',
          formulae: [1, 9999999999999999999999999999999],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un numero entero.'
        };
        break;
      case 'Decimal':
        cell.dataValidation = {
          type: 'decimal',
          operator: 'between',
          formulae: [0.0, 9999999999999999999999999999999],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un numero decimal.'
        };
        break;
      case 'Porcentaje':
        cell.dataValidation = {
          type: 'decimal',
          operator: 'between',
          formulae: [0.0, 100.0],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un numero decimal entre 0.0 y 100.0.'
        };
        break;
      case 'Texto Corto':
        cell.dataValidation = {
          type: 'textLength',
          operator: 'lessThanOrEqual',
          formulae: [60],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un texto de hasta 60 caracteres.'
        };
        break;
      case 'Texto Largo':
        cell.dataValidation = {
          type: 'textLength',
          operator: 'lessThanOrEqual',
          formulae: [500],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un texto de hasta 500 caracteres.'
        };
        break;
      case 'True/False':
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Si,No"'],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, selecciona Si o No.'
        };
        break;
      case 'Fecha':
      case 'Fecha Inicial / Fecha Final':
        cell.dataValidation = {
          type: 'date',
          operator: 'between',
          formulae: [new Date(1900, 0, 1), new Date(9999, 11, 31)],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce una fecha valida en el formato DD/MM/AAAA.'
        };
        cell.numFmt = 'DD/MM/YYYY';
        break;
      case 'Link':
        cell.dataValidation = {
          type: 'textLength',
          operator: 'greaterThan',
          formulae: [0],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un enlace valido.'
        };
        break;
      default:
        break;
    }

    if (field.comment && cell.dataValidation) {
      const normalizedComment = field.comment.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      const promptBase = normalizedComment.slice(0, 220);
      const promptText = normalizedComment.length > 220
        ? `${promptBase}...`
        : promptBase;
      cell.dataValidation = {
        ...cell.dataValidation,
        showInputMessage: true,
        promptTitle: field.name.slice(0, 32),
        prompt: promptText,
      };
    }
  };

  const populateTemplateWorksheet = (
    workbook: ExcelJS.Workbook,
    template: Template,
    worksheetName: string,
    _includeHelpSheet = false,
    validators = template.validators,
    fields = template.fields
  ) => {
    const worksheet = workbook.addWorksheet(worksheetName);

    const headerRow = worksheet.addRow(fields.map(field => field.name));
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '0f1f39' },
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };

      const field = fields[colNumber - 1];
      applyFieldCommentNote(cell, field.comment);
    });

    worksheet.columns.forEach(column => {
      column.width = 20;
    });

    const maxRows = 1000;
    worksheet.getRow(maxRows);

    fields.forEach((field, index) => {
      const colNumber = index + 1;
      for (let rowNumber = 2; rowNumber <= maxRows; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const cell = row.getCell(colNumber);
        applyFieldValidationByDatatype(cell, field);
      }
    });

    applyValidatorDropdowns({
      workbook,
      worksheet,
      fields,
      validators,
      startRow: 2,
      endRow: maxRows,
    });
  };

  const populateRawWorksheet = (
    workbook: ExcelJS.Workbook,
    worksheetName: string,
    sheet: TemplateWorksheet
  ) => {
    const worksheet = workbook.addWorksheet(worksheetName);

    (sheet.rawRows || []).forEach((row) => {
      worksheet.addRow(row || []);
    });

    (sheet.columnWidths || []).forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width || 20;
    });

    (sheet.cellNotes || []).forEach((note) => {
      if (!note?.row || !note?.col || !note?.note) return;
      worksheet.getCell(note.row, note.col).note = note.note;
    });

    return worksheet;
  };

  const addSummaryWorksheets = (workbook: ExcelJS.Workbook, allTemplates: Template[]) => {
    const summary = workbook.addWorksheet('Plantillas');
    const fieldsDetail = workbook.addWorksheet('Campos Plantillas');

    summary.addRow(['Plantilla', 'Creado Por', 'Ambitos', 'Campos', 'Publicada']);
    allTemplates.forEach((template) => {
      summary.addRow([
        template.name,
        template.created_by?.full_name || '',
        template.dimensions?.map((dim) => dim.name).join(', ') || '',
        template.fields?.length || 0,
        template.published ? 'Si' : 'No',
      ]);
    });

    fieldsDetail.addRow(['Plantilla', 'Campo', 'Tipo de dato', 'Requerido', 'Validador', 'Respuesta posible', 'Comentario']);

    const normalizeToken = (value: string): string =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();

    const toOptionText = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (typeof value === 'object' && '$numberInt' in (value as Record<string, unknown>)) {
        return String((value as Record<string, unknown>).$numberInt ?? '').trim();
      }
      return String(value).trim();
    };

    const buildOptionsForField = (template: Template, validateWith?: string): string[] => {
      if (!validateWith) return [];
      const parts = validateWith.split(' - ');
      const validatorName = parts[0]?.trim();
      const preferredColumn = parts.slice(1).join(' - ').trim();
      if (!validatorName) return [];

      const validator = (template.validators || []).find(
        (item) => normalizeToken(item.name) === normalizeToken(validatorName)
      );
      if (!validator || !Array.isArray(validator.values)) return [];

      const result: string[] = [];
      const seen = new Set<string>();

      validator.values.forEach((row: Record<string, unknown>) => {
        const keys = Object.keys(row || {});
        if (!keys.length) return;

        const valueKey = preferredColumn
          ? keys.find((key) => normalizeToken(key) === normalizeToken(preferredColumn))
          : keys[0];
        const mainKey = valueKey || keys[0];
        const mainValue = row[mainKey];
        const mainText = toOptionText(mainValue);
        if (!mainText) return;

        const descKey = keys.find((key) => {
          if (key === mainKey) return false;
          const normalized = normalizeToken(key);
          return normalized.includes('DESCRIPCION') || normalized.includes('NOMBRE') || normalized.startsWith('DESC');
        });
        const descText = descKey ? toOptionText(row[descKey]) : '';
        const option = descText ? `${mainText} - ${descText}` : mainText;
        if (!option || seen.has(option)) return;
        seen.add(option);
        result.push(option);
      });

      return result;
    };

    const optionsByValidator = new Map<string, string[]>();
    const rowValidatorKey = new Map<number, string>();

    allTemplates.forEach((template) => {
      template.fields.forEach((field) => {
        const validateWith = (field.validate_with || '').trim();
        const detailRow = fieldsDetail.addRow([
          template.name,
          field.name,
          field.datatype,
          field.required ? 'Si' : 'No',
          validateWith,
          '',
          field.comment || '',
        ]);

        if (!validateWith) return;
        rowValidatorKey.set(detailRow.number, validateWith);
        if (!optionsByValidator.has(validateWith)) {
          optionsByValidator.set(validateWith, buildOptionsForField(template, validateWith));
        }
      });
    });

    if (optionsByValidator.size > 0) {
      const optionsSheet = workbook.addWorksheet('_OpcionesValidador');
      optionsSheet.state = 'veryHidden';

      const validatorColumns = new Map<string, { col: number; total: number }>();
      let col = 1;
      Array.from(optionsByValidator.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'es'))
        .forEach(([validatorKey, options]) => {
          optionsSheet.getCell(1, col).value = validatorKey;
          options.forEach((option, idx) => {
            optionsSheet.getCell(idx + 2, col).value = option;
          });
          validatorColumns.set(validatorKey, { col, total: options.length });
          col += 1;
        });

      const toColLetter = (index: number): string => {
        let n = index;
        let letters = '';
        while (n > 0) {
          const rem = (n - 1) % 26;
          letters = String.fromCharCode(65 + rem) + letters;
          n = Math.floor((n - 1) / 26);
        }
        return letters;
      };

      rowValidatorKey.forEach((validatorKey, row) => {
        const info = validatorColumns.get(validatorKey);
        if (!info || info.total === 0) return;
        const colLetter = toColLetter(info.col);
        const listRange = `'_OpcionesValidador'!$${colLetter}$2:$${colLetter}$${info.total + 1}`;
        fieldsDetail.getCell(row, 6).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [listRange],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Selecciona una respuesta posible de la lista.',
        };
      });
    }

    [summary, fieldsDetail].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F1F39' },
      };
      sheet.columns.forEach((column) => {
        column.width = 30;
      });
    });
  };

  const fetchAllTemplatesForExport = async () => {
    const allTemplates: Template[] = [];
    let currentPage = 1;
    let pages = 1;
    const limit = 100;

    do {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/all`, {
        params: { page: currentPage, limit, search: '', periodId: selectedPeriodId, onlyPublishedInPeriod: true },
      });

      allTemplates.push(...(response.data?.templates || []));
      pages = response.data?.pages || 1;
      currentPage += 1;
    } while (currentPage <= pages);

    return allTemplates;
  };

  const handleDownload = async (template: Template) => {
    const worksheets = getTemplateWorksheets(template);

    if (template.original_workbook_base64) {
      const workbook = await loadWorkbookFromBase64(template.original_workbook_base64);
      const originalCommentsBySheet = await extractWorkbookCommentsFromBase64(template.original_workbook_base64);

      // Re-apply all notes extracted via JSZip (ExcelJS may not load note text from xlsx correctly)
      for (const [sheetName, sheetComments] of originalCommentsBySheet.entries()) {
        const ws = workbook.getWorksheet(sheetName);
        if (!ws) continue;
        for (const [cellRef, noteText] of sheetComments.entries()) {
          if (noteText) applyFieldCommentNote(ws.getCell(cellRef), noteText);
        }
      }

      // Also apply cellNotes stored in the template snapshot (fallback for older imports)
      (template.workbook_sheets || []).forEach((sheet) => {
        const ws = workbook.getWorksheet(sheet.name);
        if (!ws || !sheet.cellNotes?.length) return;
        sheet.cellNotes.forEach((note) => {
          if (note?.row && note?.col && note?.note) {
            applyFieldCommentNote(ws.getCell(note.row, note.col), note.note);
          }
        });
      });

      applyWorkbookSheetDropdowns({
        workbook,
        workbookSheets: worksheets,
        validators: template.validators,
        originalCommentsBySheet,
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      saveAs(blob, `${template.file_name}.xlsx`);
      return;
    }

    const workbook = new ExcelJS.Workbook();
    worksheets.forEach((sheet, index) => {
      const worksheetName = resolveUniqueSheetName(workbook, sheet.name || template.name, `Plantilla_${index + 1}`);
      if (sheet.preserveOriginalContent) {
        const worksheet = populateRawWorksheet(workbook, worksheetName, sheet);
        applyValidatorDropdowns({
          workbook,
          worksheet,
          fields: sheet.fields,
          validators: template.validators,
          startRow: 2,
          endRow: 1000,
        });
        return;
      }
      populateTemplateWorksheet(workbook, template, worksheetName, false, template.validators, sheet.fields);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    saveAs(blob, `${template.file_name}.xlsx`);
  };

  const handleDownloadAllTemplates = async () => {
    setDownloadingAll(true);
    try {
      const allTemplates = await fetchAllTemplatesForExport();

      if (!allTemplates.length) {
        showNotification({
          title: 'Sin datos',
          message: 'No hay plantillas para exportar en este periodo.',
          color: 'yellow',
        });
        return;
      }

      const workbook = new ExcelJS.Workbook();
      addSummaryWorksheets(workbook, allTemplates);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const dateTag = new Date().toISOString().slice(0, 10);
      saveAs(blob, `plantillas_consolidadas_${dateTag}.xlsx`);

      showNotification({
        title: 'Exportacion completada',
        message: 'Se descargo el Excel con las hojas Plantillas y Campos Plantillas.',
        color: 'teal',
      });
    } catch (error) {
      console.error('Error exporting templates:', error);
      showNotification({
        title: 'Error',
        message: 'No fue posible descargar el consolidado de plantillas.',
        color: 'red',
      });
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    
    if (!publicationName || !selectedPeriod) {
      showNotification({
        title: "Error",
        message: "Por favor completa todos los campos requeridos",
        color: "red",
      });
      return;
    }
    
    modals.openConfirmModal({
      title: 'Confirmar asignación',
      children: (
        <Text size="sm">
          ¿Estás seguro de que deseas asignar la plantilla &quot;{selectedTemplate?.name}&quot; 
          al período seleccionado? Los productores podrán acceder a esta plantilla.
        </Text>
      ),
      labels: { confirm: 'Asignar', cancel: 'Cancelar' },
      confirmProps: { color: 'blue' },
      onConfirm: async () => {
        try {
          await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/publish`, {
            name: publicationName,
            template_id: selectedTemplate?._id,
            period_id: selectedPeriod,
            user_email: session?.user?.email,
            deadline: customDeadline ? deadline : periods.find(period => period._id === selectedPeriod)?.producer_end_date,
          });
          console.log('Template successfully pubished');
          showNotification({
            title: "Publicación Exitosa",
            message: "La plantilla ha sido publicada exitosamente",
            color: "teal",
          });
          close();
        } catch (error) {
          console.error('Error publishing template:', error);
          showNotification({
            title: "Error",
            message: "Hubo un error al publicar la plantilla",
            color: "red",
          });
        }
      },
    });
  };

  const rows = sortedTemplates.map((template) => (
    <Table.Tr key={template._id}>
      <Table.Td>{template.name}</Table.Td>
      <Table.Td>
        <Text size="sm">{template.created_by.full_name}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{template?.dimensions?.map(dim => dim.name).join(", ")}</Text>
      </Table.Td>
      <Table.Td>
        {template.lastModified ? (
          <div>
            <Text size="sm" fw={500}>{template.lastModified.user}</Text>
            <Text size="xs" c="dimmed">{template.lastModified.date}</Text>
          </div>
        ) : (
          <Text size="sm" c="dimmed">Sin modificaciones</Text>
        )}
      </Table.Td>
      <Table.Td>
        <Center>
          <Group gap={3}>
            <Tooltip
              label="Descargar plantilla"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button variant="outline" onClick={() => handleDownload(template)}>
                <IconDownload size={16} />
              </Button>
            </Tooltip>
            <Tooltip
              label="Duplicar plantilla"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button
                variant="outline"
                color="orange"
                onClick={() => router.push(`/templates/duplicate/${template._id}`)}
              >
                <IconCopy size={16} />
              </Button>
            </Tooltip>
            <Tooltip
              label="Editar plantilla"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button
                variant="outline"
                onClick={() => router.push(`/templates/update/${template._id}`)}
              >
                <IconEdit size={16} />
              </Button>
            </Tooltip>

            <Tooltip
              label="Trazabilidad"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button
                variant="outline"
                color="teal"
                onClick={() => {
                  setSelectedTemplateForAudit(template);
                  setAuditModalOpened(true);
                }}
              >
                <IconHistory size={16} />
              </Button>
            </Tooltip>

            <Tooltip
                  label="Borrar plantilla"
                  transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button color="red" variant="outline" onClick={() => handleDelete(template._id)}>
                <IconTrash size={16} />
              </Button>
            </Tooltip>
          </Group>
        </Center>
      </Table.Td>
      <Table.Td>
        <Center>
          <Tooltip
                  label={template.published ? "Plantilla ya asignada en el periodo" :
                    "Asignar plantilla a periodo"}
                  transitionProps={{ transition: 'fade-up', duration: 300 }}
          >
            <Button 
              disabled={template.published}
              variant="outline" 
              onClick={() => { 
              setSelectedTemplate(template);
              setPublicationName(template.name)
              open(); 
              console.log("Modal open state:", modalOpen);
            }}>
              <IconUser size={16} />
            </Button>
          </Tooltip>
        </Center>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <DateConfig/>
      <TextInput
        placeholder="Buscar en todas las plantillas"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
      <Group>
        <Tooltip label="Volver">
          <ActionIcon
            variant="subtle"
            color="blue"
            size="lg"
            onClick={() => router.back()}
            aria-label="Volver"
          >
            <IconArrowLeft size={20} />
          </ActionIcon>
        </Tooltip>
        <Button
          onClick={() => router.push('/templates/create')}
          leftSection={<IconCirclePlus/>}
        >
          Crear Nueva Plantilla
        </Button>
        <Button
    onClick={() => router.push('/templates/categories')}  
    leftSection={<IconArrowsTransferDown size={16} />}
  >
    Categorizar Plantillas
  </Button>

        <Button
          onClick={handleDownloadAllTemplates}
          variant="light"
          leftSection={<IconFileSpreadsheet size={16} />}
          loading={downloadingAll}
        >
          Descargar Todas las Plantillas
        </Button>
 <Button
          onClick={openBaseUploadModal}
          variant="light"
          color="teal"
          leftSection={<IconUpload size={16} />}
        >
          Subir Plantillas Base
        </Button>
        <Button 
          ml={"auto"} 
          onClick={() => router.push('/templates/published')}
          variant="outline"
          rightSection={<IconArrowRight size={16} />}>
          Ir a Plantillas Publicadas
        </Button>

      </Group>
      <Table striped withTableBorder mt="md">
      <Table.Thead>
        <Table.Tr>
          <Table.Th onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
            <Center inline>
              Nombre
              {sortConfig.key === "name" ? (
                sortConfig.direction === "asc" ? 
                <IconArrowBigUpFilled size={16} style={{ marginLeft: '5px' }} /> 
                : 
                <IconArrowBigDownFilled size={16} style={{ marginLeft: '5px' }} />
              ) : (
                <IconArrowsTransferDown size={16} style={{ marginLeft: '5px' }} />
              )}
            </Center>
          </Table.Th>

          <Table.Th onClick={() => handleSort("created_by.full_name")} style={{ cursor: "pointer" }}>
            <Center inline>
              Creado Por
              {sortConfig.key === "created_by.full_name" ? (
                sortConfig.direction === "asc" ? 
                <IconArrowBigUpFilled size={16} style={{ marginLeft: '5px' }} /> 
                : 
                <IconArrowBigDownFilled size={16} style={{ marginLeft: '5px' }} />
              ) : (
                <IconArrowsTransferDown size={16} style={{ marginLeft: '5px' }} />
              )}
            </Center>
          </Table.Th>



          <Table.Th onClick={() => handleSort("file_description")} style={{ cursor: "pointer" }}>
            <Center inline>
              Ámbitos
              {sortConfig.key === "file_description" ? (
                sortConfig.direction === "asc" ? 
                <IconArrowBigUpFilled size={16} style={{ marginLeft: '5px' }} /> 
                : 
                <IconArrowBigDownFilled size={16} style={{ marginLeft: '5px' }} />
              ) : (
                <IconArrowsTransferDown size={16} style={{ marginLeft: '5px' }} />
              )}
            </Center>
          </Table.Th>
          <Table.Th>
            <Center>Última Modificación</Center>
          </Table.Th>
          <Table.Th>
            <Center>Acciones</Center>
          </Table.Th>

          <Table.Th>
            <Center>Asignar</Center>
          </Table.Th>
        </Table.Tr>
      </Table.Thead>
        <Table.Tbody>
          {rows.length > 0 ? (
            rows
          ) : (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Center py="md">
                  <Text c="dimmed">No hay plantillas en este periodo.</Text>
                </Center>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <Center>
        <Pagination
          mt={15}
          value={page}
          onChange={setPage}
          total={totalPages}
          siblings={1}
          boundaries={3}
        />
      </Center>
      <Modal
        opened={baseUploadOpened}
        onClose={closeBaseUploadModal}
        title="Subir Plantillas Base"
        size="lg"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
      >
        <Stack>
          <FileInput
            label="Archivos base"
            placeholder="Selecciona archivos Excel"
            value={baseTemplateFiles}
            onChange={(files) => setBaseTemplateFiles(files || [])}
            accept=".xlsx,.xlsm"
            multiple
            clearable
            leftSection={<IconUpload size={16} />}
          />
          <Text size="sm" c="dimmed">
            Cada archivo crea una sola plantilla sin publicarla. Si el Excel tiene varias hojas, se conservaran en la descarga de esa plantilla.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeBaseUploadModal} disabled={creatingBaseTemplates}>
              Cancelar
            </Button>
            <Button onClick={handleCreateBaseTemplates} loading={creatingBaseTemplates}>
              Crear plantillas
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={modalOpen}
        onClose={() => {
          close()
          setSelectedTemplate(null)
          setSelectedPeriod('')
          setCustomDeadline(false)
          setDeadline(null)
        }}
        title="Asignar Plantilla"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
      >
        <form onSubmit={handleSubmit}>
          <TextInput label="Nombre de la Publicación" placeholder="Ingrese el nombre de la publicación" value={publicationName} onChange={(e) => setPublicationName(e.currentTarget.value)} />
          <TextInput label="Nombre de la Plantilla" value={selectedTemplate?.name || ''} disabled />
          <Select
            label="Periodo"
            placeholder="Seleccione un periodo"
            data={periods.map(period => ({ value: period._id, label: period.name }))}
            value={selectedPeriod}
            onChange={(value) => {
              setSelectedPeriod(value || '')
              setDeadline(new Date(periods.find(period => period._id === value)?.producer_end_date || ""))
            }}
          />
          {
          selectedPeriod &&
          <>
            <Text size="sm" mt={'xs'} c='dimmed'>Fecha Límite: {deadline ? dateToGMT(deadline) : "No disponible"}</Text>
            <Checkbox
              mt={'sm'}
              mb={'xs'}
              label="Establecer un plazo inferior al establecido en el periodo"
              checked={customDeadline}
              onChange={(event) => setCustomDeadline(event.currentTarget.checked)}
            />
          </>
          }
          {
            customDeadline &&
            <DatePickerInput
              locale="es"
              label="Fecha Límite"
              value={deadline}
              onChange={setDeadline}
              maxDate={selectedPeriod ? 
                  new Date(periods.find(period => period._id === selectedPeriod)?.producer_end_date 
                  || "") : undefined}
              minDate={selectedPeriod ?
                  new Date(periods.find(period => period._id === selectedPeriod)?.producer_start_date 
                  || "") : undefined 
              }
            />
          }
          <Group justify="flex-end" mt="md">
            <Button type="submit">Asignar</Button>
          </Group>
        </form>
      </Modal>
      
      <ConfigAuditModal
        opened={auditModalOpened}
        onClose={() => {
          setAuditModalOpened(false);
          setSelectedTemplateForAudit(null);
        }}
        entityType="template"
        entityId={selectedTemplateForAudit?._id || ''}
        entityName={selectedTemplateForAudit?.name || ''}
        email={session?.user?.email ?? ''}
      />
    </Container>
  );
};

export default AdminTemplatesPage;
