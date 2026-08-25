"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Box,
  Container,
  Title,
  Text,
  SimpleGrid,
  Paper,
  Group,
  ThemeIcon,
  Loader,
  Center,
  Button,
  Divider,
  Stack,
  Tooltip,
  ScrollArea,
  Table,
  Accordion,
  Badge,
  Progress,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconLayoutDashboard,
  IconBuildingCommunity,
  IconChartBar,
  IconCalendarEvent,
  IconUsers,
  IconHeartHandshake,
  IconTarget,
  IconRoute,
  IconAward,
  IconBriefcase,
  IconFileSpreadsheet,
} from "@tabler/icons-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import axios from "axios";
import { useRouter } from "next/navigation";
import { usePeriod } from "@/app/context/PeriodContext";
import ConsultaInfoSidebar from "../components/ConsultaInfoSidebar";

interface DistributionEntry {
  value: string;
  count: number;
}

interface PlantillaNumericField {
  name: string;
  total: number;
  average: number;
  count: number;
}

interface PlantillaCategoricalField {
  name: string;
  distribution: DistributionEntry[];
  topValue: string;
  topCount: number;
  totalValues: number;
}

// Desglose GENERICO de una plantilla dentro de su ámbito: sus propios
// totales/promedios numéricos y su propia distribución de valores, sin
// mezclarse con las demás plantillas del ámbito.
interface PlantillaStats {
  templateId: string;
  name: string;
  totalRegistros: number;
  numeric: PlantillaNumericField[];
  categorical: PlantillaCategoricalField[];
  timeline: TimelinePoint[];
}

interface TimelinePoint {
  month: string; // "YYYY-MM"
  totalRegistros: number;
}

interface ActividadCurada {
  codigo: string;
  descripcion: string;
}

interface DependenciaCurada {
  dependencia: string;
  totalActividades: number;
}

// Resumen a la medida, presente SOLO en el ámbito Bienestar Institucional.
interface CuradoBienestar {
  totalActividades: number;
  totalParticipantes: number;
  totalRecursoHumano: number;
  totalBeneficiarios: number;
  totalPersonasImpactadas: number;
  actividades: ActividadCurada[];
  porDependencia: DependenciaCurada[];
}

interface RutaAprendizaje {
  ruta: string;
  matriculados: number;
  insignias: number;
}

// Resumen a la medida de la plantilla RUTAS_DE_APRENDIZAJE (Estructura y
// Procesos Académicos).
interface CuradoRutasAprendizaje {
  totalMatriculados: number;
  totalRutas: number;
  totalInsigniasEntregadas: number;
  rutas: RutaAprendizaje[];
}

interface EmpresaPractica {
  empresa: string;
  estudiantes: number;
}

interface ModalidadPractica {
  modalidad: string;
  estudiantes: number;
}

// Resumen a la medida de Prácticas Académicas (Estructura y Procesos
// Académicos).
interface CuradoPracticas {
  totalEstudiantes: number;
  totalEmpresas: number;
  porEmpresa: EmpresaPractica[];
  porModalidad: ModalidadPractica[];
}

interface NamedValue {
  name: string;
  value: number;
}

interface ActividadBienestarAnalytics {
  fileId: string;
  fileName: string;
  nature: string;
  totalActivities: number;
  registeredBeneficiaries: number;
  totalParticipations: number;
  groupedBeneficiaries: number;
  externalBeneficiaries: number;
  humanResourceRecords: number;
  activitiesByUnit: NamedValue[];
  activitiesByCategory: NamedValue[];
  activitiesByMonth: NamedValue[];
  beneficiariesByType: NamedValue[];
  beneficiariesByUnit: NamedValue[];
  humanResourcesByUnit: NamedValue[];
  humanResourcesByCategory: NamedValue[];
}

interface DimensionStats {
  _id: string;
  name: string;
  totalRegistrosReportados: number;
  plantillas: PlantillaStats[];
  timeline: TimelinePoint[];
  curado: CuradoBienestar | null;
  rutasAprendizaje: CuradoRutasAprendizaje | null;
  practicas: CuradoPracticas | null;
  actividadBienestar: ActividadBienestarAnalytics | null;
}

const BLUE = "#228be6";
const DONUT_COLORS = ["#7048e8", "#228be6", "#20c997", "#fd7e14", "#e64980"];

const formatNumber = (value: number, maxDecimals = 0) =>
  value.toLocaleString("es-CO", { maximumFractionDigits: maxDecimals });

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

// Las categorias se entienden mejor como proporcion del total; por eso se
// presentan como dona y se acompanan con una leyenda compacta y accesible.
function CategoricalFieldDonut({ field }: { field: PlantillaCategoricalField }) {
  const visibleTotal = field.distribution.reduce((sum, entry) => sum + entry.count, 0);
  const otherCount = Math.max(0, field.totalValues - visibleTotal);
  const data = [
    ...field.distribution.map((entry) => ({ name: entry.value, value: entry.count })),
    ...(otherCount > 0 ? [{ name: "Otros", value: otherCount }] : []),
  ];

  return (
    <Paper withBorder radius="md" p="sm">
      <Tooltip label={field.name} disabled={field.name.length <= 46} multiline w={300}>
        <Text size="sm" fw={600} lineClamp={1} mb={6}>{field.name}</Text>
      </Tooltip>
      <Group wrap="nowrap" align="center" gap="sm">
        <Box w={150} h={130} style={{ flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={34} outerRadius={55} paddingAngle={2}>
                {data.map((entry, idx) => (
                  <Cell key={entry.name} fill={entry.name === "Otros" ? "#adb5bd" : DONUT_COLORS[idx % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
            </PieChart>
          </ResponsiveContainer>
        </Box>
        <Stack gap={5} style={{ minWidth: 0, flex: 1 }}>
          {data.slice(0, 6).map((entry, idx) => {
            const pct = field.totalValues > 0 ? Math.round((entry.value / field.totalValues) * 100) : 0;
            return (
              <Group key={entry.name} gap={6} wrap="nowrap" justify="space-between">
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  <Box w={8} h={8} style={{ borderRadius: "50%", flexShrink: 0, background: entry.name === "Otros" ? "#adb5bd" : DONUT_COLORS[idx % DONUT_COLORS.length] }} />
                  <Text size="xs" lineClamp={1}>{entry.name}</Text>
                </Group>
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{entry.value} · {pct}%</Text>
              </Group>
            );
          })}
        </Stack>
      </Group>
    </Paper>
  );
}

// Tarjeta de una plantilla dentro del acordeón "Desglose por plantilla": sus
// totales/promedios numéricos y su distribución de valores categóricos.
function PlantillaPanel({ plantilla }: { plantilla: PlantillaStats }) {
  if (plantilla.numeric.length === 0 && plantilla.categorical.length === 0) {
    return <Text size="sm" c="dimmed" ta="center" py="sm">Sin campos relevantes para resumir todavía.</Text>;
  }

  const numericChartData = plantilla.numeric.map((f) => ({
    name: truncate(f.name, 26),
    fullName: f.name,
    total: f.total,
    average: f.average,
  }));

  return (
    <Stack gap="md">
      {numericChartData.length > 0 && (
        <Box>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Totales reportados</Text>
          <ResponsiveContainer width="100%" height={Math.max(60, numericChartData.length * 34)}>
            <BarChart data={numericChartData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
              <ReTooltip
                formatter={(value: any, _name: any, entry: any) => [
                  `Total ${formatNumber(Number(value), 1)} · promedio ${formatNumber(entry?.payload?.average ?? 0, 1)}`,
                  "",
                ]}
                labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
              />
              <Bar dataKey="total" fill={BLUE} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {plantilla.categorical.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {plantilla.categorical.map((field) => (
            <CategoricalFieldDonut key={field.name} field={field} />
          ))}
        </SimpleGrid>
      )}

      {plantilla.timeline.length > 1 && (
        <Box>
          <Text size="xs" fw={600} c="dimmed" mb={4}>Evolución de registros cargados</Text>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={plantilla.timeline} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
              <Line type="monotone" dataKey="totalRegistros" stroke="#7048e8" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Stack>
  );
}

function MetricCard({ label, value, color = "violet" }: { label: string; value: number; color?: string }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Text size="xs" c="dimmed" fw={600}>{label}</Text>
      <Text fw={800} size="xl" c={color}>{formatNumber(value)}</Text>
    </Paper>
  );
}

function NamedDonut({ title, data }: { title: string; data: NamedValue[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <CategoricalFieldDonut
      field={{
        name: title,
        distribution: data.map((item) => ({ value: item.name, count: item.value })),
        topValue: data[0]?.name || "",
        topCount: data[0]?.value || 0,
        totalValues: total,
      }}
    />
  );
}

function ActividadBienestarReport({ report }: { report: ActividadBienestarAnalytics }) {
  const categoryChartData = report.activitiesByCategory.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));
  const humanCategoryData = report.humanResourcesByCategory.map((item) => ({
    ...item,
    shortName: truncate(item.name, 30),
  }));

  return (
    <Paper withBorder radius="md" p="md" mb="lg" style={{ borderColor: "var(--mantine-color-violet-3)" }}>
      <Group justify="space-between" mb="md" align="flex-start">
        <Box>
          <Group gap="xs">
            <IconFileSpreadsheet size={20} color="#7048e8" />
            <Text fw={800}>{report.fileName}</Text>
            <Badge color="violet" variant="light">{report.nature}</Badge>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>Análisis funcional de las cuatro hojas relacionadas</Text>
        </Box>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 4 }} spacing="sm" mb="lg">
        <MetricCard label="Actividades únicas" value={report.totalActivities} />
        <MetricCard label="Beneficiarios registrados" value={report.registeredBeneficiaries} color="blue" />
        <MetricCard label="Participaciones" value={report.totalParticipations} color="cyan" />
        <MetricCard label="Beneficiarios agrupados" value={report.groupedBeneficiaries} color="teal" />
        <MetricCard label="Beneficiarios externos" value={report.externalBeneficiaries} color="orange" />
        <MetricCard label="Registros de recurso humano" value={report.humanResourceRecords} color="indigo" />
      </SimpleGrid>
      <Text size="xs" c="dimmed" mb="lg">
        Los beneficiarios registrados y los beneficiarios agrupados provienen de hojas distintas; se muestran separados para evitar duplicarlos.
      </Text>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Actividades por unidad responsable" data={report.activitiesByUnit} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Actividades por categoría</Text>
          <ResponsiveContainer width="100%" height={Math.max(210, categoryChartData.length * 34)}>
            <BarChart data={categoryChartData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Actividades"]} />
              <Bar dataKey="value" fill="#228be6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" my="lg">
        <NamedDonut title="Beneficiarios por tipo" data={report.beneficiariesByType} />
        <NamedDonut title="Beneficiarios por unidad" data={report.beneficiariesByUnit} />
      </SimpleGrid>

      <Divider label="Recurso humano" labelPosition="left" my="lg" />
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg" mb="lg">
        <NamedDonut title="Recurso humano por unidad" data={report.humanResourcesByUnit} />
        <Box>
          <Text size="sm" fw={700} mb={4}>Recurso humano por categoría de actividad</Text>
          <ResponsiveContainer width="100%" height={Math.max(210, humanCategoryData.length * 34)}>
            <BarChart data={humanCategoryData} layout="vertical" margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="shortName" width={180} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
              <Bar dataKey="value" fill="#15aabf" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </SimpleGrid>

      {report.activitiesByMonth.length > 1 && (
        <Box mt="lg">
          <Text size="sm" fw={700} mb={4}>Actividades iniciadas por mes</Text>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={report.activitiesByMonth} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Actividades"]} />
              <Line type="monotone" dataKey="value" stroke="#e64980" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
}

// Tablero de estadisticas POR ÁMBITO: dentro de cada ámbito, desglosa el
// contenido real reportado por CADA PLANTILLA por separado (no todo
// mezclado), y destaca con resúmenes a la medida (stat cards + gráficas) los
// procesos que lo ameritan (Bienestar, Rutas de Aprendizaje, Prácticas).
export default function TableroPorAmbitoPage() {
  const router = useRouter();
  const { selectedPeriodId } = usePeriod();
  const [stats, setStats] = useState<DimensionStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/tablero-stats`, {
        params: selectedPeriodId ? { periodId: selectedPeriodId } : {},
      })
      .then((res) => {
        if (!active) return;
        const data: DimensionStats[] = res.data?.stats || [];
        setStats([...data].sort((a, b) => b.totalRegistrosReportados - a.totalRegistrosReportados));
      })
      .catch(() => {
        if (active) setStats([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedPeriodId]);

  const barDataByAmbito = useMemo(
    () => stats.map((s) => ({
      name: s.name.length > 18 ? `${s.name.slice(0, 18)}…` : s.name,
      fullName: s.name,
      registros: s.totalRegistrosReportados,
    })),
    [stats]
  );

  return (
    <Box style={{ display: "flex", minHeight: "100vh" }}>
      <ConsultaInfoSidebar />
      <Box style={{ flex: 1, padding: 20 }}>
        <Container size="xl">
          <Group gap={10} mb="lg">
            <ActionIcon variant="subtle" onClick={() => router.push("/historico-docentes/ambitos")}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <ThemeIcon size={40} radius="xl" color="grape" variant="light">
              <IconLayoutDashboard size={22} />
            </ThemeIcon>
            <div>
              <Title order={3}>Consulta de Información</Title>
              <Text size="xs" c="dimmed">Tablero por Ámbito</Text>
            </div>
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : stats.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">No hay ámbitos configurados todavía.</Text>
          ) : (
            <>
              <Paper withBorder radius="md" p="md" mb="lg">
                <Group gap="xs" mb="sm">
                  <ThemeIcon color="blue" variant="light" size={26} radius="xl"><IconChartBar size={14} /></ThemeIcon>
                  <Text fw={700} size="sm">Registros reportados por ámbito</Text>
                </Group>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barDataByAmbito} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" interval={0} height={70} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <ReTooltip
                      formatter={(value: any) => [Number(value).toLocaleString("es-CO"), "Registros"]}
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
                    />
                    <Bar dataKey="registros" fill={BLUE} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>

              <Stack gap="md">
                {stats.map((dimension) => {
                  const dependenciaChartData = dimension.curado
                    ? dimension.curado.porDependencia.slice(0, 10).map((d) => ({
                      name: d.dependencia.length > 26 ? `${d.dependencia.slice(0, 26)}…` : d.dependencia,
                      fullName: d.dependencia,
                      total: d.totalActividades,
                    }))
                    : [];

                  const rutasChartData = dimension.rutasAprendizaje
                    ? dimension.rutasAprendizaje.rutas.map((r) => ({
                      name: r.ruta.length > 26 ? `${r.ruta.slice(0, 26)}…` : r.ruta,
                      fullName: r.ruta,
                      matriculados: r.matriculados,
                      insignias: r.insignias,
                    }))
                    : [];

                  const empresasChartData = dimension.practicas
                    ? dimension.practicas.porEmpresa.map((e) => ({
                      name: e.empresa,
                      estudiantes: e.estudiantes,
                    }))
                    : [];

                  const visiblePlantillas = dimension.actividadBienestar
                    ? []
                    : dimension.plantillas;

                  const hasNothingToShow = !dimension.actividadBienestar
                    && !dimension.curado
                    && !dimension.rutasAprendizaje
                    && !dimension.practicas
                    && visiblePlantillas.length === 0;

                  return (
                    <Paper key={dimension._id} withBorder radius="md" p="md">
                      <Group justify="space-between" align="center" mb="md">
                        <Text fw={700} size="lg">{dimension.name}</Text>
                        <Text fw={800} size="lg" c="violet" style={{ whiteSpace: "nowrap" }}>
                          {dimension.actividadBienestar
                            ? `${dimension.actividadBienestar.totalActivities.toLocaleString("es-CO")} actividades`
                            : `${dimension.totalRegistrosReportados.toLocaleString("es-CO")} reg.`}
                        </Text>
                      </Group>

                      {hasNothingToShow && (
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          Sin información reportada todavía.
                        </Text>
                      )}

                      {dimension.actividadBienestar && (
                        <ActividadBienestarReport report={dimension.actividadBienestar} />
                      )}

                      {dimension.curado && !dimension.actividadBienestar && (
                        <Box mb="lg">
                          <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="md" mb="lg">
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="violet" variant="light" size={32} radius="xl"><IconCalendarEvent size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Actividades</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalActividades.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="indigo" variant="light" size={32} radius="xl"><IconUsers size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Recurso humano</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalRecursoHumano.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="blue" variant="light" size={32} radius="xl"><IconUsers size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Participantes</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalParticipantes.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="teal" variant="light" size={32} radius="xl"><IconHeartHandshake size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Beneficiarios</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalBeneficiarios.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="orange" variant="light" size={32} radius="xl"><IconTarget size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Personas impactadas</Text>
                                  <Text fw={800} size="lg">{dimension.curado.totalPersonasImpactadas.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                          </SimpleGrid>

                          <Box mb="lg">
                            <Text size="xs" fw={600} c="dimmed" mb={4}>Actividades por dependencia</Text>
                            <ResponsiveContainer width="100%" height={Math.max(140, dependenciaChartData.length * 32)}>
                              <BarChart data={dependenciaChartData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                                <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11 }} />
                                <ReTooltip
                                  formatter={(value: any) => [value, "Actividades"]}
                                  labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
                                />
                                <Bar dataKey="total" fill="#7048e8" radius={[0, 6, 6, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </Box>

                          <Box>
                            <Text size="xs" fw={600} c="dimmed" mb={4}>
                              Actividades registradas ({dimension.curado.actividades.length})
                            </Text>
                            <ScrollArea h={320} type="auto">
                              <Table striped withTableBorder stickyHeader>
                                <Table.Thead>
                                  <Table.Tr>
                                    <Table.Th style={{ width: 140 }}>Código</Table.Th>
                                    <Table.Th>Descripción</Table.Th>
                                  </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                  {dimension.curado.actividades.map((actividad) => (
                                    <Table.Tr key={actividad.codigo}>
                                      <Table.Td style={{ whiteSpace: "nowrap" }}>{actividad.codigo}</Table.Td>
                                      <Table.Td>{actividad.descripcion}</Table.Td>
                                    </Table.Tr>
                                  ))}
                                </Table.Tbody>
                              </Table>
                            </ScrollArea>
                          </Box>
                        </Box>
                      )}

                      {dimension.rutasAprendizaje && !dimension.actividadBienestar && (
                        <Box mb="lg">
                          <Group gap={6} mb="sm">
                            <ThemeIcon color="grape" variant="light" size={24} radius="xl"><IconRoute size={13} /></ThemeIcon>
                            <Text fw={700} size="sm">Rutas de aprendizaje</Text>
                          </Group>
                          <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md" mb="md">
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="grape" variant="light" size={32} radius="xl"><IconUsers size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Matriculados</Text>
                                  <Text fw={800} size="lg">{dimension.rutasAprendizaje.totalMatriculados.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="teal" variant="light" size={32} radius="xl"><IconRoute size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Rutas activas</Text>
                                  <Text fw={800} size="lg">{dimension.rutasAprendizaje.totalRutas.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="orange" variant="light" size={32} radius="xl"><IconAward size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Insignias entregadas</Text>
                                  <Text fw={800} size="lg">{dimension.rutasAprendizaje.totalInsigniasEntregadas.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                          </SimpleGrid>
                          <Text size="xs" fw={600} c="dimmed" mb={4}>Matriculados por ruta</Text>
                          <ResponsiveContainer width="100%" height={Math.max(100, rutasChartData.length * 36)}>
                            <BarChart data={rutasChartData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                              <YAxis type="category" dataKey="name" width={190} tick={{ fontSize: 11 }} />
                              <ReTooltip
                                formatter={(value: any, name: any) => [value, name === "matriculados" ? "Matriculados" : "Insignias"]}
                                labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
                              />
                              <Bar dataKey="matriculados" fill="#7048e8" radius={[0, 6, 6, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </Box>
                      )}

                      {dimension.practicas && !dimension.actividadBienestar && (
                        <Box mb="lg">
                          <Group gap={6} mb="sm">
                            <ThemeIcon color="cyan" variant="light" size={24} radius="xl"><IconBriefcase size={13} /></ThemeIcon>
                            <Text fw={700} size="sm">Prácticas académicas</Text>
                          </Group>
                          <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="md" mb="md">
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="cyan" variant="light" size={32} radius="xl"><IconUsers size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Estudiantes en práctica</Text>
                                  <Text fw={800} size="lg">{dimension.practicas.totalEstudiantes.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                            <Paper withBorder radius="md" p="sm">
                              <Group gap="xs">
                                <ThemeIcon color="indigo" variant="light" size={32} radius="xl"><IconBriefcase size={16} /></ThemeIcon>
                                <Box>
                                  <Text size="xs" c="dimmed" fw={600}>Empresas vinculadas</Text>
                                  <Text fw={800} size="lg">{dimension.practicas.totalEmpresas.toLocaleString("es-CO")}</Text>
                                </Box>
                              </Group>
                            </Paper>
                          </SimpleGrid>
                          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                            <Box>
                              <Text size="xs" fw={600} c="dimmed" mb={4}>Estudiantes por empresa (top 10)</Text>
                              <ResponsiveContainer width="100%" height={Math.max(100, empresasChartData.length * 30)}>
                                <BarChart data={empresasChartData} layout="vertical" margin={{ top: 4, right: 20, left: 4, bottom: 4 }}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                                  <ReTooltip formatter={(value: any) => [value, "Estudiantes"]} />
                                  <Bar dataKey="estudiantes" fill="#15aabf" radius={[0, 6, 6, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </Box>
                            {dimension.practicas.porModalidad.length > 0 && (
                              <Box>
                                <Text size="xs" fw={600} c="dimmed" mb={4}>Por modalidad</Text>
                                <Stack gap={6}>
                                  {dimension.practicas.porModalidad.map((m, idx) => {
                                    const pct = dimension.practicas!.totalEstudiantes > 0
                                      ? Math.round((m.estudiantes / dimension.practicas!.totalEstudiantes) * 100)
                                      : 0;
                                    return (
                                      <Box key={m.modalidad}>
                                        <Group justify="space-between" gap="xs" mb={2}>
                                          <Text size="xs" lineClamp={1}>{m.modalidad}</Text>
                                          <Text size="xs" c="dimmed">{m.estudiantes} · {pct}%</Text>
                                        </Group>
                                        <Progress value={pct} color={DONUT_COLORS[idx % DONUT_COLORS.length]} size="sm" radius="xl" />
                                      </Box>
                                    );
                                  })}
                                </Stack>
                              </Box>
                            )}
                          </SimpleGrid>
                        </Box>
                      )}

                      {visiblePlantillas.length > 0 && (
                        <Box>
                          <Group gap={6} mb="xs">
                            <IconFileSpreadsheet size={14} color="var(--mantine-color-gray-6)" />
                            <Text size="xs" fw={600} c="dimmed">Desglose por plantilla</Text>
                          </Group>
                          <Accordion
                            multiple
                            defaultValue={dimension.actividadBienestar ? [] : visiblePlantillas.slice(0, 2).map((plantilla) => plantilla.templateId)}
                            variant="separated"
                            radius="md"
                          >
                            {visiblePlantillas.map((plantilla) => (
                              <Accordion.Item key={plantilla.templateId} value={plantilla.templateId}>
                                <Accordion.Control>
                                  <Group justify="space-between" wrap="nowrap" pr="sm">
                                    <Text size="sm" fw={600} lineClamp={1}>{plantilla.name}</Text>
                                    <Badge variant="light" color="blue" style={{ flexShrink: 0 }}>
                                      {plantilla.totalRegistros.toLocaleString("es-CO")} reg.
                                    </Badge>
                                  </Group>
                                </Accordion.Control>
                                <Accordion.Panel>
                                  <PlantillaPanel plantilla={plantilla} />
                                </Accordion.Panel>
                              </Accordion.Item>
                            ))}
                          </Accordion>
                        </Box>
                      )}

                      {!dimension.actividadBienestar && dimension.timeline.length > 1 && (
                        <Box mt="lg">
                          <Text size="xs" fw={600} c="dimmed" mb={4}>Evolución del ámbito</Text>
                          <ResponsiveContainer width="100%" height={210}>
                            <LineChart data={dimension.timeline} margin={{ top: 10, right: 16, left: 0, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                              <ReTooltip formatter={(value: any) => [formatNumber(Number(value)), "Registros"]} />
                              <Line type="monotone" dataKey="totalRegistros" stroke="#228be6" strokeWidth={3} dot={{ r: 4 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </Box>
                      )}

                      <Divider my="sm" />
                      <Button
                        variant="subtle"
                        size="xs"
                        leftSection={<IconBuildingCommunity size={14} />}
                        onClick={() => router.push(`/historico-docentes/ambito/${dimension._id}?tab=plantillas`)}
                      >
                        Ver ámbito
                      </Button>
                    </Paper>
                  );
                })}
              </Stack>
            </>
          )}
        </Container>
      </Box>
    </Box>
  );
}
