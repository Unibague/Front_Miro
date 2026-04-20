"use client";

import { useState, useEffect } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Button, Stack,
  Loader, Center, ThemeIcon, ActionIcon, Divider, Modal, TextInput,
  Textarea, Select, Switch, Collapse, ScrollArea, SimpleGrid,
} from "@mantine/core";
import {
  IconForms, IconArrowLeft, IconPlus, IconEdit, IconTrash,
  IconChevronDown, IconChevronUp, IconFileText, IconFileTypePdf,
  IconEye, IconUser, IconCalendarStats, IconExternalLink, IconInbox,
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
  accion_id: { _id: string; codigo: string; nombre: string } | null;
  campos: Campo[];
  creado_por: string;
  createdAt: string;
}

const TIPO_LABEL: Record<string, string> = {
  texto_largo: "Texto largo",
  archivo_pdf: "Archivo PDF",
};
const TIPO_ICON: Record<string, React.ReactNode> = {
  texto_largo: <IconFileText size={14} />,
  archivo_pdf: <IconFileTypePdf size={14} />,
};

// ── Modal de formulario ────────────────────────────────────────────────────
function FormularioModal({ opened, onClose, selected, onSaved }: {
  opened: boolean;
  onClose: () => void;
  selected: Formulario | null;
  onSaved: (f: Formulario) => void;
}) {
  const [nombre, setNombre]         = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [activo, setActivo]         = useState(true);
  const [indicadorId, setIndicadorId] = useState<string | null>(null);
  const [accionId, setAccionId]     = useState<string | null>(null);
  const [campos, setCampos]         = useState<Campo[]>([]);
  const [loading, setLoading]       = useState(false);
  const [indicadores, setIndicadores] = useState<{ value: string; label: string }[]>([]);
  const [acciones, setAcciones]     = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    axios.get(PDI_ROUTES.indicadores()).then(r =>
      setIndicadores(r.data.map((i: any) => ({ value: i._id, label: `${i.codigo} — ${i.nombre}`.slice(0, 70) })))
    ).catch(() => {});
    axios.get(PDI_ROUTES.acciones()).then(r =>
      setAcciones(r.data.map((a: any) => ({ value: a._id, label: `${a.codigo} — ${a.nombre}`.slice(0, 70) })))
    ).catch(() => {});
  }, []);

  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setNombre(selected.nombre);
      setDescripcion(selected.descripcion);
      setActivo(selected.activo);
      setIndicadorId(selected.indicador_id?._id ?? null);
      setAccionId(selected.accion_id?._id ?? null);
      setCampos(selected.campos.map(c => ({ ...c })));
    } else {
      setNombre(""); setDescripcion(""); setActivo(true);
      setIndicadorId(null); setAccionId(null); setCampos([]);
    }
  }, [opened, selected]);

  const addCampo = () => setCampos(prev => [...prev, {
    etiqueta: "", tipo: "texto_largo", requerido: false, descripcion: "", orden: prev.length,
  }]);

  const removeCampo = (idx: number) => setCampos(prev => prev.filter((_, i) => i !== idx));

  const updateCampo = (idx: number, key: keyof Campo, value: any) =>
    setCampos(prev => prev.map((c, i) => i === idx ? { ...c, [key]: value } : c));

  const handleSave = async () => {
    if (!nombre.trim()) {
      showNotification({ title: "Error", message: "El nombre es requerido", color: "red" });
      return;
    }
    if (!indicadorId && !accionId) {
      showNotification({ title: "Error", message: "Asocia el formulario a un indicador o acción", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim(),
        activo,
        indicador_id: indicadorId || null,
        accion_id: accionId || null,
        campos: campos.map((c, i) => ({ ...c, orden: i })),
      };
      const res = selected
        ? await axios.put(PDI_ROUTES.formulario(selected._id), payload)
        : await axios.post(PDI_ROUTES.formularios(), payload);
      showNotification({ title: selected ? "Actualizado" : "Creado", message: "Formulario guardado", color: "teal" });
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose}
      title={selected ? "Editar Formulario" : "Nuevo Formulario PDI"}
      centered size="lg">
      <Stack gap="sm">
        <TextInput label="Nombre del formulario" placeholder="Ej: Reporte semestral indicador 1.1.1"
          value={nombre} onChange={e => setNombre(e.currentTarget.value)} />
        <Textarea label="Descripción" placeholder="Instrucciones para el responsable..."
          value={descripcion} onChange={e => setDescripcion(e.currentTarget.value)} rows={2} />

        <Divider label="Asociar a" labelPosition="left" />
        <Select label="Indicador" placeholder="Buscar indicador..." data={indicadores}
          value={indicadorId} onChange={v => { setIndicadorId(v); if (v) setAccionId(null); }}
          searchable clearable description="Si asocias a indicador, deja acción vacía" />
        <Select label="Acción estratégica" placeholder="Buscar acción..." data={acciones}
          value={accionId} onChange={v => { setAccionId(v); if (v) setIndicadorId(null); }}
          searchable clearable description="Si asocias a acción, deja indicador vacío" />

        <Switch label="Formulario activo" checked={activo}
          onChange={e => setActivo(e.currentTarget.checked)} color="teal" />

        <Divider label="Campos del formulario" labelPosition="left" />

        {campos.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py="xs">Sin campos — agrega al menos uno</Text>
        )}

        {campos.map((c, idx) => (
          <Paper key={idx} withBorder radius="md" p="sm">
            <Group justify="space-between" mb={8}>
              <Group gap={6}>
                <ThemeIcon size={22} radius="xl" color="teal" variant="light">
                  {TIPO_ICON[c.tipo]}
                </ThemeIcon>
                <Text size="xs" fw={700} c="dimmed">Campo {idx + 1}</Text>
              </Group>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeCampo(idx)}>
                <IconTrash size={13} />
              </ActionIcon>
            </Group>
            <Stack gap={6}>
              <TextInput size="xs" label="Etiqueta" placeholder="Ej: Resultados alcanzados"
                value={c.etiqueta} onChange={e => updateCampo(idx, "etiqueta", e.currentTarget.value)} />
              <Select size="xs" label="Tipo"
                data={[
                  { value: "texto_largo", label: "Texto largo" },
                  { value: "archivo_pdf", label: "Archivo PDF" },
                ]}
                value={c.tipo}
                onChange={v => updateCampo(idx, "tipo", v ?? "texto_largo")} />
              <TextInput size="xs" label="Descripción / ayuda"
                placeholder="Instrucción para el responsable..."
                value={c.descripcion} onChange={e => updateCampo(idx, "descripcion", e.currentTarget.value)} />
              <Switch size="xs" label="Campo requerido" checked={c.requerido}
                onChange={e => updateCampo(idx, "requerido", e.currentTarget.checked)} color="teal" />
            </Stack>
          </Paper>
        ))}

        <Button size="xs" variant="light" color="teal" leftSection={<IconPlus size={13} />}
          onClick={addCampo}>
          Agregar campo
        </Button>

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={loading} onClick={handleSave} color="teal">Guardar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── Card de formulario ─────────────────────────────────────────────────────
function FormularioCard({ form, onEdit, onDelete, onToggle }: {
  form: Formulario;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const asociado = form.indicador_id
    ? `Indicador: ${form.indicador_id.codigo} — ${form.indicador_id.nombre}`
    : form.accion_id
    ? `Acción: ${form.accion_id.codigo} — ${form.accion_id.nombre}`
    : "Sin asociar";

  return (
    <Paper withBorder radius="lg" p="lg" shadow="xs"
      style={{ borderLeft: `4px solid ${form.activo ? "#0d9488" : "#adb5bd"}` }}>
      <Group justify="space-between" align="flex-start">
        <Group gap={10}>
          <ThemeIcon size={36} radius="xl" color={form.activo ? "teal" : "gray"} variant="light">
            <IconForms size={18} />
          </ThemeIcon>
          <div>
            <Group gap={8} mb={2}>
              <Text fw={700} size="sm">{form.nombre}</Text>
              <Badge size="xs" color={form.activo ? "teal" : "gray"} variant="light">
                {form.activo ? "Activo" : "Inactivo"}
              </Badge>
              <Badge size="xs" color="violet" variant="outline">
                {form.campos.length} campo{form.campos.length !== 1 ? "s" : ""}
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1}>{asociado}</Text>
            {form.descripcion && <Text size="xs" c="dimmed" mt={2} lineClamp={1}>{form.descripcion}</Text>}
          </div>
        </Group>
        <Group gap={6}>
          <Switch size="sm" checked={form.activo} onChange={onToggle} color="teal" />
          <ActionIcon variant="subtle" color="blue" onClick={onEdit}><IconEdit size={15} /></ActionIcon>
          <ActionIcon variant="subtle" color="red" onClick={onDelete}><IconTrash size={15} /></ActionIcon>
          <ActionIcon variant="subtle" color="teal" onClick={() => setOpen(v => !v)}>
            {open ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
          </ActionIcon>
        </Group>
      </Group>

      <Collapse in={open}>
        <Divider my="sm" />
        <Text size="xs" fw={600} c="dimmed" mb={6}>Campos del formulario</Text>
        <Stack gap={4}>
          {form.campos.length === 0
            ? <Text size="xs" c="dimmed">Sin campos configurados</Text>
            : form.campos.map((c, i) => (
              <Paper key={i} withBorder radius="sm" p="xs">
                <Group gap={8}>
                  <ThemeIcon size={20} radius="xl" color="teal" variant="light">
                    {TIPO_ICON[c.tipo]}
                  </ThemeIcon>
                  <div style={{ flex: 1 }}>
                    <Group gap={6}>
                      <Text size="xs" fw={600}>{c.etiqueta}</Text>
                      <Badge size="xs" variant="outline" color="teal">{TIPO_LABEL[c.tipo]}</Badge>
                      {c.requerido && <Badge size="xs" color="red" variant="light">Requerido</Badge>}
                    </Group>
                    {c.descripcion && <Text size="xs" c="dimmed">{c.descripcion}</Text>}
                  </div>
                </Group>
              </Paper>
            ))
          }
        </Stack>
      </Collapse>
    </Paper>
  );
}

// ── Página principal ───────────────────────────────────────────────────────
export default function FormulariosPage() {
  const router = useRouter();
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(false);
  const [selected, setSelected]       = useState<Formulario | null>(null);

  useEffect(() => {
    axios.get(PDI_ROUTES.formularios())
      .then(r => setFormularios(r.data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (form: Formulario) => {
    try {
      const res = await axios.put(PDI_ROUTES.formulario(form._id), { ...form, activo: !form.activo });
      setFormularios(prev => prev.map(f => f._id === form._id ? res.data : f));
    } catch {
      showNotification({ title: "Error", message: "No se pudo actualizar", color: "red" });
    }
  };

  const handleDelete = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar formulario",
      children: <Text size="sm">¿Seguro? Se eliminarán también todas las respuestas y archivos asociados.</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.formulario(id));
          setFormularios(prev => prev.filter(f => f._id !== id));
          showNotification({ title: "Eliminado", message: "Formulario eliminado", color: "teal" });
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const activos   = formularios.filter(f => f.activo).length;
  const inactivos = formularios.filter(f => !f.activo).length;

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
                <Text size="xs" c="dimmed">Crea formularios personalizados para indicadores y acciones</Text>
              </div>
            </Group>
            <Button leftSection={<IconPlus size={15} />} color="teal"
              onClick={() => { setSelected(null); setModal(true); }}>
              Nuevo formulario
            </Button>
          </Group>

          <Divider mb="lg" />

          {/* Stats */}
          <Group mb="lg" gap="md">
            <Paper withBorder radius="md" p="md" style={{ minWidth: 120, textAlign: "center" }}>
              <Text size="xl" fw={800} c="teal">{formularios.length}</Text>
              <Text size="xs" c="dimmed">Total</Text>
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
            <Center py="xl"><Loader color="teal" /></Center>
          ) : formularios.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <ThemeIcon size={56} radius="xl" color="teal" variant="light">
                  <IconForms size={28} />
                </ThemeIcon>
                <Text fw={600}>No hay formularios creados</Text>
                <Text size="sm" c="dimmed">Crea el primer formulario para que los responsables puedan llenarlo</Text>
                <Button leftSection={<IconPlus size={14} />} color="teal" mt="sm"
                  onClick={() => { setSelected(null); setModal(true); }}>
                  Nuevo formulario
                </Button>
              </Stack>
            </Center>
          ) : (
            <Stack gap="sm">
              {formularios.map(f => (
                <FormularioCard
                  key={f._id}
                  form={f}
                  onEdit={() => { setSelected(f); setModal(true); }}
                  onDelete={() => handleDelete(f._id)}
                  onToggle={() => handleToggle(f)}
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
        onSaved={doc => {
          setFormularios(prev => selected
            ? prev.map(f => f._id === doc._id ? doc : f)
            : [doc, ...prev]
          );
        }}
      />
    </div>
  );
}
