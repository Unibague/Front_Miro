"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Stack, Text, Paper, Select, Group, Loader, Center, SimpleGrid,
  Badge, Box, ThemeIcon, Progress,
} from "@mantine/core";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
} from "recharts";
import axios from "axios";
import { PDI_ROUTES } from "../api";
import { IconChartBarPopular, IconTrendingUp, IconBulb, IconTarget } from "@tabler/icons-react";
import type { Macroproyecto, Proyecto, Accion, Indicador } from "../types";

const COLORS = ["#7950f2", "#228be6", "#40c057", "#fab005", "#fa5252", "#fd7e14", "#15aabf", "#e64980", "#845ef7", "#339af0"];
const SEMAFORO_COLOR: Record<string, string> = { verde: "#40c057", amarillo: "#fab005", rojo: "#fa5252" };

function getAvancePorcentaje(ind: Indicador): number {
  const metaFinal = ind.meta_final_2029 != null ? Number(ind.meta_final_2029) : null;
  const avanceActual = ind.avance != null ? Number(ind.avance) : null;
  let pct: number;
  if (ind.tipo_calculo === "ultimo_valor" && metaFinal && avanceActual != null) {
    pct = Math.round((avanceActual / metaFinal) * 100 * 100) / 100;
  } else {
    pct = Number(ind.avance_total_real ?? ind.avance ?? 0);
  }
  return Math.min(Math.max(pct, 0), 100);
}
const SEMAFORO_LABEL: Record<string, string> = { verde: "Cumplimiento adecuado", amarillo: "Requiere atención", rojo: "Crítico" };

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="lg" p="lg" shadow="xs">
      <Text fw={700} size="sm" mb={subtitle ? 2 : "md"}>{title}</Text>
      {subtitle && <Text size="xs" c="dimmed" mb="md">{subtitle}</Text>}
      {children}
    </Paper>
  );
}

function StatCard({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <Paper withBorder radius="lg" p="md" shadow="xs">
      <Group justify="space-between" mb={8}>
        <ThemeIcon size={36} radius="xl" color={color} variant="light">{icon}</ThemeIcon>
        <Badge color={color} variant="light" size="xs">PDI</Badge>
      </Group>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="1.6rem" fw={800} lh={1} mt={2}>{value}</Text>
      {sub && <Text size="xs" c="dimmed" mt={4}>{sub}</Text>}
    </Paper>
  );
}

export default function PdiGraficas() {
  const [macros, setMacros]         = useState<Macroproyecto[]>([]);
  const [proyectos, setProyectos]   = useState<Proyecto[]>([]);
  const [acciones, setAcciones]     = useState<Accion[]>([]);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [selectedMacro, setSelectedMacro] = useState<string | null>(null);
  const [selectedInd, setSelectedInd]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      axios.get(PDI_ROUTES.macroproyectos()),
      axios.get(PDI_ROUTES.proyectos()),
      axios.get(PDI_ROUTES.acciones()),
      axios.get(PDI_ROUTES.indicadores()),
    ]).then(([rM, rP, rA, rI]) => {
      setMacros(rM.data);
      setProyectos(rP.data);
      setAcciones(rA.data);
      setIndicadores(rI.data);
      if (rM.data.length > 0) setSelectedMacro(rM.data[0]._id);
    }).catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  // ── Filtrar jerarquía del macro seleccionado ─────────────────────────────
  const verTodos = selectedMacro === "todos";
  const macro = useMemo(() => macros.find(m => m._id === selectedMacro) ?? null, [macros, selectedMacro]);

  const proysMacro = useMemo(() => verTodos ? proyectos : proyectos.filter(p => {
    const mid = typeof p.macroproyecto_id === "object" ? p.macroproyecto_id._id : p.macroproyecto_id;
    return mid === selectedMacro;
  }), [proyectos, selectedMacro, verTodos]);

  const proyIds = useMemo(() => new Set(proysMacro.map(p => p._id)), [proysMacro]);

  const accionesMacro = useMemo(() => verTodos ? acciones : acciones.filter(a => {
    const pid = typeof a.proyecto_id === "object" ? a.proyecto_id._id : a.proyecto_id;
    return proyIds.has(pid);
  }), [acciones, proyIds, verTodos]);

  const accionIds = useMemo(() => new Set(accionesMacro.map(a => a._id)), [accionesMacro]);

  const indsMacro = useMemo(() => verTodos ? indicadores : indicadores.filter(i => {
    const aid = typeof i.accion_id === "object" ? i.accion_id._id : i.accion_id;
    return accionIds.has(typeof aid === "object" ? (aid as any)._id : aid);
  }), [indicadores, accionIds, verTodos]);
  // ── Datos para cada gráfica ──────────────────────────────────────────────

  // Replica exacta de getWeightedProgress del [macroId] page: divide por 100, no por totalPeso
  function wp<T extends { peso: number }>(items: T[], getValue: (i: T) => number) {
    const total = items.reduce((s, i) => s + (Number(i.peso) || 0), 0);
    if (total <= 0) return 0;
    return Math.round(items.reduce((s, i) => s + getValue(i) * (Number(i.peso) || 0), 0) / 100);
  }

  // 1. Barras horizontales: avance por macroproyecto
  // Cadena: indicadores → acciones (hidratadas) → proyectos → macro  (igual que [macroId] page)
  const barrasHorizMacros = macros.map(m => {
    const proysMacro = proyectos.filter(p =>
      (typeof p.macroproyecto_id === 'object' ? p.macroproyecto_id._id : p.macroproyecto_id) === m._id
    );
    if (!proysMacro.length) return { name: m.codigo, fullName: m.nombre, Avance: Number(m.avance) || 0, semaforo: m.semaforo };

    const proyectosHidratados = proysMacro.map(p => {
      const acsProy = acciones.filter(a =>
        (typeof a.proyecto_id === 'object' ? a.proyecto_id._id : a.proyecto_id) === p._id
      );
      if (!acsProy.length) return { peso: p.peso, avance: Number(p.avance) || 0 };

      // Hidratar cada acción con sus indicadores (igual que hydrateAcciones en [macroId])
      const accionesHidratadas = acsProy.map(a => {
        const indsAc = indicadores.filter(i => {
          const aid = typeof i.accion_id === 'string' ? i.accion_id : (i.accion_id as any)?._id;
          return aid === a._id;
        });
        const avAc = indsAc.length
          ? wp(indsAc, ind => getAvancePorcentaje(ind))
          : Number(a.avance) || 0;
        return { peso: a.peso, avance: avAc };
      });

      return { peso: p.peso, avance: wp(accionesHidratadas, ac => ac.avance) };
    });

    const avance = wp(proyectosHidratados, p => p.avance);
    const semaforo = avance >= 90 ? 'verde' : avance >= 60 ? 'amarillo' : 'rojo';
    return { name: m.codigo, fullName: m.nombre, Avance: avance, semaforo };
  });

  // 2. Barras: avance vs peso por macroproyecto
  const barrasMacros = macros.map(m => ({
    name: m.codigo,
    Avance: m.avance,
    Peso: m.peso,
  }));

  // Al cambiar macro, seleccionar primer indicador disponible
  useEffect(() => {
    setSelectedInd(indsMacro.length > 0 ? indsMacro[0]._id : null);
  }, [selectedMacro]);

  // ── Datos para gráficas ──────────────────────────────────────────────────

  // Avance proyectos del macro
  const barrasProyectos = proysMacro.map((p, i) => ({
    name: p.codigo,
    fullName: p.nombre,
    Avance: p.avance,
    Peso: p.peso,
    color: COLORS[i % COLORS.length],
    semaforo: p.semaforo,
  }));

  // Semáforo proyectos
  const semaforoProyectos = proysMacro.reduce((acc, p) => {
    acc[p.semaforo] = (acc[p.semaforo] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const tortaSemaforoProyectos = Object.entries(semaforoProyectos).map(([k, v]) => ({
    name: SEMAFORO_LABEL[k] ?? k, value: v, color: SEMAFORO_COLOR[k],
  }));

  // Radar acciones del macro (top 10)
  const radarAcciones = accionesMacro.slice(0, 10).map(a => ({
    subject: a.codigo, Avance: a.avance, fullMark: 100,
  }));

  // Barras acciones
  const barrasAcciones = accionesMacro.map((a, i) => ({
    name: a.codigo, fullName: a.nombre,
    Avance: a.avance, Peso: a.peso,
    color: COLORS[i % COLORS.length],
  }));

  // Semáforo indicadores del macro
  const semaforoInds = indsMacro.reduce((acc, i) => {
    acc[i.semaforo] = (acc[i.semaforo] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const tortaSemaforoInds = Object.entries(semaforoInds).map(([k, v]) => ({
    name: SEMAFORO_LABEL[k] ?? k, value: v, color: SEMAFORO_COLOR[k],
  }));

  // Top indicadores por avance
  const topInds = [...indsMacro].sort((a, b) => b.avance - a.avance).slice(0, 10).map(i => ({
    name: i.codigo, Avance: i.avance, semaforo: i.semaforo,
  }));

  // Periodos del indicador seleccionado
  const indActual = indsMacro.find(i => i._id === selectedInd);
  const periodosData = useMemo(() => {
    if (!indActual) return [];
    return indActual.periodos.map(p => ({
      periodo: p.periodo,
      Meta:   p.meta   != null ? Number(p.meta)   : null,
      Avance: p.avance != null ? Number(p.avance) : null,
    }));
  }, [indActual]);

  // 6. Torta: distribución semáforo de indicadores
  const semaforoCount = indicadores.reduce((acc, i) => {
    acc[i.semaforo] = (acc[i.semaforo] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const tortaSemaforo = Object.entries(semaforoCount).map(([k, v]) => ({
    name: k === "verde" ? "Cumplimiento adecuado" : k === "amarillo" ? "Requiere atención" : "Crítico",
    value: v,
    color: SEMAFORO_COLOR[k],
  }));

  // 7. Barras horizontales: top indicadores por avance (% real, máx 100)
  const topIndicadores = [...indicadores]
    .map(i => ({ name: i.codigo, Avance: getAvancePorcentaje(i), semaforo: i.semaforo }))
    .sort((a, b) => b.Avance - a.Avance)
    .slice(0, 8);
  // Línea jerárquica: avance por nivel
  const avanceGlobalMacro = verTodos
    ? (macros.length ? Math.round(macros.reduce((s, m) => s + m.avance, 0) / macros.length) : 0)
    : (macro?.avance ?? 0);

  const lineaJerarquia = [
    { nivel: "Macroproyecto", Avance: avanceGlobalMacro },
    { nivel: "Proyectos",     Avance: proysMacro.length ? Math.round(proysMacro.reduce((s, p) => s + p.avance, 0) / proysMacro.length) : 0 },
    { nivel: "Acciones",      Avance: accionesMacro.length ? Math.round(accionesMacro.reduce((s, a) => s + a.avance, 0) / accionesMacro.length) : 0 },
    { nivel: "Indicadores",   Avance: indsMacro.length ? Math.round(indsMacro.reduce((s, i) => s + i.avance, 0) / indsMacro.length) : 0 },
  ];

  // Barras de macroproyectos para vista global
  const barrasMacros = macros.map((m, i) => ({
    name: m.codigo, fullName: m.nombre,
    Avance: m.avance, Peso: m.peso,
    semaforo: m.semaforo, color: COLORS[i % COLORS.length],
  }));

  if (loading) return <Center py="xl"><Loader /></Center>;

  return (
    <Stack gap="lg">

      {/* Selector de macroproyecto */}
      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Group justify="space-between" align="center">
          <Group gap={10}>
            <ThemeIcon size={40} radius="xl" color="violet" variant="light">
              <IconChartBarPopular size={20} />
            </ThemeIcon>
            <div>
              <Text fw={700} size="md">Selecciona un Macroproyecto</Text>
              <Text size="xs" c="dimmed">Todas las gráficas se actualizan según tu selección</Text>
            </div>
          </Group>
          <Select
            placeholder="Selecciona un macroproyecto"
            data={[
              { value: "todos", label: "Todos los macroproyectos" },
              ...macros.map(m => ({ value: m._id, label: `${m.codigo} — ${m.nombre}` })),
            ]}
            value={selectedMacro}
            onChange={setSelectedMacro}
            style={{ minWidth: 320 }}
            searchable
          />
        </Group>

        {/* Barra de avance del macro o resumen global */}
        {verTodos ? (
          <Box mt="md">
            <Group justify="space-between" mb={8}>
              <Text size="sm" fw={700}>Resumen global del PDI</Text>
              <Text size="sm" fw={800}>{avanceGlobalMacro}% avance promedio</Text>
            </Group>
            <SimpleGrid cols={macros.length} spacing={6}>
              {macros.map(m => (
                <Box key={m._id}>
                  <Text size="xs" c="dimmed" mb={4} lineClamp={1}>{m.codigo}</Text>
                  <Progress
                    value={m.avance}
                    color={m.semaforo === "verde" ? "green" : m.semaforo === "amarillo" ? "yellow" : "red"}
                    size="md" radius="xl"
                  />
                  <Text size="xs" fw={700} ta="right" mt={2}>{m.avance}%</Text>
                </Box>
              ))}
            </SimpleGrid>
          </Box>
        ) : macro ? (
          <Box mt="md">
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={700}>{macro.nombre}</Text>
              <Group gap={8}>
                <Badge color={macro.semaforo === "verde" ? "green" : macro.semaforo === "amarillo" ? "yellow" : "red"} variant="light">
                  {SEMAFORO_LABEL[macro.semaforo]}
                </Badge>
                <Text size="sm" fw={800}>{macro.avance}%</Text>
              </Group>
            </Group>
            <Progress
              value={macro.avance}
              color={macro.semaforo === "verde" ? "green" : macro.semaforo === "amarillo" ? "yellow" : "red"}
              size="lg" radius="xl"
            />
          </Box>
        ) : null}
      </Paper>

      {/* Stats del macro */}
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <StatCard icon={<IconChartBarPopular size={18} />} label="Proyectos" value={proysMacro.length} color="blue"
          sub={`${proysMacro.filter(p => p.semaforo === "verde").length} en cumplimiento`} />
        <StatCard icon={<IconTrendingUp size={18} />} label="Acciones estratégicas" value={accionesMacro.length} color="orange"
          sub={`${accionesMacro.filter(a => a.semaforo === "rojo").length} críticas`} />
        <StatCard icon={<IconTarget size={18} />} label="Indicadores" value={indsMacro.length} color="violet"
          sub={`${indsMacro.filter(i => i.semaforo === "verde").length} en cumplimiento`} />
        <StatCard icon={<IconBulb size={18} />} label="Avance promedio" value={`${lineaJerarquia[3].Avance}%`} color="teal"
          sub="Promedio de indicadores" />
      </SimpleGrid>

      {/* Gráfica global de macroproyectos cuando verTodos */}
      {verTodos && (
        <ChartCard title="Avance por Macroproyecto" subtitle="Comparación del avance consolidado de todos los macroproyectos">
          <ResponsiveContainer width="100%" height={260}>
      <SimpleGrid cols={2} spacing="md">

        {/* 1. Barras horizontales avance macroproyectos */}
        <ChartCard title="Avance por Macroproyecto (%)">
          <ResponsiveContainer width="100%" height={Math.max(200, barrasHorizMacros.length * 44)}>
            <BarChart
              data={barrasHorizMacros}
              layout="vertical"
              margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 700 }} width={40} />
              <Tooltip
                formatter={(v) => [`${v}%`, "Avance"]}
                labelFormatter={(label) => {
                  const m = barrasHorizMacros.find(x => x.name === label);
                  return m ? `${m.name} — ${m.fullName}` : label;
                }}
              />
              <Bar dataKey="Avance" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v: number) => `${v}%`, fontSize: 12, fontWeight: 700 }}>
                {barrasHorizMacros.map((entry, i) => (
                  <Cell key={i} fill={SEMAFORO_COLOR[entry.semaforo] ?? "#7950f2"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Semáforo indicadores */}
        <ChartCard title="Estado de Indicadores (Semáforo)">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={tortaSemaforo} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label={({ value }) => value}>
                {tortaSemaforo.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Barras: avance vs peso macroproyectos */}
        <ChartCard title="Avance vs Peso — Macroproyectos">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barrasMacros} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l, p) => p[0]?.payload?.fullName ?? l} />
              <Legend />
              <Bar dataKey="Avance" radius={[4, 4, 0, 0]}>
                {barrasMacros.map((e, i) => <Cell key={i} fill={SEMAFORO_COLOR[e.semaforo] ?? COLORS[i % COLORS.length]} />)}
              </Bar>
              <Bar dataKey="Peso" fill="#dee2e6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Gráficas principales */}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">

        {/* Avance proyectos */}
        <ChartCard title="Avance por Proyecto" subtitle="Porcentaje de avance consolidado de cada proyecto">
          {barrasProyectos.length === 0 ? <Text size="xs" c="dimmed">Sin proyectos</Text> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barrasProyectos} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l, p) => p[0]?.payload?.fullName ?? l} />
                <Bar dataKey="Avance" radius={[4, 4, 0, 0]}>
                  {barrasProyectos.map((e, i) => <Cell key={i} fill={SEMAFORO_COLOR[e.semaforo] ?? COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Semáforo proyectos */}
        <ChartCard title="Estado de Proyectos" subtitle="Distribución por semáforo">
          {tortaSemaforoProyectos.length === 0 ? <Text size="xs" c="dimmed">Sin datos</Text> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={tortaSemaforoProyectos} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} label={({ value }) => value}>
                  {tortaSemaforoProyectos.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Radar acciones */}
        <ChartCard title="Avance por Acción Estratégica" subtitle="Vista radar de las acciones del macroproyecto">
          {radarAcciones.length === 0 ? <Text size="xs" c="dimmed">Sin acciones</Text> : (
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarAcciones}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar name="Avance" dataKey="Avance" stroke="#7950f2" fill="#7950f2" fillOpacity={0.4} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Semáforo indicadores */}
        <ChartCard title="Estado de Indicadores" subtitle="Distribución por semáforo de todos los indicadores del macroproyecto">
          {tortaSemaforoInds.length === 0 ? <Text size="xs" c="dimmed">Sin indicadores</Text> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={tortaSemaforoInds} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} label={({ value }) => value}>
                  {tortaSemaforoInds.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </SimpleGrid>

      {/* Línea jerárquica */}
      <ChartCard title="Avance por Nivel Jerárquico" subtitle="Comparación del avance promedio en cada nivel: Macroproyecto → Proyectos → Acciones → Indicadores">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={lineaJerarquia} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="nivel" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
            <Tooltip formatter={(v) => `${v}%`} />
            <Bar dataKey="Avance" radius={[6, 6, 0, 0]}>
              {lineaJerarquia.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top indicadores */}
      {topInds.length > 0 && (
        <ChartCard title="Top Indicadores por Avance" subtitle="Los indicadores con mayor avance dentro del macroproyecto">
          <ResponsiveContainer width="100%" height={Math.max(200, topInds.length * 32)}>
            <BarChart data={topInds} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={55} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="Avance" radius={[0, 4, 4, 0]}>
                {topInds.map((e, i) => <Cell key={i} fill={SEMAFORO_COLOR[e.semaforo] ?? "#7950f2"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Acciones: avance vs peso */}
      {barrasAcciones.length > 0 && (
        <ChartCard title="Avance vs Peso — Acciones Estratégicas" subtitle="Comparación entre el peso asignado y el avance real de cada acción">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barrasAcciones} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l, p) => p[0]?.payload?.fullName ?? l} />
              <Legend />
              <Bar dataKey="Avance" fill="#fd7e14" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Peso" fill="#dee2e6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Periodos de un indicador */}
      {indsMacro.length > 0 && (
        <ChartCard title="Meta vs Avance por Periodo — Indicador" subtitle="Selecciona un indicador para ver su evolución por corte">
          <Select
            size="xs" mb="md"
            placeholder="Selecciona un indicador"
            value={selectedInd}
            onChange={setSelectedInd}
            data={indsMacro.map(i => ({ value: i._id, label: `${i.codigo} — ${i.nombre}`.slice(0, 70) }))}
            searchable
          />
          {periodosData.length === 0 ? (
            <Text size="xs" c="dimmed">Este indicador no tiene periodos registrados</Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={periodosData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Meta" fill="#dee2e6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Avance" fill="#7950f2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {periodosData.length > 1 && (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={periodosData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="Meta" stroke="#fab005" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="Avance" stroke="#7950f2" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </SimpleGrid>
          )}
        </ChartCard>
      )}

    </Stack>
  );
}
