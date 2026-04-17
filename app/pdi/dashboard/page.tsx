"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Box, Center, Container, Divider, Group,
  Loader, Paper, Progress, SimpleGrid, Stack, Text,
  ThemeIcon, Title, RingProgress,
} from "@mantine/core";
import {
  IconArrowLeft, IconAlertTriangle, IconCurrencyDollar,
  IconLayoutDashboard, IconRefresh, IconTarget, IconTrendingUp,
  IconListCheck, IconBulb, IconChartDonut3, IconClockHour4,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import type { DashboardResumen, Macroproyecto, Semaforo } from "../types";
import { usePdiConfig } from "../hooks/usePdiConfig";

// ── Helpers ────────────────────────────────────────────────────────────────

const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde: "teal", amarillo: "yellow", rojo: "red",
};
const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde: "En meta", amarillo: "En riesgo", rojo: "Crítico",
};
const SEMAFORO_HEX: Record<Semaforo, string> = {
  verde: "#0d9488", amarillo: "#d97706", rojo: "#ef4444",
};

function fmtCOP(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}
const formatAnioRange = (a?: number, b?: number) =>
  a && b ? `${a} - ${b}` : "Sin rango definido";

function getSemaforoByAvance(avance: number): Semaforo {
  if (avance >= 90) return "verde";
  if (avance >= 60) return "amarillo";
  return "rojo";
}

// ── Sub-componentes ────────────────────────────────────────────────────────

function EstructuraCol({ label, total, icon }: { label: string; total: number; icon: React.ReactNode }) {
  return (
    <Box style={{ textAlign: "center" }}>
      <ThemeIcon size={32} radius="xl" color="violet" variant="light" mx="auto" mb={4}>
        {icon}
      </ThemeIcon>
      <Text fw={800} size="xl" lh={1}>{total}</Text>
      <Text size="xs" c="dimmed" mt={2}>{label}</Text>
    </Box>
  );
}

function StatCard({
  title, value, sub, color = "violet", icon, badge,
}: {
  title: string;
  value: React.ReactNode;
  sub?: string;
  color?: string;
  icon: React.ReactNode;
  badge?: string;
}) {
  return (
    <Paper withBorder radius="xl" p="md" style={{ position: "relative", overflow: "hidden" }}>
      {badge && (
        <Badge
          size="xs"
          color={color}
          variant="filled"
          style={{ position: "absolute", top: 10, right: 10 }}
        >
          {badge}
        </Badge>
      )}
      <ThemeIcon size={36} radius="xl" color={color} variant="light" mb={8}>
        {icon}
      </ThemeIcon>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase" mb={2}>{title}</Text>
      <Text fw={800} size="1.4rem" lh={1}>{value}</Text>
      {sub && <Text size="xs" c="dimmed" mt={4}>{sub}</Text>}
    </Paper>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { config } = usePdiConfig();

  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [macros, setMacros] = useState<Macroproyecto[]>([]);
  const [loading, setLoading] = useState(true);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [rResumen, rMacros] = await Promise.all([
        axios.get(PDI_ROUTES.dashboardResumen()),
        axios.get(PDI_ROUTES.macroproyectos()),
      ]);
      setResumen(rResumen.data);
      setMacros(rMacros.data ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargarDatos(); }, []);

  // Avance ponderado calculado igual que el Panorama general
  const pesosTotal = macros.reduce((s, m) => s + (m.peso ?? 0), 0);
  const avancePonderado = pesosTotal > 0
    ? Math.round(macros.reduce((s, m) => s + m.avance * (m.peso ?? 0), 0) / pesosTotal)
    : 0;
  const semaforo: Semaforo = getSemaforoByAvance(avancePonderado);

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
                <Text size="sm" c="dimmed">
                  {config.nombre} — {formatAnioRange(config.anio_inicio, config.anio_fin)}
                </Text>
              </div>
            </Group>
            <ActionIcon variant="light" color="violet" size="lg" onClick={cargarDatos} title="Actualizar">
              <IconRefresh size={18} />
            </ActionIcon>
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : !resumen ? (
            <Center py="xl"><Text c="dimmed">No se pudo cargar el tablero</Text></Center>
          ) : (
            <Stack gap="xl">

              {/* Bloque principal — avance + estructura */}
              <Paper
                withBorder
                radius="xl"
                p="xl"
                shadow="xs"
                style={{
                  background: "linear-gradient(135deg, rgba(124,58,237,0.05) 0%, rgba(255,255,255,0.98) 60%)",
                }}
              >
                <Group gap={32} align="center" wrap="wrap">

                  {/* Anillo */}
                  <RingProgress
                    size={130}
                    thickness={13}
                    roundCaps
                    sections={[{ value: avancePonderado, color: SEMAFORO_HEX[semaforo] }]}
                    label={
                      <Center>
                        <Stack gap={0} align="center">
                          <Text fw={800} size="xl" lh={1}>{avancePonderado}%</Text>
                          <Text size="10px" c="dimmed" tt="uppercase">avance</Text>
                        </Stack>
                      </Center>
                    }
                  />

                  {/* Texto avance */}
                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>Avance global PDI</Text>
                    <Title order={1} c={SEMAFORO_HEX[semaforo]} lh={1}>
                      {avancePonderado}%
                    </Title>
                    <Badge color={SEMAFORO_COLOR[semaforo]} variant="light" radius="xl" mt={6} size="md">
                      {SEMAFORO_LABEL[semaforo]}
                    </Badge>
                  </div>

                  <Divider orientation="vertical" style={{ height: 80 }} />

                  {/* Contadores estructura */}
                  <SimpleGrid cols={4} spacing="xl" style={{ flex: 1 }}>
                    <EstructuraCol label="Macros"      total={resumen.estructura.macroproyectos} icon={<IconChartDonut3 size={16} />} />
                    <EstructuraCol label="Proyectos"   total={resumen.estructura.proyectos}      icon={<IconListCheck size={16} />} />
                    <EstructuraCol label="Acciones"    total={resumen.estructura.acciones}       icon={<IconBulb size={16} />} />
                    <EstructuraCol label="Indicadores" total={resumen.estructura.indicadores}    icon={<IconTarget size={16} />} />
                  </SimpleGrid>

                </Group>
              </Paper>

              {/* KPI cards */}
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                <StatCard
                  icon={<IconCurrencyDollar size={18} />}
                  title="Presupuesto asignado"
                  value={fmtCOP(resumen.presupuesto.total)}
                  color="blue"
                />
                <StatCard
                  icon={<IconTrendingUp size={18} />}
                  title="Presupuesto ejecutado"
                  value={fmtCOP(resumen.presupuesto.ejecutado)}
                  sub={`${resumen.presupuesto.porcentaje_ejecucion}% del total`}
                  color={resumen.presupuesto.porcentaje_ejecucion >= 70 ? "teal" : "orange"}
                />
                <StatCard
                  icon={<IconAlertTriangle size={18} />}
                  title="Indicadores con alertas"
                  value={resumen.alertas.indicadores_con_alertas}
                  color="orange"
                  badge={resumen.alertas.indicadores_con_alertas > 0 ? "Revisar" : undefined}
                />
                <StatCard
                  icon={<IconClockHour4 size={18} />}
                  title="Indicadores con retrasos"
                  value={resumen.retrasos.indicadores_con_retrasos}
                  color="red"
                />
              </SimpleGrid>

              {/* Barra presupuestal */}
              {resumen.presupuesto.total > 0 && (
                <Paper withBorder radius="xl" p="md">
                  <Text size="sm" fw={600} mb="sm">Ejecución presupuestal</Text>
                  <Progress
                    value={resumen.presupuesto.porcentaje_ejecucion}
                    size="lg"
                    radius="xl"
                    color={resumen.presupuesto.porcentaje_ejecucion >= 70 ? "teal" : "orange"}
                  />
                  <Group justify="space-between" mt={6}>
                    <Text size="xs" c="dimmed">Ejecutado: <b>{fmtCOP(resumen.presupuesto.ejecutado)}</b></Text>
                    <Text size="xs" c="dimmed">Total: <b>{fmtCOP(resumen.presupuesto.total)}</b></Text>
                  </Group>
                </Paper>
              )}

            </Stack>
          )}
        </Container>
      </div>
    </div>
  );
}
