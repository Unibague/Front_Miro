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
  RingProgress,
  ScrollArea,
  Table,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconLayoutDashboard,
  IconBuildingCommunity,
  IconChartBar,
  IconChartDonut,
  IconCalendarEvent,
  IconUsers,
  IconHeartHandshake,
  IconTarget,
} from "@tabler/icons-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip,
} from "recharts";
import axios from "axios";
import { useRouter } from "next/navigation";
import { usePeriod } from "@/app/context/PeriodContext";
import ConsultaInfoSidebar from "../components/ConsultaInfoSidebar";

interface DistributionEntry {
  value: string;
  count: number;
}

interface NumericAggField {
  name: string;
  total: number;
  average: number;
  count: number;
  plantilla: string;
}

interface CategoricalAggField {
  name: string;
  distribution: DistributionEntry[];
  topValue: string;
  topCount: number;
  totalValues: number;
  plantilla: string;
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
  totalBeneficiarios: number;
  totalPersonasImpactadas: number;
  actividades: ActividadCurada[];
  porDependencia: DependenciaCurada[];
}

interface DimensionStats {
  _id: string;
  name: string;
  totalRegistrosReportados: number;
  resumen: {
    numeric: NumericAggField[];
    categorical: CategoricalAggField[];
  };
  timeline: TimelinePoint[];
  curado: CuradoBienestar | null;
}

const BLUE = "#228be6";
const DONUT_COLORS = ["#7048e8", "#228be6", "#20c997", "#fd7e14", "#e64980"];

const formatNumber = (value: number, maxDecimals = 0) =>
  value.toLocaleString("es-CO", { maximumFractionDigits: maxDecimals });

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

// Tablero de estadisticas POR ÁMBITO: agrupa el contenido real reportado por
// TODAS las plantillas de cada ámbito y lo presenta como si fuera del ámbito
// mismo — nada de conteos de plantillas/informes/dependencias, solo lo que
// efectivamente se reportó (totales/promedios numéricos y distribución de
// valores categóricos), con barras, línea de evolución y donas por ámbito.
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

  // Bienestar Institucional tiene un resumen a la medida (ver backend); el
  // resto de ámbitos usa el resumen genérico automático.
  const bienestarDim = stats.find((s) => s.curado);
  const otherDims = stats.filter((s) => !s.curado);

  const dependenciaChartData = useMemo(() => {
    if (!bienestarDim?.curado) return [];
    return bienestarDim.curado.porDependencia.slice(0, 10).map((d) => ({
      name: d.dependencia.length > 26 ? `${d.dependencia.slice(0, 26)}…` : d.dependencia,
      fullName: d.dependencia,
      total: d.totalActividades,
    }));
  }, [bienestarDim]);

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

              {bienestarDim?.curado && (
                <Paper withBorder radius="md" p="md" mb="lg">
                  <Group justify="space-between" align="center" mb="md">
                    <Text fw={700} size="lg">{bienestarDim.name}</Text>
                    <Text fw={800} size="lg" c="violet">
                      {bienestarDim.totalRegistrosReportados.toLocaleString("es-CO")} reg.
                    </Text>
                  </Group>

                  <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="lg">
                    <Paper withBorder radius="md" p="sm">
                      <Group gap="xs">
                        <ThemeIcon color="violet" variant="light" size={32} radius="xl"><IconCalendarEvent size={16} /></ThemeIcon>
                        <Box>
                          <Text size="xs" c="dimmed" fw={600}>Actividades</Text>
                          <Text fw={800} size="lg">{bienestarDim.curado.totalActividades.toLocaleString("es-CO")}</Text>
                        </Box>
                      </Group>
                    </Paper>
                    <Paper withBorder radius="md" p="sm">
                      <Group gap="xs">
                        <ThemeIcon color="blue" variant="light" size={32} radius="xl"><IconUsers size={16} /></ThemeIcon>
                        <Box>
                          <Text size="xs" c="dimmed" fw={600}>Participantes</Text>
                          <Text fw={800} size="lg">{bienestarDim.curado.totalParticipantes.toLocaleString("es-CO")}</Text>
                        </Box>
                      </Group>
                    </Paper>
                    <Paper withBorder radius="md" p="sm">
                      <Group gap="xs">
                        <ThemeIcon color="teal" variant="light" size={32} radius="xl"><IconHeartHandshake size={16} /></ThemeIcon>
                        <Box>
                          <Text size="xs" c="dimmed" fw={600}>Beneficiarios</Text>
                          <Text fw={800} size="lg">{bienestarDim.curado.totalBeneficiarios.toLocaleString("es-CO")}</Text>
                        </Box>
                      </Group>
                    </Paper>
                    <Paper withBorder radius="md" p="sm">
                      <Group gap="xs">
                        <ThemeIcon color="orange" variant="light" size={32} radius="xl"><IconTarget size={16} /></ThemeIcon>
                        <Box>
                          <Text size="xs" c="dimmed" fw={600}>Personas impactadas</Text>
                          <Text fw={800} size="lg">{bienestarDim.curado.totalPersonasImpactadas.toLocaleString("es-CO")}</Text>
                        </Box>
                      </Group>
                    </Paper>
                  </SimpleGrid>

                  <Box mb="lg">
                    <Text size="xs" fw={600} c="dimmed" mb={4}>Actividades por dependencia</Text>
                    <ResponsiveContainer width="100%" height={Math.max(140, dependenciaChartData.length * 32)}>
                      <BarChart
                        data={dependenciaChartData}
                        layout="vertical"
                        margin={{ top: 4, right: 20, left: 4, bottom: 4 }}
                      >
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
                      Actividades registradas ({bienestarDim.curado.actividades.length})
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
                          {bienestarDim.curado.actividades.map((actividad) => (
                            <Table.Tr key={actividad.codigo}>
                              <Table.Td style={{ whiteSpace: "nowrap" }}>{actividad.codigo}</Table.Td>
                              <Table.Td>{actividad.descripcion}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Box>

                  <Divider my="sm" />
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<IconBuildingCommunity size={14} />}
                    onClick={() => router.push(`/historico-docentes/ambito/${bienestarDim._id}?tab=plantillas`)}
                  >
                    Ver ámbito
                  </Button>
                </Paper>
              )}

              <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="md">
                {otherDims.map((dimension) => {
                  const numericChartData = dimension.resumen.numeric.map((f) => ({
                    name: truncate(f.name, 22),
                    fullName: f.name,
                    plantilla: f.plantilla,
                    total: f.total,
                    average: f.average,
                  }));

                  return (
                    <Paper key={dimension._id} withBorder radius="md" p="md">
                      <Group justify="space-between" align="center" mb="sm">
                        <Text fw={700} lineClamp={1}>{dimension.name}</Text>
                        <Text fw={800} size="lg" c="violet" style={{ whiteSpace: "nowrap" }}>
                          {dimension.totalRegistrosReportados.toLocaleString("es-CO")} reg.
                        </Text>
                      </Group>

                      {dimension.resumen.numeric.length === 0 && dimension.resumen.categorical.length === 0 ? (
                        <Text size="sm" c="dimmed" ta="center" py="md">
                          Sin campos relevantes para resumir todavía.
                        </Text>
                      ) : (
                        <Stack gap="sm">
                          {numericChartData.length > 0 && (
                            <Box>
                              <Text size="xs" fw={600} c="dimmed" mb={4}>Totales reportados</Text>
                              <ResponsiveContainer width="100%" height={Math.max(90, numericChartData.length * 34)}>
                                <BarChart
                                  data={numericChartData}
                                  layout="vertical"
                                  margin={{ top: 4, right: 20, left: 4, bottom: 4 }}
                                >
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                                  <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={140}
                                    tick={{ fontSize: 11 }}
                                  />
                                  <ReTooltip
                                    formatter={(value: any, _name: any, entry: any) => [
                                      `Total ${formatNumber(Number(value), 1)} · promedio ${formatNumber(entry?.payload?.average ?? 0, 1)}`,
                                      entry?.payload?.plantilla,
                                    ]}
                                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
                                  />
                                  <Bar dataKey="total" fill={BLUE} radius={[0, 6, 6, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </Box>
                          )}

                          {dimension.resumen.categorical.length > 0 && (
                            <Box>
                              <Group gap={6} mb={4}>
                                <IconChartDonut size={13} color="var(--mantine-color-grape-6)" />
                                <Text size="xs" fw={600} c="dimmed">Distribución de valores reportados</Text>
                              </Group>
                              <Stack gap="xs">
                                {dimension.resumen.categorical.map((field) => {
                                  const otherCount = field.totalValues
                                    - field.distribution.reduce((s, d) => s + d.count, 0);
                                  const pieData = [
                                    ...field.distribution.map((d) => ({ name: d.value, value: d.count })),
                                    ...(otherCount > 0 ? [{ name: "Otros", value: otherCount }] : []),
                                  ];
                                  const topPct = field.totalValues > 0
                                    ? Math.round((field.topCount / field.totalValues) * 100)
                                    : 0;
                                  const ringSections = pieData
                                    .map((entry, idx) => ({
                                      value: field.totalValues > 0 ? (entry.value / field.totalValues) * 100 : 0,
                                      color: entry.name === "Otros" ? "var(--mantine-color-gray-4)" : DONUT_COLORS[idx % DONUT_COLORS.length],
                                    }))
                                    .filter((section) => section.value > 0);
                                  return (
                                    <Paper key={field.name} withBorder radius="sm" p="sm">
                                      <Tooltip label={field.name} disabled={field.name.length <= 40} multiline w={280}>
                                        <Text size="sm" fw={600} lineClamp={1} mb={6}>{field.name}</Text>
                                      </Tooltip>
                                      <Group gap="md" wrap="nowrap" align="center">
                                        <RingProgress
                                          size={84}
                                          thickness={10}
                                          roundCaps
                                          sections={ringSections}
                                          label={<Text ta="center" fw={800} size="sm">{topPct}%</Text>}
                                          style={{ flexShrink: 0 }}
                                        />
                                        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                                          {pieData.slice(0, 4).map((entry, idx) => {
                                            const entryPct = field.totalValues > 0
                                              ? Math.round((entry.value / field.totalValues) * 100)
                                              : 0;
                                            return (
                                              <Group key={entry.name} gap={6} wrap="nowrap" align="flex-start">
                                                <Box
                                                  mt={4}
                                                  style={{
                                                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                                                    background: entry.name === "Otros" ? "var(--mantine-color-gray-4)" : DONUT_COLORS[idx % DONUT_COLORS.length],
                                                  }}
                                                />
                                                <Text size="sm" style={{ minWidth: 0, whiteSpace: "normal" }}>
                                                  {entry.name} <Text span c="dimmed" size="xs">({entry.value} · {entryPct}%)</Text>
                                                </Text>
                                              </Group>
                                            );
                                          })}
                                        </Stack>
                                      </Group>
                                    </Paper>
                                  );
                                })}
                              </Stack>
                            </Box>
                          )}
                        </Stack>
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
              </SimpleGrid>
            </>
          )}
        </Container>
      </Box>
    </Box>
  );
}
