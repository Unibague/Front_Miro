"use client";

import { useEffect, useState } from "react";
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
  Badge,
  Stack,
  Button,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconLayoutDashboard,
  IconTemplate,
  IconReportAnalytics,
  IconFileStack,
  IconBuildingCommunity,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { usePeriod } from "@/app/context/PeriodContext";
import ConsultaInfoSidebar from "../components/ConsultaInfoSidebar";

interface DimensionStats {
  _id: string;
  name: string;
  totalPlantillas: number;
  totalInformes: number;
  totalRegistrosReportados: number;
  totalDependenciasReportando: number;
}

// Tablero de estadisticas por Ámbito: no muestra "cuantos enviaron vs
// pendientes" (eso ya existe en Plantillas Publicadas) sino el volumen real
// de INFORMACION reportada por las dependencias en las plantillas de cada
// ámbito.
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

  const maxRegistros = Math.max(1, ...stats.map((s) => s.totalRegistrosReportados));
  const totalRegistros = stats.reduce((sum, s) => sum + s.totalRegistrosReportados, 0);
  const totalPlantillas = stats.reduce((sum, s) => sum + s.totalPlantillas, 0);
  const totalInformes = stats.reduce((sum, s) => sum + s.totalInformes, 0);

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
              <Text size="xs" c="dimmed">Tablero por Ámbito — volumen real de información reportada, no solo si enviaron o no</Text>
            </div>
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : stats.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">No hay ámbitos configurados todavía.</Text>
          ) : (
            <>
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mb="xl">
                <Paper withBorder radius="md" p="md">
                  <Group gap="sm">
                    <ThemeIcon color="teal" variant="light" size={38} radius="xl"><IconFileStack size={18} /></ThemeIcon>
                    <Box>
                      <Text size="xs" c="dimmed" fw={600}>Total registros reportados</Text>
                      <Text fw={800} size="xl">{totalRegistros.toLocaleString("es-CO")}</Text>
                    </Box>
                  </Group>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Group gap="sm">
                    <ThemeIcon color="blue" variant="light" size={38} radius="xl"><IconTemplate size={18} /></ThemeIcon>
                    <Box>
                      <Text size="xs" c="dimmed" fw={600}>Plantillas asignadas</Text>
                      <Text fw={800} size="xl">{totalPlantillas}</Text>
                    </Box>
                  </Group>
                </Paper>
                <Paper withBorder radius="md" p="md">
                  <Group gap="sm">
                    <ThemeIcon color="orange" variant="light" size={38} radius="xl"><IconReportAnalytics size={18} /></ThemeIcon>
                    <Box>
                      <Text size="xs" c="dimmed" fw={600}>Informes asignados</Text>
                      <Text fw={800} size="xl">{totalInformes}</Text>
                    </Box>
                  </Group>
                </Paper>
              </SimpleGrid>

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                {stats.map((dimension) => {
                  const pct = Math.round((dimension.totalRegistrosReportados / maxRegistros) * 100);
                  return (
                    <Paper key={dimension._id} withBorder radius="md" p="md">
                      <Group justify="space-between" mb={6} align="start">
                        <Text fw={700}>{dimension.name}</Text>
                        <Badge color="grape" variant="light">
                          {dimension.totalDependenciasReportando} dependencia{dimension.totalDependenciasReportando !== 1 ? "s" : ""}
                        </Badge>
                      </Group>

                      <Box mb={8} style={{ height: 8, background: "#eee", borderRadius: 4, overflow: "hidden" }}>
                        <Box style={{ width: `${pct}%`, height: "100%", background: "#7048e8" }} />
                      </Box>

                      <Group justify="space-between" mb={10}>
                        <Text size="xs" c="dimmed">Registros reportados</Text>
                        <Text fw={800} size="lg" c="violet">{dimension.totalRegistrosReportados.toLocaleString("es-CO")}</Text>
                      </Group>

                      <Group gap="lg">
                        <Group gap={6}>
                          <IconTemplate size={14} color="var(--mantine-color-blue-6)" />
                          <Text size="sm">{dimension.totalPlantillas} plantilla{dimension.totalPlantillas !== 1 ? "s" : ""}</Text>
                        </Group>
                        <Group gap={6}>
                          <IconReportAnalytics size={14} color="var(--mantine-color-orange-6)" />
                          <Text size="sm">{dimension.totalInformes} informe{dimension.totalInformes !== 1 ? "s" : ""}</Text>
                        </Group>
                      </Group>

                      <Button
                        variant="subtle"
                        size="xs"
                        mt="sm"
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
