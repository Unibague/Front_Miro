"use client";

import { useState, useEffect } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Button, Stack,
  Loader, Center, Progress, ThemeIcon, Divider, ActionIcon,
  SimpleGrid, Box, Modal, TextInput, NumberInput,
} from "@mantine/core";
import {
  IconChartBarPopular, IconArrowLeft, IconChevronRight,
  IconTarget, IconBulb, IconTrendingUp, IconEdit, IconTrash, IconPlus,
  IconFlag, IconAlertTriangle,
  IconListCheck, IconExternalLink, IconSettings,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import type { Macroproyecto, Proyecto, Accion, Indicador } from "./types";
import { PDI_ROUTES } from "./api";
import MacroproyectoModal from "./components/MacroproyectoModal";
import ProyectoModal from "./components/ProyectoModal";
import AccionModal from "./components/AccionModal";
import IndicadorModal from "./components/IndicadorModal";
import PdiSidebar from "./components/PdiSidebar";
import PdiResumenSidebar from "./components/PdiResumenSidebar";
import { usePdiConfig } from "./hooks/usePdiConfig";

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "Cumplimiento adecuado", amarillo: "Requiere atención", rojo: "Crítico",
};
const isAdmin = (role: string) => role === "Administrador";
const formatAnioRange = (anioInicio?: number, anioFin?: number) =>
  anioInicio && anioFin ? `${anioInicio} - ${anioFin}` : "Sin rango definido";

function SemaforoBadge({ semaforo }: { semaforo: string }) {
  return <Badge color={SEMAFORO_COLOR[semaforo]} variant="light" size="sm">{SEMAFORO_LABEL[semaforo]}</Badge>;
}
function AvanceBar({ avance, semaforo }: { avance: number; semaforo: string }) {
  return (
    <Group gap={6} align="center">
      <Progress value={avance} color={SEMAFORO_COLOR[semaforo]} size="sm" style={{ flex: 1, minWidth: 80 }} />
      <Text size="xs" fw={600} w={36} ta="right">{avance}%</Text>
    </Group>
  );
}

function PdiConfigModal({
  opened,
  onClose,
  initialConfig,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  initialConfig: {
    nombre: string;
    descripcion: string;
    anio_inicio: number;
    anio_fin: number;
  };
  onSaved: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(initialConfig.nombre);
  const [descripcion, setDescripcion] = useState(initialConfig.descripcion);
  const [anioInicio, setAnioInicio] = useState<number | string>(initialConfig.anio_inicio);
  const [anioFin, setAnioFin] = useState<number | string>(initialConfig.anio_fin);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setNombre(initialConfig.nombre);
    setDescripcion(initialConfig.descripcion);
    setAnioInicio(initialConfig.anio_inicio);
    setAnioFin(initialConfig.anio_fin);
  }, [opened, initialConfig]);

  const handleSave = async () => {
    if (!String(nombre).trim()) {
      showNotification({ title: "Error", message: "El nombre del PDI es requerido", color: "red" });
      return;
    }
    if (!anioInicio || !anioFin) {
      showNotification({ title: "Error", message: "Define el año inicial y el año final", color: "red" });
      return;
    }
    if (Number(anioInicio) > Number(anioFin)) {
      showNotification({ title: "Error", message: "El año inicial no puede ser mayor al final", color: "red" });
      return;
    }

    setLoading(true);
    try {
      await axios.put(PDI_ROUTES.config(), {
        nombre: String(nombre).trim(),
        descripcion: String(descripcion).trim(),
        anio_inicio: Number(anioInicio),
        anio_fin: Number(anioFin),
      });
      await onSaved();
      showNotification({ title: "Actualizado", message: "ConfiguraciÃ³n del PDI guardada", color: "teal" });
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "No se pudo guardar la configuraciÃ³n", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Editar PDI" centered size="md">
      <Stack gap="sm">
        <TextInput label="Nombre del PDI" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
        <TextInput label="Título descriptivo" value={descripcion} onChange={(e) => setDescripcion(e.currentTarget.value)} />
        <Group grow>
          <NumberInput label="Año inicial" value={anioInicio} onChange={setAnioInicio} allowDecimal={false} />
          <NumberInput label="Año final" value={anioFin} onChange={setAnioFin} allowDecimal={false} />
        </Group>
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button color="violet" loading={loading} onClick={handleSave}>Guardar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── Indicador ──────────────────────────────────────────────────────────────
function IndicadorCard({ ind, admin, aniosPdi, onEdit, onDelete }: {
  ind: Indicador; admin: boolean;
  aniosPdi: number[];
  onEdit: (i: Indicador) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const aniosMostrados = aniosPdi.length
    ? aniosPdi
    : Object.keys(ind.avances_por_anio ?? {})
        .map((anio) => Number(anio))
        .filter((anio) => !Number.isNaN(anio))
        .sort((a, b) => a - b);
  const anioMeta = aniosMostrados[aniosMostrados.length - 1];
  return (
    <Paper
      withBorder
      radius="sm"
      p="sm"
      style={{ backgroundColor: "var(--mantine-color-body)", cursor: "pointer" }}
      onClick={() => router.push(`/pdi/indicadores/${ind._id}`)}
    >
      <Group justify="space-between" mb={4}>
        <Group gap={6}>
          <ThemeIcon size={22} radius="xl" color="violet" variant="light"><IconTarget size={13} /></ThemeIcon>
          <Text size="xs" fw={700} c="dimmed">{ind.codigo}</Text>
        </Group>
        <Group gap={4}>
          <SemaforoBadge semaforo={ind.semaforo} />
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); onEdit(ind); }}><IconEdit size={13} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); onDelete(ind._id); }}><IconTrash size={13} /></ActionIcon>
          </>}
        </Group>
      </Group>
      <Text size="sm" fw={600} mb={4}>{ind.nombre}</Text>
      {ind.indicador_resultado && <Text size="xs" c="dimmed" mb={6}>{ind.indicador_resultado}</Text>}
      <AvanceBar avance={ind.avance} semaforo={ind.semaforo} />
      <Group gap={8} mt={6} wrap="wrap">
        <Text size="xs" c="dimmed">Peso: <b>{ind.peso}%</b></Text>
        {ind.responsable && <Text size="xs" c="dimmed">Resp: <b>{ind.responsable}</b></Text>}
        {ind.tipo_seguimiento && <Text size="xs" c="dimmed">Seguimiento: <b>{ind.tipo_seguimiento}</b></Text>}
        {ind.meta_final_2029 != null && <Text size="xs" c="dimmed">Meta {anioMeta ?? "final"}: <b>{ind.meta_final_2029}</b></Text>}
        {ind.avance_total_real != null && <Text size="xs" c="dimmed">Avance real: <b>{ind.avance_total_real}%</b></Text>}
      </Group>
      {ind.periodos.length > 0 && <>
        <Button variant="subtle" size="xs" mt={6} p={0} onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}>
          {open ? "Ocultar periodos" : `Ver periodos (${ind.periodos.length})`}
        </Button>
        {open && (
          <Paper withBorder radius="xs" p="xs" mt={6} style={{ overflowX: "auto" }} onClick={(e) => e.stopPropagation()}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #dee2e6" }}>
                  {["Periodo","Meta","Avance","% Año"].map(h => (
                    <th key={h} style={{ padding: "4px 8px", textAlign: h === "Periodo" ? "left" : "right" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ind.periodos.map((p) => {
                  const avAnio = ind.avances_por_anio?.[p.periodo.slice(0,4)];
                  return (
                    <tr key={p.periodo} style={{ borderBottom: "1px solid #f1f3f5" }}>
                      <td style={{ padding: "4px 8px" }}>{p.periodo}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{p.meta ?? "—"}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{p.avance ?? "—"}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{avAnio != null ? `${avAnio}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {aniosMostrados.length > 0 && (
              <Group gap={8} mt={6} wrap="wrap">
                {aniosMostrados.map(a => {
                  const key = String(a);
                  const val = ind.avances_por_anio?.[key];
                  return (
                    <Badge key={a} size="xs" variant="outline" color={val != null ? "violet" : "gray"}>
                      {a}: {val != null ? `${val}%` : "—"}
                    </Badge>
                  );
                })}
              </Group>
            )}
          </Paper>
        )}
      </>}
      {ind.observaciones && <Text size="xs" c="dimmed" mt={6}>Observaciones: {ind.observaciones}</Text>}
    </Paper>
  );
}

// ── Acción Estratégica ─────────────────────────────────────────────────────
function AccionCard({ accion: accionInicial, admin, aniosPdi, onEdit, onDelete, onAvanceUpdate }: {
  accion: Accion; admin: boolean;
  aniosPdi: number[];
  onEdit: (a: Accion) => void;
  onDelete: (id: string) => void;
  onAvanceUpdate: () => void;  // refresca el proyecto padre
}) {
  const [accion, setAccion] = useState(accionInicial);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [indModal, setIndModal] = useState(false);
  const [selectedInd, setSelectedInd] = useState<Indicador | null>(null);

  // Sincronizar si el padre actualiza la acción
  useEffect(() => { setAccion(accionInicial); }, [accionInicial]);

  const cargar = async () => {
    if (loaded) { setOpen(v => !v); return; }
    setLoading(true);
    try {
      const res = await axios.get(PDI_ROUTES.indicadores(), { params: { accion_id: accion._id } });
      setIndicadores(res.data);
      setLoaded(true);
      setOpen(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Refresca la acción desde el back y notifica al proyecto padre
  const refrescarAccion = async () => {
    try {
      const res = await axios.get(PDI_ROUTES.accion(accion._id));
      setAccion(res.data);
      onAvanceUpdate(); // sube al proyecto
    } catch (e) { console.error(e); }
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
          setIndicadores(prev => prev.filter(i => i._id !== id));
          showNotification({ title: "Eliminado", message: "Indicador eliminado", color: "teal" });
          await refrescarAccion();
        } catch { showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" }); }
      },
    });
  };

  return (
    <Paper withBorder radius="sm" p="sm" mb={6}>
      <Group justify="space-between" mb={4}>
        <Group gap={6}>
          <ThemeIcon size={22} radius="xl" color="orange" variant="light"><IconBulb size={13} /></ThemeIcon>
          <Text size="xs" fw={700} c="dimmed">{accion.codigo}</Text>
        </Group>
        <Group gap={4}>
          <SemaforoBadge semaforo={accion.semaforo} />
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => onEdit(accion)}><IconEdit size={13} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onDelete(accion._id)}><IconTrash size={13} /></ActionIcon>
          </>}
        </Group>
      </Group>
      <Text size="sm" fw={600} mb={2}>{accion.nombre}</Text>
      {accion.alcance && <Text size="xs" c="dimmed" mb={6}>{accion.alcance}</Text>}
      {accion.responsable && <Text size="xs" c="dimmed" mb={6}>Resp: <b>{accion.responsable}</b></Text>}
      <AvanceBar avance={accion.avance} semaforo={accion.semaforo} />
      <Group gap={8} mt={4}>
        <Text size="xs" c="dimmed">Peso: <b>{accion.peso}%</b></Text>
        <Button variant="subtle" size="xs" p={0} loading={loading} rightSection={<IconChevronRight size={12} />} onClick={cargar}>
          {open ? "Ocultar indicadores" : "Ver indicadores"}
        </Button>
        {admin && open && (
          <Button size="xs" variant="light" color="violet" leftSection={<IconPlus size={12} />}
            onClick={() => { setSelectedInd(null); setIndModal(true); }}>
            Nuevo indicador
          </Button>
        )}
      </Group>
      {open && (
        <Stack gap={6} mt={8}>
          {indicadores.length === 0
            ? <Text size="xs" c="dimmed">Sin indicadores registrados</Text>
            : indicadores.map(ind => (
              <IndicadorCard key={ind._id} ind={ind} admin={admin} aniosPdi={aniosPdi}
                onEdit={(i) => { setSelectedInd(i); setIndModal(true); }}
                onDelete={handleDeleteInd}
              />
            ))
          }
        </Stack>
      )}
      <IndicadorModal
        opened={indModal}
        onClose={() => setIndModal(false)}
        selected={selectedInd}
        defaultAccionId={accion._id}
        onSaved={async (doc) => {
          setIndicadores(prev => selectedInd
            ? prev.map(i => i._id === doc._id ? doc : i)
            : [...prev, doc]
          );
          await refrescarAccion(); // refresca avance de la acción y sube en cascada
        }}
      />
    </Paper>
  );
}

// ── Proyecto ───────────────────────────────────────────────────────────────
function ProyectoCard({ proyecto: proyectoInicial, admin, aniosPdi, onEdit, onDelete, onAvanceUpdate }: {
  proyecto: Proyecto; admin: boolean;
  aniosPdi: number[];
  onEdit: (p: Proyecto) => void;
  onDelete: (id: string) => void;
  onAvanceUpdate: () => void; // refresca el macroproyecto padre
}) {
  const [proyecto, setProyecto] = useState(proyectoInicial);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [accionModal, setAccionModal] = useState(false);
  const [selectedAccion, setSelectedAccion] = useState<Accion | null>(null);

  useEffect(() => { setProyecto(proyectoInicial); }, [proyectoInicial]);

  const cargar = async () => {
    if (loaded) { setOpen(v => !v); return; }
    setLoading(true);
    try {
      const res = await axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: proyecto._id } });
      setAcciones(res.data);
      setLoaded(true);
      setOpen(true);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Refresca el proyecto desde el back y notifica al macroproyecto padre
  const refrescarProyecto = async () => {
    try {
      const res = await axios.get(PDI_ROUTES.proyecto(proyecto._id));
      setProyecto(res.data);
      onAvanceUpdate(); // sube al macroproyecto
    } catch (e) { console.error(e); }
  };

  // Refresca una acción específica en el estado local
  const refrescarAccion = async (accionId: string) => {
    try {
      const res = await axios.get(PDI_ROUTES.accion(accionId));
      setAcciones(prev => prev.map(a => a._id === accionId ? res.data : a));
      await refrescarProyecto();
    } catch (e) { console.error(e); }
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
          setAcciones(prev => prev.filter(a => a._id !== id));
          showNotification({ title: "Eliminada", message: "Acción eliminada", color: "teal" });
          await refrescarProyecto();
        } catch { showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" }); }
      },
    });
  };

  return (
    <Paper withBorder radius="md" p="md" mb={8}>
      <Group justify="space-between" mb={6}>
        <Group gap={8}>
          <ThemeIcon size={26} radius="xl" color="blue" variant="light"><IconTrendingUp size={15} /></ThemeIcon>
          <div>
            <Text size="xs" fw={700} c="dimmed">{proyecto.codigo}</Text>
            <Text size="sm" fw={700}>{proyecto.nombre}</Text>
          </div>
        </Group>
        <Group gap={4}>
          <SemaforoBadge semaforo={proyecto.semaforo} />
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => onEdit(proyecto)}><IconEdit size={13} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onDelete(proyecto._id)}><IconTrash size={13} /></ActionIcon>
          </>}
        </Group>
      </Group>
      <AvanceBar avance={proyecto.avance} semaforo={proyecto.semaforo} />
      <Group gap={12} mt={6}>
        <Text size="xs" c="dimmed">Peso: <b>{proyecto.peso}%</b></Text>
        <Text size="xs" c="dimmed">Formulador: <b>{proyecto.formulador}</b></Text>
        <Button variant="subtle" size="xs" p={0} loading={loading} rightSection={<IconChevronRight size={12} />} onClick={cargar}>
          {open ? "Ocultar acciones" : "Ver acciones estratégicas"}
        </Button>
        {admin && open && (
          <Button size="xs" variant="light" color="orange" leftSection={<IconPlus size={12} />}
            onClick={() => { setSelectedAccion(null); setAccionModal(true); }}>
            Nueva acción
          </Button>
        )}
      </Group>
      {open && (
        <Stack gap={4} mt={10}>
          {acciones.length === 0
            ? <Text size="xs" c="dimmed">Sin acciones estratégicas registradas</Text>
            : acciones.map(a => (
              <AccionCard key={a._id} accion={a} admin={admin} aniosPdi={aniosPdi}
                onEdit={(ac) => { setSelectedAccion(ac); setAccionModal(true); }}
                onDelete={handleDeleteAccion}
                onAvanceUpdate={() => refrescarAccion(a._id)}
              />
            ))
          }
        </Stack>
      )}
      <AccionModal
        opened={accionModal}
        onClose={() => setAccionModal(false)}
        selected={selectedAccion}
        defaultProyectoId={proyecto._id}
        onSaved={async (doc) => {
          setAcciones(prev => selectedAccion
            ? prev.map(a => a._id === doc._id ? doc : a)
            : [...prev, doc]
          );
          await refrescarProyecto();
        }}
      />
    </Paper>
  );
}

// ── Stats cards ───────────────────────────────────────────────────────────
function StatsCards({ macros, proyectosPorMacro, accionesPorMacro, indicadoresPorMacro }: {
  macros: Macroproyecto[];
  proyectosPorMacro: Record<string, Proyecto[]>;
  accionesPorMacro: Record<string, number>;
  indicadoresPorMacro: Record<string, number>;
}) {
  const totalProyectos = Object.values(proyectosPorMacro).flat().length;
  const totalAcciones = Object.values(accionesPorMacro).reduce((s, n) => s + n, 0);
  const totalIndicadores = Object.values(indicadoresPorMacro).reduce((s, n) => s + n, 0);

  // Avance ponderado real: suma(avance * peso) / suma(peso)
  const pesosTotal = macros.reduce((s, m) => s + (m.peso ?? 0), 0);
  const avancePonderado = pesosTotal > 0
    ? Math.round(macros.reduce((s, m) => s + m.avance * (m.peso ?? 0), 0) / pesosTotal)
    : 0;

  const criticos = macros.filter(m => m.semaforo === "rojo").length;
  const amarillos = macros.filter(m => m.semaforo === "amarillo").length;
  const verdes = macros.filter(m => m.semaforo === "verde").length;
  const sinAvance = macros.filter(m => m.avance === 0).length;
  const alertas = criticos + amarillos;

  // Color dinámico del avance ponderado
  const avanceColor = avancePonderado >= 70 ? "green" : avancePonderado >= 40 ? "blue" : avancePonderado >= 20 ? "orange" : "red";
  const avanceBadge = avancePonderado >= 70 ? "Buen ritmo" : avancePonderado >= 40 ? "En progreso" : avancePonderado >= 20 ? "Atención" : "Crítico";

  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} mb="xl">

      {/* Tarjeta 1 — Avance ponderado del PDI (métrica clave) */}
      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Group justify="space-between" align="flex-start" mb="sm">
          <ThemeIcon size={52} radius="xl" color={avanceColor} variant="light">
            <IconTrendingUp size={24} />
          </ThemeIcon>
          <Badge color={avanceColor} variant="light" size="sm" radius="xl">{avanceBadge}</Badge>
        </Group>
        <Text size="xs" c="dimmed" mb={2}>Avance ponderado del PDI</Text>
        <Text size="2rem" fw={800} lh={1} mb={6}>{avancePonderado}%</Text>
        <Progress value={avancePonderado} color={avanceColor} size="sm" radius="xl" mb={6} />
        <Text size="xs" c="dimmed">
          {macros.filter(m => m.avance >= 50).length} de {macros.length} macros al 50%+
        </Text>
      </Paper>

      {/* Tarjeta 2 — Estado semáforo del PDI */}
      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Group justify="space-between" align="flex-start" mb="sm">
          <ThemeIcon size={52} radius="xl" color={criticos > 0 ? "red" : amarillos > 0 ? "orange" : "green"} variant="light">
            <IconFlag size={24} />
          </ThemeIcon>
          <Badge color={criticos > 0 ? "red" : amarillos > 0 ? "orange" : "green"} variant="light" size="sm" radius="xl">
            {criticos > 0 ? "Crítico" : amarillos > 0 ? "En riesgo" : "Cumplimiento"}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed" mb={2}>Estado del PDI</Text>
        <Text size="2rem" fw={800} lh={1} mb={4}>{verdes}/{macros.length}</Text>
        <Text size="xs" c="dimmed">macros en cumplimiento</Text>
        <Group gap={6} mt={8} wrap="wrap">
          {verdes > 0 && <Badge size="xs" color="green" variant="dot">{verdes} verde</Badge>}
          {amarillos > 0 && <Badge size="xs" color="orange" variant="dot">{amarillos} riesgo</Badge>}
          {criticos > 0 && <Badge size="xs" color="red" variant="dot">{criticos} crítico</Badge>}
        </Group>
      </Paper>

      {/* Tarjeta 3 — Estructura del PDI */}
      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Group justify="space-between" align="flex-start" mb="sm">
          <ThemeIcon size={52} radius="xl" color="violet" variant="light">
            <IconChartBarPopular size={24} />
          </ThemeIcon>
          <Badge color="violet" variant="light" size="sm" radius="xl">Estructura</Badge>
        </Group>
        <Text size="xs" c="dimmed" mb={2}>Jerarquía del PDI</Text>
        <Text size="2rem" fw={800} lh={1} mb={4}>{totalIndicadores}</Text>
        <Text size="xs" c="dimmed">indicadores de seguimiento</Text>
        <Group gap={6} mt={8} wrap="wrap">
          <Badge size="xs" color="violet" variant="outline">{macros.length} macros</Badge>
          <Badge size="xs" color="blue" variant="outline">{totalProyectos} proyectos</Badge>
          <Badge size="xs" color="orange" variant="outline">{totalAcciones} acciones</Badge>
          <Badge size="xs" color="teal" variant="outline">{totalIndicadores} indicadores</Badge>
        </Group>
      </Paper>

      {/* Tarjeta 4 — Alertas que requieren gestión */}
      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Group justify="space-between" align="flex-start" mb="sm">
          <ThemeIcon size={52} radius="xl" color={alertas > 0 ? "red" : "teal"} variant="light">
            <IconAlertTriangle size={24} />
          </ThemeIcon>
          <Badge color={alertas > 0 ? "red" : "teal"} variant="light" size="sm" radius="xl">
            {alertas > 0 ? "Requiere acción" : "Sin alertas"}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed" mb={2}>Alertas activas</Text>
        <Text size="2rem" fw={800} lh={1} mb={4}>{alertas}</Text>
        <Text size="xs" c="dimmed">
          {alertas === 0
            ? "Todos los macros en seguimiento"
            : `${criticos} crítico${criticos !== 1 ? "s" : ""} · ${amarillos} en riesgo`}
        </Text>
        {sinAvance > 0 && (
          <Text size="xs" c="red" mt={6} fw={600}>
            {sinAvance} macro{sinAvance !== 1 ? "s" : ""} sin avance registrado
          </Text>
        )}
      </Paper>

    </SimpleGrid>
  );
}

// ── MacroproyectoPortfolioCard ─────────────────────────────────────────────
function MacroproyectoPortfolioCard({ macro, proyectos, accionesCount, indicadoresCount, admin, onEdit, onDelete }: {
  macro: Macroproyecto;
  proyectos: Proyecto[];
  accionesCount: number;
  indicadoresCount: number;
  admin: boolean;
  onEdit: (m: Macroproyecto) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const statusLabel = macro.semaforo === "verde" ? "Correcto"
    : macro.semaforo === "amarillo" ? "En riesgo" : "Crítico";
  const statusColor = macro.semaforo === "verde" ? "green"
    : macro.semaforo === "amarillo" ? "yellow" : "red";
  const barColor = macro.avance >= 50 ? "#22c55e" : macro.avance >= 25 ? "#f59e0b" : "#ef4444";

  return (
    <Paper
      withBorder radius="xl" p="lg" shadow="xs"
      style={{ transition: "box-shadow .2s, transform .2s", cursor: "default" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.10)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      <Group justify="space-between" align="flex-start" mb="xs">
        <Text fw={700} size="lg" style={{ flex: 1, lineHeight: 1.3 }}>{macro.nombre}</Text>
        <Group gap={4}>
          <Badge color={statusColor} variant="light" size="sm" radius="xl">{statusLabel}</Badge>
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => onEdit(macro)}><IconEdit size={13} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onDelete(macro._id)}><IconTrash size={13} /></ActionIcon>
          </>}
        </Group>
      </Group>

      <Text size="xs" c="dimmed" mb="md">{macro.codigo} · Peso: {macro.peso}%</Text>

      <Group justify="space-between" align="flex-end" mb={6}>
        <div>
          <Text size="2.2rem" fw={800} lh={1}>{macro.avance}%</Text>
          <Text size="xs" c="dimmed">Avance consolidado</Text>
        </div>
      </Group>

      <Box
        style={{
          height: 10, borderRadius: 99, background: "var(--mantine-color-default-hover)",
          overflow: "hidden", marginBottom: 16,
        }}
      >
        <Box style={{ height: "100%", width: `${macro.avance}%`, background: barColor, borderRadius: 99, transition: "width .4s" }} />
      </Box>

      <SimpleGrid cols={3} mb="md">
        {[
          { label: "Proyectos", value: proyectos.length },
          { label: "Acciones", value: accionesCount },
          { label: "Indicadores", value: indicadoresCount },
        ].map(s => (
          <Box key={s.label} style={{ textAlign: "center", background: "var(--mantine-color-default-hover)", borderRadius: 12, padding: "10px 4px" }}>
            <Text fw={800} size="xl" lh={1}>{s.value}</Text>
            <Text size="xs" c="dimmed" mt={2}>{s.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      <Group justify="space-between" align="center">
        <div>
          <Text size="xs" c="dimmed" style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}>Código</Text>
          <Text fw={600} size="sm">{macro.codigo}</Text>
        </div>
        <Button
          variant="gradient"
          gradient={{ from: "violet", to: "blue", deg: 135 }}
          radius="xl" size="sm"
          rightSection={<IconExternalLink size={14} />}
          onClick={() => router.push(`/pdi/${macro._id}`)}
        >
          Ver detalle
        </Button>
      </Group>
    </Paper>
  );
}

// ── Página principal PDI ───────────────────────────────────────────────────
export default function PdiPage() {
  const router = useRouter();
  const { userRole } = useRole();
  const admin = isAdmin(userRole);
  const { config, refresh: refreshConfig } = usePdiConfig();

  const [macros, setMacros] = useState<Macroproyecto[]>([]);
  const [proyectosPorMacro, setProyectosPorMacro] = useState<Record<string, Proyecto[]>>({});
  const [accionesPorMacro, setAccionesPorMacro] = useState<Record<string, number>>({});
  const [indicadoresPorMacro, setIndicadoresPorMacro] = useState<Record<string, number>>({});
  const [loadingMacros, setLoadingMacros] = useState(true);
  const [macroModal, setMacroModal] = useState(false);
  const [configModal, setConfigModal] = useState(false);
  const [selectedMacro, setSelectedMacro] = useState<Macroproyecto | null>(null);

  const cargarPortfolio = async () => {
    try {
      const [macrosRes, proyectosRes, accionesRes, indicadoresRes] = await Promise.all([
        axios.get(PDI_ROUTES.macroproyectos()),
        axios.get(PDI_ROUTES.proyectos()),
        axios.get(PDI_ROUTES.acciones()),
        axios.get(PDI_ROUTES.indicadores()),
      ]);

      const macrosData: Macroproyecto[] = macrosRes.data;
      const proyectosData: Proyecto[] = proyectosRes.data;
      const accionesData: Accion[] = accionesRes.data;
      const indicadoresData: Indicador[] = indicadoresRes.data;

      const proyectosMap = macrosData.reduce<Record<string, Proyecto[]>>((acc, macro) => {
        acc[macro._id] = proyectosData.filter((proyecto) => proyecto.macroproyecto_id?._id === macro._id);
        return acc;
      }, {});

      const proyectoToMacroMap = proyectosData.reduce<Record<string, string>>((acc, proyecto) => {
        if (proyecto.macroproyecto_id?._id) {
          acc[proyecto._id] = proyecto.macroproyecto_id._id;
        }
        return acc;
      }, {});

      const accionToMacroMap = accionesData.reduce<Record<string, string>>((acc, accion) => {
        const proyectoId = accion.proyecto_id?._id;
        const macroId = proyectoId ? proyectoToMacroMap[proyectoId] : undefined;
        if (macroId) {
          acc[accion._id] = macroId;
        }
        return acc;
      }, {});

      const accionesCountMap = accionesData.reduce<Record<string, number>>((acc, accion) => {
        const proyectoId = accion.proyecto_id?._id;
        const macroId = proyectoId ? proyectoToMacroMap[proyectoId] : undefined;
        if (macroId) {
          acc[macroId] = (acc[macroId] ?? 0) + 1;
        }
        return acc;
      }, {});

      const indicadoresCountMap = indicadoresData.reduce<Record<string, number>>((acc, indicador) => {
        const accionId = indicador.accion_id?._id;
        const macroId = accionId ? accionToMacroMap[accionId] : undefined;
        if (macroId) {
          acc[macroId] = (acc[macroId] ?? 0) + 1;
        }
        return acc;
      }, {});

      setMacros(macrosData);
      setProyectosPorMacro(proyectosMap);
      setAccionesPorMacro(accionesCountMap);
      setIndicadoresPorMacro(indicadoresCountMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMacros(false);
    }
  };

  useEffect(() => {
    cargarPortfolio();
  }, []);

  const refrescarMacro = async (macroId: string) => {
    try {
      const resMacro = await axios.get(PDI_ROUTES.macroproyecto(macroId));
      setMacros(prev => prev.map(m => m._id === macroId ? resMacro.data : m));
    } catch (e) { console.error(e); }
  };

  const handleDeleteMacro = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar macroproyecto",
      children: <Text size="sm">¿Seguro que deseas eliminar este macroproyecto?</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.macroproyecto(id));
          setMacros(prev => prev.filter(m => m._id !== id));
          showNotification({ title: "Eliminado", message: "Macroproyecto eliminado", color: "teal" });
        } catch { showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" }); }
      },
    });
  };

  const handleDeleteProyecto = (macroId: string, id: string) => {
    modals.openConfirmModal({
      title: "Eliminar proyecto",
      children: <Text size="sm">¿Seguro que deseas eliminar este proyecto?</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.proyecto(id));
          setProyectosPorMacro(prev => ({ ...prev, [macroId]: prev[macroId].filter(p => p._id !== id) }));
          showNotification({ title: "Eliminado", message: "Proyecto eliminado", color: "teal" });
          await refrescarMacro(macroId);
        } catch { showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" }); }
      },
    });
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
    <PdiSidebar />
    <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
    <Container size="xl" py="xl">
      <Group mb="lg" justify="space-between">
        <Group gap={10}>
          <ActionIcon variant="subtle" onClick={() => router.push("/dashboard")}>
            <IconArrowLeft size={18} />
          </ActionIcon>
          <ThemeIcon size={40} radius="xl" color="violet" variant="light">
            <IconChartBarPopular size={22} />
          </ThemeIcon>
          <div>
            <Title order={3}>{config.nombre}</Title>
            <Text size="xs" c="dimmed">{formatAnioRange(config.anio_inicio, config.anio_fin)}</Text>
          </div>
        </Group>
        {admin && (
          <Group gap="sm">
            <Button variant="default" leftSection={<IconSettings size={15} />} onClick={() => setConfigModal(true)}>
              Editar PDI
            </Button>
            <Button leftSection={<IconPlus size={15} />} color="violet"
              onClick={() => { setSelectedMacro(null); setMacroModal(true); }}>
              Nuevo macroproyecto
            </Button>
          </Group>
        )}
      </Group>

      <Divider mb="lg" />

      <StatsCards macros={macros} proyectosPorMacro={proyectosPorMacro} accionesPorMacro={accionesPorMacro} indicadoresPorMacro={indicadoresPorMacro} />

      <Group justify="space-between" align="center" mb="md">
        <div>
          <Text fw={700} size="xl">Macroproyectos</Text>
          <Text size="xs" c="dimmed">Vista tipo portfolio — navega la jerarquía del PDI</Text>
        </div>
      </Group>

      {loadingMacros ? (
        <Center py="xl"><Loader /></Center>
      ) : macros.length === 0 ? (
        <Center py="xl"><Text c="dimmed">No hay macroproyectos registrados</Text></Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
          {macros.map(macro => (
            <MacroproyectoPortfolioCard
              key={macro._id}
              macro={macro}
              proyectos={proyectosPorMacro[macro._id] ?? []}
              accionesCount={accionesPorMacro[macro._id] ?? 0}
              indicadoresCount={indicadoresPorMacro[macro._id] ?? 0}
              admin={admin}
              onEdit={(m) => { setSelectedMacro(m); setMacroModal(true); }}
              onDelete={handleDeleteMacro}
            />
          ))}
        </SimpleGrid>
      )}

      <MacroproyectoModal
        opened={macroModal}
        onClose={() => setMacroModal(false)}
        selected={selectedMacro}
        onSaved={async (doc) => {
          setMacros(prev => selectedMacro
            ? prev.map(m => m._id === doc._id ? doc : m)
            : [...prev, doc]
          );
          await cargarPortfolio();
        }}
      />

      <PdiConfigModal
        opened={configModal}
        onClose={() => setConfigModal(false)}
        initialConfig={config}
        onSaved={refreshConfig}
      />

    </Container>
    </div>
    </div>
  );
}
