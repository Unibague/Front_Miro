"use client";

import { useState, useEffect } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Button, Stack,
  Loader, Center, ThemeIcon, ActionIcon, Divider, TextInput,
  Switch, Modal,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
  IconCalendarStats, IconArrowLeft, IconPlus, IconEdit,
  IconTrash, IconCheck, IconX, IconLock, IconLockOpen, IconCopy,
  IconSend,
} from "@tabler/icons-react";

import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import { useViewPermission } from "@/app/hooks/useViewPermission";

interface Corte {
  _id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  orden: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

function formatFechaCorte(value?: string | null) {
  if (!value) return "sin fecha definida";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sin fecha definida";
  return date.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getDateKey(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return Number(`${year}${month}${day}`);
}

function corteEstaAbierto(corte: Corte) {
  if (!corte.activo) return false;
  if (!corte.fecha_inicio && !corte.fecha_fin) return true;
  const today = getDateKey();
  const start = corte.fecha_inicio ? getDateKey(corte.fecha_inicio) : null;
  const end = corte.fecha_fin ? getDateKey(corte.fecha_fin) : null;
  if (!today) return false;
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
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
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin]       = useState<Date | null>(null);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setNombre(selected.nombre);
      setDescripcion(selected.descripcion);
      setActivo(selected.activo);
      setFechaInicio(selected.fecha_inicio ? new Date(selected.fecha_inicio) : null);
      setFechaFin(selected.fecha_fin ? new Date(selected.fecha_fin) : null);
    } else {
      setNombre(""); setDescripcion(""); setActivo(true);
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
        fecha_inicio: fechaInicio ? fechaInicio.toISOString() : null,
        fecha_fin:    fechaFin    ? fechaFin.toISOString()    : null,
      };
      const isEditing = Boolean(selected?._id);
      const res = isEditing
        ? await axios.put(PDI_ROUTES.corte(selected!._id), payload)
        : await axios.post(PDI_ROUTES.cortes(), payload);
      showNotification({ title: isEditing ? "Actualizado" : "Creado", message: "Corte guardado", color: "teal" });
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
      title={selected?._id ? "Editar Corte" : "Nuevo Corte PDI"}
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
  const { canManage } = useViewPermission("pdi");
  const [cortes, setCortes]   = useState<Corte[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [selected, setSelected] = useState<Corte | null>(null);
  const [notifying, setNotifying] = useState(false);

  const buildDuplicateName = (baseName: string) => {
    const trimmed = baseName.trim();
    let candidate = `${trimmed}_copia`;
    let index = 2;

    while (cortes.some((c) => c.nombre.toLowerCase() === candidate.toLowerCase())) {
      candidate = `${trimmed}_copia_${index}`;
      index += 1;
    }

    return candidate;
  };

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

  const handleDuplicate = (corte: Corte) => {
    setSelected({
      ...corte,
      _id: "",
      nombre: buildDuplicateName(corte.nombre),
      descripcion: corte.descripcion ? `${corte.descripcion} (copia)` : "Copia del corte",
      activo: false,
    });
    setModal(true);
  };

  const handleNotifyUsers = () => {
    const corteAbierto = cortes.find(corteEstaAbierto);

    if (!corteAbierto) {
      showNotification({
        title: "Sin corte abierto",
        message: "Activa un corte y define fechas vigentes antes de notificar a los usuarios.",
        color: "yellow",
      });
      return;
    }

    modals.openConfirmModal({
      title: "Notificar usuarios PDI",
      children: (
        <Text size="sm">
          Se enviara un correo a lideres de macroproyecto y responsables de proyecto para informar que el corte{" "}
          <b>{corteAbierto.nombre}</b> esta abierto del{" "}
          <b>{formatFechaCorte(corteAbierto.fecha_inicio)}</b> al{" "}
          <b>{formatFechaCorte(corteAbierto.fecha_fin)}</b>.
        </Text>
      ),
      labels: { confirm: "Enviar notificacion", cancel: "Cancelar" },
      confirmProps: { color: "blue" },
      onConfirm: async () => {
        setNotifying(true);
        try {
          const res = await axios.post(PDI_ROUTES.corteNotificarUsuarios(corteAbierto._id));
          const enviados = Number(res.data?.enviados) || 0;
          const fallidos = Number(res.data?.fallidos) || 0;
          const primerError = res.data?.errores?.[0]?.error;
          showNotification({
            title: "Notificacion enviada",
            message: `Se enviaron ${enviados} correo(s)${fallidos ? ` y fallaron ${fallidos}${primerError ? `: ${primerError}` : ""}` : ""}.`,
            color: fallidos ? "yellow" : "teal",
          });
        } catch (e: any) {
          showNotification({
            title: "Error",
            message: e.response?.data?.error ?? "No se pudo enviar la notificacion",
            color: "red",
          });
        } finally {
          setNotifying(false);
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
            <Group gap={8}>
              <Button
                leftSection={<IconSend size={15} />}
                color="blue"
                variant="light"
                onClick={handleNotifyUsers}
                loading={notifying}
                disabled={!canManage || loading}
              >
                Notificar usuarios
              </Button>
              <Button
                leftSection={<IconPlus size={15} />}
                color="violet"
                onClick={() => { setSelected(null); setModal(true); }}
                disabled={!canManage}
              >
                Nuevo corte
              </Button>
            </Group>
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
                        onChange={() => canManage && handleToggle(c)}
                        color="violet"
                        title={c.activo ? "Desactivar" : "Activar"}
                        disabled={!canManage}
                      />
                      <ActionIcon variant="subtle" color="blue" disabled={!canManage} onClick={() => { setSelected(c); setModal(true); }}>
                        <IconEdit size={15} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="violet" disabled={!canManage} onClick={() => handleDuplicate(c)} title="Duplicar corte">
                        <IconCopy size={15} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" disabled={!canManage} onClick={() => handleDelete(c._id)}>
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
          setCortes(prev => selected?._id
            ? prev.map(c => c._id === doc._id ? doc : c)
            : [...prev, doc]
          );
        }}
      />
    </div>
  );
}
