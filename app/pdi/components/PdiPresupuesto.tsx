"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionIcon, Alert, Anchor, Badge, Box, Button, Center, Group, HoverCard,
  Loader, Paper, ScrollArea, Select, SimpleGrid, Text, ThemeIcon, Tooltip,
} from "@mantine/core";
import {
  IconChartPie, IconCurrencyDollar, IconDownload, IconRefresh, IconTrendingUp,
} from "@tabler/icons-react";
import axios from "axios";
import * as XLSX from "xlsx";
import { PDI_ROUTES } from "../api";

const POLL_INTERVAL_MS = 60_000;

type BudgetDetail = {
  rowIndex?: number;
  autorizacion?: string;
  proyecto?: string;
  proyectoCodigo?: string;
  codificacion?: string;
  accionEstrategica?: string;
  tipo?: string;
  tercero?: string;
  descripcion?: string;
  responsableActivo?: string;
  autorizacionFirmas?: string;
  documentos?: string;
  valor: number;
  causadoGasto: number;
  causadoInversion: number;
  causado: number;
};

type PresupuestoRow = {
  macroproyecto: string;
  proyecto: string;
  codificacion: string;
  presupuesto: number;
  presupuestoGasto: number;
  presupuestoInversion: number;
  comprometido: number;
  comprometidoGasto: number;
  comprometidoInversion: number;
  causado: number;
  causadoGasto: number;
  causadoInversion: number;
  autorizaciones: number;
  detalles?: BudgetDetail[];
};

type PresupuestoData = {
  rows: PresupuestoRow[];
  totals: {
    presupuesto: number;
    presupuestoGasto: number;
    presupuestoInversion: number;
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

type PdiPresupuestoProps = {
  refreshSignal?: number;
  /** Pre-selecciona el primer macro que coincida (líder ve todos, solo se le marca el suyo) */
  defaultMacroCodes?: string[];
  /** Restringe el dropdown y la tabla a solo estos códigos (responsable de proyecto, no líder) */
  restrictToCodes?: string[];
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

type BudgetMetric = "comprometidoGasto" | "comprometidoInversion" | "comprometido" | "causado";

const metricLabels: Record<BudgetMetric, string> = {
  comprometidoGasto: "Detalle comprometido gasto",
  comprometidoInversion: "Detalle comprometido inversion",
  comprometido: "Detalle total comprometido",
  causado: "Detalle total causado",
};

function normalizeBudgetText(value?: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function detailAmount(detail: BudgetDetail, metric: BudgetMetric) {
  const tipo = normalizeBudgetText(detail.tipo);
  const valor = Number(detail.valor) || 0;
  const causado = Number(detail.causado) || (Number(detail.causadoGasto) || 0) + (Number(detail.causadoInversion) || 0);

  if (metric === "comprometido") return valor;
  if (metric === "causado") return causado;
  if (metric === "comprometidoInversion") return tipo.includes("inversion") ? valor : 0;
  return !tipo.includes("inversion") ? valor : 0;
}

function uniqueDetails(details: BudgetDetail[]) {
  const seen = new Set<string>();
  return details.filter((detail) => {
    const key = String(detail.rowIndex ?? `${detail.autorizacion}-${detail.codificacion}-${detail.valor}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function collectDetails(rows: PresupuestoRow[]) {
  return uniqueDetails(rows.flatMap((row) => row.detalles ?? []));
}

function detailsForMetric(details: BudgetDetail[], metric: BudgetMetric) {
  return uniqueDetails(details)
    .map((detail) => ({ detail, amount: detailAmount(detail, metric) }))
    .filter(({ amount }) => amount > 0);
}

function extractLinks(value?: string) {
  return (value || "")
    .split(/\s+/)
    .map((part) => part.trim().replace(/[),.;]+$/, ""))
    .filter((part) => /^https?:\/\//i.test(part));
}

function authorizationLinksValue(detail: BudgetDetail) {
  return detail.autorizacionFirmas || detail.documentos || "";
}

function macroKey(row: PresupuestoRow) {
  return row.macroproyecto || "Sin centro de costos";
}

function macroName(macro: string) {
  return (macro || "Sin centro de costos").replace(/^M?\d+\s*[-.:]\s*/i, "").trim();
}

function macroCode(macro: string) {
  const systemMatch = (macro || "").match(/^(M\d+)\b/i);
  if (systemMatch) return systemMatch[1].toUpperCase();
  const match = (macro || "").match(/^(\d+)/);
  return match ? `M${match[1]}` : "Sin codigo";
}

function projectLabel(row: PresupuestoRow) {
  return row.codificacion?.trim() || "Sin codigo";
}

function compareBudgetCodes(a: string, b: string) {
  const aParts = (a.match(/\d+/g) || []).map(Number);
  const bParts = (b.match(/\d+/g) || []).map(Number);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (diff !== 0) return diff;
  }

  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

function sumRows(rows: PresupuestoRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.presupuesto          += row.presupuesto || 0;
      acc.presupuestoGasto     += row.presupuestoGasto || 0;
      acc.presupuestoInversion += row.presupuestoInversion || 0;
      acc.comprometidoGasto    += row.comprometidoGasto;
      acc.comprometidoInversion += row.comprometidoInversion;
      acc.comprometido         += row.comprometido;
      acc.causado              += row.causado;
      acc.causadoGasto         += row.causadoGasto || 0;
      acc.causadoInversion     += row.causadoInversion || 0;
      return acc;
    },
    { presupuesto: 0, presupuestoGasto: 0, presupuestoInversion: 0, comprometidoGasto: 0, comprometidoInversion: 0, comprometido: 0, causado: 0, causadoGasto: 0, causadoInversion: 0 }
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
  )
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((a, b) => compareBudgetCodes(projectLabel(a), projectLabel(b))),
    }))
    .sort((a, b) => compareBudgetCodes(a.code, b.code));
}

function BudgetDetailHover({
  value,
  details,
  metric,
  color,
  fw = 700,
}: {
  value: string;
  details: BudgetDetail[];
  metric: BudgetMetric;
  color?: string;
  fw?: number;
}) {
  const rows = detailsForMetric(details, metric);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  if (rows.length === 0) {
    return (
      <Text component="span" size="xs" fw={fw} style={{ color }}>
        {value}
      </Text>
    );
  }

  return (
    <HoverCard width={760} shadow="md" withArrow withinPortal openDelay={150} closeDelay={120}>
      <HoverCard.Target>
        <Text
          component="span"
          size="xs"
          fw={fw}
          style={{
            color,
            cursor: "help",
            textDecoration: "underline dotted",
            textUnderlineOffset: 3,
          }}
        >
          {value}
        </Text>
      </HoverCard.Target>
      <HoverCard.Dropdown p={0} style={{ maxWidth: "min(760px, calc(100vw - 32px))" }}>
        <Box p="sm" style={{ borderBottom: "1px solid #e9ecef" }}>
          <Group justify="space-between" gap="sm" wrap="nowrap">
            <Text size="sm" fw={800}>{metricLabels[metric]}</Text>
            <Badge size="sm" variant="light" color={metric === "causado" ? "orange" : "violet"}>
              {fmtCOP(total)}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            {rows.length} {rows.length === 1 ? "registro" : "registros"} con descripcion, autorizacion y accion estrategica.
          </Text>
        </Box>
        <ScrollArea.Autosize mah={360} type="auto">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f8f9fa" }}>
                <th style={popupThStyle}>Accion estrategica</th>
                <th style={popupThStyle}>Descripcion</th>
                <th style={popupThStyle}>Autorizacion</th>
                <th style={{ ...popupThStyle, textAlign: "right" }}>
                  {metric === "causado" ? "Causado" : "Valor"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ detail, amount }) => {
                const autorizacionFirmas = authorizationLinksValue(detail);
                const links = extractLinks(autorizacionFirmas);
                return (
                  <tr key={`${detail.rowIndex}-${detail.codificacion}-${amount}`}>
                    <td style={{ ...popupTdStyle, minWidth: 190 }}>
                      <Text size="xs" fw={700} lineClamp={4}>
                        {detail.accionEstrategica || detail.codificacion || "-"}
                      </Text>
                    </td>
                    <td style={{ ...popupTdStyle, minWidth: 250 }}>
                      <Text size="xs" lineClamp={5}>
                        {detail.descripcion || "-"}
                      </Text>
                    </td>
                    <td style={{ ...popupTdStyle, minWidth: 120 }}>
                      {links.length > 0 ? (
                        <Box>
                          {links.slice(0, 2).map((link, index) => (
                            <Anchor key={`${link}-${index}`} href={link} target="_blank" rel="noreferrer" size="xs" style={{ display: "block" }}>
                              Autorizacion
                            </Anchor>
                          ))}
                          {links.length > 2 && (
                            <Text size="xs" c="dimmed">+{links.length - 2} mas</Text>
                          )}
                        </Box>
                      ) : (
                        <Text size="xs" c="dimmed" lineClamp={3}>
                          {autorizacionFirmas || "N/A"}
                        </Text>
                      )}
                    </td>
                    <td style={{ ...popupTdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                      <Text size="xs" fw={800}>{fmtCOP(amount)}</Text>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea.Autosize>
      </HoverCard.Dropdown>
    </HoverCard>
  );
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

export default function PdiPresupuesto({ refreshSignal = 0, defaultMacroCodes, restrictToCodes }: PdiPresupuestoProps) {
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
    if (refreshSignal > 0) fetchData(true);
  }, [fetchData, refreshSignal]);

  useEffect(() => {
    if (!data || selectedMacro === "todos") return;
    const exists = data.rows.some((row) => macroKey(row) === selectedMacro);
    if (!exists) setSelectedMacro("todos");
  }, [data, selectedMacro]);

  // Pre-seleccionar el macro del usuario cuando llegan los datos
  useEffect(() => {
    if (!data || !defaultMacroCodes?.length) return;
    const allGroups = groupByMacro(data.rows);
    const match = allGroups.find((g) =>
      defaultMacroCodes.some((code) => g.code.toUpperCase() === code.toUpperCase())
    );
    if (match) setSelectedMacro(match.macro);
  }, [data, defaultMacroCodes]);

  const handleRefresh = () => {
    setLoading(true);
    fetchData(true);
  };

  const handleDownloadExcel = (
    groups: MacroBudgetGroup[],
    totals: ReturnType<typeof sumRows>,
    macroSel: string,
  ) => {
    const headers = [
      "Macroproyecto", "Código", "Proyecto",
      "Presupuesto", "Presupuesto gasto", "Presupuesto inversión",
      "Comprometido gasto", "Comprometido inversión", "Total comprometido",
      "Total causado", "Causado gasto", "Causado inversión", "% causado",
    ];
    const aoa: (string | number)[][] = [headers];

    for (const group of groups) {
      const macroPc = group.comprometido > 0
        ? Math.min(Math.round((group.causado / group.comprometido) * 100), 100) : 0;
      const macroSums = sumRows(group.rows);
      aoa.push([
        group.name, group.code, "",
        macroSums.presupuesto, macroSums.presupuestoGasto, macroSums.presupuestoInversion,
        macroSums.comprometidoGasto, macroSums.comprometidoInversion, macroSums.comprometido,
        macroSums.causado, macroSums.causadoGasto, macroSums.causadoInversion,
        `${macroPc}%`,
      ]);
      for (const row of group.rows) {
        const pc = row.comprometido > 0
          ? Math.min(Math.round((row.causado / row.comprometido) * 100), 100) : 0;
        aoa.push([
          "", group.code, projectLabel(row),
          row.presupuesto || 0, row.presupuestoGasto || 0, row.presupuestoInversion || 0,
          row.comprometidoGasto, row.comprometidoInversion, row.comprometido,
          row.causado, row.causadoGasto || 0, row.causadoInversion || 0,
          `${pc}%`,
        ]);
      }
    }

    const totalPc = totals.comprometido > 0
      ? Math.min(Math.round((totals.causado / totals.comprometido) * 100), 100) : 0;
    aoa.push([
      macroSel === "todos" ? "TOTAL" : "TOTAL MACRO FILTRADA", "", "",
      totals.presupuesto, totals.presupuestoGasto, totals.presupuestoInversion,
      totals.comprometidoGasto, totals.comprometidoInversion, totals.comprometido,
      totals.causado, totals.causadoGasto, totals.causadoInversion,
      `${totalPc}%`,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 45 }, { wch: 8 }, { wch: 18 },
      { wch: 18 }, { wch: 20 }, { wch: 22 },
      { wch: 22 }, { wch: 24 }, { wch: 22 },
      { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presupuesto PDI");
    XLSX.writeFile(wb, `Presupuesto_PDI_${new Date().getFullYear()}.xlsx`);
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

  const { rows, updatedAt } = data;
  const allMacroGroups = groupByMacro(rows);
  const macroGroups = restrictToCodes?.length
    ? allMacroGroups.filter((g) =>
        restrictToCodes.some((c) => g.code.toUpperCase() === c.toUpperCase())
      )
    : allMacroGroups;
  const visibleGroups = selectedMacro === "todos"
    ? macroGroups
    : macroGroups.filter((group) => group.macro === selectedMacro);
  const visibleRows = visibleGroups.flatMap((group) => group.rows);
  const visibleTotals = sumRows(visibleRows);
  const visibleDetails = collectDetails(visibleRows);
  const todosLabel = restrictToCodes?.length
    ? "Todos mis macroproyectos"
    : "Todos los macroproyectos";
  const macroOptions = [
    { value: "todos", label: todosLabel },
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

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" mb="xl">
        <KpiCard
          title="Total presupuesto"
          value={fmtCOP(visibleTotals.presupuesto)}
          color="teal"
          icon={<IconCurrencyDollar size={18} />}
        />
        <KpiCard
          title="Presupuesto gasto"
          value={fmtCOP(visibleTotals.presupuestoGasto)}
          color="green"
          icon={<IconCurrencyDollar size={18} />}
        />
        <KpiCard
          title="Presupuesto inversión"
          value={fmtCOP(visibleTotals.presupuestoInversion)}
          color="indigo"
          icon={<IconCurrencyDollar size={18} />}
        />
        <KpiCard
          title="Total comprometido"
          value={fmtCOP(visibleTotals.comprometido)}
          color="violet"
          icon={<IconChartPie size={18} />}
        />
        <KpiCard
          title="Comprometido gasto"
          value={fmtCOP(visibleTotals.comprometidoGasto)}
          color="cyan"
          icon={<IconTrendingUp size={18} />}
        />
        <KpiCard
          title="Comprometido inversión"
          value={fmtCOP(visibleTotals.comprometidoInversion)}
          color="blue"
          icon={<IconTrendingUp size={18} />}
        />
        <KpiCard
          title="Total causado"
          value={fmtCOP(visibleTotals.causado)}
          sub={visibleTotals.comprometido > 0 ? `${pct(visibleTotals.causado, visibleTotals.comprometido)}% del comprometido` : undefined}
          color={pct(visibleTotals.causado, visibleTotals.comprometido) >= 80 ? "teal" : "orange"}
          icon={<IconCurrencyDollar size={18} />}
        />
        <KpiCard
          title="Causado gasto"
          value={fmtCOP(visibleTotals.causadoGasto)}
          sub={visibleTotals.comprometidoGasto > 0 ? `${pct(visibleTotals.causadoGasto, visibleTotals.comprometidoGasto)}% del comprometido gasto` : undefined}
          color="orange"
          icon={<IconCurrencyDollar size={18} />}
        />
        <KpiCard
          title="Causado inversión"
          value={fmtCOP(visibleTotals.causadoInversion)}
          sub={visibleTotals.comprometidoInversion > 0 ? `${pct(visibleTotals.causadoInversion, visibleTotals.comprometidoInversion)}% del comprometido inversión` : undefined}
          color="grape"
          icon={<IconCurrencyDollar size={18} />}
        />
      </SimpleGrid>

      {macroGroups.length > 0 && (
        <Box mb="xl">
          <Group justify="space-between" align="end" mb="xs" gap="sm">
            <Box>
              <Text fw={700}>Ejecución presupuestal por macroproyecto y centro de costo</Text>
              <Text size="xs" c="dimmed">
                Resumen de la macro y detalle de sus proyectos.
              </Text>
            </Box>
            <Group gap={8} align="end">
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
              <Tooltip label="Descargar Excel" withArrow>
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconDownload size={14} />}
                  onClick={() => handleDownloadExcel(visibleGroups, visibleTotals, selectedMacro)}
                >
                  Excel
                </Button>
              </Tooltip>
            </Group>
          </Group>
          <Box style={{ overflowX: "auto", border: "1px solid #f1f3f5", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f8f9fa" }}>
                  <th style={thStyle}>Macroproyecto</th>
                  <th style={thStyle}>Proyecto</th>
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
                  const groupDetails = collectDetails(group.rows);
                  const macroRow = (
                    <tr key={`macro-${group.macro}`} style={{ background: "#eef1f5" }}>
                      <td style={{ ...tdStyle, fontWeight: 800 }}>
                        <Group gap={8} wrap="nowrap">
                          <Badge size="xs" variant="light" color="violet" radius="sm">{group.code}</Badge>
                          <Text size="xs" fw={800}>{group.name}</Text>
                        </Group>
                      </td>
                      <td style={tdStyle} />
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#2f9e44", fontWeight: 800 }}>{fmtCOP(group.presupuesto)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#0b7285", fontWeight: 800 }}>
                        <BudgetDetailHover value={fmtCOP(group.comprometidoGasto)} details={groupDetails} metric="comprometidoGasto" color="#0b7285" fw={800} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#7048e8", fontWeight: 800 }}>
                        <BudgetDetailHover value={fmtCOP(group.comprometidoInversion)} details={groupDetails} metric="comprometidoInversion" color="#7048e8" fw={800} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>
                        <BudgetDetailHover value={fmtCOP(group.comprometido)} details={groupDetails} metric="comprometido" fw={800} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>
                        <BudgetDetailHover value={fmtCOP(group.causado)} details={groupDetails} metric="causado" fw={800} />
                      </td>
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
                    const rowDetails = row.detalles ?? [];
                    return (
                      <tr key={`${group.macro}-${row.codificacion || row.proyecto}-${rowIndex}`} style={{ background }}>
                        <td style={tdStyle}>
                          <Text size="xs" c="dimmed">{group.code}</Text>
                        </td>
                        <td style={tdStyle}>
                          <Text size="xs" fw={700}>{projectLabel(row)}</Text>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#2f9e44" }}>{fmtCOP(row.presupuesto || 0)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#0b7285" }}>
                          <BudgetDetailHover value={fmtCOP(row.comprometidoGasto)} details={rowDetails} metric="comprometidoGasto" color="#0b7285" />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#7048e8" }}>
                          <BudgetDetailHover value={fmtCOP(row.comprometidoInversion)} details={rowDetails} metric="comprometidoInversion" color="#7048e8" />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>
                          <BudgetDetailHover value={fmtCOP(row.comprometido)} details={rowDetails} metric="comprometido" fw={800} />
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                          <BudgetDetailHover value={fmtCOP(row.causado)} details={rowDetails} metric="causado" />
                        </td>
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
                  <td style={{ ...tdStyle, fontWeight: 800 }} colSpan={2}>
                    {selectedMacro === "todos" ? "Total" : "Total macro filtrada"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#2f9e44", fontWeight: 800 }}>{fmtCOP(visibleTotals.presupuesto)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#0b7285", fontWeight: 800 }}>
                    <BudgetDetailHover value={fmtCOP(visibleTotals.comprometidoGasto)} details={visibleDetails} metric="comprometidoGasto" color="#0b7285" fw={800} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: "#7048e8", fontWeight: 800 }}>
                    <BudgetDetailHover value={fmtCOP(visibleTotals.comprometidoInversion)} details={visibleDetails} metric="comprometidoInversion" color="#7048e8" fw={800} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>
                    <BudgetDetailHover value={fmtCOP(visibleTotals.comprometido)} details={visibleDetails} metric="comprometido" fw={800} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>
                    <BudgetDetailHover value={fmtCOP(visibleTotals.causado)} details={visibleDetails} metric="causado" fw={800} />
                  </td>
                  <td style={tdStyle} />
                </tr>
              </tfoot>
            </table>
          </Box>
        </Box>
      )}

      {macroGroups.length === 0 && (
        <Text c="dimmed" size="sm" ta="center" py="md">
          No se encontraron datos de presupuesto.
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

const popupThStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  borderBottom: "1px solid #e9ecef",
  fontWeight: 800,
  fontSize: 11,
  color: "#495057",
  whiteSpace: "nowrap",
};

const popupTdStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #f1f3f5",
  verticalAlign: "top",
  fontSize: 12,
};
