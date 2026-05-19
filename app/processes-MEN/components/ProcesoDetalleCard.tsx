"use client";

import { useState, useEffect, useMemo, type CSSProperties } from "react";
import {
  Text, Button, Paper, Group, Select, Modal, Stack, TextInput, Badge,
  Box, Table, ScrollArea, SimpleGrid, Anchor, Divider, Loader,
  ActionIcon, Switch, Tooltip, Alert, Textarea,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import axios from "axios";
import { useRouter } from "next/navigation";
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

import type { Process, Program, Phase, ProcessDocument, Actividad, Subactividad, ProcesoDetalleProps, Caso, CasoFechaKey } from "../types";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";
import {
  getCasoFechaKeyForActividad,
  getCasoFechaKeyForSubactividad,
  findActividadByCasoKey,
  findSubactividadByCasoKey,
  mergeDocsUniq,
  getCasoFechaString,
  getCasoObsString,
} from "../utils/casoActividadMap";
import { dateParserEspanol } from "../utils/parseFlexibleDate";
import {
  LABEL_PROCESO, COLOR_PROCESO,
  COLUMNAS_FECHA_RC_PM, COLUMNAS_FECHA_AV, COLUMNAS_FECHA_PM,
  faseColors,
  etiquetaSubtipoCompacta,
  stylesSubtipoLargo,
} from "../constants";
import {
  debeMostrarSelectorReunionesFase2,
  getOpcionesCondicionFactor,
  etiquetaCondicionFactor,
} from "../utils/condicionFactorFase2";
import {
  getResolucionVigenteDisplay,
  resolucionVigenteEsInexistente,
} from "../utils/resolucionVigentePrograma";
import { puedeEditarFechaRadicadoMen } from "../utils/fechaRadicadoMenEditable";
import { programCodeKey } from "../utils/programCode";
import HistorialActivoModal from "./HistorialActivoModal";
import RcOficioPostGraciaPanel from "./RcOficioPostGraciaPanel";
import FichaProgramaReformaPanel from "./FichaProgramaReformaPanel";
import {
  buildProgramaEditReforma,
  buildProgramaNuevosValoresApi,
  CAMPOS_REFORMA_UI,
  type ProgramaEditReformaState,
} from "../utils/programaEditReforma";
import { otroProgramaConMismoCodigoInstitucional } from "../utils/programCodigoConflicto";

/** Vigencia habitual en registros/acreditaciones al cerrar con resolución MEN (editable por el usuario). */
const DURACION_VIGENCIA_CIERRE_ANOS_PRED = "7";

const CASO_FECHA_LABELS: Record<CasoFechaKey, string> = {
  fecha_solicitud_radicado: "Solicitud de radicado",
  fecha_notificacion_completitud: "Notificación de completitud",
  fecha_respuesta_completitud: "Respuesta de completitud",
  fecha_resolucion: "Acto administrativo MEN",
  fecha_resolucion_apelacion: "Recurso de reposición radicado",
  fecha_respuesta_men: "Recurso reposición respuesta MEN",
};

const esActoAdministrativo = (nombre: string) => nombre.trim().toLowerCase() === "acto administrativo";

const normActividadNombre = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

const esActividadInformacionCaso = (nombre: string) =>
  normActividadNombre(nombre) === normActividadNombre("Información del caso");

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

/** Permite marcar “Hecho” el acto administrativo: basta con tener definido satisfactorio / no satisfactorio (no exige subactividades). */
const puedeMarcarHechaActoAdminActividad = (act: Actividad, caso: Caso | null): boolean => {
  if (!esActoAdministrativo(act.nombre)) return true;
  const modo = getModoActoAdminEfectivo(act, caso);
  return modo !== null;
};

/** Igual que en SortableActividad: subs visibles según modo del acto administrativo. */
function getSubsVisiblesActividad(act: Actividad, caso: Caso | null): Subactividad[] {
  if (!act.subactividades?.length) return [];
  const esActAdmin = esActoAdministrativo(act.nombre);
  const modoExterno =
    esActAdmin && caso
      ? caso.resolucion_aprobada === true
        ? "satisfactorio"
        : caso.resolucion_aprobada === false
          ? "no_satisfactorio"
          : null
      : undefined;
  const usaModoExterno = esActAdmin && modoExterno !== undefined;
  const modoActual = usaModoExterno ? modoExterno ?? null : act.acto_admin_modo ?? null;
  if (esActAdmin && modoActual) {
    return act.subactividades.filter((s) => s.grupo === modoActual);
  }
  if (esActAdmin && !modoActual) return [];
  return act.subactividades;
}

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
                      title="Hecho"
                      style={{ cursor: canToggleCompletada ? "pointer" : "not-allowed", width: 16, height: 16, marginTop: 2 }}
                    />
                    <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", marginTop: 2 }}>Hecho</Text>
                  </Group>
                </span>
              </Tooltip>
            ) : (
              <Group gap={6} wrap="nowrap" align="flex-start" style={{ marginTop: 2, flexShrink: 0 }}>
                <input type="checkbox" checked={act.completada && !act.no_aplica}
                  onChange={() => canToggleCompletada && onToggle()}
                  disabled={!canToggleCompletada}
                  title="Hecho"
                  style={{ cursor: canToggleCompletada ? "pointer" : "not-allowed", width: 16, height: 16, marginTop: 2 }}
                />
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap", marginTop: 2 }}>Hecho</Text>
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
                        <Text size="xs" c="orange" fs="italic">Define el estado en &quot;Información del caso&quot; para ver las subactividades</Text>
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
                          title="Hecho"
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

/** Alineado con el back (`subtipoEsReformaCierre`): tolera espacios y mayúsculas. */
function esRcSubtipoReformaCualquiera(subtipo: string | null | undefined): boolean {
  const n = String(subtipo ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return n === "reforma curricular" || n === "renovación + reforma";
}
function esRcSubtipoReformaCurricularSolo(subtipo: string | null | undefined): boolean {
  return String(subtipo ?? "").trim().replace(/\s+/g, " ").toLowerCase() === "reforma curricular";
}
function esRcSubtipoRenovacionReforma(subtipo: string | null | undefined): boolean {
  return String(subtipo ?? "").trim().replace(/\s+/g, " ").toLowerCase() === "renovación + reforma";
}
function normalizarSubtipoClave(subtipo: string | null | undefined): string {
  return String(subtipo ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}
function esRcSubtipoNoRenovacion(subtipo: string | null | undefined): boolean {
  return normalizarSubtipoClave(subtipo) === "no renovacion";
}

/** RC otorgado de oficio: sin calendario de trámite; vigencia/resolución al cierre con fecha + código + documento (como otros RC que cierran con resolución). */
function esRcSubtipoRegistroCalificadoDeOficio(subtipo: string | null | undefined): boolean {
  return String(subtipo ?? "").trim().replace(/\s+/g, " ").toLowerCase() === "registro calificado de oficio";
}

/** Misma UX que Nuevo / Primera vez: sin resolución en ficha al inicio; fechas en blanco o editables como trámite nuevo. */
function esSubtipoSinResolucionInicial(subtipo: string | null | undefined): boolean {
  const s = String(subtipo ?? "").trim();
  return s === "Nuevo" || s === "Primera vez" || s === "Reactivación";
}

const ProcesoDetalleCard = ({
  proceso,
  programa,
  fases,
  onUpdateProceso,
  onUpdateFases,
  onUpdatePrograma,
  onRefreshProcesos,
  todosProgramas,
}: ProcesoDetalleProps) => {
  const router = useRouter();
  const faseActual   = fases.find(f => f.numero === proceso.fase_actual);
  const ultimaActiva = (faseActual?.actividades ?? []).filter((a) => !actividadResuelta(a))[0] ?? null;

  /* ── Cerrar proceso ── */
  const [cerrarProcesoOpen, setCerrarProcesoOpen] = useState(false);
  /** RC/AV sin Satisfactorio / No satisfactorio definido en el caso: solo confirmación de cancelación. */
  const [confirmarCierreSinResultadoCasoOpen, setConfirmarCierreSinResultadoCasoOpen] = useState(false);
  const [historialActivoOpen, setHistorialActivoOpen] = useState(false);
  const [cerrandoProceso, setCerrandoProceso] = useState(false);
  const [cierreForm, setCierreForm] = useState({ fecha: "", codigo: "", duracion: "" });
  const [cierreFormRc, setCierreFormRc] = useState({ fecha: "", codigo: "", duracion: "" });
  const [cierreResultado, setCierreResultado] = useState<"aprobado" | "negado" | "cancelado">("cancelado");
  /** Solo AV: al cerrar, ¿la resolución trae también RC de oficio? (doble resolución / dos alertas) */
  const [incluirRcOficioAlCierre, setIncluirRcOficioAlCierre] = useState(false);
  /** AV: el MEN concederá RC de oficio después; la ficha conserva RC «vigente» hasta registrarlo formalmente. */
  const [rcOficioPendienteEntrega, setRcOficioPendienteEntrega] = useState(false);
  const [cierreError, setCierreError] = useState<string | null>(null);
  /** Tras pulsar «Cerrar proceso»: marca duplicado de código institucional en la ficha (reforma). */
  const [resaltarCodigoDuplicadoFichaPorCierre, setResaltarCodigoDuplicadoFichaPorCierre] =
    useState(false);

  /* ── Reforma: edición local del programa (persiste solo al cerrar aprobado) ── */
  const subtipoNorm = String(proceso.subtipo ?? "").trim().replace(/\s+/g, " ");
  const esReforma = proceso.tipo_proceso === "RC" && esRcSubtipoReformaCualquiera(proceso.subtipo);
  /** RC reforma sola: sin resolución MEN; documento de constancia obligatorio al cierre aprobado. */
  const esReformaCurricularSolo = proceso.tipo_proceso === "RC" && esRcSubtipoReformaCurricularSolo(proceso.subtipo);
  const esRenovacionReforma = proceso.tipo_proceso === "RC" && esRcSubtipoRenovacionReforma(proceso.subtipo);
  /** Sin hitos editables del trámite; solo datos de resolución al cerrar (cuenta como RC en vigencia). */
  const esRegistroCalificadoDeOficio =
    proceso.tipo_proceso === "RC" && esRcSubtipoRegistroCalificadoDeOficio(proceso.subtipo);
  /** RC de oficio registrado tras vigencia de gracia (no simultáneo con cierre AV). */
  const esRcOficioPostAvGracia =
    esRegistroCalificadoDeOficio && proceso.rc_oficio_contexto === "post_av_gracia";
  const esProcesoPm = proceso.tipo_proceso === "PM";
  const columnasFechaRcPmVisibles = COLUMNAS_FECHA_RC_PM;
  const columnasFechaTablaPrincipal = esProcesoPm
    ? COLUMNAS_FECHA_PM
    : proceso.tipo_proceso === "AV"
      ? COLUMNAS_FECHA_AV
      : esRegistroCalificadoDeOficio
        ? COLUMNAS_FECHA_RC_PM.filter((c) => c.key === "fecha_vencimiento")
        : columnasFechaRcPmVisibles;
  /** Reforma curricular sola: fechas vacías al crear y editables en gestión (sin autocalculo). */
  const fechasGestionManualReformaSola = esReformaCurricularSolo;
  const esSoloLecturaCeldaFecha = (colKey: string) => {
    if (fechasGestionManualReformaSola) return false;
    if (esRegistroCalificadoDeOficio) return true;
    return colKey === "fecha_vencimiento"
      || (colKey === "fecha_radicado_men" && !puedeEditarFechaRadicadoMen(proceso.subtipo));
  };
  const [programaEdit, setProgramaEdit] = useState<ProgramaEditReformaState>(() => buildProgramaEditReforma(programa));
  useEffect(() => {
    if (!esReforma) return;
    setProgramaEdit(buildProgramaEditReforma(programa));
  }, [esReforma, programa._id]);

  /** Código institucional (`dep_code_programa`) ya usado por otro programa — solo afecta cierre aprobado de reforma. */
  const conflictoCodigoInstitucionalReforma = useMemo(() => {
    if (!esReforma || !todosProgramas?.length) return undefined;
    return otroProgramaConMismoCodigoInstitucional(
      programaEdit.dep_code_programa,
      programa._id,
      todosProgramas,
    );
  }, [esReforma, programa._id, programaEdit.dep_code_programa, todosProgramas]);

  useEffect(() => {
    if (!conflictoCodigoInstitucionalReforma) setResaltarCodigoDuplicadoFichaPorCierre(false);
  }, [conflictoCodigoInstitucionalReforma]);

  const errorCodigoProgramaParaFichaReforma =
    resaltarCodigoDuplicadoFichaPorCierre && conflictoCodigoInstitucionalReforma
      ? `Ese código ya está en uso (${conflictoCodigoInstitucionalReforma.nombre.trim()}). Corrígelo aquí y vuelve a pulsar «Cerrar proceso».`
      : undefined;

  /* ── PDF de resolución vigente / documentos de proceso ── */
  const [resolucionDoc, setResolucionDoc]   = useState<ProcessDocument | null>(null);
  /** PDF del cierre (borrador); no sustituye la resolución vigente hasta confirmar el cierre. */
  const [cierreResolucionDoc, setCierreResolucionDoc] = useState<ProcessDocument | null>(null);
  /** Acto administrativo MEN (caso fase 5); puede usarse como PDF de cierre si no hay otro. */
  const [actoAdminMenDoc, setActoAdminMenDoc] = useState<ProcessDocument | null>(null);
  const [constanciaReformaDoc, setConstanciaReformaDoc] = useState<ProcessDocument | null>(null);
  const [procesoDocs, setProcesoDocs]       = useState<ProcessDocument[]>([]);
  const [loadingResolucionDoc, setLoadingResolucionDoc]     = useState(false);
  const [loadingCierreResolucionDoc, setLoadingCierreResolucionDoc] = useState(false);
  const [resolucionDocModalOpen, setResolucionDocModalOpen] = useState(false);
  const [loadingConstancia, setLoadingConstancia]           = useState(false);
  const [respuestaNoRenovacionDoc, setRespuestaNoRenovacionDoc] = useState<ProcessDocument | null>(null);
  const [respuestaNoRenovModalOpen, setRespuestaNoRenovModalOpen] = useState(false);
  const [fase7DocsOpen, setFase7DocsOpen]                   = useState(false);
  const [deletingDocId, setDeletingDocId]                   = useState<string | null>(null);

  const fetchProcesoDocs = async () => {
    try {
      setLoadingResolucionDoc(true);
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/by-process`, {
        params: { process_id: proceso._id },
      });
      const data = Array.isArray(res.data) ? (res.data as ProcessDocument[]) : [];
      const docMasReciente = (tipo: ProcessDocument["doc_type"]) => {
        const lista = data.filter((d) => d.doc_type === tipo);
        if (!lista.length) return null;
        return [...lista].sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        })[0];
      };
      // 'resolucion' = vigente en proceso; 'resolucion_cierre' = borrador del modal de cierre
      setResolucionDoc(docMasReciente("resolucion"));
      setCierreResolucionDoc(docMasReciente("resolucion_cierre"));
      const actosAdmin = data.filter(
        (d) => d.doc_type === "proceso" && d.caso_date_key === "fecha_resolucion",
      );
      setActoAdminMenDoc(
        actosAdmin.length
          ? [...actosAdmin].sort((a, b) => {
              const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
              const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
              return tb - ta;
            })[0]
          : null,
      );
      setRespuestaNoRenovacionDoc(data.find(d => d.doc_type === "respuesta_no_renovacion") ?? null);
      setConstanciaReformaDoc(data.find(d => d.doc_type === "constancia_reforma") ?? null);
      setProcesoDocs(data.filter(d =>
        d.doc_type !== "resolucion"
        && d.doc_type !== "resolucion_cierre"
        && d.doc_type !== "resolucion_rc_oficio"
        && d.doc_type !== "constancia_reforma"
        && d.doc_type !== "respuesta_no_renovacion"));
    } catch (e) {
      console.error("Error cargando documentos del proceso:", e);
    } finally {
      setLoadingResolucionDoc(false);
    }
  };

  useEffect(() => { fetchProcesoDocs(); }, [proceso._id]);

  const abrirModalCerrar = () => {
    setCierreError(null);
    setResaltarCodigoDuplicadoFichaPorCierre(false);
    const esRcOAv = proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV";
    if (esRcOAv) {
      const resultadoCasoDefinido =
        caso != null && (caso.resolucion_aprobada === true || caso.resolucion_aprobada === false);
      const cierreNoRenovRcSinExigirCaso =
        proceso.tipo_proceso === "RC" && esRcSubtipoNoRenovacion(proceso.subtipo);
      if (!resultadoCasoDefinido && !cierreNoRenovRcSinExigirCaso) {
        setConfirmarCierreSinResultadoCasoOpen(true);
        return;
      }
      if (resultadoCasoDefinido) {
        setCierreResultado(caso!.resolucion_aprobada === true ? "aprobado" : "negado");
      } else {
        setCierreResultado("aprobado");
      }
    } else {
      setCierreResultado("aprobado");
    }

    if (esReforma && Array.isArray(todosProgramas) && todosProgramas.length > 0) {
      const dupCodigoProg = otroProgramaConMismoCodigoInstitucional(
        programaEdit.dep_code_programa,
        programa._id,
        todosProgramas,
      );
      if (dupCodigoProg) {
        setResaltarCodigoDuplicadoFichaPorCierre(true);
        return;
      }
    }

    /* Fecha/código: copia manual del PDF; años de vigencia predeterminados en 7 (editables). */
    const muestraDuracionResolucionCierre =
      (proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV")
      && !esReformaCurricularSolo
      && !(proceso.tipo_proceso === "RC" && esRcSubtipoNoRenovacion(proceso.subtipo));
    const duracionPred = muestraDuracionResolucionCierre ? DURACION_VIGENCIA_CIERRE_ANOS_PRED : "";
    if (esRcOficioPostAvGracia && programa.ultimo_rc) {
      const ur = programa.ultimo_rc;
      const fr = ur.fecha_resolucion ? String(ur.fecha_resolucion).slice(0, 10) : "";
      setCierreForm({
        fecha: fr,
        codigo: ur.codigo_resolucion ? String(ur.codigo_resolucion) : "",
        duracion: "7",
      });
      setCierreResultado("aprobado");
    } else {
      setCierreForm({ fecha: "", codigo: "", duracion: duracionPred });
    }
    setCierreFormRc({ fecha: "", codigo: "", duracion: duracionPred });
    setIncluirRcOficioAlCierre(!!proceso.av_espera_rc_oficio);
    setRcOficioPendienteEntrega(false);

    setCerrarProcesoOpen(true);
  };

  const cerrarProceso = async () => {
    setCierreError(null);
    setCerrandoProceso(true);
    try {
      if (proceso.tipo_proceso === "AV" && cierreResultado === "aprobado" && incluirRcOficioAlCierre && rcOficioPendienteEntrega) {
        setCierreError("Elige solo una opción: RC de oficio incluido en el acto administrativo o pendiente de entrega por el MEN.");
        setCerrandoProceso(false);
        return;
      }
      // Validación frontend para el bloque RC de oficio
      if (proceso.tipo_proceso === "AV" && cierreResultado === "aprobado" && incluirRcOficioAlCierre) {
        if (!cierreFormRc.fecha || !cierreFormRc.codigo || !cierreFormRc.duracion) {
          setCierreError("Completa fecha, código y duración del RC de oficio antes de cerrar.");
          setCerrandoProceso(false);
          return;
        }
      }
      if (
        esReforma
        && cierreResultado === "aprobado"
        && conflictoCodigoInstitucionalReforma
      ) {
        const nom = conflictoCodigoInstitucionalReforma.nombre.trim();
        setCierreError(
          nom
            ? `Ese código de programa ya está en uso («${nom}»). Cambia el código en la ficha y vuelve a intentar.`
            : "Ese código de programa ya está en uso. Cambia el código en la ficha y vuelve a intentar.",
        );
        setCerrandoProceso(false);
        return;
      }
      if (esRcSubtipoReformaCurricularSolo(proceso.subtipo) && cierreResultado === "aprobado" && !constanciaReformaDoc) {
        setCierreError("Adjunta la constancia o confirmación del proceso en este cierre antes de confirmar como aprobado.");
        setCerrandoProceso(false);
        return;
      }
      if (proceso.tipo_proceso === "RC" && esRcSubtipoNoRenovacion(proceso.subtipo) && cierreResultado === "aprobado") {
        if (!cierreForm.fecha) {
          setCierreError("Indica la fecha de la respuesta al cierre antes de cerrar como aprobado.");
          setCerrandoProceso(false);
          return;
        }
        if (!respuestaNoRenovacionDoc) {
          setCierreError("Sube el documento de respuesta al cierre (no es una resolución MEN con código ni vigencia) antes de cerrar como aprobado.");
          setCerrandoProceso(false);
          return;
        }
      }
      try {
        const estadoFinal =
          cierreResultado === "cancelado"
            ? "CANCELADO"
            : cierreResultado === "negado"
              ? "NEGADO"
              : "APROBADO";
        const body: Record<string, unknown> = {
          fecha_resolucion: cierreForm.fecha || undefined,
          codigo_resolucion: cierreForm.codigo || undefined,
          duracion_resolucion: cierreForm.duracion ? Number(cierreForm.duracion) : undefined,
          estado_solicitud: estadoFinal,
        };
        if (esRcSubtipoReformaCurricularSolo(proceso.subtipo)) {
          delete body.fecha_resolucion;
          delete body.codigo_resolucion;
          delete body.duracion_resolucion;
        }
        if (proceso.tipo_proceso === "RC" && esRcSubtipoNoRenovacion(proceso.subtipo)) {
          delete body.codigo_resolucion;
          delete body.duracion_resolucion;
        }

        // Si es reforma y aprobado: incluir diff del programa para que el back lo guarde y actualice
        if (esReforma && estadoFinal === "APROBADO") {
          const LABELS_REFORMA: Record<string, string> = {
            dep_code_programa: "Código del programa",
            nombre: "Nombre del programa", codigo_snies: "Código SNIES",
            modalidad: "Modalidad", nivel_academico: "Nivel académico",
            nivel_formacion: "Nivel de formación", num_creditos: "N° de créditos",
            num_semestres: "N° de semestres", admision_estudiantes: "Admisión de estudiantes",
            num_estudiantes_saces: "N° estudiantes SACES",
          };
          const LABELS_CINE = {
            campo_amplio: "CINE F — Campo amplio",
            campo_especifico: "CINE F — Campo específico",
            campo_detallado: "CINE F — Campo detallado",
          } as const;
          const LABELS_NBC = {
            area_conocimiento: "NBC — Área de conocimiento",
            nbc: "NBC — Núcleo básico del conocimiento",
          } as const;
          const normTxt = (s: string): string | null => {
            const t = String(s).trim();
            return t === "" ? null : t;
          };

          const cambios: Array<{ campo: string; label: string; antes: unknown; despues: unknown }> = [];
          for (const c of CAMPOS_REFORMA_UI) {
            const antes = programa[c.key as keyof Program];
            const despues =
              c.tipo === "number"
                ? (programaEdit[c.key] !== "" ? Number(programaEdit[c.key]) : null)
                : normTxt(String(programaEdit[c.key]));
            const antesN = c.tipo === "number" ? (antes ?? null) : ((antes as string | null | undefined) ?? null);
            const aCmp = antesN != null ? String(antesN) : "";
            const dCmp = despues != null ? String(despues) : "";
            if (aCmp !== dCmp) {
              cambios.push({ campo: c.key, label: LABELS_REFORMA[c.key] ?? c.key, antes: antesN ?? null, despues });
            }
          }

          const cKeys = ["campo_amplio", "campo_especifico", "campo_detallado"] as const;
          for (const ck of cKeys) {
            const antes = programa.cine_f?.[ck] ?? null;
            const despues = normTxt(programaEdit.cine_f[ck]);
            const aCmp = antes == null ? "" : String(antes);
            const dCmp = despues == null ? "" : String(despues);
            if (aCmp !== dCmp) {
              cambios.push({
                campo: `cine_f.${ck}`,
                label: LABELS_CINE[ck],
                antes: antes ?? null,
                despues,
              });
            }
          }
          const nKeys = ["area_conocimiento", "nbc"] as const;
          for (const nk of nKeys) {
            const antes = programa.nbc?.[nk] ?? null;
            const despues = normTxt(programaEdit.nbc[nk]);
            const aCmp = antes == null ? "" : String(antes);
            const dCmp = despues == null ? "" : String(despues);
            if (aCmp !== dCmp) {
              cambios.push({
                campo: `nbc.${nk}`,
                label: LABELS_NBC[nk],
                antes: antes ?? null,
                despues,
              });
            }
          }

          if (cambios.length > 0) {
            body.programa_cambios = cambios;
          }
          /* Siempre enviar snapshot de la ficha editada: antes solo se mandaba nv si había diff; si fallaba la
           * comparación el back no actualizaba Program ni quedaba rastro coherente en historial. */
          body.programa_nuevos_valores = buildProgramaNuevosValoresApi(programaEdit);
        }
        if (proceso.tipo_proceso === "AV" && cierreResultado === "aprobado" && incluirRcOficioAlCierre) {
          body.incluir_rc_de_oficio = true;
          body.rc_oficio = {
            fecha_resolucion: cierreFormRc.fecha || undefined,
            codigo_resolucion: cierreFormRc.codigo || undefined,
            duracion_resolucion: cierreFormRc.duracion ? Number(cierreFormRc.duracion) : undefined,
          };
        }
        if (proceso.tipo_proceso === "AV" && cierreResultado === "aprobado" && rcOficioPendienteEntrega && !incluirRcOficioAlCierre) {
          body.av_rc_oficio_pendiente = true;
        }
        await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}/close`, body);
      } catch (e: unknown) {
        console.error("Error cerrando proceso (API):", e);
        const ax = e as {
          message?: string;
          response?: { status?: number; data?: { error?: string; detalle?: string; message?: string } };
        };
        const d = ax.response?.data;
        const fromApi = [d?.error, d?.detalle].filter(Boolean).join(": ")
          || (typeof d?.message === "string" ? d.message : "");
        const net = !ax.response && typeof ax.message === "string" ? ax.message : "";
        const msg = fromApi
          || (ax.response?.status ? `Respuesta ${ax.response.status} del servidor.` : "")
          || net
          || "No se pudo cerrar el proceso. Revisa la consola o el log del API.";
        setCierreError(msg);
        return;
      }
      setPmProceso(null);
      setCerrarProcesoOpen(false);
      setConfirmarCierreSinResultadoCasoOpen(false);
      try {
        const progRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs/${programa._id}`);
        onUpdatePrograma(progRes.data);
      } catch (e) {
        console.error("Cierre OK pero falló recargar programa; refrescando listado:", e);
      }
      await onRefreshProcesos(programCodeKey(programa));
      router.push(`/processes-MEN/program/${encodeURIComponent(String(programa._id))}`);
    } finally {
      setCerrandoProceso(false);
    }
  };

  /** RC/AV: sin Satisfactorio / No satisfactorio en el caso → cierre directo como CANCELADO tras confirmar. */
  const confirmarCierreCanceladoSinResultadoCaso = async () => {
    setCierreError(null);
    setCerrandoProceso(true);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}/close`, {
        estado_solicitud: "CANCELADO",
      });
      setPmProceso(null);
      setConfirmarCierreSinResultadoCasoOpen(false);
      try {
        const progRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs/${programa._id}`);
        onUpdatePrograma(progRes.data);
      } catch (e) {
        console.error("Cierre OK pero falló recargar programa; refrescando listado:", e);
      }
      await onRefreshProcesos(programCodeKey(programa));
      router.push(`/processes-MEN/program/${encodeURIComponent(String(programa._id))}`);
    } catch (e: unknown) {
      console.error("Error cerrando proceso (API):", e);
      const ax = e as {
        message?: string;
        response?: { status?: number; data?: { error?: string; detalle?: string; message?: string } };
      };
      const d = ax.response?.data;
      const fromApi = [d?.error, d?.detalle].filter(Boolean).join(": ")
        || (typeof d?.message === "string" ? d.message : "");
      const net = !ax.response && typeof ax.message === "string" ? ax.message : "";
      const msg = fromApi
        || (ax.response?.status ? `Respuesta ${ax.response.status} del servidor.` : "")
        || net
        || "No se pudo cerrar el proceso. Revisa la consola o el log del API.";
      setCierreError(msg);
    } finally {
      setCerrandoProceso(false);
    }
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
    const pmActivo = esProcesoPm ? proceso : pmProceso;
    if (!pmActivo) return;
    setObsPmDateKey(obsKey);
    setObsPmDateLabel(label);
    setObsPmDateTexto(pmActivo[obsKey as keyof Process] as string ?? "");
    setObsPmDateOpen(true);
  };

  const guardarObsPmFecha = async () => {
    const pmActivo = esProcesoPm ? proceso : pmProceso;
    if (!obsPmDateKey || !pmActivo) return;
    setSavingObsPmDate(true);
    try {
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/processes/${pmActivo._id}`,
        { [obsPmDateKey]: obsPmDateTexto },
      );
      if (esProcesoPm) {
        onUpdateProceso(res.data);
      } else {
        setPmProceso(res.data);
      }
    } catch (e) { console.error(e); }
    finally { setSavingObsPmDate(false); setObsPmDateOpen(false); }
  };

  /* ── Edición condición/factor (fase 2 — reuniones parciales) ── */
  const [savingFactorCondicion, setSavingFactorCondicion] = useState(false);
  const guardarFactorCondicionActual = async (val: string | null) => {
    const num = val ? parseInt(val) : null;
    setSavingFactorCondicion(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/processes/${proceso._id}`, { factor_condicion_actual: num });
      onUpdateProceso(res.data);
    } catch (e) { console.error(e); }
    finally { setSavingFactorCondicion(false); }
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
    const pmActivo = esProcesoPm ? proceso : pmProceso;
    if (!pmActivo) return;
    setSavingPmDate(true);
    setEditingPmDateKey(null);
    try {
      const fechaStr = val ? val.toISOString().slice(0, 10) : null;
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/processes/${pmActivo._id}`,
        { [key]: fechaStr },
      );
      if (esProcesoPm) {
        onUpdateProceso(res.data);
      } else {
        setPmProceso(res.data);
      }
    } catch (e) { console.error(e); }
    finally { setSavingPmDate(false); }
  };

  const [pmOffsetsModalOpen, setPmOffsetsModalOpen] = useState(false);
  const [savingPmOffsets, setSavingPmOffsets] = useState(false);
  const [pmOffsets, setPmOffsets] = useState({
    envioPlan: 5,
    entregaCna: 6,
    envioAvance: 6,
    radicAvance: 0,
  });

  const abrirModalMesesPlan = (fuente: Process) => {
    setPmOffsets({
      envioPlan: fuente.meses_envio_pm ?? 5,
      entregaCna: fuente.meses_entrega_pm_cna ?? 6,
      envioAvance: fuente.meses_envio_avance ?? 6,
      radicAvance: fuente.meses_radicacion_avance ?? 0,
    });
    setPmOffsetsModalOpen(true);
  };

  const guardarMesesPlan = async () => {
    const parentId = esProcesoPm ? proceso.parent_process_id : proceso._id;
    if (!parentId) return;
    setSavingPmOffsets(true);
    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/processes/${parentId}/activate-pm`,
        {
          meses_envio_plan: pmOffsets.envioPlan,
          meses_entrega_cna: pmOffsets.entregaCna,
          meses_envio_avance: pmOffsets.envioAvance,
          meses_radicacion_avance: pmOffsets.radicAvance,
        },
      );
      const updatedPm = res.data as Process;
      if (esProcesoPm) {
        onUpdateProceso(updatedPm);
      } else {
        setPmProceso(updatedPm);
      }
      setPmOffsetsModalOpen(false);
    } catch (e) { console.error(e); }
    finally { setSavingPmOffsets(false); }
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
  const [confirmarEliminarPM, setConfirmarEliminarPM] = useState(false);
  const [eliminandoPM, setEliminandoPM]               = useState(false);

  const cargarPM = async () => {
    // Solo AV y AE tienen PM; RC no tiene
    if (proceso.tipo_proceso !== "AV" && proceso.tipo_proceso !== "AE") return;
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/processes`, {
        params: { program_code: proceso.program_code, tipo_proceso: "PM" },
      });
      const data: Process[] = Array.isArray(res.data) ? res.data : [];
      const pm = data.find(p => p.parent_process_id === proceso._id) ?? null;
      setPmProceso(pm);
    } catch (e) {
      console.error("Error cargando PM:", e);
    }
  };

  // Recargar PM cuando cambia el proceso (AV/AE) o su ID
  useEffect(() => { cargarPM(); }, [proceso._id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Información del caso ── */
  const [caso, setCaso]                       = useState<Caso | null>(null);
  const [savingCaso, setSavingCaso]           = useState(false);
  const [editingCasoDateKey, setEditingCasoDateKey] = useState<string | null>(null);
  const [casoFechaModalField, setCasoFechaModalField] = useState<CasoFechaKey | null>(null);
  const [casoFechaObsTexto, setCasoFechaObsTexto]         = useState("");
  const [savingCasoFechaObs, setSavingCasoFechaObs]       = useState(false);
  const [casoFechaDocs, setCasoFechaDocs]                 = useState<ProcessDocument[]>([]);
  const [loadingCasoFechaDocs, setLoadingCasoFechaDocs]   = useState(false);
  const [uploadingCasoFechaDoc, setUploadingCasoFechaDoc] = useState(false);
  const [casoFechaDocCounts, setCasoFechaDocCounts]       = useState<Record<string, number>>({});

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

  /** Leer caso desde API (evita cierres obsoletos al sincronizar con el checklist). */
  const loadCasoFresh = async (): Promise<Caso | null> => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/casos`, {
        params: { proceso_id: proceso._id },
      });
      setCaso(res.data);
      return res.data;
    } catch {
      return null;
    }
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
    if (!caso) return;
    const fechaStr = val ? val.toISOString().split("T")[0] : null;
    await saveCasoField(field, fechaStr);
    const key = field as CasoFechaKey;
    const hitAct = findActividadByCasoKey(fases, key);
    try {
      if (hitAct) {
        const res = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/phases/${hitAct.fase._id}/actividades/${hitAct.act._id}`,
          { fecha_completado: fechaStr }
        );
        onUpdateFases(fases.map(f => f._id === hitAct.fase._id ? res.data : f));
      } else {
        const hitSub = findSubactividadByCasoKey(fases, key);
        if (hitSub) {
          const res = await axios.put(
            `${process.env.NEXT_PUBLIC_API_URL}/phases/${hitSub.fase._id}/actividades/${hitSub.act._id}/subactividades/${hitSub.sub._id}`,
            { fecha_completado: fechaStr }
          );
          onUpdateFases(fases.map(f => f._id === hitSub.fase._id ? res.data : f));
        }
      }
    } catch (e) {
      console.error(e);
    }
    setEditingCasoDateKey(null);
  };

  const refreshCasoFechaDocCounts = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/by-process`, {
        params: { process_id: proceso._id },
      });
      const docs = Array.isArray(res.data) ? (res.data as ProcessDocument[]) : [];
      const counts: Record<string, number> = {};
      for (const d of docs) {
        if (d.caso_date_key) counts[d.caso_date_key] = (counts[d.caso_date_key] ?? 0) + 1;
      }
      setCasoFechaDocCounts(counts);
    } catch { /* silencioso */ }
  };

  useEffect(() => {
    void refreshCasoFechaDocCounts();
  }, [proceso._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirCasoFechaModal = async (field: CasoFechaKey) => {
    if (!caso) return;
    setCasoFechaModalField(field);
    setCasoFechaObsTexto(getCasoObsString(caso, field));
    setLoadingCasoFechaDocs(true);
    setCasoFechaDocs([]);
    try {
      const resC = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/by-process`, {
        params: { process_id: proceso._id, caso_date_key: field },
      });
      const fromCaso = Array.isArray(resC.data) ? (resC.data as ProcessDocument[]) : [];
      const hitA = findActividadByCasoKey(fases, field);
      const hitS = !hitA ? findSubactividadByCasoKey(fases, field) : null;
      if (hitA) {
        const resP = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents`, {
          params: { phase_id: hitA.fase._id, actividad_id: hitA.act._id },
        });
        const fromFase = Array.isArray(resP.data) ? (resP.data as ProcessDocument[]) : [];
        setCasoFechaDocs(mergeDocsUniq(fromCaso, fromFase));
      } else if (hitS) {
        const resP = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents`, {
          params: { phase_id: hitS.fase._id, actividad_id: hitS.act._id, subactividad_id: hitS.sub._id },
        });
        const fromFase = Array.isArray(resP.data) ? (resP.data as ProcessDocument[]) : [];
        setCasoFechaDocs(mergeDocsUniq(fromCaso, fromFase));
      } else {
        setCasoFechaDocs(fromCaso);
      }
    } catch { setCasoFechaDocs([]); }
    finally { setLoadingCasoFechaDocs(false); }
  };

  const guardarCasoFechaObs = async () => {
    if (!caso || !casoFechaModalField) return;
    setSavingCasoFechaObs(true);
    try {
      const obsK = `obs_${casoFechaModalField}`;
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/casos/${caso._id}`, {
        [obsK]: casoFechaObsTexto,
      });
      setCaso(res.data);
      const key = casoFechaModalField;
      const hitAct = findActividadByCasoKey(fases, key);
      if (hitAct) {
        const resF = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/phases/${hitAct.fase._id}/actividades/${hitAct.act._id}`,
          { observaciones: casoFechaObsTexto }
        );
        onUpdateFases(fases.map(f => f._id === hitAct.fase._id ? resF.data : f));
        return;
      }
      const hitSub = findSubactividadByCasoKey(fases, key);
      if (hitSub) {
        const resF = await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/phases/${hitSub.fase._id}/actividades/${hitSub.act._id}/subactividades/${hitSub.sub._id}`,
          { observaciones: casoFechaObsTexto }
        );
        onUpdateFases(fases.map(f => f._id === hitSub.fase._id ? resF.data : f));
      }
    } catch { /* silencioso */ }
    finally { setSavingCasoFechaObs(false); }
  };

  const subirCasoFechaDoc = async (files: File[]) => {
    if (!casoFechaModalField || files.length === 0) return;
    setUploadingCasoFechaDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("caso_date_key", casoFechaModalField);
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${proceso._id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const newDoc = res.data as ProcessDocument;
      setCasoFechaDocs(prev => [newDoc, ...prev]);
      await refreshCasoFechaDocCounts();
    } catch (e) { console.error(e); }
    finally { setUploadingCasoFechaDoc(false); }
  };

  const eliminarCasoFechaDoc = async (docId: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${docId}`);
      setCasoFechaDocs(prev => prev.filter(d => d._id !== docId));
      await refreshCasoFechaDocCounts();
    } catch (e) { console.error(e); }
  };

  // "No renovación" siempre tiene caso automáticamente
  const esCasoAutoVisible = (proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV") && proceso.subtipo === "No renovación";

  // Verificar si la actividad "Información del caso" de fase 4 ya está completada
  const actInfoCasoCompletada = (fases.find((f) => f.numero === 4)?.actividades ?? []).some(
    (a) => esActividadInformacionCaso(a.nombre) && a.completada,
  );

  const muestraBloqueCaso =
    !esRegistroCalificadoDeOficio &&
    (proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV") &&
    (esCasoAutoVisible || actInfoCasoCompletada || !!caso);

  useEffect(() => {
    if (proceso.tipo_proceso !== "RC" && proceso.tipo_proceso !== "AV") return;
    const debeAutoCrear = esCasoAutoVisible || actInfoCasoCompletada;
    void (async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/casos`, {
          params: { proceso_id: proceso._id },
        });
        setCaso(res.data);
      } catch {
        if (debeAutoCrear) await autoCrearCaso();
      }
    })();
  }, [proceso._id, proceso.fase_actual, actInfoCasoCompletada]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const hoy = new Date().toISOString().split("T")[0];
      const keyMapeo = getCasoFechaKeyForActividad(fase.numero, act.nombre);
      const esInfoCaso = fase.numero === 4 && esActividadInformacionCaso(act.nombre);
      let fechaCompletado: string | null = nuevaCompletada ? hoy : null;
      let cMap: Caso | null = null;

      const necesitaCaso =
        nuevaCompletada &&
        (Boolean(keyMapeo) ||
          esInfoCaso ||
          Boolean(act.subactividades?.length && (fase.numero === 4 || fase.numero === 5)));

      if (necesitaCaso) {
        cMap = await loadCasoFresh();
        if (!cMap) {
          await autoCrearCaso();
          cMap = await loadCasoFresh();
        }
      }

      if (nuevaCompletada && keyMapeo && cMap) {
        const existente = getCasoFechaString(cMap, keyMapeo);
        if (existente) {
          fechaCompletado = existente.slice(0, 10);
        }
      }

      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}`,
        {
          completada: nuevaCompletada,
          fecha_completado: fechaCompletado,
          ...(nuevaCompletada ? { no_aplica: false } : {}),
        }
      );
      let faseActualizada: Phase = res.data;
      onUpdateFases(fases.map(f => f._id === fase._id ? faseActualizada : f));

      if (!nuevaCompletada) {
        if (esInfoCaso) void cargarCaso();
        return;
      }

      const casoPatch: Partial<Record<CasoFechaKey, string>> = {};
      if (keyMapeo && fechaCompletado) {
        casoPatch[keyMapeo] = fechaCompletado;
      }

      const fechaBase = fechaCompletado ?? hoy;
      if (
        (fase.numero === 4 || fase.numero === 5) &&
        act.subactividades?.length &&
        cMap
      ) {
        const subsVisibles = getSubsVisiblesActividad(act, cMap);
        let phaseWorking = faseActualizada;
        for (const sub of subsVisibles) {
          if (sub.no_aplica) continue;
          const subKey = getCasoFechaKeyForSubactividad(fase.numero, sub.nombre);
          let fechaSub = fechaBase;
          if (subKey) {
            const ex = getCasoFechaString(cMap, subKey);
            if (ex) fechaSub = ex.slice(0, 10);
          }
          const resSub = await axios.put(
            `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}/subactividades/${sub._id}`,
            {
              completada: true,
              fecha_completado: fechaSub,
              no_aplica: false,
            }
          );
          phaseWorking = resSub.data;
          if (subKey) casoPatch[subKey] = fechaSub;
        }
        onUpdateFases(fases.map(f => f._id === fase._id ? phaseWorking : f));
        faseActualizada = phaseWorking;
      }

      if (cMap && Object.keys(casoPatch).length > 0) {
        const resC = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/casos/${cMap._id}`, casoPatch);
        setCaso(resC.data);
        await refreshCasoFechaDocCounts();
      }

      if (esInfoCaso) {
        if (!cMap) await autoCrearCaso();
        else setCaso(cMap);
        await refreshCasoFechaDocCounts();
      }
    } catch (e) {
      console.error(e);
    }
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
      const fromFase = Array.isArray(res.data) ? (res.data as ProcessDocument[]) : [];
      const key = getCasoFechaKeyForActividad(fase.numero, act.nombre);
      let data = fromFase;
      if (key) {
        const resC = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/by-process`, {
          params: { process_id: proceso._id, caso_date_key: key },
        });
        const fromCaso = Array.isArray(resC.data) ? (resC.data as ProcessDocument[]) : [];
        data = mergeDocsUniq(fromFase, fromCaso);
      }
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
      const k = getCasoFechaKeyForActividad(actDocsTarget.fase.numero, actDocsTarget.act.nombre);
      if (k) {
        formData.append("caso_date_key", k);
        formData.append("process_id", proceso._id);
      }
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/process-documents/${actDocsTarget.fase._id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const newDoc = res.data as ProcessDocument;
      setActDocs(prev => {
        const merged = mergeDocsUniq([newDoc], prev);
        setActDocCounts(c => ({ ...c, [actDocsTarget.act._id]: merged.length }));
        return merged;
      });
      await refreshCasoFechaDocCounts();
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
      await refreshCasoFechaDocCounts();
    } catch (e) { console.error(e); }
  };

  /* ── Abrir observaciones de actividad ── */
  const abrirObsActividad = (fase: Phase, act: Actividad) => {
    setActObsTarget({ fase, act });
    const k = getCasoFechaKeyForActividad(fase.numero, act.nombre);
    setActObsTexto(k && caso ? getCasoObsString(caso, k) : (act.observaciones ?? ""));
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
      const k = getCasoFechaKeyForActividad(actObsTarget.fase.numero, actObsTarget.act.nombre);
      if (k && caso) {
        const obsK = `obs_${k}` as const;
        const resC = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/casos/${caso._id}`, {
          [obsK]: actObsTexto,
        });
        setCaso(resC.data);
      }
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
      const keyMapeo = getCasoFechaKeyForSubactividad(fase.numero, sub.nombre);
      let fechaCompletado: string | null = nuevaCompletada ? hoy : null;
      let cMap: Caso | null = null;
      if (nuevaCompletada && keyMapeo) {
        cMap = await loadCasoFresh();
        if (!cMap) { await autoCrearCaso(); cMap = await loadCasoFresh(); }
        if (cMap) {
          const existente = getCasoFechaString(cMap, keyMapeo);
          if (existente) {
            fechaCompletado = existente.slice(0, 10);
          }
        }
      }
      const res = await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/actividades/${act._id}/subactividades/${sub._id}`,
        {
          completada: nuevaCompletada,
          fecha_completado: fechaCompletado,
          ...(nuevaCompletada ? { no_aplica: false } : {}),
        }
      );
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data : f));
      if (nuevaCompletada && keyMapeo && cMap && !getCasoFechaString(cMap, keyMapeo)) {
        const resC = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/casos/${cMap._id}`, {
          [keyMapeo]: hoy,
        });
        setCaso(resC.data);
      }
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
      const fromFase = Array.isArray(res.data) ? (res.data as ProcessDocument[]) : [];
      const key = getCasoFechaKeyForSubactividad(fase.numero, sub.nombre);
      let data = fromFase;
      if (key) {
        const resC = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/by-process`, {
          params: { process_id: proceso._id, caso_date_key: key },
        });
        const fromCaso = Array.isArray(resC.data) ? (resC.data as ProcessDocument[]) : [];
        data = mergeDocsUniq(fromFase, fromCaso);
      }
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
      const k = getCasoFechaKeyForSubactividad(subDocsTarget.fase.numero, subDocsTarget.sub.nombre);
      if (k) {
        formData.append("caso_date_key", k);
        formData.append("process_id", proceso._id);
      }
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/process-documents/${subDocsTarget.fase._id}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      const newDoc = res.data as ProcessDocument;
      setSubDocs(prev => {
        const merged = mergeDocsUniq([newDoc], prev);
        setSubDocCounts(c => ({ ...c, [subDocsTarget.sub._id]: merged.length }));
        return merged;
      });
      await refreshCasoFechaDocCounts();
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
      await refreshCasoFechaDocCounts();
    } catch (e) { console.error(e); }
  };

  /* ── Abrir observaciones de subactividad ── */
  const abrirObsSubactividad = (fase: Phase, act: Actividad, sub: Subactividad) => {
    setSubObsTarget({ fase, act, sub });
    const k = getCasoFechaKeyForSubactividad(fase.numero, sub.nombre);
    setSubObsTexto(k && caso ? getCasoObsString(caso, k) : (sub.observaciones ?? ""));
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
      const k = getCasoFechaKeyForSubactividad(subObsTarget.fase.numero, subObsTarget.sub.nombre);
      if (k && caso) {
        const obsK = `obs_${k}` as const;
        const resC = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/casos/${caso._id}`, {
          [obsK]: subObsTexto,
        });
        setCaso(resC.data);
      }
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

  const [marcandoTodoFase, setMarcandoTodoFase] = useState(false);
  const marcarTodoFase = async (fase: Phase) => {
    setMarcandoTodoFase(true);
    try {
      const hoy = new Date().toISOString().split("T")[0];
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/mark-all-completed`);
      const faseActualizada: Phase = res.data.fase;
      onUpdateFases(fases.map(f => f._id === fase._id ? faseActualizada : f));

      // Actualizar fechas vinculadas en el Caso (igual que hace toggleCompletada individualmente)
      let cMap = await loadCasoFresh();
      if (!cMap && (fase.numero === 4 || fase.numero === 5)) {
        await autoCrearCaso();
        cMap = await loadCasoFresh();
      }

      if (cMap) {
        const casoPatch: Record<string, string> = {};
        for (const act of faseActualizada.actividades) {
          if (act.no_aplica) continue;
          // Fecha de la actividad
          const keyAct = getCasoFechaKeyForActividad(fase.numero, act.nombre);
          if (keyAct && !getCasoFechaString(cMap, keyAct)) {
            casoPatch[keyAct] = act.fecha_completado ?? hoy;
          }
          // Fechas de subactividades
          for (const sub of act.subactividades ?? []) {
            if (sub.no_aplica) continue;
            const keySub = getCasoFechaKeyForSubactividad(fase.numero, sub.nombre);
            if (keySub && !getCasoFechaString(cMap, keySub)) {
              casoPatch[keySub] = sub.fecha_completado ?? hoy;
            }
          }
        }
        if (Object.keys(casoPatch).length > 0) {
          const resC = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/casos/${cMap._id}`, casoPatch);
          setCaso(resC.data);
          await refreshCasoFechaDocCounts();
        }
      }
    } catch (e) { console.error(e); }
    finally { setMarcandoTodoFase(false); }
  };

  const finalizarFase = async (fase: Phase) => {
    setFinalizandoFase(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/finish-phase`);
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data.fase : f));
      if (res.data.proceso) onUpdateProceso(res.data.proceso);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg) alert(msg);
      else console.error(e);
    }
    finally { setFinalizandoFase(false); }
  };

  const [marcandoNaFase6, setMarcandoNaFase6] = useState(false);
  const marcarFaseNoAplicaCompleta = async (fase: Phase) => {
    setMarcandoNaFase6(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/mark-all-no-aplica-fase6`);
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data.fase : f));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg) alert(msg);
      else console.error(e);
    } finally { setMarcandoNaFase6(false); }
  };

  const [revirtiendoFase, setRevirtiendoFase] = useState(false);
  const [faseParaRevertir, setFaseParaRevertir] = useState<Phase | null>(null);

  const confirmarRevertirFase = async () => {
    const fase = faseParaRevertir;
    if (!fase) return;
    setRevirtiendoFase(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/phases/${fase._id}/revert-all`);
      onUpdateFases(fases.map(f => f._id === fase._id ? res.data.fase : f));
      if (res.data.proceso) onUpdateProceso(res.data.proceso);
      setFaseParaRevertir(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (msg) alert(msg);
      else console.error(e);
    } finally {
      setRevirtiendoFase(false);
    }
  };

  /* ── Render tabla Información del caso (reutilizado en vista normal y No renovación) ── */
  const renderCasoTabla = () => {
    if (!caso) return null;
    /** AV No renovación: la gestión va con la resolución MEN favorable; ocultamos completitud y estado. */
    const esAvNoRenovacionCaso = proceso.tipo_proceso === "AV" && proceso.subtipo === "No renovación";
    const mostrarApelacion = !esAvNoRenovacionCaso && caso.resolucion_aprobada === false;
    const COLS_FECHAS: { key: CasoFechaKey; label: string }[] = esAvNoRenovacionCaso
      ? [
        { key: "fecha_solicitud_radicado", label: CASO_FECHA_LABELS.fecha_solicitud_radicado },
        { key: "fecha_resolucion", label: CASO_FECHA_LABELS.fecha_resolucion },
      ]
      : [
        { key: "fecha_solicitud_radicado", label: CASO_FECHA_LABELS.fecha_solicitud_radicado },
        { key: "fecha_notificacion_completitud", label: CASO_FECHA_LABELS.fecha_notificacion_completitud },
        { key: "fecha_respuesta_completitud", label: CASO_FECHA_LABELS.fecha_respuesta_completitud },
        { key: "fecha_resolucion", label: CASO_FECHA_LABELS.fecha_resolucion },
      ];
    const muestraEstadoSolicitud = !esAvNoRenovacionCaso;
    const cellFont: CSSProperties = { fontSize: 12, lineHeight: 1.35 };
    const headStyle: CSSProperties = { ...cellFont, whiteSpace: "normal", wordBreak: "normal", hyphens: "none" };

    const renderDateCell = (field: CasoFechaKey, bgColor?: string) => {
      const fecha     = caso[field] as string | null | undefined;
      const isEditing = editingCasoDateKey === field;
      const dateVal   = fecha ? new Date(fecha + "T12:00:00") : null;
      const isApelacion = field === "fecha_resolucion_apelacion" || field === "fecha_respuesta_men";
      const nDocs = casoFechaDocCounts[field] ?? 0;
      const obsK = `obs_${field}` as keyof Caso;
      const tieneObs = !!String((caso[obsK] as string | undefined) ?? "").trim();
      return (
        <Table.Td key={field} style={{ verticalAlign: "middle", minWidth: 108, maxWidth: 132, padding: "8px 6px", ...(bgColor ? { backgroundColor: bgColor } : {}) }}>
          <Stack gap={2} align="center">
            {isEditing ? (
              <DateInput value={dateVal} onChange={val => saveCasoDate(field, val)}
                valueFormat="DD/MM/YYYY" size="xs" autoFocus onBlur={() => setEditingCasoDateKey(null)}
                style={{ width: 118 }} clearable disabled={savingCaso}
                dateParser={dateParserEspanol}
                placeholder="dd/mm/aaaa"
                styles={{ input: { fontSize: 12, minHeight: 28 } }} />
            ) : (
              <Text fw={600} ta="center" style={{
                ...cellFont,
                cursor: "pointer", padding: "2px 6px", borderRadius: 4,
                border: isApelacion ? "1px dashed #fd7014" : "1px dashed #4dabf7",
                backgroundColor: isApelacion ? "#fff3e0" : "#e7f5ff",
                color: fecha ? (isApelacion ? "#e67700" : "#1c7ed6") : "#adb5bd",
              }}
                title="Clic para editar fecha" onClick={() => setEditingCasoDateKey(field)}>
                {fecha ? formatFechaDDMMYY(fecha) : <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
              </Text>
            )}
            <Text
              size="xs"
              ta="center"
              td="underline"
              style={{ cursor: "pointer", lineHeight: 1.25, color: nDocs > 0 || tieneObs ? "#1971c2" : "#74c0fc" }}
              onClick={e => { e.stopPropagation(); void abrirCasoFechaModal(field); }}
            >
              {nDocs > 0 || tieneObs ? "ver Obs. y Docs." : "Obs. y Docs."}
            </Text>
          </Stack>
        </Table.Td>
      );
    };

    return (
      <ScrollArea type="auto" scrollbars="y" offsetScrollbars style={{ width: "100%" }}>
        <Table withTableBorder withColumnBorders style={{ width: "100%", tableLayout: "fixed" }}>
          <Table.Thead>
            <Table.Tr>
              {/* Código del caso como primera columna */}
              <Table.Th style={{ backgroundColor: "#f8f9fa", width: 120, padding: "8px 6px", verticalAlign: "top" }}>
                <Text fw={700} ta="center" style={headStyle}>Código del caso</Text>
              </Table.Th>
              {COLS_FECHAS.map(col => (
                <Table.Th key={col.key} style={{ backgroundColor: "#f8f9fa", padding: "8px 6px", verticalAlign: "top", maxWidth: 140 }}>
                  <Text fw={700} ta="center" style={headStyle}>{col.label}</Text>
                </Table.Th>
              ))}
              {muestraEstadoSolicitud && (
              <Table.Th style={{ backgroundColor: "#f8f9fa", width: 118, maxWidth: 124, padding: "8px 6px", verticalAlign: "top" }}>
                <Text fw={700} ta="center" style={headStyle}>Estado de la solicitud</Text>
              </Table.Th>
              )}
              {mostrarApelacion && (
                <>
                  <Table.Th style={{ backgroundColor: "#fff3e0", padding: "8px 6px", verticalAlign: "top", maxWidth: 132 }}>
                    <Text fw={700} ta="center" style={headStyle}>{CASO_FECHA_LABELS.fecha_resolucion_apelacion}</Text>
                  </Table.Th>
                  <Table.Th style={{ backgroundColor: "#fff3e0", padding: "8px 6px", verticalAlign: "top", maxWidth: 132 }}>
                    <Text fw={700} ta="center" style={headStyle}>{CASO_FECHA_LABELS.fecha_respuesta_men}</Text>
                  </Table.Th>
                </>
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              {/* Input código */}
              <Table.Td style={{ verticalAlign: "middle", padding: "8px 6px" }}>
                <TextInput
                  size="xs" placeholder="Ej: 2024-RC-001" ta="center"
                  value={caso.codigo_caso ?? ""}
                  onChange={e => setCaso({ ...caso, codigo_caso: e.currentTarget.value })}
                  onBlur={() => saveCasoField("codigo_caso", caso.codigo_caso)}
                  disabled={savingCaso}
                  styles={{ input: { textAlign: "center", fontSize: 12, minHeight: 30 } }}
                />
              </Table.Td>
              {COLS_FECHAS.map(col => renderDateCell(col.key))}
              {muestraEstadoSolicitud && (
              <Table.Td style={{ verticalAlign: "middle", width: 118, maxWidth: 124, padding: "6px 4px" }}>
                <Stack gap={4} align="stretch" justify="center">
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 6, cursor: "pointer", ...cellFont, lineHeight: 1.25 }}>
                    <input
                      type="checkbox"
                      checked={caso.resolucion_aprobada === true}
                      onChange={() => saveCasoField("resolucion_aprobada", true)}
                      disabled={savingCaso}
                      style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }}
                    />
                    <span>Satisfactorio</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 6, cursor: "pointer", ...cellFont, lineHeight: 1.25 }}>
                    <input
                      type="checkbox"
                      checked={caso.resolucion_aprobada === false}
                      onChange={() => saveCasoField("resolucion_aprobada", false)}
                      disabled={savingCaso}
                      style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }}
                    />
                    <span>No satisfactorio</span>
                  </label>
                </Stack>
              </Table.Td>
              )}
              {mostrarApelacion && renderDateCell("fecha_resolucion_apelacion", "#fff8f0")}
              {mostrarApelacion && renderDateCell("fecha_respuesta_men", "#fff8f0")}
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </ScrollArea>
    );
  };

  /* ── Datos derivados ── */
  const color           = COLOR_PROCESO[proceso.tipo_proceso] ?? "#868e96";
  const vigenteRcAv =
    proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV"
      ? getResolucionVigenteDisplay(programa, proceso.tipo_proceso)
      : esProcesoPm
        ? getResolucionVigenteDisplay(programa, "AV")
        : null;
  const resolucionFecha = vigenteRcAv?.fecha ?? null;
  const resolucionCodigo = vigenteRcAv?.codigo ?? null;
  const linkPdfResolucionVigente = vigenteRcAv?.linkPdf ?? resolucionDoc?.view_link ?? null;
  const muestraResolucionVigenteInexistente = resolucionVigenteEsInexistente(proceso.subtipo);
  const muestraSelectorReuniones = debeMostrarSelectorReunionesFase2(proceso, ultimaActiva?.nombre);
  const opcionesFactorCondicion = getOpcionesCondicionFactor(proceso.tipo_proceso);
  const etiquetaFactorCondicion = etiquetaCondicionFactor(proceso.tipo_proceso);

  const mostrarBloqueRcOficioCierre = proceso.tipo_proceso === "AV" && incluirRcOficioAlCierre;
  const etiquetasResolucionAv = proceso.tipo_proceso === "AV" && mostrarBloqueRcOficioCierre;
  const cierreMuestraEstado =
    (proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV") && !esRcOficioPostAvGracia;
  const cierreMuestraResolucionBloque =
    (proceso.tipo_proceso === "RC" || proceso.tipo_proceso === "AV")
    && cierreResultado === "aprobado"
    && !esReformaCurricularSolo;
  const esCierreNoRenovacionRc = proceso.tipo_proceso === "RC" && esRcSubtipoNoRenovacion(proceso.subtipo);
  /** Caso con resultado explícito (modal completo de cierre). */
  const casoEsSatisfactorio = caso?.resolucion_aprobada === true;
  const casoEsNoSatisfactorio = caso?.resolucion_aprobada === false;

  const cuerpoModalCerrarProceso = (
    <Stack gap="sm">
      {cierreError && (
        <Alert color="red" title="Error al cerrar" onClose={() => setCierreError(null)} withCloseButton>
          {cierreError}
        </Alert>
      )}
      {cierreMuestraEstado && (
        <>
          {casoEsSatisfactorio && (
            <Text size="sm" c="green" fw={500}>
              El caso figura como <strong>Satisfactorio</strong>. Puedes cerrar como <strong>Aprobado</strong> (predeterminado) o <strong>Cancelado</strong> por la institución.
            </Text>
          )}
          {casoEsNoSatisfactorio && (
            <Text size="sm" c="orange" fw={500}>
              El caso figura como <strong>No satisfactorio</strong>. Puedes cerrar como <strong>Negado</strong> (predeterminado), <strong>Aprobado</strong> si la apelación fue favorable, o <strong>Cancelado</strong> por la institución.
            </Text>
          )}
          <Group gap="md" align="flex-start" wrap="wrap">
            <Text size="sm" fw={600} style={{ minWidth: 150 }}>Estado de la solicitud</Text>
            <Group gap="lg">
              {casoEsSatisfactorio && (
                <>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={cierreResultado === "aprobado"}
                      onChange={() => { setCierreResultado("aprobado"); setCierreError(null); }}
                      style={{ width: 16, height: 16 }}
                    />
                    <Text size="sm">Aprobado</Text>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={cierreResultado === "cancelado"}
                      onChange={() => {
                        setCierreResultado("cancelado");
                        setIncluirRcOficioAlCierre(false);
                        setCierreError(null);
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    <Text size="sm">Cancelado</Text>
                  </label>
                </>
              )}
              {casoEsNoSatisfactorio && (
                <>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={cierreResultado === "negado"}
                      onChange={() => {
                        setCierreResultado("negado");
                        setIncluirRcOficioAlCierre(false);
                        setCierreError(null);
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    <Text size="sm">Negado</Text>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={cierreResultado === "aprobado"}
                      onChange={() => {
                        setCierreResultado("aprobado");
                        setCierreError(null);
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    <Text size="sm">Aprobado</Text>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={cierreResultado === "cancelado"}
                      onChange={() => {
                        setCierreResultado("cancelado");
                        setIncluirRcOficioAlCierre(false);
                        setCierreError(null);
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    <Text size="sm">Cancelado</Text>
                  </label>
                </>
              )}
            </Group>
          </Group>
          {cierreResultado === "aprobado" ? (
            proceso.tipo_proceso === "PM" ? (
              <Text size="sm" c="dimmed">Se archiva el plan de mejoramiento en <strong>historial</strong>.</Text>
            ) : esReformaCurricularSolo ? (
              <Text size="sm">
                Se archiva en <strong>historial</strong> y se aplican los cambios del programa. <strong>No</strong> se genera alerta ni se guarda resolución MEN en la ficha. Adjunta la constancia en este cierre.
              </Text>
            ) : esRenovacionReforma ? (
              <Text size="sm">
                Se archiva en <strong>historial</strong>, se aplican los cambios del programa, se actualiza la <strong>vigencia</strong> y se crea la <strong>alerta</strong> de renovación. Sube un solo PDF con resolución y constancia.
              </Text>
            ) : esCierreNoRenovacionRc ? (
              <>
                <Text size="sm">
                  Se archiva en <strong>historial</strong>, el programa pasa a <strong>Inactivo</strong> y <strong>no</strong> se genera alerta de renovación.
                </Text>
                <Text size="xs" c="dimmed">
                  Indica solo la <strong>fecha de la respuesta</strong> al trámite y adjunta el <strong>documento de respuesta</strong> (no aplica resolución MEN con código ni años de vigencia).
                </Text>
              </>
            ) : esRcOficioPostAvGracia ? (
              <>
                <Text size="sm">
                  Los datos del <strong>registro calificado de oficio</strong> quedaron al crear el proceso. Al cerrar solo se <strong>archiva</strong> el trámite en historial (la alerta RC de renovación ya está activa).
                </Text>
                <Text size="xs" c="dimmed">
                  Confirma fecha, código y PDF si hace falta actualizarlos antes de cerrar.
                </Text>
              </>
            ) : (
            <>
              <Text size="sm">
                Se archiva en <strong>historial</strong> y se crea una o más <strong>alertas</strong> (proceso tipo aparte) con fechas fijas hasta que inicies un nuevo RC/AV.
              </Text>
              <Text size="xs" c="dimmed">
                Indica fecha, código y años de vigencia según el <strong>documento de resolución</strong> del trámite. Si debes adjuntar o cambiar el PDF, hazlo aquí o desde la sección de resolución del proceso.
              </Text>
            </>
            )
          ) : cierreResultado === "cancelado" ? (
            <Text size="sm" c="dimmed">
              El proceso fue <strong>cancelado por la institución</strong>. Solo se guarda en historial. No se genera alerta y el programa podrá abrir un nuevo proceso del mismo tipo.
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              Solo se guarda en <strong>historial</strong>. No se genera alerta; el programa podrá abrir de nuevo un proceso del mismo tipo.
            </Text>
          )}
        </>
      )}

      {cierreMuestraResolucionBloque && (
        <>
          {etiquetasResolucionAv && (
            <Text size="sm" fw={700} c="violet" mt="xs">Acreditación voluntaria</Text>
          )}
          <div>
            <Text size="sm" fw={500} mb={4}>
              {etiquetasResolucionAv
                ? "Fecha de resolución (AV)"
                : esCierreNoRenovacionRc
                  ? "Fecha de la respuesta al cierre"
                  : "Fecha de resolución"}
            </Text>
            <DateInput
              value={cierreForm.fecha ? new Date(cierreForm.fecha + "T12:00:00") : null}
              onChange={(val) => setCierreForm((f) => ({ ...f, fecha: val ? val.toISOString().slice(0, 10) : "" }))}
              valueFormat="DD/MM/YYYY"
              placeholder="dd/mm/aaaa"
              clearable
              dateParser={dateParserEspanol}
            />
          </div>
          {esCierreNoRenovacionRc ? (
            <>
              <Divider label="Documento de respuesta al cierre" labelPosition="left" my="sm" />
              <Text size="xs" c="dimmed" mb="xs">
                Acto o comunicación con el que se da respuesta al trámite de no renovación (no es resolución MEN con código ni vigencia).
              </Text>
              {respuestaNoRenovacionDoc && (
                <Group gap="xs" align="center" wrap="wrap" mb="xs">
                  <Text size="xs" fw={600}>Archivo actual:</Text>
                  <Anchor size="xs" href={respuestaNoRenovacionDoc.view_link} target="_blank" rel="noopener noreferrer">
                    {respuestaNoRenovacionDoc.name}
                  </Anchor>
                  <Button
                    size="xs" variant="subtle" color="red"
                    loading={deletingDocId === respuestaNoRenovacionDoc._id}
                    onClick={async () => {
                      try {
                        setDeletingDocId(respuestaNoRenovacionDoc._id);
                        await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${respuestaNoRenovacionDoc._id}`);
                        await fetchProcesoDocs();
                      } catch (e) { console.error(e); }
                      finally { setDeletingDocId(null); }
                    }}
                  >
                    Quitar
                  </Button>
                </Group>
              )}
              <DropzoneCustomComponent
                text={loadingResolucionDoc ? "Subiendo..." : "Adjuntar o reemplazar documento de respuesta"}
                onDrop={async (files) => {
                  const file = files[0]; if (!file) return;
                  try {
                    setLoadingResolucionDoc(true);
                    const formData = new FormData();
                    formData.append("file", file);
                    formData.append("doc_type", "respuesta_no_renovacion");
                    if (respuestaNoRenovacionDoc) {
                      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${respuestaNoRenovacionDoc._id}`);
                    }
                    await axios.post(
                      `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${proceso._id}`,
                      formData, { headers: { "Content-Type": "multipart/form-data" } }
                    );
                    await fetchProcesoDocs();
                  } catch (e) { console.error(e); }
                  finally { setLoadingResolucionDoc(false); }
                }}
              />
            </>
          ) : (
            <>
              <TextInput label={etiquetasResolucionAv ? "Código de resolución (AV)" : "Código de resolución"} value={cierreForm.codigo}
                onChange={(e) => { const v = e.currentTarget.value; setCierreForm((f) => ({ ...f, codigo: v })); }} />
              <TextInput label={etiquetasResolucionAv ? "Duración de la vigencia — años (AV)" : "Duración de la vigencia (años)"} value={cierreForm.duracion}
                onChange={(e) => {
                  const duracion = e.currentTarget.value.replace(/\D/g, "");
                  setCierreForm((f) => ({ ...f, duracion }));
                }} />
              <div>
                <Text size="sm" fw={500} mb={4}>
                  {esRenovacionReforma
                    ? "Documento del cierre (resolución MEN y constancia)"
                    : `PDF de resolución ${etiquetasResolucionAv ? "(AV)" : ""}`}
                </Text>
                <Text size="xs" c="dimmed" mb="xs">
                  {esRenovacionReforma
                    ? "Un solo archivo: en el historial se mostrará como resolución y como constancia de la reforma."
                    : "Este archivo se aplicará al programa al confirmar el cierre. La resolución vigente del registro no cambia hasta entonces."}
                </Text>
                {actoAdminMenDoc && !cierreResolucionDoc && (
                  <Alert color="blue" variant="light" mb="xs" title="PDF del acto administrativo MEN">
                    <Text size="xs">
                      Ya hay un documento en información del caso (acto administrativo MEN). Al cerrar como aprobado se usará ese PDF como resolución del trámite.
                    </Text>
                    <Anchor size="xs" href={actoAdminMenDoc.view_link} target="_blank" rel="noopener noreferrer" mt={4} display="block">
                      📄 {actoAdminMenDoc.name}
                    </Anchor>
                  </Alert>
                )}
                {cierreResolucionDoc && (
                  <Stack gap={6} mb="xs">
                    {esRenovacionReforma ? (
                      <>
                        <Group gap="xs" wrap="wrap">
                          <Text size="xs" fw={600}>Resolución MEN:</Text>
                          <Anchor size="xs" href={cierreResolucionDoc.view_link} target="_blank" rel="noopener noreferrer" fw={500}>
                            📄 {cierreResolucionDoc.name}
                          </Anchor>
                        </Group>
                        <Group gap="xs" wrap="wrap">
                          <Text size="xs" fw={600}>Constancia de la reforma:</Text>
                          <Anchor size="xs" href={cierreResolucionDoc.view_link} target="_blank" rel="noopener noreferrer" fw={500}>
                            📄 {cierreResolucionDoc.name}
                          </Anchor>
                        </Group>
                      </>
                    ) : (
                      <Group gap="xs" align="center" wrap="wrap">
                        <Text size="xs" fw={600}>Archivo del cierre:</Text>
                        <Anchor size="xs" href={cierreResolucionDoc.view_link} target="_blank" rel="noopener noreferrer" fw={500}>
                          📄 {cierreResolucionDoc.name}
                        </Anchor>
                      </Group>
                    )}
                    <Button
                      size="xs" variant="subtle" color="red"
                      loading={deletingDocId === cierreResolucionDoc._id}
                      onClick={async () => {
                        try {
                          setDeletingDocId(cierreResolucionDoc._id);
                          await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${cierreResolucionDoc._id}`);
                          setCierreResolucionDoc(null);
                        } catch (e) { console.error(e); }
                        finally { setDeletingDocId(null); }
                      }}
                    >
                      Quitar
                    </Button>
                  </Stack>
                )}
                <DropzoneCustomComponent
                  text={
                    loadingCierreResolucionDoc
                      ? "Subiendo..."
                      : cierreResolucionDoc
                        ? esRenovacionReforma
                          ? "Reemplazar documento (resolución y constancia)"
                          : "Reemplazar PDF del cierre"
                        : actoAdminMenDoc
                          ? "Subir otro PDF (opcional; reemplaza el del acto administrativo)"
                          : esRenovacionReforma
                            ? "Adjuntar PDF con resolución y constancia (obligatorio si está aprobado)"
                            : "Adjuntar PDF del cierre (obligatorio si está aprobado)"
                  }
                  onDrop={async (files) => {
                    const file = files[0]; if (!file) return;
                    try {
                      setLoadingCierreResolucionDoc(true);
                      const formData = new FormData();
                      formData.append("file", file);
                      formData.append("doc_type", "resolucion_cierre");
                      const uploadRes = await axios.post(
                        `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${proceso._id}`,
                        formData, { headers: { "Content-Type": "multipart/form-data" } }
                      );
                      const uploaded = uploadRes.data as ProcessDocument;
                      if (uploaded?.doc_type === "resolucion_cierre") {
                        setCierreResolucionDoc(uploaded);
                      }
                    } catch (e) { console.error(e); }
                    finally { setLoadingCierreResolucionDoc(false); }
                  }}
                />
              </div>
            </>
          )}

          {mostrarBloqueRcOficioCierre && (
            <>
              <Divider label="Registro calificado de oficio" labelPosition="left" my="sm" />
              <Text size="sm" fw={700} c="blue">Resolución otorgada de oficio (RC)</Text>
              <Text size="xs" c="dimmed">Completa según el PDF de la resolución de oficio (suele coincidir con el AV si es el mismo acto; ajústalo si difiere).</Text>
              <div>
                <Text size="sm" fw={500} mb={4}>Fecha de resolución (RC de oficio)</Text>
                <DateInput
                  value={cierreFormRc.fecha ? new Date(cierreFormRc.fecha + "T12:00:00") : null}
                  onChange={(val) => setCierreFormRc((f) => ({ ...f, fecha: val ? val.toISOString().slice(0, 10) : "" }))}
                  valueFormat="DD/MM/YYYY"
                  placeholder="dd/mm/aaaa"
                  clearable
                  dateParser={dateParserEspanol}
                />
              </div>
              <TextInput label="Código de resolución (RC de oficio)" value={cierreFormRc.codigo}
                onChange={(e) => { const v = e.currentTarget.value; setCierreFormRc(f => ({ ...f, codigo: v })); }} />
              <TextInput label="Duración de la vigencia — años (RC de oficio)" value={cierreFormRc.duracion}
                onChange={(e) => {
                  const d = e.currentTarget.value.replace(/\D/g, "");
                  setCierreFormRc(f => ({ ...f, duracion: d }));
                }} />
            </>
          )}
        </>
      )}

      {/* Checkbox RC de oficio — al final, justo antes del botón de cierre */}
      {esReformaCurricularSolo && cierreResultado === "aprobado" && (
        <>
          <Divider label="Constancia o confirmación del proceso" labelPosition="left" my="sm" />
          <Text size="xs" c="dimmed" mb="xs">
            Documento interno de la reforma (no es resolución MEN). Obligatorio para cerrar como aprobado.
          </Text>
          {constanciaReformaDoc && (
            <Group gap="xs" align="center" wrap="wrap" mb="xs">
              <Text size="xs" fw={600}>Archivo:</Text>
              <Anchor size="xs" href={constanciaReformaDoc.view_link} target="_blank" rel="noopener noreferrer">
                {constanciaReformaDoc.name}
              </Anchor>
              <Button
                size="xs" variant="subtle" color="red"
                loading={deletingDocId === constanciaReformaDoc._id}
                onClick={async () => {
                  try {
                    setDeletingDocId(constanciaReformaDoc._id);
                    await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${constanciaReformaDoc._id}`);
                    await fetchProcesoDocs();
                  } catch (e) { console.error(e); }
                  finally { setDeletingDocId(null); }
                }}
              >
                Quitar
              </Button>
            </Group>
          )}
          <DropzoneCustomComponent
            text={loadingConstancia ? "Subiendo..." : "Haz clic o arrastra la constancia o confirmación"}
            onDrop={async (files) => {
              const file = files[0];
              if (!file) return;
              try {
                setLoadingConstancia(true);
                if (constanciaReformaDoc) {
                  await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${constanciaReformaDoc._id}`);
                }
                const formData = new FormData();
                formData.append("file", file);
                formData.append("doc_type", "constancia_reforma");
                await axios.post(
                  `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${proceso._id}`,
                  formData,
                  { headers: { "Content-Type": "multipart/form-data" } },
                );
                await fetchProcesoDocs();
              } catch (e) { console.error(e); }
              finally { setLoadingConstancia(false); }
            }}
          />
        </>
      )}

      {cierreMuestraResolucionBloque && proceso.tipo_proceso === "AV" && (
        <Paper withBorder p="sm" radius="sm" style={{ backgroundColor: "#f3f0ff" }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={incluirRcOficioAlCierre}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setIncluirRcOficioAlCierre(checked);
                if (checked) {
                  setCierreFormRc({ ...cierreForm });
                  setRcOficioPendienteEntrega(false);
                }
                setCierreError(null);
              }}
              style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <Text size="sm" fw={600}>¿Salió también el registro calificado de oficio?</Text>
              <Text size="xs" c="dimmed" mt={4}>
                El RC de oficio se creará y cerrará automáticamente con la misma resolución del AV y se generarán <strong>dos alertas</strong>. Puedes ajustar los datos del RC arriba si son distintos.
              </Text>
            </div>
          </label>
        </Paper>
      )}

      {cierreMuestraResolucionBloque && proceso.tipo_proceso === "AV" && (
        <Paper withBorder p="sm" radius="sm" style={{ backgroundColor: "#fff8ec" }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={rcOficioPendienteEntrega}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setRcOficioPendienteEntrega(checked);
                if (checked) {
                  setIncluirRcOficioAlCierre(false);
                }
                setCierreError(null);
              }}
              style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <Text size="sm" fw={600}>¿El registro calificado de oficio está previsto pero aún no se ha entregado?</Text>
              <Text size="xs" c="dimmed" mt={4}>
                Solo genera un registro en el <strong>historial de Registro calificado</strong> (subtipo «Vigencia transitoria»), sin proceso gestionable; mantiene vigente el RC anterior en la ficha hasta que registres el RC de oficio desde la <strong>alerta del RC</strong> que aplicaba al cerrar esta acreditación.
              </Text>
            </div>
          </label>
        </Paper>
      )}

      <Group justify="flex-end" gap="sm" mt="xs">
        <Button variant="default" size="sm" onClick={() => { setCerrarProcesoOpen(false); setCierreError(null); }}>Cancelar</Button>
        <Button color="red" size="sm" loading={cerrandoProceso} onClick={cerrarProceso}>Cerrar proceso</Button>
      </Group>
    </Stack>
  );

  const modalCerrarProceso = (
    <Modal
      opened={cerrarProcesoOpen}
      onClose={() => { setCerrarProcesoOpen(false); setCierreError(null); }}
      title={`Cerrar proceso — ${LABEL_PROCESO[proceso.tipo_proceso]}`}
      centered
      size={mostrarBloqueRcOficioCierre && cierreResultado === "aprobado" ? "lg" : "md"}
      radius="md"
      zIndex={300}
    >
      {cuerpoModalCerrarProceso}
    </Modal>
  );

  const modalConfirmarCierreSinResultadoCaso = (
    <Modal
      opened={confirmarCierreSinResultadoCasoOpen}
      onClose={() => { setConfirmarCierreSinResultadoCasoOpen(false); setCierreError(null); }}
      title="Confirmar cierre como cancelado"
      centered
      radius="md"
      zIndex={320}
    >
      <Stack gap="md">
        {cierreError && (
          <Alert color="red" title="Error al cerrar" onClose={() => setCierreError(null)} withCloseButton>
            {cierreError}
          </Alert>
        )}
        <Text size="sm">
          No hay resultado <strong>Satisfactorio</strong> ni <strong>No satisfactorio</strong> registrado en la información del caso.
          El proceso se cerrará como <strong>cancelado por la institución</strong> (solo historial, sin alerta nueva).
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => { setConfirmarCierreSinResultadoCasoOpen(false); setCierreError(null); }}>Volver</Button>
          <Button color="red" loading={cerrandoProceso} onClick={() => void confirmarCierreCanceladoSinResultadoCaso()}>
            Confirmar cancelación
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  const modalCasoFecha = (
    <Modal
      opened={casoFechaModalField != null}
      onClose={() => setCasoFechaModalField(null)}
      title={
        casoFechaModalField
          ? `Observaciones y documentos — ${CASO_FECHA_LABELS[casoFechaModalField]}`
          : "Observaciones y documentos"
      }
      centered
      size="lg"
      radius="md"
      zIndex={350}
    >
      <Stack gap="md">
        <textarea
          value={casoFechaObsTexto}
          onChange={(e) => setCasoFechaObsTexto(e.target.value)}
          rows={4}
          style={{
            width: "100%",
            borderRadius: 8,
            border: "1px solid #dee2e6",
            padding: "8px 12px",
            fontSize: 14,
            resize: "vertical",
          }}
          placeholder="Observaciones para esta fecha del caso..."
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" size="sm" onClick={() => setCasoFechaModalField(null)}>
            Cancelar
          </Button>
          <Button size="sm" loading={savingCasoFechaObs} onClick={() => void guardarCasoFechaObs()}>
            Guardar observaciones
          </Button>
        </Group>
        <DropzoneCustomComponent
          text={uploadingCasoFechaDoc ? "Subiendo documento..." : "Haz clic o arrastra un archivo para esta fecha del caso"}
          onDrop={(files) => void subirCasoFechaDoc(files)}
        />
        <Divider label="Documentos de esta fecha" labelPosition="center" />
        {loadingCasoFechaDocs ? (
          <Group justify="center">
            <Loader size="sm" />
          </Group>
        ) : casoFechaDocs.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center">
            No hay documentos para esta fecha.
          </Text>
        ) : (
          <ScrollArea style={{ maxHeight: 220 }}>
            <Stack gap="xs">
              {casoFechaDocs.map((doc) => (
                <Group key={doc._id} justify="space-between" align="center">
                  <Anchor size="sm" href={doc.view_link} target="_blank" rel="noopener noreferrer">
                    📄 {doc.name}
                  </Anchor>
                  <Button size="xs" variant="outline" color="red" onClick={() => void eliminarCasoFechaDoc(doc._id)}>
                    Eliminar
                  </Button>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Modal>
  );

  const bloqueInformacionCasoUi = muestraBloqueCaso ? (
    <Box px="md" pt="sm" pb="sm" style={{ borderTop: "1px solid #dee2e6" }}>
      <Text size="sm" fw={600} mb="xs">Información del caso</Text>
      {caso ? (
        renderCasoTabla()
      ) : (
        <Text size="sm" c="dimmed">
          Se habilitará al marcar la actividad «Información del caso» en la fase 4.
        </Text>
      )}
    </Box>
  ) : null;

  const modalHistorialActivo = (
    <HistorialActivoModal
      opened={historialActivoOpen}
      onClose={() => setHistorialActivoOpen(false)}
      proceso={proceso}
      fases={fases}
    />
  );

  const btnHistorialActivo = fases.length > 0 ? (
      <Button size="xs" variant="white" color="dark" onClick={() => setHistorialActivoOpen(true)}>
        Historial activo
      </Button>
    ) : null;

  if (esRcOficioPostAvGracia) {
    return (
      <RcOficioPostGraciaPanel
        proceso={proceso}
        programa={programa}
        resolucionDoc={resolucionDoc}
        loadingResolucionDoc={loadingResolucionDoc}
        resolucionDocModalOpen={resolucionDocModalOpen}
        setResolucionDocModalOpen={setResolucionDocModalOpen}
        onAbrirCerrar={abrirModalCerrar}
        onUploadPdf={async (file) => {
          setLoadingResolucionDoc(true);
          try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("doc_type", "resolucion");
            await axios.post(
              `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${proceso._id}`,
              formData,
              { headers: { "Content-Type": "multipart/form-data" } },
            );
            await fetchProcesoDocs();
            setResolucionDocModalOpen(false);
          } finally {
            setLoadingResolucionDoc(false);
          }
        }}
        modalCerrarProceso={modalCerrarProceso}
        modalConfirmarCierreSinResultadoCaso={modalConfirmarCierreSinResultadoCaso}
      />
    );
  }

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
          <Group gap="xs">
            {proceso.tipo_proceso === "RC" && !esRegistroCalificadoDeOficio && (
              <Button size="xs" variant="white" color="dark" onClick={() => setOffsetsModalOpen(true)}>Editar meses</Button>
            )}
            {btnHistorialActivo}
            <Button size="xs" variant="white" color="red" onClick={abrirModalCerrar}>Cerrar proceso</Button>
          </Group>
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
              <Text size="sm" fw={500}>{resolucionFecha ? formatFechaDDMMYY(resolucionFecha) : "—"}</Text>
            </div>
            <div>
              <Text size="xs" c="dimmed" fw={600}>Fecha vencimiento</Text>
              <Text size="sm" fw={500}>{proceso.fecha_vencimiento ? formatFechaDDMMYY(proceso.fecha_vencimiento) : "—"}</Text>
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

        {proceso.tipo_proceso === "RC" && (
          <ScrollArea>
            <Table withTableBorder withColumnBorders style={{ minWidth: 800 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 140, backgroundColor: "#f8f9fa", padding: "8px 6px" }}>
                    <Text size="xs" fw={700} ta="center">Resolución vigente</Text>
                  </Table.Th>
                  {columnasFechaRcPmVisibles.map(col => {
                    const offsetValue =
                      col.key === "fecha_inicio" ? offsets.inicio :
                      col.key === "fecha_documento_par" ? offsets.docPar :
                      col.key === "fecha_digitacion_saces" ? offsets.digitacion :
                      col.key === "fecha_radicado_men" ? offsets.radicado : null;
                    return (
                      <Table.Th key={col.key} style={{ backgroundColor: "#f8f9fa", padding: "8px 6px", minWidth: 120 }}>
                        <Text size="xs" fw={700} ta="center" style={{ whiteSpace: "normal" }}>{col.label}</Text>
                        {col.key !== "fecha_vencimiento" && offsetValue != null && (
                          <Text size="xs" c="dimmed" ta="center">({offsetValue} meses antes del vencimiento)</Text>
                        )}
                      </Table.Th>
                    );
                  })}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td style={{ verticalAlign: "top", padding: "8px 6px" }}>
                    <Stack gap={4} align="center">
                      {muestraResolucionVigenteInexistente ? (
                        <Text c="dimmed" fw={600} ta="center" size="xs" fs="italic">Inexistente</Text>
                      ) : (
                        <>
                          <Text fw={600} ta="center" size="xs">
                            {resolucionFecha ? formatFechaDDMMYY(resolucionFecha) : "—"}
                          </Text>
                          <Text c="dimmed" ta="center" size="xs">{resolucionCodigo ?? "—"}</Text>
                        </>
                      )}
                      {!muestraResolucionVigenteInexistente && linkPdfResolucionVigente && (
                        <Anchor size="xs" href={linkPdfResolucionVigente} target="_blank" rel="noopener noreferrer" ta="center">
                          Ver PDF vigente
                        </Anchor>
                      )}
                      {!muestraResolucionVigenteInexistente && (
                        <Button size="xs" variant="subtle" color="blue" loading={loadingResolucionDoc} onClick={() => setResolucionDocModalOpen(true)}>
                          {resolucionDoc ? "Cambiar PDF en proceso" : "Adjuntar PDF al proceso"}
                        </Button>
                      )}
                    </Stack>
                  </Table.Td>
                  {columnasFechaRcPmVisibles.map(col => {
                    const fecha = proceso[col.key as keyof Process] as string | null;
                    const isEditing = editingDateKey === col.key;
                    const dateVal = fecha ? new Date(fecha + "T12:00:00") : null;
                    const esSoloLectura = esSoloLecturaCeldaFecha(col.key);
                    const obsValor = proceso[col.obsKey as keyof Process] as string ?? "";
                    return (
                      <Table.Td key={col.key} style={{ verticalAlign: "top", minWidth: 120, padding: "8px 6px" }}>
                        <Stack gap={4} align="center">
                          {isEditing && !esSoloLectura ? (
                            <DateInput value={dateVal} onChange={(val) => saveDate(col.key, val)}
                              valueFormat="DD/MM/YYYY" size="xs" autoFocus onBlur={() => setEditingDateKey(null)}
                              style={{ width: 130 }} clearable disabled={savingDate}
                              dateParser={dateParserEspanol} placeholder="dd/mm/aaaa" />
                          ) : (
                            <Text size="xs" fw={600} ta="center" style={{
                              cursor: esSoloLectura ? "default" : "pointer", padding: "2px 8px", borderRadius: 4,
                              border: esSoloLectura ? "1px solid #dee2e6" : "1px dashed #4dabf7",
                              backgroundColor: esSoloLectura ? "#f8f9fa" : "#e7f5ff",
                              color: fecha ? "#1c7ed6" : "#adb5bd",
                            }}
                              title={esSoloLectura ? (esRegistroCalificadoDeOficio ? "RC de oficio: la resolución y la vigencia se registran al cerrar el proceso (fecha, código y PDF)." : (col.key === "fecha_vencimiento" ? "Calculada a partir de la resolución" : "Fecha calculada automáticamente")) : "Clic para editar fecha"}
                              onClick={() => { if (!esSoloLectura) setEditingDateKey(col.key); }}
                            >
                              {fecha ? formatFechaDDMMYY(fecha) : <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
                            </Text>
                          )}
                          <Text size="xs" c={obsValor ? "#1971c2" : "#74c0fc"} td="underline"
                            style={{ cursor: "pointer", textAlign: "center" }}
                            onClick={() => abrirObsFecha(col.obsKey, col.label)}>
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
        )}


        {/* Fase 7 — como una sección de fase */}
        <Box px="md" pt="sm" pb="md">
          {/* Cabecera de fase */}
          <Group gap="xs" mb="sm" align="center">
            <Badge color="orange" variant="light" size="md">Plan de contingencia</Badge>
          </Group>

          {/* Descripción — texto simple gris */}
          <Text size="xs" c="dimmed" mb="sm">
            {proceso.tipo_proceso === "RC" ? "Proceso de No renovación en plan de contingencia permanente. Sin actividades de fase; puede editar las fechas del trámite RC." : "Proceso de No renovación en plan de contingencia permanente. Sin actividades ni fechas de trámite."}
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


        {bloqueInformacionCasoUi}

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

        <Modal opened={offsetsModalOpen} onClose={() => setOffsetsModalOpen(false)}
          title="Meses de cálculo de fechas" centered size="md" radius="md" zIndex={300}>
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

        <Modal opened={obsDateOpen} onClose={() => setObsDateOpen(false)}
          title={`Observaciones — ${obsDateLabel}`} centered size="md" radius="md" zIndex={300}>
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

        {modalCerrarProceso}
        {modalConfirmarCierreSinResultadoCaso}
        {modalHistorialActivo}
        {modalCasoFecha}
      </Paper>
    );
  }
  /* ── Vista completa ── */
  return (
    <Paper withBorder radius="md" mb="md" style={{ overflow: "hidden" }}>

      {/* Header */}
      <div style={{ backgroundColor: color, padding: "10px 16px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "flex-start", gap: 8 }}>
          {esProcesoPm && proceso.parent_process_id && (
            <Button size="xs" variant="white" color="dark" onClick={() => abrirModalMesesPlan(proceso)}>
              Editar meses del plan
            </Button>
          )}
          {!esProcesoPm && (proceso.tipo_proceso !== "RC" || !esRegistroCalificadoDeOficio) && (
            <Button size="xs" variant="white" color="dark" onClick={() => setOffsetsModalOpen(true)}>Editar meses</Button>
          )}
          <Button size="xs" variant="white" color="red" onClick={abrirModalCerrar}>Cerrar proceso</Button>
        </div>
        <Text fw={700} c="#333" size="md" ta="center">{LABEL_PROCESO[proceso.tipo_proceso]}</Text>
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          {btnHistorialActivo}
          {proceso.subtipo ? (
            <Badge variant="light" color="dark" size="sm"
              style={{ backgroundColor: "rgba(255,255,255,0.85)", color: "#333", fontSize: 11 }}>
              {proceso.subtipo}
            </Badge>
          ) : (
            <Text size="xs" c="#555" fs="italic">Sin subtipo</Text>
          )}
        </Group>
      </div>

      {esRegistroCalificadoDeOficio && !esRcOficioPostAvGracia && (
        <Alert color="blue" variant="light" radius={0} px="md" py="sm"
          style={{ borderBottom: "1px solid #dee2e6", borderTop: "none" }}
          title="Registro calificado de oficio">
          La <strong>resolución</strong>, el <strong>PDF</strong> y la <strong>vigencia</strong> (7 años) se cargaron al crear el proceso; no hay gestión de trámite ni fases.
          Usa <strong>Cerrar proceso</strong> cuando corresponda archivar el registro.
        </Alert>
      )}

      {esReforma && (
        <FichaProgramaReformaPanel
          value={programaEdit}
          onChange={setProgramaEdit}
          codigoProgramaError={errorCodigoProgramaParaFichaReforma}
        />
      )}

      {/* Tabla de fechas */}
      <ScrollArea>
        <Table withTableBorder withColumnBorders style={{ minWidth: 800 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 140, backgroundColor: "#f8f9fa" }}>
                <Text size="xs" fw={700} ta="center">{esProcesoPm ? "Referencia AV" : "Resolución vigente"}</Text>
              </Table.Th>
              {columnasFechaTablaPrincipal.map(col => {
                const offsetValue =
                  col.key === "fecha_inicio"           ? offsets.inicio :
                  col.key === "fecha_documento_par"    ? offsets.docPar :
                  col.key === "fecha_digitacion_saces" ? offsets.digitacion :
                  col.key === "fecha_radicado_men"     ? offsets.radicado : null;
                const labelKey = esProcesoPm
                  ? (col.key.replace("fecha_", "label_") as keyof Process)
                  : null;
                const labelPersonalizado = labelKey
                  ? (proceso[labelKey] as string | null | undefined)
                  : null;
                const labelFinal = labelPersonalizado ?? col.label;
                return (
                  <Table.Th key={col.key} style={{ backgroundColor: "#f8f9fa" }}>
                    <Text size="xs" fw={700} ta="center">{labelFinal}</Text>
                    {esProcesoPm && !labelPersonalizado && col.sub ? (
                      <Text size="xs" c="dimmed" ta="center">({col.sub})</Text>
                    ) : col.key === "fecha_vencimiento" ? (
                      <Text size="xs" c="dimmed" ta="center">({col.sub})</Text>
                    ) : (
                      !esProcesoPm
                      && proceso.subtipo !== "Nuevo"
                      && proceso.subtipo !== "Primera vez"
                      && (
                        <Text size="xs" c="dimmed" ta="center">
                          {offsetValue != null ? `(${offsetValue} meses antes del vencimiento)` : ""}
                        </Text>
                      )
                    )}
                  </Table.Th>
                );
              })}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td style={{ verticalAlign: "top" }}>
                <Stack gap={4} align="center">
                  {muestraResolucionVigenteInexistente ? (
                    <Text size="xs" c="dimmed" fw={600} ta="center" fs="italic">Inexistente</Text>
                  ) : (
                    <>
                      <Text size="xs" fw={600} ta="center">
                        {resolucionFecha ? formatFechaDDMMYY(resolucionFecha) : "—"}
                      </Text>
                      <Text size="xs" c="dimmed" ta="center">{resolucionCodigo ?? "—"}</Text>
                      {linkPdfResolucionVigente && (
                        <Anchor size="xs" href={linkPdfResolucionVigente} target="_blank" rel="noopener noreferrer" ta="center">
                          Ver PDF vigente
                        </Anchor>
                      )}
                      {!esProcesoPm && (
                      <Button size="xs" variant="subtle" color="blue" loading={loadingResolucionDoc} onClick={() => setResolucionDocModalOpen(true)}>
                        {resolucionDoc ? "Cambiar PDF en proceso" : "Adjuntar PDF al proceso"}
                      </Button>
                      )}
                      {resolucionDoc && resolucionDoc.view_link !== linkPdfResolucionVigente && (
                        <Anchor size="xs" href={resolucionDoc.view_link} target="_blank" rel="noopener noreferrer">
                          PDF adjunto al trámite
                        </Anchor>
                      )}
                    </>
                  )}
                </Stack>
              </Table.Td>
              {columnasFechaTablaPrincipal.map(col => {
                const fecha        = proceso[col.key as keyof Process] as string | null;
                const isEditing    = editingDateKey === col.key;
                const dateVal      = fecha ? new Date(fecha + "T12:00:00") : null;
                const esSoloLectura = esProcesoPm
                  ? false
                  : proceso.tipo_proceso === "AV"
                    ? col.key === "fecha_vencimiento"
                    : esSoloLecturaCeldaFecha(col.key);
                const obsValor     = proceso[col.obsKey as keyof Process] as string ?? "";
                const labelKey = esProcesoPm
                  ? (col.key.replace("fecha_", "label_") as keyof Process)
                  : null;
                const labelObs = labelKey
                  ? ((proceso[labelKey] as string | null | undefined) ?? col.label)
                  : col.label;
                return (
                  <Table.Td key={col.key} style={{ verticalAlign: "top", minWidth: 140 }}>
                    <Stack gap={4} align="center">
                      {/* Fecha vencimiento inexistente para Nuevo / Primera vez */}
                      {!esProcesoPm && col.key === "fecha_vencimiento" && (proceso.subtipo === "Nuevo" || proceso.subtipo === "Primera vez") ? (
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
                          title={esSoloLectura ? (esRegistroCalificadoDeOficio ? "RC de oficio: la resolución y la vigencia se registran al cerrar el proceso (fecha, código y PDF)." : (col.key === "fecha_vencimiento" ? "Calculada a partir de la resolución" : "Fecha calculada automáticamente")) : (esProcesoPm ? "Clic para editar esta fecha del plan" : "Clic para editar fecha")}
                          onClick={() => { if (!esSoloLectura) setEditingDateKey(col.key); }}
                        >
                          {fecha ? (esProcesoPm ? formatFechaDDMMYY(fecha) : fecha) : <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
                        </Text>
                      )}
                      {!( !esProcesoPm && col.key === "fecha_vencimiento" && (proceso.subtipo === "Nuevo" || proceso.subtipo === "Primera vez")) && (
                        <Text size="xs" c={obsValor ? "#1971c2" : "#74c0fc"} td="underline"
                          style={{ cursor: "pointer" }} onClick={() => abrirObsFecha(col.obsKey, labelObs)}>
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

      {bloqueInformacionCasoUi}

      {/* Bloque Plan de Mejoramiento — solo para AV y AE (el PM se gestiona como proceso propio) */}
      {(proceso.tipo_proceso === "AV" || proceso.tipo_proceso === "AE") && (
        <Box px="md" pt="sm" pb="sm">
          <Group justify="space-between" mb="xs" align="center">
            <Group gap="xs">
              <Text size="sm" fw={600}>Plan de Mejoramiento</Text>
              {pmProceso && <Badge size="xs" color="green">Activo</Badge>}
              {pmProceso?.subtipo && (
                <Badge size="sm" color="gray" variant="outline" styles={stylesSubtipoLargo}>
                  {etiquetaSubtipoCompacta(pmProceso.subtipo)}
                </Badge>
              )}
            </Group>
            <Group gap="xs">
              {pmProceso && (proceso.tipo_proceso === "AV" || proceso.tipo_proceso === "AE") && (
                <Button size="xs" variant="light" onClick={() => abrirModalMesesPlan(pmProceso)}>
                  Editar meses del plan
                </Button>
              )}
              {!pmProceso && proceso.tipo_proceso === "AV" && (
                <Text size="xs" c="dimmed" fs="italic">
                  Se crea automáticamente al cerrar el proceso
                </Text>
              )}
              {!pmProceso && proceso.tipo_proceso === "AE" && (
                <Text size="xs" c="orange" fs="italic">Cargando PM...</Text>
              )}
            </Group>
          </Group>
          {(proceso.tipo_proceso === "AV" || proceso.tipo_proceso === "AE") && pmProceso && (
            <Text size="xs" c="dimmed" mb="xs">
              Fechas del plan: haz clic en cada celda para editarla. Los nombres de columna son los hitos del Plan de Mejoramiento.
            </Text>
          )}

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
                                {fecha ? formatFechaDDMMYY(fecha) : <span style={{ color: "#adb5bd" }}>Sin fecha</span>}
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
            <>
              <Group gap="xs" mt={6} align="center">
                <Text size="xs" c="#555">Actividad actual: <strong>{ultimaActiva.nombre}</strong></Text>
                <Button size="xs" variant="light" onClick={() => { setPosicionActividad(String(faseActual.actividades.length)); setChecklistOpen(true); }}>
                  Ver actividades
                </Button>
              </Group>
              {muestraSelectorReuniones && etiquetaFactorCondicion && opcionesFactorCondicion.length > 0 && (
                <Paper withBorder p="sm" radius="sm" mt={8} style={{ backgroundColor: "#fff9db", maxWidth: 520 }}>
                  <Text size="xs" fw={600} mb={4}>
                    {etiquetaFactorCondicion} en revisión — reuniones parciales de avance
                  </Text>
                  <Text size="xs" c="dimmed" mb={8}>
                    Indica qué {etiquetaFactorCondicion.toLowerCase()} se trabaja en esta etapa. Otros roles lo verán en la ficha del programa.
                  </Text>
                  <Select
                    data={opcionesFactorCondicion}
                    value={proceso.factor_condicion_actual != null ? String(proceso.factor_condicion_actual) : null}
                    onChange={guardarFactorCondicionActual}
                    placeholder={`Seleccionar ${etiquetaFactorCondicion}`}
                    size="xs"
                    searchable
                    disabled={savingFactorCondicion}
                    clearable={false}
                    styles={{ input: { fontWeight: 500 } }}
                  />
                </Paper>
              )}
            </>
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

      {modalCerrarProceso}
      {modalConfirmarCierreSinResultadoCaso}
      {modalHistorialActivo}
      {modalCasoFecha}

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

      <Modal opened={pmOffsetsModalOpen} onClose={() => setPmOffsetsModalOpen(false)}
        title="Meses del Plan de Mejoramiento" centered size="md" radius="md">
        <Stack>
          <Text size="xs" c="dimmed">
            Recalcula las cuatro fechas del plan a partir de la resolución de la acreditación (o autoevaluación) en la ficha del programa.
          </Text>
          <SimpleGrid cols={2} spacing="sm">
            <TextInput label="Envío informe PM a Vicerrectoría (+ meses)" type="number"
              value={pmOffsets.envioPlan}
              onChange={(e) => setPmOffsets((p) => ({ ...p, envioPlan: Number(e.currentTarget.value || 0) }))} />
            <TextInput label="Entrega PM al CNA (+ meses)" type="number"
              value={pmOffsets.entregaCna}
              onChange={(e) => setPmOffsets((p) => ({ ...p, entregaCna: Number(e.currentTarget.value || 0) }))} />
            <TextInput label="Envío avance a Vicerrectoría (meses antes mitad vigencia)" type="number"
              value={pmOffsets.envioAvance}
              onChange={(e) => setPmOffsets((p) => ({ ...p, envioAvance: Number(e.currentTarget.value || 0) }))} />
            <TextInput label="Radicación avance CNA (meses desde mitad vigencia)" type="number"
              value={pmOffsets.radicAvance}
              onChange={(e) => setPmOffsets((p) => ({ ...p, radicAvance: Number(e.currentTarget.value || 0) }))} />
          </SimpleGrid>
          <Group justify="flex-end" mt="sm">
            <Button variant="default" size="sm" onClick={() => setPmOffsetsModalOpen(false)}>Cancelar</Button>
            <Button size="sm" loading={savingPmOffsets} onClick={guardarMesesPlan}>Guardar y recalcular</Button>
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

      <Modal opened={!!faseParaRevertir}
        onClose={() => setFaseParaRevertir(null)}
        title="Volver a fase anterior"
        centered size="sm" radius="md" zIndex={450}>
        <Stack>
          <Text size="sm">
            {faseParaRevertir
              ? `¿Volver a la fase ${faseParaRevertir.numero - 1}? Las actividades marcadas en esta fase se conservan.`
              : ""}
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" size="sm" onClick={() => setFaseParaRevertir(null)}>Cancelar</Button>
            <Button color="orange" size="sm" loading={revirtiendoFase} onClick={confirmarRevertirFase}>
              Sí, volver
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={checklistOpen}
        onClose={() => { setChecklistOpen(false); setEditActividadId(null); setNuevaActividad(""); }}
        title={faseActual ? `${faseActual.nombre} — Fase ${proceso.fase_actual}` : "Actividades"}
        centered size="lg" radius="md">
        {faseActual && (
          <Stack gap="sm">
            {muestraSelectorReuniones && etiquetaFactorCondicion && opcionesFactorCondicion.length > 0 && (
              <Paper withBorder p="sm" radius="sm" style={{ backgroundColor: "#fff9db" }}>
                <Text size="xs" fw={600} mb={4}>
                  {etiquetaFactorCondicion} en revisión — reuniones parciales de avance
                </Text>
                <Select
                  data={opcionesFactorCondicion}
                  value={proceso.factor_condicion_actual != null ? String(proceso.factor_condicion_actual) : null}
                  onChange={guardarFactorCondicionActual}
                  placeholder={`Seleccionar ${etiquetaFactorCondicion}`}
                  size="sm"
                  searchable
                  disabled={savingFactorCondicion}
                  clearable={false}
                />
              </Paper>
            )}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, faseActual)}>
              <SortableContext items={faseActual.actividades.map(a => a._id)} strategy={verticalListSortingStrategy}>
                {faseActual.actividades.map((act, index) => {
                  const firstIncompleteIndex = faseActual.actividades.findIndex(a => !actividadResuelta(a));
                  const isFirstIncomplete    = !actividadResuelta(act) && index === firstIncompleteIndex;
                  const puedeHechaActoAdmin  = puedeMarcarHechaActoAdminActividad(act, caso);
                  const canToggleCompletada  = act.no_aplica ? false : (act.completada || (isFirstIncomplete && puedeHechaActoAdmin));
                  const canToggleNoAplica    = act.completada ? false : (act.no_aplica || isFirstIncomplete);
                  const tooltipBloqueoHecha  = esActoAdministrativo(act.nombre) && !act.completada && !act.no_aplica && isFirstIncomplete && !puedeHechaActoAdmin
                    ? "Indica si el acto administrativo fue satisfactorio o no (tabla del caso o interruptor de estado)."
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
            <Group justify="flex-end" mt="xs" wrap="wrap">
              {proceso.fase_actual > 0 && (
                <Button
                  size="xs"
                  color="orange"
                  variant="light"
                  onClick={() => setFaseParaRevertir(faseActual)}
                >
                  ← Volver a fase anterior
                </Button>
              )}
              <Button
                size="xs"
                color="blue"
                variant="light"
                loading={marcandoTodoFase}
                onClick={() => marcarTodoFase(faseActual)}
              >
                Marcar todas
              </Button>
              {proceso.tipo_proceso === "PM" ? (
                <Button
                  size="xs"
                  color="gray"
                  variant="light"
                  loading={marcandoNaFase6}
                  onClick={() => marcarFaseNoAplicaCompleta(faseActual)}
                >
                  No aplica (fase completa)
                </Button>
              ) : (
                faseActual.numero < 5 && proceso.tipo_proceso !== "PM" && (
                  <Button
                    size="xs"
                    color="green"
                    variant="light"
                    loading={finalizandoFase}
                    onClick={() => finalizarFase(faseActual)}
                  >
                    ✓ Finalizar fase
                  </Button>
                )
              )}
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
