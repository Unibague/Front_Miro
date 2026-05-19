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

const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

function fmtCOP(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
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
      <Text size="sm" fw={700} style={{ minWidth: 48, textAlign: "right" }}>{Math.round(Number(pct) || 0)}%</Text>
    </Group>
  );
}

export default function PdiGraficas() {
  const [pdiData, setPdiData] = useState<{
    macros: Macroproyecto[]; proyectos: Proyecto[]; acciones: Accion[]; indicadores: Indicador[];
  } | null>(null);
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);

  const [selectedMacro,    setSelectedMacro]    = useState<string | null>("todos");
  const [selectedProyecto, setSelectedProyecto] = useState<string | null>("todos");
  const [selectedAccion,   setSelectedAccion]   = useState<string | null>("todos");

  useEffect(() => {
    Promise.all([
      axios.get(PDI_ROUTES.dashboardResumen()),
      axios.get(PDI_ROUTES.macroproyectos()),
      axios.get(PDI_ROUTES.proyectos()),
      axios.get(PDI_ROUTES.acciones()),
      axios.get(PDI_ROUTES.indicadores()),
    ]).then(([rR, rM, rP, rA, rI]) => {
      setResumen(rR.data);
      setPdiData({ macros: rM.data, proyectos: rP.data, acciones: rA.data, indicadores: rI.data });
    }).catch(console.error);
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

  const reportesPendientes = useMemo(() => metricIndicators.filter((ind) => {
    const avance = toNumberValue(ind.avance_total_real ?? ind.avance) ?? 0;
    return avance === 0;
  }).length, [metricIndicators]);

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

  const indicadoresCriticosTop = useMemo(() => [...indsFiltradas]
    .filter((ind) => ind.semaforo === "rojo")
    .map((ind) => {
      const periodosOrdenados = [...(ind.periodos ?? [])]
        .filter((p) => p.avance !== null && p.avance !== "" && p.avance !== undefined)
        .sort((a, b) => a.periodo.localeCompare(b.periodo));
      const ultimoPeriodo = periodosOrdenados[periodosOrdenados.length - 1] ?? null;
      const meta = ind.meta_final_2029;
      const dato = ind.tipo_calculo === "ultimo_valor"
        ? ultimoPeriodo?.avance ?? null
        : periodosOrdenados.reduce((acc, p) => acc + (toNumberValue(p.avance) ?? 0), 0);
      const metaNum = toNumberValue(meta);
      const datoNum = toNumberValue(dato);
      const pct = metaNum && metaNum > 0 && datoNum !== null
        ? Math.round((datoNum / metaNum) * 100)
        : Math.round(toNumberValue(ind.avance_total_real ?? ind.avance) ?? 0);

      return {
        id: ind._id,
        codigo: ind.codigo,
        nombre: ind.nombre,
        meta,
        dato,
        pct,
        semaforo: ind.semaforo,
      };
    })
    .sort((a, b) => a.pct - b.pct || a.codigo.localeCompare(b.codigo))
    .slice(0, 5), [indsFiltradas]);

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

  // ── Datos Gasto/Inversión por nivel ──────────────────────────────────────
  const budgetExecChartData = useMemo(() => {
    if (accionActual) return [];

    if (proyectoActual) {
      return accionesFiltradas.map((a) => ({
        label: a.codigo,
        nombre: a.nombre,
        gasto: Number(a.gasto) || 0,
        inversion: Number(a.inversion) || 0,
        ejecutado: Number(a.presupuesto_ejecutado) || 0,
      }));
    }

    if (!verTodos) {
      return proysMacro.map((p) => {
        const accsP = accionesMacro.filter((a) => {
          const pid = typeof a.proyecto_id === "object" ? a.proyecto_id._id : a.proyecto_id;
          return pid === p._id;
        });
        return {
          label: p.codigo,
          nombre: p.nombre,
          gasto: accsP.reduce((s, a) => s + (Number(a.gasto) || 0), 0),
          inversion: accsP.reduce((s, a) => s + (Number(a.inversion) || 0), 0),
          ejecutado: Number(p.presupuesto_ejecutado) || 0,
        };
      });
    }

    const proyToMacro = new Map(proyectos.map((p) => [p._id, typeof p.macroproyecto_id === "object" ? p.macroproyecto_id._id : String(p.macroproyecto_id)]));
    return macros.map((m) => {
      const accsM = acciones.filter((a) => {
        const pid = typeof a.proyecto_id === "object" ? a.proyecto_id._id : String(a.proyecto_id);
        return proyToMacro.get(pid) === m._id;
      });
      return {
        label: m.codigo,
        nombre: m.nombre,
        gasto: accsM.reduce((s, a) => s + (Number(a.gasto) || 0), 0),
        inversion: accsM.reduce((s, a) => s + (Number(a.inversion) || 0), 0),
        ejecutado: Number(m.presupuesto_ejecutado) || 0,
      };
    });
  }, [accionActual, proyectoActual, verTodos, accionesFiltradas, proysMacro, accionesMacro, macros, acciones, proyectos]);

  const anyFilter = selectedProyecto !== "todos" || selectedAccion !== "todos";
  const limpiarFiltros = () => {
    setSelectedProyecto("todos"); setSelectedAccion("todos");
  };

  if (!pdiData) return <Center py="xl"><Loader color="blue" /></Center>;

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
                sub={`de ${metricIndicators.length} indicadores`}
                color="orange"
              />
            </SimpleGrid>
          </>
        );
      })()}

      {/* ── Gráfica Gasto / Inversión por nivel ──────────────────────── */}
      {budgetExecChartData.some((d) => d.gasto > 0 || d.inversion > 0) && (
        <Paper withBorder radius="xl" p="md">
          <Text size="md" fw={700} mb={2}>
            Causado presupuestal — Gasto vs Inversión por {
              proyectoActual ? "acción estratégica" : !verTodos ? "proyecto" : "macroproyecto"
            }
          </Text>
          <Text size="sm" c="dimmed" mb="sm">Monto causado clasificado por tipo</Text>
          <ResponsiveContainer width="100%" height={Math.max(220, budgetExecChartData.length * 38)}>
            <BarChart data={budgetExecChartData} margin={{ top: 10, right: 20, left: 10, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 700 }} interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(0)}M` : `$${v}`} />
              <ReTooltip
                formatter={(v: any, name: any) => [fmtCOP(Number(v)), name === "gasto" ? "Gasto" : name === "inversion" ? "Inversión" : "Causado"]}
                labelFormatter={(label: any) => label}
              />
              <Bar dataKey="gasto" name="gasto" fill={BLUE} radius={[4, 4, 0, 0]} barSize={20}>
                <LabelList dataKey="gasto" position="top" style={{ fontSize: 11, fill: BLUE, fontWeight: 700 }}
                  formatter={(v: any) => v > 0 ? `$${(v / 1_000_000).toFixed(0)}M` : ""} />
              </Bar>
              <Bar dataKey="inversion" name="inversion" fill={PURPLE} radius={[4, 4, 0, 0]} barSize={20}>
                <LabelList dataKey="inversion" position="top" style={{ fontSize: 11, fill: PURPLE, fontWeight: 700 }}
                  formatter={(v: any) => v > 0 ? `$${(v / 1_000_000).toFixed(0)}M` : ""} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <Group gap={16} justify="center" mt={4}>
            <Group gap={4}><Box w={10} h={10} style={{ background: BLUE, borderRadius: 2 }} /><Text size="sm" fw={600}>Gasto</Text></Group>
            <Group gap={4}><Box w={10} h={10} style={{ background: PURPLE, borderRadius: 2 }} /><Text size="sm" fw={600}>Inversión</Text></Group>
          </Group>
          {proyectoActual ? (
            <Stack gap={4} mt="sm">
              {budgetExecChartData.map((d, i) => (
                <Group key={d.label} gap={6} align="flex-start" wrap="nowrap">
                  <Box w={8} h={8} style={{ borderRadius: "50%", background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0, marginTop: 3 }} />
                  <Box style={{ minWidth: 0 }}>
                    <Text size="xs" fw={700} c="blue" lh={1.2}>{d.label}</Text>
                    <Text size="xs" c="dimmed" lh={1.3}>{d.nombre}</Text>
                  </Box>
                </Group>
              ))}
            </Stack>
          ) : (
            <Group gap="lg" mt="sm" wrap="wrap" justify="center">
              {budgetExecChartData.map((d, i) => (
                <Group key={d.label} gap={6} align="flex-start" wrap="nowrap" style={{ minWidth: 160 }}>
                  <Box w={8} h={8} style={{ borderRadius: "50%", background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0, marginTop: 3 }} />
                  <Box style={{ minWidth: 0 }}>
                    <Text size="xs" fw={700} c="blue" lh={1.2}>{d.label}</Text>
                    <Text size="xs" c="dimmed" lh={1.3}>{d.nombre}</Text>
                  </Box>
                </Group>
              ))}
            </Group>
          )}
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
                  <Text size="md" fw={700}>Top 5 indicadores críticos</Text>
                  <Text size="xs" c="red" fw={600}>
                    {indsFiltradas.filter((ind) => ind.semaforo === "rojo").length} indicadores críticos encontrados
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
                        Meta 2029
                      </th>
                      <th style={{ ...thStyle, textAlign: "right", width: 88 }}>Avance</th>
                      <th style={{ ...thStyle, width: 170 }}>% cumplimiento</th>
                      <th style={{ ...thStyle, textAlign: "center", width: 96 }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indicadoresCriticosTop.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#868e96", fontSize: 12 }}>
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
                            <Text size="sm" fw={700}>{fmtValue(row.meta)}</Text>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                            <Text size="sm" fw={600}>{fmtValue(row.dato)}</Text>
                          </td>
                          <td style={{ ...tdStyle, minWidth: 150 }}>
                            <PctBar pct={row.pct} semaforo={row.semaforo} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <Badge color={SEMAFORO_BADGE[row.semaforo] ?? "gray"} variant="filled" size="md">
                              {SEMAFORO_LABEL[row.semaforo] ?? row.semaforo}
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
                  El <b>% de cumplimiento</b> se calcula como el avance alcanzado dividido entre la meta definida para el indicador.
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

          {/* 6. Top 5 indicadores críticos del proyecto + Semaforización */}
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, md: 9 }}>
              <Paper withBorder radius="xl" p="md" h="100%">
                <Group justify="space-between" mb="sm" align="flex-start">
                  <Box>
                    <Text size="md" fw={700}>Top 5 indicadores críticos</Text>
                    <Text size="xs" c="red" fw={600}>
                      {indsFiltradas.filter((ind) => ind.semaforo === "rojo").length} indicadores críticos encontrados
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
                          Meta 2029
                        </th>
                        <th style={{ ...thStyle, textAlign: "right", width: 88 }}>Avance</th>
                        <th style={{ ...thStyle, width: 170 }}>% cumplimiento</th>
                        <th style={{ ...thStyle, textAlign: "center", width: 96 }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indicadoresCriticosTop.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#868e96", fontSize: 12 }}>
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
                              <Text size="sm" fw={700}>{fmtValue(row.meta)}</Text>
                            </td>
                            <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                              <Text size="sm" fw={600}>{fmtValue(row.dato)}</Text>
                            </td>
                            <td style={{ ...tdStyle, minWidth: 150 }}>
                              <PctBar pct={row.pct} semaforo={row.semaforo} />
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              <Badge color={SEMAFORO_BADGE[row.semaforo] ?? "gray"} variant="filled" size="md">
                                {SEMAFORO_LABEL[row.semaforo] ?? row.semaforo}
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
                    El <b>% de cumplimiento</b> se calcula como el avance alcanzado dividido entre la meta definida para el indicador.
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
