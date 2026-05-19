"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useMemo } from "react";
import {
  Title, Select, Button, Text, Paper, Box, SimpleGrid, Group, Flex,
  Loader, Modal, TextInput, Stack, Divider, Badge, Anchor, ScrollArea, Collapse,
  ActionIcon, Tooltip, Table,
} from "@mantine/core";
import { useRole } from "@/app/context/RoleContext";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import axios from "axios";
import {
  IconChartBar,
  IconBellRinging,
  IconHistory,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconList,
  IconArchive,
  IconMessageCircle,
} from "@tabler/icons-react";

import type { Dependency, Program, Process, Phase, ProcessHistoryRecord, ProcessReminderRecord, ProcesoRow, BarRow, PQR } from "./types";
import {
  LABEL_PROCESO,
  ROW_BG_PROCESO,
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
import { nivelSemaforoAlerta } from "./utils/alertaSemaforo";
import { mismoId } from "./utils/idMongoose";
import { procesoRcActivoDePrograma } from "./utils/procesoRcUnico";
import { findProgramByCode, programCodeKey } from "./utils/programCode";
import { lineasAuxPrograma } from "./utils/programDisplay";
import { historialEsResolucionVigentePrograma } from "./utils/historialResolucionVigente";
import {
  esSubtipoReformaHistorial,
  esSubtipoReformaCurricularSoloHistorial,
  esSubtipoRenovacionReformaHistorial,
} from "./utils/programaEditReforma";
import HistorialReformaFicha, { HistorialReformaCambios } from "./components/HistorialReformaFicha";
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
import ProcesoTable from "./components/ProcesoTable";
import ProcesoDetalleCard from "./components/ProcesoDetalleCard";
import AgregarProcesoModal, { type AgregarProcesoPrefill } from "./components/AgregarProcesoModal";
import PQRAgregarForm from "./components/PQRAgregarForm";
import PQRActivosView from "./components/PQRActivosView";
import PQRHistorialView from "./components/PQRHistorialView";
import {
  processesMenRoutes,
  PROCESSES_MEN_RESET_EVENT,
  PROCESSES_MEN_BASE,
} from "./config/routes";

/* ── Helper: renderiza la fecha subida de un doc ── */
const fmtFecha = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : null;

/* ── Lista de documentos con fecha de subida ── */
const DocList = ({ docs }: { docs: Array<{ name: string; view_link: string; subido_en?: string | null }> }) => (
  docs.length > 0 ? (
    <Stack gap={2}>
      {docs.map((d, i) => (
        <Group key={i} gap={6} align="center">
          <Anchor href={d.view_link} target="_blank" size="xs" fw={500}>📎 {d.name}</Anchor>
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
  padding: "8px 6px",
  fontSize: 13,
  whiteSpace: "nowrap" as const,
  textAlign: "center" as const,
  verticalAlign: "middle" as const,
};

/* ── Componente expandible para el historial de fases ── */
type HistFase = ProcessHistoryRecord["fases"][number];
const HistorialFases = ({ fases }: { fases: HistFase[] }) => {
  const [openFase, setOpenFase]   = useState<number | null>(null);
  const [openAct, setOpenAct]     = useState<string | null>(null);

  return (
    <Stack gap="xs">
      {fases.map(f => (
        <Paper key={f.fase_numero} withBorder radius="sm" style={{ overflow: "hidden" }}>
          {/* Cabecera de fase — clic para expandir */}
          <Box
            px="sm" py={8}
            style={{ cursor: "pointer", backgroundColor: "#f8f9fa", borderBottom: openFase === f.fase_numero ? "1px solid #dee2e6" : "none" }}
            onClick={() => setOpenFase(prev => prev === f.fase_numero ? null : f.fase_numero)}
          >
            <Group justify="space-between">
              <Group gap="xs">
                <Text size="xs" fw={700}>{openFase === f.fase_numero ? "▾" : "▸"} Fase {f.fase_numero} — {f.fase_nombre}</Text>
                <Badge size="xs" color={f.actividades_completadas === f.actividades_total ? "green" : "orange"} variant="light">
                  {f.actividades_completadas}/{f.actividades_total} resueltas
                </Badge>
              </Group>
            </Group>
          </Box>

          <Collapse in={openFase === f.fase_numero}>
            <Box px="sm" pt="xs" pb="sm">
              {/* Docs de la fase */}
              {f.documentos.length > 0 && (
                <Box mb="xs">
                  <Text size="xs" c="dimmed" fw={600} mb={4}>Documentos de la fase</Text>
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
                    <Paper key={ai} withBorder radius="xs" style={{ overflow: "hidden" }}>
                      {/* Cabecera actividad */}
                      <Box
                        px="sm" py={6}
                        style={{ cursor: "pointer", backgroundColor: actLista ? "#f0fff4" : "#fff" }}
                        onClick={() => setOpenAct(prev => prev === actKey ? null : actKey)}
                      >
                        <Group justify="space-between">
                          <Group gap="xs">
                            <Text size="xs">{openAct === actKey ? "▾" : "▸"}</Text>
                            <input type="checkbox" checked={actLista} readOnly style={{ width: 13, height: 13 }} />
                            <Text size="xs" fw={500} td={actLista ? "line-through" : undefined} c={actNa ? "orange" : act.completada ? "dimmed" : undefined}>
                              {act.nombre}
                            </Text>
                            {actNa && (
                              <Badge size="xs" color="orange" variant="light">No aplica</Badge>
                            )}
                          </Group>
                          {act.fecha_completado && !actNa && (
                            <Text size="xs" c="teal">✓ {formatFechaDDMMYY(act.fecha_completado)}</Text>
                          )}
                        </Group>
                        {act.responsables && <Text size="xs" c="dimmed" pl={34}>{act.responsables}</Text>}
                      </Box>

                      <Collapse in={openAct === actKey}>
                        <Box px="sm" pt={6} pb="sm" style={{ backgroundColor: "#fafafa" }}>
                          {act.observaciones && (
                            <Paper withBorder radius="xs" p={6} mb={6} style={{ backgroundColor: "#fff9db" }}>
                              <Text size="xs" c="dimmed">Observaciones:</Text>
                              <Text size="xs">{act.observaciones}</Text>
                            </Paper>
                          )}

                          {/* Docs de la actividad */}
                          <Box mb={act.subactividades.length > 0 ? "xs" : 0}>
                            <Text size="xs" c="dimmed" fw={600} mb={4}>Documentos</Text>
                            <DocList docs={act.documentos} />
                          </Box>

                          {/* Subactividades */}
                          {act.subactividades.length > 0 && (
                            <Stack gap={4} mt="xs">
                              <Text size="xs" c="dimmed" fw={600}>Subactividades</Text>
                              {act.subactividades.map((sub, si) => {
                                const subNa = !!sub.no_aplica || actNa;
                                const subLista = sub.completada || subNa;
                                return (
                                <Paper key={si} withBorder radius="xs" p={6}
                                  style={{ backgroundColor: subLista ? "#f8f9fa" : "#fff" }}>
                                  <Group justify="space-between" mb={sub.documentos.length > 0 || sub.observaciones ? 4 : 0}>
                                    <Group gap="xs">
                                      <input type="checkbox" checked={sub.completada && !subNa} readOnly style={{ width: 12, height: 12 }} />
                                      <Text size="xs" td={subLista ? "line-through" : undefined} c={subNa ? "orange" : sub.completada ? "dimmed" : undefined}>
                                        {sub.nombre}
                                      </Text>
                                      {subNa && (
                                        <Badge size="xs" color="orange" variant="light">
                                          {actNa && !sub.no_aplica ? "N/A (actividad)" : "No aplica"}
                                        </Badge>
                                      )}
                                    </Group>
                                    {sub.fecha_completado && !subNa && <Text size="xs" c="teal">✓ {formatFechaDDMMYY(sub.fecha_completado)}</Text>}
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
  const [tablePhases, setTablePhases] = useState<Phase[]>([]);
  const [loadingTablePhases, setLoadingTablePhases] = useState(false);

  const [facultades, setFacultades]   = useState<Dependency[]>([]);
  const [programas, setProgramas]     = useState<Program[]>([]);
  const [procesos, setProcesos]       = useState<Process[]>([]);
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
  type AdminSection = "main" | "alertas" | "historial";
  const [activeSection, setActiveSection] = useState<AdminSection>("main");

  const [remFacultad, setRemFacultad]             = useState<string>("Todos");
  const [remPrograma, setRemPrograma]             = useState<string>("Todos");
  const [remNivel, setRemNivel]                   = useState<string>("Todos");
  const [remTipoProceso, setRemTipoProceso]       = useState<string>("Todos");
  const [remSubtipo, setRemSubtipo]               = useState<string>("Todos");
  const [reminders, setReminders]                 = useState<ProcessReminderRecord[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);

  /* ── Modal agregar proceso ── */
  const [agregarProcesoOpen, setAgregarProcesoOpen] = useState(false);
  const [modalListaProgramas, setModalListaProgramas] = useState<{ titulo: string; lista: Program[] } | null>(null);

  /* ── Ventanas de gestión ── */
  const [agregarProcesoPrefill, setAgregarProcesoPrefill] = useState<AgregarProcesoPrefill | null>(null);

  const [processesMenModulo, setProcessesMenModulo] = useState<ProcessesMenModulo>("procesos");
  const [pqrSeccion, setPqrSeccion]         = useState<PqrSeccion>("activos");
  const [pqrs, setPqrs]                     = useState<PQR[]>([]);

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
    setProcessesMenModulo(m);
    router.replace(m === "comunicaciones" ? processesMenRoutes.comunicaciones : processesMenRoutes.home, { scroll: false });
  };

  useEffect(() => {
    if (!searchParams) return;
    setProcessesMenModulo(searchParams.get("modulo") === "comunicaciones" ? "comunicaciones" : "procesos");
  }, [searchParams]);

  /* ── Carga inicial de datos ── */
  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`, { params: { limit: 1000 } })
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

  useEffect(() => {
    const onReset = () => {
      setActiveSection("main");
      setFacultad("Todos");
      setPrograma("Todos");
      setNivelAcademico("Todos");
      setTipoProceso("Todos");
      setRemFacultad("Todos");
      setRemPrograma("Todos");
      setRemNivel("Todos");
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
    else setTipoProceso("Todos");
    if (focusProcessQuery) setPendingProcesoScrollId(focusProcessQuery);

    const fac = facultades.find((f) => f.dep_code === pr.dep_code_facultad);
    if (fac) setFacultad(fac.name);
    setPrograma(pr.nombre);
    setNivelAcademico("Todos");
    setSubtipoFiltro("Todos");
    setActiveSection("main");
    setProcessesMenModulo("procesos");
    router.replace(processesMenRoutes.home, { scroll: false });
  }, [
    loadingFilters,
    programIdQuery,
    gestionarQuery,
    focusTipoQuery,
    focusProcessQuery,
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
    if (userRole !== "Administrador" || activeSection !== "alertas") return;
    setLoadingReminders(true);
    const fac = remFacultad !== "Todos" ? facultades.find((f) => f.name === remFacultad) : null;
    const prog = remPrograma !== "Todos" ? programas.find((p) => p.nombre === remPrograma) : null;
    const params: Record<string, string> = {};
    if (fac) params.dep_code_facultad = fac.dep_code;
    if (prog) params.program_code = programCodeKey(prog);
    if (remNivel !== "Todos") params.nivel_academico = remNivel;
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/process-reminders`, { params })
      .then((r) => setReminders(Array.isArray(r.data) ? r.data : []))
      .catch((e) => console.error("Error cargando recordatorios:", e))
      .finally(() => setLoadingReminders(false));
  }, [userRole, activeSection, remFacultad, remPrograma, remNivel, facultades, programas]);

  useEffect(() => {
    if (userRole !== "Administrador" || activeSection !== "historial") return;
    void cargarHistorial();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al entrar a la sección
  }, [userRole, activeSection]);

  /** Solo cambia si cambia el conjunto de procesos del programa (alta/baja), no en cada PUT de fecha —
   *  evita `loadingFases` → Loader que desmonta ProcesoDetalleCard y borra los borradores de la ficha en reforma. */
  const fasesReloadKey = useMemo(() => {
    if (programa === "Todos") return "";
    const prog = programas.find((p) => p.nombre === programa);
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
    const prog = programas.find((p) => p.nombre === programa);
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

  /** Desde filtros del tablero: ir a la ficha del programa (no a la vista de procesos en esta página). */
  const navegarAFichaProgramaDesdeFiltro = (nombrePrograma: string | null) => {
    const n = nombrePrograma ?? "Todos";
    if (n === "Todos") {
      setPrograma("Todos");
      return;
    }
    const p = programas.find((x) => x.nombre === n);
    if (!p) return;
    const fac = facultades.find((f) => f.dep_code === p.dep_code_facultad);
    if (fac) setFacultad(fac.name);
    router.push(processesMenRoutes.program(p._id));
  };

  const handleRemFacultadChange = (val: string | null) => {
    setRemFacultad(val ?? "Todos");
    setRemPrograma("Todos");
    setRemSubtipo("Todos");
  };

  const facultadRemSel = facultades.find((f) => f.name === remFacultad);
  const programasFiltradosRem =
    remFacultad === "Todos" ? programas : programas.filter((p) => p.dep_code_facultad === facultadRemSel?.dep_code);
  const opcionesRemPrograma = useMemo(() => {
    const nombres = programasFiltradosRem.map((p) => p.nombre).sort((a, b) => a.localeCompare(b, "es"));
    return ["Todos", ...nombres];
  }, [programasFiltradosRem]);

  const opcionesRemSubtipo = useMemo(
    () => subtipoOpcionesFiltro(remTipoProceso as "Todos" | "Registro calificado" | "Acreditación voluntaria" | "Autoevaluación"),
    [remTipoProceso],
  );
  const opcionesRemSubtipoData = useMemo(
    () => subtipoOpcionesConEtiquetas(opcionesRemSubtipo),
    [opcionesRemSubtipo],
  );

  const programasFiltrados = useMemo(() => {
    if (facultad === "Todos") return programas;
    const fac = facultades.find((f) => f.name === facultad);
    if (!fac) return [];
    return programas.filter((p) => p.dep_code_facultad === fac.dep_code);
  }, [facultad, programas, facultades]);

  const getProceso = (prog: Program, tipo: "RC" | "AV" | "AE" | "PM"): Process | undefined => {
    const code = programCodeKey(prog);
    if (tipo === "RC") return procesoRcActivoDePrograma(procesos, code);
    return procesos.find((p) => p.program_code === code && p.tipo_proceso === tipo);
  };

  const opcionesFacultad = useMemo(
    () => ["Todos", ...facultades.map((f) => f.name).sort((a, b) => a.localeCompare(b, "es"))],
    [facultades],
  );
  /** Programas acotados por facultad; si Facultad = Todos, se listan todos (ordenados). */
  const opcionesPrograma = useMemo(
    () => ["Todos", ...programasFiltrados.map((p) => p.nombre).sort((a, b) => a.localeCompare(b, "es"))],
    [programasFiltrados],
  );
  const opcionesNivelAcademico = useMemo(
    () => ["Todos", ...["Posgrado", "Pregrado"].sort((a, b) => a.localeCompare(b, "es"))],
    [],
  );
  const opcionesTipoProceso = useMemo(
    () => ["Todos", ...["Acreditación voluntaria", "Autoevaluación", "Registro calificado"].sort((a, b) => a.localeCompare(b, "es"))],
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
      .filter((p) => programa === "Todos" || p.nombre === programa)
      .filter((p) => nivelAcademico === "Todos" || p.nivel_academico === nivelAcademico);
    if (subtipoFiltro !== "Todos") {
      list = list.filter((p) => {
        const rc = procesoRcActivoDePrograma(procesos, programCodeKey(p));
        const av = procesos.find((x) => x.program_code === programCodeKey(p) && x.tipo_proceso === "AV");
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
  }, [programasFiltrados, programa, nivelAcademico, tipoProceso, subtipoFiltro, procesos]);

  const codigosProgramasFiltrados = useMemo(
    () => new Set(programasFiltradosCompleto.map((p) => programCodeKey(p))),
    [programasFiltradosCompleto],
  );

  const listaActivos = useMemo(
    () => programasFiltradosCompleto.filter((p) => p.estado === "Activo"),
    [programasFiltradosCompleto],
  );
  const listaInactivos = useMemo(
    () => programasFiltradosCompleto.filter((p) => p.estado === "Inactivo"),
    [programasFiltradosCompleto],
  );
  const listaConRc = useMemo(
    () => programasFiltradosCompleto.filter((p) => p.fecha_resolucion_rc),
    [programasFiltradosCompleto],
  );
  const listaConAv = useMemo(
    () => programasFiltradosCompleto.filter((p) => p.fecha_resolucion_av),
    [programasFiltradosCompleto],
  );

  const totalActivos = listaActivos.length;
  const totalInactivos = listaInactivos.length;
  const conRegistro = listaConRc.length;
  const conAcreditacion = listaConAv.length;
  const totalProgramas = programasFiltradosCompleto.length;
  const pctConRC = totalProgramas > 0 ? Math.round((conRegistro / totalProgramas) * 100) : 0;
  const pctConAV = totalProgramas > 0 ? Math.round((conAcreditacion / totalProgramas) * 100) : 0;

  const listaProgRcOficio = useMemo(() => {
    const codes = new Set(
      procesos
        .filter(
          (pr) =>
            pr.tipo_proceso === "ALERTA"
            && pr.alert_para_tipo === "RC"
            && codigosProgramasFiltrados.has(pr.program_code),
        )
        .map((pr) => pr.program_code),
    );
    return programasFiltradosCompleto.filter((p) => codes.has(programCodeKey(p)));
  }, [procesos, programasFiltradosCompleto, codigosProgramasFiltrados]);

  const totalProgRCOficio = listaProgRcOficio.length;

  const listaProgConPm = useMemo(() => {
    const codes = new Set(procesos.filter((p) => p.tipo_proceso === "PM").map((p) => p.program_code));
    return programasFiltradosCompleto.filter((p) => codes.has(programCodeKey(p)));
  }, [procesos, programasFiltradosCompleto]);

  const totalProgConPm = listaProgConPm.length;

  const barRegistro = useMemo(() => {
    const tipo: "RC" = "RC";
    const grupos: Record<string, BarRow> = {};
    facultades.forEach((f) => {
      if (programas.some((p) => p.dep_code_facultad === f.dep_code)) {
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
  }, [facultades, programas, programasFiltradosCompleto, procesos]);

  const barAcreditacion = useMemo(() => {
    const tipo: "AV" = "AV";
    const grupos: Record<string, BarRow> = {};
    facultades.forEach((f) => {
      if (programas.some((p) => p.dep_code_facultad === f.dep_code)) {
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
  }, [facultades, programas, programasFiltradosCompleto, procesos]);

  const remindersFiltradosTipo = useMemo(() => {
    return reminders.filter((r) => {
      if (remTipoProceso === "Registro calificado") return r.tipo_proceso === "RC";
      if (remTipoProceso === "Acreditación voluntaria") return r.tipo_proceso === "AV";
      if (remTipoProceso === "Autoevaluación") return r.tipo_proceso === "AE";
      return true;
    });
  }, [reminders, remTipoProceso]);

  /** RC, AV y AE activos que cumplen filtros de alertas. */
  const filasProcesosActivosRcAv = useMemo(() => {
    return procesos
      .filter((p) => p.tipo_proceso === "RC" || p.tipo_proceso === "AV" || p.tipo_proceso === "AE")
      .filter((p) => {
        if (p.tipo_proceso !== "RC") return true;
        const canon = procesoRcActivoDePrograma(procesos, p.program_code);
        return !!canon && canon._id === p._id;
      })
      .map((proc) => {
        const prog = findProgramByCode(programas, proc.program_code);
        return prog ? { proc, prog } : null;
      })
      .filter((x): x is { proc: Process; prog: Program } => x != null)
      .filter(({ prog, proc }) => {
        if (remTipoProceso === "Registro calificado" && proc.tipo_proceso !== "RC") return false;
        if (remTipoProceso === "Acreditación voluntaria" && proc.tipo_proceso !== "AV") return false;
        if (remTipoProceso === "Autoevaluación" && proc.tipo_proceso !== "AE") return false;
        if (!procesoCumpleSubtipoFiltro(proc.subtipo, proc.tipo_proceso, remSubtipo, remTipoProceso)) return false;
        if (remFacultad !== "Todos") {
          const f = facultades.find((x) => x.name === remFacultad);
          if (!f || prog.dep_code_facultad !== f.dep_code) return false;
        }
        if (remPrograma !== "Todos" && prog.nombre !== remPrograma) return false;
        if (remNivel !== "Todos" && prog.nivel_academico !== remNivel) return false;
        return true;
      })
      .sort((a, b) => {
        const n = a.prog.nombre.localeCompare(b.prog.nombre, "es");
        if (n !== 0) return n;
        const orden: Record<string, number> = { RC: 0, AV: 1, AE: 2 };
        return (orden[a.proc.tipo_proceso] ?? 9) - (orden[b.proc.tipo_proceso] ?? 9);
      });
  }, [procesos, programas, remFacultad, remPrograma, remNivel, remTipoProceso, remSubtipo, facultades]);

  /** Planes de Mejoramiento activos (PM) que cumplen filtros de alertas. */
  const filasActivasPM = useMemo(() => {
    return procesos
      .filter((p) => p.tipo_proceso === "PM")
      .map((proc) => {
        const prog = findProgramByCode(programas, proc.program_code);
        return prog ? { proc, prog } : null;
      })
      .filter((x): x is { proc: Process; prog: Program } => x != null)
      .filter(({ prog }) => {
        if (remFacultad !== "Todos") {
          const f = facultades.find((x) => x.name === remFacultad);
          if (!f || prog.dep_code_facultad !== f.dep_code) return false;
        }
        if (remPrograma !== "Todos" && prog.nombre !== remPrograma) return false;
        if (remNivel !== "Todos" && prog.nivel_academico !== remNivel) return false;
        return true;
      })
      .sort((a, b) => a.prog.nombre.localeCompare(b.prog.nombre, "es"));
  }, [procesos, programas, remFacultad, remPrograma, remNivel, facultades]);

  /** Alertas por cierre (RC/AV/AE): solo si aún no hay un proceso activo del mismo tipo en ese programa. */
  const remindersSinActivoMismoTipo = useMemo(() => {
    return remindersFiltradosTipo.filter((r) => {
      if (r.tipo_proceso === "PM") return false; // PM se maneja aparte en remindersActivosPM
      if (!procesoCumpleSubtipoFiltro(r.subtipo, r.tipo_proceso, remSubtipo, remTipoProceso)) return false;
      return !procesos.some((p) => p.program_code === r.program_code && p.tipo_proceso === r.tipo_proceso);
    });
  }, [remindersFiltradosTipo, procesos, remSubtipo]);

  /** Alertas activas del Plan de Mejoramiento (siempre visibles mientras el PM esté activo). */
  const remindersActivosPM = useMemo(() => {
    return reminders
      .filter((r) => r.tipo_proceso === "PM")
      .filter((r) => {
        if (remFacultad !== "Todos") {
          const f = facultades.find((x) => x.name === remFacultad);
          const prog = findProgramByCode(programas, r.program_code);
          if (!f || prog?.dep_code_facultad !== f.dep_code) return false;
        }
        if (remPrograma !== "Todos") {
          const prog = findProgramByCode(programas, r.program_code);
          if (prog?.nombre !== remPrograma) return false;
        }
        return true;
      })
      .sort((a, b) => (a.nombre_programa ?? "").localeCompare(b.nombre_programa ?? "", "es"));
  }, [reminders, remFacultad, remPrograma, facultades, programas]);

  /** Alertas de cierre: más recientes primero (última creada/modificada). */
  const remindersOrdenados = useMemo(
    () =>
      [...remindersSinActivoMismoTipo].sort((a, b) => {
        const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return tb - ta;
      }),
    [remindersSinActivoMismoTipo],
  );

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

  const procesoRows: ProcesoRow[] = useMemo(() => {
    return programasFiltradosCompleto.map((p) => {
      const procRC = getProceso(p, "RC");
      const procAV = getProceso(p, "AV");
      const faseRC = tablePhases.find((f) => mismoId(f.proceso_id, procRC?._id) && f.numero === procRC?.fase_actual);
      const faseAV = tablePhases.find((f) => mismoId(f.proceso_id, procAV?._id) && f.numero === procAV?.fase_actual);
      const allPMs = procesos.filter((pr) => pr.program_code === programCodeKey(p) && pr.tipo_proceso === "PM" && pr.parent_process_id != null);
      const pmProc = allPMs[0] ?? null;
      const parentTipo = pmProc?.parent_tipo_proceso ?? null;
      return {
        programa: p,
        registro: procRC ? procRC.fase_actual : null,
        acreditacion: procAV ? procAV.fase_actual : null,
        pmFase: pmProc ? pmProc.fase_actual : null,
        pmLigadoA: parentTipo,
        pmSubtipo: pmProc?.subtipo ?? null,
        actividadRc: primeraActividadEnFase(faseRC),
        actividadAv: primeraActividadEnFase(faseAV),
      };
    });
  }, [programasFiltradosCompleto, procesos, tablePhases]);

  useEffect(() => {
    if (userRole !== "Administrador" || activeSection !== "main") return;
    if (programa !== "Todos" || facultad === "Todos") {
      setTablePhases([]);
      return;
    }
    const fac = facultades.find((f) => f.name === facultad);
    if (!fac) {
      setTablePhases([]);
      return;
    }
    const progsInFac = programasFiltradosCompleto.filter((p) => p.dep_code_facultad === fac.dep_code);
    /** Solo fase actual por proceso (misma info que usa la tabla); reduce peso de la respuesta. */
    const pairStrs = progsInFac.flatMap((p) => {
      const row: string[] = [];
      const rc = procesoRcActivoDePrograma(procesos, programCodeKey(p));
      const av = procesos.find((x) => x.program_code === programCodeKey(p) && x.tipo_proceso === "AV");
      if (rc) row.push(`${rc._id}:${Number(rc.fase_actual) || 0}`);
      if (av) row.push(`${av._id}:${Number(av.fase_actual) || 0}`);
      return row;
    });
    if (pairStrs.length === 0) {
      setTablePhases([]);
      return;
    }
    setLoadingTablePhases(true);
    const CHUNK = 80;
    const chunks: string[][] = [];
    for (let i = 0; i < pairStrs.length; i += CHUNK) {
      chunks.push(pairStrs.slice(i, i + CHUNK));
    }
    Promise.all(
      chunks.map((batch) =>
        axios
          .get(`${process.env.NEXT_PUBLIC_API_URL}/phases`, {
            params: { proceso_fase_actual: batch.join("|") },
          })
          .then((r) => (Array.isArray(r.data) ? r.data : []) as Phase[])
          .catch(() => [] as Phase[])
      )
    )
      .then((results) => setTablePhases(results.flat()))
      .finally(() => setLoadingTablePhases(false));
  }, [userRole, activeSection, programa, facultad, procesos, facultades, programasFiltradosCompleto]);

  const tituloTabla = `Fase de procesos de programas de ${facultad}`;

  const handleProcesoCreado = async () => {
    const [resProg, resProc] = await Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/processes`),
    ]);
    setProgramas(Array.isArray(resProg.data) ? resProg.data : []);
    setProcesos(Array.isArray(resProc.data) ? resProc.data : []);
  };

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
    setActiveSection("main");

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
    if (pid && (args.tipo === "RC" || args.tipo === "AV" || args.tipo === "AE")) {
      await router.replace(
        processesMenRoutes.homeWithQuery({
          programId: pid,
          gestionar: "1",
          focusTipo: args.tipo,
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
    setPrograma(progObj?.nombre ?? args.nombrePrograma);
    setNivelAcademico("Todos");
    setTipoProceso(
      args.tipo === "RC" ? "Registro calificado" :
      args.tipo === "AV" ? "Acreditación voluntaria" :
      args.tipo === "AE" ? "Autoevaluación" :
      "Todos"
    );
    setSubtipoFiltro("Todos");
  };

  const sidebarW = userRole === "Administrador"
    ? (sidebarCollapsed ? 56 : 208)
    : (sidebarCollapsed ? 48 : 200);

  const abrirAgregarDesdeRecordatorio = (r: ProcessReminderRecord) => {
    const prog = findProgramByCode(programas, r.program_code);
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
    setAgregarProcesoPrefill({
      programId: prog._id,
      tipo: tipo as "RC" | "AV" | "AE",
      excluirNuevo: true,
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
    <div style={{ display: "flex", marginTop: "-50px" }}>

      {/* ── SIDEBAR ── */}
      <Box style={{
        position: "fixed",
        top: sidebarTopPx,
        bottom: 0,
        left: 0,
        width: `${sidebarW}px`,
        borderRight: "1px solid #dee2e6",
        boxSizing: "border-box",
        padding: sidebarCollapsed ? "10px 6px 16px" : "12px 10px 20px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mantine-color-body)",
        zIndex: 50,
      }}>
        <Group justify="flex-end" mb={6} wrap="nowrap" gap={4} style={{ flexShrink: 0 }}>
          <Tooltip label={sidebarCollapsed ? "Expandir menú" : "Contraer menú"} withArrow>
            <ActionIcon
              variant="default"
              size="sm"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={sidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
            >
              {sidebarCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        {userRole === "Administrador" ? (
          <Stack gap={8} style={{ flex: 1, minHeight: 0, overflow: "auto" }} align="stretch">
            {!sidebarCollapsed ? (
              <>
                {processesMenModulo === "procesos" && (
                  <Stack gap={12} pt={8} mt={2}>
                    <Text size="xs" fw={700} c="blue" tt="uppercase" ta="center" style={{ letterSpacing: 0.4 }}>
                      Procesos de calidad MEN
                    </Text>
                    <Stack gap={12}>
                      <Button
                        variant="default"
                        size="md"
                        fullWidth
                        onClick={() => { setActiveSection("main"); setPrograma("Todos"); setNivelAcademico("Todos"); }}
                        styles={navBtnStyles(activeSection === "main")}
                      >
                        Estadisticas<br />generales
                      </Button>
                      <Button
                        variant="default"
                        size="md"
                        fullWidth
                        onClick={() => setActiveSection("alertas")}
                        styles={navBtnStyles(activeSection === "alertas")}
                      >
                        Alerta<br />procesos
                      </Button>
                      <Button
                        variant="default"
                        size="md"
                        fullWidth
                        onClick={() => setActiveSection("historial")}
                        styles={navBtnStyles(activeSection === "historial")}
                      >
                        Historial<br />procesos
                      </Button>
                    </Stack>
                    <Button
                      variant="subtle"
                      color="teal"
                      size="xs"
                      fullWidth
                      mt={4}
                      onClick={() => { irAModuloMen("comunicaciones"); setPqrSeccion("activos"); }}
                    >
                      Comunicaciones MEN
                    </Button>
                  </Stack>
                )}

                {processesMenModulo === "comunicaciones" && (
                  <Stack gap={10} pt={8} mt={2} pb={8}>
                    <Text size="xs" fw={700} c="teal" tt="uppercase" ta="center" style={{ letterSpacing: 0.6 }}>
                      Comunicaciones MEN
                    </Text>
                    <Button
                      variant="default"
                      color="teal"
                      fullWidth
                      onClick={() => setPqrSeccion("agregar")}
                      styles={pqrNavBtnStyles(pqrSeccion === "agregar")}
                    >
                      + Agregar PQR
                    </Button>
                    <Button
                      variant="default"
                      color="teal"
                      fullWidth
                      onClick={() => setPqrSeccion("activos")}
                      styles={pqrNavBtnStyles(pqrSeccion === "activos")}
                    >
                      PQRs activos
                      {pqrs.filter((p) => !p.cerrado).length > 0 && (
                        <Badge size="xs" color="teal" variant="filled" ml={6}>
                          {pqrs.filter((p) => !p.cerrado).length}
                        </Badge>
                      )}
                    </Button>
                    <Button
                      variant="default"
                      color="teal"
                      fullWidth
                      onClick={() => setPqrSeccion("historial")}
                      styles={pqrNavBtnStyles(pqrSeccion === "historial")}
                    >
                      Historial PQR
                    </Button>
                    <Button
                      variant="subtle"
                      color="blue"
                      size="xs"
                      fullWidth
                      mt={6}
                      onClick={() => irAModuloMen("procesos")}
                      styles={{ label: { whiteSpace: "normal", lineHeight: 1.3, textAlign: "center" } }}
                    >
                      Gestión de procesos MEN
                    </Button>
                  </Stack>
                )}
              </>
            ) : (
              <Box
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 0,
                  paddingBlock: 16,
                  gap: 20,
                }}
              >
                {processesMenModulo === "procesos" && (
                  <Stack gap={14} align="center">
                    <Tooltip label="Estadisticas generales" position="right" withArrow>
                      <ActionIcon
                        size="xl"
                        variant={activeSection === "main" ? "filled" : "default"}
                        color="blue"
                        onClick={() => { setActiveSection("main"); setPrograma("Todos"); setNivelAcademico("Todos"); }}
                      >
                        <IconChartBar size={20} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Alertas de procesos" position="right" withArrow>
                      <ActionIcon
                        size="xl"
                        variant={activeSection === "alertas" ? "filled" : "default"}
                        color="blue"
                        onClick={() => setActiveSection("alertas")}
                      >
                        <IconBellRinging size={20} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Historial de procesos" position="right" withArrow>
                      <ActionIcon
                        size="xl"
                        variant={activeSection === "historial" ? "filled" : "default"}
                        color="blue"
                        onClick={() => setActiveSection("historial")}
                      >
                        <IconHistory size={20} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Comunicaciones MEN (PQR)" position="right" withArrow>
                      <ActionIcon
                        size="lg"
                        variant="default"
                        color="teal"
                        onClick={() => { irAModuloMen("comunicaciones"); setPqrSeccion("activos"); }}
                      >
                        <IconMessageCircle size={18} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                  </Stack>
                )}
                {processesMenModulo === "comunicaciones" && (
                  <Stack gap={14} align="center">
                    <Tooltip label="Agregar PQR" position="right" withArrow>
                      <ActionIcon
                        size="lg"
                        variant={pqrSeccion === "agregar" ? "filled" : "default"}
                        color="teal"
                        onClick={() => setPqrSeccion("agregar")}
                      >
                        <IconPlus size={18} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="PQRs activos" position="right" withArrow>
                      <ActionIcon
                        size="lg"
                        variant={pqrSeccion === "activos" ? "filled" : "default"}
                        color="teal"
                        onClick={() => setPqrSeccion("activos")}
                      >
                        <IconList size={18} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Historial PQR" position="right" withArrow>
                      <ActionIcon
                        size="lg"
                        variant={pqrSeccion === "historial" ? "filled" : "default"}
                        color="teal"
                        onClick={() => setPqrSeccion("historial")}
                      >
                        <IconArchive size={18} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Volver a gestión de procesos" position="right" withArrow>
                      <ActionIcon size="lg" variant="default" color="blue" onClick={() => irAModuloMen("procesos")}>
                        <IconChartBar size={18} stroke={1.5} />
                      </ActionIcon>
                    </Tooltip>
                  </Stack>
                )}
              </Box>
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
                            if (n === "Todos") setPrograma("Todos");
                            else {
                              setNivelAcademico("Todos");
                              navegarAFichaProgramaDesdeFiltro(n);
                            }
                          }}
                          searchable={false} styles={selectorStyle} />
                        {programa === "Todos" && (
                          <Select label="Nivel académico" data={opcionesNivelAcademico} value={nivelAcademico}
                            onChange={(v) => setNivelAcademico(v ?? "Todos")} searchable={false} styles={selectorStyle} />
                        )}
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
        title={modalListaProgramas?.titulo ?? ""}
        size="lg"
        radius="md"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        {modalListaProgramas && (
          modalListaProgramas.lista.length === 0 ? (
            <Text size="sm" c="dimmed">No hay programas en esta categoría con el filtro actual.</Text>
          ) : (
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Programa</Table.Th>
                  <Table.Th w={120}>Estado</Table.Th>
                  <Table.Th w={100} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {modalListaProgramas.lista.map((p) => (
                  <Table.Tr key={p._id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>{p.nombre}</Text>
                      {lineasAuxPrograma(p).map((ln, idx) => (
                        <Text key={idx} size="xs" c="dimmed">{ln}</Text>
                      ))}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">{p.estado ?? "—"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => {
                          router.push(processesMenRoutes.program(p._id));
                          setModalListaProgramas(null);
                        }}
                      >
                        Ficha
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )
        )}
      </Modal>

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div style={{ marginLeft: `${sidebarW + 1}px`, flex: 1, padding: "20px", paddingTop: "28px", minHeight: "calc(100vh - 194px)" }}>
        {userRole === "Administrador" && (
          <>
            {processesMenModulo === "comunicaciones" && (
              <Stack gap="md">
                <Box>
                  <Title order={3}>Comunicaciones MEN</Title>
                  <Text size="sm" c="dimmed" mt={4}>Gestión ante el MEN.</Text>
                </Box>
                <Paper withBorder radius="md" p="md" style={{ overflow: "auto" }}>
                  {pqrSeccion === "agregar" && (
                    <PQRAgregarForm programas={programas} onCreado={handlePQRCreado} showHeader />
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
                </Paper>
              </Stack>
            )}

            {processesMenModulo === "procesos" && (
            <>
            {activeSection === "main" && !loadingFilters && programa === "Todos" && (
              <Paper withBorder radius="md" p="sm" mb="md">
                <Flex
                  gap={8}
                  align="flex-end"
                  wrap="nowrap"
                  w="100%"
                  style={{ minWidth: 0, overflowX: "auto", paddingBottom: 2 }}
                >
                  <Select
                    label="Facultad"
                    data={opcionesFacultad}
                    value={facultad}
                    style={{ flex: "1 1 118px", minWidth: 0, maxWidth: 200 }}
                    onChange={handleFacultadChange}
                    searchable={false}
                    styles={selectorStyleFilters}
                  />
                  <Select
                    label="Programa"
                    data={opcionesPrograma}
                    value={programa}
                    style={{ flex: "1.4 1 150px", minWidth: 0, maxWidth: 300 }}
                    searchable
                    onChange={(v) => {
                      const n = v ?? "Todos";
                      if (n === "Todos") setPrograma("Todos");
                      else {
                        setNivelAcademico("Todos");
                        navegarAFichaProgramaDesdeFiltro(n);
                      }
                    }}
                    styles={selectorStyleFilters}
                  />
                  <Select
                    label="Nivel académico"
                    data={opcionesNivelAcademico}
                    value={nivelAcademico}
                    style={{ flex: "0.9 1 108px", minWidth: 0, maxWidth: 185 }}
                    onChange={(v) => setNivelAcademico(v ?? "Todos")}
                    searchable={false}
                    styles={selectorStyleFilters}
                  />
                  <Select
                    label="Tipo de proceso"
                    data={opcionesTipoProceso}
                    value={tipoProceso}
                    style={{ flex: "1 1 128px", minWidth: 0, maxWidth: 235 }}
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
                    style={{ flex: "1 1 118px", minWidth: 0, maxWidth: 200 }}
                    onChange={(v) => setSubtipoFiltro(v ?? "Todos")}
                    searchable={false}
                    styles={selectorStyleFiltersSubtipo}
                  />
                </Flex>
              </Paper>
            )}

            {activeSection === "main" && loadingFilters && (
              <Loader size="sm" mx="auto" display="block" my="xl" />
            )}

            {activeSection === "main" && !loadingFilters && (
            <>
            {programa === "Todos" && <Title ta="center" mb="lg">Estadísticas generales</Title>}

            {programa === "Todos" && (
              <Paper radius="md" p="md" mb="lg" style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
                <Stack gap="sm">
                  {([
                    [
                      { label: "Total de programas académicos activos", valor: totalActivos, lista: listaActivos, titulo: "Programas activos" },
                      { label: "Total de programas inactivos", valor: totalInactivos, lista: listaInactivos, titulo: "Programas inactivos" },
                    ],
                    [
                      { label: "Porcentaje de programas con Registro Calificado", valor: `${pctConRC}%`, lista: listaConRc, titulo: "Programas con RC vigente" },
                      { label: "Porcentaje de programas con Acreditación voluntaria", valor: `${pctConAV}%`, lista: listaConAv, titulo: "Programas con AV vigente" },
                    ],
                    [
                      { label: "Total de programas con Registro Calificado vigente", valor: conRegistro, lista: listaConRc, titulo: "Programas con RC vigente" },
                      { label: "Total de programas con Acreditación voluntaria vigente", valor: conAcreditacion, lista: listaConAv, titulo: "Programas con AV vigente" },
                    ],
                    [
                      { label: "Total de programas con RC de oficio vigente", valor: totalProgRCOficio, lista: listaProgRcOficio, titulo: "Programas con RC de oficio (alerta)" },
                      { label: "Total de programas con plan de mejoramiento", valor: totalProgConPm, lista: listaProgConPm, titulo: "Programas con plan de mejoramiento" },
                    ],
                  ] as const).map((row, ri) => (
                    <SimpleGrid key={ri} cols={{ base: 1, sm: 2 }} spacing="sm">
                      {row.map((c, ci) => (
                        <Paper
                          key={ci}
                          radius="md"
                          p="md"
                          style={{ textAlign: "center", backgroundColor: "white", cursor: "pointer" }}
                          tabIndex={0}
                          role="button"
                          onClick={() => setModalListaProgramas({ titulo: c.titulo, lista: c.lista })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setModalListaProgramas({ titulo: c.titulo, lista: c.lista });
                            }
                          }}
                        >
                          <Text size="sm" fw={600} c="var(--mantine-color-blue-light-color)" td="underline">{c.label}</Text>
                          <Text size="xl" fw={700} c="#228be6" mt={4}>{c.valor}</Text>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  ))}
                  <Paper
                    radius="md"
                    p="md"
                    style={{ textAlign: "center", backgroundColor: "white", cursor: "pointer" }}
                    tabIndex={0}
                    role="button"
                    onClick={() => setModalListaProgramas({ titulo: "Programas del filtro actual", lista: programasFiltradosCompleto })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setModalListaProgramas({ titulo: "Programas del filtro actual", lista: programasFiltradosCompleto });
                      }
                    }}
                  >
                    <Text size="sm" fw={600} c="var(--mantine-color-blue-light-color)" td="underline">Total de programas registrados (filtro actual)</Text>
                    <Text size="xl" fw={700} c="#228be6" mt={4}>{totalProgramas}</Text>
                  </Paper>
                </Stack>
              </Paper>
            )}

            {/* Vista por programa */}
            {programa !== "Todos" && (() => {
              const progObj = programas.find(p => p.nombre === programa);
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
                    <Tooltip label="Volver a alertas" withArrow>
                      <ActionIcon
                        variant="default"
                        size="sm"
                        onClick={() => { setActiveSection("alertas"); }}
                        aria-label="Volver a alertas"
                      >
                        <IconChevronLeft size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Group justify="space-between" align="flex-start" wrap="wrap" gap="md" mt="xs">
                      <Stack gap={6} style={{ flex: 1, minWidth: 200 }}>
                        <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
                          <Anchor
                            href={processesMenRoutes.program(progObj._id)}
                            underline="always"
                            c="dark"
                            style={{ flex: "1 1 10rem", minWidth: 0, lineHeight: 1.25 }}
                          >
                            <Title order={2} component="span" style={{ margin: 0, lineHeight: 1.25 }}>
                              {progObj.nombre}
                            </Title>
                          </Anchor>
                          <Group gap={6} align="flex-start" wrap="nowrap" style={{ flexShrink: 0, maxWidth: "min(100%, 22rem)" }}>
                            {rcActivoEncabezado ? (
                              <Badge size="sm" color="blue" variant="filled" style={{ flexShrink: 0, alignSelf: "center" }}>
                                {rcActivoEncabezado.tipo_proceso}
                              </Badge>
                            ) : null}
                            <Badge size="lg" color={progObj.estado === "Activo" ? "teal" : "gray"} variant="filled" style={{ flexShrink: 0, alignSelf: "center" }}>
                              {progObj.estado === "Activo" ? "ACTIVO" : "INACTIVO"}
                            </Badge>
                            {rcActivoEncabezado?.subtipo ? (
                              <Badge
                                size="sm"
                                variant="outline"
                                color="gray"
                                styles={stylesSubtipoBadgeTabla(rcActivoEncabezado.subtipo)}
                                style={{ flexShrink: 0, alignSelf: "center" }}
                              >
                                {etiquetaSubtipoCompacta(rcActivoEncabezado.subtipo)}
                              </Badge>
                            ) : null}
                          </Group>
                        </Group>
                        {lineasAuxPrograma(progObj).map((ln, i) => (
                          <Text key={i} size="sm" c="dimmed" fw={500}>{ln}</Text>
                        ))}
                      </Stack>
                    </Group>
                    <Divider my="md" />
                  </Box>
                  {(() => {
                    const mostrarRc = tipoProceso === "Todos" || tipoProceso === "Registro calificado";
                    const mostrarAv = tipoProceso === "Todos" || tipoProceso === "Acreditación voluntaria";
                    const mostrarAe = tipoProceso === "Todos" || tipoProceso === "Autoevaluación";
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
                  {/* Planes de Mejoramiento activos — siempre visibles debajo de RC/AV/AE */}
                  {procesosDelProg
                    .filter(p => p.tipo_proceso === "PM")
                    .map(proc => (
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
                    ))}
                </>
              );
            })()}

            {/* Vista por facultad */}
            {programa === "Todos" && facultad !== "Todos" && (loadingProgramas || loadingTablePhases ? (
              <Loader size="sm" mx="auto" display="block" my="lg" />
            ) : (
              <ProcesoTable title={tituloTabla} rows={procesoRows} tipoProceso={tipoProceso} programaFiltro={programa} />
            ))}

            {/* Vista general: barras */}
            {facultad === "Todos" && <>
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
              <VencimientosPorAnoCharts programasBase={programasFiltradosCompleto} />
            </>}
            </>
            )}

            {activeSection === "alertas" && (
              <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                  <Title order={3} mb={0}>Alertas de procesos</Title>
                  <Group gap="xs" wrap="wrap" justify="flex-end">
                    <Button
                      size="sm"
                      variant="light"
                      color="blue"
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
                      color="grape"
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
                      color="green"
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
                <Text size="sm" c="dimmed">
                  Activos: procesos RC, AV, AE y PM en curso. Alertas: recordatorios tras cierre cuando aún no hay proceso activo del mismo tipo.
                </Text>
                {/* Leyenda de colores */}
                <Group gap={8} wrap="wrap">
                  {([
                    { tipo: "RC", label: "Registro calificado", color: ROW_BG_PROCESO.RC, border: "#74c0fc" },
                    { tipo: "AV", label: "Acreditación voluntaria", color: ROW_BG_PROCESO.AV, border: "#b197fc" },
                    { tipo: "PM", label: "Plan de mejoramiento", color: ROW_BG_PROCESO.PM, border: "#9775fa" },
                    { tipo: "AE", label: "Autoevaluación", color: ROW_BG_PROCESO.AE, border: "#74c0fc" },
                  ] as const).map(({ tipo, label, color, border }) => (
                    <Group key={tipo} gap={4} align="center">
                      <Box style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: color, border: `1.5px solid ${border}` }} />
                      <Text size="xs" c="dimmed">{label}</Text>
                    </Group>
                  ))}
                  <Group gap={6} align="center" wrap="wrap">
                    <Text size="xs" c="dimmed" fw={600}>Alerta</Text>
                    {([
                      { c: "#2f9e44", t: "hasta digitación" },
                      { c: "#f59f00", t: "hasta radicado" },
                      { c: "#e03131", t: "hasta vencimiento" },
                      { c: "#868e96", t: "vencida" },
                    ] as const).map((x) => (
                      <Group key={x.t} gap={4} align="center">
                        <Box style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: x.c }} />
                        <Text size="xs" c="dimmed">{x.t}</Text>
                      </Group>
                    ))}
                    <Text size="xs" c="dimmed">— fila como el tipo (RC/AV/…); badge y «Crear proceso» siguen este semáforo.</Text>
                  </Group>
                </Group>
                {!loadingFilters ? (
                  <Paper withBorder radius="md" p="sm">
                    <Flex
                      gap={8}
                      align="flex-end"
                      wrap="nowrap"
                      w="100%"
                      style={{ minWidth: 0, overflowX: "auto", paddingBottom: 2 }}
                    >
                      <Select label="Facultad" data={opcionesFacultad} value={remFacultad}
                        style={{ flex: "1 1 118px", minWidth: 0, maxWidth: 220 }}
                        onChange={handleRemFacultadChange} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Programa" data={opcionesRemPrograma} value={remPrograma}
                        style={{ flex: "1.25 1 150px", minWidth: 0, maxWidth: 300 }}
                        onChange={(v) => { setRemPrograma(v ?? "Todos"); setRemSubtipo("Todos"); }} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Nivel académico" data={opcionesNivelAcademico} value={remNivel}
                        style={{ flex: "0.95 1 108px", minWidth: 0, maxWidth: 190 }}
                        onChange={(v) => setRemNivel(v ?? "Todos")} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Por proceso (tipo)" data={opcionesTipoProceso} value={remTipoProceso}
                        style={{ flex: "1 1 128px", minWidth: 0, maxWidth: 240 }}
                        onChange={(v) => { setRemTipoProceso(v ?? "Todos"); setRemSubtipo("Todos"); }} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Subtipo" data={opcionesRemSubtipoData} value={remSubtipo}
                        style={{ flex: "1 1 118px", minWidth: 0, maxWidth: 200 }}
                        onChange={(v) => setRemSubtipo(v ?? "Todos")} searchable={false} styles={selectorStyleFiltersSubtipo} />
                    </Flex>
                  </Paper>
                ) : (
                  <Loader size="sm" />
                )}
                {loadingReminders ? (
                  <Loader size="sm" mx="auto" display="block" my="lg" />
                ) : (
                  <Stack gap="xl">
                    {/* ══ TABLA 1: RC / AV / AE activos + alertas de cierre ══ */}
                    <div>
                      <Text size="sm" fw={600} mb={6} c="dimmed">Procesos activos y alertas de vencimiento</Text>
                      <div style={{ width: "100%", minWidth: 0, overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                          <colgroup>
                            <col style={{ width: "16%" }} />
                            <col style={{ width: "26%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "7.5%" }} />
                            <col style={{ width: "7.5%" }} />
                            <col style={{ width: "7.5%" }} />
                            <col style={{ width: "7.5%" }} />
                            <col style={{ width: "8%" }} />
                            <col style={{ width: "14%" }} />
                          </colgroup>
                          <thead>
                            <tr style={{ borderBottom: "2px solid #dee2e6", backgroundColor: "#f8f9fa" }}>
                              {(
                                [
                                  "Programa",
                                  "Tipo",
                                  "Acto admin.",
                                  "Venc.",
                                  "Inicio",
                                  "Digit.",
                                  "Rad.",
                                  "Documento acto admin.",
                                  "Acciones",
                                ] as const
                              ).map((h) => {
                                const isFechaCol = h === "Venc." || h === "Inicio" || h === "Digit." || h === "Rad.";
                                const isDocCol = h === "Documento acto admin.";
                                return (
                                  <th
                                    key={h}
                                    style={{
                                      padding: isFechaCol ? "8px 6px" : "8px 10px",
                                      textAlign: h === "Acciones" || isFechaCol || isDocCol ? "center" : "left",
                                      fontSize: isFechaCol ? 12 : 13,
                                      fontWeight: 700,
                                      whiteSpace: isDocCol ? "normal" : "nowrap",
                                      lineHeight: 1.2,
                                      verticalAlign: "middle",
                                      maxWidth: isDocCol ? "5.5rem" : undefined,
                                    }}
                                  >
                                    {h}
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {/* ── Procesos RC / AV / AE activos ── */}
                            {filasProcesosActivosRcAv.map(({ proc, prog }) => {
                              const codigoActo =
                                proc.tipo_proceso === "RC" ? (prog.codigo_resolucion_rc ?? "—")
                                : proc.tipo_proceso === "AV" ? (prog.codigo_resolucion_av ?? "—")
                                : "—";
                              const fechaActo =
                                proc.tipo_proceso === "RC" ? prog.fecha_resolucion_rc
                                : proc.tipo_proceso === "AV" ? prog.fecha_resolucion_av
                                : null;
                              const rowBg = ROW_BG_PROCESO[proc.tipo_proceso] ?? "#fafbff";
                              const badgeColor = proc.tipo_proceso === "RC" ? "blue" : proc.tipo_proceso === "AV" ? "violet" : "teal";
                              return (
                                <tr key={`act-${proc._id}`} style={{ borderBottom: "1px solid #e9ecef", backgroundColor: rowBg }}>
                                  <td style={{ padding: "8px 10px", fontSize: 13, verticalAlign: "middle", wordBreak: "break-word" }}>
                                    <Anchor href={processesMenRoutes.program(prog._id)} size="sm" fw={600} style={{ wordBreak: "break-word", fontSize: 13 }}>
                                      {prog.nombre}
                                    </Anchor>
                                  </td>
                                  <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>
                                    <div style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 6 }}>
                                      <Badge size="sm" color={badgeColor} variant="filled" style={{ flexShrink: 0 }}>{proc.tipo_proceso}</Badge>
                                      {proc.subtipo && (
                                        <Badge size="sm" variant="outline" color="gray" styles={stylesSubtipoBadgeTabla(proc.subtipo)} style={{ flexShrink: 0 }}>
                                          {etiquetaSubtipoCompacta(proc.subtipo)}
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 13, verticalAlign: "middle" }}>
                                    <Stack gap={2}>
                                      <Text size="sm" ff="monospace">{codigoActo}</Text>
                                      {fechaActo && <Text size="sm" c="dimmed">{formatFechaDDMMYY(fechaActo)}</Text>}
                                    </Stack>
                                  </td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(proc.fecha_vencimiento)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(proc.fecha_inicio)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(proc.fecha_digitacion_saces)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(proc.fecha_radicado_men)}</td>
                                  <td style={{ padding: "8px 10px", fontSize: 13, verticalAlign: "middle", textAlign: "center" }}>{celdaGuionCentrado}</td>
                                  <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle" }}>
                                    <Button size="sm" variant="light" onClick={() => irAGestionarProcesoDesdeModal({
                                      nombrePrograma: prog.nombre,
                                      tipo: proc.tipo_proceso as "RC" | "AV" | "AE",
                                      dep_code_programa: prog.dep_code_programa ?? undefined,
                                      dep_code_facultad: prog.dep_code_facultad ?? undefined,
                                    })}>
                                      Gestionar
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}

                            {/* ── Alertas por cierre de RC / AV / AE ── */}
                            {remindersOrdenados.map((r) => {
                              const prog = findProgramByCode(programas, r.program_code);
                              const rowBg = ROW_BG_PROCESO[r.tipo_proceso] ?? "#fafbff";
                              const badgeTipoColor = r.tipo_proceso === "RC" ? "blue" : r.tipo_proceso === "AV" ? "violet" : r.tipo_proceso === "PM" ? "grape" : "teal";
                              const sema = nivelSemaforoAlerta(r);
                              const mantineSemaAlerta = sema;
                              return (
                                <tr key={r._id} style={{ borderBottom: "1px solid #e9ecef", backgroundColor: rowBg }}>
                                  <td style={{ padding: "8px 10px", fontSize: 13, verticalAlign: "middle", wordBreak: "break-word" }}>
                                    {prog ? (
                                      <Anchor href={processesMenRoutes.program(prog._id)} size="sm" fw={600} style={{ wordBreak: "break-word", fontSize: 13 }}>
                                        {r.nombre_programa}
                                      </Anchor>
                                    ) : (
                                      <Text size="sm" fw={600}>{r.nombre_programa}</Text>
                                    )}
                                  </td>
                                  <td style={{ padding: "8px 10px", verticalAlign: "middle" }}>
                                    <div style={{ display: "flex", alignItems: "center", flexWrap: "nowrap", gap: 6 }}>
                                      <Badge size="sm" color={badgeTipoColor} variant="filled" style={{ flexShrink: 0 }}>{r.tipo_proceso}</Badge>
                                      <Badge size="sm" variant="filled" color={mantineSemaAlerta} style={{ flexShrink: 0 }}>Alerta</Badge>
                                      {r.subtipo ? (
                                        <Badge size="sm" variant="outline" color="gray" styles={stylesSubtipoBadgeTabla(r.subtipo)} style={{ flexShrink: 0 }}>
                                          {etiquetaSubtipoCompacta(r.subtipo)}
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 13, verticalAlign: "middle" }}>
                                    <Stack gap={2}>
                                      <Text size="sm" ff="monospace">{r.codigo_resolucion ?? "—"}</Text>
                                      {r.fecha_resolucion && <Text size="sm" c="dimmed">{formatFechaDDMMYY(r.fecha_resolucion)}</Text>}
                                    </Stack>
                                  </td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.fecha_vencimiento)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.fecha_inicio)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.fecha_digitacion_saces)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(r.fecha_radicado_men)}</td>
                                  <td style={{ padding: "8px 10px", fontSize: 13, verticalAlign: "middle", textAlign: "center", minWidth: 0 }}>
                                    {r.documentos?.length ? (
                                      <Stack gap={6} align="center">
                                        {(r.documentos ?? []).map((d, i) => (
                                          <Anchor
                                            key={i}
                                            href={d.view_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            size="sm"
                                            fw={600}
                                            title={d.name}
                                            aria-label={`Abrir documento: ${d.name}`}
                                          >
                                            {(r.documentos ?? []).length > 1 ? `Ver (${i + 1})` : "Ver"}
                                          </Anchor>
                                        ))}
                                      </Stack>
                                    ) : (
                                      celdaGuionCentrado
                                    )}
                                  </td>
                                  <td style={{ padding: "8px 10px", textAlign: "center", verticalAlign: "middle", minWidth: 0, overflow: "visible" }}>
                                    {prog && (
                                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                                        <Button
                                          size="sm"
                                          variant="filled"
                                          color={mantineSemaAlerta}
                                          styles={{
                                            root: {
                                              maxWidth: "100%",
                                              width: "auto",
                                              minWidth: 0,
                                              minHeight: 34,
                                              padding: "8px 12px",
                                              display: "inline-flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                            },
                                            inner: {
                                              justifyContent: "center",
                                              alignItems: "center",
                                            },
                                            label: {
                                              lineHeight: 1.2,
                                              textAlign: "center",
                                              fontSize: 13,
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                            },
                                          }}
                                          onClick={() => abrirAgregarDesdeRecordatorio(r)}
                                        >
                                          Crear proceso
                                        </Button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                            {filasProcesosActivosRcAv.length === 0 && remindersOrdenados.length === 0 && (
                              <tr>
                                <td colSpan={9} style={{ padding: 12, textAlign: "center", color: "#868e96", fontSize: 13 }}>
                                  No hay procesos ni alertas con estos filtros.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* ══ TABLA 2: Planes de Mejoramiento activos ══ */}
                    {filasActivasPM.length > 0 && (
                      <div>
                        <Text size="sm" fw={600} mb={6} c="dimmed">Planes de Mejoramiento activos</Text>
                        <div style={{ width: "100%" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                            <thead>
                              <tr style={{ borderBottom: "2px solid #dee2e6", backgroundColor: "#f8f9fa" }}>
                                {[
                                  "Programa",
                                  "Tipo / Padre",
                                  "Env. PM Vicerrec.",
                                  "Entrega PM CNA",
                                  "Env. Avance Vicerrec.",
                                  "Radicación Avance CNA",
                                  "Acciones",
                                ].map((h) => (
                                  <th key={h} style={{ padding: "7px 8px", textAlign: h === "Acciones" ? "right" : "left", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", verticalAlign: "middle" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {/* Proceso PM activo (para gestión) */}
                              {filasActivasPM.map(({ proc, prog }) => (
                                <tr key={`pm-${proc._id}`} style={{ borderBottom: "1px solid #e9ecef", backgroundColor: ROW_BG_PROCESO["PM"] }}>
                                  <td style={{ padding: "6px 8px", fontSize: 12, maxWidth: 200, verticalAlign: "middle" }}>
                                    <Anchor href={processesMenRoutes.program(prog._id)} size="sm" fw={600} style={{ wordBreak: "break-word" }}>
                                      {prog.nombre}
                                    </Anchor>
                                  </td>
                                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                                    <Group gap={4} wrap="nowrap" align="center">
                                      <Badge size="xs" color="grape" variant="filled">PM</Badge>
                                      <Badge size="xs" variant="light" color="cyan">Activo</Badge>
                                      {proc.parent_tipo_proceso && (
                                        <Badge size="xs" variant="outline" color="gray" styles={{ label: { textTransform: "none" } }}>
                                          De {proc.parent_tipo_proceso}
                                        </Badge>
                                      )}
                                    </Group>
                                  </td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(proc.fecha_envio_pm_vicerrectoria)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(proc.fecha_entrega_pm_cna)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(proc.fecha_envio_avance_vicerrectoria)}</td>
                                  <td style={tdFechaTablaAlertas}>{formatFechaDDMMYY(proc.fecha_radicacion_avance_cna)}</td>
                                  <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                                    <Button size="xs" variant="light" color="grape" onClick={() => irAGestionarProcesoDesdeModal({
                                      nombrePrograma: prog.nombre,
                                      tipo: "PM",
                                      dep_code_programa: prog.dep_code_programa ?? undefined,
                                      dep_code_facultad: prog.dep_code_facultad ?? undefined,
                                    })}>
                                      Gestionar PM
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </Stack>
                )}
              </Stack>
            )}

            {activeSection === "historial" && (
              <>
                <Title order={3} mb="md">Historial de procesos</Title>
                <Paper withBorder radius="md" p="sm" mb="md">
                  <Group gap="sm" wrap="wrap" align="flex-end">
                    <Select placeholder="Todas las facultades" data={historialOpcionesFacultad}
                      value={historialFiltroFacultad} onChange={setHistorialFiltroFacultad} clearable size="xs" w={220}
                      styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                    <Select placeholder="Todos los programas"
                      data={historialOpcionesPrograma}
                      value={historialFiltroPrograma} onChange={setHistorialFiltroPrograma} clearable searchable size="xs" w={240}
                      styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                    {(historialFiltroFacultad || historialFiltroPrograma) && (
                      <Button size="xs" variant="subtle" color="gray"
                        onClick={() => { setHistorialFiltroFacultad(null); setHistorialFiltroPrograma(null); }}>
                        Limpiar filtros
                      </Button>
                    )}
                  </Group>
                </Paper>
                {loadingHistorial ? (
                  <Loader size="sm" mx="auto" display="block" my="lg" />
                ) : (
                  <div style={{ width: "100%" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
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
                        <tr style={{ borderBottom: "2px solid #dee2e6", backgroundColor: "#f8f9fa" }}>
                          {["Programa", "Proceso", "Solicitud", "Resolución · Vigencia", "Vencimiento", "Fase al cierre", "Cerrado", ""].map((h) => (
                            <th key={h} style={{ padding: "7px 8px", textAlign: h === "" ? "center" : "left", fontSize: 12, fontWeight: 700, verticalAlign: "middle" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          /* Construir mapa historialId → PM historial para mostrar PM ligado */
                          const pmHistorialMap = new Map(
                            historialProcesosOrdenado
                              .filter((r) => r.tipo_proceso === "PM" && r.parent_history_id)
                              .map((r) => [r.parent_history_id!, r])
                          );
                          /* Solo mostrar registros que NO sean PM independientes (los PM se muestran dentro de AV/AE) */
                          const registrosFiltrados = historialProcesosOrdenado
                            .filter((r) => r.tipo_proceso !== "PM" || !r.parent_history_id)
                            .filter((r) => !historialFiltroFacultad || r.dep_code_facultad === historialFiltroFacultad)
                            .filter((r) => !historialFiltroPrograma || r.nombre_programa === historialFiltroPrograma);

                          if (registrosFiltrados.length === 0) {
                            return (
                              <tr>
                                <td colSpan={8} style={{ padding: 12, textAlign: "center", color: "#868e96", fontSize: 13 }}>
                                  No hay registros en el historial
                                </td>
                              </tr>
                            );
                          }
                          return registrosFiltrados.map((r) => {
                            const pmHist = pmHistorialMap.get(r._id);
                            const tienepmActivo = !!r.pm_proceso_id;
                            const rowBg = ROW_BG_PROCESO[r.tipo_proceso] ?? "#fff";
                            const badgeColor = r.tipo_proceso === "RC" ? "blue" : r.tipo_proceso === "AV" ? "violet" : r.tipo_proceso === "AE" ? "teal" : "green";
                            return (
                              <>
                                <tr key={r._id} style={{ borderBottom: pmHist ? "none" : "1px solid #e9ecef", backgroundColor: rowBg }}>
                                  <td style={{ padding: "6px 8px", fontSize: 12, maxWidth: 200, verticalAlign: "middle" }}>{r.nombre_programa}</td>
                                  <td style={{ padding: "6px 8px", minWidth: 0, verticalAlign: "middle" }}>
                                    <Group gap={4} wrap="nowrap" align="center" style={{ width: "fit-content", maxWidth: "100%", minWidth: 0 }}>
                                      <Badge size="xs" color={badgeColor} variant="filled" style={{ flexShrink: 0 }}>{r.tipo_proceso}</Badge>
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
                                    <Button size="xs" variant="subtle" onClick={() => setHistorialDetalle(r)}>Ver</Button>
                                  </td>
                                </tr>
                                {/* Sub-fila del PM cerrado (cuando AV/AE tiene PM cerrado) */}
                                {pmHist && (
                                  <tr key={`pm-${pmHist._id}`} style={{ borderBottom: "1px solid #e9ecef", backgroundColor: ROW_BG_PROCESO.PM }}>
                                    <td style={{ padding: "4px 8px 4px 24px", fontSize: 11, color: "#555" }}>
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
                                      <Button size="xs" variant="subtle" color="grape" onClick={() => setHistorialDetalle(pmHist)}>Ver</Button>
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
      <Modal opened={historialDetalle !== null} onClose={() => setHistorialDetalle(null)}
        title={historialDetalle ? `${historialDetalle.nombre_programa} — ${LABEL_PROCESO[historialDetalle.tipo_proceso]}` : ""}
        size="calc(100vw - 2rem)"
        centered
        radius="md"
        styles={{
          content: { maxWidth: "min(96vw, 1420px)", width: "100%" },
          body: { overflowX: "hidden" },
        }}>
        {historialDetalle && (
          <Stack gap="sm">
            <Group gap="xs" align="flex-start" wrap="wrap">
              <Badge color="blue" variant="light" size="sm">{LABEL_PROCESO[historialDetalle.tipo_proceso]}</Badge>
              {historialDetalle.subtipo && (
                <Badge color="gray" variant="outline" size="sm" styles={stylesSubtipoLargo}>
                  {etiquetaSubtipoCompacta(historialDetalle.subtipo)}
                </Badge>
              )}
              {historialDetalle.condicion && (
                <Badge color="violet" variant="light" size="sm">
                  {historialDetalle.tipo_proceso === "RC" ? "Condición" : "Factor"} {historialDetalle.condicion}
                </Badge>
              )}
              {(historialDetalle.estado_solicitud ?? "APROBADO") === "NEGADO" ? (
                <Badge color="red" variant="light" size="sm">Solicitud negada</Badge>
              ) : (
                <Badge color="teal" variant="light" size="sm">Solicitud aprobada</Badge>
              )}
            </Group>

            {historialDetalle.tipo_proceso === "AV" && historialDetalle.av_rc_oficio_modo === "pendiente" && (
              <Text size="xs" c="dimmed">
                El RC anterior se prolonga en la ficha mientras se espera el RC de oficio. En el historial de Registro calificado queda una fila <strong>Vigencia transitoria</strong> (solo archivo, sin proceso gestionable).
              </Text>
            )}
            {historialDetalle.tipo_proceso === "RC" && historialDetalle.subtipo === "Vigencia transitoria" && (
              <Text size="xs" c="dimmed">
                <strong>Vigencia transitoria (RC)</strong>: registro solo de archivo. No corresponde a un trámite que se cree ni se gestione aquí; prolonga en la ficha la vigencia del RC que estaba vigente al cerrar la acreditación vinculada, hasta que abras el «Registro calificado de oficio» desde la alerta de ese RC.
              </Text>
            )}
            {historialDetalle.tipo_proceso === "RC" && esSubtipoReformaCurricularSoloHistorial(historialDetalle.subtipo) && (
              <Text size="xs" c="dimmed">
                <strong>Reforma curricular</strong>: no genera resolución MEN ni alerta. La constancia y la ficha quedan en este cierre.
              </Text>
            )}
            {historialDetalle.tipo_proceso === "RC" && esSubtipoRenovacionReformaHistorial(historialDetalle.subtipo) && (
              <Text size="xs" c="dimmed">
                <strong>Renovación + reforma</strong>: actualiza vigencia y genera alerta. Un mismo PDF del cierre figura como resolución y constancia.
              </Text>
            )}
            {historialDetalle.tipo_proceso === "RC" && historialDetalle.subtipo === "Registro calificado de oficio" && (
              <Text size="xs" c="dimmed">
                <strong>RC de oficio</strong>: sin trámite gestionado. Solo resolución, vigencia y fecha de cierre.
              </Text>
            )}

            {historialDetalle.tipo_proceso === "RC" && esSubtipoReformaHistorial(historialDetalle.subtipo) && (
              <>
                {historialDetalle.programa_ficha_al_cierre ? (
                  <HistorialReformaFicha
                    ficha={historialDetalle.programa_ficha_al_cierre}
                    codigoProgramaRespaldo={
                      findProgramByCode(programas, historialDetalle.program_code)?.dep_code_programa ?? null
                    }
                  />
                ) : null}
                <HistorialReformaCambios cambios={historialDetalle.programa_cambios ?? []} />
              </>
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
                <Divider label="Resolución — Registro calificado de oficio" labelPosition="left" />
                <SimpleGrid cols={3} spacing="sm">
                  {[
                    { label: "Código (RC de oficio)", value: historialDetalle.rc_oficio.codigo_resolucion },
                    { label: "Fecha (RC de oficio)",  value: historialDetalle.rc_oficio.fecha_resolucion ? formatFechaDDMMYY(historialDetalle.rc_oficio.fecha_resolucion) : null },
                    { label: "Duración",               value: historialDetalle.rc_oficio.duracion_resolucion != null ? `${historialDetalle.rc_oficio.duracion_resolucion} años` : null },
                  ].map(({ label, value }) => (
                    <Paper key={label} withBorder radius="sm" p="sm">
                      <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                      <Text size="sm" fw={600}>{value ?? "—"}</Text>
                    </Paper>
                  ))}
                </SimpleGrid>
                {historialDetalle.rc_oficio.documentos?.length > 0 && (
                  <Stack gap={4} mt="xs">
                    {historialDetalle.rc_oficio.documentos.map((d, i) => (
                      <Anchor key={i} href={d.view_link} target="_blank" size="sm" fw={500}>📄 {d.name}</Anchor>
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
              <Paper withBorder radius="sm" p="sm" style={{ backgroundColor: "#fff9e6" }}>
                <Text size="xs" c="dimmed" mb={2}>Observaciones generales</Text>
                <Text size="sm">{historialDetalle.observaciones}</Text>
              </Paper>
            )}

            {historialDetalle.pm_ligado && (
              <>
                <Divider label="Plan de Mejoramiento (activo al cierre)" labelPosition="left" />
                <Group gap="xs" mb={4}>
                  <Badge color="green" variant="light" size="sm">Activo al cierre</Badge>
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
                    <Paper key={label} withBorder radius="sm" p="sm">
                      <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                      <Text size="sm" fw={600}>{value ?? "—"}</Text>
                    </Paper>
                  ))}
                </SimpleGrid>
                {historialDetalle.pm_ligado.observaciones && (
                  <Paper withBorder radius="sm" p="sm" style={{ backgroundColor: "#f0fff4" }}>
                    <Text size="xs" c="dimmed" mb={2}>Observaciones del plan</Text>
                    <Text size="sm">{historialDetalle.pm_ligado.observaciones}</Text>
                  </Paper>
                )}
              </>
            )}

            <Divider label="Fases y documentos" labelPosition="left" />
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
