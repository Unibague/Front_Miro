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
  Pagination,
  Table,
  Text,
  TextInput,
  Tooltip,
  Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconCirclePlus,
  IconDownload,
  IconEdit,
  IconArrowRight,
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

interface SniesTemplatesViewProps {
  mode: "configure" | "manage";
  module?: "snies" | "cna";
}

const PAGE_SIZE = 8;

export default function SniesTemplatesView({ mode, module = "snies" }: SniesTemplatesViewProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedPeriodId } = usePeriod();
  const [opened, { open, close }] = useDisclosure(false);
  const [templates, setTemplates] = useState<SniesTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SniesTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const isConfigureMode = mode === "configure";
  const moduleUpper = module.toUpperCase();
  const moduleBasePath = `/${module}/templates`;
  const apiBasePath = `${process.env.NEXT_PUBLIC_API_URL}/${module}/templates`;

  const fetchTemplates = async () => {
    if (!session?.user?.email) return;

    setLoading(true);
    try {
      const response = await axios.get(apiBasePath, {
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
      console.error(`Error fetching ${moduleUpper} templates:`, error);
      showNotification({
        title: "Error",
        message: `No fue posible cargar las plantillas ${moduleUpper}.`,
        color: "red",
      });
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [session?.user?.email, page, search, selectedPeriodId]);

  const resetForm = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setFile(null);
  };

  const openCreate = () => {
    resetForm();
    open();
  };

  const openEdit = (template: SniesTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
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
        message: `Debes subir el archivo base de la plantilla ${moduleUpper}.`,
        color: "red",
      });
      return;
    }

    if (file) {
      const fileName = file.name.toLowerCase();
      const isSupportedWorkbook = fileName.endsWith(".xlsx") || fileName.endsWith(".xlsm");

      if (!isSupportedWorkbook) {
        showNotification({
          title: "Formato no compatible",
          message: `La plantilla ${moduleUpper} debe estar en formato .xlsx o .xlsm. Los archivos .xls no son compatibles.`,
          color: "red",
        });
        return;
      }
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
      if (selectedPeriodId) {
        formData.append("periodId", selectedPeriodId);
      }
      if (file) {
        formData.append("template_file", file);
      }

      if (editingTemplate) {
        await axios.put(
          `${apiBasePath}/${editingTemplate._id}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        showNotification({
          title: "Plantilla actualizada",
          message: `La plantilla ${moduleUpper} se actualiz?ó correctamente.`,
          color: "teal",
        });
      } else {
        await axios.post(
          `${apiBasePath}/create`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        showNotification({
          title: "Plantilla creada",
          message: `La plantilla ${moduleUpper} se guard?ó en la base de datos.`,
          color: "teal",
        });
      }

      close();
      resetForm();
      fetchTemplates();
    } catch (error) {
      console.error(`Error saving ${moduleUpper} template:`, error);
      showNotification({
        title: "Error",
        message: `No fue posible guardar la plantilla ${moduleUpper}.`,
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: SniesTemplate) => {
    if (!session?.user?.email) return;

    try {
      await axios.delete(`${apiBasePath}/${template._id}`, {
        params: { email: session.user.email },
      });

      showNotification({
        title: "Plantilla eliminada",
        message: `${template.name} fue eliminada correctamente.`,
        color: "red",
      });

      fetchTemplates();
    } catch (error) {
      console.error(`Error deleting ${moduleUpper} template:`, error);
      showNotification({
        title: "Error",
        message: `No fue posible eliminar la plantilla ${moduleUpper}.`,
        color: "red",
      });
    }
  };

  const handleDownloadTemplate = (template: SniesTemplate) => {
    if (!session?.user?.email || !template._id) return;

    window.open(
      `${apiBasePath}/${template._id}/download-template?email=${encodeURIComponent(
        session.user.email
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const handleDownloadFieldComparison = (template: SniesTemplate) => {
    if (!session?.user?.email) return;

    window.open(
      `${apiBasePath}/${template._id}/download-field-comparison?email=${encodeURIComponent(
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
    router.push(`${moduleBasePath}/${template._id}`);
  };

  const rows = templates.map((template) => (
    <Table.Tr key={template._id}>
      <Table.Td>{template.name}</Table.Td>
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
            {isConfigureMode ? (
              <>
                <Tooltip label="Descargar plantilla">
                  <Button variant="outline" onClick={() => handleDownloadTemplate(template)}>
                    <IconDownload size={16} />
                  </Button>
                </Tooltip>
                {module === "cna" ? (
                  <Tooltip label="Descargar comparativo de campos">
                    <Button
                      variant="outline"
                      color="blue"
                      onClick={() => handleDownloadFieldComparison(template)}
                    >
                      <IconDownload size={16} />
                    </Button>
                  </Tooltip>
                ) : null}
                <Tooltip label="Editar plantilla">
                  <Button
                    variant="outline"
                    onClick={() => router.push(`${moduleBasePath}/update/${template._id}`)}
                  >
                    <IconEdit size={16} />
                  </Button>
                </Tooltip>
                <Tooltip label="Borrar plantilla">
                  <Button color="red" variant="outline" onClick={() => handleDelete(template)}>
                    <IconTrash size={16} />
                  </Button>
                </Tooltip>
              </>
            ) : (
              <>
                <Tooltip label="Ver información enviada">
                  <Button variant="outline" color="blue" onClick={() => handleOpenConnectedData(template)}>
                    <IconEye size={16} />
                  </Button>
                </Tooltip>
                <Tooltip label="Descargar comparativo de campos">
                  <Button variant="outline" color="grape" onClick={() => handleDownloadFieldComparison(template)}>
                    <IconDownload size={16} />
                  </Button>
                </Tooltip>
              </>
            )}
          </Group>
        </Center>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl" py="xl">
      <Title order={2} mb="md">
        {isConfigureMode ? `Configurar Plantillas ${moduleUpper}` : `Gestionar Plantillas ${moduleUpper}`}
      </Title>

      <TextInput
        placeholder="Buscar en todas las plantillas"
        value={search}
        onChange={(event) => {
          setSearch(event.currentTarget.value);
          setPage(1);
        }}
        mb="md"
      />

      <Group mb="md" justify="space-between">
        {isConfigureMode ? (
          <>
            <Button onClick={openCreate} leftSection={<IconCirclePlus size={18} />}>
              Crear Nueva Plantilla
            </Button>
            {module === "snies" ? (
              <Button
                variant="outline"
                rightSection={<IconArrowRight size={16} />}
                onClick={() => router.push(`${moduleBasePath}/published`)}
              >
                {`Ir a Gestionar Plantillas ${moduleUpper}`}
              </Button>
            ) : null}
          </>
        ) : (
          <Button
            variant="outline"
            onClick={() => router.push(moduleBasePath)}
          >
            {`Ir a Configurar Plantillas ${moduleUpper}`}
          </Button>
        )}
      </Group>

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Nombre</Table.Th>
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
              <Table.Td colSpan={5}>
                <Center>
                  <Text c="dimmed">
                    {loading ? `Cargando plantillas ${moduleUpper}...` : `No hay plantillas ${moduleUpper} para los filtros actuales.`}
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
        title={editingTemplate ? `Editar plantilla ${moduleUpper}` : `Subir plantilla ${moduleUpper}`}
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
        <FileInput
          label={editingTemplate ? "Reemplazar archivo base" : "Archivo base"}
          placeholder="Selecciona un archivo"
          leftSection={<IconUpload size={16} />}
          value={file}
          onChange={setFile}
          accept=".xlsx,.xlsm"
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {editingTemplate ? `Actualizar plantilla ${moduleUpper}` : `Guardar plantilla ${moduleUpper}`}
          </Button>
        </Group>
      </Modal>
    </Container>
  );
}
