"use client";

import { useState, useEffect } from "react";
import {
  Text, Button, Paper, Group, Select, Modal, Stack, TextInput, Badge,
  Box, Table, ScrollArea, Notification, SimpleGrid, Anchor, Divider, Loader,
  ActionIcon, Switch, Tooltip, Alert,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import axios from "axios";
import DropzoneCustomComponent from "@/app/components/DropzoneCustomDrop/DropzoneCustomDrop";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Process, Program, Phase, ProcessDocument, Actividad, Subactividad, ProcesoDetalleProps, Caso } from "../types";

const esActoAdministrativo = (nombre: string) => nombre.trim().toLowerCase() === "acto administrativo";

/** Actividad cerrada para avance de fase y “pendiente”. */
const actividadResuelta = (a: Actividad) => !!a.completada || !!a.no_aplica;

/** Modo efectivo del acto administrativo (tabla del caso o interruptor en la actividad). */
const getModoActoAdminEfectivo = (act: Actividad, caso: Caso | null): string | null => {
  if (!esActoAdministrativo(act.nombre)) return null;
  if (caso) {
    if (caso.resolucion_aprobada === true) return "satisfactorio";
    if (caso.resolucion_aprobada === false) return "no_satisfactorio";
    return null;
  }
  return act.acto_admin_modo ?? null;
};

/** Permite marcar “Hecha” el acto administrativo: modo definido y todas las subactividades del ramal resueltas. */
const puedeMarcarHechaActoAdminActividad = (act: Actividad, caso: Caso | null): boolean => {
  if (!esActoAdministrativo(act.nombre)) return true;
  const modo = getModoActoAdminEfectivo(act, caso);
  if (modo === null) return false;
  const subs = act.subactividades.filter((s) => s.grupo === modo);
  if (subs.length === 0) return true;
  return subs.every((s) => s.completada || s.no_aplica);
};

/* ── Fila sortable de actividad (drag & drop) con subactividades ── */
const SortableActividad = ({
  act, index, faseActual, editActividadId, editActividadNombre, editActividadResponsables,
  savingActividad, canToggleCompletada, canToggleNoAplica,
  onToggle, onToggleNoAplica, onEdit, onDelete, onSave, onCancel,
  setEditActividadNombre, setEditActividadResponsables,
  onAddSubactividad, onToggleSubactividad, onToggleSubNoAplica, onDeleteSubactividad, onReorderSubactividades,
  onOpenDocsActividad, onOpenObsActividad,
  onOpenDocsSubactividad, onOpenObsSubactividad,
  onChangeActoAdminModo,
  actoAdminModoExterno,
  actividadDocCount, subactividadDocCounts, tooltipBloqueoHecha,
}: {
  act: Actividad;
  index: number;
  faseActual: Phase;
  editActividadId: string | null;
  editActividadNombre: string;
  editActividadResponsables: string;
  savingActividad: boolean;
  canToggleCompletada: boolean;
  canToggleNoAplica: boolean;
  onToggle: () => void;
  onToggleNoAplica: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  setEditActividadNombre: (v: string) => void;
  setEditActividadResponsables: (v: string) => void;
  onAddSubactividad: (nombre: string) => void;
  onToggleSubactividad: (sub: Subactividad) => void;
  onToggleSubNoAplica: (sub: Subactividad) => void;
  onDeleteSubactividad: (subId: string) => void;
  onOpenDocsActividad: () => void;
  onOpenObsActividad: () => void;
  onOpenDocsSubactividad: (sub: Subactividad) => void;
  onOpenObsSubactividad: (sub: Subactividad) => void;
  onReorderSubactividades: (newOrder: string[]) => void;
  onChangeActoAdminModo: (modo: string | null) => void;
  actoAdminModoExterno?: string | null;
  actividadDocCount: number;
  subactividadDocCounts: Record<string, number>;
  tooltipBloqueoHecha?: string | null;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: act._id });
  const [expandSubs, setExpandSubs] = useState(false);
  const [nuevaSub, setNuevaSub]     = useState("");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleAddSub = () => {
    if (!nuevaSub.trim()) return;
    onAddSubactividad(nuevaSub.trim());
    setNuevaSub("");
  };

  const esActoAdmin = esActoAdministrativo(act.nombre);
  // Si viene modo externo (del caso), usarlo; si no, usar el guardado en la actividad
  const usaModoExterno = esActoAdmin && actoAdminModoExterno !== undefined;
  const modoActual = usaModoExterno ? (actoAdminModoExterno ?? null) : (act.acto_admin_modo ?? null);

  // Subactividades visibles según modo (para "Acto administrativo")
  const subsVisibles = esActoAdmin && modoActual
    ? act.subactividades.filter(s => s.grupo === modoActual)
    : esActoAdmin && !modoActual
    ? []
    : act.subactividades;

  return (
    <div ref={setNodeRef} style={style}>
      <Paper withBorder radius="sm" p="sm">
        {/* Fila principal de la actividad */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
            <div {...attributes} {...listeners} style={{ cursor: "grab", paddingTop: 3, color: "#adb5bd", fontSize: 16, userSelect: "none" }}>
              ⠿
            </div>
            {tooltipBloqueoHecha ? (
              <Tooltip label={tooltipBloqueoHecha} withArrow multiline w={260}>
                <span style={{ display: "inline-flex", marginTop: 2, flexShrink: 0 }}>
                  <Group gap={6} wrap="nowrap" align="flex-start">
                    <input type="checkbox" checked={act.completada && !act.no_aplica}
                      onChange={() => canToggleCompletada && onToggle()}
                      disabled={!canToggleCompletada}
                      title="Hecha"
                      style={{ cursor: canToggleCompletada ? "pointer" : "not-allowed", width: 16, height: 16, marginTop: 2 }}
                    />
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", marginTop: 2 }}>Hecha</Text>
                  </Group>
                </span>
              </Tooltip>
            ) : (
              <Group gap={6} wrap="nowrap" align="flex-start" style={{ marginTop: 2, flexShrink: 0 }}>
                <input type="checkbox" checked={act.completada && !act.no_aplica}
                  onChange={() => canToggleCompletada && onToggle()}
                  disabled={!canToggleCompletada}
                  title="Hecha"
                  style={{ cursor: canToggleCompletada ? "pointer" : "not-allowed", width: 16, height: 16, marginTop: 2 }}
                />
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", marginTop: 2 }}>Hecha</Text>
              </Group>
            )}
            {editActividadId === act._id ? (
              <Stack gap={4} style={{ flex: 1 }}>
                <TextInput size="xs" label="Nombre de la actividad" value={editActividadNombre}
                  onChange={e => setEditActividadNombre(e.currentTarget.value)} autoFocus />
                <TextInput size="xs" label="Responsables" placeholder="Opcional" value={editActividadResponsables}
                  onChange={e => setEditActividadResponsables(e.currentTarget.value)} />
                <Group gap="xs" justify="flex-end">
                  <Button size="xs" variant="default" onClick={onCancel}>Cancelar</Button>
                  <Button size="xs" loading={savingActividad} onClick={onSave}>Guardar</Button>
                </Group>
              </Stack>
            ) : (
              <div style={{ flex: 1 }}>
                <Group gap={6} align="center" wrap="wrap">
                  <Text size="sm" td={(act.completada || act.no_aplica) ? "line-through" : undefined} c={act.no_aplica ? "orange" : act.completada ? "dimmed" : "#000"}>{act.nombre}</Text>
                  {act.no_aplica && <Badge size="xs" color="orange" variant="light">N/A</Badge>}
                </Group>
                <Text size="xs" c={act.responsables ? "dimmed" : "#bbb"} fs={act.responsables ? undefined : "italic"}>
                  {act.responsables || "Sin encargado — clic en ✏ para asignar"}
                </Text>
                {act.fecha_completado && <Text size="xs" c="teal">✓ {act.fecha_completado}</Text>}
                {/* Estado para "Acto administrativo" */}
                {esActoAdmin && (
                  <Group gap="xs" mt={6} align="center">
                    {usaModoExterno ? (
                      /* Modo derivado del caso — solo informativo */
                      modoActual === null ? (
                        <Text size="xs" c="orange" fs="italic">Define el estado en "Información del caso" para ver las subactividades</Text>
                      ) : (
                        <Badge size="xs" color={modoActual === 'satisfactorio' ? 'green' : 'red'} variant="light">
                          {modoActual === 'satisfactorio' ? 'Satisfactorio' : 'No satisfactorio'}
                        </Badge>
                      )
                    ) : (
                      /* Modo con switch propio (actividades sin caso ligado) */
                      <>
                        <Text size="xs" fw={600} c="dimmed">Estado:</Text>
                        <Switch size="md" checked={modoActual === 'satisfactorio'}
                          onChange={e => onChangeActoAdminModo(e.currentTarget.checked ? 'satisfactorio' : 'no_satisfactorio')}
                          color="green" />
                        {modoActual === null && (
                          <Text size="xs" c="orange" fs="italic">Selecciona un estado para ver las subactividades</Text>
                        )}
                        {modoActual !== null && (
                          <Badge size="xs" color={modoActual === 'satisfactorio' ? 'green' : 'red'} variant="light">
                            {modoActual === 'satisfactorio' ? 'Satisfactorio' : 'No satisfactorio'}
                          </Badge>
                        )}
                      </>
                    )}
                  </Group>
                )}
              </div>
            )}
          </Group>
          {editActividadId !== act._id && (
            <Group gap={4} wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
              <Button size="xs" variant="subtle" color="gray" title="Observaciones" onClick={onOpenObsActividad}>
                Observaciones:{act.observaciones ? " ●" : ""}
              </Button>
              <Button size="xs" variant="subtle" color="gray" title="Documentos"
                onClick={onOpenDocsActividad}>
                📎{actividadDocCount > 0 ? ` ${actividadDocCount}` : ""}
              </Button>
              <Button size="xs" variant="subtle" color="blue" onClick={onEdit}>✏</Button>
              <Button size="xs" variant="subtle" color="red" onClick={onDelete}>🗑</Button>
              <Switch
                size="xs"
                label="N/A"
                labelPosition="left"
                checked={!!act.no_aplica}
                onChange={(e) => {
                  if (!canToggleNoAplica) return;
                  const on = e.currentTarget.checked;
                  if (on !== !!act.no_aplica) onToggleNoAplica();
                }}
                disabled={!canToggleNoAplica}
                color="orange"
                styles={{ root: { alignItems: "center" }, label: { fontSize: 11, fontWeight: 600 } }}
              />
            </Group>
          )}
        </Group>

        {/* Botón expandir subactividades */}
        {editActividadId !== act._id && (
          <Box mt={6} ml={40}>
            <Button
              size="xs" variant="subtle" color="gray"
              onClick={() => setExpandSubs(v => !v)}
            >
              {expandSubs ? "▾" : "▸"} Subactividades
                  {subsVisibles.length > 0 && (
                <Badge size="xs" ml={4} color="gray" variant="outline">
                  {subsVisibles.filter(s => s.completada || s.no_aplica || act.no_aplica).length}/{subsVisibles.length}
                </Badge>
              )}
            </Button>

            {expandSubs && (
              <Stack gap={4} mt={6}>
                {subsVisibles.length === 0 && esActoAdmin && modoActual === null && (
                  <Text size="xs" c="dimmed" fs="italic" ml={4}>Selecciona un estado arriba para ver las subactividades.</Text>
                )}
                {subsVisibles.map((sub, subIdx) => {
                  const heredaNaActividad = !!act.no_aplica;
                  const subNaPropia = !!sub.no_aplica;
                  const subNaEfectivo = subNaPropia || heredaNaActividad;
                  const subResuelta = !!sub.completada || subNaEfectivo;
                  return (
                  <Paper key={sub._id} withBorder radius="xs" p={6}
                    style={{ background: subResuelta ? "#f8f9fa" : undefined }}>
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Group gap="xs" style={{ flex: 1, minWidth: 0 }} align="flex-start">
                        <input type="checkbox" checked={sub.completada && !subNaEfectivo}
                          onChange={() => onToggleSubactividad(sub)}
                          disabled={subNaEfectivo}
                          title="Hecha"
                          style={{
                            marginTop: 4,
                            cursor: subNaEfectivo ? "not-allowed" : "pointer",
                            width: 14, height: 14, flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Group gap={4} wrap="wrap" align="center">
                            <Text size="xs" td={subResuelta ? "line-through" : undefined}
                              c={subNaEfectivo ? "orange" : sub.completada ? "dimmed" : undefined}>{sub.nombre}</Text>
                            {subNaEfectivo && (
                              <Badge size="xs" color="orange" variant="light">
                                {heredaNaActividad && !subNaPropia ? "N/A (actividad)" : "N/A"}
                              </Badge>
                            )}
                          </Group>
                          {sub.fecha_completado && !subNaEfectivo && (
                            <Text size="xs" c="teal">✓ {sub.fecha_completado}</Text>
                          )}
                        </div>
                      </Group>
                      <Group gap={4} wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
                        <Button size="xs" variant="subtle" color="gray" p={2}
                          disabled={subIdx === 0 || heredaNaActividad}
                          title="Mover arriba"
                          onClick={() => {
                            const ids = act.subactividades.map(s => s._id);
                            const visIdx = act.subactividades.findIndex(s => s._id === sub._id);
                            const prevVisIdx = subIdx > 0 ? act.subactividades.findIndex(s => s._id === subsVisibles[subIdx - 1]._id) : -1;
                            if (prevVisIdx >= 0) { const tmp = ids[prevVisIdx]; ids[prevVisIdx] = ids[visIdx]; ids[visIdx] = tmp; }
                            onReorderSubactividades(ids);
                          }}>↑</Button>
                        <Button size="xs" variant="subtle" color="gray" p={2}
                          disabled={subIdx === subsVisibles.length - 1 || heredaNaActividad}
                          title="Mover abajo"
                          onClick={() => {
                            const ids = act.subactividades.map(s => s._id);
                            const visIdx = act.subactividades.findIndex(s => s._id === sub._id);
                            const nextVisIdx = subIdx < subsVisibles.length - 1 ? act.subactividades.findIndex(s => s._id === subsVisibles[subIdx + 1]._id) : -1;
                            if (nextVisIdx >= 0) { const tmp = ids[nextVisIdx]; ids[nextVisIdx] = ids[visIdx]; ids[visIdx] = tmp; }
                            onReorderSubactividades(ids);
                          }}>↓</Button>
                        <Button size="xs" variant="subtle" color="gray" title="Observaciones"
                          onClick={() => onOpenObsSubactividad(sub)}>
                          Observaciones:{sub.observaciones ? " ●" : ""}
                        </Button>
                        <Button size="xs" variant="subtle" color="gray" title="Documentos"
                          onClick={() => onOpenDocsSubactividad(sub)}>
                          📎{subactividadDocCounts[sub._id] > 0 ? ` ${subactividadDocCounts[sub._id]}` : ""}
                        </Button>
                        <Button size="xs" variant="subtle" color="red"
                          disabled={heredaNaActividad}
                          onClick={() => onDeleteSubactividad(sub._id)}>🗑</Button>
                        <Switch
                          size="xs"
                          label="N/A"
                          labelPosition="left"
                          checked={subNaEfectivo}
                          onChange={(e) => {
                            if (heredaNaActividad) return;
                            const on = e.currentTarget.checked;
                            if (on !== subNaPropia) onToggleSubNoAplica(sub);
                          }}
                          disabled={heredaNaActividad}
                          color="orange"
                          styles={{ root: { alignItems: "center" }, label: { fontSize: 11, fontWeight: 600 } }}
                        />
                      </Group>
                    </Group>
                  </Paper>
                );})}

                {/* Agregar subactividad */}
                <Group gap="xs" mt={2}>
                  <TextInput size="xs" placeholder="Nueva subactividad..." value={nuevaSub}
                    onChange={e => setNuevaSub(e.currentTarget.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddSub()}
                    style={{ flex: 1 }} />
                  <Button size="xs" variant="light" onClick={handleAddSub}>+</Button>
                </Group>
              </Stack>
            )}
          </Box>
        )}
      </Paper>
    </div>
  );
};
import {
  LABEL_PROCESO, COLOR_PROCESO,
  COLUMNAS_FECHA_RC_PM, COLUMNAS_FECHA_AV, COLUMNAS_FECHA_PM,
  faseColors,
} from "../constants";

const ProcesoDetalleCard = ({
  proceso, programa, fases, onUpdateProceso, onUpdateFases, onUpdatePrograma, onRefreshProcesos,
}: ProcesoDetalleProps) => {
  const faseActual   = fases.find(f => f.numero === proceso.fase_actual);
  const ultimaActiva = faseActual?.actividades.filter(a => !actividadResuelta(a))[0] ?? null;

  /* ── Iniciar / cerrar proceso ── */
  const [resolucionOpen, setResolucionOpen]   = useState(false);
  const [resForm, setResForm]                 = useState({ fecha: "", codigo: "", duracion: "" });
  const [savingRes, setSavingRes]             = useState(false);
  const [cerrarProcesoOpen, setCerrarProcesoOpen] = useState(false);
  const [cerrandoProceso, setCerrandoProceso] = useState(false);

  /* ── PDF de resolución vigente / documentos de proceso ── */
  const [resolucionDoc, setResolucionDoc]                   = useState<ProcessDocument | null>(null);
  const [procesoDocs, setProcesoDocs]                       = useState<ProcessDocument[]>([]);
  const [loadingResolucionDoc, setLoadingResolucionDoc]     = useState(false);
  const [resolucionDocModalOpen, setResolucionDocModalOpen] = useState(false);
  const [fase7DocsOpen, setFase7DocsOpen]                   = useState(false);
  const [deletingDocId, setDeletingDocId]                   = useState<string | null>(null);

  const fetchProcesoDocs = async () => {
    try {
      setLoadingResolucionDoc(true);
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/by-process`, {
        params: { process_id: proceso._id },
      });
      const data = Array.isArray(res.data) ? (res.data as ProcessDocument[]) : [];
      // 'resolucion' va en la fila de info; todo lo demás va en la lista del proceso
      setResolucionDoc(data.find(d => d.doc_type === 'resolucion') ?? null);
      setProcesoDocs(data.filter(d => d.doc_type !== 'resolucion'));
    } catch (e) {
      console.error("Error cargando documentos del proceso:", e);
    } finally {
      setLoadingResolucionDoc(false);
    }
  };

  useEffect(() => { fetchProcesoDocs(); }, [proceso._id]);

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
  const [finalizandoFase, setFinalizandoFase]           = useState(false);

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

  const [savingOffsets, setSavingOffsets]       = useState(false);
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

  // Recargar PM cuando cambia el proceso o su fase (para detectar el PM auto-creado al llegar a Fase 6 en AV)
  useEffect(() => { cargarPM(); }, [proceso._id, proceso.fase_actual]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Información del caso ── */
  const [caso, setCaso]                       = useState<Caso | null>(null);
  const [savingCaso, setSavingCaso]           = useState(false);
  const [editingCasoDateKey, setEditingCasoDateKey] = useState<string | null>(null);

  const cargarCaso = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/casos`, {
        params: { proceso_id: proceso._id },
      });
      setCaso(res.data);
    } catch { setCaso(null); }
  };

  const autoCrearCaso = async () => {
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/casos`, {
        proceso_id: proceso._id,
      });
      setCaso(res.data);
    } catch { /* silencioso */ }
  };

  const saveCasoField = async (field: string, value: string | boolean | null) => {
    if (!caso) return;
    setSavingCaso(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/casos/${caso._id}`, {
        [field]: value,
      });
      setCaso(res.data);
    } catch { /* silencioso */ }
    finally { setSavingCaso(false); }
  };

  const saveCasoDate = async (field: string, val: Date | null) => {
    const fechaStr = val ? val.toISOString().split("T")[0] : null;
    await saveCasoField(field, fechaStr);
    setEditingCasoDateKey(null);
  };

  // "No renovación" siempre tiene caso automáticamente
  const esCasoAutoVisible = (proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV") && proceso.subtipo === "No renovación";

  // Verificar si la actividad "Información del caso" de fase 4 ya está completada
  const actInfoCasoCompletada = fases
    .find(f => f.numero === 4)
    ?.actividades.some(a => a.nombre.trim().toLowerCase() === 'información del caso' && a.completada) ?? false;

  useEffect(() => {
    if (proceso.tipo_proceso !== "RC" && proceso.tipo_proceso !== "AV") return;
    const debeAutoCrear = esCasoAutoVisible || actInfoCasoCompletada;
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/casos`, { params: { proceso_id: proceso._id } })
      .then(res => setCaso(res.data))
      .catch(() => {
        if (debeAutoCrear) autoCrearCaso();
      });
  }, [proceso._id, proceso.fase_actual, actInfoCasoCompletada]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Modal de creación de PM para RC (con etiquetas y meses editables) ── */
  const [crearPMModalOpen, setCrearPMModalOpen] = useState(false);
  const [pmLabels, setPmLabels] = useState({
    label_envio_pm_vicerrectoria:     "Enviar a Vicerrectoría informe Plan de mejoramiento",
    label_entrega_pm_cna:             "Entrega Plan de mejoramiento al CNA",
    label_envio_avance_vicerrectoria: "Enviar a Vicerrectoría informe de avance Plan de mejoramiento",
    label_radicacion_avance_cna:      "Radicación ante CNA informe avance Plan de mejoramiento",
  });
  const [pmMeses, setPmMeses] = useState({
    meses_envio_plan:       5,
    meses_entrega_cna:      6,
    meses_envio_avance:     6,
    meses_radicacion_avance: 0,
  });

  const abrirCrearPM = () => {
    // Si ya hay un PM, prellenar con sus valores guardados
    if (pmProceso) {
      setPmLabels({
        label_envio_pm_vicerrectoria:     pmProceso.label_envio_pm_vicerrectoria     ?? "Enviar a Vicerrectoría informe Plan de mejoramiento",
        label_entrega_pm_cna:             pmProceso.label_entrega_pm_cna             ?? "Entrega Plan de mejoramiento al CNA",
        label_envio_avance_vicerrectoria: pmProceso.label_envio_avance_vicerrectoria ?? "Enviar a Vicerrectoría informe de avance Plan de mejoramiento",
        label_radicacion_avance_cna:      pmProceso.label_radicacion_avance_cna      ?? "Radicación ante CNA informe avance Plan de mejoramiento",
      });
      setPmMeses({
        meses_envio_plan:        pmProceso.meses_envio_pm       ?? 5,
        meses_entrega_cna:       pmProceso.meses_entrega_pm_cna ?? 6,
        meses_envio_avance:      pmProceso.meses_envio_avance   ?? 6,
        meses_radicacion_avance: pmProceso.meses_radicacion_avance ?? 0,
      });
    }
    setCrearPMModalOpen(true);
  };

  const activarPM = async () => {
    setPmError(null);
    try {
      setLoadingPM(true);
      const body = proceso.tipo_proceso === "RC"
        ? { ...pmMeses, ...pmLabels }
        : {};
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}/activate-pm`, body);
      setPmProceso(res.data as Process);
      setCrearPMModalOpen(false);
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

  const intentarAvanzarFaseSiCorresponde = async (fase: Phase, faseActualizada: Phase) => {
    if (fase.numero !== proceso.fase_actual) return;
    if (!faseActualizada.actividades.every(actividadResuelta)) return;
    const siguienteFase = proceso.fase_actual + 1;
    if (siguienteFase > 6) return;
    try {
      const procRes = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`,
        { fase_actual: siguienteFase }
      );
      onUpdateProceso(procRes.data);
    } catch (e) { console.error(e); }
  };

  const toggleCompletada = async (fase: Phase, act: Actividad) => {
    try {
      const nuevaCompletada = !act.completada;
      const hoy = new Date().toISOString().split("T")[0];
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}`,
        {
          completada: nuevaCompletada,
          fecha_completado: nuevaCompletada ? hoy : null,
          ...(nuevaCompletada ? { no_aplica: false } : {}),
        }
      );
      const faseActualizada: Phase = res.data;
      const fasesActualizadas = fases.map(f => f._id === fase._id ? faseActualizada : f);
      onUpdateFases(fasesActualizadas);
      if (nuevaCompletada && fase.numero === 4 &&
          act.nombre.trim().toLowerCase() === 'información del caso') {
        setTimeout(() => cargarCaso(), 300);
      }
      if (nuevaCompletada) await intentarAvanzarFaseSiCorresponde(fase, faseActualizada);
    } catch (e) { console.error(e); }
  };

  const toggleNoAplica = async (fase: Phase, act: Actividad) => {
    try {
      const siguiente = !act.no_aplica;
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}`,
        siguiente
          ? { no_aplica: true, completada: false, fecha_completado: null }
          : { no_aplica: false }
      );
      const faseActualizada: Phase = res.data;
      onUpdateFases(fases.map(f => f._id === fase._id ? faseActualizada : f));
      if (siguiente) await intentarAvanzarFaseSiCorresponde(fase, faseActualizada);
    } catch (e) { console.error(e); }
  };

  /* ── Documentos y observaciones por actividad ── */
  const [actDocsOpen, setActDocsOpen]             = useState(false);
  const [actDocsTarget, setActDocsTarget]         = useState<{ fase: Phase; act: Actividad } | null>(null);
  const [actDocs, setActDocs]                     = useState<ProcessDocument[]>([]);
  const [loadingActDocs, setLoadingActDocs]       = useState(false);
  const [uploadingActDoc, setUploadingActDoc]     = useState(false);
  const [actDocCounts, setActDocCounts]           = useState<Record<string, number>>({});

  const [actObsOpen, setActObsOpen]               = useState(false);
  const [actObsTarget, setActObsTarget]           = useState<{ fase: Phase; act: Actividad } | null>(null);
  const [actObsTexto, setActObsTexto]             = useState("");
  const [savingActObs, setSavingActObs]           = useState(false);

  /* ── Documentos y observaciones por subactividad ── */
  const [subDocsOpen, setSubDocsOpen]             = useState(false);
  const [subDocsTarget, setSubDocsTarget]         = useState<{ fase: Phase; act: Actividad; sub: Subactividad } | null>(null);
  const [subDocs, setSubDocs]                     = useState<ProcessDocument[]>([]);
  const [loadingSubDocs, setLoadingSubDocs]       = useState(false);
  const [uploadingSubDoc, setUploadingSubDoc]     = useState(false);
  const [subDocCounts, setSubDocCounts]           = useState<Record<string, number>>({});

  const [subObsOpen, setSubObsOpen]               = useState(false);
  const [subObsTarget, setSubObsTarget]           = useState<{ fase: Phase; act: Actividad; sub: Subactividad } | null>(null);
  const [subObsTexto, setSubObsTexto]             = useState("");
  const [savingSubObs, setSavingSubObs]           = useState(false);

  /* ── Abrir documentos de actividad ── */
  const abrirDocsActividad = async (fase: Phase, act: Actividad) => {
    setActDocsTarget({ fase, act });
    setLoadingActDocs(true);
    setActDocsOpen(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents`, {
        params: { phase_id: fase._id, actividad_id: act._id },
      });
      const data = Array.isArray(res.data) ? res.data as ProcessDocument[] : [];
      setActDocs(data);
      setActDocCounts(prev => ({ ...prev, [act._id]: data.length }));
    } catch (e) { console.error(e); }
    finally { setLoadingActDocs(false); }
  };

  const subirDocActividad = async (files: File[]) => {
    if (!actDocsTarget || files.length === 0) return;
    setUploadingActDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("actividad_id", actDocsTarget.act._id);
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/process-documents/${actDocsTarget.fase._id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const newDoc = res.data as ProcessDocument;
      setActDocs(prev => [newDoc, ...prev]);
      setActDocCounts(prev => ({ ...prev, [actDocsTarget.act._id]: (prev[actDocsTarget.act._id] ?? 0) + 1 }));
    } catch (e) { console.error(e); }
    finally { setUploadingActDoc(false); }
  };

  const eliminarDocActividad = async (docId: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${docId}`);
      setActDocs(prev => {
        const updated = prev.filter(d => d._id !== docId);
        if (actDocsTarget) setActDocCounts(c => ({ ...c, [actDocsTarget.act._id]: updated.length }));
        return updated;
      });
    } catch (e) { console.error(e); }
  };

  /* ── Abrir observaciones de actividad ── */
  const abrirObsActividad = (fase: Phase, act: Actividad) => {
    setActObsTarget({ fase, act });
    setActObsTexto(act.observaciones ?? "");
    setActObsOpen(true);
  };

  const guardarObsActividad = async () => {
    if (!actObsTarget) return;
    setSavingActObs(true);
    try {
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${actObsTarget.fase._id}/actividades/${actObsTarget.act._id}`,
        { observaciones: actObsTexto }
      );
      onUpdateFases(fases.map(f => f._id === actObsTarget.fase._id ? res.data : f));
      setActObsOpen(false);
    } catch (e) { console.error(e); }
    finally { setSavingActObs(false); }
  };

  /* ── Subactividades CRUD ── */
  const agregarSubactividad = async (fase: Phase, act: Actividad, nombre: string) => {
    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}/subactividades`,
        { nombre }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
    } catch (e) { console.error(e); }
  };

  const toggleSubactividad = async (fase: Phase, act: Actividad, sub: Subactividad) => {
    try {
      const nuevaCompletada = !sub.completada;
      const hoy = new Date().toISOString().split("T")[0];
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}/subactividades/${sub._id}`,
        {
          completada: nuevaCompletada,
          fecha_completado: nuevaCompletada ? hoy : null,
          ...(nuevaCompletada ? { no_aplica: false } : {}),
        }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
    } catch (e) { console.error(e); }
  };

  const toggleSubNoAplica = async (fase: Phase, act: Actividad, sub: Subactividad) => {
    try {
      const siguiente = !sub.no_aplica;
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}/subactividades/${sub._id}`,
        siguiente
          ? { no_aplica: true, completada: false, fecha_completado: null }
          : { no_aplica: false }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
    } catch (e) { console.error(e); }
  };

  const eliminarSubactividad = async (fase: Phase, act: Actividad, subId: string) => {
    try {
      const res = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}/subactividades/${subId}`
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
    } catch (e) { console.error(e); }
  };

  const reorderSubactividades = async (fase: Phase, act: Actividad, newOrder: string[]) => {
    // Actualización optimista local
    const newSubs = newOrder.map(id => act.subactividades.find(s => s._id === id)).filter(Boolean) as Subactividad[];
    const updatedAct  = { ...act, subactividades: newSubs };
    const updatedFase = { ...fase, actividades: fase.actividades.map(a => a._id === act._id ? updatedAct : a) };
    onUpdateFases(fases.map(f => f._id === fase._id ? updatedFase : f));
    try {
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}/subactividades/reorder`,
        { orden: newOrder }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
    } catch (e) { console.error(e); }
  };

  /* ── Abrir documentos de subactividad ── */
  const abrirDocsSubactividad = async (fase: Phase, act: Actividad, sub: Subactividad) => {
    setSubDocsTarget({ fase, act, sub });
    setLoadingSubDocs(true);
    setSubDocsOpen(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents`, {
        params: { phase_id: fase._id, actividad_id: act._id, subactividad_id: sub._id },
      });
      const data = Array.isArray(res.data) ? res.data as ProcessDocument[] : [];
      setSubDocs(data);
      setSubDocCounts(prev => ({ ...prev, [sub._id]: data.length }));
    } catch (e) { console.error(e); }
    finally { setLoadingSubDocs(false); }
  };

  const subirDocSubactividad = async (files: File[]) => {
    if (!subDocsTarget || files.length === 0) return;
    setUploadingSubDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("actividad_id", subDocsTarget.act._id);
      formData.append("subactividad_id", subDocsTarget.sub._id);
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/process-documents/${subDocsTarget.fase._id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const newDoc = res.data as ProcessDocument;
      setSubDocs(prev => [newDoc, ...prev]);
      setSubDocCounts(prev => ({ ...prev, [subDocsTarget.sub._id]: (prev[subDocsTarget.sub._id] ?? 0) + 1 }));
    } catch (e) { console.error(e); }
    finally { setUploadingSubDoc(false); }
  };

  const eliminarDocSubactividad = async (docId: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${docId}`);
      setSubDocs(prev => {
        const updated = prev.filter(d => d._id !== docId);
        if (subDocsTarget) setSubDocCounts(c => ({ ...c, [subDocsTarget.sub._id]: updated.length }));
        return updated;
      });
    } catch (e) { console.error(e); }
  };

  /* ── Abrir observaciones de subactividad ── */
  const abrirObsSubactividad = (fase: Phase, act: Actividad, sub: Subactividad) => {
    setSubObsTarget({ fase, act, sub });
    setSubObsTexto(sub.observaciones ?? "");
    setSubObsOpen(true);
  };

  const guardarObsSubactividad = async () => {
    if (!subObsTarget) return;
    setSavingSubObs(true);
    try {
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${subObsTarget.fase._id}/actividades/${subObsTarget.act._id}/subactividades/${subObsTarget.sub._id}`,
        { observaciones: subObsTexto }
      );
      onUpdateFases(fases.map(f => f._id === subObsTarget.fase._id ? res.data : f));
      setSubObsOpen(false);
    } catch (e) { console.error(e); }
    finally { setSavingSubObs(false); }
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

  const changeActoAdminModo = async (fase: Phase, act: Actividad, modo: string | null) => {
    try {
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}`,
        { acto_admin_modo: modo }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
    } catch (e) { console.error(e); }
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent, fase: Phase) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fase.actividades.findIndex(a => a._id === active.id);
    const newIndex = fase.actividades.findIndex(a => a._id === over.id);
    const nuevasActividades = arrayMove(fase.actividades, oldIndex, newIndex);
    // Actualizar el estado local inmediatamente para que se vea fluido
    const faseActualizada = { ...fase, actividades: nuevasActividades };
    onUpdateFases(fases.map(f => f._id === fase._id ? faseActualizada : f));
    // Persistir en el backend
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/reorder`, {
        orden: nuevasActividades.map(a => a._id),
      });
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
    } catch (e) { console.error(e); }
  };

  const finalizarFase = async (fase: Phase) => {
    setFinalizandoFase(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/complete-all`);
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data.fase : f));
      if (res.data.proceso) onUpdateProceso(res.data.proceso);
      setChecklistOpen(false);
    } catch (e) { console.error(e); }
    finally { setFinalizandoFase(false); }
  };

  const [revirtiendoFase, setRevirtiendoFase] = useState(false);
  const revertirFase = async (fase: Phase) => {
    if (!confirm("¿Seguro que quieres volver a la fase anterior? Se desmarcarán todas las actividades de esta fase.")) return;
    setRevirtiendoFase(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/revert-all`);
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data.fase : f));
      if (res.data.proceso) onUpdateProceso(res.data.proceso);
      setChecklistOpen(false);
    } catch (e) { console.error(e); }
    finally { setRevirtiendoFase(false); }
  };

  /* ── Render tabla Información del caso (reutilizado en vista normal y No renovación) ── */
  const renderCasoTabla = () => {
    if (!caso) return null;
    const mostrarApelacion = caso.resolucion_aprobada === false;
    const COLS_FECHAS = [
      { key: "fecha_solicitud_radicado",       label: "Solicitud radicado" },
      { key: "fecha_notificacion_completitud", label: "Notificación completitud" },
      { key: "fecha_respuesta_completitud",    label: "Respuesta completitud" },
      { key: "fecha_resolucion",               label: "Acto administrativo MEN" },
    ];
    const minWidth = (mostrarApelacion ? 900 : 720) + (caso.codigo_caso !== null ? 120 : 0);

    const renderDateCell = (field: string, bgColor?: string) => {
      const fecha     = caso[field as keyof Caso] as string | null | undefined;
      const isEditing = editingCasoDateKey === field;
      const dateVal   = fecha ? new Date(fecha + "T12:00:00") : null;
      const isApelacion = field === "fecha_resolucion_apelacion";
      return (
        <Table.Td key={field} style={{ verticalAlign: "middle", minWidth: 130, ...(bgColor ? { backgroundColor: bgColor } : {}) }}>
          <Stack gap={2} align="center">
            {isEditing ? (
              <DateInput value={dateVal} onChange={val => saveCasoDate(field, val)}
                valueFormat="YYYY-MM-DD" size="xs" autoFocus onBlur={() => setEditingCasoDateKey(null)}
                style={{ width: 130 }} clearable disabled={savingCaso}
                onKeyDown={e => e.preventDefault()}
                styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
            ) : (
              <Text size="xs" fw={600} ta="center" style={{
                cursor: "pointer", padding: "2px 8px", borderRadius: 4,
                border: isApelacion ? "1px dashed #fd7014" : "1px dashed #4dabf7",
                backgroundColor: isApelacion ? "#fff3e0" : "#e7f5ff",
                color: fecha ? (isApelacion ? "#e67700" : "#1c7ed6") : "#adb5bd",
              }}
                title="Clic para editar fecha" onClick={() => setEditingCasoDateKey(field)}>
                {fecha ?? <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
              </Text>
            )}
          </Stack>
        </Table.Td>
      );
    };

    return (
      <ScrollArea>
        <Table withTableBorder withColumnBorders style={{ minWidth }}>
          <Table.Thead>
            <Table.Tr>
              {/* Código del caso como primera columna */}
              <Table.Th style={{ backgroundColor: "#f8f9fa", minWidth: 140 }}>
                <Text size="xs" fw={700} ta="center">Código del caso</Text>
              </Table.Th>
              {COLS_FECHAS.map(col => (
                <Table.Th key={col.key} style={{ backgroundColor: "#f8f9fa" }}>
                  <Text size="xs" fw={700} ta="center">{col.label}</Text>
                </Table.Th>
              ))}
              <Table.Th style={{ backgroundColor: "#f8f9fa", minWidth: 120 }}>
                <Text size="xs" fw={700} ta="center">Estado</Text>
              </Table.Th>
              {mostrarApelacion && (
                <Table.Th style={{ backgroundColor: "#fff3e0" }}>
                  <Group gap={4} justify="center">
                    <Badge size="xs" color="orange" variant="light">Apelación</Badge>
                    <Text size="xs" fw={700} ta="center">Resolución apelación</Text>
                  </Group>
                </Table.Th>
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              {/* Input código */}
              <Table.Td style={{ verticalAlign: "middle" }}>
                <TextInput
                  size="xs" placeholder="Ej: 2024-RC-001" ta="center"
                  value={caso.codigo_caso ?? ""}
                  onChange={e => setCaso({ ...caso, codigo_caso: e.currentTarget.value })}
                  onBlur={() => saveCasoField("codigo_caso", caso.codigo_caso)}
                  disabled={savingCaso}
                  styles={{ input: { textAlign: "center" } }}
                />
              </Table.Td>
              {COLS_FECHAS.map(col => renderDateCell(col.key))}
              {/* Estado */}
              <Table.Td style={{ verticalAlign: "middle", minWidth: 120 }}>
                <Stack gap={4} align="center">
                  <Switch size="sm"
                    checked={caso.resolucion_aprobada === true}
                    onChange={e => saveCasoField("resolucion_aprobada", e.currentTarget.checked)}
                    color="green" />
                  {caso.resolucion_aprobada !== null && (
                    <Badge size="xs" color={caso.resolucion_aprobada ? "green" : "red"} variant="light">
                      {caso.resolucion_aprobada ? "Satisfactorio" : "No satisfactorio"}
                    </Badge>
                  )}
                </Stack>
              </Table.Td>
              {mostrarApelacion && renderDateCell("fecha_resolucion_apelacion", "#fff8f0")}
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </ScrollArea>
    );
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

  /* ── Fase 7: No renovación (proceso permanente, solo documentos) ── */
  if (proceso.fase_actual === 7) {
    return (
      <Paper withBorder radius="md" mb="md" style={{ overflow: "hidden" }}>

        {/* Header — igual que la vista completa pero sin botón de editar meses */}
        <div style={{ backgroundColor: color, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <Group gap="xs">
            <Text fw={700} c="#333" size="md">{LABEL_PROCESO[proceso.tipo_proceso]}</Text>
            <Badge color="gray" variant="filled" size="sm">No renovación</Badge>
          </Group>
          <Button size="xs" variant="white" color="red" onClick={() => setCerrarProcesoOpen(true)}>Cerrar proceso</Button>
        </div>

        {/* Fila de resolución + PDF */}
        <Box px="md" pt="sm" pb="xs" style={{ borderBottom: "1px solid #dee2e6" }}>
          <Group gap="xl" align="flex-start">
            <div>
              <Text size="xs" c="dimmed" fw={600}>Resolución vigente</Text>
              <Text size="sm" fw={500}>{resolucionCodigo ?? "—"}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" fw={600}>Fecha resolución</Text>
              <Text size="sm" fw={500}>{resolucionFecha ?? "—"}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" fw={600}>Fecha vencimiento</Text>
              <Text size="sm" fw={500}>{proceso.fecha_vencimiento ?? "—"}</Text>
            </div>
            {/* PDF de resolución — al lado de fecha vencimiento */}
            <div>
              <Text size="xs" c="dimmed" fw={600}>PDF resolución</Text>
              <Group gap={6} mt={2}>
                {resolucionDoc && (
                  <Anchor size="xs" href={resolucionDoc.view_link} target="_blank" rel="noopener noreferrer" fw={500}>
                    📄 Ver PDF
                  </Anchor>
                )}
                <Button size="xs" variant="subtle" color="blue" loading={loadingResolucionDoc}
                  onClick={() => setResolucionDocModalOpen(true)}>
                  {resolucionDoc ? "Cambiar" : "Subir PDF"}
                </Button>
              </Group>
            </div>
          </Group>
        </Box>

        {/* Fase 7 — como una sección de fase */}
        <Box px="md" pt="sm" pb="md">
          {/* Cabecera de fase */}
          <Group gap="xs" mb="sm" align="center">
            <Badge color="orange" variant="light" size="md">Plan de contingencia — Solo documentos</Badge>
          </Group>

          {/* Descripción — texto simple gris */}
          <Text size="xs" c="dimmed" mb="sm">
            Proceso de No renovación en Plan de contingencia permanente. No tiene actividades ni fechas de proceso.
          </Text>

          {/* Acciones */}
          <Group gap="xs" mb="sm">
            <Button size="xs" variant="light" onClick={() => setFase7DocsOpen(true)}>
              📎 {procesoDocs.length > 0 ? `Documentos del proceso (${procesoDocs.length})` : "Subir documentos"}
            </Button>
            <Button size="xs" variant="light" onClick={abrirObs}>
              {proceso.observaciones ? "✏ Observaciones" : "+ Observaciones"}
            </Button>
          </Group>

          {/* Lista de documentos del proceso con botón eliminar */}
          {procesoDocs.length > 0 && (
            <Stack gap={4}>
              {procesoDocs.map(doc => (
                <Group key={doc._id} gap={6} align="center">
                  <Anchor size="xs" href={doc.view_link} target="_blank" rel="noopener noreferrer">
                    📄 {doc.name}
                  </Anchor>
                  <Button
                    size="xs" variant="subtle" color="red" p={2}
                    loading={deletingDocId === doc._id}
                    onClick={async () => {
                      try {
                        setDeletingDocId(doc._id);
                        await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${doc._id}`);
                        await fetchProcesoDocs();
                      } catch (e) { console.error(e); }
                      finally { setDeletingDocId(null); }
                    }}>
                    🗑
                  </Button>
                </Group>
              ))}
            </Stack>
          )}

          {/* Observaciones visibles */}
          {proceso.observaciones && (
            <Paper withBorder radius="sm" p="xs" mt="xs" style={{ backgroundColor: "#fff9db" }}>
              <Text size="xs" c="dimmed" mb={2}>Observaciones</Text>
              <Text size="sm">{proceso.observaciones}</Text>
            </Paper>
          )}
        </Box>

        {/* Panel Información del caso — No renovación */}
        {caso && (
          <Box px="md" pt="sm" pb="sm">
            <Group gap="xs" mb="xs">
              <Text size="sm" fw={600}>Información del caso</Text>
              <Badge size="xs" color="blue" variant="light">Activo</Badge>
            </Group>
            {renderCasoTabla()}
          </Box>
        )}

        {/* Modal PDF resolución vigente */}
        <Modal opened={resolucionDocModalOpen} onClose={() => setResolucionDocModalOpen(false)}
          title="PDF de resolución vigente" centered size="md" radius="md" zIndex={300}>
          <Stack gap="md">
            {resolucionDoc && (
              <Paper withBorder p="sm" radius="sm">
                <Group justify="space-between" align="center">
                  <div>
                    <Text size="xs" fw={600} mb={2}>Archivo actual</Text>
                    <Anchor size="xs" href={resolucionDoc.view_link} target="_blank" rel="noopener noreferrer">
                      📄 {resolucionDoc.name}
                    </Anchor>
                  </div>
                  <Button
                    size="xs" variant="subtle" color="red"
                    loading={deletingDocId === resolucionDoc._id}
                    onClick={async () => {
                      try {
                        setDeletingDocId(resolucionDoc._id);
                        await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${resolucionDoc._id}`);
                        await fetchProcesoDocs();
                      } catch (e) { console.error(e); }
                      finally { setDeletingDocId(null); }
                    }}>
                    🗑 Eliminar
                  </Button>
                </Group>
              </Paper>
            )}
            <DropzoneCustomComponent
              text={loadingResolucionDoc ? "Subiendo PDF..." : "Haz clic o arrastra el PDF de la resolución"}
              onDrop={async (files) => {
                const file = files[0]; if (!file) return;
                try {
                  setLoadingResolucionDoc(true);
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("doc_type", "resolucion");
                  await axios.post(
                    `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${proceso._id}`,
                    formData, { headers: { "Content-Type": "multipart/form-data" } }
                  );
                  await fetchProcesoDocs();
                  setResolucionDocModalOpen(false);
                } catch (e) { console.error(e); }
                finally { setLoadingResolucionDoc(false); }
              }}
            />
          </Stack>
        </Modal>

        {/* Modal documentos del proceso (Fase 7) */}
        <Modal opened={fase7DocsOpen} onClose={() => setFase7DocsOpen(false)}
          title="Documentos del proceso" centered size="md" radius="md" zIndex={300}>
          <Stack gap="md">
            <DropzoneCustomComponent
              text={loadingResolucionDoc ? "Subiendo documento..." : "Haz clic o arrastra un archivo para subirlo"}
              onDrop={async (files) => {
                const file = files[0]; if (!file) return;
                try {
                  setLoadingResolucionDoc(true);
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("doc_type", "proceso");
                  await axios.post(
                    `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${proceso._id}`,
                    formData, { headers: { "Content-Type": "multipart/form-data" } }
                  );
                  await fetchProcesoDocs();
                } catch (e) { console.error(e); }
                finally { setLoadingResolucionDoc(false); }
              }}
            />
            {procesoDocs.length > 0 && (
              <>
                <Divider label="Documentos subidos" labelPosition="center" />
                <Stack gap="xs">
                  {procesoDocs.map(doc => (
                    <Group key={doc._id} justify="space-between" align="center">
                      <Anchor size="sm" href={doc.view_link} target="_blank" rel="noopener noreferrer">
                        📄 {doc.name}
                      </Anchor>
                      <Button
                        size="xs" variant="subtle" color="red" p={4}
                        loading={deletingDocId === doc._id}
                        onClick={async () => {
                          try {
                            setDeletingDocId(doc._id);
                            await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${doc._id}`);
                            await fetchProcesoDocs();
                          } catch (e) { console.error(e); }
                          finally { setDeletingDocId(null); }
                        }}>
                        🗑
                      </Button>
                    </Group>
                  ))}
                </Stack>
              </>
            )}
          </Stack>
        </Modal>

        {/* Modal observaciones */}
        <Modal opened={obsOpen} onClose={() => setObsOpen(false)}
          title="Observaciones generales" centered size="sm" radius="md" zIndex={300}>
          <Stack gap="sm">
            <textarea value={obsTexto} onChange={e => setObsTexto(e.target.value)} rows={5}
              style={{ width: "100%", borderRadius: 8, border: "1px solid #dee2e6", padding: "8px 12px", fontSize: 14, resize: "vertical" }}
              placeholder="Escribe las observaciones del proceso..." />
            <Group justify="flex-end">
              <Button variant="default" size="sm" onClick={() => setObsOpen(false)}>Cancelar</Button>
              <Button size="sm" loading={savingObs} onClick={guardarObs}>Guardar</Button>
            </Group>
          </Stack>
        </Modal>

        {/* Modal cerrar proceso */}
        <Modal opened={cerrarProcesoOpen} onClose={() => setCerrarProcesoOpen(false)}
          title="Cerrar proceso" centered size="sm" radius="md" zIndex={300}>
          <Stack gap="sm">
            <Text size="sm">¿Estás seguro de que deseas cerrar este proceso de No renovación? Se moverá al historial.</Text>
            <Group justify="flex-end">
              <Button variant="default" size="sm" onClick={() => setCerrarProcesoOpen(false)}>Cancelar</Button>
              <Button color="red" size="sm" loading={cerrandoProceso} onClick={cerrarProceso}>Cerrar proceso</Button>
            </Group>
          </Stack>
        </Modal>
      </Paper>
    );
  }

  /* ── Vista mínima sin resolución activa (solo procesos legacy sin subtipo) ── */
  const esSubtipoSinResolucion = ["Nuevo", "Primera vez", "Reforma curricular"].includes(proceso.subtipo ?? "");
  if (!resolucionFecha && !esSubtipoSinResolucion) {
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
          {proceso.subtipo ? (
            <Badge variant="light" color="dark" size="sm"
              style={{ backgroundColor: "rgba(255,255,255,0.85)", color: "#333", fontSize: 11 }}>
              {proceso.subtipo}
            </Badge>
          ) : (
            <Text size="xs" c="#555" fs="italic">Sin subtipo</Text>
          )}
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
                      : (proceso.subtipo !== "Nuevo" && proceso.subtipo !== "Primera vez") &&
                        <Text size="xs" c="dimmed" ta="center">{offsetValue != null ? `(${offsetValue} meses antes del vencimiento)` : ""}</Text>
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
                  {proceso.subtipo === "Nuevo" || proceso.subtipo === "Primera vez" ? (
                    <Text size="xs" c="dimmed" fw={600} ta="center" fs="italic">Inexistente</Text>
                  ) : (
                    <>
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
                    </>
                  )}
                </Stack>
              </Table.Td>
              {(proceso.tipo_proceso === "AV" ? COLUMNAS_FECHA_AV : COLUMNAS_FECHA_RC_PM).map(col => {
                const fecha        = proceso[col.key as keyof Process] as string | null;
                const isEditing    = editingDateKey === col.key;
                const dateVal      = fecha ? new Date(fecha + "T12:00:00") : null;
                // fecha_radicado_men es editable para RC Nuevo y AV Primera vez
                const esSoloLectura = col.key === "fecha_vencimiento" ||
                  (col.key === "fecha_radicado_men" && proceso.subtipo !== "Nuevo" && proceso.subtipo !== "Primera vez");
                const obsValor     = proceso[col.obsKey as keyof Process] as string ?? "";
                return (
                  <Table.Td key={col.key} style={{ verticalAlign: "top", minWidth: 140 }}>
                    <Stack gap={4} align="center">
                      {/* Fecha vencimiento inexistente para Nuevo / Primera vez */}
                      {col.key === "fecha_vencimiento" && (proceso.subtipo === "Nuevo" || proceso.subtipo === "Primera vez") ? (
                        <Text size="xs" c="dimmed" fw={600} ta="center" fs="italic">Inexistente</Text>
                      ) : isEditing && !esSoloLectura ? (
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
                          title={esSoloLectura ? (col.key === "fecha_vencimiento" ? "Calculada a partir de la resolución" : "Fecha calculada automáticamente") : "Clic para editar fecha"}
                          onClick={() => { if (!esSoloLectura) setEditingDateKey(col.key); }}
                        >
                          {fecha ? fecha : <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
                        </Text>
                      )}
                      {!(col.key === "fecha_vencimiento" && (proceso.subtipo === "Nuevo" || proceso.subtipo === "Primera vez")) && (
                        <Text size="xs" c={obsValor ? "#1971c2" : "#74c0fc"} td="underline"
                          style={{ cursor: "pointer" }} onClick={() => abrirObsFecha(col.obsKey, col.label)}>
                          {obsValor ? "Ver observaciones" : "Observaciones"}
                        </Text>
                      )}
                    </Stack>
                  </Table.Td>
                );
              })}
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* Bloque Plan de Mejoramiento */}
      {(proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV") && (() => {
        const programaTieneResolucionPM =
          proceso.tipo_proceso === "RC"
            ? !!(programa.fecha_resolucion_rc && programa.duracion_resolucion_rc != null)
            : !!(programa.fecha_resolucion_av && programa.duracion_resolucion_av != null);
        return (
        <Box px="md" pt="sm" pb="sm">
          <Group justify="space-between" mb="xs" align="center">
            <Group gap="xs">
              <Text size="sm" fw={600}>Plan de Mejoramiento</Text>
              {pmProceso && <Badge size="xs" color="green">Activo</Badge>}
              {pmProceso?.subtipo && <Badge size="sm" color="gray" variant="outline">{pmProceso.subtipo}</Badge>}
            </Group>
            <Group gap="xs">
              {/* Solo RC puede quitar el PM manualmente; en AV es permanente */}
              {pmProceso && proceso.tipo_proceso === "RC" && (
                <Button size="xs" variant="subtle" color="red" onClick={() => setConfirmarEliminarPM(true)}>
                  Quitar plan
                </Button>
              )}
              {/* Para RC: botón manual con modal de configuración. Para AV: se crea automáticamente al llegar a Fase 6 */}
              {proceso.tipo_proceso === "RC" && (
                <Button size="xs" variant={pmProceso ? "subtle" : "light"} color={pmProceso ? "gray" : undefined}
                  loading={loadingPM} onClick={abrirCrearPM}>
                  {pmProceso ? "⚙ Editar configuración" : "Activar plan de mejoramiento"}
                </Button>
              )}
              {!pmProceso && proceso.tipo_proceso === "AV" && (
                <Text size="xs" c="dimmed" fs="italic">
                  {proceso.fase_actual >= 6 ? "Creando..." : "Se genera automáticamente al llegar a Fase 6"}
                </Text>
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

          {/* Modal: crear / editar configuración del PM para RC */}
          {proceso.tipo_proceso === "RC" && (
            <Modal opened={crearPMModalOpen} onClose={() => setCrearPMModalOpen(false)}
              title={pmProceso ? "Editar configuración del Plan de Mejoramiento" : "Crear Plan de Mejoramiento"}
              centered size="lg" radius="md">
              <Stack gap="md">
                {!programaTieneResolucionPM && proceso.tipo_proceso === "RC" && (
                  <Alert color="yellow" variant="light" title="Sin resolución vigente en el programa">
                    <Text size="xs">
                      Puedes crear el plan igualmente: las cuatro fechas quedarán vacías hasta que registres fecha y duración de la resolución en la tarjeta del proceso.
                      Después usa Guardar y recalcular aquí para generarlas con los meses que elijas, o complétalas a mano en la tabla del plan.
                    </Text>
                  </Alert>
                )}
                <Text size="sm" c="dimmed">
                  {programaTieneResolucionPM
                    ? "Las fechas se calculan automáticamente a partir de la resolución vigente y los meses que configures."
                    : "Cuando registres resolución y duración en el programa, podrás recalcular fechas con estos meses; si aún no la hay, el plan se crea sin fechas para editarlas a mano o pulsar Guardar y recalcular después."}
                </Text>
                <Divider label="Nombres de las fechas" labelPosition="center" />
                <Stack gap="xs">
                  <TextInput label="Fecha 1 — nombre" size="xs"
                    value={pmLabels.label_envio_pm_vicerrectoria}
                    onChange={e => setPmLabels(p => ({ ...p, label_envio_pm_vicerrectoria: e.currentTarget.value }))} />
                  <TextInput label="Fecha 2 — nombre" size="xs"
                    value={pmLabels.label_entrega_pm_cna}
                    onChange={e => setPmLabels(p => ({ ...p, label_entrega_pm_cna: e.currentTarget.value }))} />
                  <TextInput label="Fecha 3 — nombre" size="xs"
                    value={pmLabels.label_envio_avance_vicerrectoria}
                    onChange={e => setPmLabels(p => ({ ...p, label_envio_avance_vicerrectoria: e.currentTarget.value }))} />
                  <TextInput label="Fecha 4 — nombre" size="xs"
                    value={pmLabels.label_radicacion_avance_cna}
                    onChange={e => setPmLabels(p => ({ ...p, label_radicacion_avance_cna: e.currentTarget.value }))} />
                </Stack>
                <Divider label="Meses de cálculo" labelPosition="center" />
                <Text size="xs" c="dimmed">
                  La <strong>mitad de vigencia</strong> = fecha de resolución + (duración total ÷ 2).
                  Ej: resolución de 7 años → mitad = resolución + 42 meses.
                </Text>
                <SimpleGrid cols={2} spacing="sm">
                  <TextInput
                    label="Fecha 1 — meses DESPUÉS de la resolución"
                    description="Resolución + N meses → fecha resultante"
                    type="number" size="xs"
                    value={pmMeses.meses_envio_plan}
                    onChange={e => setPmMeses(p => ({ ...p, meses_envio_plan: Number(e.currentTarget.value || 0) }))} />
                  <TextInput
                    label="Fecha 2 — meses DESPUÉS de la resolución"
                    description="Resolución + N meses → fecha resultante"
                    type="number" size="xs"
                    value={pmMeses.meses_entrega_cna}
                    onChange={e => setPmMeses(p => ({ ...p, meses_entrega_cna: Number(e.currentTarget.value || 0) }))} />
                  <TextInput
                    label="Fecha 3 — meses ANTES de la mitad de vigencia"
                    description="Mitad de vigencia − N meses → fecha resultante"
                    type="number" size="xs"
                    value={pmMeses.meses_envio_avance}
                    onChange={e => setPmMeses(p => ({ ...p, meses_envio_avance: Number(e.currentTarget.value || 0) }))} />
                  <TextInput
                    label="Fecha 4 — meses DESPUÉS de la mitad de vigencia"
                    description="Mitad de vigencia + N meses (0 = exactamente en la mitad)"
                    type="number" size="xs"
                    value={pmMeses.meses_radicacion_avance}
                    onChange={e => setPmMeses(p => ({ ...p, meses_radicacion_avance: Number(e.currentTarget.value || 0) }))} />
                </SimpleGrid>
                {pmError && <Notification color="red" withCloseButton onClose={() => setPmError(null)}>{pmError}</Notification>}
                <Group justify="flex-end" mt="xs">
                  <Button variant="default" size="sm" onClick={() => setCrearPMModalOpen(false)}>Cancelar</Button>
                  <Button size="sm" loading={loadingPM} onClick={activarPM}>
                    {pmProceso ? "Guardar y recalcular" : "Crear Plan de Mejoramiento"}
                  </Button>
                </Group>
              </Stack>
            </Modal>
          )}

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
                    {COLUMNAS_FECHA_PM.map(col => {
                      // Para RC, usar la etiqueta personalizada guardada en el PM si existe
                      const labelKey = col.key.replace("fecha_", "label_") as keyof Process;
                      const labelPersonalizado = pmProceso[labelKey] as string | null | undefined;
                      const labelFinal = labelPersonalizado ?? col.label;
                      return (
                        <Table.Th key={col.key} style={{ backgroundColor: "#f8f9fa" }}>
                          <Text size="xs" fw={700} ta="center">{labelFinal}</Text>
                          {!labelPersonalizado && col.sub && <Text size="xs" c="dimmed" ta="center">{col.sub}</Text>}
                        </Table.Th>
                      );
                    })}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  <Table.Tr>
                    <Table.Td style={{ width: 140 }}>
                      <Text size="xs" fw={600} ta="center">Fechas</Text>
                    </Table.Td>
                    {COLUMNAS_FECHA_PM.map(col => {
                      const fecha     = pmProceso[col.key as keyof Process] as string | null | undefined;
                      const isEditing = editingPmDateKey === col.key;
                      const dateVal   = fecha ? new Date(fecha + "T12:00:00") : null;
                      const obsValor  = pmProceso[col.obsKey as keyof Process] as string ?? "";
                      const labelKey  = col.key.replace("fecha_", "label_") as keyof Process;
                      const labelFinal = (pmProceso[labelKey] as string | null | undefined) ?? col.label;
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
                              style={{ cursor: "pointer" }} onClick={() => abrirObsPmFecha(col.obsKey, labelFinal)}>
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
        );
      })()}

      {/* ── Bloque Información del caso ── */}
      {(proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV") && caso && (
        <Box px="md" pt="sm" pb="sm">
          <Group gap="xs" mb="xs">
            <Text size="sm" fw={600}>Información del caso</Text>
            <Badge size="xs" color="blue" variant="light">Activo</Badge>
          </Group>
          {renderCasoTabla()}
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
              <Text size="xs" c="green" fw={600}>✓ Todas las actividades resueltas (completadas o no aplican)</Text>
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
                formData.append("doc_type", "resolucion");
                await axios.post(
                  `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${proceso._id}`,
                  formData, { headers: { "Content-Type": "multipart/form-data" } }
                );
                await fetchProcesoDocs();
                setResolucionDocModalOpen(false);
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

      {/* Modal: observaciones de actividad — zIndex alto para quedar encima del checklist */}
      <Modal opened={actObsOpen} onClose={() => setActObsOpen(false)}
        title={`Observaciones — ${actObsTarget?.act.nombre ?? ""}`} centered size="md" radius="md" zIndex={400}>
        <Stack>
          <textarea value={actObsTexto} onChange={e => setActObsTexto(e.target.value)} rows={5}
            style={{ width: "100%", borderRadius: 8, border: "1px solid #dee2e6", padding: "8px 12px", fontSize: 14, resize: "vertical" }}
            placeholder="Escribe observaciones para esta actividad..." />
          <Group justify="flex-end">
            <Button variant="default" size="sm" onClick={() => setActObsOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={savingActObs} onClick={guardarObsActividad}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal: documentos de actividad — zIndex alto para quedar encima del checklist */}
      <Modal opened={actDocsOpen} onClose={() => setActDocsOpen(false)}
        title={`Documentos — ${actDocsTarget?.act.nombre ?? ""}`} centered size="lg" radius="md" zIndex={400}>
        <Stack gap="md">
          <DropzoneCustomComponent
            text={uploadingActDoc ? "Subiendo documento..." : "Haz clic o arrastra un archivo para subirlo a esta actividad"}
            onDrop={subirDocActividad}
          />
          <Divider label="Documentos de esta actividad" labelPosition="center" />
          {loadingActDocs ? (
            <Group justify="center"><Loader size="sm" /></Group>
          ) : actDocs.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center">No hay documentos para esta actividad.</Text>
          ) : (
            <ScrollArea style={{ maxHeight: 240 }}>
              <Stack gap="xs">
                {actDocs.map(doc => (
                  <Group key={doc._id} justify="space-between" align="center">
                    <div style={{ maxWidth: "70%" }}>
                      <Text size="sm" fw={500} truncate="end">{doc.name}</Text>
                      {doc.size != null && <Text size="xs" c="dimmed">{(doc.size / (1024 * 1024)).toFixed(2)} MB</Text>}
                    </div>
                    <Group gap="xs">
                      <Button size="xs" variant="light" component="a" href={doc.view_link} target="_blank" rel="noopener noreferrer">Ver</Button>
                      <Button size="xs" variant="outline" color="red" onClick={() => eliminarDocActividad(doc._id)}>Eliminar</Button>
                    </Group>
                  </Group>
                ))}
              </Stack>
            </ScrollArea>
          )}
        </Stack>
      </Modal>

      {/* Modal: observaciones de subactividad — zIndex alto para quedar encima del checklist */}
      <Modal opened={subObsOpen} onClose={() => setSubObsOpen(false)}
        title={`Observaciones — ${subObsTarget?.sub.nombre ?? ""}`} centered size="md" radius="md" zIndex={400}>
        <Stack>
          <textarea value={subObsTexto} onChange={e => setSubObsTexto(e.target.value)} rows={5}
            style={{ width: "100%", borderRadius: 8, border: "1px solid #dee2e6", padding: "8px 12px", fontSize: 14, resize: "vertical" }}
            placeholder="Escribe observaciones para esta subactividad..." />
          <Group justify="flex-end">
            <Button variant="default" size="sm" onClick={() => setSubObsOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={savingSubObs} onClick={guardarObsSubactividad}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal: documentos de subactividad — zIndex alto para quedar encima del checklist */}
      <Modal opened={subDocsOpen} onClose={() => setSubDocsOpen(false)}
        title={`Documentos — ${subDocsTarget?.sub.nombre ?? ""}`} centered size="lg" radius="md" zIndex={400}>
        <Stack gap="md">
          <DropzoneCustomComponent
            text={uploadingSubDoc ? "Subiendo documento..." : "Haz clic o arrastra un archivo para subirlo a esta subactividad"}
            onDrop={subirDocSubactividad}
          />
          <Divider label="Documentos de esta subactividad" labelPosition="center" />
          {loadingSubDocs ? (
            <Group justify="center"><Loader size="sm" /></Group>
          ) : subDocs.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center">No hay documentos para esta subactividad.</Text>
          ) : (
            <ScrollArea style={{ maxHeight: 240 }}>
              <Stack gap="xs">
                {subDocs.map(doc => (
                  <Group key={doc._id} justify="space-between" align="center">
                    <div style={{ maxWidth: "70%" }}>
                      <Text size="sm" fw={500} truncate="end">{doc.name}</Text>
                      {doc.size != null && <Text size="xs" c="dimmed">{(doc.size / (1024 * 1024)).toFixed(2)} MB</Text>}
                    </div>
                    <Group gap="xs">
                      <Button size="xs" variant="light" component="a" href={doc.view_link} target="_blank" rel="noopener noreferrer">Ver</Button>
                      <Button size="xs" variant="outline" color="red" onClick={() => eliminarDocSubactividad(doc._id)}>Eliminar</Button>
                    </Group>
                  </Group>
                ))}
              </Stack>
            </ScrollArea>
          )}
        </Stack>
      </Modal>

      <Modal opened={checklistOpen}
        onClose={() => { setChecklistOpen(false); setEditActividadId(null); setNuevaActividad(""); }}
        title={faseActual ? `${faseActual.nombre} — Fase ${proceso.fase_actual}` : "Actividades"}
        centered size="lg" radius="md">
        {faseActual && (
          <Stack gap="sm">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, faseActual)}>
              <SortableContext items={faseActual.actividades.map(a => a._id)} strategy={verticalListSortingStrategy}>
                {faseActual.actividades.map((act, index) => {
                  const firstIncompleteIndex = faseActual.actividades.findIndex(a => !actividadResuelta(a));
                  const isFirstIncomplete    = !actividadResuelta(act) && index === firstIncompleteIndex;
                  const puedeHechaActoAdmin  = puedeMarcarHechaActoAdminActividad(act, caso);
                  const canToggleCompletada  = act.no_aplica ? false : (act.completada || (isFirstIncomplete && puedeHechaActoAdmin));
                  const canToggleNoAplica    = act.completada ? false : (act.no_aplica || isFirstIncomplete);
                  const modoActoEff          = getModoActoAdminEfectivo(act, caso);
                  const tooltipBloqueoHecha  = esActoAdministrativo(act.nombre) && !act.completada && !act.no_aplica && isFirstIncomplete && !puedeHechaActoAdmin
                    ? (modoActoEff === null
                        ? "Indica si el acto administrativo fue satisfactorio o no (tabla del caso o interruptor de estado)."
                        : "Completa o marca N/A todas las subactividades de este ramal antes de marcar la actividad como hecha.")
                    : null;
                  return (
                    <SortableActividad
                      key={act._id}
                      act={act}
                      index={index}
                      faseActual={faseActual}
                      editActividadId={editActividadId}
                      editActividadNombre={editActividadNombre}
                      editActividadResponsables={editActividadResponsables}
                      savingActividad={savingActividad}
                      canToggleCompletada={canToggleCompletada}
                      canToggleNoAplica={canToggleNoAplica}
                      tooltipBloqueoHecha={tooltipBloqueoHecha}
                      onToggle={() => toggleCompletada(faseActual, act)}
                      onToggleNoAplica={() => toggleNoAplica(faseActual, act)}
                      onEdit={() => { setEditActividadId(act._id); setEditActividadNombre(act.nombre); setEditActividadResponsables(act.responsables ?? ""); }}
                      onDelete={() => eliminarActividad(faseActual, act._id)}
                      onSave={() => guardarNombreActividad(faseActual, act)}
                      onCancel={() => setEditActividadId(null)}
                      setEditActividadNombre={setEditActividadNombre}
                      setEditActividadResponsables={setEditActividadResponsables}
                      onAddSubactividad={(nombre) => agregarSubactividad(faseActual, act, nombre)}
                      onToggleSubactividad={(sub) => toggleSubactividad(faseActual, act, sub)}
                      onToggleSubNoAplica={(sub) => toggleSubNoAplica(faseActual, act, sub)}
                      onDeleteSubactividad={(subId) => eliminarSubactividad(faseActual, act, subId)}
                      onReorderSubactividades={(newOrder) => reorderSubactividades(faseActual, act, newOrder)}
                      onOpenDocsActividad={() => abrirDocsActividad(faseActual, act)}
                      onOpenObsActividad={() => abrirObsActividad(faseActual, act)}
                      onOpenDocsSubactividad={(sub) => abrirDocsSubactividad(faseActual, act, sub)}
                      onOpenObsSubactividad={(sub) => abrirObsSubactividad(faseActual, act, sub)}
                      onChangeActoAdminModo={(modo) => changeActoAdminModo(faseActual, act, modo)}
                      actoAdminModoExterno={
                        act.nombre.trim().toLowerCase() === 'acto administrativo' && caso
                          ? (caso.resolucion_aprobada === true ? 'satisfactorio' : caso.resolucion_aprobada === false ? 'no_satisfactorio' : null)
                          : undefined
                      }
                      actividadDocCount={actDocCounts[act._id] ?? 0}
                      subactividadDocCounts={subDocCounts}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
            <Group justify="flex-end" mt="xs">
              {proceso.fase_actual > 0 && (
                <Button
                  size="xs"
                  color="orange"
                  variant="light"
                  loading={revirtiendoFase}
                  onClick={() => revertirFase(faseActual)}
                >
                  ← Volver a fase anterior
                </Button>
              )}
              <Button
                size="xs"
                color="green"
                variant="light"
                loading={finalizandoFase}
                onClick={() => finalizarFase(faseActual)}
              >
                ✓ Finalizar fase
              </Button>
            </Group>

            <Divider label="Agregar actividad" labelPosition="center" />
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
