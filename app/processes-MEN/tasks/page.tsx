"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Text, Paper, Stack, Group, Button, TextInput, Textarea, SimpleGrid,
  Select, Badge, Modal, ActionIcon, Loader, Divider, Box, NavLink, ThemeIcon, Tooltip, SegmentedControl,
} from "@mantine/core";
import {
  IconPlus, IconTrash, IconEdit, IconCircleCheck, IconClock, IconAlertTriangle,
  IconChartBar, IconMessageCircle, IconList, IconChevronLeft, IconChevronRight,
  IconFilter, IconBuilding, IconMail, IconCalendarDue,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import axios from "axios";
import type { Dependency } from "../types";
import { processesMenRoutes } from "../config/routes";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";
import ModuleHeader from "../components/ModuleHeader";

type Task = {
  _id: string;
  titulo: string;
  descripcion: string;
  dep_code: string;
  nombre_dependencia: string;
  email_responsable: string | null;
  fecha_limite: string | null;
  completada: boolean;
  fecha_completada: string | null;
  observacion_respuesta: string;
  creado_por: string;
  createdAt: string;
};

const EMPTY_FORM = {
  titulo: "",
  descripcion: "",
  dep_code: "",
  nombre_dependencia: "",
  email_responsable: "",
  fecha_limite: "",
};

export default function TasksAdminPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const { setHasChanges } = useUnsavedChanges();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroDep, setFiltroDep] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<"todas" | "pendientes" | "vencidas" | "completadas">("todas");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Cargar tareas y dependencias
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const [tasksRes, depsRes] = await Promise.all([
          axios.get(`${base}/task-assignments`),
          axios.get(`${base}/dependencies/all`, { params: { limit: 1000 } }),
        ]);
        setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : []);
        const allDeps: Dependency[] = Array.isArray(depsRes.data)
          ? depsRes.data
          : (depsRes.data?.dependencies ?? []);
        setDeps(allDeps);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [base]);

  const depOptions = useMemo(
    () => deps.map((d) => ({ value: d.dep_code, label: d.name }))
      .sort((a, b) => a.label.localeCompare(b.label, "es")),
    [deps],
  );

  const filtroDepOptions = useMemo(
    () => [{ value: "", label: "Todas las dependencias" }, ...depOptions],
    [depOptions],
  );

  const hoyYmd = new Date().toISOString().split("T")[0];
  const estaVencida = (t: Task) => !t.completada && !!t.fecha_limite && t.fecha_limite.slice(0, 10) < hoyYmd;

  const tasksPorDep = useMemo(
    () => filtroDep ? tasks.filter((t) => t.dep_code === filtroDep) : tasks,
    [tasks, filtroDep],
  );

  const resumen = useMemo(() => ({
    total: tasksPorDep.length,
    pendientes: tasksPorDep.filter((t) => !t.completada).length,
    vencidas: tasksPorDep.filter(estaVencida).length,
    completadas: tasksPorDep.filter((t) => t.completada).length,
  }), [tasksPorDep]); // eslint-disable-line react-hooks/exhaustive-deps

  const tasksFiltradas = useMemo(() => {
    if (filtroEstado === "pendientes") return tasksPorDep.filter((t) => !t.completada);
    if (filtroEstado === "vencidas") return tasksPorDep.filter(estaVencida);
    if (filtroEstado === "completadas") return tasksPorDep.filter((t) => t.completada);
    return tasksPorDep;
  }, [tasksPorDep, filtroEstado]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirCrear = () => {
    setEditTask(null);
    setForm(EMPTY_FORM);
    setError(null);
    setHasChanges(false);
    setModalOpen(true);
  };

  const abrirEditar = (t: Task) => {
    setEditTask(t);
    setForm({
      titulo: t.titulo,
      descripcion: t.descripcion,
      dep_code: t.dep_code,
      nombre_dependencia: t.nombre_dependencia,
      email_responsable: t.email_responsable ?? "",
      fecha_limite: t.fecha_limite ?? "",
    });
    setError(null);
    setHasChanges(false);
    setModalOpen(true);
  };

  const handleDepChange = (val: string | null) => {
    const dep = deps.find((d) => d.dep_code === (val ?? ""));
    setForm((f) => ({
      ...f,
      dep_code: val ?? "",
      nombre_dependencia: dep?.name ?? "",
      email_responsable: (dep as any)?.responsible ?? "",
    }));
  };

  const guardar = async () => {
    if (!form.titulo.trim() || !form.dep_code) {
      setError("El título y la dependencia son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        email_responsable: form.email_responsable || null,
        fecha_limite: form.fecha_limite || null,
        creado_por: session?.user?.email ?? "",
      };
      if (editTask) {
        const res = await axios.put(`${base}/task-assignments/${editTask._id}`, payload);
        setTasks((prev) => prev.map((t) => (t._id === editTask._id ? res.data : t)));
      } else {
        const res = await axios.post(`${base}/task-assignments`, payload);
        setTasks((prev) => [res.data, ...prev]);
      }
      setHasChanges(false);
      setModalOpen(false);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar esta tarea?")) return;
    try {
      await axios.delete(`${base}/task-assignments/${id}`);
      setTasks((prev) => prev.filter((t) => t._id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) return <Stack align="center" p="xl"><Loader /></Stack>;

  const sidebarW = sidebarCollapsed ? 56 : 208;

  return (
    <div style={{ display: "flex", minHeight: "calc(100vh - 56px)", marginTop: "-50px", background: "var(--mantine-color-body)" }}>
      <Box style={{
        position: "fixed",
        top: 56,
        bottom: 0,
        left: 0,
        width: `${sidebarW}px`,
        borderRight: "1px solid var(--mantine-color-default-border)",
        boxSizing: "border-box",
        padding: sidebarCollapsed ? "10px 6px 16px" : "16px 10px 20px",
        backgroundColor: "var(--mantine-color-body)",
        zIndex: 50,
      }}>
        <Group justify="flex-end" mb={6} wrap="nowrap" gap={4}>
          <Tooltip label={sidebarCollapsed ? "Mostrar menú" : "Ocultar menú"} withArrow>
            <ActionIcon
              variant="light"
              color="teal"
              radius="xl"
              size="lg"
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              aria-label={sidebarCollapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
            >
              {sidebarCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        {sidebarCollapsed ? (
          <Stack gap={14} align="center" mt="xl">
            <Tooltip label="Gestión de procesos MEN" position="right" withArrow>
              <ActionIcon variant="default" color="blue" onClick={() => router.push(processesMenRoutes.home)}>
                <IconChartBar size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Comunicaciones MEN" position="right" withArrow>
              <ActionIcon variant="default" color="teal" onClick={() => router.push(processesMenRoutes.comunicaciones)}>
                <IconMessageCircle size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Tareas asignadas" position="right" withArrow>
              <ActionIcon variant="filled" color="violet" aria-label="Tareas asignadas">
                <IconList size={18} />
              </ActionIcon>
            </Tooltip>
          </Stack>
        ) : (
          <Stack gap={0} mt={8}>
            <Group gap={8} px={8} pb={8}>
              <ThemeIcon size={32} radius="xl" color="green" variant="light">
                <IconChartBar size={18} />
              </ThemeIcon>
              <Text size="xs" fw={700} c="green" tt="uppercase">Panel MEN</Text>
            </Group>
            <Divider />
            <NavLink label="Gestión de procesos MEN" leftSection={<IconChartBar size={16} />} color="blue"
              onClick={() => router.push(processesMenRoutes.home)} style={{ borderRadius: 8 }} />
            <NavLink label="Comunicaciones MEN" leftSection={<IconMessageCircle size={16} />} color="teal"
              onClick={() => router.push(processesMenRoutes.comunicaciones)} style={{ borderRadius: 8 }} />
            <NavLink label="Tareas asignadas" leftSection={<IconList size={16} />} color="violet" active
              style={{ borderRadius: 8 }} />
          </Stack>
        )}
      </Box>

      <Stack gap="lg" style={{ marginLeft: `${sidebarW + 1}px`, flex: 1, minWidth: 0, padding: "30px 24px 24px" }}>
        <ModuleHeader
          title="Tareas asignadas"
          icon={IconList}
          color="violet"
          onBack={() => router.push(processesMenRoutes.home)}
          backLabel="Volver a procesos MEN"
          description="Crea y asigna tareas de seguimiento a líderes de dependencia y responsables."
          actions={
            <Button color="violet" leftSection={<IconPlus size={16} />} onClick={abrirCrear}>
              Asignar tarea
            </Button>
          }
        />

        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          {([
            { key: "todas", label: "Total", valor: resumen.total, color: "blue", icon: IconList },
            { key: "pendientes", label: "Pendientes", valor: resumen.pendientes, color: "yellow", icon: IconClock },
            { key: "vencidas", label: "Vencidas", valor: resumen.vencidas, color: "red", icon: IconAlertTriangle },
            { key: "completadas", label: "Completadas", valor: resumen.completadas, color: "teal", icon: IconCircleCheck },
          ] as const).map((x) => {
            const activo = filtroEstado === x.key;
            return (
              <Paper
                key={x.key}
                withBorder
                radius="lg"
                p="sm"
                tabIndex={0}
                role="button"
                aria-pressed={activo}
                onClick={() => setFiltroEstado(x.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFiltroEstado(x.key);
                  }
                }}
                style={{
                  cursor: "pointer",
                  borderLeft: `4px solid var(--mantine-color-${x.color}-5)`,
                  backgroundColor: activo ? `var(--mantine-color-${x.color}-light)` : undefined,
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">{x.label}</Text>
                  <ThemeIcon size={26} radius="xl" variant="light" color={x.color}><x.icon size={15} /></ThemeIcon>
                </Group>
                <Text fw={900} size="1.6rem" lh={1.1} mt={4}>{x.valor}</Text>
              </Paper>
            );
          })}
        </SimpleGrid>

        <Paper withBorder radius="lg" p="md">
          <Group gap={6} mb="sm">
            <IconFilter size={16} color="var(--mantine-color-dimmed)" />
            <Text size="sm" fw={700}>Filtros</Text>
          </Group>
          <Group gap="md" align="flex-end" wrap="wrap">
            <Select
              label="Dependencia"
              placeholder="Todas las dependencias"
              data={filtroDepOptions}
              value={filtroDep ?? ""}
              onChange={(v) => setFiltroDep(v || null)}
              clearable
              searchable
              w={340}
            />
            <Box>
              <Text size="sm" fw={500} mb={4}>Estado</Text>
              <SegmentedControl
                value={filtroEstado}
                onChange={(v) => setFiltroEstado(v as typeof filtroEstado)}
                color="violet"
                data={[
                  { value: "todas", label: "Todas" },
                  { value: "pendientes", label: "Pendientes" },
                  { value: "vencidas", label: "Vencidas" },
                  { value: "completadas", label: "Completadas" },
                ]}
              />
            </Box>
          </Group>
        </Paper>

      {tasksFiltradas.length === 0 ? (
        <Paper withBorder p="xl" radius="lg">
          <Stack align="center" gap="xs">
            <ThemeIcon size={44} radius="xl" variant="light" color="gray"><IconList size={22} /></ThemeIcon>
            <Text c="dimmed" ta="center">
              {tasks.length === 0 ? "Aún no hay tareas asignadas." : "No hay tareas con estos filtros."}
            </Text>
            {tasks.length === 0 && (
              <Button variant="light" color="violet" leftSection={<IconPlus size={15} />} onClick={abrirCrear}>
                Asignar la primera tarea
              </Button>
            )}
          </Stack>
        </Paper>
      ) : (
        <Stack gap="sm">
          {tasksFiltradas.map((t) => {
            const vencida = estaVencida(t);
            const color = t.completada ? "teal" : vencida ? "red" : "yellow";
            return (
            <Paper key={t._id} withBorder radius="lg" p="md"
              style={{ borderLeft: `4px solid var(--mantine-color-${color}-5)` }}>
              <Group justify="space-between" wrap="wrap" gap="xs" align="flex-start">
                <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                  <ThemeIcon size={30} radius="xl" variant="light" color={color} style={{ flexShrink: 0 }}>
                    {t.completada ? <IconCircleCheck size={17} /> : vencida ? <IconAlertTriangle size={17} /> : <IconClock size={17} />}
                  </ThemeIcon>
                  <Box style={{ minWidth: 0 }}>
                    <Group gap="xs" align="center">
                      <Text fw={700} td={t.completada ? "line-through" : undefined}>
                        {t.titulo}
                      </Text>
                      <Badge size="sm" color={color} variant="light">
                        {t.completada ? "Completada" : vencida ? "Vencida" : "Pendiente"}
                      </Badge>
                    </Group>
                    {t.descripcion && <Text size="sm" c="dimmed" mt={2}>{t.descripcion}</Text>}
                  </Box>
                </Group>
                <Group gap={6}>
                  <Button size="xs" variant="light" color="blue" radius="md" leftSection={<IconEdit size={14} />} onClick={() => abrirEditar(t)}>
                    Editar
                  </Button>
                  <Tooltip label="Eliminar tarea" withArrow>
                    <ActionIcon variant="subtle" color="red" size="lg" aria-label={`Eliminar tarea ${t.titulo}`} onClick={() => eliminar(t._id)}>
                      <IconTrash size={17} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              <Group gap="lg" mt="sm" wrap="wrap" pl={42}>
                <Group gap={4} wrap="nowrap">
                  <IconBuilding size={14} color="var(--mantine-color-dimmed)" />
                  <Text size="xs" c="dimmed">{t.nombre_dependencia || t.dep_code}</Text>
                </Group>
                {t.email_responsable && (
                  <Group gap={4} wrap="nowrap">
                    <IconMail size={14} color="var(--mantine-color-dimmed)" />
                    <Text size="xs" c="dimmed">{t.email_responsable}</Text>
                  </Group>
                )}
                {t.fecha_limite && (
                  <Group gap={4} wrap="nowrap">
                    <IconCalendarDue size={14} color={vencida ? "var(--mantine-color-red-6)" : "var(--mantine-color-dimmed)"} />
                    <Text size="xs" c={vencida ? "red" : "dimmed"} fw={vencida ? 600 : undefined}>
                      Límite: {formatFechaDDMMYY(t.fecha_limite)}
                    </Text>
                  </Group>
                )}
                {t.completada && t.fecha_completada && (
                  <Group gap={4} wrap="nowrap">
                    <IconCircleCheck size={14} color="var(--mantine-color-teal-6)" />
                    <Text size="xs" c="teal">Completada: {formatFechaDDMMYY(t.fecha_completada)}</Text>
                  </Group>
                )}
              </Group>

              {t.observacion_respuesta && (
                <Paper radius="md" p="xs" mt="sm" ml={42} style={{ background: "var(--mantine-color-teal-light)" }}>
                  <Text size="xs"><strong>Respuesta:</strong> {t.observacion_respuesta}</Text>
                </Paper>
              )}
            </Paper>
            );
          })}
        </Stack>
      )}

      {/* Modal crear/editar */}
      <Modal
        opened={modalOpen}
        onClose={() => { setHasChanges(false); setModalOpen(false); }}
        title={editTask ? "Editar tarea" : "Asignar nueva tarea"}
        centered
        size="md"
      >
        <Stack gap="sm">
          <TextInput
            label="Título"
            placeholder="Ej: Actualizar documentos fase 3"
            required
            value={form.titulo}
            onChange={(e) => { setForm((f) => ({ ...f, titulo: e.currentTarget.value })); setHasChanges(true); }}
          />
          <Textarea
            label="Descripción"
            placeholder="Detalle de la tarea..."
            rows={3}
            value={form.descripcion}
            onChange={(e) => { setForm((f) => ({ ...f, descripcion: e.currentTarget.value })); setHasChanges(true); }}
          />
          <Select
            label="Dependencia destino"
            placeholder="Selecciona una dependencia"
            required
            data={depOptions}
            value={form.dep_code || null}
            onChange={handleDepChange}
            searchable
          />
          <TextInput
            label="Email responsable (opcional)"
            placeholder="responsable@unibague.edu.co"
            value={form.email_responsable}
            onChange={(e) => { setForm((f) => ({ ...f, email_responsable: e.currentTarget.value })); setHasChanges(true); }}
          />
          <TextInput
            label="Fecha límite (opcional)"
            type="date"
            value={form.fecha_limite}
            onChange={(e) => { setForm((f) => ({ ...f, fecha_limite: e.currentTarget.value })); setHasChanges(true); }}
          />
          {error && <Text size="sm" c="red">{error}</Text>}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => { setHasChanges(false); setModalOpen(false); }}>Cancelar</Button>
            <Button color="violet" loading={saving} onClick={guardar}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>
      </Stack>
    </div>
  );
}
