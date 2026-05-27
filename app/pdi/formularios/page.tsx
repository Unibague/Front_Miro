"use client";

import { useEffect, useState } from "react";
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
  NumberInput,
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
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconEdit,
  IconForms,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import { useViewPermission } from "@/app/hooks/useViewPermission";

type TipoCampo = "texto_largo" | "texto_corto" | "archivo_pdf" | "select" | "select_con_otro" | "select_multiple" | "select_multiple_con_otro" | "checkbox";

interface Campo {
  _id?: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido: boolean;
  descripcion: string;
  orden: number;
  min_caracteres: number | null;
  max_caracteres?: number | null;
  opciones: string[];
  condicional_valor: "supero_meta" | "no_supero_meta" | null;
}

interface Formulario {
  _id: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
  alcance: "indicador" | "general";
  indicador_id: { _id: string; codigo: string; nombre: string } | null;
  campos: Campo[];
  creado_por: string;
  createdAt: string;
}

const TIPO_OPTIONS = [
  { value: "texto_largo", label: "Texto" },
  { value: "select", label: "Selección única" },
  { value: "select_con_otro", label: "Selección única con Otro" },
  { value: "select_multiple", label: "Selección múltiple" },
  { value: "select_multiple_con_otro", label: "Selección múltiple con Otro" },
  { value: "checkbox", label: "Casilla de verificación" },
];

const TIPO_LABELS: Record<TipoCampo, string> = {
  texto_largo: "Texto",
  texto_corto: "Texto",
  archivo_pdf: "Archivo PDF",
  select: "Selección única",
  select_con_otro: "Selección única con Otro",
  select_multiple: "Selección múltiple",
  select_multiple_con_otro: "Selección múltiple con Otro",
  checkbox: "Casilla",
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
  const [campos, setCampos] = useState<Campo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setNombre(selected.nombre);
      setDescripcion(selected.descripcion);
      setCampos(selected.campos.map(c => ({
        ...c,
        min_caracteres: c.min_caracteres ?? c.max_caracteres ?? null,
        opciones: c.opciones ?? [],
        condicional_valor: (c.condicional_valor === "supero_meta" || c.condicional_valor === "no_supero_meta")
          ? c.condicional_valor : null,
      })));
      return;
    }
    setNombre("");
    setDescripcion("");
    setCampos([]);
  }, [opened, selected]);

  const addCampo = () =>
    setCampos(prev => [
      ...prev,
      { etiqueta: "", tipo: "texto_largo", requerido: false, descripcion: "", orden: prev.length, min_caracteres: null, opciones: [], condicional_valor: null },
    ]);

  const removeCampo = (idx: number) =>
    setCampos(prev => prev.filter((_, i) => i !== idx));

  const updateCampo = (idx: number, key: keyof Campo, value: Campo[keyof Campo]) =>
    setCampos(prev => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)));

  const addOpcion = (campoIdx: number) =>
    setCampos(prev => prev.map((c, i) => i === campoIdx ? { ...c, opciones: [...c.opciones, ""] } : c));

  const removeOpcion = (campoIdx: number, opIdx: number) =>
    setCampos(prev => prev.map((c, i) => i === campoIdx ? { ...c, opciones: c.opciones.filter((_, oi) => oi !== opIdx) } : c));

  const updateOpcion = (campoIdx: number, opIdx: number, value: string) =>
    setCampos(prev => prev.map((c, i) => i === campoIdx ? { ...c, opciones: c.opciones.map((op, oi) => oi === opIdx ? value : op) } : c));

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
        activo: true,
        alcance: "general",
        indicador_id: null,
        campos: campos.map((c, index) => ({
          ...(c._id ? { _id: c._id } : {}),
          etiqueta: c.etiqueta,
          tipo: c.tipo,
          requerido: c.requerido,
          descripcion: c.descripcion,
          orden: index,
          min_caracteres: c.min_caracteres,
          opciones: c.opciones,
          condicional_valor: c.condicional_valor,
        })),
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

  const tieneTexto = (t: TipoCampo) => t === "texto_largo" || t === "texto_corto";
  const tieneOpciones = (t: TipoCampo) => t === "select" || t === "select_con_otro" || t === "select_multiple" || t === "select_multiple_con_otro";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={selected ? "Editar formulario" : "Nuevo formulario PDI"}
      centered
      size="xl"
    >
      <Stack gap="sm">
        <TextInput
          label="Nombre del formulario"
          placeholder="Ej: Reporte semestral del indicador"
          value={nombre}
          onChange={e => setNombre(e.currentTarget.value)}
        />
        <Textarea
          label="Descripción"
          placeholder="Instrucciones para el responsable"
          value={descripcion}
          onChange={e => setDescripcion(e.currentTarget.value)}
          rows={2}
        />

        <Divider label="Campos del formulario" labelPosition="left" />

        {campos.length === 0 && (
          <Text size="xs" c="dimmed" ta="center" py="xs">Sin campos, agrega al menos uno</Text>
        )}

        {campos.map((campo, idx) => (
          <Paper key={idx} withBorder radius="md" p="sm" style={{ background: "rgba(124,58,237,0.02)" }}>
            <Group justify="space-between" mb={8}>
              <Text size="xs" fw={700} c="violet">Campo {idx + 1}</Text>
              <ActionIcon size="sm" variant="subtle" color="red" onClick={() => removeCampo(idx)}>
                <IconTrash size={13} />
              </ActionIcon>
            </Group>
            <Stack gap={8}>
              <Group grow align="flex-end">
                <TextInput
                  size="xs"
                  label="Nombre del campo"
                  placeholder="Ej: Resultados alcanzados"
                  value={campo.etiqueta}
                  onChange={e => updateCampo(idx, "etiqueta", e.currentTarget.value)}
                />
                <Select
                  size="xs"
                  label="Tipo"
                  data={TIPO_OPTIONS}
                  value={campo.tipo}
                  onChange={v => {
                    updateCampo(idx, "tipo", (v as TipoCampo) ?? "texto_largo");
                    updateCampo(idx, "min_caracteres", null);
                    updateCampo(idx, "opciones", []);
                  }}
                  allowDeselect={false}
                />
              </Group>

              <TextInput
                size="xs"
                label="Descripción o ayuda"
                placeholder="Instrucción para el responsable"
                value={campo.descripcion}
                onChange={e => updateCampo(idx, "descripcion", e.currentTarget.value)}
              />

              <Group gap="md" align="center">
                <Switch
                  size="xs"
                  label="Requerido"
                  checked={campo.requerido}
                  onChange={e => updateCampo(idx, "requerido", e.currentTarget.checked)}
                />
              </Group>

              {tieneTexto(campo.tipo) && (
                <Group gap="md" grow>
                  <NumberInput
                    size="xs"
                    label="Mínimo de caracteres"
                    placeholder="Sin mínimo"
                    value={campo.min_caracteres ?? ""}
                    onChange={v => updateCampo(idx, "min_caracteres", typeof v === "number" ? v : null)}
                    min={1}
                    max={5000}
                    allowDecimal={false}
                  />
                  <NumberInput
                    size="xs"
                    label="Máximo de caracteres"
                    placeholder="Sin máximo"
                    value={campo.max_caracteres ?? ""}
                    onChange={v => updateCampo(idx, "max_caracteres", typeof v === "number" ? v : null)}
                    min={1}
                    max={5000}
                    allowDecimal={false}
                  />
                </Group>
              )}

              {tieneOpciones(campo.tipo) && (
                <Stack gap={4}>
                  <Text size="xs" fw={600}>Opciones de selección</Text>
                  {campo.opciones.map((op, oi) => (
                    <Group key={oi} gap={4}>
                      <TextInput
                        size="xs"
                        placeholder={`Opción ${oi + 1}`}
                        value={op}
                        onChange={e => updateOpcion(idx, oi, e.currentTarget.value)}
                        style={{ flex: 1 }}
                      />
                      <ActionIcon size="sm" color="red" variant="subtle" onClick={() => removeOpcion(idx, oi)}>
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Group>
                  ))}
                  <Button size="xs" variant="subtle" color="violet" leftSection={<IconPlus size={12} />}
                    onClick={() => addOpcion(idx)}>
                    Agregar opción
                  </Button>
                  {(campo.tipo === "select_con_otro" || campo.tipo === "select_multiple_con_otro") && (
                    <Text size="xs" c="dimmed">&quot;Otro ¿Cuál?&quot; se agrega automáticamente al final</Text>
                  )}
                </Stack>
              )}

              <Select
                size="xs"
                label="Visibilidad"
                data={[
                  { value: "siempre", label: "Siempre visible" },
                  { value: "no_supero_meta", label: "Solo si no superó la meta del período" },
                  { value: "supero_meta", label: "Solo si superó la meta del período" },
                ]}
                value={campo.condicional_valor ?? "siempre"}
                onChange={v => updateCampo(idx, "condicional_valor", (v === "siempre" || !v) ? null : v as "supero_meta" | "no_supero_meta")}
                allowDeselect={false}
              />
            </Stack>
          </Paper>
        ))}

        <Button size="xs" variant="light" color="teal" leftSection={<IconPlus size={13} />} onClick={addCampo}>
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

function FormularioCard({
  form,
  onEdit,
  onDelete,
  canManage,
}: {
  form: Formulario;
  onEdit: () => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Paper withBorder radius="lg" p="lg" shadow="xs" style={{ borderLeft: "4px solid #0d9488" }}>
      <Group justify="space-between" align="flex-start">
        <Group gap={10}>
          <ThemeIcon size={36} radius="xl" color="teal" variant="light">
            <IconForms size={18} />
          </ThemeIcon>
          <div>
            <Group gap={8} mb={2}>
              <Text fw={700} size="sm">{form.nombre}</Text>
              <Badge size="xs" color="blue" variant="light">General</Badge>
              <Badge size="xs" color="violet" variant="outline">
                {form.campos.length} campo{form.campos.length !== 1 ? "s" : ""}
              </Badge>
            </Group>
            {form.descripcion && (
              <Text size="xs" c="dimmed" mt={2} lineClamp={1}>{form.descripcion}</Text>
            )}
          </div>
        </Group>

        <Group gap={6}>
          <ActionIcon variant="subtle" color="blue" disabled={!canManage} onClick={onEdit}><IconEdit size={15} /></ActionIcon>
          <ActionIcon variant="subtle" color="red" disabled={!canManage} onClick={onDelete}><IconTrash size={15} /></ActionIcon>
          <ActionIcon variant="subtle" color="teal" onClick={() => setOpen(v => !v)}>
            {open ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
          </ActionIcon>
        </Group>
      </Group>

      <Collapse in={open}>
        <Divider my="sm" />
        <Text size="xs" fw={600} c="dimmed" mb={6}>Campos del formulario</Text>
        <Stack gap={4}>
          {form.campos.length === 0 ? (
            <Text size="xs" c="dimmed">Sin campos configurados</Text>
          ) : (
            form.campos.map((campo, idx) => (
              <Paper key={idx} withBorder radius="sm" p="xs">
                <Group gap={6}>
                  <Text size="xs" fw={600} style={{ flex: 1 }}>{campo.etiqueta}</Text>
                  <Badge size="xs" variant="outline" color="gray">
                    {TIPO_LABELS[campo.tipo as TipoCampo] ?? campo.tipo}
                  </Badge>
                  {campo.max_caracteres && (
                    <Badge size="xs" variant="light" color="blue">máx {campo.max_caracteres}</Badge>
                  )}
                  {campo.condicional_valor === "supero_meta" && (
                    <Badge size="xs" variant="light" color="green">si superó meta</Badge>
                  )}
                  {campo.condicional_valor === "no_supero_meta" && (
                    <Badge size="xs" variant="light" color="orange">si no superó meta</Badge>
                  )}
                </Group>
                {campo.descripcion && <Text size="xs" c="dimmed" mt={2}>{campo.descripcion}</Text>}
              </Paper>
            ))
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}

interface RazonRechazo {
  _id: string;
  texto: string;
  activo: boolean;
}

export default function FormulariosPage() {
  const router = useRouter();
  const { canManage } = useViewPermission("pdiForms");
  const [formularios, setFormularios] = useState<Formulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState<Formulario | null>(null);

  // Razones de rechazo
  const [razones, setRazones] = useState<RazonRechazo[]>([]);
  const [nuevaRazon, setNuevaRazon] = useState("");
  const [savingRazon, setSavingRazon] = useState(false);
  const [editingRazonId, setEditingRazonId] = useState<string | null>(null);
  const [editingRazonTexto, setEditingRazonTexto] = useState("");

  useEffect(() => {
    axios
      .get(PDI_ROUTES.formularios())
      .then(r => setFormularios(r.data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
    axios.get(PDI_ROUTES.razonesRechazo()).then(r => setRazones(r.data)).catch(() => {});
  }, []);

  const handleAddRazon = async () => {
    if (!nuevaRazon.trim()) return;
    setSavingRazon(true);
    try {
      const res = await axios.post(PDI_ROUTES.razonesRechazo(), { texto: nuevaRazon.trim() });
      setRazones(prev => [...prev, res.data]);
      setNuevaRazon("");
    } catch {
      showNotification({ title: "Error", message: "No se pudo agregar la razón", color: "red" });
    } finally {
      setSavingRazon(false);
    }
  };

  const handleSaveEditRazon = async (id: string) => {
    if (!editingRazonTexto.trim()) return;
    try {
      const res = await axios.put(PDI_ROUTES.razonRechazo(id), { texto: editingRazonTexto.trim() });
      setRazones(prev => prev.map(r => r._id === id ? res.data : r));
      setEditingRazonId(null);
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar", color: "red" });
    }
  };

  const handleDeleteRazon = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar razón de rechazo",
      children: <Text size="sm">Esta razón ya no estará disponible al rechazar formularios.</Text>,
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.razonRechazo(id));
          setRazones(prev => prev.filter(r => r._id !== id));
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const handleDelete = (id: string) => {
    modals.openConfirmModal({
      title: "Eliminar formulario",
      children: <Text size="sm">Se eliminarán también todas las respuestas y archivos asociados.</Text>,
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
                <Title order={3}>Campos PDI</Title>
                <Text size="xs" c="dimmed">Configura los campos del formulario y las razones de rechazo</Text>
              </div>
            </Group>
            {formularios.length === 0 && canManage && (
              <Button leftSection={<IconPlus size={15} />} color="teal"
                onClick={() => { setSelected(null); setModal(true); }}>
                Nuevo formulario
              </Button>
            )}
          </Group>

          <Divider mb="lg" />

          {loading ? (
            <Center py="xl"><Loader color="teal" /></Center>
          ) : formularios.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <ThemeIcon size={56} radius="xl" color="teal" variant="light">
                  <IconForms size={28} />
                </ThemeIcon>
                <Text fw={600}>No hay formularios creados</Text>
                <Text size="sm" c="dimmed">
                  Crea el formulario general para que los responsables lo diligencien en sus indicadores
                </Text>
                <Button leftSection={<IconPlus size={14} />} color="teal" mt="sm"
                  onClick={() => { setSelected(null); setModal(true); }}>
                  Nuevo formulario
                </Button>
              </Stack>
            </Center>
          ) : (
            <Stack gap="sm">
              {formularios.map(formulario => (
                <FormularioCard
                  key={formulario._id}
                  form={formulario}
                  canManage={canManage}
                  onEdit={() => { setSelected(formulario); setModal(true); }}
                  onDelete={() => handleDelete(formulario._id)}
                />
              ))}
            </Stack>
          )}

          {/* Razones de rechazo */}
          <Paper withBorder radius="lg" p="lg" shadow="xs" mt="xl"
            style={{ borderLeft: "4px solid #fa5252" }}>
            <Group gap={10} mb="md">
              <ThemeIcon size={36} radius="xl" color="red" variant="light">
                <IconX size={18} />
              </ThemeIcon>
              <div>
                <Title order={5}>Razones de rechazo</Title>
                <Text size="xs" c="dimmed">Opciones que verá el líder al rechazar un formulario</Text>
              </div>
            </Group>

          <Stack gap="xs">
            {razones.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="xs">Sin razones configuradas</Text>
            )}
            {razones.map(r => (
              <Paper key={r._id} withBorder radius="md" p="sm">
                {editingRazonId === r._id ? (
                  <Group gap={6}>
                    <TextInput
                      size="xs"
                      value={editingRazonTexto}
                      onChange={e => setEditingRazonTexto(e.currentTarget.value)}
                      style={{ flex: 1 }}
                      onKeyDown={e => e.key === "Enter" && handleSaveEditRazon(r._id)}
                      autoFocus
                    />
                    <ActionIcon size="sm" color="teal" variant="light" onClick={() => handleSaveEditRazon(r._id)}>
                      <IconCheck size={13} />
                    </ActionIcon>
                    <ActionIcon size="sm" color="gray" variant="subtle" onClick={() => setEditingRazonId(null)}>
                      <IconX size={13} />
                    </ActionIcon>
                  </Group>
                ) : (
                  <Group justify="space-between">
                    <Text size="sm">{r.texto}</Text>
                    {canManage && (
                      <Group gap={4}>
                        <ActionIcon size="sm" variant="subtle" color="blue"
                          onClick={() => { setEditingRazonId(r._id); setEditingRazonTexto(r.texto); }}>
                          <IconEdit size={13} />
                        </ActionIcon>
                        <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDeleteRazon(r._id)}>
                          <IconTrash size={13} />
                        </ActionIcon>
                      </Group>
                    )}
                  </Group>
                )}
              </Paper>
            ))}

            {canManage && (
              <Group gap={6} mt={4}>
                <TextInput
                  size="xs"
                  placeholder="Nueva razón de rechazo..."
                  value={nuevaRazon}
                  onChange={e => setNuevaRazon(e.currentTarget.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddRazon()}
                  style={{ flex: 1 }}
                />
                <Button size="xs" color="red" variant="light" loading={savingRazon}
                  leftSection={<IconPlus size={12} />} onClick={handleAddRazon}>
                  Agregar
                </Button>
              </Group>
            )}
          </Stack>
          </Paper>

        </Container>
      </div>

      <FormularioModal
        opened={modal}
        onClose={() => setModal(false)}
        selected={selected}
        onSaved={doc => {
          setFormularios(prev =>
            selected ? prev.map(item => item._id === doc._id ? doc : item) : [doc, ...prev]
          );
        }}
      />
    </div>
  );
}
