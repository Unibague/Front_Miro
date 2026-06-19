"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Button, Center, Checkbox, Container, Divider,
  FileButton, Group, Loader, Modal, MultiSelect, Paper, Progress, Select, Stack,
  Text, Textarea, TextInput, ThemeIcon, Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowLeft, IconBulb, IconCheck, IconChevronDown, IconChevronUp, IconExternalLink,
  IconForms, IconLock, IconTarget, IconTrash, IconUpload, IconAlertCircle,
} from "@tabler/icons-react";
import axios from "axios";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PDI_ROUTES } from "@/app/pdi/api";
import type { Indicador, Periodo } from "@/app/pdi/types";
import PdiSidebar from "@/app/pdi/components/PdiSidebar";
import { usePdiConfig } from "@/app/pdi/hooks/usePdiConfig";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";

// ── Tipos locales ────────────────────────────────────────────────────────────

interface CorteVigente { _id: string; nombre: string; }

interface CampoFormulario {
  _id: string;
  etiqueta: string;
  tipo: "texto_largo" | "texto_corto" | "archivo_pdf" | "select" | "select_con_otro" | "select_multiple" | "select_multiple_con_otro" | "checkbox";
  descripcion?: string;
  requerido?: boolean;
  min_caracteres?: number | null;
  max_caracteres?: number | null;
  justificacion_descripcion?: string;
  justificacion_min_caracteres?: number | null;
  justificacion_max_caracteres?: number | null;
  opciones?: string[];
  condicional_valor?: "supero_meta" | "no_supero_meta" | null;
}

interface FormularioPDI {
  _id: string;
  nombre: string;
  descripcion?: string;
  alcance: string;
  campos: CampoFormulario[];
}

interface RespuestaCampo {
  campo_id: string;
  etiqueta: string;
  tipo: string;
  valor_texto: string;
  nombre_original: string;
  filename: string;
  url: string;
  comentario_lider?: string;
  comentario_lider_resuelto?: boolean;
}

interface RespuestaFormulario {
  _id: string;
  formulario_id: string;
  indicador_id?: string;
  respondido_por: string;
  corte: string;
  respuestas: RespuestaCampo[];
  estado: "Borrador" | "Enviado";
  fecha_envio?: string | null;
  word_filename?: string;
  word_url?: string;
  word_nombre_original?: string;
  documento_nombre_original?: string;
  documento_filename?: string;
  documento_url?: string;
  documento_mimetype?: string;
  documento_size?: number;
  documentos?: DocumentoEvidencia[];
  estado_aval?: "Pendiente" | "Aprobado" | "Rechazado" | null;
  lider_email_aval?: string;
  aval_por?: string;
  aval_comentario?: string;
  aval_razones?: string[];
  aval_otro_cual?: string;
  aval_fecha?: string | null;
}

interface DocumentoEvidencia {
  _id?: string;
  nombre_original?: string;
  filename?: string;
  url?: string;
  mimetype?: string;
  size?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEMAFORO_COLORS: Record<string, string> = {
  verde: "#40c057", amarillo: "#fab005", rojo: "#fa5252",
};

function esPeriodoEditable(periodo: string, cortes: CorteVigente[]) {
  return cortes.some(c => c.nombre === periodo);
}

// Nueva función: Verifica si el período está en "Cortes de seguimiento" del indicador
function estaEnCortesSegimiento(periodo: string, indicador: Indicador | null): boolean {
  if (!indicador?.fecha_seguimiento) return false;
  const cortesSegimiento = indicador.fecha_seguimiento
    .split(",")
    .map((c: string) => c.trim())
    .filter(Boolean);
  return cortesSegimiento.includes(periodo);
}

function parseAvance(val: string): number | null {
  if (val === "") return null;
  const n = Number(val.replace("%", "").replace(",", ".").trim());
  return isNaN(n) ? null : n;
}

function getAvanceMostrado(ind: Indicador): number {
  return ind.avance_total_real ?? ind.avance ?? 0;
}

function formatFechaCorta(fecha?: string | null) {
  if (!fecha) return "";
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-CO");
}

const MAX_EVIDENCE_TOTAL_SIZE = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE_EXTENSIONS = [".pdf", ".xlsx", ".xls", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".zip", ".rar"];
const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
]);
const EVIDENCE_ACCEPT =
  "application/pdf,.pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,.jpg,.jpeg,.png,.tif,.tiff,image/jpeg,image/png,image/tiff,.zip,.rar,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed";
const EVIDENCE_FORMATS_TEXT = "PDF, Excel (.xlsx, .xls), im\u00e1genes (.jpg, .jpeg, .png, .tif), comprimidos (.zip, .rar) y enlaces institucionales";
const SELECT_VALUE_SEPARATOR = " | ";
const EVIDENCE_HELP_TEXT =
  "Adjunte uno o varios archivos que soporten y permitan verificar el resultado alcanzado frente al indicador. Las evidencias podrán cargarse en formato PDF, archivos de Excel (.xlsx, .xls), imágenes de alta resolución (.jpg, .jpeg, .png, .tif) y archivos comprimidos (.zip, .rar), y podrán corresponder a informes de resultados, matrices o bases consolidadas, reportes institucionales, certificaciones, productos finales validados, actas, listados de asistencia, capturas de plataformas institucionales u otros documentos que permitan comprobar el avance reportado frente a la meta o línea base.";
const EVIDENCE_HELP_TEXT_2 =
  "La evidencia cargada debe comprobar directamente el avance del indicador de resultado. Evite adjuntar soportes de actividades o información que no guarde relación directa con el resultado reportado.";

const EVIDENCE_HELP_TEXT_REQUESTED =
  "Adjunte archivos que soporten y permitan verificar el avance del indicador reportado. Se aceptan archivos en formato PDF, Excel (.xlsx, .xls), im\u00e1genes de alta resoluci\u00f3n (.jpg, .jpeg, .png, .tif), archivos comprimidos (.zip, .rar) y enlaces institucionales.";
const EVIDENCE_HELP_TEXT_2_REQUESTED =
  "Importante: la evidencia debe comprobar directamente el avance del indicador de resultado. Evite adjuntar soportes de actividades o informaci\u00f3n sin relaci\u00f3n directa con la meta reportada.";
const EVIDENCE_HELP_TEXT_3 =
  "Capacidad m\u00e1xima: el tama\u00f1o total de las evidencias cargadas no debe superar los 10 MB.";

function getDocumentosEvidencia(resp?: RespuestaFormulario | null): DocumentoEvidencia[] {
  if (!resp) return [];
  if (Array.isArray(resp.documentos) && resp.documentos.length > 0) return resp.documentos;
  if (resp.documento_url || resp.documento_nombre_original || resp.documento_filename) {
    return [{
      _id: "legacy",
      nombre_original: resp.documento_nombre_original,
      filename: resp.documento_filename,
      url: resp.documento_url,
      mimetype: resp.documento_mimetype,
      size: resp.documento_size,
    }];
  }
  return [];
}

function formatFileSize(size?: number) {
  if (!size || size <= 0) return "";
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(size / 1024)} KB`;
}

function getDocumentosTotalSize(documentos: DocumentoEvidencia[]) {
  return documentos.reduce((total, doc) => total + (Number(doc.size) || 0), 0);
}

function getFilesTotalSize(files: File[]) {
  return files.reduce((total, file) => total + file.size, 0);
}

function isAllowedEvidenceFile(file: File) {
  const fileName = file.name.toLowerCase();
  return ALLOWED_EVIDENCE_MIME_TYPES.has(file.type) ||
    ALLOWED_EVIDENCE_EXTENSIONS.some(ext => fileName.endsWith(ext));
}

function splitSavedValueAndJustification(value: string) {
  const [answer, ...justificationParts] = value.split(/\nJustificaci[oó]n:\s*/);
  return {
    answer: answer.trim(),
    justification: justificationParts.join("\nJustificación: ").trim(),
  };
}

function splitSelectValues(value: string) {
  const { answer } = splitSavedValueAndJustification(value);
  return answer
    .split(SELECT_VALUE_SEPARATOR)
    .map(item => item.trim())
    .filter(Boolean);
}

function formatSelectValues(values: string[]) {
  return values.map(item => item.trim()).filter(Boolean).join(SELECT_VALUE_SEPARATOR);
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function SubirEvidenciasPage() {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const searchParams = useSearchParams();
  const indicadorId = params?.indicadorId as string;
  const { data: session, status } = useSession();
  const { config } = usePdiConfig();
  const vieneDeMisIndicadores = currentPath.startsWith("/pdi/mis-indicadores/");
  const esLiderDesdeListado = (searchParams?.get("esLider") ?? "") === "1";

  // Indicador y cortes
  const [indicador, setIndicador] = useState<Indicador | null>(null);
  const [loadingInd, setLoadingInd] = useState(true);
  const [cortesVigentes, setCortesVigentes] = useState<CorteVigente[]>([]);
  const [namingGuideOpen, setNamingGuideOpen] = useState(false);
  const [mostrarTodosPeriodos, setMostrarTodosPeriodos] = useState(false);

  // Avances
  const [avancesStr, setAvancesStr] = useState<Record<string, string>>({});

  // Formularios
  const [formularios, setFormularios] = useState<FormularioPDI[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaFormulario | null>>({});
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [otrosTextos, setOtrosTextos] = useState<Record<string, string>>({});
  const [justificaciones, setJustificaciones] = useState<Record<string, string>>({});
  const [loadingForms, setLoadingForms] = useState(true);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadingDocumento, setUploadingDocumento] = useState<Record<string, boolean>>({});
  const [resolvingComentario, setResolvingComentario] = useState<Record<string, boolean>>({});
  const [razonesRechazoLabels, setRazonesRechazoLabels] = useState<Record<string, string>>({});

  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sentSuccessfully, setSentSuccessfully] = useState(false);
  const [esLiderDelIndicador, setEsLiderDelIndicador] = useState(false);
  const [mostrarModalPeriodoAtrasado, setMostrarModalPeriodoAtrasado] = useState(false);
  const [periodosAtrasados, setPeriodosAtrasados] = useState<Periodo[]>([]);
  const [periodosConDatos, setPeriodosConDatos] = useState<Set<string>>(new Set());
  const [usuarioEligioReportarAvance, setUsuarioEligioReportarAvance] = useState(false); // false: solo vigente, true: todos

  const email = (session?.user?.email ?? "").toLowerCase().trim();
  const { setHasChanges } = useUnsavedChanges();

  // Activar protección de cambios sin guardar
  useEffect(() => {
    const tieneChanges = 
      Object.keys(avancesStr).some((periodo) => {
        const original = indicador?.periodos.find((p: Periodo) => p.periodo === periodo);
        const originalVal = original?.avance != null ? String(original.avance) : "";
        return avancesStr[periodo] !== originalVal;
      }) || 
      Object.keys(textos).length > 0 || 
      Object.keys(otrosTextos).length > 0 || 
      Object.keys(justificaciones).length > 0;
    
    setHasChanges(tieneChanges && !sending && !savingDraft && !sentSuccessfully);
  }, [avancesStr, textos, otrosTextos, justificaciones, sending, savingDraft, sentSuccessfully, indicador, setHasChanges]);

  // ── Busca el corte vigente que coincide con un período real del indicador ──────
  // IMPORTANTE: cortesVigentes es lo que está vigente HOY
  // El corte activo es el PRIMER corte vigente que encontremos
  const corteActivo = cortesVigentes.length > 0
    ? typeof cortesVigentes[0] === "string" 
      ? (cortesVigentes[0] as string)
      : ((cortesVigentes[0] as any)?.nombre ?? "")
    : "";
  
  // Debug
  useEffect(() => {
    if (indicador && cortesVigentes.length > 0) {
      const nombresCortes = cortesVigentes.map(c => typeof c === "string" ? c : (c as any)?.nombre);
      console.log("🔍 DEBUG Corte - Cortesigentes:", nombresCortes);
      console.log("🔍 DEBUG Corte - Períodos indicador:", indicador.periodos?.map((p: Periodo) => p.periodo));
      console.log("🔍 DEBUG Corte - Corte activo seleccionado:", corteActivo);
    }
  }, [indicador, cortesVigentes, corteActivo]);
  // Crear período vigente virtual si no existe en el indicador
  const periodoActivo = indicador?.periodos?.find((p: Periodo) => p.periodo === corteActivo) ?? 
    (corteActivo && {
      periodo: corteActivo,
      meta: null,
      avance: null,
      estado_reporte: "Borrador",
      bloqueado: false,
    } as any);
  const avanceCorteNum = periodoActivo ? parseAvance(avancesStr[corteActivo] ?? "") : null;
  const metaCorteNum = periodoActivo?.meta != null ? parseAvance(String(periodoActivo.meta)) : null;
  const estadoCumplimientoMeta =
    avanceCorteNum != null && metaCorteNum != null && metaCorteNum > 0
      ? avanceCorteNum > metaCorteNum
        ? "supero"
        : avanceCorteNum < metaCorteNum
          ? "no_supero"
          : "cumplio"
      : null;

  const shouldShowCampo = (campo: CampoFormulario): boolean => {
    if (!campo.condicional_valor) return true;
    if (estadoCumplimientoMeta === null) return true;
    if (estadoCumplimientoMeta === "cumplio") return false;
    if (campo.condicional_valor === "supero_meta") return estadoCumplimientoMeta === "supero";
    if (campo.condicional_valor === "no_supero_meta") return estadoCumplimientoMeta === "no_supero";
    return true;
  };

  const getOtroTexto = (formId: string, campoId: string) => otrosTextos[`${formId}-${campoId}`] ?? "";
  const setOtroTexto = (formId: string, campoId: string, val: string) =>
    setOtrosTextos(prev => ({ ...prev, [`${formId}-${campoId}`]: val }));

  const getJustificacion = (formId: string, campoId: string) => justificaciones[`${formId}-${campoId}`] ?? "";
  const setJustificacion = (formId: string, campoId: string, val: string) =>
    setJustificaciones(prev => ({ ...prev, [`${formId}-${campoId}`]: val }));
  const formatRazonRechazo = (razon: string, otroCual?: string) => {
    const label = razonesRechazoLabels[razon] ?? razon;
    return label === "Otro" && otroCual ? `Otro: ${otroCual}` : label;
  };

  // ── Calcular si ya está todo enviado ──────────────────────────────────────
  const todosEnviados =
    formularios.length > 0 &&
    formularios.every(f => respuestas[f._id]?.estado === "Enviado");
  const tieneFormulariosRechazados = formularios.some(
    f => respuestas[f._id]?.estado_aval === "Rechazado"
  );
  const todosLosEnviadosAprobados =
    formularios.length > 0 &&
    formularios.every((f) => {
      const resp = respuestas[f._id];
      return resp?.estado === "Enviado" && resp?.estado_aval === "Aprobado";
    });
  const autoAprobadoUsuario = esLiderDelIndicador || esLiderDesdeListado;

  // ── Carga indicador ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!indicadorId) return;
    axios.get(PDI_ROUTES.indicador(indicadorId))
      .then(r => {
        setIndicador(r.data);
        const strs: Record<string, string> = {};
        (r.data.periodos ?? []).forEach((p: Periodo) => {
          strs[p.periodo] = p.avance != null ? String(p.avance) : "";
        });
        setAvancesStr(strs);
      })
      .catch(() => {})
      .finally(() => setLoadingInd(false));
    axios.get(PDI_ROUTES.cortesVigentes())
      .then(r => setCortesVigentes(r.data))
      .catch(() => {});
  }, [indicadorId]);

  useEffect(() => {
    axios.get(PDI_ROUTES.razonesRechazo())
      .then((r) => {
        const labels: Record<string, string> = { Otro: "Otro" };
        (r.data as { _id?: string; texto?: string }[]).forEach((razon) => {
          const texto = String(razon.texto ?? "").trim();
          if (!texto) return;
          if (razon._id) labels[razon._id] = texto;
          labels[texto] = texto;
        });
        setRazonesRechazoLabels(labels);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!indicadorId || !email) return;
    axios.get(PDI_ROUTES.formularioLiderEmailIndicador(), { params: { indicador_id: indicadorId } })
      .then((r) => {
        const liderEmail = (r.data?.lider_email ?? "").toLowerCase().trim();
        setEsLiderDelIndicador(Boolean(liderEmail) && liderEmail === email);
      })
      .catch(() => setEsLiderDelIndicador(false));
  }, [indicadorId, email]);

  // ── Carga formularios ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!indicadorId || !email) return;
    
    // Si el usuario dice "no por ahora", NO cargar formularios
    // Si el usuario dice "sí reportar avance", cargar formularios
    if (!usuarioEligioReportarAvance) {
      setFormularios([]);
      setRespuestas({});
      return;
    }
    
    // SOLO cargar formularios si:
    // 1. Usuario eligió reportar avance
    // 2. Hay corte activo (vigente hoy)
    if (!corteActivo) return;
    
    // Usar el corte activo (vigente hoy)
    const corteAUsar = corteActivo;
    
    setLoadingForms(true);
    axios.get(PDI_ROUTES.formularios(), { params: { indicador_id: indicadorId } })
      .then(async r => {
        const forms: FormularioPDI[] = r.data.filter((f: any) => f.activo);
        setFormularios(forms);
        await recargarRespuestas(forms, corteAUsar);
      })
      .catch(() => {})
      .finally(() => setLoadingForms(false));
  }, [indicadorId, email, corteActivo, usuarioEligioReportarAvance]);

  // ── Detectar si hay períodos sin datos para ofrecer al usuario ─────────────────────────────────
  useEffect(() => {
    if (!indicador) {
      setMostrarModalPeriodoAtrasado(false);
      return;
    }

    const periodos = indicador.periodos ?? [];

    console.log("🔍 DEBUG Modal - Indicador ID:", indicador._id);
    console.log("🔍 DEBUG Modal - Corte activo (vigente hoy):", corteActivo);
    console.log("🔍 DEBUG Modal - Períodos totales:", periodos.length, periodos.map(p => p.periodo));

    // Si NO hay corte vigente hoy, NO mostrar modal
    if (!corteActivo) {
      console.log("❌ No hay corte vigente hoy, no mostrar modal");
      setMostrarModalPeriodoAtrasado(false);
      setPeriodosAtrasados([]);
      return;
    }

    // Si HAY corte vigente hoy, buscar ese período en los indicadores
    let periodoVigente: Periodo = periodos.find((p: Periodo) => p.periodo === corteActivo) ?? {
      periodo: corteActivo,
      meta: null,
      avance: null,
      estado_reporte: "Borrador",
      bloqueado: false,
    } as any;

    // Si fue creado virtualmente (no existía en el indicador)
    if (!periodos.some((p: Periodo) => p.periodo === corteActivo)) {
      console.log(`⚠️ El corte vigente ${corteActivo} no existe en los períodos del indicador - usando período virtual`);
    }

    // Verificar si el período vigente tiene meta definida
    const tieneMeta = periodoVigente.meta != null && periodoVigente.meta !== "";
    const tieneAvanceReal = periodoVigente.avance != null && periodoVigente.avance !== 0 && periodoVigente.avance !== "0";
    const tieneReporte = periodoVigente.estado_reporte === "Enviado" || periodoVigente.estado_reporte === "Aprobado";

    console.log(`📊 Período vigente ${corteActivo}: meta=${tieneMeta}, avance=${periodoVigente.avance}, tieneReporte=${periodoVigente.estado_reporte}`);

    // Mostrar modal SOLO si:
    // 1. Hay corte vigente hoy (ya verificado)
    // 2. El período vigente NO tiene meta definida O está siendo reportado por primera vez
    // 3. NO tiene avance real ni reporte enviado
    // 4. No acaba de enviar exitosamente
    const debesMostrarModal = !tieneMeta && !tieneAvanceReal && !tieneReporte && !sentSuccessfully;

    if (debesMostrarModal) {
      console.log("✅ Mostrando modal - período vigente sin meta definida o sin reporte");
      setPeriodosAtrasados([periodoVigente]);
      setMostrarModalPeriodoAtrasado(true);
    } else {
      console.log("❌ No mostrando modal. Razones:", { tieneMeta, tieneAvanceReal, tieneReporte, sentSuccessfully });
      setPeriodosAtrasados([]);
      setMostrarModalPeriodoAtrasado(false);
    }
  }, [indicador, corteActivo, sentSuccessfully]);

  // ── Resetear flags cuando envía exitosamente ────────────────────────────────
  useEffect(() => {
    if (sentSuccessfully) {
      setUsuarioEligioReportarAvance(false);
      setMostrarTodosPeriodos(false);
    }
  }, [sentSuccessfully]);

  // ── Helpers formulario ────────────────────────────────────────────────────
  const getTexto = (formId: string, campoId: string) => textos[`${formId}-${campoId}`] ?? "";
  const setTexto = (formId: string, campoId: string, val: string) =>
    setTextos(prev => ({ ...prev, [`${formId}-${campoId}`]: val }));
  const getSelectValues = (formId: string, campoId: string) => splitSelectValues(getTexto(formId, campoId));
  const setSelectValues = (formId: string, campoId: string, values: string[]) =>
    setTexto(formId, campoId, formatSelectValues(values));
  const getRespuestaCampo = (formId: string, campoId: string): RespuestaCampo | undefined =>
    respuestas[formId]?.respuestas.find(r => r.campo_id === campoId);
  const formTieneDocumento = (formId: string) => getDocumentosEvidencia(respuestas[formId]).length > 0;
  const getMaxCaracteres = (campo: CampoFormulario) => campo.max_caracteres ?? null;
  const campoEstaCompleto = (formId: string, campo: CampoFormulario) => {
    if (!shouldShowCampo(campo)) return true;
    if (campo.tipo === "texto_largo" || campo.tipo === "texto_corto") {
      const texto = getTexto(formId, campo._id).trim();
      const maxChars = getMaxCaracteres(campo);
      if (campo.requerido && !texto) return false;
      return !texto || !maxChars || texto.length <= maxChars;
    }
    if (!campo.requerido) return true;
    if (campo.tipo === "select") {
      return Boolean(getTexto(formId, campo._id).trim());
    }
    if (campo.tipo === "select_con_otro") {
      const val = getTexto(formId, campo._id).trim();
      return Boolean(val) && (val !== "Otro" || Boolean(getOtroTexto(formId, campo._id).trim()));
    }
    if (campo.tipo === "select_multiple") {
      return getSelectValues(formId, campo._id).length > 0;
    }
    if (campo.tipo === "select_multiple_con_otro") {
      const values = getSelectValues(formId, campo._id);
      return values.length > 0 && (!values.includes("Otro") || Boolean(getOtroTexto(formId, campo._id).trim()));
    }
    if (campo.tipo === "checkbox") {
      return Boolean(getTexto(formId, campo._id).trim());
    }
    return Boolean(getRespuestaCampo(formId, campo._id)?.url);
  };
  const periodosEditablesSinAvance = (indicador?.periodos ?? []).filter((p: Periodo) => {
    if (!esPeriodoEditable(p.periodo, cortesVigentes)) return false;
    return parseAvance(avancesStr[p.periodo] ?? "") == null;
  });
  const formulariosIncompletos = formularios.filter((form) =>
    form.campos.some((campo) => !campoEstaCompleto(form._id, campo))
  );
  const formulariosSinDocumento = formularios.filter((form) => !formTieneDocumento(form._id));
  const formulariosConEvidenciasPesadas = formularios.filter((form) =>
    getDocumentosTotalSize(getDocumentosEvidencia(respuestas[form._id])) > MAX_EVIDENCE_TOTAL_SIZE
  );

  const recargarRespuestas = async (formsOverride?: FormularioPDI[], corteOverride?: string) => {
    const formsToLoad = formsOverride ?? formularios;
    const corteAUsar = corteOverride || corteActivo;
    if (!indicadorId || !email || !corteAUsar || formsToLoad.length === 0) return;
    const respMap: Record<string, RespuestaFormulario | null> = {};
    const textMap: Record<string, string> = {};
    const justMap: Record<string, string> = {};

    await Promise.all(formsToLoad.map(async (f) => {
      try {
        const res = await axios.get(PDI_ROUTES.formularioRespuestas(f._id), {
          params: { respondido_por: email, corte: corteAUsar, indicador_id: indicadorId },
        });
        const resp: RespuestaFormulario | null = res.data[0] ?? null;
        respMap[f._id] = resp;
        if (resp) {
          const otroMap: Record<string, string> = {};
          resp.respuestas.forEach((r) => {
            const key = `${f._id}-${r.campo_id}`;
            const { answer, justification } = splitSavedValueAndJustification(r.valor_texto ?? "");
            if (justification) justMap[key] = justification;
            if (["texto_largo", "texto_corto", "select", "checkbox"].includes(r.tipo)) {
              textMap[key] = answer;
            } else if (r.tipo === "select_con_otro" && answer) {
              if (answer.startsWith("Otro: ")) {
                textMap[key] = "Otro";
                otroMap[key] = answer.slice(6);
              } else {
                textMap[key] = answer;
              }
            } else if (r.tipo === "select_multiple" && answer) {
              textMap[key] = answer;
            } else if (r.tipo === "select_multiple_con_otro" && answer) {
              const rawValues = splitSelectValues(answer);
              const selectedValues = rawValues.map(value => value.startsWith("Otro: ") ? "Otro" : value);
              const otroValue = rawValues.find(value => value.startsWith("Otro: "));
              textMap[key] = formatSelectValues(selectedValues);
              if (otroValue) otroMap[key] = otroValue.slice(6);
            }
          });
          setOtrosTextos(prev => ({ ...prev, ...otroMap }));
        }
      } catch {
        respMap[f._id] = null;
      }
    }));

    setRespuestas(respMap);
    setTextos(textMap);
    setJustificaciones(justMap);
  };

  // ── Guardar avances ───────────────────────────────────────────────────────
  const guardarAvances = async (modo: "guardar" | "enviar" = "guardar") => {
    if (!indicador) return;
    const autoAprobado = esLiderDelIndicador || esLiderDesdeListado;
    const estadoEnviado = autoAprobado ? "Aprobado" : "Enviado";
    const fechaEnvio = new Date().toISOString();
    const periodosPayload = (indicador.periodos ?? []).map((p: Periodo) => {
      const val = parseAvance(avancesStr[p.periodo] ?? "");
      const editable = esPeriodoEditable(p.periodo, cortesVigentes);
      const seEnvia = modo === "enviar" && editable;
      return {
        periodo: p.periodo, meta: p.meta,
        presupuesto_ejecutado: p.presupuesto_ejecutado ?? 0,
        avance: val === 0 && !editable ? null : val,
        resultados_alcanzados: p.resultados_alcanzados ?? "",
        logros: p.logros ?? "", alertas: p.alertas ?? "",
        justificacion_retrasos: p.justificacion_retrasos ?? "",
        estado_reporte: seEnvia ? estadoEnviado : (p.estado_reporte ?? "Borrador"),
        fecha_envio: seEnvia ? fechaEnvio : (p.fecha_envio ?? null),
        reportado_por: seEnvia ? email : (p.reportado_por ?? ""),
      };
    });
    const res = await axios.put(PDI_ROUTES.indicador(indicador._id), {
      periodos: periodosPayload,
      accion_id: typeof indicador.accion_id === "string"
        ? indicador.accion_id : (indicador.accion_id as any)._id,
      modificado_por: email,
    });
    setIndicador(res.data);
  };

  // ── Guardar respuesta formulario ──────────────────────────────────────────
  const buildValorTexto = (form: FormularioPDI, c: CampoFormulario): string => {
    if (c.tipo === "texto_largo" || c.tipo === "texto_corto") return getTexto(form._id, c._id);
    if (c.tipo === "select") {
      const sel = getTexto(form._id, c._id).trim();
      const just = getJustificacion(form._id, c._id);
      return just ? `${sel}\nJustificación: ${just}` : sel;
    }
    if (c.tipo === "select_con_otro") {
      const val = getTexto(form._id, c._id).trim();
      const base = val === "Otro" ? `Otro: ${getOtroTexto(form._id, c._id).trim()}` : val;
      const just = getJustificacion(form._id, c._id);
      return just ? `${base}\nJustificación: ${just}` : base;
    }
    if (c.tipo === "select_multiple") {
      const sel = formatSelectValues(getSelectValues(form._id, c._id));
      const just = getJustificacion(form._id, c._id);
      return just ? `${sel}\nJustificación: ${just}` : sel;
    }
    if (c.tipo === "select_multiple_con_otro") {
      const values = getSelectValues(form._id, c._id).map(value =>
        value === "Otro" ? `Otro: ${getOtroTexto(form._id, c._id).trim()}` : value
      );
      const base = formatSelectValues(values);
      const just = getJustificacion(form._id, c._id);
      return just ? `${base}\nJustificación: ${just}` : base;
    }
    if (c.tipo === "checkbox") return getTexto(form._id, c._id) || "false";
    return "";
  };

  const guardarFormulario = async (form: FormularioPDI, enviar: boolean) => {
    const respuestasPayload = form.campos
      .filter(shouldShowCampo)
      .map(c => ({
        campo_id: c._id, etiqueta: c.etiqueta, tipo: c.tipo,
        valor_texto: buildValorTexto(form, c),
        nombre_original: getRespuestaCampo(form._id, c._id)?.nombre_original ?? "",
        filename: getRespuestaCampo(form._id, c._id)?.filename ?? "",
        url: getRespuestaCampo(form._id, c._id)?.url ?? "",
        comentario_lider: getRespuestaCampo(form._id, c._id)?.comentario_lider ?? "",
        comentario_lider_resuelto: getRespuestaCampo(form._id, c._id)?.comentario_lider_resuelto ?? false,
      }));
    const res = await axios.post(PDI_ROUTES.formularioRespuestas(form._id), {
      respondido_por: email, corte: corteActivo,
      indicador_id: indicadorId,
      respuestas: respuestasPayload,
      estado: enviar ? "Enviado" : "Borrador",
    });
    setRespuestas(prev => ({ ...prev, [form._id]: res.data }));
    return res.data;
  };

  // ── Subir archivo ─────────────────────────────────────────────────────────
  const handleUploadPDF = async (form: FormularioPDI, campo: CampoFormulario, file: File | null) => {
    if (!file) return;
    if (!isAllowedEvidenceFile(file)) {
      showNotification({
        title: "Formato inválido",
        message: `El archivo "${file.name}" no tiene un formato permitido. Solo se permiten ${EVIDENCE_FORMATS_TEXT}.`,
        color: "red",
      });
      return;
    }
    if (file.size > MAX_EVIDENCE_TOTAL_SIZE) {
      showNotification({
        title: "Archivo demasiado grande",
        message: `El archivo "${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El maximo permitido es 10 MB.`,
        color: "red",
      });
      return;
    }
    let respActual = respuestas[form._id];
    if (!respActual) {
      try {
        const res = await axios.post(PDI_ROUTES.formularioRespuestas(form._id), {
          respondido_por: email, corte: corteActivo, indicador_id: indicadorId,
          respuestas: form.campos.map(c => ({
            campo_id: c._id, etiqueta: c.etiqueta, tipo: c.tipo,
            valor_texto: "", nombre_original: "", filename: "", url: "",
            comentario_lider: "", comentario_lider_resuelto: false,
          })),
          estado: "Borrador",
        });
        respActual = res.data;
        setRespuestas(prev => ({ ...prev, [form._id]: res.data }));
      } catch { return; }
    }
    setUploading(prev => ({ ...prev, [`${form._id}-${campo._id}`]: true }));
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const res = await axios.post(
        PDI_ROUTES.formularioArchivo(form._id, respActual!._id, campo._id),
        fd
      );
      setRespuestas(prev => {
        const r = prev[form._id];
        if (!r) return prev;
        const idx = r.respuestas.findIndex(rr => rr.campo_id === campo._id);
        const updated = [...r.respuestas];
        if (idx >= 0) updated[idx] = { ...updated[idx], ...res.data };
        else updated.push({ campo_id: campo._id, etiqueta: campo.etiqueta, tipo: campo.tipo, valor_texto: "", ...res.data });
        return { ...prev, [form._id]: { ...r, respuestas: updated } };
      });
      showNotification({ title: "Subido", message: "Archivo subido correctamente", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo subir el archivo", color: "red" });
    } finally {
      setUploading(prev => ({ ...prev, [`${form._id}-${campo._id}`]: false }));
    }
  };

  const handleDeletePDF = async (form: FormularioPDI, campo: CampoFormulario) => {
    const resp = respuestas[form._id];
    if (!resp) return;
    try {
      await axios.delete(PDI_ROUTES.formularioArchivo(form._id, resp._id, campo._id));
      setRespuestas(prev => {
        const r = prev[form._id];
        if (!r) return prev;
        return {
          ...prev,
          [form._id]: {
            ...r,
            respuestas: r.respuestas.map(rr =>
              rr.campo_id === campo._id
                ? { ...rr, filename: "", nombre_original: "", url: "" }
                : rr
            ),
          },
        };
      });
      showNotification({ title: "Eliminado", message: "Archivo eliminado", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
    }
  };

  // ── Acción: guardar borrador (solo avances) ───────────────────────────────
  const handleToggleComentarioResuelto = async (form: FormularioPDI, campo: CampoFormulario, resuelto: boolean) => {
    const resp = respuestas[form._id];
    if (!resp) return;

    const key = `${form._id}-${campo._id}`;
    setResolvingComentario(prev => ({ ...prev, [key]: true }));
    setRespuestas(prev => {
      const actual = prev[form._id];
      if (!actual) return prev;
      return {
        ...prev,
        [form._id]: {
          ...actual,
          respuestas: actual.respuestas.map(r =>
            r.campo_id === campo._id ? { ...r, comentario_lider_resuelto: resuelto } : r
          ),
        },
      };
    });

    try {
      await axios.put(PDI_ROUTES.formularioComentarioCampoResuelto(form._id, resp._id, campo._id), { resuelto });
      showNotification({
        title: resuelto ? "Comentario resuelto" : "Comentario pendiente",
        message: resuelto ? "Se marco el comentario del lider como resuelto." : "Se quito la marca de resuelto.",
        color: resuelto ? "teal" : "orange",
      });
    } catch (e: any) {
      setRespuestas(prev => {
        const actual = prev[form._id];
        if (!actual) return prev;
        return {
          ...prev,
          [form._id]: {
            ...actual,
            respuestas: actual.respuestas.map(r =>
              r.campo_id === campo._id ? { ...r, comentario_lider_resuelto: !resuelto } : r
            ),
          },
        };
      });
      showNotification({
        title: "Error",
        message: e.response?.data?.error ?? "No se pudo actualizar el comentario",
        color: "red",
      });
    } finally {
      setResolvingComentario(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleUploadDocumento = async (form: FormularioPDI, selectedFiles: File[] | File | null) => {
    const files = Array.isArray(selectedFiles) ? selectedFiles : selectedFiles ? [selectedFiles] : [];
    if (files.length === 0) return;
    const invalidFile = files.find(file => !isAllowedEvidenceFile(file));
    if (invalidFile) {
      showNotification({
        title: "Formato inválido",
        message: `El archivo "${invalidFile.name}" no tiene un formato permitido. Solo se permiten ${EVIDENCE_FORMATS_TEXT}.`,
        color: "red",
      });
      return;
    }
    const oversizedFile = files.find(file => file.size > MAX_EVIDENCE_TOTAL_SIZE);
    if (oversizedFile) {
      showNotification({
        title: "Archivo demasiado grande",
        message: `El archivo "${oversizedFile.name}" pesa ${(oversizedFile.size / 1024 / 1024).toFixed(1)} MB. El maximo total permitido es 10 MB.`,
        color: "red",
      });
      return;
    }
    let respActual = respuestas[form._id];
    if (!respActual) {
      try {
        const res = await axios.post(PDI_ROUTES.formularioRespuestas(form._id), {
          respondido_por: email,
          corte: corteActivo,
          indicador_id: indicadorId,
          respuestas: form.campos.map(c => ({
            campo_id: c._id,
            etiqueta: c.etiqueta,
            tipo: c.tipo,
            valor_texto: "",
            nombre_original: "",
            filename: "",
            url: "",
            comentario_lider: "",
            comentario_lider_resuelto: false,
          })),
          estado: "Borrador",
        });
        respActual = res.data;
        setRespuestas(prev => ({ ...prev, [form._id]: res.data }));
      } catch {
        showNotification({ title: "Error", message: "No se pudo preparar la respuesta", color: "red" });
        return;
      }
    }

    const documentosConservados = respActual?.estado_aval === "Rechazado" ? [] : getDocumentosEvidencia(respActual);
    const totalExistente = getDocumentosTotalSize(documentosConservados);
    const totalNuevo = getFilesTotalSize(files);
    const totalFinal = totalExistente + totalNuevo;
    if (totalFinal > MAX_EVIDENCE_TOTAL_SIZE) {
      showNotification({
        title: "Capacidad maxima superada",
        message: `Las evidencias sumarian ${formatFileSize(totalFinal)}. El maximo total permitido es 10 MB.`,
        color: "red",
      });
      return;
    }

    setUploadingDocumento(prev => ({ ...prev, [form._id]: true }));
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("archivo", f));
      const res = await axios.post(
        PDI_ROUTES.formularioDocumentoFinal(form._id, respActual!._id),
        fd
      );
      setRespuestas(prev => {
        const actual = prev[form._id] ?? respActual;
        if (!actual) return prev;
        return { ...prev, [form._id]: { ...actual, ...res.data } };
      });
      showNotification({
        title: "Subido",
        message: files.length === 1 ? "Evidencia adjuntada correctamente" : `${files.length} evidencias adjuntadas correctamente`,
        color: "teal",
      });
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? `Solo se permiten ${EVIDENCE_FORMATS_TEXT}`, color: "red" });
    } finally {
      setUploadingDocumento(prev => ({ ...prev, [form._id]: false }));
    }
  };

  const handleDeleteDocumento = async (form: FormularioPDI, documento?: DocumentoEvidencia) => {
    const resp = respuestas[form._id];
    if (!resp) return;
    try {
      const res = await axios.delete(PDI_ROUTES.formularioDocumentoFinal(form._id, resp._id), {
        params: documento?._id ? { documentoId: documento._id } : undefined,
      });
      setRespuestas(prev => {
        const actual = prev[form._id];
        if (!actual) return prev;
        return {
          ...prev,
          [form._id]: {
            ...actual,
            ...res.data,
          },
        };
      });
      showNotification({ title: "Eliminado", message: "Evidencia eliminada", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo eliminar la evidencia", color: "red" });
    }
  };

  const handleGuardarBorrador = async () => {
    setSavingDraft(true);
    try {
      await guardarAvances();
      await Promise.all(formularios.map(f => guardarFormulario(f, false)));
      showNotification({ title: "Guardado", message: "Puedes continuar más tarde", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar", color: "red" });
    } finally {
      setSavingDraft(false);
    }
  };

  // ── Acción: guardar avances + enviar formulario ───────────────────────────
  const handleEnviarTodo = async () => {
    if (!puedeEnviarTodo) {
      const errores: string[] = [];
      if (!hayPeriodosEditables) errores.push("No hay un periodo de corte editable para reportar.");
      if (periodosEditablesSinAvance.length > 0) {
        errores.push(`Debes registrar el avance del periodo ${periodosEditablesSinAvance.map((p) => p.periodo).join(", ")}.`);
      }
      if (formulariosIncompletos.length > 0) {
        errores.push(`Debes completar el formulario ${formulariosIncompletos.map((form) => `"${form.nombre}"`).join(", ")} antes de enviar.`);
      }
      if (formulariosSinDocumento.length > 0) {
        errores.push(`Debes adjuntar al menos una evidencia del formulario ${formulariosSinDocumento.map((form: FormularioPDI) => `"${form.nombre}"`).join(", ")}.`);
      }
      if (formulariosConEvidenciasPesadas.length > 0) {
        errores.push(`El total de evidencias no debe superar 10 MB en ${formulariosConEvidenciasPesadas.map((form) => `"${form.nombre}"`).join(", ")}.`);
      }
      showNotification({
        title: "Falta información obligatoria",
        message: errores.join(" "),
        color: "red",
      });
      return;
    }

    setSending(true);
    try {
      const autoAprobado = esLiderDelIndicador || esLiderDesdeListado;
      // Primero el formulario (genera Word y sube a Drive); si falla, el avance NO se marca como Enviado
      await Promise.all(formularios.map(f => guardarFormulario(f, true)));
      // Solo si el formulario se envió correctamente, marcar el avance como Enviado
      await guardarAvances("enviar");
      await recargarRespuestas();
      setSentSuccessfully(true);
      showNotification({
        title: autoAprobado ? "Aprobado" : "Enviado",
        message: autoAprobado
          ? "Avances y formulario aprobados automáticamente porque eres el líder responsable del indicador."
          : "Avances y formulario enviados correctamente. El reporte quedó en revisión del líder.",
        color: "teal",
      });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "No se pudo enviar";
      showNotification({
        title: "Error al enviar",
        message: msg.includes("Drive")
          ? msg
          : "No se pudo completar el envío. Verifica la configuración de Google Drive e intenta de nuevo.",
        color: "red",
        autoClose: 8000,
      });
    } finally {
      setSending(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (status === "loading" || loadingInd) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {!vieneDeMisIndicadores && <PdiSidebar />}
        <Center style={{ flex: 1 }}><Loader /></Center>
      </div>
    );
  }

  if (!indicador) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {!vieneDeMisIndicadores && <PdiSidebar />}
        <Center style={{ flex: 1 }}><Text c="dimmed">No se encontró el indicador</Text></Center>
      </div>
    );
  }

  const avanceActual = getAvanceMostrado(indicador);
  const semColor = SEMAFORO_COLORS[indicador.semaforo] ?? "#aaa";
  const hayPeriodosEditables = indicador.periodos.some((p: Periodo) =>
    esPeriodoEditable(p.periodo, cortesVigentes)
  );
  
  const puedeEnviarTodo =
    hayPeriodosEditables &&
    periodosEditablesSinAvance.length === 0 &&
    formulariosIncompletos.length === 0 &&
    formulariosSinDocumento.length === 0 &&
    formulariosConEvidenciasPesadas.length === 0;
  const bloqueado = todosEnviados && !tieneFormulariosRechazados;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!vieneDeMisIndicadores && <PdiSidebar />}

      <Modal
        opened={namingGuideOpen}
        onClose={() => setNamingGuideOpen(false)}
        title={
          <Group gap={8}>
            <IconBulb size={18} color="var(--mantine-color-yellow-6)" />
            <Text fw={700}>Nombramiento de evidencias</Text>
          </Group>
        }
        size="md"
        radius="lg"
      >
        <Stack gap="sm">
          <Text size="sm">Nombre cada archivo así:</Text>
          <Paper withBorder radius="md" p="sm" style={{ background: "#f8f5ff", borderColor: "#ede9fe" }}>
            <Text size="sm" fw={700} c="violet" style={{ fontFamily: "monospace" }}>
              [Macroproyecto]-[Proyecto]-[Acción]-[Indicador]_[Nombre corto]
            </Text>
          </Paper>

          <Text size="sm" fw={600} mt={4}>¿Cómo construirlo?</Text>
          <Stack gap={2}>
            <Text size="sm">• <b>M:</b> número del macroproyecto</Text>
            <Text size="sm">• <b>P:</b> número del proyecto</Text>
            <Text size="sm">• <b>A:</b> número de la acción estratégica</Text>
            <Text size="sm">• <b>I:</b> número del indicador</Text>
            <Text size="sm">• <b>Nombre corto:</b> descripción breve del archivo</Text>
          </Stack>

          <Text size="sm" fw={600} mt={4}>Ejemplo:</Text>
          <Text size="sm" c="dimmed">
            Si reporta el Indicador 1 de la Acción 1, del Proyecto 2, del Macroproyecto 3, el código será: <b>M3-P2-A1-I1</b>
          </Text>
          <Text size="sm" fw={600} mt={2}>Ejemplos completos:</Text>
          <Paper withBorder radius="md" p="sm" style={{ background: "#f8f5ff", borderColor: "#ede9fe" }}>
            <Stack gap={2}>
              {["M3-P2-A1-I1_Informe.pdf", "M2-P1-A2-I2_Base.xlsx", "M1-P3-A1-I1_Acta.zip", "M3-P1-A1-I2_Foto.tif"].map((ej) => (
                <Text key={ej} size="sm" style={{ fontFamily: "monospace" }}>{ej}</Text>
              ))}
            </Stack>
          </Paper>
          <Text size="xs" c="dimmed" mt={4}>Use nombres breves, claros y sin caracteres especiales.</Text>
        </Stack>
      </Modal>

      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="md" py="xl">

          {/* Header */}
          <Group gap={10} mb="lg">
            <ActionIcon variant="subtle" onClick={() => router.back()}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <ThemeIcon size={42} radius="xl" color="violet" variant="light">
              <IconTarget size={20} />
            </ThemeIcon>
            <div>
              <Title order={3}>Avances y evidencias</Title>
              <Text size="sm" c="dimmed">{config.nombre}</Text>
            </div>
          </Group>

          <Stack gap="lg">

            {/* Ficha indicador */}
            <Paper withBorder radius="xl" p="lg" shadow="sm">
              <Group gap={10} mb="sm">
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: semColor, flexShrink: 0, marginTop: 4,
                }} />
                <div>
                  <Text size="xs" fw={700} c="dimmed">{indicador.codigo}</Text>
                  <Text fw={700} size="md">{indicador.nombre}</Text>
                </div>
              </Group>
              <div style={{
                display: "flex", gap: 0, borderRadius: 12,
                overflow: "hidden", border: "1px solid #ede9fe", background: "#faf8ff",
              }}>
                {[
                  { label: `Meta ${config.anio_fin}`, value: String(indicador.meta_final_2029 ?? "—") },
                  { label: "Seguimiento", value: indicador.tipo_seguimiento || "Semestral" },
                  { label: "Avance actual", value: `${avanceActual}%` },
                ].map((s, i, arr) => (
                  <div key={s.label} style={{
                    flex: 1, padding: "10px 14px",
                    borderRight: i < arr.length - 1 ? "1px solid #ede9fe" : "none",
                  }}>
                    <Text size="xs" fw={600} c="violet.6">{s.label}</Text>
                    <Text size="md" fw={600} c="dimmed" mt={2} style={{ textTransform: "capitalize" }}>{s.value}</Text>
                  </div>
                ))}
              </div>
            </Paper>

            {/* Banner enviado */}
            {(bloqueado || tieneFormulariosRechazados) && (
              <Paper withBorder radius="xl" p="md"
                style={{
                  background: tieneFormulariosRechazados ? "rgba(239,68,68,0.06)" : "rgba(13,148,136,0.06)",
                  borderColor: tieneFormulariosRechazados ? "#ef4444" : "#0d9488",
                  borderLeft: `4px solid ${tieneFormulariosRechazados ? "#ef4444" : "#0d9488"}`,
                }}>
                <Group gap={8}>
                  <IconLock size={18} color={tieneFormulariosRechazados ? "#ef4444" : "#0d9488"} />
                  <Text fw={700} c={tieneFormulariosRechazados ? "red" : "teal"}>
                    {tieneFormulariosRechazados
                      ? "Reporte rechazado. Revisa las observaciones del líder, ajusta el formulario y vuelve a enviarlo."
                      : (todosLosEnviadosAprobados || (autoAprobadoUsuario && todosEnviados))
                        ? "Reporte enviado y aprobado."
                        : "Reporte enviado. El líder del macroproyecto revisará y avalará tu evidencia."}
                  </Text>
                </Group>
              </Paper>
            )}

            {/* Avance por periodo */}
            <div>
              <Title order={5} mb="sm">Avance por periodo</Title>
              {indicador.periodos.length === 0 ? (
                <Paper withBorder radius="lg" p="md">
                  <Text size="sm" c="dimmed" ta="center">Sin periodos registrados</Text>
                </Paper>
              ) : (
                <Stack gap="sm">
                  {indicador.periodos
                    .filter((p: Periodo) => mostrarTodosPeriodos || esPeriodoEditable(p.periodo, cortesVigentes))
                    .map((p: Periodo) => {
                    // Si usuarioEligioReportarAvance = false: bloquear TODO (usuario dijo "no por ahora")
                    // Si usuarioEligioReportarAvance = true: solo desbloquear vigentes (usuario dijo "sí reportar")
                    // Si mostrarTodosPeriodos = true pero usuarioEligioReportarAvance = true: todavía bloquear (no es vigente)
                    const editable = usuarioEligioReportarAvance && esPeriodoEditable(p.periodo, cortesVigentes) && !bloqueado;
                    const metaNumerica = p.meta != null ? parseAvance(String(p.meta)) : null;
                    const avanceNumerico = parseAvance(avancesStr[p.periodo] ?? "");
                    const porcentaje = metaNumerica && metaNumerica > 0 && avanceNumerico != null
                      ? Math.min((avanceNumerico / metaNumerica) * 100, 100)
                      : null;
                    const estadoPeriodo = p.estado_reporte ?? null;
                    const periodoAutoAprobado =
                      autoAprobadoUsuario &&
                      !tieneFormulariosRechazados &&
                      (estadoPeriodo === "Aprobado" || estadoPeriodo === "Enviado" || (bloqueado && avanceNumerico != null));
                    const badgeColor =
                      periodoAutoAprobado
                        ? "teal"
                        : estadoPeriodo === "Rechazado"
                          ? "red"
                          : estadoPeriodo === "Enviado"
                            ? "yellow"
                            : editable
                              ? "violet"
                              : "gray";
                    const badgeLabel =
                      periodoAutoAprobado
                        ? "Aprobado"
                        : estadoPeriodo === "Rechazado"
                          ? "Rechazado"
                          : estadoPeriodo === "Enviado"
                            ? "En revisión"
                            : editable
                              ? "Abierto"
                              : "Cerrado";
                    return (
                      <Paper key={p.periodo} withBorder radius="xl" p="md" style={{
                        borderLeft: `4px solid ${editable ? "#7c3aed" : "#cbd5e1"}`,
                        background: editable ? "#fff" : "rgba(248,250,252,0.96)",
                      }}>
                        <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                          <div>
                            <Group gap={8}>
                              <Text size="lg" fw={800}>{p.periodo}</Text>
                              <Badge size="sm" radius="xl" color={badgeColor} variant="light">
                                {badgeLabel}
                              </Badge>
                            </Group>
                            <Text size="sm" c="dimmed" mt={4}>Meta definida: <b>{p.meta ?? "—"}</b></Text>
                          </div>
                          <TextInput
                            label="Avance reportado"
                            placeholder={editable ? "Ej: 1" : ""}
                            value={avancesStr[p.periodo] ?? ""}
                            onChange={(e) => {
                              const nextValue = e?.currentTarget?.value ?? "";
                              if (bloqueado || !editable) return;
                              if (/[^0-9.,%\s]/.test(nextValue)) return;
                              setAvancesStr((prev) => ({ ...prev, [p.periodo]: nextValue }));
                            }}
                            style={{ width: 150 }}
                            size="sm"
                            disabled={bloqueado || !editable}
                          />
                        </Group>
                        {porcentaje != null && (
                          <>
                            <Group justify="space-between" mb={4}>
                              <Text size="xs" c="dimmed">Progreso del periodo</Text>
                              <Text size="xs" fw={700}>{Math.round(porcentaje)}%</Text>
                            </Group>
                            <Progress
                              value={porcentaje}
                              color={!editable ? "gray" : porcentaje >= 90 ? "green" : porcentaje >= 60 ? "yellow" : "red"}
                              size="sm"
                              radius="xl"
                            />
                          </>
                        )}
                      </Paper>
                    );
                  })}
                  {indicador.periodos.some((p: Periodo) => !esPeriodoEditable(p.periodo, cortesVigentes)) && (
                    <Button
                      variant="subtle"
                      color="violet"
                      size="xs"
                      radius="xl"
                      onClick={() => setMostrarTodosPeriodos(v => !v)}
                      leftSection={mostrarTodosPeriodos ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
                    >
                      {mostrarTodosPeriodos ? "Ocultar otras metas" : "Ver próximas metas"}
                    </Button>
                  )}
                </Stack>
              )}
            </div>

            {corteActivo && usuarioEligioReportarAvance && (<>
            <Divider />

            {/* Resumen del período vigente */}
            <div>
              
              {/* Debug logs */}
              {(() => {
                console.log("🔍 DEBUG Vigente - corteActivo:", corteActivo);
                console.log("🔍 DEBUG Vigente - periodoActivo:", periodoActivo);
                console.log("🔍 DEBUG Vigente - usuarioEligioReportarAvance:", usuarioEligioReportarAvance);
                return null;
              })()}
              
              {/* Tarjeta del período vigente - mismo diseño que los demás */}
              {periodoActivo ? (() => {
                const metaNumerica = periodoActivo.meta != null ? parseAvance(String(periodoActivo.meta)) : null;
                const avanceNumerico = parseAvance(avancesStr[periodoActivo.periodo] ?? "");
                const pct = metaNumerica && metaNumerica > 0 && avanceNumerico != null
                  ? Math.min((avanceNumerico / metaNumerica) * 100, 100)
                  : null;
                console.log("🔍 DEBUG Card - meta:", metaNumerica, "avance:", avanceNumerico, "pct:", pct);
                return (
                  <Paper withBorder radius="xl" p="md" mb="lg" style={{
                    borderLeft: `4px solid #7c3aed`,
                    background: "#fff",
                  }}>
                    <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                      <div>
                        <Group gap={8}>
                          <Text size="lg" fw={800}>{periodoActivo.periodo}</Text>
                          <Badge size="sm" radius="xl" color="violet" variant="light">
                            Abierto
                          </Badge>
                        </Group>
                        <Text size="sm" c="dimmed" mt={4}>Meta definida: <b>{periodoActivo.meta ?? "—"}</b></Text>
                      </div>
                      <TextInput
                        label="Avance reportado"
                        placeholder="Ej: 50"
                        value={avancesStr[periodoActivo.periodo] ?? ""}
                        onChange={(e) => {
                          const nextValue = e?.currentTarget?.value ?? "";
                          if (/[^0-9.,%\s]/.test(nextValue)) return;
                          setAvancesStr((prev) => ({ ...prev, [periodoActivo.periodo]: nextValue }));
                        }}
                        style={{ width: 150 }}
                        size="sm"
                      />
                    </Group>
                    {pct != null && (
                      <>
                        <Group justify="space-between" mb={4}>
                          <Text size="xs" c="dimmed">Progreso del periodo</Text>
                          <Text size="xs" fw={700}>{Math.round(pct)}%</Text>
                        </Group>
                        <Progress
                          value={pct}
                          color={pct >= 90 ? "green" : pct >= 60 ? "yellow" : "red"}
                          size="sm"
                          radius="xl"
                        />
                      </>
                    )}
                  </Paper>
                );
              })() : (
                <Paper withBorder radius="xl" p="md" mb="lg" style={{
                  background: "rgba(248,250,252,0.96)",
                }}>
                  <Text size="sm" c="dimmed">El período {corteActivo} no tiene datos disponibles</Text>
                </Paper>
              )}
            </div>

            <Divider />

            {/* Formulario de evidencias */}
            <div>
              <Group gap={8} mb="md">
                <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                  <IconForms size={16} />
                </ThemeIcon>
                <div>
                  <Title order={5}>Formulario de evidencias</Title>
                  <Text size="xs" c="dimmed">
                    {corteActivo ? `Corte activo: ${corteActivo}` : mostrarTodosPeriodos ? "Selecciona un período y completa las evidencias" : "Completa las evidencias del indicador"}
                  </Text>
                </div>
              </Group>

              {loadingForms ? (
                <Center py="md"><Loader size="sm" /></Center>
              ) : formularios.length === 0 ? (
                <Paper withBorder radius="xl" p="xl">
                  <Center>
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={48} radius="xl" color="gray" variant="light">
                        <IconForms size={24} />
                      </ThemeIcon>
                      <Text fw={600} c="dimmed">Sin formularios asignados</Text>
                    </Stack>
                  </Center>
                </Paper>
              ) : (
                <Stack gap="lg">
                  {formularios.map(form => {
                    const resp = respuestas[form._id];
                    const enviado = resp?.estado === "Enviado";
                    const autoAprobadoFormulario =
                      autoAprobadoUsuario &&
                      resp?.estado === "Enviado" &&
                      resp?.estado_aval !== "Rechazado";
                    const estadoAval = resp?.estado_aval ?? (autoAprobadoFormulario ? "Aprobado" : enviado ? "Pendiente" : null);
                    const fechaAval = formatFechaCorta(resp?.aval_fecha);
                    const fechaEnvio = formatFechaCorta(resp?.fecha_envio);
                    const documentosAdjuntos = getDocumentosEvidencia(resp);
                    const totalEvidencias = getDocumentosTotalSize(documentosAdjuntos);
                    const porcentajeCapacidad = Math.min((totalEvidencias / MAX_EVIDENCE_TOTAL_SIZE) * 100, 100);
                    return (
                      <Stack key={form._id} gap="sm">
                        <Paper withBorder radius="xl" p="lg"
                        style={{
                          borderLeft: `4px solid ${
                            estadoAval === "Rechazado"
                              ? "#ef4444"
                              : estadoAval === "Aprobado"
                                ? "#16a34a"
                                : enviado
                                  ? "#0d9488"
                                  : "#7c3aed"
                          }`,
                        }}>
                        <Group justify="space-between" mb="md">
                          <Text fw={700} size="md">{form.nombre}</Text>
                          <Group gap={8}>
                            <Badge
                              color={
                                autoAprobadoFormulario ? "teal"
                                : estadoAval === "Rechazado" ? "red"
                                : enviado ? "teal"
                                : resp ? "yellow"
                                : "gray"
                              }
                              variant="light"
                            >
                              {autoAprobadoFormulario ? "Aprobado"
                                : estadoAval === "Rechazado" ? "Rechazado — corrige y reenvía"
                                : enviado ? "Enviado"
                                : resp ? "Borrador"
                                : "Sin responder"}
                            </Badge>
                          </Group>
                        </Group>
                        {(resp?.estado === "Enviado" || resp?.estado_aval === "Rechazado") && (
                          <Paper
                            withBorder
                            radius="md"
                            p="sm"
                            mb="md"
                            style={{
                              background:
                                estadoAval === "Rechazado"
                                  ? "rgba(254,242,242,0.95)"
                                  : estadoAval === "Aprobado"
                                    ? "rgba(240,253,244,0.95)"
                                    : "rgba(255,251,235,0.95)",
                              borderColor:
                                estadoAval === "Rechazado"
                                  ? "#fecaca"
                                  : estadoAval === "Aprobado"
                                    ? "#bbf7d0"
                                    : "#fde68a",
                            }}
                          >
                            <Stack gap={6}>
                              <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
                                <Stack gap={6} style={{ flex: 1, minWidth: 220 }}>
                                  <Text size="sm" fw={700}>
                                    {estadoAval === "Aprobado"
                                      ? "Evaluación del líder: Aprobado"
                                      : estadoAval === "Rechazado"
                                        ? "Evaluación del líder: Rechazado"
                                        : "Evaluación del líder: En revisión"}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {fechaEnvio ? `Enviado el ${fechaEnvio}. ` : ""}
                                    {resp?.aval_por ? `Evaluado por ${resp.aval_por}` : resp?.lider_email_aval ? `Líder asignado: ${resp.lider_email_aval}` : ""}
                                    {fechaAval ? ` · ${fechaAval}` : ""}
                                  </Text>
                                </Stack>
                                {estadoAval === "Aprobado" && resp.word_url && (
                                  <Button
                                    size="xs"
                                    variant="light"
                                    color="blue"
                                    component="a"
                                    href={resp.word_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ flexShrink: 0 }}
                                  >
                                    Descargar Word aprobado
                                  </Button>
                                )}
                              </Group>
                              {estadoAval === "Rechazado" && resp?.aval_razones && resp.aval_razones.length > 0 && (
                                <Stack gap={4}>
                                  <Text size="xs" fw={700} c="red">Razones de rechazo:</Text>
                                  {resp.aval_razones.map((razon, i) => (
                                    <Text key={i} size="sm" c="red">
                                      • {formatRazonRechazo(razon, resp.aval_otro_cual)}
                                    </Text>
                                  ))}
                                </Stack>
                              )}
                              {resp?.aval_comentario && (
                                <Text size="sm">{resp.aval_comentario}</Text>
                              )}
                              {estadoAval === "Rechazado" && (
                                <Text size="sm" c="red" fw={600}>
                                  El líder rechazó este envío. Corrige el formulario y sube nuevas evidencias — los archivos anteriores serán reemplazados automáticamente al subir nuevos.
                                </Text>
                              )}
                            </Stack>
                          </Paper>
                        )}
                        <Stack gap="sm">
                          {form.campos.map(campo => {
                            if (!shouldShowCampo(campo)) return null;
                            const archivoCampo = getRespuestaCampo(form._id, campo._id);
                            const maxChars = getMaxCaracteres(campo);
                            const currentLen = getTexto(form._id, campo._id).length;
                            const selectedValues = getSelectValues(form._id, campo._id);
                            const comentarioKey = `${form._id}-${campo._id}`;
                            const comentarioResuelto = Boolean(archivoCampo?.comentario_lider_resuelto);
                            return (
                              <Paper key={campo._id} withBorder radius="md" p="md"
                                style={{ background: bloqueado ? "rgba(248,250,252,0.8)" : "#fff" }}>
                                {campo.tipo !== "checkbox" && (
                                  <>
                                    <Group gap={6} mb={6}>
                                      <Text size="sm" fw={700}>{campo.etiqueta}</Text>
                                      {campo.requerido && <Badge size="xs" color="red" variant="dot">Requerido</Badge>}
                                    </Group>
                                    {campo.descripcion && (
                                      <Text size="xs" c="dimmed" mb={8}>{campo.descripcion}</Text>
                                    )}
                                  </>
                                )}

                                {campo.tipo === "texto_largo" && (() => {
                                  const minChars = campo.min_caracteres ?? null;
                                  return (
                                    <Stack gap={4}>
                                      <Textarea
                                        placeholder={bloqueado ? "" : "Escribe aquí..."}
                                        value={getTexto(form._id, campo._id)}
                                        onChange={e => !bloqueado && setTexto(form._id, campo._id, e.currentTarget.value)}
                                        rows={4} disabled={bloqueado} autosize minRows={3}
                                        maxLength={maxChars ?? undefined}
                                        error={
                                          !bloqueado && campo.requerido && currentLen === 0
                                            ? "Este campo es obligatorio"
                                            : !bloqueado && maxChars && currentLen > maxChars
                                            ? `Has superado el máximo de ${maxChars} caracteres`
                                            : undefined
                                        }
                                      />
                                      {(minChars || maxChars) && (
                                        <Text size="xs" ta="right"
                                          c={
                                            (maxChars && currentLen > maxChars) ? "red" :
                                            (minChars && currentLen > 0 && currentLen < minChars) ? "orange" : "dimmed"
                                          }>
                                          {minChars && currentLen < minChars
                                            ? `Mínimo ${minChars} caracteres · ${currentLen} escritos`
                                            : minChars && maxChars
                                            ? `${currentLen} / ${maxChars} (mín: ${minChars})`
                                            : maxChars
                                            ? `${currentLen} / ${maxChars}`
                                            : `${currentLen} caracteres`}
                                        </Text>
                                      )}
                                    </Stack>
                                  );
                                })()}

                                {campo.tipo === "texto_corto" && (() => {
                                  const minChars = campo.min_caracteres ?? null;
                                  return (
                                    <Stack gap={4}>
                                      <TextInput
                                        placeholder={bloqueado ? "" : "Escribe aquí..."}
                                        value={getTexto(form._id, campo._id)}
                                        onChange={e => !bloqueado && setTexto(form._id, campo._id, e.currentTarget.value)}
                                        disabled={bloqueado}
                                        maxLength={maxChars ?? undefined}
                                      />
                                      {(minChars || maxChars) && (
                                        <Text size="xs" ta="right"
                                          c={
                                            (maxChars && currentLen > maxChars) ? "red" :
                                            (minChars && currentLen > 0 && currentLen < minChars) ? "orange" : "dimmed"
                                          }>
                                          {minChars && currentLen < minChars
                                            ? `Mínimo ${minChars} caracteres · ${currentLen} escritos`
                                            : minChars && maxChars
                                            ? `${currentLen} / ${maxChars} (mín: ${minChars})`
                                            : maxChars
                                            ? `${currentLen} / ${maxChars}`
                                            : `${currentLen} caracteres`}
                                        </Text>
                                      )}
                                    </Stack>
                                  );
                                })()}

                                {campo.tipo === "select" && (
                                  <Stack gap={6}>
                                    <Select
                                      placeholder="Selecciona una opción..."
                                      value={getTexto(form._id, campo._id) || null}
                                      onChange={val => !bloqueado && setTexto(form._id, campo._id, val ?? "")}
                                      data={(campo.opciones ?? []).map(op => ({ value: op, label: op }))}
                                      disabled={bloqueado} clearable
                                    />
                                    {getTexto(form._id, campo._id) && (() => {
                                      const jMin = campo.justificacion_min_caracteres ?? null;
                                      const jMax = campo.justificacion_max_caracteres ?? null;
                                      const jLen = getJustificacion(form._id, campo._id).length;
                                      return (
                                        <Stack gap={2}>
                                          <Textarea
                                            placeholder="Justifica tu respuesta..."
                                            label="Justificación"
                                            description={campo.justificacion_descripcion || undefined}
                                            value={getJustificacion(form._id, campo._id)}
                                            onChange={e => !bloqueado && setJustificacion(form._id, campo._id, e.currentTarget.value)}
                                            disabled={bloqueado}
                                            minRows={2}
                                            autosize
                                            minLength={jMin ?? undefined}
                                            maxLength={jMax ?? undefined}
                                          />
                                          {(jMin || jMax) && (
                                            <Text size="xs" ta="right" c={jMax && jLen > jMax ? "red" : jMin && jLen > 0 && jLen < jMin ? "orange" : "dimmed"}>
                                              {jMin && jLen < jMin
                                              ? `Mínimo ${jMin} caracteres · ${jLen} escritos`
                                              : jMin && jMax
                                              ? `${jLen} / ${jMax} (mín: ${jMin})`
                                              : jMax
                                              ? `${jLen} / ${jMax}`
                                              : `${jLen} caracteres`}
                                            </Text>
                                          )}
                                        </Stack>
                                      );
                                    })()}
                                  </Stack>
                                )}

                                {campo.tipo === "select_con_otro" && (
                                  <Stack gap={6}>
                                    <Select
                                      placeholder="Selecciona una opción..."
                                      value={getTexto(form._id, campo._id) || null}
                                      onChange={val => {
                                        if (!bloqueado) {
                                          setTexto(form._id, campo._id, val ?? "");
                                          if (val !== "Otro") setOtroTexto(form._id, campo._id, "");
                                        }
                                      }}
                                      data={[
                                        ...(campo.opciones ?? []).map(op => ({ value: op, label: op })),
                                        { value: "Otro", label: "Otro ¿Cuál?" },
                                      ]}
                                      disabled={bloqueado} clearable
                                    />
                                    {getTexto(form._id, campo._id) === "Otro" && (
                                      <TextInput
                                        label='Especifica "Otro ¿Cuál?"'
                                        placeholder="Escribe aquí..."
                                        value={getOtroTexto(form._id, campo._id)}
                                        onChange={e => !bloqueado && setOtroTexto(form._id, campo._id, e.currentTarget.value)}
                                        disabled={bloqueado}
                                      />
                                    )}
                                    {getTexto(form._id, campo._id) && (() => {
                                      const jMin = campo.justificacion_min_caracteres ?? null;
                                      const jMax = campo.justificacion_max_caracteres ?? null;
                                      const jLen = getJustificacion(form._id, campo._id).length;
                                      return (
                                        <Stack gap={2}>
                                          <Textarea
                                            placeholder="Justifica tu respuesta..."
                                            label="Justificación"
                                            description={campo.justificacion_descripcion || undefined}
                                            value={getJustificacion(form._id, campo._id)}
                                            onChange={e => !bloqueado && setJustificacion(form._id, campo._id, e.currentTarget.value)}
                                            disabled={bloqueado}
                                            minRows={2}
                                            autosize
                                            minLength={jMin ?? undefined}
                                            maxLength={jMax ?? undefined}
                                          />
                                          {(jMin || jMax) && (
                                            <Text size="xs" ta="right" c={jMax && jLen > jMax ? "red" : jMin && jLen > 0 && jLen < jMin ? "orange" : "dimmed"}>
                                              {jMin && jLen < jMin
                                              ? `Mínimo ${jMin} caracteres · ${jLen} escritos`
                                              : jMin && jMax
                                              ? `${jLen} / ${jMax} (mín: ${jMin})`
                                              : jMax
                                              ? `${jLen} / ${jMax}`
                                              : `${jLen} caracteres`}
                                            </Text>
                                          )}
                                        </Stack>
                                      );
                                    })()}
                                  </Stack>
                                )}

                                {campo.tipo === "select_multiple" && (
                                  <Stack gap={6}>
                                    <MultiSelect
                                      placeholder="Selecciona una o varias opciones..."
                                      value={selectedValues}
                                      onChange={values => !bloqueado && setSelectValues(form._id, campo._id, values)}
                                      data={(campo.opciones ?? []).map(op => ({ value: op, label: op }))}
                                      disabled={bloqueado} clearable
                                    />
                                    {selectedValues.length > 0 && (() => {
                                      const jMin = campo.justificacion_min_caracteres ?? null;
                                      const jMax = campo.justificacion_max_caracteres ?? null;
                                      const jLen = getJustificacion(form._id, campo._id).length;
                                      return (
                                        <Stack gap={2}>
                                          <Textarea
                                            placeholder="Justifica tu respuesta..."
                                            label="Justificación"
                                            description={campo.justificacion_descripcion || undefined}
                                            value={getJustificacion(form._id, campo._id)}
                                            onChange={e => !bloqueado && setJustificacion(form._id, campo._id, e.currentTarget.value)}
                                            disabled={bloqueado}
                                            minRows={2}
                                            autosize
                                            minLength={jMin ?? undefined}
                                            maxLength={jMax ?? undefined}
                                          />
                                          {(jMin || jMax) && (
                                            <Text size="xs" ta="right" c={jMax && jLen > jMax ? "red" : jMin && jLen > 0 && jLen < jMin ? "orange" : "dimmed"}>
                                              {jMin && jLen < jMin
                                              ? `Mínimo ${jMin} caracteres · ${jLen} escritos`
                                              : jMin && jMax
                                              ? `${jLen} / ${jMax} (mín: ${jMin})`
                                              : jMax
                                              ? `${jLen} / ${jMax}`
                                              : `${jLen} caracteres`}
                                            </Text>
                                          )}
                                        </Stack>
                                      );
                                    })()}
                                  </Stack>
                                )}

                                {campo.tipo === "select_multiple_con_otro" && (
                                  <Stack gap={6}>
                                    <MultiSelect
                                      placeholder="Selecciona una o varias opciones..."
                                      value={selectedValues}
                                      onChange={values => {
                                        if (!bloqueado) {
                                          setSelectValues(form._id, campo._id, values);
                                          if (!values.includes("Otro")) setOtroTexto(form._id, campo._id, "");
                                        }
                                      }}
                                      data={[
                                        ...(campo.opciones ?? []).map(op => ({ value: op, label: op })),
                                        { value: "Otro", label: "Otro ¿Cuál?" },
                                      ]}
                                      disabled={bloqueado} clearable
                                    />
                                    {selectedValues.includes("Otro") && (
                                      <TextInput
                                        label='Especifica "Otro ¿Cuál?"'
                                        placeholder="Escribe aquí..."
                                        value={getOtroTexto(form._id, campo._id)}
                                        onChange={e => !bloqueado && setOtroTexto(form._id, campo._id, e.currentTarget.value)}
                                        disabled={bloqueado}
                                      />
                                    )}
                                    {selectedValues.length > 0 && (() => {
                                      const jMin = campo.justificacion_min_caracteres ?? null;
                                      const jMax = campo.justificacion_max_caracteres ?? null;
                                      const jLen = getJustificacion(form._id, campo._id).length;
                                      return (
                                        <Stack gap={2}>
                                          <Textarea
                                            placeholder="Justifica tu respuesta..."
                                            label="Justificación"
                                            description={campo.justificacion_descripcion || undefined}
                                            value={getJustificacion(form._id, campo._id)}
                                            onChange={e => !bloqueado && setJustificacion(form._id, campo._id, e.currentTarget.value)}
                                            disabled={bloqueado}
                                            minRows={2}
                                            autosize
                                            minLength={jMin ?? undefined}
                                            maxLength={jMax ?? undefined}
                                          />
                                          {(jMin || jMax) && (
                                            <Text size="xs" ta="right" c={jMax && jLen > jMax ? "red" : jMin && jLen > 0 && jLen < jMin ? "orange" : "dimmed"}>
                                              {jMin && jLen < jMin
                                              ? `Mínimo ${jMin} caracteres · ${jLen} escritos`
                                              : jMin && jMax
                                              ? `${jLen} / ${jMax} (mín: ${jMin})`
                                              : jMax
                                              ? `${jLen} / ${jMax}`
                                              : `${jLen} caracteres`}
                                            </Text>
                                          )}
                                        </Stack>
                                      );
                                    })()}
                                  </Stack>
                                )}

                                {campo.tipo === "checkbox" && (
                                  <Checkbox
                                    label={campo.etiqueta}
                                    description={campo.descripcion}
                                    checked={getTexto(form._id, campo._id) === "true"}
                                    onChange={e => !bloqueado && setTexto(form._id, campo._id, e.currentTarget.checked ? "true" : "false")}
                                    disabled={bloqueado}
                                  />
                                )}

                                {campo.tipo === "archivo_pdf" && (
                                  <Group gap={8}>
                                    {archivoCampo?.url ? (
                                      <Group gap={6}>
                                        <Button size="sm" variant="light" color="blue"
                                          leftSection={<IconExternalLink size={14} />}
                                          component="a" href={archivoCampo.url} target="_blank">
                                          {archivoCampo.nombre_original || "Ver archivo"}
                                        </Button>
                                        {!bloqueado && (
                                          <ActionIcon size="md" variant="subtle" color="red"
                                            onClick={() => handleDeletePDF(form, campo)}>
                                            <IconTrash size={15} />
                                          </ActionIcon>
                                        )}
                                      </Group>
                                    ) : !bloqueado ? (
                                      <FileButton onChange={file => handleUploadPDF(form, campo, file)} accept={EVIDENCE_ACCEPT}>
                                        {props => (
                                          <Button size="sm" variant="light" color="teal"
                                            leftSection={<IconUpload size={14} />}
                                            loading={uploading[`${form._id}-${campo._id}`]}
                                            {...props}>
                                            Subir archivo
                                          </Button>
                                        )}
                                      </FileButton>
                                    ) : (
                                      <Text size="sm" c="dimmed">Sin archivo adjunto</Text>
                                    )}
                                  </Group>
                                )}

                                {estadoAval === "Rechazado" && archivoCampo?.comentario_lider?.trim() && (
                                  <Paper
                                    withBorder
                                    radius="md"
                                    p="sm"
                                    mt="sm"
                                    style={{
                                      background: comentarioResuelto ? "rgba(240,253,244,0.95)" : "rgba(254,242,242,0.95)",
                                      borderColor: comentarioResuelto ? "#bbf7d0" : "#fecaca",
                                    }}
                                  >
                                    <Group justify="space-between" align="flex-start" gap="sm" mb={3}>
                                      <Text size="xs" fw={700} c={comentarioResuelto ? "teal" : "red"}>
                                        Comentario del lider
                                      </Text>
                                      <Checkbox
                                        size="xs"
                                        color="teal"
                                        label="Resuelto"
                                        checked={comentarioResuelto}
                                        disabled={Boolean(resolvingComentario[comentarioKey])}
                                        onChange={(event) =>
                                          handleToggleComentarioResuelto(form, campo, event.currentTarget.checked)
                                        }
                                      />
                                    </Group>
                                    <Text size="sm" c={comentarioResuelto ? "teal" : "red"} style={{ whiteSpace: "pre-wrap" }}>
                                      {archivoCampo.comentario_lider}
                                    </Text>
                                  </Paper>
                                )}
                              </Paper>
                            );
                          })}
                        </Stack>
                      </Paper>

                      <div>
                        <Group gap={8} mb="md">
                          <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                            <IconUpload size={16} />
                          </ThemeIcon>
                          <div>
                            <Title order={5}>Evidencias</Title>
                            <Text size="xs" c="dimmed">Uno o varios archivos para revisión</Text>
                          </div>
                        </Group>
                        <Paper
                          withBorder
                          radius="xl"
                          p="lg"
                          style={{ background: "rgba(124,58,237,0.04)", borderColor: "#ede9fe" }}
                        >
                          <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
                            <div>
                              <Group gap={6} mb={4} justify="space-between" wrap="nowrap">
                                <Group gap={6}>
                                  <ThemeIcon size={24} radius="xl" color="violet" variant="light">
                                    <IconUpload size={13} />
                                  </ThemeIcon>
                                  <Text size="sm" fw={700}>Archivo de evidencias</Text>
                                  <Badge size="xs" color="red" variant="dot">Requerido</Badge>
                                </Group>
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color="yellow"
                                  title="Cómo nombrar los archivos"
                                  onClick={() => setNamingGuideOpen(true)}
                                >
                                  <IconBulb size={16} />
                                </ActionIcon>
                              </Group>
                              <Stack gap={4}>
                                <Text size="xs" c="dimmed">{EVIDENCE_HELP_TEXT_REQUESTED}</Text>
                                <Text size="xs" c="dimmed">{EVIDENCE_HELP_TEXT_2_REQUESTED}</Text>
                                <Text size="xs" c="dimmed">{EVIDENCE_HELP_TEXT_3}</Text>
                                <Text size="xs" c="dimmed">
                                  Formatos permitidos: <b>PDF, Excel (.xlsx, .xls), im&aacute;genes de alta resoluci&oacute;n (.jpg, .jpeg, .png, .tif), comprimidos (.zip, .rar) y enlaces institucionales</b>
                                </Text>
                              </Stack>
                            </div>

                            <Stack gap="xs" w="100%" mt="sm">
                              <Paper withBorder radius="md" p="xs" style={{ borderColor: "#ede9fe", background: "#fff" }}>
                                <Group justify="space-between" mb={6}>
                                  <Text size="xs" fw={700}>Peso total de evidencias</Text>
                                  <Text size="xs" fw={700}>{formatFileSize(totalEvidencias) || "0 KB"} / 10 MB</Text>
                                </Group>
                                <Progress
                                  value={porcentajeCapacidad}
                                  color={porcentajeCapacidad >= 90 ? "red" : porcentajeCapacidad >= 70 ? "yellow" : "violet"}
                                  size="sm"
                                  radius="xl"
                                />
                              </Paper>

                              {documentosAdjuntos.length > 0 && (
                                <Stack gap={6}>
                                  {documentosAdjuntos.map((doc, index) => (
                                    <Paper
                                      key={doc._id ?? `${doc.url}-${index}`}
                                      withBorder
                                      radius="md"
                                      p="xs"
                                      style={{ borderColor: "#ede9fe", background: "#faf5ff" }}
                                    >
                                      <Group gap={8} align="center" wrap="nowrap">
                                        <ThemeIcon size={32} radius="md" color="violet" variant="light" style={{ flexShrink: 0 }}>
                                          <IconForms size={16} />
                                        </ThemeIcon>
                                        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                                          <Text
                                            size="xs"
                                            fw={600}
                                            truncate="end"
                                            title={doc.nombre_original || doc.filename || `Evidencia ${index + 1}`}
                                          >
                                            {doc.nombre_original || doc.filename || `Evidencia ${index + 1}`}
                                          </Text>
                                          <Text size="xs" c="dimmed">
                                            Peso: {formatFileSize(doc.size) || "no disponible"}
                                            {doc.url && doc.url.includes("drive.google") ? " · Drive" : ""}
                                          </Text>
                                        </Stack>
                                        <Group gap={4} style={{ flexShrink: 0 }}>
                                          {doc.url && (
                                            <ActionIcon
                                              size="sm"
                                              variant="subtle"
                                              color="violet"
                                              component="a"
                                              href={doc.url}
                                              target="_blank"
                                              rel="noreferrer"
                                            >
                                              <IconExternalLink size={13} />
                                            </ActionIcon>
                                          )}
                                          {!bloqueado && (
                                            <ActionIcon
                                              size="sm"
                                              variant="subtle"
                                              color="red"
                                              onClick={() => handleDeleteDocumento(form, doc)}
                                            >
                                              <IconTrash size={13} />
                                            </ActionIcon>
                                          )}
                                        </Group>
                                      </Group>
                                    </Paper>
                                  ))}
                                </Stack>
                              )}

                              {bloqueado && documentosAdjuntos.length === 0 && (
                                <Text size="sm" c="dimmed">Sin evidencia adjunta</Text>
                              )}

                              {!bloqueado && (
                                <FileButton
                                  multiple
                                  onChange={files => handleUploadDocumento(form, files)}
                                  accept={EVIDENCE_ACCEPT}
                                >
                                  {props => (
                                    <Button
                                      size="sm"
                                      variant="light"
                                      color="violet"
                                      radius="xl"
                                      loading={uploadingDocumento[form._id]}
                                      leftSection={<IconUpload size={13} />}
                                      fullWidth
                                      {...props}
                                    >
                                      Subir evidencia
                                    </Button>
                                  )}
                                </FileButton>
                              )}
                            </Stack>
                          </Group>
                        </Paper>
                      </div>
                    </Stack>
                    );
                  })}
                </Stack>
              )}
            </div>

            {/* Botones únicos al final */}
            {!bloqueado && formularios.length > 0 && (
              <Paper withBorder radius="xl" p="lg"
                style={{ background: "rgba(124,58,237,0.03)", borderColor: "#ede9fe" }}>
                <Text size="sm" c="dimmed" mb="md" ta="center">
                  {tieneFormulariosRechazados
                    ? "Tu envío fue rechazado. Corrige la información, actualiza los avances y vuelve a enviarlo para una nueva revisión."
                    : "Guarda los cambios para continuar después, o envía el reporte cuando todo esté listo."}
                  <b>
                    {tieneFormulariosRechazados
                      ? " Cuando vuelvas a enviarlo, el líder del macroproyecto recibirá nuevamente tu reporte."
                      : " Una vez enviado, el líder del macroproyecto recibirá tu reporte para revisión."}
                  </b>
                </Text>
                {!puedeEnviarTodo && (() => {
                  const erroresDetalle: string[] = [];
                  if (!hayPeriodosEditables) {
                    erroresDetalle.push("No hay un corte activo para reportar.");
                  }
                  if (periodosEditablesSinAvance.length > 0) {
                    erroresDetalle.push(`Registra el avance del corte: ${periodosEditablesSinAvance.map(p => p.periodo).join(", ")}.`);
                  }
                  formularios.forEach(form => {
                    form.campos.forEach(campo => {
                      if (!shouldShowCampo(campo)) return;
                      const maxChars = getMaxCaracteres(campo);
                      const currentLen = getTexto(form._id, campo._id).trim().length;
                      if (campo.requerido && currentLen === 0) {
                        erroresDetalle.push(`"${campo.etiqueta}" está vacío (obligatorio).`);
                      } else if (maxChars && currentLen > maxChars) {
                        erroresDetalle.push(`"${campo.etiqueta}": tienes ${currentLen} caracteres, el máximo permitido es ${maxChars}.`);
                      }
                      if (["select", "select_con_otro", "select_multiple", "select_multiple_con_otro"].includes(campo.tipo)) {
                        const sel = getTexto(form._id, campo._id);
                        if (sel && !getJustificacion(form._id, campo._id).trim()) {
                          erroresDetalle.push(`"${campo.etiqueta}": debes justificar tu respuesta.`);
                        }
                      }
                    });
                  });
                  formulariosSinDocumento.forEach((form: FormularioPDI) => {
                    erroresDetalle.push(`Adjunta al menos una evidencia en "${form.nombre}".`);
                  });
                  formulariosConEvidenciasPesadas.forEach((form: FormularioPDI) => {
                    erroresDetalle.push(`El peso total de evidencias en "${form.nombre}" supera 10 MB.`);
                  });
                  return (
                    <Paper
                      withBorder radius="md" p="sm" mb="md"
                      style={{ background: "rgba(254,242,242,0.95)", borderColor: "#fecaca" }}
                    >
                      <Text size="sm" c="red" fw={700} mb={erroresDetalle.length > 1 ? 6 : 0}>
                        Para poder enviar, corrige lo siguiente:
                      </Text>
                      {erroresDetalle.map((err, i) => (
                        <Text key={i} size="sm" c="red" mt={4}>
                          • {err}
                        </Text>
                      ))}
                    </Paper>
                  );
                })()}
                <Group justify="center" gap="md">
                  <Button
                    variant="default"
                    radius="xl"
                    loading={savingDraft}
                    disabled={sending || !hayPeriodosEditables}
                    onClick={handleGuardarBorrador}
                  >
                    Guardar
                  </Button>
                  <Button
                    color="violet"
                    radius="xl"
                    size="md"
                    loading={sending}
                    disabled={savingDraft || !puedeEnviarTodo}
                    leftSection={<IconCheck size={16} />}
                    onClick={handleEnviarTodo}
                  >
                    Enviar
                  </Button>
                </Group>
              </Paper>
            )}
            </>)}

          </Stack>
        </Container>
      </div>

      {/* Modal para períodos atrasados sin datos */}
      <Modal
        opened={mostrarModalPeriodoAtrasado}
        onClose={() => setMostrarModalPeriodoAtrasado(false)}
        centered
        size="md"
        radius="xl"
        title={
          <Group gap="sm">
            <ThemeIcon size={32} radius="xl" color="orange" variant="light">
              <IconBulb size={16} />
            </ThemeIcon>
            <div>
              <Text fw={700}>Reportar avance</Text>
            </div>
          </Group>
        }
      >
        <Stack gap="md">
          {/* Si hay corte activo sin meta, ofrecer reportar avance */}
          {corteActivo && periodosAtrasados.length > 0 && (
            <>
              <Paper withBorder radius="lg" p="md" style={{ background: "rgba(251,146,60,0.06)" }}>
                <Group gap="sm" align="flex-start">
                  <ThemeIcon size={24} radius="md" color="orange" variant="light">
                    <IconAlertCircle size={14} />
                  </ThemeIcon>
                  <Stack gap={2} style={{ flex: 1 }}>
                    <Text size="sm" fw={700} c="orange.7">Período vigente sin meta definida</Text>
                    <Text size="xs" c="dimmed">
                      El período {corteActivo} está activo pero no tiene una meta definida en el indicador.
                    </Text>
                  </Stack>
                </Group>
              </Paper>

              <Stack gap="xs">
                <Text size="sm" fw={600}>¿Deseas reportar avance para este período?</Text>
                <Text size="xs" c="dimmed">
                  Puedes reportar avance aunque no tengas una meta definida. El avance se registrará como información adicional.
                </Text>
              </Stack>

              <Group justify="flex-end" gap="md">
                <Button
                  variant="default"
                  radius="xl"
                  onClick={() => {
                    setMostrarModalPeriodoAtrasado(false);
                    setUsuarioEligioReportarAvance(false); // Usuario dice "no", mostrar todos los períodos
                    setMostrarTodosPeriodos(true);
                  }}
                >
                  No por ahora
                </Button>
                <Button
                  color="blue"
                  radius="xl"
                  leftSection={<IconUpload size={14} />}
                  onClick={() => {
                    setMostrarModalPeriodoAtrasado(false);
                    setUsuarioEligioReportarAvance(true); // Usuario dice "sí", mostrar solo el vigente
                    setMostrarTodosPeriodos(false);
                  }}
                >
                  Sí, reportar avance
                </Button>
              </Group>
            </>
          )}
          {/* Caso futuro: Si NO hay corte activo (no mostrar nada por ahora) */}
        </Stack>
      </Modal>
    </div>
  );
}

