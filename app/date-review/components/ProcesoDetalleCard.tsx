"use client";

import { useState, useEffect } from "react";
import {
  Text, Button, Paper, Group, Select, Modal, Stack, TextInput, Badge,
  Box, Table, ScrollArea, Notification, SimpleGrid, Anchor, Divider, Loader,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import axios from "axios";
import DropzoneCustomComponent from "@/app/components/DropzoneCustomDrop/DropzoneCustomDrop";

import type { Process, Program, Phase, ProcessDocument, Actividad, ProcesoDetalleProps } from "../types";
import {
  SUBTIPOS, LABEL_PROCESO, COLOR_PROCESO,
  COLUMNAS_FECHA_RC_PM, COLUMNAS_FECHA_AV, COLUMNAS_FECHA_PM,
  faseColors,
} from "../constants";

const ProcesoDetalleCard = ({
  proceso, programa, fases, onUpdateProceso, onUpdateFases, onUpdatePrograma, onRefreshProcesos,
}: ProcesoDetalleProps) => {
  const faseActual   = fases.find(f => f.numero === proceso.fase_actual);
  const ultimaActiva = faseActual?.actividades.filter(a => !a.completada)[0] ?? null;

  /* ── Iniciar / cerrar proceso ── */
  const [resolucionOpen, setResolucionOpen]   = useState(false);
  const [resForm, setResForm]                 = useState({ fecha: "", codigo: "", duracion: "" });
  const [savingRes, setSavingRes]             = useState(false);
  const [cerrarProcesoOpen, setCerrarProcesoOpen] = useState(false);
  const [cerrandoProceso, setCerrandoProceso] = useState(false);

  /* ── PDF de resolución vigente ── */
  const [resolucionDoc, setResolucionDoc]                   = useState<ProcessDocument | null>(null);
  const [loadingResolucionDoc, setLoadingResolucionDoc]     = useState(false);
  const [resolucionDocModalOpen, setResolucionDocModalOpen] = useState(false);

  useEffect(() => {
    const fetchResolucionDoc = async () => {
      try {
        setLoadingResolucionDoc(true);
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/by-process`, {
          params: { process_id: proceso._id },
        });
        const data = Array.isArray(res.data) ? (res.data as ProcessDocument[]) : [];
        setResolucionDoc(data[0] ?? null);
      } catch (e) {
        console.error("Error cargando documento de resolución:", e);
      } finally {
        setLoadingResolucionDoc(false);
      }
    };
    fetchResolucionDoc();
  }, [proceso._id]);

  const abrirResolucion = () => {
    setResForm({ fecha: "", codigo: "", duracion: "" });
    setResolucionOpen(true);
  };

  const cerrarProceso = async () => {
    setCerrandoProceso(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}/close`);
      setPmProceso(null);
      const progRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs/${programa._id}`);
      onUpdatePrograma(progRes.data);
      await onRefreshProcesos(programa.dep_code_programa);
      setCerrarProcesoOpen(false);
    } catch (e) {
      console.error("Error cerrando proceso:", e);
    } finally {
      setCerrandoProceso(false);
    }
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
      setPmProceso(null);
      setResolucionOpen(false);
    } catch (e) { console.error(e); }
    finally { setSavingRes(false); }
  };

  /* ── Observaciones generales del proceso ── */
  const [obsOpen, setObsOpen]     = useState(false);
  const [obsTexto, setObsTexto]   = useState("");
  const [savingObs, setSavingObs] = useState(false);

  const abrirObs = () => { setObsTexto(proceso.observaciones ?? ""); setObsOpen(true); };

  const guardarObs = async () => {
    setSavingObs(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`, { observaciones: obsTexto });
      onUpdateProceso(res.data);
    } catch (e) { console.error(e); }
    finally { setSavingObs(false); setObsOpen(false); }
  };

  /* ── Observaciones por fecha (proceso principal) ── */
  const [obsDateKey, setObsDateKey]       = useState<string | null>(null);
  const [obsDateLabel, setObsDateLabel]   = useState("");
  const [obsDateTexto, setObsDateTexto]   = useState("");
  const [savingObsDate, setSavingObsDate] = useState(false);
  const [obsDateOpen, setObsDateOpen]     = useState(false);

  const abrirObsFecha = (obsKey: string, label: string) => {
    setObsDateKey(obsKey);
    setObsDateLabel(label);
    setObsDateTexto(proceso[obsKey as keyof Process] as string ?? "");
    setObsDateOpen(true);
  };

  const guardarObsFecha = async () => {
    if (!obsDateKey) return;
    setSavingObsDate(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`, { [obsDateKey]: obsDateTexto });
      onUpdateProceso(res.data);
    } catch (e) { console.error(e); }
    finally { setSavingObsDate(false); setObsDateOpen(false); }
  };

  /* ── Observaciones por fecha (PM) ── */
  const [obsPmDateKey, setObsPmDateKey]       = useState<string | null>(null);
  const [obsPmDateLabel, setObsPmDateLabel]   = useState("");
  const [obsPmDateTexto, setObsPmDateTexto]   = useState("");
  const [savingObsPmDate, setSavingObsPmDate] = useState(false);
  const [obsPmDateOpen, setObsPmDateOpen]     = useState(false);

  const abrirObsPmFecha = (obsKey: string, label: string) => {
    if (!pmProceso) return;
    setObsPmDateKey(obsKey);
    setObsPmDateLabel(label);
    setObsPmDateTexto(pmProceso[obsKey as keyof Process] as string ?? "");
    setObsPmDateOpen(true);
  };

  const guardarObsPmFecha = async () => {
    if (!obsPmDateKey || !pmProceso) return;
    setSavingObsPmDate(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${pmProceso._id}`, { [obsPmDateKey]: obsPmDateTexto });
      setPmProceso(res.data);
    } catch (e) { console.error(e); }
    finally { setSavingObsPmDate(false); setObsPmDateOpen(false); }
  };

  /* ── Edición condición/factor ── */
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

  /* ── Edición de fechas inline (proceso principal) ── */
  const [editingDateKey, setEditingDateKey] = useState<string | null>(null);
  const [savingDate, setSavingDate]         = useState(false);
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

  /* ── Edición de fechas inline (PM) ── */
  const [editingPmDateKey, setEditingPmDateKey] = useState<string | null>(null);
  const [savingPmDate, setSavingPmDate]         = useState(false);
  const savePmDate = async (key: string, val: Date | null) => {
    if (!pmProceso) return;
    setSavingPmDate(true);
    setEditingPmDateKey(null);
    try {
      const fechaStr = val ? val.toISOString().slice(0, 10) : null;
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${pmProceso._id}`, { [key]: fechaStr });
      setPmProceso(res.data);
    } catch (e) { console.error(e); }
    finally { setSavingPmDate(false); }
  };

  /* ── Checklist de actividades ── */
  const [checklistOpen, setChecklistOpen]               = useState(false);
  const [editActividadId, setEditActividadId]           = useState<string | null>(null);
  const [editActividadNombre, setEditActividadNombre]   = useState("");
  const [editActividadResponsables, setEditActividadResponsables] = useState("");
  const [nuevaActividad, setNuevaActividad]             = useState("");
  const [posicionActividad, setPosicionActividad]       = useState<string>("0");
  const [savingActividad, setSavingActividad]           = useState(false);

  /* ── Offsets de meses ── */
  const getDefaultOffsets = () =>
    proceso.tipo_proceso === "AV"
      ? { inicio: 33, docPar: 16, digitacion: 15, radicado: 12 }
      : { inicio: 29, docPar: 17, digitacion: 15, radicado: 12 };

  const [offsets, setOffsets] = useState(() => {
    const def = getDefaultOffsets();
    return {
      inicio:     proceso.meses_inicio_antes_venc     ?? def.inicio,
      docPar:     proceso.meses_doc_par_antes_venc    ?? def.docPar,
      digitacion: proceso.meses_digitacion_antes_venc ?? def.digitacion,
      radicado:   proceso.meses_radicado_antes_venc   ?? def.radicado,
    };
  });

  useEffect(() => {
    const def = getDefaultOffsets();
    setOffsets({
      inicio:     proceso.meses_inicio_antes_venc     ?? def.inicio,
      docPar:     proceso.meses_doc_par_antes_venc    ?? def.docPar,
      digitacion: proceso.meses_digitacion_antes_venc ?? def.digitacion,
      radicado:   proceso.meses_radicado_antes_venc   ?? def.radicado,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proceso._id, proceso.tipo_proceso, proceso.meses_inicio_antes_venc, proceso.meses_doc_par_antes_venc, proceso.meses_digitacion_antes_venc, proceso.meses_radicado_antes_venc]);

  const [savingOffsets, setSavingOffsets]   = useState(false);
  const [offsetsModalOpen, setOffsetsModalOpen] = useState(false);

  const guardarOffsets = async () => {
    setSavingOffsets(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`, {
        meses_inicio_antes_venc:     offsets.inicio,
        meses_doc_par_antes_venc:    offsets.docPar,
        meses_digitacion_antes_venc: offsets.digitacion,
        meses_radicado_antes_venc:   offsets.radicado,
      });
      onUpdateProceso(res.data);
    } catch (e) { console.error(e); }
    finally { setSavingOffsets(false); }
  };

  /* ── Plan de Mejoramiento ligado ── */
  const [pmProceso, setPmProceso]                     = useState<Process | null>(null);
  const [loadingPM, setLoadingPM]                     = useState(false);
  const [pmError, setPmError]                         = useState<string | null>(null);
  const [confirmarEliminarPM, setConfirmarEliminarPM] = useState(false);
  const [eliminandoPM, setEliminandoPM]               = useState(false);

  const cargarPM = async () => {
    if (proceso.tipo_proceso === "PM") return;
    setLoadingPM(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/processes`, {
        params: { program_code: proceso.program_code, tipo_proceso: "PM" },
      });
      const data: Process[] = Array.isArray(res.data) ? res.data : [];
      const pm = data.find(p => p.parent_process_id === proceso._id) ?? null;
      setPmProceso(pm);
    } catch (e) {
      console.error("Error cargando PM:", e);
    } finally {
      setLoadingPM(false);
    }
  };

  useEffect(() => { cargarPM(); }, [proceso._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activarPM = async () => {
    setPmError(null);
    try {
      setLoadingPM(true);
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}/activate-pm`);
      setPmProceso(res.data as Process);
    } catch (e: any) {
      setPmError(e?.response?.data?.error ?? "Error activando Plan de Mejoramiento");
    } finally {
      setLoadingPM(false);
    }
  };

  const eliminarPM = async () => {
    if (!pmProceso) return;
    setEliminandoPM(true);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/processes/${pmProceso._id}`);
      setPmProceso(null);
      setConfirmarEliminarPM(false);
    } catch (e) {
      console.error("Error eliminando PM:", e);
    } finally {
      setEliminandoPM(false);
    }
  };

  /* ── Documentos por fase ── */
  const [docsOpen, setDocsOpen]         = useState(false);
  const [docs, setDocs]                 = useState<ProcessDocument[]>([]);
  const [loadingDocs, setLoadingDocs]   = useState(false);
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
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents`, {
        params: { phase_id: faseActual._id },
      });
      setDocs(Array.isArray(res.data) ? res.data as ProcessDocument[] : []);
      setDocsOpen(true);
    } catch (e) { console.error(e); }
    finally { setLoadingDocs(false); }
  };

  const subirDocumento = async (files: File[]) => {
    if (!faseActual || files.length === 0) return;
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/process-documents/${faseActual._id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      setDocs(prev => [res.data as ProcessDocument, ...prev]);
    } catch (e) { console.error(e); }
    finally { setUploadingDoc(false); }
  };

  const eliminarDocumento = async (docId: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${docId}`);
      setDocs(prev => prev.filter(d => d._id !== docId));
    } catch (e) { console.error(e); }
  };

  const guardarNombreActividad = async (fase: Phase, act: Actividad) => {
    if (!editActividadNombre.trim()) return;
    setSavingActividad(true);
    try {
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}`,
        { nombre: editActividadNombre.trim(), responsables: editActividadResponsables.trim() }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
      setEditActividadId(null);
    } catch (e) { console.error(e); }
    finally { setSavingActividad(false); }
  };

  const eliminarActividad = async (fase: Phase, actId: string) => {
    try {
      const res = await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${actId}`);
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
    } catch (e) { console.error(e); }
  };

  const agregarActividad = async (fase: Phase) => {
    if (!nuevaActividad.trim()) return;
    const pos = Math.min(Math.max(0, parseInt(posicionActividad, 10) || fase.actividades.length), fase.actividades.length);
    setSavingActividad(true);
    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades`,
        { nombre: nuevaActividad.trim(), position: pos }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
      setNuevaActividad("");
      setPosicionActividad(String(fase.actividades.length + 1));
    } catch (e) { console.error(e); }
    finally { setSavingActividad(false); }
  };

  /* ── Datos derivados ── */
  const color           = COLOR_PROCESO[proceso.tipo_proceso];
  const maxCondicion    = proceso.tipo_proceso === "RC" ? 9 : proceso.tipo_proceso === "AV" ? 12 : null;
  const resolucionFecha = proceso.tipo_proceso === "RC" ? programa.fecha_resolucion_rc : programa.fecha_resolucion_av;
  const resolucionCodigo = proceso.tipo_proceso === "RC" ? programa.codigo_resolucion_rc : programa.codigo_resolucion_av;
  const condicionLabel  = proceso.tipo_proceso === "RC" ? "Condición" : "Factor";
  const condicionOpts   = maxCondicion
    ? Array.from({ length: maxCondicion }, (_, i) => ({ value: String(i + 1), label: `${condicionLabel} ${i + 1}` }))
    : [];

  /* ── Vista mínima sin resolución activa ── */
  if (!resolucionFecha) {
    return (
      <Paper withBorder radius="md" mb="md" style={{ overflow: "hidden" }}>
        <div style={{ backgroundColor: color, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <Text fw={700} c="#333" size="md">{LABEL_PROCESO[proceso.tipo_proceso]}</Text>
          <Text size="xs" c="#555">Sin proceso activo</Text>
          <Button size="sm" variant="white" color="dark" onClick={abrirResolucion}>
            + Iniciar {LABEL_PROCESO[proceso.tipo_proceso]}
          </Button>
        </div>

        <Modal opened={resolucionOpen} onClose={() => setResolucionOpen(false)}
          title={`Iniciar proceso — ${LABEL_PROCESO[proceso.tipo_proceso]}`} centered size="sm" radius="md">
          <Stack>
            <Text size="xs" c="dimmed">
              Ingresa los datos de la resolución vigente. El sistema calculará automáticamente todas las fechas del proceso.
            </Text>
            <div>
              <Text size="sm" fw={500} mb={4}>Fecha de resolución</Text>
              <DateInput
                value={resForm.fecha ? new Date(resForm.fecha + "T12:00:00") : null}
                onChange={(val) => setResForm(f => ({ ...f, fecha: val ? val.toISOString().slice(0, 10) : "" }))}
                valueFormat="YYYY-MM-DD" placeholder="YYYY-MM-DD" clearable
                onKeyDown={(e) => e.preventDefault()}
                styles={{ input: { caretColor: "transparent", cursor: "pointer" } }}
              />
            </div>
            <TextInput label="Código de resolución" placeholder="Ej: 12345" value={resForm.codigo}
              onChange={(e) => { const v = e.currentTarget.value; setResForm(f => ({ ...f, codigo: v })); }} />
            <TextInput label="Duración de la resolución (años)" placeholder="Ej: 7" value={resForm.duracion}
              onChange={(e) => { const v = e.currentTarget.value.replace(/\D/g, ""); setResForm(f => ({ ...f, duracion: v })); }} />
            <Group justify="flex-end" mt="sm">
              <Button variant="default" size="sm" onClick={() => setResolucionOpen(false)}>Cancelar</Button>
              <Button size="sm" loading={savingRes} onClick={guardarResolucion}>Iniciar proceso</Button>
            </Group>
          </Stack>
        </Modal>
      </Paper>
    );
  }

  /* ── Vista completa ── */
  return (
    <Paper withBorder radius="md" mb="md" style={{ overflow: "hidden" }}>

      {/* Header */}
      <div style={{ backgroundColor: color, padding: "10px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "flex-start", gap: 8 }}>
          <Button size="xs" variant="white" color="dark" onClick={() => setOffsetsModalOpen(true)}>Editar meses</Button>
          <Button size="xs" variant="white" color="red" onClick={() => setCerrarProcesoOpen(true)}>Cerrar proceso</Button>
        </div>
        <Text fw={700} c="#333" size="md" ta="center">{LABEL_PROCESO[proceso.tipo_proceso]}</Text>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Select
            data={SUBTIPOS[proceso.tipo_proceso].map(s => ({ value: s, label: s }))}
            value={proceso.subtipo ?? null}
            onChange={async (val) => {
              try {
                const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`, { subtipo: val });
                onUpdateProceso(res.data);
              } catch (e) { console.error(e); }
            }}
            placeholder="Tipo de proceso"
            clearable size="xs"
            styles={{ input: { backgroundColor: "rgba(255,255,255,0.85)", fontSize: "11px", paddingInline: 6, height: 24, minWidth: 200 } }}
          />
        </div>
      </div>

      {/* Tabla de fechas */}
      <ScrollArea>
        <Table withTableBorder withColumnBorders style={{ minWidth: 800 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 140, backgroundColor: "#f8f9fa" }}>
                <Text size="xs" fw={700} ta="center">Resolución vigente</Text>
              </Table.Th>
              {(proceso.tipo_proceso === "AV" ? COLUMNAS_FECHA_AV : COLUMNAS_FECHA_RC_PM).map(col => {
                const offsetValue =
                  col.key === "fecha_inicio"           ? offsets.inicio :
                  col.key === "fecha_documento_par"    ? offsets.docPar :
                  col.key === "fecha_digitacion_saces" ? offsets.digitacion :
                  col.key === "fecha_radicado_men"     ? offsets.radicado : null;
                return (
                  <Table.Th key={col.key} style={{ backgroundColor: "#f8f9fa" }}>
                    <Text size="xs" fw={700} ta="center">{col.label}</Text>
                    {col.key === "fecha_vencimiento"
                      ? <Text size="xs" c="dimmed" ta="center">({col.sub})</Text>
                      : <Text size="xs" c="dimmed" ta="center">{offsetValue != null ? `(${offsetValue} meses antes del vencimiento)` : ""}</Text>
                    }
                  </Table.Th>
                );
              })}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td style={{ verticalAlign: "top" }}>
                <Stack gap={4} align="center">
                  {resolucionFecha ? (
                    <>
                      <Text size="xs" fw={600} ta="center">{resolucionFecha}</Text>
                      <Text size="xs" c="dimmed" ta="center">{resolucionCodigo ?? "—"}</Text>
                    </>
                  ) : (
                    <Text size="xs" c="orange" fw={600} ta="center">Pendiente</Text>
                  )}
                  <Button size="xs" variant="subtle" color="blue" loading={loadingResolucionDoc} onClick={() => setResolucionDocModalOpen(true)}>
                    {resolucionDoc ? "Ver / cambiar PDF resolución" : "Subir PDF resolución"}
                  </Button>
                  {resolucionDoc && (
                    <Anchor size="xs" href={resolucionDoc.view_link} target="_blank" rel="noopener noreferrer">
                      Abrir PDF en nueva pestaña
                    </Anchor>
                  )}
                </Stack>
              </Table.Td>
              {(proceso.tipo_proceso === "AV" ? COLUMNAS_FECHA_AV : COLUMNAS_FECHA_RC_PM).map(col => {
                const fecha        = proceso[col.key as keyof Process] as string | null;
                const isEditing    = editingDateKey === col.key;
                const dateVal      = fecha ? new Date(fecha + "T12:00:00") : null;
                const esSoloLectura = col.key === "fecha_vencimiento" || col.key === "fecha_radicado_men";
                const obsValor     = proceso[col.obsKey as keyof Process] as string ?? "";
                return (
                  <Table.Td key={col.key} style={{ verticalAlign: "top", minWidth: 140 }}>
                    <Stack gap={4} align="center">
                      {isEditing && !esSoloLectura ? (
                        <DateInput value={dateVal} onChange={(val) => saveDate(col.key, val)}
                          valueFormat="YYYY-MM-DD" size="xs" autoFocus onBlur={() => setEditingDateKey(null)}
                          style={{ width: 130 }} clearable disabled={savingDate}
                          onKeyDown={(e) => e.preventDefault()}
                          styles={{ input: { caretColor: "transparent", cursor: "pointer" } }}
                        />
                      ) : (
                        <Text size="xs" fw={600} ta="center" style={{
                          cursor: esSoloLectura ? "default" : "pointer", padding: "2px 8px", borderRadius: 4,
                          border: esSoloLectura ? "1px solid #dee2e6" : "1px dashed #4dabf7",
                          backgroundColor: esSoloLectura ? "#f8f9fa" : "#e7f5ff",
                          color: fecha ? "#1c7ed6" : "#adb5bd",
                        }}
                          title={esSoloLectura ? "Fecha calculada automáticamente" : "Clic para editar fecha"}
                          onClick={() => { if (!esSoloLectura) setEditingDateKey(col.key); }}
                        >
                          {fecha ? fecha : <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
                        </Text>
                      )}
                      <Text size="xs" c={obsValor ? "#1971c2" : "#74c0fc"} td="underline"
                        style={{ cursor: "pointer" }} onClick={() => abrirObsFecha(col.obsKey, col.label)}>
                        {obsValor ? "Ver observaciones" : "Observaciones"}
                      </Text>
                    </Stack>
                  </Table.Td>
                );
              })}
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* Bloque Plan de Mejoramiento */}
      {(proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV") && (
        <Box px="md" pt="sm" pb="sm">
          <Group justify="space-between" mb="xs" align="center">
            <Group gap="xs">
              <Text size="sm" fw={600}>Plan de Mejoramiento</Text>
              {pmProceso && <Badge size="xs" color="green">Activo</Badge>}
              {pmProceso?.subtipo && <Badge size="sm" color="gray" variant="outline">{pmProceso.subtipo}</Badge>}
            </Group>
            <Group gap="xs">
              {pmProceso && (
                <Button size="xs" variant="subtle" color="red" onClick={() => setConfirmarEliminarPM(true)}>
                  Quitar plan
                </Button>
              )}
              {!pmProceso && (
                <Button size="xs" variant="light" loading={loadingPM} onClick={activarPM}>
                  Activar plan de mejoramiento
                </Button>
              )}
            </Group>
          </Group>

          <Modal opened={confirmarEliminarPM} onClose={() => setConfirmarEliminarPM(false)}
            title="Eliminar Plan de Mejoramiento" centered size="sm" radius="md">
            <Stack>
              <Text size="sm">¿Estás seguro de que quieres eliminar el Plan de Mejoramiento ligado a este proceso? Esta acción no se puede deshacer.</Text>
              <Group justify="flex-end" gap="sm">
                <Button variant="default" size="sm" onClick={() => setConfirmarEliminarPM(false)}>Cancelar</Button>
                <Button color="red" size="sm" loading={eliminandoPM} onClick={eliminarPM}>Sí, eliminar</Button>
              </Group>
            </Stack>
          </Modal>

          {pmError && (
            <Notification color="red" withCloseButton onClose={() => setPmError(null)} mb="xs">{pmError}</Notification>
          )}

          {pmProceso ? (
            <ScrollArea>
              <Table withTableBorder withColumnBorders style={{ minWidth: 800 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 140, backgroundColor: "#f8f9fa" }}>
                      <Text size="xs" fw={700} ta="center">Hito del Plan</Text>
                    </Table.Th>
                    {COLUMNAS_FECHA_PM.map(col => (
                      <Table.Th key={col.key} style={{ backgroundColor: "#f8f9fa" }}>
                        <Text size="xs" fw={700} ta="center">{col.label}</Text>
                        {col.sub && <Text size="xs" c="dimmed" ta="center">{col.sub}</Text>}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td style={{ width: 140 }}>
                      <Text size="xs" fw={600} ta="center">Fechas</Text>
                    </Table.Td>
                    {COLUMNAS_FECHA_PM.map(col => {
                      const fecha    = pmProceso[col.key as keyof Process] as string | null | undefined;
                      const isEditing = editingPmDateKey === col.key;
                      const dateVal  = fecha ? new Date(fecha + "T12:00:00") : null;
                      const obsValor = pmProceso[col.obsKey as keyof Process] as string ?? "";
                      return (
                        <Table.Td key={col.key} style={{ verticalAlign: "top", minWidth: 140 }}>
                          <Stack gap={4} align="center">
                            {isEditing ? (
                              <DateInput value={dateVal} onChange={(val) => savePmDate(col.key, val)}
                                valueFormat="YYYY-MM-DD" size="xs" autoFocus onBlur={() => setEditingPmDateKey(null)}
                                style={{ width: 130 }} clearable disabled={savingPmDate}
                                onKeyDown={(e) => e.preventDefault()}
                                styles={{ input: { caretColor: "transparent", cursor: "pointer" } }}
                              />
                            ) : (
                              <Text size="xs" fw={600} ta="center" style={{
                                cursor: "pointer", padding: "2px 8px", borderRadius: 4,
                                border: "1px dashed #4dabf7", backgroundColor: "#e7f5ff",
                                color: fecha ? "#1c7ed6" : "#adb5bd",
                              }}
                                title="Clic para editar fecha" onClick={() => setEditingPmDateKey(col.key)}>
                                {fecha ? fecha : <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
                              </Text>
                            )}
                            <Text size="xs" c={obsValor ? "#1971c2" : "#74c0fc"} td="underline"
                              style={{ cursor: "pointer" }} onClick={() => abrirObsPmFecha(col.obsKey, col.label)}>
                              {obsValor ? "Ver observaciones" : "Observaciones"}
                            </Text>
                          </Stack>
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </ScrollArea>
          ) : (
            <Text size="xs" c="dimmed">No hay plan de mejoramiento activo para este proceso.</Text>
          )}
        </Box>
      )}

      {/* Footer: fase actual */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #dee2e6", display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <Group gap="sm" align="center">
            <div style={{ backgroundColor: faseColors[proceso.fase_actual]?.color ?? "#ced4da", borderRadius: 6, padding: "2px 10px" }}>
              <Text size="xs" fw={600} c="#333">Fase {proceso.fase_actual}</Text>
            </div>
            {faseActual && <Text size="xs" c="dimmed">{faseActual.nombre}</Text>}
          </Group>
          {ultimaActiva && faseActual && (
            <Group gap="xs" mt={6} align="center" justify="space-between">
              <Group gap="xs" align="center">
                <Text size="xs" c="#555">Actividad actual: <strong>{ultimaActiva.nombre}</strong></Text>
                <Button size="xs" variant="light" onClick={() => { setPosicionActividad(String(faseActual.actividades.length)); setChecklistOpen(true); }}>
                  Ver actividades
                </Button>
              </Group>
              {faseActual.numero === 2 &&
                ultimaActiva.nombre === "Identificación de proyectos con viabilidad financiera" &&
                maxCondicion && (
                  <Select data={condicionOpts} value={proceso.condicion != null ? String(proceso.condicion) : null}
                    onChange={guardarCondicion} placeholder={`Seleccionar ${condicionLabel}`}
                    size="xs" disabled={savingCondicion} clearable={false} style={{ minWidth: 170 }}
                    styles={{ input: { caretColor: "transparent", cursor: "pointer", backgroundColor: "rgba(255,255,255,0.7)", fontWeight: 600 } }}
                  />
                )}
            </Group>
          )}
          {!ultimaActiva && faseActual && (
            <Group gap="xs" mt={6}>
              <Text size="xs" c="green" fw={600}>✓ Todas las actividades completadas</Text>
              <Button size="xs" variant="light" onClick={() => { setPosicionActividad(String(faseActual.actividades.length)); setChecklistOpen(true); }}>
                Ver actividades
              </Button>
            </Group>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <Text size="xs" c="dimmed">Documentos — Fase {proceso.fase_actual}</Text>
          <Button size="xs" variant="outline" color="gray" onClick={cargarDocumentos}>📎 Ver / cargar documentos</Button>
        </div>
      </div>

      {/* ── Modales ── */}

      <Modal opened={cerrarProcesoOpen} onClose={() => setCerrarProcesoOpen(false)}
        title={`Cerrar proceso — ${LABEL_PROCESO[proceso.tipo_proceso]}`} centered size="sm" radius="md">
        <Stack>
          <Text size="sm">Al cerrar el proceso, toda la información actual quedará guardada en el <strong>historial</strong> y el proceso volverá a estado inicial.</Text>
          <Text size="xs" c="dimmed">Esta acción no se puede deshacer.</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" size="sm" onClick={() => setCerrarProcesoOpen(false)}>Cancelar</Button>
            <Button color="red" size="sm" loading={cerrandoProceso} onClick={cerrarProceso}>Sí, cerrar proceso</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={resolucionDocModalOpen} onClose={() => setResolucionDocModalOpen(false)}
        title="PDF de resolución vigente" centered size="md" radius="md">
        <Stack>
          {resolucionDoc && (
            <Paper withBorder p="sm" radius="sm">
              <Text size="xs" fw={600} mb={4}>Archivo actual</Text>
              <Text size="xs" mb={4}>{resolucionDoc.name}</Text>
              <Button size="xs" variant="light" component="a" href={resolucionDoc.view_link} target="_blank" rel="noopener noreferrer">Ver PDF</Button>
            </Paper>
          )}
          <DropzoneCustomComponent
            text={loadingResolucionDoc ? "Subiendo documento..." : "Haz clic o arrastra el PDF de la resolución"}
            onDrop={async (files) => {
              const file = files[0]; if (!file) return;
              try {
                setLoadingResolucionDoc(true);
                const formData = new FormData();
                formData.append("file", file);
                const res = await axios.post(
                  `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${proceso._id}`,
                  formData, { headers: { "Content-Type": "multipart/form-data" } }
                );
                setResolucionDoc(res.data as ProcessDocument);
              } catch (e) { console.error(e); }
              finally { setLoadingResolucionDoc(false); }
            }}
          />
        </Stack>
      </Modal>

      <Modal opened={offsetsModalOpen} onClose={() => setOffsetsModalOpen(false)}
        title="Meses de cálculo de fechas" centered size="md" radius="md">
        <Stack>
          <Text size="xs" c="dimmed">Ajusta los meses para calcular fechas. Al guardar se recalcularán automáticamente.</Text>
          <SimpleGrid cols={2} spacing="sm">
            <TextInput label="Inicio proceso (meses antes del venc.)" type="number" value={offsets.inicio}
              onChange={(e) => setOffsets(prev => ({ ...prev, inicio: Number(e.currentTarget.value || 0) }))} />
            <TextInput label="Documento par (meses antes del venc.)" type="number" value={offsets.docPar}
              onChange={(e) => setOffsets(prev => ({ ...prev, docPar: Number(e.currentTarget.value || 0) }))} />
            <TextInput label="Digitación SACES (meses antes del venc.)" type="number" value={offsets.digitacion}
              onChange={(e) => setOffsets(prev => ({ ...prev, digitacion: Number(e.currentTarget.value || 0) }))} />
            <TextInput label="Radicado MEN (meses antes del venc.)" type="number" value={offsets.radicado}
              onChange={(e) => setOffsets(prev => ({ ...prev, radicado: Number(e.currentTarget.value || 0) }))} />
          </SimpleGrid>
          <Group justify="flex-end" mt="sm">
            <Button variant="default" size="sm" onClick={() => setOffsetsModalOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={savingOffsets} onClick={async () => { await guardarOffsets(); setOffsetsModalOpen(false); }}>
              Guardar y recalcular
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={obsOpen} onClose={() => setObsOpen(false)}
        title={`Observaciones generales — ${LABEL_PROCESO[proceso.tipo_proceso]}`} centered size="md" radius="md">
        <Stack>
          <textarea value={obsTexto} onChange={e => setObsTexto(e.target.value)} rows={6}
            style={{ width: "100%", borderRadius: 8, border: "1px solid #dee2e6", padding: "8px 12px", fontSize: 14, resize: "vertical" }}
            placeholder="Escribe las observaciones del proceso aquí..." />
          <Group justify="flex-end">
            <Button variant="default" size="sm" onClick={() => setObsOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={savingObs} onClick={guardarObs}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={obsDateOpen} onClose={() => setObsDateOpen(false)}
        title={`Observaciones — ${obsDateLabel}`} centered size="md" radius="md">
        <Stack>
          <textarea value={obsDateTexto} onChange={e => setObsDateTexto(e.target.value)} rows={5}
            style={{ width: "100%", borderRadius: 8, border: "1px solid #dee2e6", padding: "8px 12px", fontSize: 14, resize: "vertical" }}
            placeholder="Escribe la observación para esta fecha..." />
          <Group justify="flex-end">
            <Button variant="default" size="sm" onClick={() => setObsDateOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={savingObsDate} onClick={guardarObsFecha}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={obsPmDateOpen} onClose={() => setObsPmDateOpen(false)}
        title={`Observaciones PM — ${obsPmDateLabel}`} centered size="md" radius="md">
        <Stack>
          <textarea value={obsPmDateTexto} onChange={e => setObsPmDateTexto(e.target.value)} rows={5}
            style={{ width: "100%", borderRadius: 8, border: "1px solid #dee2e6", padding: "8px 12px", fontSize: 14, resize: "vertical" }}
            placeholder="Escribe la observación para esta fecha del plan..." />
          <Group justify="flex-end">
            <Button variant="default" size="sm" onClick={() => setObsPmDateOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={savingObsPmDate} onClick={guardarObsPmFecha}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={docsOpen} onClose={() => setDocsOpen(false)}
        title={faseActual ? `Documentos — ${faseActual.nombre}` : "Documentos de fase"} centered size="lg" radius="md">
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
              <Group justify="center"><Loader size="sm" /></Group>
            ) : docs.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center">No hay documentos cargados para esta fase.</Text>
            ) : (
              <ScrollArea style={{ maxHeight: 260 }}>
                <Stack gap="xs">
                  {docs.map(doc => (
                    <Group key={doc._id} justify="space-between" align="center">
                      <div style={{ maxWidth: "70%" }}>
                        <Text size="sm" fw={500} truncate="end">{doc.name}</Text>
                        {doc.size != null && <Text size="xs" c="dimmed">{(doc.size / (1024 * 1024)).toFixed(2)} MB</Text>}
                      </div>
                      <Group gap="xs">
                        <Button size="xs" variant="light" component="a" href={doc.view_link} target="_blank" rel="noopener noreferrer">Ver</Button>
                        <Button size="xs" variant="outline" color="red" onClick={() => eliminarDocumento(doc._id)}>Eliminar</Button>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea>
            )}
          </Stack>
        )}
      </Modal>

      <Modal opened={checklistOpen}
        onClose={() => { setChecklistOpen(false); setEditActividadId(null); setNuevaActividad(""); }}
        title={faseActual ? `${faseActual.nombre} — Fase ${proceso.fase_actual}` : "Actividades"}
        centered size="lg" radius="md">
        {faseActual && (
          <Stack gap="sm">
            {faseActual.actividades.map((act, index) => {
              const firstIncompleteIndex = faseActual.actividades.findIndex(a => !a.completada);
              const isFirstIncomplete    = !act.completada && index === firstIncompleteIndex;
              const canToggle            = act.completada || isFirstIncomplete;
              return (
                <Paper key={act._id} withBorder radius="sm" p="sm">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
                      <input type="checkbox" checked={act.completada}
                        onChange={() => canToggle && toggleCompletada(faseActual, act)}
                        disabled={!canToggle}
                        style={{ marginTop: 3, cursor: canToggle ? "pointer" : "not-allowed", width: 16, height: 16 }}
                      />
                      {editActividadId === act._id ? (
                        <Stack gap={4} style={{ flex: 1 }}>
                          <TextInput size="xs" label="Nombre de la actividad" value={editActividadNombre}
                            onChange={e => setEditActividadNombre(e.currentTarget.value)} autoFocus />
                          <TextInput size="xs" label="Responsables" placeholder="Opcional" value={editActividadResponsables}
                            onChange={e => setEditActividadResponsables(e.currentTarget.value)} />
                          <Group gap="xs" justify="flex-end">
                            <Button size="xs" variant="default" onClick={() => setEditActividadId(null)}>Cancelar</Button>
                            <Button size="xs" loading={savingActividad} onClick={() => guardarNombreActividad(faseActual, act)}>Guardar</Button>
                          </Group>
                        </Stack>
                      ) : (
                        <div style={{ flex: 1 }}>
                          <Text size="sm" td={act.completada ? "line-through" : undefined} c={act.completada ? "dimmed" : "#000"}>{act.nombre}</Text>
                          {act.responsables && <Text size="xs" c="dimmed">{act.responsables}</Text>}
                        </div>
                      )}
                    </Group>
                    {editActividadId !== act._id && (
                      <Group gap={4}>
                        <Button size="xs" variant="subtle" color="blue" onClick={() => { setEditActividadId(act._id); setEditActividadNombre(act.nombre); setEditActividadResponsables(act.responsables ?? ""); }}>✏</Button>
                        <Button size="xs" variant="subtle" color="red" onClick={() => eliminarActividad(faseActual, act._id)}>🗑</Button>
                      </Group>
                    )}
                  </Group>
                </Paper>
              );
            })}
            <Divider label="Agregar actividad" labelPosition="center" />
            <Select size="xs" label="Insertar en posición" placeholder="Al final"
              data={faseActual.actividades.length === 0
                ? [{ value: "0", label: "Al inicio (única posición)" }]
                : [
                    { value: "0", label: "Al inicio" },
                    ...faseActual.actividades.map((a, i) => ({
                      value: String(i + 1),
                      label: `Después de: ${a.nombre.length > 45 ? a.nombre.slice(0, 45) + "…" : a.nombre}`,
                    })),
                  ]
              }
              value={posicionActividad} onChange={(v) => setPosicionActividad(v ?? "0")}
              styles={{ input: { caretColor: "transparent", cursor: "pointer" } }}
            />
            <Group gap="xs">
              <TextInput size="xs" placeholder="Nombre de la nueva actividad..." value={nuevaActividad}
                onChange={e => setNuevaActividad(e.currentTarget.value)}
                style={{ flex: 1 }} onKeyDown={e => e.key === "Enter" && agregarActividad(faseActual)} />
              <Button size="xs" loading={savingActividad} onClick={() => agregarActividad(faseActual)}>Agregar</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Paper>
  );
};

export default ProcesoDetalleCard;
