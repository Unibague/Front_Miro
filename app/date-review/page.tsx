"use client";

import { useState, useEffect } from "react";
import {
  Title, Select, Button, Text, Paper, Box, SimpleGrid, Group,
  Loader, Modal, TextInput, Stack, Notification, Divider, Badge, Anchor, ScrollArea,
} from "@mantine/core";
import { useRole } from "@/app/context/RoleContext";
import axios from "axios";

import type { Dependency, Program, Process, Phase, ProcessHistoryRecord, ProcesoRow, BarRow } from "./types";
import { LABEL_PROCESO, selectorStyle } from "./constants";
import FaseBadge from "./components/FaseBadge";
import BarTable from "./components/BarTable";
import ProcesoTable from "./components/ProcesoTable";
import ProcesoDetalleCard from "./components/ProcesoDetalleCard";

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

  /* ── Modal agregar programa ── */
  const [modalOpen, setModalOpen]           = useState(false);
  const [newNombre, setNewNombre]           = useState("");
  const [newCodigoSnies, setNewCodigoSnies] = useState("");
  const [newFacultad, setNewFacultad]       = useState<string | null>(null);
  const [newModalidad, setNewModalidad]     = useState<string | null>(null);
  const [newNivelAcad, setNewNivelAcad]     = useState<string | null>(null);
  const [newNivelForm, setNewNivelForm]     = useState<string | null>(null);
  const [newNumCreditos, setNewNumCreditos] = useState("");
  const [newNumSemestres, setNewNumSemestres] = useState("");
  const [newAdmision, setNewAdmision]       = useState("");
  const [newNumEstudSaces, setNewNumEstudSaces] = useState("");
  const [saving, setSaving]                 = useState(false);
  const [saveError, setSaveError]           = useState<string | null>(null);

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
        grupos[f.dep_code] = { nombre: f.name, fase_0: 0, fase_1: 0, fase_2: 0, fase_3: 0, fase_4: 0, fase_5: 0, fase_6: 0 };
      }
    });
    programas.forEach((p) => {
      if (!grupos[p.dep_code_facultad]) return;
      const proc = getProceso(p.dep_code_programa, tipo);
      if (!proc?.fecha_vencimiento) return;
      const fase = proc.fase_actual ?? 0;
      (grupos[p.dep_code_facultad][`fase_${fase}` as keyof BarRow] as number) += 1;
    });
    return Object.values(grupos);
  };

  const barAcreditacion = buildBarData("AV");
  const barRegistro     = buildBarData("RC");

  const procesoRows: ProcesoRow[] = programasFiltradosCompleto.map((p) => {
    const procRC     = getProceso(p.dep_code_programa, "RC");
    const procAV     = getProceso(p.dep_code_programa, "AV");
    const pmProc     = getProceso(p.dep_code_programa, "PM");
    const parentTipo = pmProc?.parent_tipo_proceso ?? null;
    return {
      programa:     p,
      registro:     procRC?.fecha_vencimiento ? procRC.fase_actual : null,
      acreditacion: procAV?.fecha_vencimiento ? procAV.fase_actual : null,
      pmFase:       pmProc?.parent_process_id ? pmProc.fase_actual : null,
      pmLigadoA:    parentTipo,
      pmSubtipo:    pmProc?.parent_process_id ? (pmProc.subtipo ?? null) : null,
    };
  });

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
        nombre:                newNombre.trim(),
        codigo_snies:          newCodigoSnies.trim() || undefined,
        dep_code_facultad:     facultadObj?.dep_code,
        dep_code_programa:     `PROG_${Date.now()}`,
        modalidad:             newModalidad,
        nivel_academico:       newNivelAcad,
        nivel_formacion:       newNivelForm,
        num_creditos:          newNumCreditos ? parseInt(newNumCreditos) : undefined,
        num_semestres:         newNumSemestres ? parseInt(newNumSemestres) : undefined,
        admision_estudiantes:  newAdmision.trim() || undefined,
        num_estudiantes_saces: newNumEstudSaces ? parseInt(newNumEstudSaces) : undefined,
      });
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/programs`);
      setProgramas(Array.isArray(res.data) ? res.data : []);
      setNewNombre(""); setNewCodigoSnies(""); setNewFacultad(null); setNewModalidad(null);
      setNewNivelAcad(null); setNewNivelForm(null);
      setNewNumCreditos(""); setNewNumSemestres(""); setNewAdmision(""); setNewNumEstudSaces("");
      setModalOpen(false);
    } catch (err: any) {
      setSaveError(err?.response?.data?.error || "Error al guardar el programa.");
    } finally {
      setSaving(false);
    }
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
          {programa === "Todos" && (
            <Button variant="light" size="sm" fullWidth onClick={() => setModalOpen(true)}>Agregar programa</Button>
          )}
          <Button variant="subtle" size="sm" fullWidth onClick={abrirHistorial}>Ver historial</Button>
        </div>
      </Box>

      {/* ── Modal agregar programa ── */}
      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Agregar programa" centered size="lg">
        <Stack>
          <TextInput label="Nombre del programa" placeholder="Ej: Ingeniería de Sistemas"
            value={newNombre} onChange={(e) => setNewNombre(e.currentTarget.value)} required />
          <TextInput label="Código SNIES" placeholder="Ej: 12345"
            value={newCodigoSnies} onChange={(e) => setNewCodigoSnies(e.currentTarget.value)} />
          <Select label="Facultad" placeholder="Selecciona una facultad"
            data={facultades.map((f) => f.name)} value={newFacultad} onChange={setNewFacultad} searchable required />
          <SimpleGrid cols={2} spacing="sm">
            <Select label="Modalidad" placeholder="Selecciona" data={["Presencial", "Virtual", "Híbrido"]}
              value={newModalidad} onChange={setNewModalidad} />
            <Select label="Nivel académico" placeholder="Selecciona" data={["Pregrado", "Posgrado"]}
              value={newNivelAcad} onChange={setNewNivelAcad} />
            <Select label="Nivel de formación" placeholder="Selecciona"
              data={["Profesional", "Tecnológico", "Técnico", "Especialización", "Maestría", "Doctorado"]}
              value={newNivelForm} onChange={setNewNivelForm} />
            <TextInput label="Admisión de estudiantes" placeholder="Ej: Semestral"
              value={newAdmision} onChange={(e) => setNewAdmision(e.currentTarget.value)} />
            <TextInput label="Créditos" type="number" placeholder="Ej: 173"
              value={newNumCreditos} onChange={(e) => setNewNumCreditos(e.currentTarget.value)} />
            <TextInput label="Semestres" type="number" placeholder="Ej: 10"
              value={newNumSemestres} onChange={(e) => setNewNumSemestres(e.currentTarget.value)} />
            <TextInput label="Nro. estudiantes en SACES" type="number" placeholder="Ej: 250"
              value={newNumEstudSaces} onChange={(e) => setNewNumEstudSaces(e.currentTarget.value)} />
          </SimpleGrid>
          {saveError && <Notification color="red" withCloseButton={false}>{saveError}</Notification>}
          <Button onClick={handleGuardarPrograma} loading={saving} fullWidth>Guardar programa</Button>
        </Stack>
      </Modal>

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
                          data={["Profesional", "Tecnológico", "Técnico", "Especialización", "Maestría", "Doctorado"]}
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
                        <TextInput label="Nro. estudiantes en SACES" type="number" value={editForm.num_estudiantes_saces ?? ""}
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
                        { label: "Nro. estudiantes en SACES", value: selectedProgram.num_estudiantes_saces },
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
                      const allPMs    = procesos.filter(p => p.program_code === selectedProgram.dep_code_programa && p.tipo_proceso === "PM");
                      const pmActivo  = allPMs.find(p => p.parent_process_id != null) ?? allPMs[0] ?? null;
                      const parentProc = pmActivo ? procesos.find(p => p._id === pmActivo.parent_process_id) : null;
                      return (
                        <Paper withBorder radius="sm" p="sm" style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
                          <Text size="xs" fw={700} c="var(--mantine-color-blue-light-color)" mb={6}>Plan de mejoramiento</Text>
                          {pmActivo ? (
                            <>
                              <Text size="xs" fw={700} c="#000">Ligado a</Text>
                              <Text size="sm" c="#000" fw={400} mb={4}>{parentProc ? LABEL_PROCESO[parentProc.tipo_proceso] : "—"}</Text>
                              <Text size="xs" fw={700} c="#000">Entrega plan al CNA</Text>
                              <Text size="sm" c="#000" fw={400} mb={4}>{pmActivo.fecha_entrega_pm_cna ?? "—"}</Text>
                              <Text size="xs" fw={700} c="#000">Radicación ante CNA</Text>
                              <Text size="sm" c="#000" fw={400}>{pmActivo.fecha_radicacion_avance_cna ?? "—"}</Text>
                            </>
                          ) : (
                            <Text size="xs" c="dimmed" mt={4}>No hay plan de mejoramiento activo</Text>
                          )}
                        </Paper>
                      );
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
            {historialDetalle.fases.map(f => (
              <div key={f.fase_numero}>
                <Group gap="xs" mb={4}>
                  <Text size="xs" fw={700}>Fase {f.fase_numero} — {f.fase_nombre}</Text>
                  <Text size="xs" c="dimmed">({f.actividades_completadas}/{f.actividades_total} actividades completadas)</Text>
                </Group>
                {f.documentos.length > 0 ? (
                  <Stack gap={2} pl="sm">
                    {f.documentos.map((d, i) => (
                      <Anchor key={i} href={d.view_link} target="_blank" size="xs">📎 {d.name}</Anchor>
                    ))}
                  </Stack>
                ) : (
                  <Text size="xs" c="dimmed" pl="sm">Sin documentos</Text>
                )}
              </div>
            ))}
          </Stack>
        )}
      </Modal>

    </div>
  );
};

export default DateReviewPage;
