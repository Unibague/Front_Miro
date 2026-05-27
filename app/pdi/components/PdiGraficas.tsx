"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Stack, Text, Paper, Select, Group, Loader, Center, Box, Grid, ThemeIcon, Badge,
  ActionIcon, Progress, SimpleGrid, Divider,
} from "@mantine/core";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList, CartesianGrid,
  Tooltip as ReTooltip, PieChart, Pie, Cell,
} from "recharts";
import {
  IconX, IconCurrencyDollar, IconTrendingUp, IconTarget, IconBulb,
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

function semaforoFromPct(pct: number | null | undefined) {
  const value = Number(pct) || 0;
  if (value >= 90) return "verde";
  if (value >= 60) return "amarillo";
  return "rojo";
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

function StatCard({ title, value, sub, color = "blue", icon }: {
  title: string; value: React.ReactNode; sub?: string; color?: string; icon: React.ReactNode;
}) {
  return (
    <Paper withBorder radius="xl" p="md">
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

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampPercentage(value: number, total: number) {
  if (!total) return 0;
  return Math.min(Math.round((value / total) * 100), 100);
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

  const reportesPendientes = useMemo(
    () => indicadoresConMetaPeriodo.filter((ind) => !isReportadoEnPeriodo(ind, periodoActual)).length,
    [indicadoresConMetaPeriodo, periodoActual]
  );

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

  // ── Datos separados por entidad (meta vs avance absolutos) ────────────────
  const entidadesDataAnio = useMemo(() =>
    entities.map((entity) => {
      const indsEntity = indsScope.filter((i) => getEntityId(i._id) === entity._id);
      const data = aniosPdi.map((anio) => {
        let swA = 0, spA = 0, swM = 0, spM = 0;
        for (const ind of indsEntity) {
          const peso = Number(ind.peso) || 0; if (peso <= 0) continue;
          const pA = absAvanceHastaAnio(ind, anio);
          const pM = absMetaEnAnio(ind, anio);
          if (pA !== null) { swA += pA * peso; spA += peso; }
          if (pM !== null) { swM += pM * peso; spM += peso; }
        }
        return {
          anio,
          avance: spA > 0 ? Math.round((swA / spA) * 10) / 10 : 0,
          meta:   spM > 0 ? Math.round((swM / spM) * 10) / 10 : 0,
        };
      });
      return { entity, data };
    })
  , [aniosPdi, entities, indsScope, indToMacro, indToProyecto, verTodos]);

  const entidadesDataPeriodo = useMemo(() =>
    entities.map((entity) => {
      const indsEntity = indsScope.filter((i) => getEntityId(i._id) === entity._id);
      const data = periodosPdi.map((corte) => {
        let swA = 0, spA = 0, swM = 0, spM = 0;
        for (const ind of indsEntity) {
          const peso = Number(ind.peso) || 0; if (peso <= 0) continue;
          const pA = absAvanceHastaCorte(ind, corte);
          const pM = absMetaEnCorte(ind, corte);
          if (pA !== null) { swA += pA * peso; spA += peso; }
          if (pM !== null) { swM += pM * peso; spM += peso; }
        }
        return {
          corte: corte.slice(0, 7),
          avance: spA > 0 ? Math.round((swA / spA) * 10) / 10 : 0,
          meta:   spM > 0 ? Math.round((swM / spM) * 10) / 10 : 0,
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
      let spA = 0, spM = 0, swA = 0, swM = 0;
      for (const ind of indsDelProyecto) {
        const peso = Number(ind.peso) || 0; if (peso <= 0) continue;
        const pA = absAvanceHastaAnio(ind, anio);
        const pM = absMetaEnAnio(ind, anio);
        if (pA !== null) { swA += pA * peso; spA += peso; }
        if (pM !== null) { swM += pM * peso; spM += peso; }
      }
      return { anio, avance: spA > 0 ? Math.round((swA / spA) * 10) / 10 : 0, meta: spM > 0 ? Math.round((swM / spM) * 10) / 10 : 0 };
    })
  , [aniosProyecto, indsDelProyecto]);

  const accionesDataAnio = useMemo(() =>
    accionesFiltradas.map((a) => {
      const indsA = indsDelProyecto.filter((ind) => {
        const aid = ind.accion_id && typeof ind.accion_id === "object" ? ind.accion_id._id : String(ind.accion_id ?? "");
        return aid === a._id;
      });
      const data = aniosProyecto.map((anio) => {
        let swA = 0, spA = 0, swM = 0, spM = 0;
        for (const ind of indsA) {
          const peso = Number(ind.peso) || 0; if (peso <= 0) continue;
          const pA = absAvanceHastaAnio(ind, anio);
          const pM = absMetaEnAnio(ind, anio);
          if (pA !== null) { swA += pA * peso; spA += peso; }
          if (pM !== null) { swM += pM * peso; spM += peso; }
        }
        return {
          anio,
          avance: spA > 0 ? Math.round((swA / spA) * 10) / 10 : 0,
          meta:   spM > 0 ? Math.round((swM / spM) * 10) / 10 : 0,
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
        let swA = 0, spA = 0, swM = 0, spM = 0;
        for (const ind of indsA) {
          const peso = Number(ind.peso) || 0; if (peso <= 0) continue;
          const pA = absAvanceHastaCorte(ind, corte);
          const pM = absMetaEnCorte(ind, corte);
          if (pA !== null) { swA += pA * peso; spA += peso; }
          if (pM !== null) { swM += pM * peso; spM += peso; }
        }
        return {
          corte: corte.slice(0, 7),
          avance: spA > 0 ? Math.round((swA / spA) * 10) / 10 : 0,
          meta:   spM > 0 ? Math.round((swM / spM) * 10) / 10 : 0,
        };
      });
      return { accion: a, data };
    });
  }, [accionesFiltradas, indsDelProyecto]);

  const proyectoAvancePorPeriodo = useMemo(() => {
    const set = new Set<string>();
    for (const ind of indsDelProyecto) for (const p of ind.periodos ?? []) if (p.periodo) set.add(p.periodo);
    return Array.from(set).sort().map((corte) => {
      let spA = 0, spM = 0, swA = 0, swM = 0;
      for (const ind of indsDelProyecto) {
        const peso = Number(ind.peso) || 0; if (peso <= 0) continue;
        const pA = absAvanceHastaCorte(ind, corte);
        const pM = absMetaEnCorte(ind, corte);
        if (pA !== null) { swA += pA * peso; spA += peso; }
        if (pM !== null) { swM += pM * peso; spM += peso; }
      }
      return { corte: corte.slice(0, 7), avance: spA > 0 ? Math.round((swA / spA) * 10) / 10 : 0, meta: spM > 0 ? Math.round((swM / spM) * 10) / 10 : 0 };
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

  return (
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
          <ResponsiveContainer width="100%" height={Math.max(260, presupuestoChartData.length * 56)}>
            <BarChart data={presupuestoChartData} margin={{ top: 14, right: 24, left: 10, bottom: 8 }} barCategoryGap="28%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 700 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(0)}M` : `$${v}`} width={60} />
              <ReTooltip
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ pointerEvents: "none", zIndex: 30 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = presupuestoChartData.find(x => x.label === label);
                  if (!d) return null;
                  const pctOfBudget = (value: number) => d.presupuesto > 0
                    ? Math.min(Math.round((value / d.presupuesto) * 100), 100)
                    : 0;
                  const row = (title: string, g: number, inv: number, total: number, color: string, percentage = pctOfBudget(total)) => (
                    <Box key={title} py={5} style={{ borderTop: "1px solid #edf2f7" }}>
                      <Group justify="space-between" gap={10} wrap="nowrap">
                        <Text size="xs" fw={900} c={color}>{title}</Text>
                        <Text size="xs" fw={900}>{fmtCompactCOP(total)}</Text>
                      </Group>
                      <Group gap={8} wrap="nowrap" mt={2}>
                        <Text size="0.68rem" c="dimmed">G: <b style={{ color }}>{fmtCompactCOP(g)}</b></Text>
                        <Text size="0.68rem" c="dimmed">I: <b style={{ color }}>{fmtCompactCOP(inv)}</b></Text>
                        <Text size="0.68rem" c="dimmed"><b style={{ color }}>{percentage}%</b></Text>
                      </Group>
                    </Box>
                  );
                  return (
                    <Paper withBorder p="xs" radius="md" shadow="md" style={{ width: 300, maxWidth: "calc(100vw - 32px)" }}>
                      <Text size="xs" fw={900} lh={1.2}>{label}</Text>
                      <Text size="0.68rem" c="dimmed" mb={4} lineClamp={2}>{d.nombre}</Text>
                      {row("Presupuesto", d.presupuestoGasto, d.presupuestoInversion, d.presupuesto, "#868e96", d.presupuesto > 0 ? 100 : 0)}
                      {row("Comprometido", d.comprometidoGasto, d.comprometidoInversion, d.comprometido, BLUE)}
                      {row("Causado", d.causadoGasto, d.causadoInversion, d.causado, TEAL)}
                    </Paper>
                  );
                }}
              />
              {/* Presupuesto — gasto + inversión apilados (etiqueta en el tope) */}
              <Bar dataKey="presupuestoGasto" name="Pres. Gasto" stackId="pres" fill="#adb5bd" barSize={22} />
              <Bar dataKey="presupuestoInversion" name="Pres. Inversión" stackId="pres" fill="#dee2e6" radius={[4, 4, 0, 0]} barSize={22}>
                <LabelList dataKey="presupuesto" position="top" style={{ fontSize: 10, fill: "#868e96", fontWeight: 700 }}
                  formatter={(v: any) => v > 0 ? `$${(Number(v) / 1_000_000).toFixed(0)}M` : ""} />
              </Bar>
              {/* Comprometido — gasto + inversión apilados */}
              <Bar dataKey="comprometidoGasto" name="Comp. Gasto" stackId="comp" fill={BLUE} barSize={22} />
              <Bar dataKey="comprometidoInversion" name="Comp. Inversión" stackId="comp" fill="#74c0fc" radius={[4, 4, 0, 0]} barSize={22}>
                <LabelList dataKey="comprometido" position="top" style={{ fontSize: 10, fill: BLUE, fontWeight: 700 }}
                  formatter={(v: any) => v > 0 ? `$${(Number(v) / 1_000_000).toFixed(0)}M` : ""} />
              </Bar>
              {/* Causado — gasto + inversión apilados */}
              <Bar dataKey="causadoGasto" name="Caus. Gasto" stackId="caus" fill={TEAL} barSize={22} />
              <Bar dataKey="causadoInversion" name="Caus. Inversión" stackId="caus" fill="#63e6be" radius={[4, 4, 0, 0]} barSize={22}>
                <LabelList dataKey="causadoPct" position="top" style={{ fontSize: 10, fill: TEAL, fontWeight: 700 }}
                  formatter={(v: any) => Number(v) > 0 ? `${Number(v)}%` : ""} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Leyenda */}
          <Group gap={20} justify="center" mt="sm" wrap="wrap">
            <Group gap={4}>
              <Box w={10} h={10} style={{ background: "#adb5bd", borderRadius: 2 }} />
              <Box w={10} h={10} style={{ background: "#dee2e6", borderRadius: 2 }} />
              <Text size="xs" fw={600} c="dimmed">Presupuesto (Gasto / Inv)</Text>
            </Group>
            <Group gap={4}>
              <Box w={10} h={10} style={{ background: BLUE, borderRadius: 2 }} />
              <Box w={10} h={10} style={{ background: "#74c0fc", borderRadius: 2 }} />
              <Text size="xs" fw={600}>Comprometido (Gasto / Inv)</Text>
            </Group>
            <Group gap={4}>
              <Box w={10} h={10} style={{ background: TEAL, borderRadius: 2 }} />
              <Box w={10} h={10} style={{ background: "#63e6be", borderRadius: 2 }} />
              <Text size="xs" fw={600} c="teal">Causado (Gasto / Inv)</Text>
            </Group>
          </Group>

          {/* Elementos del gráfico */}
          <Group gap="lg" mt="sm" wrap="wrap" justify="center">
            {presupuestoChartData.map((d, i) => (
              <Group key={d.label} gap={6} align="flex-start" wrap="nowrap" style={{ minWidth: 160 }}>
                <Box w={8} h={8} style={{ borderRadius: "50%", background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0, marginTop: 3 }} />
                <Box style={{ minWidth: 0 }}>
                  <Text size="xs" fw={700} c="blue" lh={1.2}>{d.label}</Text>
                  <Text size="xs" c="dimmed" lh={1.3}>{d.nombre}</Text>
                </Box>
              </Group>
            ))}
          </Group>
            </Box>{/* fin columna derecha */}
          </Box>{/* fin flex container */}
        </Paper>
      )}

      {/* ── Gráficas separadas por entidad (macro o proyecto) ────────── */}
      {!proyectoActual && (
        <Stack gap="md">
          {entidadesDataAnio.map(({ entity, data }, i) => {
            const dataPeriodo = entidadesDataPeriodo[i]?.data ?? [];
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const hasAnio    = data.some((d) => d.meta > 0 || d.avance > 0);
            const hasPeriodo = dataPeriodo.some((d) => d.meta > 0 || d.avance > 0);
            return (
              <Paper key={entity._id} withBorder radius="xl" p="md">
                <Group gap={10} mb="xs" align="center" wrap="nowrap">
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
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Text size="sm" fw={700} mb={4}>Meta vs Avance por Año</Text>
                    {!hasAnio ? (
                      <Center h={160}><Text size="xs" c="dimmed">Sin datos por año</Text></Center>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={data} margin={{ top: 18, right: 8, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                          <XAxis dataKey="anio" tick={{ fontSize: 13, fontWeight: 600 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <ReTooltip formatter={(v: any, name: any) => [v.toLocaleString("es-CO"), name === "meta" ? "Meta" : "Avance"]} />
                          <Bar dataKey="meta" name="meta" fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1} radius={[4, 4, 0, 0]} barSize={22} />
                          <Bar dataKey="avance" name="avance" fill={color} radius={[4, 4, 0, 0]} barSize={22}>
                            <LabelList dataKey="avance" position="top"
                              style={{ fontSize: 12, fontWeight: 700, fill: "#555" }}
                              formatter={(v: any) => v > 0 ? v.toLocaleString("es-CO") : ""} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <Text size="sm" fw={700} mb={4}>Meta vs Avance por Periodo</Text>
                    {!hasPeriodo ? (
                      <Center h={160}><Text size="xs" c="dimmed">Sin datos por periodo</Text></Center>
                    ) : (
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={dataPeriodo} margin={{ top: 18, right: 8, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                          <XAxis dataKey="corte" tick={{ fontSize: 11, fontWeight: 600 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <ReTooltip formatter={(v: any, name: any) => [v.toLocaleString("es-CO"), name === "meta" ? "Meta" : "Avance"]} />
                          <Bar dataKey="meta" name="meta" fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1} radius={[4, 4, 0, 0]} barSize={16} />
                          <Bar dataKey="avance" name="avance" fill={color} radius={[4, 4, 0, 0]} barSize={16}>
                            <LabelList dataKey="avance" position="top"
                              style={{ fontSize: 11, fontWeight: 700, fill: "#555" }}
                              formatter={(v: any) => v > 0 ? v.toLocaleString("es-CO") : ""} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </Grid.Col>
                </Grid>
              </Paper>
            );
          })}
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
                <Text size="sm" fw={700} mb={2}>Meta vs Avance del Proyecto por Año</Text>
                {proyectoAvancePorAnio.length === 0 ? (
                  <Center h={180}><Text size="xs" c="dimmed">Sin datos por año</Text></Center>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={proyectoAvancePorAnio} margin={{ top: 18, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                      <XAxis dataKey="anio" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <ReTooltip formatter={(v: any, name: any) => [v.toLocaleString("es-CO"), name === "meta" ? "Meta" : "Avance"]} />
                      <Bar dataKey="meta" name="meta" fill={PURPLE} fillOpacity={0.2} stroke={PURPLE} strokeWidth={1} radius={[4, 4, 0, 0]} barSize={22} />
                      <Bar dataKey="avance" name="avance" fill={PURPLE} radius={[4, 4, 0, 0]} barSize={22}>
                        <LabelList dataKey="avance" position="top"
                          style={{ fontSize: 10, fontWeight: 700, fill: "#555" }}
                          formatter={(v: any) => v > 0 ? v.toLocaleString("es-CO") : ""} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Paper>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Paper withBorder radius="xl" p="md" h="100%">
                <Text size="sm" fw={700} mb={2}>Meta vs Avance del Proyecto por Periodo</Text>
                {proyectoAvancePorPeriodo.length === 0 ? (
                  <Center h={180}><Text size="xs" c="dimmed">Sin datos por periodo</Text></Center>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={proyectoAvancePorPeriodo} margin={{ top: 18, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                      <XAxis dataKey="corte" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <ReTooltip formatter={(v: any, name: any) => [v.toLocaleString("es-CO"), name === "meta" ? "Meta" : "Avance"]} />
                      <Bar dataKey="meta" name="meta" fill={BLUE} fillOpacity={0.2} stroke={BLUE} strokeWidth={1} radius={[4, 4, 0, 0]} barSize={16} />
                      <Bar dataKey="avance" name="avance" fill={BLUE} radius={[4, 4, 0, 0]} barSize={16}>
                        <LabelList dataKey="avance" position="top"
                          style={{ fontSize: 9, fontWeight: 700, fill: "#555" }}
                          formatter={(v: any) => v > 0 ? v.toLocaleString("es-CO") : ""} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
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
                      <Box mt={12}>
                        <Group justify="space-between" mb={6}>
                          <Text size="sm" c="dimmed" fw={600}>Avance</Text>
                          <Text size="xl" fw={900} lh={1} style={{ color: hex }}>{av}%</Text>
                        </Group>
                        <Box style={{ height: 10, borderRadius: 99, background: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                          <Box style={{ height: "100%", width: `${av}%`, background: hex, borderRadius: 99, transition: "width .4s" }} />
                        </Box>
                      </Box>
                    </Paper>
                  );
                })}
              </SimpleGrid>
            )}
          </Paper>

          {/* 5. Avance de acciones — gráficas separadas por acción */}
          <Stack gap="md">
            {accionesDataAnio.map(({ accion, data }, i) => {
              const dataPeriodo = accionesDataPeriodo[i]?.data ?? [];
              const color = CHART_COLORS[i % CHART_COLORS.length];
              const hasAnio    = data.some((d) => d.meta > 0 || d.avance > 0);
              const hasPeriodo = dataPeriodo.some((d) => d.meta > 0 || d.avance > 0);
              return (
                <Paper key={accion._id} withBorder radius="xl" p="md">
                  <Group gap={10} mb="sm" align="center" wrap="nowrap">
                    <Box w={12} h={12} style={{ borderRadius: 3, background: color, flexShrink: 0 }} />
                    <Box style={{ minWidth: 0, flex: 1 }}>
                      <Text size="sm" fw={800}>{accion.codigo}</Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>{accion.nombre}</Text>
                    </Box>
                  </Group>
                  <Grid gutter="sm">
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <Text size="sm" fw={700} mb={4}>Meta vs Avance por Año</Text>
                      {!hasAnio ? (
                        <Center h={160}><Text size="xs" c="dimmed">Sin datos por año</Text></Center>
                      ) : (
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={data} margin={{ top: 18, right: 8, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                            <XAxis dataKey="anio" tick={{ fontSize: 13, fontWeight: 600 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <ReTooltip formatter={(v: any, name: any) => [v.toLocaleString("es-CO"), name === "meta" ? "Meta" : "Avance"]} />
                            <Bar dataKey="meta" name="meta" fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1} radius={[4, 4, 0, 0]} barSize={22} />
                            <Bar dataKey="avance" name="avance" fill={color} radius={[4, 4, 0, 0]} barSize={22}>
                              <LabelList dataKey="avance" position="top"
                                style={{ fontSize: 12, fontWeight: 700, fill: "#555" }}
                                formatter={(v: any) => v > 0 ? v.toLocaleString("es-CO") : ""} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                      <Text size="sm" fw={700} mb={4}>Meta vs Avance por Periodo</Text>
                      {!hasPeriodo ? (
                        <Center h={160}><Text size="xs" c="dimmed">Sin datos por periodo</Text></Center>
                      ) : (
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={dataPeriodo} margin={{ top: 18, right: 8, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                            <XAxis dataKey="corte" tick={{ fontSize: 11, fontWeight: 600 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <ReTooltip formatter={(v: any, name: any) => [v.toLocaleString("es-CO"), name === "meta" ? "Meta" : "Avance"]} />
                            <Bar dataKey="meta" name="meta" fill={color} fillOpacity={0.2} stroke={color} strokeWidth={1} radius={[4, 4, 0, 0]} barSize={16} />
                            <Bar dataKey="avance" name="avance" fill={color} radius={[4, 4, 0, 0]} barSize={16}>
                              <LabelList dataKey="avance" position="top"
                                style={{ fontSize: 11, fontWeight: 700, fill: "#555" }}
                                formatter={(v: any) => v > 0 ? v.toLocaleString("es-CO") : ""} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </Grid.Col>
                  </Grid>
                </Paper>
              );
            })}
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
