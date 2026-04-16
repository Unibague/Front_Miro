"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Box, Button, Center, Container, Group,
  Loader, Paper, Progress, Stack, Text, ThemeIcon, Title, Divider,
} from "@mantine/core";
import {
  IconArrowLeft, IconFileTypePdf, IconTarget, IconEdit,
  IconAlertTriangle, IconCheckbox, IconClockHour4,
} from "@tabler/icons-react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import type { Indicador, Periodo, EstadoReporte } from "../../types";
import { PDI_ROUTES } from "../../api";
import PdiSidebar from "../../components/PdiSidebar";
import EvidenciasPanel from "../../components/EvidenciasPanel";
import ReporteAvanceModal from "../../components/ReporteAvanceModal";
import { usePdiConfig } from "../../hooks/usePdiConfig";

const ESTADO_COLORS: Record<EstadoReporte, string> = {
  Borrador:  "gray",
  Enviado:   "blue",
  Aprobado:  "teal",
  Rechazado: "red",
};

const SEMAFORO_COLORS: Record<string, string> = {
  verde:    "#40c057",
  amarillo: "#fab005",
  rojo:     "#fa5252",
};
const isAdmin = (role: string) => role === "Administrador";

function PeriodoCard({
  p,
  onReportar,
}: {
  p: Periodo;
  onReportar: (periodo: string) => void;
}) {
  const avanceNum = p.avance != null ? Number(p.avance) : null;
  const metaNum   = p.meta   != null ? Number(p.meta)   : null;
  const pct       = avanceNum != null && metaNum && metaNum > 0
    ? Math.min(Math.round((avanceNum / metaNum) * 100), 100)
    : null;

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="xs">
        <Group gap={8}>
          <Text fw={700} size="sm">{p.periodo}</Text>
          <Badge color={ESTADO_COLORS[p.estado_reporte ?? "Borrador"]} variant="light" size="xs">
            {p.estado_reporte ?? "Borrador"}
          </Badge>
        </Group>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconEdit size={13} />}
          onClick={() => onReportar(p.periodo)}
        >
          Reportar
        </Button>
      </Group>

      <Group gap={24} mb="xs">
        <div>
          <Text size="xs" c="dimmed">Meta</Text>
          <Text fw={600} size="sm">{p.meta ?? "—"}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">Avance</Text>
          <Text fw={600} size="sm">{avanceNum ?? "—"}</Text>
        </div>
        {pct !== null && (
          <div style={{ flex: 1 }}>
            <Text size="xs" c="dimmed" mb={4}>Cumplimiento</Text>
            <Progress value={pct} size="sm" color={pct >= 90 ? "teal" : pct >= 60 ? "yellow" : "red"} />
            <Text size="xs" c="dimmed" mt={2}>{pct}%</Text>
          </div>
        )}
      </Group>

      {p.resultados_alcanzados && (
        <Box mb="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">Resultados alcanzados</Text>
          <Text size="sm">{p.resultados_alcanzados}</Text>
        </Box>
      )}
      {p.logros && (
        <Box mb="xs">
          <Group gap={4} mb={2}>
            <IconCheckbox size={13} color="#40c057" />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Logros</Text>
          </Group>
          <Text size="sm">{p.logros}</Text>
        </Box>
      )}
      {p.alertas && (
        <Box mb="xs">
          <Group gap={4} mb={2}>
            <IconAlertTriangle size={13} color="orange" />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Alertas</Text>
          </Group>
          <Text size="sm" c="orange">{p.alertas}</Text>
        </Box>
      )}
      {p.justificacion_retrasos && (
        <Box>
          <Group gap={4} mb={2}>
            <IconClockHour4 size={13} color="#fa5252" />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Justificación de retrasos</Text>
          </Group>
          <Text size="sm" c="dimmed">{p.justificacion_retrasos}</Text>
        </Box>
      )}
      {p.reportado_por && (
        <Text size="xs" c="dimmed" mt="xs">Reportado por: {p.reportado_por}
          {p.fecha_envio && ` · ${new Date(p.fecha_envio).toLocaleDateString("es-CO")}`}
        </Text>
      )}
    </Paper>
  );
}

export default function IndicadorEvidenciasPage() {
  const router      = useRouter();
  const params      = useParams();
  const indicadorId = params?.indicadorId as string;
  const { config } = usePdiConfig();
  const { userRole } = useRole();
  const admin = isAdmin(userRole);

  const [indicador, setIndicador] = useState<Indicador | null>(null);
  const [loading, setLoading]     = useState(true);
  const [reportePeriodo, setReportePeriodo] = useState<string | null>(null);

  const load = () => {
    if (!indicadorId) return;
    axios.get(PDI_ROUTES.indicador(indicadorId))
      .then((res) => setIndicador(res.data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [indicadorId]);

  const semColor = indicador ? SEMAFORO_COLORS[indicador.semaforo] : "#aaa";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="lg" py="xl">

          {/* Header */}
          <Group gap={10} mb="lg">
            <ActionIcon variant="subtle" onClick={() => router.back()}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <ThemeIcon size={42} radius="xl" color="violet" variant="light">
              <IconTarget size={20} />
            </ThemeIcon>
            <div>
              <Title order={3}>Indicador de resultado</Title>
              <Text size="sm" c="dimmed">{config.nombre} - Seguimiento, reportes y evidencias</Text>
            </div>
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : !indicador ? (
            <Center py="xl"><Text c="dimmed">No se encontró el indicador</Text></Center>
          ) : (
            <Stack gap="lg">

              {/* Ficha del indicador */}
              <Paper withBorder radius="xl" p="xl" shadow="sm">
                <Group gap={12} align="flex-start" mb="md">
                  <div
                    style={{
                      width: 12, height: 12, borderRadius: "50%",
                      background: semColor, marginTop: 6, flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <Text size="xs" fw={700} c="dimmed">{indicador.codigo}</Text>
                    <Title order={4}>{indicador.nombre}</Title>
                  </div>
                  <Badge color={indicador.semaforo === "verde" ? "teal" : indicador.semaforo === "amarillo" ? "yellow" : "red"} variant="light">
                    {indicador.avance_total_real != null ? `${indicador.avance_total_real}%` : `${indicador.avance}%`}
                  </Badge>
                </Group>

                <Group gap={32}>
                  <div>
                    <Text size="xs" c="dimmed">Meta final {config.anio_fin}</Text>
                    <Text fw={600}>{indicador.meta_final_2029 ?? "—"}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Tipo de cálculo</Text>
                    <Text fw={600}>{indicador.tipo_calculo}</Text>
                  </div>
                  {indicador.responsable && (
                    <div>
                      <Text size="xs" c="dimmed">Responsable</Text>
                      <Text fw={600}>{indicador.responsable}</Text>
                    </div>
                  )}
                </Group>

                {indicador.entregable && (
                  <Paper withBorder radius="md" p="md" mt="md" style={{ background: "var(--mantine-color-default-hover)" }}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>Entregable / Evidencia verificable</Text>
                    <Text size="sm" fw={600}>{indicador.entregable}</Text>
                  </Paper>
                )}
              </Paper>

              {!admin && (
                <>
                  {/* Reportes de avance por periodo */}
                  <div>
                    <Group justify="space-between" mb="sm">
                      <Title order={5}>Reportes de avance por corte</Title>
                      <Button
                        size="xs"
                        variant="light"
                        color="violet"
                        leftSection={<IconEdit size={13} />}
                        onClick={() => setReportePeriodo("nuevo")}
                      >
                        Nuevo periodo
                      </Button>
                    </Group>

                    {indicador.periodos.length === 0 ? (
                      <Paper withBorder radius="md" p="lg">
                        <Text c="dimmed" ta="center" size="sm">
                          Sin reportes registrados. Haz clic en &quot;Nuevo periodo&quot; para agregar el primer corte.
                        </Text>
                      </Paper>
                    ) : (
                      <Stack gap="sm">
                        {[...indicador.periodos]
                          .sort((a, b) => a.periodo.localeCompare(b.periodo))
                          .map((p) => (
                            <PeriodoCard
                              key={p.periodo}
                              p={p}
                              onReportar={(per) => setReportePeriodo(per)}
                            />
                          ))}
                      </Stack>
                    )}
                  </div>

                  <Divider />
                </>
              )}

              {/* Evidencias */}
              <div>
                <Title order={5} mb="sm">
                  <Group gap={6}>
                    <IconFileTypePdf size={18} />
                    {admin ? "Evidencias enviadas para revisión" : "Evidencias documentales"}
                  </Group>
                </Title>
                <EvidenciasPanel indicadorId={indicador._id} readOnly={admin} periodos={indicador.periodos} />
              </div>
            </Stack>
          )}
        </Container>
      </div>

      {/* Modal de reporte de avance */}
      {!admin && indicador && reportePeriodo && (
        <ReporteAvanceModal
          opened={!!reportePeriodo}
          onClose={() => setReportePeriodo(null)}
          indicador={indicador}
          periodo={reportePeriodo === "nuevo" ? "" : reportePeriodo}
          onSaved={(updated) => {
            setIndicador(updated);
            setReportePeriodo(null);
          }}
        />
      )}
    </div>
  );
}
