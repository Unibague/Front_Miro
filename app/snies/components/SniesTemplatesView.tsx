"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  ActionIcon,
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
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Tooltip,
  Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronUp,
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
      worksheet_name?: string;
      field_name: string;
      value_mappings?: Record<string, string>;
    }>;
  }
>;

interface WorkbookSheet {
  worksheetName: string;
  headers?: string[];
  visual_fields?: Array<{
    name: string;
    field_origin?: string;
    validate_with?: string;
    validator_options?: ValidatorOption[];
    validatorOptions?: ValidatorOption[];
  }>;
}

interface ValidatorOption {
  value: string;
  label: string;
  description?: string;
}

interface CnaFieldOption {
  key: string;
  name: string;
  worksheetName: string;
  fieldOrigin?: string;
  validateWith?: string;
  validatorOptions?: ValidatorOption[];
}

interface MiroFieldOption {
  value: string;
  fieldName: string;
  sourceFieldName: string;
  worksheetName: string;
  templateId: string;
  templateName: string;
  validateWith?: string;
  validatorOptions?: ValidatorOption[];
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

const encodeMiroFieldValue = (templateId: string, worksheetName: string, fieldName: string) =>
  JSON.stringify([templateId, worksheetName, fieldName]);

const encodeLegacyMiroFieldValue = (templateId: string, fieldName: string) =>
  JSON.stringify([templateId, fieldName]);

const stripGeneratedDuplicateSuffix = (value: string) =>
  value.replace(/\s+\(\d+\)$/g, "").trim();

const getMiroFieldBaseName = (value: unknown) =>
  stripGeneratedDuplicateSuffix(getDisplayText(value));

const getMiroFieldBaseKey = (templateId: string, fieldName: unknown) =>
  `${templateId}::${normalizeToken(getMiroFieldBaseName(fieldName))}`;

const getMiroFieldScopedKey = (templateId: string, worksheetName: unknown, fieldName: unknown) =>
  `${templateId}::${normalizeToken(worksheetName)}::${normalizeToken(getMiroFieldBaseName(fieldName))}`;

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
    if (record.$numberInt !== undefined) return getDisplayText(record.$numberInt);
    if (record.$numberDecimal !== undefined) return getDisplayText(record.$numberDecimal);
    if (record.$numberLong !== undefined) return getDisplayText(record.$numberLong);
    if (record.text !== undefined) return getDisplayText(record.text);
    if (record.result !== undefined) return getDisplayText(record.result);
    if (record.value !== undefined) return getDisplayText(record.value);
    if (record.hyperlink !== undefined) return getDisplayText(record.hyperlink);
    return "";
  }
  return "";
};

const normalizeToken = (value: unknown) =>
  getDisplayText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

const getValidateWithText = (value: unknown): string => {
  if (!value) return "";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return getDisplayText(record.name ?? record.label ?? record.value);
  }

  return getDisplayText(value);
};

const splitValidateWith = (value: unknown) => {
  const text = getValidateWithText(value);
  const parts = text.split(" - ");
  return {
    text,
    validatorName: parts[0]?.trim() || "",
    columnName: parts.slice(1).join(" - ").trim(),
  };
};

const getNormalizedValidateWithKey = (value: unknown) => {
  const { validatorName, columnName } = splitValidateWith(value);
  return `${normalizeToken(validatorName)} - ${normalizeToken(columnName)}`;
};

const getBestLabelKey = (keys: string[], valueKey: string, row: Record<string, unknown>) => {
  const preferred = keys.find((key) => {
    if (key === valueKey) return false;
    const normalized = normalizeToken(key);
    return (
      normalized.includes("NOMBRE") ||
      normalized.includes("DESCRIPCION") ||
      normalized.startsWith("DESC") ||
      normalized.includes("DETALLE")
    );
  });

  if (preferred) return preferred;

  return keys.find((key) => key !== valueKey && getDisplayText(row[key])) || valueKey;
};

const buildValidatorOptionsFromRows = (
  rows: Array<Record<string, unknown>>,
  preferredColumnName?: string
): ValidatorOption[] => {
  const seen = new Set<string>();

  return rows
    .map((row) => {
      const keys = Object.keys(row || {});
      if (keys.length === 0) return null;

      const valueKey = preferredColumnName
        ? keys.find((key) => normalizeToken(key) === normalizeToken(preferredColumnName)) || keys[0]
        : keys[0];
      const value = getDisplayText(row[valueKey]);
      if (!value || seen.has(value)) return null;

      const labelKey = getBestLabelKey(keys, valueKey, row);
      const label = getDisplayText(row[labelKey]) || value;
      seen.add(value);

      return {
        value,
        label,
        ...(label !== value ? { description: value } : {}),
      };
    })
    .filter((option): option is ValidatorOption => Boolean(option));
};

const buildValidatorRowsFromColumns = (columns: any[]): Array<Record<string, unknown>> => {
  const maxRows = Math.max(0, ...columns.map((column) => column?.values?.length || 0));

  return Array.from({ length: maxRows }, (_, rowIndex) =>
    columns.reduce<Record<string, unknown>>((row, column) => {
      if (column?.name) {
        row[column.name] = column.values?.[rowIndex];
      }
      return row;
    }, {})
  );
};

const addValidatorOptionsToCache = (
  cache: Map<string, ValidatorOption[]>,
  validateWith: string,
  options: ValidatorOption[]
) => {
  if (!validateWith || options.length === 0) return;
  cache.set(validateWith, options);
  cache.set(getNormalizedValidateWithKey(validateWith), options);
};

const getValidatorOptionsFromCache = (cache: Map<string, ValidatorOption[]>, validateWith: unknown) => {
  const text = getValidateWithText(validateWith);
  if (!text) return undefined;

  return cache.get(text) || cache.get(getNormalizedValidateWithKey(text));
};

const buildOptionsFromRawValues = (values: unknown): ValidatorOption[] | undefined => {
  if (!Array.isArray(values) || values.length === 0) return undefined;

  const seen = new Set<string>();
  const options = values
    .map((value) => {
      const text = getDisplayText(value);
      if (!text || seen.has(text)) return null;
      seen.add(text);
      return { value: text, label: text };
    })
    .filter((option): option is ValidatorOption => Boolean(option));

  return options.length ? options : undefined;
};

const getFieldInlineValidatorOptions = (field: any): ValidatorOption[] | undefined => {
  const directOptions =
    field?.validator_options ||
    field?.validatorOptions ||
    field?.dropdown_options ||
    field?.excel_validation_options ||
    field?.validator_values;

  if (!Array.isArray(directOptions) || directOptions.length === 0) return undefined;

  const firstOption = directOptions[0];
  if (firstOption && typeof firstOption === "object" && "value" in firstOption && "label" in firstOption) {
    return directOptions as ValidatorOption[];
  }

  return buildOptionsFromRawValues(directOptions);
};

const addValidatorToCache = (cache: Map<string, ValidatorOption[]>, validator: any) => {
  const validatorName = getDisplayText(validator?.name);
  if (!validatorName) return;

  if (Array.isArray(validator?.columns) && validator.columns.length > 0) {
    const rows = buildValidatorRowsFromColumns(validator.columns);
    validator.columns.forEach((col: any) => {
      if (!col?.name) return;
      addValidatorOptionsToCache(
        cache,
        `${validatorName} - ${col.name}`,
        buildValidatorOptionsFromRows(rows, col.name)
      );
    });
    return;
  }

  const rows = Array.isArray(validator?.values) ? validator.values : [];
  const firstRow = rows.find((row: any) => row && typeof row === "object" && !Array.isArray(row)) || {};
  Object.keys(firstRow).forEach((colName) => {
    addValidatorOptionsToCache(
      cache,
      `${validatorName} - ${colName}`,
      buildValidatorOptionsFromRows(rows, colName)
    );
  });
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const getTemplateDataFromResponse = (data: any) => {
  const candidates = [
    data?.publishedTemplate?.template,
    data?.template?.template,
    data?.template,
    data,
  ];

  return candidates.find(isRecord) || null;
};

const getTemplateBaseIdFromResponse = (data: any, templateData: any) => {
  const candidates = [
    data?.template?.template,
    data?.template,
    data?.publishedTemplate?.template,
    templateData,
    data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") return candidate;
    if (!isRecord(candidate)) continue;

    const nestedTemplate = candidate.template;
    if (typeof nestedTemplate === "string") return nestedTemplate;
    if (isRecord(nestedTemplate) && nestedTemplate._id) return getDisplayText(nestedTemplate._id);

    const id = getDisplayText(candidate._id || candidate.template_id || candidate.templateId);
    if (id) return id;
  }

  return "";
};

const mergeTemplateValidators = (templateData: any, fallbackData: any) => {
  if (!templateData) return fallbackData;

  const validators = [
    ...(Array.isArray(fallbackData?.validators) ? fallbackData.validators : []),
    ...(Array.isArray(templateData?.validators) ? templateData.validators : []),
  ];

  if (validators.length === 0) return templateData;
  return { ...templateData, validators };
};

const getTemplateDataWithResponseValidators = (data: any) => {
  const templateData = getTemplateDataFromResponse(data);
  const responseValidators = data?.template?.validators || data?.validators;

  if (!templateData || !Array.isArray(responseValidators) || responseValidators.length === 0) {
    return templateData;
  }

  return mergeTemplateValidators(templateData, { validators: responseValidators });
};

const buildMiroTemplateFieldRows = (templateData: any) => {
  const workbookSheets = Array.isArray(templateData?.workbook_sheets)
    ? templateData.workbook_sheets
    : [];

  const sheetRows = workbookSheets.flatMap((sheet: any, index: number) => {
    const worksheetName =
      getDisplayText(sheet?.name) ||
      getDisplayText(sheet?.worksheetName) ||
      `Hoja_${index + 1}`;

    const sheetFields =
      Array.isArray(sheet?.fields) && sheet.fields.length > 0
        ? sheet.fields
        : Array.isArray(sheet?.headers)
          ? sheet.headers.map((name: unknown) => ({ name }))
          : [];

    return sheetFields.map((field: any) => ({
      field,
      worksheetName,
      sourceFieldName: getDisplayText(field?.name),
    }));
  });

  if (sheetRows.length > 0) return sheetRows;

  const flatFields = Array.isArray(templateData?.fields) ? templateData.fields : [];
  return flatFields.map((field: any) => ({
    field,
    worksheetName:
      getDisplayText(field?.worksheet_name) ||
      getDisplayText(field?.worksheetName) ||
      getDisplayText(field?.sheet_name) ||
      getDisplayText(field?.sheetName) ||
      "Campos Miro",
    sourceFieldName: getDisplayText(field?.name),
  }));
};

export default function SniesTemplatesView({ mode, module = "snies" }: SniesTemplatesViewProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const { selectedPeriodId } = usePeriod();
  const [opened, { open, close }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [templates, setTemplates] = useState<SniesTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SniesTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<SniesTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  const [cnaFieldSearch, setCnaFieldSearch] = useState("");
  const [selectedCnaWorksheetName, setSelectedCnaWorksheetName] = useState("");
  const [miroFieldSearch, setMiroFieldSearch] = useState("");
  const [miroTemplateFilter, setMiroTemplateFilter] = useState<string | null>(null);
  const [selectedMiroWorksheetName, setSelectedMiroWorksheetName] = useState("");
  const [valueMappings, setValueMappings] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const [expandedCnaFields, setExpandedCnaFields] = useState<Set<string>>(new Set());
  const [expandedMiroFields, setExpandedMiroFields] = useState<Set<string>>(new Set());

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

  const openDeleteConfirmation = (template: SniesTemplate) => {
    setTemplateToDelete(template);
    openDeleteModal();
  };

  const closeDeleteConfirmation = () => {
    if (deleting) return;
    setTemplateToDelete(null);
    closeDeleteModal();
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
          message: `La plantilla ${moduleUpper} se actualizó correctamente.`,
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
          message: `La plantilla ${moduleUpper} se guardó en la base de datos.`,
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

  const handleDelete = async () => {
    if (!session?.user?.email || !templateToDelete) return;

    const template = templateToDelete;
    setDeleting(true);
    try {
      await axios.delete(`${apiBasePath}/${template._id}`, {
        params: { email: session.user.email },
      });

      showNotification({
        title: "Plantilla eliminada",
        message: `${template.name} fue eliminada correctamente.`,
        color: "red",
      });

      closeDeleteModal();
      setTemplateToDelete(null);
      fetchTemplates();
    } catch (error) {
      console.error(`Error deleting ${moduleUpper} template:`, error);
      showNotification({
        title: "Error",
        message: `No fue posible eliminar la plantilla ${moduleUpper}.`,
        color: "red",
      });
    } finally {
      setDeleting(false);
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
        const cnaField = field as NonNullable<WorkbookSheet["visual_fields"]>[number];
        const fieldName = getDisplayText(field?.name);
        if (!fieldName) return;
        const key = encodeEquivalenceKey(sheet.worksheetName, fieldName);
        if (!options.has(key)) {
          options.set(key, {
            key,
            name: fieldName,
            worksheetName: sheet.worksheetName,
            fieldOrigin: field.field_origin,
            validateWith: getValidateWithText(cnaField.validate_with),
            validatorOptions: getFieldInlineValidatorOptions(cnaField),
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
          validateWith: getValidateWithText(field.validate_with),
          validatorOptions: getFieldInlineValidatorOptions(field),
        });
      });
    }

    return Array.from(options.values());
  };

const buildMiroFieldOptions = async (
  sourceTemplates: ReturnType<typeof getSourceTemplates>,
  globalValidatorOptionsCache: Map<string, ValidatorOption[]>
) => {
  const options = new Map<string, MiroFieldOption>();

  await Promise.all(
    sourceTemplates.map(async (sourceTemplate) => {
      try {
        let templateData: any = null;

        try {
          const publishedResponse = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${sourceTemplate.template_id}`
          );

          const publishedTemplateData = getTemplateDataWithResponseValidators(publishedResponse.data);
          templateData = publishedTemplateData;

          const baseTemplateId = getTemplateBaseIdFromResponse(
            publishedResponse.data,
            publishedTemplateData
          );

          if (baseTemplateId) {
            try {
              const baseResponse = await axios.get(
                `${process.env.NEXT_PUBLIC_API_URL}/templates/${baseTemplateId}`
              );
              const baseTemplateData = getTemplateDataWithResponseValidators(baseResponse.data);
              if (baseTemplateData) {
                templateData = mergeTemplateValidators(baseTemplateData, publishedTemplateData);
              }
            } catch (error) {
              console.error("Error loading base Miro template:", error);
            }
          }
        } catch (error) {
          const baseResponse = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/templates/${sourceTemplate.template_id}`
          );

          templateData = getTemplateDataWithResponseValidators(baseResponse.data);
        }

        const fields = buildMiroTemplateFieldRows(templateData);

        const validatorOptionsCache = new Map<string, ValidatorOption[]>();
        globalValidatorOptionsCache.forEach((opts, key) =>
          validatorOptionsCache.set(key, opts)
        );

        (templateData?.validators || []).forEach((v: any) =>
          addValidatorToCache(validatorOptionsCache, v)
        );

        fields.forEach(({ field, worksheetName, sourceFieldName }: any) => {
          const fieldName = getMiroFieldBaseName(sourceFieldName);
          if (!sourceFieldName || !fieldName || !worksheetName) return;
          const validateWith = getValidateWithText(field?.validate_with) || undefined;
          const inlineValidatorOptions = getFieldInlineValidatorOptions(field);
          const cachedValidatorOptions = validateWith
            ? getValidatorOptionsFromCache(validatorOptionsCache, validateWith)
            : undefined;

          const optionKey = getMiroFieldScopedKey(
            sourceTemplate.template_id,
            worksheetName,
            sourceFieldName
          );

          if (!options.has(optionKey)) {
            options.set(optionKey, {
              value: encodeMiroFieldValue(sourceTemplate.template_id, worksheetName, sourceFieldName),
              fieldName,
              sourceFieldName,
              worksheetName,
              templateId: sourceTemplate.template_id,
              templateName: sourceTemplate.template_name,
              validateWith,
              validatorOptions: inlineValidatorOptions?.length
                ? inlineValidatorOptions
                : cachedValidatorOptions?.length
                  ? cachedValidatorOptions
                  : undefined,
            });
          }
        });
      } catch (error) {
        console.error("Error loading Miro template:", error);
      }
    })
  );

  return Array.from(options.values()).sort((a, b) =>
    `${a.templateName} ${a.worksheetName} ${a.fieldName}`.localeCompare(
      `${b.templateName} ${b.worksheetName} ${b.fieldName}`
    )
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
    const miroValueByScopedKey = new Map(
      miroFields.map((field) => [
        getMiroFieldScopedKey(field.templateId, field.worksheetName, field.sourceFieldName || field.fieldName),
        field.value,
      ])
    );
    const miroValueByBaseKey = new Map(
      miroFields.map((field) => [
        getMiroFieldBaseKey(field.templateId, field.sourceFieldName || field.fieldName),
        field.value,
      ])
    );

    return Object.values(savedEquivalences).reduce<Record<string, string[]>>((acc, equivalence) => {
      const cnaKey = encodeEquivalenceKey(equivalence.worksheet_name || "", equivalence.field_name || "");
      if (!validCnaKeys.has(cnaKey)) return acc;

      const selectedValues = (equivalence.miro_fields || [])
        .map((field) => {
          const worksheetName = field.worksheet_name || "";
          const exactValue = encodeMiroFieldValue(field.template_id, worksheetName, field.field_name);
          const legacyValue = encodeLegacyMiroFieldValue(field.template_id, field.field_name);
          if (validMiroValues.has(exactValue)) return exactValue;
          if (validMiroValues.has(legacyValue)) return legacyValue;
          return (
            miroValueByScopedKey.get(getMiroFieldScopedKey(field.template_id, worksheetName, field.field_name)) ||
            miroValueByBaseKey.get(getMiroFieldBaseKey(field.template_id, field.field_name))
          );
        })
        .filter((value): value is string => Boolean(value && validMiroValues.has(value)));

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
    setCnaFieldSearch("");
    setSelectedCnaWorksheetName("");
    setMiroFieldSearch("");
    setMiroTemplateFilter(null);
    setSelectedMiroWorksheetName("");
    setValueMappings({});
    setExpandedCnaFields(new Set());
    setExpandedMiroFields(new Set());
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

      const cnaExtraFields: any[] = response.data.fields || [];

      // Fetch validators to enrich both CNA fields and source Miro fields.
      let allValidators: any[] = [];
      try {
        const vRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/allValidators`, {
          params: { periodId: selectedPeriodId },
        });
        allValidators = vRes.data.validators || [];
      } catch (e) {
        console.error("Error fetching validators for CNA equivalences:", e);
      }

      const validatorOptionsCache = new Map<string, ValidatorOption[]>();
      allValidators.forEach((v: any) => addValidatorToCache(validatorOptionsCache, v));

      const miroFields = await buildMiroFieldOptions(sourceTemplates, validatorOptionsCache);

      const cnaFieldValidateLookup = new Map<string, string>();
      const cnaFieldValidateNameLookup = new Map<string, string>();
      cnaExtraFields.forEach((f: any) => {
        const validateWith = getValidateWithText(f.validate_with);
        if (f.name && validateWith) {
          cnaFieldValidateNameLookup.set(normalizeToken(f.name), validateWith);
          cnaFieldValidateLookup.set(encodeEquivalenceKey(f.worksheet_name || "", f.name), validateWith);
        }
      });

      const rawCnaFields = buildCnaFieldOptions(response.data.workbook_sheets || [], cnaExtraFields);
      const cnaFields = rawCnaFields.map((field) => {
        if (field.validatorOptions?.length) return field;
        const validateWith =
          cnaFieldValidateLookup.get(field.key) ||
          cnaFieldValidateNameLookup.get(normalizeToken(field.name));
        if (!validateWith) return field;
        const validatorOptions = getValidatorOptionsFromCache(validatorOptionsCache, validateWith);
        return { ...field, validateWith, validatorOptions: validatorOptions?.length ? validatorOptions : undefined };
      });

      setCnaFieldOptions(cnaFields);
      setMiroFieldOptions(miroFields);
      setSelectedCnaWorksheetName(cnaFields[0]?.worksheetName || "");
      setSelectedCnaFieldKey(cnaFields[0]?.key || "");
      setMiroTemplateFilter(miroFields[0]?.templateId || null);
      setSelectedMiroWorksheetName(miroFields[0]?.worksheetName || "");
      setEquivalenceSelections(
        normalizeEquivalenceSelections(response.data.field_equivalences, cnaFields, miroFields)
      );

      // Load existing value mappings
      const savedEq = response.data.field_equivalences;
      const initialValueMappings: Record<string, Record<string, Record<string, string>>> = {};
      const validMiroValues = new Set(miroFields.map((field) => field.value));
      const miroValueByScopedKey = new Map(
        miroFields.map((field) => [
          getMiroFieldScopedKey(field.templateId, field.worksheetName, field.sourceFieldName || field.fieldName),
          field.value,
        ])
      );
      const miroValueByBaseKey = new Map(
        miroFields.map((field) => [
          getMiroFieldBaseKey(field.templateId, field.sourceFieldName || field.fieldName),
          field.value,
        ])
      );
      if (isFieldEquivalenceMap(savedEq)) {
        Object.values(savedEq).forEach((equivalence: any) => {
          const cnaKey = encodeEquivalenceKey(equivalence.worksheet_name || "", equivalence.field_name || "");
          (equivalence.miro_fields || []).forEach((mf: any) => {
            if (mf.value_mappings && typeof mf.value_mappings === "object" && Object.keys(mf.value_mappings).length > 0) {
              const worksheetName = mf.worksheet_name || mf.worksheetName || "";
              const exactMiroVal = encodeMiroFieldValue(mf.template_id, worksheetName, mf.field_name);
              const legacyMiroVal = encodeLegacyMiroFieldValue(mf.template_id, mf.field_name);
              const miroVal = validMiroValues.has(exactMiroVal)
                ? exactMiroVal
                : validMiroValues.has(legacyMiroVal)
                  ? legacyMiroVal
                  : miroValueByScopedKey.get(getMiroFieldScopedKey(mf.template_id, worksheetName, mf.field_name)) ||
                    miroValueByBaseKey.get(getMiroFieldBaseKey(mf.template_id, mf.field_name));
              if (!miroVal) return;
              if (!initialValueMappings[cnaKey]) initialValueMappings[cnaKey] = {};
              initialValueMappings[cnaKey][miroVal] = mf.value_mappings;
            }
          });
        });
      }
      setValueMappings(initialValueMappings);
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

  const handleSetValueMapping = (cnaFieldKey: string, miroFieldValue: string, cnaValue: string, miroValue: string | null) => {
    setValueMappings((current) => {
      const cnaMap = { ...(current[cnaFieldKey] || {}) };
      const miroMap = { ...(cnaMap[miroFieldValue] || {}) };
      if (miroValue) {
        miroMap[cnaValue] = miroValue;
      } else {
        delete miroMap[cnaValue];
      }
      cnaMap[miroFieldValue] = miroMap;
      return { ...current, [cnaFieldKey]: cnaMap };
    });
  };

  const handleSelectCnaWorksheet = (worksheetName: string | null) => {
    const nextWorksheetName = worksheetName || "";
    const worksheetFields = cnaFieldOptions.filter(
      (field) => field.worksheetName === nextWorksheetName
    );

    setSelectedCnaWorksheetName(nextWorksheetName);
    setSelectedCnaFieldKey((currentKey) =>
      worksheetFields.some((field) => field.key === currentKey)
        ? currentKey
        : worksheetFields[0]?.key || ""
    );
  };

const handleSelectMiroTemplate = (templateId: string | null) => {
  setMiroTemplateFilter(templateId);

  if (!templateId) {
    setSelectedMiroWorksheetName("");
    return;
  }

  const templateFields = miroFieldOptions.filter(
    (field) => field.templateId === templateId
  );

  const firstWorksheet = templateFields[0]?.worksheetName || "";
  setSelectedMiroWorksheetName(firstWorksheet);
};

  const handleSelectMiroWorksheet = (worksheetName: string | null) => {
    setSelectedMiroWorksheetName(worksheetName || "");
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

    if (!checked) {
      setValueMappings((current) => {
        const cnaMap = { ...(current[selectedCnaFieldKey] || {}) };
        delete cnaMap[value];
        return { ...current, [selectedCnaFieldKey]: cnaMap };
      });
    }
  };

  const isMiroValueOptionSelected = (miroFieldValue: string, optionValue: string) => {
    const mappings = valueMappings[selectedCnaFieldKey]?.[miroFieldValue] || {};
    return Object.values(mappings).includes(optionValue) || mappings[optionValue] === optionValue;
  };

  const handleToggleMiroValueOption = (
    miroField: MiroFieldOption,
    optionValue: string,
    checked: boolean
  ) => {
    if (!selectedCnaFieldKey) return;
    if (checked) handleToggleMiroField(miroField.value, true);

    setValueMappings((current) => {
      const cnaMap = { ...(current[selectedCnaFieldKey] || {}) };
      const miroMap = { ...(cnaMap[miroField.value] || {}) };

      if (checked) {
        const activeCnaField = cnaFieldOptions.find((field) => field.key === selectedCnaFieldKey);
        const matchingCnaOption = activeCnaField?.validatorOptions?.find(
          (option) => option.value === optionValue || option.label === optionValue
        );
        miroMap[matchingCnaOption?.value || optionValue] = optionValue;
      } else {
        Object.keys(miroMap).forEach((cnaValue) => {
          if (cnaValue === optionValue || miroMap[cnaValue] === optionValue) {
            delete miroMap[cnaValue];
          }
        });
      }

      if (Object.keys(miroMap).length > 0) cnaMap[miroField.value] = miroMap;
      else delete cnaMap[miroField.value];

      return { ...current, [selectedCnaFieldKey]: cnaMap };
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
          .map((field) => {
            const vm = valueMappings[cnaKey]?.[field.value];
            return {
              template_id: field.templateId,
              template_name: field.templateName,
              worksheet_name: field.worksheetName,
              field_name: field.sourceFieldName || field.fieldName,
              ...(vm && Object.keys(vm).length > 0 ? { value_mappings: vm } : {}),
            };
          });

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
  const miroFieldByValue = new Map(miroFieldOptions.map((f) => [f.value, f]));
  const uniqueMiroTemplates = Array.from(
    new Map(miroFieldOptions.map((f) => [f.templateId, { value: f.templateId, label: f.templateName }])).values()
  );
const activeMiroTemplateId =
  miroTemplateFilter ||
  uniqueMiroTemplates[0]?.value ||
  "";
  const miroFieldsForActiveTemplate = activeMiroTemplateId
  ? miroFieldOptions.filter(
      (field) => field.templateId === activeMiroTemplateId
    )
  : [];
  const miroWorksheetTabs = activeMiroTemplateId
    ? Array.from(
        miroFieldsForActiveTemplate.reduce((sheetMap, field) => {
          const current = sheetMap.get(field.worksheetName) || { value: field.worksheetName, count: 0 };
          sheetMap.set(field.worksheetName, { ...current, count: current.count + 1 });
          return sheetMap;
        }, new Map<string, { value: string; count: number }>())
      ).map(([, sheet]) => sheet)
    : [];

   
  const selectedMiroWorksheetStillExists = miroWorksheetTabs.some(
    (sheet) => sheet.value === selectedMiroWorksheetName
  );
  const activeMiroWorksheetName = selectedMiroWorksheetStillExists
    ? selectedMiroWorksheetName
    : miroWorksheetTabs[0]?.value || "";
  const cnaWorksheetTabs = Array.from(
    cnaFieldOptions.reduce((sheetMap, field) => {
      const current = sheetMap.get(field.worksheetName) || { value: field.worksheetName, count: 0 };
      sheetMap.set(field.worksheetName, { ...current, count: current.count + 1 });
      return sheetMap;
    }, new Map<string, { value: string; count: number }>())
  ).map(([, sheet]) => sheet);
  const activeCnaWorksheetName = selectedCnaWorksheetName || cnaWorksheetTabs[0]?.value || "";
  const normalizedCnaSearch = cnaFieldSearch.trim().toLowerCase();
  const cnaFieldsForActiveWorksheet = activeCnaWorksheetName
    ? cnaFieldOptions.filter((field) => field.worksheetName === activeCnaWorksheetName)
    : cnaFieldOptions;
  const filteredCnaFieldOptions = cnaFieldsForActiveWorksheet.filter((field) => {
    if (!normalizedCnaSearch) return true;
    return `${field.name} ${field.worksheetName} ${(field.validatorOptions || []).map((opt) => opt.label).join(" ")}`
      .toLowerCase()
      .includes(normalizedCnaSearch);
  });
  const normalizedMiroSearch = miroFieldSearch.trim().toLowerCase();
  const filteredMiroFieldOptions = miroFieldsForActiveTemplate.filter((field) => {
    if (activeMiroWorksheetName && field.worksheetName !== activeMiroWorksheetName) return false;
    if (!normalizedMiroSearch) return true;
    return `${field.templateName} ${field.worksheetName} ${field.fieldName}`.toLowerCase().includes(normalizedMiroSearch);
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
                    color="blue"
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
                    <Button color="red" variant="outline" onClick={() => openDeleteConfirmation(template)}>
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
      <Group gap={6} align="center" mb="md">
        <ActionIcon variant="subtle" color="blue" size="md" onClick={() => router.back()}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Title order={2}>
          {isConfigureMode ? `Configurar Plantillas ${moduleUpper}` : `Gestionar Plantillas ${moduleUpper}`}
        </Title>
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
        size="85%"
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
            <Group align="stretch" gap="md" style={{ minHeight: "calc(100vh - 180px)" }}>
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
                {cnaWorksheetTabs.length > 0 && (
                  <Box px="sm" pt="xs" style={{ borderBottom: "1px solid #f1f3f5" }}>
                    <Tabs
                      value={activeCnaWorksheetName}
                      onChange={handleSelectCnaWorksheet}
                      variant="pills"
                      radius="sm"
                    >
                      <ScrollArea type="auto" offsetScrollbars scrollbarSize={6}>
                        <Tabs.List style={{ flexWrap: "nowrap", paddingBottom: 6 }}>
                          {cnaWorksheetTabs.map((sheet) => (
                            <Tabs.Tab key={sheet.value} value={sheet.value}>
                              <Group gap={6} wrap="nowrap">
                                <Text size="xs" style={{ maxWidth: 170 }} truncate>
                                  {sheet.value}
                                </Text>
                                <Badge size="xs" variant="light">
                                  {sheet.count}
                                </Badge>
                              </Group>
                            </Tabs.Tab>
                          ))}
                        </Tabs.List>
                      </ScrollArea>
                    </Tabs>
                  </Box>
                )}
                <Box p="sm" style={{ borderBottom: "1px solid #f1f3f5" }}>
                  <TextInput
                    placeholder="Buscar campos CNA en esta hoja"
                    value={cnaFieldSearch}
                    onChange={(event) => setCnaFieldSearch(event.currentTarget.value)}
                    size="xs"
                  />
                </Box>
                <ScrollArea h="calc(100vh - 330px)">
                  {filteredCnaFieldOptions.length === 0 ? (
                    <Center h={220}>
                      <Text c="dimmed">No hay campos CNA en esta hoja con ese filtro.</Text>
                    </Center>
                  ) : (
                  <Stack gap={0}>
                    {filteredCnaFieldOptions.map((field) => {
                      const active = selectedCnaFieldKey === field.key;
                      const selectedCount = equivalenceSelections[field.key]?.length || 0;
                      const isExpanded = expandedCnaFields.has(field.key);
                      const selectedMappedMiroFields = (equivalenceSelections[field.key] || [])
                        .map((v) => miroFieldByValue.get(v))
                        .filter((f): f is MiroFieldOption => Boolean(f));

                      return (
                        <Box key={field.key}>
                          <Box
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
                                {field.validateWith && (
                                  <Text size="xs" c="blue" lineClamp={1}>
                                    {field.validateWith}
                                  </Text>
                                )}
                              </Box>
                              <Group gap={4} wrap="nowrap">
                                <Badge color={selectedCount > 0 ? "teal" : "gray"} variant="light">
                                  {selectedCount}
                                </Badge>
                                {field.validatorOptions && (
                                  <Tooltip label={isExpanded ? "Ocultar valores" : "Ver valores del validador"}>
                                    <ActionIcon
                                      size="xs"
                                      variant="subtle"
                                      color="blue"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedCnaFields((current) => {
                                          const next = new Set(current);
                                          if (next.has(field.key)) next.delete(field.key);
                                          else next.add(field.key);
                                          return next;
                                        });
                                      }}
                                    >
                                      {isExpanded ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                                    </ActionIcon>
                                  </Tooltip>
                                )}
                              </Group>
                            </Group>
                          </Box>

                          {isExpanded && field.validatorOptions && (
                            <Box style={{ backgroundColor: "#f8f9fa", borderBottom: "1px solid #dee2e6" }} p="sm">
                              <Stack gap={4} mb={selectedMappedMiroFields.length > 0 ? "sm" : 0}>
                                {field.validatorOptions.map((cnaOpt) => (
                                  <Box key={cnaOpt.value}>
                                    <Text size="xs" fw={600} lineClamp={1}>
                                      {cnaOpt.label}
                                    </Text>
                                  </Box>
                                ))}
                              </Stack>
                              {selectedMappedMiroFields.length === 0 ? (
                                <Text size="xs" c="dimmed">
                                  Selecciona un campo Miro (derecha) para mapear valores de esta lista.
                                </Text>
                              ) : (
                                selectedMappedMiroFields.map((miroField) => (
                                  <Box key={miroField.value} mb="xs">
                                    <Text size="xs" c="dimmed" mb={4}>
                                      {miroField.fieldName} ({miroField.templateName} - {miroField.worksheetName})
                                    </Text>
                                    {field.validatorOptions!.map((cnaOpt) => (
                                      <Group key={cnaOpt.value} mb={4} wrap="nowrap" gap="xs">
                                        <Text size="xs" style={{ flex: "0 0 40%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {cnaOpt.label}
                                        </Text>
                                        {miroField.validatorOptions?.length ? (
                                          <Select
                                            data={miroField.validatorOptions}
                                            value={valueMappings[field.key]?.[miroField.value]?.[cnaOpt.value] || null}
                                            onChange={(v) => handleSetValueMapping(field.key, miroField.value, cnaOpt.value, v)}
                                            clearable
                                            placeholder="Sin equiv."
                                            size="xs"
                                            style={{ flex: 1 }}
                                            renderOption={({ option }) => {
                                              return (
                                                <Stack gap={0}>
                                                  <Text size="xs">{option.label}</Text>
                                                </Stack>
                                              );
                                            }}
                                          />
                                        ) : (
                                          <Checkbox
                                            size="xs"
                                            checked={Boolean(valueMappings[field.key]?.[miroField.value]?.[cnaOpt.value])}
                                            onChange={(event) =>
                                              handleSetValueMapping(
                                                field.key,
                                                miroField.value,
                                                cnaOpt.value,
                                                event.currentTarget.checked ? cnaOpt.value : null
                                              )
                                            }
                                            label="Conectar"
                                            style={{ flex: 1 }}
                                          />
                                        )}
                                      </Group>
                                    ))}
                                  </Box>
                                ))
                              )}
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                  )}
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
                  <Stack gap="xs">
                    <Select
  label="Plantilla Miro"
  placeholder="Selecciona una plantilla"
  data={uniqueMiroTemplates}
  value={activeMiroTemplateId || null}
  onChange={handleSelectMiroTemplate}
  clearable={false}
  size="xs"
/>
                    {miroWorksheetTabs.length > 0 && (
                      <Tabs
                        value={activeMiroWorksheetName}
                        onChange={handleSelectMiroWorksheet}
                        variant="pills"
                        radius="sm"
                      >
                        <ScrollArea type="auto" offsetScrollbars scrollbarSize={6}>
                          <Tabs.List style={{ flexWrap: "nowrap", paddingBottom: 4 }}>
                            {miroWorksheetTabs.map((sheet) => (
                              <Tabs.Tab key={sheet.value} value={sheet.value}>
                                <Group gap={6} wrap="nowrap">
                                  <Text size="xs" style={{ maxWidth: 170 }} truncate>
                                    {sheet.value}
                                  </Text>
                                  <Badge size="xs" variant="light">
                                    {sheet.count}
                                  </Badge>
                                </Group>
                              </Tabs.Tab>
                            ))}
                          </Tabs.List>
                        </ScrollArea>
                      </Tabs>
                    )}
                    <TextInput
                      placeholder="Buscar campos Miro"
                      value={miroFieldSearch}
                      onChange={(event) => setMiroFieldSearch(event.currentTarget.value)}
                      size="xs"
                    />
                  </Stack>
                </Box>

                <ScrollArea h="calc(100vh - 390px)">
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
                      {filteredMiroFieldOptions.map((field) => {
                        const miroExpanded = expandedMiroFields.has(field.value);
                        return (
                          <Box key={field.value}>
                            <Group justify="space-between" wrap="nowrap">
                              <Checkbox
                                checked={selectedMiroValues.has(field.value)}
                                onChange={(event) => handleToggleMiroField(field.value, event.currentTarget.checked)}
                                label={
                                  <Box>
                                    <Text size="sm">{field.fieldName}</Text>
                                    <Text size="xs" c="dimmed">
                                      {field.templateName} - {field.worksheetName}
                                    </Text>
                                    {field.validateWith && (
                                      <Text size="xs" c="blue" lineClamp={1}>
                                        {field.validateWith}
                                      </Text>
                                    )}
                                  </Box>
                                  }
                                />
                              {field.validatorOptions && (
                                <Tooltip label={miroExpanded ? "Ocultar valores" : "Ver valores del validador"}>
                                  <ActionIcon
                                    size="xs"
                                    variant="subtle"
                                    color="blue"
                                    style={{ flexShrink: 0 }}
                                    onClick={() =>
                                      setExpandedMiroFields((current) => {
                                        const next = new Set(current);
                                        if (next.has(field.value)) next.delete(field.value);
                                        else next.add(field.value);
                                        return next;
                                      })
                                    }
                                  >
                                    {miroExpanded ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </Group>
                            {miroExpanded && field.validatorOptions && (
                              <Box
                                ml={26}
                                mt={4}
                                pl="sm"
                                pb="xs"
                                style={{ borderLeft: "2px solid #e9ecef", borderBottom: "1px solid #f1f3f5" }}
                              >
                                <Stack gap={6}>
                                  {field.validatorOptions.map((opt) => (
                                    <Checkbox
                                      key={opt.value}
                                      size="xs"
                                      checked={isMiroValueOptionSelected(field.value, opt.value)}
                                      onChange={(event) =>
                                        handleToggleMiroValueOption(field, opt.value, event.currentTarget.checked)
                                      }
                                      label={
                                        <Text size="xs" fw={600} lineClamp={1}>
                                          {opt.label}
                                        </Text>
                                      }
                                    />
                                  ))}
                                </Stack>
                              </Box>
                            )}
                          </Box>
                        );
                      })}
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
        opened={deleteModalOpened}
        onClose={closeDeleteConfirmation}
        title={`Eliminar plantilla ${moduleUpper}`}
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
      >
        <Text>
          {/* eslint-disable-next-line react/no-unescaped-entities */}
          ¿Estás seguro de que deseas eliminar la plantilla "{templateToDelete?.name}"?
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={closeDeleteConfirmation} disabled={deleting}>
            Cancelar
          </Button>
          <Button color="red" onClick={handleDelete} loading={deleting}>
            Eliminar
          </Button>
        </Group>
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
