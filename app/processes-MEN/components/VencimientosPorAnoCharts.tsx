"use client";

import { useMemo, useState } from "react";
import {
  Paper, Text, Modal, ScrollArea, Box, Group, Badge, SimpleGrid, ThemeIcon, Stack, UnstyledButton, CloseButton,
} from "@mantine/core";
import { IconCalendarStats, IconSchool, IconChevronRight } from "@tabler/icons-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import type { Process, Program } from "../types";
import { useRouter } from "next/navigation";
import { fechaVencimientoPrograma } from "../utils/fechaVencimientoPrograma";
import { procesoRcActivoDePrograma } from "../utils/procesoRcUnico";
import { programCodeKey } from "../utils/programCode";
import { lineasAuxPrograma } from "../utils/programDisplay";

type Metrica = "inicio" | "vencimiento";
type TipoGrafica = "RC" | "AV";
type Punto = {
  año: string;
  cantidad: number;
  programas: Program[];
};

/** Color por tipo de proceso: el mismo que usan las tablas y tarjetas del módulo. */
const COLOR_TIPO: Record<TipoGrafica, string> = { RC: "blue", AV: "violet" };
const LABEL_TIPO: Record<TipoGrafica, string> = { RC: "Registro calificado", AV: "Acreditación voluntaria" };

function añoDesdeIso(f: string | null | undefined): string | null {
  if (!f) return null;
  const s = String(f).trim();
  const m = /^(\d{4})/.exec(s);
  return m ? m[1] : null;
}

/** Programas por año para un tipo; rellena con 0 los años intermedios para no saltarse años en el eje. */
function construirSerie(programasBase: Program[], procesos: Process[], metrica: Metrica, tipo: TipoGrafica): Punto[] {
  const porAño = new Map<string, Map<string, Program>>();
  for (const prog of programasBase) {
    const proceso = tipo === "RC"
      ? procesoRcActivoDePrograma(procesos, programCodeKey(prog))
      : procesos.find((p) => p.program_code === programCodeKey(prog) && p.tipo_proceso === "AV");
    const fecha = metrica === "inicio" ? proceso?.fecha_inicio : fechaVencimientoPrograma(prog, tipo);
    const y = añoDesdeIso(fecha);
    if (!y) continue;
    if (!porAño.has(y)) porAño.set(y, new Map());
    porAño.get(y)!.set(prog._id, prog);
  }
  const años = [...porAño.keys()].map(Number);
  if (años.length === 0) return [];
  const desde = Math.min(...años);
  const hasta = Math.max(...años);
  const serie: Punto[] = [];
  for (let y = desde; y <= hasta; y++) {
    const programas = [...(porAño.get(String(y))?.values() ?? [])]
      .sort((p, q) => (p.nombre ?? "").localeCompare(q.nombre ?? "", "es"));
    serie.push({ año: String(y), cantidad: programas.length, programas });
  }
  return serie;
}

const textoProgramas = (n: number) => `${n} ${n === 1 ? "programa" : "programas"}`;

function TooltipAño({ active, payload, metrica, color }: {
  active?: boolean;
  payload?: Array<{ payload: Punto }>;
  metrica: Metrica;
  color: string;
}) {
  const punto = payload?.[0]?.payload;
  if (!active || !punto) return null;
  const visibles = punto.programas.slice(0, 3);
  return (
    <Paper withBorder shadow="md" radius="md" style={{ minWidth: 200, maxWidth: 280, overflow: "hidden" }}>
      <Box px="sm" py={6} style={{ backgroundColor: `var(--mantine-color-${color}-light)` }}>
        <Group justify="space-between" gap="sm" wrap="nowrap">
          <Text size="sm" fw={800} c={`${color}.8`}>{punto.año}</Text>
          <Badge size="sm" variant="white" color={color} tt="none">
            {textoProgramas(punto.cantidad)}
          </Badge>
        </Group>
      </Box>
      <Box px="sm" py={6}>
        {punto.cantidad === 0 ? (
          <Text size="xs" c="dimmed">Ningún programa {metrica === "inicio" ? "inicia" : "vence"} este año.</Text>
        ) : (
          <>
            {visibles.map((pr) => (
              <Group key={pr._id} gap={6} wrap="nowrap">
                <Box style={{ width: 6, height: 6, borderRadius: 99, flexShrink: 0, backgroundColor: `var(--mantine-color-${color}-4)` }} />
                <Text size="xs" lineClamp={1}>{pr.nombre}</Text>
              </Group>
            ))}
            {punto.cantidad > visibles.length && (
              <Text size="xs" c="dimmed" mt={2}>y {punto.cantidad - visibles.length} más…</Text>
            )}
            <Text size="xs" c={`${color}.7`} fw={600} mt={4}>Clic en la barra para ver el detalle</Text>
          </>
        )}
      </Box>
    </Paper>
  );
}

type Props = {
  programasBase: Program[];
  procesos: Process[];
};

export default function VencimientosPorAnoCharts({ programasBase, procesos }: Props) {
  const router = useRouter();
  const añoActual = String(new Date().getFullYear());

  const series = useMemo(() => ({
    RC: {
      inicio: construirSerie(programasBase, procesos, "inicio", "RC"),
      vencimiento: construirSerie(programasBase, procesos, "vencimiento", "RC"),
    },
    AV: {
      inicio: construirSerie(programasBase, procesos, "inicio", "AV"),
      vencimiento: construirSerie(programasBase, procesos, "vencimiento", "AV"),
    },
  }), [programasBase, procesos]);

  const [modal, setModal] = useState<{ tipo: TipoGrafica; metrica: Metrica; año: string; programas: Program[] } | null>(null);

  const abrirAño = (tipo: TipoGrafica, metrica: Metrica, punto: Punto | undefined) => {
    if (!punto?.programas.length) return;
    setModal({ tipo, metrica, año: punto.año, programas: punto.programas });
  };

  const renderChart = (tipo: TipoGrafica, metrica: Metrica) => {
    const data = series[tipo][metrica];
    const color = COLOR_TIPO[tipo];
    const total = data.reduce((acc, d) => acc + d.cantidad, 0);
    const pico = data.reduce<Punto | null>((max, d) => (!max || d.cantidad > max.cantidad ? d : max), null);
    const esteAño = data.find((d) => d.año === añoActual)?.cantidad ?? 0;

    return (
      <Paper withBorder radius="lg" p="md" style={{ borderTop: `3px solid var(--mantine-color-${color}-5)` }}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" mb={4}>
          <Box>
            <Text fw={700}>{metrica === "inicio" ? "Inicio de procesos" : "Vencimiento de vigencias"}</Text>
            <Text size="xs" c="dimmed">
              {metrica === "inicio"
                ? `Año en que inició el proceso de ${LABEL_TIPO[tipo].toLowerCase()}.`
                : `Año en que vence la vigencia del programa (guardada al cerrar el proceso o estimada).`}
            </Text>
          </Box>
          <Badge variant="light" color={color} style={{ flexShrink: 0 }}>{tipo}</Badge>
        </Group>

        {data.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            No hay fechas para los filtros actuales.
          </Text>
        ) : (
          <>
            <Group gap="lg" mt="sm" mb="xs">
              <Box>
                <Text size="xs" c="dimmed">Total</Text>
                <Text fw={800}>{textoProgramas(total)}</Text>
              </Box>
              {pico && pico.cantidad > 0 && (
                <Box>
                  <Text size="xs" c="dimmed">Año con más</Text>
                  <Text fw={800}>{pico.año} ({pico.cantidad})</Text>
                </Box>
              )}
              {metrica === "vencimiento" && (
                <Box>
                  <Text size="xs" c="dimmed">Vencen en {añoActual}</Text>
                  <Text fw={800} c={esteAño > 0 ? "red" : undefined}>{esteAño}</Text>
                </Box>
              )}
            </Group>
            <Box h={240} w="100%">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--mantine-color-default-border)" />
                  <XAxis
                    dataKey="año"
                    tickLine={false}
                    axisLine={{ stroke: "var(--mantine-color-default-border)" }}
                    tick={{ fontSize: 12, fill: "var(--mantine-color-dimmed)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tick={{ fontSize: 12, fill: "var(--mantine-color-dimmed)" }}
                  />
                  <Tooltip
                    cursor={{ fill: `var(--mantine-color-${color}-light)`, radius: 6 }}
                    content={<TooltipAño metrica={metrica} color={color} />}
                  />
                  <Bar
                    dataKey="cantidad"
                    fill={`var(--mantine-color-${color}-2)`}
                    stroke={`var(--mantine-color-${color}-4)`}
                    strokeWidth={1}
                    activeBar={{ fill: `var(--mantine-color-${color}-3)`, stroke: `var(--mantine-color-${color}-6)`, strokeWidth: 2 }}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={44}
                    isAnimationActive={false}
                    style={{ cursor: "pointer" }}
                    onClick={(entry) => abrirAño(tipo, metrica, (entry as { payload?: Punto }).payload)}
                  >
                    <LabelList
                      dataKey="cantidad"
                      position="top"
                      formatter={(v: unknown) => (Number(v) > 0 ? String(v) : "")}
                      style={{ fontSize: 12, fontWeight: 600, fill: "var(--mantine-color-text)" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </>
        )}
      </Paper>
    );
  };

  return (
    <>
      <Group gap="sm" mb="md" mt="xl" wrap="nowrap">
        <ThemeIcon size={34} radius="xl" variant="light" color="blue">
          <IconCalendarStats size={18} />
        </ThemeIcon>
        <Box>
          <Text fw={700} size="lg" lh={1.2}>Vigencias por año</Text>
          <Text size="xs" c="dimmed">Cuántos programas inician o vencen su registro calificado y su acreditación cada año. Haz clic en una barra para ver los programas.</Text>
        </Box>
      </Group>

      <Text size="sm" fw={700} c="blue.7" mb="xs">Registro calificado (RC)</Text>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" mb="lg">
        {renderChart("RC", "inicio")}
        {renderChart("RC", "vencimiento")}
      </SimpleGrid>

      <Text size="sm" fw={700} c="violet.7" mb="xs">Acreditación voluntaria (AV)</Text>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        {renderChart("AV", "inicio")}
        {renderChart("AV", "vencimiento")}
      </SimpleGrid>

      <Modal
        opened={modal !== null}
        onClose={() => setModal(null)}
        centered
        radius="lg"
        size="lg"
        padding={0}
        withCloseButton={false}
      >
        {modal && (() => {
          const color = COLOR_TIPO[modal.tipo];
          return (
            <>
              <Box px="lg" py="md" style={{ backgroundColor: `var(--mantine-color-${color}-light)`, borderBottom: `1px solid var(--mantine-color-${color}-2)` }}>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Box>
                    <Text size="xs" fw={800} tt="uppercase" c={`${color}.8`} style={{ letterSpacing: 0.4 }}>
                      {LABEL_TIPO[modal.tipo]}
                    </Text>
                    <Text fw={700} size="lg" lh={1.25} mt={2}>
                      {modal.metrica === "inicio" ? "Inician" : "Vencen"} en {modal.año}
                    </Text>
                    <Badge size="sm" variant="white" color={color} tt="none" mt={6}>
                      {textoProgramas(modal.programas.length)}
                    </Badge>
                  </Box>
                  <CloseButton onClick={() => setModal(null)} aria-label="Cerrar" />
                </Group>
              </Box>
              <Box p="md">
                <ScrollArea.Autosize mah="60vh">
                  <Stack gap="xs">
                    {modal.programas.map((p) => (
                      <UnstyledButton
                        key={p._id}
                        className="men-programa-anio"
                        style={{ borderRadius: 10 }}
                        onClick={() => {
                          router.push(`/processes-MEN/program/${encodeURIComponent(p._id)}`);
                          setModal(null);
                        }}
                      >
                        <Paper withBorder radius="md" p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${color}-3)`, backgroundColor: "transparent" }}>
                          <Group justify="space-between" wrap="nowrap" gap="sm">
                            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                              <ThemeIcon size={36} radius="xl" variant="light" color={color} style={{ flexShrink: 0 }}>
                                <IconSchool size={18} />
                              </ThemeIcon>
                              <Box style={{ minWidth: 0 }}>
                                <Text fw={700} size="sm">{p.nombre}</Text>
                                <Text size="xs" c="dimmed">{lineasAuxPrograma(p).join(" · ")}</Text>
                              </Box>
                            </Group>
                            <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                              {p.estado && (
                                <Badge size="sm" variant="dot" color={p.estado === "Activo" ? "teal" : "gray"} tt="none">{p.estado}</Badge>
                              )}
                              <Text size="xs" c={`${color}.7`} fw={700}>Ver ficha</Text>
                              <IconChevronRight size={16} color={`var(--mantine-color-${color}-7)`} />
                            </Group>
                          </Group>
                        </Paper>
                      </UnstyledButton>
                    ))}
                  </Stack>
                </ScrollArea.Autosize>
              </Box>
              <style>{`.men-programa-anio:hover > div { background-color: var(--mantine-color-default-hover) !important; }`}</style>
            </>
          );
        })()}
      </Modal>
    </>
  );
}
