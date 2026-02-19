import ExcelJS from "exceljs";

export const sanitizeSheetName = (name: string): string => {
  return name.replace(/[/\\?*[\]]/g, '').substring(0, 31);
};

export const shouldAddWorksheet = (workbook: ExcelJS.Workbook, sheetName: string): boolean => {
  return !workbook.getWorksheet(sheetName);
};

interface FieldWithValidator {
  name: string;
  validate_with?: string;
  multiple?: boolean;
  comment?: string;
}

interface ValidatorOptionSource {
  name: string;
  values: Record<string, unknown>[];
}

interface FieldWithComment {
  name: string;
  comment?: string;
}

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
): string[] => {
  const options: string[] = [];
  const seen = new Set<string>();

  validator.values.forEach((row) => {
    const keys = Object.keys(row || {});
    if (keys.length === 0) return;

    const preferredKey = preferredColumnName
      ? keys.find((key) => normalizeToken(key) === normalizeToken(preferredColumnName))
      : undefined;

    const idKey = preferredKey || keys[0];
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

    const idText = toOptionText(idValue);
    if (!idText) return;

    const descValue = descKey ? resolveValueByKey(row, descKey) : undefined;
    const descText = toOptionText(descValue);
    const text = descText ? `${idText} - ${descText}` : idText;

    if (!text || seen.has(text)) return;
    seen.add(text);
    options.push(text);
  });

  return options;
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
    if (!field.validate_with || field.multiple) return;

    const validateWithParts = field.validate_with.split(" - ");
    const validatorName = validateWithParts[0]?.trim();
    const validatorColumnName = validateWithParts.slice(1).join(" - ").trim();
    if (!validatorName) return;

    const validator = validators.find((item) => normalizeToken(item.name) === normalizeToken(validatorName));
    if (!validator) return;

    const options = getValidatorOptions(validator, validatorColumnName);
    if (options.length === 0) return;

    options.forEach((option, optionIndex) => {
      sourcesSheet.getCell(optionIndex + 1, sourceCol).value = option;
    });

    const colLetter = toColumnLetter(sourceCol);
    const rangeRef = `'${sourcesSheetName}'!$${colLetter}$1:$${colLetter}$${options.length}`;
    const templateCol = fieldIndex + 1;
    const normalizedComment = field.comment
      ? String(field.comment)
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .trim()
      : "";
    const promptBase = normalizedComment.slice(0, 220);
    const promptText =
      normalizedComment.length > 220
        ? `${promptBase}... (ver hoja Guia)`
        : promptBase;

    for (let row = startRow; row <= endRow; row++) {
      const cell = worksheet.getCell(row, templateCol);
      const validation: ExcelJS.DataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [rangeRef],
        showErrorMessage: true,
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

const estimateRowHeight = (text: string, min = 22): number => {
  const lineCount = Math.max(1, normalizeMultilineText(text).split("\n").length);
  return Math.max(min, lineCount * 16);
};

export const applyFieldCommentNote = (
  cell: ExcelJS.Cell,
  rawComment?: string
): void => {
  if (!rawComment) return;
  const cleanComment = normalizeMultilineText(rawComment).replace(/^"+|"+$/g, "");
  if (!cleanComment) return;
  // Excel note popups are visually constrained by the app, so keep note short.
  // Full instruction is delivered through data-validation input message + "Guía" sheet.
  if (cleanComment.length <= 120) {
    cell.note = wrapTextByLength(cleanComment, 44);
  } else {
    cell.note = "Instruccion: selecciona una celda de esta columna para ver el detalle completo.";
  }
};

export const buildStyledHelpWorksheet = (
  workbook: ExcelJS.Workbook,
  fields: FieldWithComment[]
): ExcelJS.Worksheet => {
  const helpWorksheet = workbook.addWorksheet("Guía");
  helpWorksheet.columns = [{ width: 38 }, { width: 120 }];
  helpWorksheet.views = [{ state: "frozen", ySplit: 1 }];

  const helpHeaderRow = helpWorksheet.addRow(["Campo", "Comentario del campo"]);
  helpHeaderRow.height = 24;
  helpHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F1F39" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });

  fields.forEach((field, index) => {
    const wrappedComment = field.comment ? wrapTextByLength(field.comment, 90) : "";
    const helpRow = helpWorksheet.addRow([field.name, wrappedComment]);
    helpRow.height = estimateRowHeight(wrappedComment, 22);

    helpRow.getCell(1).alignment = { vertical: "top", horizontal: "left", wrapText: true };
    helpRow.getCell(2).alignment = { vertical: "top", horizontal: "left", wrapText: true };
    helpRow.getCell(1).font = { bold: true, color: { argb: "FF0F1F39" } };
    helpRow.getCell(2).font = { color: { argb: "FF111827" } };

    const rowFill = index % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
    helpRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: rowFill },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  return helpWorksheet;
};
