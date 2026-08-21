"use client";

import { useMemo, useState } from "react";
import {
  Paper, Text, Title, Modal, Table, ScrollArea, Button, Stack, Box,
} from "@mantine/core";
import type { MouseHandlerDataParam } from "recharts";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { Program } from "../types";
import { useRouter } from "next/navigation";
import { fechaVencimientoPrograma } from "../utils/fechaVencimientoPrograma";
import { lineasAuxPrograma } from "../utils/programDisplay";

type Punto = { año: string; cantidad: number; programas: Program[] };

function añoDesdeIso(f: string | null | undefined): string | null {
  if (!f) return null;
  const s = String(f).trim();
  const m = /^(\d{4})/.exec(s);
  return m ? m[1] : null;
}

function construirSerie(programasBase: Program[], tipo: "RC" | "AV"): Punto[] {
  const porAño = new Map<string, Map<string, Program>>();
  for (const prog of programasBase) {
    const venc = fechaVencimientoPrograma(prog, tipo);
    const y = añoDesdeIso(venc);
    if (!y) continue;
    if (!porAño.has(y)) porAño.set(y, new Map());
    porAño.get(y)!.set(prog._id, prog);
  }
  return [...porAño.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([año, m]) => ({
      año,
      cantidad: m.size,
      programas: [...m.values()].sort((p, q) =>
        (p.nombre ?? "").localeCompare(q.nombre ?? "", "es"),
      ),
    }));
}

type Props = {
  programasBase: Program[];
};

export default function VencimientosPorAnoCharts({ programasBase }: Props) {
  const router = useRouter();
  const dataRc = useMemo(
    () => construirSerie(programasBase, "RC"),
    [programasBase],
  );
  const dataAv = useMemo(
    () => construirSerie(programasBase, "AV"),
    [programasBase],
  );

  const [modal, setModal] = useState<{
    titulo: string;
    año: string;
    tipo: "RC" | "AV";
    programas: Program[];
  } | null>(null);

  const filaPorIndice = (fila: Punto[], indice?: number, payload?: Punto) => {
    if (typeof indice === "number" && indice >= 0 && fila[indice]) {
      return fila[indice];
    }
    const año = payload?.año;
    if (año != null) {
      return fila.find((d) => d.año === año) ?? payload;
    }
    return payload;
  };

  const abrirFila = (fila: Punto[], tipo: "RC" | "AV", row: Punto | undefined) => {
    if (!row?.programas?.length) return;
    setModal({
      titulo: `Programas con vencimiento de vigencia ${tipo} en ${row.año}`,
      año: row.año,
      tipo,
      programas: row.programas,
    });
  };

  const indiceDesdeChartClick = (state: MouseHandlerDataParam): number | undefined => {
    const raw = state.activeTooltipIndex ?? state.activeIndex;
    if (typeof raw === "number" && !Number.isNaN(raw)) return raw;
    if (typeof raw === "string" && raw !== "") {
      const n = Number.parseInt(raw, 10);
      return Number.isNaN(n) ? undefined : n;
    }
    return undefined;
  };

  const renderChart = (
    titulo: string,
    color: string,
    data: Punto[],
    tipo: "RC" | "AV",
  ) => (
    <Paper withBorder radius="md" p="md" style={{ backgroundColor: "#fff" }}>
      <Title order={5} mb="xs" c="dark.7">
        {titulo}
      </Title>
      <Text size="xs" c="dimmed" mb="md">
        Fecha de fin de vigencia del programa (<strong>ultimo_rc</strong> / <strong>ultimo_av</strong> o campos legados):
        vencimiento guardado al cerrar el proceso o estimado (fecha de resolución + años de vigencia). Haz clic en un punto para ver los programas.
      </Text>
      {data.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          No hay vencimientos de vigencia calculables en el alcance actual de filtros (faltan resolución/duración o fecha de vencimiento).
        </Text>
      ) : (
        <Box h={300} w="100%" style={{ minWidth: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              onClick={(nextState) => {
                const idx = indiceDesdeChartClick(nextState);
                if (idx == null) return;
                abrirFila(data, tipo, data[idx]);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={36} />
              <Tooltip
                formatter={(v) => [`${v ?? 0} programa(s)`, "Cantidad"]}
                labelFormatter={(l) => `Año ${l}`}
              />
              <Line
                type="monotone"
                dataKey="cantidad"
                stroke={color}
                strokeWidth={2}
                /** Sin punto “active” encima que intercepte clics en el punto estático. */
                activeDot={false}
                isAnimationActive={false}
                dot={(props) => {
                  const { cx, cy, payload, index } = props as {
                    cx?: number;
                    cy?: number;
                    payload?: Punto;
                    index?: number;
                  };
                  if (
                    payload == null
                    || cx == null
                    || cy == null
                    || Number.isNaN(cx)
                    || Number.isNaN(cy)
                  ) {
                    return null;
                  }
                  return (
                    <g>
                      <title>{`Año ${payload.año}: ${payload.cantidad} programa(s) — clic para listar`}</title>
                      {/* Área de clic ancha sobre el punto */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={18}
                        fill="transparent"
                        style={{ cursor: "pointer", pointerEvents: "all" }}
                        onClick={() => abrirFila(data, tipo, filaPorIndice(data, index, payload))}
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={7}
                        fill={color}
                        stroke="#fff"
                        strokeWidth={2}
                        style={{ pointerEvents: "none" }}
                      />
                    </g>
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );

  return (
    <>
      <Title order={4} ta="center" mb="md" mt="xl">
        Vencimientos de vigencia por año (RC / AV en el programa)
      </Title>
      <Stack gap="lg">
        {renderChart("Registro calificado (RC) — programas por año de vencimiento", "#228be6", dataRc, "RC")}
        {renderChart("Acreditación voluntaria (AV) — programas por año de vencimiento", "#7950f2", dataAv, "AV")}
      </Stack>

      <Modal
        opened={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.titulo ?? ""}
        size="lg"
        radius="md"
        scrollAreaComponent={ScrollArea.Autosize}
      >
        {modal && (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Programa</Table.Th>
                <Table.Th w={120}>Estado</Table.Th>
                <Table.Th w={100} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {modal.programas.map((p) => (
                <Table.Tr key={p._id}>
                  <Table.Td>
                    <Text size="sm" fw={500}>{p.nombre}</Text>
                    {lineasAuxPrograma(p).map((ln, idx) => (
                      <Text key={idx} size="xs" c="dimmed">{ln}</Text>
                    ))}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{p.estado ?? "—"}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => {
                        router.push(`/processes-MEN/program/${encodeURIComponent(p._id)}`);
                        setModal(null);
                      }}
                    >
                      Ficha
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Modal>
    </>
  );
}
