"use client";

import { useState, useEffect } from "react";
import {
  Text, Paper, Group, Badge, Button, Stack, Loader, Center,
  ThemeIcon, ActionIcon, Box, Title, Progress,
} from "@mantine/core";
import {
  IconArrowLeft, IconTarget, IconBulb, IconTrendingUp,
  IconEdit, IconTrash, IconPlus, IconChevronRight,
  IconChartBarPopular, IconFolderOpen,
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

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "Cumplimiento adecuado", amarillo: "Requiere atención", rojo: "Crítico",
};
const isAdmin = (role: string) => role === "Administrador";

function SemaforoBadge({ semaforo }: { semaforo: string }) {
  return (
    <Badge color={SEMAFORO_COLOR[semaforo]} variant="light" size="xs" radius="xl">
      {SEMAFORO_LABEL[semaforo]}
    </Badge>
  );
}

function AvanceBar({ avance, semaforo }: { avance: number; semaforo: string }) {
  return (
    <Group gap={6} align="center">
      <Progress value={avance} color={SEMAFORO_COLOR[semaforo]} size="xs" style={{ flex: 1 }} />
      <Text size="xs" fw={700} w={32} ta="right">{avance}%</Text>
    </Group>
  );
}

// ── Indicador card horizontal ──────────────────────────────────────────────
function IndicadorCard({ ind, admin, onEdit, onDelete }: {
  ind: Indicador; admin: boolean;
  onEdit: (i: Indicador) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Paper withBorder radius="lg" p="sm" shadow="xs"
      style={{ minWidth: 200, flex: "1 1 200px" }}
    >
      <Group justify="space-between" mb={6}>
        <ThemeIcon size={28} radius="xl" color="violet" variant="light">
          <IconTarget size={14} />
        </ThemeIcon>
        <Group gap={4}>
          <SemaforoBadge semaforo={ind.semaforo} />
          {admin && <>
            <ActionIcon size="xs" variant="subtle" color="blue" onClick={() => onEdit(ind)}><IconEdit size={11} /></ActionIcon>
            <ActionIcon size="xs" variant="subtle" color="red" onClick={() => onDelete(ind._id)}><IconTrash size={11} /></ActionIcon>
          </>}
        </Group>
      </Group>
      <Text size="xs" fw={700} c="dimmed" mb={2}>{ind.codigo}</Text>
      <Text size="xs" fw={600} mb={6} lineClamp={3}>{ind.nombre}</Text>
      <AvanceBar avance={ind.avance} semaforo={ind.semaforo} />
      <Group gap={8} mt={6} wrap="wrap">
        <Text size="xs" c="dimmed">Peso: <b>{ind.peso}%</b></Text>
        {ind.meta_final_2029 != null && <Text size="xs" c="dimmed">Meta: <b>{ind.meta_final_2029}</b></Text>}
      </Group>
      {ind.responsable && <Text size="xs" c="dimmed" mt={2}>Resp: <b>{ind.responsable}</b></Text>}
    </Paper>
  );
}

// ── Acción card con indicadores horizontales ───────────────────────────────
function AccionCard({ accion: accionInicial, admin, onEdit, onDelete, onAvanceUpdate }: {
  accion: Accion; admin: boolean;
  onEdit: (a: Accion) => void;
  onDelete: (id: string) => void;
  onAvanceUpdate: () => void;
}) {
  const [accion, setAccion] = useState(accionInicial);
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [indModal, setIndModal] = useState(false);
  const [selectedInd, setSelectedInd] = useState<Indicador | null>(null);

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

  const refrescarAccion = async () => {
    try {
      const res = await axios.get(PDI_ROUTES.accion(accion._id));
      setAccion(res.data);
      onAvanceUpdate();
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
    <Paper withBorder radius="lg" p="md" shadow="xs"
      style={{ minWidth: 280, flex: 1 }}
    >
      <Group justify="space-between" mb={6}>
        <ThemeIcon size={28} radius="xl" color="orange" variant="light">
          <IconBulb size={14} />
        </ThemeIcon>
        <Group gap={4}>
          <SemaforoBadge semaforo={accion.semaforo} />
          {admin && <>
            <ActionIcon size="xs" variant="subtle" color="blue" onClick={() => onEdit(accion)}><IconEdit size={11} /></ActionIcon>
            <ActionIcon size="xs" variant="subtle" color="red" onClick={() => onDelete(accion._id)}><IconTrash size={11} /></ActionIcon>
          </>}
        </Group>
      </Group>
      <Text size="xs" fw={700} c="dimmed" mb={2}>{accion.codigo}</Text>
      <Text size="xs" fw={600} mb={6} lineClamp={3}>{accion.nombre}</Text>
      <AvanceBar avance={accion.avance} semaforo={accion.semaforo} />
      <Text size="xs" c="dimmed" mt={4}>Peso: <b>{accion.peso}%</b></Text>

      {/* Botón ver indicadores */}
      <Group gap={6} mt={8}>
        <Button variant="subtle" size="xs" p={0} loading={loading}
          rightSection={<IconChevronRight size={11} style={{ transform: open ? "rotate(90deg)" : "", transition: "transform .2s" }} />}
          onClick={cargar}>
          {open ? "Ocultar indicadores" : `Indicadores`}
        </Button>
        {admin && open && (
          <Button size="xs" variant="light" color="violet" leftSection={<IconPlus size={11} />}
            onClick={() => { setSelectedInd(null); setIndModal(true); }}>
            Nuevo
          </Button>
        )}
      </Group>

      {/* Indicadores en grid que fluye — si caben van al lado, si no bajan */}
      {open && (
        <Box mt={8}>
          {loading ? (
            <Center py="xs"><Loader size="xs" /></Center>
          ) : indicadores.length === 0 ? (
            <Text size="xs" c="dimmed">Sin indicadores</Text>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-start" }}>
              {indicadores.map(ind => (
                <IndicadorCard key={ind._id} ind={ind} admin={admin}
                  onEdit={(i) => { setSelectedInd(i); setIndModal(true); }}
                  onDelete={handleDeleteInd}
                />
              ))}
            </div>
          )}
        </Box>
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
          await refrescarAccion();
        }}
      />
    </Paper>
  );
}

// ── Proyecto: header + acciones en fila horizontal ─────────────────────────
function ProyectoSeccion({ proyecto: proyectoInicial, admin, macros, macroId, onEdit, onDelete, onAvanceUpdate }: {
  proyecto: Proyecto; admin: boolean;
  macros: Macroproyecto[];
  macroId: string;
  onEdit: (p: Proyecto) => void;
  onDelete: (id: string) => void;
  onAvanceUpdate: () => void;
}) {
  const [proyecto, setProyecto] = useState(proyectoInicial);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [accionModal, setAccionModal] = useState(false);
  const [selectedAccion, setSelectedAccion] = useState<Accion | null>(null);

  useEffect(() => { setProyecto(proyectoInicial); }, [proyectoInicial]);

  useEffect(() => {
    if (loaded) return;
    setLoading(true);
    axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: proyecto._id } })
      .then(res => { setAcciones(res.data); setLoaded(true); })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const refrescarProyecto = async () => {
    try {
      const [resP, resA] = await Promise.all([
        axios.get(PDI_ROUTES.proyecto(proyecto._id)),
        axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: proyecto._id } }),
      ]);
      setProyecto(resP.data);
      setAcciones(resA.data);
      onAvanceUpdate();
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

  const barColor = proyecto.avance >= 50 ? "#22c55e" : proyecto.avance >= 25 ? "#f59e0b" : "#ef4444";
  const statusColor = proyecto.semaforo === "verde" ? "green" : proyecto.semaforo === "amarillo" ? "yellow" : "red";

  return (
    <Box mb={32}>
      {/* Header del proyecto */}
      <Paper withBorder radius="xl" p="lg" shadow="sm" mb={12}>
        <Group justify="space-between" align="flex-start">
          <Group gap={12}>
            <ThemeIcon size={40} radius="xl" color="blue" variant="light">
              <IconTrendingUp size={20} />
            </ThemeIcon>
            <div>
              <Group gap={8} mb={2}>
                <Text size="xs" fw={700} c="dimmed">{proyecto.codigo}</Text>
                <Badge color={statusColor} variant="light" size="xs" radius="xl">
                  {proyecto.semaforo === "verde" ? "En cumplimiento" : proyecto.semaforo === "amarillo" ? "En riesgo" : "Crítico"}
                </Badge>
              </Group>
              <Text fw={700} size="md">{proyecto.nombre}</Text>
              {proyecto.formulador && <Text size="xs" c="dimmed" mt={2}>Formulador: <b>{proyecto.formulador}</b></Text>}
            </div>
          </Group>
          <Group gap={12} align="flex-end">
            <div style={{ textAlign: "right" }}>
              <Text size="1.8rem" fw={800} lh={1}>{proyecto.avance}%</Text>
              <Text size="xs" c="dimmed">Peso: {proyecto.peso}%</Text>
            </div>
            <Box style={{ width: 80, height: 6, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden", alignSelf: "center" }}>
              <Box style={{ height: "100%", width: `${proyecto.avance}%`, background: barColor, borderRadius: 99, transition: "width .4s" }} />
            </Box>
            {admin && (
              <Group gap={4}>
                <ActionIcon variant="subtle" color="blue" onClick={() => onEdit(proyecto)}><IconEdit size={15} /></ActionIcon>
                <ActionIcon variant="subtle" color="red" onClick={() => onDelete(proyecto._id)}><IconTrash size={15} /></ActionIcon>
              </Group>
            )}
          </Group>
        </Group>
      </Paper>

      {/* Acciones en fila horizontal con scroll */}
      <Box style={{ overflowX: "auto", paddingBottom: 8 }}>
        {loading ? (
          <Center py="md"><Loader size="sm" /></Center>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", paddingBottom: 4 }}>
            {acciones.length === 0 && (
              <Text size="sm" c="dimmed" pl={4} style={{ alignSelf: "center" }}></Text>
            )}
            {acciones.map(a => (
              <AccionCard key={a._id} accion={a} admin={admin}
                onEdit={(ac) => { setSelectedAccion(ac); setAccionModal(true); }}
                onDelete={handleDeleteAccion}
                onAvanceUpdate={refrescarProyecto}
              />
            ))}
            {admin && (
              <Paper withBorder radius="lg" p="md" shadow="xs"
                style={{
                  minWidth: 160, flexShrink: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  cursor: "pointer", opacity: 0.7,
                  border: "2px dashed var(--mantine-color-default-border)",
                }}
                onClick={() => { setSelectedAccion(null); setAccionModal(true); }}
              >
                <Stack align="center" gap={4}>
                  <ThemeIcon size={32} radius="xl" color="orange" variant="light">
                    <IconPlus size={16} />
                  </ThemeIcon>
                  <Text size="xs" c="dimmed" ta="center">Nueva acción</Text>
                </Stack>
              </Paper>
            )}
          </div>
        )}
      </Box>

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
    </Box>
  );
}

// ── Página principal ───────────────────────────────────────────────────────
export default function MacroproyectoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const macroId = params?.macroId as string;
  const { userRole } = useRole();
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
      .catch(e => console.error(e))
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
    } catch (e) { console.error(e); }
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
          setProyectos(prev => prev.filter(p => p._id !== id));
          showNotification({ title: "Eliminado", message: "Proyecto eliminado", color: "teal" });
          await refrescarMacro();
        } catch { showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" }); }
      },
    });
  };

  const barColor = macro
    ? macro.avance >= 50 ? "#22c55e" : macro.avance >= 25 ? "#f59e0b" : "#ef4444"
    : "#7c3aed";

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
          {loading || !macro ? (
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}><IconArrowLeft size={18} /></ActionIcon>
              <Loader size="sm" />
            </Group>
          ) : (
            <Group justify="space-between" align="center">
              <Group gap={12}>
                <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}><IconArrowLeft size={18} /></ActionIcon>
                <ThemeIcon size={44} radius="xl" color="violet" variant="light">
                  <IconChartBarPopular size={22} />
                </ThemeIcon>
                <div>
                  <Group gap={8}>
                    <Title order={3}>{macro.nombre}</Title>
                    <Badge color={SEMAFORO_COLOR[macro.semaforo]} variant="light" radius="xl">
                      {SEMAFORO_LABEL[macro.semaforo]}
                    </Badge>
                  </Group>
                  <Group gap={12} mt={2}>
                    <Text size="xs" c="dimmed">Código: <b>{macro.codigo}</b></Text>
                    <Text size="xs" c="dimmed">Peso: <b>{macro.peso}%</b></Text>
                    <Group gap={6} align="center">
                      <Text size="xs" c="dimmed">Avance global:</Text>
                      <Box style={{ width: 100, height: 6, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden" }}>
                        <Box style={{ height: "100%", width: `${macro.avance}%`, background: barColor, borderRadius: 99 }} />
                      </Box>
                      <Text size="xs" fw={700}>{macro.avance}%</Text>
                    </Group>
                  </Group>
                </div>
              </Group>
              <Group gap={8}>
                {admin && (
                  <>
                    <Button size="sm" variant="light" color="violet" leftSection={<IconEdit size={14} />}
                      onClick={() => setMacroModal(true)}>
                      Editar macro
                    </Button>
                    <Button size="sm" color="blue" leftSection={<IconPlus size={14} />}
                      onClick={() => { setSelectedProyecto(null); setProyectoModal(true); }}>
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

        {/* Contenido — scroll vertical por proyecto, acciones horizontales */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {loading ? (
            <Center style={{ height: "100%" }}><Loader /></Center>
          ) : proyectos.length === 0 ? (
            <Center style={{ height: "60vh" }}>
              <Stack align="center" gap="xs">
                <ThemeIcon size={56} radius="xl" color="blue" variant="light">
                  <IconFolderOpen size={28} />
                </ThemeIcon>
                <Text fw={600}>Sin proyectos registrados</Text>
                <Text size="sm" c="dimmed">Agrega el primer proyecto a este macroproyecto</Text>
                {admin && (
                  <Button leftSection={<IconPlus size={14} />} color="blue" mt="sm"
                    onClick={() => { setSelectedProyecto(null); setProyectoModal(true); }}>
                    Nuevo proyecto
                  </Button>
                )}
              </Stack>
            </Center>
          ) : (
            <Stack gap={0}>
              {proyectos.map((p, idx) => (
                <Box key={p._id}>
                  <ProyectoSeccion
                    proyecto={p}
                    admin={admin}
                    macros={macros}
                    macroId={macroId}
                    onEdit={(proj) => { setSelectedProyecto(proj); setProyectoModal(true); }}
                    onDelete={handleDeleteProyecto}
                    onAvanceUpdate={refrescarMacro}
                  />
                  {idx < proyectos.length - 1 && (
                    <Box mb={24} style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }} />
                  )}
                </Box>
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
          setProyectos(prev => selectedProyecto
            ? prev.map(p => p._id === doc._id ? doc : p)
            : [...prev, doc]
          );
          await refrescarMacro();
        }}
      />
    </div>
  );
}
