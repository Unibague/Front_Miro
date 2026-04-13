"use client";

import { useState, useEffect } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Button, Stack,
  Loader, Center, ThemeIcon, ActionIcon, Divider, TextInput,
  Switch, Modal, NumberInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconCalendarStats, IconArrowLeft, IconPlus, IconEdit,
  IconTrash, IconCheck, IconX, IconLock, IconLockOpen,
} from "@tabler/icons-react";

import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";

interface Corte {
  _id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  orden: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

function CorteModal({ opened, onClose, selected, onSaved }: {
  opened: boolean;
  onClose: () => void;
  selected: Corte | null;
  onSaved: (c: Corte) => void;
}) {
  const [nombre, setNombre]           = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activo, setActivo]           = useState(true);
  const [orden, setOrden]             = useState<number>(0);
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin]       = useState<Date | null>(null);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setNombre(selected.nombre);
      setDescripcion(selected.descripcion);
      setActivo(selected.activo);
      setOrden(selected.orden);
      setFechaInicio(selected.fecha_inicio ? new Date(selected.fecha_inicio) : null);
      setFechaFin(selected.fecha_fin ? new Date(selected.fecha_fin) : null);
    } else {
      setNombre(""); setDescripcion(""); setActivo(true); setOrden(0);
      setFechaInicio(null); setFechaFin(null);
    }
  }, [opened, selected]);

  const handleSave = async () => {
    if (!nombre.trim()) {
      showNotification({ title: "Error", message: "El nombre es requerido", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        activo,
        orden,
        fecha_inicio: fechaInicio ? fechaInicio.toISOString() : null,
        fecha_fin:    fechaFin    ? fechaFin.toISOString()    : null,
      };
      const res = selected
        ? await axios.put(PDI_ROUTES.corte(selected._id), payload)
        : await axios.post(PDI_ROUTES.cortes(), payload);
      showNotification({ title: selected ? "Actualizado" : "Creado", message: "Corte guardado", color: "teal" });
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened} onClose={onClose}
      title={selected ? "Editar Corte" : "Nuevo Corte PDI"}
      centered size="sm"
    >
      <Stack gap="sm">
        <TextInput
          label="Nombre del corte"
          placeholder="Ej: 2026A, 2026B, 2027A"
          value={nombre}
          onChange={e => setNombre(e.currentTarget.value)}
          description="Este nombre aparecerá en el selector de periodos de los indicadores"
        />
        <TextInput
          label="Descripción"
          placeholder="Ej: Primer semestre 2026"
          value={descripcion}
          onChange={e => setDescripcion(e.currentTarget.value)}
        />
        <NumberInput
          label="Orden"
          description="Posición en el selector (menor = primero)"
          value={orden}
          onChange={v => setOrden(Number(v))}
          min={0}
        />
        <DatePickerInput
          label="Fecha de apertura"
          description="Desde cuándo los responsables pueden calificar"
          placeholder="Selecciona fecha"
          value={fechaInicio}
          onChange={setFechaInicio}
          clearable
          locale="es"
        />
        <DatePickerInput
          label="Fecha de cierre"
          description="Hasta cuándo los responsables pueden calificar"
          placeholder="Selecciona fecha"
          value={fechaFin}
          onChange={setFechaFin}
          clearable
          locale="es"
          minDate={fechaInicio ?? undefined}
        />
        <Switch
          label="Corte activo"
          description="Solo los cortes activos aparecen en los indicadores"
          checked={activo}
          onChange={e => setActivo(e.currentTarget.checked)}
          color="violet"
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={loading} onClick={handleSave} color="violet">Guardar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function CortesPage() {
  const router = useRouter();
  const [cortes, setCortes]   = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [selected, setSelected] = useState<Corte | null>(null);

  useEffect(() => {
    axios.get(PDI_ROUTES.cortes())
      .then(res => setCortes(res.data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (corte: Corte) => {
    try {
      const res = await axios.put(PDI_ROUTES.corte(corte._id), { ...corte, activo: !corte.activo });
      setCortes(prev => prev.map(c => c._id === corte._id ? res.data : c));
    } catch {
      showNotification({ title: "Error", message: "No se pudo actualizar", color: "red" });
    }
  };

  const handleDelete = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar corte",
      children: <Text size="sm">¿Seguro que deseas eliminar este corte? Los indicadores que lo usen conservarán el valor guardado.</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.corte(id));
          setCortes(prev => prev.filter(c => c._id !== id));
          showNotification({ title: "Eliminado", message: "Corte eliminado", color: "teal" });
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const activos   = cortes.filter(c => c.activo).length;
  const inactivos = cortes.filter(c => !c.activo).length;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        <Container size="md" py="xl">
          {/* Header */}
          <Group mb="lg" justify="space-between">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={40} radius="xl" color="violet" variant="light">
                <IconCalendarStats size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Cortes PDI</Title>
                <Text size="xs" c="dimmed">Gestiona los periodos de corte disponibles para los indicadores</Text>
              </div>
            </Group>
            <Button
              leftSection={<IconPlus size={15} />}
              color="violet"
              onClick={() => { setSelected(null); setModal(true); }}
            >
              Nuevo corte
            </Button>
          </Group>

          <Divider mb="lg" />

          {/* Stats */}
          <Group mb="lg" gap="md">
            <Paper withBorder radius="md" p="md" style={{ minWidth: 120, textAlign: "center" }}>
              <Text size="xl" fw={800} c="violet">{cortes.length}</Text>
              <Text size="xs" c="dimmed">Total cortes</Text>
            </Paper>
            <Paper withBorder radius="md" p="md" style={{ minWidth: 120, textAlign: "center" }}>
              <Text size="xl" fw={800} c="green">{activos}</Text>
              <Text size="xs" c="dimmed">Activos</Text>
            </Paper>
            <Paper withBorder radius="md" p="md" style={{ minWidth: 120, textAlign: "center" }}>
              <Text size="xl" fw={800} c="dimmed">{inactivos}</Text>
              <Text size="xs" c="dimmed">Inactivos</Text>
            </Paper>
          </Group>

          {/* Lista */}
          {loading ? (
            <Center py="xl"><Loader color="violet" /></Center>
          ) : cortes.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <ThemeIcon size={56} radius="xl" color="violet" variant="light">
                  <IconCalendarStats size={28} />
                </ThemeIcon>
                <Text fw={600}>No hay cortes registrados</Text>
                <Text size="sm" c="dimmed">Crea el primer corte para que aparezca en los indicadores</Text>
              </Stack>
            </Center>
          ) : (
            <Stack gap="sm">
              {cortes.map(c => (
                <Paper key={c._id} withBorder radius="md" p="md"
                  style={{ borderLeft: `4px solid ${c.activo ? "#7c3aed" : "#adb5bd"}` }}
                >
                  <Group justify="space-between" align="center">
                    <Group gap={12}>
                      <div>
                        <Group gap={8}>
                          <Text fw={700} size="sm">{c.nombre}</Text>
                          <Badge
                            size="xs"
                            color={c.activo ? "violet" : "gray"}
                            variant="light"
                            leftSection={c.activo ? <IconCheck size={9} /> : <IconX size={9} />}
                          >
                            {c.activo ? "Activo" : "Inactivo"}
                          </Badge>
                          {c.orden > 0 && (
                            <Badge size="xs" color="blue" variant="outline">Orden: {c.orden}</Badge>
                          )}
                        </Group>
                        {c.descripcion && (
                          <Text size="xs" c="dimmed" mt={2}>{c.descripcion}</Text>
                        )}
                        {(c.fecha_inicio || c.fecha_fin) && (
                          <Group gap={6} mt={4}>
                            {c.fecha_inicio && (
                              <Badge size="xs" color="blue" variant="outline" leftSection={<IconLockOpen size={9} />}>
                                Abre: {new Date(c.fecha_inicio).toLocaleDateString("es-CO")}
                              </Badge>
                            )}
                            {c.fecha_fin && (
                              <Badge size="xs" color={new Date() > new Date(c.fecha_fin) ? "red" : "teal"} variant="outline" leftSection={<IconLock size={9} />}>
                                Cierra: {new Date(c.fecha_fin).toLocaleDateString("es-CO")}
                              </Badge>
                            )}
                          </Group>
                        )}
                      </div>
                    </Group>
                    <Group gap={6}>
                      <Switch
                        size="sm"
                        checked={c.activo}
                        onChange={() => handleToggle(c)}
                        color="violet"
                        title={c.activo ? "Desactivar" : "Activar"}
                      />
                      <ActionIcon variant="subtle" color="blue" onClick={() => { setSelected(c); setModal(true); }}>
                        <IconEdit size={15} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(c._id)}>
                        <IconTrash size={15} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
        </Container>
      </div>

      <CorteModal
        opened={modal}
        onClose={() => setModal(false)}
        selected={selected}
        onSaved={doc => {
          setCortes(prev => selected
            ? prev.map(c => c._id === doc._id ? doc : c)
            : [...prev, doc].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
          );
        }}
      />
    </div>
  );
}
