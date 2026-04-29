"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Stack, Text, Paper, Select, Group, Loader, Center, SimpleGrid,
  Badge, Box, ThemeIcon, Progress,
} from "@mantine/core";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadialBarChart, RadialBar,
  LineChart, Line,
} from "recharts";
import axios from "axios";
import { PDI_ROUTES } from "../api";
import { IconChartBarPopular, IconTrendingUp, IconBulb, IconTarget } from "@tabler/icons-react";
import type { Macroproyecto, Proyecto, Accion, Indicador, DashboardResumen, DashboardMacroproyecto } from "../types";

const COLORS = ["#7950f2", "#228be6", "#40c057", "#fab005", "#fa5252", "#fd7e14", "#15aabf", "#e64980", "#845ef7", "#339af0"];
const SEMAFORO_COLOR: Record<string, string> = { verde: "#40c057", amarillo: "#fab005", rojo: "#fa5252" };
const SEMAFORO_LABEL: Record<string, string> = { verde: "Cumplimiento adecuado", amarillo: "Requiere atencion", rojo: "Critico" };

function PeriodoTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const avance = payload.find((p: any) => p.dataKey === "Avance")?.value ?? null;
  const meta   = payload.find((p: any) => p.dataKey === "Meta")?.value ?? null;
  const cumplimiento = avance != null && meta != null && Number(meta) > 0
    ? Math.min(100, Math.round((Number(avance) / Number(meta)) * 100))
    : null;
  return (
    <Paper p="sm" withBorder shadow="sm" radius="md">
      <Text fw={700} size="xs" mb={4}>{label}</Text>
      {avance != null && <Text size="xs">Avance: {avance}</Text>}
      {meta    != null && <Text size="xs">Meta: {meta}</Text>}
      {cumplimiento != null && (
        <Text size="xs" fw={700} c="violet" mt={4}>Cumplimiento: {cumplimiento}%</Text>
      )}
    </Paper>
  );
}

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

function StatusTagList({ items, emptyLabel }: { items: Array<{ id: string; codigo: string; nombre: string; semaforo: string }>; emptyLabel: string }) {
  if (items.length === 0) {
    return <Text size="xs" c="dimmed">{emptyLabel}</Text>;
  }

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xs" mt="sm">
      {items.map((item) => (
        <Group key={item.id} gap={8} wrap="nowrap" align="flex-start">
          <Box
            w={10}
            h={10}
            mt={4}
            style={{ borderRadius: 999, flexShrink: 0, backgroundColor: SEMAFORO_COLOR[item.semaforo] ?? "#adb5bd" }}
          />
          <Text size="xs" c="dimmed" lineClamp={2}>
            <Text span fw={700} c="dark">{item.codigo}</Text>
            {" - "}
            {item.nombre}
          </Text>
        </Group>
      ))}
    </SimpleGrid>
  );
}

export default function PdiGraficas() {
  const [pdiData, setPdiData] = useState<{
    macros: Macroproyecto[];
    proyectos: Proyecto[];
    acciones: Accion[];
    indicadores: Indicador[];
  } | null>(null);
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [dashboardMacro, setDashboardMacro] = useState<DashboardMacroproyecto | null>(null);
  const [selectedMacro, setSelectedMacro] = useState<string | null>("todos");
  const [selectedInd, setSelectedInd] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      axios.get(PDI_ROUTES.dashboardResumen()),
      axios.get(PDI_ROUTES.macroproyectos()),
      axios.get(PDI_ROUTES.proyectos()),
      axios.get(PDI_ROUTES.acciones()),
      axios.get(PDI_ROUTES.indicadores()),
    ]).then(([rResumen, rM, rP, rA, rI]) => {
      setResumen(rResumen.data);
      setPdiData({
        macros: rM.data,
        proyectos: rP.data,
        acciones: rA.data,
        indicadores: rI.data,
      });
    }).catch((e) => console.error(e));
  }, []);

  useEffect(() => {
    if (!selectedMacro || selectedMacro === "todos") {
      setDashboardMacro(null);
      return;
    }

    axios.get(PDI_ROUTES.dashboardMacroproyecto(selectedMacro))
      .then((res) => setDashboardMacro(res.data))
      .catch((e) => console.error(e));
  }, [selectedMacro]);

  const macros = pdiData?.macros ?? [];
  const proyectos = pdiData?.proyectos ?? [];
  const acciones = pdiData?.acciones ?? [];
  const indicadores = pdiData?.indicadores ?? [];

  const verTodos = selectedMacro === "todos";

  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

  // Solo recalculamos el avance del macro como promedio simple de los proyecto almacenadosDB
  // (los avances de proyectos y acciones ya son correctos según el backend)
  const macroConAvance = useMemo(
    () => macros.find((m) => m._id === selectedMacro) ?? null,
    [macros, selectedMacro]
  );

  const macroIds = useMemo(() => new Set(macros.map((m) => m._id)), [macros]);

  const proysMacro = useMemo(() => proyectos.filter((p) => {
    const mid = typeof p.macroproyecto_id === "object" ? p.macroproyecto_id._id : p.macroproyecto_id;
    return verTodos ? macroIds.has(mid) : mid === selectedMacro;
  }), [proyectos, macroIds, selectedMacro, verTodos]);

  const proyIds = useMemo(() => new Set(proysMacro.map((p) => p._id)), [proysMacro]);

  const accionesMacro = useMemo(() => acciones.filter((a) => {
    const pid = typeof a.proyecto_id === "object" ? a.proyecto_id._id : a.proyecto_id;
    return proyIds.has(pid);
  }), [acciones, proyIds]);

  const accionIds = useMemo(() => new Set(accionesMacro.map((a) => a._id)), [accionesMacro]);

  const indsMacro = useMemo(() => indicadores.filter((i) => {
    const aid = i.accion_id && typeof i.accion_id === "object" ? i.accion_id._id : i.accion_id;
    return aid != null && accionIds.has(String(aid));
  }), [indicadores, accionIds]);

  useEffect(() => {
    setSelectedInd(indsMacro.length > 0 ? indsMacro[0]._id : null);
  }, [indsMacro]);

  const avanceGlobal = verTodos
    ? (resumen?.avance_global ?? 0)
    : (dashboardMacro?.macroproyecto.avance ?? macroConAvance?.avance ?? 0);

  const barrasMacros = macros.map((m, i) => ({
    name: m.codigo,
    fullName: m.nombre,
    Avance: m.avance,
    semaforo: m.semaforo,
    color: COLORS[i % COLORS.length],
  }));

  const tortaSemaforoMacros = Object.entries(
    macros.reduce((acc, m) => {
      acc[m.semaforo] = (acc[m.semaforo] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([k, v]) => ({ name: SEMAFORO_LABEL[k] ?? k, value: v, color: SEMAFORO_COLOR[k] }));

  const etiquetasMacros = macros.map((m) => ({
    id: m._id,
    codigo: m.codigo,
    nombre: m.nombre,
    semaforo: m.semaforo,
  }));

  const barrasProyectos = proysMacro.map((p, i) => ({
    name: p.codigo,
    fullName: p.nombre,
    Avance: p.avance,
    Peso: p.peso,
    semaforo: p.semaforo,
    color: COLORS[i % COLORS.length],
  }));

  const tortaSemaforoProyectos = Object.entries(
    proysMacro.reduce((acc, p) => {
      acc[p.semaforo] = (acc[p.semaforo] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([k, v]) => ({ name: SEMAFORO_LABEL[k] ?? k, value: v, color: SEMAFORO_COLOR[k] }));

  const etiquetasProyectos = proysMacro.map((p) => ({
    id: p._id,
    codigo: p.codigo,
    nombre: p.nombre,
    semaforo: p.semaforo,
  }));

  const tarjetasAcciones = accionesMacro.map((a, i) => ({
    id: a._id,
    codigo: a.codigo,
    nombre: a.nombre,
    avance: a.avance,
    peso: a.peso,
    semaforo: a.semaforo,
    color: SEMAFORO_COLOR[a.semaforo] ?? COLORS[i % COLORS.length],
  }));

  const barrasAcciones = accionesMacro.map((a, i) => ({
    name: a.codigo,
    fullName: a.nombre,
    Avance: a.avance,
    Peso: a.peso,
    color: COLORS[i % COLORS.length],
  }));

  const tortaSemaforoInds = Object.entries(
    indsMacro.reduce((acc, i) => {
      acc[i.semaforo] = (acc[i.semaforo] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([k, v]) => ({ name: SEMAFORO_LABEL[k] ?? k, value: v, color: SEMAFORO_COLOR[k] }));

  const etiquetasIndicadores = indsMacro.map((i) => ({
    id: i._id,
    codigo: i.codigo,
    nombre: i.nombre,
    semaforo: i.semaforo,
  }));

  const topInds = [...indsMacro].sort((a, b) => b.avance - a.avance).slice(0, 10).map((i) => ({
    name: i.codigo,
    Avance: i.avance,
    semaforo: i.semaforo,
  }));

  const indActual = indsMacro.find((i) => i._id === selectedInd);
  const periodosData = useMemo(() => {
    if (!indActual) return [];
    return indActual.periodos
      .map((p) => ({
        periodo: p.periodo,
        Meta: p.meta != null && p.meta !== '' ? Number(p.meta) : null,
        Avance: p.avance != null && p.avance !== '' ? Number(p.avance) : null,
      }))
      .filter((p) => p.Meta !== null || p.Avance !== null);
  }, [indActual]);

  const macrosNivel = verTodos ? macros : macros.filter((m) => m._id === selectedMacro);

  const lineaJerarquia = [
    { nivel: "Macroproyecto", Avance: avg(macrosNivel.map((m) => m.avance)) },
    { nivel: "Proyectos",     Avance: avg(proysMacro.map((p) => p.avance)) },
    { nivel: "Acciones",      Avance: avg(accionesMacro.map((a) => a.avance)) },
    { nivel: "Indicadores",   Avance: avg(indsMacro.map((i) => i.avance)) },
  ];

  if (!pdiData) return <Center py="xl"><Loader /></Center>;

  return (
    <Stack gap="lg">
      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Group justify="space-between" align="center">
          <Group gap={10}>
            <ThemeIcon size={40} radius="xl" color="violet" variant="light">
              <IconChartBarPopular size={20} />
            </ThemeIcon>
            <div>
              <Text fw={700} size="md">Selecciona un Macroproyecto</Text>
              <Text size="xs" c="dimmed">Todas las graficas se actualizan segun tu seleccion</Text>
            </div>
          </Group>
          <Select
            placeholder="Selecciona un macroproyecto"
            data={[
              { value: "todos", label: "Todos los macroproyectos" },
              ...macros.map((m) => ({ value: m._id, label: `${m.codigo} - ${m.nombre}` })),
            ]}
            value={selectedMacro}
            onChange={setSelectedMacro}
            style={{ minWidth: 320 }}
            searchable
          />
        </Group>

        {verTodos ? (
          <Box mt="md">
            <Group justify="space-between" mb={8}>
              <Text size="sm" fw={700}>Resumen global del PDI</Text>
              <Text size="sm" fw={800}>{avanceGlobal}% avance promedio</Text>
            </Group>
            <SimpleGrid cols={macros.length} spacing={6}>
              {macros.map((m) => (
                <Box key={m._id}>
                  <Text size="xs" c="dimmed" mb={4} lineClamp={1}>{m.codigo}</Text>
                  <Progress value={m.avance} color={m.semaforo === "verde" ? "green" : m.semaforo === "amarillo" ? "yellow" : "red"} size="md" radius="xl" />
                  <Text size="xs" fw={700} ta="right" mt={2}>{m.avance}%</Text>
                </Box>
              ))}
            </SimpleGrid>
          </Box>
        ) : macroConAvance ? (
          <Box mt="md">
            <Group justify="space-between" mb={6}>
              <Text size="sm" fw={700}>{macroConAvance.nombre}</Text>
              <Group gap={8}>
                <Badge color={macroConAvance.semaforo === "verde" ? "green" : macroConAvance.semaforo === "amarillo" ? "yellow" : "red"} variant="light">
                  {SEMAFORO_LABEL[macroConAvance.semaforo]}
                </Badge>
                <Text size="sm" fw={800}>{macroConAvance.avance}%</Text>
              </Group>
            </Group>
            <Progress value={macroConAvance.avance} color={macroConAvance.semaforo === "verde" ? "green" : macroConAvance.semaforo === "amarillo" ? "yellow" : "red"} size="lg" radius="xl" />
          </Box>
        ) : null}
      </Paper>

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <StatCard icon={<IconChartBarPopular size={18} />} label="Proyectos" value={proysMacro.length} color="blue"
          sub={`${proysMacro.filter((p) => p.semaforo === "verde").length} en cumplimiento`} />
        <StatCard icon={<IconTrendingUp size={18} />} label="Acciones estrategicas" value={accionesMacro.length} color="orange"
          sub={`${accionesMacro.filter((a) => a.semaforo === "rojo").length} criticas`} />
        <StatCard icon={<IconTarget size={18} />} label="Indicadores" value={indsMacro.length} color="violet"
          sub={`${indsMacro.filter((i) => i.semaforo === "verde").length} en cumplimiento`} />
        <StatCard icon={<IconBulb size={18} />} label="Avance promedio" value={`${verTodos ? lineaJerarquia[0].Avance : avanceGlobal}%`} color="teal"
          sub={verTodos ? "Promedio de macroproyectos" : "Avance consolidado del macroproyecto"} />
      </SimpleGrid>

      {verTodos ? (
        <>
          <ChartCard title="Avance por Macroproyecto" subtitle="Avance consolidado de cada macroproyecto">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barrasMacros} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l, p) => p[0]?.payload?.fullName ?? l} />
                <Bar dataKey="Avance" radius={[4, 4, 0, 0]}>
                  {barrasMacros.map((e, i) => <Cell key={i} fill={SEMAFORO_COLOR[e.semaforo] ?? COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <ChartCard title="Estado de Macroproyectos" subtitle="Distribucion por semaforo">
              {tortaSemaforoMacros.length === 0 ? <Text size="xs" c="dimmed">Sin datos</Text> : (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={tortaSemaforoMacros} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} label={({ value }) => value}>
                        {tortaSemaforoMacros.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <StatusTagList items={etiquetasMacros} emptyLabel="Sin macroproyectos" />
                </>
              )}
            </ChartCard>

            <ChartCard title="Avance por Nivel Jerarquico" subtitle="Promedio de avance en cada nivel: Macroproyecto -> Proyectos -> Acciones -> Indicadores">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={lineaJerarquia} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nivel" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="Avance" radius={[6, 6, 0, 0]}>
                    {lineaJerarquia.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </SimpleGrid>
        </>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <ChartCard title="Avance por Proyecto" subtitle="Avance consolidado de cada proyecto">
              {barrasProyectos.length === 0 ? <Text size="xs" c="dimmed">Sin proyectos</Text> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={barrasProyectos} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l, p) => p[0]?.payload?.fullName ?? l} />
                    <Bar dataKey="Avance" radius={[4, 4, 0, 0]}>
                      {barrasProyectos.map((e, i) => <Cell key={i} fill={SEMAFORO_COLOR[e.semaforo] ?? COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Estado de Proyectos" subtitle="Distribucion por semaforo">
              {tortaSemaforoProyectos.length === 0 ? <Text size="xs" c="dimmed">Sin datos</Text> : (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={tortaSemaforoProyectos} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} label={({ value }) => value}>
                        {tortaSemaforoProyectos.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <StatusTagList items={etiquetasProyectos} emptyLabel="Sin proyectos para etiquetar" />
                </>
              )}
            </ChartCard>

            <ChartCard title="Avance por Accion Estrategica" subtitle="Cada accion muestra su porcentaje de avance">
              {tarjetasAcciones.length === 0 ? <Text size="xs" c="dimmed">Sin acciones</Text> : (
                <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
                  {tarjetasAcciones.map((accion) => (
                    <Paper key={accion.id} withBorder radius="md" p="md">
                      <Group justify="space-between" align="flex-start" wrap="nowrap" mb="xs">
                        <Box style={{ flex: 1 }}>
                          <Text fw={700} size="sm" lineClamp={1}>{accion.codigo}</Text>
                          <Text size="xs" c="dimmed" lineClamp={3}>{accion.nombre}</Text>
                        </Box>
                        <Badge color={accion.semaforo === "verde" ? "green" : accion.semaforo === "amarillo" ? "yellow" : "red"} variant="light">
                          {accion.avance}%
                        </Badge>
                      </Group>

                      <Box h={170}>
                        <ResponsiveContainer width="100%" height="100%">
                          <RadialBarChart
                            data={[{ name: "Avance", value: accion.avance, fill: accion.color }]}
                            innerRadius="68%"
                            outerRadius="100%"
                            startAngle={90}
                            endAngle={-270}
                            barSize={16}
                          >
                            <RadialBar background dataKey="value" cornerRadius={10} />
                            <text x="50%" y="44%" textAnchor="middle" dominantBaseline="middle" fontSize={30} fontWeight={800} fill={accion.color}>
                              {accion.avance}%
                            </text>
                            <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="#6b7280">
                              Avance
                            </text>
                          </RadialBarChart>
                        </ResponsiveContainer>
                      </Box>

                      <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">Peso</Text>
                        <Text size="xs" fw={700}>{accion.peso}%</Text>
                      </Group>
                    </Paper>
                  ))}
                </SimpleGrid>
              )}
            </ChartCard>

            <ChartCard title="Estado de Indicadores" subtitle="Distribucion por semaforo">
              {tortaSemaforoInds.length === 0 ? <Text size="xs" c="dimmed">Sin indicadores</Text> : (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={tortaSemaforoInds} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} label={({ value }) => value}>
                        {tortaSemaforoInds.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <StatusTagList items={etiquetasIndicadores} emptyLabel="Sin indicadores para etiquetar" />
                </>
              )}
            </ChartCard>
          </SimpleGrid>

          {topInds.length > 0 && (
            <ChartCard title="Top Indicadores por Avance" subtitle="Los indicadores con mayor avance">
              <ResponsiveContainer width="100%" height={Math.max(200, topInds.length * 32)}>
                <BarChart data={topInds} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={55} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="Avance" radius={[0, 4, 4, 0]}>
                    {topInds.map((e, i) => <Cell key={i} fill={SEMAFORO_COLOR[e.semaforo] ?? "#7950f2"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {barrasAcciones.length > 0 && (
            <ChartCard title="Avance vs Peso - Acciones Estrategicas" subtitle="Comparacion entre peso asignado y avance real">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barrasAcciones} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} labelFormatter={(l, p) => p[0]?.payload?.fullName ?? l} />
                  <Legend />
                  <Bar dataKey="Avance" fill="#fd7e14" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Peso" fill="#dee2e6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {indsMacro.length > 0 && (
            <ChartCard title="Meta vs Avance por Periodo - Indicador" subtitle="Selecciona un indicador para ver su evolucion por corte">
              <Select
                size="xs"
                mb="md"
                placeholder="Selecciona un indicador"
                value={selectedInd}
                onChange={setSelectedInd}
                data={indsMacro.map((i) => ({ value: i._id, label: `${i.codigo} - ${i.nombre}`.slice(0, 70) }))}
                searchable
              />
              {periodosData.length === 0 ? (
                <Text size="xs" c="dimmed">Este indicador no tiene periodos registrados</Text>
              ) : (
                <Box maw={600} mx="auto">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={periodosData} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip content={<PeriodoTooltip />} />
                      <Legend />
                      <Bar dataKey="Meta" fill="#dee2e6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Avance" fill="#7950f2" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </ChartCard>
          )}
        </>
      )}
    </Stack>
  );
}
