/** Rutas del módulo Procesos MEN (Next.js App Router). */
export const PROCESSES_MEN_BASE = "/processes-MEN";

export const processesMenRoutes = {
  home: PROCESSES_MEN_BASE,
  comunicaciones: `${PROCESSES_MEN_BASE}?modulo=comunicaciones`,
  adminImport: `${PROCESSES_MEN_BASE}/admin`,
  program: (programId: string) =>
    `${PROCESSES_MEN_BASE}/program/${encodeURIComponent(programId)}`,
  homeWithQuery: (query: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") q.set(k, v);
    }
    const s = q.toString();
    return s ? `${PROCESSES_MEN_BASE}?${s}` : PROCESSES_MEN_BASE;
  },
} as const;

export const PROCESSES_MEN_RESET_EVENT = "processes-men-reset";

export function isProcessesMenPath(pathname: string | null | undefined): boolean {
  return pathname?.startsWith(PROCESSES_MEN_BASE) ?? false;
}

export function isProcessesMenOrLegacyPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname.startsWith(PROCESSES_MEN_BASE) || pathname.startsWith(LEGACY_DATE_REVIEW_BASE);
}

/** Prefijo legacy (/date-review sin rutas App Router; middleware redirige a processes-MEN). */
export const LEGACY_DATE_REVIEW_BASE = "/date-review";
