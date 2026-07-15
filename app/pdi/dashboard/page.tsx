"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Box, Button, Center, Container, Divider, Group,
  Loader, Paper, SimpleGrid, Stack, Text,
  ThemeIcon, Title, RingProgress,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowLeft, IconLayoutDashboard, IconTarget,
  IconListCheck, IconBulb, IconChartDonut3, IconNetwork, IconFileSpreadsheet,
  IconCalculator,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import PdiGraficas from "../components/PdiGraficas";
import type { DashboardResumen, Macroproyecto, Semaforo } from "../types";
import { usePdiConfig } from "../hooks/usePdiConfig";
import { formatNumeroEs } from "../avance-utils";

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
  const [exportandoAnio, setExportandoAnio] = useState(false);
  const [exportandoIndicadores, setExportandoIndicadores] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

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
      link.setAttribute("download", `Memoria técnica del cálculo del avance del PDI ${new Date().toISOString().slice(0, 10)}.xlsx`);
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

  const handleExportarAvanceAnio = async () => {
    const anio = resumen?.anio_actual ?? String(new Date().getFullYear());
    setExportandoAnio(true);
    try {
      const response = await axios.get(PDI_ROUTES.dashboardExportarAvanceAnio(anio), { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Memoria técnica del cálculo del avance del PDI ${anio} ${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showNotification({
        title: "Error",
        message: `No se pudo generar el Excel de avance ${anio}`,
        color: "red",
      });
    } finally {
      setExportandoAnio(false);
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

  const handleRecalcular = async () => {
    setRecalculando(true);
    try {
      const response = await axios.post(PDI_ROUTES.recalcularTodos());
      await cargarDatos();
      showNotification({
        title: "Recalculado",
        message: response.data?.message || "El avance del PDI fue recalculado correctamente.",
        color: "teal",
      });
    } catch (e) {
      console.error(e);
      showNotification({
        title: "Error",
        message: "No se pudo recalcular el avance del PDI",
        color: "red",
      });
    } finally {
      setRecalculando(false);
    }
  };

  // Se usa el valor del backend (resumen.avance_global) en vez de recalcularlo
  // aquí, para que MIRÓ siempre muestre exactamente el mismo número que ya
  // calculó el servidor (y que replica la Memoria técnica en Excel).
  const avancePonderado = resumen?.avance_global ?? 0;
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
            <Group gap="xs" justify="flex-end" style={{ flex: 1 }}>
              {isAdmin && (
                <Button
                  variant="light"
                  color="teal"
                  radius="xl"
                  leftSection={<IconFileSpreadsheet size={17} />}
                  onClick={handleExportarAvance}
                  loading={exportando}
                >
                  Memoria técnica del cálculo del avance PDI
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="light"
                  color="teal"
                  radius="xl"
                  leftSection={<IconFileSpreadsheet size={17} />}
                  onClick={handleExportarAvanceAnio}
                  loading={exportandoAnio}
                >
                  Memoria técnica del avance {resumen?.anio_actual ?? new Date().getFullYear()}
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="light"
                  color="blue"
                  radius="xl"
                  leftSection={<IconFileSpreadsheet size={17} />}
                  onClick={handleExportarIndicadoresMetas}
                  loading={exportandoIndicadores}
                >
                  Indicadores y metas
                </Button>
              )}
              <Button
                variant="light"
                color="violet"
                radius="xl"
                leftSection={<IconNetwork size={17} />}
                onClick={() => router.push("/pdi/dashboard/red-nodos")}
              >
                Red de nodos
              </Button>
              {isAdmin && (
                <Button
                  variant="light"
                  color="orange"
                  radius="xl"
                  leftSection={<IconCalculator size={17} />}
                  onClick={handleRecalcular}
                  loading={recalculando}
                >
                  Recalcular avances
                </Button>
              )}
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
                        <Text fw={800} size="xl" lh={1}>{formatNumeroEs(avancePonderado, 2, 2)}%</Text>
                      </Center>
                    }
                  />

                  <div>
                    <Text size="xs" c="dimmed" fw={600} mb={4}>
                      Avance global PDI {formatAnioRange(config.anio_inicio, config.anio_fin)}
                    </Text>
                    <Title order={1} c={SEMAFORO_HEX[semaforo]} lh={1}>
                      {formatNumeroEs(avancePonderado, 2, 2)}%
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

              {/* Avance del año en curso — promedio simple del % de cumplimiento de los indicadores con meta en ese año, frente a la meta de ESE año (no la Meta final 2029) */}
              <Paper withBorder radius="xl" p="lg" shadow="xs">
                <Group gap={32} align="center" wrap="wrap">
                  <Group gap={20} align="center">
                    <RingProgress
                      size={90}
                      thickness={10}
                      roundCaps
                      sections={[{ value: resumen.avance_anio_actual, color: SEMAFORO_HEX[resumen.semaforo_anio_actual] }]}
                      label={
                        <Center>
                          <Text fw={800} size="sm" lh={1}>{formatNumeroEs(resumen.avance_anio_actual, 2, 2)}%</Text>
                        </Center>
                      }
                    />
                    <div>
                      <Text size="xs" c="dimmed" fw={600} mb={4}>Avance del año {resumen.anio_actual}</Text>
                      <Title order={3} c={SEMAFORO_HEX[resumen.semaforo_anio_actual]} lh={1}>
                        {formatNumeroEs(resumen.avance_anio_actual, 2, 2)}%
                      </Title>
                      <Badge color={SEMAFORO_COLOR[resumen.semaforo_anio_actual]} variant="light" radius="xl" mt={6} size="sm">
                        {SEMAFORO_LABEL[resumen.semaforo_anio_actual]}
                      </Badge>
                    </div>
                  </Group>

                  <Divider orientation="vertical" style={{ height: 70 }} />

                  <SimpleGrid cols={4} spacing="xl" style={{ flex: 1 }}>
                    <EstructuraCol label="Macroproyectos"        total={resumen.estructura_anio_actual.macroproyectos} icon={<IconChartDonut3 size={16} />} />
                    <EstructuraCol label="Proyectos"             total={resumen.estructura_anio_actual.proyectos}      icon={<IconListCheck size={16} />} />
                    <EstructuraCol label="Acciones Estratégicas" total={resumen.estructura_anio_actual.acciones}       icon={<IconBulb size={16} />} />
                    <EstructuraCol label="Indicadores"           total={resumen.estructura_anio_actual.indicadores}    icon={<IconTarget size={16} />} />
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
