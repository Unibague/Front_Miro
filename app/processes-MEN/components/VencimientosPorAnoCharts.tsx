"use client";

import { useMemo, useState } from "react";
import {
  Paper, Text, Title, Modal, Table, ScrollArea, Button, Stack, Box,
} from "@mantine/core";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
  rcProgramas: Program[];
  avProgramas: Program[];
  rcCantidad: number;
  avCantidad: number;
};

function añoDesdeIso(f: string | null | undefined): string | null {
  if (!f) return null;
  const s = String(f).trim();
  const m = /^(\d{4})/.exec(s);
  return m ? m[1] : null;
}

function construirSerie(programasBase: Program[], procesos: Process[], metrica: Metrica): Punto[] {
  const porAño = new Map<string, { rc: Map<string, Program>; av: Map<string, Program> }>();
  for (const prog of programasBase) {
    for (const tipo of ["RC", "AV"] as const) {
      const proceso = tipo === "RC"
        ? procesoRcActivoDePrograma(procesos, programCodeKey(prog))
        : procesos.find((p) => p.program_code === programCodeKey(prog) && p.tipo_proceso === "AV");
      const fecha = metrica === "inicio" ? proceso?.fecha_inicio : fechaVencimientoPrograma(prog, tipo);
      const y = añoDesdeIso(fecha);
      if (!y) continue;
      if (!porAño.has(y)) porAño.set(y, { rc: new Map(), av: new Map() });
      porAño.get(y)![tipo === "RC" ? "rc" : "av"].set(prog._id, prog);
    }
  }
  return [...porAño.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([año, grupos]) => ({
      año,
      rcCantidad: grupos.rc.size,
      avCantidad: grupos.av.size,
      rcProgramas: [...grupos.rc.values()].sort((p, q) =>
        (p.nombre ?? "").localeCompare(q.nombre ?? "", "es"),
      ),
      avProgramas: [...grupos.av.values()].sort((p, q) =>
        (p.nombre ?? "").localeCompare(q.nombre ?? "", "es"),
      ),
    }));
}

type Props = {
  programasBase: Program[];
  procesos: Process[];
};

export default function VencimientosPorAnoCharts({ programasBase, procesos }: Props) {
  const router = useRouter();
  const dataInicio = useMemo(
    () => construirSerie(programasBase, procesos, "inicio"),
    [programasBase, procesos],
  );
  const dataVencimiento = useMemo(
    () => construirSerie(programasBase, procesos, "vencimiento"),
    [programasBase, procesos],
  );

  const [modal, setModal] = useState<{
    titulo: string;
    año: string;
    tipo: TipoGrafica;
    metrica: Metrica;
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

  const abrirFila = (fila: Punto[], tipo: TipoGrafica, metrica: Metrica, row: Punto | undefined) => {
    const programas = tipo === "RC" ? row?.rcProgramas : row?.avProgramas;
    if (!row || !programas?.length) return;
    setModal({
      titulo: `Programas con fecha de ${metrica} ${tipo} en ${row.año}`,
      año: row.año,
      tipo,
      metrica,
      programas,
    });
  };

  const renderChart = (
    titulo: string,
    data: Punto[],
    metrica: Metrica,
    tipo: TipoGrafica,
  ) => (
    <Paper withBorder radius="md" p="md" style={{ backgroundColor: "#fff" }}>
      <Title order={5} mb="xs" c="dark.7">
        {titulo}
      </Title>
      <Text size="xs" c="dimmed" mb="md">
        {metrica === "inicio"
          ? `Fecha de inicio del proceso ${tipo}.`
          : `Fecha de fin de vigencia del programa ${tipo} (vencimiento guardado al cerrar el proceso o estimado).`}
        {" "}Haz clic en un punto para ver los programas.
      </Text>
      {data.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">
          No hay fechas calculables en el alcance actual de filtros.
        </Text>
      ) : (
        <Box h={300} w="100%" style={{ minWidth: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
              <XAxis dataKey="año" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={36} />
              <Tooltip labelFormatter={(l) => `Año ${l}`} />
              {(() => {
                const color = tipo === "RC" ? "#228be6" : "#7950f2";
                const dataKey = tipo === "RC" ? "rcCantidad" : "avCantidad";
                return <Line
                  key={tipo}
                type="monotone"
                dataKey={dataKey}
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
                  const fila = filaPorIndice(data, index, payload);
                  return (
                    <g>
                      <title>{`Año ${payload.año}: ${tipo} — clic para listar`}</title>
                      {/* Área de clic ancha sobre el punto */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={18}
                        fill="transparent"
                        style={{ cursor: "pointer", pointerEvents: "all" }}
                        onClick={() => abrirFila(data, tipo, metrica, fila)}
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
                />;
              })()}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );

  return (
    <>
      <Title order={4} ta="center" mb="md" mt="xl">
        Vigencias por año (RC/AV en el programa)
      </Title>
      <Stack gap="lg">
        {renderChart("Fechas de inicio — Registro calificado (RC)", dataInicio, "inicio", "RC")}
        {renderChart("Fechas de vencimiento — Registro calificado (RC)", dataVencimiento, "vencimiento", "RC")}
        {renderChart("Fechas de inicio — Acreditación voluntaria (AV)", dataInicio, "inicio", "AV")}
        {renderChart("Fechas de vencimiento — Acreditación voluntaria (AV)", dataVencimiento, "vencimiento", "AV")}
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
