"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Stack, Text, Paper, Select, Group, Loader, Center, SimpleGrid, Title, Badge,
} from "@mantine/core";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import axios from "axios";
import { PDI_ROUTES } from "../api";
import type { Macroproyecto, Proyecto, Accion, Indicador } from "../types";

const COLORS = ["#7950f2", "#228be6", "#40c057", "#fab005", "#fa5252", "#fd7e14", "#15aabf", "#e64980"];
const SEMAFORO_COLOR: Record<string, string> = { verde: "#40c057", amarillo: "#fab005", rojo: "#fa5252" };

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text fw={600} size="sm" mb="md" c="dimmed">{title}</Text>
      {children}
    </Paper>
  );
}

export default function PdiGraficas() {
  const [macros, setMacros]         = useState<Macroproyecto[]>([]);
  const [proyectos, setProyectos]   = useState<Proyecto[]>([]);
  const [acciones, setAcciones]     = useState<Accion[]>([]);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [selectedInd, setSelectedInd] = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [rM, rP, rA, rI] = await Promise.all([
          axios.get(PDI_ROUTES.macroproyectos()),
          axios.get(PDI_ROUTES.proyectos()),
          axios.get(PDI_ROUTES.acciones()),
          axios.get(PDI_ROUTES.indicadores()),
        ]);
        setMacros(rM.data);
        setProyectos(rP.data);
        setAcciones(rA.data);
        setIndicadores(rI.data);
        if (rI.data.length > 0) setSelectedInd(rI.data[0]._id);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  // ── Datos para cada gráfica ──────────────────────────────────────────────

  // 1. Torta: avance por macroproyecto
  const tortaMacros = macros.map((m, i) => ({
    name: `${m.codigo} ${m.nombre}`.slice(0, 30),
    value: m.avance,
    color: COLORS[i % COLORS.length],
  }));

  // 2. Barras: avance vs peso por macroproyecto
  const barrasMacros = macros.map(m => ({
    name: m.codigo,
    Avance: m.avance,
    Peso: m.peso,
  }));

  // 3. Barras agrupadas: avance vs peso por proyecto (top 10)
  const barrasProyectos = proyectos.slice(0, 10).map(p => ({
    name: p.codigo,
    Avance: p.avance,
    Peso: p.peso,
  }));

  // 4. Radar: avance por acción (top 8)
  const radarAcciones = acciones.slice(0, 8).map(a => ({
    subject: a.codigo,
    Avance: a.avance,
    fullMark: 100,
  }));

  // 5. Línea + barras: periodos del indicador seleccionado
  const indActual = indicadores.find(i => i._id === selectedInd);
  const periodosData = useMemo(() => {
    if (!indActual) return [];
    return indActual.periodos.map(p => ({
      periodo: p.periodo,
      Meta:    p.meta    != null ? Number(p.meta)    : null,
      Avance:  p.avance  != null ? Number(p.avance)  : null,
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

  // 7. Barras horizontales: top indicadores por avance
  const topIndicadores = [...indicadores]
    .sort((a, b) => b.avance - a.avance)
    .slice(0, 8)
    .map(i => ({ name: i.codigo, Avance: i.avance, semaforo: i.semaforo }));

  if (loading) return <Center py="xl"><Loader /></Center>;

  return (
    <Stack gap="md">
      <Group gap={8}>
        <Title order={5}>Gráficas del PDI</Title>
        <Badge color="violet" variant="light">{indicadores.length} indicadores</Badge>
      </Group>

      <SimpleGrid cols={2} spacing="md">

        {/* 1. Torta avance macroproyectos */}
        <ChartCard title="Avance por Macroproyecto (%)">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={tortaMacros} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${value}%`}>
                {tortaMacros.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
            </PieChart>
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
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Bar dataKey="Avance" fill="#7950f2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Peso" fill="#dee2e6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Barras: avance vs peso proyectos */}
        <ChartCard title="Avance vs Peso — Proyectos (top 10)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barrasProyectos} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend />
              <Bar dataKey="Avance" fill="#228be6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Peso" fill="#dee2e6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 5. Radar acciones */}
        {radarAcciones.length > 0 && (
          <ChartCard title="Avance por Acción Estratégica (Radar)">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarAcciones}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
                <Radar name="Avance" dataKey="Avance" stroke="#7950f2" fill="#7950f2" fillOpacity={0.4} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 6. Barras horizontales top indicadores */}
        <ChartCard title="Top Indicadores por Avance">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topIndicadores} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={50} />
              <Tooltip formatter={(v) => `${v}%`} />
              <Bar dataKey="Avance" radius={[0, 4, 4, 0]}>
                {topIndicadores.map((entry, i) => (
                  <Cell key={i} fill={SEMAFORO_COLOR[entry.semaforo] ?? "#7950f2"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

      </SimpleGrid>

      {/* 7. Línea + barras: periodos del indicador seleccionado */}
      {indicadores.length > 0 && (
        <ChartCard title="Meta vs Avance por Periodo — Indicador">
          <Select
            size="xs"
            mb="sm"
            placeholder="Selecciona un indicador"
            value={selectedInd}
            onChange={setSelectedInd}
            data={indicadores.map(i => ({ value: i._id, label: `${i.codigo} — ${i.nombre}`.slice(0, 60) }))}
            searchable
          />
          {periodosData.length === 0 ? (
            <Text size="xs" c="dimmed">Este indicador no tiene periodos registrados</Text>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
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
          )}
          {periodosData.length > 1 && (
            <ResponsiveContainer width="100%" height={180} style={{ marginTop: 16 }}>
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
        </ChartCard>
      )}
    </Stack>
  );
}
