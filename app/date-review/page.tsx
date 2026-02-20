"use client";

import { useState, useEffect } from "react";
import { Title, Select, Button, Text, Paper, Box, SimpleGrid, Group, Loader, Table, ScrollArea, Modal, TextInput, Stack, Notification } from "@mantine/core";
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
  fase_acreditacion: number | null;
  fase_registro_calificado: number | null;
  fase_plan_mejoramiento: number | null;
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

const EstadoBadge = ({ estado }: { estado: string | null }) => {
  if (!estado) return <Text size="xs" c="dimmed">—</Text>;
  const color = estadoColor[estado] ?? "#ced4da";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color, flexShrink: 0 }} />
      <Text size="xs">{estado}</Text>
    </div>
  );
};

const ProcesoTable = ({ title, rows }: { title: string; rows: { nombre: string; acreditacion: string | null; registro: string | null; plan: string | null }[] }) => (
  <Paper withBorder radius="md" p="md" mb="lg">
    <Text fw={700} ta="center" mb="md" size="sm">{title}</Text>
    <ScrollArea>
      <Table withTableBorder withColumnBorders>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ minWidth: 160 }}> </Table.Th>
            <Table.Th>Acreditación voluntaria</Table.Th>
            <Table.Th>Registro calificado</Table.Th>
            <Table.Th>Plan de mejoramiento</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length === 0 ? (
            <Table.Tr>
              <Table.Td colSpan={4}>
                <Text ta="center" c="dimmed" size="sm">Sin datos para el filtro seleccionado</Text>
              </Table.Td>
            </Table.Tr>
          ) : (
            rows.map((row, i) => (
              <Table.Tr key={i}>
                <Table.Td><Text size="xs" fw={600}>{row.nombre}</Text></Table.Td>
                <Table.Td><EstadoBadge estado={row.acreditacion} /></Table.Td>
                <Table.Td><EstadoBadge estado={row.registro} /></Table.Td>
                <Table.Td><EstadoBadge estado={row.plan} /></Table.Td>
              </Table.Tr>
            ))
          )}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  </Paper>
);

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
  const [loadingFacultades, setLoadingFacultades] = useState(true);
  const [loadingProgramas, setLoadingProgramas]   = useState(true);


  /* Modal agregar programa */
  const [modalOpen, setModalOpen]     = useState(false);
  const [newNombre, setNewNombre]     = useState("");
  const [newFacultad, setNewFacultad] = useState<string | null>(null);
  const [newModalidad, setNewModalidad]   = useState<string | null>(null);
  const [newNivelAcad, setNewNivelAcad]   = useState<string | null>(null);
  const [newNivelForm, setNewNivelForm]   = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState<string | null>(null);

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

  /* Opciones para los Select */
  const loadingFilters        = loadingFacultades || loadingProgramas;
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
     Programas sin fase asignada cuentan en fase_0. */
  const buildBarData = (campo: "fase_acreditacion" | "fase_registro_calificado" | "fase_plan_mejoramiento"): BarRow[] => {
    /* Inicializa una fila por cada facultad que tenga programas */
    const grupos: Record<string, BarRow> = {};
    facultades.forEach((f) => {
      const tienePrograms = programas.some((p) => p.dep_code_facultad === f.dep_code);
      if (tienePrograms) {
        grupos[f.dep_code] = { nombre: f.name, fase_0: 0, fase_1: 0, fase_2: 0, fase_3: 0, fase_4: 0, fase_5: 0, fase_6: 0 };
      }
    });
    /* Cuenta programas por fase; sin fase → fase_0 */
    programas.forEach((p) => {
      if (!grupos[p.dep_code_facultad]) return;
      const fase = p[campo] ?? 0;
      const key = `fase_${fase}` as keyof BarRow;
      (grupos[p.dep_code_facultad][key] as number) += 1;
    });
    return Object.values(grupos);
  };

  const barAcreditacion     = buildBarData("fase_acreditacion");
  const barRegistro         = buildBarData("fase_registro_calificado");
  const barPlanMejoramiento = buildBarData("fase_plan_mejoramiento");

  /* Filas para la tabla de procesos */
  const procesoRows = programasFiltradosCompleto.map((p) => ({
    nombre: p.nombre,
    acreditacion: p.estado_acreditacion ?? null,
    registro: p.estado_registro_calificado ?? null,
    plan: p.estado_plan_mejoramiento ?? null,
  }));

  const tituloTabla = facultad === "Todos"
    ? "Estado general de procesos de todos los programas"
    : `Estado general de procesos de programas de ${facultad.toLowerCase().replace("facultad", "facultad de").trim()}`;

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
        paddingTop: "76px",
        paddingBottom: "140px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mantine-color-body)",
        zIndex: 50,
      }}>
        {/* Filtros centrados verticalmente */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", flex: 1, justifyContent: "center" }}>
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

            {/* Tabla resumen de programas */}
            <Paper withBorder radius="md" p="md" mb="lg">
              <Text fw={700} ta="center" mb="md" size="sm">Resumen de programas</Text>
              {loadingFilters ? (
                <Loader size="sm" mx="auto" display="block" />
              ) : (
                <ScrollArea>
                  <Table striped highlightOnHover withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Programa</Table.Th>
                        <Table.Th>Facultad</Table.Th>
                        <Table.Th>Modalidad</Table.Th>
                        <Table.Th>Nivel académico</Table.Th>
                        <Table.Th>Nivel de formación</Table.Th>
                        <Table.Th>Créditos</Table.Th>
                        <Table.Th>Semestres</Table.Th>
                        <Table.Th>Fecha reg. calificado</Table.Th>
                        <Table.Th>Fecha acreditación</Table.Th>
                        <Table.Th>Estado</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {tablaBase.length === 0 ? (
                        <Table.Tr>
                          <Table.Td colSpan={10}>
                            <Text ta="center" c="dimmed" size="sm">Sin datos para el filtro seleccionado</Text>
                          </Table.Td>
                        </Table.Tr>
                      ) : (
                        tablaBase.map((row) => (
                          <Table.Tr key={row._id}>
                            <Table.Td>{row.programa}</Table.Td>
                            <Table.Td>{row.dependencia}</Table.Td>
                            <Table.Td>{row.modalidad}</Table.Td>
                            <Table.Td>{row.nivel_academico}</Table.Td>
                            <Table.Td>{row.nivel_formacion}</Table.Td>
                            <Table.Td>{row.num_creditos}</Table.Td>
                            <Table.Td>{row.num_semestres}</Table.Td>
                            <Table.Td>{row.fecha_registro_calificado}</Table.Td>
                            <Table.Td>{row.fecha_acreditacion}</Table.Td>
                            <Table.Td>{row.estado}</Table.Td>
                          </Table.Tr>
                        ))
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              )}
            </Paper>

            {loadingProgramas ? (
              <Loader size="sm" mx="auto" display="block" my="lg" />
            ) : (
              <ProcesoTable title={tituloTabla} rows={procesoRows} />
            )}

            <BarTable
              title="Estado general de fases — Acreditación voluntaria"
              data={barAcreditacion}
            />
            <BarTable
              title="Estado general de fases — Registro calificado"
              data={barRegistro}
            />
            <BarTable
              title="Estado general de fases — Plan de mejoramiento"
              data={barPlanMejoramiento}
            />
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
