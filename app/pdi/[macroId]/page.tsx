"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Text, Paper, Group, Badge, Button, Stack, Loader, Center,
  ThemeIcon, ActionIcon, Box, Title, Progress, SimpleGrid,
} from "@mantine/core";
import {
  IconArrowLeft, IconTarget, IconBulb,
  IconEdit, IconTrash, IconPlus, IconChevronRight,
  IconChartBarPopular, IconFolderOpen,
  IconCheck, IconAlertTriangle, IconX, IconFlag,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter, useParams } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import type { Macroproyecto, Proyecto, Accion, Indicador } from "../types";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import MacroproyectoModal from "../components/MacroproyectoModal";
import ProyectoModal from "../components/ProyectoModal";
import AccionModal from "../components/AccionModal";
import IndicadorModal from "../components/IndicadorModal";
import { usePdiConfig } from "../hooks/usePdiConfig";

interface CorteVigente {
  _id: string;
  nombre: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

function getEvaluacionesPendientesAccion(indicadores: Indicador[]) {
  return indicadores.flatMap((ind) =>
    (ind.periodos ?? [])
      .filter((p) => (p.estado_reporte ?? "") === "Enviado" || (p.estado_reporte ?? "") === "Aprobado")
      .map((p) => ({
        indicadorId: ind._id,
        indicadorCodigo: ind.codigo,
        corte: p.periodo,
        tipo: (p.estado_reporte ?? "") === "Aprobado" ? "planeacion" : "lider",
      }))
  );
}

const formatCOP = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);

const formatFecha = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
};

const SEMAFORO_ICON: Record<string, React.ReactNode> = {
  verde:    <IconCheck size={13} />,
  amarillo: <IconAlertTriangle size={13} />,
  rojo:     <IconX size={13} />,
};

function indicadorUsaPorcentaje(ind: Indicador) {
  if (typeof ind.meta_final_2029 === "string" && ind.meta_final_2029.includes("%")) return true;
  return ind.periodos.some((p) => typeof p.meta === "string" && p.meta.includes("%"));
}
function formatIndicadorTotalActual(ind: Indicador) {
  if (ind.avance == null) return "—";
  return indicadorUsaPorcentaje(ind) ? `${ind.avance}%` : String(ind.avance);
}

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "En cumplimiento",
  amarillo: "Requiere atención",
  rojo: "Crítico",
};
const isAdmin = (role: string) => role === "Administrador";

function getSemaforoByAvance(avance: number) {
  if (avance >= 90) return "verde";
  if (avance >= 60) return "amarillo";
  return "rojo";
}

function normalizePeso(peso: number) {
  const value = Number(peso) || 0;
  return value <= 1 ? value * 100 : value;
}

function getWeightedProgress<T extends { peso: number }>(items: T[], getValue: (item: T) => number) {
  return Math.round(
    items.reduce((acc, item) => acc + getValue(item) * normalizePeso(item.peso), 0) / 100
  );
}

function getIndicadorAvanceMostrado(ind: Indicador) {
  return ind.avance_total_real ?? ind.avance;
}


function getIndicadorAvancePonderado(ind: Indicador) {
  return Math.min(Math.max(Number(ind.avance) || 0, 0), 100);
}

function clampProgress(avance: number) {
  return Math.min(Math.max(Number(avance) || 0, 0), 100);
}

function SemaforoBadge({ semaforo }: { semaforo: string }) {
  return (
    <Badge color={SEMAFORO_COLOR[semaforo]} variant="light" size="xs" radius="xl">
      {SEMAFORO_LABEL[semaforo]}
    </Badge>
  );
}

function AvanceBar({ avance, semaforo }: { avance: number; semaforo: string }) {
  return (
    <Group gap={8} align="center">
      <Progress value={clampProgress(avance)} color={SEMAFORO_COLOR[semaforo]} size="sm" radius="xl" style={{ flex: 1 }} />
      <Text size="xs" fw={700} w={36} ta="right">{avance}%</Text>
    </Group>
  );
}



function IndicadorCard({ ind, admin, anioMeta, onEdit, onDelete }: {
  ind: Indicador; admin: boolean;
  anioMeta: number;
  onEdit: (i: Indicador) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const avance = getIndicadorAvanceMostrado(ind);
  const avanceBarra = Math.min(Math.max(Number(avance), 0), 100);

  return (
    <Paper withBorder radius="xl" p="lg" shadow="xs"
      style={{ transition: "box-shadow .2s, transform .2s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.10)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      {/* Header */}
      <Group justify="space-between" align="flex-start" mb="xs">
        <div style={{ cursor: "pointer", flex: 1 }} onClick={() => router.push(`/pdi/indicadores/${ind._id}`)}>
          <Group gap={8} mb={4} align="center" wrap="wrap">
            <Text size="xl" fw={900} c="dark">{ind.codigo}</Text>
            <Badge color={SEMAFORO_COLOR[ind.semaforo]} variant="light" size="sm" radius="xl">
              {SEMAFORO_LABEL[ind.semaforo]}
            </Badge>
          </Group>
          <Text size="xl" fw={800} style={{ lineHeight: 1.3 }}>{ind.nombre}</Text>
        </div>
        <Group gap={4}>
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); onEdit(ind); }}><IconEdit size={13} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); onDelete(ind._id); }}><IconTrash size={13} /></ActionIcon>
          </>}
        </Group>
      </Group>

      {/* Avance grande + Meta */}
      <Group justify="space-between" align="flex-end" mb={6}>
        <Text size="2rem" fw={800} lh={1}>{avanceBarra}%</Text>
        {ind.meta_final_2029 != null && (
          <div style={{ textAlign: "right" }}>
            <Text size="lg" fw={700}>{ind.meta_final_2029}</Text>
            <Text size="xs" c="dimmed">Meta {anioMeta}</Text>
          </div>
        )}
      </Group>

      {/* Barra personalizada */}
      <Box mb={12}>
        <Box style={{ flex: 1, height: 10, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden" }}>
          <Box style={{ height: "100%", width: `${avanceBarra}%`, background: avanceBarra >= 70 ? "#22c55e" : avanceBarra >= 40 ? "#f59e0b" : "#ef4444", borderRadius: 99, transition: "width .4s" }} />
        </Box>
      </Box>

      {/* Mini stats */}
      <SimpleGrid cols={3} mb="md">
        {[
          { label: "Peso", value: `${Number(ind.peso).toFixed(2)}%` },
          { label: "Seguimiento", value: ind.tipo_seguimiento || "—" },
          { label: "Total actual", value: formatIndicadorTotalActual(ind) },
        ].map(s => (
          <Box key={s.label} style={{ textAlign: "center", background: "var(--mantine-color-default-hover)", borderRadius: 12, padding: "8px 4px" }}>
            <Text fw={700} size="sm" lh={1}>{s.value}</Text>
            <Text size="xs" c="dimmed" mt={2}>{s.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      {(ind.fecha_inicio || ind.fecha_fin) && (
        <Text size="xs" c="dimmed" mb="sm">
          Vigencia: <b>{formatFecha(ind.fecha_inicio) ?? "Sin inicio"}</b> a <b>{formatFecha(ind.fecha_fin) ?? "Sin fin"}</b>
        </Text>
      )}
      <Text size="xs" c="dimmed" mb="sm">
        Acción: <b>{typeof ind.accion_id === "string" ? ind.accion_id : ind.accion_id.nombre}</b>
      </Text>


      {/* Avance real por año */}
      {ind.avances_por_anio && Object.keys(ind.avances_por_anio).length > 0 && (
        <Box mt="sm">
          <SimpleGrid cols={Object.keys(ind.avances_por_anio).length} spacing="xs" mb={8}>
            {Object.entries(ind.avances_por_anio)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([anio, avanceAnio]) => {
                const pct = Math.min(Math.max(Number(avanceAnio), 0), 100);
                return (
                  <Box key={anio} style={{ textAlign: "center", background: "var(--mantine-color-violet-0, #f3f0ff)", borderRadius: 12, padding: "12px 6px" }}>
                    <Text size="xs" c="dimmed" mb={4}>{anio}</Text>
                    <Text fw={800} size="1.1rem" lh={1} c="violet">{pct}%</Text>
                  </Box>
                );
              })}
          </SimpleGrid>
          {ind.avance_total_real != null && (
            <Badge variant="light" color="violet" radius="xl" size="sm" fullWidth style={{ textTransform: "uppercase", letterSpacing: 1 }}>
              Avance total real {ind.avance_total_real}%
            </Badge>
          )}
        </Box>
      )}
    </Paper>
  );
}

function AccionCard({ accion: accionInicial, admin, aniosPdi, onEdit, onDelete, onAvanceUpdate, onComputedProgress }: {
  accion: Accion; admin: boolean;
  aniosPdi: number[];
  onEdit: (a: Accion) => void;
  onDelete: (id: string) => void;
  onAvanceUpdate: () => void;
  onComputedProgress: (accionId: string, avance: number, semaforo: string) => void;
}) {
  const [accion, setAccion] = useState(accionInicial);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [indModal, setIndModal] = useState(false);
  const [selectedInd, setSelectedInd] = useState<Indicador | null>(null);
  const [indicadoresCount, setIndicadoresCount] = useState<number | null>(null);
  const [indicadoresPrevio, setIndicadoresPrevio] = useState<Indicador[]>([]);

  useEffect(() => { setAccion(accionInicial); }, [accionInicial]);

  useEffect(() => {
    axios.get(PDI_ROUTES.indicadores(), { params: { accion_id: accionInicial._id } })
      .then(res => {
        setIndicadoresCount(res.data.length);
        setIndicadoresPrevio(res.data);
      })
      .catch(() => {});
  }, [accionInicial._id]);

  const pendientesBadges = getEvaluacionesPendientesAccion(
    loaded ? indicadores : indicadoresPrevio
  );

  const cargar = async () => {
    if (loaded) {
      setOpen((value) => !value);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.get(PDI_ROUTES.indicadores(), { params: { accion_id: accion._id } });
      setIndicadores(res.data);
      setLoaded(true);
      setOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const refrescarAccion = async () => {
    try {
      const res = await axios.get(PDI_ROUTES.accion(accion._id));
      setAccion(res.data);
      onAvanceUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteInd = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar indicador",
      children: <Text size="sm">¿Seguro que deseas eliminar este indicador?</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.indicador(id));
          setIndicadores((prev) => prev.filter((i) => i._id !== id));
          showNotification({ title: "Eliminado", message: "Indicador eliminado", color: "teal" });
          await refrescarAccion();
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const toggleIndicadores = () => {
    void cargar();
  };
  const avanceAccion = indicadores.length
    ? getWeightedProgress(indicadores, (ind) => getIndicadorAvancePonderado(ind))
    : accion.avance;
  const semaforoAccion = getSemaforoByAvance(avanceAccion);

  useEffect(() => {
    onComputedProgress(accion._id, avanceAccion, semaforoAccion);
  }, [accion._id, avanceAccion, semaforoAccion, onComputedProgress]);

  return (
    <Paper
      withBorder
      radius="xl"
      p="lg"
      shadow="xs"
      style={{
        background: open
          ? "linear-gradient(180deg, rgba(251,146,60,0.06), transparent 38%)"
          : "var(--mantine-color-body)",
        transition: "box-shadow .2s, transform .2s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 28px rgba(251,146,60,0.15)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap">
        <div style={{ cursor: "pointer", flex: 1 }} onClick={toggleIndicadores}>
          <Group gap={8} mb={4} align="center" wrap="wrap">
            <Text size="xl" fw={900} c="dark">{accion.codigo}</Text>
            <SemaforoBadge semaforo={semaforoAccion} />
          </Group>
          <Text size="xl" fw={700} lh={1.35}>{accion.nombre}</Text>
          {pendientesBadges.length > 0 && (
            <Group gap={4} mt={8} wrap="wrap">
              {pendientesBadges.map((r) => (
                <Badge
                  key={`${r.indicadorId}-${r.corte}`}
                  size="sm"
                  color={r.tipo === "planeacion" ? "teal" : "yellow"}
                  variant="filled"
                  radius="xl"
                  leftSection={<IconFlag size={10} />}
                >
                  {r.tipo === "planeacion"
                    ? `Revisar Planeación · ${r.indicadorCodigo} · ${r.corte}`
                    : `Pendiente líder · ${r.indicadorCodigo} · ${r.corte}`}
                </Badge>
              ))}
            </Group>
          )}
        </div>

        <Group gap={6}>
          {admin && (
            <Button size="xs" variant="light" color="violet" leftSection={<IconPlus size={12} />}
              onClick={(e) => { e.stopPropagation(); setSelectedInd(null); setIndModal(true); }}>
              Nuevo indicador
            </Button>
          )}
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); onEdit(accion); }}><IconEdit size={14} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); onDelete(accion._id); }}><IconTrash size={14} /></ActionIcon>
          </>}
        </Group>
      </Group>

      {/* Cajas de stats */}
      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm" mb="md">
        {[
          { label: "Avance", value: `${avanceAccion}%` },
          { label: "Peso", value: `${Number(accion.peso).toFixed(2)}%` },
          { label: "Indicadores", value: loaded ? indicadores.length : (indicadoresCount ?? "—") },
          { label: "Presupuesto", value: formatCOP(Number(accion.presupuesto)) },
          { label: "Causado", value: Number(accion.presupuesto_ejecutado) > 0 ? formatCOP(Number(accion.presupuesto_ejecutado)) : "$ 0" },
        ].map((item) => (
          <Box key={item.label} style={{ textAlign: "center", background: "var(--mantine-color-default-hover)", borderRadius: 14, padding: "10px 6px" }}>
            <Text fw={800} size="lg" lh={1}>{item.value}</Text>
            <Text size="xs" c="dimmed" mt={4}>{item.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      {/* Distribución presupuestal por año */}
      {(() => {
        const ppa = accion.presupuesto_por_anio ?? {};
        const epa = accion.presupuesto_ejecutado_por_anio ?? {};
        const anios = Array.from(new Set([...Object.keys(ppa), ...Object.keys(epa)])).sort();
        if (!anios.length) return null;
        return (
          <Box mb="sm">
            <Text size="xs" fw={700} mb={8}>Distribución presupuestal por año</Text>
            <SimpleGrid cols={{ base: 2, sm: anios.length }} spacing="sm">
              {anios.map(anio => {
                const asignado  = Number(ppa[anio] ?? 0);
                const ejecutado = Number(epa[anio] ?? 0);
                const pct = asignado > 0 ? Math.min(Math.round((ejecutado / asignado) * 100), 100) : 0;
                const barColor = pct >= 90 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#3b82f6";
                return (
                  <Box key={anio} style={{ background: "var(--mantine-color-default-hover)", borderRadius: 14, padding: "12px 10px" }}>
                    <Group justify="space-between" align="center" mb={6}>
                      <Text size="sm" fw={800}>{anio}</Text>
                      <Text size="lg" fw={900} style={{ color: barColor }} lh={1}>{pct}%</Text>
                    </Group>
                    <Box style={{ height: 6, borderRadius: 99, background: "rgba(0,0,0,0.08)", overflow: "hidden", marginBottom: 8 }}>
                      <Box style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 99, transition: "width .4s" }} />
                    </Box>
                    <Group justify="space-between">
                      <div>
                        <Text size="xs" c="dimmed" lh={1}>Asignado</Text>
                        <Text size="xs" fw={700} c="blue">{formatCOP(asignado)}</Text>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <Text size="xs" c="dimmed" lh={1}>Causado</Text>
                        <Text size="xs" fw={700} c="teal">{formatCOP(ejecutado)}</Text>
                      </div>
                    </Group>
                  </Box>
                );
              })}
            </SimpleGrid>
          </Box>
        );
      })()}

      {/* Barra de avance */}
      <Box mb="sm">
        <Group justify="space-between" mb={6}>
          <Text size="xs" c="dimmed">Avance de la acción</Text>
          <Text size="xs" fw={700}>{avanceAccion}%</Text>
        </Group>
        <Progress value={Math.min(Math.max(avanceAccion, 0), 100)} color={semaforoAccion === "verde" ? "green" : semaforoAccion === "amarillo" ? "yellow" : "red"} size="md" radius="xl" />
      </Box>

      {open && (
        <>
          <Text size="sm" fw={900} my="md" style={{ background: "linear-gradient(90deg, #7c3aed, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            Indicadores de resultado
          </Text>
          {loading ? (
            <Center py="sm"><Loader size="sm" /></Center>
          ) : indicadores.length === 0 ? (
            <Paper
              withBorder
              radius="lg"
              p="xl"
              style={{ borderStyle: "dashed", background: "var(--mantine-color-default-hover)" }}
            >
              <Stack align="center" gap={6}>
                <ThemeIcon size={40} radius="xl" color="violet" variant="light">
                  <IconTarget size={18} />
                </ThemeIcon>
                <Text fw={600}>Sin indicadores registrados</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Agrega indicadores para hacer seguimiento a esta acción estratégica.
                </Text>
                {admin && (
                  <Button
                    size="sm"
                    variant="light"
                    color="violet"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => { setSelectedInd(null); setIndModal(true); }}
                  >
                    Crear indicador
                  </Button>
                )}
              </Stack>
            </Paper>
          ) : (
            <SimpleGrid cols={(() => { const n = indicadores.length; return n <= 3 ? n : n % 3 === 0 ? 3 : 2; })()} spacing="md">
              {indicadores.map((ind) => (
                <IndicadorCard
                  key={ind._id}
                  ind={ind}
                  admin={admin}
                  anioMeta={aniosPdi.length ? aniosPdi[aniosPdi.length - 1] : new Date().getFullYear()}
                  onEdit={(i) => { setSelectedInd(i); setIndModal(true); }}
                  onDelete={handleDeleteInd}
                />
              ))}
            </SimpleGrid>
          )}
        </>
      )}

      <IndicadorModal
        opened={indModal}
        onClose={() => setIndModal(false)}
        selected={selectedInd}
        defaultAccionId={accion._id}
        onSaved={async (doc) => {
          setIndicadores((prev) => selectedInd
            ? prev.map((i) => i._id === doc._id ? doc : i)
            : [...prev, doc]
          );
          await refrescarAccion();
        }}
      />
    </Paper>
  );
}

function ProyectoSeccion({ proyecto: proyectoInicial, admin, aniosPdi, onEdit, onDelete, onAvanceUpdate, onComputedProgress }: {
  proyecto: Proyecto; admin: boolean;
  aniosPdi: number[];
  onEdit: (p: Proyecto) => void;
  onDelete: (id: string) => void;
  onAvanceUpdate: () => void;
  onComputedProgress: (proyectoId: string, avance: number, semaforo: string) => void;
}) {
  const [proyecto, setProyecto] = useState(proyectoInicial);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [accionModal, setAccionModal] = useState(false);
  const [selectedAccion, setSelectedAccion] = useState<Accion | null>(null);
  const [accionesCount, setAccionesCount] = useState<number | null>(null);

  useEffect(() => { setProyecto(proyectoInicial); }, [proyectoInicial]);

  useEffect(() => {
    axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: proyectoInicial._id } })
      .then(res => setAccionesCount(res.data.length))
      .catch(() => {});
  }, [proyectoInicial._id]);

  const hydrateAcciones = async (accionesBase: Accion[]) => {
    const accionesConIndicadores = await Promise.all(
      accionesBase.map(async (accionItem) => {
        try {
          const res = await axios.get(PDI_ROUTES.indicadores(), { params: { accion_id: accionItem._id } });
          const indicadoresAccion = res.data as Indicador[];
          if (!indicadoresAccion.length) return accionItem;

          const avance = getWeightedProgress(indicadoresAccion, (ind) => getIndicadorAvancePonderado(ind));
          return {
            ...accionItem,
            avance,
            semaforo: getSemaforoByAvance(avance) as any,
          };
        } catch {
          return accionItem;
        }
      })
    );

    return accionesConIndicadores;
  };

  useEffect(() => {
    if (loaded) return;
    if (!open) return;
    setLoading(true);
    axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: proyecto._id } })
      .then(async (res) => {
        const accionesHydrated = await hydrateAcciones(res.data);
        setAcciones(accionesHydrated);
        setLoaded(true);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [loaded, open, proyecto._id]);

  const refrescarProyecto = async () => {
    try {
      const [resProyecto, resAcciones] = await Promise.all([
        axios.get(PDI_ROUTES.proyecto(proyecto._id)),
        axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: proyecto._id } }),
      ]);
      setProyecto(resProyecto.data);
      setAcciones(await hydrateAcciones(resAcciones.data));
      onAvanceUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAccion = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar acción estratégica",
      children: <Text size="sm">¿Seguro que deseas eliminar esta acción?</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.accion(id));
          setAcciones((prev) => prev.filter((a) => a._id !== id));
          showNotification({ title: "Eliminada", message: "Acción eliminada", color: "teal" });
          await refrescarProyecto();
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const handleComputedAccionProgress = useCallback((accionId: string, avance: number, semaforo: string) => {
    setAcciones((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        if (item._id !== accionId) return item;
        if (Number(item.avance) === avance && item.semaforo === semaforo) return item;
        changed = true;
        return { ...item, avance, semaforo: semaforo as any };
      });
      return changed ? next : prev;
    });
  }, []);

  const avanceProyecto = acciones.length
    ? getWeightedProgress(acciones, (accion) => Number(accion.avance) || 0)
    : proyecto.avance;
  const presupuestoProyecto = Number(proyecto.presupuesto || 0);
  const presupuestoEjecutadoProyecto = Number(proyecto.presupuesto_ejecutado || 0);
  const semaforoProyecto = getSemaforoByAvance(avanceProyecto);
  const estadoProyectoColorReal = semaforoProyecto === "verde"
    ? "green"
    : semaforoProyecto === "amarillo"
      ? "yellow"
      : "red";

  useEffect(() => {
    onComputedProgress(proyecto._id, avanceProyecto, semaforoProyecto);
  }, [proyecto._id, avanceProyecto, semaforoProyecto, onComputedProgress]);

  return (
    <Paper withBorder radius="xl" p="lg" shadow="sm" mb="lg"
      style={{ background: "linear-gradient(180deg, rgba(124,58,237,0.04) 0%, rgba(255,255,255,0.96) 28%)", transition: "box-shadow .2s, transform .2s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 32px rgba(124,58,237,0.12)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      {/* Header del proyecto */}
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap">
        <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setOpen(v => !v)}>
          <Group gap={8} mb={4} align="center" wrap="wrap">
            <Text size="xxl" fw={800} c="dimmed">{proyecto.codigo}</Text>
            <Badge color={estadoProyectoColorReal} variant="light" radius="xl">
              {semaforoProyecto === "verde" ? "En cumplimiento" : semaforoProyecto === "amarillo" ? "En riesgo" : "Crítico"}
            </Badge>
          </Group>
          <Title order={4}>{proyecto.nombre}</Title>
          {proyecto.responsable && (
            <Text size="sm" c="dimmed" mt={2}>Responsable: <b>{proyecto.responsable}</b></Text>
          )}
          {proyecto.descripcion && (
            <Text size="sm" c="dimmed" mt={2}>Propósito: {proyecto.descripcion}</Text>
          )}
        </div>

        <Group gap={8}>
          {admin && (
            <Button size="sm" variant="light" color="orange" leftSection={<IconPlus size={14} />}
              onClick={() => { setSelectedAccion(null); setAccionModal(true); }}>
              Nueva acción
            </Button>
          )}
          {admin && <>
            <ActionIcon size="lg" variant="subtle" color="blue" onClick={() => onEdit(proyecto)}><IconEdit size={18} /></ActionIcon>
            <ActionIcon size="lg" variant="subtle" color="red" onClick={() => onDelete(proyecto._id)}><IconTrash size={18} /></ActionIcon>
          </>}
          <ActionIcon variant="subtle" color="blue" onClick={() => setOpen(v => !v)}>
            <IconChevronRight size={18} style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .2s" }} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Cajas de stats */}
      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm" mb="md">
        {[
          { label: "Avance", value: `${avanceProyecto}%` },
          { label: "Peso", value: `${Number(proyecto.peso).toFixed(2)}%` },
          { label: "Acciones", value: loaded ? acciones.length : (accionesCount ?? "—") },
          { label: "Presupuesto", value: formatCOP(presupuestoProyecto) },
          { label: "Causado", value: presupuestoEjecutadoProyecto > 0 ? formatCOP(presupuestoEjecutadoProyecto) : "$ 0" },
        ].map((item) => (
          <Box key={item.label} style={{ textAlign: "center", background: "rgba(255,255,255,0.82)", border: "1px solid rgba(124,58,237,0.08)", borderRadius: 16, padding: "12px 8px" }}>
            <Text fw={800} size="1.1rem" lh={1}>{item.value}</Text>
            <Text size="xs" c="dimmed" mt={4}>{item.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      {/* Barra de avance */}
      <Box mb="md">
        <Group justify="space-between" mb={6}>
          <Text size="xs" c="dimmed">Avance del proyecto</Text>
          <Text size="xs" fw={700}>{avanceProyecto}%</Text>
        </Group>
        <Progress value={Math.min(Math.max(avanceProyecto, 0), 100)} color={estadoProyectoColorReal} size="md" radius="xl" />
      </Box>

      {open && (
        <>
          <Group justify="space-between" align="center" mb="md">
            <div>
              <Text fw={700} style={{ background: "linear-gradient(90deg, #f97316, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                Acciones estratégicas
              </Text>
            </div>
            {acciones.length > 0 && (
              <Badge variant="outline" color="orange" radius="xl">
                {acciones.length} accion{acciones.length !== 1 ? "es" : ""}
              </Badge>
            )}
          </Group>

          {loading ? (
            <Center py="lg"><Loader size="sm" /></Center>
          ) : acciones.length === 0 ? (
            <Paper
              withBorder
              radius="lg"
              p="xl"
              style={{ borderStyle: "dashed", background: "var(--mantine-color-default-hover)" }}
            >
              <Stack align="center" gap={6}>
                <ThemeIcon size={44} radius="xl" color="orange" variant="light">
                  <IconBulb size={20} />
                </ThemeIcon>
                <Text fw={600}>Este proyecto aún no tiene acciones</Text>
                <Text size="sm" c="dimmed" ta="center">
                  Crea la primera acción estratégica para organizar responsables, seguimiento e indicadores.
                </Text>
                {admin && (
                  <Button
                    size="sm"
                    color="orange"
                    leftSection={<IconPlus size={14} />}
                    onClick={() => { setSelectedAccion(null); setAccionModal(true); }}
                  >
                    Crear primera acción
                  </Button>
                )}
              </Stack>
            </Paper>
          ) : (
            <Stack gap="md">
              {acciones.map((accion) => (
                <AccionCard
                  key={accion._id}
                  accion={accion}
                  admin={admin}
                  aniosPdi={aniosPdi}
                  onEdit={(item) => { setSelectedAccion(item); setAccionModal(true); }}
                  onDelete={handleDeleteAccion}
                  onAvanceUpdate={refrescarProyecto}
                  onComputedProgress={handleComputedAccionProgress}
                />
              ))}
            </Stack>
          )}
        </>
      )}

      <AccionModal
        opened={accionModal}
        onClose={() => setAccionModal(false)}
        selected={selectedAccion}
        defaultProyectoId={proyecto._id}
        onSaved={async (doc) => {
          setAcciones((prev) => selectedAccion
            ? prev.map((a) => a._id === doc._id ? doc : a)
            : [...prev, doc]
          );
          await refrescarProyecto();
        }}
      />
    </Paper>
  );
}

export default function MacroproyectoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const macroId = params?.macroId as string;
  const { userRole } = useRole();
  const { config } = usePdiConfig();
  const admin = isAdmin(userRole);

  const [macro, setMacro] = useState<Macroproyecto | null>(null);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [macros, setMacros] = useState<Macroproyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [macroModal, setMacroModal] = useState(false);
  const [proyectoModal, setProyectoModal] = useState(false);
  const [selectedProyecto, setSelectedProyecto] = useState<Proyecto | null>(null);

  useEffect(() => {
    if (!macroId) return;
    Promise.all([
      axios.get(PDI_ROUTES.macroproyecto(macroId)),
      axios.get(PDI_ROUTES.proyectos(), { params: { macroproyecto_id: macroId } }),
      axios.get(PDI_ROUTES.macroproyectos()),
    ])
      .then(([resMacro, resProyectos, resMacros]) => {
        setMacro(resMacro.data);
        setProyectos(resProyectos.data);
        setMacros(resMacros.data);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [macroId]);

  const refrescarMacro = async () => {
    try {
      const [resMacro, resProyectos] = await Promise.all([
        axios.get(PDI_ROUTES.macroproyecto(macroId)),
        axios.get(PDI_ROUTES.proyectos(), { params: { macroproyecto_id: macroId } }),
      ]);
      setMacro(resMacro.data);
      setProyectos(resProyectos.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteProyecto = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar proyecto",
      children: <Text size="sm">¿Seguro que deseas eliminar este proyecto?</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.proyecto(id));
          setProyectos((prev) => prev.filter((p) => p._id !== id));
          showNotification({ title: "Eliminado", message: "Proyecto eliminado", color: "teal" });
          await refrescarMacro();
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const avanceMacro = macro
    ? macro.avance
    : 0;
  const semaforoMacro = macro?.semaforo ?? getSemaforoByAvance(avanceMacro);
  const presupuestoMacro = Number(macro?.presupuesto) || 0;
  const presupuestoEjecutadoMacro = Number(macro?.presupuesto_ejecutado) || 0;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "20px 28px",
            borderBottom: "1px solid var(--mantine-color-default-border)",
            background: "var(--mantine-color-body)",
            flexShrink: 0,
          }}
        >
          {loading || !macro ? (
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}><IconArrowLeft size={18} /></ActionIcon>
              <Loader size="sm" />
            </Group>
          ) : (
            <Group justify="space-between" align="center" wrap="wrap">
              <Group gap={12}>
                <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}><IconArrowLeft size={18} /></ActionIcon>
                <ThemeIcon size={46} radius="xl" color="violet" variant="light">
                  <IconChartBarPopular size={22} />
                </ThemeIcon>
                <div>
                  <Group gap={8} wrap="wrap">
                    <Title order={3}>{macro.nombre}</Title>
                    <Badge color={SEMAFORO_COLOR[semaforoMacro]} variant="light" radius="xl">
                      {SEMAFORO_LABEL[semaforoMacro]}
                    </Badge>
                  </Group>
                  <Group gap={12} mt={4} wrap="wrap">
                    <Text size="sm" c="dimmed">Código: <b>{macro.codigo}</b></Text>
                    <Text size="sm" c="dimmed">Peso: <b>{macro.peso}%</b></Text>
                    {macro.lider && (
                      <Text size="sm" c="dimmed">Líder: <b>{macro.lider}</b></Text>
                    )}
                    {presupuestoMacro > 0 && (
                      <Text size="sm" c="dimmed">
                        Presupuesto: <b>{formatCOP(presupuestoMacro)}</b>
                        {presupuestoEjecutadoMacro > 0 && (
                          <> · Causado: <b>{formatCOP(presupuestoEjecutadoMacro)}</b></>
                        )}
                      </Text>
                    )}
                    <Group gap={8}>
                      <Text size="sm" c="dimmed">Avance global</Text>
                      <Box style={{ width: 120 }}>
                        <AvanceBar avance={avanceMacro} semaforo={semaforoMacro} />
                      </Box>
                    </Group>
                  </Group>
                </div>
              </Group>

              <Group gap={8}>
                {admin && (
                  <>
                    <Button
                      size="sm"
                      variant="light"
                      color="violet"
                      leftSection={<IconEdit size={14} />}
                      onClick={() => setMacroModal(true)}
                    >
                      Editar macro
                    </Button>
                    <Button
                      size="sm"
                      color="blue"
                      leftSection={<IconPlus size={14} />}
                      onClick={() => { setSelectedProyecto(null); setProyectoModal(true); }}
                    >
                      Nuevo proyecto
                    </Button>
                  </>
                )}
                <Badge variant="outline" color="violet" radius="xl" size="lg">
                  {proyectos.length} proyecto{proyectos.length !== 1 ? "s" : ""}
                </Badge>
              </Group>
            </Group>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "28px" }}>
          {loading ? (
            <Center style={{ height: "100%" }}><Loader /></Center>
          ) : proyectos.length === 0 ? (
            <Center style={{ height: "60vh" }}>
              <Paper withBorder radius="xl" p="xl" shadow="sm" maw={520}>
                <Stack align="center" gap="xs">
                  <ThemeIcon size={56} radius="xl" color="blue" variant="light">
                    <IconFolderOpen size={28} />
                  </ThemeIcon>
                  <Text fw={700} size="lg">Sin proyectos registrados</Text>
                  <Text size="sm" c="dimmed" ta="center">
                    Crea el primer proyecto de este macroproyecto para empezar a organizar acciones e indicadores.
                  </Text>
                  {admin && (
                    <Button
                      leftSection={<IconPlus size={14} />}
                      color="blue"
                      mt="sm"
                      onClick={() => { setSelectedProyecto(null); setProyectoModal(true); }}
                    >
                      Nuevo proyecto
                    </Button>
                  )}
                </Stack>
              </Paper>
            </Center>
          ) : (
            <Stack gap="xl">
              {proyectos.map((proyecto) => (
                <ProyectoSeccion
                  key={proyecto._id}
                  proyecto={proyecto}
                  admin={admin}
                  aniosPdi={config.anios}
                  onEdit={(item) => { setSelectedProyecto(item); setProyectoModal(true); }}
                  onDelete={handleDeleteProyecto}
                  onAvanceUpdate={refrescarMacro}
                  onComputedProgress={() => {}}
                />
              ))}
            </Stack>
          )}
        </div>
      </div>

      {macro && (
        <MacroproyectoModal
          opened={macroModal}
          onClose={() => setMacroModal(false)}
          selected={macro}
          onSaved={(doc) => { setMacro(doc); setMacroModal(false); }}
        />
      )}

      <ProyectoModal
        opened={proyectoModal}
        onClose={() => setProyectoModal(false)}
        selected={selectedProyecto}
        macroproyectos={macros}
        defaultMacroId={macroId}
        onSaved={async (doc) => {
          setProyectos((prev) => selectedProyecto
            ? prev.map((p) => p._id === doc._id ? doc : p)
            : [...prev, doc]
          );
          await refrescarMacro();
        }}
      />
    </div>
  );
}
