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
  const comment = field.comment
    ? String(field.comment).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
    : "";
  if (comment) return comment;

  const dropdownOptions = Array.isArray(field.dropdown_options)
    ? field.dropdown_options.map((option) => String(option || "").trim()).filter(Boolean)
    : [];

  return dropdownOptions.length > 0
    ? `Opciones:\n${dropdownOptions.join("\n")}`
    : "";
};

const applyHeaderCommentNote = (
  worksheet: ExcelJS.Worksheet,
  field: FieldWithValidator,
  fieldIndex: number,
  fallbackOptions: string[] = []
) => {
  const baseComment = getFieldCommentForNote(field);
  const normalizedBase = baseComment
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const missingOptions = fallbackOptions.filter((option) => {
    const normalizedOption = String(option || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return normalizedOption && !normalizedBase.includes(normalizedOption);
  });
  const optionsComment = missingOptions.length > 0
    ? `Opciones:\n${missingOptions.join("\n")}`
    : "";
  const comment = [baseComment, optionsComment].filter(Boolean).join("\n\n");
  if (!comment) return;

  const { col, headerRow } = getConfiguredFieldPosition(field, fieldIndex);
  applyFieldCommentNote(worksheet.getCell(headerRow, col), comment);
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
}: {
  workbook: ExcelJS.Workbook;
  worksheet: ExcelJS.Worksheet;
  fields: FieldWithValidator[];
  validators: ValidatorOptionSource[];
  startRow?: number;
  endRow?: number;
}): void => {
  const sourcesSheetName = "_Listas";
  const existingSourcesSheet = workbook.getWorksheet(sourcesSheetName);
  const sourcesSheet = existingSourcesSheet ?? workbook.addWorksheet(sourcesSheetName);
  sourcesSheet.state = "veryHidden";

  let sourceCol = Math.max(1, sourcesSheet.columnCount + 1);

  fields.forEach((field, fieldIndex) => {
    let options: { value: string; displayLabel: string }[] = [];
    let optionsFromValidator = false;

    if (field.validate_with) {
      const { validatorName, columnName } = splitValidateWithReference(field.validate_with);
      if (!validatorName) {
        options = [];
      } else {
        const validator = findValidatorByName(validators, validatorName);
        options = validator ? getValidatorOptions(validator, columnName) : [];
        optionsFromValidator = options.length > 0;
      }
    } else {
      const validator = findValidatorByName(validators, field.name);
      if (validator) {
        options = getValidatorOptions(validator);
        optionsFromValidator = options.length > 0;
      }
    }

    if (options.length === 0 && !field.validate_with && field.comment) {
      const commentOptions = extractOptionsFromCommentValidators(field.comment);
      if (commentOptions.length === 0) {
        applyHeaderCommentNote(worksheet, field, fieldIndex, []);
        return;
      }
      options = commentOptions.map((opt) => ({ value: opt, displayLabel: opt }));
    }

    if (options.length === 0 && !field.validate_with && Array.isArray(field.dropdown_options) && field.dropdown_options.length > 0) {
      const seenStaticOptions = new Set<string>();
      options = field.dropdown_options
        .map((option) => String(option || "").trim())
        .filter((option) => {
          if (!option || seenStaticOptions.has(option)) return false;
          seenStaticOptions.add(option);
          return true;
        })
        .map((option) => ({ value: option, displayLabel: option }));
    }

    if (options.length === 0) {
      applyHeaderCommentNote(worksheet, field, fieldIndex, []);
      return;
    }

    if (!field.validate_with && !optionsFromValidator) {
      if (Array.isArray(field.dropdown_options) && field.dropdown_options.length > 0) {
        options = appendOptionTexts(options, field.dropdown_options);
      }

      if (field.comment) {
        options = appendOptionTexts(options, extractOptionsFromCommentValidators(field.comment));
      }
    }

    applyHeaderCommentNote(
      worksheet,
      field,
      fieldIndex,
      options.map((option) => option.displayLabel)
    );

    if (options.length === 0) return;

    // Guardar código + descripción (displayLabel) para que el dropdown muestre "CC - Cédula de ciudadanía"
    options.forEach((option, optionIndex) => {
      sourcesSheet.getCell(optionIndex + 1, sourceCol).value = option.displayLabel;
    });

    const colLetter = toColumnLetter(sourceCol);
    const rangeRef = `'${sourcesSheetName}'!$${colLetter}$1:$${colLetter}$${options.length}`;
    const { col: templateCol, headerRow } = getConfiguredFieldPosition(field, fieldIndex);
    const firstDataRow = Math.max(startRow, headerRow + 1);
    const normalizedComment = field.comment
      ? String(field.comment)
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .trim()
      : "";

    const promptText =
      normalizedComment.length > 220
        ? `${normalizedComment.slice(0, 217)}...`
        : normalizedComment;

    for (let row = firstDataRow; row <= endRow; row++) {
      const cell = worksheet.getCell(row, templateCol);
      const validation: ExcelJS.DataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [rangeRef],
        // Para campos múltiples no se bloquea la entrada libre, solo se muestra la lista como referencia
        showErrorMessage: !field.multiple,
        errorTitle: "Valor no valido",
        error: "Selecciona un valor de la lista desplegable.",
      };
      if (promptText) {
        validation.showInputMessage = true;
        validation.promptTitle = field.name.slice(0, 32);
        validation.prompt = promptText;
      }
      cell.dataValidation = validation;
    }

    sourceCol += 1;
  });
};

export const applyWorkbookSheetDropdowns = ({
  workbook,
  workbookSheets,
  validators,
  originalCommentsBySheet,
  endRow = 1000,
}: {
  workbook: ExcelJS.Workbook;
  workbookSheets: WorkbookSheetWithFields[];
  validators: ValidatorOptionSource[];
  originalCommentsBySheet?: Map<string, Map<string, string>>;
  endRow?: number;
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

    const originalComments = originalCommentsBySheet?.get(sheet.name);
    const fields = originalComments
      ? sheet.fields.map((field, fieldIndex) => {
          const { col, headerRow } = getConfiguredFieldPosition(field, fieldIndex);
          const originalComment = originalComments.get(getExcelCellAddress(headerRow, col));
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
    });
  });
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
  rawComment?: string
): void => {
  if (!rawComment) return;
  const cleanComment = normalizeMultilineText(rawComment).replace(/^"+|"+$/g, "");
  if (!cleanComment) return;
  cell.note = wrapTextByLength(cleanComment, 52);
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

