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
  const [macros, setMacros]             = useState<Macroproyecto[]>([]);
  const [proyectos, setProyectos]       = useState<Proyecto[]>([]);
  const [acciones, setAcciones]         = useState<Accion[]>([]);
  const [indicadores, setIndicadores]   = useState<Indicador[]>([]);
  const [selectedMacro, setSelectedMacro] = useState<string | null>(null);
  const [selectedInd, setSelectedInd]     = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);

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

  // ── Filtrar jerarquía según selección ────────────────────────────────────
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

  useEffect(() => {
    setSelectedInd(indsMacro.length > 0 ? indsMacro[0]._id : null);
  }, [selectedMacro]);

  // ── Datos para gráficas (solo usa .avance del backend) ───────────────────

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

  const avanceGlobal = verTodos
    ? avg(macros.map(m => m.avance))
    : (macro?.avance ?? 0);

  // Barras macroproyectos (vista todos)
  const barrasMacros = macros.map((m, i) => ({
    name: m.codigo, fullName: m.nombre,
    Avance: m.avance, Peso: m.peso,
    semaforo: m.semaforo, color: COLORS[i % COLORS.length],
  }));

  // Barras proyectos
  const barrasProyectos = proysMacro.map((p, i) => ({
    name: p.codigo, fullName: p.nombre,
    Avance: p.avance, Peso: p.peso,
    semaforo: p.semaforo, color: COLORS[i % COLORS.length],
  }));

  // Semáforo proyectos
  const tortaSemaforoProyectos = Object.entries(
    proysMacro.reduce((acc, p) => { acc[p.semaforo] = (acc[p.semaforo] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([k, v]) => ({ name: SEMAFORO_LABEL[k] ?? k, value: v, color: SEMAFORO_COLOR[k] }));

  // Radar acciones
  const radarAcciones = accionesMacro.slice(0, 10).map(a => ({
    subject: a.codigo, Avance: a.avance, fullMark: 100,
  }));

  // Barras acciones
  const barrasAcciones = accionesMacro.map((a, i) => ({
    name: a.codigo, fullName: a.nombre,
    Avance: a.avance, Peso: a.peso,
    color: COLORS[i % COLORS.length],
  }));

  // Semáforo indicadores
  const tortaSemaforoInds = Object.entries(
    indsMacro.reduce((acc, i) => { acc[i.semaforo] = (acc[i.semaforo] ?? 0) + 1; return acc; }, {} as Record<string, number>)
  ).map(([k, v]) => ({ name: SEMAFORO_LABEL[k] ?? k, value: v, color: SEMAFORO_COLOR[k] }));

  // Top indicadores
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

  // Línea jerárquica
  const lineaJerarquia = [
    { nivel: "Macroproyecto", Avance: avanceGlobal },
    { nivel: "Proyectos",     Avance: avg(proysMacro.map(p => p.avance)) },
    { nivel: "Acciones",      Avance: avg(accionesMacro.map(a => a.avance)) },
    { nivel: "Indicadores",   Avance: avg(indsMacro.map(i => i.avance)) },
  ];

  if (loading) return <Center py="xl"><Loader /></Center>;

  return (
    <Stack gap="lg">

      {/* Selector */}
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
              { value: "todos", label: "🌐 Todos los macroproyectos" },
              ...macros.map(m => ({ value: m._id, label: `${m.codigo} — ${m.nombre}` })),
            ]}
            value={selectedMacro}
            onChange={setSelectedMacro}
            style={{ minWidth: 320 }}
            searchable
          />
        </Group>

        {/* Barras de avance */}
        {verTodos ? (
          <Box mt="md">
            <Group justify="space-between" mb={8}>
              <Text size="sm" fw={700}>Resumen global del PDI</Text>
              <Text size="sm" fw={800}>{avanceGlobal}% avance promedio</Text>
            </Group>
            <SimpleGrid cols={macros.length} spacing={6}>
              {macros.map(m => (
                <Box key={m._id}>
                  <Text size="xs" c="dimmed" mb={4} lineClamp={1}>{m.codigo}</Text>
                  <Progress value={m.avance} color={m.semaforo === "verde" ? "green" : m.semaforo === "amarillo" ? "yellow" : "red"} size="md" radius="xl" />
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
            <Progress value={macro.avance} color={macro.semaforo === "verde" ? "green" : macro.semaforo === "amarillo" ? "yellow" : "red"} size="lg" radius="xl" />
          </Box>
        ) : null}
      </Paper>

      {/* Stats */}
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

      {/* Gráfica global todos los macros */}
      {verTodos && (
        <ChartCard title="Avance por Macroproyecto" subtitle="Avance consolidado de cada macroproyecto">
          <ResponsiveContainer width="100%" height={260}>
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

        <ChartCard title="Avance por Proyecto" subtitle="Avance consolidado de cada proyecto">
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

        <ChartCard title="Estado de Proyectos" subtitle="Distribución por semáforo">
          {tortaSemaforoProyectos.length === 0 ? <Text size="xs" c="dimmed">Sin datos</Text> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={tortaSemaforoProyectos} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} label={({ value }) => value}>
                  {tortaSemaforoProyectos.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Avance por Acción Estratégica" subtitle="Vista radar de las acciones">
          {radarAcciones.length === 0 ? <Text size="xs" c="dimmed">Sin acciones</Text> : (
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarAcciones}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar name="Avance" dataKey="Avance" stroke="#7950f2" fill="#7950f2" fillOpacity={0.4} />
                <Tooltip formatter={(v) => `${v}%`} /><Legend />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Estado de Indicadores" subtitle="Distribución por semáforo">
          {tortaSemaforoInds.length === 0 ? <Text size="xs" c="dimmed">Sin indicadores</Text> : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={tortaSemaforoInds} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} label={({ value }) => value}>
                  {tortaSemaforoInds.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

      </SimpleGrid>

      {/* Avance por nivel jerárquico */}
      <ChartCard title="Avance por Nivel Jerárquico" subtitle="Promedio de avance en cada nivel: Macroproyecto → Proyectos → Acciones → Indicadores">
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
        <ChartCard title="Top Indicadores por Avance" subtitle="Los indicadores con mayor avance">
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
        <ChartCard title="Avance vs Peso — Acciones Estratégicas" subtitle="Comparación entre peso asignado y avance real">
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
                  <Tooltip /><Legend />
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
                    <Tooltip /><Legend />
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
