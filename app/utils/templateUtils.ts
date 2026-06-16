import ExcelJS from "exceljs";
import JSZip from "jszip";

export const sanitizeSheetName = (name: string): string => {
  return name.replace(/[/\\?*[\]]/g, '').substring(0, 31);
};

export const shouldAddWorksheet = (workbook: ExcelJS.Workbook, sheetName: string): boolean => {
  return !workbook.getWorksheet(sheetName);
};

interface FieldWithValidator {
  name: string;
  validate_with?: string | { id?: string; name?: string };
  multiple?: boolean;
  comment?: string;
  dropdown_options?: string[];
  header_row?: number;
  column?: number;
}

interface ValidatorOptionSource {
  name: string;
  values: Record<string, unknown>[];
  columns?: { name: string; is_validator?: boolean; type?: string }[];
}

interface WorkbookSheetWithFields {
  name: string;
  fields?: FieldWithValidator[];
}

const getConfiguredFieldPosition = (field: FieldWithValidator, fieldIndex: number) => {
  const configuredColumn = Number(field.column);
  const configuredHeaderRow = Number(field.header_row);

  return {
    col: Number.isFinite(configuredColumn) && configuredColumn > 0
      ? configuredColumn
      : fieldIndex + 1,
    headerRow: Number.isFinite(configuredHeaderRow) && configuredHeaderRow > 0
      ? configuredHeaderRow
      : 1,
  };
};

const getValidateWithText = (validateWith: FieldWithValidator["validate_with"]): string => {
  if (!validateWith) return "";
  if (typeof validateWith === "string") return validateWith.trim();
  return String(validateWith.name || validateWith.id || "").trim();
};

const splitValidateWithReference = (validateWith: FieldWithValidator["validate_with"]) => {
  const text = getValidateWithText(validateWith);
  const parts = text.split(" - ");
  return {
    text,
    validatorName: (parts[0] || "").trim(),
    columnName: parts.slice(1).join(" - ").trim(),
  };
};

const findValidatorByName = (validators: ValidatorOptionSource[], name = "") =>
  validators.find((item) => normalizeToken(item.name) === normalizeToken(name));

const getFieldCommentForNote = (field: FieldWithValidator): string => {
  return field.comment
    ? String(field.comment).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
    : "";
};

const applyHeaderCommentNote = (
  worksheet: ExcelJS.Worksheet,
  field: FieldWithValidator,
  fieldIndex: number,
  startRow: number = 2,
  endRow: number = 1000,
  _fallbackOptions: string[] = []
) => {
  const comment = getFieldCommentForNote(field);
  if (!comment) return;

  const { col, headerRow } = getConfiguredFieldPosition(field, fieldIndex);
  const firstDataRow = Math.max(startRow, headerRow + 1);
  for (let row = firstDataRow; row <= endRow; row++) {
    applyFieldCommentNote(worksheet.getCell(row, col), comment);
  }
};

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }

  return btoa(binary);
};

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
};

export const loadWorkbookFromBase64 = async (base64: string): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(base64ToArrayBuffer(base64));
  return workbook;
};

const toColumnLetter = (index: number): string => {
  let n = index;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
};

export const getExcelCellAddress = (row: number, col: number): string =>
  `${toColumnLetter(col)}${row}`;

const resolveZipPath = (fromPath: string, target: string): string => {
  const normalizedTarget = target.replace(/\\/g, "/");
  if (normalizedTarget.startsWith("/")) return normalizedTarget.replace(/^\/+/, "");

  const parts = fromPath.split("/").slice(0, -1);
  normalizedTarget.split("/").forEach((part) => {
    if (!part || part === ".") return;
    if (part === "..") {
      parts.pop();
      return;
    }
    parts.push(part);
  });

  return parts.join("/");
};

const parseXml = (xml: string): Document =>
  new DOMParser().parseFromString(xml, "application/xml");

const getRelTargets = (relsXml: string): Map<string, { target: string; type: string }> => {
  const rels = new Map<string, { target: string; type: string }>();
  const doc = parseXml(relsXml);
  Array.from(doc.getElementsByTagName("Relationship")).forEach((node) => {
    const id = node.getAttribute("Id") || "";
    const target = node.getAttribute("Target") || "";
    const type = node.getAttribute("Type") || "";
    if (id && target) rels.set(id, { target, type });
  });
  return rels;
};

const getCommentNodeText = (node: Element): string => {
  const textNodes = Array.from(node.getElementsByTagName("t"));
  if (textNodes.length > 0) {
    return textNodes.map((item) => item.textContent || "").join("").trim();
  }
  return (node.textContent || "").trim();
};

export const extractWorkbookCommentsFromBase64 = async (
  base64: string
): Promise<Map<string, Map<string, string>>> => {
  const commentsBySheet = new Map<string, Map<string, string>>();
  if (!base64) return commentsBySheet;

  const zip = await JSZip.loadAsync(base64ToArrayBuffer(base64));
  const workbookPath = "xl/workbook.xml";
  const workbookXml = await zip.file(workbookPath)?.async("text");
  const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbookXml || !workbookRelsXml) return commentsBySheet;

  const workbookRels = getRelTargets(workbookRelsXml);
  const workbookDoc = parseXml(workbookXml);
  const sheets = Array.from(workbookDoc.getElementsByTagName("sheet"));

  for (const sheetNode of sheets) {
    const sheetName = sheetNode.getAttribute("name") || "";
    const relId =
      sheetNode.getAttribute("r:id") ||
      sheetNode.getAttributeNS(
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "id"
      ) ||
      sheetNode.getAttribute("id") ||
      "";
    const sheetRel = workbookRels.get(relId);
    if (!sheetName || !sheetRel?.target) continue;

    const sheetPath = resolveZipPath(workbookPath, sheetRel.target);
    const sheetParts = sheetPath.split("/");
    const sheetFileName = sheetParts.pop();
    if (!sheetFileName) continue;

    const sheetRelsPath = `${sheetParts.join("/")}/_rels/${sheetFileName}.rels`;
    const sheetRelsXml = await zip.file(sheetRelsPath)?.async("text");
    if (!sheetRelsXml) continue;

    const sheetRels = getRelTargets(sheetRelsXml);
    const comments = new Map<string, string>();

    for (const rel of sheetRels.values()) {
      const normalizedType = rel.type.toLowerCase();
      if (!normalizedType.includes("/comments") && !normalizedType.includes("/threadedcomments")) {
        continue;
      }

      // Targets in .rels files are relative to the parent document (sheetPath), not the .rels file itself
      const commentsPath = resolveZipPath(sheetPath, rel.target);
      const commentsXml = await zip.file(commentsPath)?.async("text");
      if (!commentsXml) continue;

      const commentsDoc = parseXml(commentsXml);
      const legacyComments = Array.from(commentsDoc.getElementsByTagName("comment"));
      const threadedComments = Array.from(commentsDoc.getElementsByTagName("threadedComment"));

      [...legacyComments, ...threadedComments].forEach((commentNode) => {
        const ref = commentNode.getAttribute("ref") || "";
        const text = getCommentNodeText(commentNode);
        if (ref && text) comments.set(ref.replace(/\$/g, ""), text);
      });
    }

    if (comments.size > 0) commentsBySheet.set(sheetName, comments);
  }

  return commentsBySheet;
};

const normalizeToken = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const resolveValueByKey = (row: Record<string, unknown>, targetKey: string): unknown => {
  if (Object.prototype.hasOwnProperty.call(row, targetKey)) return row[targetKey];
  const normalizedTarget = normalizeToken(targetKey);
  const matchedKey = Object.keys(row).find((key) => normalizeToken(key) === normalizedTarget);
  return matchedKey ? row[matchedKey] : undefined;
};

const toOptionText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && "$numberInt" in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>).$numberInt ?? "").trim();
  }
  return String(value).trim();
};

const getValidatorOptions = (
  validator: ValidatorOptionSource,
  preferredColumnName?: string
): { value: string; displayLabel: string }[] => {
  const options: { value: string; displayLabel: string }[] = [];
  const seen = new Set<string>();

  validator.values.forEach((row) => {
    const keys = Object.keys(row || {});
    if (keys.length === 0) return;

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
    if (idValue === null || idValue === undefined) return;

    const descKey = keys.find((key) => {
      if (key === idKey) return false;
      const normalized = normalizeToken(key);
      return (
        normalized.includes("DESCRIPCION") ||
        normalized.includes("NOMBRE") ||
        normalized.startsWith("DESC")
      );
    });

    const rawIdText = toOptionText(idValue);
    if (!rawIdText) return;

    const descValue = descKey ? resolveValueByKey(row, descKey) : undefined;
    const descText = toOptionText(descValue);
    if (descKey && !descText) return;

    // When there is no separate description column, detect "CODE description" in a single value
    // e.g. "CC Cédula de ciudadanía" → storedValue = "CC"
    // e.g. "1 Posdoctorado"         → storedValue = "1"
    let storedValue = rawIdText;
    if (!descKey) {
      const codeMatch = /^([A-Z0-9]{1,6})\s+.+$/.exec(rawIdText);
      if (codeMatch) storedValue = codeMatch[1];
    }

    const displayLabel = descText ? `${rawIdText} - ${descText}` : rawIdText;

    if (seen.has(storedValue)) return;
    seen.add(storedValue);
    options.push({ value: storedValue, displayLabel });
  });

  return options;
};

const extractOptionsFromCommentValidators = (comment: string): string[] => {
  if (!comment) return [];
  const lines = comment.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const options: string[] = [];
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
    const hasValueWord =
      normalized.includes("VALORES") ||
      normalized.includes("VALOSRES") ||
      normalized.includes("VALOSR");
    if (
      normalized.endsWith(":") &&
      hasValueWord &&
      (normalized.includes("VALIDOS") || normalized.includes("POSIBLES") || normalized.includes("PERMITIDOS"))
    ) {
      inValidSection = true;
      continue;
    }

    if (inValidSection) {
      options.push(trimmed.replace(/\s+/g, " "));
    }
  }

  return [...new Set(options)].filter(Boolean);
};

const stripOptionPrefix = (value: string): string =>
  value.replace(/^\s*(?:[-*•]|\d+[).:\-\s]+)\s*/, "").replace(/\s+/g, " ").trim();

const normalizeOptionKey = (value: string): string => {
  const stripped = stripOptionPrefix(value);
  return normalizeToken(stripped || value);
};

const appendOptionTexts = (
  options: { value: string; displayLabel: string }[],
  optionTexts: string[]
): { value: string; displayLabel: string }[] => {
  const seen = new Set(options.map((option) => normalizeOptionKey(option.displayLabel)));
  const merged = [...options];

  optionTexts.forEach((optionText) => {
    const displayLabel = String(optionText || "").trim();
    if (!displayLabel) return;

    const key = normalizeOptionKey(displayLabel);
    if (seen.has(key)) return;

    seen.add(key);
    merged.push({ value: displayLabel, displayLabel });
  });

  return merged;
};

export const applyValidatorDropdowns = ({
  workbook,
  worksheet,
  fields,
  validators,
  startRow = 2,
  endRow = 1000,
  preloadedValidatorOptions = {},
}: {
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  fields: FieldWithValidator[];
  validators: ValidatorOptionSource[];
  startRow?: number;
  endRow?: number;
  preloadedValidatorOptions?: Record<string, string[]>;
}): void => {
  const sourcesSheetName = "_Listas";
  // Reusar o crear la hoja _Listas; si ya existe, continuar desde la última columna usada
  let sourcesSheet = workbook.getWorksheet(sourcesSheetName);
  if (!sourcesSheet) {
    sourcesSheet = workbook.addWorksheet(sourcesSheetName);
    sourcesSheet.state = "veryHidden";
  }
  let sourceCol = Math.max(1, sourcesSheet.columnCount + 1);

  fields.forEach((field, fieldIndex) => {
    let options: string[] = [];

    // 1. Extraer del comentario
    if (field.comment) {
      options = extractOptionsFromCommentValidators(field.comment);
    }

    // 2. Respaldo: dropdown_options ya almacenadas
    if (options.length === 0 && Array.isArray(field.dropdown_options) && field.dropdown_options.length > 0) {
      const seen = new Set<string>();
      options = field.dropdown_options
        .map((o) => String(o || "").trim())
        .filter((o) => o && !seen.has(o) && !!seen.add(o));
    }

    // 3. Respaldo: valores del validador del período (precargados)
    if (options.length === 0 && preloadedValidatorOptions[field.name]?.length) {
      options = preloadedValidatorOptions[field.name];
    }

    if (options.length === 0) return;

    const { col: templateCol, headerRow } = getConfiguredFieldPosition(field, fieldIndex);
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
    const dvModel = (worksheet as any).dataValidations?.model;
    if (dvModel && typeof dvModel === "object" && !Array.isArray(dvModel)) {
      Object.keys(dvModel).forEach((key) => {
        const col = key.replace(/[0-9]/g, "");
        if (col === toColumnLetter(templateCol)) delete dvModel[key];
      });
    }

    const normalizedComment = field.comment
      ? String(field.comment).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
      : "";
    const promptText = normalizedComment.length > 220
      ? `${normalizedComment.slice(0, 217)}...`
      : normalizedComment;

    const validation: ExcelJS.DataValidation = {
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
    (worksheet as any).dataValidations.add(rangeAddress, validation);
  });
};

export const applyWorkbookSheetDropdowns = ({
  workbook,
  workbookSheets,
  validators,
  originalCommentsBySheet,
  endRow = 1000,
  preloadedValidatorOptions = {},
}: {
  workbook: ExcelJS.Workbook;
  workbookSheets: WorkbookSheetWithFields[];
  validators: ValidatorOptionSource[];
  originalCommentsBySheet?: Map<string, Map<string, string>>;
  endRow?: number;
  preloadedValidatorOptions?: Record<string, string[]>;
}): void => {
  // Remove the existing _Listas sheet so it is rebuilt from scratch with code-only values.
  // Without this, the original workbook's full-text options would remain in the sheet and
  // sourceCol would start after them, leaving old cell references pointing to stale data.
  const existingListasSheet = workbook.getWorksheet("_Listas");
  if (existingListasSheet) {
    workbook.removeWorksheet(existingListasSheet.id);
  }

  workbookSheets.forEach((sheet) => {
    if (!Array.isArray(sheet.fields) || sheet.fields.length === 0) return;

    const worksheet = workbook.getWorksheet(sheet.name);
    if (!worksheet) return;

    // Clear all existing data validations from the worksheet before rebuilding.
    // The original workbook's validations reference the old _Listas layout, which is
    // now stale after removing and rebuilding the _Listas sheet.
    (worksheet as any).dataValidations.model = {};

    const originalComments = originalCommentsBySheet?.get(sheet.name);
    const fields = originalComments
      ? sheet.fields.map((field, fieldIndex) => {
          const { col, headerRow } = getConfiguredFieldPosition(field, fieldIndex);
          // Los comentarios pueden estar en la celda de encabezado (fila 1) o
          // en la primera fila de datos (fila 2+), dependiendo de cómo se generó el workbook
          const firstDataRow = Math.max(2, headerRow + 1);
          const originalComment =
            originalComments.get(getExcelCellAddress(headerRow, col)) ||
            originalComments.get(getExcelCellAddress(firstDataRow, col));
          // Always prefer the fresh JSZip-extracted comment; fall back to stored comment
          const resolvedComment = originalComment ?? field.comment;
          return resolvedComment !== field.comment ? { ...field, comment: resolvedComment } : field;
        })
      : sheet.fields;

    applyValidatorDropdowns({
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

export const fetchValidatorOptionsForFields = async (
  fields: FieldWithValidator[],
  periodId: string,
  apiUrl: string
): Promise<Record<string, string[]>> => {
  const result: Record<string, string[]> = {};
  await Promise.all(
    fields.map(async (field) => {
      if (!field.validate_with) return;
      // Solo para campos sin opciones en comentario
      if (field.comment && extractOptionsFromCommentValidators(field.comment).length > 0) return;
      try {
        let validatorId = '';
        if (typeof field.validate_with === 'string') {
          const parts = field.validate_with.split(' - ');
          validatorId = parts.length >= 2 ? parts[parts.length - 1].trim() : field.validate_with.trim();
        } else {
          validatorId = (field.validate_with as any).id ?? '';
        }
        if (!validatorId) return;
        const res = await fetch(
          `${apiUrl}/validators/id?id=${encodeURIComponent(validatorId)}&periodId=${encodeURIComponent(periodId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const validator = data.validator;
        if (!validator?.columns?.length) return;
        const idCol = validator.columns.find((c: any) => c.is_validator) ?? validator.columns[0];
        if (!idCol?.values?.length) return;
        const descCol = validator.columns.find(
          (c: any) => !c.is_validator && /desc/i.test(c.name)
        ) ?? validator.columns.find((c: any) => !c.is_validator);
        result[field.name] = idCol.values.map((v: any, i: number) => {
          const id = String(v ?? '').trim();
          const desc = descCol ? String(descCol.values[i] ?? '').trim() : '';
          return desc ? `${id} - ${desc}` : id;
        }).filter(Boolean);
      } catch { /* ignorar errores individuales */ }
    })
  );
  return result;
};

const normalizeMultilineText = (text: string): string =>
  text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

const wrapTextByLength = (text: string, maxLen = 52): string => {
  const input = normalizeMultilineText(text);
  if (!input) return "";

  const wrappedLines: string[] = [];
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
      } else {
        line = candidate;
      }
    });
    if (line) wrappedLines.push(line);
  });

  return wrappedLines.join("\n");
};

export const applyFieldCommentNote = (
  cell: ExcelJS.Cell,
  rawComment?: string,
  options: { preserveText?: boolean } = {}
): void => {
  if (!rawComment) return;
  const cleanComment = normalizeMultilineText(rawComment).replace(/^"+|"+$/g, "");
  if (!cleanComment) return;
  cell.note = options.preserveText ? cleanComment : wrapTextByLength(cleanComment, 68);
};

const NOTE_WIDTH_PT = 360;
const NOTE_LINE_HEIGHT_PT = 14;
const NOTE_VERTICAL_PAD_PT = 20;
const NOTE_MIN_HEIGHT_PT = 60;
const NOTE_CHARS_PER_LINE = Math.floor((NOTE_WIDTH_PT - 20) / 5);

const computeNoteHeight = (text: string): number => {
  let lines = 0;
  for (const line of text.split("\n")) {
    lines += Math.max(1, Math.ceil((line.length || 1) / NOTE_CHARS_PER_LINE));
  }
  return Math.max(NOTE_MIN_HEIGHT_PT, lines * NOTE_LINE_HEIGHT_PT + NOTE_VERTICAL_PAD_PT);
};

export const patchNoteSize = async (buffer: ArrayBuffer): Promise<ArrayBuffer> => {
  const zip = await JSZip.loadAsync(buffer);

  // Step 1: Map vmlPath → commentsPath using each sheet's .rels file.
  // The relationship between VML drawing and comments is declared in
  // xl/worksheets/_rels/sheetN.xml.rels, NOT in a VML-level .rels file.
  const vmlToComments = new Map<string, string>();

  for (const relsPath of Object.keys(zip.files)) {
    if (!/xl\/worksheets\/_rels\/.+\.xml\.rels$/.test(relsPath)) continue;

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

    if (vmlPath && commentsPath) vmlToComments.set(vmlPath, commentsPath);
  }

  // Step 2: Parse each unique comments file to get (cellRef → full text)
  const textByFile = new Map<string, Map<string, string>>();

  for (const commentsPath of new Set(vmlToComments.values())) {
    const file = zip.file(commentsPath);
    if (!file) continue;
    const xml = await file.async("text");
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const refMap = new Map<string, string>();
    for (const node of Array.from(doc.getElementsByTagName("comment"))) {
      const ref = node.getAttribute("ref") || "";
      const text = Array.from(node.getElementsByTagName("t"))
        .map((t) => t.textContent || "")
        .join("")
        .trim();
      if (ref && text) refMap.set(ref, text);
    }
    textByFile.set(commentsPath, refMap);
  }

  // Step 3: Patch VML note shapes with computed dimensions
  const vmlPaths = Object.keys(zip.files).filter((p) => p.endsWith(".vml"));

  await Promise.all(
    vmlPaths.map(async (vmlPath) => {
      const refMap = textByFile.get(vmlToComments.get(vmlPath) ?? "");
      const vmlText = await zip.files[vmlPath].async("text");

      // Matches both single- and double-quoted style attributes containing visibility:hidden
      const patched = vmlText.replace(
        /<v:shape\b([^>]*?)style=(["'])([^"']*?visibility:hidden[^"']*)\2([^>]*>[\s\S]*?<\/v:shape>)/g,
        (_match, beforeStyle, quote, styleContent, afterTag) => {
          const rowMatch = /<x:Row>(\d+)<\/x:Row>/.exec(afterTag);
          const colMatch = /<x:Column>(\d+)<\/x:Column>/.exec(afterTag);
          if (!rowMatch || !colMatch) return _match;

          const row = parseInt(rowMatch[1], 10) + 1;
          const col = parseInt(colMatch[1], 10) + 1;
          const cellRef = `${toColumnLetter(col)}${row}`;
          const noteText = refMap?.get(cellRef) || "";
          const height = computeNoteHeight(noteText);

          const newStyle = styleContent
            .replace(/width:\d+(?:\.\d+)?pt/, `width:${NOTE_WIDTH_PT}pt`)
            .replace(/height:\d+(?:\.\d+)?pt/, `height:${height}pt`);

          return `<v:shape${beforeStyle}style=${quote}${newStyle}${quote}${afterTag}`;
        }
      );

      zip.file(vmlPath, patched);
    })
  );

  return zip.generateAsync({ type: "arraybuffer" });
};

export const patchNoteBackgroundColor = async (
  buffer: ArrayBuffer,
  hexColor = "#ffffff"
): Promise<ArrayBuffer> => {
  const zip = await JSZip.loadAsync(buffer);
  const vmlPaths = Object.keys(zip.files).filter((p) => p.endsWith(".vml"));

  await Promise.all(
    vmlPaths.map(async (path) => {
      const text = await zip.files[path].async("text");
      const patched = text
        .replace(/fillcolor="[^"]+"/g, `fillcolor="${hexColor}"`)
        .replace(/(<v:fill[^>]*?)color2="[^"]+"/g, `$1color2="${hexColor}"`);
      zip.file(path, patched);
    })
  );

  return zip.generateAsync({ type: "arraybuffer" });
};

