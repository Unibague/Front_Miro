"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Center,
  Collapse,
  Container,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
  IconEdit,
  IconFileText,
  IconFileTypePdf,
  IconForms,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";

interface Campo {
  _id?: string;
  etiqueta: string;
  tipo: "texto_largo" | "archivo_pdf";
  requerido: boolean;
  descripcion: string;
  orden: number;
}

interface Formulario {
  _id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  indicador_id: { _id: string; codigo: string; nombre: string } | null;
  campos: Campo[];
  creado_por: string;
  createdAt: string;
}

const TIPO_LABEL: Record<Campo["tipo"], string> = {
  texto_largo: "Texto largo",
  archivo_pdf: "Archivo PDF",
};

const TIPO_ICON: Record<Campo["tipo"], ReactNode> = {
  texto_largo: <IconFileText size={14} />,
  archivo_pdf: <IconFileTypePdf size={14} />,
};

function FormularioModal({
  opened,
  onClose,
  selected,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  selected: Formulario | null;
  onSaved: (f: Formulario) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activo, setActivo] = useState(true);
  const [indicadorId, setIndicadorId] = useState<string | null>(null);
  const [campos, setCampos] = useState<Campo[]>([]);
  const [loading, setLoading] = useState(false);
  const [indicadores, setIndicadores] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    axios
      .get(PDI_ROUTES.indicadores())
      .then((r) =>
        setIndicadores(
          r.data.map((i: any) => ({
            value: i._id,
            label: `${i.codigo} - ${i.nombre}`.slice(0, 90),
          })),
        ),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!opened) return;

    if (selected) {
      setNombre(selected.nombre);
      setDescripcion(selected.descripcion);
      setActivo(selected.activo);
      setIndicadorId(selected.indicador_id?._id ?? null);
      setCampos(selected.campos.map((campo) => ({ ...campo })));
      return;
    }

    setNombre("");
    setDescripcion("");
    setActivo(true);
    setIndicadorId(null);
    setCampos([]);
  }, [opened, selected]);

  const addCampo = () =>
    setCampos((prev) => [
      ...prev,
      {
        etiqueta: "",
        tipo: "texto_largo",
        requerido: false,
        descripcion: "",
        orden: prev.length,
      },
    ]);

  const removeCampo = (idx: number) =>
    setCampos((prev) => prev.filter((_, i) => i !== idx));

  const updateCampo = (idx: number, key: keyof Campo, value: Campo[keyof Campo]) =>
    setCampos((prev) => prev.map((campo, i) => (i === idx ? { ...campo, [key]: value } : campo)));

  const handleSave = async () => {
    if (!nombre.trim()) {
      showNotification({ title: "Error", message: "El nombre es requerido", color: "red" });
      return;
    }

    if (!indicadorId) {
      showNotification({ title: "Error", message: "Selecciona un indicador", color: "red" });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        activo,
        indicador_id: indicadorId,
        campos: campos.map((campo, index) => ({ ...campo, orden: index })),
      };

      const res = selected
        ? await axios.put(PDI_ROUTES.formulario(selected._id), payload)
        : await axios.post(PDI_ROUTES.formularios(), payload);

      showNotification({
        title: selected ? "Actualizado" : "Creado",
        message: "Formulario guardado",
        color: "teal",
      });
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({
        title: "Error",
        message: e.response?.data?.error ?? "Error al guardar",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={selected ? "Editar formulario" : "Nuevo formulario PDI"}
      centered
      size="lg"
    >
      <Stack gap="sm">
        <TextInput
          label="Nombre del formulario"
          placeholder="Ej: Reporte semestral del indicador"
          value={nombre}
          onChange={(e) => setNombre(e.currentTarget.value)}
        />
        <Textarea
          label="Descripcion"
          placeholder="Instrucciones para el responsable"
          value={descripcion}
          onChange={(e) => setDescripcion(e.currentTarget.value)}
          rows={2}
        />

        <Divider label="Indicador asociado" labelPosition="left" />
        <Select
          label="Indicador"
          placeholder="Buscar indicador"
          data={indicadores}
          value={indicadorId}
          onChange={setIndicadorId}
          searchable
          clearable
          description="Cada indicador puede tener un unico formulario"
        />

        <Switch
          label="Formulario activo"
          checked={activo}
          onChange={(e) => setActivo(e.currentTarget.checked)}
          color="teal"
        />

        <Divider label="Campos del formulario" labelPosition="left" />

        {campos.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py="xs">
            Sin campos, agrega al menos uno
          </Text>
        )}

        {campos.map((campo, idx) => (
          <Paper key={idx} withBorder radius="md" p="sm">
            <Group justify="space-between" mb={8}>
              <Group gap={6}>
                <ThemeIcon size={22} radius="xl" color="teal" variant="light">
                  {TIPO_ICON[campo.tipo]}
                </ThemeIcon>
                <Text size="xs" fw={700} c="dimmed">
                  Campo {idx + 1}
                </Text>
              </Group>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeCampo(idx)}>
                <IconTrash size={13} />
              </ActionIcon>
            </Group>

            <Stack gap={6}>
              <TextInput
                size="xs"
                label="Etiqueta"
                placeholder="Ej: Resultados alcanzados"
                value={campo.etiqueta}
                onChange={(e) => updateCampo(idx, "etiqueta", e.currentTarget.value)}
              />
              <Select
                size="xs"
                label="Tipo"
                data={[
                  { value: "texto_largo", label: "Texto largo" },
                  { value: "archivo_pdf", label: "Archivo PDF" },
                ]}
                value={campo.tipo}
                onChange={(value) => updateCampo(idx, "tipo", (value as Campo["tipo"]) ?? "texto_largo")}
              />
              <TextInput
                size="xs"
                label="Descripcion o ayuda"
                placeholder="Instruccion para el responsable"
                value={campo.descripcion}
                onChange={(e) => updateCampo(idx, "descripcion", e.currentTarget.value)}
              />
              <Switch
                size="xs"
                label="Campo requerido"
                checked={campo.requerido}
                onChange={(e) => updateCampo(idx, "requerido", e.currentTarget.checked)}
                color="teal"
              />
            </Stack>
          </Paper>
        ))}

        <Button size="xs" variant="light" color="teal" leftSection={<IconPlus size={13} />} onClick={addCampo}>
          Agregar campo
        </Button>

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={loading} onClick={handleSave} color="teal">
            Guardar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function FormularioCard({
  form,
  onEdit,
  onDelete,
  onToggle,
}: {
  form: Formulario;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const asociado = form.indicador_id
    ? `Indicador: ${form.indicador_id.codigo} - ${form.indicador_id.nombre}`
    : "Sin indicador asociado";

  return (
    <Paper
      withBorder
      radius="lg"
      p="lg"
      shadow="xs"
      style={{ borderLeft: `4px solid ${form.activo ? "#0d9488" : "#adb5bd"}` }}
    >
      <Group justify="space-between" align="flex-start">
        <Group gap={10}>
          <ThemeIcon size={36} radius="xl" color={form.activo ? "teal" : "gray"} variant="light">
            <IconForms size={18} />
          </ThemeIcon>
          <div>
            <Group gap={8} mb={2}>
              <Text fw={700} size="sm">
                {form.nombre}
              </Text>
              <Badge size="xs" color={form.activo ? "teal" : "gray"} variant="light">
                {form.activo ? "Activo" : "Inactivo"}
              </Badge>
              <Badge size="xs" color="violet" variant="outline">
                {form.campos.length} campo{form.campos.length !== 1 ? "s" : ""}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1}>
              {asociado}
            </Text>
            {form.descripcion && (
              <Text size="xs" c="dimmed" mt={2} lineClamp={1}>
                {form.descripcion}
              </Text>
            )}
          </div>
        </Group>

        <Group gap={6}>
          <Switch size="sm" checked={form.activo} onChange={onToggle} color="teal" />
          <ActionIcon variant="subtle" color="blue" onClick={onEdit}>
            <IconEdit size={15} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={onDelete}>
            <IconTrash size={15} />
          </ActionIcon>
          <ActionIcon variant="subtle" color="teal" onClick={() => setOpen((value) => !value)}>
            {open ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
          </ActionIcon>
        </Group>
      </Group>

      <Collapse in={open}>
        <Divider my="sm" />
        <Text size="xs" fw={600} c="dimmed" mb={6}>
          Campos del formulario
        </Text>
        <Stack gap={4}>
          {form.campos.length === 0 ? (
            <Text size="xs" c="dimmed">
              Sin campos configurados
            </Text>
          ) : (
            form.campos.map((campo, idx) => (
              <Paper key={idx} withBorder radius="sm" p="xs">
                <Group gap={8}>
                  <ThemeIcon size={20} radius="xl" color="teal" variant="light">
                    {TIPO_ICON[campo.tipo]}
                  </ThemeIcon>
                  <div style={{ flex: 1 }}>
                    <Group gap={6}>
                      <Text size="xs" fw={600}>
                        {campo.etiqueta}
                      </Text>
                      <Badge size="xs" variant="outline" color="teal">
                        {TIPO_LABEL[campo.tipo]}
                      </Badge>
                      {campo.requerido && (
                        <Badge size="xs" color="red" variant="light">
                          Requerido
                        </Badge>
                      )}
                    </Group>
                    {campo.descripcion && (
                      <Text size="xs" c="dimmed">
                        {campo.descripcion}
                      </Text>
                    )}
                  </div>
                </Group>
              </Paper>
            ))
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}

export default function FormulariosPage() {
  const router = useRouter();
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<Formulario | null>(null);

  useEffect(() => {
    axios
      .get(PDI_ROUTES.formularios())
      .then((r) => setFormularios(r.data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (form: Formulario) => {
    try {
      const payload = {
        nombre: form.nombre,
        descripcion: form.descripcion,
        activo: !form.activo,
        indicador_id: form.indicador_id?._id ?? null,
        campos: form.campos,
      };
      const res = await axios.put(PDI_ROUTES.formulario(form._id), payload);
      setFormularios((prev) => prev.map((item) => (item._id === form._id ? res.data : item)));
    } catch {
      showNotification({ title: "Error", message: "No se pudo actualizar", color: "red" });
    }
  };

  const handleDelete = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar formulario",
      children: (
        <Text size="sm">
          Se eliminaran tambien todas las respuestas y archivos asociados.
        </Text>
      ),
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.formulario(id));
          setFormularios((prev) => prev.filter((formulario) => formulario._id !== id));
          showNotification({ title: "Eliminado", message: "Formulario eliminado", color: "teal" });
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const activos = formularios.filter((formulario) => formulario.activo).length;
  const inactivos = formularios.filter((formulario) => !formulario.activo).length;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        <Container size="lg" py="xl">
          <Group mb="lg" justify="space-between">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={40} radius="xl" color="teal" variant="light">
                <IconForms size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Formularios PDI</Title>
                <Text size="xs" c="dimmed">
                  Crea un formulario personalizado para cada indicador
                </Text>
              </div>
            </Group>
            <Button
              leftSection={<IconPlus size={15} />}
              color="teal"
              onClick={() => {
                setSelected(null);
                setModal(true);
              }}
            >
              Nuevo formulario
            </Button>
          </Group>

          <Divider mb="lg" />

          <Group mb="lg" gap="md">
            <Paper withBorder radius="md" p="md" style={{ minWidth: 120, textAlign: "center" }}>
              <Text size="xl" fw={800} c="teal">
                {formularios.length}
              </Text>
              <Text size="xs" c="dimmed">
                Total
              </Text>
            </Paper>
            <Paper withBorder radius="md" p="md" style={{ minWidth: 120, textAlign: "center" }}>
              <Text size="xl" fw={800} c="green">
                {activos}
              </Text>
              <Text size="xs" c="dimmed">
                Activos
              </Text>
            </Paper>
            <Paper withBorder radius="md" p="md" style={{ minWidth: 120, textAlign: "center" }}>
              <Text size="xl" fw={800} c="dimmed">
                {inactivos}
              </Text>
              <Text size="xs" c="dimmed">
                Inactivos
              </Text>
            </Paper>
          </Group>

          {loading ? (
            <Center py="xl">
              <Loader color="teal" />
            </Center>
          ) : formularios.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <ThemeIcon size={56} radius="xl" color="teal" variant="light">
                  <IconForms size={28} />
                </ThemeIcon>
                <Text fw={600}>No hay formularios creados</Text>
                <Text size="sm" c="dimmed">
                  Crea el primer formulario para que los responsables lo diligencien por indicador
                </Text>
                <Button
                  leftSection={<IconPlus size={14} />}
                  color="teal"
                  mt="sm"
                  onClick={() => {
                    setSelected(null);
                    setModal(true);
                  }}
                >
                  Nuevo formulario
                </Button>
              </Stack>
            </Center>
          ) : (
            <Stack gap="sm">
              {formularios.map((formulario) => (
                <FormularioCard
                  key={formulario._id}
                  form={formulario}
                  onEdit={() => {
                    setSelected(formulario);
                    setModal(true);
                  }}
                  onDelete={() => handleDelete(formulario._id)}
                  onToggle={() => handleToggle(formulario)}
                />
              ))}
            </Stack>
          )}
        </Container>
      </div>

      <FormularioModal
        opened={modal}
        onClose={() => setModal(false)}
        selected={selected}
        onSaved={(doc) => {
          setFormularios((prev) =>
            selected ? prev.map((item) => (item._id === doc._id ? doc : item)) : [doc, ...prev],
          );
        }}
      />
    </div>
  );
}
