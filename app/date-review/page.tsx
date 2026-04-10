"use client";

import { useState, useEffect } from "react";
import {
  Title, Select, Button, Text, Paper, Box, SimpleGrid, Group,
  Loader, Modal, TextInput, Stack, Divider, Badge, Anchor, ScrollArea, Collapse,
} from "@mantine/core";
import { useRole } from "@/app/context/RoleContext";
import axios from "axios";

import type { Dependency, Program, Process, Phase, ProcessHistoryRecord, ProcesoRow, BarRow, PQR } from "./types";
import { LABEL_PROCESO, selectorStyle } from "./constants";
import FaseBadge from "./components/FaseBadge";
import BarTable from "./components/BarTable";
import ProcesoTable from "./components/ProcesoTable";
import ProcesoDetalleCard from "./components/ProcesoDetalleCard";
import AgregarProcesoModal from "./components/AgregarProcesoModal";
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
                            <Text size="xs" c="teal">✓ {act.fecha_completado}</Text>
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
                                    {sub.fecha_completado && !subNa && <Text size="xs" c="teal">✓ {sub.fecha_completado}</Text>}
                                  </Group>
                                  {sub.observaciones && (
                                    <Text size="xs" c="dimmed" pl={20} mb={2}>📝 {sub.observaciones}</Text>
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

const DateReviewPage = () => {
  const { userRole } = useRole();

  const [facultad, setFacultad]             = useState<string>("Todos");
  const [programa, setPrograma]             = useState<string>("Todos");
  const [nivelAcademico, setNivelAcademico] = useState<string>("Todos");
  const [tipoProceso, setTipoProceso]       = useState<string>("Todos");

  const [facultades, setFacultades]   = useState<Dependency[]>([]);
  const [programas, setProgramas]     = useState<Program[]>([]);
  const [procesos, setProcesos]       = useState<Process[]>([]);
  const [fases, setFases]             = useState<Phase[]>([]);
  const [loadingFacultades, setLoadingFacultades] = useState(true);
  const [loadingProgramas, setLoadingProgramas]   = useState(true);
  const [loadingProcesos, setLoadingProcesos]     = useState(true);
  const [loadingFases, setLoadingFases]           = useState(false);

  /* ── Historial ── */
  const [historialOpen, setHistorialOpen]               = useState(false);
  const [historialRecords, setHistorialRecords]         = useState<ProcessHistoryRecord[]>([]);
  const [loadingHistorial, setLoadingHistorial]         = useState(false);
  const [historialFiltroFacultad, setHistorialFiltroFacultad] = useState<string | null>(null);
  const [historialFiltroPrograma, setHistorialFiltroPrograma] = useState<string | null>(null);
  const [historialDetalle, setHistorialDetalle]         = useState<ProcessHistoryRecord | null>(null);

  const abrirHistorial = async () => {
    setHistorialOpen(true);
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

  /* ── Modal agregar proceso ── */
  const [agregarProcesoOpen, setAgregarProcesoOpen] = useState(false);

  /* ── Ventanas de gestión ── */
  const [gestionProcesosOpen, setGestionProcesosOpen] = useState(false);
  const [gestionPQROpen, setGestionPQROpen]           = useState(false);

  /* ── PQR ── */
  const [pqrs, setPqrs]                     = useState<PQR[]>([]);
  const [agregarPQROpen, setAgregarPQROpen] = useState(false);
  const [listaPQROpen, setListaPQROpen]     = useState(false);
  const [historialPQROpen, setHistorialPQROpen] = useState(false);

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

  /* ── Programa seleccionado (modal detalle) ── */
  const [selectedProgram, setSelectedProgram]   = useState<Program | null>(null);
  const [editandoPrograma, setEditandoPrograma] = useState(false);
  const [editForm, setEditForm]                 = useState<Partial<Program>>({});
  const [savingPrograma, setSavingPrograma]     = useState(false);

  const abrirEdicion = () => {
    if (!selectedProgram) return;
    setEditForm({
      nombre:               selectedProgram.nombre,
      codigo_snies:         selectedProgram.codigo_snies,
      dep_code_facultad:    selectedProgram.dep_code_facultad,
      modalidad:            selectedProgram.modalidad,
      nivel_academico:      selectedProgram.nivel_academico,
      nivel_formacion:      selectedProgram.nivel_formacion,
      num_creditos:         selectedProgram.num_creditos,
      num_semestres:        selectedProgram.num_semestres,
      estado:               selectedProgram.estado,
      admision_estudiantes: selectedProgram.admision_estudiantes,
      num_estudiantes_saces: selectedProgram.num_estudiantes_saces,
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

  /* ── Helpers derivados ── */
  const handleFacultadChange = (val: string | null) => {
    setFacultad(val ?? "Todos");
    setPrograma("Todos");
  };

  const facultadSeleccionada = facultades.find((f) => f.name === facultad);
  const programasFiltrados   = facultad === "Todos"
    ? programas
    : programas.filter((p) => p.dep_code_facultad === facultadSeleccionada?.dep_code);

  const getProceso = (dep_code_programa: string, tipo: "RC" | "AV" | "PM"): Process | undefined =>
    procesos.find((p) => p.program_code === dep_code_programa && p.tipo_proceso === tipo);

  const loadingFilters         = loadingFacultades || loadingProgramas || loadingProcesos;
  const opcionesFacultad       = ["Todos", ...facultades.map((f) => f.name)];
  const opcionesPrograma       = ["Todos", ...programasFiltrados.map((p) => p.nombre)];
  const opcionesNivelAcademico = ["Todos", "Pregrado", "Posgrado"];
  const opcionesTipoProceso    = ["Todos", "Registro calificado", "Acreditación voluntaria"];

  const programasFiltradosCompleto = programasFiltrados
    .filter((p) => programa === "Todos" || p.nombre === programa)
    .filter((p) => nivelAcademico === "Todos" || p.nivel_academico === nivelAcademico);

  const totalActivos    = programasFiltradosCompleto.filter((p) => p.estado === "Activo").length;
  const totalInactivos  = programasFiltradosCompleto.filter((p) => p.estado === "Inactivo").length;
  const conRegistro     = programasFiltradosCompleto.filter((p) => p.fecha_resolucion_rc).length;
  const conAcreditacion = programasFiltradosCompleto.filter((p) => p.fecha_resolucion_av).length;
  const totalProgramas  = programasFiltradosCompleto.length;
  const pctAcreditados  = totalProgramas > 0 ? Math.round((conAcreditacion / totalProgramas) * 100) : 0;

  const buildBarData = (tipo: "RC" | "AV"): BarRow[] => {
    const grupos: Record<string, BarRow> = {};
    facultades.forEach((f) => {
      if (programas.some((p) => p.dep_code_facultad === f.dep_code)) {
        grupos[f.dep_code] = {
          nombre: f.name,
          fase_0: 0, fase_1: 0, fase_2: 0, fase_3: 0, fase_4: 0, fase_5: 0, fase_6: 0,
          fase_contingencia: 0,
        };
      }
    });
    programas.forEach((p) => {
      if (!grupos[p.dep_code_facultad]) return;
      const proc = getProceso(p.dep_code_programa, tipo);
      if (!proc) return;
      /* Incluir procesos sin fecha_vencimiento (p. ej. RC Nuevo / AV Primera vez) para alinear con la tabla */
      const n = Number(proc.fase_actual) || 0;
      if (n >= 7) {
        grupos[p.dep_code_facultad].fase_contingencia += 1;
      } else {
        const fase = Math.min(Math.max(n, 0), 6);
        (grupos[p.dep_code_facultad][`fase_${fase}` as keyof BarRow] as number) += 1;
      }
    });
    return Object.values(grupos);
  };

  const barAcreditacion = buildBarData("AV");
  const barRegistro     = buildBarData("RC");

  const procesoRows: ProcesoRow[] = programasFiltradosCompleto.map((p) => {
    const procRC  = getProceso(p.dep_code_programa, "RC");
    const procAV  = getProceso(p.dep_code_programa, "AV");
    // Puede haber un PM por RC y otro por AV; tomamos el primero activo para la columna
    const allPMs  = procesos.filter(pr => pr.program_code === p.dep_code_programa && pr.tipo_proceso === "PM" && pr.parent_process_id != null);
    const pmProc  = allPMs[0] ?? null;
    const parentTipo = pmProc?.parent_tipo_proceso ?? null;
    return {
      programa:     p,
      registro:     procRC ? procRC.fase_actual : null,
      acreditacion: procAV ? procAV.fase_actual : null,
      pmFase:       pmProc ? pmProc.fase_actual : null,
      pmLigadoA:    parentTipo,
      pmSubtipo:    pmProc?.subtipo ?? null,
    };
  });

  const tituloTabla = `Fase de procesos de programas de ${facultad}`;

  const handleProcesoCreado = async () => {
    const [resProg, resProc] = await Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/processes`),
    ]);
    setProgramas(Array.isArray(resProg.data) ? resProg.data : []);
    setProcesos(Array.isArray(resProc.data) ? resProc.data : []);
  };

  return (
    <div style={{ display: "flex", marginTop: "-50px" }}>

      {/* ── SIDEBAR ── */}
      <Box style={{
        position: "fixed", top: 0, bottom: 0, left: 0, width: "200px",
        borderRight: "1px solid #dee2e6", padding: "20px 12px", paddingTop: "105px", paddingBottom: "25px",
        display: "flex", flexDirection: "column", backgroundColor: "var(--mantine-color-body)", zIndex: 50,
      }}>
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
                    onChange={(v) => { const n = v ?? "Todos"; setPrograma(n); if (n !== "Todos") setNivelAcademico("Todos"); }}
                    searchable={false} styles={selectorStyle} />
                  {programa === "Todos" && (
                    <Select label="Nivel académico" data={opcionesNivelAcademico} value={nivelAcademico}
                      onChange={(v) => setNivelAcademico(v ?? "Todos")} searchable={false} styles={selectorStyle} />
                  )}
                </>
              )}
              {userRole === "Administrador" && (
                <Select label="Tipo de proceso" data={opcionesTipoProceso} value={tipoProceso}
                  onChange={(v) => setTipoProceso(v ?? "Todos")} searchable={false} styles={selectorStyle} />
              )}
            </>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          <Button variant="light" size="sm" fullWidth
            styles={{ root: { paddingTop: 5, paddingBottom: 5 } }}
            onClick={() => setGestionProcesosOpen(true)}>
            Gestión procesos
          </Button>
          <Button variant="light" color="teal" size="sm" fullWidth
            styles={{ root: { paddingTop: 5, paddingBottom: 5 } }}
            onClick={() => setGestionPQROpen(true)}>
            Gestión PQR
            {pqrs.filter(p => !p.cerrado).length > 0 && (
              <Badge size="xs" color="teal" variant="filled" ml={6}>
                {pqrs.filter(p => !p.cerrado).length}
              </Badge>
            )}
          </Button>
        </div>
      </Box>

      {/* ── Ventana Gestión procesos ── */}
      <Modal opened={gestionProcesosOpen} onClose={() => setGestionProcesosOpen(false)}
        title="Gestión de procesos" centered size="sm" radius="md">
        <Stack gap="sm" pb="xs">
          <Button variant="light" size="md" fullWidth
            onClick={() => { setGestionProcesosOpen(false); setAgregarProcesoOpen(true); }}>
            + Agregar proceso
          </Button>
          <Button variant="subtle" size="md" fullWidth
            onClick={() => { setGestionProcesosOpen(false); abrirHistorial(); }}>
            Ver historial procesos
          </Button>
        </Stack>
      </Modal>

      {/* ── Ventana Gestión PQR ── */}
      <Modal opened={gestionPQROpen} onClose={() => setGestionPQROpen(false)}
        title="Gestión de PQR" centered size="sm" radius="md">
        <Stack gap="sm" pb="xs">
          <Button variant="light" color="teal" size="md" fullWidth
            onClick={() => { setGestionPQROpen(false); setAgregarPQROpen(true); }}>
            + Agregar PQR
          </Button>
          <Button variant="subtle" color="teal" size="md" fullWidth
            onClick={() => { setGestionPQROpen(false); setListaPQROpen(true); }}>
            Ver PQRs activos
            {pqrs.filter(p => !p.cerrado).length > 0 && (
              <Badge size="xs" color="teal" variant="filled" ml={6}>
                {pqrs.filter(p => !p.cerrado).length}
              </Badge>
            )}
          </Button>
          <Divider />
          <Button variant="subtle" size="md" fullWidth
            onClick={() => { setGestionPQROpen(false); setHistorialPQROpen(true); }}>
            Ver historial PQR
          </Button>
        </Stack>
      </Modal>

      {/* ── Modal agregar proceso ── */}
      <AgregarProcesoModal
        opened={agregarProcesoOpen}
        onClose={() => setAgregarProcesoOpen(false)}
        programas={programas}
        facultades={facultades}
        procesos={procesos}
        onCreated={handleProcesoCreado}
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
      <div style={{ marginLeft: "201px", flex: 1, padding: "20px", paddingTop: "70px", minHeight: "calc(100vh - 194px)" }}>
        {userRole === "Administrador" && (
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

            {/* Modal detalle programa */}
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
              size="lg" centered radius="md"
            >
              {selectedProgram && (
                <Stack gap="md">
                  <Divider />
                  <Group justify="space-between" align="center">
                    <Text fw={600} size="sm" c="dimmed">INFORMACIÓN GENERAL</Text>
                    {!editandoPrograma && <Button size="xs" variant="light" onClick={abrirEdicion}>Editar</Button>}
                  </Group>

                  {editandoPrograma ? (
                    <Stack gap="sm">
                      <TextInput label="Nombre del programa" value={editForm.nombre ?? ""}
                        onChange={(e) => { const v = e.currentTarget.value; setEditForm(f => ({ ...f, nombre: v })); }} />
                      <TextInput label="Código SNIES" placeholder="Opcional" value={editForm.codigo_snies ?? ""}
                        onChange={(e) => { const v = e.currentTarget.value; setEditForm(f => ({ ...f, codigo_snies: v || null })); }} />
                      <Select label="Facultad" data={facultades.map(f => ({ value: f.dep_code, label: f.name }))}
                        value={editForm.dep_code_facultad ?? null}
                        onChange={(v) => setEditForm(f => ({ ...f, dep_code_facultad: v ?? "" }))}
                        searchable={false} styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                      <SimpleGrid cols={2} spacing="sm">
                        <Select label="Modalidad" data={["Presencial", "Virtual", "Híbrido"]}
                          value={editForm.modalidad ?? null} onChange={(v) => setEditForm(f => ({ ...f, modalidad: v }))}
                          searchable={false} styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                        <Select label="Nivel académico" data={["Pregrado", "Posgrado"]}
                          value={editForm.nivel_academico ?? null} onChange={(v) => setEditForm(f => ({ ...f, nivel_academico: v }))}
                          searchable={false} styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                        <Select label="Nivel de formación"
                          data={["Técnico", "Tecnológico", "Profesional", "Especialización", "Maestría", "Doctorado"]}
                          value={editForm.nivel_formacion ?? null} onChange={(v) => setEditForm(f => ({ ...f, nivel_formacion: v }))}
                          searchable={false} styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                        <Select label="Estado" data={["Activo", "Inactivo"]}
                          value={editForm.estado ?? null} onChange={(v) => setEditForm(f => ({ ...f, estado: v ?? "Activo" }))}
                          searchable={false} styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
                        <TextInput label="Créditos" type="number" value={editForm.num_creditos ?? ""}
                          onChange={(e) => { const v = e.currentTarget.value; setEditForm(f => ({ ...f, num_creditos: Number(v) })); }} />
                        <TextInput label="Semestres" type="number" value={editForm.num_semestres ?? ""}
                          onChange={(e) => { const v = e.currentTarget.value; setEditForm(f => ({ ...f, num_semestres: Number(v) })); }} />
                        <TextInput label="Admisión de estudiantes" placeholder="Ej: Semestral" value={editForm.admision_estudiantes ?? ""}
                          onChange={(e) => { const v = e.currentTarget.value; setEditForm(f => ({ ...f, admision_estudiantes: v || null })); }} />
                        <TextInput label="Nro. estudiantes a ingresar (SACES)" type="number" value={editForm.num_estudiantes_saces ?? ""}
                          onChange={(e) => { const v = e.currentTarget.value; setEditForm(f => ({ ...f, num_estudiantes_saces: Number(v || 0) })); }} />
                      </SimpleGrid>
                      <Group justify="flex-end" gap="sm">
                        <Button variant="default" size="xs" onClick={() => setEditandoPrograma(false)}>Cancelar</Button>
                        <Button size="xs" loading={savingPrograma} onClick={guardarEdicionPrograma}>Guardar</Button>
                      </Group>
                    </Stack>
                  ) : (
                    <SimpleGrid cols={2} spacing="md">
                      {[
                        { label: "Código SNIES",              value: selectedProgram.codigo_snies },
                        { label: "Facultad",                  value: facultades.find(f => f.dep_code === selectedProgram.dep_code_facultad)?.name ?? selectedProgram.dep_code_facultad },
                        { label: "Modalidad",                 value: selectedProgram.modalidad },
                        { label: "Nivel académico",           value: selectedProgram.nivel_academico },
                        { label: "Nivel de formación",        value: selectedProgram.nivel_formacion },
                        { label: "Créditos",                  value: selectedProgram.num_creditos },
                        { label: "Semestres",                 value: selectedProgram.num_semestres },
                        { label: "Admisión de estudiantes",   value: selectedProgram.admision_estudiantes },
                        { label: "Nro. estudiantes a ingresar (SACES)", value: selectedProgram.num_estudiantes_saces },
                      ].map(({ label, value }) => (
                        <Paper key={label} withBorder radius="sm" p="sm">
                          <Text size="xs" c="dimmed" mb={2}>{label}</Text>
                          <Text size="sm" fw={600} c="#000">{value ?? "—"}</Text>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  )}

                  <Divider />
                  <Text fw={600} size="sm" c="dimmed">PROCESOS</Text>
                  <SimpleGrid cols={3} spacing="md">
                    {(["RC", "AV"] as const).map((tipo) => {
                      const labels: Record<string, string> = { RC: "Registro calificado", AV: "Acreditación voluntaria" };
                      const proc = getProceso(selectedProgram.dep_code_programa, tipo);
                      const tieneResolucion = !!proc?.fecha_vencimiento;
                      return (
                        <Paper key={tipo} withBorder radius="sm" p="sm" style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
                          <Text size="xs" fw={700} c="var(--mantine-color-blue-light-color)" mb={6}>{labels[tipo]}</Text>
                          {tieneResolucion ? (
                            <>
                              <Text size="xs" fw={700} c="#000">Fase actual</Text>
                              <Text size="sm" c="#000" fw={400} mb={4}>Fase {proc!.fase_actual}</Text>
                              <Text size="xs" fw={700} c="#000">Fecha vencimiento</Text>
                              <Text size="sm" c="#000" fw={400} mb={4}>{proc!.fecha_vencimiento}</Text>
                              <Text size="xs" fw={700} c="#000">Fecha radicado MEN</Text>
                              <Text size="sm" c="#000" fw={400}>{proc!.fecha_radicado_men ?? "—"}</Text>
                            </>
                          ) : (
                            <Text size="xs" c="dimmed" mt={4}>Sin proceso activo</Text>
                          )}
                        </Paper>
                      );
                    })}
                    {(() => {
                      const allPMs = procesos.filter(p =>
                        p.program_code === selectedProgram.dep_code_programa &&
                        p.tipo_proceso === "PM" &&
                        p.parent_process_id != null
                      );
                      if (allPMs.length === 0) {
                        return (
                          <Paper withBorder radius="sm" p="sm" style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
                            <Text size="xs" fw={700} c="var(--mantine-color-blue-light-color)" mb={6}>Plan de mejoramiento</Text>
                            <Text size="xs" c="dimmed" mt={4}>No hay plan de mejoramiento activo</Text>
                          </Paper>
                        );
                      }
                      return allPMs.map(pmActivo => {
                        const parentProc = procesos.find(p => p._id === pmActivo.parent_process_id);
                        return (
                          <Paper key={pmActivo._id} withBorder radius="sm" p="sm" style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
                            <Text size="xs" fw={700} c="var(--mantine-color-blue-light-color)" mb={6}>
                              Plan de mejoramiento — {parentProc ? LABEL_PROCESO[parentProc.tipo_proceso] : ""}
                            </Text>
                            <Text size="xs" fw={700} c="#000">Entrega plan al CNA</Text>
                            <Text size="sm" c="#000" fw={400} mb={4}>{pmActivo.fecha_entrega_pm_cna ?? "—"}</Text>
                            <Text size="xs" fw={700} c="#000">Radicación ante CNA</Text>
                            <Text size="sm" c="#000" fw={400}>{pmActivo.fecha_radicacion_avance_cna ?? "—"}</Text>
                          </Paper>
                        );
                      });
                    })()}
                  </SimpleGrid>
                </Stack>
              )}
            </Modal>

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
                          fases={fases.filter(f => f.proceso_id === proc._id)}
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
                    })}
                </>
              );
            })()}

            {/* Vista por facultad */}
            {programa === "Todos" && facultad !== "Todos" && (loadingProgramas ? (
              <Loader size="sm" mx="auto" display="block" my="lg" />
            ) : (
              <ProcesoTable title={tituloTabla} rows={procesoRows} tipoProceso={tipoProceso} programaFiltro={programa} onRowClick={setSelectedProgram} />
            ))}

            {/* Vista general: barras */}
            {facultad === "Todos" && <>
              {(tipoProceso === "Todos" || tipoProceso === "Registro calificado") && (
                <BarTable title="Estado general de fases — Registro calificado" data={barRegistro} />
              )}
              {(tipoProceso === "Todos" || tipoProceso === "Acreditación voluntaria") && (
                <BarTable title="Estado general de fases — Acreditación voluntaria" data={barAcreditacion} />
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

      {/* ── Modal historial ── */}
      <Modal opened={historialOpen} onClose={() => { setHistorialOpen(false); setHistorialDetalle(null); }}
        title="Historial de procesos" size="xl" centered radius="md">
        <Group gap="sm" mb="md">
          <Select placeholder="Todas las facultades" data={facultades.map(f => ({ value: f.dep_code, label: f.name }))}
            value={historialFiltroFacultad} onChange={setHistorialFiltroFacultad} clearable size="xs" style={{ minWidth: 220 }}
            styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
          <Select placeholder="Todos los programas"
            data={[...new Set(historialRecords.map(r => r.nombre_programa))].map(n => ({ value: n, label: n }))}
            value={historialFiltroPrograma} onChange={setHistorialFiltroPrograma} clearable searchable size="xs" style={{ minWidth: 220 }}
            styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
          {(historialFiltroFacultad || historialFiltroPrograma) && (
            <Button size="xs" variant="subtle" color="gray"
              onClick={() => { setHistorialFiltroFacultad(null); setHistorialFiltroPrograma(null); }}>
              Limpiar filtros
            </Button>
          )}
        </Group>
        {loadingHistorial ? (
          <Loader size="sm" mx="auto" display="block" my="lg" />
        ) : (
          <ScrollArea>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #dee2e6" }}>
                  {["Programa", "Proceso", "Resolución", "Vigencia", "Vencimiento", "Fase al cierre", "Cerrado", ""].map(h => (
                    <th key={h} style={{ padding: "6px 8px", textAlign: h === "" ? "center" : "left", fontSize: 12, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historialRecords
                  .filter(r => !historialFiltroFacultad || r.dep_code_facultad === historialFiltroFacultad)
                  .filter(r => !historialFiltroPrograma || r.nombre_programa === historialFiltroPrograma)
                  .map(r => (
                    <tr key={r._id} style={{ borderBottom: "1px solid #f1f3f5" }}>
                      <td style={{ padding: "6px 8px", fontSize: 12 }}>{r.nombre_programa}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <Badge size="xs" color={r.tipo_proceso === "RC" ? "blue" : r.tipo_proceso === "AV" ? "violet" : "green"} variant="light">
                          {r.tipo_proceso}
                        </Badge>
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "center" }}>{r.codigo_resolucion ?? "—"}</td>
                      <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "center" }}>
                        {r.fecha_resolucion ?? "—"}{r.duracion_resolucion ? ` · ${r.duracion_resolucion} años` : ""}
                      </td>
                      <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "center" }}>{r.fecha_vencimiento ?? "—"}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}><FaseBadge fase={r.fase_al_cierre} /></td>
                      <td style={{ padding: "6px 8px", fontSize: 12, textAlign: "center" }}>{new Date(r.cerrado_en).toLocaleDateString("es-CO")}</td>
                      <td style={{ padding: "6px 8px", textAlign: "center" }}>
                        <Button size="xs" variant="subtle" onClick={() => setHistorialDetalle(r)}>Ver</Button>
                      </td>
                    </tr>
                  ))}
                {historialRecords.filter(r =>
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
      </Modal>

      {/* ── Modal detalle historial ── */}
      <Modal opened={historialDetalle !== null} onClose={() => setHistorialDetalle(null)}
        title={historialDetalle ? `${historialDetalle.nombre_programa} — ${LABEL_PROCESO[historialDetalle.tipo_proceso]}` : ""}
        size="xl" centered radius="md" scrollAreaComponent={ScrollArea.Autosize}>
        {historialDetalle && (
          <Stack gap="sm">
            <Group gap="xs">
              <Badge color="blue" variant="light" size="sm">{LABEL_PROCESO[historialDetalle.tipo_proceso]}</Badge>
              {historialDetalle.subtipo && <Badge color="gray" variant="outline" size="sm">{historialDetalle.subtipo}</Badge>}
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
                { label: "Fecha resolución",  value: historialDetalle.fecha_resolucion },
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
                { label: "Fecha vencimiento",     value: historialDetalle.fecha_vencimiento },
                { label: "Inicio proceso",         value: historialDetalle.fecha_inicio },
                { label: "Documento para el par", value: historialDetalle.fecha_documento_par },
                { label: "Digitación en SACES",   value: historialDetalle.fecha_digitacion_saces },
                { label: "Radicado en el MEN",    value: historialDetalle.fecha_radicado_men },
                { label: "Fase al cierre",         value: `Fase ${historialDetalle.fase_al_cierre}` },
                { label: "Cerrado el",             value: new Date(historialDetalle.cerrado_en).toLocaleDateString("es-CO") },
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
                  {historialDetalle.pm_ligado.subtipo && <Badge color="gray" variant="outline" size="sm">{historialDetalle.pm_ligado.subtipo}</Badge>}
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
