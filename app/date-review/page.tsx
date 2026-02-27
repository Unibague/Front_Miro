"use client";

import { useState, useEffect } from "react";
import { Title, Select, Button, Text, Paper, Box, SimpleGrid, Group, Loader, Table, ScrollArea, Modal, TextInput, Stack, Notification, Divider, Badge, Anchor } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { useRole } from "@/app/context/RoleContext";
import axios from "axios";
import DropzoneCustomComponent from "@/app/components/DropzoneCustomDrop/DropzoneCustomDrop";

type Dependency = {
  _id: string;
  dep_code: string;
  name: string;
  dep_father: string | null;
};

type Program = {
  _id: string;
  nombre: string;
  dep_code_facultad: string;
  dep_code_programa: string;
  modalidad: string | null;
  nivel_academico: string | null;
  nivel_formacion: string | null;
  num_creditos: number | null;
  num_semestres: number | null;
  estado: string;
  fecha_resolucion_rc: string | null;
  codigo_resolucion_rc: string | null;
  duracion_resolucion_rc: number | null;
  fecha_resolucion_av: string | null;
  codigo_resolucion_av: string | null;
  duracion_resolucion_av: number | null;
  fecha_resolucion_pm: string | null;
  codigo_resolucion_pm: string | null;
  duracion_resolucion_pm: number | null;
};

type Process = {
  _id: string;
  name: string;
  program_code: string;
  tipo_proceso: "RC" | "AV" | "PM";
  fase_actual: number;
  observaciones: string;
  condicion: number | null;
  fecha_vencimiento: string | null;
  fecha_inicio: string | null;
  fecha_documento_par: string | null;
  fecha_digitacion_saces: string | null;
  fecha_radicado_men: string | null;
  // Fechas extra AV
  fecha_envio_pm_vicerrectoria?: string | null;
  fecha_entrega_pm_cna?: string | null;
  fecha_envio_avance_vicerrectoria?: string | null;
  fecha_radicacion_avance_cna?: string | null;
};

type PhaseDocument = {
  _id: string;
  phase_id: string;
  name: string;
  drive_id: string;
  view_link: string;
  download_link: string;
  mime_type?: string | null;
  size?: number | null;
  createdAt?: string;
};

type Actividad = {
  _id: string;
  nombre: string;
  responsables: string;
  completada: boolean;
};

type Phase = {
  _id: string;
  proceso_id: string;
  numero: number;
  nombre: string;
  actividades: Actividad[];
};

/* ── Fases 0‑6 ── */
const faseColors = [
  { fase: 0, color: "#ced4da", label: "Fase 0" },
  { fase: 1, color: "#ff6b6b", label: "Fase 1" },
  { fase: 2, color: "#ffa94d", label: "Fase 2" },
  { fase: 3, color: "#ffd43b", label: "Fase 3" },
  { fase: 4, color: "#74c0fc", label: "Fase 4" },
  { fase: 5, color: "#a9e34b", label: "Fase 5" },
  { fase: 6, color: "#69db7c", label: "Fase 6" },
];

type BarRow = {
  nombre: string;
  fase_0: number; fase_1: number; fase_2: number;
  fase_3: number; fase_4: number; fase_5: number; fase_6: number;
};

const StackedBar = ({ row }: { row: BarRow }) => {
  const vals = [row.fase_0, row.fase_1, row.fase_2, row.fase_3, row.fase_4, row.fase_5, row.fase_6];
  const total = vals.reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: "flex", height: "28px", borderRadius: "6px", overflow: "hidden", width: "100%" }}>
      {vals.map((v, i) => v > 0 && (
        <div key={i} style={{
          width: `${(v / total) * 100}%`,
          backgroundColor: faseColors[i].color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 600, color: "#333",
        }}>
          {v}
        </div>
      ))}
    </div>
  );
};

const BarTable = ({ title, data }: { title: string; data: BarRow[] }) => (
  <Paper withBorder radius="md" p="md" mb="lg">
    <Text fw={700} ta="center" mb="md" size="sm">{title}</Text>
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {data.length === 0 ? (
        <Text ta="center" c="dimmed" size="sm">Sin datos para el filtro seleccionado</Text>
      ) : data.map((row, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Text size="xs" style={{ width: "160px", flexShrink: 0 }}>{row.nombre}:</Text>
          <div style={{ flex: 1 }}><StackedBar row={row} /></div>
        </div>
      ))}
    </div>
    <Group gap="md" mt="md" justify="center" wrap="wrap">
      {faseColors.map((f) => (
        <Group key={f.fase} gap={4}>
          <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: f.color }} />
          <Text size="xs">{f.label}</Text>
        </Group>
      ))}
    </Group>
  </Paper>
);

/* ── Mapa de colores por estado de proceso ── */
const estadoColor: Record<string, string> = {
  "Completo":                        "#69db7c",
  "Inicio del proceso":              "#ffd43b",
  "Documentación de lectura de par": "#ffa94d",
  "Digitación en SACES":             "#f783ac",
  "Fecha Límite":                    "#ff6b6b",
};

const FaseBadge = ({ fase }: { fase: number | null }) => {
  if (fase === null || fase === undefined) return <Text size="xs" c="dimmed" ta="center">—</Text>;
  const color = faseColors[fase]?.color ?? "#ced4da";
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div style={{
        backgroundColor: color,
        borderRadius: "6px",
        padding: "2px 10px",
      }}>
        <Text size="xs" fw={600} c="#333">Fase {fase}</Text>
      </div>
    </div>
  );
};

type ProcesoRow = {
  programa: Program;
  acreditacion: number | null;
  registro: number | null;
  plan: number | null;
};

const COLS_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const ProcesoTable = ({ title, rows, tipoProceso, programaFiltro, onRowClick }: {
  title: string;
  rows: ProcesoRow[];
  tipoProceso: string;
  programaFiltro: string;
  onRowClick: (p: Program) => void;
}) => {
  const modoPrograma = programaFiltro !== "Todos";
  const mostrarRC    = !modoPrograma && (tipoProceso === "Todos" || tipoProceso === "Registro calificado");
  const mostrarAV    = !modoPrograma && (tipoProceso === "Todos" || tipoProceso === "Acreditación voluntaria");
  const mostrarPM    = !modoPrograma && (tipoProceso === "Todos" || tipoProceso === "Plan de mejoramiento");
  const colSpan      = modoPrograma ? 10 : 1 + (mostrarRC ? 1 : 0) + (mostrarAV ? 1 : 0) + (mostrarPM ? 1 : 0);

  return (
    <Paper withBorder radius="md" p="md" mb="lg">
      <Text fw={700} ta="center" mb="md" size="sm">{title}</Text>
      <ScrollArea>
        <Table withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ minWidth: 180 }}> </Table.Th>
              {modoPrograma
                ? COLS_9.map((n) => <Table.Th key={n} ta="center">{n}</Table.Th>)
                : <>
                    {mostrarRC && <Table.Th ta="center">Registro calificado</Table.Th>}
                    {mostrarAV && <Table.Th ta="center">Acreditación voluntaria</Table.Th>}
                    {mostrarPM && <Table.Th ta="center">Plan de mejoramiento</Table.Th>}
                  </>
              }
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={colSpan}>
                  <Text ta="center" c="dimmed" size="sm">Sin datos para el filtro seleccionado</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((row, i) => (
                <Table.Tr key={i} style={{ cursor: "pointer" }} onClick={() => onRowClick(row.programa)}>
                  <Table.Td><Text size="xs" fw={600}>{row.programa.nombre}</Text></Table.Td>
                  {modoPrograma
                    ? COLS_9.map((n) => <Table.Td key={n} ta="center"><Text size="xs" c="dimmed">—</Text></Table.Td>)
                    : <>
                        {mostrarRC && <Table.Td><FaseBadge fase={row.registro} /></Table.Td>}
                        {mostrarAV && <Table.Td><FaseBadge fase={row.acreditacion} /></Table.Td>}
                        {mostrarPM && <Table.Td><FaseBadge fase={row.plan} /></Table.Td>}
                      </>
                  }
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
};

const selectorStyle = {
  root: {
    backgroundColor: "var(--mantine-color-blue-light)",
    borderRadius: "10px",
    padding: "8px 10px 10px",
  },
  label: {
    color: "var(--mantine-color-blue-light-color)",
    fontWeight: 600 as const,
    textAlign: "center" as const,
    width: "100%",
    display: "block",
    marginBottom: "6px",
  },
  input: {
    backgroundColor: "white",
    border: "none",
    borderRadius: "6px",
    textAlign: "center" as const,
    color: "#333",
    caretColor: "transparent",
    cursor: "pointer",
  },
  option: {
    borderBottom: "1px solid #dee2e6",
    paddingTop: "8px",
    paddingBottom: "8px",
  },
};

/* ─────────────────────────────────────────────
   Componente ProcesoDetalle
   Muestra las 3 tarjetas (RC, AV, PM) cuando
   hay un programa específico seleccionado.
───────────────────────────────────────────── */
// Columnas de fechas para RC y PM
const COLUMNAS_FECHA_RC_PM = [
  { key: "fecha_vencimiento",      label: "Fecha vencimiento",             sub: "calculada con duración resolución" },
  { key: "fecha_inicio",           label: "Inicio proceso",                sub: "29 meses antes del vencimiento" },
  { key: "fecha_documento_par",    label: "Documento para lectura del par", sub: "17 meses antes del vencimiento" },
  { key: "fecha_digitacion_saces", label: "Digitación en el SACES",        sub: "15 meses antes del vencimiento" },
  { key: "fecha_radicado_men",     label: "Fecha radicado en el MEN",      sub: "12 meses antes del vencimiento" },
] as const;

// Columnas de fechas principales para Acreditación Voluntaria (AV)
// (las fechas de envío PM y envío de avance se muestran abajo para no ensanchar la tabla)
const COLUMNAS_FECHA_AV = [
  {
    key: "fecha_vencimiento",
    label: "Fecha de la resolución AV / vencimiento",
    sub: "resolución + duración (años)",
  },
  {
    key: "fecha_entrega_pm_cna",
    label: "Entrega Plan de mejoramiento al CNA",
    sub: "≈ 6 meses después del acto administrativo",
  },
  {
    key: "fecha_radicacion_avance_cna",
    label: "Radicación ante CNA informe avance Plan de mejoramiento",
    sub: "≈ mitad de la vigencia de la acreditación",
  },
  {
    key: "fecha_inicio",
    label: "Iniciación proceso A.V.",
    sub: "≈ 33 meses antes del vencimiento",
  },
  {
    key: "fecha_documento_par",
    label: "Documento para lectura del par",
    sub: "≈ 16 meses antes del vencimiento",
  },
  {
    key: "fecha_digitacion_saces",
    label: "Digitación en SACES-CNA",
    sub: "≈ 15 meses antes del vencimiento",
  },
  {
    key: "fecha_radicado_men",
    label: "Fecha radicación solicitud de AV",
    sub: "≈ 12 meses antes del vencimiento",
  },
] as const;

const LABEL_PROCESO: Record<string, string> = {
  RC: "Registro calificado",
  AV: "Acreditación voluntaria",
  PM: "Plan de mejoramiento",
};

const COLOR_PROCESO: Record<string, string> = {
  RC: "#74c0fc",
  AV: "#b197fc",
  PM: "#8ce99a",
};

type ProcesoDetalleProps = {
  proceso: Process;
  programa: Program;
  fases: Phase[];
  onUpdateProceso: (updated: Process) => void;
  onUpdateFases: (updated: Phase[]) => void;
  onUpdatePrograma: (updated: Program) => void;
  onRefreshProcesos: (programCode: string) => Promise<void>;
};

const ProcesoDetalleCard = ({ proceso, programa, fases, onUpdateProceso, onUpdateFases, onUpdatePrograma, onRefreshProcesos }: ProcesoDetalleProps) => {
  const faseActual = fases.find(f => f.numero === proceso.fase_actual);
  const ultimaActiva = faseActual?.actividades.filter(a => !a.completada)[0] ?? null;

  /* Modal actualizar resolución */
  const [resolucionOpen, setResolucionOpen] = useState(false);
  const [resForm, setResForm] = useState({ fecha: "", codigo: "", duracion: "" });
  const [savingRes, setSavingRes] = useState(false);

  const abrirResolucion = () => {
    const sufijo = proceso.tipo_proceso.toLowerCase() as "rc" | "av" | "pm";
    setResForm({
      fecha:    (programa[`fecha_resolucion_${sufijo}` as keyof Program] as string) ?? "",
      codigo:   (programa[`codigo_resolucion_${sufijo}` as keyof Program] as string) ?? "",
      duracion: String((programa[`duracion_resolucion_${sufijo}` as keyof Program] as number) ?? ""),
    });
    setResolucionOpen(true);
  };

  const guardarResolucion = async () => {
    setSavingRes(true);
    const sufijo = proceso.tipo_proceso.toLowerCase();
    const payload: Record<string, string | number | null> = {
      [`fecha_resolucion_${sufijo}`]:    resForm.fecha || null,
      [`codigo_resolucion_${sufijo}`]:   resForm.codigo || null,
      [`duracion_resolucion_${sufijo}`]: resForm.duracion ? parseInt(resForm.duracion) : null,
    };
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/programs/${programa._id}`, payload);
      onUpdatePrograma(res.data);
      await onRefreshProcesos(programa.dep_code_programa);
      setResolucionOpen(false);
    } catch (e) { console.error(e); }
    finally { setSavingRes(false); }
  };

  /* Modal observaciones (único por proceso) */
  const [obsOpen, setObsOpen] = useState(false);
  const [obsTexto, setObsTexto] = useState("");
  const [savingObs, setSavingObs] = useState(false);

  const abrirObs = () => {
    setObsTexto(proceso.observaciones ?? "");
    setObsOpen(true);
  };

  const guardarObs = async () => {
    setSavingObs(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`, { observaciones: obsTexto });
      onUpdateProceso(res.data);
    } catch (e) { console.error(e); }
    finally { setSavingObs(false); setObsOpen(false); }
  };

  /* Edición de condición/factor */
  const [savingCondicion, setSavingCondicion] = useState(false);
  const guardarCondicion = async (val: string | null) => {
    const num = val ? parseInt(val) : null;
    setSavingCondicion(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`, { condicion: num });
      onUpdateProceso(res.data);
    } catch (e) { console.error(e); }
    finally { setSavingCondicion(false); }
  };

  /* Edición de fechas inline */
  const [editingDateKey, setEditingDateKey] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState(false);
  const saveDate = async (key: string, val: Date | null) => {
    setSavingDate(true);
    setEditingDateKey(null);
    try {
      const fechaStr = val ? val.toISOString().slice(0, 10) : null;
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`, { [key]: fechaStr });
      onUpdateProceso(res.data);
    } catch (e) { console.error(e); }
    finally { setSavingDate(false); }
  };

  /* Modal checklist */
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [editActividadId, setEditActividadId] = useState<string | null>(null);
  const [editActividadNombre, setEditActividadNombre] = useState("");
  const [nuevaActividad, setNuevaActividad] = useState("");
  const [savingActividad, setSavingActividad] = useState(false);

  /* Documentos por fase */
  const [docsOpen, setDocsOpen] = useState(false);
  const [docs, setDocs] = useState<PhaseDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const toggleCompletada = async (fase: Phase, act: Actividad) => {
    try {
      const nuevaCompletada = !act.completada;
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}`,
        { completada: nuevaCompletada }
      );
      const faseActualizada: Phase = res.data;
      const fasesActualizadas = fases.map(f => f._id === fase._id ? faseActualizada : f);
      onUpdateFases(fasesActualizadas);

      /* Si todas las actividades de la fase actual quedaron completas → avanzar fase */
      if (nuevaCompletada && faseActualizada.actividades.every(a => a.completada)) {
        const siguienteFase = proceso.fase_actual + 1;
        if (siguienteFase <= 6) {
          const procRes = await axios.put(
            `${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`,
            { fase_actual: siguienteFase }
          );
          onUpdateProceso(procRes.data);
        }
      }
    } catch (e) { console.error(e); }
  };

  const cargarDocumentos = async () => {
    if (!faseActual) return;
    setLoadingDocs(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/phase-documents`, {
        params: { phase_id: faseActual._id },
      });
      const data = Array.isArray(res.data) ? res.data as PhaseDocument[] : [];
      setDocs(data);
      setDocsOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDocs(false);
    }
  };

  const subirDocumento = async (files: File[]) => {
    if (!faseActual || files.length === 0) return;
    const file = files[0];
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/phase-documents/${faseActual._id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setDocs(prev => [res.data as PhaseDocument, ...prev]);
    } catch (e) {
      console.error(e);
    } finally {
      setUploadingDoc(false);
    }
  };

  const eliminarDocumento = async (docId: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/phase-documents/${docId}`);
      setDocs(prev => prev.filter(d => d._id !== docId));
    } catch (e) {
      console.error(e);
    }
  };

  const guardarNombreActividad = async (fase: Phase, act: Actividad) => {
    if (!editActividadNombre.trim()) return;
    setSavingActividad(true);
    try {
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}`,
        { nombre: editActividadNombre.trim() }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
      setEditActividadId(null);
    } catch (e) { console.error(e); }
    finally { setSavingActividad(false); }
  };

  const eliminarActividad = async (fase: Phase, actId: string) => {
    try {
      const res = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${actId}`
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
    } catch (e) { console.error(e); }
  };

  const agregarActividad = async (fase: Phase) => {
    if (!nuevaActividad.trim()) return;
    setSavingActividad(true);
    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades`,
        { nombre: nuevaActividad.trim() }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
      setNuevaActividad("");
    } catch (e) { console.error(e); }
    finally { setSavingActividad(false); }
  };

  const color = COLOR_PROCESO[proceso.tipo_proceso];
  const maxCondicion = proceso.tipo_proceso === "RC" ? 9 : proceso.tipo_proceso === "AV" ? 12 : null;
  const resolucionFecha = proceso.tipo_proceso === "RC" ? programa.fecha_resolucion_rc
    : proceso.tipo_proceso === "AV" ? programa.fecha_resolucion_av
    : programa.fecha_resolucion_pm;
  const resolucionCodigo = proceso.tipo_proceso === "RC" ? programa.codigo_resolucion_rc
    : proceso.tipo_proceso === "AV" ? programa.codigo_resolucion_av
    : programa.codigo_resolucion_pm;

  const condicionLabel = proceso.tipo_proceso === "RC" ? "Condición" : "Factor";
  const condicionOpts = maxCondicion
    ? Array.from({ length: maxCondicion }, (_, i) => ({ value: String(i + 1), label: `${condicionLabel} ${i + 1}` }))
    : [];

  return (
    <Paper withBorder radius="md" mb="md" style={{ overflow: "hidden" }}>
      {/* Header del proceso */}
      <div style={{ backgroundColor: color, padding: "10px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
        {/* Izquierda: botón actualizar */}
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <Button size="xs" variant="white" color="dark" onClick={abrirResolucion}>
            Actualizar resolución
          </Button>
        </div>
        {/* Centro: título */}
        <Text fw={700} c="#333" size="md" ta="center">{LABEL_PROCESO[proceso.tipo_proceso]}</Text>
        {/* Derecha: condición/factor */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {maxCondicion && (
            <Select
              data={condicionOpts}
              value={proceso.condicion != null ? String(proceso.condicion) : null}
              onChange={guardarCondicion}
              placeholder={`Seleccionar ${condicionLabel}`}
              size="xs"
              disabled={savingCondicion}
              clearable={false}
              style={{ minWidth: 170 }}
              styles={{ input: { caretColor: "transparent", cursor: "pointer", backgroundColor: "rgba(255,255,255,0.7)", fontWeight: 600 } }}
            />
          )}
        </div>
      </div>

      {/* Tabla de fechas */}
      <ScrollArea>
        <Table withTableBorder withColumnBorders style={{ minWidth: 800 }}>
          <Table.Thead>
            <Table.Tr>
              {/* Columna resolución */}
              <Table.Th style={{ width: 140, backgroundColor: "#f8f9fa" }}>
                <Text size="xs" fw={700} ta="center">Resolución vigente</Text>
              </Table.Th>
              {(proceso.tipo_proceso === "AV" ? COLUMNAS_FECHA_AV : COLUMNAS_FECHA_RC_PM).map(col => (
                <Table.Th key={col.key} style={{ backgroundColor: "#f8f9fa" }}>
                  <Text size="xs" fw={700} ta="center">{col.label}</Text>
                  <Text size="xs" c="dimmed" ta="center">({col.sub})</Text>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              {/* Celda resolución */}
              <Table.Td style={{ verticalAlign: "top" }}>
                {resolucionFecha ? (
                  <Stack gap={2} align="center">
                    <Text size="xs" fw={600} ta="center">{resolucionFecha}</Text>
                    <Text size="xs" c="dimmed" ta="center">{resolucionCodigo ?? "—"}</Text>
                  </Stack>
                ) : (
                  <Text size="xs" c="orange" fw={600} ta="center">Pendiente</Text>
                )}
              </Table.Td>
              {/* Celdas de fechas */}
              {(proceso.tipo_proceso === "AV" ? COLUMNAS_FECHA_AV : COLUMNAS_FECHA_RC_PM).map(col => {
                const fecha = proceso[col.key as keyof Process] as string | null;
                const isEditing = editingDateKey === col.key;
                const dateVal = fecha ? new Date(fecha + "T12:00:00") : null;
                return (
                  <Table.Td key={col.key} style={{ verticalAlign: "top", minWidth: 140 }}>
                    <Stack gap={4} align="center">
                      {isEditing ? (
                        <DateInput
                          value={dateVal}
                          onChange={(val) => saveDate(col.key, val)}
                          valueFormat="YYYY-MM-DD"
                          size="xs"
                          autoFocus
                          onBlur={() => setEditingDateKey(null)}
                          style={{ width: 130 }}
                          clearable
                          disabled={savingDate}
                          onKeyDown={(e) => e.preventDefault()}
                          styles={{ input: { caretColor: "transparent", cursor: "pointer" } }}
                        />
                      ) : (
                      <Text
                        size="xs"
                        fw={600}
                        ta="center"
                        style={{
                          cursor: "pointer",
                          padding: "2px 8px",
                          borderRadius: 4,
                          border: "1px dashed #4dabf7",
                          backgroundColor: "#e7f5ff",
                          color: fecha ? "#1c7ed6" : "#adb5bd",
                        }}
                        title="Clic para editar fecha"
                        onClick={() => setEditingDateKey(col.key)}
                      >
                        {fecha ? fecha : <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
                      </Text>
                      )}
                      <Text
                        size="xs"
                        c={proceso.observaciones ? "#1971c2" : "#74c0fc"}
                        td="underline"
                        style={{ cursor: "pointer" }}
                        onClick={abrirObs}
                      >
                        {proceso.observaciones ? "Ver observaciones" : "Observaciones"}
                      </Text>
                    </Stack>
                  </Table.Td>
                );
              })}
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* Bloque compacto para fechas de envío (solo AV) */}
      {proceso.tipo_proceso === "AV" && (
        <Box px="md" pt="sm" pb="sm">
          <Divider label="Fechas de envío" labelPosition="center" mb="xs" />
          <Group justify="center" gap="xl" wrap="wrap">
            {[
              {
                key: "fecha_envio_pm_vicerrectoria" as const,
                label: "Enviar a la Vicerrectoría informe Plan de mejoramiento",
              },
              {
                key: "fecha_envio_avance_vicerrectoria" as const,
                label: "Enviar a la Vicerrectoría informe de avance Plan de mejoramiento",
              },
            ].map((item) => {
              const fecha = proceso[item.key] as string | null | undefined;
              const isEditing = editingDateKey === item.key;
              const dateVal = fecha ? new Date(fecha + "T12:00:00") : null;
              return (
                <Stack key={item.key} gap={4} align="center" style={{ minWidth: 220 }}>
                  <Text size="xs" fw={600}>{item.label}</Text>
                  {isEditing ? (
                    <DateInput
                      value={dateVal}
                      onChange={(val) => saveDate(item.key, val)}
                      valueFormat="YYYY-MM-DD"
                      size="xs"
                      autoFocus
                      onBlur={() => setEditingDateKey(null)}
                      style={{ width: 160 }}
                      clearable
                      disabled={savingDate}
                      onKeyDown={(e) => e.preventDefault()}
                      styles={{ input: { caretColor: "transparent", cursor: "pointer" } }}
                    />
                  ) : (
                    <Text
                      size="xs"
                      fw={600}
                      ta="center"
                      style={{
                        cursor: "pointer",
                        padding: "2px 8px",
                        borderRadius: 4,
                        border: "1px dashed #4dabf7",
                        backgroundColor: "#e7f5ff",
                        color: fecha ? "#1c7ed6" : "#adb5bd",
                      }}
                      title="Clic para editar fecha"
                      onClick={() => setEditingDateKey(item.key)}
                    >
                      {fecha ? fecha : <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
                    </Text>
                  )}
                </Stack>
              );
            })}
          </Group>
        </Box>
      )}

      {/* Footer: fase actual + actividad + documentos */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #dee2e6", display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Fase actual + actividad */}
        <div style={{ flex: 1 }}>
          <Group gap="sm" align="center">
            <div style={{
              backgroundColor: faseColors[proceso.fase_actual]?.color ?? "#ced4da",
              borderRadius: 6, padding: "2px 10px",
            }}>
              <Text size="xs" fw={600} c="#333">Fase {proceso.fase_actual}</Text>
            </div>
            {faseActual && <Text size="xs" c="dimmed">{faseActual.nombre}</Text>}
          </Group>
          {ultimaActiva && (
            <Group gap="xs" mt={6} align="center">
              <Text size="xs" c="#555">
                Actividad actual: <strong>{ultimaActiva.nombre}</strong>
              </Text>
              <Button size="xs" variant="light" onClick={() => setChecklistOpen(true)}>
                Ver actividades
              </Button>
            </Group>
          )}
          {!ultimaActiva && faseActual && (
            <Group gap="xs" mt={6}>
              <Text size="xs" c="green" fw={600}>✓ Todas las actividades completadas</Text>
              <Button size="xs" variant="light" onClick={() => setChecklistOpen(true)}>
                Ver actividades
              </Button>
            </Group>
          )}
        </div>

        {/* Documentos por fase */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Text size="xs" c="dimmed">Documentos — Fase {proceso.fase_actual}</Text>
          <Button size="xs" variant="outline" color="gray" onClick={cargarDocumentos}>
            📎 Ver / cargar documentos
          </Button>
        </div>
      </div>

      {/* Modal actualizar resolución */}
      <Modal
        opened={resolucionOpen}
        onClose={() => setResolucionOpen(false)}
        title={`Actualizar resolución — ${LABEL_PROCESO[proceso.tipo_proceso]}`}
        centered size="sm" radius="md"
      >
        <Stack>
          <Text size="xs" c="dimmed">
            Al guardar, el sistema recalculará automáticamente todas las fechas del proceso.
          </Text>
          <div>
            <Text size="sm" fw={500} mb={4}>Fecha de resolución vigente</Text>
            <DateInput
              value={resForm.fecha ? new Date(resForm.fecha + "T12:00:00") : null}
              onChange={(val) => setResForm(f => ({ ...f, fecha: val ? val.toISOString().slice(0, 10) : "" }))}
              valueFormat="YYYY-MM-DD"
              placeholder="YYYY-MM-DD"
              clearable
              onKeyDown={(e) => e.preventDefault()}
              styles={{ input: { caretColor: "transparent", cursor: "pointer" } }}
            />
          </div>
          <TextInput
            label="Código de resolución"
            placeholder="Ej: 12345"
            value={resForm.codigo}
            onChange={(e) => setResForm(f => ({ ...f, codigo: e.currentTarget.value }))}
          />
          <TextInput
            label="Duración de la resolución (meses)"
            placeholder="Ej: 84"
            value={resForm.duracion}
            onChange={(e) => {
              const v = e.currentTarget.value.replace(/\D/g, "");
              setResForm(f => ({ ...f, duracion: v }));
            }}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" size="sm" onClick={() => setResolucionOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={savingRes} onClick={guardarResolucion}>Guardar y recalcular</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal observaciones del proceso */}
      <Modal
        opened={obsOpen}
        onClose={() => setObsOpen(false)}
        title={`Observaciones — ${LABEL_PROCESO[proceso.tipo_proceso]}`}
        centered size="md" radius="md"
      >
        <Stack>
          <textarea
            value={obsTexto}
            onChange={e => setObsTexto(e.target.value)}
            rows={6}
            style={{ width: "100%", borderRadius: 8, border: "1px solid #dee2e6", padding: "8px 12px", fontSize: 14, resize: "vertical" }}
            placeholder="Escribe las observaciones del proceso aquí..."
          />
          <Group justify="flex-end">
            <Button variant="default" size="sm" onClick={() => setObsOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={savingObs} onClick={guardarObs}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal documentos de la fase actual */}
      <Modal
        opened={docsOpen}
        onClose={() => setDocsOpen(false)}
        title={faseActual ? `Documentos — ${faseActual.nombre}` : "Documentos de fase"}
        centered
        size="lg"
        radius="md"
      >
        {!faseActual ? (
          <Text size="sm" c="dimmed">No hay fase actual seleccionada.</Text>
        ) : (
          <Stack gap="md">
            <DropzoneCustomComponent
              text={uploadingDoc ? "Subiendo documento..." : "Haz clic o arrastra un archivo para subirlo a esta fase"}
              onDrop={subirDocumento}
            />

            <Divider label="Documentos de esta fase" labelPosition="center" />

            {loadingDocs ? (
              <Group justify="center">
                <Loader size="sm" />
              </Group>
            ) : docs.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center">
                No hay documentos cargados para esta fase.
              </Text>
            ) : (
              <ScrollArea style={{ maxHeight: 260 }}>
                <Stack gap="xs">
                  {docs.map(doc => (
                    <Group key={doc._id} justify="space-between" align="center">
                      <div style={{ maxWidth: "70%" }}>
                        <Text size="sm" fw={500} truncate="end">{doc.name}</Text>
                        {doc.size != null && (
                          <Text size="xs" c="dimmed">
                            {(doc.size / (1024 * 1024)).toFixed(2)} MB
                          </Text>
                        )}
                      </div>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          component="a"
                          href={doc.view_link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          color="red"
                          onClick={() => eliminarDocumento(doc._id)}
                        >
                          Eliminar
                        </Button>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea>
            )}
          </Stack>
        )}
      </Modal>

      {/* Modal checklist de actividades */}
      <Modal
        opened={checklistOpen}
        onClose={() => { setChecklistOpen(false); setEditActividadId(null); setNuevaActividad(""); }}
        title={faseActual ? `${faseActual.nombre} — Fase ${proceso.fase_actual}` : "Actividades"}
        centered size="lg" radius="md"
      >
        {faseActual && (
          <Stack gap="sm">
            {faseActual.actividades.map((act, index) => {
              const firstIncompleteIndex = faseActual.actividades.findIndex(a => !a.completada);
              const isFirstIncomplete = !act.completada && index === firstIncompleteIndex;
              const canToggle = act.completada || isFirstIncomplete;
              return (
              <Paper key={act._id} withBorder radius="sm" p="sm">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={act.completada}
                      onChange={() => canToggle && toggleCompletada(faseActual, act)}
                      disabled={!canToggle}
                      style={{ marginTop: 3, cursor: canToggle ? "pointer" : "not-allowed", width: 16, height: 16 }}
                    />
                    {editActividadId === act._id ? (
                      <Group gap="xs" style={{ flex: 1 }}>
                        <TextInput
                          size="xs"
                          value={editActividadNombre}
                          onChange={e => setEditActividadNombre(e.currentTarget.value)}
                          style={{ flex: 1 }}
                          autoFocus
                        />
                        <Button size="xs" loading={savingActividad} onClick={() => guardarNombreActividad(faseActual, act)}>OK</Button>
                        <Button size="xs" variant="default" onClick={() => setEditActividadId(null)}>✕</Button>
                      </Group>
                    ) : (
                      <div style={{ flex: 1 }}>
                        <Text size="sm" td={act.completada ? "line-through" : undefined} c={act.completada ? "dimmed" : "#000"}>
                          {act.nombre}
                        </Text>
                        {act.responsables && <Text size="xs" c="dimmed">{act.responsables}</Text>}
                      </div>
                    )}
                  </Group>
                  {editActividadId !== act._id && (
                    <Group gap={4}>
                      <Button size="xs" variant="subtle" color="blue"
                        onClick={() => { setEditActividadId(act._id); setEditActividadNombre(act.nombre); }}>
                        ✏
                      </Button>
                      <Button size="xs" variant="subtle" color="red"
                        onClick={() => eliminarActividad(faseActual, act._id)}>
                        🗑
                      </Button>
                    </Group>
                  )}
                </Group>
              </Paper>
            )})}

            <Divider label="Agregar actividad" labelPosition="center" />
            <Group gap="xs">
              <TextInput
                size="xs"
                placeholder="Nombre de la nueva actividad..."
                value={nuevaActividad}
                onChange={e => setNuevaActividad(e.currentTarget.value)}
                style={{ flex: 1 }}
                onKeyDown={e => e.key === "Enter" && agregarActividad(faseActual)}
              />
              <Button size="xs" loading={savingActividad} onClick={() => agregarActividad(faseActual)}>
                Agregar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Paper>
  );
};

const DateReviewPage = () => {
  const { userRole } = useRole();

  const [facultad, setFacultad]           = useState<string>("Todos");
  const [programa, setPrograma]           = useState<string>("Todos");
  const [nivelAcademico, setNivelAcademico] = useState<string>("Todos");
  const [tipoProceso, setTipoProceso]     = useState<string>("Todos");

  const [facultades, setFacultades]         = useState<Dependency[]>([]);
  const [programas, setProgramas]           = useState<Program[]>([]);
  const [procesos, setProcesos]             = useState<Process[]>([]);
  const [fases, setFases]                   = useState<Phase[]>([]);
  const [loadingFacultades, setLoadingFacultades] = useState(true);
  const [loadingProgramas, setLoadingProgramas]   = useState(true);
  const [loadingProcesos, setLoadingProcesos]     = useState(true);
  const [loadingFases, setLoadingFases]           = useState(false);


  /* Modal agregar programa */
  const [modalOpen, setModalOpen]     = useState(false);
  const [newNombre, setNewNombre]     = useState("");
  const [newFacultad, setNewFacultad] = useState<string | null>(null);
  const [newModalidad, setNewModalidad]   = useState<string | null>(null);
  const [newNivelAcad, setNewNivelAcad]   = useState<string | null>(null);
  const [newNivelForm, setNewNivelForm]   = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(null);
  const [editandoPrograma, setEditandoPrograma] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Program>>({});
  const [savingPrograma, setSavingPrograma] = useState(false);

  const abrirEdicion = () => {
    if (!selectedProgram) return;
    setEditForm({
      nombre:          selectedProgram.nombre,
      dep_code_facultad: selectedProgram.dep_code_facultad,
      modalidad:       selectedProgram.modalidad,
      nivel_academico: selectedProgram.nivel_academico,
      nivel_formacion: selectedProgram.nivel_formacion,
      num_creditos:    selectedProgram.num_creditos,
      num_semestres:   selectedProgram.num_semestres,
      estado:          selectedProgram.estado,
    });
    setEditandoPrograma(true);
  };

  const guardarEdicionPrograma = async () => {
    if (!selectedProgram) return;
    setSavingPrograma(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/programs/${selectedProgram._id}`, editForm);
      const updated = res.data;
      setProgramas(prev => prev.map(p => p._id === updated._id ? updated : p));
      setSelectedProgram(updated);
      setEditandoPrograma(false);
    } catch (err) {
      console.error("Error guardando programa:", err);
    } finally {
      setSavingPrograma(false);
    }
  };

  /* Carga facultades desde /dependencies/all */
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`, { params: { limit: 1000 } })
      .then((res) => {
        const raw = res.data;
        let all: Dependency[] = [];
        if (Array.isArray(raw)) { all = raw; }
        else if (raw && typeof raw === "object" && Array.isArray(raw.dependencies)) { all = raw.dependencies; }
        setFacultades(all.filter((d) => d.name.toUpperCase().includes("FACULTAD")));
      })
      .catch((err) => console.error("Error cargando facultades:", err))
      .finally(() => setLoadingFacultades(false));
  }, []);

  /* Carga programas desde /programs */
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/programs`)
      .then((res) => {
        const raw = res.data;
        setProgramas(Array.isArray(raw) ? raw : []);
      })
      .catch((err) => console.error("Error cargando programas:", err))
      .finally(() => setLoadingProgramas(false));
  }, []);

  /* Carga procesos desde /processes */
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/processes`)
      .then((res) => {
        const raw = res.data;
        setProcesos(Array.isArray(raw) ? raw : []);
      })
      .catch((err) => console.error("Error cargando procesos:", err))
      .finally(() => setLoadingProcesos(false));
  }, []);


  /* Carga fases cuando se selecciona un programa específico */
  useEffect(() => {
    if (programa === "Todos") { setFases([]); return; }
    const prog = programas.find(p => p.nombre === programa);
    if (!prog) return;
    const procesosDelPrograma = procesos.filter(p => p.program_code === prog.dep_code_programa);
    if (procesosDelPrograma.length === 0) return;
    setLoadingFases(true);
    Promise.all(
      procesosDelPrograma.map(p =>
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/phases?proceso_id=${p._id}`)
          .then(r => (Array.isArray(r.data) ? r.data : []) as Phase[])
          .catch(() => [] as Phase[])
      )
    ).then(results => setFases(results.flat()))
     .finally(() => setLoadingFases(false));
  }, [programa, programas, procesos]);

  /* Cuando cambia la facultad, resetea el programa */
  const handleFacultadChange = (val: string | null) => {
    setFacultad(val ?? "Todos");
    setPrograma("Todos");
  };

  /* Facultad seleccionada (objeto completo) */
  const facultadSeleccionada = facultades.find((f) => f.name === facultad);

  /* Programas filtrados por facultad — usa dep_code_facultad de la colección programs */
  const programasFiltrados =
    facultad === "Todos"
      ? programas
      : programas.filter((p) => p.dep_code_facultad === facultadSeleccionada?.dep_code);

  /* Helper: busca el proceso de un programa por tipo */
  const getProceso = (dep_code_programa: string, tipo: "RC" | "AV" | "PM"): Process | undefined =>
    procesos.find((p) => p.program_code === dep_code_programa && p.tipo_proceso === tipo);

  /* Opciones para los Select */
  const loadingFilters        = loadingFacultades || loadingProgramas || loadingProcesos;
  const opcionesFacultad      = ["Todos", ...facultades.map((f) => f.name)];
  const opcionesPrograma      = ["Todos", ...programasFiltrados.map((p) => p.nombre)];
  const opcionesNivelAcademico = ["Todos", "Pregrado", "Posgrado"];
  const opcionesTipoProceso   = ["Todos", "Registro calificado","Acreditación voluntaria",  "Plan de mejoramiento"];

  /* Tabla: programas filtrados por facultad, programa y nivel académico */
  const tablaBase = programasFiltrados
    .filter((p) => programa === "Todos" || p.nombre === programa)
    .filter((p) => nivelAcademico === "Todos" || p.nivel_academico === nivelAcademico)
    .map((p) => ({
      _id: p._id,
      programa: p.nombre,
      dependencia: facultades.find((f) => f.dep_code === p.dep_code_facultad)?.name ?? p.dep_code_facultad,
      modalidad: p.modalidad ?? "—",
      nivel_academico: p.nivel_academico ?? "—",
      nivel_formacion: p.nivel_formacion ?? "—",
      num_creditos: p.num_creditos ?? "—",
      num_semestres: p.num_semestres ?? "—",
      fecha_resolucion_rc: p.fecha_resolucion_rc ?? "—",
      fecha_resolucion_av: p.fecha_resolucion_av ?? "—",
      estado: p.estado,
    }));

  /* Estadísticas calculadas desde los programas filtrados */
  const programasFiltradosCompleto = programasFiltrados
    .filter((p) => programa === "Todos" || p.nombre === programa)
    .filter((p) => nivelAcademico === "Todos" || p.nivel_academico === nivelAcademico);

  const totalActivos       = programasFiltradosCompleto.filter((p) => p.estado === "Activo").length;
  const totalInactivos     = programasFiltradosCompleto.filter((p) => p.estado === "Inactivo").length;
  const conRegistro        = programasFiltradosCompleto.filter((p) => p.fecha_resolucion_rc).length;
  const conAcreditacion    = programasFiltradosCompleto.filter((p) => p.fecha_resolucion_av).length;
  const totalProgramas     = programasFiltradosCompleto.length;
  const pctAcreditados     = totalProgramas > 0 ? Math.round((conAcreditacion / totalProgramas) * 100) : 0;

  /* Cada barra = una facultad; segmentos = cantidad de programas en cada fase.
     Programas sin proceso registrado cuentan en fase_0. */
  const buildBarData = (tipo: "RC" | "AV" | "PM"): BarRow[] => {
    const grupos: Record<string, BarRow> = {};
    facultades.forEach((f) => {
      const tienePrograms = programas.some((p) => p.dep_code_facultad === f.dep_code);
      if (tienePrograms) {
        grupos[f.dep_code] = { nombre: f.name, fase_0: 0, fase_1: 0, fase_2: 0, fase_3: 0, fase_4: 0, fase_5: 0, fase_6: 0 };
      }
    });
    programas.forEach((p) => {
      if (!grupos[p.dep_code_facultad]) return;
      const proceso = getProceso(p.dep_code_programa, tipo);
      const fase = proceso?.fase_actual ?? 0;
      const key = `fase_${fase}` as keyof BarRow;
      (grupos[p.dep_code_facultad][key] as number) += 1;
    });
    return Object.values(grupos);
  };

  const barAcreditacion     = buildBarData("AV");
  const barRegistro         = buildBarData("RC");
  const barPlanMejoramiento = buildBarData("PM");

  /* Filas para la tabla de procesos — fases leídas desde la colección processes */
  const procesoRows: ProcesoRow[] = programasFiltradosCompleto.map((p) => ({
    programa: p,
    acreditacion: getProceso(p.dep_code_programa, "AV")?.fase_actual ?? null,
    registro:     getProceso(p.dep_code_programa, "RC")?.fase_actual ?? null,
    plan:         getProceso(p.dep_code_programa, "PM")?.fase_actual ?? null,
  }));

  const tituloTabla = `Fase de procesos de programas de ${facultad}`;

  const handleGuardarPrograma = async () => {
    if (!newNombre.trim() || !newFacultad) {
      setSaveError("El nombre y la facultad son obligatorios.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const facultadObj = facultades.find((f) => f.name === newFacultad);
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/programs`, {
        nombre: newNombre.trim(),
        dep_code_facultad: facultadObj?.dep_code,
        dep_code_programa: `PROG_${Date.now()}`,
        modalidad: newModalidad,
        nivel_academico: newNivelAcad,
        nivel_formacion: newNivelForm,
      });
      /* Recargar lista de programas */
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs`);
      setProgramas(Array.isArray(res.data) ? res.data : []);
      /* Limpiar modal */
      setNewNombre(""); setNewFacultad(null); setNewModalidad(null);
      setNewNivelAcad(null); setNewNivelForm(null);
      setModalOpen(false);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || "Error al guardar el programa.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", marginTop: "-50px" }}>

      {/* SIDEBAR IZQUIERDO — fixed: siempre visible en pantalla al hacer scroll */}
      <Box style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        width: "200px",
        borderRight: "1px solid #dee2e6",
        padding: "20px 12px",
        paddingTop: "110px",
        paddingBottom: "24px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mantine-color-body)",
        zIndex: 50,
      }}>
        {/* Filtros alineados arriba con buen espacio entre ellos */}
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {loadingFilters ? (
            <Loader size="sm" mx="auto" />
          ) : (
            <>
              <Select
                label="Facultad"
                data={opcionesFacultad}
                value={facultad}
                onChange={handleFacultadChange}
                searchable={false}
                styles={selectorStyle}
              />
              {facultad !== "Todos" && (
                <>
                  <Select
                    label="Programa"
                    data={opcionesPrograma}
                    value={programa}
                    onChange={(v) => {
                      const nuevo = v ?? "Todos";
                      setPrograma(nuevo);
                      if (nuevo !== "Todos") setNivelAcademico("Todos");
                    }}
                    searchable={false}
                    styles={selectorStyle}
                  />
                  {programa === "Todos" && (
                    <Select
                      label="Nivel académico"
                      data={opcionesNivelAcademico}
                      value={nivelAcademico}
                      onChange={(v) => setNivelAcademico(v ?? "Todos")}
                      searchable={false}
                      styles={selectorStyle}
                    />
                  )}
                </>
              )}
              {userRole === "Administrador" && (
                <Select
                  label="Tipo de proceso"
                  data={opcionesTipoProceso}
                  value={tipoProceso}
                  onChange={(v) => setTipoProceso(v ?? "Todos")}
                  searchable={false}
                  styles={selectorStyle}
                />
              )}
            </>
          )}
        </div>

        {/* Botón fijo en la parte baja pero visible */}
        <Button variant="light" size="sm" fullWidth style={{ marginTop: 20 }} onClick={() => setModalOpen(true)}>
          Agregar programa
        </Button>
      </Box>

      {/* Modal agregar programa */}
      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Agregar programa" centered>
        <Stack>
          <TextInput
            label="Nombre del programa"
            placeholder="Ej: Ingeniería de Sistemas"
            value={newNombre}
            onChange={(e) => setNewNombre(e.currentTarget.value)}
            required
          />
          <Select
            label="Facultad"
            placeholder="Selecciona una facultad"
            data={facultades.map((f) => f.name)}
            value={newFacultad}
            onChange={setNewFacultad}
            searchable
            required
          />
          <Select
            label="Modalidad"
            placeholder="Selecciona"
            data={["Presencial", "Virtual", "Híbrido"]}
            value={newModalidad}
            onChange={setNewModalidad}
          />
          <Select
            label="Nivel académico"
            placeholder="Selecciona"
            data={["Pregrado", "Posgrado"]}
            value={newNivelAcad}
            onChange={setNewNivelAcad}
          />
          <Select
            label="Nivel de formación"
            placeholder="Selecciona"
            data={["Profesional", "Tecnológico", "Técnico", "Especialización", "Maestría", "Doctorado"]}
            value={newNivelForm}
            onChange={setNewNivelForm}
          />
          {saveError && <Notification color="red" withCloseButton={false}>{saveError}</Notification>}
          <Button onClick={handleGuardarPrograma} loading={saving} fullWidth>
            Guardar programa
          </Button>
        </Stack>
      </Modal>

      {/* CONTENIDO DERECHO */}
      <div style={{
        marginLeft: "201px",
        flex: 1,
        padding: "20px",
        paddingTop: "70px",
        minHeight: "calc(100vh - 194px)",
      }}>
        {userRole === "Administrador" && (
          <>
            {programa === "Todos" && <Title ta="center" mb="lg">Estadísticas generales</Title>}

            {/* Tarjeta grande azul con 6 tarjetas blancas dentro */}
            {programa === "Todos" && (
              <Paper radius="md" p="md" mb="lg"
                style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
                <SimpleGrid cols={2} spacing="sm">
                  {[
                    { label: "Total de programas académicos activos",         value: totalActivos },
                    { label: "Total de programas con Registro Calificado",    value: conRegistro },
                    { label: "Porcentaje de programas acreditados",           value: `${pctAcreditados}%` },
                    { label: "Total de programas con Acreditación Voluntaria",value: conAcreditacion },
                    { label: "Cantidad de programas inactivos",               value: totalInactivos },
                    { label: "Total de programas registrados",                value: totalProgramas },
                  ].map((card, i) => (
                    <Paper key={i} radius="md" p="md" style={{ textAlign: "center", backgroundColor: "white" }}>
                      <Text size="sm" fw={600} c="var(--mantine-color-blue-light-color)">{card.label}</Text>
                      <Text size="xl" fw={700} c="#228be6" mt={4}>{card.value}</Text>
                    </Paper>
                  ))}
                </SimpleGrid>
              </Paper>
            )}

            {/* Modal con info del programa seleccionado */}
            <Modal
              opened={selectedProgram !== null}
              onClose={() => { setSelectedProgram(null); setEditandoPrograma(false); }}
              title={
                <Group gap="sm">
                  <Text fw={700} size="lg">{selectedProgram?.nombre}</Text>
                  {selectedProgram && (
                    <Badge color={selectedProgram.estado === "Activo" ? "green" : "red"} variant="light">
                      {selectedProgram.estado}
                    </Badge>
                  )}
                </Group>
              }
              size="lg"
              centered
              radius="md"
            >
              {selectedProgram && (
                <Stack gap="md">
                  <Divider />

                  {/* Información general */}
                  <Group justify="space-between" align="center">
                    <Text fw={600} size="sm" c="dimmed">INFORMACIÓN GENERAL</Text>
                    {!editandoPrograma && (
                      <Button size="xs" variant="light" onClick={abrirEdicion}>Editar</Button>
                    )}
                  </Group>

                  {editandoPrograma ? (
                    <Stack gap="sm">
                      <TextInput
                        label="Nombre del programa"
                        value={editForm.nombre ?? ""}
                        onChange={(e) => setEditForm(f => ({ ...f, nombre: e.currentTarget.value }))}
                      />
                      <Select
                        label="Facultad"
                        data={facultades.map(f => ({ value: f.dep_code, label: f.name }))}
                        value={editForm.dep_code_facultad ?? null}
                        onChange={(v) => setEditForm(f => ({ ...f, dep_code_facultad: v ?? "" }))}
                        searchable={false}
                        styles={{ input: { caretColor: "transparent", cursor: "pointer" } }}
                      />
                      <SimpleGrid cols={2} spacing="sm">
                        <Select label="Modalidad" data={["Presencial", "Virtual", "Híbrido"]}
                          value={editForm.modalidad ?? null}
                          onChange={(v) => setEditForm(f => ({ ...f, modalidad: v }))}
                          searchable={false}
                          styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                        <Select label="Nivel académico" data={["Pregrado", "Posgrado"]}
                          value={editForm.nivel_academico ?? null}
                          onChange={(v) => setEditForm(f => ({ ...f, nivel_academico: v }))}
                          searchable={false}
                          styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                        <Select label="Nivel de formación"
                          data={["Profesional", "Tecnológico", "Técnico", "Especialización", "Maestría", "Doctorado"]}
                          value={editForm.nivel_formacion ?? null}
                          onChange={(v) => setEditForm(f => ({ ...f, nivel_formacion: v }))}
                          searchable={false}
                          styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                        <Select label="Estado" data={["Activo", "Inactivo"]}
                          value={editForm.estado ?? null}
                          onChange={(v) => setEditForm(f => ({ ...f, estado: v ?? "Activo" }))}
                          searchable={false}
                          styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                        <TextInput label="Créditos" type="number"
                          value={editForm.num_creditos ?? ""}
                          onChange={(e) => setEditForm(f => ({ ...f, num_creditos: Number(e.currentTarget.value) }))} />
                        <TextInput label="Semestres" type="number"
                          value={editForm.num_semestres ?? ""}
                          onChange={(e) => setEditForm(f => ({ ...f, num_semestres: Number(e.currentTarget.value) }))} />
                      </SimpleGrid>
                      <Group justify="flex-end" gap="sm">
                        <Button variant="default" size="xs" onClick={() => setEditandoPrograma(false)}>Cancelar</Button>
                        <Button size="xs" loading={savingPrograma} onClick={guardarEdicionPrograma}>Guardar</Button>
                      </Group>
                    </Stack>
                  ) : (
                    <SimpleGrid cols={2} spacing="md">
                      {[
                        { label: "Facultad",          value: facultades.find(f => f.dep_code === selectedProgram.dep_code_facultad)?.name ?? selectedProgram.dep_code_facultad },
                        { label: "Modalidad",          value: selectedProgram.modalidad },
                        { label: "Nivel académico",    value: selectedProgram.nivel_academico },
                        { label: "Nivel de formación", value: selectedProgram.nivel_formacion },
                        { label: "Créditos",           value: selectedProgram.num_creditos },
                        { label: "Semestres",          value: selectedProgram.num_semestres },
                      ].map(({ label, value }) => (
                        <Paper key={label} withBorder radius="sm" p="sm">
                          <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                          <Text size="sm" fw={600} c="#000">{value ?? "—"}</Text>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  )}

                  <Divider />

                  {/* Fechas y fases por proceso — leídas desde la colección processes */}
                  <Text fw={600} size="sm" c="dimmed">PROCESOS</Text>
                  <SimpleGrid cols={3} spacing="md">
                    {(["RC", "AV", "PM"] as const).map((tipo) => {
                      const labels: Record<string, string> = {
                        RC: "Registro calificado",
                        AV: "Acreditación voluntaria",
                        PM: "Plan de mejoramiento",
                      };
                      const proc = getProceso(selectedProgram.dep_code_programa, tipo);
                      return (
                        <Paper key={tipo} withBorder radius="sm" p="sm" style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
                          <Text size="xs" fw={700} c="var(--mantine-color-blue-light-color)" mb={6}>{labels[tipo]}</Text>
                          {proc ? (
                            <>
                              <Text size="xs" fw={700} c="#000">Fase actual</Text>
                              <Text size="sm" c="#000" fw={400} mb={4}>Fase {proc.fase_actual}</Text>
                              <Text size="xs" fw={700} c="#000">Fecha vencimiento</Text>
                              <Text size="sm" c="#000" fw={400} mb={4}>{proc.fecha_vencimiento ?? "—"}</Text>
                              <Text size="xs" fw={700} c="#000">Fecha radicado MEN</Text>
                              <Text size="sm" c="#000" fw={400}>{proc.fecha_radicado_men ?? "—"}</Text>
                            </>
                          ) : (
                            <Text size="xs" c="dimmed" mt={4}>Sin proceso registrado</Text>
                          )}
                        </Paper>
                      );
                    })}
                  </SimpleGrid>
                </Stack>
              )}
            </Modal>

            {/* Vista por programa seleccionado → 3 tarjetas de procesos */}
            {programa !== "Todos" && (() => {
              const progObj = programas.find(p => p.nombre === programa);
              if (!progObj) return null;
              const procesosDelProg = procesos.filter(p => p.program_code === progObj.dep_code_programa);
              if (loadingFases) return <Loader size="sm" mx="auto" display="block" my="lg" />;
              return (
                <>
                  <Title order={4} ta="center" mb="md">{progObj.nombre}</Title>
                  {(["RC", "AV", "PM"] as const)
                    .filter(t => tipoProceso === "Todos"
                      || (tipoProceso === "Registro calificado" && t === "RC")
                      || (tipoProceso === "Acreditación voluntaria" && t === "AV")
                      || (tipoProceso === "Plan de mejoramiento" && t === "PM"))
                    .map(tipo => {
                      const proc = procesosDelProg.find(p => p.tipo_proceso === tipo);
                      if (!proc) return null;
                      const fasesDelProceso = fases.filter(f => f.proceso_id === proc._id);
                      return (
                        <ProcesoDetalleCard
                          key={tipo}
                          proceso={proc}
                          programa={progObj}
                          fases={fasesDelProceso}
                          onUpdateProceso={updated => setProcesos(prev => prev.map(p => p._id === updated._id ? updated : p))}
                          onUpdateFases={updated => setFases(prev => [...prev.filter(f => f.proceso_id !== proc._id), ...updated])}
                          onUpdatePrograma={updated => {
                            setProgramas(prev => prev.map(p => p._id === updated._id ? updated : p));
                            setSelectedProgram(updated);
                          }}
                          onRefreshProcesos={async (programCode) => {
                            const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/processes?program_code=${programCode}`);
                            const nuevos: Process[] = Array.isArray(res.data) ? res.data : [];
                            setProcesos(prev => [
                              ...prev.filter(p => p.program_code !== programCode),
                              ...nuevos,
                            ]);
                          }}
                        />
                      );
                    })
                  }
                </>
              );
            })()}

            {/* Vista por facultad → tabla de fases por programa */}
            {programa === "Todos" && facultad !== "Todos" && (loadingProgramas ? (
              <Loader size="sm" mx="auto" display="block" my="lg" />
            ) : (
              <ProcesoTable title={tituloTabla} rows={procesoRows} tipoProceso={tipoProceso} programaFiltro={programa} onRowClick={setSelectedProgram} />
            ))}

            {facultad === "Todos" && <>
              {(tipoProceso === "Todos" || tipoProceso === "Registro calificado") && (
                <BarTable title="Estado general de fases — Registro calificado" data={barRegistro} />
              )}
              {(tipoProceso === "Todos" || tipoProceso === "Acreditación voluntaria") && (
                <BarTable title="Estado general de fases — Acreditación voluntaria" data={barAcreditacion} />
              )}
              {(tipoProceso === "Todos" || tipoProceso === "Plan de mejoramiento") && (
                <BarTable title="Estado general de fases — Plan de mejoramiento" data={barPlanMejoramiento} />
              )}
            </>}
          </>
        )}

        {userRole === "Usuario" && (
          <Paper withBorder p="xl" radius="md" style={{ minHeight: "200px" }}>
            <Text c="dimmed" ta="center" mt="xl">
              Aquí irá el contenido del módulo de revisión de fechas (Usuario)
            </Text>
          </Paper>
        )}
      </div>

    </div>
  );
};

export default DateReviewPage;
