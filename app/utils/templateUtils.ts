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

const findValidatorForField = (
  field: FieldWithValidator,
  validators: ValidatorOptionSource[]
): { validator: ValidatorOptionSource; columnName?: string } | null => {
  const { validatorName, columnName } = splitValidateWithReference(field.validate_with);

  if (validatorName) {
    const validator = findValidatorByName(validators, validatorName);
    if (validator) return { validator, columnName: columnName || field.name };
  }

  const fieldNorm = normalizeToken(field.name);
  for (const validator of validators) {
    const columnMatch =
      (validator.columns?.some((column) => normalizeToken(column.name) === fieldNorm)) ||
      (validator.values.length > 0 &&
        Object.keys(validator.values[0]).some((key) => normalizeToken(key) === fieldNorm));

    if (columnMatch) return { validator, columnName: field.name };
  }

  return null;
};

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

const getWorksheetPathMap = async (zip: JSZip): Promise<Map<string, string>> => {
  const worksheetPathByName = new Map<string, string>();
  const workbookPath = "xl/workbook.xml";
  const workbookXml = await zip.file(workbookPath)?.async("text");
  const workbookRelsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbookXml || !workbookRelsXml) return worksheetPathByName;

  const workbookRels = getRelTargets(workbookRelsXml);
  const workbookDoc = parseXml(workbookXml);
  const sheets = Array.from(workbookDoc.getElementsByTagName("sheet"));

  sheets.forEach((sheetNode) => {
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
    if (!sheetName || !sheetRel?.target) return;
    worksheetPathByName.set(sheetName, resolveZipPath(workbookPath, sheetRel.target));
  });

  return worksheetPathByName;
};

const getWorksheetRelsPath = (worksheetPath: string): string => {
  const parts = worksheetPath.split("/");
  const worksheetFileName = parts.pop() || "";
  return `${parts.join("/")}/_rels/${worksheetFileName}.rels`;
};

const createRelationshipsDoc = (): Document =>
  parseXml(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
  );

const getNextRelId = (relsDoc: Document): string => {
  const used = new Set(
    Array.from(relsDoc.getElementsByTagName("Relationship"))
      .map((node) => node.getAttribute("Id") || "")
      .filter(Boolean)
  );
  let index = 1;
  while (used.has(`rIdMiroComments${index}`)) index += 1;
  return `rIdMiroComments${index}`;
};

const getSheetCommentsFromRelationships = async (
  zip: JSZip,
  worksheetPath: string
): Promise<Map<string, string>> => {
  const comments = new Map<string, string>();
  const relsXml = await zip.file(getWorksheetRelsPath(worksheetPath))?.async("text");
  if (!relsXml) return comments;

  const sheetRels = getRelTargets(relsXml);
  for (const rel of sheetRels.values()) {
    const normalizedType = rel.type.toLowerCase();
    if (!normalizedType.includes("/comments") || normalizedType.includes("/threadedcomments")) {
      continue;
    }

    const commentsPath = resolveZipPath(worksheetPath, rel.target);
    const commentsXml = await zip.file(commentsPath)?.async("text");
    if (!commentsXml) continue;

    const commentsDoc = parseXml(commentsXml);
    Array.from(commentsDoc.getElementsByTagName("comment")).forEach((commentNode) => {
      const ref = commentNode.getAttribute("ref") || "";
      const text = getCommentNodeText(commentNode);
      if (ref && text) comments.set(ref.replace(/\$/g, ""), text);
    });
  }

  return comments;
};

const columnLettersToNumber = (letters: string): number => {
  return letters.toUpperCase().split("").reduce((total, char) => {
    const value = char.charCodeAt(0) - 64;
    return value >= 1 && value <= 26 ? total * 26 + value : total;
  }, 0);
};

const parseCellAddress = (ref: string): { rowNumber: number; columnNumber: number } | null => {
  const match = /^([A-Z]+)(\d+)$/i.exec(ref.replace(/\$/g, ""));
  if (!match) return null;
  return {
    columnNumber: columnLettersToNumber(match[1]),
    rowNumber: Number(match[2]),
  };
};

const escapeXmlText = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const buildCommentsXml = (comments: Array<{ ref: string; text: string }>): string => {
  const commentElements = comments
    .map(
      (c) =>
        `<comment ref="${c.ref}" authorId="0"><text><r><t xml:space="preserve">${escapeXmlText(c.text)}</t></r></text></comment>`
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<authors><author></author></authors>` +
    `<commentList>${commentElements}</commentList>` +
    `</comments>`
  );
};

const buildVmlShapeNodes = (
  comments: Array<{ rowNumber: number; columnNumber: number }>,
  startShapeId = 1025
): string =>
  comments
    .map((comment, index) => {
      const startColumn = Math.max(comment.columnNumber - 1, 0);
      const startRow = Math.max(comment.rowNumber - 1, 0);
      const endColumn = startColumn + 5;
      const endRow = startRow + 20;

      return (
        `<v:shape id="_x0000_s${startShapeId + index}" type="#_x0000_t202"` +
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
        `</x:ClientData></v:shape>`
      );
    })
    .join("");

const buildVmlCommentsXml = (
  comments: Array<{ rowNumber: number; columnNumber: number }>
): string => {
  const shapeNodes = buildVmlShapeNodes(comments);

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<xml xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>` +
    `<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe">` +
    `<v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/>` +
    `</v:shapetype>` +
    shapeNodes +
    `</xml>`
  );
};

const getVmlCellRefs = (vmlText: string): Set<string> => {
  const refs = new Set<string>();
  for (const match of vmlText.matchAll(/<x:Row>(\d+)<\/x:Row>[\s\S]*?<x:Column>(\d+)<\/x:Column>/g)) {
    const row = parseInt(match[1], 10) + 1;
    const col = parseInt(match[2], 10) + 1;
    refs.add(getExcelCellAddress(row, col));
  }
  return refs;
};

const appendMissingVmlShapes = (
  vmlText: string,
  comments: Array<{ ref: string; rowNumber: number; columnNumber: number }>
): string => {
  const existingRefs = getVmlCellRefs(vmlText);
  const missing = comments.filter((comment) => !existingRefs.has(comment.ref));
  if (missing.length === 0) return vmlText;

  const idMatches = [...vmlText.matchAll(/id="_x0000_s(\d+)"/g)];
  const maxId = idMatches.length > 0
    ? Math.max(...idMatches.map((match) => parseInt(match[1], 10)))
    : 1024;
  const newShapes = buildVmlShapeNodes(missing, maxId + 1);

  return vmlText.includes("</xml>")
    ? vmlText.replace("</xml>", `${newShapes}</xml>`)
    : `${vmlText}${newShapes}`;
};

const ensureWorksheetLegacyDrawing = async (
  zip: JSZip,
  worksheetPath: string,
  vmlRelId: string
) => {
  const worksheetXml = await zip.file(worksheetPath)?.async("text");
  if (!worksheetXml) return;

  const legacyDrawing = `<legacyDrawing r:id="${vmlRelId}"/>`;
  const withoutLegacyDrawing = worksheetXml
    .replace(/<legacyDrawing\b[\s\S]*?(?:\/>|>[\s\S]*?<\/legacyDrawing>)/g, "");

  zip.file(worksheetPath, withoutLegacyDrawing.replace("</worksheet>", `${legacyDrawing}</worksheet>`));
};

const ensureContentTypeEntry = (
  typesDoc: Document,
  selector: () => boolean,
  createEntry: (doc: Document) => Element
) => {
  if (selector()) return;
  typesDoc.getElementsByTagName("Types")[0]?.appendChild(createEntry(typesDoc));
};

const upsertWorksheetComments = async (
  zip: JSZip,
  worksheetPath: string,
  comments: Array<{ ref: string; text: string; rowNumber: number; columnNumber: number }>,
  commentIndex: number
): Promise<string | null> => {
  const serializer = new XMLSerializer();
  const relsPath = getWorksheetRelsPath(worksheetPath);

  const relsXml = await zip.file(relsPath)?.async("text");
  const relsDoc = relsXml ? parseXml(relsXml) : createRelationshipsDoc();
  const relationshipsNode = relsDoc.getElementsByTagName("Relationships")[0];
  if (!relationshipsNode) return null;

  let commentsTarget = "";
  let vmlTarget = "";
  let vmlRelId = "";

  const relationshipNodes = Array.from(relsDoc.getElementsByTagName("Relationship"));
  relationshipNodes.forEach((relationship) => {
    const type = String(relationship.getAttribute("Type") || "");
    const normalizedType = type.toLowerCase();
    if (normalizedType.includes("/comments") && !normalizedType.includes("/threadedcomments")) {
      commentsTarget ||= String(relationship.getAttribute("Target") || "");
      return;
    }
    if (normalizedType.includes("/vmldrawing")) {
      vmlTarget ||= String(relationship.getAttribute("Target") || "");
      vmlRelId ||= String(relationship.getAttribute("Id") || "");
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
    if (
      (normalizedType.includes("/comments") && !normalizedType.includes("/threadedcomments")) ||
      normalizedType.includes("/vmldrawing")
    ) {
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

export const injectWorkbookSheetHeaderComments = async (
  buffer: ArrayBuffer,
  workbookSheets: WorkbookSheetWithFields[]
): Promise<ArrayBuffer> => {
  if (!Array.isArray(workbookSheets) || workbookSheets.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  const worksheetPathByName = await getWorksheetPathMap(zip);
  const contentTypeComments: string[] = [];
  let commentIndex = 1;

  for (const sheet of workbookSheets) {
    if (!sheet?.name || !Array.isArray(sheet.fields) || sheet.fields.length === 0) continue;
    const worksheetPath = worksheetPathByName.get(sheet.name);
    if (!worksheetPath || !zip.file(worksheetPath)) continue;

    const commentsByRef = await getSheetCommentsFromRelationships(zip, worksheetPath);
    sheet.fields.forEach((field, fieldIndex) => {
      const comment = getFieldCommentForNote(field);
      if (!comment) return;
      const { col, headerRow } = getConfiguredFieldPosition(field, fieldIndex);
      commentsByRef.set(getExcelCellAddress(headerRow, col), comment);
    });

    const comments = Array.from(commentsByRef.entries())
      .map(([ref, text]) => {
        const parsed = parseCellAddress(ref);
        if (!parsed || !text) return null;
        return { ref, text, ...parsed };
      })
      .filter((item): item is { ref: string; text: string; rowNumber: number; columnNumber: number } => Boolean(item));

    if (comments.length === 0) continue;
    const commentsPath = await upsertWorksheetComments(zip, worksheetPath, comments, commentIndex);
    if (commentsPath) contentTypeComments.push(`/${commentsPath}`);
    commentIndex += 1;
  }

  const contentTypesXml = await zip.file("[Content_Types].xml")?.async("text");
  if (contentTypesXml && contentTypeComments.length > 0) {
    const serializer = new XMLSerializer();
    const typesDoc = parseXml(contentTypesXml);

    ensureContentTypeEntry(
      typesDoc,
      () => Array.from(typesDoc.getElementsByTagName("Default")).some(
        (node) =>
          node.getAttribute("Extension") === "vml" &&
          node.getAttribute("ContentType") === "application/vnd.openxmlformats-officedocument.vmlDrawing"
      ),
      (doc) => {
        const node = doc.createElement("Default");
        node.setAttribute("Extension", "vml");
        node.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.vmlDrawing");
        return node;
      }
    );

    contentTypeComments.forEach((partName) => {
      ensureContentTypeEntry(
        typesDoc,
        () => Array.from(typesDoc.getElementsByTagName("Override")).some(
          (node) =>
            node.getAttribute("PartName") === partName &&
            node.getAttribute("ContentType") === "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"
        ),
        (doc) => {
          const node = doc.createElement("Override");
          node.setAttribute("PartName", partName);
          node.setAttribute("ContentType", "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml");
          return node;
        }
      );
    });

    zip.file("[Content_Types].xml", serializer.serializeToString(typesDoc));
  }

  return zip.generateAsync({ type: "arraybuffer" });
};

/**
 * Appends VML comment shapes and comment entries for fields that don't yet have them
 * in the existing VML/comments files. Used for workbooks loaded from base64 where
 * ExcelJS preserves original VML but doesn't add shapes for newly set cell.note values.
 */
export const appendMissingFieldComments = async (
  buffer: ArrayBuffer,
  workbookSheets: WorkbookSheetWithFields[]
): Promise<ArrayBuffer> => {
  if (!Array.isArray(workbookSheets) || workbookSheets.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  const worksheetPathByName = await getWorksheetPathMap(zip);

  for (const sheet of workbookSheets) {
    if (!sheet?.name || !Array.isArray(sheet.fields) || sheet.fields.length === 0) continue;
    const worksheetPath = worksheetPathByName.get(sheet.name);
    if (!worksheetPath || !zip.file(worksheetPath)) continue;

    const relsXml = await zip.file(getWorksheetRelsPath(worksheetPath))?.async("text");
    if (!relsXml) continue;

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

    if (!commentsPath || !vmlPath) continue;

    const vmlText = await zip.file(vmlPath)?.async("text");
    if (!vmlText) continue;

    // Find which cells already have VML shapes so we don't duplicate
    const existingVmlRefs = new Set<string>();
    const vmlCellRegex = /<x:Row>(\d+)<\/x:Row>[\s\S]*?<x:Column>(\d+)<\/x:Column>/g;
    let vmlCellMatch: RegExpExecArray | null;
    while ((vmlCellMatch = vmlCellRegex.exec(vmlText)) !== null) {
      const row = parseInt(vmlCellMatch[1], 10) + 1;
      const col = parseInt(vmlCellMatch[2], 10) + 1;
      existingVmlRefs.add(getExcelCellAddress(row, col));
    }

    // Collect fields that are missing VML shapes
    const fieldsToAdd: Array<{ ref: string; text: string; rowNumber: number; columnNumber: number }> = [];
    sheet.fields.forEach((field, fieldIndex) => {
      const comment = getFieldCommentForNote(field);
      if (!comment) return;
      const { col, headerRow } = getConfiguredFieldPosition(field, fieldIndex);
      const ref = getExcelCellAddress(headerRow, col);
      if (!existingVmlRefs.has(ref)) {
        fieldsToAdd.push({ ref, text: comment, rowNumber: headerRow, columnNumber: col });
      }
    });

    if (fieldsToAdd.length === 0) continue;

    // Find cells already in comments XML so we don't duplicate entries
    const commentsXml = await zip.file(commentsPath)?.async("text");
    const existingCommentRefs = new Set<string>();
    if (commentsXml) {
      const refRegex = /\bref="([^"]+)"/g;
      let refMatch: RegExpExecArray | null;
      while ((refMatch = refRegex.exec(commentsXml)) !== null) {
        existingCommentRefs.add(refMatch[1].replace(/\$/g, ""));
      }
    }

    // Append comment entries for cells not already in comments XML
    const newCommentElements = fieldsToAdd
      .filter((f) => !existingCommentRefs.has(f.ref))
      .map(
        (c) =>
          `<comment ref="${c.ref}" authorId="0"><text><r><t xml:space="preserve">${escapeXmlText(c.text)}</t></r></text></comment>`
      )
      .join("");

    if (commentsXml && newCommentElements) {
      zip.file(commentsPath, commentsXml.replace("</commentList>", `${newCommentElements}</commentList>`));
    }

    // Find highest existing shape ID so new shapes don't conflict
    const shapeIdRegex = /id="_x0000_s(\d+)"/g;
    const shapeIds: number[] = [];
    let shapeIdMatch: RegExpExecArray | null;
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
        return (
          `<v:shape id="_x0000_s${maxId + 1 + idx}" type="#_x0000_t202"` +
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
          `</x:ClientData></v:shape>`
        );
      })
      .join("");

    zip.file(vmlPath, vmlText.replace("</xml>", `${newShapes}</xml>`));
  }

  return zip.generateAsync({ type: "arraybuffer" });
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

const collapseRepeatedCompositeOption = (value: string): string => {
  const option = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!option) return "";

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

const normalizeDropdownOptionTexts = (options: string[]): string[] => {
  const seen = new Set<string>();

  return options.flatMap((option) => {
    const cleaned = collapseRepeatedCompositeOption(String(option || "").trim());
    if (!cleaned) return [];

    const key = normalizeOptionKey(cleaned);
    if (!key || seen.has(key)) return [];

    seen.add(key);
    return [cleaned];
  });
};

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

    const rawIdText = collapseRepeatedCompositeOption(toOptionText(idValue));
    if (!rawIdText) return;

    const descValue = descKey ? resolveValueByKey(row, descKey) : undefined;
    const descText = collapseRepeatedCompositeOption(toOptionText(descValue));
    if (descKey && !descText) return;

    // When there is no separate description column, detect "CODE description" in a single value
    // e.g. "CC Cédula de ciudadanía" → storedValue = "CC"
    // e.g. "1 Posdoctorado"         → storedValue = "1"
    let storedValue = rawIdText;
    if (!descKey) {
      const codeMatch = /^([A-Z0-9]{1,6})\s+.+$/.exec(rawIdText);
      if (codeMatch) storedValue = codeMatch[1];
    }

    const displayLabel = collapseRepeatedCompositeOption(
      descText ? `${rawIdText} - ${descText}` : rawIdText
    );
    const seenKey = normalizeOptionKey(displayLabel);

    if (seen.has(storedValue) || seen.has(seenKey)) return;
    seen.add(storedValue);
    seen.add(seenKey);
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
    const looksLikeInstruction =
      (normalized.includes("OBLIGAT") || normalized.includes("OPCIONAL")) &&
      (
        normalized.includes("NUMERIC") ||
        normalized.includes("TEXTO") ||
        normalized.includes("FECHA") ||
        normalized.includes("DECIMAL") ||
        normalized.includes("CARACTER")
      );
    if (
      normalized.endsWith(":") &&
      hasValueWord &&
      (normalized.includes("VALIDOS") || normalized.includes("POSIBLES") || normalized.includes("PERMITIDOS"))
    ) {
      inValidSection = true;
      continue;
    }

    if (inValidSection) {
      if (looksLikeInstruction) continue;
      options.push(trimmed.replace(/\s+/g, " "));
    }
  }

  return normalizeDropdownOptionTexts(options);
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
    const displayLabel = collapseRepeatedCompositeOption(String(optionText || "").trim());
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

    // 5. Auto-detección: buscar en validadores cuya columna coincida con el nombre del campo
    if (options.length === 0 && validators.length > 0) {
      const fieldNorm = normalizeToken(field.name);
      for (const validator of validators) {
        const columnMatch =
          (validator.columns?.some((c) => normalizeToken(c.name) === fieldNorm)) ||
          (validator.values.length > 0 &&
            Object.keys(validator.values[0]).some((k) => normalizeToken(k) === fieldNorm));
        if (!columnMatch) continue;
        const matched = getValidatorOptions(validator, field.name);
        if (matched.length > 0) {
          options = matched.map((o) => o.displayLabel);
          break;
        }
      }
    }

    options = normalizeDropdownOptionTexts(options);
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
          const id = collapseRepeatedCompositeOption(String(v ?? '').trim());
          const desc = descCol ? collapseRepeatedCompositeOption(String(descCol.values[i] ?? '').trim()) : '';
          return collapseRepeatedCompositeOption(desc ? `${id} - ${desc}` : id);
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

