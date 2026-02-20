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

type ProgramSummary = {
  _id: string;
  programa: string;
  dependencia: string;
  modalidad: string | null;
  nivel_academico: string | null;
  nivel_formacion: string | null;
};

/* ── Tarjetas de estadística ── */
const statCards = [
  { label: "Total de programas académicos activos", value: "27",  color: "#228be6" },
  { label: "Total de programas con Acreditación V.", value: "15", color: "#228be6" },
  { label: "Porcentaje de programas acreditados",    value: "48%", color: "#228be6" },
  { label: "Total de programas con Registro C.",     value: "10", color: "#228be6" },
  { label: "Cantidad de programas inactivos",        value: "2",  color: "#228be6" },
  { label: "Total de programas con Plan de mejora",  value: "11", color: "#228be6" },
];

/* ── Colores de segmentos de barra ── */
const segmentColors = [
  { key: "completo",      color: "#69db7c", label: "Completo" },
  { key: "inicio",        color: "#ffd43b", label: "Inicio del proceso" },
  { key: "documentacion", color: "#ffa94d", label: "Documentación de lectura de par" },
  { key: "digitacion",    color: "#f783ac", label: "Digitación en SACES" },
  { key: "fechaLimite",   color: "#ff6b6b", label: "Fecha Límite" },
];

type BarRow = {
  nombre: string;
  completo: number;
  inicio: number;
  documentacion: number;
  digitacion: number;
  fechaLimite: number;
};

/* Los datos de barras se cargan desde la API */

const BarTable = ({ title, data }: { title: string; data: BarRow[] }) => (
  <Paper withBorder radius="md" p="md" mb="lg">
    <Text fw={700} ta="center" mb="md" size="sm">{title}</Text>
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {data.map((row, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Text size="xs" style={{ width: "140px", flexShrink: 0 }}>{row.nombre}:</Text>
          <div style={{ flex: 1 }}><StackedBar row={row} /></div>
        </div>
      ))}
    </div>
    <Group gap="md" mt="md" justify="center">
      {segmentColors.map((s) => (
        <Group key={s.key} gap={4}>
          <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: s.color }} />
          <Text size="xs">{s.label}</Text>
        </Group>
      ))}
    </Group>
  </Paper>
);

const StackedBar = ({ row }: { row: BarRow }) => {
  const total = row.completo + row.inicio + row.documentacion + row.digitacion + row.fechaLimite;
  const segments = [
    { value: row.completo,      color: "#69db7c" },
    { value: row.inicio,        color: "#ffd43b" },
    { value: row.documentacion, color: "#ffa94d" },
    { value: row.digitacion,    color: "#f783ac" },
    { value: row.fechaLimite,   color: "#ff6b6b" },
  ];
  return (
    <div style={{ display: "flex", height: "28px", borderRadius: "6px", overflow: "hidden", width: "100%" }}>
      {segments.filter(seg => seg.value > 0).map((seg, i) => (
        <div
          key={i}
          style={{
            width: `${(seg.value / total) * 100}%`,
            backgroundColor: seg.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 600,
            color: "#333",
          }}
        >
          {seg.value}
        </div>
      ))}
    </div>
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
};

const DateReviewPage = () => {
  const { userRole } = useRole();

  const [facultad, setFacultad]     = useState<string>("Todos");
  const [programa, setPrograma]     = useState<string>("Todos");
  const [tipoProceso, setTipoProceso] = useState<string>("Todos");

  const [facultades, setFacultades] = useState<Dependency[]>([]);
  const [programas, setProgramas]   = useState<Dependency[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);

  const [programsSummary, setProgramsSummary]   = useState<ProgramSummary[]>([]);
  const [loadingTable, setLoadingTable]         = useState(true);

  const [barData, setBarData]                   = useState<BarRow[]>([]);
  const [loadingBars, setLoadingBars]           = useState(true);

  /* Modal agregar programa */
  const [modalOpen, setModalOpen]               = useState(false);
  const [newNombre, setNewNombre]               = useState("");
  const [newFacultad, setNewFacultad]           = useState<string | null>(null);
  const [newModalidad, setNewModalidad]         = useState<string | null>(null);
  const [newNivelAcad, setNewNivelAcad]         = useState<string | null>(null);
  const [newNivelForm, setNewNivelForm]         = useState<string | null>(null);
  const [saving, setSaving]                     = useState(false);
  const [saveError, setSaveError]               = useState<string | null>(null);

  /* Carga facultades y programas desde la API */
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`)
      .then((res) => {
        const all: Dependency[] = res.data;
        /* Solo dependencias sin padre cuyo nombre contenga "Facultad" */
        const onlyFacultades = all.filter(
          (d) => !d.dep_father && d.name.toLowerCase().includes("facultad")
        );
        const facultyCodes = new Set(onlyFacultades.map((f) => f.dep_code));
        /* Solo programas que sean hijos de esas facultades */
        const onlyProgramas = all.filter(
          (d) => d.dep_father && facultyCodes.has(d.dep_father)
        );
        setFacultades(onlyFacultades);
        setProgramas(onlyProgramas);
      })
      .catch((err) => console.error("Error cargando dependencias:", err))
      .finally(() => setLoadingFilters(false));
  }, []);

  /* Carga resumen de programas */
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/programs-summary`)
      .then((res) => setProgramsSummary(res.data))
      .catch((err) => console.error("Error cargando resumen de programas:", err))
      .finally(() => setLoadingTable(false));
  }, []);

  /* Carga datos de barras de estado de procesos */
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/process-status`)
      .then((res) => setBarData(res.data))
      .catch((err) => console.error("Error cargando estado de procesos:", err))
      .finally(() => setLoadingBars(false));
  }, []);

  /* Cuando cambia la facultad, resetea el programa */
  const handleFacultadChange = (val: string | null) => {
    setFacultad(val ?? "Todos");
    setPrograma("Todos");
  };

  /* Programas filtrados según facultad seleccionada */
  const programasFiltrados =
    facultad === "Todos"
      ? programas
      : programas.filter((p) => p.dep_father === facultad);

  /* Opciones para los Select */
  const opcionesFacultad = [
    "Todos",
    ...facultades.map((f) => f.name),
  ];

  const opcionesPrograma = [
    "Todos",
    ...programasFiltrados.map((p) => p.name),
  ];

  const opcionesTipoProceso = ["Todos", "Acreditación voluntaria", "Registro calificado", "Plan de mejoramiento"];

  const handleGuardarPrograma = async () => {
    if (!newNombre.trim() || !newFacultad) {
      setSaveError("El nombre y la facultad son obligatorios.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const facultadObj = facultades.find((f) => f.name === newFacultad);
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/programs`, {
        name: newNombre.trim(),
        dep_father: facultadObj?.dep_code,
        modalidad: newModalidad,
        nivel_academico: newNivelAcad,
        nivel_formacion: newNivelForm,
      });
      /* Recargar listas */
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`);
      const all: Dependency[] = res.data;
      const onlyFacultades = all.filter((d) => !d.dep_father && d.name.toLowerCase().includes("facultad"));
      const facultyCodes = new Set(onlyFacultades.map((f) => f.dep_code));
      setProgramas(all.filter((d) => d.dep_father && facultyCodes.has(d.dep_father)));
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
        paddingTop: "76px",   /* espacio para que navbar lo tape */
        paddingBottom: "140px", /* espacio para que footer lo tape */
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--mantine-color-body)",
        zIndex: 50,           /* menor que navbar/footer (100) → estos lo tapan */
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

      {/* CONTENIDO DERECHO — flujo normal, marginLeft para no quedar bajo el sidebar */}
      <div style={{
        marginLeft: "201px",   /* 200px sidebar + 1px border */
        flex: 1,
        padding: "20px",
        paddingTop: "70px",    /* espacio para el botón "Volver" */
        minHeight: "calc(100vh - 194px)", /* empuja el footer al fondo: 57px navbar + 137px footer */
      }}>
        {userRole === "Administrador" && (
          <>
            <Title ta="center" mb="lg">Estadísticas generales</Title>

            {/* Tarjeta grande azul con 6 tarjetas blancas dentro */}
            <Paper radius="md" p="md" mb="lg"
              style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
              <SimpleGrid cols={2} spacing="sm">
                {statCards.map((card, i) => (
                  <Paper key={i} radius="md" p="md" style={{ textAlign: "center", backgroundColor: "white" }}>
                    <Text size="sm" fw={600} c="var(--mantine-color-blue-light-color)">{card.label}</Text>
                    <Text size="xl" fw={700} c={card.color} mt={4}>{card.value}</Text>
                  </Paper>
                ))}
              </SimpleGrid>
            </Paper>

{/* Tabla resumen de programas */}
<Paper withBorder radius="md" p="md" mb="lg">
              <Text fw={700} ta="center" mb="md" size="sm">Resumen de programas</Text>
              {loadingTable ? (
                <Loader size="sm" mx="auto" display="block" />
              ) : (
                <ScrollArea>
                  <Table striped highlightOnHover withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Programa</Table.Th>
                        <Table.Th>Dependencia</Table.Th>
                        <Table.Th>Modalidad</Table.Th>
                        <Table.Th>Nivel académico</Table.Th>
                        <Table.Th>Nivel de formación</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {programsSummary.length === 0 ? (
                        <Table.Tr>
                          <Table.Td colSpan={5}>
                            <Text ta="center" c="dimmed" size="sm">Sin datos</Text>
                          </Table.Td>
                        </Table.Tr>
                      ) : (
                        programsSummary.map((row) => (
                          <Table.Tr key={row._id}>
                            <Table.Td>{row.programa}</Table.Td>
                            <Table.Td>{row.dependencia}</Table.Td>
                            <Table.Td>{row.modalidad ?? "—"}</Table.Td>
                            <Table.Td>{row.nivel_academico ?? "—"}</Table.Td>
                            <Table.Td>{row.nivel_formacion ?? "—"}</Table.Td>
                          </Table.Tr>
                        ))
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              )}
            </Paper>


            {loadingBars ? (
              <Loader size="sm" mx="auto" display="block" my="lg" />
            ) : (
              <>
                <BarTable
                  title="Estado general de procesos de programas por dependencias de acreditación voluntaria"
                  data={barData}
                />
                <BarTable
                  title="Estado general de procesos de programas por dependencias de registros calificados"
                  data={barData}
                />
                <BarTable
                  title="Estado general de procesos de programas por dependencias de plan de mejoramiento"
                  data={barData}
                />
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

    </div>
  );
};

export default DateReviewPage;
