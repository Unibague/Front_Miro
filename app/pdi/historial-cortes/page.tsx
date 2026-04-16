"use client";

import { useState, useEffect } from "react";
import {
  Text, Paper, Group, Badge, Button, Stack, Loader, Center,
  ThemeIcon, ActionIcon, Box, Title, Progress, Select, Divider,
  SimpleGrid, Collapse,
} from "@mantine/core";
import {
  IconArrowLeft, IconCalendarStats, IconChartBarPopular,
  IconTrendingUp, IconBulb, IconTarget, IconChevronDown,
  IconChevronRight, IconFolderOpen,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "Cumplimiento adecuado", amarillo: "Requiere atención", rojo: "Crítico",
};

interface CorteItem { _id: string; nombre: string; descripcion: string; fecha_inicio: string | null; fecha_fin: string | null; }
interface IndicadorResumen {
  _id: string; codigo: string; nombre: string; peso: number;
  avance: number; semaforo: string; responsable: string;
  meta_final_2029: any; tipo_calculo: string; observaciones: string;
  meta_corte: any; avance_corte: any;
}
interface AccionResumen { _id: string; codigo: string; nombre: string; peso: number; avance: number; semaforo: string; indicadores: IndicadorResumen[]; }
interface ProyectoResumen { _id: string; codigo: string; nombre: string; peso: number; avance: number; semaforo: string; formulador: string; responsable: string; acciones: AccionResumen[]; }
interface MacroResumen { _id: string; codigo: string; nombre: string; peso: number; avance: number; semaforo: string; proyectos: ProyectoResumen[]; }

function AvanceBar({ avance, semaforo }: { avance: number; semaforo: string }) {
  return (
    <Group gap={6} align="center">
      <Progress value={avance} color={SEMAFORO_COLOR[semaforo]} size="xs" style={{ flex: 1 }} />
      <Text size="xs" fw={700} w={32} ta="right">{avance}%</Text>
    </Group>
  );
}

// ── Indicador ──────────────────────────────────────────────────────────────
function IndicadorCard({ ind }: { ind: IndicadorResumen }) {
  const barColor = ind.avance >= 50 ? "#22c55e" : ind.avance >= 25 ? "#f59e0b" : "#ef4444";
  return (
    <Paper withBorder radius="lg" p="sm" shadow="xs" style={{ minWidth: 200, flex: "1 1 200px" }}>
      <Group justify="space-between" mb={6}>
        <ThemeIcon size={26} radius="xl" color="violet" variant="light"><IconTarget size={13} /></ThemeIcon>
        <Badge color={SEMAFORO_COLOR[ind.semaforo]} variant="light" size="xs" radius="xl">
          {SEMAFORO_LABEL[ind.semaforo]}
        </Badge>
      </Group>
      <Text size="xs" fw={700} c="dimmed" mb={2}>{ind.codigo}</Text>
      <Text size="xs" fw={600} mb={6} lineClamp={3}>{ind.nombre}</Text>

      {/* Avance del corte */}
      <Paper withBorder radius="md" p="xs" mb={6} style={{ background: "var(--mantine-color-default-hover)" }}>
        <Text size="xs" c="dimmed" mb={4} fw={600}>En este corte</Text>
        <Group gap={12}>
          <Box>
            <Text size="xs" c="dimmed">Meta</Text>
            <Text size="sm" fw={700}>{ind.meta_corte ?? "—"}</Text>
          </Box>
          <Box>
            <Text size="xs" c="dimmed">Avance</Text>
            <Text size="sm" fw={700}>{ind.avance_corte ?? "—"}</Text>
          </Box>
        </Group>
      </Paper>

      <AvanceBar avance={ind.avance} semaforo={ind.semaforo} />
      <Group gap={8} mt={6} wrap="wrap">
        <Text size="xs" c="dimmed">Peso: <b>{ind.peso}%</b></Text>
        {ind.meta_final_2029 != null && <Text size="xs" c="dimmed">Meta 2029: <b>{ind.meta_final_2029}</b></Text>}
      </Group>
      {ind.responsable && <Text size="xs" c="dimmed" mt={2}>Resp: <b>{ind.responsable}</b></Text>}
      {ind.observaciones && <Text size="xs" c="dimmed" mt={2} lineClamp={2}>Obs: {ind.observaciones}</Text>}
    </Paper>
  );
}

// ── Acción ─────────────────────────────────────────────────────────────────
function AccionSeccion({ accion }: { accion: AccionResumen }) {
  const [open, setOpen] = useState(false);
  return (
    <Paper withBorder radius="lg" p="md" shadow="xs" mb={8}>
      <Group justify="space-between" mb={6}>
        <Group gap={8}>
          <ThemeIcon size={26} radius="xl" color="orange" variant="light"><IconBulb size={13} /></ThemeIcon>
          <div>
            <Text size="xs" fw={700} c="dimmed">{accion.codigo}</Text>
            <Text size="sm" fw={600} lineClamp={2}>{accion.nombre}</Text>
          </div>
        </Group>
        <Group gap={6}>
          <Badge color={SEMAFORO_COLOR[accion.semaforo]} variant="light" size="xs" radius="xl">
            {SEMAFORO_LABEL[accion.semaforo]}
          </Badge>
          <Text size="xs" c="dimmed">Peso: <b>{accion.peso}%</b></Text>
        </Group>
      </Group>
      <AvanceBar avance={accion.avance} semaforo={accion.semaforo} />

      <Button variant="subtle" size="xs" mt={8} p={0}
        rightSection={<IconChevronRight size={11} style={{ transform: open ? "rotate(90deg)" : "", transition: "transform .2s" }} />}
        onClick={() => setOpen(v => !v)}>
        {open ? "Ocultar indicadores" : `Ver ${accion.indicadores.length} indicador${accion.indicadores.length !== 1 ? "es" : ""}`}
      </Button>

      <Collapse in={open}>
        <Box mt={10} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {accion.indicadores.length === 0
            ? <Text size="xs" c="dimmed">Sin indicadores en este corte</Text>
            : accion.indicadores.map(ind => <IndicadorCard key={ind._id} ind={ind} />)
          }
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── Proyecto ───────────────────────────────────────────────────────────────
function ProyectoSeccion({ proyecto }: { proyecto: ProyectoResumen }) {
  const [open, setOpen] = useState(false);
  const barColor = proyecto.avance >= 50 ? "#22c55e" : proyecto.avance >= 25 ? "#f59e0b" : "#ef4444";
  const statusColor = proyecto.semaforo === "verde" ? "green" : proyecto.semaforo === "amarillo" ? "yellow" : "red";

  return (
    <Box mb={24}>
      <Paper withBorder radius="xl" p="lg" shadow="sm" mb={10}>
        <Group justify="space-between" align="flex-start">
          <Group gap={12}>
            <ThemeIcon size={36} radius="xl" color="blue" variant="light"><IconTrendingUp size={18} /></ThemeIcon>
            <div>
              <Group gap={8} mb={2}>
                <Text size="xs" fw={700} c="dimmed">{proyecto.codigo}</Text>
                <Badge color={statusColor} variant="light" size="xs" radius="xl">
                  {SEMAFORO_LABEL[proyecto.semaforo]}
                </Badge>
              </Group>
              <Text fw={700} size="md">{proyecto.nombre}</Text>
              {proyecto.formulador && <Text size="xs" c="dimmed" mt={2}>Formulador: <b>{proyecto.formulador}</b></Text>}
              {proyecto.responsable && <Text size="xs" c="dimmed">Responsable: <b>{proyecto.responsable}</b></Text>}
            </div>
          </Group>
          <Group gap={10} align="center">
            <div style={{ textAlign: "right" }}>
              <Text size="1.6rem" fw={800} lh={1}>{proyecto.avance}%</Text>
              <Text size="xs" c="dimmed">Peso: {proyecto.peso}%</Text>
            </div>
            <Box style={{ width: 70, height: 6, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden" }}>
              <Box style={{ height: "100%", width: `${proyecto.avance}%`, background: barColor, borderRadius: 99 }} />
            </Box>
            <Button variant="subtle" size="xs"
              rightSection={open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
              onClick={() => setOpen(v => !v)}>
              {open ? "Ocultar acciones" : `${proyecto.acciones.length} acción${proyecto.acciones.length !== 1 ? "es" : ""}`}
            </Button>
          </Group>
        </Group>
      </Paper>

      <Collapse in={open}>
        <Box pl={16}>
          {proyecto.acciones.length === 0
            ? <Text size="sm" c="dimmed">Sin acciones en este corte</Text>
            : proyecto.acciones.map(a => <AccionSeccion key={a._id} accion={a} />)
          }
        </Box>
      </Collapse>
    </Box>
  );
}

// ── Macroproyecto ──────────────────────────────────────────────────────────
function MacroSeccion({ macro }: { macro: MacroResumen }) {
  const [open, setOpen] = useState(true);
  const barColor = macro.avance >= 50 ? "#22c55e" : macro.avance >= 25 ? "#f59e0b" : "#ef4444";

  const totalProyectos = macro.proyectos.length;
  const totalAcciones  = macro.proyectos.reduce((s, p) => s + p.acciones.length, 0);
  const totalIndicadores = macro.proyectos.reduce((s, p) => s + p.acciones.reduce((ss, a) => ss + a.indicadores.length, 0), 0);

  return (
    <Paper withBorder radius="xl" p="xl" shadow="md" mb={24}>
      {/* Header macro */}
      <Group justify="space-between" align="flex-start" mb="md">
        <Group gap={12}>
          <ThemeIcon size={44} radius="xl" color="violet" variant="light"><IconChartBarPopular size={22} /></ThemeIcon>
          <div>
            <Group gap={8}>
              <Text fw={800} size="lg">{macro.nombre}</Text>
              <Badge color={SEMAFORO_COLOR[macro.semaforo]} variant="light" radius="xl">
                {SEMAFORO_LABEL[macro.semaforo]}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" mt={2}>Código: <b>{macro.codigo}</b> · Peso: <b>{macro.peso}%</b></Text>
          </div>
        </Group>
        <Group gap={10} align="center">
          <div style={{ textAlign: "right" }}>
            <Text size="2rem" fw={800} lh={1}>{macro.avance}%</Text>
            <Text size="xs" c="dimmed">Avance consolidado</Text>
          </div>
          <Box style={{ width: 90, height: 8, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden" }}>
            <Box style={{ height: "100%", width: `${macro.avance}%`, background: barColor, borderRadius: 99, transition: "width .4s" }} />
          </Box>
        </Group>
      </Group>

      {/* Stats */}
      <SimpleGrid cols={3} mb="md">
        {[
          { label: "Proyectos", value: totalProyectos, color: "blue" },
          { label: "Acciones", value: totalAcciones, color: "orange" },
          { label: "Indicadores", value: totalIndicadores, color: "violet" },
        ].map(s => (
          <Box key={s.label} style={{ textAlign: "center", background: "var(--mantine-color-default-hover)", borderRadius: 12, padding: "10px 4px" }}>
            <Text fw={800} size="xl" lh={1} c={s.color}>{s.value}</Text>
            <Text size="xs" c="dimmed" mt={2}>{s.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      <Button variant="light" color="violet" size="xs" fullWidth mb="md"
        rightSection={open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        onClick={() => setOpen(v => !v)}>
        {open ? "Ocultar proyectos" : "Ver proyectos"}
      </Button>

      <Collapse in={open}>
        <Divider mb="md" />
        {macro.proyectos.length === 0
          ? <Text size="sm" c="dimmed" ta="center">Sin proyectos en este corte</Text>
          : macro.proyectos.map(p => <ProyectoSeccion key={p._id} proyecto={p} />)
        }
      </Collapse>
    </Paper>
  );
}

// ── Página principal ───────────────────────────────────────────────────────
export default function HistorialCortesPage() {
  const router = useRouter();
  const [cortes, setCortes]         = useState<CorteItem[]>([]);
  const [corteId, setCorteId]       = useState<string | null>(null);
  const [jerarquia, setJerarquia]   = useState<MacroResumen[]>([]);
  const [corteInfo, setCorteInfo]   = useState<CorteItem | null>(null);
  const [loading, setLoading]       = useState(false);
  const [loadingCortes, setLoadingCortes] = useState(true);

  useEffect(() => {
    axios.get(PDI_ROUTES.cortes())
      .then(res => setCortes(res.data))
      .catch(e => console.error(e))
      .finally(() => setLoadingCortes(false));
  }, []);

  useEffect(() => {
    if (!corteId) return;
    setLoading(true);
    setJerarquia([]);
    axios.get(PDI_ROUTES.corteResumen(corteId))
      .then(res => {
        setJerarquia(res.data.jerarquia);
        setCorteInfo(res.data.corte);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [corteId]);

  const totalIndicadores = jerarquia.reduce((s, m) =>
    s + m.proyectos.reduce((ss, p) =>
      ss + p.acciones.reduce((sss, a) => sss + a.indicadores.length, 0), 0), 0);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Header fijo */}
        <div style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--mantine-color-default-border)",
          background: "var(--mantine-color-body)",
          flexShrink: 0,
        }}>
          <Group justify="space-between" align="center">
            <Group gap={12}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}><IconArrowLeft size={18} /></ActionIcon>
              <ThemeIcon size={44} radius="xl" color="violet" variant="light">
                <IconCalendarStats size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Historial de Cortes</Title>
                <Text size="xs" c="dimmed">Vista completa del PDI por periodo de corte</Text>
              </div>
            </Group>

            <Group gap={12}>
              {corteInfo && (
                <Group gap={8}>
                  {corteInfo.fecha_inicio && (
                    <Badge variant="outline" color="blue" size="sm">
                      Apertura: {new Date(corteInfo.fecha_inicio).toLocaleDateString("es-CO")}
                    </Badge>
                  )}
                  {corteInfo.fecha_fin && (
                    <Badge variant="outline" color={new Date() > new Date(corteInfo.fecha_fin) ? "red" : "teal"} size="sm">
                      Cierre: {new Date(corteInfo.fecha_fin).toLocaleDateString("es-CO")}
                    </Badge>
                  )}
                  {jerarquia.length > 0 && (
                    <Badge variant="light" color="violet" size="sm">
                      {jerarquia.length} macro · {totalIndicadores} indicadores
                    </Badge>
                  )}
                </Group>
              )}
              <Select
                placeholder={loadingCortes ? "Cargando cortes..." : "Selecciona un corte"}
                data={cortes.map(c => ({
                  value: c._id,
                  label: c.descripcion ? `${c.nombre} — ${c.descripcion}` : c.nombre,
                }))}
                value={corteId}
                onChange={setCorteId}
                style={{ minWidth: 260 }}
                disabled={loadingCortes}
                searchable
              />
            </Group>
          </Group>
        </div>

        {/* Contenido */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {!corteId ? (
            <Center style={{ height: "60vh" }}>
              <Stack align="center" gap="xs">
                <ThemeIcon size={64} radius="xl" color="violet" variant="light">
                  <IconCalendarStats size={32} />
                </ThemeIcon>
                <Text fw={700} size="lg">Selecciona un corte</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Elige un periodo de corte para ver el estado completo del PDI en ese momento
                </Text>
              </Stack>
            </Center>
          ) : loading ? (
            <Center style={{ height: "60vh" }}>
              <Stack align="center" gap="sm">
                <Loader color="violet" />
                <Text size="sm" c="dimmed">Cargando información del corte...</Text>
              </Stack>
            </Center>
          ) : jerarquia.length === 0 ? (
            <Center style={{ height: "60vh" }}>
              <Stack align="center" gap="xs">
                <ThemeIcon size={56} radius="xl" color="gray" variant="light">
                  <IconFolderOpen size={28} />
                </ThemeIcon>
                <Text fw={600}>Sin datos para este corte</Text>
                <Text size="sm" c="dimmed">No hay indicadores con avances registrados en este periodo</Text>
              </Stack>
            </Center>
          ) : (
            <Stack gap={0}>
              {jerarquia.map(macro => <MacroSeccion key={macro._id} macro={macro} />)}
            </Stack>
          )}
        </div>
      </div>
    </div>
  );
}
