"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  Button,
  Center,
  Container,
  FileInput,
  Group,
  Modal,
  MultiSelect,
  Pagination,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconCirclePlus,
  IconDownload,
  IconEdit,
  IconEye,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePeriod } from "@/app/context/PeriodContext";

interface SniesTemplate {
  _id: string;
  name: string;
  file_name: string;
  source_published_template_id?: string;
  source_published_template_name?: string;
  source_published_templates?: Array<{
    template_id: string;
    template_name: string;
  }>;
  created_by: {
    full_name?: string;
    email?: string;
  };
  drive_file_link?: string;
  drive_file_download?: string;
  updatedAt: string;
}

interface PublishedTemplateOption {
  value: string;
  label: string;
  name: string;
}

const PAGE_SIZE = 8;

export default function SniesTemplatesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedPeriodId, availablePeriods } = usePeriod();
  const [opened, { open, close }] = useDisclosure(false);
  const [templates, setTemplates] = useState<SniesTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SniesTemplate | null>(null);
  const [publishedTemplateOptions, setPublishedTemplateOptions] = useState<PublishedTemplateOption[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [sourcePublishedTemplateIds, setSourcePublishedTemplateIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);

  const currentPeriod =
    availablePeriods.find((period) => period._id === selectedPeriodId)?.name || "Sin periodo";

  const fetchTemplates = async () => {
    if (!session?.user?.email) return;

    setLoading(true);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/snies/templates`, {
        params: {
          email: session.user.email,
          page,
          limit: PAGE_SIZE,
          search,
          periodId: selectedPeriodId,
        },
      });

      setTemplates(response.data.templates || []);
      setTotalPages(response.data.pages || 1);
    } catch (error) {
      console.error("Error fetching SNIES templates:", error);
      showNotification({
        title: "Error",
        message: "No fue posible cargar las plantillas SNIES.",
        color: "red",
      });
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchPublishedTemplateOptions = async () => {
    if (!session?.user?.email) return;

    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/snies/templates/feed-options`,
        {
          params: {
            email: session.user.email,
            periodId: selectedPeriodId,
          },
        }
      );

      setPublishedTemplateOptions(response.data.publishedTemplates || []);
    } catch (error) {
      console.error("Error fetching SNIES source templates:", error);
      setPublishedTemplateOptions([]);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [session?.user?.email, page, search, selectedPeriodId]);

  useEffect(() => {
    fetchPublishedTemplateOptions();
  }, [session?.user?.email, selectedPeriodId]);

  const resetForm = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setSourcePublishedTemplateIds([]);
    setFile(null);
  };

  const openCreate = () => {
    resetForm();
    open();
  };

  const openEdit = (template: SniesTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setSourcePublishedTemplateIds(
      template.source_published_templates?.length
        ? template.source_published_templates.map((item) => item.template_id)
        : template.source_published_template_id
          ? [template.source_published_template_id]
          : []
    );
    setFile(null);
    open();
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      showNotification({
        title: "Faltan datos",
        message: "Debes ingresar el nombre de la plantilla.",
        color: "red",
      });
      return;
    }

    if (!editingTemplate && !file) {
      showNotification({
        title: "Archivo requerido",
        message: "Debes subir el archivo base de la plantilla SNIES.",
        color: "red",
      });
      return;
    }

    if (!session?.user?.email) {
      showNotification({
        title: "Sesión no disponible",
        message: "No se encontró el usuario actual.",
        color: "red",
      });
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("email", session.user.email);
      formData.append("name", templateName.trim());
      sourcePublishedTemplateIds.forEach((id) =>
        formData.append("sourcePublishedTemplateIds", id)
      );
      if (selectedPeriodId) {
        formData.append("periodId", selectedPeriodId);
      }
      if (file) {
        formData.append("template_file", file);
      }

      if (editingTemplate) {
        await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/snies/templates/${editingTemplate._id}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        showNotification({
          title: "Plantilla actualizada",
          message: "La plantilla SNIES se actualizó correctamente.",
          color: "teal",
        });
      } else {
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/snies/templates/create`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        showNotification({
          title: "Plantilla creada",
          message: "La plantilla SNIES se guardó en la base de datos.",
          color: "teal",
        });
      }

      close();
      resetForm();
      fetchTemplates();
    } catch (error) {
      console.error("Error saving SNIES template:", error);
      showNotification({
        title: "Error",
        message: "No fue posible guardar la plantilla SNIES.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: SniesTemplate) => {
    if (!session?.user?.email) return;

    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/snies/templates/${template._id}`, {
        params: { email: session.user.email },
      });

      showNotification({
        title: "Plantilla eliminada",
        message: `${template.name} fue eliminada correctamente.`,
        color: "red",
      });

      fetchTemplates();
    } catch (error) {
      console.error("Error deleting SNIES template:", error);
      showNotification({
        title: "Error",
        message: "No fue posible eliminar la plantilla SNIES.",
        color: "red",
      });
    }
  };

  const handleDownload = (template: SniesTemplate) => {
    if (!session?.user?.email) {
      return;
    }

    if (!template._id) {
      showNotification({
        title: "Archivo no disponible",
        message: "La plantilla no tiene un identificador de descarga disponible.",
        color: "yellow",
      });
      return;
    }

    window.open(
      `${process.env.NEXT_PUBLIC_API_URL}/snies/templates/${template._id}/download-template?email=${encodeURIComponent(
        session.user.email
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const getSourceTemplates = (template: SniesTemplate) => {
    if (template.source_published_templates && template.source_published_templates.length > 0) {
      return template.source_published_templates;
    }

    if (template.source_published_template_id && template.source_published_template_name) {
      return [
        {
          template_id: template.source_published_template_id,
          template_name: template.source_published_template_name,
        },
      ];
    }

    return [];
  };

  const handleOpenConnectedData = (template: SniesTemplate) => {
    router.push(`/snies/templates/${template._id}`);
  };

  const rows = templates.map((template) => (
    <Table.Tr key={template._id}>
      <Table.Td>{template.name}</Table.Td>
      <Table.Td>
        <Text size="sm">
          {getSourceTemplates(template).map((item) => item.template_name).join(", ") || "Sin conexión"}
        </Text>
      </Table.Td>
      <Table.Td>{template.created_by?.full_name || template.created_by?.email || "N/A"}</Table.Td>
      <Table.Td>{template.file_name}</Table.Td>
      <Table.Td>
        <Text c="dimmed">
          {template.updatedAt ? new Date(template.updatedAt).toLocaleDateString("es-CO") : "Sin modificaciones"}
        </Text>
      </Table.Td>
      <Table.Td>
        <Center>
          <Group gap={4}>
            <Tooltip label="Descargar plantilla">
              <Button variant="outline" onClick={() => handleDownload(template)}>
                <IconDownload size={16} />
              </Button>
            </Tooltip>
            <Tooltip label="Ver información conectada">
              <Button
                variant="outline"
                color="blue"
                onClick={() => handleOpenConnectedData(template)}
              >
                <IconEye size={16} />
              </Button>
            </Tooltip>
            <Tooltip label="Editar plantilla">
              <Button variant="outline" onClick={() => openEdit(template)}>
                <IconEdit size={16} />
              </Button>
            </Tooltip>
            <Tooltip label="Borrar plantilla">
              <Button color="red" variant="outline" onClick={() => handleDelete(template)}>
                <IconTrash size={16} />
              </Button>
            </Tooltip>
          </Group>
        </Center>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <div />
      </Group>

      <TextInput
        placeholder="Buscar en todas las plantillas"
        value={search}
        onChange={(event) => {
          setSearch(event.currentTarget.value);
          setPage(1);
        }}
        mb="md"
      />

      <Group mb="md">
        <Button onClick={openCreate} leftSection={<IconCirclePlus size={18} />}>
          Crear Nueva Plantilla
        </Button>
      </Group>

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nombre</Table.Th>
            <Table.Th>Plantilla/s Publicadas</Table.Th>
            <Table.Th>Creado Por</Table.Th>
            <Table.Th>Archivo</Table.Th>
            <Table.Th>Última Modificación</Table.Th>
            <Table.Th>
              <Center>Acciones</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.length > 0 ? (
            rows
          ) : (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Center>
                  <Text c="dimmed">
                    {loading ? "Cargando plantillas SNIES..." : "No hay plantillas SNIES para los filtros actuales."}
                  </Text>
                </Center>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Center>
        <Pagination
          mt={15}
          value={page}
          onChange={setPage}
          total={totalPages}
          siblings={1}
          boundaries={3}
        />
      </Center>

      <Modal
        opened={opened}
        onClose={() => {
          close();
          resetForm();
        }}
        title={editingTemplate ? "Editar plantilla SNIES" : "Subir plantilla SNIES"}
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        <TextInput
          label="Nombre de la plantilla"
          placeholder="Ej: movilidad_entrante_docentes"
          value={templateName}
          onChange={(event) => setTemplateName(event.currentTarget.value)}
          mb="sm"
        />
        <TextInput
          label="Creado por"
          value={session?.user?.name || session?.user?.email || ""}
          disabled
          mb="sm"
        />
        <MultiSelect
          label="Plantillas publicadas"
          placeholder="Selecciona una o varias plantillas que ya tienen datos cargados"
          data={publishedTemplateOptions}
          value={sourcePublishedTemplateIds}
          onChange={setSourcePublishedTemplateIds}
          searchable
          mb="sm"
        />
        <FileInput
          label={editingTemplate ? "Reemplazar archivo base" : "Archivo base"}
          placeholder="Selecciona un archivo"
          leftSection={<IconUpload size={16} />}
          value={file}
          onChange={setFile}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {editingTemplate ? "Actualizar plantilla SNIES" : "Guardar plantilla SNIES"}
          </Button>
        </Group>
      </Modal>
    </Container>
  );
}
