"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Button,
  Group,
  Text,
  Table,
  ActionIcon,
  ScrollArea,
  Title,
  TextInput,
  NumberInput,
  Center,
  Textarea,
  Switch,
  Tooltip,
  rem,
  MultiSelect,
  Select,
  Tabs,
  Alert,
} from "@mantine/core";
import { IconPlus, IconTrash, IconEye, IconCancel, IconSend2, IconLock, IconInfoCircle } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { ValidatorModal } from "../../../../components/Validators/ValidatorModal";
import { buildValidatorOptions, getPreferredValidatorColumnName } from "../../../../utils/validatorOptions";

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  validate_with?: { id: string, name: string } | string;
  comment?: string;
  multiple?: boolean;
}

interface WorkbookSheet {
  name: string;
  fields: Field[];
  producers: string[];  // ObjectIds
  shared: boolean;
}

interface Template {
  _id: string;
  name: string;
  fields: Field[];
  workbook_sheets?: WorkbookSheet[];
  shared?: boolean;
}

interface QrDraftEntry {
  dependency: string;
  filled_data: { field_name: string; values: any[] }[];
}

interface PublishedTemplateResponse {
  name: string;
  template: Template;
  publishedTemplate?: {
    period?: string | { _id: string };
  };
  qr_draft_data?: QrDraftEntry[];
  shared_sheets_data?: Record<string, Record<string, any>[]>;
}

interface ValidatorData {
  name: string;
  _id: string;
  columns: { name: string; is_validator: boolean; values: any[] }[];
}

const ProducerTemplateFormPage = ({ params }: { params: { id_template: string } }) => {
  const { id_template } = params;
  const { data: session } = useSession();
  const router = useRouter();
  const [publishedTemplateName, setPublishedTemplateName] = useState<string>("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [allSheets, setAllSheets] = useState<WorkbookSheet[]>([]);
  const [accessibleSheets, setAccessibleSheets] = useState<WorkbookSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  // rows por hoja: { sheetName: rows[] }
  const [sheetRows, setSheetRows] = useState<Record<string, Record<string, any>[]>>({});
  // rows para plantillas sin hojas (legacy)
  const [rows, setRows] = useState<Record<string, any>[]>([{}]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [validatorModalOpen, setValidatorModalOpen] = useState(false);
  const [validatorData, setValidatorData] = useState<ValidatorData | null>(null);
  const [validatorExists, setValidatorExists] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [multiSelectOptions, setMultiSelectOptions] = useState<Record<string, string[]>>({});
  const [selectOptions, setSelectOptions] = useState<Record<string, Array<{value: string, label: string}>>>({});
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [activeFieldName, setActiveFieldName] = useState<string | null>(null);
  const [displayValues, setDisplayValues] = useState<Record<string, Record<string, string>>>({});
  const [currentValidatorId, setCurrentValidatorId] = useState<string>("");
  const [templatePeriodId, setTemplatePeriodId] = useState<string>("");
  const [hasQrDraft, setHasQrDraft] = useState(false);
  const [activeSheetForValidator, setActiveSheetForValidator] = useState<string | null>(null);

  const fetchTemplate = async () => {
    try {
      const response = await axios.get<PublishedTemplateResponse>(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${id_template}`
      );
      setPublishedTemplateName(response.data.name);
      setTemplate(response.data.template);

      // Cargar todas las hojas y determinar cuáles son editables
      const wbSheets = response.data.template.workbook_sheets || [];
      const templateShared = response.data.template?.shared ?? false;
      if (wbSheets.length > 0) {
        setAllSheets(wbSheets);
        let editable: WorkbookSheet[] = wbSheets;
        try {
          if (session?.user?.email) {
            const userRes = await axios.get(
              `${process.env.NEXT_PUBLIC_API_URL}/users`,
              { params: { email: session.user.email } }
            );
            const user = userRes.data;
            const allDepCodes: string[] = [user.dep_code, ...(user.additional_dependencies || [])].filter(Boolean);
            const depsRes = await axios.get(
              `${process.env.NEXT_PUBLIC_API_URL}/dependencies/all/${encodeURIComponent(session.user.email)}`
            );
            const allDeps: any[] = depsRes.data || [];
            const userDepIds: string[] = allDeps
              .filter((d: any) => allDepCodes.includes(d.dep_code))
              .map((d: any) => d._id?.toString());
            editable = wbSheets.filter((sheet: WorkbookSheet) => {
              if (!sheet.fields?.length) return false;
              if (!sheet.producers?.length) return true;
              return sheet.producers.some((p: string) => userDepIds.includes(p.toString()));
            });
          }
        } catch { /* si falla, editable = todas las hojas */ }

        setAccessibleSheets(editable);
        setActiveSheet(wbSheets[0].name);
        const sharedData = response.data.shared_sheets_data || {};
        const initialRows: Record<string, Record<string, any>[]> = {};
        editable.forEach((s: WorkbookSheet) => { initialRows[s.name] = [{}]; });
        // Si template.shared=true, hojas no editables muestran datos de otros productores
        if (templateShared) {
          wbSheets
            .filter((s: WorkbookSheet) => !editable.some((e: WorkbookSheet) => e.name === s.name))
            .forEach((s: WorkbookSheet) => {
              initialRows[s.name] = sharedData[s.name]?.length ? sharedData[s.name] : [{}];
            });
        }
        setSheetRows(initialRows);
      }
      const periodId =
        typeof response.data.publishedTemplate?.period === "string"
          ? response.data.publishedTemplate.period
          : response.data.publishedTemplate?.period?._id || "";
      setTemplatePeriodId(periodId);

      // Pre-cargar datos del borrador QR si existen para la dependencia del usuario
      const qrDrafts = response.data.qr_draft_data || [];
      if (qrDrafts.length && session?.user?.email) {
        try {
          const userRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
            params: { email: session.user.email },
          });
          const userDepCode: string = userRes.data?.dep_code || '';
          const allDepCodes: string[] = [userDepCode, ...(userRes.data?.additional_dependencies || [])].filter(Boolean);
          const draft = qrDrafts.find((d: QrDraftEntry) => allDepCodes.includes(d.dependency));
          if (draft?.filled_data?.length) {
            const maxLen = Math.max(...draft.filled_data.map((f: any) => f.values?.length || 0), 1);
            const preloadedRows: Record<string, any>[] = Array.from({ length: maxLen }, (_, i) => {
              const row: Record<string, any> = {};
              draft.filled_data.forEach((f: any) => { row[f.field_name] = f.values?.[i] ?? null; });
              return row;
            });
            setRows(preloadedRows);

            // Pre-cargar también por hojas si aplica
            const wbSheets = response.data.template.workbook_sheets || [];
            if (wbSheets.length) {
              const draftSheetRows: Record<string, Record<string, any>[]> = {};
              wbSheets.forEach((sheet: WorkbookSheet) => {
                const sheetFieldNames = new Set(sheet.fields.map((f: Field) => f.name));
                const sheetFilled = draft.filled_data.filter((f: any) => sheetFieldNames.has(f.field_name));
                if (sheetFilled.length) {
                  const sheetMaxLen = Math.max(...sheetFilled.map((f: any) => f.values?.length || 0), 1);
                  draftSheetRows[sheet.name] = Array.from({ length: sheetMaxLen }, (_, i) => {
                    const row: Record<string, any> = {};
                    sheetFilled.forEach((f: any) => { row[f.field_name] = f.values?.[i] ?? null; });
                    return row;
                  });
                }
              });
              if (Object.keys(draftSheetRows).length) setSheetRows(prev => ({ ...prev, ...draftSheetRows }));
            }

            setHasQrDraft(true);
          }
        } catch { /* ignorar error de pre-carga */ }
      }

      // Recolectar campos de top-level + todos los workbook_sheets
      const allTemplateFields: Field[] = [
        ...(response.data.template.fields || []),
        ...((response.data.template.workbook_sheets || []).flatMap((s: WorkbookSheet) => s.fields || [])),
      ];

      const validatorCheckPromises = allTemplateFields.map(async (field) => {
        if (field.validate_with) {
          try {
            let validatorId = '';
            if (typeof field.validate_with === 'string') {
              const parts = field.validate_with.split(' - ');
              validatorId = parts.length >= 2 ? parts[1].trim() : '';
            } else {
              validatorId = (field.validate_with as any).id;
            }

            if (validatorId) {
              const validatorResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id`, {
                params: { id: validatorId, periodId },
              });
              return { [field.name]: !!validatorResponse.data.validator };
            }
          } catch {
            return { [field.name]: false };
          }
        }
        return { [field.name]: false };
      });

      const validatorChecks = await Promise.all(validatorCheckPromises);
      const validatorCheckResults = validatorChecks.reduce((acc, curr) => ({ ...acc, ...curr }), {});
      setValidatorExists(validatorCheckResults);

      // Cargar opciones para campos con validador (tanto múltiples como simples)
      const allValidatorOptionsPromises = allTemplateFields
      .filter(field => field.validate_with)
      .map(async (field) => {
        try {
          let validatorId = '';
          let validateWith = '';

          if (typeof field.validate_with === 'string') {
            const parts = field.validate_with.split(' - ');
            if (parts.length >= 2) {
              validatorId = parts[1].trim();
              validateWith = field.validate_with;
            }
          } else if (field.validate_with?.id) {
            validatorId = field.validate_with.id;
            validateWith = field.validate_with.name || '';
          }

          if (!validatorId) {
            return { fieldName: field.name, options: [], isMultiple: field.multiple };
          }

          const vRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id`, {
            params: { id: validatorId, periodId },
          });
          const optionStrings = buildValidatorOptions(
            vRes.data?.validator,
            getPreferredValidatorColumnName(validateWith)
          );
          const options = optionStrings.map((v) => ({ value: v, label: v }));

          return { fieldName: field.name, options, isMultiple: field.multiple };
        } catch (error) {
          console.error(`Error obteniendo opciones para ${field.name}:`, error);
          return { fieldName: field.name, options: [], isMultiple: field.multiple };
        }
      });

    const allValidatorOptions = await Promise.all(allValidatorOptionsPromises);
    
    // Separar opciones para MultiSelect y Select
    const multiSelectOpts: Record<string, string[]> = {};
    const selectOpts: Record<string, Array<{value: string, label: string}>> = {};
    
    allValidatorOptions.forEach(({ fieldName, options, isMultiple }) => {
      if (isMultiple) {
        multiSelectOpts[fieldName] = options.map((opt: any) => opt.value);
      } else {
        selectOpts[fieldName] = options;
      }
    });
    
    setMultiSelectOptions(multiSelectOpts);
    setSelectOptions(selectOpts);


    } catch (error) {
      console.error("Error fetching template:", error);
      showNotification({
        title: "Error",
        message: "No se pudo cargar la plantilla",
        color: "red",
      });
    }
  };

  useEffect(() => {
    if (id_template) {
      fetchTemplate();
    }
  }, [id_template]);

  const updateSheetCell = (sheetName: string, rowIdx: number, fieldName: string, value: any) => {
    setSheetRows(prev => {
      const rows = [...(prev[sheetName] || [{}])];
      rows[rowIdx] = { ...rows[rowIdx], [fieldName]: value };
      return { ...prev, [sheetName]: rows };
    });
  };

  const addSheetRow = (sheetName: string) =>
    setSheetRows(prev => ({ ...prev, [sheetName]: [...(prev[sheetName] || []), {}] }));

  const removeSheetRow = (sheetName: string, idx: number) =>
    setSheetRows(prev => ({ ...prev, [sheetName]: (prev[sheetName] || []).filter((_, i) => i !== idx) }));

  const handleInputChange = (rowIndex: number, fieldName: string, value: any) => {
    const updatedRows = [...rows];

    if (Array.isArray(value)) {
      const isNumericField = multiSelectOptions[fieldName]?.every(v => !isNaN(Number(v)));
  
      updatedRows[rowIndex][fieldName] = value.length > 0 
        ? isNumericField ? value.map(v => Number(v)) : value
        : null;
    } else {
      updatedRows[rowIndex][fieldName] = value === "" ? null : value;
    }
  
    setRows(updatedRows);

    const updatedErrors = { ...errors };
    if (updatedErrors[fieldName]) {
      delete updatedErrors[fieldName];
      setErrors(updatedErrors);
    }
  };

  const addRow = () => {
    const newRows = [...rows, {}];
    setRows(newRows);
    
    // Auto-seleccionar el primer campo con validador de la nueva fila
    const newRowIndex = newRows.length - 1;
    const firstFieldWithValidator = template?.fields.find(f => f.validate_with);
    
    if (firstFieldWithValidator) {
      setActiveRowIndex(newRowIndex);
      setActiveFieldName(firstFieldWithValidator.name);
    }
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const validateFields = () => {
    const newErrors: Record<string, string[]> = {};

    rows.forEach((row, rowIndex) => {
      template?.fields.forEach((field) => {
        if (field.required && (row[field.name] === null || row[field.name] === undefined)) {          if (!newErrors[field.name]) {
            newErrors[field.name] = [];
          }
          newErrors[field.name][rowIndex] = "Este campo es obligatorio.";
        }
      });
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleValidatorOpen = async (validatorId: string, rowIndex: number, fieldName: string) => {
    console.log('handleValidatorOpen - validatorId:', validatorId, 'rowIndex:', rowIndex, 'fieldName:', fieldName);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id`, {
        params: { id: validatorId, periodId: templatePeriodId },
      });
      setValidatorData(response.data.validator);
      setCurrentValidatorId(validatorId);
      setActiveRowIndex(rowIndex);
      setActiveFieldName(fieldName);
      console.log('Valores establecidos - activeRowIndex:', rowIndex, 'activeFieldName:', fieldName);
      setValidatorModalOpen(true);
    } catch (error) {
      console.error('Error en handleValidatorOpen:', error);
      showNotification({
        title: "Error",
        message: "No se pudieron cargar los datos de validación",
        color: "red",
      });
    }
  };

  const handleSubmit = async () => {
    if (!validateFields()) {
      showNotification({
        title: "Error de Validación",
        message: "Por favor completa los campos obligatorios.",
        color: "red",
      });
      return;
    }

    try {
      setLoading(true);
      const formattedRows = rows.map(row => {
        const formattedRow: Record<string, any> = {};
  
        Object.keys(row).forEach(fieldName => {
          const field = template?.fields.find(f => f.name === fieldName);
  
          if (field?.multiple && Array.isArray(row[fieldName])) {
            const isNumericField = multiSelectOptions[fieldName]?.every(v => !isNaN(Number(v)));
            
            formattedRow[fieldName] = isNumericField
              ? row[fieldName].map((v: any) => Number(v))
              : row[fieldName];
          } else {
            formattedRow[fieldName] = row[fieldName];
          }
        });
  
        return formattedRow;
      });  
      console.log("Datos enviados al backend:", formattedRows);
      console.log("Template fields con validate_with:", template?.fields.filter(f => f.validate_with));

      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
        email: session?.user?.email,
        pubTem_id: id_template,
        data: formattedRows,
        edit: false,
      });
      showNotification({
        title: "Éxito",
        message: "Datos enviados exitosamente",
        color: "teal",
      });
      router.push('/producer/templates');
    } catch (error) {
      console.error("Error submitting data:", error);
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        const validationErrors = error.response.data.details;
        const errorObject: Record<string, string[]> = {};

        validationErrors.forEach((error: { column: string, errors: { register: number, message: string }[] }) => {
          error.errors.forEach(err => {
            if (!errorObject[error.column]) {
              errorObject[error.column] = [];
            }
            errorObject[error.column][err.register - 1] = err.message;
          });
        });

        setErrors(errorObject);
        showNotification({
          title: "Error de Validación",
          message: "Algunos campos contienen errores. Por favor revisa y corrige.",
          color: "red",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const renderInputField = (field: Field, row: Record<string, any>, rowIndex: number, onInputChange?: (rowIndex: number, fieldName: string, value: any) => void, readOnly = false) => {
    const inputChange = onInputChange || handleInputChange;
    const fieldError = readOnly ? undefined : errors[field.name]?.[rowIndex];

    const wrapWithTooltip = (input: React.ReactNode) => {
      return field.comment ? (
        <Tooltip
          label={field.comment}
          multiline
          withArrow
          style={{ maxWidth: 300 }}
        >
          {input}
        </Tooltip>
      ) : input;
    };

    const commonProps = {
      required: field.required,
      placeholder: field.comment,
      style: { minWidth: "280px", width: "100%" },
      error: fieldError || undefined,
      disabled: readOnly,
    };
  
    if (field.multiple && field.validate_with) {
      return wrapWithTooltip(
        <MultiSelect
          value={Array.isArray(row[field.name]) ? row[field.name].map(String) : []}
          onChange={(value) => !readOnly && inputChange(rowIndex, field.name, value)}
          data={Array.from(new Set(multiSelectOptions[field.name] || [])).map(value => ({ value: String(value), label: String(value) }))}
          searchable
          placeholder={field.comment || "Seleccione opciones"}
          style={{ width: "100%" }}
          error={fieldError || undefined}
          disabled={readOnly}
        />
      );
    }
    
    // Si el campo tiene validador pero NO es múltiple, usar Select
    if (field.validate_with && !field.multiple) {
      const opts = selectOptions[field.name] || [];
      const selectDisplayValue = displayValues[rowIndex]?.[field.name]
        ? opts.find(opt => opt.label === displayValues[rowIndex][field.name])?.value || row[field.name]
        : row[field.name];

      return wrapWithTooltip(
        <Select
          {...commonProps}
          value={selectDisplayValue ? String(selectDisplayValue) : null}
          onChange={(value) => {
            if (displayValues[rowIndex]?.[field.name]) {
              const updatedDisplayValues = { ...displayValues };
              delete updatedDisplayValues[rowIndex][field.name];
              setDisplayValues(updatedDisplayValues);
            }
            inputChange(rowIndex, field.name, value);
          }}
          data={opts}
          searchable
          placeholder={opts.length === 0 ? "Cargando opciones..." : (field.comment || "Seleccione una opción")}
          nothingFoundMessage={opts.length === 0 ? "Cargando..." : "Sin resultados"}
        />
      );
    }
  
    switch (field.datatype) {
      case "Entero":
      case "Decimal":
      case "Porcentaje":
        // Si el campo tiene validador y hay una descripción guardada, mostrarla
        const numericDisplayValue = field.validate_with && displayValues[rowIndex]?.[field.name] 
          ? displayValues[rowIndex][field.name] 
          : (typeof row[field.name] === 'number' ? row[field.name] : "");
          
        return wrapWithTooltip(
          <TextInput
            {...commonProps}
            value={String(numericDisplayValue)}
            onChange={(e) => {
              // Si el usuario edita manualmente, limpiar la descripción guardada
              if (field.validate_with && displayValues[rowIndex]?.[field.name]) {
                const updatedDisplayValues = { ...displayValues };
                delete updatedDisplayValues[rowIndex][field.name];
                setDisplayValues(updatedDisplayValues);
              }
              const numValue = parseFloat(e.target.value);
              inputChange(rowIndex, field.name, isNaN(numValue) ? null : numValue);
            }}
          />
        );
  
      case "Texto Largo":
        const textareaDisplayValue = field.validate_with && displayValues[rowIndex]?.[field.name] 
          ? displayValues[rowIndex][field.name] 
          : (row[field.name] === null ? "" : row[field.name]);
          
        return wrapWithTooltip(
          <Textarea
            {...commonProps}
            autosize
            minRows={2}
            maxRows={6}
            value={textareaDisplayValue}
            onChange={(e) => {
              if (field.validate_with && displayValues[rowIndex]?.[field.name]) {
                const updatedDisplayValues = { ...displayValues };
                delete updatedDisplayValues[rowIndex][field.name];
                setDisplayValues(updatedDisplayValues);
              }
              inputChange(rowIndex, field.name, e.target.value);
            }}
          />
        );

      case "Texto Corto":
      case "Link":
        // Si el campo tiene validador y hay una descripción guardada, mostrarla
        const displayValue = field.validate_with && displayValues[rowIndex]?.[field.name] 
          ? displayValues[rowIndex][field.name] 
          : (row[field.name] === null ? "" : row[field.name]);
          
        return wrapWithTooltip(
          <TextInput
            {...commonProps}
            value={displayValue}
            onChange={(e) => {
              // Si el usuario edita manualmente, limpiar la descripción guardada
              if (field.validate_with && displayValues[rowIndex]?.[field.name]) {
                const updatedDisplayValues = { ...displayValues };
                delete updatedDisplayValues[rowIndex][field.name];
                setDisplayValues(updatedDisplayValues);
              }
              inputChange(rowIndex, field.name, e.target.value);
            }}
          />
        );

      case "True/False":
        const switchDisplayValue = field.validate_with && displayValues[rowIndex]?.[field.name]
          ? displayValues[rowIndex][field.name]
          : row[field.name];

        return wrapWithTooltip(
          <Switch
            checked={switchDisplayValue === true || switchDisplayValue === "Si"}
            disabled={readOnly}
            onChange={(event) => {
              if (readOnly) return;
              if (field.validate_with && displayValues[rowIndex]?.[field.name]) {
                const updatedDisplayValues = { ...displayValues };
                delete updatedDisplayValues[rowIndex][field.name];
                setDisplayValues(updatedDisplayValues);
              }
              inputChange(rowIndex, field.name, event.currentTarget.checked);
            }}
          />
        );
  
      case "Fecha":
        const dateDisplayValue = field.validate_with && displayValues[rowIndex]?.[field.name] 
          ? new Date(displayValues[rowIndex][field.name]) 
          : (row[field.name] ? new Date(row[field.name]) : null);
          
        return wrapWithTooltip(
          <DateInput
            {...commonProps}
            value={dateDisplayValue}
            locale="es"
            valueFormat="DD/MM/YYYY"
            onChange={(date) => {
              if (field.validate_with && displayValues[rowIndex]?.[field.name]) {
                const updatedDisplayValues = { ...displayValues };
                delete updatedDisplayValues[rowIndex][field.name];
                setDisplayValues(updatedDisplayValues);
              }
              inputChange(rowIndex, field.name, date);
            }}
          />
        );
  
      default:
        // Si el campo tiene validador y hay una descripción guardada, mostrarla
        const defaultDisplayValue = field.validate_with && displayValues[rowIndex]?.[field.name] 
          ? displayValues[rowIndex][field.name] 
          : (row[field.name] === null ? "" : row[field.name]);
          
        return wrapWithTooltip(
          <TextInput
            {...commonProps}
            value={defaultDisplayValue}
            onChange={(e) => {
              // Si el usuario edita manualmente, limpiar la descripción guardada
              if (field.validate_with && displayValues[rowIndex]?.[field.name]) {
                const updatedDisplayValues = { ...displayValues };
                delete updatedDisplayValues[rowIndex][field.name];
                setDisplayValues(updatedDisplayValues);
              }
              inputChange(rowIndex, field.name, e.target.value);
            }}
          />
        );
    }
  };

  const renderSheetTable = (fields: Field[], sheetName?: string, readOnly = false) => {
    const isSheetMode = !!sheetName;
    const currentRows = isSheetMode ? (sheetRows[sheetName] || [{}]) : rows;
    const onInputChange = isSheetMode
      ? (rowIndex: number, fieldName: string, value: any) => updateSheetCell(sheetName, rowIndex, fieldName, value)
      : handleInputChange;
    const onRemoveRow = isSheetMode
      ? (rowIndex: number) => removeSheetRow(sheetName, rowIndex)
      : removeRow;

    return (
      <ScrollArea viewportRef={scrollAreaRef}>
        <ScrollArea type="always" offsetScrollbars>
          <Table mb="xs" withTableBorder withColumnBorders withRowBorders>
            <Table.Thead>
              <Table.Tr>
                {fields.map((field) => (
                  <Table.Th key={field.name} style={{ minWidth: '250px' }}>
                    <Group>
                      {field.name} {field.required && <Text span c="red">*</Text>}
                    </Group>
                  </Table.Th>
                ))}
                {!readOnly && <Table.Th maw={rem(120)}><Center>Acciones</Center></Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {currentRows.map((row, rowIndex) => (
                <Table.Tr key={rowIndex}>
                  {fields.map((field) => (
                    <Table.Td key={field.name} style={{ minWidth: '250px' }}>
                      <Group align="center">
                        {renderInputField(field, row, rowIndex, onInputChange, readOnly)}
                        {field.validate_with && !readOnly && (
                          <ActionIcon
                            size="sm"
                            onClick={() => {
                              let validatorId = '';
                              if (typeof field.validate_with === 'string') {
                                const parts = field.validate_with.split(' - ');
                                if (parts.length >= 2) validatorId = parts[1].trim();
                              } else if (field.validate_with?.id) {
                                validatorId = field.validate_with.id;
                              }
                              if (validatorId) {
                                setActiveRowIndex(rowIndex);
                                setActiveFieldName(field.name);
                                setActiveSheetForValidator(sheetName || null);
                                handleValidatorOpen(validatorId, rowIndex, field.name);
                              }
                            }}
                            title="Ver valores aceptados"
                            variant={activeRowIndex === rowIndex && activeFieldName === field.name ? "filled" : "light"}
                            color={activeRowIndex === rowIndex && activeFieldName === field.name ? "green" : "blue"}
                          >
                            <IconEye />
                          </ActionIcon>
                        )}
                      </Group>
                    </Table.Td>
                  ))}
                  {!readOnly && (
                    <Table.Td maw={rem(120)}>
                      <Center>
                        <Button size="xs" color="red" onClick={() => onRemoveRow(rowIndex)} rightSection={<IconTrash />}>
                          Borrar
                        </Button>
                      </Center>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </ScrollArea>
    );
  };

  if (!template) {
    return <Text ta="center" c="dimmed">Cargando Información...</Text>;
  }

  const useSheets = allSheets.length > 0;
  const accessibleSheetNames = new Set(accessibleSheets.map(s => s.name));
  const templateSharedUI = template?.shared ?? false;

  return (
    <Container size="xl">
      <Title ta="center" mb="md">{`Completar Plantilla: ${publishedTemplateName}`}</Title>

      {hasQrDraft && (
        <Alert icon={<IconInfoCircle size={16} />} color="yellow" mb="md" title="Datos enviados por QR">
          Se han cargado datos enviados mediante el formulario QR. Revísalos y haz clic en <strong>Enviar</strong> para confirmarlos.
        </Alert>
      )}

      {useSheets ? (
        <Tabs value={activeSheet} onChange={setActiveSheet} keepMounted={false}>
          <Tabs.List mb="md">
            {allSheets.map(sheet => {
              const canEdit = accessibleSheetNames.has(sheet.name);
              return (
                <Tabs.Tab
                  key={sheet.name}
                  value={sheet.name}
                  fw={600}
                  leftSection={!canEdit ? (templateSharedUI ? <IconEye size={13} /> : <IconLock size={13} />) : undefined}
                  color={!canEdit ? (templateSharedUI ? "blue" : "gray") : undefined}
                >
                  {sheet.name}
                </Tabs.Tab>
              );
            })}
          </Tabs.List>
          {allSheets.map(sheet => {
            const canEdit = accessibleSheetNames.has(sheet.name);
            return (
              <Tabs.Panel key={sheet.name} value={sheet.name}>
                {!canEdit && (
                  <Text ta="center" c={templateSharedUI ? "blue" : "dimmed"} py="xs" size="xs">
                    {templateSharedUI ? (
                      <>
                        <IconEye size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        Información compartida por otros productores (solo lectura)
                      </>
                    ) : (
                      <>
                        <IconLock size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        Solo lectura — no tienes permiso para editar esta hoja.
                      </>
                    )}
                  </Text>
                )}
                {renderSheetTable(sheet.fields, sheet.name, !canEdit)}
                {canEdit && (
                  <Group justify="center" mt="sm" mb="md">
                    <Button variant="light" onClick={() => addSheetRow(sheet.name)} leftSection={<IconPlus />}>
                      Agregar Fila
                    </Button>
                  </Group>
                )}
              </Tabs.Panel>
            );
          })}
        </Tabs>
      ) : (
        <>
          {renderSheetTable(template.fields)}
        </>
      )}
      <Group justify="center" mt={rem(50)}>
        <Button 
          color={"red"}
          variant="outline"
          onClick={() => router.push('/producer/templates')}
          leftSection={<IconCancel/>}
          loading={loading}
        >
          Cancelar
        </Button>
        <Group>
          <Button 
            variant="light" 
            onClick={addRow}
            leftSection={<IconPlus/>}
          >
            Agregar Fila
          </Button>
          <Button
            onClick={handleSubmit}
            rightSection={<IconSend2/>}
            loading={loading}
          >
            Enviar
          </Button>
        </Group>
        
      </Group>
      <ValidatorModal
        opened={validatorModalOpen}
        onClose={() => {
          setValidatorModalOpen(false);
          setActiveRowIndex(null);
          setActiveFieldName(null);
          setActiveSheetForValidator(null);
          setCurrentValidatorId("");
        }}
        validatorId={currentValidatorId}
        periodId={templatePeriodId}
        onCopy={(value: string, description?: string) => {
          if (activeRowIndex !== null && activeFieldName !== null) {
            if (activeSheetForValidator) {
              updateSheetCell(activeSheetForValidator, activeRowIndex, activeFieldName, value);
            } else {
              const updatedRows = [...rows];
              updatedRows[activeRowIndex][activeFieldName] = value;
              setRows(updatedRows);
            }

            if (description) {
              const updatedDisplayValues = { ...displayValues };
              if (!updatedDisplayValues[activeRowIndex]) {
                updatedDisplayValues[activeRowIndex] = {};
              }
              updatedDisplayValues[activeRowIndex][activeFieldName] = description;
              setDisplayValues(updatedDisplayValues);
            }
          }
          setValidatorModalOpen(false);
          setActiveRowIndex(null);
          setActiveFieldName(null);
          setActiveSheetForValidator(null);
          setCurrentValidatorId("");
        }}
      />
    </Container>
  );
};

export default ProducerTemplateFormPage;
