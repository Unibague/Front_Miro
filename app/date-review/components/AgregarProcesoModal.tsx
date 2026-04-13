"use client";

import { useState, useRef } from "react";
import {
  Modal, Stack, Group, Button, Text, Paper, Select, TextInput,
  SimpleGrid, Notification, Badge, Divider, Box,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import axios from "axios";
import type { Dependency, Program, Process } from "../types";

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
];

const SUBTIPOS_AV = [
  {
    key: "Primera vez",
    titulo: "Primera vez",
    desc: "Primera acreditación. Sin resolución ni fecha de vencimiento — todas las fechas en blanco y editables.",
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

interface Props {
  opened: boolean;
  onClose: () => void;
  programas: Program[];
  facultades: Dependency[];
  procesos: Process[];
  onCreated: () => Promise<void>;
}

export default function AgregarProcesoModal({
  opened, onClose, programas, facultades, procesos, onCreated,
}: Props) {

  /* ── Navegación de pasos ── */
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
  const [admision, setAdmision]       = useState("");
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

  /* ── Reset total ── */
  const reset = () => {
    setStep(1); setTipo(null); setSubtipo(null); setProgramaId(null);
    setNombre(""); setCodigoSnies(""); setFacultad(null); setModalidad(null);
    setNivelAcad(null); setNivelForm(null); setNumCreditos(""); setNumSemestres("");
    setAdmision(""); setNumEstud("");
    setFechaRes(""); setCodigoRes(""); setDuracionRes("");
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSaving(false); setError(null);
  };

  const handleClose = () => { reset(); onClose(); };

  /* ── Validar y enviar ── */
  const handleCrear = async () => {
    setError(null);

    const necesitaRes = NECESITA_RESOLUCION.has(subtipo ?? "");

    if (subtipo === "Nuevo") {
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

    // Verificar si ya existe proceso de ese tipo para el programa seleccionado
    if (subtipo !== "Nuevo") {
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
      const progSel = subtipo !== "Nuevo"
        ? programas.find(p => p._id === programaId)
        : null;

      const body: Record<string, unknown> = {
        tipo_proceso: tipo,
        subtipo,
      };

      if (subtipo === "Nuevo") {
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
          admision_estudiantes: admision.trim() || null,
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

      // Subir el PDF de resolución si se seleccionó uno
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

  /* ──────────────────────────────────────────────────────────────────────── */
  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <Text fw={700} size="lg">Agregar proceso</Text>
          {tipo && <Badge color={tipo === "RC" ? "blue" : "violet"} variant="light">{tipo}</Badge>}
          {subtipo && <Badge color="gray" variant="outline" size="sm">{subtipo}</Badge>}
        </Group>
      }
      size="lg" centered radius="md"
    >
      {/* ── Indicador de pasos ── */}
      <Group gap={4} mb="md">
        {([1, 2, 3] as const).map(n => (
          <Box key={n} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: step >= n ? "#228be6" : "#dee2e6" }} />
        ))}
      </Group>
      <Text size="xs" c="dimmed" mb="md" fw={500}>Paso {step} de 3 — {tituloPaso}</Text>

      <Stack gap="md">

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
                onClick={() => { setTipo(t); setStep(2); }}
              >
                <Badge color={t === "RC" ? "blue" : "violet"} size="xl" variant="light" mb="sm">{t}</Badge>
                <Text fw={700} size="sm">{t === "RC" ? "Registro Calificado" : "Acreditación Voluntaria"}</Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t === "RC" ? "5 subtipos disponibles" : "2 subtipos disponibles"}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        )}

        {/* ───────────── PASO 2: SUBTIPO ───────────── */}
        {step === 2 && tipo && (
          <>
            <Stack gap="sm">
              {(tipo === "RC" ? SUBTIPOS_RC : SUBTIPOS_AV).map(s => (
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
              <Button variant="default" size="sm" onClick={() => { setStep(1); setSubtipo(null); }}>← Atrás</Button>
              <Button size="sm" disabled={!subtipo} onClick={() => setStep(3)}>Siguiente →</Button>
            </Group>
          </>
        )}

        {/* ───────────── PASO 3: DATOS ───────────── */}
        {step === 3 && subtipo && (
          <>
            {/* RC Nuevo: crear programa */}
            {subtipo === "Nuevo" && (
              <>
                <Divider label="Datos del programa nuevo" labelPosition="left" />
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
                  <TextInput label="Admisión de estudiantes" placeholder="Ej: Semestral"
                    value={admision} onChange={e => setAdmision(e.currentTarget.value)} />
                  <TextInput label="Créditos" type="number" placeholder="Ej: 173"
                    value={numCreditos} onChange={e => setNumCreditos(e.currentTarget.value)} />
                  <TextInput label="Semestres" type="number" placeholder="Ej: 10"
                    value={numSemestres} onChange={e => setNumSemestres(e.currentTarget.value)} />
                  <TextInput label="Nro. estudiantes a ingresar (SACES)" type="number" placeholder="Ej: 250"
                    value={numEstud} onChange={e => setNumEstud(e.currentTarget.value)} />
                </SimpleGrid>
                <Text size="xs" c="dimmed" mt={-4}>
                  El proceso se creará sin resolución ni fechas. Podrás editar las fechas manualmente después.
                </Text>
              </>
            )}

            {/* Todos excepto RC Nuevo: seleccionar programa existente */}
            {subtipo !== "Nuevo" && (
              <>
                <Divider label="Programa" labelPosition="left" />
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

            {/* Datos de resolución */}
            {NECESITA_RESOLUCION.has(subtipo) && (
              <>
                <Divider label="Resolución vigente" labelPosition="left" />
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

            {/* Mensajes informativos por subtipo */}
            {(subtipo === "Primera vez") && (
              <Text size="xs" c="dimmed" mt={4}>
                AV Primera vez: sin resolución ni fecha de vencimiento. Todas las fechas quedan en blanco y son editables manualmente.
              </Text>
            )}

            {error && <Notification color="red" withCloseButton={false}>{error}</Notification>}

            <Group justify="space-between" mt="sm">
              <Button variant="default" size="sm" onClick={() => { setStep(2); setError(null); }}>← Atrás</Button>
              <Button size="sm" loading={saving} onClick={handleCrear}>Crear proceso</Button>
            </Group>
          </>
        )}

      </Stack>
    </Modal>
  );
}
