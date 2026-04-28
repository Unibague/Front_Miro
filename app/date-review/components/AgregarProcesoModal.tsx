"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import {
  Modal, Stack, Group, Button, Text, Paper, Select, TextInput,
  SimpleGrid, Notification, Badge, Divider, Box,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import axios from "axios";
import type { Dependency, Program, Process } from "../types";
import { PERIODICIDAD_ADMISION, etiquetaSubtipoCompacta } from "../constants";

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
    desc: "Proceso permanente en Fase 7 — solo para subir documentos. Requiere resolución vigente.",
  },
  {
    key: "Renovación + reforma",
    titulo: "Renovación + reforma",
    desc: "Como la renovación normal, con resolución y auto-cálculo de fechas.",
  },
  {
    key: "Reforma curricular",
    titulo: "Reforma curricular",
    desc: "Tiene resolución y fecha de vencimiento, pero el resto de fechas quedan en blanco y son editables.",
  },
  {
    key: "Registro calificado de oficio",
    titulo: "Registro calificado de oficio",
    desc: "Resolución otorgada de oficio (sin trámite completo). Carga la resolución y datos al cierre, o abre este proceso si no se registró al cerrar la AV.",
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
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
/** Subtipos donde se pide información de resolución */
const NECESITA_RESOLUCION = new Set([
  "Renovación", "No renovación", "Renovación + reforma", "Reforma curricular",
]);

/** Subtipos donde las fechas son auto-calculadas (no editables inicialmente) */
const ES_AUTOCALCULO = new Set(["Renovación", "Renovación + reforma"]);

/** Desde recordatorio: programa y tipo fijos; opcionalmente sin subtipo «Nuevo». */
/** Con `soloTipo`: solo el tipo (RC/AV); el usuario elige programa en el paso 2 (p. ej. «Agregar nuevo» en recordatorios). */
export type AgregarProcesoPrefill = {
  tipo?: "RC" | "AV";
  programId?: string;
  excluirNuevo?: boolean;
  soloTipo?: boolean;
  /** Solo registrar el programa en el sistema (sin proceso RC/AV). */
  soloCrearPrograma?: boolean;
  /** Elegir RC o AV (subtipo Nuevo) sobre un programa que aún no tenga ese proceso activo. */
  modoProcesoPrimeraVezTipo?: boolean;
  /**
   * Datos de resolución congelados en la alerta (proceso que cerró).
   * Precarga el paso 3 para renovaciones sin volver a pedir lo que ya está en la alerta.
   */
  resolucionDesdeAlerta?: {
    fecha_resolucion: string | null;
    codigo_resolucion: string | null;
    duracion_resolucion: number | null;
  } | null;
  /** Id estable de la fila recordatorio (fuerza remount del modal al abrir desde otra alerta). */
  reminderRowId?: string;
};

interface Props {
  opened: boolean;
  onClose: () => void;
  programas: Program[];
  facultades: Dependency[];
  procesos: Process[];
  onCreated: () => Promise<void>;
  /** Navega a la vista del programa para gestionar el proceso RC/AV activo (desde el panel recordatorio). */
  onNavigateToGestion?: (args: { nombrePrograma: string; tipo: "RC" | "AV" }) => void;
  /** Si viene desde un recordatorio sin proceso activo: arranca en paso 2 con programa bloqueado. */
  prefillDesdeRecordatorio?: AgregarProcesoPrefill | null;
}

export default function AgregarProcesoModal({
  opened, onClose, programas, facultades, procesos, onCreated, onNavigateToGestion,
  prefillDesdeRecordatorio = null,
}: Props) {

  /* ── Navegación de pasos ── */
  const [step, setStep] = useState<1 | 2 | 3>(1);
  /** Sub-pasos del flujo «nuevo proceso RC o AV» (alertas): 1 = elegir tipo, 2 = elegir programa */
  const [pvStep, setPvStep] = useState<1 | 2>(1);
  const [tipo, setTipo] = useState<"RC" | "AV" | null>(null);
  const [subtipo, setSubtipo] = useState<string | null>(null);

  /* ── Selección de programa existente ── */
  const [programaId, setProgramaId] = useState<string | null>(null);

  /* ── Datos programa nuevo (RC Nuevo) ── */
  const [nombre, setNombre]           = useState("");
  const [codigoSnies, setCodigoSnies] = useState("");
  const [facultad, setFacultad]       = useState<string | null>(null);
  const [modalidad, setModalidad]     = useState<string | null>(null);
  const [nivelAcad, setNivelAcad]     = useState<string | null>(null);
  const [nivelForm, setNivelForm]     = useState<string | null>(null);
  const [numCreditos, setNumCreditos] = useState("");
  const [numSemestres, setNumSemestres] = useState("");
  const [admision, setAdmision]       = useState<string | null>(null);
  const [numEstud, setNumEstud]       = useState("");

  /* ── Datos de resolución ── */
  const [fechaRes, setFechaRes]       = useState("");
  const [codigoRes, setCodigoRes]     = useState("");
  const [duracionRes, setDuracionRes] = useState("");

  /* ── PDF de resolución ── */
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
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
        : prefillDesdeRecordatorio.soloTipo
          ? `solo-${prefillDesdeRecordatorio.tipo ?? ""}`
          : `${prefillDesdeRecordatorio.programId}-${prefillDesdeRecordatorio.tipo}-${!!prefillDesdeRecordatorio.excluirNuevo}-${snapKey}-${reminderKey}`
    : "";

  /** Aplica resolución antes del pintado para evitar parpadeo y estados viejos al reutilizar el modal. */
  const aplicarResolucionDesdePrefill = () => {
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

  const programasSinProcesoAV = useMemo(
    () => programas.filter((p) => !procesos.some((pr) => pr.program_code === p.dep_code_programa && pr.tipo_proceso === "AV")),
    [programas, procesos]
  );
  const programasSinProcesoRC = useMemo(
    () => programas.filter((p) => !procesos.some((pr) => pr.program_code === p.dep_code_programa && pr.tipo_proceso === "RC")),
    [programas, procesos]
  );

  /* ── Reset total ── */
  const reset = () => {
    setStep(1); setPvStep(1); setTipo(null); setSubtipo(null); setProgramaId(null);
    setNombre(""); setCodigoSnies(""); setFacultad(null); setModalidad(null);
    setNivelAcad(null); setNivelForm(null); setNumCreditos(""); setNumSemestres("");
    setAdmision(null); setNumEstud("");
    setFechaRes(""); setCodigoRes(""); setDuracionRes("");
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSaving(false); setError(null);
    setExcluirSubtipoNuevo(false);
  };

  useLayoutEffect(() => {
    if (!opened || !prefillDesdeRecordatorio) return;
    if (
      prefillDesdeRecordatorio.soloCrearPrograma ||
      prefillDesdeRecordatorio.modoProcesoPrimeraVezTipo ||
      prefillDesdeRecordatorio.soloTipo
    ) {
      return;
    }
    aplicarResolucionDesdePrefill();
  }, [opened, prefillKey]);

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
        setTipo(null);
        setSubtipo(null);
        setProgramaId(null);
        setPvStep(1);
        setStep(1);
      } else if (prefillDesdeRecordatorio.soloTipo) {
        setExcluirSubtipoNuevo(false);
        setTipo(prefillDesdeRecordatorio.tipo ?? null);
        setSubtipo(null);
        setProgramaId(null);
        setStep(2);
      } else {
        setExcluirSubtipoNuevo(!!prefillDesdeRecordatorio.excluirNuevo);
        setTipo(prefillDesdeRecordatorio.tipo ?? null);
        setSubtipo(null);
        setProgramaId(prefillDesdeRecordatorio.programId ?? null);
        setStep(2);
      }
      setNombre(""); setCodigoSnies(""); setFacultad(null); setModalidad(null);
      setNivelAcad(null); setNivelForm(null); setNumCreditos(""); setNumSemestres("");
      setAdmision(null); setNumEstud("");
      aplicarResolucionDesdePrefill();
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

  const handleCrearSoloPrograma = async () => {
    setError(null);
    if (!nombre.trim()) { setError("El nombre del programa es obligatorio."); return; }
    if (!facultad)       { setError("La facultad es obligatoria."); return; }
    setSaving(true);
    try {
      const facultadObj = facultades.find(f => f.dep_code === facultad);
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/programs`, {
        nombre: nombre.trim(),
        dep_code_facultad: facultadObj?.dep_code ?? facultad,
        dep_code_programa: `PROG_${Date.now()}`,
        codigo_snies: codigoSnies.trim() || null,
        modalidad,
        nivel_academico: nivelAcad,
        nivel_formacion: nivelForm,
        num_creditos: numCreditos ? parseInt(numCreditos) : null,
        num_semestres: numSemestres ? parseInt(numSemestres) : null,
        admision_estudiantes: admision,
        num_estudiantes_saces: numEstud ? parseInt(numEstud) : null,
      });
      await onCreated();
      handleClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Error al crear el programa.");
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
      (tipo === "RC" || tipo === "AV");

    if (inlineCrearPrograma) {
      if (!nombre.trim()) { setError("El nombre del programa es obligatorio."); return; }
      if (!facultad)       { setError("La facultad es obligatoria."); return; }
    } else {
      if (!programaId)     { setError("Debes seleccionar un programa."); return; }
    }

    if (necesitaRes) {
      if (!fechaRes)     { setError("La fecha de resolución es obligatoria."); return; }
      if (!codigoRes)    { setError("El código de resolución es obligatorio."); return; }
      if (!duracionRes)  { setError("La duración de la resolución es obligatoria."); return; }
    }

    if (!inlineCrearPrograma) {
      const progSel = programas.find(p => p._id === programaId);
      if (progSel) {
        const yaExiste = procesos.some(
          p => p.program_code === progSel.dep_code_programa && p.tipo_proceso === tipo
        );
        if (yaExiste) {
          setError(`Este programa ya tiene un proceso de ${tipo} activo. Ciérralo antes de crear uno nuevo.`);
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
          dep_code_programa: `PROG_${Date.now()}`,
          codigo_snies:       codigoSnies.trim() || null,
          modalidad:          modalidad,
          nivel_academico:    nivelAcad,
          nivel_formacion:    nivelForm,
          num_creditos:       numCreditos ? parseInt(numCreditos) : null,
          num_semestres:      numSemestres ? parseInt(numSemestres) : null,
          admision_estudiantes: admision,
          num_estudiantes_saces: numEstud ? parseInt(numEstud) : null,
        };
      } else {
        body.program_code = progSel?.dep_code_programa;
      }

      if (necesitaRes) {
        body.fecha_resolucion    = fechaRes;
        body.codigo_resolucion   = codigoRes;
        body.duracion_resolucion = parseInt(duracionRes);
      }

      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/processes`, body);
      const processId = res.data?.process?._id;
      const createdProgram = res.data?.program as { nombre?: string } | undefined;

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

      await onCreated();

      if (onNavigateToGestion && tipo) {
        const nombreProg = inlineCrearPrograma
          ? (createdProgram?.nombre ?? nombre.trim())
          : (programas.find((p) => p._id === programaId)?.nombre ?? createdProgram?.nombre);
        if (nombreProg) {
          onNavigateToGestion({ nombrePrograma: nombreProg, tipo });
        }
      }

      handleClose();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Error al crear el proceso.");
    } finally {
      setSaving(false);
    }
  };

  /* ── Título dinámico ── */
  const tituloPaso = step === 1 ? "Tipo de proceso"
    : step === 2 ? "Subtipo de proceso"
    : "Información del proceso";

  /* ── Programas disponibles para seleccionar (excluye los que ya tienen ese tipo) ── */
  const programasDisponibles = programas.filter(p => {
    if (!tipo) return true;
    return !procesos.some(pr => pr.program_code === p.dep_code_programa && pr.tipo_proceso === tipo);
  });

  const listaSubtiposRC = excluirSubtipoNuevo ? SUBTIPOS_RC.filter((s) => s.key !== "Nuevo") : SUBTIPOS_RC;
  const listaSubtiposAV = excluirSubtipoNuevo ? SUBTIPOS_AV.filter((s) => s.key !== "Nuevo") : SUBTIPOS_AV;

  const programaSel = programaId ? programas.find(p => p._id === programaId) : null;
  const programaBloqueadoPorPrefill = !!(
    prefillDesdeRecordatorio &&
    !prefillDesdeRecordatorio.soloTipo &&
    programaId
  );
  const procesoActivo = tipo && programaSel
    ? procesos.find(pr => pr.program_code === programaSel.dep_code_programa && pr.tipo_proceso === tipo)
    : undefined;

  const mostrarFormularioProgramaNuevo =
    subtipo === "Nuevo" &&
    (tipo === "RC" || (tipo === "AV" && !esPrimeraVezElegirTipoFlujo));

  const tituloModal = esSoloCrearPrograma
    ? "Crear programa"
    : esPrimeraVezElegirTipoFlujo
      ? "Nuevo proceso RC o AV"
      : "Agregar proceso";

  const programasListaPrimeraVez =
    tipo === "RC" ? programasSinProcesoRC : tipo === "AV" ? programasSinProcesoAV : [];

  /* ──────────────────────────────────────────────────────────────────────── */
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <Text fw={700} size="lg">{tituloModal}</Text>
          {!esSoloCrearPrograma && tipo && (
            <Badge color={tipo === "RC" ? "blue" : "violet"} variant="light">{tipo}</Badge>
          )}
          {!esSoloCrearPrograma && subtipo && (
            <Badge color="gray" variant="outline" size="sm" styles={{ label: { textTransform: "none" } }}>
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
              Registra los datos del programa. No se crea ningún proceso RC/AV; podrás iniciar el primero después con «Nuevo proceso RC o AV» o con el flujo completo de agregar proceso.
            </Text>
            <Divider label="Datos del programa" labelPosition="left" />
            <TextInput label="Nombre del programa" placeholder="Ej: Ingeniería de Sistemas"
              value={nombre} onChange={e => setNombre(e.currentTarget.value)} required />
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
              <TextInput label="Semestres" type="number" placeholder="Ej: 10"
                value={numSemestres} onChange={e => setNumSemestres(e.currentTarget.value)} />
              <TextInput label="Número de estudiantes en el primer periodo" type="number" placeholder="Ej: 250"
                value={numEstud} onChange={e => setNumEstud(e.currentTarget.value)} />
            </SimpleGrid>
            {error && <Notification color="red" withCloseButton={false}>{error}</Notification>}
            <Group justify="space-between" mt="sm">
              <Button variant="default" size="sm" onClick={handleClose}>Cancelar</Button>
              <Button size="sm" loading={saving} onClick={() => void handleCrearSoloPrograma()}>Crear programa</Button>
            </Group>
          </>
        ) : esPrimeraVezElegirTipoFlujo ? (
          <>
            {pvStep === 1 && (
              <>
                <Text size="sm" c="dimmed" mb="xs">
                  Indica si el primer proceso es Registro calificado o Acreditación voluntaria, ambos en subtipo <strong>Nuevo</strong> (sin resolución). Solo se listan programas que aún no tienen un proceso activo de ese tipo (p. ej. con RC Nuevo puedes crear AV Nuevo en el mismo programa).
                </Text>
                <SimpleGrid cols={2} spacing="md">
                  {(["RC", "AV"] as const).map(t => (
                    <Paper
                      key={t}
                      withBorder
                      radius="md"
                      p="lg"
                      style={{ cursor: "pointer", borderColor: tipo === t ? "#228be6" : undefined, borderWidth: 2, textAlign: "center" }}
                      onClick={() => {
                        setTipo(t);
                        setSubtipo("Nuevo");
                        setProgramaId(null);
                        setPvStep(2);
                      }}
                    >
                      <Badge color={t === "RC" ? "blue" : "violet"} size="xl" variant="light" mb="sm">{t}</Badge>
                      <Text fw={700} size="sm">{t === "RC" ? "Registro calificado — Nuevo" : "Acreditación voluntaria — Nuevo"}</Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {t === "RC" ? "Sin resolución; fechas en blanco." : "Sin resolución; fechas en blanco."}
                      </Text>
                    </Paper>
                  ))}
                </SimpleGrid>
                <Group justify="flex-end" mt="sm">
                  <Button variant="default" size="sm" onClick={handleClose}>Cancelar</Button>
                </Group>
              </>
            )}
            {pvStep === 2 && tipo && (
              <>
                <Text size="sm" c="dimmed">
                  {tipo === "RC"
                    ? "Programas sin proceso RC activo. Puedes elegir uno que ya tenga AV u otro tipo de gestión."
                    : "Programas sin proceso AV activo. Puedes elegir uno que ya tenga RC Nuevo u otro proceso RC."}
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
                    No hay programas elegibles para {tipo}. Crea uno con «Crear programa», o cierra el proceso {tipo} activo del programa.
                  </Text>
                )}
                {error && <Notification color="red" withCloseButton={false}>{error}</Notification>}
                <Group justify="space-between" mt="sm">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setError(null);
                      setPvStep(1);
                      setTipo(null);
                      setSubtipo(null);
                      setProgramaId(null);
                    }}
                  >
                    ← Elegir otro tipo
                  </Button>
                  <Button size="sm" loading={saving} onClick={() => void handleCrear()}>Crear proceso</Button>
                </Group>
              </>
            )}
          </>
        ) : (
          <>
      {/* ── Indicador de pasos ── */}
      <Group gap={4} mb="md">
        {([1, 2, 3] as const).map(n => (
          <Box key={n} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: step >= n ? "#228be6" : "#dee2e6" }} />
        ))}
      </Group>
      <Text size="xs" c="dimmed" mb="md" fw={500}>Paso {step} de 3 — {tituloPaso}</Text>

        {/* ───────────── PASO 1: TIPO ───────────── */}
        {step === 1 && (
          <SimpleGrid cols={2} spacing="md">
            {(["RC", "AV"] as const).map(t => (
              <Paper
                key={t}
                withBorder
                radius="md"
                p="lg"
                style={{ cursor: "pointer", borderColor: tipo === t ? "#228be6" : undefined, borderWidth: 2, textAlign: "center" }}
                onClick={() => {
                  setTipo(t);
                  setStep(2);
                }}
              >
                <Badge color={t === "RC" ? "blue" : "violet"} size="xl" variant="light" mb="sm">{t}</Badge>
                <Text fw={700} size="sm">{t === "RC" ? "Registro Calificado" : "Acreditación Voluntaria"}</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t === "RC" ? "6 subtipos disponibles" : "3 subtipos disponibles"}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        )}

        {/* ───────────── PASO 2: SUBTIPO ───────────── */}
        {step === 2 && tipo && (
          <>
            <Stack gap="sm">
              {(tipo === "RC" ? listaSubtiposRC : listaSubtiposAV).map(s => (
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
                    <div>
                      <Text fw={600} size="sm">{s.titulo}</Text>
                      <Text size="xs" c="dimmed">{s.desc}</Text>
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
                  <TextInput label="Semestres" type="number" placeholder="Ej: 10"
                    value={numSemestres} onChange={e => setNumSemestres(e.currentTarget.value)} />
                  <TextInput label="Número de estudiantes en el primer periodo" type="number" placeholder="Ej: 250"
                    value={numEstud} onChange={e => setNumEstud(e.currentTarget.value)} />
                </SimpleGrid>
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
                      <Text size="xs" c="orange">Todos los programas ya tienen un proceso de {tipo} activo.</Text>
                    )}
                  </>
                )}
              </>
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
                  <Text size="xs" c="dimmed">Este proceso quedará en Fase 7 permanente (solo documentos). Solo se calcula la fecha de vencimiento.</Text>
                )}
                {subtipo === "Reforma curricular" && (
                  <Text size="xs" c="dimmed">Se calcula la fecha de vencimiento. El resto de fechas quedan en blanco y son editables manualmente.</Text>
                )}
                {ES_AUTOCALCULO.has(subtipo) && (
                  <Text size="xs" c="dimmed">El sistema auto-calculará todas las fechas del proceso a partir de la resolución.</Text>
                )}
                <SimpleGrid cols={3} spacing="sm">
                  <div>
                    <Text size="sm" fw={500} mb={4}>Fecha de resolución</Text>
                    <DateInput
                      value={fechaRes ? new Date(fechaRes + "T12:00:00") : null}
                      onChange={val => setFechaRes(val ? val.toISOString().slice(0, 10) : "")}
                      valueFormat="YYYY-MM-DD" placeholder="YYYY-MM-DD" clearable
                      onKeyDown={e => e.preventDefault()}
                      styles={{ input: { caretColor: "transparent", cursor: "pointer" } }}
                    />
                  </div>
                  <TextInput label="Código de resolución" placeholder="Ej: 12345"
                    value={codigoRes} onChange={e => setCodigoRes(e.currentTarget.value)} />
                  <TextInput label="Duración (años)" placeholder="Ej: 7" type="number"
                    value={duracionRes}
                    onChange={e => setDuracionRes(e.currentTarget.value.replace(/\D/g, ""))} />
                </SimpleGrid>

                {/* PDF de la resolución */}
                <div>
                  <Text size="sm" fw={500} mb={4}>
                    PDF de la resolución{" "}
                    <Text span size="xs" c="dimmed">(opcional)</Text>
                  </Text>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    style={{ display: "none" }}
                    onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
                  />
                  <Group gap="sm" align="center">
                    <Button size="xs" variant="default" onClick={() => fileInputRef.current?.click()}>
                      📎 Seleccionar PDF
                    </Button>
                    {pdfFile ? (
                      <Group gap={4} align="center">
                        <Text size="xs" fw={500} c="blue">📄 {pdfFile.name}</Text>
                        <Button size="xs" variant="subtle" color="red" p={2}
                          onClick={() => { setPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                          ✕
                        </Button>
                      </Group>
                    ) : (
                      <Text size="xs" c="dimmed">Ningún archivo seleccionado</Text>
                    )}
                  </Group>
                </div>
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
                  onNavigateToGestion({ nombrePrograma: programaSel.nombre, tipo });
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
                  setStep(2);
                }}
              >
                ← Atrás
              </Button>
              <Button size="sm" loading={saving} onClick={() => void handleCrear()}>Crear proceso</Button>
            </Group>
          </>
        )}

          </>
        )}

      </Stack>
    </Modal>
  );
}
