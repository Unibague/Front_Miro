export const normalizeValidatorText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const toOptionText = (value: any) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if (value.$numberInt !== undefined) return String(value.$numberInt).trim();
    if (value.value !== undefined) return String(value.value).trim();
    if (value.id !== undefined) return String(value.id).trim();
    if (value.label !== undefined) return String(value.label).trim();
    if (value.name !== undefined) return String(value.name).trim();
  }
  return String(value).trim();
};

const isDescriptionColumn = (columnName: string) => {
  const normalized = normalizeValidatorText(columnName);
  return normalized.includes("DESCRIPCION") || normalized.includes("NOMBRE") || normalized.startsWith("DESC");
};

export const getPreferredValidatorColumnName = (validateWith = "") =>
  validateWith.split(" - ").slice(1).join(" - ").trim();

export const buildValidatorOptions = (validator: any, preferredColumnName = ""): string[] => {
  const columns = Array.isArray(validator?.columns) ? validator.columns : [];
  const preferredColumn = preferredColumnName
    ? columns.find((column: any) => normalizeValidatorText(column?.name) === normalizeValidatorText(preferredColumnName))
    : null;
  const valueColumn = preferredColumn || columns.find((column: any) => column?.is_validator) || columns[0];
  if (!valueColumn) return [];

  // If the selected value column is a description-type column (e.g. DESCRIPCION),
  // look for a companion ID/code column to use as a prefix.
  const valueColumnIsDesc = isDescriptionColumn(valueColumn.name || "");
  const idColumn = valueColumnIsDesc
    ? columns.find((column: any) => column?.name !== valueColumn.name && !isDescriptionColumn(column?.name || ""))
    : null;

  const descriptionColumn = !valueColumnIsDesc
    ? columns.find((column: any) => column?.name !== valueColumn.name && isDescriptionColumn(column?.name || ""))
    : null;

  // When the value column is a description, iterate over it using the id column as prefix.
  // Otherwise iterate over the id/code column and append the description.
  const primaryColumn = idColumn ?? valueColumn;
  const secondaryColumn = idColumn ? valueColumn : descriptionColumn;

  const seen = new Set<string>();
  const values = Array.isArray(primaryColumn.values) ? primaryColumn.values : [];

  return values.flatMap((value: any, index: number) => {
    const primaryText = toOptionText(value);
    if (!primaryText) return [];

    const secondaryText = toOptionText(secondaryColumn?.values?.[index]);
    const optionText = secondaryText && normalizeValidatorText(secondaryText) !== normalizeValidatorText(primaryText)
      ? `${primaryText} - ${secondaryText}`
      : primaryText;
    const key = normalizeValidatorText(optionText);
    if (seen.has(key)) return [];

    seen.add(key);
    return [optionText];
  });
};

const stripOptionPrefix = (value: string) =>
  value.replace(/^\s*(?:[-*\u2022]|\d+[\).])\s*/, "").replace(/\s+/g, " ").trim();

const uniqueOptionTexts = (values: string[]) => {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const option = stripOptionPrefix(value);
    const key = normalizeValidatorText(option);
    if (!option || seen.has(key)) return [];

    seen.add(key);
    return [option];
  });
};

const splitInlineOptionList = (value: string) =>
  uniqueOptionTexts(value.split(/\r?\n|[;,]/));

export const extractDropdownOptionsFromComment = (comment?: unknown): string[] => {
  const text = String(comment ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const options: string[] = [];
  let inOptionsSection = false;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inOptionsSection && options.length > 0) break;
      continue;
    }

    const colonIndex = trimmed.indexOf(":");
    const markerText = colonIndex >= 0 ? trimmed.slice(0, colonIndex + 1) : trimmed;
    const normalizedMarker = normalizeValidatorText(markerText);
    const hasValueWord =
      normalizedMarker.includes("VALORES") ||
      normalizedMarker.includes("VALOSRES") ||
      normalizedMarker.includes("VALOSR");
    const isOptionsMarker =
      colonIndex >= 0 &&
      hasValueWord &&
      (
        normalizedMarker.includes("VALIDOS") ||
        normalizedMarker.includes("POSIBLES") ||
        normalizedMarker.includes("PERMITIDOS")
      );

    if (!inOptionsSection && isOptionsMarker) {
      inOptionsSection = true;
      options.push(...splitInlineOptionList(trimmed.slice(colonIndex + 1)));
      continue;
    }

    if (inOptionsSection) {
      options.push(trimmed);
    }
  }

  return uniqueOptionTexts(options);
};

export const buildFieldDropdownOptions = (field: {
  dropdown_options?: unknown[];
  excel_validation_options?: unknown[];
  comment?: unknown;
}): string[] => uniqueOptionTexts([
  ...(Array.isArray(field.dropdown_options) ? field.dropdown_options.map(toOptionText) : []),
  ...(Array.isArray(field.excel_validation_options) ? field.excel_validation_options.map(toOptionText) : []),
  ...extractDropdownOptionsFromComment(field.comment),
]);

export const buildSelectOptionsFromStrings = (values: string[]) =>
  uniqueOptionTexts(values).map((value) => ({ value, label: value }));
