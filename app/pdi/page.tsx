"use client";

import { useState, useEffect } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Button, Stack,
  Loader, Center, Progress, ThemeIcon, Divider, ActionIcon,
  SimpleGrid, RingProgress, Box,
} from "@mantine/core";
import {
  IconChartBarPopular, IconArrowLeft, IconChevronRight,
  IconTarget, IconBulb, IconTrendingUp, IconEdit, IconTrash, IconPlus,
  IconFolderOpen, IconFlag, IconAlertTriangle, IconUsers, IconChevronDown,
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

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "Cumplimiento adecuado", amarillo: "Requiere atención", rojo: "Crítico",
};
const isAdmin = (role: string) => role === "Administrador";

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

// ── Indicador ──────────────────────────────────────────────────────────────
function IndicadorCard({ ind, admin, onEdit, onDelete }: {
  ind: Indicador; admin: boolean;
  onEdit: (i: Indicador) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const anios = Object.keys(ind.avances_por_anio ?? {}).sort();
  return (
    <Paper withBorder radius="sm" p="sm" style={{ backgroundColor: "var(--mantine-color-body)" }}>
      <Group justify="space-between" mb={4}>
        <Group gap={6}>
          <ThemeIcon size={22} radius="xl" color="violet" variant="light"><IconTarget size={13} /></ThemeIcon>
          <Text size="xs" fw={700} c="dimmed">{ind.codigo}</Text>
        </Group>
        <Group gap={4}>
          <SemaforoBadge semaforo={ind.semaforo} />
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => onEdit(ind)}><IconEdit size={13} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onDelete(ind._id)}><IconTrash size={13} /></ActionIcon>
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
        {ind.meta_final_2029 != null && <Text size="xs" c="dimmed">Meta 2029: <b>{ind.meta_final_2029}</b></Text>}
        {ind.avance_total_real != null && <Text size="xs" c="dimmed">Avance real: <b>{ind.avance_total_real}%</b></Text>}
      </Group>
      {ind.periodos.length > 0 && <>
        <Button variant="subtle" size="xs" mt={6} p={0} onClick={() => setOpen(v => !v)}>
          {open ? "Ocultar periodos" : `Ver periodos (${ind.periodos.length})`}
        </Button>
        {open && (
          <Paper withBorder radius="xs" p="xs" mt={6} style={{ overflowX: "auto" }}>
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
            {anios.length > 0 && (
              <Group gap={8} mt={6} wrap="wrap">
                {anios.map(a => <Badge key={a} size="xs" variant="outline" color="violet">{a}: {ind.avances_por_anio[a]}%</Badge>)}
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
function AccionCard({ accion: accionInicial, admin, onEdit, onDelete, onAvanceUpdate }: {
  accion: Accion; admin: boolean;
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
              <IndicadorCard key={ind._id} ind={ind} admin={admin}
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
function ProyectoCard({ proyecto: proyectoInicial, admin, onEdit, onDelete, onAvanceUpdate }: {
  proyecto: Proyecto; admin: boolean;
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
              <AccionCard key={a._id} accion={a} admin={admin}
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
function StatsCards({ macros, proyectosPorMacro }: {
  macros: Macroproyecto[];
  proyectosPorMacro: Record<string, Proyecto[]>;
}) {
  const totalProyectos = Object.values(proyectosPorMacro).flat().length;
  const avanceGlobal = macros.length
    ? Math.round(macros.reduce((s, m) => s + m.avance, 0) / macros.length)
    : 0;
  const criticos = macros.filter(m => m.semaforo === "rojo").length;
  const amarillos = macros.filter(m => m.semaforo === "amarillo").length;

  const cards = [
    {
      icon: "", title: "Total Macroproyectos", value: String(macros.length),
      subtitle: `${criticos} en estado crítico`,
      badge: criticos > 0 ? "Crítico" : "OK",
      badgeColor: criticos > 0 ? "red" : "green",
    },
    {
      icon: "", title: "Avance Promedio", value: `${avanceGlobal}%`,
      subtitle: `${macros.filter(m => m.avance >= 50).length} de ${macros.length} macroproyectos`,
      badge: "En progreso",
      badgeColor: "blue",
    },
    {
      icon: "", title: "Indicadores Críticos", value: String(criticos),
      subtitle: "Macroproyectos en rojo",
      badge: "Atención",
      badgeColor: "orange",
    },
    {
      icon: "", title: "Proyectos Cargados", value: String(totalProyectos),
      subtitle: `${amarillos} macros requieren atención`,
      badge: "Pendiente",
      badgeColor: "yellow",
    },
  ];

  return (
    <SimpleGrid cols={{ base: 2, sm: 4 }} mb="xl">
      {cards.map(c => (
        <Paper key={c.title} withBorder radius="lg" p="lg" shadow="xs">
          <Group justify="space-between" align="flex-start" mb="sm">
            <Box
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: "var(--mantine-color-default-hover)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24,
              }}
            >{c.icon}</Box>
            <Badge color={c.badgeColor} variant="light" size="sm" radius="xl">{c.badge}</Badge>
          </Group>
          <Text size="xs" c="dimmed" mb={2}>{c.title}</Text>
          <Text size="2rem" fw={800} lh={1} mb={4}>{c.value}</Text>
          <Text size="xs" c="dimmed">{c.subtitle}</Text>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

// ── MacroproyectoPortfolioCard ─────────────────────────────────────────────
function MacroproyectoPortfolioCard({ macro, proyectos, loadingProyectos, admin, onEdit, onDelete, onAddProyecto, onEditProyecto, onDeleteProyecto, onAvanceUpdate, onCargar }: {
  macro: Macroproyecto;
  proyectos: Proyecto[];
  loadingProyectos: boolean;
  admin: boolean;
  onEdit: (m: Macroproyecto) => void;
  onDelete: (id: string) => void;
  onAddProyecto: () => void;
  onEditProyecto: (p: Proyecto) => void;
  onDeleteProyecto: (id: string) => void;
  onAvanceUpdate: () => void;
  onCargar: () => void;
}) {
  const [open, setOpen] = useState(false);

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
          { label: "Acciones", value: "—" },
          { label: "Indicadores", value: "—" },
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
          variant="light" color="violet" radius="xl" size="xs"
          rightSection={<IconChevronDown size={13} style={{ transform: open ? "rotate(180deg)" : "", transition: "transform .2s" }} />}
          onClick={() => { if (!open) onCargar(); setOpen(v => !v); }}
        >
          {open ? "Ocultar proyectos" : "Ver proyectos"}
        </Button>
      </Group>

      {open && (
        <Box mt="md">
          <Divider mb="sm" />
          {admin && (
            <Button size="xs" variant="light" color="blue" leftSection={<IconPlus size={12} />} mb="sm" onClick={onAddProyecto}>
              Nuevo proyecto
            </Button>
          )}
          {loadingProyectos ? (
            <Center py="sm"><Loader size="xs" /></Center>
          ) : proyectos.length === 0 ? (
            <Text size="xs" c="dimmed">Sin proyectos registrados</Text>
          ) : (
            <Stack gap={4}>
              {proyectos.map(p => (
                <ProyectoCard
                  key={p._id} proyecto={p} admin={admin}
                  onEdit={onEditProyecto}
                  onDelete={onDeleteProyecto}
                  onAvanceUpdate={onAvanceUpdate}
                />
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Paper>
  );
}

// ── Página principal PDI ───────────────────────────────────────────────────
export default function PdiPage() {
  const router = useRouter();
  const { userRole } = useRole();
  const admin = isAdmin(userRole);

  const [macros, setMacros] = useState<Macroproyecto[]>([]);
  const [proyectosPorMacro, setProyectosPorMacro] = useState<Record<string, Proyecto[]>>({});
  const [loadingMacros, setLoadingMacros] = useState(true);
  const [loadingProyectos, setLoadingProyectos] = useState<Record<string, boolean>>({});
  const [loadedMacros, setLoadedMacros] = useState<Record<string, boolean>>({});
  const [macroModal, setMacroModal] = useState(false);
  const [selectedMacro, setSelectedMacro] = useState<Macroproyecto | null>(null);
  const [proyectoModal, setProyectoModal] = useState(false);
  const [selectedProyecto, setSelectedProyecto] = useState<Proyecto | null>(null);
  const [defaultMacroId, setDefaultMacroId] = useState<string>("");

  useEffect(() => {
    axios.get(PDI_ROUTES.macroproyectos())
      .then(res => setMacros(res.data))
      .catch(e => console.error(e))
      .finally(() => setLoadingMacros(false));
  }, []);

  const cargarProyectos = async (macroId: string) => {
    if (loadedMacros[macroId]) return;
    setLoadingProyectos(prev => ({ ...prev, [macroId]: true }));
    try {
      const res = await axios.get(PDI_ROUTES.proyectos(), { params: { macroproyecto_id: macroId } });
      setProyectosPorMacro(prev => ({ ...prev, [macroId]: res.data }));
      setLoadedMacros(prev => ({ ...prev, [macroId]: true }));
    } catch (e) { console.error(e); }
    finally { setLoadingProyectos(prev => ({ ...prev, [macroId]: false })); }
  };

  // Refresca el macroproyecto desde el back
  const refrescarMacro = async (macroId: string) => {
    try {
      const [resMacro, resProyectos] = await Promise.all([
        axios.get(PDI_ROUTES.macroproyecto(macroId)),
        axios.get(PDI_ROUTES.proyectos(), { params: { macroproyecto_id: macroId } }),
      ]);
      setMacros(prev => prev.map(m => m._id === macroId ? resMacro.data : m));
      setProyectosPorMacro(prev => ({ ...prev, [macroId]: resProyectos.data }));
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
            <Title order={3}>Plan de Desarrollo Institucional</Title>
            <Text size="xs" c="dimmed">Seguimiento PDI — Vista general</Text>
          </div>
        </Group>
        {admin && (
          <Button leftSection={<IconPlus size={15} />} color="violet"
            onClick={() => { setSelectedMacro(null); setMacroModal(true); }}>
            Nuevo macroproyecto
          </Button>
        )}
      </Group>

      <Divider mb="lg" />

      <StatsCards macros={macros} proyectosPorMacro={proyectosPorMacro} />

      <Group justify="space-between" align="center" mb="md">
        <div>
          <Text fw={700} size="xl">Macroproyectos</Text>
          <Text size="xs" c="dimmed">Vista tipo portfolio — navega la jerarquía del PDI</Text>
        </div>
        <Badge variant="outline" color="violet" radius="xl" size="md">{macros.length} resultados</Badge>
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
              loadingProyectos={!!loadingProyectos[macro._id]}
              admin={admin}
              onEdit={(m) => { setSelectedMacro(m); setMacroModal(true); }}
              onDelete={handleDeleteMacro}
              onCargar={() => cargarProyectos(macro._id)}
              onAddProyecto={() => { setSelectedProyecto(null); setDefaultMacroId(macro._id); setProyectoModal(true); }}
              onEditProyecto={(p) => { setSelectedProyecto(p); setDefaultMacroId(macro._id); setProyectoModal(true); }}
              onDeleteProyecto={(id) => handleDeleteProyecto(macro._id, id)}
              onAvanceUpdate={() => refrescarMacro(macro._id)}
            />
          ))}
        </SimpleGrid>
      )}

      <MacroproyectoModal
        opened={macroModal}
        onClose={() => setMacroModal(false)}
        selected={selectedMacro}
        onSaved={(doc) => setMacros(prev => selectedMacro
          ? prev.map(m => m._id === doc._id ? doc : m)
          : [...prev, doc]
        )}
      />

      <ProyectoModal
        opened={proyectoModal}
        onClose={() => setProyectoModal(false)}
        selected={selectedProyecto}
        macroproyectos={macros}
        defaultMacroId={defaultMacroId}
        onSaved={async (doc) => {
          const macroId = typeof doc.macroproyecto_id === "string" ? doc.macroproyecto_id : doc.macroproyecto_id._id;
          setProyectosPorMacro(prev => ({
            ...prev,
            [macroId]: selectedProyecto
              ? (prev[macroId] ?? []).map(p => p._id === doc._id ? doc : p)
              : [...(prev[macroId] ?? []), doc],
          }));
          await refrescarMacro(macroId);
        }}
      />

    </Container>
    </div>
    {admin && <PdiResumenSidebar />}
    </div>
  );
}
