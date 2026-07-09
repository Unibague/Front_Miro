"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Box, Button, Center, Container, Divider, Group,
  Loader, Paper, SimpleGrid, Stack, Text,
  ThemeIcon, Title, RingProgress,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowLeft, IconLayoutDashboard, IconRefresh, IconTarget,
  IconListCheck, IconBulb, IconChartDonut3, IconNetwork, IconFileSpreadsheet,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import PdiGraficas from "../components/PdiGraficas";
import type { DashboardResumen, Macroproyecto, Semaforo } from "../types";
import { usePdiConfig } from "../hooks/usePdiConfig";
import { getWeightedAverage } from "../avance-utils";

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
      <ThemeIcon size={40} radius="xl" color="violet" variant="light" mx="auto" mb={6}>
        {icon}
      </ThemeIcon>
      <Text fw={900} size="2rem" lh={1}>{total}</Text>
      <Text size="sm" c="dimmed" mt={4}>{label}</Text>
    </Box>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { userRole } = useRole();
  const isAdmin = userRole === "Administrador";
  const { config } = usePdiConfig();

  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [macros, setMacros] = useState<Macroproyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [exportandoIndicadores, setExportandoIndicadores] = useState(false);

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

  const handleExportarAvance = async () => {
    setExportando(true);
    try {
      const response = await axios.get(PDI_ROUTES.dashboardExportarAvance(), { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `pdi_memoria_calculo_avance_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showNotification({
        title: "Error",
        message: "No se pudo generar el Excel de avance",
        color: "red",
      });
    } finally {
      setExportando(false);
    }
  };

  const handleExportarIndicadoresMetas = async () => {
    setExportandoIndicadores(true);
    try {
      const response = await axios.get(PDI_ROUTES.dashboardExportarIndicadoresMetas(), { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `pdi_indicadores_metas_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showNotification({
        title: "Error",
        message: "No se pudo generar el Excel de indicadores y metas",
        color: "red",
      });
    } finally {
      setExportandoIndicadores(false);
    }
  };

  const avancePonderado = getWeightedAverage(macros, (macro) => macro.avance);
  const semaforo: Semaforo = getSemaforoByAvance(avancePonderado);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflowY: "auto", height: "100vh" }}>
        <Container size="xl" py="xl">

          {/* Header */}
          <Group justify="space-between" mb="xl">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push(isAdmin ? "/pdi" : "/pdi/mis-indicadores")}>
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
            <Group gap="xs">
              <Button
                variant="light"
                color="teal"
                radius="xl"
                leftSection={<IconFileSpreadsheet size={17} />}
                onClick={handleExportarAvance}
                loading={exportando}
              >
                Descargar memoria de cálculo (Excel)
              </Button>
              <Button
                variant="light"
                color="blue"
                radius="xl"
                leftSection={<IconFileSpreadsheet size={17} />}
                onClick={handleExportarIndicadoresMetas}
                loading={exportandoIndicadores}
              >
                Descargar indicadores y metas
              </Button>
              <Button
                variant="light"
                color="violet"
                radius="xl"
                leftSection={<IconNetwork size={17} />}
                onClick={() => router.push("/pdi/dashboard/red-nodos")}
              >
                Red de nodos
              </Button>
              <ActionIcon variant="light" color="violet" size="lg" onClick={cargarDatos} title="Actualizar">
                <IconRefresh size={18} />
              </ActionIcon>
            </Group>
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

                  <RingProgress
                    size={130}
                    thickness={13}
                    roundCaps
                    sections={[{ value: avancePonderado, color: SEMAFORO_HEX[semaforo] }]}
                    label={
                      <Center>
                        <Stack gap={0} align="center">
                          <Text fw={800} size="xl" lh={1}>{avancePonderado.toFixed(2)}%</Text>
                          <Text size="10px" c="dimmed" tt="uppercase">avance</Text>
                        </Stack>
                      </Center>
                    }
                  />

                  <div>
                    <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={4}>Avance global PDI</Text>
                    <Title order={1} c={SEMAFORO_HEX[semaforo]} lh={1}>
                      {avancePonderado.toFixed(2)}%
                    </Title>
                    <Badge color={SEMAFORO_COLOR[semaforo]} variant="light" radius="xl" mt={6} size="md">
                      {SEMAFORO_LABEL[semaforo]}
                    </Badge>
                  </div>

                  <Divider orientation="vertical" style={{ height: 80 }} />

                  <SimpleGrid cols={4} spacing="xl" style={{ flex: 1 }}>
                    <EstructuraCol label="Macroproyectos"        total={resumen.estructura.macroproyectos} icon={<IconChartDonut3 size={16} />} />
                    <EstructuraCol label="Proyectos"             total={resumen.estructura.proyectos}      icon={<IconListCheck size={16} />} />
                    <EstructuraCol label="Acciones Estratégicas" total={resumen.estructura.acciones}       icon={<IconBulb size={16} />} />
                    <EstructuraCol label="Indicadores"           total={resumen.estructura.indicadores}    icon={<IconTarget size={16} />} />
                  </SimpleGrid>

                </Group>
              </Paper>

              {/* Gráficas PDI — incluye tarjetas y barra presupuestal */}
              <PdiGraficas />

            </Stack>
          )}
        </Container>
      </div>
    </div>
  );
}
