"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Title, Text, Paper, Stack, Group, Button, TextInput, Textarea,
  Select, Badge, Modal, ActionIcon, Loader, Divider, Box, NavLink, ThemeIcon, Tooltip,
} from "@mantine/core";
import {
  IconPlus, IconTrash, IconEdit, IconCircleCheck, IconCircle, IconArrowLeft,
  IconChartBar, IconMessageCircle, IconList, IconChevronLeft, IconChevronRight,
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

  const tasksFiltradas = useMemo(
    () => filtroDep ? tasks.filter((t) => t.dep_code === filtroDep) : tasks,
    [tasks, filtroDep],
  );

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
              <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                <IconList size={18} />
              </ThemeIcon>
              <Text size="xs" fw={700} c="violet" tt="uppercase">Procesos MEN</Text>
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

      <Stack p="md" gap="lg" style={{ marginLeft: `${sidebarW + 1}px`, flex: 1, minWidth: 0 }}>
        <ModuleHeader
          title="Tareas asignadas"
          description="Crea y asigna tareas/checklist a líderes de dependencia o responsables."
          actions={
            <>
              <ActionIcon variant="subtle" aria-label="Volver" onClick={() => router.push(processesMenRoutes.home)}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <Button leftSection={<IconPlus size={16} />} onClick={abrirCrear}>
                Asignar tarea
              </Button>
            </>
          }
        />

      <Select
        placeholder="Filtrar por dependencia"
        data={filtroDepOptions}
        value={filtroDep ?? ""}
        onChange={(v) => setFiltroDep(v || null)}
        clearable
        searchable
        style={{ maxWidth: 340 }}
      />

      {tasksFiltradas.length === 0 ? (
        <Paper withBorder p="xl" radius="md">
          <Text c="dimmed" ta="center">No hay tareas asignadas.</Text>
        </Paper>
      ) : (
        <Stack gap="sm">
          {tasksFiltradas.map((t) => (
            <Paper key={t._id} withBorder radius="md" p="md"
              style={{ borderLeft: `4px solid ${t.completada ? "#40c057" : "#228be6"}` }}>
              <Group justify="space-between" wrap="wrap" gap="xs">
                <Group gap="xs" align="center">
                  {t.completada
                    ? <IconCircleCheck size={18} color="#40c057" />
                    : <IconCircle size={18} color="#868e96" />}
                  <Text fw={600} size="sm" td={t.completada ? "line-through" : undefined}>
                    {t.titulo}
                  </Text>
                  <Badge size="xs" color={t.completada ? "green" : "blue"} variant="light">
                    {t.completada ? "Completada" : "Pendiente"}
                  </Badge>
                </Group>
                <Group gap={6}>
                  <ActionIcon variant="subtle" onClick={() => abrirEditar(t)}><IconEdit size={16} /></ActionIcon>
                  <ActionIcon variant="subtle" color="red" onClick={() => eliminar(t._id)}><IconTrash size={16} /></ActionIcon>
                </Group>
              </Group>

              {t.descripcion && <Text size="xs" c="dimmed" mt={4}>{t.descripcion}</Text>}

              <Group gap="md" mt={6} wrap="wrap">
                <Text size="xs" c="dimmed">
                  <strong>Dependencia:</strong> {t.nombre_dependencia || t.dep_code}
                </Text>
                {t.email_responsable && (
                  <Text size="xs" c="dimmed"><strong>Responsable:</strong> {t.email_responsable}</Text>
                )}
                {t.fecha_limite && (
                  <Text size="xs" c={!t.completada && t.fecha_limite < new Date().toISOString().split("T")[0] ? "red" : "dimmed"}>
                    <strong>Límite:</strong> {formatFechaDDMMYY(t.fecha_limite)}
                  </Text>
                )}
                {t.completada && t.fecha_completada && (
                  <Text size="xs" c="teal"><strong>Completada:</strong> {formatFechaDDMMYY(t.fecha_completada)}</Text>
                )}
              </Group>

              {t.observacion_respuesta && (
                <Paper withBorder radius="sm" p={6} mt={6} style={{ background: "#f0fff4" }}>
                  <Text size="xs" c="dimmed"><strong>Respuesta:</strong> {t.observacion_respuesta}</Text>
                </Paper>
              )}
            </Paper>
          ))}
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
            <Button loading={saving} onClick={guardar}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>
      </Stack>
    </div>
  );
}
