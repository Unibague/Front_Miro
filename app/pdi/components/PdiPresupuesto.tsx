"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Center, Group, Loader, Paper,
  Select, SimpleGrid, Text, ThemeIcon, Tooltip,
} from "@mantine/core";
import {
  IconChartPie, IconCurrencyDollar, IconRefresh, IconTrendingUp,
} from "@tabler/icons-react";
import axios from "axios";
import { PDI_ROUTES } from "../api";

const POLL_INTERVAL_MS = 60_000;

type PresupuestoRow = {
  macroproyecto: string;
  proyecto: string;
  codificacion: string;
  presupuesto: number;
  comprometido: number;
  comprometidoGasto: number;
  comprometidoInversion: number;
  causado: number;
  causadoGasto: number;
  causadoInversion: number;
  autorizaciones: number;
};

type PresupuestoData = {
  rows: PresupuestoRow[];
  totals: {
    presupuesto: number;
    comprometido: number;
    comprometidoGasto: number;
    comprometidoInversion: number;
    causado: number;
    causadoGasto: number;
    causadoInversion: number;
  };
  updatedAt: string;
  stale?: boolean;
};

type MacroBudgetGroup = {
  macro: string;
  code: string;
  name: string;
  rows: PresupuestoRow[];
  presupuesto: number;
  comprometido: number;
  comprometidoGasto: number;
  comprometidoInversion: number;
  causado: number;
};

function fmtCOP(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.min(Math.round((value / total) * 100), 100);
}

function macroKey(row: PresupuestoRow) {
  return row.macroproyecto || "Sin centro de costos";
}

function macroName(macro: string) {
  return (macro || "Sin centro de costos").replace(/^\d+\./, "").trim();
}

function macroCode(macro: string) {
  const match = (macro || "").match(/^(\d+)/);
  return match ? `M${match[1]}` : "Sin codigo";
}

function projectCode(row: PresupuestoRow) {
  const raw = (row.codificacion || row.proyecto || "").trim();
  return raw.replace(/-A(E)?\d+$/i, "").trim() || row.proyecto || "Sin proyecto";
}

function actionCode(row: PresupuestoRow) {
  return (row.codificacion || row.proyecto || "").trim() || "Sin accion";
}

function sumRows(rows: PresupuestoRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.presupuesto += row.presupuesto || 0;
      acc.comprometidoGasto += row.comprometidoGasto;
      acc.comprometidoInversion += row.comprometidoInversion;
      acc.comprometido += row.comprometido;
      acc.causado += row.causado;
      return acc;
    },
    { presupuesto: 0, comprometidoGasto: 0, comprometidoInversion: 0, comprometido: 0, causado: 0 }
  );
}

function groupByMacro(rows: PresupuestoRow[]) {
  return Object.values(
    rows.reduce<Record<string, MacroBudgetGroup>>((acc, row) => {
      const key = macroKey(row);
      if (!acc[key]) {
        acc[key] = {
          macro: key,
          code: macroCode(key),
          name: macroName(key),
          rows: [],
          presupuesto: 0,
          comprometidoGasto: 0,
          comprometidoInversion: 0,
          comprometido: 0,
          causado: 0,
        };
      }
      acc[key].rows.push(row);
      acc[key].presupuesto += row.presupuesto || 0;
      acc[key].comprometidoGasto += row.comprometidoGasto;
      acc[key].comprometidoInversion += row.comprometidoInversion;
      acc[key].comprometido += row.comprometido;
      acc[key].causado += row.causado;
      return acc;
    }, {})
  ).sort((a, b) => b.comprometido - a.comprometido);
}

function KpiCard({ title, value, sub, color, icon }: {
  title: string;
  value: string;
  sub?: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="md">
      <ThemeIcon size={38} radius="xl" color={color} variant="light" mb={8}>
        {icon}
      </ThemeIcon>
      <Text size="xs" c="dimmed" fw={700} mb={2}>{title}</Text>
      <Text fw={800} size="1.25rem" lh={1.1}>{value}</Text>
      {sub && <Text size="sm" c="dimmed" mt={4}>{sub}</Text>}
    </Paper>
  );
}

export default function PdiPresupuesto() {
  const [data, setData] = useState<PresupuestoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMacro, setSelectedMacro] = useState<string>("todos");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setError(null);
      const res = await axios.get<PresupuestoData>(PDI_ROUTES.presupuestoData(forceRefresh));
      setData(res.data);
    } catch (e: any) {
      const payload = e?.response?.data || {};
      setError(payload.message || "Error al cargar el presupuesto.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(() => fetchData(), POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  useEffect(() => {
    if (!data || selectedMacro === "todos") return;
    const exists = data.rows.some((row) => macroKey(row) === selectedMacro);
    if (!exists) setSelectedMacro("todos");
  }, [data, selectedMacro]);

  const handleRefresh = () => {
    setLoading(true);
    fetchData(true);
  };

  if (loading) return <Center py="xl"><Loader color="violet" /></Center>;
  if (error) {
    return (
      <Alert color="red" variant="light" title="No se pudo cargar el presupuesto">
        <Text size="sm">{error}</Text>
      </Alert>
    );
  }
  if (!data) return null;

  const { totals, rows, updatedAt } = data;
  const pctCausado = pct(totals.causado, totals.comprometido);
  const macroGroups = groupByMacro(rows);
  const visibleGroups = selectedMacro === "todos"
    ? macroGroups
    : macroGroups.filter((group) => group.macro === selectedMacro);
  const visibleRows = visibleGroups.flatMap((group) => group.rows);
  const visibleTotals = sumRows(visibleRows);
  const macroOptions = [
    { value: "todos", label: "Todos los macroproyectos" },
    ...macroGroups.map((group) => ({
      value: group.macro,
      label: `${group.code} - ${group.name}`,
    })),
  ];

  const updatedLabel = updatedAt
    ? new Date(updatedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })
    : "";

  return (
    <Box>
      <Group justify="space-between" mb="md" gap={8} align="center">
        <Text size="sm" c="dimmed">
        </Text>
        <Group gap={8} align="center">
          {updatedLabel && <Text size="xs" c="dimmed">Actualizado: {updatedLabel}</Text>}
          <Tooltip label="Forzar actualizacion" withArrow>
            <ActionIcon variant="light" color="violet" size="md" onClick={handleRefresh}>
              <IconRefresh size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md" mb="xl">
        <KpiCard
          title="Total comprometido"
          value={fmtCOP(totals.comprometido)}
          color="violet"
          icon={<IconChartPie size={18} />}
        />
        <KpiCard
          title="Comprometido gasto"
          value={fmtCOP(totals.comprometidoGasto)}
          color="cyan"
          icon={<IconTrendingUp size={18} />}
        />
        <KpiCard
          title="Comprometido inversion"
          value={fmtCOP(totals.comprometidoInversion)}
          color="blue"
          icon={<IconTrendingUp size={18} />}
        />
        <KpiCard
          title="Total causado"
          value={fmtCOP(totals.causado)}
          sub={totals.comprometido > 0 ? `${pctCausado}% del comprometido` : undefined}
          color={pctCausado >= 80 ? "teal" : "orange"}
          icon={<IconCurrencyDollar size={18} />}
        />
      </SimpleGrid>

      {rows.length > 0 && (
        <Box mb="xl">
          <Group justify="space-between" align="end" mb="xs" gap="sm">
            <Box>
              <Text fw={700}>Ejecución presupuestal por macroproyecto y centro de costo</Text>
              <Text size="xs" c="dimmed">
                Resumen de la macro y detalle de sus proyectos y acciones.
              </Text>
            </Box>
            <Select
              label="Filtrar macroproyecto"
              size="xs"
              value={selectedMacro}
              onChange={(value) => setSelectedMacro(value || "todos")}
              data={macroOptions}
              searchable
              clearable={false}
              style={{ minWidth: 260 }}
            />
          </Group>
          <Box style={{ overflowX: "auto", border: "1px solid #f1f3f5", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  <th style={thStyle}>Macroproyecto</th>
                  <th style={thStyle}>Proyecto</th>
                  <th style={thStyle}>Acción</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Presupuesto</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Comprometido gasto</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Comprometido inversión</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total comprometido</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total causado</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>% causado</th>
                </tr>
              </thead>
              <tbody>
                {visibleGroups.flatMap((group, groupIndex) => {
                  const macroPc = pct(group.causado, group.comprometido);
                  const macroRow = (
                    <tr key={`macro-${group.macro}`} style={{ background: "#eef1f5" }}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        <Group gap={8} wrap="nowrap">
                          <Badge size="xs" variant="light" color="violet" radius="sm">{group.code}</Badge>
                          <Text size="xs" fw={800}>{group.name}</Text>
                        </Group>
                      </td>
                      <td style={tdStyle} />
                      <td style={tdStyle} />
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#2f9e44", fontWeight: 800 }}>{fmtCOP(group.presupuesto)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#0b7285", fontWeight: 800 }}>{fmtCOP(group.comprometidoGasto)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#7048e8", fontWeight: 800 }}>{fmtCOP(group.comprometidoInversion)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>{fmtCOP(group.comprometido)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>{fmtCOP(group.causado)}</td>
                      <td style={{ ...tdStyle, minWidth: 100 }}>
                        <Group gap={4} wrap="nowrap">
                          <Box style={{ flex: 1, height: 6, background: "#dee2e6", borderRadius: 3, overflow: "hidden" }}>
                            <Box style={{ width: `${macroPc}%`, height: "100%", background: macroPc >= 80 ? "#20c997" : "#fd7e14" }} />
                          </Box>
                          <Text size="xs" fw={800} style={{ minWidth: 32, textAlign: "right" }}>{macroPc}%</Text>
                        </Group>
                      </td>
                    </tr>
                  );

                  const detailRows = group.rows.map((row, rowIndex) => {
                    const pc = pct(row.causado, row.comprometido);
                    const background = (groupIndex + rowIndex) % 2 === 0 ? "#fff" : "#f8f9ff";
                    return (
                      <tr key={`${group.macro}-${row.codificacion || row.proyecto}-${rowIndex}`} style={{ background }}>
                        <td style={tdStyle}>
                          <Text size="xs" c="dimmed">{group.code}</Text>
                        </td>
                        <td style={tdStyle}>
                          <Text size="xs" fw={700}>{projectCode(row)}</Text>
                        </td>
                        <td style={tdStyle}>
                          <Text size="xs" fw={700}>{actionCode(row)}</Text>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#2f9e44" }}>{fmtCOP(row.presupuesto || 0)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#0b7285" }}>{fmtCOP(row.comprometidoGasto)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#7048e8" }}>{fmtCOP(row.comprometidoInversion)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>{fmtCOP(row.comprometido)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{fmtCOP(row.causado)}</td>
                        <td style={{ ...tdStyle, minWidth: 100 }}>
                          <Group gap={4} wrap="nowrap">
                            <Box style={{ flex: 1, height: 6, background: "#eee", borderRadius: 3, overflow: "hidden" }}>
                              <Box style={{ width: `${pc}%`, height: "100%", background: pc >= 80 ? "#20c997" : "#fd7e14" }} />
                            </Box>
                            <Text size="xs" fw={700} style={{ minWidth: 32, textAlign: "right" }}>{pc}%</Text>
                          </Group>
                        </td>
                      </tr>
                    );
                  });

                  return [macroRow, ...detailRows];
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f1f3f5", fontWeight: 800 }}>
                  <td style={{ ...tdStyle, fontWeight: 800 }} colSpan={3}>
                    {selectedMacro === "todos" ? "Total" : "Total macro filtrada"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#2f9e44", fontWeight: 800 }}>{fmtCOP(visibleTotals.presupuesto)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#0b7285", fontWeight: 800 }}>{fmtCOP(visibleTotals.comprometidoGasto)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#7048e8", fontWeight: 800 }}>{fmtCOP(visibleTotals.comprometidoInversion)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>{fmtCOP(visibleTotals.comprometido)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>{fmtCOP(visibleTotals.causado)}</td>
                  <td style={tdStyle} />
                </tr>
              </tfoot>
            </table>
          </Box>
        </Box>
      )}

      {rows.length === 0 && (
        <Text c="dimmed" size="sm" ta="center" py="md">
          No se encontraron filas en la hoja de presupuesto.
        </Text>
      )}
    </Box>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "2px solid #e9ecef",
  fontWeight: 700,
  fontSize: 12,
  color: "#495057",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid #f1f3f5",
  verticalAlign: "middle",
  fontSize: 12,
};
