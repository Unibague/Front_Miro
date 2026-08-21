/** Segmentos dinámicos de `useParams()` en App Router (Next 14). */

export function paramId(
  params: Record<string, string | string[]> | null | undefined
): string | undefined {
  const raw = params?.id;
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
}

export function paramKey(
  params: Record<string, string | string[]> | null | undefined,
  key: string
): string | undefined {
  const raw = params?.[key];
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
}
