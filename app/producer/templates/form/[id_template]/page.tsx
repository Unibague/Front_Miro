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
import { IconPlus, IconTrash, IconEye, IconCancel, IconDeviceFloppy, IconLock, IconInfoCircle } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { ValidatorModal } from "../../../../components/Validators/ValidatorModal";
import {
  buildFieldDropdownOptions,
  buildSelectOptionsFromStrings,
  buildValidatorOptions,
  getPreferredValidatorColumnName,
} from "../../../../utils/validatorOptions";

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  validate_with?: { id: string, name: string } | string;
  comment?: string;
  multiple?: boolean;
  dropdown_options?: string[];
  excel_validation_options?: string[];
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
  dependency_code?: string;
  dependency_name?: string;
  sender_name?: string;
  sender_email?: string | null;
  filled_data: { sheet_name?: string; sheet?: string; sheetName?: string; field_name: string; values: any[] }[];
}

interface QrRowSource {
  dependencyCode: string;
  dependencyName: string;
  senderName?: string;
  senderEmail?: string | null;
}

interface PublishedTemplateResponse {
  name: string;
  template: Template;
  publishedTemplate?: {
    period?: string | { _id: string; name?: string };
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
  const [rowSources, setRowSources] = useState<(QrRowSource | null)[]>([]);
  const [sheetRowSources, setSheetRowSources] = useState<Record<string, (QrRowSource | null)[]>>({});
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

  const getDraftFieldSheetName = (fieldData: QrDraftEntry["filled_data"][number]) =>
    fieldData.sheet_name || fieldData.sheet || fieldData.sheetName || null;

  const getDraftRowSource = (draft: QrDraftEntry): QrRowSource => ({
    dependencyCode: draft.dependency_code || draft.dependency,
    dependencyName: draft.dependency_name || draft.dependency,
    senderName: draft.sender_name,
    senderEmail: draft.sender_email,
  });

  const isBlankQrValue = (value: any) => (
    value === null || value === undefined || value === ""
  );

  const buildRowsFromFilledData = (filledData: QrDraftEntry["filled_data"]) => {
    const maxLen = Math.max(...filledData.map((fieldData) => fieldData.values?.length || 0), 1);
    return Array.from({ length: maxLen }, (_, rowIndex) => {
      const row: Record<string, any> = {};
      filledData.forEach((fieldData) => {
        const nextValue = fieldData.values?.[rowIndex] ?? null;
        const currentValue = row[fieldData.field_name];
        if (isBlankQrValue(currentValue) || !isBlankQrValue(nextValue)) {
          row[fieldData.field_name] = nextValue;
        }
      });
      return row;
    });
  };

  const buildRowsAndSourcesFromDraft = (
    draft: QrDraftEntry,
    filledData: QrDraftEntry["filled_data"] = draft.filled_data
  ) => {
    const draftRows = buildRowsFromFilledData(filledData);
    return {
      rows: draftRows,
      sources: draftRows.map(() => getDraftRowSource(draft)),
    };
  };

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

      const periodObj = response.data.publishedTemplate?.period;
      const periodName = typeof periodObj === "object" ? (periodObj?.name || "") : "";
      const periodMatch = periodName.match(/(\d{4})[_\-\s]*([AB])/i);
      const prefilledYear = periodMatch ? parseInt(periodMatch[1]) : null;
      const prefilledSemester = periodMatch ? (periodMatch[2].toUpperCase() === 'A' ? 1 : 2) : null;

      // Conjunto de hojas accesibles para este productor — usado también al cargar borradores
      let editableSheetNames = new Set<string>();
      // IDs de dependencias del usuario — usados para verificar si es productor encargado
      let currentUserDepIds: string[] = [];
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
            currentUserDepIds = userDepIds;
            editable = wbSheets.filter((sheet: WorkbookSheet) => {
              if (!sheet.fields?.length) return false;
              if (!sheet.producers?.length) return true;
              return sheet.producers.some((p: string) => userDepIds.includes(p.toString()));
            });
          }
        } catch { /* si falla, editable = todas las hojas */ }

        editableSheetNames = new Set(editable.map((s: WorkbookSheet) => s.name));
        setAccessibleSheets(editable);
        setActiveSheet(wbSheets[0].name);
        const sharedData = response.data.shared_sheets_data || {};
        const initialRows: Record<string, Record<string, any>[]> = {};
        const initialSources: Record<string, (QrRowSource | null)[]> = {};
        editable.forEach((s: WorkbookSheet) => {
          const prefilled: Record<string, any> = {};
          if (prefilledYear !== null && s.fields?.some((f: Field) => f.name.toUpperCase() === 'AÑO'))
            prefilled['AÑO'] = prefilledYear;
          if (prefilledSemester !== null && s.fields?.some((f: Field) => f.name.toUpperCase() === 'SEMESTRE'))
            prefilled['SEMESTRE'] = prefilledSemester;
          initialRows[s.name] = [prefilled];
          initialSources[s.name] = [null];
        });
        // Si template.shared=true, hojas no editables muestran datos de otros productores
        if (templateShared) {
          wbSheets
            .filter((s: WorkbookSheet) => !editable.some((e: WorkbookSheet) => e.name === s.name))
            .forEach((s: WorkbookSheet) => {
              const rawRows: any[] = sharedData[s.name] || [];
              if (rawRows.length) {
                initialRows[s.name] = rawRows.map(({ __origin__, ...rest }) => rest);
                initialSources[s.name] = rawRows.map((row) =>
                  row.__origin__
                    ? {
                        dependencyCode: row.__origin__.code,
                        dependencyName: row.__origin__.depName || row.__origin__.code,
                        senderName: row.__origin__.senderName,
                        senderEmail: row.__origin__.senderEmail,
                      }
                    : null
                );
              } else {
                initialRows[s.name] = [{}];
                initialSources[s.name] = [null];
              }
            });
        }
        setSheetRows(initialRows);
        setSheetRowSources(initialSources);
      } else {
        setRowSources([]);
        setSheetRowSources({});
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
          const matchingDrafts = qrDrafts.filter((draft: QrDraftEntry) =>
            allDepCodes.includes(draft.dependency_code || draft.dependency)
          );
          const draftsWithData = matchingDrafts.filter((draft) => draft.filled_data?.length);

          if (draftsWithData.length) {
            const wbSheets = response.data.template.workbook_sheets || [];

            if (wbSheets.length) {
              const draftSheetRows: Record<string, Record<string, any>[]> = {};
              const draftSheetSources: Record<string, (QrRowSource | null)[]> = {};
              let firstDraftSheetName: string | null = null;

              draftsWithData.forEach((draft) => {
                const hasSheetTaggedFields = draft.filled_data.some((fieldData) => getDraftFieldSheetName(fieldData));
                let legacyCursor = 0;

                wbSheets.forEach((sheet: WorkbookSheet) => {
                  // Solo aplicar datos del borrador a hojas que este productor puede editar
                  const isAccessible = !editableSheetNames.size || editableSheetNames.has(sheet.name);
                  const sheetFieldNames = new Set(sheet.fields.map((f: Field) => f.name));
                  const sheetFilled = hasSheetTaggedFields
                    ? draft.filled_data.filter((fieldData) => getDraftFieldSheetName(fieldData) === sheet.name)
                    : draft.filled_data
                        .slice(legacyCursor, legacyCursor + sheet.fields.length)
                        .filter((fieldData) => sheetFieldNames.has(fieldData.field_name));

                  // Avanzar cursor legacy siempre (incluso en hojas no accesibles)
                  if (!hasSheetTaggedFields && sheetFilled.length) {
                    legacyCursor += sheet.fields.length;
                  }

                  // Solo cargar filas de hojas accesibles; las hojas read-only usan shared_sheets_data
                  if (isAccessible && sheetFilled.length) {
                    const built = buildRowsAndSourcesFromDraft(draft, sheetFilled);
                    draftSheetRows[sheet.name] = [...(draftSheetRows[sheet.name] || []), ...built.rows];
                    draftSheetSources[sheet.name] = [...(draftSheetSources[sheet.name] || []), ...built.sources];
                    if (!firstDraftSheetName) firstDraftSheetName = sheet.name;
                  }
                });
              });

              if (Object.keys(draftSheetRows).length) {
                if (prefilledYear !== null || prefilledSemester !== null) {
                  Object.entries(draftSheetRows).forEach(([sheetName, rows]) => {
                    const sheet = wbSheets.find((s: WorkbookSheet) => s.name === sheetName);
                    if (!sheet) return;
                    draftSheetRows[sheetName] = rows.map(row => {
                      const updated = { ...row };
                      if (prefilledYear !== null && sheet.fields?.some((f: Field) => f.name.toUpperCase() === 'AÑO') && (updated['AÑO'] === null || updated['AÑO'] === undefined))
                        updated['AÑO'] = prefilledYear;
                      if (prefilledSemester !== null && sheet.fields?.some((f: Field) => f.name.toUpperCase() === 'SEMESTRE') && (updated['SEMESTRE'] === null || updated['SEMESTRE'] === undefined))
                        updated['SEMESTRE'] = prefilledSemester;
                      return updated;
                    });
                  });
                }
                setSheetRows(prev => ({ ...prev, ...draftSheetRows }));
                setSheetRowSources(prev => ({ ...prev, ...draftSheetSources }));
                setActiveSheet(firstDraftSheetName);
              }
            } else {
              const draftRows: Record<string, any>[] = [];
              const draftSources: (QrRowSource | null)[] = [];

              draftsWithData.forEach((draft) => {
                const built = buildRowsAndSourcesFromDraft(draft);
                draftRows.push(...built.rows);
                draftSources.push(...built.sources);
              });

              if (draftRows.length) {
                setRows(draftRows);
                setRowSources(draftSources);
              }
            }

            // Solo mostrar el banner "Datos enviados por QR" al productor encargado
            const responsibleIds: string[] = (
              (response.data.publishedTemplate as any)?.responsible_producers ||
              (response.data.template as any)?.responsible_producers ||
              []
            ).map((id: any) => String(id));
            const isResponsible =
              responsibleIds.length === 0 ||
              currentUserDepIds.some((id) => responsibleIds.includes(id));
            if (isResponsible) setHasQrDraft(true);
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
              validatorId = parts.length >= 2 ? parts[parts.length - 1].trim() : field.validate_with.trim();
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

      // Cargar opciones para campos con validador o listas importadas desde Excel
      const allValidatorOptionsPromises = allTemplateFields
      .map(async (field) => {
        const fieldDropdownOptions = buildFieldDropdownOptions(field);

        if (!field.validate_with) {
          return {
            fieldName: field.name,
            options: buildSelectOptionsFromStrings(fieldDropdownOptions),
            isMultiple: field.multiple,
          };
        }

        try {
          let validatorId = '';
          let validateWith = '';

          if (typeof field.validate_with === 'string') {
            const parts = field.validate_with.split(' - ');
            if (parts.length >= 2) {
              validatorId = parts[parts.length - 1].trim();
              validateWith = field.validate_with;
            } else if (field.validate_with.trim()) {
              validatorId = field.validate_with.trim();
              validateWith = field.validate_with.trim();
            }
          } else if ((field.validate_with as any)?.id) {
            validatorId = (field.validate_with as any).id;
            validateWith = (field.validate_with as any).name || '';
          }

          if (!validatorId) {
            return {
              fieldName: field.name,
              options: buildSelectOptionsFromStrings(fieldDropdownOptions),
              isMultiple: field.multiple,
            };
          }

          const vRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id`, {
            params: { id: validatorId, periodId },
          });
          const optionStrings = buildValidatorOptions(
            vRes.data?.validator,
            getPreferredValidatorColumnName(validateWith)
          );
          const options = buildSelectOptionsFromStrings([...optionStrings, ...fieldDropdownOptions]);

          return { fieldName: field.name, options, isMultiple: field.multiple };
        } catch (error) {
          console.error(`Error obteniendo opciones para ${field.name}:`, error);
          return {
            fieldName: field.name,
            options: buildSelectOptionsFromStrings(fieldDropdownOptions),
            isMultiple: field.multiple,
          };
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

  const addSheetRow = (sheetName: string) => {
    setSheetRows(prev => ({ ...prev, [sheetName]: [...(prev[sheetName] || []), {}] }));
    setSheetRowSources(prev => ({ ...prev, [sheetName]: [...(prev[sheetName] || []), null] }));
  };

  const saveDraftRows = async (
    updatedRows?: Record<string, any>[],
    updatedSheetRows?: Record<string, Record<string, any>[]>
  ) => {
    try {
      if (allSheets.length > 0) {
        const currentSheetRows = updatedSheetRows ?? sheetRows;
        // Solo enviar hojas accesibles (editables) — las hojas read-only pertenecen
        // a otros productores y no deben incluirse en el borrador de este productor.
        const sheetsPayload = accessibleSheets.map((sheet) => ({
          name: sheet.name,
          data: currentSheetRows[sheet.name] || [],
        }));
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
          email: session?.user?.email,
          pubTem_id: id_template,
          sheetsData: sheetsPayload,
          asDraft: true,
        });
      } else {
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
          email: session?.user?.email,
          pubTem_id: id_template,
          data: updatedRows ?? rows,
          asDraft: true,
        });
      }
    } catch (err) {
      console.error('[saveDraftRows] Error al guardar borrador:', err);
    }
  };

  const removeSheetRow = (sheetName: string, idx: number) => {
    const updated = {
      ...sheetRows,
      [sheetName]: (sheetRows[sheetName] || []).filter((_, i) => i !== idx),
    };
    setSheetRows(updated);
    setSheetRowSources(prev => ({ ...prev, [sheetName]: (prev[sheetName] || []).filter((_, i) => i !== idx) }));
    saveDraftRows(undefined, updated);
  };

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
    setRowSources(prev => [...prev, null]);
    
    // Auto-seleccionar el primer campo con validador de la nueva fila
    const newRowIndex = newRows.length - 1;
    const firstFieldWithValidator = template?.fields.find(f => f.validate_with);
    
    if (firstFieldWithValidator) {
      setActiveRowIndex(newRowIndex);
      setActiveFieldName(firstFieldWithValidator.name);
    }
  };

  const removeRow = (index: number) => {
    const updated = rows.filter((_, i) => i !== index);
    setRows(updated);
    setRowSources(prev => prev.filter((_, i) => i !== index));
    saveDraftRows(updated);
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
    try {
      setLoading(true);
      const formatRows = (rowsToFormat: Record<string, any>[], fields: Field[]) => rowsToFormat.map(row => {
        const formattedRow: Record<string, any> = {};

        Object.keys(row).forEach(fieldName => {
          const field = fields.find(f => f.name === fieldName);

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

      const useSheetSubmission = allSheets.length > 0;
      const formattedRows = formatRows(rows, template?.fields || []);
      const sheetsData = accessibleSheets.map((sheet) => ({
        name: sheet.name,
        data: formatRows(sheetRows[sheet.name] || [{}], sheet.fields || []),
      }));

      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
        email: session?.user?.email,
        pubTem_id: id_template,
        data: useSheetSubmission ? undefined : formattedRows,
        sheetsData: useSheetSubmission ? sheetsData : undefined,
        asDraft: true,
      });
      showNotification({
        title: "Borrador guardado",
        message: "Los datos se guardaron. Usa el botón 'Enviar al SNIES' en la lista de plantillas para enviar definitivamente.",
        color: "teal",
      });
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
  
    const opts = selectOptions[field.name] || [];
    const multiOptions = multiSelectOptions[field.name] || opts.map(opt => opt.value);
    const hasDropdownOptions = opts.length > 0 || multiOptions.length > 0;

    if (field.multiple && (field.validate_with || hasDropdownOptions)) {
      return wrapWithTooltip(
        <MultiSelect
          value={Array.isArray(row[field.name]) ? row[field.name].map(String) : []}
          onChange={(value) => !readOnly && inputChange(rowIndex, field.name, value)}
          data={Array.from(new Set(multiOptions)).map(value => ({ value: String(value), label: String(value) }))}
          searchable
          clearable
          placeholder="Seleccione opciones"
          style={{ width: "100%" }}
          error={fieldError || undefined}
          disabled={readOnly}
        />
      );
    }
    
    // Si el campo tiene validador pero NO es múltiple, usar Select
    if ((field.validate_with || hasDropdownOptions) && !field.multiple) {
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
          clearable
          placeholder={opts.length === 0 ? "Cargando opciones..." : "Seleccione una opcion"}
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

  const renderRowSource = (source?: QrRowSource | null) => {
    if (!source) return <Text size="xs" c="dimmed">Manual</Text>;

    const senderText = source.senderName || source.senderEmail;
    const tooltipLabel = senderText
      ? `Enviado por ${senderText}`
      : `Codigo ${source.dependencyCode}`;

    return (
      <Tooltip label={tooltipLabel} withArrow>
        <div>
          <Text size="xs" fw={700}>{source.dependencyName}</Text>
          <Text size="xs" c="dimmed">{source.dependencyCode}</Text>
        </div>
      </Tooltip>
    );
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
    const currentRowSources = isSheetMode ? (sheetRowSources[sheetName] || []) : rowSources;
    const showQrSourceColumn = currentRowSources.some(Boolean);

    return (
      <ScrollArea viewportRef={scrollAreaRef}>
        <ScrollArea type="always" offsetScrollbars>
          <Table mb="xs" withTableBorder withColumnBorders withRowBorders>
            <Table.Thead>
              <Table.Tr>
                {showQrSourceColumn && (
                  <Table.Th style={{ minWidth: '220px' }}>Origen</Table.Th>
                )}
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
                  {showQrSourceColumn && (
                    <Table.Td style={{ minWidth: '220px' }}>
                      {renderRowSource(currentRowSources[rowIndex])}
                    </Table.Td>
                  )}
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
          Se han cargado datos enviados mediante el formulario QR. Revisa y haz clic en <strong>Guardar</strong> para confirmar.
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
            rightSection={<IconDeviceFloppy size={16}/>}
            loading={loading}
          >
            Guardar
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
