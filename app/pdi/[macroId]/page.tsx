"use client";

import { useState, useEffect } from "react";
import {
  Text, Paper, Group, Badge, Button, Stack, Loader, Center,
  ThemeIcon, ActionIcon, Box, Title, Progress, SimpleGrid, Divider,
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
  verde: "Cumplimiento adecuado",
  amarillo: "Requiere atención",
  rojo: "Crítico",
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
    <Group gap={8} align="center">
      <Progress value={avance} color={SEMAFORO_COLOR[semaforo]} size="sm" radius="xl" style={{ flex: 1 }} />
      <Text size="xs" fw={700} w={36} ta="right">{avance}%</Text>
    </Group>
  );
}

function MetaBadge({ label, color = "gray" }: { label: string; color?: string }) {
  return (
    <Badge variant="light" color={color} radius="sm">
      {label}
    </Badge>
  );
}

function IndicadorCard({ ind, admin, onEdit, onDelete }: {
  ind: Indicador; admin: boolean;
  onEdit: (i: Indicador) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const [showAnios, setShowAnios] = useState(false);
  const tieneAnios = !!ind.avances_por_anio;
  const avance = ind.avance_total_real ?? ind.avance;

  return (
    <Paper
      withBorder
      radius="lg"
      p="md"
      shadow="xs"
      style={{
        height: "100%",
        background: hovered
          ? "linear-gradient(180deg, rgba(124, 58, 237, 0.08), rgba(255, 255, 255, 0.98) 58%)"
          : "linear-gradient(180deg, rgba(124, 58, 237, 0.03), transparent 45%)",
        cursor: "pointer",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered ? "0 14px 30px rgba(124, 58, 237, 0.12)" : "",
        borderColor: hovered ? "rgba(124, 58, 237, 0.35)" : undefined,
        transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease",
      }}
      onClick={() => router.push(`/pdi/indicadores/${ind._id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Group justify="space-between" align="flex-start" mb="xs">
        <Group gap={10} align="flex-start">
          <ThemeIcon size={34} radius="xl" color="violet" variant="light">
            <IconTarget size={17} />
          </ThemeIcon>
          <div style={{ textAlign: "center" }}>
            <Text size="xs" fw={700} c="dimmed" mb={2}>{ind.codigo}</Text>
            <Text size="sm" fw={700} lh={1.35}>{ind.nombre}</Text>
          </div>
        </Group>
        <Group gap={4}>
          <SemaforoBadge semaforo={ind.semaforo} />
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={(e) => { e.stopPropagation(); onEdit(ind); }}><IconEdit size={13} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); onDelete(ind._id); }}><IconTrash size={13} /></ActionIcon>
          </>}
        </Group>
      </Group>

      {/* Barra de avance con botón para desplegar años */}
      <Group gap={6} align="center">
        <Progress value={avance} color={SEMAFORO_COLOR[ind.semaforo]} size="sm" radius="xl" style={{ flex: 1 }} />
        <Text size="xs" fw={700} w={36} ta="right">{avance}%</Text>
        <ActionIcon
          size="xs"
          variant="subtle"
          color="violet"
          onClick={(e) => { e.stopPropagation(); setShowAnios(v => !v); }}
          title="Ver avance por año"
        >
          <IconChevronRight size={12} style={{ transform: showAnios ? "rotate(90deg)" : "none", transition: "transform .2s" }} />
        </ActionIcon>
      </Group>

      {/* Desglose por año (colapsable) */}
      {showAnios && (
        <Group gap={6} mt={8} wrap="wrap" onClick={(e) => e.stopPropagation()}>
          {["2026", "2027", "2028", "2029"].map((anio) => {
            const val = ind.avances_por_anio?.[anio] ?? 0;
            return (
              <Box
                key={anio}
                style={{
                  background: "rgba(124,58,237,0.07)",
                  border: "1px solid rgba(124,58,237,0.18)",
                  borderRadius: 8,
                  padding: "3px 10px",
                  textAlign: "center",
                  minWidth: 60,
                }}
              >
                <Text size="10px" c="dimmed" fw={700}>{anio}</Text>
                <Text size="xs" fw={800} c="violet">{val.toFixed(1)}%</Text>
              </Box>
            );
          })}
        </Group>
      )}

      <Group gap={8} mt="sm" wrap="wrap">
        <MetaBadge label={`Peso ${ind.peso}%`} />
        {ind.meta_final_2029 != null && <MetaBadge label={`Meta ${ind.meta_final_2029}`} color="violet" />}
        {ind.tipo_seguimiento && <MetaBadge label={ind.tipo_seguimiento} color="blue" />}
      </Group>

      {ind.responsable && (
        <Text size="xs" c="dimmed" mt="sm">
          Responsable: <b>{ind.responsable}</b>
        </Text>
      )}
    </Paper>
  );
}

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

  return (
    <Paper
      withBorder
      radius="xl"
      p="lg"
      shadow="xs"
      style={{
        background: open
          ? "linear-gradient(180deg, rgba(251, 146, 60, 0.06), transparent 38%)"
          : "var(--mantine-color-body)",
      }}
    >
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap">
        <Group gap={12} align="flex-start">
          <ThemeIcon size={40} radius="xl" color="orange" variant="light">
            <IconBulb size={20} />
          </ThemeIcon>
          <div style={{ textAlign: "right" }}>
            <Group gap={8} mb={4} wrap="wrap">
              <Text size="xs" fw={700} c="dimmed">{accion.codigo}</Text>
              <SemaforoBadge semaforo={accion.semaforo} />
              <MetaBadge label={`Peso ${accion.peso}%`} />
              {accion.responsable && <MetaBadge label={accion.responsable} color="blue" />}
            </Group>
            <Text fw={700} size="md" lh={1.35}>{accion.nombre}</Text>
          </div>
        </Group>

        <Group gap={6}>
          <Button
            variant={open ? "light" : "subtle"}
            size="xs"
            color="dark"
            loading={loading}
            rightSection={<IconChevronRight size={12} style={{ transform: open ? "rotate(90deg)" : "", transition: "transform .2s" }} />}
            onClick={cargar}
          >
            {open ? "Ocultar indicadores" : "Ver indicadores"}
          </Button>
          {admin && (
            <Button
              size="xs"
              variant="light"
              color="violet"
              leftSection={<IconPlus size={12} />}
              onClick={() => { setSelectedInd(null); setIndModal(true); }}
            >
              Nuevo indicador
            </Button>
          )}
          {admin && <>
            <ActionIcon size="sm" variant="subtle" color="blue" onClick={() => onEdit(accion)}><IconEdit size={14} /></ActionIcon>
            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onDelete(accion._id)}><IconTrash size={14} /></ActionIcon>
          </>}
        </Group>
      </Group>

      <AvanceBar avance={accion.avance} semaforo={accion.semaforo} />

      {open && (
        <>
          <Divider my="md" />
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
            <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
              {indicadores.map((ind) => (
                <IndicadorCard
                  key={ind._id}
                  ind={ind}
                  admin={admin}
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

function ProyectoSeccion({ proyecto: proyectoInicial, admin, onEdit, onDelete, onAvanceUpdate }: {
  proyecto: Proyecto; admin: boolean;
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
      .then((res) => {
        setAcciones(res.data);
        setLoaded(true);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [loaded, proyecto._id]);

  const refrescarProyecto = async () => {
    try {
      const [resProyecto, resAcciones] = await Promise.all([
        axios.get(PDI_ROUTES.proyecto(proyecto._id)),
        axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: proyecto._id } }),
      ]);
      setProyecto(resProyecto.data);
      setAcciones(resAcciones.data);
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

  const estadoProyectoColor = proyecto.semaforo === "verde"
    ? "green"
    : proyecto.semaforo === "amarillo"
      ? "yellow"
      : "red";

  return (
    <Paper withBorder radius="xl" p="xl" shadow="sm" mb="lg">
      <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap">
        <Group gap={14} align="flex-start">
          <ThemeIcon size={46} radius="xl" color="blue" variant="light">
            <IconTrendingUp size={22} />
          </ThemeIcon>
          <div>
            <Group gap={8} mb={4} wrap="wrap">
              <Text size="xs" fw={700} c="dimmed">{proyecto.codigo}</Text>
              <Badge color={estadoProyectoColor} variant="light" radius="xl">
                {proyecto.semaforo === "verde" ? "En cumplimiento" : proyecto.semaforo === "amarillo" ? "En riesgo" : "Crítico"}
              </Badge>
            </Group>
            <Title order={4}>{proyecto.nombre}</Title>
            {proyecto.formulador && (
              <Text size="sm" c="dimmed" mt={4}>
                Formulador: <b>{proyecto.formulador}</b>
              </Text>
            )}
            <Group gap={12} mt={6} wrap="wrap">
              <Text size="sm" c="dimmed">Peso: <b>{proyecto.peso}%</b></Text>
              <Group gap={8} align="center">
                <Text size="sm" c="dimmed">Avance global</Text>
                <Box style={{ width: 110 }}>
                  <AvanceBar avance={proyecto.avance} semaforo={proyecto.semaforo} />
                </Box>
              </Group>
            </Group>
          </div>
        </Group>

        <Group gap={8}>
          {admin && (
            <Button
              size="sm"
              variant="light"
              color="orange"
              leftSection={<IconPlus size={14} />}
              onClick={() => { setSelectedAccion(null); setAccionModal(true); }}
            >
              Nueva acción
            </Button>
          )}
          {admin && <>
            <ActionIcon size="lg" variant="subtle" color="blue" onClick={() => onEdit(proyecto)}><IconEdit size={18} /></ActionIcon>
            <ActionIcon size="lg" variant="subtle" color="red" onClick={() => onDelete(proyecto._id)}><IconTrash size={18} /></ActionIcon>
          </>}
        </Group>
      </Group>

      <Group justify="space-between" align="center" mb="md">
        <div>
          <Text fw={700}>Acciones estratégicas</Text>
        </div>
        {acciones.length > 0 && (
          <Badge variant="outline" color="orange" radius="xl">
            {acciones.length} acción{acciones.length !== 1 ? "es" : ""}
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
              onEdit={(item) => { setSelectedAccion(item); setAccionModal(true); }}
              onDelete={handleDeleteAccion}
              onAvanceUpdate={refrescarProyecto}
            />
          ))}
        </Stack>
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

  const barColor = macro
    ? macro.avance >= 50 ? "#22c55e" : macro.avance >= 25 ? "#f59e0b" : "#ef4444"
    : "#7c3aed";

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
                    <Badge color={SEMAFORO_COLOR[macro.semaforo]} variant="light" radius="xl">
                      {SEMAFORO_LABEL[macro.semaforo]}
                    </Badge>
                  </Group>
                  <Group gap={12} mt={4} wrap="wrap">
                    <Text size="sm" c="dimmed">Código: <b>{macro.codigo}</b></Text>
                    <Text size="sm" c="dimmed">Peso: <b>{macro.peso}%</b></Text>
                    <Group gap={8}>
                      <Text size="sm" c="dimmed">Avance global</Text>
                      <Box style={{ width: 120 }}>
                        <AvanceBar avance={macro.avance} semaforo={macro.semaforo} />
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
                  onEdit={(item) => { setSelectedProyecto(item); setProyectoModal(true); }}
                  onDelete={handleDeleteProyecto}
                  onAvanceUpdate={refrescarMacro}
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
