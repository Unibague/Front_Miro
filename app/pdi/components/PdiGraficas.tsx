"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useMemo } from "react";
import {
  Stack, Text, Paper, Select, Group, Loader, Center, Box, Grid, ThemeIcon, Badge,
  ActionIcon, Progress, SimpleGrid, Divider, Modal, ScrollArea, List,
} from "@mantine/core";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList, CartesianGrid,
  Tooltip as ReTooltip, PieChart, Pie, Cell,
  LineChart, Line, Legend,
} from "recharts";
import {
  IconX, IconCurrencyDollar, IconTrendingUp, IconTarget, IconBulb, IconSearch,
} from "@tabler/icons-react";
import axios from "axios";
import { PDI_ROUTES } from "../api";
import type {
  Macroproyecto, Proyecto, Accion, Indicador, DashboardResumen,
} from "../types";

// ── Colores ────────────────────────────────────────────────────────────────
const BLUE   = "#228be6";
const TEAL   = "#20c997";
const PURPLE = "#7950f2";
const ORANGE = "#fd7e14";
const PINK   = "#e64980";
const GREEN  = "#40c057";
const YELLOW = "#fab005";
const RED    = "#fa5252";

const CHART_COLORS = [BLUE, TEAL, PURPLE, ORANGE, PINK, GREEN, YELLOW, RED];
const SEMAFORO_COLOR: Record<string, string> = { verde: GREEN, amarillo: YELLOW, rojo: RED };
const SEMAFORO_LABEL: Record<string, string> = { verde: "En cumplimiento", amarillo: "En riesgo", rojo: "Crítico" };
const SEMAFORO_BADGE: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const FINAL_TARGET_YEAR = "2029";

const miniPeriodoGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(82px, 1fr))",
  gap: 8,
  alignItems: "stretch",
};

const miniPeriodoCardStyle: CSSProperties = {
  minWidth: 0,
  textAlign: "center",
  background: "var(--mantine-color-default-hover)",
  borderRadius: 8,
  padding: "8px 4px 6px",
  overflow: "hidden",
};

const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

function fmtCOP(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

function fmtCompactCOP(n: number) {
  const value = Number(n) || 0;
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}M`;
  return fmtCOP(value).replace(/\s/g, "");
}

// ── Stat card ─────────────────────────────────────────────────────────────
function toNumberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace("%", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function _periodosSorted(ind: Indicador) {
  return [...(ind.periodos ?? [])].sort((a, b) =>
    String(a.periodo ?? "").localeCompare(String(b.periodo ?? ""))
  );
}


function absAvanceHastaAnio(ind: Indicador, anio: string): number | null {
  // Valor absoluto del avance en ESE año (no acumulado) — coincide con cómo se calcula absMetaEnAnio
  const delAnio = _periodosSorted(ind).filter(
    (p) => String(p.periodo ?? "").slice(0, 4) === anio && toNumberValue(p.avance) !== null
  );
  if (!delAnio.length) return null;
  return ind.tipo_calculo === "ultimo_valor"
    ? (toNumberValue(delAnio[delAnio.length - 1].avance) ?? 0)
    : delAnio.reduce((acc, p) => acc + (toNumberValue(p.avance) ?? 0), 0);
}

function absMetaEnAnio(ind: Indicador, anio: string): number | null {
  const delAnio = _periodosSorted(ind).filter(
    (p) => String(p.periodo ?? "").slice(0, 4) === anio && toNumberValue(p.meta) !== null
  );
  if (!delAnio.length) return null;
  return ind.tipo_calculo === "ultimo_valor"
    ? (toNumberValue(delAnio[delAnio.length - 1].meta) ?? 0)
    : delAnio.reduce((acc, p) => acc + (toNumberValue(p.meta) ?? 0), 0);
}

function absAvanceHastaCorte(ind: Indicador, corte: string): number | null {
  // Valor absoluto del avance en ESE periodo exacto
  const p = (ind.periodos ?? []).find((pp) => pp.periodo === corte);
  return toNumberValue(p?.avance);
}

function absMetaEnCorte(ind: Indicador, corte: string): number | null {
  const p = (ind.periodos ?? []).find((pp) => pp.periodo === corte);
  return toNumberValue(p?.meta);
}

function fmtValue(value: number | string | null | undefined) {
  const parsed = toNumberValue(value);
  if (parsed !== null) {
    return parsed.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  }
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function cumplimientoPct(avance: number | null, meta: number | null) {
  if (avance === null || meta === null || meta <= 0) return null;
  return Math.min(Math.round((avance / meta) * 100), 100);
}

const PDI_WEIGHTED_PERCENT_MAX = 100;
const PDI_WEIGHTED_AXIS_TICKS = [0, 25, 50, 75, 100];

function roundWeightedPdiPct(value: number) {
  const bounded = Math.min(Math.max(Number(value) || 0, 0), PDI_WEIGHTED_PERCENT_MAX);
  return Math.round(bounded * 10) / 10;
}

function formatWeightedPdiPct(value: number | null | undefined) {
  return `${roundWeightedPdiPct(Number(value) || 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
}

function pctOfFinalPdi(value: number | null, finalTarget: number | null) {
  if (value === null || finalTarget === null || finalTarget <= 0) return null;
  return Math.min(Math.max((Math.max(value, 0) / finalTarget) * 100, 0), PDI_WEIGHTED_PERCENT_MAX);
}

function weightedPdiData(
  inds: Indicador[],
  getMeta: (ind: Indicador) => number | null,
  getAvance: (ind: Indicador) => number | null
) {
  let totalPeso = 0;
  let metaPonderada = 0;
  let avancePonderado = 0;

  for (const ind of inds) {
    const peso = Number(ind.peso) || 0;
    if (peso <= 0) continue;

    const meta = getMeta(ind);
    const avance = getAvance(ind);
    const finalTarget = toNumberValue(ind.meta_final_2029) ?? meta ?? avance;
    if (finalTarget === null || finalTarget <= 0) continue;

    totalPeso += peso;
    metaPonderada += (pctOfFinalPdi(meta, finalTarget) ?? 0) * peso;
    avancePonderado += (pctOfFinalPdi(avance, finalTarget) ?? 0) * peso;
  }

  if (totalPeso <= 0) return { meta: 0, avance: 0 };
  return {
    meta: roundWeightedPdiPct(metaPonderada / totalPeso),
    avance: roundWeightedPdiPct(avancePonderado / totalPeso),
  };
}

function weightedPdiTooltip(v: any, name: any) {
  return [
    formatWeightedPdiPct(Number(v)),
    name === "meta" ? "Programado" : "Ejecutado",
  ];
}

function weightedPdiAxisTick(v: any) {
  return `${v}%`;
}

function weightedPdiLabel(v: any) {
  const value = Number(v) || 0;
  return value > 0 ? formatWeightedPdiPct(value) : "";
}

function semaforoFromPct(pct: number | null | undefined) {
  const value = Number(pct) || 0;
  if (value >= 90) return "verde";
  if (value >= 60) return "amarillo";
  return "rojo";
}

function semaforoColorFromPct(pct: number | null | undefined) {
  return SEMAFORO_COLOR[semaforoFromPct(pct)] ?? RED;
}

function semaforoColorFromMeta(avance: number, meta: number) {
  return semaforoColorFromPct(cumplimientoPct(avance, meta));
}

function MiniPeriodoDonut({ corte, avance, meta }: { corte: string; avance: number; meta: number }) {
  const avPct = Math.min(Math.max(Number(avance) || 0, 0), PDI_WEIGHTED_PERCENT_MAX);
  const metPct = Math.max(Number(meta) || 0, 0);
  const fill = semaforoColorFromMeta(avPct, metPct);
  const donutData = [
    { value: avPct, fill },
    { value: Math.max(PDI_WEIGHTED_PERCENT_MAX - avPct, 0), fill: "#e9ecef" },
  ];

  return (
    <Box key={corte} style={miniPeriodoCardStyle}>
      <Text size="xs" fw={800} mb={4} lh={1.1} style={{ letterSpacing: 0 }}>
        {corte}
      </Text>
      <Box style={{ position: "relative", width: 68, height: 68, margin: "0 auto" }}>
        <PieChart width={68} height={68}>
          <Pie
            data={donutData}
            cx="50%"
            cy="50%"
            innerRadius={22}
            outerRadius={32}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            strokeWidth={0}
          >
            {donutData.map((e, i) => <Cell key={i} fill={e.fill} />)}
          </Pie>
        </PieChart>
        <Box style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", lineHeight: 1 }}>
          <Text fw={900} size="0.72rem" lh={1} style={{ color: fill }}>
            {formatWeightedPdiPct(avPct)}
          </Text>
        </Box>
      </Box>
      {metPct > 0 && (
        <Text
          size="0.62rem"
          c="dimmed"
          mt={4}
          lh={1.1}
          style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          Meta <span style={{ fontWeight: 700, color: "#868e96" }}>{weightedPdiLabel(metPct)}</span>
        </Text>
      )}
    </Box>
  );
}

function resolvePeriodoActual(inds: Indicador[]) {
  const currentYear = String(new Date().getFullYear());
  const periodos = Array.from(new Set(
    inds.flatMap((ind) => (ind.periodos ?? [])
      .map((p) => String(p.periodo ?? "").trim())
      .filter(Boolean))
  ));
  const delAnioActual = periodos.filter((periodo) => periodo.slice(0, 4) === currentYear);
  const candidatos = delAnioActual.length ? delAnioActual : periodos;
  const ordenados = [...candidatos].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  return ordenados[ordenados.length - 1] ?? currentYear;
}

function metricasPeriodo(ind: Indicador, periodo: string) {
  const metaPeriodo = absMetaEnCorte(ind, periodo);
  const avancePeriodo = absAvanceHastaCorte(ind, periodo);
  const pctPeriodo = cumplimientoPct(avancePeriodo, metaPeriodo) ?? 0;

  return {
    metaPeriodo,
    avancePeriodo,
    pctPeriodo,
    semaforoPeriodo: semaforoFromPct(pctPeriodo),
  };
}

function periodoByName(ind: Indicador, periodo: string) {
  return (ind.periodos ?? []).find((p) => p.periodo === periodo);
}

function hasMetaEnPeriodo(ind: Indicador, periodo: string) {
  const meta = periodoByName(ind, periodo)?.meta;
  return meta !== null && meta !== undefined && String(meta).trim() !== "";
}

function isReportadoEnPeriodo(ind: Indicador, periodo: string) {
  const periodoData = periodoByName(ind, periodo);
  const estado = periodoData?.estado_reporte ?? "Borrador";
  return Boolean(periodoData?.fecha_envio) || estado !== "Borrador";
}

function StatCard({ title, value, sub, color = "blue", icon, onAction }: {
  title: string; value: React.ReactNode; sub?: string; color?: string; icon: React.ReactNode; onAction?: () => void;
}) {
  return (
    <Paper withBorder radius="xl" p="md" style={{ position: "relative" }}>
      {onAction && (
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          style={{ position: "absolute", bottom: 10, right: 10 }}
          onClick={onAction}
          title="Ver detalle"
        >
          <IconSearch size={14} />
        </ActionIcon>
      )}
      <ThemeIcon size={40} radius="xl" color={color} variant="light" mb={8}>{icon}</ThemeIcon>
      <Text size="sm" c="dimmed" fw={700} mb={2}>{title}</Text>
      <Text fw={800} size="1.6rem" lh={1}>{value}</Text>
      {sub && <Text size="sm" c="dimmed" mt={4}>{sub}</Text>}
    </Paper>
  );
}


// ── Componente principal ───────────────────────────────────────────────────
function PctBar({ pct, semaforo }: { pct: number; semaforo: string }) {
  const value = Math.min(Math.max(Number(pct) || 0, 0), 100);
  const color = SEMAFORO_COLOR[semaforo] ?? BLUE;
  return (
    <Group gap={8} wrap="nowrap" align="center">
      <Box style={{ flex: 1, height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
        <Box style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 4 }} />
      </Box>
      <Text size="sm" fw={700} style={{ minWidth: 48, textAlign: "right" }}>{value}%</Text>
    </Group>
  );
}

type PresupuestoDetail = {
  codificacion?: string;
  accionEstrategica?: string;
  tipo?: string;
  valor?: number;
  causadoGasto?: number;
  causadoInversion?: number;
  causado?: number;
};

type PresupuestoSourceRow = {
  macroproyecto?: string;
  proyecto?: string;
  codificacion?: string;
  presupuesto?: number;
  presupuestoGasto?: number;
  presupuestoInversion?: number;
  comprometido?: number;
  comprometidoGasto?: number;
  comprometidoInversion?: number;
  causado?: number;
  causadoGasto?: number;
  causadoInversion?: number;
  detalles?: PresupuestoDetail[];
};

type PresupuestoChartDatum = {
  label: string;
  nombre: string;
  presupuesto: number;
  presupuestoGasto: number;
  presupuestoInversion: number;
  comprometido: number;
  comprometidoGasto: number;
  comprometidoInversion: number;
  causado: number;
  causadoGasto: number;
  causadoInversion: number;
  causadoPct: number;
};

type PresupuestoStack = "pres" | "comp" | "caus";
type PresupuestoPart = "gasto" | "inversion";
type PresupuestoSelection = { label: string; stack: PresupuestoStack; part: PresupuestoPart };

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPercentage(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function normalizeBudgetCode(value: unknown) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .trim();
}

function macroCodeFromText(value: unknown) {
  const text = String(value || "");
  const systemMatch = text.match(/^(M\d+)\b/i);
  if (systemMatch) return systemMatch[1].toUpperCase();
  const numericMatch = text.match(/^(\d+)/);
  return numericMatch ? `M${numericMatch[1]}` : "";
}

function actionProjectId(action: Accion) {
  return typeof action.proyecto_id === "object"
    ? action.proyecto_id._id
    : String(action.proyecto_id ?? "");
}

function makeBudgetDatum(label: string, nombre: string): PresupuestoChartDatum {
  return {
    label,
    nombre,
    presupuesto: 0,
    presupuestoGasto: 0,
    presupuestoInversion: 0,
    comprometido: 0,
    comprometidoGasto: 0,
    comprometidoInversion: 0,
    causado: 0,
    causadoGasto: 0,
    causadoInversion: 0,
    causadoPct: 0,
  };
}

function ensureBudgetDatum(groups: Map<string, PresupuestoChartDatum>, key: string, label: string, nombre: string) {
  const normalizedKey = normalizeBudgetCode(key || label);
  if (!groups.has(normalizedKey)) groups.set(normalizedKey, makeBudgetDatum(label, nombre));
  return groups.get(normalizedKey)!;
}

function addProjectBudget(row: PresupuestoSourceRow, target: PresupuestoChartDatum) {
  target.presupuesto += numberValue(row.presupuesto);
  target.presupuestoGasto += numberValue(row.presupuestoGasto);
  target.presupuestoInversion += numberValue(row.presupuestoInversion);
  target.comprometido += numberValue(row.comprometido);
  target.comprometidoGasto += numberValue(row.comprometidoGasto);
  target.comprometidoInversion += numberValue(row.comprometidoInversion);
  target.causado += numberValue(row.causado);
  target.causadoGasto += numberValue(row.causadoGasto);
  target.causadoInversion += numberValue(row.causadoInversion);
}

function addDetailBudget(detail: PresupuestoDetail, target: PresupuestoChartDatum) {
  const value = numberValue(detail.valor);
  const isInvestment = String(detail.tipo || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("inversion");

  if (isInvestment) target.comprometidoInversion += value;
  else target.comprometidoGasto += value;

  target.comprometido += value;
  target.causadoGasto += numberValue(detail.causadoGasto);
  target.causadoInversion += numberValue(detail.causadoInversion);
  target.causado += numberValue(detail.causado) || numberValue(detail.causadoGasto) + numberValue(detail.causadoInversion);
}

function finalizeBudgetDatum(item: PresupuestoChartDatum) {
  const budgetSplit = item.presupuestoGasto + item.presupuestoInversion;
  const committedSplit = item.comprometidoGasto + item.comprometidoInversion;

  if (item.presupuesto > 0 && budgetSplit <= 0) {
    if (committedSplit > 0) {
      item.presupuestoGasto = item.presupuesto * (item.comprometidoGasto / committedSplit);
      item.presupuestoInversion = item.presupuesto * (item.comprometidoInversion / committedSplit);
    } else {
      item.presupuestoGasto = item.presupuesto;
    }
  }

  item.causadoPct = clampPercentage(item.causado, item.presupuesto);
  return item;
}

function compareBudgetLabels(a: string, b: string) {
  const aParts = (a.match(/\d+/g) || []).map(Number);
  const bParts = (b.match(/\d+/g) || []).map(Number);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (diff !== 0) return diff;
  }

  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

function MacroEntityCard({
  entity, data, dataPeriodo, color,
}: {
  entity: { _id: string; codigo: string; nombre: string; avance: number; semaforo: string };
  data: { anio: string | number; meta: number; avance: number }[];
  dataPeriodo: { corte: string; meta: number; avance: number }[];
  color: string;
}) {
  const anios = data.map((d) => String(d.anio));
  const [selectedAnio, setSelectedAnio] = useState<string>(anios[0] ?? "");
  const activeAnio = selectedAnio && anios.includes(selectedAnio) ? selectedAnio : (anios[0] ?? "");
  const activeData = data.find((d) => String(d.anio) === activeAnio);

  const hasAnio    = data.some((d) => d.meta > 0 || d.avance > 0);
  const hasPeriodo = dataPeriodo.some((d) => d.meta > 0 || d.avance > 0);

  const meta   = Number(activeData?.meta   ?? 0);
  const avance = Number(activeData?.avance ?? 0);
  const cumplimientoAnio = meta > 0 ? Math.min(Math.round((avance / meta) * 100), 100) : 0;
  const restante = Math.max(meta - avance, 0);
  const pieColor = semaforoColorFromPct(cumplimientoAnio);
  const pieData = [
    { name: "Ejecutado", value: avance, fill: pieColor },
    { name: "Restante ponderado", value: restante, fill: "#e9ecef" },
  ];

  return (
    <Paper withBorder radius="xl" p="md">
      {/* Encabezado */}
      <Group gap={10} mb="md" align="center" wrap="nowrap">
        <Box w={12} h={12} style={{ borderRadius: 3, background: color, flexShrink: 0 }} />
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Box style={{ minWidth: 0 }}>
              <Text size="md" fw={800}>{entity.codigo}</Text>
              <Text size="sm" c="dimmed" lineClamp={1}>{entity.nombre}</Text>
            </Box>
            <Group gap={8} align="center" style={{ flexShrink: 0 }}>
              <Text fw={900} size="xl" lh={1} style={{ color: SEMAFORO_COLOR[entity.semaforo] ?? color }}>
                {Math.round(Number(entity.avance) || 0)}%
              </Text>
              <Badge color={SEMAFORO_BADGE[entity.semaforo] ?? "gray"} variant="light" size="sm">
                {SEMAFORO_LABEL[entity.semaforo] ?? entity.semaforo}
              </Badge>
            </Group>
          </Group>
          <Progress
            value={Math.min(Math.round(Number(entity.avance) || 0), 100)}
            size="xs" radius="xl" mt={6}
            color={SEMAFORO_BADGE[entity.semaforo] ?? "blue"}
          />
        </Box>
      </Group>

      <Grid gutter="sm">
        {/* ── Programado vs Ejecutado por Año ── */}
        <Grid.Col span={12}>
          <Text size="sm" fw={700} mb={8}>Programado vs Ejecutado por Año (% ponderado)</Text>
          {!hasAnio ? (
            <Center h={160}><Text size="xs" c="dimmed">Sin datos por año</Text></Center>
          ) : (
            <Grid gutter="sm" align="center">
              {/* Filtro de años + Donut */}
              <Grid.Col span={{ base: 12, sm: 4 }}>
                {/* Pills de año */}
                <Group gap={6} mb={10} wrap="wrap">
                  {anios.map((a) => (
                    <Box
                      key={a}
                      onClick={() => setSelectedAnio(a)}
                      style={{
                        cursor: "pointer",
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background: activeAnio === a ? color : "var(--mantine-color-default-hover)",
                        color: activeAnio === a ? "#fff" : undefined,
                        transition: "all .15s",
                      }}
                    >
                      {a}
                    </Box>
                  ))}
                </Group>
                {/* Donut */}
                <Box style={{ position: "relative", width: 140, height: 140, margin: "0 auto" }}>
                  <PieChart width={140} height={140}>
                    <Pie data={pieData} cx={65} cy={65} innerRadius={42} outerRadius={62}
                      startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
                      {pieData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                    </Pie>
                  </PieChart>
                  <Box style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                    <Text fw={900} size="lg" lh={1} style={{ color: pieColor }}>{formatWeightedPdiPct(avance)}</Text>
                    <Text size="0.6rem" c="dimmed">{activeAnio}</Text>
                  </Box>
                </Box>
                <Box mt={8} style={{ textAlign: "center" }}>
                  <Group justify="center" gap={8}>
                    <Group gap={4}><Box w={8} h={8} style={{ borderRadius: "50%", background: pieColor }} /><Text size="xs">Ejecutado: {formatWeightedPdiPct(avance)}</Text></Group>
                    <Group gap={4}><Box w={8} h={8} style={{ borderRadius: "50%", background: "#e9ecef" }} /><Text size="xs">Programado: {formatWeightedPdiPct(meta)}</Text></Group>
                  </Group>
                </Box>
              </Grid.Col>

              {/* Líneas por año */}
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="anio" tick={{ fontSize: 12, fontWeight: 600 }} />
                    <YAxis domain={[0, PDI_WEIGHTED_PERCENT_MAX]} ticks={PDI_WEIGHTED_AXIS_TICKS} tickFormatter={weightedPdiAxisTick} tick={{ fontSize: 11 }} />
                    <ReTooltip formatter={weightedPdiTooltip} />
                    <Legend formatter={(name) => name === "meta" ? "Programado" : "Ejecutado"} />
                    <Line type="monotone" dataKey="meta" name="meta" stroke={color} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: color }} />
                    <Line type="monotone" dataKey="avance" name="avance" stroke={pieColor} strokeWidth={2.5} dot={{ r: 4, fill: pieColor }}
                      label={{ position: "top", fontSize: 11, fontWeight: 700, fill: "#555", formatter: weightedPdiLabel }} />
                  </LineChart>
                </ResponsiveContainer>
              </Grid.Col>
            </Grid>
          )}
        </Grid.Col>

        {/* ── Programado vs Ejecutado por Periodo ── */}
        <Grid.Col span={12}>
          <Text size="sm" fw={700} mb={12}>Programado vs Ejecutado por Periodo (% ponderado)</Text>
          {!hasPeriodo ? (
            <Center h={120}><Text size="xs" c="dimmed">Sin datos por periodo</Text></Center>
          ) : (
            <Box style={miniPeriodoGridStyle}>
              {dataPeriodo.map((d: { corte: string; meta: number; avance: number }) => (
                <MiniPeriodoDonut key={d.corte} corte={d.corte} avance={d.avance} meta={d.meta} />
              ))}
            </Box>
          )}
        </Grid.Col>
      </Grid>
    </Paper>
  );
}

function AccionMetaAvanceCard({
  accion, data, dataPeriodo, color,
}: {
  accion: { _id: string; codigo: string; nombre: string };
  data: { anio: string | number; meta: number; avance: number }[];
  dataPeriodo: { corte: string; meta: number; avance: number }[];
  color: string;
}) {
  const anios = data.map((d) => String(d.anio));
  const [selectedAnio, setSelectedAnio] = useState<string>(anios[0] ?? "");
  const activeAnio = selectedAnio && anios.includes(selectedAnio) ? selectedAnio : (anios[0] ?? "");
  const activeData = data.find((d) => String(d.anio) === activeAnio);

  const hasAnio    = data.some((d) => d.meta > 0 || d.avance > 0);
  const hasPeriodo = dataPeriodo.some((d) => d.meta > 0 || d.avance > 0);

  const meta    = Number(activeData?.meta   ?? 0);
  const avance  = Number(activeData?.avance ?? 0);
  const pctAnio = meta > 0 ? Math.min(Math.round((avance / meta) * 100), 100) : 0;
  const restante = Math.max(meta - avance, 0);
  const pieColor = semaforoColorFromPct(pctAnio);
  const pieData = [
    { name: "Avance", value: avance, fill: pieColor },
    { name: "Meta restante", value: restante, fill: "#e9ecef" },
  ];

  return (
    <Paper withBorder radius="xl" p="md">
      <Group gap={10} mb="sm" align="center" wrap="nowrap">
        <Box w={12} h={12} style={{ borderRadius: 3, background: color, flexShrink: 0 }} />
        <Box style={{ minWidth: 0, flex: 1 }}>
          <Text size="sm" fw={800}>{accion.codigo}</Text>
          <Text size="xs" c="dimmed" lineClamp={1}>{accion.nombre}</Text>
        </Box>
      </Group>

      <Grid gutter="sm">
        <Grid.Col span={12}>
          <Text size="sm" fw={700} mb={8}>Meta vs Avance por Año (% ponderado)</Text>
          {!hasAnio ? (
            <Center h={160}><Text size="xs" c="dimmed">Sin datos por año</Text></Center>
          ) : (
            <Grid gutter="sm" align="center">
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Group gap={6} mb={10} wrap="wrap">
                  {anios.map((a) => (
                    <Box
                      key={a}
                      onClick={() => setSelectedAnio(a)}
                      style={{
                        cursor: "pointer",
                        padding: "3px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        background: activeAnio === a ? color : "var(--mantine-color-default-hover)",
                        color: activeAnio === a ? "#fff" : undefined,
                        transition: "all .15s",
                      }}
                    >
                      {a}
                    </Box>
                  ))}
                </Group>
                <Box style={{ position: "relative", width: 140, height: 140, margin: "0 auto" }}>
                  <PieChart width={140} height={140}>
                    <Pie data={pieData} cx={65} cy={65} innerRadius={42} outerRadius={62}
                      startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
                      {pieData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                    </Pie>
                  </PieChart>
                  <Box style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                    <Text fw={900} size="lg" lh={1} style={{ color: pieColor }}>{formatWeightedPdiPct(avance)}</Text>
                    <Text size="0.6rem" c="dimmed">{activeAnio}</Text>
                  </Box>
                </Box>
                <Box mt={8} style={{ textAlign: "center" }}>
                  <Group justify="center" gap={8}>
                    <Group gap={4}><Box w={8} h={8} style={{ borderRadius: "50%", background: pieColor }} /><Text size="xs">Avance: {formatWeightedPdiPct(avance)}</Text></Group>
                    <Group gap={4}><Box w={8} h={8} style={{ borderRadius: "50%", background: "#e9ecef" }} /><Text size="xs">Programado: {formatWeightedPdiPct(meta)}</Text></Group>
                  </Group>
                </Box>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="anio" tick={{ fontSize: 12, fontWeight: 600 }} />
                    <YAxis domain={[0, PDI_WEIGHTED_PERCENT_MAX]} ticks={PDI_WEIGHTED_AXIS_TICKS} tickFormatter={weightedPdiAxisTick} tick={{ fontSize: 11 }} />
                    <ReTooltip formatter={weightedPdiTooltip} />
                    <Legend formatter={(name) => name === "meta" ? "Meta ponderada" : "Avance ponderado"} />
                    <Line type="monotone" dataKey="meta" name="meta" stroke={color} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: color }} />
                    <Line type="monotone" dataKey="avance" name="avance" stroke={pieColor} strokeWidth={2.5} dot={{ r: 4, fill: pieColor }}
                      label={{ position: "top", fontSize: 11, fontWeight: 700, fill: "#555", formatter: weightedPdiLabel }} />
                  </LineChart>
                </ResponsiveContainer>
              </Grid.Col>
            </Grid>
          )}
        </Grid.Col>

        <Grid.Col span={12}>
          <Text size="sm" fw={700} mb={8}>Meta vs Avance por Periodo (% ponderado)</Text>
          {!hasPeriodo ? (
            <Center h={120}><Text size="xs" c="dimmed">Sin datos por periodo</Text></Center>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={dataPeriodo} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="corte" tick={{ fontSize: 10, fontWeight: 600 }} />
                <YAxis domain={[0, PDI_WEIGHTED_PERCENT_MAX]} ticks={PDI_WEIGHTED_AXIS_TICKS} tickFormatter={weightedPdiAxisTick} tick={{ fontSize: 11 }} />
                <ReTooltip formatter={weightedPdiTooltip} />
                <Legend formatter={(name) => name === "meta" ? "Meta ponderada" : "Avance ponderado"} />
                <Line type="monotone" dataKey="meta" name="meta" stroke={color} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: color }} />
                <Line type="monotone" dataKey="avance" name="avance" stroke={pieColor} strokeWidth={2.5} dot={{ r: 3, fill: pieColor }}
                  label={{ position: "top", fontSize: 10, fontWeight: 700, fill: "#555", formatter: weightedPdiLabel }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Grid.Col>
      </Grid>
    </Paper>
  );
}

export default function PdiGraficas() {
  const [pdiData, setPdiData] = useState<{
    macros: Macroproyecto[]; proyectos: Proyecto[]; acciones: Accion[]; indicadores: Indicador[];
  } | null>(null);
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [corteActivo, setCorteActivo] = useState<string | null>(null);

  const [selectedMacro,    setSelectedMacro]    = useState<string | null>("todos");
  const [selectedProyecto, setSelectedProyecto] = useState<string | null>("todos");
  const [selectedAccion,   setSelectedAccion]   = useState<string | null>("todos");

  const [presupuestoRows, setPresupuestoRows] = useState<PresupuestoSourceRow[]>([]);
  const [selectedPres, setSelectedPres] = useState<PresupuestoSelection | null>(null);
  const [hoveredPres, setHoveredPres] = useState<PresupuestoSelection | null>(null);

  const [modalSinReporte, setModalSinReporte] = useState(false);

  useEffect(() => {
    Promise.all([
      axios.get(PDI_ROUTES.dashboardResumen()),
      axios.get(PDI_ROUTES.macroproyectos()),
      axios.get(PDI_ROUTES.proyectos()),
      axios.get(PDI_ROUTES.acciones()),
      axios.get(PDI_ROUTES.indicadores()),
      axios.get(PDI_ROUTES.cortesActivos()),
    ]).then(([rR, rM, rP, rA, rI, rC]) => {
      setResumen(rR.data);
      setPdiData({ macros: rM.data, proyectos: rP.data, acciones: rA.data, indicadores: rI.data });
      setCorteActivo(rC.data?.[0]?.nombre ?? null);
    }).catch(console.error);
    axios.get(PDI_ROUTES.presupuestoData()).then(r => setPresupuestoRows(r.data.rows ?? [])).catch(() => {});
  }, []);

  useEffect(() => { setSelectedProyecto("todos"); setSelectedAccion("todos"); }, [selectedMacro]);
  useEffect(() => { setSelectedAccion("todos"); }, [selectedProyecto]);

  const macros      = pdiData?.macros      ?? [];
  const proyectos   = pdiData?.proyectos   ?? [];
  const acciones    = pdiData?.acciones    ?? [];
  const indicadores = pdiData?.indicadores ?? [];
  const verTodos    = selectedMacro === "todos";

  const proysMacro = useMemo(() => proyectos.filter((p) => {
    if (verTodos) return true;
    const mid = typeof p.macroproyecto_id === "object" ? p.macroproyecto_id._id : p.macroproyecto_id;
    return mid === selectedMacro;
  }), [proyectos, selectedMacro, verTodos]);

  const proyIds = useMemo(() => new Set(proysMacro.map((p) => p._id)), [proysMacro]);

  const accionesMacro = useMemo(() => acciones.filter((a) => {
    const pid = typeof a.proyecto_id === "object" ? a.proyecto_id._id : a.proyecto_id;
    return proyIds.has(pid);
  }), [acciones, proyIds]);

  const accionIds = useMemo(() => new Set(accionesMacro.map((a) => a._id)), [accionesMacro]);

  const indsMacroAll = useMemo(() => indicadores.filter((i) => {
    const aid = i.accion_id && typeof i.accion_id === "object" ? i.accion_id._id : String(i.accion_id ?? "");
    return accionIds.has(aid);
  }), [indicadores, accionIds]);

  const accionesFiltradas = useMemo(() => accionesMacro.filter((a) => {
    if (selectedProyecto && selectedProyecto !== "todos") {
      const pid = typeof a.proyecto_id === "object" ? a.proyecto_id._id : a.proyecto_id;
      return pid === selectedProyecto;
    }
    return true;
  }), [accionesMacro, selectedProyecto]);

  const accionesFiltIds = useMemo(() => new Set(accionesFiltradas.map((a) => a._id)), [accionesFiltradas]);

  const macroActual = verTodos ? null : macros.find((m) => m._id === selectedMacro) ?? null;

  const proyectoActual = useMemo(() =>
    selectedProyecto && selectedProyecto !== "todos"
      ? proyectos.find((p) => p._id === selectedProyecto) ?? null
      : null
  , [selectedProyecto, proyectos]);

  const indsDelProyecto = useMemo(() => {
    if (!proyectoActual) return [];
    return indsMacroAll.filter((ind) => {
      const aid = ind.accion_id && typeof ind.accion_id === "object" ? ind.accion_id._id : String(ind.accion_id ?? "");
      return accionesFiltIds.has(aid);
    });
  }, [proyectoActual, indsMacroAll, accionesFiltIds]);

  const accionActual = useMemo(() =>
    selectedAccion && selectedAccion !== "todos"
      ? acciones.find((a) => a._id === selectedAccion) ?? null
      : null
  , [selectedAccion, acciones]);

  const indsDelAccion = useMemo(() => {
    if (!accionActual) return [];
    return indsMacroAll.filter((ind) => {
      const aid = ind.accion_id && typeof ind.accion_id === "object" ? ind.accion_id._id : String(ind.accion_id ?? "");
      return aid === accionActual._id;
    });
  }, [accionActual, indsMacroAll]);


  const metricIndicators = useMemo(() => {
    if (accionActual) return indsDelAccion;
    if (proyectoActual) return indsDelProyecto;
    return verTodos ? indicadores : indsMacroAll;
  }, [accionActual, indsDelAccion, proyectoActual, indsDelProyecto, verTodos, indicadores, indsMacroAll]);

  const budgetStats = useMemo(() => {
    if (accionActual) {
      const total = Number(accionActual.presupuesto) || 0;
      const ejecutado = Number(accionActual.presupuesto_ejecutado) || 0;
      return { total, ejecutado, porcentaje_ejecucion: total > 0 ? Math.round((ejecutado / total) * 100) : 0 };
    }
    if (proyectoActual) {
      const total = Number(proyectoActual.presupuesto) || 0;
      const ejecutado = Number(proyectoActual.presupuesto_ejecutado) || 0;
      return { total, ejecutado, porcentaje_ejecucion: total > 0 ? Math.round((ejecutado / total) * 100) : 0 };
    }
    if (verTodos) {
      return {
        total: resumen?.presupuesto.total ?? 0,
        ejecutado: resumen?.presupuesto.ejecutado ?? 0,
        porcentaje_ejecucion: resumen?.presupuesto.porcentaje_ejecucion ?? 0,
      };
    }
    const totalProyectos = proysMacro.reduce((acc, p) => acc + (Number(p.presupuesto) || 0), 0);
    const ejecutadoProyectos = proysMacro.reduce((acc, p) => acc + (Number(p.presupuesto_ejecutado) || 0), 0);
    const total = totalProyectos || Number(macroActual?.presupuesto) || 0;
    const ejecutado = ejecutadoProyectos || Number(macroActual?.presupuesto_ejecutado) || 0;
    return {
      total,
      ejecutado,
      porcentaje_ejecucion: total > 0 ? Math.round((ejecutado / total) * 100) : 0,
    };
  }, [accionActual, proyectoActual, verTodos, resumen, proysMacro, macroActual]);

  const avanceGeneral = useMemo(() => {
    if (accionActual) return Math.round(Number(accionActual.avance) || 0);
    if (proyectoActual) return Math.round(Number(proyectoActual.avance) || 0);
    if (!verTodos && macroActual) return Math.round(Number(macroActual.avance) || 0);
    return resumen?.avance_global ?? 0;
  }, [accionActual, proyectoActual, macroActual, verTodos, resumen]);

  const indicadoresConRetrasos = useMemo(() => metricIndicators.filter((ind) =>
    (ind.periodos ?? []).some((p) => String(p.justificacion_retrasos ?? "").trim() !== "")
  ).length, [metricIndicators]);

  const indsFiltradas = useMemo(() => {
    const base = verTodos ? indicadores : indsMacroAll;
    return base.filter((ind) => {
      const aid = ind.accion_id && typeof ind.accion_id === "object" ? ind.accion_id._id : String(ind.accion_id ?? "");
      if (!verTodos && selectedProyecto && selectedProyecto !== "todos" && !accionesFiltIds.has(aid)) return false;
      if (selectedAccion && selectedAccion !== "todos" && aid !== selectedAccion) return false;
      return true;
    });
  }, [verTodos, indicadores, indsMacroAll, accionesFiltIds, selectedProyecto, selectedAccion]);

  const periodoActual = useMemo(
    () => corteActivo || resolvePeriodoActual(indsFiltradas),
    [corteActivo, indsFiltradas]
  );

  const indicadoresConMetaPeriodo = useMemo(
    () => metricIndicators.filter((ind) => hasMetaEnPeriodo(ind, periodoActual)),
    [metricIndicators, periodoActual]
  );

  const indicadoresSinReporte = useMemo(
    () => indicadoresConMetaPeriodo.filter((ind) => !isReportadoEnPeriodo(ind, periodoActual)),
    [indicadoresConMetaPeriodo, periodoActual]
  );
  const reportesPendientes = indicadoresSinReporte.length;

  const indicadoresCriticosPeriodo = useMemo(() => [...indsFiltradas]
    .filter((ind) => hasMetaEnPeriodo(ind, periodoActual))
    .map((ind) => {
      const { metaPeriodo, avancePeriodo, pctPeriodo, semaforoPeriodo } = metricasPeriodo(ind, periodoActual);

      return {
        id: ind._id,
        codigo: ind.codigo,
        nombre: ind.nombre,
        metaFinal: ind.meta_final_2029,
        metaPeriodo,
        avancePeriodo,
        pctPeriodo,
        semaforoPeriodo,
      };
    })
    .sort((a, b) => a.pctPeriodo - b.pctPeriodo || a.codigo.localeCompare(b.codigo))
  , [indsFiltradas, periodoActual]);

  const indicadoresCriticosTop = indicadoresCriticosPeriodo;

  // ── Mapas para vincular indicadores a su macro/proyecto ──────────────────
  const { indToMacro, indToProyecto } = useMemo(() => {
    const proyToMacro = new Map<string, string>();
    for (const p of proyectos) {
      const mid = typeof p.macroproyecto_id === "object" ? p.macroproyecto_id._id : String(p.macroproyecto_id);
      proyToMacro.set(p._id, mid);
    }
    const accionToProyecto = new Map<string, string>();
    const accionToMacro    = new Map<string, string>();
    for (const a of acciones) {
      const pid = typeof a.proyecto_id === "object" ? a.proyecto_id._id : String(a.proyecto_id);
      accionToProyecto.set(a._id, pid);
      accionToMacro.set(a._id, proyToMacro.get(pid) ?? "");
    }
    const indToMacro    = new Map<string, string>();
    const indToProyecto = new Map<string, string>();
    for (const i of indicadores) {
      const aid = i.accion_id && typeof i.accion_id === "object" ? i.accion_id._id : String(i.accion_id ?? "");
      indToMacro.set(i._id, accionToMacro.get(aid) ?? "");
      indToProyecto.set(i._id, accionToProyecto.get(aid) ?? "");
    }
    return { indToMacro, indToProyecto };
  }, [indicadores, acciones, proyectos]);

  // Entidades (macros o proyectos según filtro) y scope de indicadores
  const entities    = verTodos ? macros : proysMacro;
  const indsScope   = verTodos ? indicadores : indsMacroAll;
  const getEntityId = (indId: string) => verTodos ? indToMacro.get(indId) : indToProyecto.get(indId);

  // ── Gráfica 1: Avance por año ─────────────────────────────────────────────
  const aniosPdi = useMemo(() => {
    const set = new Set<string>();
    for (const ind of indsScope) {
      for (const a of Object.keys(ind.avances_por_anio ?? {})) set.add(a);
      for (const p of ind.periodos ?? []) if (p.periodo) set.add(String(p.periodo).slice(0, 4));
    }
    return Array.from(set).sort();
  }, [indsScope]);

  // ── Gráfica 2: Avance por periodo ─────────────────────────────────────────
  const periodosPdi = useMemo(() => {
    const set = new Set<string>();
    for (const ind of indsScope) for (const p of ind.periodos ?? []) if (p.periodo) set.add(p.periodo);
    return Array.from(set).sort();
  }, [indsScope]);

  // ── Datos separados por entidad (meta vs avance en % ponderado) ───────────
  const entidadesDataAnio = useMemo(() =>
    entities.map((entity) => {
      const indsEntity = indsScope.filter((i) => getEntityId(i._id) === entity._id);
      const data = aniosPdi.map((anio) => {
        const ponderado = weightedPdiData(
          indsEntity,
          (ind) => absMetaEnAnio(ind, anio),
          (ind) => absAvanceHastaAnio(ind, anio)
        );
        return {
          anio,
          avance: ponderado.avance,
          meta:   ponderado.meta,
        };
      });
      return { entity, data };
    })
  , [aniosPdi, entities, indsScope, indToMacro, indToProyecto, verTodos]);

  const entidadesDataPeriodo = useMemo(() =>
    entities.map((entity) => {
      const indsEntity = indsScope.filter((i) => getEntityId(i._id) === entity._id);
      const data = periodosPdi.map((corte) => {
        const ponderado = weightedPdiData(
          indsEntity,
          (ind) => absMetaEnCorte(ind, corte),
          (ind) => absAvanceHastaCorte(ind, corte)
        );
        return {
          corte: corte.slice(0, 7),
          avance: ponderado.avance,
          meta:   ponderado.meta,
        };
      });
      return { entity, data };
    })
  , [periodosPdi, entities, indsScope, indToMacro, indToProyecto, verTodos]);

  // ── Vista de proyecto seleccionado ────────────────────────────────────────

  const aniosProyecto = useMemo(() => {
    const set = new Set<string>();
    for (const ind of indsDelProyecto) {
      for (const a of Object.keys(ind.avances_por_anio ?? {})) set.add(a);
      for (const p of ind.periodos ?? []) if (p.periodo) set.add(String(p.periodo).slice(0, 4));
    }
    return Array.from(set).sort();
  }, [indsDelProyecto]);

  const proyectoAvancePorAnio = useMemo(() =>
    aniosProyecto.map((anio) => {
      const ponderado = weightedPdiData(
        indsDelProyecto,
        (ind) => absMetaEnAnio(ind, anio),
        (ind) => absAvanceHastaAnio(ind, anio)
      );
      return { anio, avance: ponderado.avance, meta: ponderado.meta };
    })
  , [aniosProyecto, indsDelProyecto]);

  const accionesDataAnio = useMemo(() =>
    accionesFiltradas.map((a) => {
      const indsA = indsDelProyecto.filter((ind) => {
        const aid = ind.accion_id && typeof ind.accion_id === "object" ? ind.accion_id._id : String(ind.accion_id ?? "");
        return aid === a._id;
      });
      const data = aniosProyecto.map((anio) => {
        const ponderado = weightedPdiData(
          indsA,
          (ind) => absMetaEnAnio(ind, anio),
          (ind) => absAvanceHastaAnio(ind, anio)
        );
        return {
          anio,
          avance: ponderado.avance,
          meta:   ponderado.meta,
        };
      });
      return { accion: a, data };
    })
  , [accionesFiltradas, indsDelProyecto, aniosProyecto]);

  const accionesDataPeriodo = useMemo(() => {
    const set = new Set<string>();
    for (const ind of indsDelProyecto) for (const p of ind.periodos ?? []) if (p.periodo) set.add(p.periodo);
    const periodos = Array.from(set).sort();
    return accionesFiltradas.map((a) => {
      const indsA = indsDelProyecto.filter((ind) => {
        const aid = ind.accion_id && typeof ind.accion_id === "object" ? ind.accion_id._id : String(ind.accion_id ?? "");
        return aid === a._id;
      });
      const data = periodos.map((corte) => {
        const ponderado = weightedPdiData(
          indsA,
          (ind) => absMetaEnCorte(ind, corte),
          (ind) => absAvanceHastaCorte(ind, corte)
        );
        return {
          corte: corte.slice(0, 7),
          avance: ponderado.avance,
          meta:   ponderado.meta,
        };
      });
      return { accion: a, data };
    });
  }, [accionesFiltradas, indsDelProyecto]);

  const proyectoAvancePorPeriodo = useMemo(() => {
    const set = new Set<string>();
    for (const ind of indsDelProyecto) for (const p of ind.periodos ?? []) if (p.periodo) set.add(p.periodo);
    return Array.from(set).sort().map((corte) => {
      const ponderado = weightedPdiData(
        indsDelProyecto,
        (ind) => absMetaEnCorte(ind, corte),
        (ind) => absAvanceHastaCorte(ind, corte)
      );
      return { corte: corte.slice(0, 7), avance: ponderado.avance, meta: ponderado.meta };
    });
  }, [indsDelProyecto]);

  // Datos presupuestales segun el filtro activo.
  const presupuestoChartData = useMemo(() => {
    const groups = new Map<string, PresupuestoChartDatum>();
    const macroCode = normalizeBudgetCode(macroActual?.codigo);
    const projectCode = normalizeBudgetCode(proyectoActual?.codigo);

    if (proyectoActual || accionActual) {
      const actions = accionActual
        ? [accionActual]
        : accionesFiltradas.filter((action) => !proyectoActual || actionProjectId(action) === proyectoActual._id);
      const actionCodes = new Set(actions.map((action) => normalizeBudgetCode(action.codigo)));

      for (const action of actions) {
        const item = ensureBudgetDatum(groups, action.codigo, action.codigo, action.nombre);
        item.presupuesto = numberValue(action.presupuesto);
      }

      for (const row of presupuestoRows) {
        if (projectCode && normalizeBudgetCode(row.codificacion) !== projectCode) continue;

        for (const detail of row.detalles ?? []) {
          const detailCode = normalizeBudgetCode(detail.codificacion);
          if (!actionCodes.has(detailCode)) continue;

          const action = actions.find((item) => normalizeBudgetCode(item.codigo) === detailCode);
          const item = ensureBudgetDatum(
            groups,
            detailCode,
            action?.codigo || detail.codificacion || "Sin codigo",
            action?.nombre || detail.accionEstrategica || "Sin nombre",
          );
          addDetailBudget(detail, item);
        }
      }

      for (const action of actions) {
        const item = ensureBudgetDatum(groups, action.codigo, action.codigo, action.nombre);
        const gasto = numberValue(action.gasto);
        const inversion = numberValue(action.inversion);
        const causado = numberValue(action.presupuesto_ejecutado) || gasto + inversion;

        if (item.causado <= 0 && causado > 0) {
          item.causadoGasto = gasto || (!inversion ? causado : 0);
          item.causadoInversion = inversion;
          item.causado = causado;
        }
      }
    } else if (macroActual) {
      for (const row of presupuestoRows) {
        if (macroCode && macroCodeFromText(row.macroproyecto) !== macroCode) continue;

        const label = row.codificacion || "Sin codigo";
        const item = ensureBudgetDatum(groups, label, label, row.proyecto || "Sin nombre");
        addProjectBudget(row, item);
      }

      for (const project of proysMacro) {
        const item = ensureBudgetDatum(groups, project.codigo, project.codigo, project.nombre);
        if (item.presupuesto <= 0) item.presupuesto = numberValue(project.presupuesto);
      }
    } else {
      for (const row of presupuestoRows) {
        const label = macroCodeFromText(row.macroproyecto);
        if (!label) continue;

        const macro = macros.find((item) => normalizeBudgetCode(item.codigo) === label);
        const nombre = macro?.nombre ?? String(row.macroproyecto || "").replace(/^M?\d+\s*[-.:]\s*/i, "").trim();
        const item = ensureBudgetDatum(groups, label, label, nombre);
        addProjectBudget(row, item);
      }
    }

    return Array.from(groups.values())
      .map(finalizeBudgetDatum)
      .filter((item) => item.presupuesto > 0 || item.comprometido > 0 || item.causado > 0)
      .sort((a, b) => compareBudgetLabels(a.label, b.label));
  }, [accionActual, accionesFiltradas, macroActual, macros, presupuestoRows, proyectoActual, proysMacro]);

  const anyFilter = selectedProyecto !== "todos" || selectedAccion !== "todos";
  const limpiarFiltros = () => {
    setSelectedProyecto("todos"); setSelectedAccion("todos");
  };

  if (!pdiData) return <Center py="xl"><Loader color="blue" /></Center>;

  const presupuestoChartTitle = accionActual
    ? "Ejecución presupuestal de la acción estratégica"
    : proyectoActual
    ? "Ejecución presupuestal por acción estratégica"
    : macroActual
    ? "Ejecución presupuestal por proyecto"
    : "Ejecución presupuestal por macroproyecto";
  const presupuestoChartDescription = accionActual
    ? `${accionActual.codigo} — ${accionActual.nombre}`
    : proyectoActual
    ? `${proyectoActual.codigo} — ${proyectoActual.nombre}`
    : macroActual
    ? `${macroActual.codigo} — ${macroActual.nombre}`
    : "Presupuesto, comprometido y causado — gasto e inversión";

  const mainContent = (
    <Stack gap="md">

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <Paper withBorder radius="lg" shadow="sm" px="md" py="sm"
        style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--mantine-color-body)" }}
      >
        <Group gap="sm" align="flex-end" wrap="nowrap">
          <Select label="Macroproyecto" size="xs" style={{ flex: 2 }}
            data={[{ value: "todos", label: "Todos" }, ...macros.map((m) => ({ value: m._id, label: m.codigo || m.nombre }))]}
            value={selectedMacro} onChange={setSelectedMacro} />
          <Select label="Proyecto" size="xs" style={{ flex: 2 }} disabled={verTodos}
            data={[{ value: "todos", label: "Todos" }, ...proysMacro.map((p) => ({ value: p._id, label: `${p.codigo} ${p.nombre}`.slice(0, 50) }))]}
            value={selectedProyecto} onChange={setSelectedProyecto} />
          <Select label="Acción estratégica" size="xs" style={{ flex: 2 }}
            disabled={verTodos || selectedProyecto === "todos"}
            data={[{ value: "todos", label: "Todas" }, ...accionesFiltradas.map((a) => ({ value: a._id, label: `${a.codigo} ${a.nombre}`.slice(0, 50) }))]}
            value={selectedAccion} onChange={setSelectedAccion} />
          {anyFilter && (
            <ActionIcon variant="light" color="gray" size="lg" mb={1} onClick={limpiarFiltros} title="Limpiar filtros">
              <IconX size={13} />
            </ActionIcon>
          )}
        </Group>
        {macroActual && (
          <Group gap={6} mt="xs">
            <Box w={6} h={6} style={{ borderRadius: "50%", background: BLUE, flexShrink: 0 }} />
            <Text size="xs" c="dimmed">
              Macroproyecto activo: <Text span fw={700} c="blue">{macroActual.nombre}</Text>
            </Text>
          </Group>
        )}
      </Paper>

      {/* ── Tarjetas KPI adaptativas ─────────────────────────────────────── */}
      {(() => {
        const ctxLabel = accionActual
          ? `${accionActual.codigo}`
          : proyectoActual
          ? `${proyectoActual.codigo}`
          : macroActual
          ? `${macroActual.codigo}`
          : "PDI";
        const semaforoAvance = avanceGeneral >= 90 ? "teal" : avanceGeneral >= 60 ? "yellow" : "red";
        return (
          <>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
              <StatCard
                icon={<IconCurrencyDollar size={18} />}
                title={accionActual ? "Presupuesto de la acción" : proyectoActual ? "Presupuesto del proyecto" : macroActual ? "Presupuesto del macroproyecto" : "Presupuesto total PDI"}
                value={fmtCOP(budgetStats.total)}
                color="blue"
              />
              <StatCard
                icon={<IconTrendingUp size={18} />}
                title="Presupuesto causado"
                value={fmtCOP(budgetStats.ejecutado)}
                sub={`${budgetStats.porcentaje_ejecucion}% del total`}
                color={budgetStats.porcentaje_ejecucion >= 70 ? "teal" : "orange"}
              />
              <StatCard
                icon={<IconTarget size={18} />}
                title={`Avance general ${ctxLabel}`}
                value={`${avanceGeneral}%`}
                color={semaforoAvance}
              />
              <StatCard
                icon={<IconBulb size={18} />}
                title="Indicadores sin reporte"
                value={reportesPendientes}
                sub={`de ${indicadoresConMetaPeriodo.length} con meta en ${periodoActual}`}
                color="orange"
                onAction={reportesPendientes > 0 ? () => setModalSinReporte(true) : undefined}
              />
            </SimpleGrid>
          </>
        );
      })()}

      {/* ── Ejecución presupuestal (torta + barras unificadas) ───────────── */}
      {presupuestoChartData.length > 0 && (
        <Paper withBorder radius="xl" p="md">
          <Text size="md" fw={700} mb={2}>{presupuestoChartTitle}</Text>
          <Text size="sm" c="dimmed" mb="md">{presupuestoChartDescription}</Text>

          <Box style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>

            {/* Izquierda: torta (solo cuando hay acción seleccionada) */}
            {accionActual && budgetStats.total > 0 && (() => {
              const causado  = budgetStats.ejecutado;
              const restante = Math.max(budgetStats.total - causado, 0);
              const pct      = budgetStats.porcentaje_ejecucion;
              const pieColor = pct >= 80 ? TEAL : pct >= 40 ? ORANGE : RED;
              const pieData  = [
                { name: "Causado",  value: causado,  fill: pieColor },
                { name: "Restante", value: restante, fill: "#e9ecef" },
              ];
              return (
                <Box style={{ flexShrink: 0, width: 260, borderRight: "1px solid var(--mantine-color-default-border)", paddingRight: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <Badge color="gray" variant="light" radius="sm" size="sm">{accionActual.codigo}</Badge>

                  {/* Donut */}
                  <Box style={{ position: "relative", width: 180, height: 180 }}>
                    <PieChart width={180} height={180}>
                      <Pie data={pieData} cx={85} cy={85} innerRadius={54} outerRadius={82}
                        startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Pie>
                    </PieChart>
                    <Box style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                      <Text fw={900} size="1.6rem" lh={1} style={{ color: pieColor }}>{pct}%</Text>
                      <Text size="xs" c="dimmed">ejecutado</Text>
                    </Box>
                  </Box>

                  {/* Etiqueta compacta de presupuesto; el porcentaje causado queda en el centro de la dona. */}
                  <Box style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr", gap: 6, textAlign: "center" }}>
                    <Box style={{ background: "#f8f9fa", borderRadius: 8, padding: "8px 4px" }}>
                      <Text size="xs" c="dimmed" lh={1} mb={4}>Presupuesto</Text>
                      <Text size="xs" fw={800} lh={1}>{fmtCOP(budgetStats.total).replace("$ ", "$").replace(/\s/g, "")}</Text>
                    </Box>
                  </Box>

                  {/* Barra de progreso */}
                  <Box style={{ width: "100%", height: 6, background: "#e9ecef", borderRadius: 4, overflow: "hidden" }}>
                    <Box style={{ width: `${pct}%`, height: "100%", background: pieColor, borderRadius: 4, transition: "width 0.4s" }} />
                  </Box>
                </Box>
              );
            })()}

            {/* Derecha: barras según el filtro activo */}
            <Box style={{ flex: 1, minWidth: 0 }}>
          {/* Paleta de colores por macro: presupuesto=claro, comprometido=medio, causado=sólido */}
          {(() => {
            const MACRO_PALETTES = [
              { light: "#93c5fd", mid: "#3b82f6", solid: "#1d4ed8" },
              { light: "#86efac", mid: "#22c55e", solid: "#15803d" },
              { light: "#fdba74", mid: "#f97316", solid: "#c2410c" },
              { light: "#c4b5fd", mid: "#8b5cf6", solid: "#6d28d9" },
              { light: "#fda4af", mid: "#f43f5e", solid: "#be123c" },
              { light: "#67e8f9", mid: "#06b6d4", solid: "#0e7490" },
            ];
            const paletteIndex = (d: PresupuestoChartDatum, fallback: number) => {
              const macroCode = macroCodeFromText(d.label);
              const index = macros.findIndex((macro) => normalizeBudgetCode(macro.codigo) === macroCode);
              return index >= 0 ? index : fallback;
            };
            const palette = (d: PresupuestoChartDatum, i: number) =>
              MACRO_PALETTES[paletteIndex(d, i) % MACRO_PALETTES.length];

            const fmtM = (v: number) => v >= 1_000_000
              ? `$${(v / 1_000_000).toFixed(1)}M`
              : v > 0 ? `$${v.toLocaleString("es-CO")}` : "$0";

            const pct = (num: number, den: number) =>
              den > 0 ? Math.round((num / den) * 100) : 0;

            const isDimmed = (d: PresupuestoChartDatum, stack: PresupuestoStack, part: PresupuestoPart) => {
              if (selectedPres) {
                return selectedPres.label !== d.label || selectedPres.stack !== stack || selectedPres.part !== part;
              }
              if (hoveredPres) {
                return hoveredPres.label !== d.label || hoveredPres.stack !== stack || hoveredPres.part !== part;
              }
              return false;
            };

            const handleBarHover = (stack: PresupuestoStack, part: PresupuestoPart) =>
              (barData: any, index: number) => {
                const lbl = presupuestoChartData[index]?.label || barData?.payload?.label;
                if (!lbl) return;
                setHoveredPres({ label: lbl, stack, part });
              };

            const handleBarMouseDown = (_barData: any, _index: number, event: any) => {
              event?.preventDefault?.();
              event?.stopPropagation?.();
              event?.currentTarget?.blur?.();
            };

            const handleBarClick = (stack: PresupuestoStack, part: PresupuestoPart) =>
              (barData: any, index: number, event: any) => {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                event?.currentTarget?.blur?.();
                const lbl = presupuestoChartData[index]?.label || barData?.payload?.label;
                if (!lbl) return;
                setSelectedPres((current) =>
                  current && current.label === lbl && current.stack === stack && current.part === part
                    ? null
                    : { label: lbl, stack, part }
                );
              };

            const stackLabel: Record<PresupuestoStack, string> = {
              pres: "Presupuesto",
              comp: "Comprometido",
              caus: "Causado",
            };

            const partLabel = (partValue: PresupuestoPart) =>
              partValue === "gasto" ? "Gasto" : "Inversión";

            const stackTotal = (d: PresupuestoChartDatum, stackValue: PresupuestoStack) => {
              if (stackValue === "pres") return d.presupuesto;
              if (stackValue === "comp") return d.comprometido;
              return d.causado;
            };

            const stackPartAmount = (
              d: PresupuestoChartDatum,
              stackValue: PresupuestoStack,
              partValue: PresupuestoPart,
            ) => {
              if (stackValue === "pres") {
                return partValue === "gasto" ? d.presupuestoGasto : d.presupuestoInversion;
              }
              if (stackValue === "comp") {
                return partValue === "gasto" ? d.comprometidoGasto : d.comprometidoInversion;
              }
              return partValue === "gasto" ? d.causadoGasto : d.causadoInversion;
            };

            const compPct  = (d: PresupuestoChartDatum) => pct(d.causado, d.comprometido);
            const causPct  = (d: PresupuestoChartDatum) => pct(d.causado,      d.presupuesto);

            const budgetDatumFromShape = (props: any) => {
              const label = props?.payload?.label;
              if (label) {
                const byLabel = presupuestoChartData.find((item) => item.label === label);
                if (byLabel) return byLabel;
              }
              const index = Number(props.index);
              return presupuestoChartData[index];
            };

            // eslint-disable-next-line react/display-name
            const renderBudgetBarShape = (stack: PresupuestoStack, part: PresupuestoPart) => (props: any) => {
              const d = budgetDatumFromShape(props);
              if (!d) return null;

              const x = Number(props.x);
              const y = Number(props.y);
              const width = Number(props.width);
              const height = Number(props.height);
              const segmentAmount = stackPartAmount(d, stack, part);
              if (segmentAmount <= 0 || width <= 0 || height === 0) return null;

              const inversionAmount = stackPartAmount(d, stack, "inversion");
              const isTopPart = part === "inversion" ? segmentAmount > 0 : inversionAmount <= 0;
              const isSelected = selectedPres?.label === d.label && selectedPres?.stack === stack;
              const selectedPart = isSelected && selectedPres ? selectedPres.part : part;
              const selectedAmount = stackPartAmount(d, stack, selectedPart);
              const selectedCausedPart = stackPartAmount(d, "caus", selectedPart);
              const selectedPctText = stack === "pres"
                ? `Causado: ${fmtM(d.causado)} (${causPct(d)}%)`
                : stack === "comp"
                  ? `Causado: ${fmtM(selectedCausedPart)} (${pct(selectedCausedPart, selectedAmount)}%)`
                  : `${causPct(d)}% del presupuesto`;

              const gastoAmt   = stackPartAmount(d, stack, "gasto");
              const invAmt     = stackPartAmount(d, stack, "inversion");

              // Líneas de label: total siempre, + gasto/inv + % si está seleccionado
              const lines: { text: string; color: string; size: number; weight: number }[] = [];
              if (isTopPart && !isSelected) {
                lines.push({ text: fmtM(stackTotal(d, stack)), color: "#0f172a", size: 12, weight: 900 });
                if (stack === "pres") lines.push({ text: `${causPct(d)}%`, color: "#64748b", size: 10, weight: 900 });
                if (stack === "comp") lines.push({ text: `${compPct(d)}%`, color: "#64748b", size: 10, weight: 900 });
                if (stack === "caus") lines.push({ text: `${causPct(d)}%`, color: "#64748b", size: 10, weight: 900 });
              }

              const lineHeight = 14;
              const totalLabelHeight = lines.length * lineHeight;
              const labelBaseY = Math.max(y - 6, totalLabelHeight + 4);
              const cardWidth = 238;
              const cardHeight = 78;
              const cardX = Math.max(112, x + width / 2 - cardWidth / 2);
              const cardY = Math.max(10, y - cardHeight - 14);
              const fill = props.fill || "#94a3b8";

              return (
                <g>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={Math.abs(height)}
                    fill={fill}
                    fillOpacity={props.fillOpacity ?? 1}
                    opacity={props.opacity ?? 1}
                    rx={isTopPart ? 4 : 0}
                    ry={isTopPart ? 4 : 0}
                    stroke="transparent"
                    strokeWidth={0}
                    focusable="false"
                  />
                  {lines.length > 0 && (
                    <text textAnchor="middle" pointerEvents="none">
                      {lines.map((line, idx) => (
                        <tspan
                          key={idx}
                          x={x + width / 2}
                          y={labelBaseY - (lines.length - 1 - idx) * lineHeight}
                          fontSize={line.size}
                          fontWeight={line.weight}
                          fill={line.color}
                        >
                          {line.text}
                        </tspan>
                      ))}
                    </text>
                  )}
                  {isTopPart && isSelected && (
                    <g pointerEvents="none">
                      <rect
                        x={cardX}
                        y={cardY}
                        width={cardWidth}
                        height={cardHeight}
                        rx={8}
                        ry={8}
                        fill="#fff"
                        stroke="#dbe3ef"
                        strokeWidth={1}
                      />
                      <text x={cardX + 12} y={cardY + 18} fontSize={12} fontWeight={900} fill="#0f172a">
                        {stackLabel[stack]}
                      </text>
                      <text x={cardX + 12} y={cardY + 39} fontSize={15} fontWeight={900} fill="#020617">
                        {fmtM(selectedAmount)}
                      </text>
                      <text x={cardX + 12} y={cardY + 54} fontSize={10} fontWeight={800} fill="#64748b">
                        {selectedPctText}
                      </text>
                      <text x={cardX + 12} y={cardY + 68} fontSize={10} fontWeight={700} fill="#475569">
                        {`Gasto: ${fmtM(gastoAmt)}  Inversion: ${fmtM(invAmt)}`}
                      </text>
                    </g>
                  )}
                </g>
              );
            };

            return (
              <>
                <style jsx global>{`
                  .pdi-budget-chart,
                  .pdi-budget-chart *,
                  .pdi-budget-chart *:focus,
                  .pdi-budget-chart *:focus-visible,
                  .pdi-budget-chart .recharts-surface,
                  .pdi-budget-chart .recharts-wrapper,
                  .pdi-budget-chart .recharts-layer,
                  .pdi-budget-chart .recharts-rectangle,
                  .pdi-budget-chart .recharts-active-bar,
                  .pdi-budget-chart .recharts-active-bar * {
                    outline: none !important;
                  }

                  .pdi-budget-chart .recharts-tooltip-cursor {
                    fill: transparent !important;
                    stroke: transparent !important;
                    stroke-width: 0 !important;
                  }

                  .pdi-budget-chart .recharts-active-bar .recharts-rectangle,
                  .pdi-budget-chart .recharts-active-bar path {
                    stroke: transparent !important;
                    stroke-width: 0 !important;
                  }
                `}</style>

                <Box className="pdi-budget-chart" onClick={() => setSelectedPres(null)}>
                <ResponsiveContainer width="100%" height={Math.max(360, presupuestoChartData.length * 76)}>
                  <BarChart
                    data={presupuestoChartData}
                    margin={{ top: 88, right: 38, left: 18, bottom: 18 }}
                    barCategoryGap="24%"
                    barGap={10}
                    accessibilityLayer={false}
                    style={{ cursor: "pointer", outline: "none" }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="label" tick={{ fontSize: 14, fontWeight: 800 }} interval={0} />
                    <YAxis tick={{ fontSize: 12, fontWeight: 600 }} tickFormatter={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(0)}M` : `$${v}`} width={72} />

                    {/* Presupuesto — color claro por macro */}
                    <Bar dataKey="presupuestoGasto" name="Pres. Gasto" stackId="pres" barSize={30} activeBar={false}
                      shape={renderBudgetBarShape("pres", "gasto")}
                      focusable="false" tabIndex={-1}
                      onMouseEnter={handleBarHover("pres", "gasto")}
                      onMouseDown={handleBarMouseDown}
                      onMouseLeave={() => setHoveredPres(null)}
                      onClick={handleBarClick("pres", "gasto")}>
                      {presupuestoChartData.map((d, i) => (
                        <Cell key={i} fill={palette(d, i).light}
                          stroke="transparent" strokeWidth={0} focusable="false"
                          opacity={isDimmed(d, "pres", "gasto") ? 0.42 : 1} />
                      ))}
                    </Bar>
                    <Bar dataKey="presupuestoInversion" name="Pres. Inversión" stackId="pres" radius={[4, 4, 0, 0]} barSize={30} activeBar={false}
                      shape={renderBudgetBarShape("pres", "inversion")}
                      focusable="false" tabIndex={-1}
                      onMouseEnter={handleBarHover("pres", "inversion")}
                      onMouseDown={handleBarMouseDown}
                      onMouseLeave={() => setHoveredPres(null)}
                      onClick={handleBarClick("pres", "inversion")}>
                      {presupuestoChartData.map((d, i) => (
                        <Cell key={i} fill={palette(d, i).light} fillOpacity={0.62}
                          stroke="transparent" strokeWidth={0} focusable="false"
                          opacity={isDimmed(d, "pres", "inversion") ? 0.42 : 1} />
                      ))}
                    </Bar>

                    {/* Comprometido — color medio por macro */}
                    <Bar dataKey="comprometidoGasto" name="Comp. Gasto" stackId="comp" barSize={30} activeBar={false}
                      shape={renderBudgetBarShape("comp", "gasto")}
                      focusable="false" tabIndex={-1}
                      onMouseEnter={handleBarHover("comp", "gasto")}
                      onMouseDown={handleBarMouseDown}
                      onMouseLeave={() => setHoveredPres(null)}
                      onClick={handleBarClick("comp", "gasto")}>
                      {presupuestoChartData.map((d, i) => (
                        <Cell key={i} fill={palette(d, i).mid}
                          stroke="transparent" strokeWidth={0} focusable="false"
                          opacity={isDimmed(d, "comp", "gasto") ? 0.42 : 1} />
                      ))}
                    </Bar>
                    <Bar dataKey="comprometidoInversion" name="Comp. Inversión" stackId="comp" radius={[4, 4, 0, 0]} barSize={30} activeBar={false}
                      shape={renderBudgetBarShape("comp", "inversion")}
                      focusable="false" tabIndex={-1}
                      onMouseEnter={handleBarHover("comp", "inversion")}
                      onMouseDown={handleBarMouseDown}
                      onMouseLeave={() => setHoveredPres(null)}
                      onClick={handleBarClick("comp", "inversion")}>
                      {presupuestoChartData.map((d, i) => (
                        <Cell key={i} fill={palette(d, i).mid} fillOpacity={0.7}
                          stroke="transparent" strokeWidth={0} focusable="false"
                          opacity={isDimmed(d, "comp", "inversion") ? 0.42 : 1} />
                      ))}
                    </Bar>

                    {/* Causado — color sólido por macro */}
                    <Bar dataKey="causadoGasto" name="Caus. Gasto" stackId="caus" barSize={30} activeBar={false}
                      shape={renderBudgetBarShape("caus", "gasto")}
                      focusable="false" tabIndex={-1}
                      onMouseEnter={handleBarHover("caus", "gasto")}
                      onMouseDown={handleBarMouseDown}
                      onMouseLeave={() => setHoveredPres(null)}
                      onClick={handleBarClick("caus", "gasto")}>
                      {presupuestoChartData.map((d, i) => (
                        <Cell key={i} fill={palette(d, i).solid}
                          stroke="transparent" strokeWidth={0} focusable="false"
                          opacity={isDimmed(d, "caus", "gasto") ? 0.42 : 1} />
                      ))}
                    </Bar>
                    <Bar dataKey="causadoInversion" name="Caus. Inversión" stackId="caus" radius={[4, 4, 0, 0]} barSize={30} activeBar={false}
                      shape={renderBudgetBarShape("caus", "inversion")}
                      focusable="false" tabIndex={-1}
                      onMouseEnter={handleBarHover("caus", "inversion")}
                      onMouseDown={handleBarMouseDown}
                      onMouseLeave={() => setHoveredPres(null)}
                      onClick={handleBarClick("caus", "inversion")}>
                      {presupuestoChartData.map((d, i) => (
                        <Cell key={i} fill={palette(d, i).solid} fillOpacity={0.72}
                          stroke="transparent" strokeWidth={0} focusable="false"
                          opacity={isDimmed(d, "caus", "inversion") ? 0.42 : 1} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </Box>

                {/* Leyenda por macro */}
                <Text size="xs" fw={800} c="dimmed" mt="sm" mb={6}>
                  Colores por macroproyecto
                </Text>
                <Box style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 8,
                }}>
                  {presupuestoChartData.map((d, i) => (
                    <Group key={d.label} gap={8} align="flex-start" wrap="nowrap" style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "8px 10px",
                      background: "#fff",
                      minWidth: 0,
                    }}>
                      <Box w={16} h={16} style={{ borderRadius: 4, background: palette(d, i).solid, flexShrink: 0, marginTop: 1 }} />
                      <Box style={{ minWidth: 0 }}>
                        <Text size="xs" fw={700} lh={1.2} style={{ color: palette(d, i).solid }}>{d.label}</Text>
                        <Text size="xs" c="dimmed" lh={1.3}>{d.nombre}</Text>
                      </Box>
                    </Group>
                  ))}
                </Box>
              </>
            );
          })()}
            </Box>{/* fin columna derecha */}
          </Box>{/* fin flex container */}
        </Paper>
      )}

      {/* ── Gráficas separadas por entidad (macro o proyecto) ────────── */}
      {!proyectoActual && (
        <Stack gap="md">
          {entidadesDataAnio.map(({ entity, data }, i) => (
            <MacroEntityCard
              key={entity._id}
              entity={entity}
              data={data}
              dataPeriodo={entidadesDataPeriodo[i]?.data ?? []}
              color={CHART_COLORS[i % CHART_COLORS.length]}
            />
          ))}
        </Stack>
      )}

      {/* ── Top indicadores críticos + Semaforización (macro / global) ─── */}
      {!proyectoActual && (
        <Grid gutter="sm">
          <Grid.Col span={{ base: 12, md: 9 }}>
            <Paper withBorder radius="xl" p="md" h="100%">
              <Group justify="space-between" mb="sm" align="flex-start">
                <Box>
                  <Text size="md" fw={700}>Indicadores del período</Text>
                  <Text size="xs" c="dimmed" fw={600}>
                    {indicadoresCriticosPeriodo.length} indicadores con meta en {periodoActual}
                  </Text>
                </Box>
                <Text size="xs" c="dimmed">{metricIndicators.length} indicadores totales</Text>
              </Group>
              <Box style={tableScrollStyle}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Indicador</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 88 }}>
                        Meta {FINAL_TARGET_YEAR}
                      </th>
                      <th style={{ ...thStyle, textAlign: "right", width: 88 }}>Meta {periodoActual}</th>
                      <th style={{ ...thStyle, textAlign: "right", width: 88 }}>Avance {periodoActual}</th>
                      <th style={{ ...thStyle, width: 150 }}>% cumpl. {periodoActual}</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 96 }}>Estado {periodoActual}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicadoresCriticosTop.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#868e96", fontSize: 12 }}>
                          Sin indicadores críticos para mostrar
                        </td>
                      </tr>
                    ) : (
                      indicadoresCriticosTop.map((row, i) => (
                        <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9ff" }}>
                          <td style={{ ...tdStyle, maxWidth: 420 }}>
                            <Text size="sm" fw={700} c="blue">{row.codigo}</Text>
                            <Text size="sm" c="dimmed" lineClamp={2}>{row.nombre}</Text>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                            <Text size="sm" fw={700}>{fmtValue(row.metaFinal)}</Text>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                            <Text size="sm" fw={700}>{fmtValue(row.metaPeriodo)}</Text>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                            <Text size="sm" fw={600}>{fmtValue(row.avancePeriodo)}</Text>
                          </td>
                          <td style={{ ...tdStyle, minWidth: 140 }}>
                            <PctBar pct={row.pctPeriodo} semaforo={row.semaforoPeriodo} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <Badge color={SEMAFORO_BADGE[row.semaforoPeriodo] ?? "gray"} variant="filled" size="md">
                              {SEMAFORO_LABEL[row.semaforoPeriodo] ?? row.semaforoPeriodo}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </Box>
            </Paper>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 3 }}>
            <Paper withBorder radius="xl" p="md" h="100%">
              <Text size="md" fw={700} mb={4}>Semaforización</Text>
              <Text size="sm" c="dimmed" mb="sm">Rangos de cumplimiento</Text>
              <Stack gap="sm">
                {[
                  { color: "#fa5252", badge: "red",    label: "Crítico",         rango: "< 60%" },
                  { color: "#fab005", badge: "yellow", label: "En riesgo",       rango: "60% a < 90%" },
                  { color: "#40c057", badge: "green",  label: "En cumplimiento", rango: "≥ 90%" },
                ].map(({ color, badge, label, rango }) => (
                  <Box key={label} style={{ borderLeft: `4px solid ${color}`, paddingLeft: 10, paddingTop: 6, paddingBottom: 6, borderRadius: "0 6px 6px 0", background: `${color}11` }}>
                    <Badge color={badge} variant="filled" size="sm" mb={4}>{label}</Badge>
                    <Text size="sm" fw={700} style={{ color }}>Rango: {rango}</Text>
                  </Box>
                ))}
              </Stack>
              <Box mt="md" style={{ background: "#f8f9fa", borderRadius: 8, padding: "8px 10px" }}>
                <Text size="sm" c="dimmed" lh={1.5}>
                  La <b>Meta {FINAL_TARGET_YEAR}</b> se mantiene como referencia final. El cumplimiento y el estado se calculan con la meta y avance del periodo {periodoActual}.
                </Text>
              </Box>
            </Paper>
          </Grid.Col>
        </Grid>
      )}

      {/* ── Vista detallada del proyecto seleccionado ──────────────────── */}
      {proyectoActual && !accionActual && (
        <>
          <Divider
            label={
              <Group gap={6}>
                <Box w={8} h={8} style={{ borderRadius: "50%", background: BLUE }} />
                <Text size="xs" fw={700} c="blue">
                  Proyecto: {proyectoActual.codigo} — {proyectoActual.nombre}
                </Text>
              </Group>
            }
            labelPosition="left"
          />

          {/* 2. Avance vs Meta por año  +  3. Avance vs Meta por periodo */}
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper withBorder radius="xl" p="md" h="100%">
                <Text size="sm" fw={700} mb={8}>Programado vs Ejecutado por Año (% ponderado)</Text>
                {proyectoAvancePorAnio.length === 0 ? (
                  <Center h={180}><Text size="xs" c="dimmed">Sin datos por año</Text></Center>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={proyectoAvancePorAnio} margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                      <XAxis dataKey="anio" tick={{ fontSize: 11, fontWeight: 600 }} />
                      <YAxis domain={[0, PDI_WEIGHTED_PERCENT_MAX]} ticks={PDI_WEIGHTED_AXIS_TICKS} tickFormatter={weightedPdiAxisTick} tick={{ fontSize: 10 }} />
                      <ReTooltip formatter={weightedPdiTooltip} />
                      <Legend formatter={(name) => name === "meta" ? "Programado" : "Ejecutado"} />
                      <Line type="monotone" dataKey="meta" name="meta" stroke={PURPLE} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: PURPLE }} />
                      <Line type="monotone" dataKey="avance" name="avance" stroke={TEAL} strokeWidth={2.5} dot={{ r: 4, fill: TEAL }}
                        label={{ position: "top", fontSize: 10, fontWeight: 700, fill: "#555", formatter: weightedPdiLabel }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper withBorder radius="xl" p="md" h="100%">
                <Text size="sm" fw={700} mb={12}>Programado vs Ejecutado por Periodo (% ponderado)</Text>
                {proyectoAvancePorPeriodo.length === 0 ? (
                  <Center h={180}><Text size="xs" c="dimmed">Sin datos por periodo</Text></Center>
                ) : (
                  <Box style={miniPeriodoGridStyle}>
                    {proyectoAvancePorPeriodo.map((d: { corte: string; meta: number; avance: number }) => (
                      <MiniPeriodoDonut key={d.corte} corte={d.corte} avance={d.avance} meta={d.meta} />
                    ))}
                  </Box>
                )}
              </Paper>
            </Grid.Col>
          </Grid>

          {/* 4. Tarjetas por Acción — avance general */}
          <Paper withBorder radius="xl" p="md">
            <Text size="sm" fw={700} mb={2}>Avance por Acción Estratégica</Text>
            <Text size="xs" c="dimmed" mb="md">Cada acción muestra su porcentaje de avance</Text>
            {accionesFiltradas.length === 0 ? (
              <Center py="md"><Text size="xs" c="dimmed">Sin acciones</Text></Center>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                {accionesFiltradas.map((a) => {
                  const av = Math.min(Math.max(Math.round(Number(a.avance) || 0), 0), 100);
                  const hex = av >= 90 ? GREEN : av >= 60 ? YELLOW : RED;
                  const semBadge = SEMAFORO_BADGE[a.semaforo] ?? "gray";
                  const semLabel = SEMAFORO_LABEL[a.semaforo] ?? a.semaforo;
                  const pieDataAc = [
                    { value: av, fill: hex },
                    { value: Math.max(100 - av, 0), fill: "#e9ecef" },
                  ];
                  return (
                    <Paper key={a._id} withBorder radius="xl" p="lg">
                      <Group justify="space-between" align="flex-start" mb={8} wrap="nowrap">
                        <Box style={{ minWidth: 0, flex: 1 }}>
                          <Text size="md" fw={800} c="blue" lh={1.2}>{a.codigo}</Text>
                          <Text size="xs" c="dimmed" lh={1.4} mt={4} lineClamp={3}>{a.nombre}</Text>
                        </Box>
                        <Badge size="sm" color={semBadge} variant="filled" style={{ flexShrink: 0 }}>
                          {semLabel}
                        </Badge>
                      </Group>
                      <Group justify="center" mt={8}>
                        <Box style={{ position: "relative", width: 90, height: 90 }}>
                          <PieChart width={90} height={90}>
                            <Pie data={pieDataAc} cx={40} cy={40} innerRadius={28} outerRadius={40}
                              startAngle={90} endAngle={-270} dataKey="value" strokeWidth={0}>
                              {pieDataAc.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                            </Pie>
                          </PieChart>
                          <Box style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                            <Text fw={900} size="sm" lh={1} style={{ color: hex }}>{av}%</Text>
                          </Box>
                        </Box>
                      </Group>
                    </Paper>
                  );
                })}
              </SimpleGrid>
            )}
          </Paper>

          {/* 5. Avance de acciones — gráficas separadas por acción */}
          <Stack gap="md">
            {accionesDataAnio.map(({ accion, data }, i) => (
              <AccionMetaAvanceCard
                key={accion._id}
                accion={accion}
                data={data}
                dataPeriodo={accionesDataPeriodo[i]?.data ?? []}
                color={CHART_COLORS[i % CHART_COLORS.length]}
              />
            ))}
          </Stack>

          {/* 6. Indicadores del período del proyecto + Semaforización */}
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, md: 9 }}>
              <Paper withBorder radius="xl" p="md" h="100%">
                <Group justify="space-between" mb="sm" align="flex-start">
                  <Box>
                    <Text size="md" fw={700}>Indicadores del período</Text>
                    <Text size="xs" c="red" fw={600}>
                      {indicadoresCriticosPeriodo.length} indicadores críticos encontrados
                    </Text>
                  </Box>
                  <Text size="xs" c="dimmed">{metricIndicators.length} indicadores totales</Text>
                </Group>
                <Box style={tableScrollStyle}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Indicador</th>
                        <th style={{ ...thStyle, textAlign: "right", width: 88 }}>
                          Meta {FINAL_TARGET_YEAR}
                        </th>
                        <th style={{ ...thStyle, textAlign: "right", width: 88 }}>Meta {periodoActual}</th>
                        <th style={{ ...thStyle, textAlign: "right", width: 88 }}>Avance {periodoActual}</th>
                        <th style={{ ...thStyle, width: 150 }}>% cumpl. {periodoActual}</th>
                        <th style={{ ...thStyle, textAlign: "center", width: 96 }}>Estado {periodoActual}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indicadoresCriticosTop.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#868e96", fontSize: 12 }}>
                            Sin indicadores críticos para mostrar
                          </td>
                        </tr>
                      ) : (
                        indicadoresCriticosTop.map((row, i) => (
                          <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9ff" }}>
                            <td style={{ ...tdStyle, maxWidth: 420 }}>
                              <Text size="xs" fw={700} c="blue">{row.codigo}</Text>
                              <Text size="xs" c="dimmed" lineClamp={2}>{row.nombre}</Text>
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                              <Text size="sm" fw={700}>{fmtValue(row.metaFinal)}</Text>
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                              <Text size="sm" fw={700}>{fmtValue(row.metaPeriodo)}</Text>
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                              <Text size="sm" fw={600}>{fmtValue(row.avancePeriodo)}</Text>
                            </td>
                            <td style={{ ...tdStyle, minWidth: 140 }}>
                              <PctBar pct={row.pctPeriodo} semaforo={row.semaforoPeriodo} />
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              <Badge color={SEMAFORO_BADGE[row.semaforoPeriodo] ?? "gray"} variant="filled" size="md">
                                {SEMAFORO_LABEL[row.semaforoPeriodo] ?? row.semaforoPeriodo}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Box>
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 3 }}>
              <Paper withBorder radius="xl" p="md" h="100%">
                <Text size="sm" fw={700} mb={4}>Semaforización</Text>
                <Text size="xs" c="dimmed" mb="sm">Rangos de cumplimiento</Text>
                <Stack gap="sm">
                  {[
                    { color: "#fa5252", badge: "red",    label: "Crítico",         rango: "< 60%" },
                    { color: "#fab005", badge: "yellow", label: "En riesgo",       rango: "60% a < 90%" },
                    { color: "#40c057", badge: "green",  label: "En cumplimiento", rango: "≥ 90%" },
                  ].map(({ color, badge, label, rango }) => (
                    <Box key={label} style={{ borderLeft: `4px solid ${color}`, paddingLeft: 10, paddingTop: 6, paddingBottom: 6, borderRadius: "0 6px 6px 0", background: `${color}11` }}>
                      <Badge color={badge} variant="filled" size="xs" mb={4}>{label}</Badge>
                      <Text size="xs" fw={700} style={{ color }}>Rango: {rango}</Text>
                    </Box>
                  ))}
                </Stack>
                <Box mt="md" style={{ background: "#f8f9fa", borderRadius: 8, padding: "8px 10px" }}>
                  <Text size="xs" c="dimmed" lh={1.5}>
                    La <b>Meta {FINAL_TARGET_YEAR}</b> se mantiene como referencia final. El cumplimiento y el estado se calculan con la meta y avance del periodo {periodoActual}.
                  </Text>
                </Box>
              </Paper>
            </Grid.Col>
          </Grid>
        </>
      )}

      {/* ── Vista detallada de la acción seleccionada ──────────────────── */}
      {accionActual && (
        <>
          {/* Estado de indicadores (donut) + Indicadores vs Meta */}
          <Grid gutter="sm" align="stretch">
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Paper withBorder radius="xl" p="md" h="100%">
                <Text size="sm" fw={700} mb={2}>Estado de Indicadores</Text>
                <Text size="xs" c="dimmed" mb="sm">Distribución por semáforo</Text>
                {indsDelAccion.length === 0 ? (
                  <Center py="md"><Text size="xs" c="dimmed">Sin indicadores</Text></Center>
                ) : (() => {
                  const rojo     = indsDelAccion.filter((i) => i.semaforo === "rojo").length;
                  const amarillo = indsDelAccion.filter((i) => i.semaforo === "amarillo").length;
                  const verde    = indsDelAccion.filter((i) => i.semaforo === "verde").length;
                  const donutData = [
                    { name: "Crítico",            value: rojo,     color: RED    },
                    { name: "Cumplimiento adecuado", value: verde,  color: GREEN  },
                    { name: "Requiere atención",  value: amarillo, color: YELLOW },
                  ].filter((d) => d.value > 0);
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={68}
                            paddingAngle={3} dataKey="value">
                            {donutData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <ReTooltip formatter={(v: any, name: any) => [v, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                      <Group gap={12} justify="center" mt={4} mb="sm">
                        {donutData.map((d) => (
                          <Group key={d.name} gap={4}>
                            <Box w={10} h={10} style={{ borderRadius: "50%", background: d.color }} />
                            <Text size="xs">{d.name}</Text>
                          </Group>
                        ))}
                      </Group>
                      <Stack gap={6}>
                        {indsDelAccion.map((ind) => (
                          <Group key={ind._id} gap={6} wrap="nowrap" align="flex-start">
                            <Box w={8} h={8} style={{ borderRadius: "50%", background: SEMAFORO_COLOR[ind.semaforo] ?? "#ccc", flexShrink: 0, marginTop: 3 }} />
                            <Box style={{ minWidth: 0 }}>
                              <Text size="xs" fw={700} style={{ color: SEMAFORO_COLOR[ind.semaforo] }} lh={1.2}>{ind.codigo}</Text>
                              <Text size="xs" c="dimmed" lh={1.3} lineClamp={2}>{ind.nombre}</Text>
                            </Box>
                          </Group>
                        ))}
                      </Stack>
                    </>
                  );
                })()}
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 8 }}>
              <Paper withBorder radius="xl" p="md" h="100%"
                style={{ display: "flex", flexDirection: "column" }}>
                <Text size="sm" fw={700} mb={2}>Indicadores vs Meta</Text>
                <Text size="xs" c="dimmed" mb="sm">Avance acumulado frente a la meta final de cada indicador</Text>
                {indsDelAccion.length === 0 ? (
                  <Center style={{ flex: 1 }}><Text size="xs" c="dimmed">Sin indicadores</Text></Center>
                ) : (() => {
                  const data = indsDelAccion.map((ind) => ({
                    codigo:   ind.codigo,
                    meta:     Math.max(toNumberValue(ind.meta_final_2029) ?? 0, 0),
                    avance:   Math.max(toNumberValue(ind.avance_total_real ?? ind.avance) ?? 0, 0),
                    semaforo: ind.semaforo,
                  }));
                  return (
                    <>
                      <Box style={{ flex: 1, minHeight: Math.max(200, data.length * 60) }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart layout="vertical" data={data}
                            margin={{ top: 8, right: 50, left: 10, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                            <XAxis type="number" tick={{ fontSize: 12 }} />
                            <YAxis type="category" dataKey="codigo" tick={{ fontSize: 12, fontWeight: 600 }} width={90} />
                            <ReTooltip />
                            <Bar dataKey="meta"   name="Meta"   fill="#dee2e6" radius={[0, 4, 4, 0]} barSize={18} />
                            <Bar dataKey="avance" name="Avance" fill={PURPLE}  radius={[0, 4, 4, 0]} barSize={18}>
                              <LabelList dataKey="avance" position="right"
                                style={{ fontSize: 12, fontWeight: 700, fill: "#555" }}
                                formatter={(v: any) => v > 0 ? v.toLocaleString("es-CO", { maximumFractionDigits: 1 }) : ""} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </Box>
                      <Group gap={14} justify="center" mt={8}>
                        <Group gap={4}>
                          <Box w={12} h={12} style={{ background: PURPLE, borderRadius: 2 }} />
                          <Text size="sm" fw={600}>Avance</Text>
                        </Group>
                        <Group gap={4}>
                          <Box w={12} h={12} style={{ background: "#dee2e6", borderRadius: 2 }} />
                          <Text size="sm" fw={600}>Meta</Text>
                        </Group>
                      </Group>
                    </>
                  );
                })()}
              </Paper>
            </Grid.Col>
          </Grid>
        </>
      )}

    </Stack>
  );

  return (
    <>
      {mainContent}

      <Modal
        opened={modalSinReporte}
        onClose={() => setModalSinReporte(false)}
        title={
          <Group gap="xs">
            <ThemeIcon size={28} radius="xl" color="orange" variant="light">
              <IconBulb size={16} />
            </ThemeIcon>
            <Text fw={700} size="sm">
              Indicadores sin reporte — {periodoActual}
            </Text>
          </Group>
        }
        size="lg"
        radius="lg"
      >
        {indicadoresSinReporte.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            Todos los indicadores han sido reportados.
          </Text>
        ) : (
          <>
            <Text size="xs" c="dimmed" mb="sm">
              {indicadoresSinReporte.length} indicador{indicadoresSinReporte.length !== 1 ? "es" : ""} pendiente{indicadoresSinReporte.length !== 1 ? "s" : ""} de reporte en el período <strong>{periodoActual}</strong>
            </Text>
            <ScrollArea h={420} offsetScrollbars>
              <List spacing={6} size="sm" icon={
                <Box w={8} h={8} mt={5} style={{ borderRadius: "50%", background: "#fd7e14", flexShrink: 0 }} />
              }>
                {indicadoresSinReporte.map((ind) => (
                  <List.Item key={ind._id}>
                    <Group gap={6} wrap="nowrap" align="flex-start">
                      <Box style={{ minWidth: 0 }}>
                        <Text size="xs" fw={700} c="orange.7" lh={1.2}>{ind.codigo}</Text>
                        <Text size="xs" c="dimmed" lh={1.4}>{ind.nombre}</Text>
                      </Box>
                    </Group>
                  </List.Item>
                ))}
              </List>
            </ScrollArea>
          </>
        )}
      </Modal>
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "2px solid #e9ecef",
  fontWeight: 700,
  fontSize: 13,
  color: "#495057",
  background: "#f8f9fa",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f1f3f5",
  verticalAlign: "middle",
  fontSize: 13,
};

const tableScrollStyle: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid #f1f3f5",
  borderRadius: 8,
};
