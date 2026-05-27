"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import {
  Modal, Stack, Group, Button, Text, Paper, Select, TextInput,
  SimpleGrid, Notification, Badge, Divider, Box, Anchor,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { dateParserEspanol, inputFechaAISO } from "../utils/parseFlexibleDate";
import axios from "axios";
import type { Dependency, Program, Process } from "../types";
import {
  PERIODICIDAD_ADMISION,
  etiquetaSubtipoCompacta,
  SUBTIPO_MODIFICACION_REFORMA_LABEL,
  stylesSubtipoLargo,
} from "../constants";
import { procesoRcActivoDePrograma } from "../utils/procesoRcUnico";
import { getResolucionRcParaAltaProceso } from "../utils/resolucionVigentePrograma";
import { programCodeKey } from "../utils/programCode";
import {
  programaConNombreDuplicado,
  MENSAJE_NOMBRE_PROGRAMA_DUPLICADO,
} from "../utils/nombreProgramaUnico";

/* ─── Definición de subtipos ─────────────────────────────────────────────── */
const SUBTIPOS_RC = [
  {
    key: "Nuevo",
    titulo: "Nuevo",
    desc: "Programa nuevo sin resolución vigente. Las fechas quedan en blanco y son editables.",
  },
  {
    key: "Renovación",
    titulo: "Renovación",
    desc: "Renovación normal. Ingresa la resolución vigente y el sistema auto-calcula todas las fechas.",
  },
  {
    key: "No renovación",
    titulo: "No renovación",
    desc: "Proceso permanente en plan de contingencia — solo para subir documentos. Requiere resolución vigente.",
  },
  {
    key: "Renovación + reforma",
    titulo: "Renovación + modificación",
    desc: "Como la renovación normal, con resolución y auto-cálculo de fechas.",
  },
  {
    key: "Reactivación",
    titulo: "Reactivación",
    desc: "Tras una no renovación: solo programas en estado Inactivo y sin otro RC activo. Mismo recorrido que «Nuevo»; al cerrar aprobado el programa vuelve a Activo.",
  },
  {
    key: "Reforma curricular",
    titulo: SUBTIPO_MODIFICACION_REFORMA_LABEL,
    desc: "Sin resolución MEN ni alerta. Las fechas del trámite quedan en blanco para completarlas en la gestión. La constancia se pide al cerrar como aprobado.",
  },
  {
    key: "Registro calificado de oficio",
    titulo: "Registro calificado de oficio",
    desc: "Resolución conferida de oficio (7 años de vigencia). Al crear: fecha, código, PDF y vigencia fija; el sistema calcula el calendario del trámite (solo lectura en gestión), deja la alerta RC completa para la próxima renovación y actualiza la resolución vigente en el programa.",
  },
];

const SUBTIPOS_AV = [
  {
    key: "Nuevo",
    titulo: "Nuevo",
    desc: "Primera acreditación (mismo criterio que «Nuevo» en RC). Sin resolución ni fecha de vencimiento — fechas en blanco y editables.",
  },
  {
    key: "Renovación",
    titulo: "Renovación",
    desc: "Renovación normal. Ingresa la resolución vigente y el sistema auto-calcula todas las fechas.",
  },
  {
    key: "No renovación",
    titulo: "No renovación",
    desc: "Proceso de no renovación. El panel de Información del caso se genera automáticamente.",
  },
  {
    key: "Reactivación",
    titulo: "Reactivación",
    desc: "Recorrido como acreditación nueva (fechas en blanco al crear). Para programas que reabren el trámite AV sin RC activo en curso.",
  },
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
/** Subtipos donde se pide información de resolución */
const NECESITA_RESOLUCION = new Set([
  "Renovación", "No renovación", "Renovación + reforma",
  "Registro calificado de oficio",
]);

/** Subtipos donde las fechas son auto-calculadas (no editables inicialmente) */
const ES_AUTOCALCULO = new Set(["Renovación", "Renovación + reforma", "Registro calificado de oficio"]);

/** Desde recordatorio: programa y tipo fijos; opcionalmente sin subtipo «Nuevo». */
/** Con `soloTipo`: solo el tipo (RC/AV/AE); el usuario elige programa en el paso 2 (p. ej. «Agregar nuevo» en recordatorios). */
export type AgregarProcesoPrefill = {
  tipo?: "RC" | "AV" | "AE";
  programId?: string;
  excluirNuevo?: boolean;
  soloTipo?: boolean;
  /** Solo registrar el programa en el sistema (sin proceso RC/AV). */
  soloCrearPrograma?: boolean;
  /** Elegir AV (subtipo Nuevo) sobre un programa que aún no tenga AV en historial. El RC Nuevo se crea al usar «Crear programa». */
  modoProcesoPrimeraVezTipo?: boolean;
  /** Solo crear RC — Modificacion/Reforma curricular (sin mezclar con alertas ni subtipos de renovación). */
  soloReformaCurricular?: boolean;
  /**
   * Datos de resolución congelados en la alerta (proceso que cerró).
   * Precarga el paso 3 para renovaciones sin volver a pedir lo que ya está en la alerta.
   */
  resolucionDesdeAlerta?: {
    fecha_resolucion: string | null;
    codigo_resolucion: string | null;
    duracion_resolucion: number | null;
  } | null;
  /** Enlaces a PDF(s) de resolución de la alerta o de la ficha programa (solo informativo o previo copia backend). */
  documentos_pdf_resolucion?: { name?: string; view_link: string }[];
  /** Id estable de la fila recordatorio (fuerza remount del modal al abrir desde otra alerta). */
  reminderRowId?: string;
  /**
   * Alerta RC con vigencia de gracia activa: no precargar la resolución del RC anterior;
   * el usuario ingresa la resolución de oficio nueva.
   */
  rcOficioPostAvGracia?: boolean;
};

interface Props {
  opened: boolean;
  onClose: () => void;
  programas: Program[];
  facultades: Dependency[];
  procesos: Process[];
  onCreated: () => Promise<void>;
  /** Navega a la vista del programa para gestionar el proceso RC/AV/AE activo (desde el panel recordatorio). */
  onNavigateToGestion?: (args: {
    programId?: string;
    nombrePrograma: string;
    tipo: "RC" | "AV" | "AE";
    dep_code_programa?: string;
    dep_code_facultad?: string;
  }) => Promise<void> | void;
  /** Si viene desde un recordatorio sin proceso activo: arranca en paso 2 con programa bloqueado. */
  prefillDesdeRecordatorio?: AgregarProcesoPrefill | null;
}

export default function AgregarProcesoModal({
  opened, onClose, programas, facultades, procesos, onCreated, onNavigateToGestion,
  prefillDesdeRecordatorio = null,
}: Props) {

  /* ── Navegación de pasos ── */
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tipo, setTipo] = useState<"RC" | "AV" | "AE" | null>(null);
  const [subtipo, setSubtipo] = useState<string | null>(null);

  /* ── Selección de programa existente ── */
  const [programaId, setProgramaId] = useState<string | null>(null);

  /* ── Datos programa nuevo (RC Nuevo) ── */
  const [nombre, setNombre]                   = useState("");
  /** Código del programa (`dep_code_programa`). Opcional en alta; si está vacío, el sistema relaciona procesos por el id interno hasta que cargues un código en la ficha. */
  const [depCodePrograma, setDepCodePrograma] = useState("");
  const [codigoSnies, setCodigoSnies]         = useState("");
  const [facultad, setFacultad]       = useState<string | null>(null);
  const [modalidad, setModalidad]     = useState<string | null>(null);
  const [nivelAcad, setNivelAcad]     = useState<string | null>(null);
  const [nivelForm, setNivelForm]     = useState<string | null>(null);
  const [numCreditos, setNumCreditos] = useState("");
  const [periodosDuracion, setPeriodosDuracion] = useState("");
  const [numSemestres, setNumSemestres] = useState("");
  const [admision, setAdmision]       = useState<string | null>(null);
  const [numEstud, setNumEstud]       = useState("");

  /** CINE F y NBC (mismo esquema que en la ficha del programa) */
  const [cineCampoAmplio, setCineCampoAmplio]         = useState("");
  const [cineCampoEspecifico, setCineCampoEspecifico] = useState("");
  const [cineCampoDetallado, setCineCampoDetallado]   = useState("");
  const [nbcArea, setNbcArea]                         = useState("");
  const [nbcValor, setNbcValor]                       = useState("");

  /* ── Datos de resolución ── */
  const [fechaRes, setFechaRes]       = useState("");
  const [codigoRes, setCodigoRes]     = useState("");
  const [duracionRes, setDuracionRes] = useState("");

  /* ── PDF de resolución ── */
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  /** Si el usuario quita el PDF de la alerta sin subir otro, no se copia al crear el proceso. */
  const [omitirPdfCopiaAlerta, setOmitirPdfCopiaAlerta] = useState(false);
  const fileInputRef            = useRef<HTMLInputElement>(null);

  /* ── Estado UI ── */
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [excluirSubtipoNuevo, setExcluirSubtipoNuevo] = useState(false);

  const snapKey = (() => {
    const s = prefillDesdeRecordatorio?.resolucionDesdeAlerta;
    if (!s) return "";
    return `${s.codigo_resolucion ?? ""}|${s.fecha_resolucion ?? ""}|${s.duracion_resolucion ?? ""}`;
  })();

  const reminderKey = prefillDesdeRecordatorio?.reminderRowId ?? "";

  const prefillKey = prefillDesdeRecordatorio
    ? prefillDesdeRecordatorio.soloCrearPrograma
      ? "solo-programa"
      : prefillDesdeRecordatorio.modoProcesoPrimeraVezTipo
        ? "primera-vez-tipo"
        : prefillDesdeRecordatorio.soloReformaCurricular
          ? "solo-reforma"
          : prefillDesdeRecordatorio.soloTipo
            ? `solo-${prefillDesdeRecordatorio.tipo ?? ""}`
            : `${prefillDesdeRecordatorio.programId}-${prefillDesdeRecordatorio.tipo}-${!!prefillDesdeRecordatorio.excluirNuevo}-${snapKey}-${reminderKey}`
    : "";

  /** Aplica resolución antes del pintado para evitar parpadeo y estados viejos al reutilizar el modal. */
  const aplicarResolucionDesdePrefill = () => {
    if (prefillDesdeRecordatorio?.rcOficioPostAvGracia) {
      setFechaRes("");
      setCodigoRes("");
      setDuracionRes("7");
      return;
    }
    const desdeAlerta = prefillDesdeRecordatorio?.resolucionDesdeAlerta;
    if (desdeAlerta) {
      const fr = desdeAlerta.fecha_resolucion;
      setFechaRes(fr && String(fr).length >= 10 ? String(fr).slice(0, 10) : (fr ? String(fr).trim() : ""));
      setCodigoRes(desdeAlerta.codigo_resolucion != null ? String(desdeAlerta.codigo_resolucion) : "");
      const dur = desdeAlerta.duracion_resolucion;
      setDuracionRes(dur != null && !Number.isNaN(Number(dur)) ? String(dur) : "");
    } else {
      setFechaRes("");
      setCodigoRes("");
      setDuracionRes("");
    }
  };

  const esSoloCrearPrograma       = !!prefillDesdeRecordatorio?.soloCrearPrograma;
  const esPrimeraVezElegirTipoFlujo = !!prefillDesdeRecordatorio?.modoProcesoPrimeraVezTipo;
  const esSoloReformaCurricular   = !!prefillDesdeRecordatorio?.soloReformaCurricular;

  /** Para el flujo «primera vez»: excluye programas que ya tuvieron ese tipo
   *  (activo, alerta poscierre o cualquier cierre archivado: total_* en la ficha del programa). */
  const programasSinProcesoAV = useMemo(
    () => programas.filter((p) =>
      (p.total_av ?? 0) === 0 &&
      !procesos.some((pr) =>
        pr.program_code === programCodeKey(p) &&
        (pr.tipo_proceso === "AV" || (pr.tipo_proceso === "ALERTA" && pr.alert_para_tipo === "AV"))
      )
    ),
    [programas, procesos]
  );
  const programasSinProcesoRC = useMemo(
    () => programas.filter((p) =>
      (p.total_rc ?? 0) === 0 &&
      !procesos.some((pr) =>
        pr.program_code === programCodeKey(p) &&
        (pr.tipo_proceso === "RC" || (pr.tipo_proceso === "ALERTA" && pr.alert_para_tipo === "RC"))
      )
    ),
    [programas, procesos]
  );

  /* ── Reset total ── */
  /** Código interno del programa: opcional (sin autogenerar). */
  const codigoProgramaParaApi = () => {
    const t = depCodePrograma.trim();
    return t || null;
  };

  const reset = () => {
    setStep(1); setTipo(null); setSubtipo(null); setProgramaId(null);
    setNombre(""); setDepCodePrograma(""); setCodigoSnies(""); setFacultad(null); setModalidad(null);
    setNivelAcad(null); setNivelForm(null); setNumCreditos(""); setPeriodosDuracion(""); setNumSemestres("");
    setAdmision(null); setNumEstud("");
    setCineCampoAmplio(""); setCineCampoEspecifico(""); setCineCampoDetallado("");
    setNbcArea(""); setNbcValor("");
    setFechaRes(""); setCodigoRes(""); setDuracionRes("");
    setPdfFile(null);
    setOmitirPdfCopiaAlerta(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSaving(false); setError(null);
    setExcluirSubtipoNuevo(false);
  };

  useLayoutEffect(() => {
    if (!opened || !prefillDesdeRecordatorio) return;
    if (
      prefillDesdeRecordatorio.soloCrearPrograma ||
      prefillDesdeRecordatorio.modoProcesoPrimeraVezTipo ||
      prefillDesdeRecordatorio.soloTipo ||
      prefillDesdeRecordatorio.soloReformaCurricular
    ) {
      return;
    }
    aplicarResolucionDesdePrefill();
  }, [opened, prefillKey]);

  /** Renovación / renovación+reforma: precargar resolución vigente del programa si no viene de alerta. */
  useEffect(() => {
    if (!opened || !programaId || !subtipo || !ES_AUTOCALCULO.has(subtipo)) return;
    if (prefillDesdeRecordatorio?.reminderRowId || prefillDesdeRecordatorio?.resolucionDesdeAlerta) return;
    const prog = programas.find((p) => p._id === programaId);
    if (!prog) return;
    const res = getResolucionRcParaAltaProceso(prog);
    if (!res) return;
    const fr = res.fecha_resolucion;
    setFechaRes(fr && String(fr).length >= 10 ? String(fr).slice(0, 10) : String(fr).trim());
    setCodigoRes(res.codigo_resolucion);
    setDuracionRes(String(res.duracion_resolucion));
  }, [opened, programaId, subtipo, programas, prefillDesdeRecordatorio?.reminderRowId, prefillDesdeRecordatorio?.resolucionDesdeAlerta]);

  useEffect(() => {
    if (subtipo === "Registro calificado de oficio") {
      setDuracionRes("7");
    }
  }, [subtipo]);

  useEffect(() => {
    if (!opened) return;
    if (prefillDesdeRecordatorio) {
      if (prefillDesdeRecordatorio.soloCrearPrograma) {
        setExcluirSubtipoNuevo(false);
        setTipo(null);
        setSubtipo(null);
        setProgramaId(null);
        setStep(1);
      } else if (prefillDesdeRecordatorio.modoProcesoPrimeraVezTipo) {
        setExcluirSubtipoNuevo(false);
        setTipo("AV");
        setSubtipo("Nuevo");
        setProgramaId(null);
        setStep(1);
      } else if (prefillDesdeRecordatorio.soloReformaCurricular) {
        setExcluirSubtipoNuevo(false);
        setTipo("RC");
        setSubtipo("Reforma curricular");
        setProgramaId(null);
        setStep(3);
      } else if (prefillDesdeRecordatorio.soloTipo) {
        setExcluirSubtipoNuevo(false);
        setTipo(prefillDesdeRecordatorio.tipo ?? null);
        setSubtipo(null);
        setProgramaId(null);
        setStep(2);
      } else if (prefillDesdeRecordatorio.rcOficioPostAvGracia) {
        setExcluirSubtipoNuevo(true);
        setTipo("RC");
        setSubtipo("Registro calificado de oficio");
        setProgramaId(prefillDesdeRecordatorio.programId ?? null);
        setStep(3);
      } else {
        setExcluirSubtipoNuevo(!!prefillDesdeRecordatorio.excluirNuevo);
        setTipo(prefillDesdeRecordatorio.tipo ?? null);
        setSubtipo(null);
        setProgramaId(prefillDesdeRecordatorio.programId ?? null);
        setStep(2);
      }
      setNombre(""); setDepCodePrograma(""); setCodigoSnies(""); setFacultad(null); setModalidad(null);
      setNivelAcad(null); setNivelForm(null); setNumCreditos(""); setPeriodosDuracion(""); setNumSemestres("");
      setAdmision(null); setNumEstud("");
      setCineCampoAmplio(""); setCineCampoEspecifico(""); setCineCampoDetallado("");
      setNbcArea(""); setNbcValor("");
      if (!prefillDesdeRecordatorio.soloReformaCurricular) {
        aplicarResolucionDesdePrefill();
      } else {
        setFechaRes("");
        setCodigoRes("");
        setDuracionRes("");
      }
      setPdfFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(null);
      setSaving(false);
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abrir/cerrar y prefill controlan el arranque
  }, [opened, prefillKey]);

  const handleClose = () => { reset(); onClose(); };

  const payloadClasificacion = () => ({
    cine_f: {
      campo_amplio:     cineCampoAmplio.trim() || null,
      campo_especifico: cineCampoEspecifico.trim() || null,
      campo_detallado:  cineCampoDetallado.trim() || null,
    },
    nbc: {
      area_conocimiento: nbcArea.trim() || null,
      nbc:               nbcValor.trim() || null,
    },
  });

  /** Bloque reutilizado en «Crear programa» y en paso 3 (programa nuevo). */
  const camposClasificacionEnAlta = (
    <>
      <Divider label="Clasificación — CINE F 2013 AC" labelPosition="left" />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <TextInput label="Campo amplio" placeholder="Ej: Ingeniería, industria y construcción"
          value={cineCampoAmplio} onChange={e => setCineCampoAmplio(e.currentTarget.value)} />
        <TextInput label="Campo específico" placeholder="Ej: Ingeniería química"
          value={cineCampoEspecifico} onChange={e => setCineCampoEspecifico(e.currentTarget.value)} />
        <TextInput label="Campo detallado" placeholder="Ej: Ingeniería ambiental"
          value={cineCampoDetallado} onChange={e => setCineCampoDetallado(e.currentTarget.value)} />
      </SimpleGrid>
      <Divider label="Clasificación — NBC (núcleo básico del conocimiento)" labelPosition="left" />
      <SimpleGrid cols={2} spacing="sm">
        <TextInput label="Área de conocimiento" placeholder="Ej: Ingeniería"
          value={nbcArea} onChange={e => setNbcArea(e.currentTarget.value)} />
        <TextInput label="NBC" placeholder="Código o denominación NBC"
          value={nbcValor} onChange={e => setNbcValor(e.currentTarget.value)} />
      </SimpleGrid>
    </>
  );

  const handleCrearSoloPrograma = async () => {
    setError(null);
    if (!nombre.trim()) { setError("El nombre del programa es obligatorio."); return; }
    if (!facultad)       { setError("La facultad es obligatoria."); return; }
    if (programaConNombreDuplicado(programas, nombre)) {
      setError(MENSAJE_NOMBRE_PROGRAMA_DUPLICADO);
      return;
    }
    setSaving(true);
    try {
      const facultadObj = facultades.find(f => f.dep_code === facultad);
      const resProg = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/programs`, {
        nombre: nombre.trim(),
        dep_code_facultad: facultadObj?.dep_code ?? facultad,
        dep_code_programa: codigoProgramaParaApi(),
        codigo_snies: codigoSnies.trim() || null,
        modalidad,
        nivel_academico: nivelAcad,
        nivel_formacion: nivelForm,
        num_creditos: numCreditos ? parseInt(numCreditos) : null,
        periodos_duracion: periodosDuracion.trim() || null,
        num_semestres: numSemestres ? parseInt(numSemestres) : null,
        admision_estudiantes: admision,
        num_estudiantes_saces: numEstud ? parseInt(numEstud) : null,
        ...payloadClasificacion(),
      });
      const created = resProg.data as Program;
      const programCode = programCodeKey(created);
      try {
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/processes`, {
          tipo_proceso: "RC",
          subtipo: "Nuevo",
          program_code: programCode,
        });
      } catch (pe: unknown) {
        const axp = pe as { response?: { data?: { error?: string } } };
        const msgp = axp.response?.data?.error;
        setError(
          msgp
            ? `Programa creado, pero no se pudo crear el proceso RC Nuevo: ${msgp}`
            : "Programa creado, pero no se pudo crear el proceso RC Nuevo. Usa «Agregar proceso» para abrir un RC Nuevo sobre este programa."
        );
        await onCreated();
        return;
      }
      if (onNavigateToGestion) {
        await onNavigateToGestion({
          programId: created._id,
          nombrePrograma: created.nombre?.trim() || nombre.trim(),
          tipo: "RC",
          dep_code_programa: created.dep_code_programa ?? undefined,
          dep_code_facultad: created.dep_code_facultad,
        });
      } else {
        await onCreated();
      }
      handleClose();
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { error?: string } } };
      const msg = ax.response?.data?.error;
      if (ax.response?.status === 409) setError(msg || "Conflicto al crear el programa (código o nombre duplicado).");
      else setError(msg || "Error al crear el programa.");
    } finally {
      setSaving(false);
    }
  };

  /* ── Validar y enviar proceso ── */
  const handleCrear = async () => {
    setError(null);

    const necesitaRes = NECESITA_RESOLUCION.has(subtipo ?? "");

    const inlineCrearPrograma =
      !esPrimeraVezElegirTipoFlujo &&
      subtipo === "Nuevo" &&
      (tipo === "RC" || tipo === "AV" || tipo === "AE");

    if (inlineCrearPrograma) {
      if (!nombre.trim()) { setError("El nombre del programa es obligatorio."); return; }
      if (!facultad)       { setError("La facultad es obligatoria."); return; }
      if (programaConNombreDuplicado(programas, nombre)) {
        setError(MENSAJE_NOMBRE_PROGRAMA_DUPLICADO);
        return;
      }
    } else {
      if (!programaId)     { setError("Debes seleccionar un programa."); return; }
    }

    if (tipo === "RC" && subtipo === "Reactivación") {
      const progReac = programas.find((p) => p._id === programaId);
      if (progReac?.estado === "Activo") {
        setError("La reactivación no aplica a programas Activos ante MEN. Solo tras no renovación (programa Inactivo ante MEN).");
        return;
      }
    }

    let fechaResISO: string | null = null;
    if (necesitaRes) {
      fechaResISO = inputFechaAISO(fechaRes);
      if (!fechaResISO) {
        setError("La fecha de resolución es obligatoria. Use dd/mm/aaaa, dd-mm-aaaa o yyyy-mm-dd.");
        return;
      }
      if (!codigoRes)    { setError("El código de resolución es obligatorio."); return; }
      if (!duracionRes && subtipo !== "Registro calificado de oficio")  { setError("La duración de la resolución es obligatoria."); return; }
    }

    if (subtipo === "Registro calificado de oficio") {
      const docsPdfPref = prefillDesdeRecordatorio?.documentos_pdf_resolucion ?? [];
      const tienePdfReutilizableDesdePrefill =
        !!prefillDesdeRecordatorio?.reminderRowId
        && !omitirPdfCopiaAlerta
        && docsPdfPref.some((d) => !!(d?.view_link && String(d.view_link).trim()));
      if (!pdfFile && !tienePdfReutilizableDesdePrefill) {
        setError("Adjunta el PDF de la resolución de oficio (obligatorio), o reutiliza el PDF de la alerta si muestra el enlace.");
        return;
      }
    }

    if (subtipo === "Renovación + reforma" && tipo === "RC" && !prefillDesdeRecordatorio?.reminderRowId) {
      const progSel = programas.find((p) => p._id === programaId);
      const tieneAlertaRc = progSel
        ? procesos.some(
            (pr) =>
              pr.tipo_proceso === "ALERTA"
              && pr.alert_para_tipo === "RC"
              && pr.program_code === programCodeKey(progSel),
          )
        : false;
      const tieneResProg = progSel ? !!getResolucionRcParaAltaProceso(progSel) : false;
      if (!tieneAlertaRc && !tieneResProg && !(fechaRes && codigoRes && duracionRes)) {
        setError(
          "Renovación + modificación solo puede crearse si hay una alerta de RC o resolución vigente en el programa (fecha, código y años).",
        );
        return;
      }
    }

    const subtiposRcExigenRecordatorioSiAlerta =
      tipo === "RC"
      && !!subtipo
      && ["Renovación", "Renovación + reforma", "Registro calificado de oficio", "Reactivación"].includes(subtipo);
    if (!inlineCrearPrograma && subtiposRcExigenRecordatorioSiAlerta) {
      const progSelRc = programas.find((p) => p._id === programaId);
      const tieneAlertaRcBarr = progSelRc
        ? procesos.some(
            (pr) =>
              pr.tipo_proceso === "ALERTA"
              && pr.alert_para_tipo === "RC"
              && pr.program_code === programCodeKey(progSelRc),
          )
        : false;
      if (tieneAlertaRcBarr && !prefillDesdeRecordatorio?.reminderRowId) {
        setError(
          "Hay una alerta de Registro Calificado en este programa. Crea el proceso desde el recordatorio o la tabla de alertas («Crear proceso»), no solo «Agregar proceso» en la barra.",
        );
        return;
      }
    }

    if (!inlineCrearPrograma && tipo === "AV" && subtipo && subtipo !== "No renovación") {
      const progSelAv = programas.find((p) => p._id === programaId);
      const tieneAlertaAvBarr = progSelAv
        ? procesos.some(
            (pr) =>
              pr.tipo_proceso === "ALERTA"
              && pr.alert_para_tipo === "AV"
              && pr.program_code === programCodeKey(progSelAv),
          )
        : false;
      if (tieneAlertaAvBarr && !prefillDesdeRecordatorio?.reminderRowId) {
        setError(
          "Hay una alerta de Acreditación Voluntaria en este programa. Crea el proceso desde el recordatorio o la tabla de alertas.",
        );
        return;
      }
    }

    if (!inlineCrearPrograma) {
      const progSel = programas.find(p => p._id === programaId);
      if (progSel) {
        if (esPrimeraVezElegirTipoFlujo) {
          if (tipo === "RC" && (progSel.total_rc ?? 0) > 0) {
            setError(
              "Este programa ya tiene procesos RC en historial (incluye cierres y reformas). Para otro RC usa «Agregar proceso», no el flujo de primer RC — Nuevo."
            );
            return;
          }
          if (tipo === "AV" && (progSel.total_av ?? 0) > 0) {
            setError(
              "Este programa ya tiene procesos AV en historial. Para otra acreditación usa «Agregar proceso», no el flujo de primer AV — Nuevo."
            );
            return;
          }
        }
        const yaExiste =
          tipo === "RC"
            ? !!procesoRcActivoDePrograma(procesos, programCodeKey(progSel))
            : procesos.some((p) => p.program_code === programCodeKey(progSel) && p.tipo_proceso === tipo);
        if (yaExiste) {
          setError(
            tipo === "RC"
              ? "Este programa ya tiene un proceso de Registro Calificado activo (cualquier subtipo). Ciérralo antes de crear otro, incluida Modificación."
              : `Este programa ya tiene un proceso de ${tipo} activo. Ciérralo antes de crear uno nuevo.`,
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      const progSel = !inlineCrearPrograma
        ? programas.find(p => p._id === programaId)
        : null;

      const body: Record<string, unknown> = {
        tipo_proceso: tipo,
        subtipo,
      };

      if (inlineCrearPrograma) {
        const facultadObj = facultades.find(f => f.dep_code === facultad);
        body.program_data = {
          nombre: nombre.trim(),
          dep_code_facultad: facultadObj?.dep_code ?? facultad,
          dep_code_programa: codigoProgramaParaApi(),
          codigo_snies:       codigoSnies.trim() || null,
          modalidad:          modalidad,
          nivel_academico:    nivelAcad,
          nivel_formacion:    nivelForm,
          num_creditos:       numCreditos ? parseInt(numCreditos) : null,
          periodos_duracion: periodosDuracion.trim() || null,
          num_semestres:      numSemestres ? parseInt(numSemestres) : null,
          admision_estudiantes: admision,
          num_estudiantes_saces: numEstud ? parseInt(numEstud) : null,
          ...payloadClasificacion(),
        };
      } else {
        body.program_code = progSel ? programCodeKey(progSel) : undefined;
      }

      if (necesitaRes && fechaResISO) {
        body.fecha_resolucion    = fechaResISO;
        body.codigo_resolucion   = codigoRes;
        body.duracion_resolucion = subtipo === "Registro calificado de oficio" ? 7 : parseInt(duracionRes, 10);
        if (
          prefillDesdeRecordatorio?.reminderRowId
          && !pdfFile
          && !omitirPdfCopiaAlerta
        ) {
          (body as Record<string, unknown>).copiar_resolucion_desde_process_id =
            prefillDesdeRecordatorio.reminderRowId;
        }
      }

      const debeEnviarConsumirAlerta =
        !!prefillDesdeRecordatorio?.reminderRowId
        && (tipo === "RC" || tipo === "AV")
        && !!subtipo
        && subtipo !== "Reforma curricular"
        && subtipo !== "No renovación";
      if (debeEnviarConsumirAlerta) {
        body.consumir_alerta_process_id = prefillDesdeRecordatorio.reminderRowId;
      }

      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/processes`, body);
      const processId = res.data?.process?._id;
      const createdProgram = res.data?.program as Program | undefined;

      if (pdfFile && processId) {
        const formData = new FormData();
        formData.append("file", pdfFile);
        formData.append("doc_type", "resolucion");
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${processId}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
      }

      if (onNavigateToGestion && tipo && (tipo === "RC" || tipo === "AV" || tipo === "AE")) {
        const progSel = inlineCrearPrograma
          ? createdProgram
          : programas.find((p) => p._id === programaId);
        const nombreProg = progSel?.nombre ?? createdProgram?.nombre ?? nombre.trim();
        if (nombreProg) {
          await onNavigateToGestion({
            programId: progSel?._id ?? createdProgram?._id,
            nombrePrograma: nombreProg,
            tipo,
            dep_code_programa: progSel?.dep_code_programa ?? createdProgram?.dep_code_programa ?? undefined,
            dep_code_facultad: progSel?.dep_code_facultad ?? createdProgram?.dep_code_facultad ?? undefined,
          });
        } else {
          await onCreated();
        }
      } else {
        await onCreated();
      }

      handleClose();
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { error?: string } } };
      const msg = ax.response?.data?.error;
      if (ax.response?.status === 409) setError(msg || "Ese código de programa ya existe.");
      else setError(msg || "Error al crear el proceso.");
    } finally {
      setSaving(false);
    }
  };

  /* ── Título dinámico ── */
  const tituloPaso = step === 1 ? "Tipo de proceso"
    : step === 2 ? "Subtipo de proceso"
    : "Información del proceso";

  /* Programas disponibles: RC Reactivación ⇒ solo Inactivo y sin RC activo. */
  const programasDisponibles = useMemo(
    () => programas.filter((p) => {
      if (!tipo) return true;
      if (tipo === "RC") {
        const activo = procesoRcActivoDePrograma(procesos, programCodeKey(p));
        if (subtipo === "Reactivación") {
          return p.estado === "Inactivo" && !activo;
        }
        return !activo;
      }
      return !procesos.some((pr) => pr.program_code === programCodeKey(p) && pr.tipo_proceso === tipo);
    }),
    [programas, procesos, tipo, subtipo],
  );

  const SUBTIPOS_AE = [
    {
      key: "Autoevaluación",
      titulo: "Autoevaluación",
      desc: "Proceso de autoevaluación. Se crea automáticamente un Plan de Mejoramiento al iniciarlo. Puede vincularse a un RC o AV existente.",
    },
  ];

  const desdeAlertaCrearProceso = !!prefillDesdeRecordatorio?.reminderRowId;

  const listaSubtiposRCBase = excluirSubtipoNuevo ? SUBTIPOS_RC.filter((s) => s.key !== "Nuevo") : SUBTIPOS_RC;
  /** Modificacion/Reforma curricular solo desde el botón dedicado en Alertas, no mezclada con renovaciones. */
  const listaSubtiposRC = useMemo(() => {
    const base = listaSubtiposRCBase;
    if (esSoloReformaCurricular) {
      return base.filter((s) => s.key === "Reforma curricular");
    }
    return base.filter((s) => s.key !== "Reforma curricular");
  }, [listaSubtiposRCBase, esSoloReformaCurricular]);

  const listaSubtiposAV = useMemo(() => {
    return excluirSubtipoNuevo ? SUBTIPOS_AV.filter((s) => s.key !== "Nuevo") : SUBTIPOS_AV;
  }, [excluirSubtipoNuevo]);

  const listaSubtiposAE = SUBTIPOS_AE;

  const programaSel = programaId ? programas.find(p => p._id === programaId) : null;
  const reactivacionRcProgramaActivo =
    tipo === "RC" && subtipo === "Reactivación" && programaSel?.estado === "Activo";
  const programaBloqueadoPorPrefill = !!(
    prefillDesdeRecordatorio &&
    !prefillDesdeRecordatorio.soloTipo &&
    programaId
  );
  const procesoActivo =
    tipo && programaSel
      ? tipo === "RC"
        ? procesoRcActivoDePrograma(procesos, programCodeKey(programaSel))
        : procesos.find(
            (pr) =>
              pr.program_code === programCodeKey(programaSel) && pr.tipo_proceso === tipo,
          )
      : undefined;

  const mostrarFormularioProgramaNuevo =
    subtipo === "Nuevo" &&
    (tipo === "RC" || (tipo === "AV" && !esPrimeraVezElegirTipoFlujo) || tipo === "AE");

  const tituloModal = esSoloCrearPrograma
    ? "Crear programa"
    : esPrimeraVezElegirTipoFlujo
      ? "Nuevo proceso AV"
      : esSoloReformaCurricular
        ? SUBTIPO_MODIFICACION_REFORMA_LABEL
        : "Agregar proceso";

  const programasSinProcesoAE = useMemo(
    () => programas.filter((p) => !procesos.some((pr) => pr.program_code === programCodeKey(p) && pr.tipo_proceso === "AE")),
    [programas, procesos]
  );

  const programasListaPrimeraVez =
    tipo === "RC" ? programasSinProcesoRC : tipo === "AV" ? programasSinProcesoAV : tipo === "AE" ? programasSinProcesoAE : [];

  /* ──────────────────────────────────────────────────────────────────────── */
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <Text fw={700} size="lg">{tituloModal}</Text>
          {!esSoloCrearPrograma && tipo && (
            <Badge color={tipo === "RC" ? "blue" : tipo === "AV" ? "violet" : "teal"} variant="light">{tipo}</Badge>
          )}
          {!esSoloCrearPrograma && subtipo && (
            <Badge color="gray" variant="outline" size="sm" styles={stylesSubtipoLargo}>
              {etiquetaSubtipoCompacta(subtipo)}
            </Badge>
          )}
        </Group>
      }
      size="75rem" centered radius="md"
    >
      <Stack gap="md">

        {esSoloCrearPrograma ? (
          <>
            <Text size="sm" c="dimmed">
              Registra los datos del programa. Al guardar se crea también el proceso <strong>RC — Nuevo</strong> (sin resolución). Para la primera acreditación voluntaria usa <strong>Nuevo proceso AV</strong> o «Agregar proceso».
            </Text>
            <Divider label="Datos del programa" labelPosition="left" />
            <TextInput label="Nombre del programa" placeholder="Ej: Ingeniería de Sistemas"
              value={nombre} onChange={e => setNombre(e.currentTarget.value)} required />
            <TextInput label="Código del programa" placeholder="Ej: 22 (opcional)"
              description="Opcional. Si no lo indicas, el programa queda sin código visible (como el SNIES)."
              value={depCodePrograma} onChange={e => setDepCodePrograma(e.currentTarget.value)} />
            <TextInput label="Código SNIES" placeholder="Ej: 12345"
              value={codigoSnies} onChange={e => setCodigoSnies(e.currentTarget.value)} />
            <Select label="Facultad" placeholder="Selecciona una facultad" required
              data={facultades.map(f => ({ value: f.dep_code, label: f.name }))}
              value={facultad} onChange={setFacultad} searchable />
            <SimpleGrid cols={2} spacing="sm">
              <Select label="Modalidad" placeholder="Selecciona"
                data={["Presencial", "Virtual", "Híbrido"]}
                value={modalidad} onChange={setModalidad} />
              <Select label="Nivel académico" placeholder="Selecciona"
                data={["Pregrado", "Posgrado"]}
                value={nivelAcad} onChange={setNivelAcad} />
              <Select label="Nivel de formación" placeholder="Selecciona"
                data={["Técnico", "Tecnológico", "Profesional", "Especialización", "Maestría", "Doctorado"]}
                value={nivelForm} onChange={setNivelForm} />
              <Select
                label="Periodicidad de admisión"
                placeholder="Selecciona"
                data={[...PERIODICIDAD_ADMISION]}
                value={admision}
                onChange={setAdmision}
                clearable
              />
              <TextInput label="Créditos" type="number" placeholder="Ej: 173"
                value={numCreditos} onChange={e => setNumCreditos(e.currentTarget.value)} />
              <TextInput label="Periodos de duración" placeholder="Ej: 10 o 10 semestres"
                value={periodosDuracion} onChange={e => setPeriodosDuracion(e.currentTarget.value)} />
              <TextInput label="Semestres" type="number" placeholder="Ej: 10"
                value={numSemestres} onChange={e => setNumSemestres(e.currentTarget.value)} />
              <TextInput label="Número de estudiantes en el primer periodo" type="number" placeholder="Ej: 250"
                value={numEstud} onChange={e => setNumEstud(e.currentTarget.value)} />
            </SimpleGrid>
            {camposClasificacionEnAlta}
            {error && <Notification color="red" withCloseButton={false}>{error}</Notification>}
            <Group justify="space-between" mt="sm">
              <Button variant="default" size="sm" onClick={handleClose}>Cancelar</Button>
              <Button size="sm" loading={saving} onClick={() => void handleCrearSoloPrograma()}>Crear programa</Button>
            </Group>
          </>
        ) : esPrimeraVezElegirTipoFlujo ? (
          <>
            <Text size="sm" c="dimmed">
              Acreditación voluntaria en subtipo <strong>Nuevo</strong> (sin resolución). Solo aparecen programas sin ninguna AV en historial (ni activa, ni alerta, ni cierre archivado). El registro calificado Nuevo del programa se crea con <strong>Crear programa</strong>.
            </Text>
            <Divider label="Programa" labelPosition="left" />
            <Select
              label="Programa"
              placeholder="Busca por nombre"
              required
              searchable
              data={programasListaPrimeraVez.map(p => ({ value: p._id, label: p.nombre }))}
              value={programaId}
              onChange={setProgramaId}
            />
            {programasListaPrimeraVez.length === 0 && (
              <Text size="xs" c="orange">
                No hay programas elegibles para un AV por primera vez (todos ya tienen historial, proceso activo o alerta de ese tipo). Para renovar u otro trámite, usa «Agregar proceso».
              </Text>
            )}
            {error && <Notification color="red" withCloseButton={false}>{error}</Notification>}
            <Group justify="space-between" mt="sm">
              <Button variant="default" size="sm" onClick={handleClose}>Cancelar</Button>
              <Button size="sm" loading={saving} onClick={() => void handleCrear()}>Crear proceso</Button>
            </Group>
          </>
        ) : (
          <>
      {!esSoloReformaCurricular && (
      <>
      {/* ── Indicador de pasos ── */}
      <Group gap={4} mb="md">
        {([1, 2, 3] as const).map((n) => (
          <Box
            key={n}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: step >= n ? "#228be6" : "#dee2e6",
            }}
          />
        ))}
      </Group>
      <Text size="xs" c="dimmed" mb="md" fw={500}>
        {`Paso ${step} de 3 — ${tituloPaso}`}
      </Text>

        {/* ───────────── PASO 1: TIPO ───────────── */}
        {step === 1 && (
          <SimpleGrid cols={3} spacing="md">
            {(["RC", "AV", "AE"] as const).map((t) => (
              <Paper
                key={t}
                withBorder
                radius="md"
                p="lg"
                style={{ cursor: "pointer", borderColor: tipo === t ? "#228be6" : undefined, borderWidth: 2, textAlign: "center" }}
                onClick={() => {
                  setTipo(t);
                  if (t === "AE") { setSubtipo("Autoevaluación"); }
                  setStep(t === "AE" ? 3 : 2);
                }}
              >
                <Badge color={t === "RC" ? "blue" : t === "AV" ? "violet" : "teal"} size="xl" variant="light" mb="sm">{t}</Badge>
                <Text fw={700} size="sm">{t === "RC" ? "Registro Calificado" : t === "AV" ? "Acreditación Voluntaria" : "Autoevaluación"}</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t === "RC" ? "Incluye reactivación (programa Inactivo, paso 3)." : t === "AV" ? "Incluye reactivación." : "Crea PM automáticamente"}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        )}

        {/* ───────────── PASO 2: SUBTIPO ───────────── */}
        {step === 2 && tipo && (
          <>
            <Stack gap="sm">
              {(tipo === "RC" ? listaSubtiposRC : tipo === "AV" ? listaSubtiposAV : listaSubtiposAE).map(s => (
                <Paper
                  key={s.key}
                  withBorder
                  radius="md"
                  p="md"
                  style={{ cursor: "pointer", borderColor: subtipo === s.key ? "#228be6" : undefined, borderWidth: subtipo === s.key ? 2 : 1 }}
                  onClick={() => setSubtipo(s.key)}
                >
                  <Group gap="sm" align="flex-start">
                    <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${subtipo === s.key ? "#228be6" : "#ced4da"}`, backgroundColor: subtipo === s.key ? "#228be6" : "white", flexShrink: 0, marginTop: 2 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={600} size="sm" style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3 }}>{s.titulo}</Text>
                      <Text size="xs" c="dimmed" style={{ whiteSpace: "normal", wordBreak: "break-word" }}>{s.desc}</Text>
                      {tipo === "RC" && s.key === "Reactivación" && (
                        <Text size="xs" c="orange" mt={4} style={{ whiteSpace: "normal", wordBreak: "break-word" }}>
                          No aplica si el programa está <strong>Activo</strong>; solo programas <strong>Inactivos</strong> (p. ej. tras no renovación).
                        </Text>
                      )}
                    </div>
                  </Group>
                </Paper>
              ))}
            </Stack>
            <Group justify="space-between" mt="sm">
              <Button variant="default" size="sm" onClick={() => {
                if (prefillDesdeRecordatorio && !prefillDesdeRecordatorio.soloTipo) { handleClose(); return; }
                if (prefillDesdeRecordatorio?.soloTipo) {
                  setStep(1); setTipo(null); setSubtipo(null);
                  return;
                }
                setStep(1); setSubtipo(null);
              }}>← Atrás</Button>
              <Button size="sm" disabled={!subtipo} onClick={() => setStep(3)}>Siguiente →</Button>
            </Group>
          </>
        )}

      </>
      )}
      {esSoloReformaCurricular && (
        <Text size="sm" c="dimmed" mb="md">
          Solo si <strong>no</strong> hay otro RC activo en el programa. Proceso interno de la ficha: <strong>no elimina alertas</strong> de renovación. Elige el programa y créalo; la constancia y los cambios se registran al cerrar.
        </Text>
      )}

        {/* ───────────── PASO 3: DATOS ───────────── */}
        {step === 3 && subtipo && (
          <>
            <Stack gap="md">
            {/* RC Nuevo o AV Nuevo (flujo normal): crear programa y proceso */}
            {mostrarFormularioProgramaNuevo && (
              <>
                <Divider label="Datos del programa" labelPosition="left" />
                <TextInput label="Nombre del programa" placeholder="Ej: Ingeniería de Sistemas"
                  value={nombre} onChange={e => setNombre(e.currentTarget.value)} required />
                <TextInput label="Código del programa" placeholder="Ej: 22 (opcional)"
                  description="Opcional. Si no lo indicas, el programa queda sin código visible (como el SNIES)."
                  value={depCodePrograma} onChange={e => setDepCodePrograma(e.currentTarget.value)} />
                <TextInput label="Código SNIES" placeholder="Ej: 12345"
                  value={codigoSnies} onChange={e => setCodigoSnies(e.currentTarget.value)} />
                <Select label="Facultad" placeholder="Selecciona una facultad" required
                  data={facultades.map(f => ({ value: f.dep_code, label: f.name }))}
                  value={facultad} onChange={setFacultad} searchable />
                <SimpleGrid cols={2} spacing="sm">
                  <Select label="Modalidad" placeholder="Selecciona"
                    data={["Presencial", "Virtual", "Híbrido"]}
                    value={modalidad} onChange={setModalidad} />
                  <Select label="Nivel académico" placeholder="Selecciona"
                    data={["Pregrado", "Posgrado"]}
                    value={nivelAcad} onChange={setNivelAcad} />
                  <Select label="Nivel de formación" placeholder="Selecciona"
                    data={["Técnico", "Tecnológico", "Profesional", "Especialización", "Maestría", "Doctorado"]}
                    value={nivelForm} onChange={setNivelForm} />
                  <Select
                    label="Periodicidad de admisión"
                    placeholder="Selecciona"
                    data={[...PERIODICIDAD_ADMISION]}
                    value={admision}
                    onChange={setAdmision}
                    clearable
                  />
                  <TextInput label="Créditos" type="number" placeholder="Ej: 173"
                    value={numCreditos} onChange={e => setNumCreditos(e.currentTarget.value)} />
                  <TextInput label="Periodos de duración" placeholder="Ej: 10 o 10 semestres"
                    value={periodosDuracion} onChange={e => setPeriodosDuracion(e.currentTarget.value)} />
                  <TextInput label="Semestres" type="number" placeholder="Ej: 10"
                    value={numSemestres} onChange={e => setNumSemestres(e.currentTarget.value)} />
                  <TextInput label="Número de estudiantes en el primer periodo" type="number" placeholder="Ej: 250"
                    value={numEstud} onChange={e => setNumEstud(e.currentTarget.value)} />
                </SimpleGrid>
                {camposClasificacionEnAlta}
                <Text size="xs" c="dimmed" mt={-4}>
                  {tipo === "RC"
                    ? "Se creará el programa y el proceso RC (Nuevo) sin resolución ni fechas. Podrás editar las fechas después."
                    : "Se creará el programa y el proceso AV (Nuevo) sin resolución. Todas las fechas quedan en blanco y son editables."}
                </Text>
              </>
            )}

            {/* Subtipos que usan programa ya existente */}
            {!mostrarFormularioProgramaNuevo && (
              <>
                <Divider label="Programa" labelPosition="left" />
                {programaBloqueadoPorPrefill && programaSel ? (
                  <Paper withBorder radius="sm" p="sm" style={{ backgroundColor: "#f8f9fa" }}>
                    <Text size="xs" c="dimmed" mb={4}>Programa (fijado desde recordatorio)</Text>
                    <Text size="sm" fw={600}>{programaSel.nombre}</Text>
                    {programaSel.estado && (
                      <Badge size="xs" variant="light" color={programaSel.estado === "Activo" ? "teal" : "gray"} mt={4}>
                        {programaSel.estado}
                      </Badge>
                    )}
                  </Paper>
                ) : (
                  <>
                    <Select
                      label="Selecciona el programa"
                      placeholder="Busca por nombre"
                      required
                      searchable
                      data={programasDisponibles.map(p => ({ value: p._id, label: p.nombre }))}
                      value={programaId}
                      onChange={setProgramaId}
                    />
                    {programasDisponibles.length === 0 && (
                      <Text size="xs" c="orange">
                        {tipo === "RC"
                          ? (subtipo === "Reactivación"
                            ? "No hay programas Inactivos sin RC activo. La reactivación de RC aplica tras no renovación (programa Inactivo) y sin otro registro en curso."
                            : "Ningún programa disponible: todos tienen ya un Registro Calificado activo (solo uno a la vez, incluye reformas). Cierra el RC vigente para poder crear otro.")
                          : `Todos los programas ya tienen un proceso de ${tipo} activo.`}
                      </Text>
                    )}
                  </>
                )}
              </>
            )}

            {reactivacionRcProgramaActivo && (
              <Text size="xs" c="orange">
                Este programa está <strong>Activo</strong>. La reactivación de RC solo aplica a programas <strong>Inactivos</strong> (p. ej. tras una no renovación). Elige otro programa o subtipo.
              </Text>
            )}

            {subtipo === "Reforma curricular" && (
              <Text size="xs" c="dimmed">
                No se usa resolución vigente ni autocalculo de fechas. Las fechas del proceso quedan en blanco y se completan manualmente en la gestión.
              </Text>
            )}

            {/* Datos de resolución */}
            {NECESITA_RESOLUCION.has(subtipo) && (
              <>
                <Divider label="Resolución vigente" labelPosition="left" />
                {prefillDesdeRecordatorio?.reminderRowId && (fechaRes || codigoRes || duracionRes) && (
                  <Text size="xs" c="teal">
                    Resolución tomada de la alerta o del programa; revísala si la nueva resolución es distinta.
                  </Text>
                )}
                {prefillDesdeRecordatorio?.reminderRowId && !fechaRes && !codigoRes && !duracionRes && (
                  <Text size="xs" c="orange">
                    No hay resolución en la alerta ni en el programa. Complétala a mano (o cierra el proceso anterior indicando fecha, código y vigencia para que quede en la alerta).
                  </Text>
                )}
                {subtipo === "No renovación" && (
                  <Text size="xs" c="dimmed">Este proceso quedará en plan de contingencia permanente (solo documentos). Solo se calcula la fecha de vencimiento.</Text>
                )}
                {ES_AUTOCALCULO.has(subtipo) && (
                  <Text size="xs" c="dimmed">
                    {subtipo === "Renovación + reforma"
                      ? "Requiere alerta de RC o resolución vigente en el programa. El sistema auto-calculará todas las fechas del proceso."
                      : subtipo === "Registro calificado de oficio"
                        ? prefillDesdeRecordatorio?.rcOficioPostAvGracia
                          ? "Tras la acreditación con vigencia de gracia: ingresa la resolución de oficio (fecha, código y PDF). Vigencia 7 años; la gestión del trámite será solo confirmación y cierre."
                          : "Vigencia fija en 7 años. El proceso queda en fase única para gestión liviana y se crea la alerta RC (recordatorio renovación) con la misma resolución y calendario."
                        : "El sistema auto-calculará todas las fechas del proceso a partir de la resolución."}
                  </Text>
                )}
                <SimpleGrid cols={3} spacing="sm">
                  <div>
                    <Text size="sm" fw={500} mb={4}>Fecha de resolución</Text>
                    <DateInput
                      value={fechaRes ? (dateParserEspanol(fechaRes) ?? new Date(`${fechaRes.slice(0, 10)}T12:00:00`)) : null}
                      onChange={(val) => setFechaRes(val ? val.toISOString().slice(0, 10) : "")}
                      valueFormat="DD/MM/YYYY"
                      placeholder="dd/mm/aaaa"
                      clearable
                      dateParser={dateParserEspanol}
                      description="Escriba la fecha o use el calendario"
                    />
                  </div>
                  <TextInput label="Código de resolución" placeholder="Ej: 12345"
                    value={codigoRes} onChange={e => setCodigoRes(e.currentTarget.value)} />
                  {subtipo === "Registro calificado de oficio" ? (
                    <TextInput label="Duración (años)" value="7" readOnly description="Fija para registro de oficio" />
                  ) : (
                    <TextInput label="Duración (años)" placeholder="Ej: 7" type="number"
                      value={duracionRes}
                      onChange={e => setDuracionRes(e.currentTarget.value.replace(/\D/g, ""))} />
                  )}
                </SimpleGrid>

                {(() => {
                  const docsAlerta = prefillDesdeRecordatorio?.documentos_pdf_resolucion ?? [];
                  const docAlerta = docsAlerta[0] ?? null;
                  const muestraDocAlerta =
                    !pdfFile && !omitirPdfCopiaAlerta && !!docAlerta?.view_link?.trim();
                  const abrirSelectorPdf = () => fileInputRef.current?.click();
                  const quitarPdf = () => {
                    setPdfFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                    if (prefillDesdeRecordatorio?.reminderRowId && docsAlerta.length > 0) {
                      setOmitirPdfCopiaAlerta(true);
                    }
                  };
                  return (
                <div>
                  <Text size="sm" fw={500} mb={4}>PDF de resolución</Text>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setPdfFile(f);
                      if (f) setOmitirPdfCopiaAlerta(false);
                    }}
                  />
                  <Paper withBorder radius="sm" p="sm" bg="gray.0">
                    {pdfFile ? (
                      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" fw={600} truncate maw={280}>📄 {pdfFile.name}</Text>
                          <Text size="xs" c="dimmed">Archivo nuevo (reemplaza el de la alerta)</Text>
                        </Stack>
                        <Group gap={6} wrap="nowrap">
                          <Button size="xs" variant="light" onClick={abrirSelectorPdf}>Cambiar</Button>
                          <Button size="xs" variant="subtle" color="red" onClick={quitarPdf}>Quitar</Button>
                        </Group>
                      </Group>
                    ) : muestraDocAlerta ? (
                      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <Anchor
                            size="sm"
                            fw={600}
                            href={docAlerta!.view_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            truncate
                            maw={320}
                          >
                            {docAlerta!.name?.trim() || "Abrir PDF de resolución"}
                          </Anchor>
                          <Text size="xs" c="dimmed">Se reutilizará al crear el proceso (desde la alerta).</Text>
                        </Stack>
                        <Group gap={6} wrap="nowrap">
                          <Button size="xs" variant="light" onClick={abrirSelectorPdf}>Cambiar</Button>
                          <Button size="xs" variant="subtle" color="red" onClick={quitarPdf}>Quitar</Button>
                        </Group>
                      </Group>
                    ) : (
                      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                        <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                          {subtipo === "Registro calificado de oficio"
                            ? "Obligatorio: el mismo PDF se copiará a la alerta de renovación junto con fecha y código."
                            : prefillDesdeRecordatorio?.reminderRowId
                              ? "Sin PDF en la alerta. Puedes adjuntar uno o crear el proceso sin documento."
                              : "Opcional. Si no adjuntas archivo, el proceso se crea sin PDF de resolución."}
                        </Text>
                        <Button size="xs" variant="light" onClick={abrirSelectorPdf}>Adjuntar PDF</Button>
                      </Group>
                    )}
                  </Paper>
                </div>
                  );
                })()}

              </>
            )}

            {(subtipo === "Nuevo" && tipo === "AV" && mostrarFormularioProgramaNuevo) && (
              <Text size="xs" c="dimmed" mt={4}>
                AV Nuevo: sin resolución ni fecha de vencimiento. Todas las fechas quedan en blanco y son editables manualmente.
              </Text>
            )}

            {procesoActivo && programaSel && tipo && onNavigateToGestion && (
              <Button
                size="xs"
                variant="light"
                w="fit-content"
                onClick={() => {
                  void onNavigateToGestion?.({
                    programId: programaSel._id,
                    nombrePrograma: programaSel.nombre,
                    tipo,
                    dep_code_programa: programaSel.dep_code_programa ?? undefined,
                    dep_code_facultad: programaSel.dep_code_facultad,
                  });
                  reset();
                }}
              >
                Gestionar proceso activo
              </Button>
            )}
            </Stack>

            {error && <Notification color="red" withCloseButton={false}>{error}</Notification>}

            <Group justify="space-between" mt="sm">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setError(null);
                  if (esSoloReformaCurricular) {
                    handleClose();
                    return;
                  }
                  setStep(2);
                }}
              >
                ← Atrás
              </Button>
              <Button
                size="sm"
                loading={saving}
                disabled={reactivacionRcProgramaActivo}
                onClick={() => void handleCrear()}
              >
                Crear proceso
              </Button>
            </Group>
          </>
        )}

          </>
        )}

      </Stack>
    </Modal>
  );
}
