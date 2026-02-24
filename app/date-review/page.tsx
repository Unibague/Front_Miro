"use client";

import { useState, useEffect } from "react";
import { Title, Select, Button, Text, Paper, Box, SimpleGrid, Group, Loader, Table, ScrollArea, Modal, TextInput, Stack, Notification, Divider, Badge } from "@mantine/core";
import { useRole } from "@/app/context/RoleContext";
import axios from "axios";

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
  fecha_acreditacion: string | null;
  fecha_registro_calificado: string | null;
  estado: string;
  estado_acreditacion: string | null;
  estado_registro_calificado: string | null;
  estado_plan_mejoramiento: string | null;
};

type Process = {
  _id: string;
  name: string;
  program_code: string;
  tipo_proceso: "RC" | "AV" | "PM";
  fase_actual: number;
  fecha_inicio: string | null;
  fecha_documento_par: string | null;
  fecha_digitacion_saces: string | null;
  fecha_radicado_men: string | null;
  fecha_vencimiento: string | null;
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
  return <Text size="xs" fw={600} ta="center">Fase {fase}</Text>;
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

const DateReviewPage = () => {
  const { userRole } = useRole();

  const [facultad, setFacultad]           = useState<string>("Todos");
  const [programa, setPrograma]           = useState<string>("Todos");
  const [nivelAcademico, setNivelAcademico] = useState<string>("Todos");
  const [tipoProceso, setTipoProceso]     = useState<string>("Todos");

  const [facultades, setFacultades]         = useState<Dependency[]>([]);
  const [programas, setProgramas]           = useState<Program[]>([]);
  const [procesos, setProcesos]             = useState<Process[]>([]);
  const [loadingFacultades, setLoadingFacultades] = useState(true);
  const [loadingProgramas, setLoadingProgramas]   = useState(true);
  const [loadingProcesos, setLoadingProcesos]     = useState(true);


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
      fecha_acreditacion: p.fecha_acreditacion ?? "—",
      fecha_registro_calificado: p.fecha_registro_calificado ?? "—",
      estado: p.estado,
    }));

  /* Estadísticas calculadas desde los programas filtrados */
  const programasFiltradosCompleto = programasFiltrados
    .filter((p) => programa === "Todos" || p.nombre === programa)
    .filter((p) => nivelAcademico === "Todos" || p.nivel_academico === nivelAcademico);

  const totalActivos       = programasFiltradosCompleto.filter((p) => p.estado === "Activo").length;
  const totalInactivos     = programasFiltradosCompleto.filter((p) => p.estado === "Inactivo").length;
  const conAcreditacion    = programasFiltradosCompleto.filter((p) => p.fecha_acreditacion && p.fecha_acreditacion !== "—").length;
  const conRegistro        = programasFiltradosCompleto.filter((p) => p.fecha_registro_calificado && p.fecha_registro_calificado !== "—").length;
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
        paddingTop: "100px",
        paddingBottom: "140px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mantine-color-body)",
        zIndex: 50,
      }}>
        {/* Filtros centrados verticalmente */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1, justifyContent: "center" }}>
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
              <Select
                label="Programa"
                data={opcionesPrograma}
                value={programa}
                onChange={(v) => setPrograma(v ?? "Todos")}
                searchable={false}
                styles={selectorStyle}
              />
              <Select
                label="Nivel académico"
                data={opcionesNivelAcademico}
                value={nivelAcademico}
                onChange={(v) => setNivelAcademico(v ?? "Todos")}
                searchable={false}
                styles={selectorStyle}
              />
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

        {/* Botón siempre al fondo del sidebar */}
        <Button variant="light" size="sm" fullWidth style={{ marginTop: "auto" }} onClick={() => setModalOpen(true)}>
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
            <Title ta="center" mb="lg">Estadísticas generales</Title>

            {/* Tarjeta grande azul con 6 tarjetas blancas dentro */}
            <Paper radius="md" p="md" mb="lg"
              style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
              <SimpleGrid cols={2} spacing="sm">
                {[
                  { label: "Total de programas académicos activos",  value: totalActivos },
                  { label: "Total de programas con Registro Calificado",     value: conRegistro },
                  { label: "Porcentaje de programas acreditados",    value: `${pctAcreditados}%` },
                  { label: "Total de programas con Acreditación Voluntaria", value: conAcreditacion },
                  { label: "Cantidad de programas inactivos",        value: totalInactivos },
                  { label: "Total de programas registrados",         value: totalProgramas },
                ].map((card, i) => (
                  <Paper key={i} radius="md" p="md" style={{ textAlign: "center", backgroundColor: "white" }}>
                    <Text size="sm" fw={600} c="var(--mantine-color-blue-light-color)">{card.label}</Text>
                    <Text size="xl" fw={700} c="#228be6" mt={4}>{card.value}</Text>
                  </Paper>
                ))}
              </SimpleGrid>
            </Paper>

            {/* Modal con info del programa seleccionado */}
            <Modal
              opened={selectedProgram !== null}
              onClose={() => setSelectedProgram(null)}
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
                  <Text fw={600} size="sm" c="dimmed">INFORMACIÓN GENERAL</Text>
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
                        <Text size="sm" fw={600}>{value ?? "—"}</Text>
                      </Paper>
                    ))}
                  </SimpleGrid>

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
                              <Text size="xs" c="dimmed">Fase actual</Text>
                              <Text size="sm" fw={600} mb={4}>Fase {proc.fase_actual}</Text>
                              <Text size="xs" c="dimmed">Fecha vencimiento</Text>
                              <Text size="sm" fw={500} mb={4}>{proc.fecha_vencimiento ?? "—"}</Text>
                              <Text size="xs" c="dimmed">Fecha radicado MEN</Text>
                              <Text size="sm" fw={500}>{proc.fecha_radicado_men ?? "—"}</Text>
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

            {facultad !== "Todos" && (loadingProgramas ? (
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
