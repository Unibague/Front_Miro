"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Badge,
  Box
} from "@mantine/core";
import { IconPlus, IconTrash, IconEye, IconCancel, IconDeviceFloppy, IconLock, IconInfoCircle, IconSend } from "@tabler/icons-react";
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
import { isBlankRequiredValue } from "../../../../utils/requiredFields";

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

interface FilledFieldEntry {
  sheet_name?: string;
  sheet?: string;
  sheetName?: string;
  field_name: string;
  values: any[];
}

interface QrDraftEntry {
  dependency: string;
  dependency_code?: string;
  dependency_name?: string;
  sender_name?: string;
  sender_email?: string | null;
  filled_data: FilledFieldEntry[];
}

interface ProducerLoadedEntry {
  dependency: string;
  dependency_code?: string;
  dependency_name?: string;
  sender_name?: string;
  sender_email?: string | null;
  send_by?: {
    full_name?: string;
    name?: string;
    email?: string;
  };
  filled_data: FilledFieldEntry[];
  source?: 'excel' | 'qr' | 'online' | 'manual';
}
interface QrRowSource {
  dependencyCode: string;
  dependencyName: string;
  senderName?: string;
  senderEmail?: string | null;
  fromQr?: boolean;
  fromExcel?: boolean;
  fromOnline?: boolean;
}

interface PublishedTemplateResponse {
  name: string;
  template: Template;
  publishedTemplate?: {
    period?: string | { _id: string; name?: string };
    loaded_data?: ProducerLoadedEntry[];
    responsible_producers?: string[];
  };
  qr_draft_data?: QrDraftEntry[];
  shared_sheets_data?: Record<string, Record<string, any>[]>;
}

interface ValidatorData {
  name: string;
  _id: string;
  columns: { name: string; is_validator: boolean; values: any[] }[];
}

const fieldIsRequired = (field: Field): boolean => {
  if (field.required) return true;
  const c = field.comment?.toLowerCase() ?? "";
  for (const w of ["obligatorio", "obligatario"]) {
    if (c.includes(w) && !c.includes(`no ${w}`) && !new RegExp(`${w}\\s+si\\b`).test(c)) return true;
  }
  return false;
};

const normalizeFieldRequired = (field: Field): Field => ({
  ...field,
  required: fieldIsRequired(field),
});

const normalizeSheetRequired = (sheet: WorkbookSheet): WorkbookSheet => ({
  ...sheet,
  fields: (sheet.fields || []).map(normalizeFieldRequired),
});

const normalizeTemplateRequired = (template: Template): Template => ({
  ...template,
  fields: (template.fields || []).map(normalizeFieldRequired),
  workbook_sheets: (template.workbook_sheets || []).map(normalizeSheetRequired),
});

const ProducerTemplateFormPage = ({ params }: { params: { id_template: string } }) => {
  const { id_template } = params;
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUploaded = searchParams?.get('from') === 'uploaded';
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
  const [userSource, setUserSource] = useState<QrRowSource | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [validatorModalOpen, setValidatorModalOpen] = useState(false);
  const [validatorData, setValidatorData] = useState<ValidatorData | null>(null);
  const [validatorExists, setValidatorExists] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isResponsibleProducer, setIsResponsibleProducer] = useState(false);
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
  const [sharedSheetsData, setSharedSheetsData] = useState<Record<string, Record<string, any>[]>>({});

  const getScopedFieldKey = (fieldName: string, sheetName?: string | null) =>
    sheetName ? `${sheetName}::${fieldName}` : fieldName;

  const clearFieldError = (fieldName: string, sheetName?: string | null) => {
    const errorKey = getScopedFieldKey(fieldName, sheetName);
    setErrors(prev => {
      if (!prev[errorKey]) return prev;
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
  };

  const getDraftFieldSheetName = (fieldData: FilledFieldEntry) =>
    fieldData.sheet_name || fieldData.sheet || fieldData.sheetName || null;

  const getEntryDependencyCode = (entry: { dependency?: string; dependency_code?: string }) =>
    entry.dependency_code || entry.dependency || "";

  const getDraftRowSource = (draft: QrDraftEntry): QrRowSource => ({
    dependencyCode: draft.dependency_code || draft.dependency,
    dependencyName: draft.dependency_name || draft.dependency,
    senderName: draft.sender_name,
    senderEmail: draft.sender_email,
    fromQr: !!(draft.sender_name && draft.sender_email !== session?.user?.email),
  });

  const getLoadedRowSource = (entry: ProducerLoadedEntry): QrRowSource => {
    const sender = entry.send_by || {};
    const dependencyCode = getEntryDependencyCode(entry);

    // Determinar el origen con fallback para datos viejos
    let fromQr = false;
    let fromExcel = false;
    let fromOnline = false;
    
    if (entry.source === 'excel') {
      fromExcel = true;
    } else if (entry.source === 'online') {
      fromOnline = true;
    } else if (entry.source === 'manual') {
      // fromManual será inferido cuando todos sean false (datos viejos)
    } else if (entry.sender_email && entry.sender_name) {
      // Si tiene sender_email y sender_name → es QR
      fromQr = true;
    } else if (sender.email) {
      // Fallback para datos viejos: si tiene send_by con email, es probablemente online
      fromOnline = true;
    }
    // Si no tiene nada: será Manual (datos muy viejos)

    return {
      dependencyCode,
      dependencyName: entry.dependency_name || dependencyCode,
      senderName: entry.sender_name || sender.full_name || sender.name || sender.email,
      senderEmail: entry.sender_email ?? sender.email ?? null,
      fromQr,
      fromExcel,
      fromOnline,
    };
  };

  const isBlankQrValue = (value: any) => (
    value === null || value === undefined || value === ""
  );

  const buildRowsFromFilledData = (filledData: FilledFieldEntry[]) => {
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
    filledData: FilledFieldEntry[] = draft.filled_data
  ) => {
    const draftRows = buildRowsFromFilledData(filledData);
    return {
      rows: draftRows,
      sources: draftRows.map(() => getDraftRowSource(draft)),
    };
  };

  const buildRowsAndSourcesFromLoadedEntry = (
    entry: ProducerLoadedEntry,
    filledData: FilledFieldEntry[] = entry.filled_data
  ) => {
    const loadedRows = buildRowsFromFilledData(filledData);
    return {
      rows: loadedRows,
      sources: loadedRows.map(() => getLoadedRowSource(entry)),
    };
  };

  const fetchTemplate = async () => {
    try {
      const response = await axios.get<PublishedTemplateResponse>(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${id_template}`
      );
      setPublishedTemplateName(response.data.name);
      const normalizedTemplate = normalizeTemplateRequired(response.data.template);
      setTemplate(normalizedTemplate);

      // Cargar datos compartidos de otros productores
      if (response.data.shared_sheets_data) {
        setSharedSheetsData(response.data.shared_sheets_data);
      }

      // Cargar todas las hojas y determinar cuáles son editables
      const wbSheets = normalizedTemplate.workbook_sheets || [];

      const _now = new Date();
      const prefilledYear = _now.getFullYear();
      const prefilledSemester = _now.getMonth() < 6 ? 1 : 2;

      // Conjunto de hojas accesibles para este productor — usado también al cargar borradores
      let editableSheetNames = new Set<string>();
      // IDs de dependencias del usuario — usados para verificar si es productor encargado
      let currentUserDepIds: string[] = [];
      if (wbSheets.length > 0) {
        setAllSheets(wbSheets);
        let editable: WorkbookSheet[] = wbSheets;
        let userSrc: QrRowSource | null = null;
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
            const primaryDep = allDeps.find((d: any) => d.dep_code === user.dep_code);
            userSrc = {
              dependencyCode: user.dep_code || '',
              dependencyName: primaryDep?.name || user.dep_code || '',
              senderName: user.name || session?.user?.name || undefined,
              senderEmail: session?.user?.email || null,
            };
            setUserSource(userSrc);
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
          if (s.fields?.some((f: Field) => f.name.toUpperCase() === 'AÑO'))
            prefilled['AÑO'] = prefilledYear;
          if (s.fields?.some((f: Field) => f.name.toUpperCase() === 'SEMESTRE'))
            prefilled['SEMESTRE'] = prefilledSemester;
          initialRows[s.name] = [prefilled];
          initialSources[s.name] = [userSrc];
        });
        // Hojas no editables siempre muestran los datos ya enviados por otros productores (lectura)
        {
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
                        fromQr: row.__origin__.fromQr,
                        fromExcel: row.__origin__.fromExcel,
                        fromOnline: row.__origin__.fromOnline,
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

      // Pre-cargar datos ya enviados para que la edicion en linea conserve la informacion cargada.
      if (session?.user?.email) {
        try {
          const userRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
            params: { email: session.user.email },
          });
          const userDepCode: string = userRes.data?.dep_code || '';
          const allDepCodes: string[] = [userDepCode, ...(userRes.data?.additional_dependencies || [])].filter(Boolean);
          const loadedEntries = (response.data.publishedTemplate?.loaded_data || [])
            .filter((entry: ProducerLoadedEntry) =>
              allDepCodes.includes(getEntryDependencyCode(entry)) && entry.filled_data?.length
            );

          if (loadedEntries.length) {
            const wbSheets = normalizedTemplate.workbook_sheets || [];

            if (wbSheets.length) {
              const loadedSheetRows: Record<string, Record<string, any>[]> = {};
              const loadedSheetSources: Record<string, (QrRowSource | null)[]> = {};
              let firstLoadedSheetName: string | null = null;

              loadedEntries.forEach((entry) => {
                const hasSheetTaggedFields = entry.filled_data.some((fieldData) => getDraftFieldSheetName(fieldData));
                let legacyCursor = 0;

                wbSheets.forEach((sheet: WorkbookSheet) => {
                  const isAccessible = !editableSheetNames.size || editableSheetNames.has(sheet.name);
                  const sheetFields = sheet.fields || [];
                  const sheetFieldNames = new Set(sheetFields.map((f: Field) => f.name));
                  
                  // Prioridad: si hay sheet_name, usarlo; si no, fallback a legacy slice
                  let sheetFilled: FilledFieldEntry[] = [];
                  if (hasSheetTaggedFields) {
                    // Si hay sheet_name, filtrar exactamente por coincidencia de nombre de hoja
                    // Intentar coincidencia exacta primero, luego normalizada
                    sheetFilled = entry.filled_data.filter((fieldData) => {
                      const fieldSheetName = getDraftFieldSheetName(fieldData);
                      return fieldSheetName === sheet.name || 
                             fieldSheetName?.trim?.().toLowerCase() === sheet.name?.trim?.().toLowerCase();
                    });
                  } else {
                    // Fallback legacy: usar slice y filtrar por nombre de campo
                    sheetFilled = entry.filled_data
                      .slice(legacyCursor, legacyCursor + sheetFields.length)
                      .filter((fieldData) => sheetFieldNames.has(fieldData.field_name));
                  }

                  // Avanzar cursor legacy siempre (incluso si no se usó)
                  if (!hasSheetTaggedFields && sheetFilled.length) {
                    legacyCursor += sheetFields.length;
                  }

                  if (isAccessible && sheetFilled.length) {
                    const built = buildRowsAndSourcesFromLoadedEntry(entry, sheetFilled);
                    loadedSheetRows[sheet.name] = [...(loadedSheetRows[sheet.name] || []), ...built.rows];
                    loadedSheetSources[sheet.name] = [...(loadedSheetSources[sheet.name] || []), ...built.sources];
                    if (!firstLoadedSheetName) firstLoadedSheetName = sheet.name;
                  }
                });
              });

              if (Object.keys(loadedSheetRows).length) {
                setSheetRows(prev => ({ ...prev, ...loadedSheetRows }));
                setSheetRowSources(prev => ({ ...prev, ...loadedSheetSources }));
                setActiveSheet(firstLoadedSheetName);
              }
            } else {
              const loadedRows: Record<string, any>[] = [];
              const loadedSources: (QrRowSource | null)[] = [];

              loadedEntries.forEach((entry) => {
                const built = buildRowsAndSourcesFromLoadedEntry(entry);
                loadedRows.push(...built.rows);
                loadedSources.push(...built.sources);
              });

              if (loadedRows.length) {
                setRows(loadedRows);
                setRowSources(loadedSources);
              }
            }
          }
        } catch { /* ignorar error de pre-carga de datos enviados */ }
      }

      // Pre-cargar datos del borrador si existen para la dependencia del usuario.
      // Se carga siempre: tanto borradores guardados manualmente como los originados por QR.
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
            const wbSheets = normalizedTemplate.workbook_sheets || [];

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
              (normalizedTemplate as any)?.responsible_producers ||
              []
            ).map((id: any) => String(id));
            const isResponsible =
              responsibleIds.length === 0 ||
              currentUserDepIds.some((id) => responsibleIds.includes(id));
            if (isResponsible) setHasQrDraft(true);
            setIsResponsibleProducer(isResponsible);
          }
        } catch { /* ignorar error de pre-carga */ }
      }

      // Recolectar campos de top-level + todos los workbook_sheets
      const allTemplateFields: Field[] = [
        ...(normalizedTemplate.fields || []),
        ...((normalizedTemplate.workbook_sheets || []).flatMap((s: WorkbookSheet) => s.fields || [])),
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
              const lastPart = parts[parts.length - 1].trim();
              // Si el último segmento es un ObjectId de MongoDB (24 hex), úsalo como ID;
              // de lo contrario el primer segmento es el nombre del validador.
              validatorId = /^[0-9a-fA-F]{24}$/.test(lastPart) ? lastPart : parts[0].trim();
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
          // Si el validador aportó opciones, no mezclar con las del comentario para evitar duplicados
          const options = buildSelectOptionsFromStrings(
            optionStrings.length > 0 ? optionStrings : fieldDropdownOptions
          );

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
    clearFieldError(fieldName, sheetName);
  };

  const addSheetRow = (sheetName: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const semester = now.getMonth() < 6 ? 1 : 2;
    const sheet = accessibleSheets.find(s => s.name === sheetName);
    const prefilled: Record<string, any> = {};
    if (sheet?.fields?.some(f => f.name.toUpperCase() === 'AÑO')) prefilled['AÑO'] = String(year);
    if (sheet?.fields?.some(f => f.name.toUpperCase() === 'SEMESTRE')) prefilled['SEMESTRE'] = semester;
    setSheetRows(prev => ({ ...prev, [sheetName]: [...(prev[sheetName] || []), prefilled] }));
    setSheetRowSources(prev => ({ ...prev, [sheetName]: [...(prev[sheetName] || []), userSource] }));
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDraftRows();
      showNotification({
        title: "Guardado",
        message: "Tu progreso ha sido guardado. Puedes continuar más tarde.",
        color: "green",
        icon: <IconDeviceFloppy size={18} />,
      });
    } catch {
      showNotification({
        title: "Error al guardar",
        message: "No se pudo guardar el progreso. Intenta de nuevo.",
        color: "red",
      });
    } finally {
      setSaving(false);
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

    clearFieldError(fieldName);
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

  const collectRequiredErrors = (
    rowsToValidate: Record<string, any>[],
    fields: Field[],
    nextErrors: Record<string, string[]>,
    sheetName?: string | null
  ) => {
    let hasErrors = false;

    fields.forEach((field) => {
      if (!fieldIsRequired(field)) return;
      const errorKey = getScopedFieldKey(field.name, sheetName);

      rowsToValidate.forEach((row, rowIndex) => {
        if (!isBlankRequiredValue(row?.[field.name])) return;

        if (!nextErrors[errorKey]) nextErrors[errorKey] = [];
        nextErrors[errorKey][rowIndex] = "Este campo es obligatorio";
        hasErrors = true;
      });
    });

    return hasErrors;
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

  const handleSendToSnies = async () => {
    try {
      setLoading(true);
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/confirmFinalSubmit`, {
        email: session?.user?.email,
        pubTem_id: id_template,
      });
      showNotification({
        title: "Enviado a SNIES",
        message: "La información fue enviada exitosamente a SNIES.",
        color: "teal",
        autoClose: 5000,
      });
      router.push('/producer/templates');
    } catch (error: any) {
      showNotification({
        title: "Error al enviar a SNIES",
        message: error.response?.data?.status || "No se pudo enviar la información a SNIES.",
        color: "red",
        autoClose: 6000,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const formatRows = (rowsToFormat: Record<string, any>[], fields: Field[]) => rowsToFormat.map(row => {
        const formattedRow: Record<string, any> = {};

        // Envía TODOS los campos del template: null si vacío → permite validar obligatorios
        fields.forEach(field => {
          const fieldName = field.name;
          const value = row[fieldName];
          if (field?.multiple && Array.isArray(value)) {
            const isNumericField = multiSelectOptions[fieldName]?.every(v => !isNaN(Number(v)));
            formattedRow[fieldName] = isNumericField ? value.map((v: any) => Number(v)) : value;
          } else {
            formattedRow[fieldName] = value !== undefined ? value : null;
          }
        });

        return formattedRow;
      });

      const useSheetSubmission = allSheets.length > 0;
      // Resolver displayValues en el row antes de formatear
      const resolveDisplayValues = (rowsToResolve: Record<string, any>[], fields: Field[], sheetName?: string | null) =>
        rowsToResolve.map((row, rowIdx) => {
          const resolved = { ...row };
          const dv = displayValues[rowIdx] || {};
          fields.forEach(field => {
            const displayKey = getScopedFieldKey(field.name, sheetName);
            const displayValue = dv[displayKey] ?? (!sheetName ? dv[field.name] : undefined);
            if (displayValue && (resolved[field.name] === undefined || resolved[field.name] === null)) {
              // Si hay un displayValue pero no hay valor en el row, buscar el valor del select
              const opts = selectOptions[field.name] || [];
              const matchingOpt = opts.find(o => o.label === displayValue);
              if (matchingOpt) resolved[field.name] = matchingOpt.value;
              else resolved[field.name] = displayValue;
            }
          });
          return resolved;
        });

      const resolvedRows = resolveDisplayValues(rows, template?.fields || []);
      const requiredErrors: Record<string, string[]> = {};
      let hasRequiredErrors = false;

      if (useSheetSubmission) {
        accessibleSheets.forEach((sheet) => {
          const resolvedSheetRows = resolveDisplayValues(sheetRows[sheet.name] || [{}], sheet.fields || [], sheet.name);
          if (collectRequiredErrors(resolvedSheetRows, sheet.fields || [], requiredErrors, sheet.name)) {
            hasRequiredErrors = true;
          }
        });
      } else if (collectRequiredErrors(resolvedRows, template?.fields || [], requiredErrors)) {
        hasRequiredErrors = true;
      }

      if (hasRequiredErrors) {
        setErrors(requiredErrors);
        showNotification({
          title: "Campos obligatorios sin completar",
          message: "Revisa los campos marcados en rojo antes de enviar.",
          color: "red",
          autoClose: 5000,
        });
        return;
      }

      const formattedRows = formatRows(resolvedRows, template?.fields || []);
      const sheetsData = accessibleSheets.map((sheet) => ({
        name: sheet.name,
        data: formatRows(resolveDisplayValues(sheetRows[sheet.name] || [{}], sheet.fields || [], sheet.name), sheet.fields || []),
      }));

      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
        email: session?.user?.email,
        pubTem_id: id_template,
        data: useSheetSubmission ? undefined : formattedRows,
        sheetsData: useSheetSubmission ? sheetsData : undefined,
        asDraft: false,
      });
      showNotification({
        title: "Información enviada",
        message: "Los datos se enviaron correctamente.",
        color: "teal",
      });
      router.push('/producer/templates');
    } catch (error) {
      console.error("Error submitting data:", error);
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        const validationErrors = error.response.data.details;
        const errorObject: Record<string, string[]> = {};

        validationErrors.forEach((error: { column: string, sheet_name?: string, errors: { register: number, message: string }[] }) => {
          const errorKey = getScopedFieldKey(error.column, error.sheet_name);
          error.errors.forEach(err => {
            if (!errorObject[errorKey]) {
              errorObject[errorKey] = [];
            }
            errorObject[errorKey][err.register - 1] = err.message;
          });
        });

        setErrors(errorObject);
        const camposObligatorios = validationErrors
          .filter((e: any) => e.errors?.some((err: any) => err.message?.includes('obligatorio')))
          .map((e: any) => e.column);
        showNotification({
          title: "Campos obligatorios sin completar",
          message: `Revisa los campos marcados en rojo (${camposObligatorios.length} campo${camposObligatorios.length !== 1 ? 's' : ''}).`,
          color: "red",
          autoClose: 5000,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const renderInputField = (
    field: Field,
    row: Record<string, any>,
    rowIndex: number,
    onInputChange?: (rowIndex: number, fieldName: string, value: any) => void,
    readOnly = false,
    sheetName?: string
  ) => {
    const inputChange = onInputChange || handleInputChange;
    const scopedFieldKey = getScopedFieldKey(field.name, sheetName);
    const rowDisplayValues = displayValues[rowIndex] || {};
    const storedDisplayValue = rowDisplayValues[scopedFieldKey] ?? (!sheetName ? rowDisplayValues[field.name] : undefined);
    const rawError = readOnly ? undefined : errors[scopedFieldKey]?.[rowIndex];
    const fieldError = rawError?.includes('obligatorio') ? 'Este campo es obligatorio' : rawError;

    const clearDisplayValue = () => {
      setDisplayValues(prev => {
        if (!prev[rowIndex]?.[scopedFieldKey] && (sheetName || !prev[rowIndex]?.[field.name])) {
          return prev;
        }

        const next = { ...prev };
        const rowValues = { ...(next[rowIndex] || {}) };
        delete rowValues[scopedFieldKey];
        if (!sheetName) delete rowValues[field.name];

        if (Object.keys(rowValues).length > 0) next[rowIndex] = rowValues;
        else delete next[rowIndex];

        return next;
      });
    };

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
      required: fieldIsRequired(field),
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
          style={{ minWidth: "280px", width: "100%" }}
          error={fieldError || undefined}
          disabled={readOnly}
          required={fieldIsRequired(field)}
        />
      );
    }
    
    // Si el campo tiene validador pero NO es múltiple, usar Select
    if ((field.validate_with || hasDropdownOptions) && !field.multiple) {
      const selectDisplayValue = storedDisplayValue
        ? opts.find(opt => opt.label === storedDisplayValue)?.value || row[field.name]
        : row[field.name];

      return wrapWithTooltip(
        <Select
          {...commonProps}
          value={selectDisplayValue ? String(selectDisplayValue) : null}
          onChange={(value) => {
            if (storedDisplayValue) clearDisplayValue();
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
        const numericDisplayValue = field.validate_with && storedDisplayValue
          ? storedDisplayValue
          : (typeof row[field.name] === 'number' ? row[field.name] : "");
          
        return wrapWithTooltip(
          <TextInput
            {...commonProps}
            value={String(numericDisplayValue)}
            onChange={(e) => {
              // Si el usuario edita manualmente, limpiar la descripción guardada
              if (field.validate_with && storedDisplayValue) clearDisplayValue();
              const numValue = parseFloat(e.target.value);
              inputChange(rowIndex, field.name, isNaN(numValue) ? null : numValue);
            }}
          />
        );
  
      case "Texto Largo":
        const textareaDisplayValue = field.validate_with && storedDisplayValue
          ? storedDisplayValue
          : (row[field.name] === null ? "" : row[field.name]);
          
        return wrapWithTooltip(
          <Textarea
            {...commonProps}
            autosize
            minRows={2}
            maxRows={6}
            value={textareaDisplayValue}
            onChange={(e) => {
              if (field.validate_with && storedDisplayValue) clearDisplayValue();
              inputChange(rowIndex, field.name, e.target.value);
            }}
          />
        );

      case "Texto Corto":
      case "Link":
        // Si el campo tiene validador y hay una descripción guardada, mostrarla
        const displayValue = field.validate_with && storedDisplayValue
          ? storedDisplayValue
          : (row[field.name] === null ? "" : row[field.name]);
          
        return wrapWithTooltip(
          <TextInput
            {...commonProps}
            value={displayValue}
            onChange={(e) => {
              // Si el usuario edita manualmente, limpiar la descripción guardada
              if (field.validate_with && storedDisplayValue) clearDisplayValue();
              inputChange(rowIndex, field.name, e.target.value);
            }}
          />
        );

      case "True/False":
        const switchDisplayValue = field.validate_with && storedDisplayValue
          ? storedDisplayValue
          : row[field.name];

        return wrapWithTooltip(
          <Switch
            checked={switchDisplayValue === true || switchDisplayValue === "Si"}
            disabled={readOnly}
            onChange={(event) => {
              if (readOnly) return;
              if (field.validate_with && storedDisplayValue) clearDisplayValue();
              inputChange(rowIndex, field.name, event.currentTarget.checked);
            }}
          />
        );
  
      case "Fecha":
        const dateDisplayValue = field.validate_with && storedDisplayValue
          ? new Date(storedDisplayValue)
          : (row[field.name] ? new Date(row[field.name]) : null);
          
        return wrapWithTooltip(
          <DateInput
            {...commonProps}
            value={dateDisplayValue}
            locale="es"
            valueFormat="DD/MM/YYYY"
            onChange={(date) => {
              if (field.validate_with && storedDisplayValue) clearDisplayValue();
              inputChange(rowIndex, field.name, date);
            }}
          />
        );
  
      default:
        // Si el campo tiene validador y hay una descripción guardada, mostrarla
        const defaultDisplayValue = field.validate_with && storedDisplayValue
          ? storedDisplayValue
          : (row[field.name] === null ? "" : row[field.name]);
          
        return wrapWithTooltip(
          <TextInput
            {...commonProps}
            value={defaultDisplayValue}
            onChange={(e) => {
              // Si el usuario edita manualmente, limpiar la descripción guardada
              if (field.validate_with && storedDisplayValue) clearDisplayValue();
              inputChange(rowIndex, field.name, e.target.value);
            }}
          />
        );
    }
  };

  const renderCellContent = (value: any) => {
    // Manejar valores undefined, null o cadenas vacías
    if (value === undefined || value === null || value === '') {
      return <Text size="sm" c="dimmed">Sin datos</Text>;
    }

    // Manejar booleanos
    if (typeof value === "boolean") {
      return value ? <Text size="sm">Sí</Text> : <Text size="sm">No</Text>;
    }

    // Manejar objetos
    if (typeof value === "object" && value !== null) {
      // Si es un array, mostrar elementos separados por comas
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return <Text size="sm">-</Text>;
        }
        const arrayText = value.map(item => {
          if (typeof item === 'object' && item !== null) {
            return item.text || item.hyperlink || JSON.stringify(item);
          }
          return item;
        }).join(', ');
        return <Text size="sm" lineClamp={2}>{arrayText}</Text>;
      }

      // Si tiene un campo .text, mostramos solo ese
      if (typeof value.text === "string") {
        return <Text size="sm" lineClamp={2}>{value.text}</Text>;
      }

      // Por defecto, convertir a JSON
      const jsonString = JSON.stringify(value);
      return <Text size="sm" lineClamp={2}>{jsonString}</Text>;
    }

    // Para valores simples
    const stringValue = (value ?? "").toString();
    return <Text size="sm" lineClamp={2}>{stringValue}</Text>;
  };

  const renderRowSource = (source?: QrRowSource | null) => {
    if (!source) return <Text size="xs" c="dimmed">Manual</Text>;

    const senderText = source.senderName || source.senderEmail;
    const tooltipLabel = senderText
      ? `Enviado por ${senderText}`
      : `Codigo ${source.dependencyCode}`;

    // Determinar el badge según el origen
    let badgeColor = "gray";
    let badgeText = "Manual";
    
    if (source.fromQr) {
      badgeColor = "orange";
      badgeText = "QR";
    } else if (source.fromExcel) {
      badgeColor = "green";
      badgeText = "Excel";
    } else if (source.fromOnline) {
      badgeColor = "blue";
      badgeText = "En línea";
    }

    return (
      <Tooltip label={tooltipLabel} withArrow>
        <div>
          <Badge size="xs" color={badgeColor} variant="light" mb={2}>{badgeText}</Badge>
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
                      {field.name} {fieldIsRequired(field) && <Text span c="red">*</Text>}
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
                  {fields.map((field) => {
                    const cellError = !readOnly ? errors[getScopedFieldKey(field.name, sheetName)]?.[rowIndex] : undefined;
                    return (
                    <Table.Td key={field.name} style={{ minWidth: '250px', background: cellError ? 'var(--mantine-color-red-0)' : undefined }}>
                      <Group align="center">
                        {renderInputField(field, row, rowIndex, onInputChange, readOnly, sheetName)}
                      </Group>
                    </Table.Td>
                  );
                  })}
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
  // Mostrar ícono de lectura en hojas de otros productores (independiente del flag shared)
  const templateSharedUI = allSheets.length > 0;

  return (
    <Container size="xl">
      <Title ta="center" mb="md">{`Completar Plantilla: ${publishedTemplateName}`}</Title>



      {useSheets ? (
        <Tabs value={activeSheet} onChange={setActiveSheet} keepMounted={false}>
          <Tabs.List mb="md">
            {allSheets.map(sheet => {
              const canEdit = accessibleSheetNames.has(sheet.name);
              const fieldsWithErrors = (sheet.fields || []).filter(f => (errors[getScopedFieldKey(f.name, sheet.name)]?.length ?? 0) > 0);
              const sheetHasErrors = canEdit && fieldsWithErrors.length > 0;
              return (
                <Tabs.Tab
                  key={sheet.name}
                  value={sheet.name}
                  fw={600}
                  leftSection={!canEdit ? (templateSharedUI ? <IconEye size={13} /> : <IconLock size={13} />) : undefined}
                  color={sheetHasErrors ? "red" : (!canEdit ? (templateSharedUI ? "blue" : "gray") : undefined)}
                  rightSection={
                    sheetHasErrors ? (
                      <Badge
                        size="sm"
                        color="red"
                        variant="filled"
                        circle
                        style={{ minWidth: 20, height: 20, fontSize: 11, fontWeight: 700 }}
                      >
                        {fieldsWithErrors.length}
                      </Badge>
                    ) : undefined
                  }
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
        <Button
          color="gray"
          variant="outline"
          onClick={handleSave}
          leftSection={<IconDeviceFloppy size={16} />}
          loading={saving}
          disabled={loading}
        >
          Guardar
        </Button>
        <Group>
          {!fromUploaded && (
            <Button
              onClick={handleSubmit}
              rightSection={<IconSend size={16}/>}
              loading={loading}
            >
              Enviar
            </Button>
          )}
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
              clearFieldError(activeFieldName);
            }

            if (description) {
              const displayKey = getScopedFieldKey(activeFieldName, activeSheetForValidator);
              const updatedDisplayValues = { ...displayValues };
              if (!updatedDisplayValues[activeRowIndex]) {
                updatedDisplayValues[activeRowIndex] = {};
              }
              updatedDisplayValues[activeRowIndex][displayKey] = description;
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
