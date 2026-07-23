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
  Box,
  Divider
} from "@mantine/core";
import { IconPlus, IconTrash, IconEye, IconCancel, IconDeviceFloppy, IconLock, IconInfoCircle, IconSend } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { ValidatorModal } from "../../../../components/Validators/ValidatorModal";
import {
  buildSelectOptionsFromStrings,
  extractDropdownOptionsFromComment,
  resolveStoredSelectValue,
} from "../../../../utils/validatorOptions";
import { isBlankRequiredValue } from "../../../../utils/requiredFields";
import { getSemesterFromPeriodName, getYearFromPeriodName } from "../../../../utils/periodUtils";
import { formatTemplateDateValue } from "../../../../utils/templateUtils";

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
  skip_comment_validation?: boolean;
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
  source?: 'excel' | 'qr' | 'online' | 'manual';
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

const extractValidatorDisplayValues = (validator: any): string[] => {
  if (!validator?.columns?.length) return [];
  const idCol = validator.columns.find((c: any) => c.is_validator) ?? validator.columns[0];
  if (!idCol?.values?.length) return [];
  const descCol = validator.columns.find(
    (c: any) => !c.is_validator && /desc/i.test(c.name)
  ) ?? validator.columns.find((c: any) => !c.is_validator);
  return idCol.values.map((v: any, i: number) => {
    const id = String(v ?? '').trim();
    const desc = descCol ? String(descCol.values[i] ?? '').trim() : '';
    return desc ? `${id} - ${desc}` : id;
  }).filter(Boolean);
};

const fieldIsRequired = (field: Field, skipComment = false): boolean => {
  if (skipComment) return false;
  if (field.required) return true;
  const c = field.comment?.toLowerCase() ?? "";
  for (const w of ["obligatorio", "obligatario"]) {
    if (c.includes(w) && !c.includes(`no ${w}`) && !new RegExp(`${w}\\s+si\\b`).test(c)) return true;
  }
  return false;
};

const normalizeExcelStoredValue = (value: any): any => {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") || trimmed.startsWith("[")) &&
      /"?(richText|hyperlink|text|result|formula|value)"?\s*:/.test(trimmed)
    ) {
      try {
        return normalizeExcelStoredValue(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }

  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map((item) => normalizeExcelStoredValue(item));
  }

  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((item: any) => normalizeExcelStoredValue(item?.text ?? "")).join("");
    }
    if (value.text !== undefined || value.hyperlink !== undefined) {
      return normalizeExcelStoredValue(value.text ?? value.hyperlink ?? "");
    }
    if (value.result !== undefined || value.formula !== undefined) {
      return normalizeExcelStoredValue(value.result ?? value.formula ?? "");
    }
    if (value.value !== undefined) {
      return normalizeExcelStoredValue(value.value);
    }
    if (value.$numberInt !== undefined || value.$numberDouble !== undefined) {
      return value.$numberInt ?? value.$numberDouble;
    }
    return String(value);
  }

  return value;
};

const normalizeFieldRequired = (field: Field, skipComment = false): Field => ({
  ...field,
  required: fieldIsRequired(field, skipComment),
});

const normalizeSheetRequired = (sheet: WorkbookSheet, skipComment = false): WorkbookSheet => ({
  ...sheet,
  fields: (sheet.fields || []).map((f) => normalizeFieldRequired(f, skipComment)),
});

const normalizeTemplateRequired = (template: Template): Template => {
  const skip = Boolean(template.skip_comment_validation);
  return {
    ...template,
    fields: (template.fields || []).map((f) => normalizeFieldRequired(f, skip)),
    workbook_sheets: (template.workbook_sheets || []).map((s) => normalizeSheetRequired(s, skip)),
  };
};

const ProducerTemplateFormPage = ({ params }: { params: { id_template: string } }) => {
  const { id_template } = params;
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUploaded = searchParams?.get('from') === 'uploaded';
  // Detectar si viene de /public/form/ (QR) o /producer/templates/form/ (en línea)
  const isFromPublicQr = typeof window !== 'undefined' && window.location.pathname.includes('/public/form/');
  const [publishedTemplateName, setPublishedTemplateName] = useState<string>("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [allSheets, setAllSheets] = useState<WorkbookSheet[]>([]);
  const [accessibleSheets, setAccessibleSheets] = useState<WorkbookSheet[]>([]);
  // Evita que una hoja asignada al productor se muestre como "solo lectura"
  // mientras aun no se resuelve a que hojas tiene acceso (ver fetchTemplate).
  const [permissionsReady, setPermissionsReady] = useState(false);
  // Cuantas filas mostrar por tabla (clave = identificador de la tabla). Con
  // hojas de miles de filas (p.ej. cargas de Excel de otra dependencia),
  // renderizar TODO de una vez vuelve la pagina muy lenta y bloquea el scroll;
  // se muestran de a poco y un boton revela mas.
  const [tableVisibleRows, setTableVisibleRows] = useState<Record<string, number>>({});
  const TABLE_ROWS_PAGE_SIZE = 50;
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  // rows por hoja: { sheetName: rows[] }
  const [sheetRows, setSheetRows] = useState<Record<string, Record<string, any>[]>>({});
  // rows para plantillas sin hojas (legacy)
  const [rows, setRows] = useState<Record<string, any>[]>([{}]);
  const [rowSources, setRowSources] = useState<(QrRowSource | null)[]>([]);
  const [sheetRowSources, setSheetRowSources] = useState<Record<string, (QrRowSource | null)[]>>({});
  const [userSource, setUserSource] = useState<QrRowSource | null>(null);
  // Rastrear el origen detectado de los datos (QR, Excel, Online)
  const [detectedOrigin, setDetectedOrigin] = useState<{ source: 'excel' | 'qr' | 'online' | 'manual' | null; senderInfo?: { sender_email?: string; sender_name?: string } }>({ source: null });
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
  const [templatePeriodName, setTemplatePeriodName] = useState<string>("");
  const [hasQrDraft, setHasQrDraft] = useState(false);
  const [activeSheetForValidator, setActiveSheetForValidator] = useState<string | null>(null);
  const [sharedSheetsData, setSharedSheetsData] = useState<Record<string, Record<string, any>[]>>({});
  // El productor encargado de la plantilla ve y puede editar, ademas de lo
  // suyo, lo enviado por las demas dependencias (tenga o no activo "shared").
  // Se agrupa por dependencia -> hoja para poder guardar cada dependencia por separado.
  const [isEncargadoTemplate, setIsEncargadoTemplate] = useState(false);
  const OTHER_PRODUCERS_FLAT_KEY = "__flat__";
  const [otherProducersData, setOtherProducersData] = useState<
    Record<string, Record<string, { rows: Record<string, any>[]; sources: (QrRowSource | null)[] }>>
  >({});
  const [otherProducersDepNames, setOtherProducersDepNames] = useState<Record<string, string>>({});
  const [dirtyOtherProducerDeps, setDirtyOtherProducerDeps] = useState<Set<string>>(new Set());

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

  const getDraftRowSource = (draft: QrDraftEntry): QrRowSource => {
    // Prioridad 1: Si el draft tiene campo source, usarlo
    let fromQr = false;
    let fromExcel = false;
    let fromOnline = false;

    if (draft.source) {
      if (draft.source === 'qr') {
        fromQr = true;
      } else if (draft.source === 'excel') {
        fromExcel = true;
      } else if (draft.source === 'online') {
        fromOnline = true;
      }
      // Si source === 'manual', quedará todo false (manual)
    } else {
      // Prioridad 2: Fallback para drafts sin source - inferir por sender info
      if (draft.sender_name && draft.sender_email && draft.sender_email !== session?.user?.email) {
        // Si hay info de remitente diferente al usuario actual → QR
        fromQr = true;
      } else {
        // Si no hay info de remitente o es el usuario actual → Online
        fromOnline = true;
      }
    }

    return {
      dependencyCode: draft.dependency_code || draft.dependency,
      dependencyName: draft.dependency_name || draft.dependency,
      senderName: draft.sender_name,
      senderEmail: draft.sender_email,
      fromQr,
      fromExcel,
      fromOnline,
    };
  };

  const getLoadedRowSource = (entry: ProducerLoadedEntry): QrRowSource => {
    const sender = entry.send_by || {};
    const dependencyCode = getEntryDependencyCode(entry);

    // Determinar el origen con fallback para datos viejos
    let fromQr = false;
    let fromExcel = false;
    let fromOnline = false;
    
    if (entry.source === 'excel') {
      fromExcel = true;
    } else if (entry.source === 'qr') {
      fromQr = true;
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
        const nextValue = normalizeExcelStoredValue(fieldData.values?.[rowIndex] ?? null);
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

  // Agrupa, por dependencia y luego por hoja (o en un solo bloque si la
  // plantilla no usa hojas), las filas ya enviadas por dependencias DISTINTAS
  // a la del usuario actual. Se agrupa por dependencia (no todo mezclado) para
  // poder guardar despues los cambios de cada una por separado.
  const buildOtherProducersData = (
    loadedData: ProducerLoadedEntry[],
    ownDepCodes: string[],
    wbSheets: WorkbookSheet[]
  ) => {
    const foreignEntries = loadedData.filter((entry) =>
      !ownDepCodes.includes(getEntryDependencyCode(entry)) && entry.filled_data?.length
    );

    const byDep: Record<string, Record<string, { rows: Record<string, any>[]; sources: (QrRowSource | null)[] }>> = {};
    const depNames: Record<string, string> = {};
    if (!foreignEntries.length) return { byDep, depNames };

    foreignEntries.forEach((entry) => {
      const depCode = getEntryDependencyCode(entry);
      if (!depCode) return;
      depNames[depCode] = entry.dependency_name || depCode;
      if (!byDep[depCode]) byDep[depCode] = {};

      const addToSheet = (sheetKey: string, sheetFilled: FilledFieldEntry[]) => {
        const built = buildRowsAndSourcesFromLoadedEntry(entry, sheetFilled);
        const existing = byDep[depCode][sheetKey] || { rows: [], sources: [] };
        byDep[depCode][sheetKey] = {
          rows: [...existing.rows, ...built.rows],
          sources: [...existing.sources, ...built.sources],
        };
      };

      if (wbSheets.length > 0) {
        const hasSheetTaggedFields = entry.filled_data.some((fd) => getDraftFieldSheetName(fd));
        let legacyCursor = 0;

        wbSheets.forEach((sheet) => {
          const sheetFields = sheet.fields || [];
          const sheetFieldNames = new Set(sheetFields.map((f: Field) => f.name));
          let sheetFilled: FilledFieldEntry[] = [];

          if (hasSheetTaggedFields) {
            sheetFilled = entry.filled_data.filter((fd) => {
              const fieldSheetName = getDraftFieldSheetName(fd);
              return fieldSheetName === sheet.name ||
                fieldSheetName?.trim?.().toLowerCase() === sheet.name?.trim?.().toLowerCase();
            });
          } else {
            sheetFilled = entry.filled_data
              .slice(legacyCursor, legacyCursor + sheetFields.length)
              .filter((fd) => sheetFieldNames.has(fd.field_name));
          }

          if (!hasSheetTaggedFields && sheetFilled.length) legacyCursor += sheetFields.length;
          if (sheetFilled.length) addToSheet(sheet.name, sheetFilled);
        });
      } else {
        addToSheet(OTHER_PRODUCERS_FLAT_KEY, entry.filled_data);
      }
    });

    return { byDep, depNames };
  };

  const fetchTemplate = async () => {
    setPermissionsReady(false);
    setDirtyOtherProducerDeps(new Set());
    try {
      const response = await axios.get<PublishedTemplateResponse>(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${id_template}`
      );
      setPublishedTemplateName(response.data.name);
      const templateWithFlag = {
        ...response.data.template,
        skip_comment_validation: response.data.template.skip_comment_validation ||
          response.data.name === 'Docentes_IES' ||
          response.data.template?.name === 'Docentes_IES',
      };
      const normalizedTemplate = normalizeTemplateRequired(templateWithFlag);
      setTemplate(normalizedTemplate);

      // Cargar datos compartidos de otros productores
      if (response.data.shared_sheets_data) {
        setSharedSheetsData(response.data.shared_sheets_data);
      }

      // Usuario + catalogo de dependencias: se obtienen UNA sola vez aqui (en
      // paralelo) y se reutilizan mas abajo, en vez de repetir /users y
      // /dependencies/all/:email por cada bloque (encargado, borradores, datos
      // ya enviados, hojas accesibles). Esa duplicacion era la principal causa
      // de que la carga de la plantilla fuera lenta.
      let sessionUserData: any = null;
      let sessionAllDeps: any[] = [];
      let sessionUserDepCodes: string[] = [];
      let sessionUserDepIds: string[] = [];
      if (session?.user?.email) {
        try {
          const [userRes, depsRes] = await Promise.all([
            axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users`, { params: { email: session.user.email } }),
            axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all/${encodeURIComponent(session.user.email)}`),
          ]);
          sessionUserData = userRes.data;
          sessionAllDeps = depsRes.data || [];
          sessionUserDepCodes = [sessionUserData?.dep_code, ...(sessionUserData?.additional_dependencies || [])].filter(Boolean);
          sessionUserDepIds = sessionAllDeps
            .filter((d: any) => sessionUserDepCodes.includes(d.dep_code))
            .map((d: any) => String(d._id));
        } catch { /* si falla, se continua sin datos de usuario/dependencias */ }
      }

      // Cargar todas las hojas y determinar cuáles son editables
      const wbSheets = normalizedTemplate.workbook_sheets || [];

      const resolvedPeriodName =
        typeof response.data.publishedTemplate?.period === "object"
          ? response.data.publishedTemplate.period?.name
          : undefined;
      const prefilledYear = getYearFromPeriodName(resolvedPeriodName) ?? new Date().getFullYear();
      const prefilledSemester = getSemesterFromPeriodName(resolvedPeriodName) ?? (new Date().getMonth() < 6 ? 1 : 2);

      // Conjunto de hojas accesibles para este productor — usado también al cargar borradores
      let editableSheetNames = new Set<string>();
      // IDs de dependencias del usuario — usados para verificar si es productor encargado
      let currentUserDepIds: string[] = [];
      if (wbSheets.length > 0) {
        setAllSheets(wbSheets);
        let editable: WorkbookSheet[] = wbSheets;
        let userSrc: QrRowSource | null = null;
        if (sessionUserData) {
          currentUserDepIds = sessionUserDepIds;
          const primaryDep = sessionAllDeps.find((d: any) => d.dep_code === sessionUserData.dep_code);
          userSrc = {
            dependencyCode: sessionUserData.dep_code || '',
            dependencyName: primaryDep?.name || sessionUserData.dep_code || '',
            senderName: sessionUserData.name || session?.user?.name || undefined,
            senderEmail: session?.user?.email || null,
          };
          setUserSource(userSrc);
          editable = wbSheets.filter((sheet: WorkbookSheet) => {
            if (!sheet.fields?.length) return false;
            if (!sheet.producers?.length) return true;
            return sheet.producers.some((p: string) => sessionUserDepIds.includes(p.toString()));
          });
        }

        editableSheetNames = new Set(editable.map((s: WorkbookSheet) => s.name));
        setAccessibleSheets(editable);
        setActiveSheet(wbSheets[0].name);
        const sharedData = response.data.shared_sheets_data || {};
        const initialRows: Record<string, Record<string, any>[]> = {};
        const initialSources: Record<string, (QrRowSource | null)[]> = {};
        editable.forEach((s: WorkbookSheet) => {
          // Empieza sin filas: el usuario debe darle "Agregar Fila" para
          // llenar un registro. Antes se mostraba una fila ya "lista" con
          // año/semestre precargados, lo que llevaba a enviar sin darse
          // cuenta de que faltaba llenar el resto de campos.
          initialRows[s.name] = [];
          initialSources[s.name] = [];
        });
        // Convierte filas ya construidas por el backend (shared_sheets_data,
        // cada una con __origin__) en {rows, sources} para las tablas. No
        // vuelve a transponer datos: eso ya lo hizo el backend una sola vez.
        const rawSharedRowsToRowsAndSources = (rawRows: any[]) => ({
          rows: rawRows.map(({ __origin__, ...rest }) => rest),
          sources: rawRows.map((row) =>
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
          ),
        });
        const showSharedData = Boolean(normalizedTemplate.shared);

        // Hojas no editables: si la plantilla tiene "shared" activo, mostrar los
        // datos ya enviados por otros productores (lectura); si no, quedan vacías.
        wbSheets
          .filter((s: WorkbookSheet) => !editable.some((e: WorkbookSheet) => e.name === s.name))
          .forEach((s: WorkbookSheet) => {
            const rawRows: any[] = showSharedData ? (sharedData[s.name] || []) : [];
            if (rawRows.length) {
              const built = rawSharedRowsToRowsAndSources(rawRows);
              initialRows[s.name] = built.rows;
              initialSources[s.name] = built.sources;
            } else {
              initialRows[s.name] = [{}];
              initialSources[s.name] = [null];
            }
          });

        // Datos de OTRAS dependencias, agrupados por dependencia (mismo estado
        // y handlers de guardado que usa el productor encargado). Se permite
        // editarlos en las hojas donde el usuario SI tiene acceso (ver render
        // mas abajo), pero se incluyen TODAS las hojas de cada dependencia
        // ajena — no solo las editables por el usuario actual — para no
        // perder su informacion al guardar (el guardado reemplaza por hoja,
        // solo con lo que efectivamente se envia). Construido de forma barata
        // a partir de shared_sheets_data, que el backend ya transpuso.
        if (showSharedData) {
          const byDep: Record<string, Record<string, { rows: Record<string, any>[]; sources: (QrRowSource | null)[] }>> = {};
          const depNames: Record<string, string> = {};
          wbSheets.forEach((s: WorkbookSheet) => {
            const rawRows: any[] = (sharedData[s.name] || []).filter((row: any) => {
              const code = row?.__origin__?.code;
              return Boolean(code) && !sessionUserDepCodes.includes(code);
            });
            rawRows.forEach((row: any) => {
              const origin = row.__origin__;
              if (!byDep[origin.code]) byDep[origin.code] = {};
              if (!depNames[origin.code]) depNames[origin.code] = origin.depName || origin.code;
              if (!byDep[origin.code][s.name]) byDep[origin.code][s.name] = { rows: [], sources: [] };
              const { __origin__, ...rest } = row;
              byDep[origin.code][s.name].rows.push(rest);
              byDep[origin.code][s.name].sources.push({
                dependencyCode: origin.code,
                dependencyName: origin.depName || origin.code,
                senderName: origin.senderName,
                senderEmail: origin.senderEmail,
                fromQr: origin.fromQr,
                fromExcel: origin.fromExcel,
                fromOnline: origin.fromOnline,
              });
            });
          });
          setOtherProducersData(byDep);
          setOtherProducersDepNames(depNames);
        }

        setSheetRows(initialRows);
        setSheetRowSources(initialSources);
      } else {
        setRowSources([]);
        setSheetRowSources({});
      }
      setPermissionsReady(true);
      const periodId =
        typeof response.data.publishedTemplate?.period === "string"
          ? response.data.publishedTemplate.period
          : response.data.publishedTemplate?.period?._id || "";
      setTemplatePeriodId(periodId);
      setTemplatePeriodName(resolvedPeriodName || "");

      // Pre-cargar datos ya enviados para que la edicion en linea conserve la informacion cargada.
      if (sessionUserData) {
        try {
          const allDepCodes: string[] = sessionUserDepCodes;
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
                    // Un envio previo sin valores reales (todos los campos en
                    // blanco, p.ej. por una fila borrada antes de enviar) NO
                    // debe sobreescribir la fila inicial precargada (con
                    // año/semestre por defecto) con una fila completamente
                    // vacia: eso hacia que la hoja se viera "en blanco" en
                    // cada visita y perpetuaba el envio vacio.
                    const hasRealValue = built.rows.some((row) =>
                      Object.values(row).some((v) => !isBlankQrValue(v))
                    );
                    if (hasRealValue) {
                      loadedSheetRows[sheet.name] = [...(loadedSheetRows[sheet.name] || []), ...built.rows];
                      loadedSheetSources[sheet.name] = [...(loadedSheetSources[sheet.name] || []), ...built.sources];
                      if (!firstLoadedSheetName) firstLoadedSheetName = sheet.name;
                    }
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
      if (qrDrafts.length && sessionUserData) {
        try {
          const allDepCodes: string[] = sessionUserDepCodes;
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

                  // Solo cargar filas de hojas accesibles; las hojas read-only usan shared_sheets_data.
                  // Un borrador sin valores reales (todos los campos en blanco, p.ej.
                  // un QR escaneado sin llenar nada, o una fila borrada antes de
                  // guardar) NO debe mostrarse como fila: obliga al usuario a darle
                  // "Agregar Fila" el mismo, en vez de ver una fila vacia ya puesta.
                  if (isAccessible && sheetFilled.length) {
                    const built = buildRowsAndSourcesFromDraft(draft, sheetFilled);
                    const hasRealValue = built.rows.some((row) =>
                      Object.values(row).some((v) => !isBlankQrValue(v))
                    );
                    if (hasRealValue) {
                      draftSheetRows[sheet.name] = [...(draftSheetRows[sheet.name] || []), ...built.rows];
                      draftSheetSources[sheet.name] = [...(draftSheetSources[sheet.name] || []), ...built.sources];
                      if (!firstDraftSheetName) firstDraftSheetName = sheet.name;
                    }
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
                
                // Detectar origen del primer draft para preservarlo
                if (draftsWithData.length > 0) {
                  const firstDraft = draftsWithData[0];
                  if (firstDraft.source === 'excel') {
                    setDetectedOrigin({ source: 'excel' });
                  } else if (firstDraft.source === 'qr') {
                    setDetectedOrigin({ 
                      source: 'qr', 
                      senderInfo: {
                        sender_email: firstDraft.sender_email || undefined,
                        sender_name: firstDraft.sender_name || undefined,
                      }
                    });
                  } else if (firstDraft.source === 'online') {
                    setDetectedOrigin({ source: 'online' });
                  } else if (firstDraft.sender_name && firstDraft.sender_email) {
                    // Fallback: inferir QR por sender info
                    setDetectedOrigin({ 
                      source: 'qr', 
                      senderInfo: {
                        sender_email: firstDraft.sender_email,
                        sender_name: firstDraft.sender_name,
                      }
                    });
                  } else {
                    setDetectedOrigin({ source: 'online' });
                  }
                }
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
                
                // Detectar origen del primer draft para preservarlo
                if (draftsWithData.length > 0) {
                  const firstDraft = draftsWithData[0];
                  if (firstDraft.source === 'excel') {
                    setDetectedOrigin({ source: 'excel' });
                  } else if (firstDraft.source === 'qr') {
                    setDetectedOrigin({ 
                      source: 'qr', 
                      senderInfo: {
                        sender_email: firstDraft.sender_email || undefined,
                        sender_name: firstDraft.sender_name || undefined,
                      }
                    });
                  } else if (firstDraft.source === 'online') {
                    setDetectedOrigin({ source: 'online' });
                  } else if (firstDraft.sender_name && firstDraft.sender_email) {
                    // Fallback: inferir QR por sender info
                    setDetectedOrigin({ 
                      source: 'qr', 
                      senderInfo: {
                        sender_email: firstDraft.sender_email,
                        sender_name: firstDraft.sender_name,
                      }
                    });
                  } else {
                    setDetectedOrigin({ source: 'online' });
                  }
                }
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

      // El productor encargado de esta plantilla (misma dependencia asignada
      // en "responsible_producers") ve, ademas de sus propios datos, lo ya
      // enviado por TODAS las demas dependencias — tenga o no activo "shared".
      if (sessionUserData) {
        try {
          const ownDepCodes: string[] = sessionUserDepCodes;
          const allDepsForEncargado: any[] = sessionAllDeps;
          const ownDepIds = sessionUserDepIds;

          const responsibleIdsForTemplate: string[] = (
            (response.data.publishedTemplate as any)?.responsible_producers || []
          ).map((id: any) => String(id));
          const encargado = responsibleIdsForTemplate.length > 0 &&
            ownDepIds.some((id) => responsibleIdsForTemplate.includes(id));
          setIsEncargadoTemplate(encargado);

          if (encargado) {
            const loadedData = response.data.publishedTemplate?.loaded_data || [];
            const { byDep, depNames } = buildOtherProducersData(
              loadedData,
              ownDepCodes,
              normalizedTemplate.workbook_sheets || []
            );
            // dependency_name no siempre viene guardado en loaded_data; se
            // resuelve el nombre real desde el catalogo de dependencias, tanto
            // para el encabezado de la seccion como para la columna "Origen"
            // de cada fila.
            const depNameByCode = new Map(allDepsForEncargado.map((d: any) => [d.dep_code, d.name]));
            const byDepWithNames = Object.fromEntries(
              Object.entries(byDep).map(([code, sheets]) => {
                const resolvedName = depNameByCode.get(code) || depNames[code] || code;
                const sheetsWithNames = Object.fromEntries(
                  Object.entries(sheets).map(([sheetKey, sheetData]) => [
                    sheetKey,
                    {
                      ...sheetData,
                      sources: sheetData.sources.map((source) =>
                        source ? { ...source, dependencyName: resolvedName } : source
                      ),
                    },
                  ])
                );
                return [code, sheetsWithNames];
              })
            );
            setOtherProducersData(byDepWithNames);
            const resolvedDepNames = Object.fromEntries(
              Object.keys(byDep).map((code) => [code, depNameByCode.get(code) || depNames[code] || code])
            );
            setOtherProducersDepNames(resolvedDepNames);
          }
        } catch { /* si falla, simplemente no se muestra la informacion de otros productores */ }
      }

      // Recolectar campos de top-level + todos los workbook_sheets
      const allTemplateFields: Field[] = [
        ...(normalizedTemplate.fields || []),
        ...((normalizedTemplate.workbook_sheets || []).flatMap((s: WorkbookSheet) => s.fields || [])),
      ];

      // Obtener datos del validador y sus opciones en una sola llamada por campo
      const validatorFetchPromises = allTemplateFields.map(async (field) => {
        if (!field.validate_with) return { fieldName: field.name, exists: false, validatorValues: [] as string[] };
        try {
          let validatorId = '';
          if (typeof field.validate_with === 'string') {
            const parts = field.validate_with.split(' - ');
            validatorId = parts.length >= 2 ? parts[parts.length - 1].trim() : field.validate_with.trim();
          } else {
            validatorId = (field.validate_with as any).id;
          }
          if (!validatorId) return { fieldName: field.name, exists: false, validatorValues: [] as string[] };

          const validatorResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id`, {
            params: { id: validatorId, periodId },
          });
          const validator = validatorResponse.data.validator;
          const values = extractValidatorDisplayValues(validator);
          return { fieldName: field.name, exists: !!validator, validatorValues: values };
        } catch {
          return { fieldName: field.name, exists: false, validatorValues: [] as string[] };
        }
      });

      const validatorFetchResults = await Promise.all(validatorFetchPromises);
      const validatorExistsMap: Record<string, boolean> = {};
      const validatorValuesMap: Record<string, string[]> = {};
      validatorFetchResults.forEach(({ fieldName, exists, validatorValues }) => {
        validatorExistsMap[fieldName] = exists;
        validatorValuesMap[fieldName] = validatorValues;
      });
      setValidatorExists(validatorExistsMap);

      // Opciones: primero el comentario, luego dropdown_options; el validador
      // conectado solo se usa como respaldo si el campo no trae opciones ahí. Sin combinar.
      const allValidatorOptions = allTemplateFields.map((field) => {
        const fromComment = extractDropdownOptionsFromComment(field.comment);
        let opts: string[];
        if (fromComment.length > 0) {
          opts = fromComment;
        } else if (Array.isArray(field.dropdown_options) && field.dropdown_options.length > 0) {
          opts = field.dropdown_options.map(o => String(o || '').trim()).filter(Boolean);
        } else {
          opts = field.validate_with ? (validatorValuesMap[field.name] || []) : [];
        }
        return { fieldName: field.name, options: buildSelectOptionsFromStrings(opts), isMultiple: field.multiple };
      });

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
    // Si el usuario edita datos existentes, cambiar origen a "en línea"
    if (detectedOrigin.source && detectedOrigin.source !== 'online') {
      setDetectedOrigin({ source: 'online' });
    }
    clearFieldError(fieldName, sheetName);
  };

  const addSheetRow = (sheetName: string) => {
    const year = getYearFromPeriodName(templatePeriodName) ?? new Date().getFullYear();
    const semester = getSemesterFromPeriodName(templatePeriodName) ?? (new Date().getMonth() < 6 ? 1 : 2);
    const sheet = accessibleSheets.find(s => s.name === sheetName);
    const prefilled: Record<string, any> = {};
    if (sheet?.fields?.some(f => f.name.toUpperCase() === 'AÑO')) prefilled['AÑO'] = String(year);
    if (sheet?.fields?.some(f => f.name.toUpperCase() === 'SEMESTRE')) prefilled['SEMESTRE'] = semester;
    setSheetRows(prev => ({ ...prev, [sheetName]: [...(prev[sheetName] || []), prefilled] }));
    setSheetRowSources(prev => ({ ...prev, [sheetName]: [...(prev[sheetName] || []), userSource] }));
    // NO resetear hasQrOrigin - el backend preservará el origen original
  };

  // ── Edicion de datos de OTRAS dependencias (solo para el productor encargado) ──
  const markOtherProducerAsDirty = (depCode: string) => {
    setDirtyOtherProducerDeps((previous) => {
      const next = new Set(previous);
      next.add(depCode);
      return next;
    });
  };

  const updateOtherProducerCell = (depCode: string, sheetKey: string, rowIdx: number, fieldName: string, value: any) => {
    markOtherProducerAsDirty(depCode);
    setOtherProducersData(prev => {
      const depData = prev[depCode] || {};
      const sheetData = depData[sheetKey] || { rows: [], sources: [] };
      const rows = [...sheetData.rows];
      rows[rowIdx] = { ...rows[rowIdx], [fieldName]: value === "" ? null : value };
      return { ...prev, [depCode]: { ...depData, [sheetKey]: { ...sheetData, rows } } };
    });
  };

  const addOtherProducerRow = (depCode: string, sheetKey: string) => {
    markOtherProducerAsDirty(depCode);
    setOtherProducersData(prev => {
      const depData = prev[depCode] || {};
      const sheetData = depData[sheetKey] || { rows: [], sources: [] };
      return {
        ...prev,
        [depCode]: {
          ...depData,
          [sheetKey]: { rows: [...sheetData.rows, {}], sources: [...sheetData.sources, null] },
        },
      };
    });
  };

  const removeOtherProducerRow = (depCode: string, sheetKey: string, rowIdx: number) => {
    markOtherProducerAsDirty(depCode);
    setOtherProducersData(prev => {
      const depData = prev[depCode] || {};
      const sheetData = depData[sheetKey] || { rows: [], sources: [] };
      return {
        ...prev,
        [depCode]: {
          ...depData,
          [sheetKey]: {
            rows: sheetData.rows.filter((_, i) => i !== rowIdx),
            sources: sheetData.sources.filter((_, i) => i !== rowIdx),
          },
        },
      };
    });
  };

  // Guarda los cambios de UNA dependencia ajena. El encargado envia TODAS sus
  // hojas (acceso total); un productor normal solo envia las hojas donde EL
  // tiene permiso de edicion (ver filtro mas abajo) — el backend fusiona por
  // hoja, asi que las demas hojas de esa dependencia no se pierden aunque no
  // se incluyan aqui. Sin notificar individualmente (se llama en lote desde
  // los botones generales "Guardar"/"Enviar").
  const saveOneOtherProducerData = async (depCode: string, asDraft: boolean) => {
    const depData = otherProducersData[depCode];
    if (!depData) return;
    if (allSheets.length > 0) {
      // Un productor normal (no encargado) solo puede editar, en nombre de
      // otra dependencia, las hojas donde SU PROPIA dependencia esta asignada
      // (el backend valida exactamente esto). otherProducersData incluye
      // TODAS las hojas de la dependencia ajena para no perder su informacion
      // al mostrarla, pero aqui solo se envian las que el usuario actual
      // puede editar — si se enviaran las demas, el backend rechazaria toda
      // la solicitud. El encargado si conserva acceso a todas las hojas.
      const accessibleSheetNamesForSave = new Set(accessibleSheets.map((s) => s.name));
      const sheetEntries = isEncargadoTemplate
        ? Object.entries(depData)
        : Object.entries(depData).filter(([sheetKey]) => accessibleSheetNamesForSave.has(sheetKey));
      if (!sheetEntries.length) return;
      const sheetsPayload = sheetEntries.map(([sheetKey, sheetData]) => ({
        name: sheetKey,
        data: sheetData.rows,
      }));
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
        email: session?.user?.email,
        pubTem_id: id_template,
        sheetsData: sheetsPayload,
        asDraft,
        onBehalfOfDependency: depCode,
        // El encargado es un rol de confianza que corrige datos ya enviados
        // (a veces originados en Excel con validacion flexible); se omite la
        // validacion estricta de validadores para no bloquear correcciones
        // menores por reglas que la carga original no exigia.
        bypassValidation: true,
      });
    } else {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
        email: session?.user?.email,
        pubTem_id: id_template,
        data: depData[OTHER_PRODUCERS_FLAT_KEY]?.rows || [],
        asDraft,
        onBehalfOfDependency: depCode,
        bypassValidation: true,
      });
    }
  };

  // Guarda TODAS las dependencias ajenas con datos cargados. Se invoca desde
  // los botones generales "Guardar" y "Enviar" — no hay un boton separado por
  // dependencia.
  const saveAllOtherProducersData = async (asDraft: boolean) => {
    const depCodes = Array.from(dirtyOtherProducerDeps);
    if (!depCodes.length) return 0;
    const saved: string[] = [];
    for (const depCode of depCodes) {
      try {
        await saveOneOtherProducerData(depCode, asDraft);
        saved.push(depCode);
      } catch (error) {
        console.error(`[saveAllOtherProducersData] Error procesando ${depCode}:`, error);
        setDirtyOtherProducerDeps((previous) => {
          const next = new Set(previous);
          saved.forEach((savedDepCode) => next.delete(savedDepCode));
          return next;
        });
        throw error;
      }
    }
    setDirtyOtherProducerDeps((previous) => {
      const next = new Set(previous);
      saved.forEach((savedDepCode) => next.delete(savedDepCode));
      return next;
    });
    return saved.length;
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
          // Preservar origen detectado al guardar borrador
          ...(detectedOrigin.source === 'qr' ? { hasQrOrigin: true } : {}),
          ...(detectedOrigin.source === 'excel' ? { bypassValidation: true } : {}),
          ...(detectedOrigin.senderInfo?.sender_email && detectedOrigin.senderInfo?.sender_name ? {
            sender_email: detectedOrigin.senderInfo.sender_email,
            sender_name: detectedOrigin.senderInfo.sender_name,
          } : {}),
        });
      } else {
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
          email: session?.user?.email,
          pubTem_id: id_template,
          data: updatedRows ?? rows,
          asDraft: true,
          // Preservar origen detectado al guardar borrador
          ...(detectedOrigin.source === 'qr' ? { hasQrOrigin: true } : {}),
          ...(detectedOrigin.source === 'excel' ? { bypassValidation: true } : {}),
          ...(detectedOrigin.senderInfo?.sender_email && detectedOrigin.senderInfo?.sender_name ? {
            sender_email: detectedOrigin.senderInfo.sender_email,
            sender_name: detectedOrigin.senderInfo.sender_name,
          } : {}),
        });
      }
    } catch (err) {
      console.error('[saveDraftRows] Error al guardar borrador:', err);
      throw err;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveDraftRows();
      // No solo el encargado: cualquier productor puede tener ediciones de
      // otras dependencias cargadas (hojas donde "shared" esta activo y el
      // tiene permiso de edicion). La funcion no hace nada si no hay datos.
      await saveAllOtherProducersData(true);
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
    const currentRows = sheetRows[sheetName] || [];
    // Borrar la ultima fila deja la hoja en cero filas (igual que removeRow
    // para plantillas de una sola hoja): al enviar, handleSubmit valida los
    // campos obligatorios contra "sheetRows[sheet.name] || [{}]", asi que una
    // hoja vacia sigue quedando marcada con error en vez de enviarse en silencio.
    const filtered = currentRows.filter((_, i) => i !== idx);
    const nextSources = (sheetRowSources[sheetName] || []).filter((_, i) => i !== idx);
    const updated = { ...sheetRows, [sheetName]: filtered };
    setSheetRows(updated);
    setSheetRowSources(prev => ({ ...prev, [sheetName]: nextSources }));
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
    
    // Si el usuario edita datos existentes, cambiar origen a "en línea"
    if (detectedOrigin.source && detectedOrigin.source !== 'online') {
      setDetectedOrigin({ source: 'online' });
    }

    clearFieldError(fieldName);
  };

  const addRow = () => {
    const newRows = [...rows, {}];
    setRows(newRows);
    setRowSources(prev => [...prev, null]);
    // NO resetear hasQrOrigin - el backend preservará el origen original
    
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
      // Solo se envian las hojas donde el usuario realmente agrego una fila.
      // Si no agrego ninguna en ninguna hoja, no hay nada propio que enviar
      // (mas abajo se sigue enviando igual la info de otros productores).
      const sheetsData = accessibleSheets
        .filter((sheet) => (sheetRows[sheet.name] || []).length > 0)
        .map((sheet) => ({
          name: sheet.name,
          data: formatRows(resolveDisplayValues(sheetRows[sheet.name] || [{}], sheet.fields || [], sheet.name), sheet.fields || []),
        }));
      const hasOwnDataToSend = useSheetSubmission ? sheetsData.length > 0 : formattedRows.length > 0;

      if (hasOwnDataToSend) {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
        email: session?.user?.email,
        pubTem_id: id_template,
        data: useSheetSubmission ? undefined : formattedRows,
        sheetsData: useSheetSubmission ? sheetsData : undefined,
        asDraft: false,
        // Preservar origen detectado
        ...(detectedOrigin.source === 'qr' ? { hasQrOrigin: true } : {}),
        ...(detectedOrigin.source === 'excel' ? { bypassValidation: true } : {}),
        // Incluir info del remitente si está disponible
        ...(detectedOrigin.senderInfo?.sender_email && detectedOrigin.senderInfo?.sender_name ? {
          sender_email: detectedOrigin.senderInfo.sender_email,
          sender_name: detectedOrigin.senderInfo.sender_name,
        } : {}),
        // Si viene de ruta /public/form/, marcar como QR (fallback para datos nuevos no desde draft)
        ...(isFromPublicQr && !detectedOrigin.source ? { isFromPublicQr: true } : {}),
      });
      }

      // No solo el encargado: cualquier productor puede tener ediciones de
      // otras dependencias cargadas (hojas donde "shared" esta activo y el
      // tiene permiso de edicion). La funcion no hace nada si no hay datos, y
      // se envia sin importar si el usuario agrego o no su propia fila.
      const hasEditedOtherProducerData = dirtyOtherProducerDeps.size > 0;
      await saveAllOtherProducersData(false);

      // Si el formulario solo contiene informacion ya enviada/compartida,
      // registrar una confirmacion real en el backend. Sin esto la interfaz
      // mostraba exito, pero la plantilla seguia apareciendo en Pendientes.
      if (!hasOwnDataToSend && !hasEditedOtherProducerData) {
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/confirmExisting`, {
          email: session?.user?.email,
          pubTemId: id_template,
        });
      }
      showNotification({
        title: "Información enviada",
        message: hasOwnDataToSend || hasEditedOtherProducerData
          ? "Los datos se enviaron correctamente."
          : "La información existente se confirmó correctamente.",
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
      } else {
        showNotification({
          title: "Error al enviar",
          message: axios.isAxiosError(error)
            ? (error.response?.data?.status || "No se pudo enviar la información.")
            : "No se pudo enviar la información.",
          color: "red",
          autoClose: 6000,
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
    const fieldValue = normalizeExcelStoredValue(row[field.name]);

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
    const formattedDateDisplay = formatTemplateDateValue(fieldValue, field.name);

    if (field.multiple && (field.validate_with || hasDropdownOptions)) {
      return wrapWithTooltip(
        <MultiSelect
          value={Array.isArray(fieldValue) ? fieldValue.map(String) : []}
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
        ? opts.find(opt => opt.label === storedDisplayValue)?.value || fieldValue
        : (resolveStoredSelectValue(fieldValue, opts) ?? fieldValue);

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
          : (typeof fieldValue === 'number' ? fieldValue : "");
          
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
          : (formattedDateDisplay ?? (fieldValue === null ? "" : fieldValue));
          
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
          : (formattedDateDisplay ?? (fieldValue === null ? "" : fieldValue));
          
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
          : fieldValue;

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
          : (fieldValue ? new Date(fieldValue) : null);
          
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
          : (formattedDateDisplay ?? (fieldValue === null ? "" : fieldValue));
          
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
    value = normalizeExcelStoredValue(value);

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
        const arrayText = value.map(item => normalizeExcelStoredValue(item)).join(', ');
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

  const renderSheetTable = (
    fields: Field[],
    sheetName?: string,
    readOnly = false,
    overrideRows?: Record<string, any>[],
    overrideSources?: (QrRowSource | null)[],
    overrideOnInputChange?: (rowIndex: number, fieldName: string, value: any) => void,
    overrideOnRemoveRow?: (rowIndex: number) => void
  ) => {
    const isSheetMode = !!sheetName;
    // Sin filas por defecto: el usuario debe darle "Agregar Fila" el mismo
    // para empezar a llenar un registro, en vez de ver una fila ya puesta.
    const currentRows = overrideRows ?? (isSheetMode ? (sheetRows[sheetName] || []) : rows);
    const onInputChange = overrideOnInputChange ?? (isSheetMode
      ? (rowIndex: number, fieldName: string, value: any) => updateSheetCell(sheetName, rowIndex, fieldName, value)
      : handleInputChange);
    const onRemoveRow = overrideOnRemoveRow ?? (isSheetMode
      ? (rowIndex: number) => removeSheetRow(sheetName, rowIndex)
      : removeRow);
    const currentRowSources = overrideSources ?? (isSheetMode ? (sheetRowSources[sheetName] || []) : rowSources);
    const showQrSourceColumn = currentRowSources.some(Boolean);

    // Paginacion de filas: con datasets grandes (miles de filas cargadas por
    // Excel de otra dependencia) renderizar todo de una vez vuelve la pagina
    // muy lenta. Se muestran de a poco; los indices no cambian (se corta
    // desde el inicio) asi que onInputChange/onRemoveRow siguen apuntando a
    // la fila correcta del arreglo completo.
    const tableKey = sheetName || '__legacy__';
    const visibleCount = tableVisibleRows[tableKey] ?? TABLE_ROWS_PAGE_SIZE;
    const visibleRows = currentRows.slice(0, visibleCount);
    const hiddenCount = currentRows.length - visibleRows.length;

    return (
      <>
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
              {visibleRows.map((row, rowIndex) => (
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
      {hiddenCount > 0 && (
        <Group justify="center" mt="xs" mb="sm">
          <Button
            size="xs"
            variant="light"
            onClick={() => setTableVisibleRows(prev => ({ ...prev, [tableKey]: visibleCount + TABLE_ROWS_PAGE_SIZE }))}
          >
            {`Mostrar ${Math.min(TABLE_ROWS_PAGE_SIZE, hiddenCount)} filas más (quedan ${hiddenCount})`}
          </Button>
        </Group>
      )}
      </>
    );
  };

  const useSheets = allSheets.length > 0;

  // Mientras no sepamos a que hojas tiene acceso el productor, no renderizar
  // las pestañas: evita que una hoja SI asignada aparezca un instante como
  // "solo lectura" (o con datos de otros productores) y luego cambie a editable.
  if (!template || (useSheets && !permissionsReady)) {
    return <Text ta="center" c="dimmed">Cargando Información...</Text>;
  }

  const accessibleSheetNames = new Set(accessibleSheets.map(s => s.name));
  // Mostrar ícono/datos de lectura en hojas de otros productores solo si la plantilla tiene "shared" activo
  const templateSharedUI = Boolean(template?.shared) && allSheets.length > 0;

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
                {canEdit && Object.keys(otherProducersData).some(
                  (depCode) => (otherProducersData[depCode]?.[sheet.name]?.rows?.length ?? 0) > 0
                ) && (
                  <>
                    <Divider
                      my="md"
                      label={
                        isEncargadoTemplate
                          ? "Información de otras dependencias (puedes editarla por ser productor encargado)"
                          : "Información compartida por otros productores (puedes editarla)"
                      }
                      labelPosition="center"
                    />
                    {Object.entries(otherProducersData)
                      .filter(([, sheets]) => (sheets[sheet.name]?.rows?.length ?? 0) > 0)
                      .map(([depCode, sheets]) => (
                        <Box key={depCode} mb="lg">
                          <Text fw={700} size="sm" mb={4}>{otherProducersDepNames[depCode] || depCode}</Text>
                          {renderSheetTable(
                            sheet.fields,
                            `${sheet.name}__other__${depCode}`,
                            false,
                            sheets[sheet.name].rows,
                            sheets[sheet.name].sources,
                            (rowIndex, fieldName, value) => updateOtherProducerCell(depCode, sheet.name, rowIndex, fieldName, value),
                            (rowIndex) => removeOtherProducerRow(depCode, sheet.name, rowIndex)
                          )}
                          <Group justify="center" mt="xs" mb="sm">
                            <Button size="xs" variant="light" onClick={() => addOtherProducerRow(depCode, sheet.name)} leftSection={<IconPlus size={14} />}>
                              Agregar Fila
                            </Button>
                          </Group>
                        </Box>
                      ))}
                  </>
                )}
              </Tabs.Panel>
            );
          })}
        </Tabs>
      ) : (
        <>
          {renderSheetTable(template.fields)}
          {isEncargadoTemplate && Object.keys(otherProducersData).some(
            (depCode) => (otherProducersData[depCode]?.[OTHER_PRODUCERS_FLAT_KEY]?.rows?.length ?? 0) > 0
          ) && (
            <>
              <Divider
                my="md"
                label="Información de otras dependencias (puedes editarla por ser productor encargado)"
                labelPosition="center"
              />
              {Object.entries(otherProducersData)
                .filter(([, sheets]) => (sheets[OTHER_PRODUCERS_FLAT_KEY]?.rows?.length ?? 0) > 0)
                .map(([depCode, sheets]) => (
                  <Box key={depCode} mb="lg">
                    <Text fw={700} size="sm" mb={4}>{otherProducersDepNames[depCode] || depCode}</Text>
                    {renderSheetTable(
                      template.fields,
                      `${OTHER_PRODUCERS_FLAT_KEY}__other__${depCode}`,
                      false,
                      sheets[OTHER_PRODUCERS_FLAT_KEY].rows,
                      sheets[OTHER_PRODUCERS_FLAT_KEY].sources,
                      (rowIndex, fieldName, value) => updateOtherProducerCell(depCode, OTHER_PRODUCERS_FLAT_KEY, rowIndex, fieldName, value),
                      (rowIndex) => removeOtherProducerRow(depCode, OTHER_PRODUCERS_FLAT_KEY, rowIndex)
                    )}
                    <Group justify="center" mt="xs" mb="sm">
                      <Button size="xs" variant="light" onClick={() => addOtherProducerRow(depCode, OTHER_PRODUCERS_FLAT_KEY)} leftSection={<IconPlus size={14} />}>
                        Agregar Fila
                      </Button>
                    </Group>
                  </Box>
                ))}
            </>
          )}
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
              // Si el usuario edita datos existentes, cambiar origen a "en línea"
              if (detectedOrigin.source && detectedOrigin.source !== 'online') {
                setDetectedOrigin({ source: 'online' });
              }
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
