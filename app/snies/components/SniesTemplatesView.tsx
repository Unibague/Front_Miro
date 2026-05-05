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
  const [cnaFieldSearch, setCnaFieldSearch] = useState("");
  const [miroFieldSearch, setMiroFieldSearch] = useState("");
  const [miroTemplateFilter, setMiroTemplateFilter] = useState<string | null>(null);
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
            validatorOptions: cnaField.validator_options?.length
              ? cnaField.validator_options
              : cnaField.validatorOptions?.length
                ? cnaField.validatorOptions
                : undefined,
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
          validatorOptions: field.validator_options?.length
            ? field.validator_options
            : field.validatorOptions?.length
              ? field.validatorOptions
              : undefined,
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
      const templateData = response.value.data?.template;
      const fields = templateData?.fields || [];
      const validators: any[] = templateData?.validators || [];

      const validatorOptionsCache = new Map<string, ValidatorOption[]>();
      validators.forEach((v: any) => {
        const rows: any[] = v.values || [];
        const firstRow = rows[0] || {};
        Object.keys(firstRow).forEach((colName) => {
          const key = `${v.name} - ${colName}`;
          addValidatorOptionsToCache(validatorOptionsCache, key, buildValidatorOptionsFromRows(rows, colName));
        });
      });

      fields.forEach((field: any) => {
        const fieldName = getDisplayText(field?.name);
        if (!fieldName) return;
        const value = encodeMiroFieldValue(sourceTemplate.template_id, fieldName);
        if (!options.has(value)) {
          let validateWith: string | undefined;
          let validatorOptions: ValidatorOption[] | undefined;
          if (field?.validate_with) {
            validateWith = getValidateWithText(field.validate_with);
            if (validateWith) validatorOptions = getValidatorOptionsFromCache(validatorOptionsCache, validateWith);
          }
          options.set(value, {
            value,
            fieldName,
            templateId: sourceTemplate.template_id,
            templateName: sourceTemplate.template_name,
            validateWith,
            validatorOptions: validatorOptions?.length ? validatorOptions : undefined,
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
    setCnaFieldSearch("");
    setMiroFieldSearch("");
    setMiroTemplateFilter(null);
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
      const miroFields = await buildMiroFieldOptions(sourceTemplates);

      // Fetch all validators to enrich CNA extra fields
      const needsValidators = cnaExtraFields.some((f) => f.validate_with);
      let allValidators: any[] = [];
      if (needsValidators) {
        try {
          const vRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/allValidators`);
          allValidators = vRes.data.validators || [];
        } catch (e) {
          console.error("Error fetching validators for CNA fields:", e);
        }
      }

      const validatorOptionsCache = new Map<string, ValidatorOption[]>();
      allValidators.forEach((v: any) => {
        const cols: any[] = v.columns || [];
        const rows = buildValidatorRowsFromColumns(cols);
        cols.forEach((col: any) => {
          const key = `${v.name} - ${col.name}`;
          addValidatorOptionsToCache(validatorOptionsCache, key, buildValidatorOptionsFromRows(rows, col.name));
        });
      });

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
      setSelectedCnaFieldKey(cnaFields[0]?.key || "");
      setEquivalenceSelections(
        normalizeEquivalenceSelections(response.data.field_equivalences, cnaFields, miroFields)
      );

      // Load existing value mappings
      const savedEq = response.data.field_equivalences;
      const initialValueMappings: Record<string, Record<string, Record<string, string>>> = {};
      if (isFieldEquivalenceMap(savedEq)) {
        Object.values(savedEq).forEach((equivalence: any) => {
          const cnaKey = encodeEquivalenceKey(equivalence.worksheet_name || "", equivalence.field_name || "");
          (equivalence.miro_fields || []).forEach((mf: any) => {
            if (mf.value_mappings && typeof mf.value_mappings === "object" && Object.keys(mf.value_mappings).length > 0) {
              const miroVal = encodeMiroFieldValue(mf.template_id, mf.field_name);
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
              field_name: field.fieldName,
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
  const normalizedCnaSearch = cnaFieldSearch.trim().toLowerCase();
  const filteredCnaFieldOptions = cnaFieldOptions.filter((field) => {
    if (!normalizedCnaSearch) return true;
    return `${field.name} ${field.worksheetName} ${(field.validatorOptions || []).map((opt) => opt.label).join(" ")}`
      .toLowerCase()
      .includes(normalizedCnaSearch);
  });
  const normalizedMiroSearch = miroFieldSearch.trim().toLowerCase();
  const filteredMiroFieldOptions = miroFieldOptions.filter((field) => {
    if (miroTemplateFilter && field.templateId !== miroTemplateFilter) return false;
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
                <Box p="sm" style={{ borderBottom: "1px solid #f1f3f5" }}>
                  <TextInput
                    placeholder="Buscar campos CNA"
                    value={cnaFieldSearch}
                    onChange={(event) => setCnaFieldSearch(event.currentTarget.value)}
                    size="xs"
                  />
                </Box>
                <ScrollArea h="calc(100vh - 330px)">
                  {filteredCnaFieldOptions.length === 0 ? (
                    <Center h={220}>
                      <Text c="dimmed">No hay campos CNA con ese filtro.</Text>
                    </Center>
                  ) : (
                  <Stack gap={0}>
                    {filteredCnaFieldOptions.map((field) => {
                      const active = selectedCnaFieldKey === field.key;
                      const selectedCount = equivalenceSelections[field.key]?.length || 0;
                      const isExpanded = expandedCnaFields.has(field.key);
                      const miroFieldsWithValidation = (equivalenceSelections[field.key] || [])
                        .map((v) => miroFieldByValue.get(v))
                        .filter((f): f is MiroFieldOption => Boolean(f?.validatorOptions?.length));

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
                              <Stack gap={4} mb={miroFieldsWithValidation.length > 0 ? "sm" : 0}>
                                {field.validatorOptions.map((cnaOpt) => (
                                  <Box key={cnaOpt.value}>
                                    <Text size="xs" fw={600} lineClamp={1}>
                                      {cnaOpt.label}
                                    </Text>
                                  </Box>
                                ))}
                              </Stack>
                              {miroFieldsWithValidation.length === 0 ? (
                                <Text size="xs" c="dimmed">
                                  Selecciona un campo Miro (derecha) con lista de validacion para mapear valores.
                                </Text>
                              ) : (
                                miroFieldsWithValidation.map((miroField) => (
                                  <Box key={miroField.value} mb="xs">
                                    <Text size="xs" c="dimmed" mb={4}>
                                      {miroField.fieldName} ({miroField.templateName})
                                    </Text>
                                    {field.validatorOptions!.map((cnaOpt) => (
                                      <Group key={cnaOpt.value} mb={4} wrap="nowrap" gap="xs">
                                        <Text size="xs" style={{ flex: "0 0 40%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {cnaOpt.label}
                                        </Text>
                                        <Select
                                          data={miroField.validatorOptions!}
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
                      placeholder="Filtrar por plantilla Miro"
                      data={uniqueMiroTemplates}
                      value={miroTemplateFilter}
                      onChange={setMiroTemplateFilter}
                      clearable
                      size="xs"
                    />
                    <TextInput
                      placeholder="Buscar campos Miro"
                      value={miroFieldSearch}
                      onChange={(event) => setMiroFieldSearch(event.currentTarget.value)}
                      size="xs"
                    />
                  </Stack>
                </Box>

                <ScrollArea h="calc(100vh - 340px)">
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
                                      {field.templateName}
                                    </Text>
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
