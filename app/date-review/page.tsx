"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Title, Select, Button, Text, Paper, Box, SimpleGrid, Group, Flex,
  Loader, Modal, TextInput, Stack, Divider, Badge, Anchor, ScrollArea, Collapse,
  ActionIcon, Tooltip,
} from "@mantine/core";
import { useRole } from "@/app/context/RoleContext";
import { useRouter } from "next/navigation";
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
} from "@tabler/icons-react";

import type { Dependency, Program, Process, Phase, ProcessHistoryRecord, ProcessReminderRecord, ProcesoRow, BarRow, PQR } from "./types";
import {
  LABEL_PROCESO,
  selectorStyle,
  selectorStyleFilters,
  subtipoOpcionesFiltro,
  procesoCumpleSubtipoFiltro,
  etiquetaSubtipoCompacta,
} from "./constants";
import { formatFechaDDMMYY } from "./utils/formatFechaCorta";
import { mismoId } from "./utils/idMongoose";
import FaseBadge from "./components/FaseBadge";
import BarTable from "./components/BarTable";
import ProcesoTable from "./components/ProcesoTable";
import ProcesoDetalleCard from "./components/ProcesoDetalleCard";
import AgregarProcesoModal, { type AgregarProcesoPrefill } from "./components/AgregarProcesoModal";
import AgregarPQRModal from "./components/AgregarPQRModal";
import PQRListModal from "./components/PQRListModal";
import PQRHistorialModal from "./components/PQRHistorialModal";

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

const DateReviewPage = () => {
  const { userRole } = useRole();
  const router = useRouter();

  const [facultad, setFacultad]             = useState<string>("Todos");
  const [programa, setPrograma]             = useState<string>("Todos");
  const [nivelAcademico, setNivelAcademico] = useState<string>("Todos");
  const [tipoProceso, setTipoProceso]       = useState<string>("Todos");
  const [subtipoFiltro, setSubtipoFiltro]   = useState<string>("Todos");
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

  /* ── Ventanas de gestión ── */
  const [agregarProcesoPrefill, setAgregarProcesoPrefill] = useState<AgregarProcesoPrefill | null>(null);

  /* ── PQR ── */
  const [pqrs, setPqrs]                     = useState<PQR[]>([]);
  const [agregarPQROpen, setAgregarPQROpen] = useState(false);
  const [listaPQROpen, setListaPQROpen]     = useState(false);
  const [historialPQROpen, setHistorialPQROpen] = useState(false);

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
    setListaPQROpen(true);
  };

  const handlePQRActualizado = (updated: PQR) =>
    setPqrs(prev => prev.map(p => p._id === updated._id ? updated : p));

  const handlePQRCerrado = async (id: string) => {
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pqr/${id}/cerrar`);
      setPqrs(prev => prev.map(p => p._id === id ? res.data as PQR : p));
    } catch (e) { console.error(e); }
  };

  const handlePQREliminar = async (id: string) => {
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/pqr/${id}`);
      setPqrs(prev => prev.filter(p => p._id !== id));
    } catch (e) { console.error(e); }
  };

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
      setListaPQROpen(false);
      setAgregarPQROpen(false);
      setHistorialPQROpen(false);
    };
    window.addEventListener("date-review-reset", onReset);
    return () => window.removeEventListener("date-review-reset", onReset);
  }, []);

  useEffect(() => {
    if (loadingFilters || programas.length === 0 || facultades.length === 0) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("programId");
    if (!pid) return;
    const pr = programas.find((p) => p._id === pid);
    if (!pr) return;
    /* Sin gestionar: ficha del programa. Con gestionar=1: tablero con vista de procesos de ese programa. */
    if (params.get("gestionar") !== "1") {
      router.replace(`/date-review/program/${encodeURIComponent(pid)}`);
      return;
    }
    const fac = facultades.find((f) => f.dep_code === pr.dep_code_facultad);
    if (fac) setFacultad(fac.name);
    setPrograma(pr.nombre);
    setNivelAcademico("Todos");
    setTipoProceso("Todos");
    setSubtipoFiltro("Todos");
    setActiveSection("main");
    window.history.replaceState({}, "", window.location.pathname);
  }, [loadingFilters, programas, facultades, router]);

  useEffect(() => {
    const opts = subtipoOpcionesFiltro(tipoProceso as "Todos" | "Registro calificado" | "Acreditación voluntaria");
    if (subtipoFiltro !== "Todos" && !opts.includes(subtipoFiltro)) setSubtipoFiltro("Todos");
  }, [tipoProceso, subtipoFiltro]);

  useEffect(() => {
    const opts = subtipoOpcionesFiltro(remTipoProceso as "Todos" | "Registro calificado" | "Acreditación voluntaria");
    if (remSubtipo !== "Todos" && !opts.includes(remSubtipo)) setRemSubtipo("Todos");
  }, [remTipoProceso, remSubtipo]);

  useEffect(() => {
    if (userRole !== "Administrador" || activeSection !== "alertas") return;
    setLoadingReminders(true);
    const fac = remFacultad !== "Todos" ? facultades.find((f) => f.name === remFacultad) : null;
    const prog = remPrograma !== "Todos" ? programas.find((p) => p.nombre === remPrograma) : null;
    const params: Record<string, string> = {};
    if (fac) params.dep_code_facultad = fac.dep_code;
    if (prog) params.program_code = prog.dep_code_programa;
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

  useEffect(() => {
    if (programa === "Todos") { setFases([]); return; }
    const prog = programas.find(p => p.nombre === programa);
    if (!prog) return;
    const procesosDelPrograma = procesos.filter(p => p.program_code === prog.dep_code_programa);
    if (procesosDelPrograma.length === 0) return;
    const ids = procesosDelPrograma.map((p) => p._id);
    setLoadingFases(true);
    const CHUNK = 80;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    Promise.all(
      chunks.map((batch) =>
        axios
          .get(`${process.env.NEXT_PUBLIC_API_URL}/phases`, { params: { proceso_ids: batch.join(',') } })
          .then((r) => (Array.isArray(r.data) ? r.data : []) as Phase[])
          .catch(() => [] as Phase[])
      )
    )
      .then((results) => setFases(results.flat()))
      .finally(() => setLoadingFases(false));
  }, [programa, programas, procesos]);

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
    router.push(`/date-review/program/${encodeURIComponent(p._id)}`);
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
    () => subtipoOpcionesFiltro(remTipoProceso as "Todos" | "Registro calificado" | "Acreditación voluntaria"),
    [remTipoProceso],
  );

  const programasFiltrados = useMemo(() => {
    if (facultad === "Todos") return programas;
    const fac = facultades.find((f) => f.name === facultad);
    if (!fac) return [];
    return programas.filter((p) => p.dep_code_facultad === fac.dep_code);
  }, [facultad, programas, facultades]);

  const getProceso = (dep_code_programa: string, tipo: "RC" | "AV" | "PM"): Process | undefined =>
    procesos.find((p) => p.program_code === dep_code_programa && p.tipo_proceso === tipo);

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
    () => ["Todos", ...["Acreditación voluntaria", "Registro calificado"].sort((a, b) => a.localeCompare(b, "es"))],
    [],
  );

  const opcionesSubtipoFiltro = useMemo(
    () => subtipoOpcionesFiltro(tipoProceso as "Todos" | "Registro calificado" | "Acreditación voluntaria"),
    [tipoProceso],
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
        const rc = procesos.find((x) => x.program_code === p.dep_code_programa && x.tipo_proceso === "RC");
        const av = procesos.find((x) => x.program_code === p.dep_code_programa && x.tipo_proceso === "AV");
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

  const totalActivos    = programasFiltradosCompleto.filter((p) => p.estado === "Activo").length;
  const totalInactivos  = programasFiltradosCompleto.filter((p) => p.estado === "Inactivo").length;
  const conRegistro     = programasFiltradosCompleto.filter((p) => p.fecha_resolucion_rc).length;
  const conAcreditacion = programasFiltradosCompleto.filter((p) => p.fecha_resolucion_av).length;
  const totalProgramas  = programasFiltradosCompleto.length;
  const pctAcreditados  = totalProgramas > 0 ? Math.round((conAcreditacion / totalProgramas) * 100) : 0;

  const barRegistro = useMemo(() => {
    const tipo: "RC" = "RC";
    const grupos: Record<string, BarRow> = {};
    facultades.forEach((f) => {
      if (programas.some((p) => p.dep_code_facultad === f.dep_code)) {
        grupos[f.dep_code] = {
          nombre: f.name,
          dep_code: f.dep_code,
          fase_0: 0, fase_1: 0, fase_2: 0, fase_3: 0, fase_4: 0, fase_5: 0, fase_6: 0,
          fase_contingencia: 0,
        };
      }
    });
    programasFiltradosCompleto.forEach((p) => {
      if (!grupos[p.dep_code_facultad]) return;
      const proc = getProceso(p.dep_code_programa, tipo);
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
          fase_contingencia: 0,
        };
      }
    });
    programasFiltradosCompleto.forEach((p) => {
      if (!grupos[p.dep_code_facultad]) return;
      const proc = getProceso(p.dep_code_programa, tipo);
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

  const remindersFiltradosTipo = useMemo(() => {
    return reminders.filter((r) => {
      if (remTipoProceso === "Registro calificado") return r.tipo_proceso === "RC";
      if (remTipoProceso === "Acreditación voluntaria") return r.tipo_proceso === "AV";
      return true;
    });
  }, [reminders, remTipoProceso]);

  /** Todos los RC/AV activos (Renovación, Nuevo, etc.) que cumplen filtros de alertas. */
  const filasProcesosActivosRcAv = useMemo(() => {
    return procesos
      .filter((p) => p.tipo_proceso === "RC" || p.tipo_proceso === "AV")
      .map((proc) => {
        const prog = programas.find((x) => x.dep_code_programa === proc.program_code);
        return prog ? { proc, prog } : null;
      })
      .filter((x): x is { proc: Process; prog: Program } => x != null)
      .filter(({ prog, proc }) => {
        if (remTipoProceso === "Registro calificado" && proc.tipo_proceso !== "RC") return false;
        if (remTipoProceso === "Acreditación voluntaria" && proc.tipo_proceso !== "AV") return false;
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
        const ta = a.proc.tipo_proceso === "RC" ? 0 : 1;
        const tb = b.proc.tipo_proceso === "RC" ? 0 : 1;
        return ta - tb;
      });
  }, [procesos, programas, remFacultad, remPrograma, remNivel, remTipoProceso, remSubtipo, facultades]);

  /** Alertas por cierre: solo si aún no hay un proceso activo del mismo tipo en ese programa. */
  const remindersSinActivoMismoTipo = useMemo(() => {
    return remindersFiltradosTipo.filter((r) => {
      if (!procesoCumpleSubtipoFiltro(r.subtipo, r.tipo_proceso, remSubtipo, remTipoProceso)) return false;
      return !procesos.some((p) => p.program_code === r.program_code && p.tipo_proceso === r.tipo_proceso);
    });
  }, [remindersFiltradosTipo, procesos, remSubtipo]);

  const procesoRows: ProcesoRow[] = useMemo(() => {
    return programasFiltradosCompleto.map((p) => {
      const procRC = getProceso(p.dep_code_programa, "RC");
      const procAV = getProceso(p.dep_code_programa, "AV");
      const faseRC = tablePhases.find((f) => mismoId(f.proceso_id, procRC?._id) && f.numero === procRC?.fase_actual);
      const faseAV = tablePhases.find((f) => mismoId(f.proceso_id, procAV?._id) && f.numero === procAV?.fase_actual);
      const allPMs = procesos.filter((pr) => pr.program_code === p.dep_code_programa && pr.tipo_proceso === "PM" && pr.parent_process_id != null);
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
      const rc = procesos.find((x) => x.program_code === p.dep_code_programa && x.tipo_proceso === "RC");
      const av = procesos.find((x) => x.program_code === p.dep_code_programa && x.tipo_proceso === "AV");
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

  const irAGestionarProcesoDesdeModal = (args: { nombrePrograma: string; tipo: "RC" | "AV" }) => {
    setAgregarProcesoOpen(false);
    setAgregarProcesoPrefill(null);
    setActiveSection("main");
    const progObj = programas.find((p) => p.nombre === args.nombrePrograma);
    const facObj = progObj ? facultades.find((f) => f.dep_code === progObj.dep_code_facultad) : null;
    if (facObj) setFacultad(facObj.name);
    setPrograma(args.nombrePrograma);
    setNivelAcademico("Todos");
    setTipoProceso(args.tipo === "RC" ? "Registro calificado" : "Acreditación voluntaria");
  };

  const sidebarW = userRole === "Administrador"
    ? (sidebarCollapsed ? 56 : 208)
    : (sidebarCollapsed ? 48 : 200);

  const abrirAgregarDesdeRecordatorio = (r: ProcessReminderRecord) => {
    const prog = programas.find((p) => p.dep_code_programa === r.program_code);
    if (!prog) return;
    const tipo = r.tipo_proceso;
    /* Alerta puede traer nulls en snapshot; respaldo a programa si aún tiene resolución vigente. */
    const fechaR = r.fecha_resolucion ?? (tipo === "RC" ? prog.fecha_resolucion_rc : prog.fecha_resolucion_av);
    const codigoR = r.codigo_resolucion ?? (tipo === "RC" ? prog.codigo_resolucion_rc : prog.codigo_resolucion_av);
    const duracionR = r.duracion_resolucion ?? (tipo === "RC" ? prog.duracion_resolucion_rc : prog.duracion_resolucion_av);
    setAgregarProcesoPrefill({
      programId: prog._id,
      tipo,
      excluirNuevo: true,
      reminderRowId: r._id,
      resolucionDesdeAlerta: {
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

  const pqrBtnStyles = {
    root: {
      minHeight: 48,
      paddingBlock: 10,
      fontWeight: 600,
      fontSize: 12,
      justifyContent: "center" as const,
      border: "1px solid var(--mantine-color-teal-2)",
      "&:hover": { backgroundColor: "var(--mantine-color-teal-light)" },
    },
    label: { whiteSpace: "normal" as const, textAlign: "center" as const },
  };

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
                <Stack gap={12} pt={8} mt={2}>
                  <Text size="xs" fw={700} c="blue" tt="uppercase" ta="center" style={{ letterSpacing: 0.6 }}>
                    Procesos
                  </Text>
                  <Stack gap={12}>
                    <Button
                      variant="default"
                      size="md"
                      fullWidth
                      onClick={() => { setActiveSection("main"); setPrograma("Todos"); setNivelAcademico("Todos"); }}
                      styles={navBtnStyles(activeSection === "main")}
                    >
                      Estadísticas<br />y tablero
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
                </Stack>

                <Stack gap={8} pb={8} mt={4}>
                  <Text size="xs" fw={700} c="teal" tt="uppercase" ta="center" style={{ letterSpacing: 0.6 }}>
                    PQR
                  </Text>
                  <Button variant="default" color="teal" fullWidth onClick={() => setAgregarPQROpen(true)} styles={pqrBtnStyles}>
                    + Agregar PQR
                  </Button>
                  <Button variant="default" color="teal" fullWidth onClick={() => setListaPQROpen(true)} styles={pqrBtnStyles}>
                    PQRs activos
                    {pqrs.filter((p) => !p.cerrado).length > 0 && (
                      <Badge size="xs" color="teal" variant="filled" ml={6}>
                        {pqrs.filter((p) => !p.cerrado).length}
                      </Badge>
                    )}
                  </Button>
                  <Button variant="default" color="teal" fullWidth onClick={() => setHistorialPQROpen(true)} styles={pqrBtnStyles}>
                    Historial PQR
                  </Button>
                </Stack>
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
                <Stack gap={14} align="center">
                  <Tooltip label="Estadísticas y tablero" position="right" withArrow>
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
                </Stack>
                <Stack gap={14} align="center">
                  <Tooltip label="Agregar PQR" position="right" withArrow>
                    <ActionIcon size="lg" variant="default" color="teal" onClick={() => setAgregarPQROpen(true)}>
                      <IconPlus size={18} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="PQRs activos" position="right" withArrow>
                    <ActionIcon size="lg" variant="default" color="teal" onClick={() => setListaPQROpen(true)}>
                      <IconList size={18} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Historial PQR" position="right" withArrow>
                    <ActionIcon size="lg" variant="default" color="teal" onClick={() => setHistorialPQROpen(true)}>
                      <IconArchive size={18} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                </Stack>
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

      {/* ── Modales PQR ── */}
      <AgregarPQRModal
        opened={agregarPQROpen}
        onClose={() => setAgregarPQROpen(false)}
        programas={programas}
        onCreado={handlePQRCreado}
      />
      <PQRListModal
        opened={listaPQROpen}
        onClose={() => setListaPQROpen(false)}
        pqrs={pqrs}
        programas={programas}
        onUpdate={handlePQRActualizado}
        onCerrar={handlePQRCerrado}
      />
      <PQRHistorialModal
        opened={historialPQROpen}
        onClose={() => setHistorialPQROpen(false)}
        pqrs={pqrs}
        programas={programas}
      />

      {/* ── CONTENIDO PRINCIPAL ── */}
      <div style={{ marginLeft: `${sidebarW + 1}px`, flex: 1, padding: "20px", paddingTop: "28px", minHeight: "calc(100vh - 194px)" }}>
        {userRole === "Administrador" && (
          <>
            {activeSection === "main" && !loadingFilters && programa !== "Todos" && (
              <Paper withBorder radius="md" p="sm" mb="md" style={{ backgroundColor: "#f8fafc" }}>
                <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                  <Text size="sm" fw={600}>{programa}</Text>
                  <Button variant="subtle" size="sm" onClick={() => { setPrograma("Todos"); setNivelAcademico("Todos"); }}>
                    ← Ver tablero con filtros
                  </Button>
                </Group>
              </Paper>
            )}

            {activeSection === "main" && !loadingFilters && programa === "Todos" && (
              <Paper withBorder radius="md" p="sm" mb="md">
                <Flex gap={8} align="flex-end" wrap="wrap" w="100%" style={{ minWidth: 0 }}>
                  <Select label="Facultad" data={opcionesFacultad} value={facultad} w={188}
                    onChange={handleFacultadChange} searchable={false} styles={selectorStyleFilters} />
                  <Select
                    label="Programa"
                    data={opcionesPrograma}
                    value={programa}
                    w={248}
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
                  <Select label="Nivel académico" data={opcionesNivelAcademico} value={nivelAcademico} w={172}
                    onChange={(v) => setNivelAcademico(v ?? "Todos")} searchable={false} styles={selectorStyleFilters} />
                  <Select label="Tipo de proceso" data={opcionesTipoProceso} value={tipoProceso} w={228}
                    onChange={(v) => { setTipoProceso(v ?? "Todos"); setSubtipoFiltro("Todos"); }}
                    searchable={false} styles={selectorStyleFilters} />
                  <Select label="Subtipo" data={opcionesSubtipoFiltro} value={subtipoFiltro} w={188}
                    onChange={(v) => setSubtipoFiltro(v ?? "Todos")} searchable={false} styles={selectorStyleFilters} />
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
                <SimpleGrid cols={2} spacing="sm">
                  {[
                    { label: "Total de programas académicos activos",          value: totalActivos },
                    { label: "Total de programas con Registro Calificado",     value: conRegistro },
                    { label: "Porcentaje de programas acreditados",            value: `${pctAcreditados}%` },
                    { label: "Total de programas con Acreditación Voluntaria", value: conAcreditacion },
                    { label: "Cantidad de programas inactivos",                value: totalInactivos },
                    { label: "Total de programas registrados",                 value: totalProgramas },
                  ].map((card, i) => (
                    <Paper key={i} radius="md" p="md" style={{ textAlign: "center", backgroundColor: "white" }}>
                      <Text size="sm" fw={600} c="var(--mantine-color-blue-light-color)">{card.label}</Text>
                      <Text size="xl" fw={700} c="#228be6" mt={4}>{card.value}</Text>
                    </Paper>
                  ))}
                </SimpleGrid>
              </Paper>
            )}

            {/* Vista por programa */}
            {programa !== "Todos" && (() => {
              const progObj = programas.find(p => p.nombre === programa);
              if (!progObj) return null;
              const procesosDelProg = procesos.filter(p => p.program_code === progObj.dep_code_programa);
              if (loadingFases) return <Loader size="sm" mx="auto" display="block" my="lg" />;
              return (
                <>
                  <Group justify="center" gap="xs" mb="md">
                    <Title order={4} ta="center">{progObj.nombre}</Title>
                    {progObj.codigo_snies && <Text size="sm" c="dimmed" fw={500}>SNIES: {progObj.codigo_snies}</Text>}
                  </Group>
                  {(["RC", "AV"] as const)
                    .filter(t => tipoProceso === "Todos"
                      || (tipoProceso === "Registro calificado"     && t === "RC")
                      || (tipoProceso === "Acreditación voluntaria" && t === "AV"))
                    .map(tipo => {
                      const proc = procesosDelProg.find(p => p.tipo_proceso === tipo);
                      if (!proc) return null;
                      return (
                        <ProcesoDetalleCard
                          key={tipo}
                          proceso={proc}
                          programa={progObj}
                          fases={fases.filter((f) => mismoId(f.proceso_id, proc._id))}
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
                      );
                    })}
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
                      Primer proceso RC o AV
                    </Button>
                  </Group>
                </Group>
                <Text size="sm" c="dimmed">
                  Arriba: procesos RC y AV activos. Debajo: alertas tras cierre cuando aún no hay un proceso activo del mismo tipo. «Crear programa» solo registra el programa (sin proceso). «Primer proceso RC o AV» abre un asistente para elegir RC (Nuevo) o AV (Primera vez) sobre un programa que aún no tenga ese proceso activo (p. ej. con RC Nuevo puedes crear AV). «Crear proceso» en cada fila de alerta enlaza el programa y el tipo ya definidos.
                </Text>
                {!loadingFilters ? (
                  <Paper withBorder radius="md" p="sm">
                    <Flex gap={8} align="flex-end" wrap="wrap" w="100%" style={{ minWidth: 0 }}>
                      <Select label="Facultad" data={opcionesFacultad} value={remFacultad}
                        style={{ flex: "1 1 140px" }} maw={260}
                        onChange={handleRemFacultadChange} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Programa" data={opcionesRemPrograma} value={remPrograma}
                        style={{ flex: "1.15 1 160px" }} maw={280}
                        onChange={(v) => { setRemPrograma(v ?? "Todos"); setRemSubtipo("Todos"); }} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Nivel académico" data={opcionesNivelAcademico} value={remNivel}
                        style={{ flex: "1 1 120px" }} maw={200}
                        onChange={(v) => setRemNivel(v ?? "Todos")} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Por proceso (tipo)" data={opcionesTipoProceso} value={remTipoProceso}
                        style={{ flex: "1 1 150px" }} maw={240}
                        onChange={(v) => { setRemTipoProceso(v ?? "Todos"); setRemSubtipo("Todos"); }} searchable={false} styles={selectorStyleFilters} />
                      <Select label="Subtipo" data={opcionesRemSubtipo} value={remSubtipo}
                        style={{ flex: "1 1 140px" }} maw={260}
                        onChange={(v) => setRemSubtipo(v ?? "Todos")} searchable={false} styles={selectorStyleFilters} />
                    </Flex>
                  </Paper>
                ) : (
                  <Loader size="sm" />
                )}
                {loadingReminders ? (
                  <Loader size="sm" mx="auto" display="block" my="lg" />
                ) : (
                  <ScrollArea>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                          {["Programa", "Tipo / Origen", "Acto admin.", "Nivel", "Vencimiento", "Inicio", "Doc. par", "Digitación", "Radicado", "Documentos", "Creado", "Acciones"].map((h) => (
                            <th key={h} style={{ padding: "6px 8px", textAlign: h === "Acciones" ? "right" : "left", fontSize: 12, fontWeight: 700 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filasProcesosActivosRcAv.map(({ proc, prog }) => {
                          const codigoActo =
                            proc.tipo_proceso === "RC" ? (prog.codigo_resolucion_rc ?? "—") : (prog.codigo_resolucion_av ?? "—");
                          const fechaActo =
                            proc.tipo_proceso === "RC" ? prog.fecha_resolucion_rc : prog.fecha_resolucion_av;
                          return (
                            <tr key={`act-${proc._id}`} style={{ borderBottom: "1px solid #f1f3f5", backgroundColor: "#fafbff" }}>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>
                                <Anchor href={`/date-review/program/${prog._id}`} size="sm" fw={600}>
                                  {prog.nombre}
                                </Anchor>
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <Group gap={6} wrap="nowrap">
                                  <Badge size="xs" color={proc.tipo_proceso === "RC" ? "blue" : "violet"} variant="light">{proc.tipo_proceso}</Badge>
                                  <Badge size="xs" variant="outline" color="cyan">Activo</Badge>
                                  {proc.subtipo && (
                                    <Badge size="xs" variant="outline" color="gray" styles={{ label: { textTransform: "none" } }}>
                                      {etiquetaSubtipoCompacta(proc.subtipo)}
                                    </Badge>
                                  )}
                                </Group>
                              </td>
                              <td style={{ padding: "6px 8px", fontSize: 12, verticalAlign: "top" }}>
                                <Stack gap={2}>
                                  <Text size="xs" ff="monospace" style={{ lineHeight: 1.3 }}>{codigoActo}</Text>
                                  <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>{formatFechaDDMMYY(fechaActo)}</Text>
                                </Stack>
                              </td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{prog.nivel_academico ?? "—"}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(proc.fecha_vencimiento)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(proc.fecha_inicio)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(proc.fecha_documento_par)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(proc.fecha_digitacion_saces)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(proc.fecha_radicado_men)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>—</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>—</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                                <Button size="xs" variant="light" onClick={() => irAGestionarProcesoDesdeModal({ nombrePrograma: prog.nombre, tipo: proc.tipo_proceso as "RC" | "AV" })}>
                                  Gestionar proceso
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                        {remindersSinActivoMismoTipo.map((r) => {
                          const prog = programas.find((p) => p.dep_code_programa === r.program_code);
                          const esAlertaApi = r.__origen === "ALERTA";
                          return (
                            <tr key={r._id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>
                                {prog ? (
                                  <Anchor href={`/date-review/program/${prog._id}`} size="sm" fw={600}>
                                    {r.nombre_programa}
                                  </Anchor>
                                ) : (
                                  r.nombre_programa
                                )}
                              </td>
                              <td style={{ padding: "6px 8px" }}>
                                <Group gap={6} wrap="nowrap">
                                  <Badge size="xs" color={r.tipo_proceso === "RC" ? "blue" : "violet"} variant="light">{r.tipo_proceso}</Badge>
                                  <Badge size="xs" variant="outline" color={esAlertaApi ? "orange" : "gray"}>Alerta</Badge>
                                  {r.subtipo ? (
                                    <Badge size="xs" variant="outline" color="gray" styles={{ label: { textTransform: "none" } }}>
                                      {etiquetaSubtipoCompacta(r.subtipo)}
                                    </Badge>
                                  ) : null}
                                </Group>
                              </td>
                              <td style={{ padding: "6px 8px", fontSize: 12, verticalAlign: "top" }}>
                                <Stack gap={2}>
                                  <Text size="xs" ff="monospace" style={{ lineHeight: 1.3 }}>{r.codigo_resolucion ?? "—"}</Text>
                                  <Text size="xs" c="dimmed" style={{ lineHeight: 1.3 }}>{formatFechaDDMMYY(r.fecha_resolucion)}</Text>
                                </Stack>
                              </td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{r.nivel_academico ?? "—"}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(r.fecha_vencimiento)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(r.fecha_inicio)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(r.fecha_documento_par)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(r.fecha_digitacion_saces)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{formatFechaDDMMYY(r.fecha_radicado_men)}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>
                                {r.documentos?.length ? r.documentos.map((d, i) => (
                                  <Anchor key={i} href={d.view_link} target="_blank" size="xs" display="block">📎 {d.name}</Anchor>
                                )) : "—"}
                              </td>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>
                                {r.createdAt ? formatFechaDDMMYY(r.createdAt) : "—"}
                              </td>
                              <td style={{ padding: "6px 8px", textAlign: "right" }}>
                                {prog && (
                                  <Button size="xs" variant="filled" onClick={() => abrirAgregarDesdeRecordatorio(r)}>
                                    Crear proceso
                                  </Button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {filasProcesosActivosRcAv.length === 0 && remindersSinActivoMismoTipo.length === 0 && (
                          <tr>
                            <td colSpan={12} style={{ padding: 12, textAlign: "center", color: "#868e96", fontSize: 13 }}>
                              No hay filas con estos filtros. Los procesos RC/AV activos aparecen arriba; las alertas por cierre, debajo, cuando aún no hay un proceso activo de ese tipo.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </ScrollArea>
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
                  <ScrollArea>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                          {["Programa", "Proceso", "Resolución", "Vigencia", "Vencimiento", "Fase al cierre", "Cerrado", ""].map((h) => (
                            <th key={h} style={{ padding: "6px 8px", textAlign: h === "" ? "center" : "left", fontSize: 12, fontWeight: 700 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {historialRecords
                          .filter((r) => !historialFiltroFacultad || r.dep_code_facultad === historialFiltroFacultad)
                          .filter((r) => !historialFiltroPrograma || r.nombre_programa === historialFiltroPrograma)
                          .map((r) => (
                            <tr key={r._id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                              <td style={{ padding: "6px 8px", fontSize: 12 }}>{r.nombre_programa}</td>
                              <td style={{ padding: "6px 8px" }}>
                                <Badge size="xs" color={r.tipo_proceso === "RC" ? "blue" : r.tipo_proceso === "AV" ? "violet" : "green"} variant="light">
                                  {r.tipo_proceso}
                                </Badge>
                              </td>
                              <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "center" }}>{r.codigo_resolucion ?? "—"}</td>
                              <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "center" }}>
                                {r.fecha_resolucion
                                  ? `${formatFechaDDMMYY(r.fecha_resolucion)}${r.duracion_resolucion != null ? ` · ${r.duracion_resolucion} años` : ""}`
                                  : "—"}
                              </td>
                              <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "center" }}>{formatFechaDDMMYY(r.fecha_vencimiento)}</td>
                              <td style={{ padding: "6px 8px", textAlign: "center" }}><FaseBadge fase={r.fase_al_cierre} /></td>
                              <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "center" }}>{formatFechaDDMMYY(r.cerrado_en)}</td>
                              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                <Button size="xs" variant="subtle" onClick={() => setHistorialDetalle(r)}>Ver</Button>
                              </td>
                            </tr>
                          ))}
                        {historialRecords.filter((r) =>
                          (!historialFiltroFacultad || r.dep_code_facultad === historialFiltroFacultad) &&
                          (!historialFiltroPrograma || r.nombre_programa === historialFiltroPrograma)
                        ).length === 0 && (
                          <tr>
                            <td colSpan={8} style={{ padding: 12, textAlign: "center", color: "#868e96", fontSize: 13 }}>
                              No hay registros en el historial
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </ScrollArea>
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
        size="xl" centered radius="md" scrollAreaComponent={ScrollArea.Autosize}>
        {historialDetalle && (
          <Stack gap="sm">
            <Group gap="xs">
              <Badge color="blue" variant="light" size="sm">{LABEL_PROCESO[historialDetalle.tipo_proceso]}</Badge>
              {historialDetalle.subtipo && (
                <Badge color="gray" variant="outline" size="sm" styles={{ label: { textTransform: "none" } }}>
                  {etiquetaSubtipoCompacta(historialDetalle.subtipo)}
                </Badge>
              )}
              {historialDetalle.condicion && (
                <Badge color="violet" variant="light" size="sm">
                  {historialDetalle.tipo_proceso === "RC" ? "Condición" : "Factor"} {historialDetalle.condicion}
                </Badge>
              )}
            </Group>

            <Divider label="Resolución" labelPosition="left" />
            <SimpleGrid cols={3} spacing="sm">
              {[
                { label: "Código resolución", value: historialDetalle.codigo_resolucion },
                { label: "Fecha resolución",  value: historialDetalle.fecha_resolucion ? formatFechaDDMMYY(historialDetalle.fecha_resolucion) : null },
                { label: "Duración",          value: historialDetalle.duracion_resolucion ? `${historialDetalle.duracion_resolucion} años` : null },
              ].map(({ label, value }) => (
                <Paper key={label} withBorder radius="sm" p="sm">
                  <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                  <Text size="sm" fw={600}>{value ?? "—"}</Text>
                </Paper>
              ))}
            </SimpleGrid>

            <Divider label="Fechas del proceso" labelPosition="left" />
            <SimpleGrid cols={3} spacing="sm">
              {[
                { label: "Fecha vencimiento",     value: formatFechaDDMMYY(historialDetalle.fecha_vencimiento) },
                { label: "Inicio proceso",         value: formatFechaDDMMYY(historialDetalle.fecha_inicio) },
                { label: "Documento para el par", value: formatFechaDDMMYY(historialDetalle.fecha_documento_par) },
                { label: "Digitación en SACES",   value: formatFechaDDMMYY(historialDetalle.fecha_digitacion_saces) },
                { label: "Radicado en el MEN",    value: formatFechaDDMMYY(historialDetalle.fecha_radicado_men) },
                { label: "Fase al cierre",         value: `Fase ${historialDetalle.fase_al_cierre}` },
                { label: "Cerrado el",             value: formatFechaDDMMYY(historialDetalle.cerrado_en) },
              ].map(({ label, value }) => (
                <Paper key={label} withBorder radius="sm" p="sm">
                  <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                  <Text size="sm" fw={600}>{value ?? "—"}</Text>
                </Paper>
              ))}
            </SimpleGrid>

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
                  <Badge color="gray" variant="outline" size="sm" styles={{ label: { textTransform: "none" } }}>
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

            {historialDetalle.documentos_proceso?.length > 0 && (
              <>
                <Divider label="PDF resolución vigente" labelPosition="left" />
                <Stack gap={4}>
                  {historialDetalle.documentos_proceso.map((d, i) => (
                    <Anchor key={i} href={d.view_link} target="_blank" size="sm" fw={500}>📄 {d.name}</Anchor>
                  ))}
                </Stack>
              </>
            )}

            <Divider label="Fases y documentos" labelPosition="left" />
            <HistorialFases fases={historialDetalle.fases} />
          </Stack>
        )}
      </Modal>

    </div>
  );
};

export default DateReviewPage;
