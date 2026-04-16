"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Center, Container, Group, Loader, Paper,
  Progress, RingProgress, Select, SimpleGrid, Stack, Text,
  ThemeIcon, Title, Tooltip, Divider,
} from "@mantine/core";
import {
  IconArrowLeft, IconAlertTriangle, IconBuildingFactory2,
  IconChartDonut3, IconClockHour4, IconCurrencyDollar,
  IconLayoutDashboard, IconRefresh,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import type { DashboardResumen, DashboardCorte, ConteoSemaforos, Semaforo } from "../types";
import { usePdiConfig } from "../hooks/usePdiConfig";

// ── Helpers ────────────────────────────────────────────────────────────────

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde:    "teal",
  amarillo: "yellow",
  rojo:     "red",
};

const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde:    "En meta",
  amarillo: "En riesgo",
  rojo:     "Crítico",
};
const formatAnioRange = (anioInicio?: number, anioFin?: number) =>
  anioInicio && anioFin ? `${anioInicio} - ${anioFin}` : "Sin rango definido";


function fmtCOP(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function SemaforoBar({ conteo }: { conteo: ConteoSemaforos }) {
  const total = conteo.verde + conteo.amarillo + conteo.rojo;
  if (!total) return <Text size="xs" c="dimmed">Sin datos</Text>;
  return (
    <Group gap={8}>
      {(["verde", "amarillo", "rojo"] as Semaforo[]).map((s) => (
        conteo[s] > 0 && (
          <Tooltip key={s} label={`${SEMAFORO_LABEL[s]}: ${conteo[s]}`}>
            <Badge color={SEMAFORO_COLOR[s]} variant="light" size="sm">
              {conteo[s]}
            </Badge>
          </Tooltip>
        )
      ))}
    </Group>
  );
}

function KpiCard({
  icon, title, value, sub, color = "violet",
}: {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
}) {
  return (
    <Paper withBorder radius="md" p="md">
      <Group gap={12} align="flex-start">
        <ThemeIcon size={40} radius="xl" color={color} variant="light">
          {icon}
        </ThemeIcon>
        <div style={{ flex: 1 }}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">{title}</Text>
          <Text fw={700} size="xl" lh={1.2}>{value}</Text>
          {sub && <Text size="xs" c="dimmed" mt={2}>{sub}</Text>}
        </div>
      </Group>
    </Paper>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { config } = usePdiConfig();

  const [resumen, setResumen]     = useState<DashboardResumen | null>(null);
  const [corteData, setCorteData] = useState<DashboardCorte | null>(null);
  const [cortes, setCortes]       = useState<{ value: string; label: string }[]>([]);
  const [periodoSel, setPeriodoSel] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadingCorte, setLoadingCorte] = useState(false);

  const cargarResumen = async () => {
    setLoading(true);
    try {
      const [rRes, rCortes] = await Promise.all([
        axios.get(PDI_ROUTES.dashboardResumen()),
        axios.get(PDI_ROUTES.cortesActivos()),
      ]);
      setResumen(rRes.data);
      const sorted = [...rRes.data ? [] : [], ...rCortes.data]
        .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre, undefined, { numeric: true }));
      const opts = sorted.map((c: any) => ({ value: c.nombre, label: c.descripcion ? `${c.nombre} — ${c.descripcion}` : c.nombre }));
      setCortes(opts);
      if (opts.length && !periodoSel) setPeriodoSel(opts[opts.length - 1].value);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargarResumen(); }, []);

  useEffect(() => {
    if (!periodoSel) return;
    setLoadingCorte(true);
    axios.get(PDI_ROUTES.dashboardCorte(periodoSel))
      .then(res => setCorteData(res.data))
      .catch(console.error)
      .finally(() => setLoadingCorte(false));
  }, [periodoSel]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="xl" py="xl">

          {/* Header */}
          <Group justify="space-between" mb="xl">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={42} radius="xl" color="violet" variant="light">
                <IconLayoutDashboard size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Tablero de control PDI</Title>
                <Text size="sm" c="dimmed">{config.nombre} - {formatAnioRange(config.anio_inicio, config.anio_fin)}</Text>
              </div>
            </Group>
            <ActionIcon variant="light" color="violet" size="lg" onClick={cargarResumen} title="Actualizar">
              <IconRefresh size={18} />
            </ActionIcon>
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : !resumen ? (
            <Center py="xl"><Text c="dimmed">No se pudo cargar el tablero</Text></Center>
          ) : (
            <Stack gap="xl">

              {/* Avance global */}
              <Paper withBorder radius="xl" p="xl" shadow="sm">
                <Group gap={32} align="center" wrap="wrap">
                  <RingProgress
                    size={120}
                    thickness={12}
                    roundCaps
                    sections={[{ value: resumen.avance_global, color: SEMAFORO_COLOR[resumen.semaforo_global] }]}
                    label={
                      <Center>
                        <Text fw={700} size="lg">{resumen.avance_global}%</Text>
                      </Center>
                    }
                  />
                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Avance global PDI</Text>
                    <Title order={2} c={SEMAFORO_COLOR[resumen.semaforo_global]}>
                      {resumen.avance_global}%
                    </Title>
                    <Badge color={SEMAFORO_COLOR[resumen.semaforo_global]} variant="light" mt={4}>
                      {SEMAFORO_LABEL[resumen.semaforo_global]}
                    </Badge>
                  </div>
                  <Divider orientation="vertical" />
                  <SimpleGrid cols={4} spacing="lg">
                    <div>
                      <Text size="xs" c="dimmed">Macroproyectos</Text>
                      <Text fw={700} size="xl">{resumen.estructura.macroproyectos}</Text>
                      <SemaforoBar conteo={resumen.semaforos.macroproyectos} />
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Proyectos</Text>
                      <Text fw={700} size="xl">{resumen.estructura.proyectos}</Text>
                      <SemaforoBar conteo={resumen.semaforos.proyectos} />
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Acciones</Text>
                      <Text fw={700} size="xl">{resumen.estructura.acciones}</Text>
                      <SemaforoBar conteo={resumen.semaforos.acciones} />
                    </div>
                    <div>
                      <Text size="xs" c="dimmed">Indicadores</Text>
                      <Text fw={700} size="xl">{resumen.estructura.indicadores}</Text>
                      <SemaforoBar conteo={resumen.semaforos.indicadores} />
                    </div>
                  </SimpleGrid>
                </Group>
              </Paper>

              {/* KPIs */}
              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                <KpiCard
                  icon={<IconCurrencyDollar size={20} />}
                  title="Presupuesto asignado"
                  value={fmtCOP(resumen.presupuesto.total)}
                  color="blue"
                />
                <KpiCard
                  icon={<IconBuildingFactory2 size={20} />}
                  title="Presupuesto ejecutado"
                  value={fmtCOP(resumen.presupuesto.ejecutado)}
                  sub={`${resumen.presupuesto.porcentaje_ejecucion}% del total`}
                  color={resumen.presupuesto.porcentaje_ejecucion >= 70 ? "teal" : "orange"}
                />
                <KpiCard
                  icon={<IconAlertTriangle size={20} />}
                  title="Indicadores con alertas"
                  value={resumen.alertas.indicadores_con_alertas}
                  color="orange"
                />
                <KpiCard
                  icon={<IconClockHour4 size={20} />}
                  title="Indicadores con retrasos"
                  value={resumen.retrasos.indicadores_con_retrasos}
                  color="red"
                />
              </SimpleGrid>

              {/* Ejecución presupuestal */}
              {resumen.presupuesto.total > 0 && (
                <Paper withBorder radius="md" p="md">
                  <Text size="sm" fw={600} mb="sm">Ejecución presupuestal</Text>
                  <Progress
                    value={resumen.presupuesto.porcentaje_ejecucion}
                    size="lg"
                    radius="xl"
                    color={resumen.presupuesto.porcentaje_ejecucion >= 70 ? "teal" : "orange"}
                  />
                  <Group justify="space-between" mt={4}>
                    <Text size="xs" c="dimmed">Ejecutado: {fmtCOP(resumen.presupuesto.ejecutado)}</Text>
                    <Text size="xs" c="dimmed">Total: {fmtCOP(resumen.presupuesto.total)}</Text>
                  </Group>
                </Paper>
              )}

              {/* Alertas activas */}
              {resumen.alertas.detalle.length > 0 && (
                <Paper withBorder radius="md" p="md">
                  <Group gap={8} mb="sm">
                    <IconAlertTriangle size={16} color="orange" />
                    <Text size="sm" fw={600}>Alertas activas en indicadores</Text>
                  </Group>
                  <Stack gap="xs">
                    {resumen.alertas.detalle.map((ind) => (
                      <Paper key={ind._id} withBorder radius="sm" p="sm" style={{ borderColor: "var(--mantine-color-orange-3)" }}>
                        <Group justify="space-between" mb={4}>
                          <Group gap={6}>
                            <Text size="xs" fw={700} c="dimmed">{ind.codigo}</Text>
                            <Text size="sm" fw={600}>{ind.nombre}</Text>
                          </Group>
                          <Badge color={SEMAFORO_COLOR[ind.semaforo]} variant="light" size="xs">
                            {ind.avance}%
                          </Badge>
                        </Group>
                        {ind.alertas.map((a, i) => (
                          <Text key={i} size="xs" c="dimmed">
                            <strong>{a.periodo}:</strong> {a.alertas}
                          </Text>
                        ))}
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              )}

              <Divider label="Seguimiento por corte" labelPosition="center" />

              {/* Selector de corte */}
              <Group gap={12} align="flex-end">
                <Select
                  label="Corte de seguimiento"
                  placeholder="Selecciona un periodo"
                  data={cortes}
                  value={periodoSel}
                  onChange={setPeriodoSel}
                  style={{ width: 260 }}
                />
                {corteData && (
                  <Badge size="lg" color="violet" variant="light">
                    {corteData.porcentaje_cobertura}% cobertura
                  </Badge>
                )}
              </Group>

              {loadingCorte && <Center py="md"><Loader size="sm" /></Center>}

              {!loadingCorte && corteData && (
                <Stack gap="md">
                  {/* KPIs del corte */}
                  <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                    <Paper withBorder radius="md" p="md" ta="center">
                      <Text size="xs" c="dimmed">Con reporte</Text>
                      <Text fw={700} size="xl" c="teal">{corteData.con_reporte}</Text>
                    </Paper>
                    <Paper withBorder radius="md" p="md" ta="center">
                      <Text size="xs" c="dimmed">Sin reporte</Text>
                      <Text fw={700} size="xl" c="red">{corteData.sin_reporte}</Text>
                    </Paper>
                    <Paper withBorder radius="md" p="md" ta="center">
                      <Text size="xs" c="dimmed">Con alertas</Text>
                      <Text fw={700} size="xl" c="orange">{corteData.con_alertas}</Text>
                    </Paper>
                    <Paper withBorder radius="md" p="md" ta="center">
                      <Text size="xs" c="dimmed">Con retrasos</Text>
                      <Text fw={700} size="xl" c="red">{corteData.con_retrasos}</Text>
                    </Paper>
                  </SimpleGrid>

                  {/* Cobertura */}
                  <Paper withBorder radius="md" p="md">
                    <Text size="sm" fw={600} mb="sm">
                      Cobertura de reportes — {corteData.periodo}
                    </Text>
                    <Progress
                      value={corteData.porcentaje_cobertura}
                      size="lg"
                      radius="xl"
                      color={corteData.porcentaje_cobertura >= 80 ? "teal" : corteData.porcentaje_cobertura >= 50 ? "yellow" : "red"}
                    />
                    <Group justify="space-between" mt={4}>
                      <Text size="xs" c="dimmed">{corteData.con_reporte} reportados</Text>
                      <Text size="xs" c="dimmed">{corteData.total_indicadores} total</Text>
                    </Group>
                  </Paper>

                  {/* Indicadores pendientes */}
                  {corteData.indicadores_pendientes.length > 0 && (
                    <Paper withBorder radius="md" p="md">
                      <Group gap={8} mb="sm">
                        <IconClockHour4 size={16} color="#fa5252" />
                        <Text size="sm" fw={600} c="red">
                          Indicadores sin reporte ({corteData.indicadores_pendientes.length})
                        </Text>
                      </Group>
                      <Stack gap={4}>
                        {corteData.indicadores_pendientes.map((ind) => (
                          <Group key={ind._id} justify="space-between" px="sm" py={4}
                            style={{ borderRadius: 6, background: "var(--mantine-color-red-0)" }}>
                            <Group gap={8}>
                              <Text size="xs" fw={700} c="dimmed">{ind.codigo}</Text>
                              <Text size="sm">{ind.nombre}</Text>
                            </Group>
                            <Text size="xs" c="dimmed">{ind.responsable || "Sin responsable"}</Text>
                          </Group>
                        ))}
                      </Stack>
                    </Paper>
                  )}

                  {/* Indicadores reportados */}
                  {corteData.indicadores_reportados.length > 0 && (
                    <Paper withBorder radius="md" p="md">
                      <Group gap={8} mb="sm">
                        <IconChartDonut3 size={16} />
                        <Text size="sm" fw={600}>
                          Indicadores reportados ({corteData.indicadores_reportados.length})
                        </Text>
                      </Group>
                      <Stack gap={6}>
                        {corteData.indicadores_reportados.map((ind) => (
                          <Paper key={ind._id} withBorder radius="sm" p="sm">
                            <Group justify="space-between" mb={4}>
                              <Group gap={8}>
                                <Text size="xs" fw={700} c="dimmed">{ind.codigo}</Text>
                                <Text size="sm" fw={600}>{ind.nombre}</Text>
                              </Group>
                              <Group gap={6}>
                                {ind.tiene_alertas && (
                                  <Tooltip label="Tiene alertas">
                                    <IconAlertTriangle size={14} color="orange" />
                                  </Tooltip>
                                )}
                                {ind.tiene_retrasos && (
                                  <Tooltip label="Tiene retrasos justificados">
                                    <IconClockHour4 size={14} color="#fa5252" />
                                  </Tooltip>
                                )}
                                <Badge color={SEMAFORO_COLOR[ind.semaforo]} variant="light" size="xs">
                                  {ind.avance ?? "—"}
                                </Badge>
                                <Badge
                                  color={ind.estado_reporte === "Aprobado" ? "teal" : ind.estado_reporte === "Enviado" ? "blue" : "gray"}
                                  variant="light" size="xs"
                                >
                                  {ind.estado_reporte}
                                </Badge>
                              </Group>
                            </Group>
                            {ind.resultados_alcanzados && (
                              <Text size="xs" c="dimmed" lineClamp={2}>{ind.resultados_alcanzados}</Text>
                            )}
                          </Paper>
                        ))}
                      </Stack>
                    </Paper>
                  )}
                </Stack>
              )}
            </Stack>
          )}
        </Container>
      </div>
    </div>
  );
}
