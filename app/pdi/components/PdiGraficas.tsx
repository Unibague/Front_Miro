"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Stack, Text, Paper, Select, Group, Loader, Center, Box, Grid, Badge, ThemeIcon,
  ActionIcon, Divider,
} from "@mantine/core";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";
import {
  IconTarget, IconChartBar, IconUsers, IconAlertCircle, IconBell,
  IconFile, IconX, IconInfoCircle, IconBuilding, IconBriefcase, IconListCheck,
} from "@tabler/icons-react";
import axios from "axios";
import { PDI_ROUTES } from "../api";
import type {
  Macroproyecto, Proyecto, Accion, Indicador,
  DashboardResumen, DashboardMacroproyecto,
} from "../types";

// ── Color palette (MIRO blue / PDI) ───────────────────────────────────────
const BLUE   = "#228be6";
const GREEN  = "#40c057";
const YELLOW = "#fab005";
const RED    = "#fa5252";
const ORANGE = "#fd7e14";

const SEMAFORO_COLOR: Record<string, string> = { verde: GREEN, amarillo: YELLOW, rojo: RED };
const SEMAFORO_LABEL: Record<string, string> = { verde: "En cumplimiento", amarillo: "En riesgo", rojo: "Crítico" };
const SEMAFORO_BADGE: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };

const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

// ── Donut gauge (full-circle SVG) ─────────────────────────────────────────
function DonutGauge({ value, size = 160, color = BLUE }: { value: number; size?: number; color?: string }) {
  const r    = size * 0.37;
  const cx   = size / 2;
  const cy   = size / 2;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(100, Math.max(0, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block", margin: "0 auto" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e9ecef" strokeWidth={size * 0.115} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none" stroke={color}
        strokeWidth={size * 0.115}
        strokeDasharray={circ}
        strokeDashoffset={circ - (pct / 100) * circ}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.7s ease" }}
      />
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={size * 0.18} fontWeight="bold" fill="#222">
        {value.toFixed(0)}%
      </text>
      <text x={cx} y={cy + size * 0.1} textAnchor="middle" fontSize={size * 0.07} fill="#888">
        Cumplimiento
      </text>
    </svg>
  );
}

// ── Blue KPI card (top row) ────────────────────────────────────────────────
function KpiCard({
  icon, value, label, sub, color = "blue",
}: { icon: React.ReactNode; value: string | number; label: string; sub?: string; color?: string }) {
  return (
    <Paper withBorder radius="xl" p="md" style={{ flex: 1, minWidth: 130 }}>
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon size={44} radius="md" color={color} variant="light">{icon}</ThemeIcon>
        <Box>
          <Text fw={900} size="xl" lh={1.1}>{value}</Text>
          <Text size="xs" fw={600} mt={2}>{label}</Text>
          {sub && <Text size="xs" c="dimmed">{sub}</Text>}
        </Box>
      </Group>
    </Paper>
  );
}

// ── Alert card (second row) ────────────────────────────────────────────────
function AlertCard({
  icon, value, label, sub, borderColor,
}: { icon: React.ReactNode; value: number; label: string; sub: string; borderColor: string }) {
  return (
    <Paper withBorder radius="xl" p="md" style={{ flex: 1, minWidth: 130, borderLeft: `4px solid ${borderColor}` }}>
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <ThemeIcon size={38} radius="md" style={{ background: `${borderColor}22`, color: borderColor }} variant="transparent">
          {icon}
        </ThemeIcon>
        <Box>
          <Text fw={900} size="xl" lh={1.1} c={borderColor}>{value}</Text>
          <Text size="xs" fw={700} mt={2}>{label}</Text>
          <Text size="xs" c="dimmed">{sub}</Text>
        </Box>
      </Group>
    </Paper>
  );
}

// ── Progress bar for the table ─────────────────────────────────────────────
function PctBar({ pct, semaforo }: { pct: number; semaforo: string }) {
  const color = SEMAFORO_COLOR[semaforo] ?? BLUE;
  return (
    <Group gap={8} wrap="nowrap" align="center">
      <Box style={{ flex: 1, height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
        <Box style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s" }} />
      </Box>
      <Text size="xs" fw={700} style={{ minWidth: 42, textAlign: "right" }}>{pct.toFixed(0)}%</Text>
    </Group>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
function EstadoIndicadoresTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <Paper withBorder shadow="sm" radius="sm" px={8} py={6} style={{ minWidth: 130 }}>
      <Text size="xs" fw={700} mb={4}>{label}</Text>
      <Stack gap={2}>
        {payload.map((item: any) => (
          <Group key={item.dataKey} gap={6} justify="space-between" wrap="nowrap">
            <Group gap={5} wrap="nowrap">
              <Box w={7} h={7} style={{ borderRadius: 2, background: item.color, flexShrink: 0 }} />
              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{item.name}</Text>
            </Group>
            <Text size="xs" fw={700}>{item.value}</Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

function EstadoLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <Group gap={5} wrap="nowrap">
      <Box w={8} h={8} style={{ borderRadius: 2, background: color, flexShrink: 0 }} />
      <Text size="xs" c="dimmed" lh={1}>{label}</Text>
    </Group>
  );
}

export default function PdiGraficas() {
  const [pdiData, setPdiData] = useState<{
    macros: Macroproyecto[];
    proyectos: Proyecto[];
    acciones: Accion[];
    indicadores: Indicador[];
  } | null>(null);
  const [resumen, setResumen]               = useState<DashboardResumen | null>(null);
  const [dashboardMacro, setDashboardMacro] = useState<DashboardMacroproyecto | null>(null);

  const [selectedMacro,    setSelectedMacro]    = useState<string | null>("todos");
  const [selectedProyecto, setSelectedProyecto] = useState<string | null>("todos");
  const [selectedAccion,   setSelectedAccion]   = useState<string | null>("todos");
  const [selectedCorte,    setSelectedCorte]    = useState<string | null>("todos");
  const [selectedEstado,   setSelectedEstado]   = useState<string | null>("todos");

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

  useEffect(() => {
    if (!selectedMacro || selectedMacro === "todos") { setDashboardMacro(null); return; }
    axios.get(PDI_ROUTES.dashboardMacroproyecto(selectedMacro)).then((r) => setDashboardMacro(r.data)).catch(console.error);
  }, [selectedMacro]);

  useEffect(() => { setSelectedProyecto("todos"); setSelectedAccion("todos"); }, [selectedMacro]);
  useEffect(() => { setSelectedAccion("todos"); }, [selectedProyecto]);

  const macros      = pdiData?.macros      ?? [];
  const proyectos   = pdiData?.proyectos   ?? [];
  const acciones    = pdiData?.acciones    ?? [];
  const indicadores = pdiData?.indicadores ?? [];
  const verTodos    = selectedMacro === "todos";

  // ── Collections filtered by macro ─────────────────────────────────────
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

  // ── Additional filters ─────────────────────────────────────────────────
  const accionesFiltradas = useMemo(() => accionesMacro.filter((a) => {
    if (selectedProyecto && selectedProyecto !== "todos") {
      const pid = typeof a.proyecto_id === "object" ? a.proyecto_id._id : a.proyecto_id;
      return pid === selectedProyecto;
    }
    return true;
  }), [accionesMacro, selectedProyecto]);

  const accionesFiltIds = useMemo(() => new Set(accionesFiltradas.map((a) => a._id)), [accionesFiltradas]);

  const indsFiltradas = useMemo(() => indsMacroAll.filter((i) => {
    const aid = i.accion_id && typeof i.accion_id === "object" ? i.accion_id._id : String(i.accion_id ?? "");
    if (!accionesFiltIds.has(aid)) return false;
    if (selectedAccion && selectedAccion !== "todos" && aid !== selectedAccion) return false;
    if (selectedEstado && selectedEstado !== "todos" && i.semaforo !== selectedEstado) return false;
    return true;
  }), [indsMacroAll, accionesFiltIds, selectedAccion, selectedEstado]);

  // ── Derived values ─────────────────────────────────────────────────────
  const macroActual = verTodos ? null : macros.find((m) => m._id === selectedMacro) ?? null;

  const avanceGlobal = verTodos
    ? (resumen?.avance_global ?? 0)
    : (dashboardMacro?.macroproyecto.avance ?? macroActual?.avance ?? 0);

  const gaugeColor = avanceGlobal >= 90 ? GREEN : avanceGlobal >= 70 ? YELLOW : RED;

  const indicadoresCriticos  = indsMacroAll.filter((i) => i.semaforo === "rojo").length;
  const indicadoresConAlerta = resumen?.alertas?.indicadores_con_alertas ?? 0;
  const enSeguimiento = indsMacroAll.filter((i) => i.semaforo === "amarillo").length;
  const conRetrasos   = resumen?.retrasos?.indicadores_con_retrasos ?? 0;

  // ── Cortes/periods ─────────────────────────────────────────────────────
  const allCortes = useMemo(() => {
    const set = new Set<string>();
    for (const ind of indsMacroAll) for (const p of ind.periodos ?? []) if (p.periodo) set.add(p.periodo);
    return Array.from(set).sort();
  }, [indsMacroAll]);

  // ── Cumplimiento por corte (line chart) ───────────────────────────────
  const cumplimientoPorCorte = useMemo(() => allCortes.map((corte) => {
    const values: number[] = [];
    for (const ind of indsMacroAll) {
      const p = ind.periodos.find((pp) => pp.periodo === corte);
      if (p && p.meta && Number(p.meta) > 0 && p.avance !== null && p.avance !== "")
        values.push(Math.min((Number(p.avance) / Number(p.meta)) * 100, 200));
    }
    return { corte: corte.slice(0, 14), avance: values.length ? Math.round(avg(values) * 100) / 100 : 0 };
  }), [allCortes, indsMacroAll]);

  // ── Estado por corte (stacked bar) ───────────────────────────────────
  const estadoPorCorte = useMemo(() => allCortes.map((corte) => {
    let verde = 0, amarillo = 0, rojo = 0;
    for (const ind of indsMacroAll) {
      if (ind.periodos.some((p) => p.periodo === corte)) {
        if (ind.semaforo === "verde") verde++;
        else if (ind.semaforo === "amarillo") amarillo++;
        else if (ind.semaforo === "rojo") rojo++;
      }
    }
    return { corte: corte.slice(0, 14), verde, amarillo, rojo };
  }), [allCortes, indsMacroAll]);

  // ── Cumplimiento por proyecto (horizontal bar) ────────────────────────
  const cumplimientoPorProyecto = verTodos
    ? macros.map((m) => ({
        id: m._id,
        name: m.codigo,
        fullName: m.nombre,
        avance: m.avance,
        fill: SEMAFORO_COLOR[m.semaforo] ?? BLUE,
      }))
    : (dashboardMacro?.proyectos ?? proysMacro).map((p) => ({
        id: p._id,
        name: p.codigo,
        fullName: p.nombre,
        avance: p.avance,
        fill: SEMAFORO_COLOR[p.semaforo] ?? BLUE,
      }));

  // ── Priority indicators (sorted by criticality) ───────────────────────
  const indicadoresPrioritarios = useMemo(() => {
    const order: Record<string, number> = { rojo: 0, amarillo: 1, verde: 2 };
    return [...indsFiltradas]
      .sort((a, b) => (order[a.semaforo] ?? 3) - (order[b.semaforo] ?? 3) || a.avance - b.avance)
      .map((ind) => {
        const lastP   = [...ind.periodos].reverse().find((p) => p.meta !== null && p.meta !== "" && p.avance !== null && p.avance !== "");
        const metaVal = lastP ? Number(lastP.meta)   : null;
        const datoVal = lastP ? Number(lastP.avance) : null;
        const pct     = metaVal && metaVal > 0 && datoVal !== null
          ? Math.round((datoVal / metaVal) * 100)
          : ind.avance;
        return { id: ind._id, codigo: ind.codigo, nombre: ind.nombre, meta: metaVal, dato: datoVal, pct, semaforo: ind.semaforo };
      });
  }, [indsFiltradas]);

  const anyFilter = selectedProyecto !== "todos" || selectedAccion !== "todos" || selectedCorte !== "todos" || selectedEstado !== "todos";

  const limpiarFiltros = () => {
    setSelectedProyecto("todos");
    setSelectedAccion("todos");
    setSelectedCorte("todos");
    setSelectedEstado("todos");
  };

  if (!pdiData) return <Center py="xl"><Loader color="blue" /></Center>;

  return (
    <Stack gap="md">

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <Paper withBorder radius="lg" shadow="xs" px="md" py="sm">
        <Group gap="sm" align="flex-end" wrap="nowrap">
          <Select
            label="Macroproyecto"
            size="xs"
            style={{ flex: 2 }}
            data={[{ value: "todos", label: "Todos" }, ...macros.map((m) => ({ value: m._id, label: m.codigo || m.nombre }))]            }
            value={selectedMacro}
            onChange={setSelectedMacro}
          />
          <Select
            label="Proyecto"
            size="xs"
            style={{ flex: 2 }}
            disabled={verTodos}
            data={[{ value: "todos", label: "Todos" }, ...proysMacro.map((p) => ({ value: p._id, label: `${p.codigo} ${p.nombre}`.slice(0, 50) }))]}
            value={selectedProyecto}
            onChange={setSelectedProyecto}
          />
          <Select
            label="Acción estratégica"
            size="xs"
            style={{ flex: 2 }}
            disabled={verTodos || selectedProyecto === "todos"}
            data={[{ value: "todos", label: "Todas" }, ...accionesFiltradas.map((a) => ({ value: a._id, label: `${a.codigo} ${a.nombre}`.slice(0, 50) }))]}
            value={selectedAccion}
            onChange={setSelectedAccion}
          />
          <Select
            label="Periodo"
            size="xs"
            style={{ flex: 1.5 }}
            data={[{ value: "todos", label: "Todos" }, ...allCortes.map((c) => ({ value: c, label: c }))]}
            value={selectedCorte}
            onChange={setSelectedCorte}
          />
          <Select
            label="Estado"
            size="xs"
            style={{ flex: 1.5 }}
            data={[
              { value: "todos", label: "Todos" },
              { value: "verde", label: "En cumplimiento" },
              { value: "amarillo", label: "En riesgo" },
              { value: "rojo", label: "Crítico" },
            ]}
            value={selectedEstado}
            onChange={setSelectedEstado}
          />
          {anyFilter && (
            <ActionIcon
              variant="light"
              color="gray"
              size="lg"
              mb={1}
              onClick={limpiarFiltros}
              title="Limpiar filtros"
            >
              <IconX size={13} />
            </ActionIcon>
          )}
        </Group>
        {macroActual && (
          <Group gap={6} mt="xs">
            <Box w={6} h={6} style={{ borderRadius: "50%", background: BLUE, flexShrink: 0 }} />
            <Text size="xs" c="dimmed">
              Macroproyecto activo:{" "}
              <Text span fw={700} c="blue">{macroActual.nombre}</Text>
            </Text>
          </Group>
        )}
      </Paper>

      {/* ── KPI Cards — row 1 ───────────────────────────────────────────── */}
      <Group gap="sm" grow>
        <KpiCard icon={<IconBuilding size={20} />}
          value={macroActual?.codigo ?? macros.length}
          label={macroActual ? macroActual.nombre.slice(0, 28) : "Macroproyectos"}
          color="blue" />
        <KpiCard icon={<IconBriefcase size={20} />}
          value={proysMacro.length}
          label="Proyectos"
          sub={`${proysMacro.filter((p) => p.semaforo === "verde").length} en cumplimiento`}
          color="blue" />
        <KpiCard icon={<IconListCheck size={20} />}
          value={accionesMacro.length}
          label="Acciones estratégicas"
          sub={`${accionesMacro.filter((a) => a.semaforo === "verde").length} al día`}
          color="blue" />
        <KpiCard icon={<IconTarget size={20} />}
          value={indsMacroAll.length}
          label="Indicadores"
          sub={`${indsMacroAll.filter((i) => i.semaforo === "verde").length} al día`}
          color="blue" />
      </Group>

      {/* ── Alert Cards — row 2 ─────────────────────────────────────────── */}
      <Group gap="sm" grow>
        <AlertCard icon={<IconAlertCircle size={20} />}
          value={indicadoresCriticos}
          label="Indicadores críticos"
          sub="Requieren atención inmediata"
          borderColor={RED} />
        <AlertCard icon={<IconBell size={20} />}
          value={indicadoresConAlerta}
          label="Reportes pendientes"
          sub="Sin reporte enviado"
          borderColor={ORANGE} />
        <AlertCard icon={<IconFile size={20} />}
          value={enSeguimiento}
          label="En seguimiento"
          sub="Indicadores en riesgo (amarillo)"
          borderColor={YELLOW} />
        <AlertCard icon={<IconUsers size={20} />}
          value={conRetrasos}
          label="Con retrasos"
          sub="Sin avance en el corte actual"
          borderColor="#adb5bd" />
      </Group>

      {/* ── Main chart area (3 columns) ──────────────────────────────────── */}
      <Grid gutter="sm">

        {/* Large donut gauge */}
        <Grid.Col span={{ base: 12, sm: 4, md: 3 }}>
          <Paper withBorder radius="xl" p="lg" h="100%"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <Text size="sm" fw={700} mb="sm" ta="center">Porcentaje de cumplimiento</Text>
            <DonutGauge value={avanceGlobal} size={170} color={gaugeColor} />
            <Text size="xs" c="dimmed" ta="center" mt="sm">
              Avance promedio {macroActual ? "del macroproyecto" : "global"}
            </Text>
          </Paper>
        </Grid.Col>

        {/* Cumplimiento por proyecto — horizontal bars */}
        <Grid.Col span={{ base: 12, sm: 8, md: 4 }}>
          <Paper withBorder radius="xl" p="md" h="100%">
            <Text size="sm" fw={700} mb="sm">{verTodos ? "Cumplimiento por macroproyecto" : "Cumplimiento por proyecto"}</Text>
            {cumplimientoPorProyecto.length === 0 ? (
              <Center h={200}><Text size="xs" c="dimmed">{verTodos ? "Sin macroproyectos" : "Sin proyectos"}</Text></Center>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(cumplimientoPorProyecto.length * 44 + 20, 180)}>
                <BarChart
                  data={cumplimientoPorProyecto}
                  layout="vertical"
                  margin={{ top: 0, right: 58, left: 4, bottom: 0 }}
                >
                  <XAxis type="number" domain={[0, 110]} hide />
                  <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11, fill: "#444" }} />
                  <Tooltip formatter={(v) => [`${v} %`, "Avance"]} labelFormatter={(l, p) => p[0]?.payload?.fullName ?? l} contentStyle={{ fontSize: 12 }} />
                  <Bar
                    dataKey="avance"
                    radius={[0, 4, 4, 0]}
                    barSize={22}
                    background={verTodos
                      ? (props: any) => (
                          <rect
                            x={props.x} y={props.y}
                            width={props.width} height={props.height}
                            fill="transparent"
                            style={{ cursor: "pointer" }}
                            onClick={() => props.id && setSelectedMacro(props.id)}
                          />
                        )
                      : undefined}
                  >
                    {cumplimientoPorProyecto.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    <LabelList dataKey="avance" position="right" style={{ fontSize: 11, fontWeight: 700, fill: "#333" }} formatter={(v: any) => `${v}%`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid.Col>

        {/* Line chart (cortes) + Stacked bar (estado) */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="sm" h="100%">

            <Paper withBorder radius="xl" p="md" style={{ flex: 1 }}>
              <Text size="sm" fw={700} mb="xs">Cumplimiento por periodo</Text>
              {cumplimientoPorCorte.length === 0 ? (
                <Center h={110}><Text size="xs" c="dimmed">Sin datos de cortes</Text></Center>
              ) : (
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={cumplimientoPorCorte} margin={{ top: 14, right: 18, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                    <XAxis dataKey="corte" tick={{ fontSize: 9 }} />
                    <YAxis domain={["auto", "auto"]} tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v) => [`${v} %`, "Avance prom."]} />
                    <Line type="monotone" dataKey="avance" stroke={BLUE} strokeWidth={2.5}
                      dot={{ r: 4, fill: BLUE, strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                      label={{ position: "top", fontSize: 9, fill: "#444", formatter: (v: any) => `${v}%` }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Paper>

            <Paper withBorder radius="xl" p="md" style={{ flex: 1 }}>
              <Text size="sm" fw={700} mb="xs">Estado de indicadores</Text>
              {estadoPorCorte.length === 0 ? (
                <Center h={110}><Text size="xs" c="dimmed">Sin datos</Text></Center>
              ) : (
                <>
                <ResponsiveContainer width="100%" height={112}>
                  <BarChart data={estadoPorCorte} margin={{ top: 2, right: 8, left: -12, bottom: 4 }}>
                    <XAxis dataKey="corte" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip content={<EstadoIndicadoresTooltip />} cursor={{ fill: "rgba(34, 139, 230, 0.06)" }} />
                    <Bar dataKey="verde"    name={SEMAFORO_LABEL.verde}    stackId="a" fill={GREEN}  barSize={22} />
                    <Bar dataKey="amarillo" name={SEMAFORO_LABEL.amarillo} stackId="a" fill={YELLOW} barSize={22} />
                    <Bar dataKey="rojo"     name={SEMAFORO_LABEL.rojo}     stackId="a" fill={RED}    barSize={22} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <Group justify="center" gap="sm" mt={2} wrap="wrap">
                  <EstadoLegendItem color={RED} label={SEMAFORO_LABEL.rojo} />
                  <EstadoLegendItem color={GREEN} label={SEMAFORO_LABEL.verde} />
                  <EstadoLegendItem color={YELLOW} label={SEMAFORO_LABEL.amarillo} />
                </Group>
                </>
              )}
            </Paper>

          </Stack>
        </Grid.Col>
      </Grid>

      {/* ── Priority indicators table + Semaforización legend ────────────── */}
      <Grid gutter="sm">

        <Grid.Col span={{ base: 12, md: 9 }}>
          <Paper withBorder radius="xl" p="md">
            <Group justify="space-between" mb="sm">
              <Text size="sm" fw={700}>Indicadores prioritarios del macroproyecto</Text>
              <Text size="xs" c="dimmed">{indsFiltradas.length} indicadores totales</Text>
            </Group>
            <Box style={tableScrollStyle}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                <tr>
                  <th style={thStyle}>Indicador</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 72 }}>Meta 2029</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 80 }}>Avance</th>
                  <th style={{ ...thStyle, width: 150 }}>% cumplimiento</th>
                  <th style={{ ...thStyle, textAlign: "center", width: 90 }}>Estado</th>
                </tr>
                </thead>
                <tbody>
                {indicadoresPrioritarios.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 12 }}>
                      Sin indicadores para mostrar
                    </td>
                  </tr>
                ) : (
                  indicadoresPrioritarios.map((row, i) => (
                    <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8f9ff" }}>
                      <td style={{ ...tdStyle, maxWidth: 270 }}>
                        <Text size="xs" fw={700} c="blue">{row.codigo}</Text>
                        <Text size="xs" c="dimmed" lineClamp={2}>{row.nombre}</Text>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                        <Text size="xs" fw={600}>{row.meta !== null ? Number(row.meta).toLocaleString("es-CO") : "—"}</Text>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                        <Text size="xs">{row.dato !== null ? Number(row.dato).toLocaleString("es-CO") : "—"}</Text>
                      </td>
                      <td style={{ ...tdStyle, minWidth: 140 }}>
                        <PctBar pct={row.pct} semaforo={row.semaforo} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <Badge color={SEMAFORO_BADGE[row.semaforo]} variant="filled" size="sm" style={{ fontSize: 9 }}>
                          {SEMAFORO_LABEL[row.semaforo]}
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

        {/* Semaforización legend */}
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Paper withBorder radius="xl" p="md" h="100%">
            <Group gap={6} mb="sm">
              <IconInfoCircle size={15} color="#aaa" />
              <Text size="xs" fw={700} c="dimmed">Semaforización</Text>
            </Group>
            <Text size="xs" fw={700} c="dimmed" mb="sm">(estado de indicador)</Text>
            <Divider mb="sm" />
            {[
              { color: GREEN,  badge: "Verde — En cumplimiento", label: "Avance al día o evidencia cargada sin riesgo" },
              { color: YELLOW, badge: "Amarillo — En riesgo",   label: "Avance parcial o con riesgo (reporte pendiente o en revisión)" },
              { color: RED,    badge: "Rojo — Crítico",         label: "Retraso en el avance o evidencia pendiente o riesgo crítico" },
            ].map(({ color, badge, label }) => (
              <Group key={badge} gap={10} mb="md" align="flex-start" wrap="nowrap">
                <Box w={10} h={10} mt={3} style={{ borderRadius: "50%", background: color, flexShrink: 0 }} />
                <Box>
                  <Text size="xs" fw={700} c={color}>{badge}</Text>
                  <Text size="xs" c="dimmed" lh={1.4}>{label}</Text>
                </Box>
              </Group>
            ))}
          </Paper>
        </Grid.Col>

      </Grid>
    </Stack>
  );
}

// ── Shared table styles ────────────────────────────────────────────────────
const thStyle: React.CSSProperties = {
  padding: "7px 10px",
  textAlign: "left",
  borderBottom: "2px solid #e9ecef",
  fontWeight: 700,
  fontSize: 11,
  color: "#555",
  background: "#f8f9fa",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const tdStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderBottom: "1px solid #f0f0f0",
  verticalAlign: "middle",
  fontSize: 11,
};

const tableScrollStyle: React.CSSProperties = {
  maxHeight: 260,
  overflowY: "auto",
  overflowX: "auto",
  border: "1px solid #f1f3f5",
  borderRadius: 8,
};
