import { NextRequest, NextResponse } from "next/server";

const normalizeText = (value: unknown) =>
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
  const normalized = normalizeText(columnName);
  return normalized.includes("DESCRIPCION") || normalized.includes("NOMBRE") || normalized.startsWith("DESC");
};

const buildOptions = (validator: any, preferredColumnName = ""): string[] => {
  const columns = Array.isArray(validator?.columns) ? validator.columns : [];
  const preferredColumn = preferredColumnName
    ? columns.find((column: any) => normalizeText(column?.name) === normalizeText(preferredColumnName))
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
    const optionText = descriptionText && normalizeText(descriptionText) !== normalizeText(idText)
      ? `${idText} - ${descriptionText}`
      : idText;
    const key = normalizeText(optionText);
    if (seen.has(key)) return [];

    seen.add(key);
    return [optionText];
  });
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const periodId = req.nextUrl.searchParams.get("periodId") ?? "";
  const validateWith = req.nextUrl.searchParams.get("validateWith") ?? "";
  const preferredColumnName = validateWith.split(" - ").slice(1).join(" - ").trim();
  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return NextResponse.json([], { status: 500 });

  const backendUrl = `${apiUrl}/validators/id?id=${encodeURIComponent(params.id)}&periodId=${encodeURIComponent(periodId)}`;
  try {
    const res = await fetch(backendUrl, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return NextResponse.json([], { status: res.status });
    return NextResponse.json(buildOptions(data.validator, preferredColumnName), { status: 200 });
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
