"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon, Alert, Box, Center, Group, Loader, Paper,
  SimpleGrid, Text, ThemeIcon, Tooltip,
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
        <>
          <Text fw={700} mb="xs">Comprometido por proyecto</Text>
          <Box style={{ overflowX: "auto", border: "1px solid #f1f3f5", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  <th style={thStyle}>Proyecto</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Comprometido gasto</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Comprometido inversion</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total comprometido</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total causado</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>% causado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const pc = pct(row.causado, row.comprometido);
                  return (
                    <tr key={`${row.proyecto}-${i}`} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9ff" }}>
                      <td style={tdStyle}>
                        <Text size="xs" fw={700}>{row.proyecto}</Text>
                        <Text size="xs" c="dimmed">{row.macroproyecto}</Text>
                      </td>
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
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f1f3f5", fontWeight: 800 }}>
                  <td style={{ ...tdStyle, fontWeight: 800 }}>Total</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#0b7285", fontWeight: 800 }}>{fmtCOP(totals.comprometidoGasto)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#7048e8", fontWeight: 800 }}>{fmtCOP(totals.comprometidoInversion)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>{fmtCOP(totals.comprometido)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>{fmtCOP(totals.causado)}</td>
                  <td style={tdStyle} />
                </tr>
              </tfoot>
            </table>
          </Box>
        </>
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
