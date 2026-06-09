"use client";

import { useState, useEffect } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Button, Stack,
  Loader, Center, Progress, ThemeIcon, Divider, ActionIcon,
  SimpleGrid, Box, Modal, TextInput, NumberInput, ScrollArea, List,
} from "@mantine/core";
import {
  IconChartBarPopular, IconArrowLeft, IconChevronRight,
  IconTarget, IconBulb, IconTrendingUp, IconEdit, IconTrash, IconPlus,
  IconFlag, IconAlertTriangle, IconCurrencyDollar,
  IconListCheck, IconExternalLink, IconSettings, IconSearch,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import type { Macroproyecto, Proyecto, Accion, Indicador, DashboardResumen } from "./types";
import { PDI_ROUTES } from "./api";
import MacroproyectoModal from "./components/MacroproyectoModal";
import AccionModal from "./components/AccionModal";
import IndicadorModal from "./components/IndicadorModal";
import PdiSidebar from "./components/PdiSidebar";
import { usePdiConfig } from "./hooks/usePdiConfig";
import PermissionGate from "@/app/components/PermissionGate";

const formatCOP = (value: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "Cumplimiento adecuado", amarillo: "Requiere atención", rojo: "Crítico",
};
const isAdmin = (role: string) => role === "Administrador";
const PDI_FIXED_NAME = "Plan de Desarrollo Institucional (PDI)";
const formatAnioRange = (anioInicio?: number, anioFin?: number) =>
  anioInicio && anioFin ? `${anioInicio} - ${anioFin}` : "Sin rango definido";

function getIndicadorAvanceMostrado(ind: Indicador) {
  return ind.avance_total_real ?? ind.avance;
}

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
    num_macroproyectos: number;
    proyectos_por_macro: number;
    acciones_por_proyecto: number;
    indicadores_por_accion: number;
  };
  onSaved: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(initialConfig.nombre);
  const [anioInicio, setAnioInicio] = useState<number | string>(initialConfig.anio_inicio);
  const [anioFin, setAnioFin] = useState<number | string>(initialConfig.anio_fin);
  const [numMacros, setNumMacros] = useState<number | string>(initialConfig.num_macroproyectos);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setNombre(initialConfig.nombre);
    setAnioInicio(initialConfig.anio_inicio);
    setAnioFin(initialConfig.anio_fin);
    setNumMacros(initialConfig.num_macroproyectos);
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
        descripcion: String(nombre).trim(),
        anio_inicio: Number(anioInicio),
        anio_fin: Number(anioFin),
        num_macroproyectos: Number(numMacros) || 0,
      });
      if (Number(numMacros) > 0) {
        await axios.post(PDI_ROUTES.configRedistribuir());
      }
      await onSaved();
      showNotification({ title: "Actualizado", message: "Configuración del PDI guardada y pesos redistribuidos", color: "teal" });
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "No se pudo guardar la configuración", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Editar PDI" centered size="md">
      <Stack gap="sm">
        <TextInput label="Nombre del PDI" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
        <Group grow>
          <NumberInput label="Año inicial" value={anioInicio} onChange={setAnioInicio} allowDecimal={false} />
          <NumberInput label="Año final" value={anioFin} onChange={setAnioFin} allowDecimal={false} />
        </Group>

        <Divider label="Estructura del PDI" labelPosition="center" mt="xs" />
        <Text size="xs" c="dimmed">
          El peso de cada macroproyecto se redistribuirá automáticamente
        </Text>
        <NumberInput
          label="Número de macroproyectos"
          value={numMacros}
          onChange={setNumMacros}
          min={0}
          allowDecimal={false}
        />

        <Divider mt="xs" />
        <Group justify="flex-end">
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
  const avanceMostrado = getIndicadorAvanceMostrado(ind);
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
      {ind.indicador_resultado && <Text size="xs" c="dimmed" mb={4}>{ind.indicador_resultado}</Text>}
      {admin && (() => {
        const estados = ind.periodos.map(p => p.estado_reporte).filter(Boolean);
        const tieneAprobado  = estados.some(e => e === "Aprobado");
        const tieneEnviado   = estados.some(e => e === "Enviado");
        const tieneRechazado = estados.some(e => e === "Rechazado");
        if (!tieneAprobado && !tieneEnviado && !tieneRechazado) return null;
        return (
          <Group gap={6} mb={6} wrap="wrap">
            {tieneAprobado  && <Badge size="xs" color="teal"   variant="filled" radius="xl">✓ Listo para Planeación</Badge>}
            {tieneEnviado   && <Badge size="xs" color="yellow" variant="filled" radius="xl">⏳ Pendiente evaluación líder</Badge>}
            {tieneRechazado && <Badge size="xs" color="red"    variant="light"  radius="xl">↩ Devuelto al responsable</Badge>}
          </Group>
        );
      })()}
      <AvanceBar avance={avanceMostrado} semaforo={ind.semaforo} />
      <Group gap={12} mt={4} wrap="wrap">
        <Text size="xs" c="dimmed">Avance total: <b>{avanceMostrado}%</b></Text>
        {ind.avance_total_real != null && <Text size="xs" c="dimmed">Avance total real: <b>{ind.avance_total_real}%</b></Text>}
      </Group>
      <Group gap={8} mt={6} wrap="wrap">
        <Text size="xs" c="dimmed">Peso: <b>{ind.peso}%</b></Text>
        {ind.responsable && <Text size="xs" c="dimmed">Resp: <b>{ind.responsable}</b></Text>}
        {ind.tipo_seguimiento && <Text size="xs" c="dimmed">Seguimiento: <b>{ind.tipo_seguimiento}</b></Text>}
        {ind.meta_final_2029 != null && <Text size="xs" c="dimmed">Meta final {anioMeta ?? "final"}: <b>{ind.meta_final_2029}</b></Text>}
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
  const presupuestoAccion = Number(accion.presupuesto) || 0;
  const presupuestoEjecutadoAccion = Number(accion.presupuesto_ejecutado) || 0;

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
        {presupuestoAccion > 0 && (
          <Text size="xs" c="dimmed">Presupuesto: <b>{formatCOP(presupuestoAccion)}</b></Text>
        )}
        {presupuestoEjecutadoAccion > 0 && (
          <Text size="xs" c="dimmed">Causado: <b>{formatCOP(presupuestoEjecutadoAccion)}</b></Text>
        )}
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
  const presupuestoProyecto = Number(proyecto.presupuesto) || 0;
  const presupuestoEjecutadoProyecto = Number(proyecto.presupuesto_ejecutado) || 0;

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
        <Text size="xs" c="dimmed">Presupuesto: <b>{formatCOP(presupuestoProyecto)}</b></Text>
        {presupuestoEjecutadoProyecto > 0 && (
          <Text size="xs" c="dimmed">Causado: <b>{formatCOP(presupuestoEjecutadoProyecto)}</b></Text>
        )}
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
      {proyecto.descripcion && (
        <Text size="xs" c="dimmed" mt={8}>
          Propósito: <b>{proyecto.descripcion}</b>
        </Text>
      )}
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
interface CorteResumenPeriodo {
  periodo: string;
  sin_reporte: number;
  con_reporte: number;
  total_indicadores: number;
  porcentaje_cobertura: number;
  indicadores_pendientes?: { _id: string; codigo: string; nombre: string; responsable?: string }[];
}

type PresupuestoDetalleResumen = {
  tipo?: string;
  valor?: number;
  causado?: number;
  causadoGasto?: number;
  causadoInversion?: number;
};

type PresupuestoDashboardRow = {
  presupuesto?: number;
  presupuestoGasto?: number;
  presupuestoInversion?: number;
  comprometidoGasto?: number;
  comprometidoInversion?: number;
  causado?: number;
  causadoGasto?: number;
  causadoInversion?: number;
  gasto?: number;
  inversion?: number;
  detalles?: PresupuestoDetalleResumen[];
};

type PresupuestoDashboardResponse = {
  rows?: PresupuestoDashboardRow[];
  totals?: {
    presupuesto?: number;
    presupuestoGasto?: number;
    presupuestoInversion?: number;
    causado?: number;
    causadoGasto?: number;
    causadoInversion?: number;
  };
};

const toBudgetNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isBudgetInversion = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("inversion");

const getPresupuestoCausadoSplit = (row: PresupuestoDashboardRow) => {
  const directGasto = toBudgetNumber(row.causadoGasto);
  const directInversion = toBudgetNumber(row.causadoInversion);
  if (directGasto || directInversion) {
    return { gasto: directGasto, inversion: directInversion };
  }

  const detailSplit = (row.detalles ?? []).reduce(
    (acc, detail) => {
      const detailGasto = toBudgetNumber(detail.causadoGasto);
      const detailInversion = toBudgetNumber(detail.causadoInversion);
      if (detailGasto || detailInversion) {
        acc.gasto += detailGasto;
        acc.inversion += detailInversion;
        return acc;
      }

      const causado = toBudgetNumber(detail.causado);
      if (!causado) return acc;
      if (isBudgetInversion(detail.tipo)) acc.inversion += causado;
      else acc.gasto += causado;
      return acc;
    },
    { gasto: 0, inversion: 0 }
  );
  if (detailSplit.gasto || detailSplit.inversion) return detailSplit;

  const gasto = toBudgetNumber(row.gasto);
  const inversion = toBudgetNumber(row.inversion);
  return { gasto, inversion };
};

const getPresupuestoPlaneadoSplit = (row: PresupuestoDashboardRow) => {
  const directGasto = toBudgetNumber(row.presupuestoGasto);
  const directInversion = toBudgetNumber(row.presupuestoInversion);
  if (directGasto || directInversion) {
    return { gasto: directGasto, inversion: directInversion };
  }

  const comprometidoGasto = toBudgetNumber(row.comprometidoGasto);
  const comprometidoInversion = toBudgetNumber(row.comprometidoInversion);
  const comprometidoSplit = comprometidoGasto + comprometidoInversion;
  const presupuesto = toBudgetNumber(row.presupuesto);
  if (presupuesto > 0 && comprometidoSplit > 0) {
    return {
      gasto: presupuesto * (comprometidoGasto / comprometidoSplit),
      inversion: presupuesto * (comprometidoInversion / comprometidoSplit),
    };
  }

  const detailSplit = (row.detalles ?? []).reduce(
    (acc, detail) => {
      const valor = toBudgetNumber(detail.valor);
      if (!valor) return acc;
      if (isBudgetInversion(detail.tipo)) acc.inversion += valor;
      else acc.gasto += valor;
      return acc;
    },
    { gasto: 0, inversion: 0 }
  );
  if (presupuesto > 0 && detailSplit.gasto + detailSplit.inversion > 0) {
    const detailTotal = detailSplit.gasto + detailSplit.inversion;
    return {
      gasto: presupuesto * (detailSplit.gasto / detailTotal),
      inversion: presupuesto * (detailSplit.inversion / detailTotal),
    };
  }

  return { gasto: presupuesto, inversion: 0 };
};

function StatsCards({ macros, proyectosPorMacro, accionesPorMacro, indicadoresPorMacro, alertasActivas, resumen }: {
  macros: Macroproyecto[];
  proyectosPorMacro: Record<string, Proyecto[]>;
  accionesPorMacro: Record<string, number>;
  indicadoresPorMacro: Record<string, number>;
  alertasActivas: number;
  resumen: DashboardResumen | null;
}) {
  const [corteActual, setCorteActual] = useState<CorteResumenPeriodo | null>(null);
  const [presupuestoAnio, setPresupuestoAnio] = useState<{
    total: number;
    presupuestoGasto: number;
    presupuestoInversion: number;
    causado: number;
    causadoGasto: number;
    causadoInversion: number;
  } | null>(null);
  const [modalPendientes, setModalPendientes] = useState(false);

  useEffect(() => {
    const fetchCorte = (nombre: string) =>
      axios.get<CorteResumenPeriodo>(PDI_ROUTES.dashboardCorte(nombre))
        .then(r => setCorteActual(r.data))
        .catch(() => {});

    axios.get<{ _id: string; nombre: string }[]>(PDI_ROUTES.cortesActivos())
      .then(({ data: activos }) => {
        if (activos.length) { fetchCorte(activos[0].nombre); return; }
        axios.get<{ _id: string; nombre: string }[]>(PDI_ROUTES.cortesVigentes())
          .then(({ data: vigentes }) => { if (vigentes.length) fetchCorte(vigentes[0].nombre); })
          .catch(() => {});
      })
      .catch(() => {});

    axios.get<PresupuestoDashboardResponse>(PDI_ROUTES.presupuestoData())
      .then(({ data }) => {
        const rows = data.rows ?? [];
        const splitFromTotals = {
          gasto: toBudgetNumber(data.totals?.causadoGasto),
          inversion: toBudgetNumber(data.totals?.causadoInversion),
        };
        const planFromTotals = {
          gasto: toBudgetNumber(data.totals?.presupuestoGasto),
          inversion: toBudgetNumber(data.totals?.presupuestoInversion),
        };
        const splitFromRows = rows.reduce(
          (acc, row) => {
            const split = getPresupuestoCausadoSplit(row);
            acc.gasto += split.gasto;
            acc.inversion += split.inversion;
            return acc;
          },
          { gasto: 0, inversion: 0 }
        );
        const planFromRows = rows.reduce(
          (acc, row) => {
            const split = getPresupuestoPlaneadoSplit(row);
            acc.gasto += split.gasto;
            acc.inversion += split.inversion;
            return acc;
          },
          { gasto: 0, inversion: 0 }
        );
        const total = toBudgetNumber(data.totals?.presupuesto)
          || rows.reduce((s, r) => s + toBudgetNumber(r.presupuesto), 0);
        const causado = toBudgetNumber(data.totals?.causado)
          || rows.reduce((s, r) => {
            const rowCausado = toBudgetNumber(r.causado);
            if (rowCausado) return s + rowCausado;
            const split = getPresupuestoCausadoSplit(r);
            return s + split.gasto + split.inversion;
          }, 0);
        let presupuestoGasto = planFromTotals.gasto || planFromRows.gasto;
        let presupuestoInversion = planFromTotals.inversion || planFromRows.inversion;
        const planSplit = presupuestoGasto + presupuestoInversion;
        if (total > 0 && planSplit <= 0) presupuestoGasto = total;

        const causadoGasto = splitFromTotals.gasto || splitFromRows.gasto;
        const causadoInversion = splitFromTotals.inversion || splitFromRows.inversion;
        setPresupuestoAnio({
          total,
          presupuestoGasto,
          presupuestoInversion,
          causado,
          causadoGasto,
          causadoInversion,
        });
      })
      .catch(() => {});
  }, []);

  const totalProyectos = Object.values(proyectosPorMacro).flat().length;
  const totalAcciones = Object.values(accionesPorMacro).reduce((s, n) => s + n, 0);
  const totalIndicadores = Object.values(indicadoresPorMacro).reduce((s, n) => s + n, 0);
  const pesosTotal = macros.reduce((s, m) => s + (m.peso ?? 0), 0);
  const avancePonderado = pesosTotal > 0
    ? macros.reduce((s, m) => s + m.avance * (m.peso ?? 0), 0) / pesosTotal
    : 0;
  const criticos = macros.filter((m) => m.semaforo === "rojo").length;
  const amarillos = macros.filter((m) => m.semaforo === "amarillo").length;
  const verdes = macros.filter((m) => m.semaforo === "verde").length;
  const sinAvance = macros.filter((m) => m.avance === 0).length;
  const alertas = alertasActivas;
  const avanceColor = avancePonderado >= 70 ? "green" : avancePonderado >= 40 ? "blue" : avancePonderado >= 20 ? "orange" : "red";
  const avanceBadge = avancePonderado >= 70 ? "Buen ritmo" : avancePonderado >= 40 ? "En progreso" : avancePonderado >= 20 ? "Atencion" : "Crítico";
  const presupuestoTotal = resumen?.presupuesto.total
    ?? macros.reduce((s, m) => s + (Number(m.presupuesto) || 0), 0);
  const presupuestoEjecutado = resumen?.presupuesto.ejecutado
    ?? macros.reduce((s, m) => s + (Number(m.presupuesto_ejecutado) || 0), 0);
  const avanceFinanciero = presupuestoTotal > 0
    ? Math.min(Math.round((presupuestoEjecutado / presupuestoTotal) * 100), 100)
    : 0;
  const finColor = avanceFinanciero >= 70 ? "green" : avanceFinanciero >= 40 ? "blue" : avanceFinanciero >= 20 ? "orange" : "red";
  const finBadge = avanceFinanciero >= 70 ? "Buen ritmo" : avanceFinanciero >= 40 ? "En progreso" : avanceFinanciero >= 20 ? "Atención" : "Crítico";
  const presupuestoAnioTotal = presupuestoAnio?.total ?? 0;
  const presupuestoAnioGasto = presupuestoAnio?.presupuestoGasto ?? 0;
  const presupuestoAnioInversion = presupuestoAnio?.presupuestoInversion ?? 0;
  const presupuestoAnioCausado = presupuestoAnio?.causado ?? 0;
  const presupuestoAnioCausadoGasto = presupuestoAnio?.causadoGasto ?? 0;
  const presupuestoAnioCausadoInversion = presupuestoAnio?.causadoInversion ?? 0;
  const presupuestoAnioSinDesagregar = Math.max(
    presupuestoAnioCausado - presupuestoAnioCausadoGasto - presupuestoAnioCausadoInversion,
    0
  );
  const presupuestoAnioPlaneadoSinDesagregar = Math.max(
    presupuestoAnioTotal - presupuestoAnioGasto - presupuestoAnioInversion,
    0
  );
  const avanceFinancieroAnio = presupuestoAnioTotal > 0
    ? Math.min(Math.round((presupuestoAnioCausado / presupuestoAnioTotal) * 100), 100)
    : 0;
  const finColorAnio = avanceFinancieroAnio >= 70 ? "teal" : avanceFinancieroAnio >= 40 ? "blue" : "orange";
  const estructuraResumen = [
    { label: "Macroproyectos", value: macros.length, color: "violet" },
    { label: "Proyectos", value: totalProyectos, color: "blue" },
    { label: "Acciones Estratégicas", value: totalAcciones, color: "orange" },
    { label: "Indicadores", value: totalIndicadores, color: "teal" },
  ];
  return (
    <Stack gap="lg" mb="xl">
      <Paper
        withBorder
        radius="xl"
        p="xl"
        shadow="xs"
        style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(59,130,246,0.05) 55%, rgba(255,255,255,0.95) 100%)",
        }}
      >
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <Group gap="md" align="center">
                <div>
                  <Title order={2} lh={1.1}>Panorama general</Title>
                </div>
              </Group>
              
            </Group>

            <Text size="sm" c="dimmed" maw={560}>
              Vista general del portafolio del PDI
            </Text>

            <Stack gap="xs" mt={6}>
              <div>
                <Text size="xs" c="dimmed">Avance ponderado</Text>
                <Group gap="sm" align="flex-end">
                  <Text size="2.8rem" fw={900} lh={1}>{avancePonderado.toFixed(2)}%</Text>
                  <Badge size="md" color={avanceColor} variant="light" radius="xl" mb={6}>{avanceBadge}</Badge>
                </Group>
                <Progress value={avancePonderado} color={avanceColor} size="md" radius="xl" mt="xs" />
              </div>
              <div>
                <Text size="xs" c="dimmed">Avance financiero</Text>
                <Group gap="sm" align="flex-end">
                  <Text size="2.8rem" fw={900} lh={1}>{avanceFinanciero}%</Text>
                  <Badge size="md" color={finColor} variant="light" radius="xl" mb={6}>{finBadge}</Badge>
                </Group>
                <Progress value={avanceFinanciero} color={finColor} size="md" radius="xl" mt="xs" />
                {presupuestoTotal > 0 && (
                  <Text size="xs" c="dimmed" mt={2}>
                    {formatCOP(presupuestoEjecutado)} / {formatCOP(presupuestoTotal)}
                  </Text>
                )}
              </div>
            </Stack>

            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm" mt="sm">
              {estructuraResumen.map((item) => (
                <Paper
                  key={item.label}
                  withBorder
                  radius="lg"
                  p="sm"
                  style={{
                    background: "rgba(255,255,255,0.7)",
                    borderColor: `var(--mantine-color-${item.color}-3)`,
                  }}
                >
                  <Text size="1.2rem" fw={800} lh={1}>{item.value}</Text>
                  <Text size="xs" c="dimmed" mt={4}>{item.label}</Text>
                </Paper>
              ))}
            </SimpleGrid>

          </Stack>

          <SimpleGrid cols={2} spacing="md">
            <Paper withBorder radius="lg" p="lg">
              <Group justify="space-between" align="flex-start" mb="xs">
                <ThemeIcon size={42} radius="xl" color={criticos > 0 ? "red" : amarillos > 0 ? "orange" : "green"} variant="light">
                  <IconFlag size={20} />
                </ThemeIcon>
                <Badge color={criticos > 0 ? "red" : amarillos > 0 ? "orange" : "green"} variant="light" radius="xl">
                  {criticos > 0 ? "Crítico" : amarillos > 0 ? "En riesgo" : "Estable"}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">Estado del portafolio</Text>
              <Text size="1.8rem" fw={800} lh={1} mt={4}>{verdes}/{macros.length || 0}</Text>
              <Text size="xs" c="dimmed" mt={6}>Macroproyectos en cumplimiento adecuado</Text>
            </Paper>

            <Paper withBorder radius="lg" p="lg" style={{ position: "relative" }}>
              {(corteActual?.sin_reporte ?? 0) > 0 && (
                <ActionIcon
                  size="sm" variant="subtle" color="gray"
                  style={{ position: "absolute", bottom: 10, right: 10 }}
                  onClick={() => setModalPendientes(true)}
                  title="Ver indicadores pendientes"
                >
                  <IconSearch size={14} />
                </ActionIcon>
              )}
              <Group justify="space-between" align="flex-start" mb="xs">
                <ThemeIcon size={42} radius="xl" color={(corteActual?.sin_reporte ?? 1) > 0 ? "red" : "teal"} variant="light">
                  <IconAlertTriangle size={20} />
                </ThemeIcon>
                <Badge color={(corteActual?.sin_reporte ?? 1) > 0 ? "red" : "teal"} variant="light" radius="xl">
                  {corteActual ? corteActual.periodo : "—"}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">Indicadores sin reporte</Text>
              <Text size="1.8rem" fw={800} lh={1} mt={4}>
                {corteActual ? corteActual.sin_reporte : "—"}
              </Text>
              <Text size="xs" c="dimmed" mt={6}>
                {corteActual
                  ? corteActual.sin_reporte === 0
                    ? "Todos han reportado"
                    : `Sin reporte en ${corteActual.periodo}`
                  : "Cargando período..."}
              </Text>
            </Paper>

            <Modal
              opened={modalPendientes}
              onClose={() => setModalPendientes(false)}
              title={
                <Group gap="xs">
                  <ThemeIcon size={28} radius="xl" color="red" variant="light">
                    <IconAlertTriangle size={16} />
                  </ThemeIcon>
                  <Text fw={700} size="sm">
                    Indicadores sin reporte — {corteActual?.periodo}
                  </Text>
                </Group>
              }
              size="lg"
              radius="lg"
            >
              {(corteActual?.indicadores_pendientes?.length ?? 0) === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  Todos los indicadores han sido reportados.
                </Text>
              ) : (
                <>
                  <Text size="xs" c="dimmed" mb="sm">
                    {corteActual!.indicadores_pendientes!.length} indicador
                    {corteActual!.indicadores_pendientes!.length !== 1 ? "es" : ""} pendiente
                    {corteActual!.indicadores_pendientes!.length !== 1 ? "s" : ""} de reporte en <strong>{corteActual!.periodo}</strong>
                  </Text>
                  <ScrollArea h={420} offsetScrollbars>
                    <List spacing={6} size="sm" icon={
                      <Box w={8} h={8} mt={5} style={{ borderRadius: "50%", background: "#fa5252", flexShrink: 0 }} />
                    }>
                      {corteActual!.indicadores_pendientes!.map((ind) => (
                        <List.Item key={ind._id}>
                          <Box>
                            <Text size="xs" fw={700} c="red.7" lh={1.2}>{ind.codigo}</Text>
                            <Text size="xs" c="dimmed" lh={1.4}>{ind.nombre}</Text>
                            {ind.responsable && (
                              <Text size="xs" c="dimmed" lh={1.4}>Responsable: {ind.responsable}</Text>
                            )}
                          </Box>
                        </List.Item>
                      ))}
                    </List>
                  </ScrollArea>
                </>
              )}
            </Modal>

            <Paper withBorder radius="lg" p="lg">
              <Group justify="space-between" align="flex-start" mb="xs">
                <ThemeIcon size={42} radius="xl" color="blue" variant="light">
                  <IconListCheck size={20} />
                </ThemeIcon>
                <Badge color="blue" variant="light" radius="xl">Cobertura</Badge>
              </Group>
              <Text size="xs" c="dimmed">Macroproyectos al 50% o más</Text>
              <Text size="1.8rem" fw={800} lh={1} mt={4}>{macros.filter((m) => m.avance >= 50).length}</Text>
              <Text size="xs" c="dimmed" mt={6}>de {macros.length || 0} Macroproyectos</Text>
            </Paper>

            <Paper withBorder radius="lg" p="lg">
              <Group justify="space-between" align="flex-start" mb="xs">
                <ThemeIcon size={42} radius="xl" color={finColorAnio} variant="light">
                  <IconCurrencyDollar size={20} />
                </ThemeIcon>
                <Badge color={finColorAnio} variant="light" radius="xl">
                  {new Date().getFullYear()}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">Presupuesto del año vs ejecutado</Text>
              <Text size="1.8rem" fw={800} lh={1} mt={4}>
                {avanceFinancieroAnio}%
              </Text>
              <Box style={{ height: 6, background: "#e9ecef", borderRadius: 4, overflow: "hidden", margin: "8px 0" }}>
                <Box style={{ width: `${avanceFinancieroAnio}%`, height: "100%", borderRadius: 4, transition: "width .4s", background: avanceFinancieroAnio >= 70 ? "#20c997" : avanceFinancieroAnio >= 40 ? "#228be6" : "#fd7e14" }} />
              </Box>
              {presupuestoAnioTotal > 0 ? (
                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    {formatCOP(presupuestoAnioCausado)} causado de {formatCOP(presupuestoAnioTotal)}
                  </Text>
                  <SimpleGrid cols={2} spacing={6}>
                    <Box style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 8, padding: "8px" }}>
                      <Group gap={4} mb={4}>
                        <Box w={6} h={6} style={{ borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />
                        <Text size="10px" fw={700} c="blue.6">Gasto</Text>
                      </Group>
                      <Text size="11px" fw={800} c="blue.8" lh={1.2}>{formatCOP(presupuestoAnioCausadoGasto)}</Text>
                      <Text size="10px" c="dimmed" lh={1.2} mt={2}>causado de {formatCOP(presupuestoAnioGasto)}</Text>
                    </Box>
                    <Box style={{ border: "1px solid #ddd6fe", background: "#f5f3ff", borderRadius: 8, padding: "8px" }}>
                      <Group gap={4} mb={4}>
                        <Box w={6} h={6} style={{ borderRadius: "50%", background: "#7c3aed", flexShrink: 0 }} />
                        <Text size="10px" fw={700} c="violet.6">Inversión</Text>
                      </Group>
                      <Text size="11px" fw={800} c="violet.8" lh={1.2}>{formatCOP(presupuestoAnioCausadoInversion)}</Text>
                      <Text size="10px" c="dimmed" lh={1.2} mt={2}>causado de {formatCOP(presupuestoAnioInversion)}</Text>
                    </Box>
                  </SimpleGrid>
                  {presupuestoAnioSinDesagregar > 0 && (
                    <Text size="10px" c="dimmed">
                      Causado sin desagregar: {formatCOP(presupuestoAnioSinDesagregar)}
                    </Text>
                  )}
                  {presupuestoAnioPlaneadoSinDesagregar > 0 && (
                    <Text size="10px" c="dimmed">
                      Presupuesto sin desagregar: {formatCOP(presupuestoAnioPlaneadoSinDesagregar)}
                    </Text>
                  )}
                </Stack>
              ) : (
                <Text size="xs" c="dimmed">Sin datos de presupuesto</Text>
              )}
            </Paper>
          </SimpleGrid>
        </SimpleGrid>
      </Paper>
    </Stack>
  );
}

// MacroproyectoPortfolioCard ─────────────────────────────────────────────
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
  const presupuesto = Number(macro.presupuesto) || 0;
  const presupuestoEjecutado = Number(macro.presupuesto_ejecutado) || 0;
  const avanceFinanciero = presupuesto > 0 ? Math.round((presupuestoEjecutado / presupuesto) * 100) : 0;
  const finBarColor = avanceFinanciero >= 50 ? "#22c55e" : avanceFinanciero >= 25 ? "#f59e0b" : "#ef4444";

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

      <SimpleGrid cols={2} spacing="md" mb={6}>
        <div>
          <Text size="xs" c="dimmed" fw={600} mb={2}>Avance ponderado</Text>
          <Text size="2rem" fw={900} lh={1}>{macro.avance}%</Text>
          <Box mt={8} style={{ height: 10, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden" }}>
            <Box style={{ height: "100%", width: `${macro.avance}%`, background: barColor, borderRadius: 99, transition: "width .4s" }} />
          </Box>
        </div>
        <div>
          <Text size="xs" c="dimmed" fw={600} mb={2}>Avance financiero</Text>
          <Text size="2rem" fw={900} lh={1}>{avanceFinanciero}%</Text>
          <Box mt={8} style={{ height: 10, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden" }}>
            <Box style={{ height: "100%", width: `${avanceFinanciero}%`, background: finBarColor, borderRadius: 99, transition: "width .4s" }} />
          </Box>
          {presupuesto > 0 && (
            <Text size="xs" c="dimmed" mt={4}>{formatCOP(presupuestoEjecutado)} / {formatCOP(presupuesto)}</Text>
          )}
        </div>
      </SimpleGrid>

      <SimpleGrid cols={3} mb="md" mt="md">
        {[
          { label: "Proyectos", value: proyectos.length },
          { label: "Acciones", value: accionesCount },
          { label: "Indicadores", value: indicadoresCount },
        ].map(s => (
          <Box key={s.label} style={{ textAlign: "center", background: "var(--mantine-color-default-hover)", borderRadius: 14, padding: "14px 4px" }}>
            <Text fw={900} size="2rem" lh={1}>{s.value}</Text>
            <Text size="sm" c="dimmed" fw={500} mt={4}>{s.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      <Button
        variant="gradient"
        gradient={{ from: "violet", to: "blue", deg: 135 }}
        radius="xl" size="md" fullWidth
        rightSection={<IconExternalLink size={15} />}
        onClick={() => router.push(`/pdi/${macro._id}`)}
      >
        Ver detalle
      </Button>
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
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [proyectosPorMacro, setProyectosPorMacro] = useState<Record<string, Proyecto[]>>({});
  const [accionesPorMacro, setAccionesPorMacro] = useState<Record<string, number>>({});
  const [indicadoresPorMacro, setIndicadoresPorMacro] = useState<Record<string, number>>({});
  const [loadingMacros, setLoadingMacros] = useState(true);
  const [macroModal, setMacroModal] = useState(false);
  const [configModal, setConfigModal] = useState(false);
  const [selectedMacro, setSelectedMacro] = useState<Macroproyecto | null>(null);
  const cargarPortfolio = async () => {
    try {
      const [macrosRes, proyectosRes, accionesRes, indicadoresRes, resumenRes] = await Promise.all([
        axios.get(PDI_ROUTES.macroproyectos()),
        axios.get(PDI_ROUTES.proyectos()),
        axios.get(PDI_ROUTES.acciones()),
        axios.get(PDI_ROUTES.indicadores()),
        axios.get(PDI_ROUTES.dashboardResumen()),
      ]);
      setResumen(resumenRes.data);

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
      await cargarPortfolio();
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
            <Title order={3}>{PDI_FIXED_NAME}</Title>
            <Text size="xs" c="dimmed">{config.nombre} - {formatAnioRange(config.anio_inicio, config.anio_fin)}</Text>
          </div>
        </Group>
        {admin && (
          <PermissionGate viewKey="pdi">
          <Group gap="sm">
            <Button variant="default" leftSection={<IconSettings size={15} />} onClick={() => setConfigModal(true)}>
              Editar PDI
            </Button>
            <Button leftSection={<IconPlus size={15} />} color="violet"
              onClick={() => { setSelectedMacro(null); setMacroModal(true); }}>
              Nuevo macroproyecto
            </Button>
          </Group>
          </PermissionGate>
        )}
      </Group>

      <Divider mb="lg" />

      <StatsCards macros={macros} proyectosPorMacro={proyectosPorMacro} accionesPorMacro={accionesPorMacro} indicadoresPorMacro={indicadoresPorMacro} alertasActivas={resumen?.alertas?.indicadores_con_alertas ?? 0} resumen={resumen} />

      <Group justify="space-between" align="center" mb="md">
        <div>
          <Text fw={700} size="xl">Macroproyectos</Text>
          <Text size="xs" c="dimmed">Vista tipo portafolio — Jerarquía del PDI</Text>
        </div>
        
      </Group>

      {loadingMacros ? (
        <Center py="xl"><Loader /></Center>
      ) : macros.length === 0 ? (
        <Center py="xl"><Text c="dimmed">No hay macroproyectos registrados</Text></Center>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg" verticalSpacing="lg">
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
