"use client";

import dynamic from "next/dynamic";
import { Fragment, useState, useEffect, useMemo, type ElementType } from "react";
import {
  Title, Select, Button, Text, Paper, Box, SimpleGrid, Group,
  Loader, Modal, TextInput, Stack, Divider, Badge, Anchor, ScrollArea, Collapse,
  ActionIcon, Tooltip, Table, ThemeIcon, NavLink, SegmentedControl, Alert, Progress, UnstyledButton,
} from "@mantine/core";
import { useRole } from "@/app/context/RoleContext";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import axios from "axios";
import {
  IconChartBar,
  IconArrowLeft,
  IconBellRinging,
  IconHistory,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconList,
  IconArchive,
  IconMessageCircle,
  IconFileTypePdf,
  IconTrash,
  IconMail,
  IconSchool,
  IconCircleCheck,
  IconCircleX,
  IconEdit,
  IconFileCertificate,
  IconCertificate,
  IconPercentage,
  IconAward,
  IconTarget,
  IconClipboardList,
  IconFilter,
  IconFilterOff,
  IconAlertTriangle,
  IconSearch,
  IconAdjustmentsHorizontal,
  IconInfoCircle,
  IconX,
  IconPaperclip,
  IconBuildingCommunity,
  IconInbox,
  IconClock,
  IconFileSpreadsheet,
  IconCircleMinus,
  IconChevronDown,
} from "@tabler/icons-react";

import type { Dependency, Program, Process, Phase, ProcessHistoryRecord, ProcessReminderRecord, BarRow, PQR } from "./types";
import {
  LABEL_PROCESO,
  selectorStyle,
  selectorStyleFilters,
  subtipoOpcionesFiltro,
  subtipoOpcionesConEtiquetas,
  procesoCumpleSubtipoFiltro,
  etiquetaSubtipoCompacta,
  stylesSubtipoLargo,
  stylesSubtipoBadgeTabla,
  SUBTIPO_MODIFICACION_REFORMA_LABEL,
  selectorStyleFiltersSubtipo,
  infoFasePorNumero,
} from "./constants";
import { formatFechaDDMMYY } from "./utils/formatFechaCorta";
import { nombreLegible } from "./utils/nombreLegible";
import { nivelSemaforoAlerta } from "./utils/alertaSemaforo";
import { mismoId } from "./utils/idMongoose";
import { procesoRcActivoDePrograma } from "./utils/procesoRcUnico";
import { findProgramByCode, programCodeKey } from "./utils/programCode";
import {
  filterFacultadesMen,
  filterProgramasMen,
  filterProcesosMen,
  parseDependenciesAllResponse,
} from "./utils/facultadesMen";
import {
  buildOpcionesProgramaSelect,
  programaDesdeFiltroId,
} from "./utils/opcionesSelectPrograma";
import { lineasAuxPrograma } from "./utils/programDisplay";
import { historialEsResolucionVigentePrograma } from "./utils/historialResolucionVigente";
import {
  esSubtipoReformaHistorial,
  esSubtipoReformaCurricularSoloHistorial,
  esSubtipoRenovacionReformaHistorial,
} from "./utils/programaEditReforma";
import { HistorialReformaCambios } from "./components/HistorialReformaFicha";
import { HistorialFechasTramiteDetalle, HistorialInformacionCaso } from "./components/HistorialTramiteDetalle";
import HistorialResolucionSeccion from "./components/HistorialResolucionSeccion";
import FaseBadge from "./components/FaseBadge";
import BarTable from "./components/BarTable";
const VencimientosPorAnoCharts = dynamic(
  () => import("./components/VencimientosPorAnoCharts"),
  { ssr: false, loading: () => <Loader size="sm" mx="auto" my="md" /> },
);
const DropzoneCustomComponent = dynamic(
  () => import("@/app/components/DropzoneCustomDrop/DropzoneCustomDrop"),
  { ssr: false },
);
import ProcesoDetalleCard from "./components/ProcesoDetalleCard";
import BuzonMenView from "./components/BuzonMenView";
import AgregarProcesoModal, { type AgregarProcesoPrefill } from "./components/AgregarProcesoModal";
import PQRAgregarForm from "./components/PQRAgregarForm";
import PQRActivosView from "./components/PQRActivosView";
import PQRHistorialView from "./components/PQRHistorialView";
import PQRImportModal from "./components/PQRImportModal";
import {
  processesMenRoutes,
  PROCESSES_MEN_RESET_EVENT,
  PROCESSES_MEN_BASE,
} from "./config/routes";

function normSubtipoStats(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function esSubtipoReformaProceso(subtipo: string | null | undefined): boolean {
  const s = normSubtipoStats(subtipo);
  return s === "reforma curricular" || s === "renovacion + reforma";
}

function normalizarNivelPrograma(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function tipoPosgrado(programa: Program): string {
  const formacion = normalizarNivelPrograma(programa.nivel_formacion);
  if (formacion.includes("especializacion")) return "Especialización";
  if (formacion.includes("maestria")) return "Maestría";
  if (formacion.includes("doctorado")) return "Doctorado";
  if (normalizarNivelPrograma(programa.nivel_academico).includes("posgrado")) return "Otros posgrados";
  return "No aplica";
}

function etiquetaPosgradoCorta(programa: Program): string {
  const tipo = tipoPosgrado(programa);
  if (tipo === "Especialización") return "Esp.";
  if (tipo === "Maestría") return "Mg.";
  if (tipo === "Doctorado") return "Doc.";
  if (tipo === "Otros posgrados") return "Pgr.";
  return "Pre.";
}

function agruparProgramasPorNivel(programas: Program[]): Array<{ titulo: string; lista: Program[] }> {
  const pregrado: Program[] = [];
  const especializacion: Program[] = [];
  const maestria: Program[] = [];
  const otrosPosgrados: Program[] = [];

  for (const programa of programas) {
    const nivel = normalizarNivelPrograma(programa.nivel_academico);
    const formacion = normalizarNivelPrograma(programa.nivel_formacion);
    const esPosgrado = nivel === "posgrado" || nivel === "postgrado"
      || ["especializacion", "maestria", "doctorado"].includes(formacion);

    if (!esPosgrado) {
      pregrado.push(programa);
    } else if (formacion === "especializacion") {
      especializacion.push(programa);
    } else if (formacion === "maestria") {
      maestria.push(programa);
    } else {
      otrosPosgrados.push(programa);
    }
  }

  return [
    { titulo: "Pregrado", lista: pregrado },
    { titulo: "Posgrado — Especialización", lista: especializacion },
    { titulo: "Posgrado — Maestría", lista: maestria },
    { titulo: "Posgrado — Otros niveles", lista: otrosPosgrados },
  ].filter((grupo) => grupo.lista.length > 0);
}

/* ── Helper: renderiza la fecha subida de un doc ── */
const fmtFecha = (iso?: string | null) =>
  iso ? formatFechaDDMMYY(iso) : null;

/* ── Lista de documentos con fecha de subida ── */
const DocList = ({ docs }: { docs: Array<{ name: string; view_link: string; subido_en?: string | null }> }) => (
  docs.length > 0 ? (
    <Stack gap={2}>
      {docs.map((d, i) => (
        <Group key={i} gap={6} align="center" wrap="nowrap">
          <IconPaperclip size={13} color="var(--mantine-color-blue-6)" style={{ flexShrink: 0 }} />
          <Anchor href={d.view_link} target="_blank" size="xs" fw={500}>{d.name}</Anchor>
          {d.subido_en && <Text size="xs" c="dimmed">· {fmtFecha(d.subido_en)}</Text>}
        </Group>
      ))}
    </Stack>
  ) : <Text size="xs" c="dimmed">Sin documentos</Text>
);

function subtipoHistorialEsNoRenovacion(subtipo: string | null | undefined): boolean {
  const sub = String(subtipo ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return sub === "no renovacion" || sub.includes("no renovacion");
}

function esHistorialAvNoRenovacion(r: ProcessHistoryRecord): boolean {
  return r.tipo_proceso === "AV" && subtipoHistorialEsNoRenovacion(r.subtipo);
}

const celdaGuionCentrado = (
  <Text size="sm" ta="center" display="block" w="100%">—</Text>
);

/** Fechas en «Procesos activos y alertas» — legible sin ocupar de más. */
const tdFechaTablaAlertas = {
  padding: "6px 4px",
  fontSize: 13,
  whiteSpace: "nowrap" as const,
  textAlign: "center" as const,
  verticalAlign: "middle" as const,
};

/** Una fecha editable de una fila de la tabla de alertas. */
type CampoFechaFila = {
  resource: "process" | "program";
  id: string;
  field: string;
  label: string;
  valor: string | null | undefined;
};

/** Edición de todas las fechas de una fila desde un solo botón «Editar». */
type FilaEdicion = {
  programName: string;
  tipo: string;
  campos: CampoFechaFila[];
};

const claveCampoFila = (c: Pick<CampoFechaFila, "resource" | "id" | "field">) => `${c.resource}:${c.id}:${c.field}`;

/** Orden por vencimiento: más cercano arriba; sin fecha al final. */
function timestampVencimiento(fecha: string | null | undefined): number {
  if (!fecha || !String(fecha).trim()) return Number.POSITIVE_INFINITY;
  const t = new Date(`${String(fecha).slice(0, 10)}T12:00:00`).getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

function compararPorFechaVencimiento(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return timestampVencimiento(a) - timestampVencimiento(b);
}

/* ── Estilos de tablas del módulo (coherentes con el resto de Miró y con modo oscuro) ── */
const TIPO_COLOR: Record<string, string> = { RC: "blue", AV: "violet", AE: "teal", PM: "grape" };

const theadRowStyle = {
  borderBottom: "1px solid var(--mantine-color-default-border)",
  backgroundColor: "var(--mantine-color-default-hover)",
};

const thTextStyle = {
  color: "var(--mantine-color-dimmed)",
  textTransform: "uppercase" as const,
  letterSpacing: 0.3,
};

/** Fila con franja lateral del color del tipo de proceso; `tinte` colorea las filas de alerta según el semáforo. */
function estiloFilaTabla(tipo: string, seleccionada: boolean, tinte?: string) {
  return {
    borderBottom: "1px solid var(--mantine-color-default-border)",
    backgroundColor: seleccionada ? "var(--mantine-color-blue-light)" : tinte,
    boxShadow: `inset 4px 0 var(--mantine-color-${TIPO_COLOR[tipo] ?? "gray"}-5)`,
    cursor: "pointer",
    outline: "none",
  };
}

const SEMAFORO_ALERTA_LEYENDA = [
  { color: "green", texto: "Antes de digitación" },
  { color: "yellow", texto: "Hasta radicado" },
  { color: "red", texto: "Hasta vencimiento" },
  { color: "gray", texto: "Vencida" },
] as const;

/** Texto sin tildes y en minúsculas para la búsqueda rápida. */
const normalizarBusqueda = (texto: string) => texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Cuánto falta para una fecha de vencimiento, en palabras y con color según urgencia. */
function vencimientoRelativo(fecha: string | null | undefined): { texto: string; color: string } | null {
  if (!fecha) return null;
  const objetivo = new Date(`${String(fecha).slice(0, 10)}T12:00:00`).getTime();
  if (Number.isNaN(objetivo)) return null;
  const dias = Math.round((objetivo - Date.now()) / 86_400_000);
  const abs = Math.abs(dias);
  const meses = Math.round(abs / 30.4);
  const anios = Math.round((abs / 365) * 10) / 10;
  const cantidad = abs < 45 ? `${abs} ${abs === 1 ? "día" : "días"}`
    : abs < 730 ? `${meses} meses`
    : `${String(anios).replace(".", ",")} años`;
  if (dias < 0) return { texto: `venció hace ${cantidad}`, color: "red" };
  if (dias === 0) return { texto: "vence hoy", color: "red" };
  return { texto: `en ${cantidad}`, color: dias <= 180 ? "orange" : dias <= 365 ? "yellow.8" : "teal" };
}

/* ── Tarjeta de indicador (estadísticas generales) ── */
type StatTileProps = {
  label: string;
  value: number | string;
  color: string;
  icon: ElementType;
  hint?: string;
  onOpen: () => void;
};

const StatTile = ({ label, value, color, icon: Icon, hint, onOpen }: StatTileProps) => (
  <Paper
    withBorder
    radius="lg"
    p="md"
    tabIndex={0}
    role="button"
    className="men-stat-tile"
    data-color={color}
    aria-label={`Ver programas: ${label}`}
    onClick={onOpen}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    }}
    style={{
      cursor: "pointer",
      ["--men-tile-color" as string]: `var(--mantine-color-${color}-light)`,
      ["--men-tile-border" as string]: `var(--mantine-color-${color}-4)`,
      borderTop: `3px solid var(--mantine-color-${color}-5)`,
      display: "flex",
      flexDirection: "column",
      height: "100%",
    }}
  >
    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
      <Box style={{ minWidth: 0 }}>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ letterSpacing: 0.4 }}>{label}</Text>
        <Text fw={900} size="1.9rem" lh={1.1} mt={6}>{value}</Text>
      </Box>
      <ThemeIcon size={40} radius="xl" variant="light" color={color} style={{ flexShrink: 0 }}>
        <Icon size={20} />
      </ThemeIcon>
    </Group>
    {hint && <Text size="xs" c="dimmed" mt={6}>{hint}</Text>}
    <Group gap={4} mt="auto" pt="sm" className="men-stat-ver">
      <Text size="xs" c={color} fw={600}>Ver programas</Text>
      <IconChevronRight size={12} color={`var(--mantine-color-${color}-6)`} />
    </Group>
    <style>{`
      .men-stat-tile { transition: transform 140ms ease, box-shadow 140ms ease, background-color 140ms ease, border-color 140ms ease; }
      .men-stat-tile:hover, .men-stat-tile:focus-visible {
        transform: translateY(-3px);
        box-shadow: var(--mantine-shadow-md);
        background-color: var(--men-tile-color);
        border-color: var(--men-tile-border);
      }
      .men-stat-tile .men-stat-ver { transition: transform 140ms ease; }
      .men-stat-tile:hover .men-stat-ver { transform: translateX(4px); }
    `}</style>
  </Paper>
);

const SeccionTitulo = ({ icon: Icon, color, titulo, descripcion }: {
  icon: ElementType;
  color: string;
  titulo: string;
  descripcion?: string;
}) => (
  <Group gap="sm" mb="sm" wrap="nowrap">
    <ThemeIcon size={34} radius="xl" variant="light" color={color}>
      <Icon size={18} />
    </ThemeIcon>
    <Box>
      <Text fw={700} size="lg" lh={1.2}>{titulo}</Text>
      {descripcion && <Text size="xs" c="dimmed">{descripcion}</Text>}
    </Box>
  </Group>
);

/** Encabezado común de los bloques de filtros (estadísticas, alertas e historial). */
const FiltrosEncabezado = ({ hayFiltros, onLimpiar }: { hayFiltros: boolean; onLimpiar: () => void }) => (
  <Group justify="space-between" mb="sm" wrap="nowrap">
    <Group gap={6}>
      <IconFilter size={16} color="var(--mantine-color-dimmed)" />
      <Text size="sm" fw={700}>Filtros</Text>
    </Group>
    {hayFiltros && (
      <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconFilterOff size={13} />} onClick={onLimpiar}>
        Limpiar filtros
      </Button>
    )}
  </Group>
);

/* ── Componente expandible para el historial de fases ── */
type HistFase = ProcessHistoryRecord["fases"][number];
const HistorialFases = ({ fases }: { fases: HistFase[] }) => {
  const [openFase, setOpenFase]   = useState<number | null>(null);
  const [openAct, setOpenAct]     = useState<string | null>(null);

  return (
    <Stack gap="xs">
      {fases.map(f => (
        <Paper key={f.fase_numero} withBorder radius="md" style={{ overflow: "hidden" }}>
          {/* Cabecera de fase — clic para expandir */}
          <Box
            px="sm" py={10}
            style={{ cursor: "pointer", backgroundColor: openFase === f.fase_numero ? "var(--mantine-color-default-hover)" : undefined, borderBottom: openFase === f.fase_numero ? "1px solid var(--mantine-color-default-border)" : "none" }}
            onClick={() => setOpenFase(prev => prev === f.fase_numero ? null : f.fase_numero)}
          >
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                {openFase === f.fase_numero
                  ? <IconChevronDown size={16} color="var(--mantine-color-dimmed)" />
                  : <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />}
                <Badge
                  radius="sm"
                  style={{ flexShrink: 0 }}
                  styles={{ root: {
                    backgroundColor: infoFasePorNumero(f.fase_numero)?.color ?? "var(--mantine-color-gray-2)",
                    color: infoFasePorNumero(f.fase_numero)?.textColor ?? "#1a1b1e",
                    border: `1px solid ${infoFasePorNumero(f.fase_numero)?.borderColor ?? "var(--mantine-color-default-border)"}`,
                  } }}
                >
                  Fase {f.fase_numero}
                </Badge>
                <Text size="sm" fw={600} truncate="end">{f.fase_nombre}</Text>
              </Group>
              <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                <Progress
                  value={f.actividades_total > 0 ? (f.actividades_completadas / f.actividades_total) * 100 : 0}
                  color={f.actividades_completadas === f.actividades_total ? "teal" : "blue"}
                  size="sm" radius="xl" w={70}
                />
                <Text size="xs" c="dimmed" fw={600}>{f.actividades_completadas}/{f.actividades_total}</Text>
              </Group>
            </Group>
          </Box>

          <Collapse in={openFase === f.fase_numero}>
            <Box px="sm" pt="xs" pb="sm">
              {/* Docs de la fase */}
              {f.documentos.length > 0 && (
                <Box mb="xs">
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>Documentos de la fase</Text>
                  <DocList docs={f.documentos} />
                </Box>
              )}

              {/* Actividades */}
              <Stack gap={4}>
                {(f.actividades ?? []).map((act, ai) => {
                  const actKey = `${f.fase_numero}-${ai}`;
                  const actNa = !!act.no_aplica;
                  const actLista = act.completada || actNa;
                  return (
                    <Paper key={ai} withBorder radius="sm"
                      style={{ overflow: "hidden", borderLeft: `3px solid var(--mantine-color-${actNa ? "orange" : actLista ? "teal" : "gray"}-5)` }}>
                      {/* Cabecera actividad */}
                      <Box
                        px="sm" py={8}
                        style={{ cursor: "pointer" }}
                        onClick={() => setOpenAct(prev => prev === actKey ? null : actKey)}
                      >
                        <Group justify="space-between" wrap="nowrap" align="flex-start">
                          <Group gap="xs" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                            {openAct === actKey
                              ? <IconChevronDown size={14} color="var(--mantine-color-dimmed)" style={{ marginTop: 3, flexShrink: 0 }} />
                              : <IconChevronRight size={14} color="var(--mantine-color-dimmed)" style={{ marginTop: 3, flexShrink: 0 }} />}
                            {actNa
                              ? <IconCircleMinus size={16} color="var(--mantine-color-orange-6)" style={{ flexShrink: 0, marginTop: 1 }} />
                              : <IconCircleCheck size={16} color={`var(--mantine-color-${actLista ? "teal" : "gray"}-6)`} style={{ flexShrink: 0, marginTop: 1 }} />}
                            <Text size="sm" fw={500} c={actNa ? "orange" : undefined}>
                              {act.nombre}
                            </Text>
                            {actNa && (
                              <Badge size="xs" color="orange" variant="light">N/A</Badge>
                            )}
                          </Group>
                          {act.fecha_completado && !actNa && (
                            <Text size="xs" c="teal" fw={600} style={{ flexShrink: 0 }}>{formatFechaDDMMYY(act.fecha_completado)}</Text>
                          )}
                        </Group>
                        {act.responsables && <Text size="xs" c="dimmed" pl={44}>{act.responsables}</Text>}
                      </Box>

                      <Collapse in={openAct === actKey}>
                        <Box px="sm" pt={6} pb="sm" style={{ backgroundColor: "var(--mantine-color-default-hover)" }}>
                          {act.observaciones && (
                            <Paper withBorder radius="sm" p={6} mb={6} style={{ backgroundColor: "var(--mantine-color-yellow-light)" }}>
                              <Text size="xs" c="dimmed">Observaciones:</Text>
                              <Text size="xs">{act.observaciones}</Text>
                            </Paper>
                          )}

                          {/* Docs de la actividad */}
                          <Box mb={act.subactividades.length > 0 ? "xs" : 0}>
                            <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>Documentos</Text>
                            <DocList docs={act.documentos} />
                          </Box>

                          {/* Subactividades */}
                          {act.subactividades.length > 0 && (
                            <Stack gap={4} mt="xs">
                              <Text size="xs" c="dimmed" fw={700} tt="uppercase">Subactividades</Text>
                              {act.subactividades.map((sub, si) => {
                                const subNa = !!sub.no_aplica || actNa;
                                const subLista = sub.completada || subNa;
                                return (
                                <Paper key={si} withBorder radius="sm" px="sm" py={6}>
                                  <Group justify="space-between" mb={sub.documentos.length > 0 || sub.observaciones ? 4 : 0} wrap="nowrap">
                                    <Group gap="xs" wrap="nowrap">
                                      {subNa
                                        ? <IconCircleMinus size={14} color="var(--mantine-color-orange-6)" style={{ flexShrink: 0 }} />
                                        : <IconCircleCheck size={14} color={`var(--mantine-color-${subLista ? "teal" : "gray"}-6)`} style={{ flexShrink: 0 }} />}
                                      <Text size="xs" c={subNa ? "orange" : undefined}>
                                        {sub.nombre}
                                      </Text>
                                      {subNa && (
                                        <Badge size="xs" color="orange" variant="light">
                                          {actNa && !sub.no_aplica ? "N/A (actividad)" : "N/A"}
                                        </Badge>
                                      )}
                                    </Group>
                                    {sub.fecha_completado && !subNa && <Text size="xs" c="teal" fw={600} style={{ flexShrink: 0 }}>{formatFechaDDMMYY(sub.fecha_completado)}</Text>}
                                  </Group>
                                  {sub.observaciones && (
                                    <Text size="xs" c="dimmed" pl={20} mb={2}>Observaciones: {sub.observaciones}</Text>
                                  )}
                                  {sub.documentos.length > 0 && (
                                    <Box pl={20}>
                                      <DocList docs={sub.documentos} />
                                    </Box>
                                  )}
                                </Paper>
                              );})}
                            </Stack>
                          )}
                        </Box>
                      </Collapse>
                    </Paper>
                  );
                })}
              </Stack>
            </Box>
          </Collapse>
        </Paper>
      ))}
    </Stack>
   );
};

function primeraActividadEnFase(fase: Phase | undefined): string | null {
  if (!fase?.actividades?.length) return null;
  const pend = fase.actividades.find((a) => !a.completada && !a.no_aplica);
  if (pend) return pend.nombre;
  return fase.actividades[fase.actividades.length - 1]?.nombre ?? null;
}

type ProcessesMenModulo = "procesos" | "comunicaciones";
type PqrSeccion = "agregar" | "activos" | "historial";

const ProcessesMenPage = () => {
  const { userRole } = useRole();
  const puedeGestionarProcesosMen = ["Administrador"].includes(userRole);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [facultad, setFacultad]             = useState<string>("Todos");
  const [programa, setPrograma]             = useState<string>("Todos");
  const [nivelAcademico, setNivelAcademico] = useState<string>("Todos");
  const [tipoProceso, setTipoProceso]       = useState<string>("Todos");
  const [subtipoFiltro, setSubtipoFiltro]   = useState<string>("Todos");
  /** Tras navegar desde ficha programa con gestionar=1&focusProcess=… */
  const [pendingProcesoScrollId, setPendingProcesoScrollId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [facultades, setFacultades]   = useState<Dependency[]>([]);
  const [programas, setProgramas]     = useState<Program[]>([]);
  const [procesos, setProcesos]       = useState<Process[]>([]);
  const [procesoAEliminar, setProcesoAEliminar] = useState<{ proceso: Process; nombrePrograma: string } | null>(null);
  const [eliminandoProceso, setEliminandoProceso] = useState(false);
  const [errorEliminarProceso, setErrorEliminarProceso] = useState<string | null>(null);
  const [alertaAEliminar, setAlertaAEliminar] = useState<ProcessReminderRecord | null>(null);
  const [fases, setFases]             = useState<Phase[]>([]);
  const [loadingFacultades, setLoadingFacultades] = useState(true);
  const [loadingProgramas, setLoadingProgramas]   = useState(true);
  const [loadingProcesos, setLoadingProcesos]     = useState(true);
  const [loadingFases, setLoadingFases]           = useState(false);

  /* ── Historial ── */
  const [historialRecords, setHistorialRecords]         = useState<ProcessHistoryRecord[]>([]);
  const [loadingHistorial, setLoadingHistorial]         = useState(false);
  const [historialFiltroFacultad, setHistorialFiltroFacultad] = useState<string | null>(null);
  const [historialFiltroPrograma, setHistorialFiltroPrograma] = useState<string | null>(null);
  const [historialDetalle, setHistorialDetalle]         = useState<ProcessHistoryRecord | null>(null);
  const [histCambiarPdfOpen, setHistCambiarPdfOpen]     = useState(false);
  const [histSubiendoPdf, setHistSubiendoPdf]           = useState(false);
  const [histPdfMsg, setHistPdfMsg]                     = useState<string | null>(null);

  const cargarHistorial = async () => {
    setLoadingHistorial(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-history`);
      setHistorialRecords(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("Error cargando historial:", e);
    } finally {
      setLoadingHistorial(false);
    }
  };

  /* ── Vista administrador: estadísticas / alertas / historial ── */
  type AdminSection = "main" | "alertas" | "historial" | "informacion" | "buzon";
  const [activeSection, setActiveSection] = useState<AdminSection>("main");
  const [activeParentSection, setActiveParentSection] = useState<AdminSection | null>(null);
  const navigationSection = activeParentSection ?? activeSection;

  const [remFacultad, setRemFacultad]             = useState<string>("Todos");
  const [remPrograma, setRemPrograma]             = useState<string>("Todos");
  const [remNivel, setRemNivel]                   = useState<string>("Todos");
  const [remModalidad, setRemModalidad]           = useState<string>("Todos");
  const [remTipoPosgrado, setRemTipoPosgrado]     = useState<string>("Todos");
  const [remTipoProceso, setRemTipoProceso]       = useState<string>("Todos");
  const [remSubtipo, setRemSubtipo]               = useState<string>("Todos");
  const [remBusqueda, setRemBusqueda]             = useState("");
  const [remVista, setRemVista]                   = useState<"todo" | "activos" | "alertas">("todo");
  const [remSoloAtencion, setRemSoloAtencion]     = useState(false);
  const [remMasFiltros, setRemMasFiltros]         = useState(false);
  const [reminders, setReminders]                 = useState<ProcessReminderRecord[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  const [filaEdicion, setFilaEdicion] = useState<FilaEdicion | null>(null);
  const [filaValores, setFilaValores] = useState<Record<string, string>>({});
  const [savingTableDate, setSavingTableDate] = useState(false);
  const [dateEditError, setDateEditError] = useState<string | null>(null);
  const [selectedAlertRow, setSelectedAlertRow] = useState<string | null>(null);

  /* ── Modal agregar proceso ── */
  const [agregarProcesoOpen, setAgregarProcesoOpen] = useState(false);
  const [modalListaProgramas, setModalListaProgramas] = useState<{ titulo: string; lista: Program[]; color?: string } | null>(null);

  /* ── Ventanas de gestión ── */
  const [agregarProcesoPrefill, setAgregarProcesoPrefill] = useState<AgregarProcesoPrefill | null>(null);

  const [processesMenModulo, setProcessesMenModulo] = useState<ProcessesMenModulo>("procesos");
  const [pqrSeccion, setPqrSeccion]         = useState<PqrSeccion>("activos");
  const [pqrs, setPqrs]                     = useState<PQR[]>([]);
  const backButtonLabel = processesMenModulo === "comunicaciones"
    ? "Volver a estadísticas generales"
    : activeParentSection === "alertas"
      ? "Volver a alertas"
      : activeParentSection === "historial"
        ? "Volver a historial"
        : activeParentSection === "main"
          ? "Volver a estadísticas generales"
          : "Volver al panel de gestión de procesos";
  const [importarPqrOpen, setImportarPqrOpen] = useState(false);

  const loadingFilters = loadingFacultades || loadingProgramas || loadingProcesos;

  const cargarPQRs = async () => {
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pqr`);
      setPqrs(Array.isArray(res.data) ? res.data as PQR[] : []);
    } catch (e) { console.error("Error cargando PQRs:", e); }
  };

  useEffect(() => { cargarPQRs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePQRCreado = (pqr: PQR) => {
    setPqrs(prev => [pqr, ...prev]);
    setPqrSeccion("activos");
  };

  const handlePQRActualizado = (updated: PQR) =>
    setPqrs(prev => prev.map(p => p._id === updated._id ? updated : p));

  const handlePQRCerrado = async (id: string) => {
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pqr/${id}/cerrar`);
      setPqrs(prev => prev.map(p => p._id === id ? res.data as PQR : p));
    } catch (e) { console.error(e); }
  };

  const irAModuloMen = (m: ProcessesMenModulo) => {
    setActiveParentSection(null);
    setProcessesMenModulo(m);
    router.replace(m === "comunicaciones" ? processesMenRoutes.comunicaciones : processesMenRoutes.home, { scroll: false });
  };

  useEffect(() => {
    if (!searchParams) return;
    setProcessesMenModulo(searchParams.get("modulo") === "comunicaciones" ? "comunicaciones" : "procesos");
    if (searchParams.get("vista") === "informacion") {
      setActiveParentSection(null);
      setActiveSection("informacion");
      setFacultad("Todos");
      setPrograma("Todos");
      setNivelAcademico("Todos");
      setTipoProceso("Todos");
      setSubtipoFiltro("Todos");
    } else if (searchParams.get("vista") === "alertas") {
      const esGestionDesdeAlertas = searchParams.get("gestionar") === "1";
      setActiveParentSection(esGestionDesdeAlertas ? "alertas" : null);
      setActiveSection(esGestionDesdeAlertas ? "informacion" : "alertas");
    } else if (searchParams.get("vista") === "historial") {
      const esGestionDesdeHistorial = searchParams.get("gestionar") === "1";
      setActiveParentSection(esGestionDesdeHistorial ? "alertas" : null);
      setActiveSection(esGestionDesdeHistorial ? "informacion" : "historial");
    }
  }, [searchParams]);

  /* ── Carga inicial de datos ── */
  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`, { params: { limit: 1000 } })
      .then((res) => {
        setFacultades(filterFacultadesMen(parseDependenciesAllResponse(res.data)));
      })
      .catch((err) => console.error("Error cargando facultades:", err))
      .finally(() => setLoadingFacultades(false));
  }, []);

  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs`)
      .then((res) => setProgramas(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Error cargando programas:", err))
      .finally(() => setLoadingProgramas(false));
  }, []);

  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/processes`)
      .then((res) => setProcesos(Array.isArray(res.data) ? res.data : []))
      .catch((err) => console.error("Error cargando procesos:", err))
      .finally(() => setLoadingProcesos(false));
  }, []);

  /** Solo facultades «FACULTAD DE …» y programas/procesos de esas facultades. */
  const programasDelModulo = useMemo(
    () => filterProgramasMen(programas, facultades),
    [programas, facultades],
  );

  const procesosDelModulo = useMemo(
    () => filterProcesosMen(procesos, programas, facultades),
    [procesos, programas, facultades],
  );

  useEffect(() => {
    const onReset = () => {
      setActiveSection("main");
      setActiveParentSection(null);
      setFacultad("Todos");
      setPrograma("Todos");
      setNivelAcademico("Todos");
      setTipoProceso("Todos");
      setRemFacultad("Todos");
      setRemPrograma("Todos");
      setRemNivel("Todos");
      setRemModalidad("Todos");
      setRemTipoPosgrado("Todos");
      setRemTipoProceso("Todos");
      setRemSubtipo("Todos");
      setSubtipoFiltro("Todos");
      setAgregarProcesoOpen(false);
      setHistorialDetalle(null);
      setProcessesMenModulo("procesos");
      setPqrSeccion("activos");
    };
    window.addEventListener(PROCESSES_MEN_RESET_EVENT, onReset);
    return () => window.removeEventListener(PROCESSES_MEN_RESET_EVENT, onReset);
  }, []);

  const programIdQuery = searchParams?.get("programId") ?? null;
  const gestionarQuery = searchParams?.get("gestionar") ?? null;
  const focusTipoQuery = searchParams?.get("focusTipo") ?? null;
  const focusProcessQuery = searchParams?.get("focusProcess") ?? null;
  const vistaQuery = searchParams?.get("vista") ?? null;

  /**
   * Solo reacciona a la URL (searchParams), no a cada refresh de `programas`.
   * Evita redirigir a la ficha equivocada al crear un proceso (p. ej. AV nuevo) si quedaba
   * un `?programId=` viejo sin `gestionar=1` en la barra de direcciones.
   */
  useEffect(() => {
    if (loadingFilters || !programIdQuery || programas.length === 0 || facultades.length === 0) return;
    const pr = programas.find((p) => p._id === programIdQuery);
    if (!pr) return;

    /* Sin gestionar: enlace a ficha. Con gestionar=1: tablero filtrado a ese programa. */
    if (gestionarQuery !== "1") {
      router.replace(processesMenRoutes.program(programIdQuery));
      return;
    }

    if (focusTipoQuery === "RC") setTipoProceso("Registro calificado");
    else if (focusTipoQuery === "AV") setTipoProceso("Acreditación voluntaria");
    else if (focusTipoQuery === "AE") setTipoProceso("Autoevaluación");
    else if (focusTipoQuery === "PM") setTipoProceso("Plan de mejoramiento");
    else setTipoProceso("Todos");
    if (focusProcessQuery) setPendingProcesoScrollId(focusProcessQuery);

    const fac = facultades.find((f) => f.dep_code === pr.dep_code_facultad);
    if (fac) setFacultad(fac.name);
    setPrograma(pr._id);
    setNivelAcademico("Todos");
    setSubtipoFiltro("Todos");
    setActiveParentSection("alertas");
    setActiveSection("informacion");
    setProcessesMenModulo("procesos");
    router.replace(processesMenRoutes.home, { scroll: false });
  }, [
    loadingFilters,
    programIdQuery,
    gestionarQuery,
    focusTipoQuery,
    focusProcessQuery,
    vistaQuery,
    programas,
    facultades,
    router,
  ]);

  useEffect(() => {
    const opts = subtipoOpcionesFiltro(tipoProceso as "Todos" | "Registro calificado" | "Acreditación voluntaria" | "Autoevaluación");
    if (subtipoFiltro !== "Todos" && !opts.includes(subtipoFiltro)) setSubtipoFiltro("Todos");
  }, [tipoProceso, subtipoFiltro]);

  useEffect(() => {
    const opts = subtipoOpcionesFiltro(remTipoProceso as "Todos" | "Registro calificado" | "Acreditación voluntaria" | "Autoevaluación");
    if (remSubtipo !== "Todos" && !opts.includes(remSubtipo)) setRemSubtipo("Todos");
  }, [remTipoProceso, remSubtipo]);

  useEffect(() => {
    if (!puedeGestionarProcesosMen || activeSection !== "alertas") return;
    setLoadingReminders(true);
    const fac = remFacultad !== "Todos" ? facultades.find((f) => f.name === remFacultad) : null;
    const prog = programaDesdeFiltroId(programas, remPrograma);
    const params: Record<string, string> = {};
    if (fac) params.dep_code_facultad = fac.dep_code;
    if (prog) params.program_code = programCodeKey(prog);
    if (remNivel !== "Todos") params.nivel_academico = remNivel;
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/process-reminders`, { params })
      .then((r) => setReminders(Array.isArray(r.data) ? r.data : []))
      .catch((e) => console.error("Error cargando recordatorios:", e))
      .finally(() => setLoadingReminders(false));
  }, [puedeGestionarProcesosMen, activeSection, remFacultad, remPrograma, remNivel, facultades, programas]);

  useEffect(() => {
    if (!puedeGestionarProcesosMen || activeSection !== "historial") return;
    void cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar a la sección
  }, [puedeGestionarProcesosMen, activeSection]);

  /** Solo cambia si cambia el conjunto de procesos del programa (alta/baja), no en cada PUT de fecha —
   *  evita `loadingFases` → Loader que desmonta ProcesoDetalleCard y borra los borradores de la ficha en reforma. */
  const fasesReloadKey = useMemo(() => {
    if (programa === "Todos") return "";
    const prog = programaDesdeFiltroId(programas, programa);
    if (!prog) return "";
    return procesos
      .filter((p) => p.program_code === programCodeKey(prog))
      .map((p) => String(p._id))
      .sort()
      .join("|");
  }, [programa, programas, procesos]);

  useEffect(() => {
    if (programa === "Todos") { setFases([]); return; }
    if (!fasesReloadKey) return;
    const prog = programaDesdeFiltroId(programas, programa);
    if (!prog) return;
    const ids = fasesReloadKey.split("|").filter(Boolean);
    if (ids.length === 0) return;
    setLoadingFases(true);
    const CHUNK = 80;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    Promise.all(
      chunks.map((batch) =>
        axios
          .get(`${process.env.NEXT_PUBLIC_API_URL}/phases`, { params: { proceso_ids: batch.join(",") } })
          .then((r) => (Array.isArray(r.data) ? r.data : []) as Phase[])
          .catch(() => [] as Phase[])
      )
    )
      .then((results) => setFases(results.flat()))
      .finally(() => setLoadingFases(false));
  }, [programa, programas, fasesReloadKey]);

  useEffect(() => {
    if (!pendingProcesoScrollId || loadingFases || programa === "Todos") return;
    const id = pendingProcesoScrollId;
    const t = window.setTimeout(() => {
      document.getElementById(`proceso-detalle-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setPendingProcesoScrollId(null);
    }, 250);
    return () => window.clearTimeout(t);
  }, [pendingProcesoScrollId, loadingFases, programa]);

  /* ── Helpers derivados ── */
  const handleFacultadChange = (val: string | null) => {
    setFacultad(val ?? "Todos");
    setPrograma("Todos");
  };

  /** La ficha es una sección explícita del sidebar; el selector solo filtra estadísticas. */
  const irAInformacionPrograma = () => {
    setActiveParentSection(null);
    setActiveSection("informacion");
    setFacultad("Todos");
    setPrograma("Todos");
    setNivelAcademico("Todos");
  };

  const handleRemFacultadChange = (val: string | null) => {
    setRemFacultad(val ?? "Todos");
    setRemPrograma("Todos");
    setRemSubtipo("Todos");
  };

  const facultadRemSel = facultades.find((f) => f.name === remFacultad);
  const programasFiltradosRem = useMemo(() => {
    if (remFacultad === "Todos") return programasDelModulo;
    if (!facultadRemSel) return [];
    return programasDelModulo.filter((p) => p.dep_code_facultad === facultadRemSel.dep_code);
  }, [remFacultad, programasDelModulo, facultadRemSel]);
  const opcionesRemPrograma = useMemo(
    () => buildOpcionesProgramaSelect(programasFiltradosRem),
    [programasFiltradosRem],
  );

  const opcionesRemSubtipo = useMemo(
    () => subtipoOpcionesFiltro(remTipoProceso as "Todos" | "Registro calificado" | "Acreditación voluntaria" | "Autoevaluación"),
    [remTipoProceso],
  );
  const opcionesRemSubtipoData = useMemo(
    () => subtipoOpcionesConEtiquetas(opcionesRemSubtipo),
    [opcionesRemSubtipo],
  );

  const programasFiltrados = useMemo(() => {
    if (facultad === "Todos") return programasDelModulo;
    const fac = facultades.find((f) => f.name === facultad);
    if (!fac) return [];
    return programasDelModulo.filter((p) => p.dep_code_facultad === fac.dep_code);
  }, [facultad, programasDelModulo, facultades]);

  const programasOrganizadosFacultad = useMemo(
    () => agruparProgramasPorNivel(programasFiltrados),
    [programasFiltrados],
  );

  const getProceso = (prog: Program, tipo: "RC" | "AV" | "AE" | "PM"): Process | undefined => {
    const code = programCodeKey(prog);
    if (tipo === "RC") return procesoRcActivoDePrograma(procesosDelModulo, code);
    return procesosDelModulo.find((p) => p.program_code === code && p.tipo_proceso === tipo);
  };

  const opcionesFacultad = useMemo(
    () => ["Todos", ...facultades.map((f) => f.name).sort((a, b) => a.localeCompare(b, "es"))],
    [facultades],
  );
  /** Programas acotados por facultad; si Facultad = Todos, se listan todos (ordenados). */
  const opcionesPrograma = useMemo(
    () => buildOpcionesProgramaSelect(programasFiltrados),
    [programasFiltrados],
  );
  const opcionesNivelAcademico = useMemo(
    () => ["Todos", ...["Posgrado", "Pregrado"].sort((a, b) => a.localeCompare(b, "es"))],
    [],
  );
  const opcionesTipoProceso = useMemo(
    () => ["Todos", ...["Acreditación voluntaria", "Autoevaluación", "Plan de mejoramiento", "Registro calificado"].sort((a, b) => a.localeCompare(b, "es"))],
    [],
  );

  const opcionesSubtipoFiltro = useMemo(
    () => subtipoOpcionesFiltro(tipoProceso as "Todos" | "Registro calificado" | "Acreditación voluntaria" | "Autoevaluación"),
    [tipoProceso],
  );
  const opcionesSubtipoFiltroData = useMemo(
    () => subtipoOpcionesConEtiquetas(opcionesSubtipoFiltro),
    [opcionesSubtipoFiltro],
  );

  const historialOpcionesFacultad = useMemo(
    () =>
      [...facultades]
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
        .map((f) => ({ value: f.dep_code, label: f.name })),
    [facultades],
  );

  const historialOpcionesPrograma = useMemo(
    () =>
      [...new Set(historialRecords.map((r) => r.nombre_programa))]
        .sort((a, b) => a.localeCompare(b, "es"))
        .map((n) => ({ value: n, label: n })),
    [historialRecords],
  );

  const programasFiltradosCompleto = useMemo(() => {
    let list = programasFiltrados
      .filter((p) => programa === "Todos" || p._id === programa)
      .filter((p) => nivelAcademico === "Todos" || p.nivel_academico === nivelAcademico);
    if (subtipoFiltro !== "Todos") {
      list = list.filter((p) => {
        const rc = procesoRcActivoDePrograma(procesosDelModulo, programCodeKey(p));
        const av = procesosDelModulo.find((x) => x.program_code === programCodeKey(p) && x.tipo_proceso === "AV");
        if (tipoProceso === "Registro calificado") {
          return procesoCumpleSubtipoFiltro(rc?.subtipo, "RC", subtipoFiltro, tipoProceso);
        }
        if (tipoProceso === "Acreditación voluntaria") {
          return procesoCumpleSubtipoFiltro(av?.subtipo, "AV", subtipoFiltro, tipoProceso);
        }
        return (
          procesoCumpleSubtipoFiltro(rc?.subtipo, "RC", subtipoFiltro, tipoProceso) ||
          procesoCumpleSubtipoFiltro(av?.subtipo, "AV", subtipoFiltro, tipoProceso)
        );
      });
    }
    return list;
  }, [programasFiltrados, programa, nivelAcademico, tipoProceso, subtipoFiltro, procesosDelModulo]);

  const codigosProgramasFiltrados = useMemo(
    () => new Set(programasFiltradosCompleto.map((p) => programCodeKey(p))),
    [programasFiltradosCompleto],
  );

  const listaRcVigente = useMemo(
    () => programasFiltradosCompleto.filter((p) => !!p.tiene_rc_vigente),
    [programasFiltradosCompleto],
  );
  const listaSinRcVigente = useMemo(
    () => programasFiltradosCompleto.filter((p) => !p.tiene_rc_vigente),
    [programasFiltradosCompleto],
    );
  const listaAvVigente = useMemo(
    () => programasFiltradosCompleto.filter((p) => !!p.tiene_av_vigente),
    [programasFiltradosCompleto],
  );
  const listaAcreditables = useMemo(
    () => programasFiltradosCompleto.filter((p) => !!p.es_acreditable),
    [programasFiltradosCompleto],
  );
  const listaNoAcreditados = useMemo(
    () => programasFiltradosCompleto.filter((p) => !p.tiene_av_vigente),
    [programasFiltradosCompleto],
  );
  const listaProgEnReforma = useMemo(() => {
    const codes = new Set(
      procesosDelModulo
        .filter(
          (pr) =>
            pr.tipo_proceso === "RC"
            && esSubtipoReformaProceso(pr.subtipo)
            && codigosProgramasFiltrados.has(pr.program_code),
        )
        .map((pr) => pr.program_code),
    );
    return programasFiltradosCompleto.filter((p) => codes.has(programCodeKey(p)));
  }, [procesosDelModulo, programasFiltradosCompleto, codigosProgramasFiltrados]);

  const ultimoRcAprobadoPorPrograma = useMemo(() => {
    const byCode = new Map<string, ProcessHistoryRecord>();
    const candidatos = historialRecords.filter((r) => {
      if (r.tipo_proceso !== "RC") return false;
      const subtipoNorm = normSubtipoStats(r.subtipo);
      if (subtipoNorm === "vigencia transitoria") return false;
      return !r.estado_solicitud || r.estado_solicitud === "APROBADO";
    });
    const scoreFecha = (r: ProcessHistoryRecord) =>
      new Date(r.fecha_resolucion || r.cerrado_en || 0).getTime();
    for (const r of candidatos) {
      const key = String(r.program_code ?? "").trim();
      if (!key) continue;
      const previo = byCode.get(key);
      if (!previo || scoreFecha(r) >= scoreFecha(previo)) byCode.set(key, r);
    }
    return byCode;
  }, [historialRecords]);

  const listaProgRcOficio = useMemo(() => {
    return programasFiltradosCompleto.filter((p) => {
      if (!p.tiene_rc_vigente) return false;
      const ultimoRc = ultimoRcAprobadoPorPrograma.get(programCodeKey(p));
      return normSubtipoStats(ultimoRc?.subtipo) === "registro calificado de oficio";
    });
  }, [programasFiltradosCompleto, ultimoRcAprobadoPorPrograma]);

  const totalVigentes = listaRcVigente.length;
  const totalSinRcVigente = listaSinRcVigente.length;
  const totalAcreditados = listaAvVigente.length;
  const totalAcreditables = listaAcreditables.length;
  const totalNoAcreditados = listaNoAcreditados.length;
  const totalProgramas = programasFiltradosCompleto.length;
  const pctAcreditados = totalProgramas > 0 ? Math.round((totalAcreditados / totalProgramas) * 100) : 0;
  const pctAcreditables = totalProgramas > 0 ? Math.round((totalAcreditables / totalProgramas) * 100) : 0;

  const totalProgRCOficio = listaProgRcOficio.length;

  const listaProgConPm = useMemo(() => {
    const codes = new Set(procesosDelModulo.filter((p) => p.tipo_proceso === "PM").map((p) => p.program_code));
    return programasFiltradosCompleto.filter((p) => codes.has(programCodeKey(p)));
  }, [procesosDelModulo, programasFiltradosCompleto]);

  const totalProgConPm = listaProgConPm.length;
  const listaMinimoAcreditacion = useMemo(() => {
    const map = new Map<string, Program>();
    [...listaAvVigente, ...listaAcreditables].forEach((p) => map.set(p._id, p));
    return [...map.values()];
  }, [listaAvVigente, listaAcreditables]);
  const minimoProgramasAcreditacion = Math.ceil((totalAcreditados + totalAcreditables) * 0.3);

  const barRegistro = useMemo(() => {
    const tipo: "RC" = "RC";
    const grupos: Record<string, BarRow> = {};
    facultades.forEach((f) => {
      if (programasDelModulo.some((p) => p.dep_code_facultad === f.dep_code)) {
        grupos[f.dep_code] = {
          nombre: f.name,
          dep_code: f.dep_code,
          fase_0: 0, fase_1: 0, fase_2: 0, fase_3: 0, fase_4: 0, fase_5: 0, fase_6: 0,
          fase_contingencia: 0, fase_pm: 0,
        };
      }
    });
    programasFiltradosCompleto.forEach((p) => {
      if (!grupos[p.dep_code_facultad]) return;
      const proc = getProceso(p, tipo);
      if (!proc) return;
      const n = Number(proc.fase_actual) || 0;
      if (n >= 7) grupos[p.dep_code_facultad].fase_contingencia += 1;
      else {
        const fase = Math.min(Math.max(n, 0), 6);
        (grupos[p.dep_code_facultad][`fase_${fase}` as keyof BarRow] as number) += 1;
      }
    });
    return Object.values(grupos);
  }, [facultades, programasDelModulo, programasFiltradosCompleto, procesosDelModulo]);

  const barAcreditacion = useMemo(() => {
    const tipo: "AV" = "AV";
    const grupos: Record<string, BarRow> = {};
    facultades.forEach((f) => {
      if (programasDelModulo.some((p) => p.dep_code_facultad === f.dep_code)) {
        grupos[f.dep_code] = {
          nombre: f.name,
          dep_code: f.dep_code,
          fase_0: 0, fase_1: 0, fase_2: 0, fase_3: 0, fase_4: 0, fase_5: 0, fase_6: 0,
          fase_contingencia: 0, fase_pm: 0,
        };
      }
    });
    programasFiltradosCompleto.forEach((p) => {
      if (!grupos[p.dep_code_facultad]) return;
      const proc = getProceso(p, tipo);
      if (!proc) return;
      const n = Number(proc.fase_actual) || 0;
      if (n >= 7) grupos[p.dep_code_facultad].fase_contingencia += 1;
      else {
        const fase = Math.min(Math.max(n, 0), 6);
        (grupos[p.dep_code_facultad][`fase_${fase}` as keyof BarRow] as number) += 1;
      }
    });
    // Contar PMs activos por facultad (aparecen al cerrar una AV)
    programasFiltradosCompleto.forEach((p) => {
      if (!grupos[p.dep_code_facultad]) return;
      const pmProc = getProceso(p, "PM");
      if (pmProc) grupos[p.dep_code_facultad].fase_pm += 1;
    });
    return Object.values(grupos);
  }, [facultades, programasDelModulo, programasFiltradosCompleto, procesosDelModulo]);

  const barRegistroPorPrograma = useMemo(() => {
    return programasFiltradosCompleto.map((p) => {
      const proc = getProceso(p, "RC");
      const n = Number(proc?.fase_actual) || 0;
      const row: BarRow = {
        nombre: p.nombre,
        dep_code: p.dep_code_facultad,
        program_code: programCodeKey(p),
        fase_0: 0, fase_1: 0, fase_2: 0, fase_3: 0, fase_4: 0, fase_5: 0, fase_6: 0,
        fase_contingencia: 0, fase_pm: 0,
      };
      if (proc) {
        if (n >= 7) row.fase_contingencia = 1;
        else {
          const faseKey = `fase_${Math.min(Math.max(n, 0), 6)}` as "fase_0" | "fase_1" | "fase_2" | "fase_3" | "fase_4" | "fase_5" | "fase_6";
          row[faseKey] = 1;
        }
      }
      return row;
    });
  }, [programasFiltradosCompleto, procesosDelModulo]);

  const barAcreditacionPorPrograma = useMemo(() => {
    return programasFiltradosCompleto.map((p) => {
      const proc = getProceso(p, "AV");
      const pmProc = getProceso(p, "PM");
      const n = Number(proc?.fase_actual) || 0;
      const row: BarRow = {
        nombre: p.nombre,
        dep_code: p.dep_code_facultad,
        program_code: programCodeKey(p),
        fase_0: 0, fase_1: 0, fase_2: 0, fase_3: 0, fase_4: 0, fase_5: 0, fase_6: 0,
        fase_contingencia: 0, fase_pm: pmProc ? 1 : 0,
      };
      if (proc) {
        if (n >= 7) row.fase_contingencia = 1;
        else {
          const faseKey = `fase_${Math.min(Math.max(n, 0), 6)}` as "fase_0" | "fase_1" | "fase_2" | "fase_3" | "fase_4" | "fase_5" | "fase_6";
          row[faseKey] = 1;
        }
      }
      return row;
    });
  }, [programasFiltradosCompleto, procesosDelModulo]);

  const remindersFiltradosTipo = useMemo(() => {
    return reminders.filter((r) => {
      if (remTipoProceso === "Registro calificado") return r.tipo_proceso === "RC";
      if (remTipoProceso === "Acreditación voluntaria") return r.tipo_proceso === "AV";
      if (remTipoProceso === "Autoevaluación") return r.tipo_proceso === "AE";
      if (remTipoProceso === "Plan de mejoramiento") return r.tipo_proceso === "PM";
      return true;
    });
  }, [reminders, remTipoProceso]);

  /** RC, AV y AE activos que cumplen filtros de alertas. */
  const filasProcesosActivosRcAv = useMemo(() => {
    return procesosDelModulo
      .filter((p) => p.tipo_proceso === "RC" || p.tipo_proceso === "AV" || p.tipo_proceso === "AE")
      .filter((p) => {
        if (p.tipo_proceso !== "RC") return true;
        const canon = procesoRcActivoDePrograma(procesosDelModulo, p.program_code);
        return !!canon && canon._id === p._id;
      })
      .map((proc) => {
        const prog = findProgramByCode(programasDelModulo, proc.program_code);
        return prog ? { proc, prog } : null;
      })
      .filter((x): x is { proc: Process; prog: Program } => x != null)
      .filter(({ prog, proc }) => {
        if (remTipoProceso === "Registro calificado" && proc.tipo_proceso !== "RC") return false;
        if (remTipoProceso === "Acreditación voluntaria" && proc.tipo_proceso !== "AV") return false;
        if (remTipoProceso === "Autoevaluación" && proc.tipo_proceso !== "AE") return false;
        if (remTipoProceso === "Plan de mejoramiento") return false;
        if (!procesoCumpleSubtipoFiltro(proc.subtipo, proc.tipo_proceso, remSubtipo, remTipoProceso)) return false;
        if (remFacultad !== "Todos") {
          const f = facultades.find((x) => x.name === remFacultad);
          if (!f || prog.dep_code_facultad !== f.dep_code) return false;
        }
        if (remPrograma !== "Todos" && prog._id !== remPrograma) return false;
        if (remNivel !== "Todos" && prog.nivel_academico !== remNivel) return false;
        if (remModalidad !== "Todos" && normalizarNivelPrograma(prog.modalidad) !== normalizarNivelPrograma(remModalidad)) return false;
        if (remTipoPosgrado !== "Todos" && tipoPosgrado(prog) !== remTipoPosgrado) return false;
        return true;
      })
      .sort((a, b) => {
        const porVenc = compararPorFechaVencimiento(a.proc.fecha_vencimiento, b.proc.fecha_vencimiento);
        if (porVenc !== 0) return porVenc;
        return (a.prog.nombre ?? "").localeCompare(b.prog.nombre ?? "", "es");
      });
  }, [procesosDelModulo, programasDelModulo, remFacultad, remPrograma, remNivel, remModalidad, remTipoPosgrado, remTipoProceso, remSubtipo, facultades]);

  /** Planes de Mejoramiento activos (PM) que cumplen filtros de alertas. */
  const filasActivasPM = useMemo(() => {
    return procesosDelModulo
      .filter((p) => p.tipo_proceso === "PM")
      .map((proc) => {
        const prog = findProgramByCode(programasDelModulo, proc.program_code);
        return prog ? { proc, prog } : null;
      })
      .filter((x): x is { proc: Process; prog: Program } => x != null)
      .filter(({ prog }) => {
        /* Al elegir RC, AV o AE en «Por proceso (tipo)» no se listan los planes de mejoramiento. */
        if (remTipoProceso !== "Todos" && remTipoProceso !== "Plan de mejoramiento") return false;
        if (remFacultad !== "Todos") {
          const f = facultades.find((x) => x.name === remFacultad);
          if (!f || prog.dep_code_facultad !== f.dep_code) return false;
        }
        if (remPrograma !== "Todos" && prog._id !== remPrograma) return false;
        if (remNivel !== "Todos" && prog.nivel_academico !== remNivel) return false;
        if (remModalidad !== "Todos" && normalizarNivelPrograma(prog.modalidad) !== normalizarNivelPrograma(remModalidad)) return false;
        if (remTipoPosgrado !== "Todos" && tipoPosgrado(prog) !== remTipoPosgrado) return false;
        return true;
      })
      .sort((a, b) => {
        const porVenc = compararPorFechaVencimiento(a.proc.fecha_vencimiento, b.proc.fecha_vencimiento);
        if (porVenc !== 0) return porVenc;
        return (a.prog.nombre ?? "").localeCompare(b.prog.nombre ?? "", "es");
      });
  }, [procesosDelModulo, programasDelModulo, remFacultad, remPrograma, remNivel, remModalidad, remTipoPosgrado, remTipoProceso, facultades]);

  /** Alertas por cierre (RC/AV/AE): solo si aún no hay un proceso activo del mismo tipo en ese programa. */
  const remindersSinActivoMismoTipo = useMemo(() => {
    return remindersFiltradosTipo.filter((r) => {
      if (r.tipo_proceso === "PM") return false; // PM se maneja aparte en remindersActivosPM
      if (!procesoCumpleSubtipoFiltro(r.subtipo, r.tipo_proceso, remSubtipo, remTipoProceso)) return false;
      const prog = findProgramByCode(programasDelModulo, r.program_code);
      if (remModalidad !== "Todos" && normalizarNivelPrograma(prog?.modalidad) !== normalizarNivelPrograma(remModalidad)) return false;
      if (remTipoPosgrado !== "Todos" && (!prog || tipoPosgrado(prog) !== remTipoPosgrado)) return false;
      return !procesosDelModulo.some((p) => p.program_code === r.program_code && p.tipo_proceso === r.tipo_proceso);
    });
  }, [remindersFiltradosTipo, procesosDelModulo, remSubtipo, remTipoProceso, programasDelModulo, remModalidad, remTipoPosgrado]);

  /** Alertas activas del Plan de Mejoramiento (siempre visibles mientras el PM esté activo). */
  const remindersActivosPM = useMemo(() => {
    return reminders
      .filter((r) => r.tipo_proceso === "PM")
      .filter((r) => {
        if (remFacultad !== "Todos") {
          const f = facultades.find((x) => x.name === remFacultad);
          const prog = findProgramByCode(programasDelModulo, r.program_code);
          if (!f || prog?.dep_code_facultad !== f.dep_code) return false;
        }
        if (remPrograma !== "Todos") {
          const prog = findProgramByCode(programasDelModulo, r.program_code);
          if (prog?._id !== remPrograma) return false;
        }
        const prog = findProgramByCode(programasDelModulo, r.program_code);
        if (remModalidad !== "Todos" && normalizarNivelPrograma(prog?.modalidad) !== normalizarNivelPrograma(remModalidad)) return false;
        if (remTipoPosgrado !== "Todos" && (!prog || tipoPosgrado(prog) !== remTipoPosgrado)) return false;
        return true;
      })
      .sort((a, b) => (a.nombre_programa ?? "").localeCompare(b.nombre_programa ?? "", "es"));
  }, [reminders, remFacultad, remPrograma, remModalidad, remTipoPosgrado, facultades, programasDelModulo]);

  /** Alertas de cierre: vencimiento más cercano arriba (gestiones activas van aparte, arriba). */
  const remindersOrdenados = useMemo(
    () =>
      [...remindersSinActivoMismoTipo].sort((a, b) => {
        const porVenc = compararPorFechaVencimiento(a.fecha_vencimiento, b.fecha_vencimiento);
        if (porVenc !== 0) return porVenc;
        return (a.nombre_programa ?? "").localeCompare(b.nombre_programa ?? "", "es");
      }),
    [remindersSinActivoMismoTipo],
  );

  const alertaRequiereAtencion = (r: ProcessReminderRecord) => {
    const nivel = nivelSemaforoAlerta(r);
    return nivel === "red" || nivel === "gray";
  };

  /** Filtros de programa del tablero de alertas (sin tipo, subtipo ni vista). */
  const pasaFiltrosProgramaAlertas = (prog: Program | undefined) => {
    if (!prog) return false;
    if (remFacultad !== "Todos") {
      const f = facultades.find((x) => x.name === remFacultad);
      if (!f || prog.dep_code_facultad !== f.dep_code) return false;
    }
    if (remPrograma !== "Todos" && prog._id !== remPrograma) return false;
    if (remNivel !== "Todos" && prog.nivel_academico !== remNivel) return false;
    if (remModalidad !== "Todos" && normalizarNivelPrograma(prog.modalidad) !== normalizarNivelPrograma(remModalidad)) return false;
    if (remTipoPosgrado !== "Todos" && tipoPosgrado(prog) !== remTipoPosgrado) return false;
    return true;
  };

  /** Totales de las tarjetas de resumen: no cambian al hacer clic en una tarjeta. */
  const conteosResumenAlertas = (() => {
    const activos = procesosDelModulo
      .filter((p) => p.tipo_proceso === "RC" || p.tipo_proceso === "AV" || p.tipo_proceso === "AE")
      .filter((p) => p.tipo_proceso !== "RC" || procesoRcActivoDePrograma(procesosDelModulo, p.program_code)?._id === p._id)
      .filter((p) => pasaFiltrosProgramaAlertas(findProgramByCode(programasDelModulo, p.program_code)));
    const pm = procesosDelModulo
      .filter((p) => p.tipo_proceso === "PM")
      .filter((p) => pasaFiltrosProgramaAlertas(findProgramByCode(programasDelModulo, p.program_code)));
    const alertas = reminders
      .filter((r) => r.tipo_proceso !== "PM")
      .filter((r) => {
        const prog = findProgramByCode(programasDelModulo, r.program_code);
        if (remModalidad !== "Todos" && normalizarNivelPrograma(prog?.modalidad) !== normalizarNivelPrograma(remModalidad)) return false;
        if (remTipoPosgrado !== "Todos" && (!prog || tipoPosgrado(prog) !== remTipoPosgrado)) return false;
        return !procesosDelModulo.some((p) => p.program_code === r.program_code && p.tipo_proceso === r.tipo_proceso);
      });
    return {
      RC: activos.filter((p) => p.tipo_proceso === "RC").length,
      AV: activos.filter((p) => p.tipo_proceso === "AV").length,
      AE: activos.filter((p) => p.tipo_proceso === "AE").length,
      PM: pm.length,
      alertas: alertas.length,
      atencion: alertas.filter(alertaRequiereAtencion).length,
    };
  })();

  /** Las tarjetas de resumen son excluyentes: elegir una quita la anterior (null = ninguna). */
  const seleccionarTarjetaAlertas = (sel: { tipo?: string; vista?: "alertas"; atencion?: boolean } | null) => {
    setRemTipoProceso(sel?.tipo ?? "Todos");
    setRemSubtipo("Todos");
    setRemVista(sel?.vista ?? (sel?.atencion ? "alertas" : "todo"));
    setRemSoloAtencion(!!sel?.atencion);
  };

  const coincideBusquedaAlertas = (nombre: string | null | undefined) =>
    !remBusqueda.trim() || normalizarBusqueda(nombre ?? "").includes(normalizarBusqueda(remBusqueda.trim()));

  const filasActivasVisibles = (remVista === "alertas" || remSoloAtencion)
    ? []
    : filasProcesosActivosRcAv.filter(({ prog }) => coincideBusquedaAlertas(prog.nombre));
  const alertasVisibles = remVista === "activos"
    ? []
    : remindersOrdenados.filter((r) => coincideBusquedaAlertas(r.nombre_programa) && (!remSoloAtencion || alertaRequiereAtencion(r)));
  const pmVisibles = (remVista === "alertas" || remSoloAtencion)
    ? []
    : filasActivasPM.filter(({ prog }) => coincideBusquedaAlertas(prog.nombre));

  const pqrsOrdenados = useMemo(
    () =>
      [...pqrs].sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      }),
    [pqrs],
  );

  const historialProcesosOrdenado = useMemo(
    () =>
      [...historialRecords].sort((a, b) => {
        const ta = new Date(a.cerrado_en || 0).getTime();
        const tb = new Date(b.cerrado_en || 0).getTime();
        return tb - ta;
      }),
    [historialRecords],
  );

  const handleProcesoCreado = async () => {
    const [resProg, resProc] = await Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/processes`),
    ]);
    setProgramas(Array.isArray(resProg.data) ? resProg.data : []);
    setProcesos(Array.isArray(resProc.data) ? resProc.data : []);
  };

  const eliminarProcesoDesdeAlertas = async () => {
    if (!procesoAEliminar || eliminandoProceso || userRole !== "Administrador") return;
    const id = procesoAEliminar.proceso._id;
    setEliminandoProceso(true);
    setErrorEliminarProceso(null);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/processes/${id}`);
      setProcesos(previous => previous.filter(proceso => proceso._id !== id));
      setFases(previous => previous.filter(fase => fase.proceso_id !== id));
      setProcesoAEliminar(null);
    } catch (error) {
      setErrorEliminarProceso(axios.isAxiosError(error)
        ? error.response?.data?.error || "No se pudo eliminar el proceso. Intenta de nuevo."
        : "No se pudo eliminar el proceso. Intenta de nuevo.");
    } finally {
      setEliminandoProceso(false);
    }
  };

  const eliminarAlerta = async () => {
    if (!alertaAEliminar || eliminandoProceso || userRole !== "Administrador") return;
    const id = alertaAEliminar._id;
    setEliminandoProceso(true);
    setErrorEliminarProceso(null);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-reminders/${id}`);
      setReminders(previous => previous.filter(reminder => reminder._id !== id));
      setProcesos(previous => previous.filter(proceso => proceso._id !== id));
      setAlertaAEliminar(null);
    } catch (error) {
      setErrorEliminarProceso(axios.isAxiosError(error)
        ? error.response?.data?.error || "No se pudo eliminar la alerta. Intenta de nuevo."
        : "No se pudo eliminar la alerta. Intenta de nuevo.");
    } finally {
      setEliminandoProceso(false);
    }
  };

  const abrirEdicionFila = (fila: FilaEdicion) => {
    setFilaEdicion(fila);
    setFilaValores(Object.fromEntries(fila.campos.map((c) => [claveCampoFila(c), c.valor?.slice(0, 10) ?? ""])));
    setDateEditError(null);
  };

  /** Guarda solo las fechas que cambiaron, agrupadas en una petición por proceso/programa. */
  const guardarFila = async () => {
    if (!filaEdicion || savingTableDate || !puedeGestionarProcesosMen) return;
    const cambios = new Map<string, { resource: CampoFechaFila["resource"]; id: string; payload: Record<string, string | null> }>();
    for (const c of filaEdicion.campos) {
      const nuevo = filaValores[claveCampoFila(c)] ?? "";
      if (nuevo === (c.valor?.slice(0, 10) ?? "")) continue;
      const k = `${c.resource}:${c.id}`;
      if (!cambios.has(k)) cambios.set(k, { resource: c.resource, id: c.id, payload: {} });
      cambios.get(k)!.payload[c.field] = nuevo || null;
    }
    if (cambios.size === 0) {
      setFilaEdicion(null);
      return;
    }
    setSavingTableDate(true);
    setDateEditError(null);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      for (const { resource, id, payload } of cambios.values()) {
        const res = await axios.put(`${base}/${resource === "process" ? "processes" : "programs"}/${id}`, payload);
        if (resource === "process") {
          const updated = res.data as Process;
          setProcesos((previous) => previous.map((item) => item._id === updated._id ? updated : item));
        } else {
          const updated = res.data as Program;
          setProgramas((previous) => previous.map((item) => item._id === updated._id ? updated : item));
        }
      }
      setFilaEdicion(null);
    } catch (error) {
      console.error("Error actualizando fechas desde alertas:", error);
      setDateEditError(axios.isAxiosError(error)
        ? error.response?.data?.error || "No se pudieron guardar las fechas. Intenta de nuevo."
        : "No se pudieron guardar las fechas. Intenta de nuevo.");
    } finally {
      setSavingTableDate(false);
    }
  };

  const renderFecha = (fecha: string | null | undefined) => (
    <Text size="xs" fw={fecha ? 600 : 400} c={fecha ? undefined : "dimmed"} ta="center" style={{ whiteSpace: "nowrap" }}>
      {formatFechaDDMMYY(fecha)}
    </Text>
  );

  const renderFechaVencimiento = (fecha: string | null | undefined) => {
    const rel = vencimientoRelativo(fecha);
    return (
      <Stack gap={0} align="center">
        {renderFecha(fecha)}
        {rel && <Text size="xs" fw={600} c={rel.color} style={{ whiteSpace: "nowrap" }}>{rel.texto}</Text>}
      </Stack>
    );
  };

  const botonEditarFila = (fila: FilaEdicion) => puedeGestionarProcesosMen ? (
    <Tooltip label="Editar fechas de esta fila" withArrow>
      <Button
        size="xs"
        variant="light"
        color="blue"
        radius="md"
        leftSection={<IconEdit size={14} />}
        aria-label={`Editar fechas de ${fila.programName}`}
        onClick={(event) => {
          event.stopPropagation();
          abrirEdicionFila(fila);
        }}
      >
        Editar
      </Button>
    </Tooltip>
  ) : null;

  const irAGestionarProcesoDesdeModal = async (args: {
    programId?: string;
    nombrePrograma: string;
    tipo: "RC" | "AV" | "AE" | "PM";
    dep_code_programa?: string;
    dep_code_facultad?: string;
  }) => {
    setAgregarProcesoOpen(false);
    setAgregarProcesoPrefill(null);
    setProcessesMenModulo("procesos");
    setActiveParentSection("alertas");
    setActiveSection("informacion");

    const [resProg, resProc] = await Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/processes`),
    ]);
    const progs = Array.isArray(resProg.data) ? (resProg.data as Program[]) : [];
    const procs = Array.isArray(resProc.data) ? (resProc.data as Process[]) : [];

    const progObj =
      (args.programId ? progs.find((p) => p._id === args.programId) : undefined)
      ?? (args.dep_code_programa ? findProgramByCode(progs, args.dep_code_programa) : undefined)
      ?? progs.find((p) => p.nombre === args.nombrePrograma);

    const pid = progObj?._id ?? args.programId;

    /* Navegar con gestionar=1 antes de setProgramas: evita que el efecto de URL mande a la ficha por error. */
    if (pid) {
      await router.replace(
        processesMenRoutes.homeWithQuery({
          programId: pid,
          gestionar: "1",
          focusTipo: args.tipo,
          vista: "alertas",
        }),
        { scroll: false },
      );
    } else if (!pid && pathname !== PROCESSES_MEN_BASE) {
      await router.replace(processesMenRoutes.home, { scroll: false });
    }

    setProgramas(progs);
    setProcesos(procs);

    const facFromCodes =
      args.dep_code_facultad != null && String(args.dep_code_facultad).trim() !== ""
        ? facultades.find((f) => f.dep_code === args.dep_code_facultad)
        : null;
    const facObj =
      facFromCodes
      ?? (progObj ? facultades.find((f) => f.dep_code === progObj.dep_code_facultad) : null);

    if (facObj) setFacultad(facObj.name);
    setPrograma(progObj?._id ?? "Todos");
    setNivelAcademico("Todos");
    setTipoProceso(
      args.tipo === "RC" ? "Registro calificado" :
      args.tipo === "AV" ? "Acreditación voluntaria" :
      args.tipo === "AE" ? "Autoevaluación" :
      "Plan de mejoramiento"
    );
    setSubtipoFiltro("Todos");
  };

  const sidebarW = puedeGestionarProcesosMen
    ? (sidebarCollapsed ? 56 : 208)
    : (sidebarCollapsed ? 48 : 200);

  const programaDeRecordatorio = (r: ProcessReminderRecord) =>
    findProgramByCode(programas, r.program_code)
    ?? programas.find((p) => p.nombre.trim().toLocaleLowerCase("es") === r.nombre_programa.trim().toLocaleLowerCase("es"));

  const abrirAgregarDesdeRecordatorio = (r: ProcessReminderRecord) => {
    const prog = programaDeRecordatorio(r);
    if (!prog) return;
    const tipo = r.tipo_proceso;
    /* Alerta puede traer nulls en snapshot; respaldo a programa si aún tiene resolución vigente. */
    const fechaR = r.fecha_resolucion ?? (tipo === "RC" ? prog.fecha_resolucion_rc : prog.fecha_resolucion_av);
    const codigoR = r.codigo_resolucion ?? (tipo === "RC" ? prog.codigo_resolucion_rc : prog.codigo_resolucion_av);
    const duracionR = r.duracion_resolucion ?? (tipo === "RC" ? prog.duracion_resolucion_rc : prog.duracion_resolucion_av);

    const docPdfInfo: { name?: string; view_link: string }[] = [];
    if (Array.isArray(r.documentos)) {
      for (const d of r.documentos) {
        const v = d.view_link?.trim();
        if (v) docPdfInfo.push({ name: d.name, view_link: v });
      }
    }
    if (docPdfInfo.length === 0) {
      const link =
        tipo === "RC" ? prog.ultimo_rc?.link_documento ?? null
        : tipo === "AV" ? prog.ultimo_av?.link_documento ?? null
        : null;
      const v = link?.trim();
      if (v) docPdfInfo.push({ name: "Resolución (registrada en el programa)", view_link: v });
    }

    const rcOficioPostAvGracia = tipo === "RC" && !!prog.av_rc_oficio_pendiente;
  const excluirNuevoDesdeAlerta = r.subtipo !== "Nuevo";
    setAgregarProcesoPrefill({
      programId: prog._id,
      tipo: tipo as "RC" | "AV" | "AE",
    excluirNuevo: excluirNuevoDesdeAlerta,
      reminderRowId: r._id,
      rcOficioPostAvGracia: rcOficioPostAvGracia || undefined,
      documentos_pdf_resolucion: rcOficioPostAvGracia ? undefined : (docPdfInfo.length > 0 ? docPdfInfo : undefined),
      resolucionDesdeAlerta: rcOficioPostAvGracia
        ? null
        : {
            fecha_resolucion: fechaR,
            codigo_resolucion: codigoR,
            duracion_resolucion: duracionR,
          },
    });
    setAgregarProcesoOpen(true);
  };

  const navBtnStyles = (esActivo: boolean) => ({
    root: {
      minHeight: 56,
      paddingBlock: 12,
      paddingInline: 8,
      fontWeight: 600,
      fontSize: 13,
      lineHeight: 1.25,
      justifyContent: "center" as const,
      border: esActivo
        ? "1px solid var(--mantine-color-blue-4)"
        : "1px solid var(--mantine-color-gray-3)",
      backgroundColor: esActivo ? "var(--mantine-color-blue-light)" : "var(--mantine-color-body)",
      color: esActivo ? "var(--mantine-color-blue-filled)" : "var(--mantine-color-dark-7)",
      "&:hover": {
        backgroundColor: "var(--mantine-color-blue-light)",
        color: "var(--mantine-color-blue-filled)",
        borderColor: "var(--mantine-color-blue-3)",
      },
    },
    label: { whiteSpace: "normal" as const, textAlign: "center" as const, fontWeight: 600 },
  });

  const pqrNavBtnStyles = (esActivo: boolean) => ({
    root: {
      minHeight: 48,
      paddingBlock: 10,
      fontWeight: 600,
      fontSize: 12,
      justifyContent: "center" as const,
      border: esActivo
        ? "1px solid var(--mantine-color-teal-5)"
        : "1px solid var(--mantine-color-teal-2)",
      backgroundColor: esActivo ? "var(--mantine-color-teal-light)" : "var(--mantine-color-body)",
      color: esActivo ? "var(--mantine-color-teal-8)" : undefined,
      "&:hover": { backgroundColor: "var(--mantine-color-teal-light)" },
    },
    label: { whiteSpace: "normal" as const, textAlign: "center" as const },
  });

  /** Altura útil del header (`.inner` del Navbar); el sidebar empieza debajo para que el borde vertical no quede “cortado” por el navbar. */
  const sidebarTopPx = 56;

  return (
    <div style={{ display: "flex", minHeight: "100vh", marginTop: "-50px", background: "var(--mantine-color-body)" }}>

      <Modal
        opened={procesoAEliminar !== null}
        onClose={() => { if (!eliminandoProceso) setProcesoAEliminar(null); }}
        title="Eliminar proceso"
        centered size="sm" radius="md"
        closeOnClickOutside={!eliminandoProceso}
        closeOnEscape={!eliminandoProceso}
        withCloseButton={!eliminandoProceso}
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Eliminar el proceso <strong>{procesoAEliminar?.proceso.tipo_proceso}</strong> de <strong>{procesoAEliminar?.nombrePrograma}</strong>?
            Se eliminarán el proceso y sus fases. Esta acción no se puede deshacer.
          </Text>
          {errorEliminarProceso && <Text size="sm" c="red" role="alert">{errorEliminarProceso}</Text>}
          <Group justify="flex-end">
            <Button variant="default" disabled={eliminandoProceso} onClick={() => setProcesoAEliminar(null)}>Cancelar</Button>
            <Button color="red" loading={eliminandoProceso} onClick={() => void eliminarProcesoDesdeAlertas()}>Eliminar proceso</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={alertaAEliminar !== null}
        onClose={() => { if (!eliminandoProceso) setAlertaAEliminar(null); }}
        title="Eliminar alerta"
        centered size="sm" radius="md"
        closeOnClickOutside={!eliminandoProceso}
        closeOnEscape={!eliminandoProceso}
        withCloseButton={!eliminandoProceso}
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Eliminar la alerta <strong>{alertaAEliminar?.tipo_proceso}</strong> de <strong>{alertaAEliminar?.nombre_programa}</strong>?
            Esta acción no se puede deshacer.
          </Text>
          {errorEliminarProceso && <Text size="sm" c="red" role="alert">{errorEliminarProceso}</Text>}
          <Group justify="flex-end">
            <Button variant="default" disabled={eliminandoProceso} onClick={() => setAlertaAEliminar(null)}>Cancelar</Button>
            <Button color="red" loading={eliminandoProceso} onClick={() => void eliminarAlerta()}>Eliminar alerta</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={filaEdicion !== null}
        onClose={() => {
          if (!savingTableDate) {
            setFilaEdicion(null);
            setDateEditError(null);
          }
        }}
        title={<Text fw={700}>Editar fechas</Text>}
        centered
        size="md"
        radius="md"
        closeOnClickOutside={!savingTableDate}
        closeOnEscape={!savingTableDate}
        withCloseButton={!savingTableDate}
      >
        <Stack gap="sm">
          <Group gap={8}>
            {filaEdicion && <Badge variant="light" color={TIPO_COLOR[filaEdicion.tipo] ?? "gray"}>{filaEdicion.tipo}</Badge>}
            <Text size="sm" fw={600}>{filaEdicion?.programName}</Text>
          </Group>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            {filaEdicion?.campos.map((c) => (
              <TextInput
                key={claveCampoFila(c)}
                type="date"
                label={c.label.charAt(0).toUpperCase() + c.label.slice(1)}
                value={filaValores[claveCampoFila(c)] ?? ""}
                onChange={(event) => {
                  const v = event.currentTarget.value;
                  setFilaValores((prev) => ({ ...prev, [claveCampoFila(c)]: v }));
                }}
                disabled={savingTableDate}
              />
            ))}
          </SimpleGrid>
          <Text size="xs" c="dimmed">Deja un campo vacío para quitar esa fecha. Solo se guardan las fechas que cambies.</Text>
          {dateEditError && <Text size="sm" c="red" role="alert">{dateEditError}</Text>}
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={savingTableDate}
              onClick={() => {
                setFilaEdicion(null);
                setDateEditError(null);
              }}
            >
              Cancelar
            </Button>
            <Button loading={savingTableDate} onClick={() => void guardarFila()}>
              Guardar cambios
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ── SIDEBAR ── */}
      <Box style={{
        position: "fixed",
        top: sidebarTopPx,
        bottom: 0,
        left: 0,
        width: `${sidebarW}px`,
        borderRight: "1px solid var(--mantine-color-default-border)",
        boxSizing: "border-box",
        padding: sidebarCollapsed ? "10px 6px 16px" : "16px 10px 20px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mantine-color-body)",
        zIndex: 50,
      }}>
        <Group justify="flex-end" mb={6} wrap="nowrap" gap={4} style={{ flexShrink: 0 }}>
          <Tooltip label={sidebarCollapsed ? "Mostrar menú" : "Ocultar menú"} withArrow>
            <ActionIcon
              variant="light"
              color="green"
              radius="xl"
              size="lg"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
            >
              {sidebarCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        {puedeGestionarProcesosMen ? (
          <Stack gap={8} style={{ flex: 1, minHeight: 0, overflow: "auto" }} align="stretch">
            {!sidebarCollapsed ? (
              <>
                {processesMenModulo === "procesos" && (
                  <Stack gap={0} pt={8} mt={2}>
                    <Group gap={8} px={8} pb={8}>
                      <ThemeIcon size={32} radius="xl" color="green" variant="light">
                        <IconChartBar size={18} />
                      </ThemeIcon>
                      <Text size="xs" fw={700} c="green" tt="uppercase">Panel MEN</Text>
                    </Group>
                    <Divider />
                    <NavLink label="Estadísticas generales" leftSection={<IconChartBar size={16} />} color="green"
                      active={navigationSection === "main"}
                      onClick={() => { setActiveParentSection(null); setActiveSection("main"); setPrograma("Todos"); setNivelAcademico("Todos"); }}
                      style={{ borderRadius: 8 }} />
                    <Divider mt={8} />
                    <Text size="xs" c="dimmed" fw={600} px={8} pt={8}>PROCESOS</Text>
                    <NavLink label="Alertas de procesos" leftSection={<IconBellRinging size={16} />} color="blue"
                      active={navigationSection === "alertas"} onClick={() => { setActiveParentSection(null); setActiveSection("alertas"); }}
                      style={{ borderRadius: 8 }} />
                    <NavLink label="Historial de procesos" leftSection={<IconHistory size={16} />} color="blue"
                      active={navigationSection === "historial"} onClick={() => { setActiveParentSection(null); setActiveSection("historial"); }}
                      style={{ borderRadius: 8 }} />
                    <Divider mt={8} />
                    <Text size="xs" c="dimmed" fw={600} px={8} pt={8}>MÓDULOS</Text>
                    <NavLink label="Comunicaciones MEN" leftSection={<IconMessageCircle size={16} />} color="teal"
                      onClick={() => { irAModuloMen("comunicaciones"); setPqrSeccion("activos"); }}
                      style={{ borderRadius: 8 }} />
                    <NavLink label="Tareas asignadas" leftSection={<IconList size={16} />} color="violet"
                      onClick={() => router.push("/processes-MEN/tasks")} style={{ borderRadius: 8 }} />
                    <NavLink label="Información del programa" leftSection={<IconArchive size={16} />} color="blue"
                      active={navigationSection === "informacion"}
                      onClick={irAInformacionPrograma} style={{ borderRadius: 8 }} />
                    <NavLink label="Buzón" leftSection={<IconMail size={16} />} color="blue"
                      active={navigationSection === "buzon"}
                      onClick={() => { setActiveParentSection(null); setActiveSection("buzon"); }}
                      style={{ borderRadius: 8 }} />
                  </Stack>
                )}

                {processesMenModulo === "comunicaciones" && (
                  <Stack gap={0} pt={8} mt={2} pb={8}>
                    <Group gap={8} px={8} pb={8}>
                      <ThemeIcon size={32} radius="xl" color="teal" variant="light">
                        <IconMessageCircle size={18} />
                      </ThemeIcon>
                      <Text size="xs" fw={700} c="teal" tt="uppercase">Comunicaciones MEN</Text>
                    </Group>
                    <Divider />
                    <Text size="xs" c="dimmed" fw={600} px={8} pt={8}>PQR</Text>
                    <NavLink label="Agregar PQR" leftSection={<IconPlus size={16} />} color="teal"
                      active={pqrSeccion === "agregar"} onClick={() => setPqrSeccion("agregar")}
                      style={{ borderRadius: 8 }} />
                    <NavLink label="PQRs activos" leftSection={<IconList size={16} />} color="teal"
                      active={pqrSeccion === "activos"} onClick={() => setPqrSeccion("activos")}
                      rightSection={pqrs.filter((p) => !p.cerrado).length > 0 ? (
                        <Badge size="sm" color="teal" variant="filled" circle>
                          {pqrs.filter((p) => !p.cerrado).length}
                        </Badge>
                      ) : null}
                      style={{ borderRadius: 8 }} />
                    <NavLink label="Historial PQR" leftSection={<IconArchive size={16} />} color="teal"
                      active={pqrSeccion === "historial"} onClick={() => setPqrSeccion("historial")}
                      style={{ borderRadius: 8 }} />
                    <Divider mt={8} />
                    <NavLink label="Gestión de procesos MEN" leftSection={<IconChartBar size={16} />} color="blue"
                      onClick={() => irAModuloMen("procesos")} style={{ borderRadius: 8 }} />
                  </Stack>
                )}
              </>
            ) : (
              /* Menú contraído: mismos íconos y grupos que el menú abierto, alineados arriba */
              <Stack gap={4} align="center" pt={4}>
                {(processesMenModulo === "procesos"
                  ? [
                      { label: "Estadísticas generales", icon: IconChartBar, color: "green", activo: navigationSection === "main", onClick: () => { setActiveParentSection(null); setActiveSection("main"); setPrograma("Todos"); setNivelAcademico("Todos"); } },
                      "divider",
                      { label: "Alertas de procesos", icon: IconBellRinging, color: "blue", activo: navigationSection === "alertas", onClick: () => { setActiveParentSection(null); setActiveSection("alertas"); } },
                      { label: "Historial de procesos", icon: IconHistory, color: "blue", activo: navigationSection === "historial", onClick: () => { setActiveParentSection(null); setActiveSection("historial"); } },
                      "divider",
                      { label: "Comunicaciones MEN", icon: IconMessageCircle, color: "teal", activo: false, onClick: () => { irAModuloMen("comunicaciones"); setPqrSeccion("activos"); } },
                      { label: "Tareas asignadas", icon: IconList, color: "violet", activo: false, onClick: () => router.push("/processes-MEN/tasks") },
                      { label: "Información del programa", icon: IconArchive, color: "blue", activo: navigationSection === "informacion", onClick: irAInformacionPrograma },
                      { label: "Buzón", icon: IconMail, color: "blue", activo: navigationSection === "buzon", onClick: () => { setActiveParentSection(null); setActiveSection("buzon"); } },
                    ]
                  : [
                      { label: "Agregar PQR", icon: IconPlus, color: "teal", activo: pqrSeccion === "agregar", onClick: () => setPqrSeccion("agregar") },
                      { label: "PQRs activos", icon: IconList, color: "teal", activo: pqrSeccion === "activos", onClick: () => setPqrSeccion("activos") },
                      { label: "Historial PQR", icon: IconArchive, color: "teal", activo: pqrSeccion === "historial", onClick: () => setPqrSeccion("historial") },
                      "divider",
                      { label: "Gestión de procesos MEN", icon: IconChartBar, color: "green", activo: false, onClick: () => irAModuloMen("procesos") },
                    ]
                ).map((item, idx) =>
                  typeof item === "string" ? (
                    <Divider key={`div-${idx}`} w={28} my={6} />
                  ) : (
                    <Tooltip key={item.label} label={item.label} position="right" withArrow>
                      <ActionIcon
                        size={40}
                        radius="md"
                        variant={item.activo ? "light" : "subtle"}
                        color={item.activo ? item.color : "gray"}
                        aria-label={item.label}
                        onClick={item.onClick}
                      >
                        <item.icon size={20} stroke={1.6} />
                      </ActionIcon>
                    </Tooltip>
                  ),
                )}
              </Stack>
            )}
          </Stack>
        ) : (
          <>
            {!sidebarCollapsed && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {loadingFilters ? (
                  <Loader size="sm" mx="auto" />
                ) : (
                  <>
                    <Select label="Facultad" data={opcionesFacultad} value={facultad}
                      onChange={handleFacultadChange} searchable={false} styles={selectorStyle} />
                    {facultad !== "Todos" && (
                      <>
                        <Select label="Programa" data={opcionesPrograma} value={programa}
                          onChange={(v) => {
                            const n = v ?? "Todos";
                            if (activeSection === "informacion" && n !== "Todos") {
                              router.push(processesMenRoutes.program(n));
                              return;
                            }
                            setPrograma(n);
                            if (n !== "Todos") setNivelAcademico("Todos");
                          }}
                          searchable={false} styles={selectorStyle} />
                        {programa === "Todos" && (
                          <Select label="Nivel académico" data={opcionesNivelAcademico} value={nivelAcademico}
                            onChange={(v) => setNivelAcademico(v ?? "Todos")} searchable={false} styles={selectorStyle} />
                        )}
                        <NavLink label="Información del programa" leftSection={<IconArchive size={16} />} color="blue"
                          active={activeSection === "informacion"}
                          onClick={irAInformacionPrograma} style={{ borderRadius: 8, marginTop: 8 }} />
                      </>
                    )}
                  </>
                )}
              </div>
            )}
            {sidebarCollapsed && (
              <Text size="xs" c="dimmed" ta="center" mt="md">
                Pulsa «›» para ver filtros
              </Text>
            )}
          </>
        )}
      </Box>

      {/* ── Modal agregar proceso ── */}
      <AgregarProcesoModal
        key={
          agregarProcesoPrefill
            ? agregarProcesoPrefill.soloCrearPrograma
              ? "solo-programa"
              : agregarProcesoPrefill.modoProcesoPrimeraVezTipo
                ? "primera-vez-tipo"
                : agregarProcesoPrefill.soloReformaCurricular
                  ? "solo-reforma"
                  : agregarProcesoPrefill.soloTipo
                    ? `solo-${agregarProcesoPrefill.tipo ?? ""}`
                    : `${agregarProcesoPrefill.programId ?? ""}-${agregarProcesoPrefill.tipo ?? ""}-${agregarProcesoPrefill.excluirNuevo ? "ex" : ""}-${agregarProcesoPrefill.reminderRowId ?? "norow"}`
            : "agregar-libre"
        }
        opened={agregarProcesoOpen}
        onClose={() => { setAgregarProcesoOpen(false); setAgregarProcesoPrefill(null); }}
        programas={programas}
        facultades={facultades}
        procesos={procesos}
        onCreated={handleProcesoCreado}
        onNavigateToGestion={irAGestionarProcesoDesdeModal}
        prefillDesdeRecordatorio={agregarProcesoPrefill}
      />

      <Modal
        opened={modalListaProgramas !== null}
        onClose={() => setModalListaProgramas(null)}
        centered
        radius="lg"
        size="lg"
        padding={0}
        withCloseButton={false}
      >
        {modalListaProgramas && (() => {
          const color = modalListaProgramas.color ?? "blue";
          return (
            <>
              <Box px="lg" py="md" style={{ backgroundColor: `var(--mantine-color-${color}-light)`, borderBottom: `1px solid var(--mantine-color-${color}-2)` }}>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Box>
                    <Text size="xs" fw={800} tt="uppercase" c={`${color}.8`} style={{ letterSpacing: 0.4 }}>Estadísticas generales</Text>
                    <Text fw={700} size="lg" lh={1.25} mt={2}>{modalListaProgramas.titulo}</Text>
                    <Badge size="sm" variant="white" color={color} tt="none" mt={6}>
                      {modalListaProgramas.lista.length} {modalListaProgramas.lista.length === 1 ? "programa" : "programas"}
                    </Badge>
                  </Box>
                  <ActionIcon variant="subtle" color="gray" radius="xl" aria-label="Cerrar" onClick={() => setModalListaProgramas(null)}>
                    <IconX size={18} />
                  </ActionIcon>
                </Group>
              </Box>
              <Box p="md">
                {modalListaProgramas.lista.length === 0 ? (
                  <Stack align="center" gap={6} py="lg">
                    <ThemeIcon size={44} radius="xl" variant="light" color="gray"><IconSchool size={22} /></ThemeIcon>
                    <Text size="sm" c="dimmed">No hay programas en esta categoría con el filtro actual.</Text>
                  </Stack>
                ) : (
                  <ScrollArea.Autosize mah="60vh">
                    <Stack gap="xs">
                      {modalListaProgramas.lista.map((p) => (
                        <UnstyledButton
                          key={p._id}
                          className="men-programa-lista"
                          style={{ borderRadius: 10 }}
                          onClick={() => {
                            router.push(processesMenRoutes.program(p._id));
                            setModalListaProgramas(null);
                          }}
                        >
                          <Paper withBorder radius="md" p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${color}-3)`, backgroundColor: "transparent" }}>
                            <Group justify="space-between" wrap="nowrap" gap="sm">
                              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                                <ThemeIcon size={36} radius="xl" variant="light" color={color} style={{ flexShrink: 0 }}>
                                  <IconSchool size={18} />
                                </ThemeIcon>
                                <Box style={{ minWidth: 0 }}>
                                  <Text fw={700} size="sm">{p.nombre}</Text>
                                  <Text size="xs" c="dimmed">{lineasAuxPrograma(p).join(" · ")}</Text>
                                </Box>
                              </Group>
                              <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                                {p.estado && (
                                  <Badge size="sm" variant="dot" color={p.estado === "Activo" ? "teal" : "gray"} tt="none">{p.estado} ante MEN</Badge>
                                )}
                                <Text size="xs" c={`${color}.7`} fw={700}>Ver ficha</Text>
                                <IconChevronRight size={16} color={`var(--mantine-color-${color}-7)`} />
                              </Group>
                            </Group>
                          </Paper>
                        </UnstyledButton>
                      ))}
                    </Stack>
                  </ScrollArea.Autosize>
                )}
              </Box>
              <style>{`.men-programa-lista:hover > div { background-color: var(--mantine-color-default-hover) !important; }`}</style>
            </>
          );
        })()}
      </Modal>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div style={{ marginLeft: `${sidebarW + 1}px`, flex: 1, minWidth: 0, overflow: "auto", padding: "24px", paddingTop: "30px", minHeight: "calc(100vh - 56px)" }}>
        <Group justify="space-between" align="center" mb="lg" wrap="wrap" gap="md">
          <Group gap={10}>
            <Tooltip
              label={backButtonLabel}
              withArrow
            >
              <ActionIcon
                variant="subtle"
                onClick={() => {
                  if (processesMenModulo === "comunicaciones") {
                    setActiveSection("main");
                    setPrograma("Todos");
                    setNivelAcademico("Todos");
                    irAModuloMen("procesos");
                    return;
                  }
                  if (activeParentSection && activeParentSection !== "informacion") {
                    setActiveSection(activeParentSection);
                    setActiveParentSection(null);
                    return;
                  }
                  router.push("/dashboard?gestionProcesos=1");
                }}
                aria-label={backButtonLabel}
              >
                <IconArrowLeft size={18} />
              </ActionIcon>
            </Tooltip>
            <ThemeIcon size={42} radius="xl" color={processesMenModulo === "comunicaciones" ? "teal" : "green"} variant="light">
              {processesMenModulo === "comunicaciones" ? <IconMessageCircle size={22} /> : <IconChartBar size={22} />}
            </ThemeIcon>
            <Box>
              <Title order={3} lh={1.2}>{processesMenModulo === "comunicaciones" ? "Comunicaciones MEN" : "Procesos de calidad MEN"}</Title>
              <Text size="xs" c="dimmed" mt={2}>
                {processesMenModulo === "comunicaciones"
                  ? "Registra y consulta las comunicaciones relacionadas con el Ministerio de Educación."
                  : "Gestiona y da seguimiento a los procesos de calidad ante el Ministerio de Educación."}
              </Text>
            </Box>
          </Group>
        </Group>
        <Divider mb="lg" />
        {puedeGestionarProcesosMen && (
          <>
            {processesMenModulo === "comunicaciones" && (
              <Stack gap="md">
                {(() => {
                  const activos = pqrs.filter((x) => !x.cerrado);
                  return (
                    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
                      {[
                        { key: "activos", label: "PQRs activos", detalle: "en seguimiento", valor: activos.length, color: "teal", icon: IconInbox, onClick: () => setPqrSeccion("activos"), activo: pqrSeccion === "activos" },
                        { key: "respuesta", label: "Sin respuesta", detalle: "activos sin fecha de respuesta", valor: activos.filter((x) => !x.fecha_respuesta).length, color: "orange", icon: IconClock, onClick: () => setPqrSeccion("activos"), activo: false },
                        { key: "programa", label: "Ligados a programa", detalle: "de los activos", valor: activos.filter((x) => !!x.programa_id).length, color: "blue", icon: IconSchool, onClick: () => setPqrSeccion("activos"), activo: false },
                        { key: "historial", label: "Cerrados", detalle: "en el historial", valor: pqrs.filter((x) => x.cerrado).length, color: "gray", icon: IconArchive, onClick: () => setPqrSeccion("historial"), activo: pqrSeccion === "historial" },
                      ].map((x) => (
                        <Paper
                          key={x.key}
                          radius="lg"
                          p="md"
                          tabIndex={0}
                          role="button"
                          className="men-tile"
                          onClick={x.onClick}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              x.onClick();
                            }
                          }}
                          style={{
                            cursor: "pointer",
                            backgroundColor: `var(--mantine-color-${x.color}-light)`,
                            border: `2px solid ${x.activo ? `var(--mantine-color-${x.color}-5)` : "transparent"}`,
                          }}
                        >
                          <Group justify="space-between" wrap="nowrap" align="flex-start" gap={6}>
                            <Text fw={900} size="1.9rem" lh={1} c={`${x.color}.8`}>{x.valor}</Text>
                            <ThemeIcon size={34} radius="xl" variant="white" color={x.color}><x.icon size={18} /></ThemeIcon>
                          </Group>
                          <Text size="sm" fw={700} mt={8}>{x.label}</Text>
                          <Text size="xs" c="dimmed">{x.detalle}</Text>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  );
                })()}
                <style>{`.men-tile { transition: transform 120ms ease, box-shadow 120ms ease; } .men-tile:hover { transform: translateY(-2px); box-shadow: var(--mantine-shadow-sm); }`}</style>
                <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                  <SeccionTitulo
                    icon={pqrSeccion === "agregar" ? IconPlus : pqrSeccion === "historial" ? IconArchive : IconInbox}
                    color={pqrSeccion === "historial" ? "gray" : "teal"}
                    titulo={pqrSeccion === "agregar" ? "Agregar PQR" : pqrSeccion === "historial" ? "Historial de PQR" : "PQRs activos"}
                    descripcion={pqrSeccion === "agregar"
                      ? "Registra una nueva solicitud ante el Ministerio."
                      : pqrSeccion === "historial"
                        ? "Solicitudes cerradas, solo lectura."
                        : "Solicitudes en seguimiento. Haz clic en un dato para editarlo."}
                  />
                  <Group gap="xs">
                    {pqrSeccion !== "agregar" && (
                      <Button variant="filled" color="teal" radius="md" leftSection={<IconPlus size={15} />} onClick={() => setPqrSeccion("agregar")}>
                        Nuevo PQR
                      </Button>
                    )}
                    <Button variant="light" color="teal" radius="md" leftSection={<IconFileSpreadsheet size={15} />} onClick={() => setImportarPqrOpen(true)}>
                      Importar desde Excel
                    </Button>
                  </Group>
                </Group>
                {importarPqrOpen && <PQRImportModal
                  opened={importarPqrOpen}
                  onClose={() => setImportarPqrOpen(false)}
                  programas={programas}
                  onImported={importados => {
                    setPqrs(previous => [...importados, ...previous.filter(pqr => !importados.some(item => item._id === pqr._id))]);
                    setPqrSeccion("activos");
                    void cargarPQRs();
                  }}
                />}
                <Box>
                  {pqrSeccion === "agregar" && (
                    <Paper withBorder radius="lg" p="lg">
                      <PQRAgregarForm programas={programas} onCreado={handlePQRCreado} />
                    </Paper>
                  )}
                  {pqrSeccion === "activos" && (
                    <PQRActivosView
                      pqrs={pqrsOrdenados}
                      programas={programas}
                      onUpdate={handlePQRActualizado}
                      onCerrar={(id) => { void handlePQRCerrado(id); }}
                    />
                  )}
                  {pqrSeccion === "historial" && (
                    <PQRHistorialView pqrs={pqrsOrdenados} programas={programas} />
                  )}
                </Box>
              </Stack>
            )}

            {processesMenModulo === "procesos" && (
            <>
            {activeSection === "main" && (
              <Box mb="md">
                <Text fw={700} size="xl" lh={1.2}>Estadísticas generales</Text>
                <Text size="sm" c="dimmed" mt={4}>
                  Consulta el estado general de los procesos de calidad y sus programas asociados.
                </Text>
              </Box>
            )}
            {activeSection === "informacion" && (
              <Box mb="md">
                <Text fw={700} size="xl" lh={1.2}>
                  {activeParentSection === "alertas" ? "Gestión" : "Información del programa"}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {activeParentSection === "alertas"
                    ? "Gestiona el proceso seleccionado."
                    : "Consulta la información y el estado de los procesos de cada programa."}
                </Text>
              </Box>
            )}
            {(activeSection === "main" || activeSection === "informacion") && activeParentSection !== "alertas" && !loadingFilters && (
              activeSection === "informacion" ? (
                <Paper withBorder radius="lg" p="md" mb="md">
                  <FiltrosEncabezado
                    hayFiltros={facultad !== "Todos" || programa !== "Todos"}
                    onLimpiar={() => {
                      setFacultad("Todos");
                      setPrograma("Todos");
                      setNivelAcademico("Todos");
                    }}
                  />
                  <Group gap="sm" wrap="wrap" align="flex-end">
                    <Select
                      label="Facultad"
                      placeholder="Todas las facultades"
                      data={opcionesFacultad}
                      value={facultad}
                      onChange={handleFacultadChange}
                      clearable
                      searchable={false}
                      w={300}
                      styles={selectorStyleFilters}
                    />
                    <Select
                      label="Ir a la ficha de un programa"
                      leftSection={<IconSearch size={15} />}
                      placeholder="Buscar programa..."
                      data={opcionesPrograma}
                      value={programa}
                      onChange={(v) => {
                        const n = v ?? "Todos";
                        if (activeSection === "informacion" && n !== "Todos") {
                          router.push(processesMenRoutes.program(n));
                          return;
                        }
                        setPrograma(n);
                        if (n !== "Todos") setNivelAcademico("Todos");
                      }}
                      clearable
                      searchable
                      w={340}
                    />
                  </Group>
                </Paper>
              ) : (
                <Paper withBorder radius="lg" p="md" mb="lg">
                  <FiltrosEncabezado
                    hayFiltros={facultad !== "Todos" || programa !== "Todos" || nivelAcademico !== "Todos" || tipoProceso !== "Todos" || subtipoFiltro !== "Todos"}
                    onLimpiar={() => {
                      setFacultad("Todos");
                      setPrograma("Todos");
                      setNivelAcademico("Todos");
                      setTipoProceso("Todos");
                      setSubtipoFiltro("Todos");
                    }}
                  />
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 5 }} spacing="sm">
                    <Select
                      label="Facultad"
                      data={opcionesFacultad}
                      value={facultad}
                      onChange={handleFacultadChange}
                      searchable={false}
                      styles={selectorStyleFilters}
                    />
                    <Select
                      label="Programa"
                      data={opcionesPrograma}
                      value={programa}
                      searchable
                      onChange={(v) => {
                        const n = v ?? "Todos";
                        setPrograma(n);
                        if (n !== "Todos") setNivelAcademico("Todos");
                      }}
                      styles={selectorStyleFilters}
                    />
                    {activeSection === "main" && (
                      <>
                        <Select
                          label="Nivel académico"
                          data={opcionesNivelAcademico}
                          value={nivelAcademico}
                          onChange={(v) => setNivelAcademico(v ?? "Todos")}
                          searchable={false}
                          styles={selectorStyleFilters}
                        />
                        <Select
                          label="Tipo de proceso"
                          data={opcionesTipoProceso}
                          value={tipoProceso}
                          onChange={(v) => {
                            setTipoProceso(v ?? "Todos");
                            setSubtipoFiltro("Todos");
                          }}
                          searchable={false}
                          styles={selectorStyleFilters}
                        />
                        <Select
                          label="Subtipo"
                          data={opcionesSubtipoFiltroData}
                          value={subtipoFiltro}
                          onChange={(v) => setSubtipoFiltro(v ?? "Todos")}
                          searchable={false}
                          styles={selectorStyleFiltersSubtipo}
                        />
                      </>
                    )}
                  </SimpleGrid>
                </Paper>
              )
            )}

            {activeSection === "main" && loadingFilters && (
              <Loader size="sm" mx="auto" display="block" my="xl" />
            )}

            {(activeSection === "main" || activeSection === "informacion") && !loadingFilters && (
            <>
            {activeSection === "main" && (
              <Stack gap="xl" mb="xl">
                <Box>
                  <SeccionTitulo
                    icon={IconSchool}
                    color="blue"
                    titulo="Programas y registro calificado"
                    descripcion="Haz clic en un indicador para ver el listado de programas."
                  />
                  <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 5 }} spacing="md">
                    {[
                      { label: "Programas vigentes", valor: totalVigentes, lista: listaRcVigente, titulo: "Programas con RC vigente", color: "teal", icon: IconCircleCheck },
                      { label: "Programas inactivos", valor: totalSinRcVigente, lista: listaSinRcVigente, titulo: "Programas sin RC vigente", color: "red", icon: IconCircleX },
                      { label: "En modificación", valor: listaProgEnReforma.length, lista: listaProgEnReforma, titulo: "Programas en proceso de modificación", color: "orange", icon: IconEdit },
                      { label: "Con RC de oficio", valor: totalProgRCOficio, lista: listaProgRcOficio, titulo: "Programas con RC de oficio vigente", color: "cyan", icon: IconFileCertificate },
                      { label: "Total registrados", valor: totalProgramas, lista: programasFiltradosCompleto, titulo: "Programas registrados", color: "blue", icon: IconSchool },
                    ].map((c) => (
                      <StatTile
                        key={c.label}
                        label={c.label}
                        value={c.valor}
                        color={c.color}
                        icon={c.icon}
                        onOpen={() => setModalListaProgramas({ titulo: c.titulo, lista: c.lista, color: c.color })}
                      />
                    ))}
                  </SimpleGrid>
                </Box>

                <Box>
                  <SeccionTitulo
                    icon={IconAward}
                    color="violet"
                    titulo="Acreditación de alta calidad"
                    descripcion="Estado de acreditación voluntaria y planes de mejoramiento."
                  />
                  <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
                    {[
                      { label: "Acreditados", valor: totalAcreditados, lista: listaAvVigente, titulo: "Programas con AV vigente", color: "violet", icon: IconAward },
                      { label: "% acreditados", valor: `${pctAcreditados}%`, lista: listaAvVigente, titulo: "Programas con AV vigente", color: "violet", icon: IconPercentage },
                      { label: "Acreditables", valor: totalAcreditables, lista: listaAcreditables, titulo: "Programas marcados como acreditables", color: "grape", icon: IconCertificate },
                      { label: "% acreditables", valor: `${pctAcreditables}%`, lista: listaAcreditables, titulo: "Programas marcados como acreditables", color: "grape", icon: IconPercentage },
                      { label: "No acreditados", valor: totalNoAcreditados, lista: listaNoAcreditados, titulo: "Programas sin AV vigente", color: "gray", icon: IconCircleX },
                      { label: "En plan de mejoramiento", valor: totalProgConPm, lista: listaProgConPm, titulo: "Programas con plan de mejoramiento activo", color: "indigo", icon: IconClipboardList },
                    ].map((c) => (
                      <StatTile
                        key={c.label}
                        label={c.label}
                        value={c.valor}
                        color={c.color}
                        icon={c.icon}
                        onOpen={() => setModalListaProgramas({ titulo: c.titulo, lista: c.lista, color: c.color })}
                      />
                    ))}
                    <Box style={{ gridColumn: "span 2" }}>
                      <StatTile
                        label="Mínimo de programas para acreditación institucional"
                        value={minimoProgramasAcreditacion}
                        color="violet"
                        icon={IconTarget}
                        hint={`Fórmula: (${totalAcreditados} acreditados + ${totalAcreditables} acreditables) × 30%`}
                        onOpen={() => setModalListaProgramas({ titulo: "Programas base para mínimo de acreditación", lista: listaMinimoAcreditacion, color: "violet" })}
                      />
                    </Box>
                  </SimpleGrid>
                </Box>
              </Stack>
            )}

            {/* Vista de información del programa */}
            {activeSection === "informacion" && (
              <>
                {facultad === "Todos" && programa === "Todos" && (
                  <Paper withBorder radius="lg" p="lg">
                    <Group justify="space-between" align="center" mb="md" wrap="wrap">
                      <SeccionTitulo
                        icon={IconBuildingCommunity}
                        color="green"
                        titulo="Selecciona una facultad"
                        descripcion="Elige una facultad para ver sus programas, o busca un programa arriba."
                      />
                      <Badge size="lg" variant="light" color="green" tt="none">{facultades.length} facultades</Badge>
                    </Group>

                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                      {facultades.map((fac) => {
                        const count = programasDelModulo.filter((p) => p.dep_code_facultad === fac.dep_code).length;
                        const seleccionar = () => {
                          setFacultad(fac.name);
                          setPrograma("Todos");
                          setNivelAcademico("Todos");
                        };
                        return (
                          <Paper
                            key={fac.dep_code}
                            withBorder
                            radius="md"
                            p="md"
                            tabIndex={0}
                            role="button"
                            className="men-tile"
                            onClick={seleccionar}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                seleccionar();
                              }
                            }}
                            style={{ cursor: "pointer", borderTop: "3px solid var(--mantine-color-green-4)" }}
                          >
                            <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                              <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                                <ThemeIcon size={40} radius="xl" variant="light" color="green" style={{ flexShrink: 0 }}>
                                  <IconBuildingCommunity size={20} />
                                </ThemeIcon>
                                <Box style={{ minWidth: 0 }}>
                                  <Text fw={700} size="sm" lh={1.3}>{nombreLegible(fac.name)}</Text>
                                  <Text size="xs" c="dimmed" mt={4}>{count} {count === 1 ? "programa" : "programas"}</Text>
                                </Box>
                              </Group>
                              <IconChevronRight size={18} color="var(--mantine-color-green-6)" style={{ flexShrink: 0, marginTop: 10 }} />
                            </Group>
                          </Paper>
                        );
                      })}
                    </SimpleGrid>
                    <style>{`.men-tile { transition: transform 120ms ease, box-shadow 120ms ease; } .men-tile:hover { transform: translateY(-2px); box-shadow: var(--mantine-shadow-sm); }`}</style>
                  </Paper>
                )}

                {facultad !== "Todos" && programa === "Todos" && (
                  <Paper withBorder radius="lg" p="lg">
                    <Group justify="space-between" align="center" mb="md" wrap="wrap">
                      <Group gap="sm" align="center" wrap="nowrap">
                        <ActionIcon
                          variant="light"
                          color="green"
                          radius="xl"
                          aria-label="Cambiar facultad"
                          onClick={() => {
                            setFacultad("Todos");
                            setPrograma("Todos");
                            setNivelAcademico("Todos");
                          }}
                        >
                          <IconChevronLeft size={16} />
                        </ActionIcon>
                        <Box>
                          <Text fw={700} size="lg" lh={1.2}>{nombreLegible(facultad)}</Text>
                          <Text size="xs" c="dimmed">Selecciona un programa para ver su ficha y sus procesos.</Text>
                        </Box>
                      </Group>
                      <Badge size="lg" variant="light" color="green" tt="none">{programasFiltrados.length} programas</Badge>
                    </Group>

                    {programasFiltrados.length === 0 ? (
                      <Text c="dimmed">No hay programas para esta facultad con el filtro actual.</Text>
                    ) : (
                      <Table highlightOnHover verticalSpacing="sm">
                        <Table.Thead>
                          <Table.Tr style={theadRowStyle}>
                            <Table.Th><Text size="xs" fw={700} style={thTextStyle}>Programa</Text></Table.Th>
                            <Table.Th w={160}><Text size="xs" fw={700} style={thTextStyle}>Estado MEN</Text></Table.Th>
                            <Table.Th w={140} />
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {programasOrganizadosFacultad.map((grupo) => (
                            <Fragment key={grupo.titulo}>
                              <Table.Tr style={{ backgroundColor: "var(--mantine-color-green-light)" }}>
                                <Table.Td colSpan={3}>
                                  <Text size="xs" fw={800} tt="uppercase" c="green.8" style={{ letterSpacing: 0.4 }}>{grupo.titulo}</Text>
                                </Table.Td>
                              </Table.Tr>
                              {grupo.lista.map((p) => (
                                <Table.Tr key={p._id}>
                                  <Table.Td>
                                    <Anchor
                                      href={processesMenRoutes.program(p._id)}
                                      fw={600}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        router.push(processesMenRoutes.program(p._id));
                                      }}
                                    >
                                      {p.nombre}
                                    </Anchor>
                                    {lineasAuxPrograma(p).map((ln, idx) => (
                                      <Text key={idx} size="xs" c="dimmed">{ln}</Text>
                                    ))}
                                  </Table.Td>
                                  <Table.Td>
                                    {p.estado ? (
                                      <Badge variant="dot" color={p.estado === "Activo" ? "teal" : "gray"} tt="none">{p.estado} ante MEN</Badge>
                                    ) : <Text size="sm" c="dimmed">—</Text>}
                                  </Table.Td>
                                  <Table.Td>
                                    <Button
                                      size="xs"
                                      variant="light"
                                      color="green"
                                      radius="md"
                                      rightSection={<IconChevronRight size={14} />}
                                      onClick={() => router.push(processesMenRoutes.program(p._id))}
                                    >
                                      Ver ficha
                                    </Button>
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Fragment>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                  </Paper>
                )}

                {programa !== "Todos" && (() => {
                  const progObj = programaDesdeFiltroId(programas, programa);
                  if (!progObj) return null;
                  const progCode = programCodeKey(progObj);
                  const procesosDelProg = procesos.filter(p => p.program_code === progCode);
                  const rcActivoEncabezado =
                    (tipoProceso === "Todos" || tipoProceso === "Registro calificado")
                      ? procesoRcActivoDePrograma(procesosDelProg, progCode)
                      : undefined;
                  if (loadingFases) return <Loader size="sm" mx="auto" display="block" my="lg" />;
                  return (
                    <>
                      <Box mb="lg">
                        {activeParentSection !== "alertas" && (
                          <Tooltip label="Volver a estadísticas" withArrow>
                            <ActionIcon
                              variant="default"
                              size="sm"
                              onClick={() => { setActiveParentSection(null); setActiveSection("main"); }}
                              aria-label="Volver a estadísticas"
                            >
                              <IconChevronLeft size={16} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <Paper withBorder radius="lg" p="md" mt="xs">
                          <Group justify="space-between" align="center" wrap="wrap" gap="md">
                            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                              <ThemeIcon size={44} radius="xl" variant="light" color="green" style={{ flexShrink: 0 }}>
                                <IconSchool size={22} />
                              </ThemeIcon>
                              <Box style={{ minWidth: 0 }}>
                                <Text fw={800} size="xl" lh={1.2}>{progObj.nombre}</Text>
                                <Text size="xs" c="dimmed" mt={2}>{lineasAuxPrograma(progObj).join(" · ")}</Text>
                              </Box>
                            </Group>
                            <Group gap="xs" wrap="wrap">
                              <Badge size="lg" variant="light" color={progObj.estado === "Activo" ? "teal" : "gray"} tt="none"
                                leftSection={progObj.estado === "Activo" ? <IconCircleCheck size={14} /> : null}>
                                {progObj.estado === "Activo" ? "Activo ante el MEN" : "Inactivo ante el MEN"}
                              </Badge>
                              {rcActivoEncabezado?.subtipo ? (
                                <Badge size="lg" variant="outline" color="gray" tt="none"
                                  styles={stylesSubtipoBadgeTabla(rcActivoEncabezado.subtipo)}>
                                  RC · {etiquetaSubtipoCompacta(rcActivoEncabezado.subtipo)}
                                </Badge>
                              ) : null}
                              <Button size="sm" variant="light" color="green" radius="md" rightSection={<IconChevronRight size={14} />}
                                onClick={() => router.push(processesMenRoutes.program(progObj._id))}>
                                Ver ficha del programa
                              </Button>
                            </Group>
                          </Group>
                        </Paper>
                      </Box>
                      {(() => {
                        const vistaPm = tipoProceso === "Plan de mejoramiento";
                        const mostrarRc = !vistaPm && (tipoProceso === "Todos" || tipoProceso === "Registro calificado");
                        const mostrarAv = !vistaPm && (tipoProceso === "Todos" || tipoProceso === "Acreditación voluntaria");
                        const mostrarAe = !vistaPm && (tipoProceso === "Todos" || tipoProceso === "Autoevaluación");
                        const rc = mostrarRc
                          ? procesoRcActivoDePrograma(procesosDelProg, progCode)
                          : undefined;
                        const av = mostrarAv ? procesosDelProg.find((p) => p.tipo_proceso === "AV") : undefined;
                        const ae = mostrarAe ? procesosDelProg.find((p) => p.tipo_proceso === "AE") : undefined;
                        const cardProps = (proc: (typeof procesosDelProg)[number]) => ({
                          proceso: proc,
                          programa: progObj,
                          fases: fases.filter((f) => mismoId(f.proceso_id, proc._id)),
                          todosProgramas: programas,
                          onUpdateProceso: (updated: (typeof procesos)[number]) =>
                            setProcesos((prev) => prev.map((p) => (p._id === updated._id ? updated : p))),
                          onUpdateFases: (updated: Phase[]) =>
                            setFases((prev) => [...prev.filter((f) => !mismoId(f.proceso_id, proc._id)), ...updated]),
                          onUpdatePrograma: (updated: Program) => {
                            setProgramas((prev) => prev.map((p) => (p._id === updated._id ? updated : p)));
                          },
                          onRefreshProcesos: async (programCode: string) => {
                            const res = await axios.get(
                              `${process.env.NEXT_PUBLIC_API_URL}/processes?program_code=${programCode}`,
                            );
                            const nuevos: Process[] = Array.isArray(res.data) ? res.data : [];
                            setProcesos((prev) => [...prev.filter((p) => p.program_code !== programCode), ...nuevos]);
                          },
                        });
                        return (
                          <>
                            {rc ? (
                              <Box key={rc._id} id={`proceso-detalle-${rc._id}`} style={{ scrollMarginTop: 96 }}>
                                <ProcesoDetalleCard {...cardProps(rc)} />
                              </Box>
                            ) : null}
                            {av ? (
                              <Box key={av._id} id={`proceso-detalle-${av._id}`} style={{ scrollMarginTop: 96 }}>
                                <ProcesoDetalleCard {...cardProps(av)} />
                              </Box>
                            ) : null}
                            {ae ? (
                              <Box key={ae._id} id={`proceso-detalle-${ae._id}`} style={{ scrollMarginTop: 96 }}>
                                <ProcesoDetalleCard {...cardProps(ae)} />
                              </Box>
                            ) : null}
                          </>
                        );
                      })()}
                      {tipoProceso === "Plan de mejoramiento"
                        ? procesosDelProg.filter(p => p.tipo_proceso === "PM").map(proc => (
                          <Box key={proc._id} id={`proceso-detalle-${proc._id}`} style={{ scrollMarginTop: 96 }}>
                            <ProcesoDetalleCard
                              proceso={proc}
                              programa={progObj}
                              fases={fases.filter((f) => mismoId(f.proceso_id, proc._id))}
                              todosProgramas={programas}
                              onUpdateProceso={updated => setProcesos(prev => prev.map(p => p._id === updated._id ? updated : p))}
                              onUpdateFases={updated =>
                                setFases((prev) => [...prev.filter((f) => !mismoId(f.proceso_id, proc._id)), ...updated])
                              }
                              onUpdatePrograma={updated => {
                                setProgramas(prev => prev.map(p => p._id === updated._id ? updated : p));
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
                          </Box>
                        ))
                        : null}
                    </>
                  );
                })()}
              </>
            )}

            {/* Vista por facultad */}
            {activeSection === "main" && (programa !== "Todos" || facultad !== "Todos") && (
              <>
                <BarTable
                  title="Estado de fases por programa — Registro calificado"
                  data={barRegistroPorPrograma}
                  tipoProceso="RC"
                  programas={programasFiltradosCompleto}
                  procesos={procesos}
                />
                <BarTable
                  title="Estado de fases por programa — Acreditación voluntaria"
                  data={barAcreditacionPorPrograma}
                  tipoProceso="AV"
                  programas={programasFiltradosCompleto}
                  procesos={procesos}
                />
              </>
            )}

            {/* Vista general: barras */}
            {activeSection === "main" && facultad === "Todos" && programa === "Todos" && <>
              {(tipoProceso === "Todos" || tipoProceso === "Registro calificado") && (
                <BarTable
                  title="Estado general de fases — Registro calificado"
                  data={barRegistro}
                  tipoProceso="RC"
                  programas={programasFiltradosCompleto}
                  procesos={procesos}
                />
              )}
              {(tipoProceso === "Todos" || tipoProceso === "Acreditación voluntaria") && (
                <BarTable
                  title="Estado general de fases — Acreditación voluntaria"
                  data={barAcreditacion}
                  tipoProceso="AV"
                  programas={programasFiltradosCompleto}
                  procesos={procesos}
                />
              )}
            </>}
            {activeSection === "main" && (
              <VencimientosPorAnoCharts programasBase={programasFiltradosCompleto} procesos={procesos} />
            )}
            </>
            )}

            {activeSection === "alertas" && (
              <Stack gap="lg">
                <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
                  <Box>
                    <Text fw={700} size="xl" lh={1.2}>Alertas de procesos</Text>
                    <Text size="sm" c="dimmed" mt={4}>
                      Procesos RC, AV, AE y PM en curso, y recordatorios de procesos cerrados que aún no tienen un trámite nuevo del mismo tipo.
                    </Text>
                  </Box>
                  <Group gap="xs" wrap="wrap" justify="flex-end">
                    <Button
                      size="sm"
                      variant="light"
                      color="blue"
                      leftSection={<IconPlus size={15} />}
                      onClick={() => {
                        setAgregarProcesoPrefill({ soloCrearPrograma: true });
                        setAgregarProcesoOpen(true);
                      }}
                    >
                      Crear programa
                    </Button>
                    <Button
                      size="sm"
                      variant="light"
                      color="violet"
                      leftSection={<IconPlus size={15} />}
                      onClick={() => {
                        setAgregarProcesoPrefill({ modoProcesoPrimeraVezTipo: true });
                        setAgregarProcesoOpen(true);
                      }}
                    >
                      Nuevo proceso AV
                    </Button>
                    <Button
                      size="sm"
                      variant="light"
                      color="teal"
                      leftSection={<IconPlus size={15} />}
                      styles={{ label: { whiteSpace: "normal", lineHeight: 1.25, textAlign: "center" } }}
                      onClick={() => {
                        setAgregarProcesoPrefill({ soloReformaCurricular: true });
                        setAgregarProcesoOpen(true);
                      }}
                    >
                      {SUBTIPO_MODIFICACION_REFORMA_LABEL}
                    </Button>
                  </Group>
                </Group>

                {/* Resumen: cada tarjeta filtra la tabla con un clic */}
                <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="sm">
                  {([
                    { key: "RC", label: "Registro calificado", detalle: "en curso", color: "blue", icon: IconFileCertificate, valor: conteosResumenAlertas.RC, activo: remTipoProceso === "Registro calificado" && remVista === "todo" && !remSoloAtencion, accion: () => seleccionarTarjetaAlertas(remTipoProceso === "Registro calificado" && remVista === "todo" && !remSoloAtencion ? null : { tipo: "Registro calificado" }) },
                    { key: "AV", label: "Acreditación voluntaria", detalle: "en curso", color: "violet", icon: IconAward, valor: conteosResumenAlertas.AV, activo: remTipoProceso === "Acreditación voluntaria" && remVista === "todo" && !remSoloAtencion, accion: () => seleccionarTarjetaAlertas(remTipoProceso === "Acreditación voluntaria" && remVista === "todo" && !remSoloAtencion ? null : { tipo: "Acreditación voluntaria" }) },
                    { key: "AE", label: "Autoevaluación", detalle: "en curso", color: "teal", icon: IconClipboardList, valor: conteosResumenAlertas.AE, activo: remTipoProceso === "Autoevaluación" && remVista === "todo" && !remSoloAtencion, accion: () => seleccionarTarjetaAlertas(remTipoProceso === "Autoevaluación" && remVista === "todo" && !remSoloAtencion ? null : { tipo: "Autoevaluación" }) },
                    { key: "PM", label: "Plan de mejoramiento", detalle: "en curso", color: "grape", icon: IconTarget, valor: conteosResumenAlertas.PM, activo: remTipoProceso === "Plan de mejoramiento" && remVista === "todo" && !remSoloAtencion, accion: () => seleccionarTarjetaAlertas(remTipoProceso === "Plan de mejoramiento" && remVista === "todo" && !remSoloAtencion ? null : { tipo: "Plan de mejoramiento" }) },
                    { key: "ALERTAS", label: "Alertas de cierre", detalle: "sin proceso nuevo", color: "orange", icon: IconBellRinging, valor: conteosResumenAlertas.alertas, activo: remVista === "alertas" && !remSoloAtencion && remTipoProceso === "Todos", accion: () => seleccionarTarjetaAlertas(remVista === "alertas" && !remSoloAtencion && remTipoProceso === "Todos" ? null : { vista: "alertas" }) },
                    { key: "ATENCION", label: "Requieren atención", detalle: "por vencer o vencidas", color: "red", icon: IconAlertTriangle, valor: conteosResumenAlertas.atencion, activo: remSoloAtencion && remTipoProceso === "Todos", accion: () => seleccionarTarjetaAlertas(remSoloAtencion && remTipoProceso === "Todos" ? null : { atencion: true }) },
                  ]).map((x) => (
                    <Paper
                      key={x.key}
                      radius="lg"
                      p="md"
                      tabIndex={0}
                      role="button"
                      aria-pressed={x.activo}
                      className="men-tile"
                      onClick={x.accion}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          x.accion();
                        }
                      }}
                      style={{
                        cursor: "pointer",
                        backgroundColor: `var(--mantine-color-${x.color}-light)`,
                        border: `2px solid ${x.activo ? `var(--mantine-color-${x.color}-5)` : "transparent"}`,
                        boxShadow: x.activo ? "var(--mantine-shadow-md)" : undefined,
                      }}
                    >
                      <Group justify="space-between" wrap="nowrap" align="flex-start" gap={6}>
                        <Text fw={900} size="1.9rem" lh={1} c={`${x.color}.8`}>{x.valor}</Text>
                        <ThemeIcon size={34} radius="xl" variant="white" color={x.color}><x.icon size={18} /></ThemeIcon>
                      </Group>
                      <Text size="sm" fw={700} mt={8} lh={1.2}>{x.label}</Text>
                      <Text size="xs" c="dimmed">{x.activo ? "Filtrando · clic para quitar" : x.detalle}</Text>
                    </Paper>
                  ))}
                </SimpleGrid>
                <style>{`
                  .men-tile { transition: transform 120ms ease, box-shadow 120ms ease; }
                  .men-tile:hover { transform: translateY(-2px); box-shadow: var(--mantine-shadow-sm); }
                  .men-fila { transition: background-color 100ms ease; }
                  .men-fila:hover > td { background-color: var(--mantine-color-default-hover); }
                `}</style>

                {/* Barra de herramientas: búsqueda, vista y filtros avanzados */}
                <Paper withBorder radius="lg" p="md">
                  <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                    <Group gap="sm" wrap="wrap" style={{ flex: 1 }}>
                      <TextInput
                        placeholder="Buscar programa..."
                        leftSection={<IconSearch size={16} />}
                        value={remBusqueda}
                        onChange={(e) => setRemBusqueda(e.currentTarget.value)}
                        radius="xl"
                        w={280}
                        rightSection={remBusqueda ? (
                          <ActionIcon size="sm" variant="subtle" color="gray" radius="xl" aria-label="Borrar búsqueda" onClick={() => setRemBusqueda("")}>
                            <IconFilterOff size={13} />
                          </ActionIcon>
                        ) : null}
                      />
                      <SegmentedControl
                        radius="xl"
                        value={remVista}
                        onChange={(v) => { setRemVista(v as typeof remVista); if (v !== "alertas") setRemSoloAtencion(false); }}
                        data={[
                          { value: "todo", label: "Todo" },
                          { value: "activos", label: `Procesos activos (${filasProcesosActivosRcAv.length + filasActivasPM.length})` },
                          { value: "alertas", label: `Alertas (${remindersOrdenados.length})` },
                        ]}
                      />
                    </Group>
                    {(() => {
                      const nFiltros = [remFacultad, remPrograma, remNivel, remModalidad, remTipoPosgrado, remTipoProceso, remSubtipo].filter((v) => v !== "Todos").length;
                      return (
                        <Group gap="xs">
                          {(nFiltros > 0 || remBusqueda || remSoloAtencion || remVista !== "todo") && (
                            <Button size="sm" variant="subtle" color="gray" leftSection={<IconFilterOff size={15} />}
                              onClick={() => {
                                setRemFacultad("Todos"); setRemPrograma("Todos"); setRemNivel("Todos"); setRemModalidad("Todos");
                                setRemTipoPosgrado("Todos"); setRemTipoProceso("Todos"); setRemSubtipo("Todos");
                                setRemBusqueda(""); setRemSoloAtencion(false); setRemVista("todo");
                              }}>
                              Limpiar todo
                            </Button>
                          )}
                          <Button size="sm" radius="xl" variant={remMasFiltros || nFiltros > 0 ? "light" : "default"}
                            leftSection={<IconAdjustmentsHorizontal size={16} />}
                            rightSection={nFiltros > 0 ? <Badge size="xs" circle>{nFiltros}</Badge> : null}
                            onClick={() => setRemMasFiltros((v) => !v)}>
                            Filtros
                          </Button>
                        </Group>
                      );
                    })()}
                  </Group>
                  <Collapse in={remMasFiltros}>
                {!loadingFilters ? (
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 4, xl: 7 }} spacing="sm" mt="md">
                      <Select label="Facultad" data={opcionesFacultad} value={remFacultad}
                        onChange={handleRemFacultadChange} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Programa" data={opcionesRemPrograma} value={remPrograma}
                        onChange={(v) => { setRemPrograma(v ?? "Todos"); setRemSubtipo("Todos"); }} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Nivel académico" data={opcionesNivelAcademico} value={remNivel}
                        onChange={(v) => setRemNivel(v ?? "Todos")} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Modalidad" data={["Todos", "Presencial", "Virtual", "Híbrido"]} value={remModalidad}
                        onChange={(v) => setRemModalidad(v ?? "Todos")} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Tipo de posgrado" data={["Todos", "Especialización", "Maestría", "Doctorado", "Otros posgrados"]} value={remTipoPosgrado}
                        onChange={(v) => setRemTipoPosgrado(v ?? "Todos")} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Tipo de proceso" data={opcionesTipoProceso} value={remTipoProceso}
                        onChange={(v) => { setRemTipoProceso(v ?? "Todos"); setRemSubtipo("Todos"); }} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Subtipo" data={opcionesRemSubtipoData} value={remSubtipo}
                        onChange={(v) => setRemSubtipo(v ?? "Todos")} searchable={false} styles={selectorStyleFiltersSubtipo} />
                    </SimpleGrid>
                ) : (
                  <Loader size="sm" mt="md" />
                )}
                  </Collapse>
                </Paper>
                {loadingReminders ? (
                  <Loader size="sm" mx="auto" display="block" my="lg" />
                ) : (
                  <Stack gap="xl">
                    {/* ══ TABLA 1: RC / AV / AE activos + alertas de cierre ══ */}
                    {remTipoProceso !== "Plan de mejoramiento" && (
                    <Paper withBorder radius="lg" style={{ overflow: "hidden" }}>
                      <Group justify="space-between" align="center" wrap="wrap" gap="sm" p="md" pb="sm">
                        <Group gap="sm" wrap="nowrap">
                          <ThemeIcon size={32} radius="xl" variant="light" color="blue"><IconBellRinging size={17} /></ThemeIcon>
                          <Box>
                            <Text fw={700}>Procesos activos y alertas de vencimiento</Text>
                            <Text size="xs" c="dimmed">
                              {filasActivasVisibles.length + alertasVisibles.length} {filasActivasVisibles.length + alertasVisibles.length === 1 ? "registro" : "registros"} · ordenados por vencimiento, los más próximos primero
                            </Text>
                          </Box>
                        </Group>
                        <Group gap={6} wrap="wrap">
                          <Text size="xs" c="dimmed" fw={600}>Semáforo:</Text>
                          {SEMAFORO_ALERTA_LEYENDA.map((x) => (
                            <Badge key={x.texto} size="sm" variant="light" color={x.color} leftSection={<Box style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: `var(--mantine-color-${x.color}-6)` }} />} styles={{ label: { textTransform: "none" } }}>
                              {x.texto}
                            </Badge>
                          ))}
                        </Group>
                      </Group>
                      <div style={{ width: "100%", minWidth: 0, overflowX: "auto" }}>
                        <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse", tableLayout: "fixed" }}>
                          <colgroup>
                            <col style={{ width: "20%" }} />
                            <col style={{ width: "13%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "9.5%" }} />
                            <col style={{ width: "6%" }} />
                            <col style={{ width: "6.5%" }} />
                            <col style={{ width: "6%" }} />
                            <col style={{ width: "6%" }} />
                            <col style={{ width: "7.5%" }} />
                            <col style={{ width: "17.5%" }} />
                          </colgroup>
                          <thead>
                            <tr style={theadRowStyle}>
                              {(
                                [
                                  "Programa",
                                  "Tipo",
                                  "Acto admin.",
                                  "Venc.",
                                  "Inicio",
                                  "Lectura Vicer.",
                                  "Digit.",
                                  "Rad.",
                                  "Documento acto admin.",
                                  "Acciones",
                                ] as const
                              ).map((h) => {
                                const isFechaCol = h === "Venc." || h === "Inicio" || h === "Lectura Vicer." || h === "Digit." || h === "Rad.";
                                const isDocCol = h === "Documento acto admin.";
                                return (
                                  <th
                                    key={h}
                                    style={{
                                      ...thTextStyle,
                                      padding: "10px 6px",
                                      textAlign: h === "Programa" ? "left" : "center",
                                      paddingLeft: h === "Programa" ? 14 : undefined,
                                      fontSize: isFechaCol ? 10.5 : 11,
                                      fontWeight: 700,
                                      whiteSpace: isDocCol ? "normal" : "nowrap",
                                      lineHeight: 1.2,
                                      verticalAlign: "middle",
                                      maxWidth: isDocCol ? "5.5rem" : undefined,
                                    }}
                                    title={h === "Lectura Vicer." ? "Fecha del documento para lectura de Vicerrectoría" : undefined}
                                  >
                                    {h}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {filasActivasVisibles.map(({ proc, prog }) => {
                              const codigoActo =
                                proc.tipo_proceso === "RC" ? (prog.codigo_resolucion_rc ?? "—")
                                : proc.tipo_proceso === "AV" ? (prog.codigo_resolucion_av ?? "—")
                                : "—";
                              const fechaActo =
                                proc.tipo_proceso === "RC" ? prog.fecha_resolucion_rc
                                : proc.tipo_proceso === "AV" ? prog.fecha_resolucion_av
                                : null;
                              const campoFechaActo =
                                proc.tipo_proceso === "RC" ? "fecha_resolucion_rc"
                                : proc.tipo_proceso === "AV" ? "fecha_resolucion_av"
                                : null;
                              const badgeColor = TIPO_COLOR[proc.tipo_proceso] ?? "gray";
                              return (
                                <tr
                                  key={`act-${proc._id}`}
                                  className="men-fila"
                                  tabIndex={0}
                                  aria-selected={selectedAlertRow === `active-${proc._id}`}
                                  onClick={() => setSelectedAlertRow(`active-${proc._id}`)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setSelectedAlertRow(`active-${proc._id}`);
                                    }
                                  }}
                                  style={estiloFilaTabla(proc.tipo_proceso, selectedAlertRow === `active-${proc._id}`)}
                                >
                                    <td style={{ padding: "6px 6px 6px 14px", fontSize: 13, verticalAlign: "middle", wordBreak: "break-word" }}>
                                      <Text size="sm" fw={600} style={{ wordBreak: "break-word", fontSize: 13 }}>
                                        {prog.nombre}
                                      </Text>
                                      <Text size="xs" c="dimmed">
                                        {[prog.modalidad, etiquetaPosgradoCorta(prog)].filter(Boolean).join(" · ") || "—"}
                                      </Text>
                                    </td>
                                    <td style={{ padding: "6px 5px", verticalAlign: "middle", textAlign: "center" }}>
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "nowrap", gap: 6 }}>
                                        <Badge size="sm" color={badgeColor} variant="light" style={{ flexShrink: 0 }}>{proc.tipo_proceso}</Badge>
                                        {proc.subtipo && (
                                          <Badge size="sm" variant="outline" color="gray" styles={stylesSubtipoBadgeTabla(proc.subtipo)} style={{ flexShrink: 0 }}>
                                            {etiquetaSubtipoCompacta(proc.subtipo)}
                                          </Badge>
                                        )}
                                      </div>
                                    </td>
                                    <td style={{ padding: "6px 5px", fontSize: 13, verticalAlign: "middle", textAlign: "center" }}>
                                      <Stack gap={2} align="center">
                                        <Text size="sm" ff="monospace" ta="center">{codigoActo}</Text>
                                        {campoFechaActo && renderFecha(fechaActo)}
                                      </Stack>
                                    </td>
                                    <td style={tdFechaTablaAlertas}>{renderFechaVencimiento(proc.fecha_vencimiento)}</td>
                                    <td style={tdFechaTablaAlertas}>{renderFecha(proc.fecha_inicio)}</td>
                                    <td style={tdFechaTablaAlertas}>{renderFecha(proc.fecha_documento_par)}</td>
                                    <td style={tdFechaTablaAlertas}>{renderFecha(proc.fecha_digitacion_saces)}</td>
                                    <td style={tdFechaTablaAlertas}>{renderFecha(proc.fecha_radicado_men)}</td>
                                    <td style={{ padding: "6px 5px", fontSize: 13, verticalAlign: "middle", textAlign: "center" }}>{celdaGuionCentrado}</td>
                                    <td style={{ padding: "6px 5px", textAlign: "center", verticalAlign: "middle" }}>
                                      <Group justify="center" gap={6} wrap="nowrap">
                                      {botonEditarFila({
                                        programName: prog.nombre,
                                        tipo: proc.tipo_proceso,
                                        campos: [
                                          ...(campoFechaActo ? [{ resource: "program" as const, id: prog._id, field: campoFechaActo, label: "fecha de resolución", valor: fechaActo }] : []),
                                          { resource: "process", id: proc._id, field: "fecha_vencimiento", label: "vencimiento", valor: proc.fecha_vencimiento },
                                          { resource: "process", id: proc._id, field: "fecha_inicio", label: "inicio", valor: proc.fecha_inicio },
                                          { resource: "process", id: proc._id, field: "fecha_documento_par", label: "lectura de Vicerrectoría", valor: proc.fecha_documento_par },
                                          { resource: "process", id: proc._id, field: "fecha_digitacion_saces", label: "digitación", valor: proc.fecha_digitacion_saces },
                                          { resource: "process", id: proc._id, field: "fecha_radicado_men", label: "radicación", valor: proc.fecha_radicado_men },
                                        ],
                                      })}
                                      <Button size="xs" variant="filled" color={badgeColor} radius="md" onClick={() => irAGestionarProcesoDesdeModal({
                                        nombrePrograma: prog.nombre,
                                        tipo: proc.tipo_proceso as "RC" | "AV" | "AE",
                                        dep_code_programa: prog.dep_code_programa ?? undefined,
                                        dep_code_facultad: prog.dep_code_facultad ?? undefined,
                                      })}>
                                        Gestionar
                                      </Button>
                                      <Tooltip label="Eliminar proceso" withArrow>
                                        <ActionIcon
                                          color="red" variant="subtle" size="lg"
                                          aria-label={`Eliminar proceso ${proc.tipo_proceso} de ${prog.nombre}`}
                                          onClick={() => {
                                            setErrorEliminarProceso(null);
                                            setProcesoAEliminar({ proceso: proc, nombrePrograma: prog.nombre });
                                          }}
                                        >
                                          <IconTrash size={18} stroke={1.5} />
                                        </ActionIcon>
                                      </Tooltip>
                                      </Group>
                                    </td>
                                  </tr>
                              );
                            })}

                            {alertasVisibles.map((r) => {
                              const prog = programaDeRecordatorio(r);
                              const badgeTipoColor = TIPO_COLOR[r.tipo_proceso] ?? "gray";
                              const mantineSemaAlerta = nivelSemaforoAlerta(r);
                              return (
                                <tr
                                  key={r._id}
                                  className="men-fila"
                                  tabIndex={0}
                                  aria-selected={selectedAlertRow === `reminder-${r._id}`}
                                  onClick={() => setSelectedAlertRow(`reminder-${r._id}`)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setSelectedAlertRow(`reminder-${r._id}`);
                                    }
                                  }}
                                  style={estiloFilaTabla(r.tipo_proceso, selectedAlertRow === `reminder-${r._id}`)}
                                >
                                  <td style={{ padding: "6px 6px 6px 14px", fontSize: 13, verticalAlign: "middle", wordBreak: "break-word" }}>
                                    <Group gap={6} wrap="nowrap" align="center">
                                      <Box style={{ width: 8, height: 8, borderRadius: 99, flexShrink: 0, backgroundColor: `var(--mantine-color-${mantineSemaAlerta}-6)` }} />
                                      <Text size="sm" fw={600} style={{ wordBreak: "break-word", fontSize: 13 }}>
                                        {r.nombre_programa}
                                      </Text>
                                    </Group>
                                    <Text size="xs" c="dimmed" pl={14}>
                                      {[prog?.modalidad, prog ? etiquetaPosgradoCorta(prog) : null].filter(Boolean).join(" · ") || "—"}
                                    </Text>
                                  </td>
                                  <td style={{ padding: "6px 5px", verticalAlign: "middle", textAlign: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "nowrap", gap: 6 }}>
                                      <Badge size="sm" color={badgeTipoColor} variant="light" style={{ flexShrink: 0 }}>{r.tipo_proceso}</Badge>
                                      <Badge size="sm" variant="light" color={mantineSemaAlerta} leftSection={<IconBellRinging size={11} />} style={{ flexShrink: 0 }}>Alerta</Badge>
                                      {r.subtipo ? (
                                        <Badge size="sm" variant="outline" color="gray" styles={stylesSubtipoBadgeTabla(r.subtipo)} style={{ flexShrink: 0 }}>
                                          {etiquetaSubtipoCompacta(r.subtipo)}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td style={{ padding: "6px 5px", fontSize: 13, verticalAlign: "middle", textAlign: "center" }}>
                                    <Stack gap={2} align="center">
                                      <Text size="sm" ff="monospace" ta="center">{r.codigo_resolucion ?? "—"}</Text>
                                      <Text size="xs" c="dimmed">{formatFechaDDMMYY(r.fecha_resolucion)}</Text>
                                    </Stack>
                                  </td>
                                  <td style={tdFechaTablaAlertas}>{renderFechaVencimiento(r.fecha_vencimiento)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.fecha_inicio)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.fecha_documento_par)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.fecha_digitacion_saces)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.fecha_radicado_men)}</td>
                                  <td style={{ padding: "6px 5px", fontSize: 13, verticalAlign: "middle", textAlign: "center", minWidth: 0 }}>
                                    {r.documentos?.length ? (
                                      <Stack gap={6} align="center">
                                        {(r.documentos ?? []).map((d, i) => (
                                          <Button
                                            key={i}
                                            component="a"
                                            href={d.view_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            size="xs"
                                            variant="light"
                                            leftSection={<IconFileTypePdf size={14} />}
                                            title={d.name}
                                            aria-label={`Abrir documento: ${d.name}`}
                                          >
                                            Abrir PDF
                                          </Button>
                                        ))}
                                      </Stack>
                                    ) : (
                                      celdaGuionCentrado
                                    )}
                                  </td>
                                    <td style={{ padding: "8px 6px", textAlign: "center", verticalAlign: "middle", minWidth: 0 }}>
                                    <Group justify="center" gap="xs" wrap="nowrap">
                                    {prog && (
                                        <Button
                                          size="xs"
                                          variant="light"
                                          color="blue"
                                          radius="md"
                                          leftSection={<IconPlus size={13} />}
                                          onClick={() => abrirAgregarDesdeRecordatorio(r)}
                                        >
                                          Crear proceso
                                        </Button>
                                    )}
                                      <Tooltip label="Eliminar alerta" withArrow>
                                        <ActionIcon
                                          color="red" variant="subtle" size="lg"
                                          aria-label={`Eliminar alerta ${r.tipo_proceso} de ${r.nombre_programa}`}
                                          onClick={() => {
                                            setErrorEliminarProceso(null);
                                            setAlertaAEliminar(r);
                                          }}
                                        >
                                          <IconTrash size={18} stroke={1.5} />
                                        </ActionIcon>
                                      </Tooltip>
                                    </Group>
                                  </td>
                                </tr>
                              );
                            })}
                            {filasActivasVisibles.length === 0 && alertasVisibles.length === 0 && (
                              <tr>
                                <td colSpan={10} style={{ padding: 32, textAlign: "center" }}>
                                  <Stack align="center" gap={6}>
                                    <ThemeIcon size={40} radius="xl" variant="light" color="gray"><IconSearch size={20} /></ThemeIcon>
                                    <Text size="sm" c="dimmed">No hay procesos ni alertas con esta búsqueda o filtros.</Text>
                                  </Stack>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Paper>
                    )}

                    {/* ══ TABLA 2: Planes de Mejoramiento activos ══ */}
                    {pmVisibles.length > 0 && (
                      <Paper withBorder radius="lg" style={{ overflow: "hidden" }}>
                        <Group gap="sm" wrap="nowrap" p="md" pb="sm">
                          <ThemeIcon size={32} radius="xl" variant="light" color="grape"><IconClipboardList size={17} /></ThemeIcon>
                          <Box>
                            <Text fw={700}>Planes de mejoramiento activos</Text>
                            <Text size="xs" c="dimmed">Fechas de entrega y avance ante Vicerrectoría y CNA.</Text>
                          </Box>
                          <Badge size="sm" variant="light" color="grape" ml="auto">{pmVisibles.length}</Badge>
                        </Group>
                        <div style={{ width: "100%", overflowX: "auto" }}>
                          <table style={{ width: "100%", minWidth: 960, borderCollapse: "collapse", tableLayout: "fixed" }}>
                            <thead>
                              <tr style={theadRowStyle}>
                                {[
                                  "Programa",
                                  "Tipo / Padre",
                                  "Env. PM Vicerrec.",
                                  "Entrega PM CNA",
                                  "Env. Avance Vicerrec.",
                                  "Radicación Avance CNA",
                                  "Acciones",
                                ].map((h) => (
                                  <th key={h} style={{ ...thTextStyle, padding: "10px 8px", textAlign: h === "Programa" ? "left" : "center", paddingLeft: h === "Programa" ? 14 : undefined, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", verticalAlign: "middle" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {/* Proceso PM activo (para gestión) */}
                              {pmVisibles.map(({ proc, prog }) => (
                                <tr
                                  key={`pm-${proc._id}`}
                                  className="men-fila"
                                  tabIndex={0}
                                  aria-selected={selectedAlertRow === `pm-${proc._id}`}
                                  onClick={() => setSelectedAlertRow(`pm-${proc._id}`)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setSelectedAlertRow(`pm-${proc._id}`);
                                    }
                                  }}
                                  style={estiloFilaTabla("PM", selectedAlertRow === `pm-${proc._id}`)}
                                >
                                  <td style={{ padding: "10px 8px 10px 14px", fontSize: 12, maxWidth: 200, verticalAlign: "middle" }}>
                                    <Text size="sm" fw={600} style={{ wordBreak: "break-word" }}>
                                      {prog.nombre}
                                    </Text>
                                  </td>
                                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap", verticalAlign: "middle", textAlign: "center" }}>
                                    <Group gap={4} wrap="nowrap" align="center" justify="center">
                                      <Badge size="sm" color="grape" variant="light">PM</Badge>
                                      <Badge size="sm" variant="dot" color="teal">Activo</Badge>
                                      {proc.parent_tipo_proceso && (
                                        <Badge size="xs" variant="outline" color="gray" styles={{ label: { textTransform: "none" } }}>
                                          De {proc.parent_tipo_proceso}
                                        </Badge>
                                      )}
                                    </Group>
                                  </td>
                                  <td style={tdFechaTablaAlertas}>{renderFecha(proc.fecha_envio_pm_vicerrectoria)}</td>
                                  <td style={tdFechaTablaAlertas}>{renderFecha(proc.fecha_entrega_pm_cna)}</td>
                                  <td style={tdFechaTablaAlertas}>{renderFecha(proc.fecha_envio_avance_vicerrectoria)}</td>
                                  <td style={tdFechaTablaAlertas}>{renderFecha(proc.fecha_radicacion_avance_cna)}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "center", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                                    <Group justify="center" gap={6} wrap="nowrap">
                                    {botonEditarFila({
                                      programName: prog.nombre,
                                      tipo: "PM",
                                      campos: [
                                        { resource: "process", id: proc._id, field: "fecha_envio_pm_vicerrectoria", label: "envío del PM a Vicerrectoría", valor: proc.fecha_envio_pm_vicerrectoria },
                                        { resource: "process", id: proc._id, field: "fecha_entrega_pm_cna", label: "entrega del PM al CNA", valor: proc.fecha_entrega_pm_cna },
                                        { resource: "process", id: proc._id, field: "fecha_envio_avance_vicerrectoria", label: "envío de avance a Vicerrectoría", valor: proc.fecha_envio_avance_vicerrectoria },
                                        { resource: "process", id: proc._id, field: "fecha_radicacion_avance_cna", label: "radicación de avance al CNA", valor: proc.fecha_radicacion_avance_cna },
                                      ],
                                    })}
                                    <Button size="xs" variant="filled" color="grape" radius="md" onClick={() => irAGestionarProcesoDesdeModal({
                                      nombrePrograma: prog.nombre,
                                      tipo: "PM",
                                      dep_code_programa: prog.dep_code_programa ?? undefined,
                                      dep_code_facultad: prog.dep_code_facultad ?? undefined,
                                    })}>
                                      Gestionar PM
                                    </Button>
                                    <Tooltip label="Eliminar proceso" withArrow>
                                      <ActionIcon
                                        color="red" variant="subtle" size="md"
                                        aria-label={`Eliminar proceso PM de ${prog.nombre}`}
                                        onClick={() => {
                                          setErrorEliminarProceso(null);
                                          setProcesoAEliminar({ proceso: proc, nombrePrograma: prog.nombre });
                                        }}
                                      >
                                        <IconTrash size={16} stroke={1.5} />
                                      </ActionIcon>
                                    </Tooltip>
                                    </Group>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Paper>
                    )}
                    {remTipoProceso === "Plan de mejoramiento" && pmVisibles.length === 0 && (
                      <Paper withBorder radius="lg" p="xl">
                        <Text size="sm" c="dimmed" ta="center">No hay planes de mejoramiento activos con estos filtros.</Text>
                      </Paper>
                    )}
                  </Stack>
                )}
              </Stack>
            )}

            {activeSection === "buzon" && <BuzonMenView />}

            {activeSection === "historial" && (
              <>
                <Text fw={700} size="xl" lh={1.2}>Historial de procesos</Text>
                <Text size="sm" c="dimmed" mt={4} mb="md">
                  Consulta los procesos cerrados, sus fechas, resultados y documentos asociados.
                </Text>
                <Paper withBorder radius="lg" p="md" mb="md">
                  <FiltrosEncabezado
                    hayFiltros={!!historialFiltroFacultad || !!historialFiltroPrograma}
                    onLimpiar={() => { setHistorialFiltroFacultad(null); setHistorialFiltroPrograma(null); }}
                  />
                  <Group gap="sm" wrap="wrap" align="flex-end">
                    <Select label="Facultad" placeholder="Todas las facultades" data={historialOpcionesFacultad}
                      value={historialFiltroFacultad} onChange={setHistorialFiltroFacultad} clearable w={260}
                      styles={selectorStyleFilters} />
                    <Select label="Programa" placeholder="Todos los programas"
                      data={historialOpcionesPrograma}
                      value={historialFiltroPrograma} onChange={setHistorialFiltroPrograma} clearable searchable w={280}
                      styles={selectorStyleFilters} />
                  </Group>
                </Paper>
                {loadingHistorial ? (
                  <Loader size="sm" mx="auto" display="block" my="lg" />
                ) : (
                  <Paper withBorder radius="lg" style={{ overflow: "hidden" }}>
                  <div style={{ width: "100%", overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 980, borderCollapse: "collapse", tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "9%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "9%" }} />
                        <col style={{ width: "7%" }} />
                        <col style={{ width: "10%" }} />
                      </colgroup>
                      <thead>
                        <tr style={theadRowStyle}>
                          {["Programa", "Proceso", "Solicitud", "Resolución · Vigencia", "Vencimiento", "Fase al cierre", "Cerrado", ""].map((h) => (
                            <th key={h} style={{ ...thTextStyle, padding: "10px 8px", paddingLeft: h === "Programa" ? 14 : undefined, textAlign: h === "" ? "center" : "left", fontSize: 11, fontWeight: 700, verticalAlign: "middle" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          /* Construir mapa historialId → PM historial para mostrar PM ligado */
                          const noRenovacionHistoryIds = new Set(
                            historialProcesosOrdenado.filter(esHistorialAvNoRenovacion).map((r) => r._id),
                          );
                          const pmHistorialMap = new Map(
                            historialProcesosOrdenado
                              .filter(
                                (r) =>
                                  r.tipo_proceso === "PM" &&
                                  r.parent_history_id &&
                                  !noRenovacionHistoryIds.has(r.parent_history_id),
                              )
                              .map((r) => [r.parent_history_id!, r]),
                          );
                          /* Solo mostrar registros que NO sean PM independientes (los PM se muestran dentro de AV/AE) */
                          const registrosFiltrados = historialProcesosOrdenado
                            .filter(
                              (r) =>
                                r.tipo_proceso !== "PM" ||
                                !r.parent_history_id ||
                                noRenovacionHistoryIds.has(r.parent_history_id),
                            )
                            .filter((r) => !historialFiltroFacultad || r.dep_code_facultad === historialFiltroFacultad)
                            .filter((r) => !historialFiltroPrograma || r.nombre_programa === historialFiltroPrograma);

                          if (registrosFiltrados.length === 0) {
                            return (
                              <tr>
                                <td colSpan={8} style={{ padding: 24, textAlign: "center", color: "var(--mantine-color-dimmed)", fontSize: 13 }}>
                                  No hay registros en el historial
                                </td>
                              </tr>
                            );
                          }
                          return registrosFiltrados.map((r) => {
                            const pmHist = pmHistorialMap.get(r._id);
                            const tienepmActivo = !!r.pm_proceso_id && !esHistorialAvNoRenovacion(r);
                            const badgeColor = TIPO_COLOR[r.tipo_proceso] ?? "gray";
                            return (
                              <>
                                <tr key={r._id} style={{ ...estiloFilaTabla(r.tipo_proceso, false), cursor: "default", borderBottom: pmHist ? "none" : "1px solid var(--mantine-color-default-border)" }}>
                                  <td style={{ padding: "10px 8px 10px 14px", fontSize: 13, fontWeight: 600, maxWidth: 200, verticalAlign: "middle" }}>{r.nombre_programa}</td>
                                  <td style={{ padding: "6px 8px", minWidth: 0, verticalAlign: "middle" }}>
                                    <Group gap={4} wrap="nowrap" align="center" style={{ width: "fit-content", maxWidth: "100%", minWidth: 0 }}>
                                      <Badge size="xs" color={badgeColor} variant="light" style={{ flexShrink: 0 }}>{r.tipo_proceso}</Badge>
                                      {r.subtipo && (
                                        <Badge size="xs" variant="outline" color="gray" styles={stylesSubtipoBadgeTabla(r.subtipo)} style={{ flexShrink: 0 }}>
                                          {etiquetaSubtipoCompacta(r.subtipo)}
                                        </Badge>
                                      )}
                                      {tienepmActivo && (
                                        <Badge size="xs" variant="light" color="orange" style={{ flexShrink: 0 }}>PM en curso</Badge>
                                      )}
                                    </Group>
                                  </td>
                                  <td style={{ padding: "6px 8px", fontSize: 12, verticalAlign: "middle" }}>
                                    {(r.estado_solicitud ?? "APROBADO") === "NEGADO"
                                      ? <Badge size="xs" color="red" variant="light">Negado</Badge>
                                      : <Badge size="xs" color="teal" variant="light">Aprobado</Badge>}
                                  </td>
                                  <td style={{ padding: "6px 8px", fontSize: 11, verticalAlign: "middle" }}>
                                    {r.codigo_resolucion
                                      ? <><Text size="xs" ff="monospace">{r.codigo_resolucion}</Text>
                                          {r.fecha_resolucion && <Text size="xs" c="dimmed">{formatFechaDDMMYY(r.fecha_resolucion)}{r.duracion_resolucion != null ? ` · ${r.duracion_resolucion} años` : ""}</Text>}</>
                                      : "—"}
                                  </td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.fecha_vencimiento)}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle" }}><FaseBadge fase={r.fase_al_cierre} /></td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.cerrado_en)}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle" }}>
                                    <Button size="xs" variant="light" radius="md" onClick={() => setHistorialDetalle(r)}>Ver detalle</Button>
                                  </td>
                                </tr>
                                {/* Sub-fila del PM cerrado (cuando AV/AE tiene PM cerrado) */}
                                {pmHist && (
                                  <tr key={`pm-${pmHist._id}`} style={{ ...estiloFilaTabla("PM", false), cursor: "default", backgroundColor: "var(--mantine-color-grape-light)" }}>
                                    <td style={{ padding: "6px 8px 6px 28px", fontSize: 12, color: "var(--mantine-color-dimmed)" }}>
                                      ↳ {r.nombre_programa}
                                    </td>
                                    <td style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>
                                      <Group gap={4} wrap="nowrap">
                                        <Badge size="xs" color="grape" variant="filled">PM</Badge>
                                        <Badge size="xs" color="teal" variant="light">Cerrado</Badge>
                                      </Group>
                                    </td>
                                    <td style={{ padding: "4px 8px", fontSize: 11 }}>
                                      <Badge size="xs" color="teal" variant="light">Completado</Badge>
                                    </td>
                                    <td style={{ padding: "4px 8px", fontSize: 11 }} colSpan={3}>
                                      {pmHist.fecha_entrega_pm_cna
                                        ? <Text size="xs" c="dimmed">Entrega CNA: {formatFechaDDMMYY(pmHist.fecha_entrega_pm_cna)}</Text>
                                        : <Text size="xs" c="dimmed">Sin fechas registradas</Text>}
                                    </td>
                                    <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(pmHist.cerrado_en)}</td>
                                    <td style={{ padding: "4px 8px", textAlign: "center" }}>
                                      <Button size="xs" variant="light" color="grape" radius="md" onClick={() => setHistorialDetalle(pmHist)}>Ver detalle</Button>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                  </Paper>
                )}
              </>
            )}
            </>
            )}

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

      {/* ── Modal detalle historial ── */}
      <Modal
        opened={historialDetalle !== null}
        onClose={() => setHistorialDetalle(null)}
        title={historialDetalle ? (
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size="lg" radius="md" variant="light" color={TIPO_COLOR[historialDetalle.tipo_proceso] ?? "gray"}>
              <IconHistory size={20} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="lg" lh={1.2}>{historialDetalle.nombre_programa}</Text>
              <Text size="xs" c="dimmed">
                {LABEL_PROCESO[historialDetalle.tipo_proceso]}{historialDetalle.cerrado_en ? ` · Cerrado el ${formatFechaDDMMYY(historialDetalle.cerrado_en)}` : ""}
              </Text>
            </Box>
          </Group>
        ) : ""}
        size="calc(100vw - 2rem)"
        centered
        radius="lg"
        styles={{
          content: { maxWidth: "min(96vw, 1420px)", width: "100%" },
          header: { borderBottom: "1px solid var(--mantine-color-default-border)" },
          body: { overflowX: "hidden", paddingTop: 16 },
        }}>
        {historialDetalle && (
          <Stack gap="md">
            <Paper withBorder radius="lg" p="md" style={{ borderLeft: `4px solid var(--mantine-color-${TIPO_COLOR[historialDetalle.tipo_proceso] ?? "gray"}-5)` }}>
              <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
                <Box>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">Proceso</Text>
                  <Group gap={6} mt={4}>
                    <Badge color={TIPO_COLOR[historialDetalle.tipo_proceso] ?? "gray"} variant="light">{historialDetalle.tipo_proceso}</Badge>
                    {historialDetalle.condicion && (
                      <Badge color="violet" variant="outline" size="sm">
                        {historialDetalle.tipo_proceso === "RC" ? "Condición" : "Factor"} {historialDetalle.condicion}
                      </Badge>
                    )}
                  </Group>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">Subtipo</Text>
                  {historialDetalle.subtipo ? (
                    <Badge color="gray" variant="outline" mt={4} styles={stylesSubtipoLargo}>
                      {etiquetaSubtipoCompacta(historialDetalle.subtipo)}
                    </Badge>
                  ) : <Text size="sm" mt={4}>—</Text>}
                </Box>
                <Box>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">Resultado</Text>
                  {(historialDetalle.estado_solicitud ?? "APROBADO") === "NEGADO" ? (
                    <Badge color="red" variant="light" mt={4} leftSection={<IconCircleX size={12} />}>Solicitud negada</Badge>
                  ) : (
                    <Badge color="teal" variant="light" mt={4} leftSection={<IconCircleCheck size={12} />}>Solicitud aprobada</Badge>
                  )}
                </Box>
                <Box>
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">Fase al cierre</Text>
                  <Text size="sm" fw={600} mt={4}>
                    {historialDetalle.fase_al_cierre != null
                      ? (infoFasePorNumero(historialDetalle.fase_al_cierre)?.fullName ?? `Fase ${historialDetalle.fase_al_cierre}`)
                      : "—"}
                  </Text>
                </Box>
              </SimpleGrid>
            </Paper>

            {historialDetalle.tipo_proceso === "AV" && historialDetalle.av_rc_oficio_modo === "pendiente" && (
              <Alert variant="light" color="blue" radius="md" py="xs" icon={<IconInfoCircle size={16} />}>
              <Text size="xs">
                El RC anterior se prolonga en la ficha mientras se espera el RC de oficio. En el historial de Registro calificado queda una fila <strong>Vigencia transitoria</strong> (solo archivo, sin proceso gestionable).
              </Text>
              </Alert>
            )}
            {historialDetalle.tipo_proceso === "RC" && historialDetalle.subtipo === "Vigencia transitoria" && (
              <Alert variant="light" color="blue" radius="md" py="xs" icon={<IconInfoCircle size={16} />}>
              <Text size="xs">
                <strong>Vigencia transitoria (RC)</strong>: registro solo de archivo. No corresponde a un trámite que se cree ni se gestione aquí; prolonga en la ficha la vigencia del RC que estaba vigente al cerrar la acreditación vinculada, hasta que abras el «Registro calificado de oficio» desde la alerta de ese RC.
              </Text>
              </Alert>
            )}
            {historialDetalle.tipo_proceso === "RC" && esSubtipoReformaCurricularSoloHistorial(historialDetalle.subtipo) && (
              <Alert variant="light" color="blue" radius="md" py="xs" icon={<IconInfoCircle size={16} />}>
              <Text size="xs">
                <strong>Modificación</strong>: no genera resolución MEN ni alerta. La constancia y la ficha quedan en este cierre.
              </Text>
              </Alert>
            )}
            {historialDetalle.tipo_proceso === "RC" && esSubtipoRenovacionReformaHistorial(historialDetalle.subtipo) && (
              <Alert variant="light" color="blue" radius="md" py="xs" icon={<IconInfoCircle size={16} />}>
              <Text size="xs">
                <strong>Renovación + modificación</strong>: actualiza vigencia y genera alerta. Un mismo PDF del cierre figura como resolución y constancia.
              </Text>
              </Alert>
            )}
            {historialDetalle.tipo_proceso === "RC" && historialDetalle.subtipo === "Registro calificado de oficio" && (
              <Alert variant="light" color="blue" radius="md" py="xs" icon={<IconInfoCircle size={16} />}>
              <Text size="xs">
                <strong>RC de oficio</strong>: sin trámite gestionado. Solo resolución, vigencia y fecha de cierre.
              </Text>
              </Alert>
            )}

            {historialDetalle.tipo_proceso === "RC" && esSubtipoReformaHistorial(historialDetalle.subtipo) && (
              <HistorialReformaCambios cambios={historialDetalle.programa_cambios ?? []} />
            )}

            <HistorialResolucionSeccion
              record={historialDetalle}
              programaHist={findProgramByCode(programas, historialDetalle.program_code)}
              registrosTipo={historialRecords.filter(
                (r) => r.program_code === historialDetalle.program_code && r.tipo_proceso === historialDetalle.tipo_proceso,
              )}
              onCambiarPdf={() => { setHistPdfMsg(null); setHistCambiarPdfOpen(true); }}
            />

            {historialDetalle.rc_oficio && (
              <>
                <Divider styles={{ label: { fontSize: 13, fontWeight: 700, color: "var(--mantine-color-text)" } }} label="Resolución — Registro calificado de oficio" labelPosition="left" />
                <SimpleGrid cols={3} spacing="sm">
                  {[
                    { label: "Código (RC de oficio)", value: historialDetalle.rc_oficio.codigo_resolucion },
                    { label: "Fecha (RC de oficio)",  value: historialDetalle.rc_oficio.fecha_resolucion ? formatFechaDDMMYY(historialDetalle.rc_oficio.fecha_resolucion) : null },
                    { label: "Duración",               value: historialDetalle.rc_oficio.duracion_resolucion != null ? `${historialDetalle.rc_oficio.duracion_resolucion} años` : null },
                  ].map(({ label, value }) => (
                    <Paper key={label} withBorder radius="md" p="sm">
                      <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                      <Text size="sm" fw={600}>{value ?? "—"}</Text>
                    </Paper>
                  ))}
                </SimpleGrid>
                {historialDetalle.rc_oficio.documentos?.length > 0 && (
                  <Stack gap={4} mt="xs">
                    {historialDetalle.rc_oficio.documentos.map((d, i) => (
                      <Anchor key={i} href={d.view_link} target="_blank" size="sm" fw={500}><IconPaperclip size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} />{d.name}</Anchor>
                    ))}
                  </Stack>
                )}
                {historialDetalle.rc_oficio_history_id && (
                  <Button
                    size="xs"
                    variant="light"
                    color="blue"
                    mt="xs"
                    onClick={async () => {
                      try {
                        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/process-history/${historialDetalle.rc_oficio_history_id}`);
                        if (r.ok) setHistorialDetalle(await r.json());
                      } catch {}
                    }}
                  >
                    Ver historial del RC de oficio →
                  </Button>
                )}
              </>
            )}

            <HistorialFechasTramiteDetalle record={historialDetalle} />
            <HistorialInformacionCaso record={historialDetalle} />

            {historialDetalle.observaciones && (
              <Paper withBorder radius="md" p="sm" style={{ backgroundColor: "var(--mantine-color-yellow-light)" }}>
                <Text size="xs" c="dimmed" mb={2}>Observaciones generales</Text>
                <Text size="sm">{historialDetalle.observaciones}</Text>
              </Paper>
            )}

            {historialDetalle.pm_ligado && (
              <>
                <Divider styles={{ label: { fontSize: 13, fontWeight: 700, color: "var(--mantine-color-text)" } }} label="Plan de Mejoramiento (activo al cierre)" labelPosition="left" />
                <Group gap="xs" mb={4}>
                  <Badge color="grape" variant="light" size="sm">Activo al cierre</Badge>
                  {historialDetalle.pm_ligado.subtipo && (
                    <Badge color="gray" variant="outline" size="sm" styles={stylesSubtipoLargo}>
                      {etiquetaSubtipoCompacta(historialDetalle.pm_ligado.subtipo)}
                    </Badge>
                  )}
                </Group>
                <SimpleGrid cols={2} spacing="sm">
                  {[
                    { label: "Envío a Vicerrectoría",        value: historialDetalle.pm_ligado.fecha_envio_pm_vicerrectoria },
                    { label: "Entrega Plan al CNA",          value: historialDetalle.pm_ligado.fecha_entrega_pm_cna },
                    { label: "Envío avance a Vicerrectoría", value: historialDetalle.pm_ligado.fecha_envio_avance_vicerrectoria },
                    { label: "Radicación avance ante CNA",   value: historialDetalle.pm_ligado.fecha_radicacion_avance_cna },
                  ].map(({ label, value }) => (
                    <Paper key={label} withBorder radius="md" p="sm">
                      <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                      <Text size="sm" fw={600}>{value ? formatFechaDDMMYY(value) : "—"}</Text>
                    </Paper>
                  ))}
                </SimpleGrid>
                {historialDetalle.pm_ligado.observaciones && (
                  <Paper withBorder radius="md" p="sm" style={{ backgroundColor: "var(--mantine-color-teal-light)" }}>
                    <Text size="xs" c="dimmed" mb={2}>Observaciones del plan</Text>
                    <Text size="sm">{historialDetalle.pm_ligado.observaciones}</Text>
                  </Paper>
                )}
              </>
            )}

            <Divider styles={{ label: { fontSize: 13, fontWeight: 700, color: "var(--mantine-color-text)" } }} label="Fases y documentos" labelPosition="left" />
            <HistorialFases fases={historialDetalle.fases} />
          </Stack>
        )}
      </Modal>

      <Modal
        opened={histCambiarPdfOpen}
        onClose={() => { if (!histSubiendoPdf) setHistCambiarPdfOpen(false); }}
        title="Cambiar PDF de resolución"
        centered
        size="md"
      >
        {historialDetalle && (() => {
          const programaHist = findProgramByCode(programas, historialDetalle.program_code);
          const registrosTipo = historialRecords.filter(
            (r) => r.program_code === historialDetalle.program_code && r.tipo_proceso === historialDetalle.tipo_proceso,
          );
          const esVigenteProg = historialEsResolucionVigentePrograma(
            historialDetalle,
            programaHist,
            registrosTipo,
          );
          return (
            <Stack gap="sm">
              {histPdfMsg && (
                <Text size="sm" c={histPdfMsg.startsWith("✓") ? "green" : "red"}>{histPdfMsg}</Text>
              )}
              {esVigenteProg ? (
                <Text size="xs" c="dimmed">
                  Este registro es la resolución vigente del programa. El nuevo PDF reemplazará el enlace en la ficha y en el historial.
                </Text>
              ) : (
                <Text size="xs" c="dimmed">
                  Solo se actualizará el PDF de este cierre archivado (no es la resolución vigente actual del programa).
                </Text>
              )}
              <DropzoneCustomComponent
                text={histSubiendoPdf ? "Subiendo..." : "Haz clic o arrastra el PDF de resolución"}
                loading={histSubiendoPdf}
                onDrop={async (files) => {
                  const file = files[0];
                  if (!file || !historialDetalle) return;
                  setHistSubiendoPdf(true);
                  setHistPdfMsg(null);
                  try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const res = await axios.patch(
                      `${process.env.NEXT_PUBLIC_API_URL}/process-history/${historialDetalle._id}/resolucion-pdf`,
                      formData,
                      { headers: { "Content-Type": "multipart/form-data" } },
                    );
                    setHistorialDetalle(res.data.historial as ProcessHistoryRecord);
                    if (res.data.actualizo_resolucion_vigente_programa) {
                      const pr = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs`);
                      setProgramas(Array.isArray(pr.data) ? pr.data : []);
                    }
                    await cargarHistorial();
                    setHistPdfMsg("✓ PDF actualizado correctamente.");
                    setHistCambiarPdfOpen(false);
                  } catch (e) {
                    console.error(e);
                    setHistPdfMsg("No se pudo actualizar el PDF. Intenta de nuevo.");
                  } finally {
                    setHistSubiendoPdf(false);
                  }
                }}
              />
            </Stack>
          );
        })()}
      </Modal>

    </div>
  );
};

export default ProcessesMenPage;
