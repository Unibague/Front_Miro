"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Container,
  FileInput,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Pagination,
  ScrollArea,
  Stack,
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
  IconEye,
  IconTable,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePeriod } from "@/app/context/PeriodContext";

type FieldEquivalenceMap = Record<
  string,
  {
    worksheet_name: string;
    field_name: string;
    miro_fields: Array<{
      template_id: string;
      template_name: string;
      field_name: string;
    }>;
  }
>;

interface WorkbookSheet {
  worksheetName: string;
  headers?: string[];
  visual_fields?: Array<{
    name: string;
    field_origin?: string;
  }>;
}

interface CnaFieldOption {
  key: string;
  name: string;
  worksheetName: string;
  fieldOrigin?: string;
}

interface MiroFieldOption {
  value: string;
  fieldName: string;
  templateId: string;
  templateName: string;
}

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
  field_equivalences?: FieldEquivalenceMap;
  updatedAt: string;
}

interface SniesTemplatesViewProps {
  mode: "configure" | "manage";
  module?: "snies" | "cna";
}

const PAGE_SIZE = 8;

const encodeEquivalenceKey = (worksheetName: string, fieldName: string) =>
  JSON.stringify([worksheetName, fieldName]);

const encodeMiroFieldValue = (templateId: string, fieldName: string) =>
  JSON.stringify([templateId, fieldName]);

const isFieldEquivalenceMap = (value: unknown): value is FieldEquivalenceMap =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const getDisplayText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(getDisplayText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const record = value as Record<string, any>;
    if (Array.isArray(record.richText)) {
      return record.richText.map((item) => getDisplayText(item?.text)).join("").trim();
    }
    if (record.text !== undefined) return getDisplayText(record.text);
    if (record.result !== undefined) return getDisplayText(record.result);
    if (record.value !== undefined) return getDisplayText(record.value);
    if (record.hyperlink !== undefined) return getDisplayText(record.hyperlink);
    return "";
  }
  return "";
};

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
  const [pTemplateOptions, setPTemplateOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedPTemplateIds, setSelectedPTemplateIds] = useState<string[]>([]);
  const [loadingPTemplates, setLoadingPTemplates] = useState(false);
  const [equivalenceOpened, { open: openEquivalence, close: closeEquivalence }] = useDisclosure(false);
  const [equivalenceTemplate, setEquivalenceTemplate] = useState<SniesTemplate | null>(null);
  const [cnaFieldOptions, setCnaFieldOptions] = useState<CnaFieldOption[]>([]);
  const [selectedCnaFieldKey, setSelectedCnaFieldKey] = useState("");
  const [miroFieldOptions, setMiroFieldOptions] = useState<MiroFieldOption[]>([]);
  const [equivalenceSelections, setEquivalenceSelections] = useState<Record<string, string[]>>({});
  const [loadingEquivalences, setLoadingEquivalences] = useState(false);
  const [savingEquivalences, setSavingEquivalences] = useState(false);
  const [miroFieldSearch, setMiroFieldSearch] = useState("");

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

  const fetchPublishedTemplates = async () => {
    if (!session?.user?.email) return;
    setLoadingPTemplates(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/published`, {
        params: { email: session.user.email, page: 1, limit: 200, periodId: selectedPeriodId },
      });
      const list: any[] = res.data.templates || res.data || [];
      setPTemplateOptions(
        list.map((t) => ({
          value: String(t._id),
          label: t.name || t.template?.name || t._id,
        }))
      );
    } catch (e) {
      console.error("Error fetching published templates:", e);
    } finally {
      setLoadingPTemplates(false);
    }
  };

  const resetForm = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setFile(null);
    setSelectedPTemplateIds([]);
  };

  const openCreate = () => {
    resetForm();
    fetchPublishedTemplates();
    open();
  };

  const openEdit = (template: SniesTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setFile(null);
    const existing = (template.source_published_templates ?? []).map((s) => s.template_id);
    setSelectedPTemplateIds(existing);
    fetchPublishedTemplates();
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
      selectedPTemplateIds.forEach((id) => formData.append("sourcePublishedTemplateIds", id));

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

  const buildCnaFieldOptions = (workbookSheets: WorkbookSheet[], templateFields: any[] = []) => {
    const options = new Map<string, CnaFieldOption>();

    workbookSheets.forEach((sheet) => {
      const visualFields = sheet.visual_fields?.length
        ? sheet.visual_fields
        : (sheet.headers || []).map((name) => ({ name, field_origin: "snies_original" }));

      visualFields.forEach((field) => {
        const fieldName = getDisplayText(field?.name);
        if (!fieldName) return;
        const key = encodeEquivalenceKey(sheet.worksheetName, fieldName);
        if (!options.has(key)) {
          options.set(key, {
            key,
            name: fieldName,
            worksheetName: sheet.worksheetName,
            fieldOrigin: field.field_origin,
          });
        }
      });
    });

    if (options.size === 0) {
      templateFields.forEach((field) => {
        const fieldName = getDisplayText(field?.name);
        if (!fieldName) return;
        const worksheetName = field.worksheet_name || "CNA";
        const key = encodeEquivalenceKey(worksheetName, fieldName);
        options.set(key, {
          key,
          name: fieldName,
          worksheetName,
          fieldOrigin: field.field_origin,
        });
      });
    }

    return Array.from(options.values());
  };

  const buildMiroFieldOptions = async (sourceTemplates: ReturnType<typeof getSourceTemplates>) => {
    const responses = await Promise.allSettled(
      sourceTemplates.map((sourceTemplate) =>
        axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${sourceTemplate.template_id}`)
      )
    );

    const options = new Map<string, MiroFieldOption>();

    responses.forEach((response, index) => {
      if (response.status !== "fulfilled") return;

      const sourceTemplate = sourceTemplates[index];
      const fields = response.value.data?.template?.fields || [];

      fields.forEach((field: any) => {
        const fieldName = getDisplayText(field?.name);
        if (!fieldName) return;
        const value = encodeMiroFieldValue(sourceTemplate.template_id, fieldName);
        if (!options.has(value)) {
          options.set(value, {
            value,
            fieldName,
            templateId: sourceTemplate.template_id,
            templateName: sourceTemplate.template_name,
          });
        }
      });
    });

    return Array.from(options.values()).sort((a, b) =>
      `${a.templateName} ${a.fieldName}`.localeCompare(`${b.templateName} ${b.fieldName}`)
    );
  };

  const normalizeEquivalenceSelections = (
    savedEquivalences: unknown,
    cnaFields: CnaFieldOption[],
    miroFields: MiroFieldOption[]
  ) => {
    if (!isFieldEquivalenceMap(savedEquivalences)) return {};

    const validCnaKeys = new Set(cnaFields.map((field) => field.key));
    const validMiroValues = new Set(miroFields.map((field) => field.value));

    return Object.values(savedEquivalences).reduce<Record<string, string[]>>((acc, equivalence) => {
      const cnaKey = encodeEquivalenceKey(equivalence.worksheet_name || "", equivalence.field_name || "");
      if (!validCnaKeys.has(cnaKey)) return acc;

      const selectedValues = (equivalence.miro_fields || [])
        .map((field) => encodeMiroFieldValue(field.template_id, field.field_name))
        .filter((value) => validMiroValues.has(value));

      if (selectedValues.length > 0) {
        acc[cnaKey] = selectedValues;
      }

      return acc;
    }, {});
  };

  const resetEquivalenceModal = () => {
    setEquivalenceTemplate(null);
    setCnaFieldOptions([]);
    setSelectedCnaFieldKey("");
    setMiroFieldOptions([]);
    setEquivalenceSelections({});
    setMiroFieldSearch("");
  };

  const handleOpenEquivalences = async (template: SniesTemplate) => {
    if (!session?.user?.email || module !== "cna") return;

    setEquivalenceTemplate(template);
    setLoadingEquivalences(true);
    openEquivalence();

    try {
      const response = await axios.get(`${apiBasePath}/${template._id}`, {
        params: { email: session.user.email },
      });
      const sourceTemplates = getSourceTemplates({
        ...template,
        source_published_template_id: response.data.source_published_template_id,
        source_published_template_name: response.data.source_published_template_name,
        source_published_templates: response.data.source_published_templates,
      });
      const cnaFields = buildCnaFieldOptions(response.data.workbook_sheets || [], response.data.fields || []);
      const miroFields = await buildMiroFieldOptions(sourceTemplates);

      setCnaFieldOptions(cnaFields);
      setMiroFieldOptions(miroFields);
      setSelectedCnaFieldKey(cnaFields[0]?.key || "");
      setEquivalenceSelections(
        normalizeEquivalenceSelections(response.data.field_equivalences, cnaFields, miroFields)
      );
    } catch (error) {
      console.error("Error loading CNA field equivalences:", error);
      showNotification({
        title: "Error",
        message: "No fue posible cargar la tabla de equivalencias CNA.",
        color: "red",
      });
      closeEquivalence();
      resetEquivalenceModal();
    } finally {
      setLoadingEquivalences(false);
    }
  };

  const handleCloseEquivalences = () => {
    closeEquivalence();
    resetEquivalenceModal();
  };

  const handleToggleMiroField = (value: string, checked: boolean) => {
    if (!selectedCnaFieldKey) return;

    setEquivalenceSelections((current) => {
      const nextValues = new Set(current[selectedCnaFieldKey] || []);

      if (checked) {
        nextValues.add(value);
      } else {
        nextValues.delete(value);
      }

      return {
        ...current,
        [selectedCnaFieldKey]: Array.from(nextValues),
      };
    });
  };

  const handleSaveEquivalences = async () => {
    if (!session?.user?.email || !equivalenceTemplate) return;

    const cnaFieldByKey = new Map(cnaFieldOptions.map((field) => [field.key, field]));
    const miroFieldByValue = new Map(miroFieldOptions.map((field) => [field.value, field]));
    const fieldEquivalences = Object.entries(equivalenceSelections).reduce<FieldEquivalenceMap>(
      (acc, [cnaKey, selectedValues]) => {
        const cnaField = cnaFieldByKey.get(cnaKey);
        if (!cnaField || selectedValues.length === 0) return acc;

        const miroFields = selectedValues
          .map((value) => miroFieldByValue.get(value))
          .filter((field): field is MiroFieldOption => Boolean(field))
          .map((field) => ({
            template_id: field.templateId,
            template_name: field.templateName,
            field_name: field.fieldName,
          }));

        if (miroFields.length > 0) {
          acc[cnaKey] = {
            worksheet_name: cnaField.worksheetName,
            field_name: cnaField.name,
            miro_fields: miroFields,
          };
        }

        return acc;
      },
      {}
    );

    setSavingEquivalences(true);
    try {
      await axios.put(`${apiBasePath}/${equivalenceTemplate._id}`, {
        email: session.user.email,
        field_equivalences: fieldEquivalences,
      });

      setTemplates((current) =>
        current.map((item) =>
          item._id === equivalenceTemplate._id
            ? { ...item, field_equivalences: fieldEquivalences }
            : item
        )
      );
      showNotification({
        title: "Equivalencias guardadas",
        message: "La tabla de equivalencias CNA se actualizo correctamente.",
        color: "teal",
      });
      handleCloseEquivalences();
    } catch (error) {
      console.error("Error saving CNA field equivalences:", error);
      showNotification({
        title: "Error",
        message: "No fue posible guardar la tabla de equivalencias CNA.",
        color: "red",
      });
    } finally {
      setSavingEquivalences(false);
    }
  };

  const handleOpenConnectedData = (template: SniesTemplate) => {
    router.push(`${moduleBasePath}/${template._id}`);
  };

  const selectedCnaField = cnaFieldOptions.find((field) => field.key === selectedCnaFieldKey);
  const selectedMiroValues = new Set(equivalenceSelections[selectedCnaFieldKey] || []);
  const normalizedMiroSearch = miroFieldSearch.trim().toLowerCase();
  const filteredMiroFieldOptions = miroFieldOptions.filter((field) => {
    if (!normalizedMiroSearch) return true;
    return `${field.templateName} ${field.fieldName}`.toLowerCase().includes(normalizedMiroSearch);
  });
  const totalEquivalenceCount = Object.values(equivalenceSelections).reduce(
    (total, values) => total + values.length,
    0
  );

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
            <>
              <Tooltip label="Ver información enviada">
                <Button variant="outline" color="blue" onClick={() => handleOpenConnectedData(template)}>
                  <IconEye size={16} />
                </Button>
              </Tooltip>
              <Tooltip label="Descargar plantilla">
                <Button variant="outline" onClick={() => handleDownloadTemplate(template)}>
                  <IconDownload size={16} />
                </Button>
              </Tooltip>
              {module === "cna" && isConfigureMode && (
                <Tooltip label="Tabla de equivalencias">
                  <Button
                    variant="outline"
                    color="grape"
                    leftSection={<IconTable size={16} />}
                    onClick={() => handleOpenEquivalences(template)}
                  >
                    Tabla de equivalencias
                  </Button>
                </Tooltip>
              )}
              {isConfigureMode && (
                <>
                  <Tooltip label="Editar plantillas conectadas">
                    <Button variant="outline" color="teal" onClick={() => openEdit(template)}>
                      <IconEdit size={16} />
                    </Button>
                  </Tooltip>
                  <Tooltip label="Borrar plantilla">
                    <Button color="red" variant="outline" onClick={() => handleDelete(template)}>
                      <IconTrash size={16} />
                    </Button>
                  </Tooltip>
                </>
              )}
            </>
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

      <Group mb="md">
        {isConfigureMode && (
          <Button onClick={openCreate} leftSection={<IconCirclePlus size={18} />}>
            Crear Nueva Plantilla
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
        opened={equivalenceOpened}
        onClose={handleCloseEquivalences}
        title={`Tabla de equivalencias CNA${equivalenceTemplate ? ` - ${equivalenceTemplate.name}` : ""}`}
        size="90%"
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        {loadingEquivalences ? (
          <Center h={260}>
            <Loader />
          </Center>
        ) : cnaFieldOptions.length === 0 ? (
          <Center h={220}>
            <Text c="dimmed">No se encontraron campos CNA para esta plantilla.</Text>
          </Center>
        ) : (
          <>
            <Group align="stretch" gap="md" style={{ minHeight: 460 }}>
              <Box
                style={{
                  flex: "1 1 360px",
                  minWidth: 300,
                  border: "1px solid #dee2e6",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <Group justify="space-between" p="sm" style={{ borderBottom: "1px solid #dee2e6" }}>
                  <Text fw={700}>Campos CNA</Text>
                  <Badge variant="light">{cnaFieldOptions.length}</Badge>
                </Group>
                <ScrollArea h={420}>
                  <Stack gap={0}>
                    {cnaFieldOptions.map((field) => {
                      const active = selectedCnaFieldKey === field.key;
                      const selectedCount = equivalenceSelections[field.key]?.length || 0;

                      return (
                        <Box
                          key={field.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedCnaFieldKey(field.key)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              setSelectedCnaFieldKey(field.key);
                            }
                          }}
                          style={{
                            cursor: "pointer",
                            padding: "10px 12px",
                            borderBottom: "1px solid #f1f3f5",
                            backgroundColor: active ? "#f1f3f5" : "transparent",
                          }}
                        >
                          <Group justify="space-between" align="flex-start" wrap="nowrap">
                            <Box style={{ minWidth: 0 }}>
                              <Text size="sm" fw={600} lineClamp={2}>
                                {field.name}
                              </Text>
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {field.worksheetName}
                              </Text>
                            </Box>
                            <Badge color={selectedCount > 0 ? "teal" : "gray"} variant="light">
                              {selectedCount}
                            </Badge>
                          </Group>
                        </Box>
                      );
                    })}
                  </Stack>
                </ScrollArea>
              </Box>

              <Box
                style={{
                  flex: "2 1 460px",
                  minWidth: 320,
                  border: "1px solid #dee2e6",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <Group justify="space-between" p="sm" style={{ borderBottom: "1px solid #dee2e6" }}>
                  <Box style={{ minWidth: 0 }}>
                    <Text fw={700} lineClamp={1}>
                      {selectedCnaField?.name || "Selecciona un campo CNA"}
                    </Text>
                    {selectedCnaField && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {selectedCnaField.worksheetName}
                      </Text>
                    )}
                  </Box>
                  <Badge color="teal" variant="light">
                    {selectedMiroValues.size} seleccionados
                  </Badge>
                </Group>

                <Box p="sm" style={{ borderBottom: "1px solid #f1f3f5" }}>
                  <TextInput
                    placeholder="Buscar campos Miro"
                    value={miroFieldSearch}
                    onChange={(event) => setMiroFieldSearch(event.currentTarget.value)}
                  />
                </Box>

                <ScrollArea h={350}>
                  {miroFieldOptions.length === 0 ? (
                    <Center h={220}>
                      <Text c="dimmed">No hay campos Miro conectados a esta plantilla CNA.</Text>
                    </Center>
                  ) : filteredMiroFieldOptions.length === 0 ? (
                    <Center h={220}>
                      <Text c="dimmed">No hay campos Miro con ese filtro.</Text>
                    </Center>
                  ) : (
                    <Stack gap="xs" p="sm">
                      {filteredMiroFieldOptions.map((field) => (
                        <Checkbox
                          key={field.value}
                          checked={selectedMiroValues.has(field.value)}
                          onChange={(event) => handleToggleMiroField(field.value, event.currentTarget.checked)}
                          label={
                            <Box>
                              <Text size="sm">{field.fieldName}</Text>
                              <Text size="xs" c="dimmed">
                                {field.templateName}
                              </Text>
                            </Box>
                          }
                        />
                      ))}
                    </Stack>
                  )}
                </ScrollArea>
              </Box>
            </Group>

            <Group justify="space-between" mt="md">
              <Text size="sm" c="dimmed">
                {totalEquivalenceCount} equivalencias seleccionadas
              </Text>
              <Group>
                <Button variant="default" onClick={handleCloseEquivalences}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveEquivalences} loading={savingEquivalences}>
                  Guardar equivalencias
                </Button>
              </Group>
            </Group>
          </>
        )}
      </Modal>

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
        <MultiSelect
          label="Plantillas de información (Miro)"
          placeholder={loadingPTemplates ? "Cargando plantillas..." : "Selecciona una o más plantillas"}
          data={pTemplateOptions}
          value={selectedPTemplateIds}
          onChange={setSelectedPTemplateIds}
          searchable
          clearable
          disabled={loadingPTemplates}
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
