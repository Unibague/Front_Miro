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

  const descriptionColumn = columns.find((column: any) => (
    column?.name !== valueColumn.name && isDescriptionColumn(column?.name || "")
  ));

  const seen = new Set<string>();
  const values = Array.isArray(valueColumn.values) ? valueColumn.values : [];

  return values.flatMap((value: any, index: number) => {
    const idText = toOptionText(value);
    if (!idText) return [];

    const descriptionText = toOptionText(descriptionColumn?.values?.[index]);
    const optionText = descriptionText && normalizeValidatorText(descriptionText) !== normalizeValidatorText(idText)
      ? `${idText} - ${descriptionText}`
      : idText;
    const key = normalizeValidatorText(optionText);
    if (seen.has(key)) return [];

    seen.add(key);
    return [optionText];
  });
};
