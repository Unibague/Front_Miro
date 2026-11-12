import axios from "axios";

// Seguimiento de una carga de Consulta de Información: el backend responde
// 202 apenas recibe el archivo y lo procesa en segundo plano (archivos de
// cientos de miles de filas). Aquí se consulta su estado hasta que termine.

export type ProcessingStatus = "procesando" | "listo" | "error";

export interface UploadStatus {
  status: ProcessingStatus;
  progress?: { rows: number; step: string | null };
  error_message?: string | null;
  // Plantillas SNIES: resultado de dejar el archivo como envío final en SNIES
  snies_sync?: {
    status: "ok" | "error";
    name?: string;
    filas?: number;
    dependencias?: number;
    message?: string;
  } | null;
}

const STEP_LABELS: Record<string, string> = {
  guardando: "Guardando archivo",
  leyendo: "Leyendo filas",
  calculando: "Calculando cifras",
  finalizando: "Finalizando",
  snies: "Cargando en SNIES",
};

const POLL_INTERVAL_MS = 3000;

export const describeProcessing = (status?: Pick<UploadStatus, "progress"> | null) => {
  const step = STEP_LABELS[status?.progress?.step || ""] || "Procesando";
  const rows = status?.progress?.rows || 0;
  return rows > 0 ? `${step} · ${rows.toLocaleString("es-CO")} filas` : `${step}…`;
};

export const describeUploadPercent = (loaded: number, total?: number) =>
  total ? `Subiendo archivo · ${Math.round((loaded / total) * 100)}%` : "Subiendo archivo…";

// Resuelve con el estado final ("listo" o "error"). Los fallos de red
// transitorios no cortan la espera; un 404 (registro eliminado) sí.
export async function waitForUploadProcessing(
  apiBase: string,
  id: string,
  onUpdate: (status: UploadStatus) => void
): Promise<UploadStatus> {
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      const { data } = await axios.get<UploadStatus>(`${apiBase}/${id}/status`);
      onUpdate(data);
      if (data.status !== "procesando") return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return { status: "error", error_message: "El archivo ya no existe." };
      }
    }
  }
}
