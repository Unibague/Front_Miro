import { useRef, useState } from 'react';
import { Text, Group, Button, rem, useMantineTheme } from '@mantine/core';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { IconCloudUpload, IconX, IconDownload } from '@tabler/icons-react';
import ExcelJS from 'exceljs';
import axios from 'axios';
import { useSession } from 'next-auth/react';
import classes from './DropzoneButton.module.css';
import { showNotification } from '@mantine/notifications';
import Lottie from 'lottie-react';
import successAnimation from "../../../public/lottie/success.json";
import { endOfDayGMT5 } from '../DateConfig';
import { isBlankRequiredValue } from '../../utils/requiredFields';

const isRequiredField = (field: any, skipComment = false): boolean => {
  if (skipComment) return false;
  // Override manual del admin: gana siempre, aunque el comentario diga "obligatorio".
  if (field?.required_override) return false;
  if (field?.required) return true;
  const c = String(field?.comment ?? '').toLowerCase();
  for (const w of ['obligatorio', 'obligatario']) {
    if (c.includes(w) && !c.includes(`no ${w}`) && !new RegExp(`${w}\\s+si\\b`).test(c)) return true;
  }
  return false;
};

interface DropzoneButtonProps {
  pubTemId: string;
  endDate: Date | undefined;
  onClose: () => void;
  onUploadSuccess: () => void | Promise<void>;
  userDependencies?: { value: string; label: string }[];
}

interface SheetUploadData {
  name: string;
  data: Record<string, any>[];
  targetDependency?: string;
}

interface PreviewData {
  sheetsData?: SheetUploadData[];
  data?: Record<string, any>[];
  totalRecords: number;
}

const SHARED_ORIGIN_PROPERTY = '__miroSharedOriginCode';
const IDENTITY_FIELD_NAMES = new Set([
  'ANO',
  'SEMESTRE',
  'ID_TIPO_DOCUMENTO',
  'NUM_DOCUMENTO',
]);

const normalizeIdentityName = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const normalizeIdentityValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeIdentityValue).join(',');
  return String(value).trim().toUpperCase();
};

const getSharedRowIdentity = (
  row: Record<string, any>,
  fieldNames: string[]
): string | null => {
  const identityFields = fieldNames.filter((name) =>
    IDENTITY_FIELD_NAMES.has(normalizeIdentityName(name))
  );
  if (!identityFields.some((name) => normalizeIdentityName(name) === 'NUM_DOCUMENTO')) {
    return null;
  }

  const parts = identityFields.map((name) => normalizeIdentityValue(row?.[name]));
  if (parts.some((value) => value === '')) return null;
  return parts.join('\u001f');
};

const buildSharedOriginLookup = (
  sharedRows: Record<string, any>[],
  fieldNames: string[]
): Map<string, string> => {
  const originsByIdentity = new Map<string, Set<string>>();

  sharedRows.forEach((row) => {
    const identity = getSharedRowIdentity(row, fieldNames);
    const originCode = String(row?.__origin__?.code ?? '').trim();
    if (!identity || !originCode) return;

    const origins = originsByIdentity.get(identity) ?? new Set<string>();
    origins.add(originCode);
    originsByIdentity.set(identity, origins);
  });

  const result = new Map<string, string>();
  originsByIdentity.forEach((origins, identity) => {
    if (origins.size === 1) result.set(identity, Array.from(origins)[0]);
  });
  return result;
};

interface SubmittedSheetGroup {
  targetDependency: string;
  sheetsData: { name: string; data: Record<string, any>[] }[];
}

const normalizeVerificationValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map(normalizeVerificationValue).filter(Boolean).join(',');
  }
  if (value instanceof Date) return value.toISOString();
  return String(value).trim().toUpperCase();
};

const verifySubmittedSheetGroups = async (
  pubTemId: string,
  groups: SubmittedSheetGroup[],
  fieldNamesBySheet: Map<string, string[]>
): Promise<number | null> => {
  if (groups.length === 0) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }

    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${pubTemId}`,
        { headers: { 'Cache-Control': 'no-cache' } }
      );
      const sharedSheetsData: Record<string, Record<string, any>[]> =
        response.data?.shared_sheets_data || {};
      let confirmedRecords = 0;
      let allGroupsMatch = true;

      for (const group of groups) {
        for (const sheet of group.sheetsData) {
          const fieldNames = fieldNamesBySheet.get(sheet.name) || Object.keys(sheet.data[0] || {});
          const storedRows = (sharedSheetsData[sheet.name] || []).filter((row) => {
            if (!group.targetDependency) return true;
            return String(row?.__origin__?.code ?? '') === group.targetDependency;
          });
          const storedByIdentity = new Map<string, Record<string, any>[]>();

          storedRows.forEach((row) => {
            const identity = getSharedRowIdentity(row, fieldNames);
            if (!identity) return;
            const matches = storedByIdentity.get(identity) || [];
            matches.push(row);
            storedByIdentity.set(identity, matches);
          });

          for (const submittedRow of sheet.data) {
            const identity = getSharedRowIdentity(submittedRow, fieldNames);
            const candidates = identity ? storedByIdentity.get(identity) || [] : [];
            const rowMatches = candidates.some((storedRow) =>
              Object.entries(submittedRow).every(([fieldName, value]) => {
                if (fieldName === SHARED_ORIGIN_PROPERTY) return true;
                return normalizeVerificationValue(storedRow?.[fieldName]) ===
                  normalizeVerificationValue(value);
              })
            );

            if (!rowMatches) {
              allGroupsMatch = false;
              break;
            }
            confirmedRecords += 1;
          }

          if (!allGroupsMatch) break;
        }
        if (!allGroupsMatch) break;
      }

      if (allGroupsMatch) return confirmedRecords;
    } catch {
      // El backend puede estar reiniciando; se reintenta la consulta.
    }
  }

  return null;
};

const normalizeBackendValidationErrors = (payload: any) => {
  const details = payload?.details;

  if (Array.isArray(details)) {
    return details;
  }

  const fallbackMessage =
    typeof details === 'string'
      ? details
      : typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error === 'string'
          ? payload.error
        : typeof payload?.status === 'string'
          ? payload.status
          : 'Error desconocido al procesar la plantilla.';

  return [
    {
      column: payload?.column || 'Campo desconocido',
      errors: [
        {
          register: 1,
          message: fallbackMessage,
          value: payload?.value ?? 'Sin valor',
        },
      ],
    },
  ];
};

const buildRequiredErrorDetails = (
  rows: Record<string, any>[],
  fields: any[],
  sheetName?: string,
  skipComment = false
) => fields
  .filter((field) => isRequiredField(field, skipComment))
  .map((field) => {
    const errors = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => isBlankRequiredValue(row?.[field.name]))
      .map(({ index }) => ({
        register: index + 1,
        value: 'Sin valor',
        message: `El campo "${field.name}" es obligatorio y no puede estar vacio (fila ${index + 1})`,
      }));

    return {
      column: sheetName ? `${sheetName} - ${field.name}` : field.name,
      errors,
    };
  })
  .filter((detail) => detail.errors.length > 0);

const showRequiredUploadErrors = (details: any[]) => {
  localStorage.setItem('errorDetails', JSON.stringify(details));
  if (typeof window !== 'undefined') window.location.href = '/logs';

  showNotification({
    title: 'Campos obligatorios sin completar',
    message: 'La plantilla no se subio. Revisa los campos marcados como obligatorios en los comentarios.',
    color: 'red',
    autoClose: 7000,
  });
};

const normalizeExcelCellValue = (value: any): any => {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
      /"?(richText|hyperlink|text|result|formula|value)"?\s*:/.test(trimmed)
    ) {
      try {
        return normalizeExcelCellValue(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }

  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map((item) => normalizeExcelCellValue(item)).filter((item) => item !== null && item !== undefined).join(', ');
  }

  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((item: any) => normalizeExcelCellValue(item?.text ?? '')).join('');
    }
    if (value.text !== undefined || value.hyperlink !== undefined) {
      return normalizeExcelCellValue(value.text ?? value.hyperlink ?? '');
    }
    if (value.result !== undefined || value.formula !== undefined) {
      return normalizeExcelCellValue(value.result ?? value.formula ?? '');
    }
    if (value.value !== undefined) {
      return normalizeExcelCellValue(value.value);
    }
    if (value.$numberInt !== undefined || value.$numberDouble !== undefined) {
      return value.$numberInt ?? value.$numberDouble;
    }
    return String(value);
  }

  return value;
};


export function DropzoneButton({
  pubTemId,
  endDate,
  onClose,
  onUploadSuccess,
  userDependencies = [],
}: DropzoneButtonProps) {
  const theme = useMantineTheme();
  const openRef = useRef<() => void>(null);
  const { data: session } = useSession();
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [isSendingDraft, setIsSendingDraft] = useState(false);

  const sendData = async (uploadData: PreviewData, asDraft = false) => {
    if (!session?.user?.email) return;

    const submittedGroups: SubmittedSheetGroup[] = [];
    const fieldNamesBySheet = new Map<string, string[]>(
      (uploadData.sheetsData || []).map((sheet) => [
        sheet.name,
        Object.keys(sheet.data[0] || {}).filter((name) => name !== SHARED_ORIGIN_PROPERTY),
      ])
    );

    try {
      setIsSendingDraft(true);

      const dataToSend: any = {
        email: session.user.email,
        pubTem_id: pubTemId,
        asDraft,
        bypassValidation: true,
      };

      let responses: any[] = [];

      if (uploadData.sheetsData) {
        // Una plantilla compartida puede contener filas que pertenecen a otra
        // dependencia. Se envia cada grupo por separado para conservar su
        // propietario, igual que lo hace el formulario en linea.
        const groupedByDependency = new Map<string, Map<string, Record<string, any>[]>>();

        uploadData.sheetsData.forEach((sheet) => {
          sheet.data.forEach((row) => {
            const originDependency = String(row?.[SHARED_ORIGIN_PROPERTY] ?? '').trim();
            const targetDependency = originDependency || sheet.targetDependency || '';
            const cleanRow = { ...row };
            delete cleanRow[SHARED_ORIGIN_PROPERTY];

            const sheets = groupedByDependency.get(targetDependency) ??
              new Map<string, Record<string, any>[]>();
            const rows = sheets.get(sheet.name) ?? [];
            rows.push(cleanRow);
            sheets.set(sheet.name, rows);
            groupedByDependency.set(targetDependency, sheets);
          });
        });

        for (const [targetDependency, sheets] of groupedByDependency.entries()) {
          const requestSheets = Array.from(sheets.entries()).map(([name, data]) => ({ name, data }));
          submittedGroups.push({ targetDependency, sheetsData: requestSheets });
          const requestData = {
            ...dataToSend,
            sheetsData: requestSheets,
            ...(targetDependency ? { onBehalfOfDependency: targetDependency } : {}),
          };
          responses.push(await axios.put(
            `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`,
            requestData
          ));
        }
      } else if (uploadData.data) {
        dataToSend.data = uploadData.data;
        responses = [await axios.put(
          `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`,
          dataToSend
        )];
      }

      const recordsLoaded = responses.reduce(
        (total, response) => total + Number(response.data?.recordsLoaded || 0),
        0
      );
      const message = asDraft
        ? `Se guardó como borrador: ${recordsLoaded} registros.`
        : `Se enviaron ${recordsLoaded} registros correctamente.`;

      setShowSuccessAnimation(true);
      showNotification({
        title: asDraft ? 'Guardado como borrador' : 'Información enviada',
        message,
        color: 'teal',
        autoClose: 4000,
      });

      void Promise.resolve(onUploadSuccess()).catch((refreshError) => {
        console.error('Error refrescando plantillas despues de cargar:', refreshError);
      });

      setTimeout(() => {
        setShowSuccessAnimation(false);
        onClose();
      }, 3000);
    } catch (error) {
      console.error('Error enviando los datos:', error);

      if (axios.isAxiosError(error)) {
        const confirmedRecords = uploadData.sheetsData
          ? await verifySubmittedSheetGroups(pubTemId, submittedGroups, fieldNamesBySheet)
          : null;

        if (confirmedRecords !== null) {
          setShowSuccessAnimation(true);
          showNotification({
            title: 'Informacion guardada y verificada',
            message: `Se confirmaron ${confirmedRecords} registros aunque se perdio la respuesta inicial del servidor.`,
            color: 'teal',
            autoClose: 6000,
          });
          void Promise.resolve(onUploadSuccess()).catch((refreshError) => {
            console.error('Error refrescando plantillas despues de verificar:', refreshError);
          });
          setTimeout(() => {
            setShowSuccessAnimation(false);
            onClose();
          }, 3000);
          return;
        }

        const diagnosticPayload = error.response?.data ?? {
          column: 'Carga de plantilla',
          message: error.message,
          status: error.code || 'Error de conexion',
          value: error.config?.url || 'Sin respuesta del servidor',
        };
        const normalizedErrors = normalizeBackendValidationErrors(diagnosticPayload);
        if (Array.isArray(normalizedErrors) && normalizedErrors.length > 0) {
          localStorage.setItem('errorDetails', JSON.stringify(normalizedErrors));
          if (typeof window !== 'undefined') window.location.href = '/logs';
        }
      }

      showNotification({
        title: 'Error al enviar datos',
        message: 'No se pudieron procesar los datos. Revisa los logs.',
        color: 'red',
      });
    } finally {
      setIsSendingDraft(false);
    }
  };

  const handleFileDrop = async (files: File[]) => {
    if (endDate && endOfDayGMT5(new Date(endDate)) < new Date()) {
      showNotification({
        title: 'Error',
        message: 'La fecha de carga de plantillas ha culminado.',
        color: 'red',
      });
      return;
    }

    const file = files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const firstSheet = workbook.worksheets[0];
      if (!firstSheet) return;

      // Load template metadata
      const templateResponse = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${pubTemId}`
      );

      // Normalize: strip accents, collapse spaces, uppercase
      const _vNorm = (s: string) =>
        String(s)
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();

      const _vStr = (v: unknown): string => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string') return v.trim();
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        if (typeof v === 'object' && '$numberInt' in (v as any))
          return String((v as any).$numberInt ?? '').trim();
        return String(v).trim();
      };

      const validators: any[] = templateResponse.data.template.validators || [];
      const topFields: any[] = templateResponse.data.template.fields || [];
      const workbookSheets: any[] = templateResponse.data.template.workbook_sheets || [];
      const sharedSheetsData: Record<string, Record<string, any>[]> =
        templateResponse.data.shared_sheets_data || {};
      const sheetFields: any[] = workbookSheets.flatMap((s: any) => s.fields || []);
      const allFields: any[] = topFields.length > 0 ? topFields : sheetFields;
      const skipCommentValidation: boolean = Boolean(templateResponse.data.template.skip_comment_validation) ||
        templateResponse.data.name === 'Docentes_IES' ||
        templateResponse.data.template?.name === 'Docentes_IES';

      // Build field type map and validator lookup
      const fieldTypeMap: Record<string, string> = {};
      const fieldValidatorLookup: Record<string, Map<string, string>> = {};

      allFields.forEach((field: any) => {
        fieldTypeMap[field.name] = field.datatype;
        if (field.multiple) return;

        let lookup = new Map<string, string>();

        // Estrategia 1: Si tiene validate_with, usar validador
        if (field.validate_with) {
          const validateWithStr =
            typeof field.validate_with === 'string'
              ? field.validate_with
              : (field.validate_with as any)?.name ?? '';
          if (validateWithStr) {
            const parts = validateWithStr.split(' - ');
            const validatorName = parts[0]?.trim();
            const preferredColumn = parts.slice(1).join(' - ').trim();
            if (validatorName) {
              const validator = validators.find(
                (v: any) => _vNorm(v.name) === _vNorm(validatorName)
              );
              if (validator && Array.isArray(validator.values)) {
                validator.values.forEach((row: any) => {
                  const keys = Object.keys(row || {});
                  if (!keys.length) return;

                  const idKey = preferredColumn
                    ? keys.find(k => _vNorm(k) === _vNorm(preferredColumn))
                    : keys[0];
                  const mainKey = idKey || keys[0];
                  const idText = _vStr(row[mainKey]);
                  if (!idText) return;

                  const descKey = keys.find(k => {
                    if (k === mainKey) return false;
                    const n = _vNorm(k);
                    return n.includes('DESCRIPCION') || n.includes('NOMBRE') || n.startsWith('DESC');
                  });
                  const descText = descKey ? _vStr(row[descKey]) : '';

                  lookup.set(_vNorm(idText), idText);
                  if (descText) {
                    lookup.set(_vNorm(`${idText} - ${descText}`), idText);
                    lookup.set(_vNorm(descText), idText);
                  }
                });
              }
            }
          }
        }

        // Estrategia 2: Si no hay validador o si está vacío, usar dropdown_options
        if (lookup.size === 0 && Array.isArray(field.dropdown_options) && field.dropdown_options.length > 0) {
          field.dropdown_options.forEach((option: string) => {
            const optionStr = _vStr(option);
            if (optionStr) {
              lookup.set(_vNorm(optionStr), optionStr);
              // También agregar partes antes del guión si existe
              const parts = optionStr.split(' - ');
              if (parts.length > 1) {
                const firstPart = _vStr(parts[0]);
                lookup.set(_vNorm(firstPart), optionStr);
              }
            }
          });
        }

        if (lookup.size > 0) fieldValidatorLookup[field.name] = lookup;
      });

      // Helper: parse a single cell value based on field type
      const parseCellValue = (cell: ExcelJS.Cell, key: string): any => {
        const tipo = fieldTypeMap[key];
        const multiple = allFields.find((f: any) => f.name === key)?.multiple;
        let parsedValue: any = normalizeExcelCellValue(cell.value);

        // Handle Excel formula errors
        if (
          typeof cell.value === 'object' &&
          cell.value !== null &&
          'error' in cell.value
        ) {
          return `ERROR: ${(cell.value as any).error}`;
        }

        // Handle hyperlinks
        if (tipo === 'Link' && (cell as any).hyperlink) {
          return String(normalizeExcelCellValue(cell.value) || normalizeExcelCellValue((cell as any).hyperlink) || '');
        }

        // Handle multiple-value fields
        if (multiple) {
          const rawValue = normalizeExcelCellValue(cell.value);
          return String(rawValue ?? '')
            .trim()
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
        }

        // Resolve validator code before type conversion
        if (fieldValidatorLookup[key]) {
          const rawStr = _vStr(normalizeExcelCellValue(cell.value));
          if (rawStr) {
            const found = fieldValidatorLookup[key].get(_vNorm(rawStr));
            if (found !== undefined) parsedValue = found;
          }
        }

        switch (tipo) {
          case 'Entero': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              parsedValue = normalizeExcelCellValue(parsedValue);
            const intVal = parseInt(String(parsedValue));
            return isNaN(intVal) ? String(parsedValue) : intVal;
          }

          case 'Decimal':
          case 'Porcentaje': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              parsedValue = normalizeExcelCellValue(parsedValue);
            const floatVal = parseFloat(String(parsedValue));
            return isNaN(floatVal) ? String(parsedValue) : floatVal;
          }

          case 'Fecha': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              parsedValue = normalizeExcelCellValue(parsedValue);
            const dateValue = new Date(String(parsedValue));
            return isNaN(dateValue.getTime())
              ? String(parsedValue)
              : dateValue.toISOString();
          }

          case 'True/False': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              parsedValue = normalizeExcelCellValue(parsedValue);
            return String(parsedValue).toLowerCase() === 'si' || parsedValue === true;
          }

          case 'Texto Corto':
          case 'Texto Largo': {
            return String(normalizeExcelCellValue(parsedValue) ?? '');
          }

          case 'Fecha Inicial / Fecha Final': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              parsedValue = normalizeExcelCellValue(parsedValue);
            try {
              const parsed = JSON.parse(String(parsedValue));
              if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error();
              return parsed;
            } catch {
              return String(parsedValue);
            }
          }

          default: {
            return normalizeExcelCellValue(parsedValue);
          }
        }
      };

      // Helper: sanitize a row
      const sanitizeRow = (row: Record<string, any>): Record<string, any> => {
        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          if (value === null || value === undefined) {
            result[key] = null;
          } else if (Array.isArray(value)) {
            result[key] = value.map(v =>
              typeof v === 'object' && v !== null ? normalizeExcelCellValue(v) : normalizeExcelCellValue(v)
            );
          } else if (typeof value === 'object') {
            result[key] = normalizeExcelCellValue(value);
          } else {
            result[key] = normalizeExcelCellValue(value);
          }
        }
        return result;
      };

      // Helper: read rows from an Excel worksheet given allowed field names.
      // Uses normalized (accent-insensitive) header matching so that Excel headers
      // with different Unicode normalization still map to the correct field names.
      const readSheetRows = (
        worksheet: ExcelJS.Worksheet,
        allowedFields: Set<string>,
        debugSheetName?: string
      ): Record<string, any>[] => {
        const rows: Record<string, any>[] = [];
        let headers: string[] = [];
        // Map normalized header → canonical field name for accent-insensitive lookup
        const normToField = new Map<string, string>();
        allowedFields.forEach(f => normToField.set(_vNorm(f), f));

        if (debugSheetName) {
          console.log(`[readSheetRows] Sheet: ${debugSheetName}, allowedFields:`, Array.from(allowedFields).slice(0, 5));
        }

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            headers = [];
            row.eachCell({ includeEmpty: true }, (cell) => {
              headers.push(cell.text?.toString?.() ?? cell.value?.toString?.() ?? '');
            });
            if (debugSheetName) {
              console.log(`[readSheetRows] ${debugSheetName} headers (row1):`, headers.filter(Boolean).slice(0, 5));
              const matchedHeaders = headers.filter(h => h && normToField.has(_vNorm(h)));
              console.log(`[readSheetRows] ${debugSheetName} matched headers:`, matchedHeaders.slice(0, 5), `(${matchedHeaders.length}/${headers.filter(Boolean).length})`);
            }
          } else {
            const rowData: Record<string, any> = {};
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              if (colNumber === 0) return;
              const rawKey = headers[colNumber - 1];
              if (!rawKey) return;
              const fieldName = normToField.get(_vNorm(rawKey));
              if (!fieldName) return;
              rowData[fieldName] = parseCellValue(cell, fieldName);
            });
            // Only push rows that have at least one recognized field
            if (Object.keys(rowData).length > 0) {
              rows.push(sanitizeRow(rowData));
            }
          }
        });

        return rows;
      };

      const guideSheetHeaders = new Set(['CAMPO', 'COMENTARIO DEL CAMPO']);

      // Determine if this is a workbook template (multi-sheet)
      const workbookTemplateSheets = workbookSheets.filter(
        (s: any) => s.fields?.length > 0
      );
      const producerCodeById = new Map<string, string>();
      (templateResponse.data.template.producers || []).forEach((producer: any) => {
        const id = String(producer?._id ?? producer?.id ?? '');
        const code = String(producer?.dep_code ?? '');
        if (id && code) producerCodeById.set(id, code);
      });
      const userDependencyCodes = new Set(
        userDependencies.map((dependency) => dependency.value)
      );
      const userDependencyIds = new Set(
        Array.from(producerCodeById.entries())
          .filter(([, code]) => userDependencyCodes.has(code))
          .map(([id]) => id)
      );
      const responsibleProducerIds = (
        templateResponse.data.publishedTemplate?.responsible_producers || []
      ).map((producer: any) => String(producer?._id ?? producer));
      const isResponsibleProducer = responsibleProducerIds.some((id: string) =>
        userDependencyIds.has(id)
      );
      const hasResolvedUserDependencies = userDependencyCodes.size > 0;
      if (workbookTemplateSheets.length > 0 && !hasResolvedUserDependencies) {
        showNotification({
          title: 'No se pudieron verificar tus permisos',
          message: 'Recarga la pagina e intenta subir nuevamente la plantilla.',
          color: 'red',
        });
        return;
      }
      const editableWorkbookTemplateSheets = workbookTemplateSheets.filter((sheet: any) => {
        if (isResponsibleProducer) return true;
        const sheetProducerIds = (sheet.producers || []).map((producer: any) =>
          String(producer?._id ?? producer)
        );
        if (sheetProducerIds.length === 0) return true;
        return sheetProducerIds.some((id: string) => userDependencyIds.has(id));
      });

      try {
        if (!session?.user?.email) throw new Error('Usuario no autenticado');

        console.log('[Dropzone] editableWorkbookTemplateSheets:', editableWorkbookTemplateSheets.map((s: any) => s.name));
        console.log('[Dropzone] Excel worksheets:', workbook.worksheets.map(ws => ws.name));

        if (workbookTemplateSheets.length > 0) {
          // === MULTI-SHEET MODE ===
          const sheetsData: SheetUploadData[] = [];

          for (const wbSheet of editableWorkbookTemplateSheets) {
            if (!wbSheet.fields?.length) continue;

            const allowedFields = new Set<string>(
              wbSheet.fields.map((f: any) => f.name)
            );
            const expectedCols: string[] = Array.from(allowedFields);

            // 1. Exact name match first (prevents cross-sheet confusion)
            let matchingWorksheet = workbook.worksheets.find((ws) =>
              _vNorm(ws.name) === _vNorm(wbSheet.name)
            );

            // 2. Only fall back to header overlap if no exact match found
            if (!matchingWorksheet) {
              matchingWorksheet = workbook.worksheets.find((ws) => {
                const headerRow = ws.getRow(1);
                const wsHeaders: string[] = [];
                headerRow.eachCell({ includeEmpty: true }, (cell) => {
                  wsHeaders.push(
                    cell.text?.toString?.() ?? cell.value?.toString?.() ?? ''
                  );
                });
                const filledHeaders = wsHeaders.map(h => h.trim()).filter(Boolean);
                if (!filledHeaders.length) return false;

                const isGuide = filledHeaders
                  .map(h => _vNorm(h))
                  .every(h => guideSheetHeaders.has(h));
                if (isGuide) return false;

                return filledHeaders.some(h =>
                  expectedCols.some(col => _vNorm(col) === _vNorm(h))
                );
              });
            }

            console.log(`[Dropzone] Sheet "${wbSheet.name}" → match: ${matchingWorksheet ? matchingWorksheet.name : 'NOT FOUND'}`);

            if (!matchingWorksheet) continue;

            const rows = readSheetRows(matchingWorksheet, allowedFields, wbSheet.name);
            const fieldNames = wbSheet.fields.map((field: any) => field.name);
            const sharedOriginLookup = buildSharedOriginLookup(
              sharedSheetsData[wbSheet.name] || [],
              fieldNames
            );
            const rowsWithOrigins = rows.map((row) => {
              const identity = getSharedRowIdentity(row, fieldNames);
              const originCode = identity ? sharedOriginLookup.get(identity) : undefined;
              return originCode
                ? { ...row, [SHARED_ORIGIN_PROPERTY]: originCode }
                : row;
            });
            const ownSheetProducerCode = (wbSheet.producers || [])
              .map((producer: any) => producerCodeById.get(String(producer?._id ?? producer)))
              .find((code: string | undefined) => Boolean(code) && userDependencyCodes.has(code!));
            console.log(`[Dropzone] Sheet "${wbSheet.name}" → ${rows.length} rows`);
            if (rowsWithOrigins.length > 0) {
              sheetsData.push({
                name: wbSheet.name,
                data: rowsWithOrigins,
                targetDependency: ownSheetProducerCode,
              });
            }
          }

          console.log('[Dropzone] sheetsData:', sheetsData.map(s => ({ name: s.name, rows: s.data.length })));

          if (sheetsData.length === 0) {
            const templateNames = editableWorkbookTemplateSheets.map((s: any) => s.name).join(', ');
            const excelNames = workbook.worksheets.map(ws => ws.name).join(', ');
            showNotification({
              title: 'No se encontraron hojas coincidentes',
              message: `Plantilla espera: [${templateNames}]. Excel tiene: [${excelNames}]. Verifica que el archivo sea la plantilla descargada.`,
              color: 'orange',
              autoClose: 10000,
            });
            return;
          }

          const requiredErrors = sheetsData.flatMap((sheetData) => {
            const sheetTemplate = workbookTemplateSheets.find((s: any) => s.name === sheetData.name);
            return buildRequiredErrorDetails(sheetData.data, sheetTemplate?.fields || [], sheetData.name, skipCommentValidation);
          });

          if (requiredErrors.length > 0) {
            showRequiredUploadErrors(requiredErrors);
            return;
          }

          await sendData({
            sheetsData,
            totalRecords: sheetsData.reduce((sum, s) => sum + s.data.length, 0),
          });

        } else {
          // === SINGLE-SHEET MODE ===
          const expectedColumns = Object.keys(fieldTypeMap);

          const selectedSheet =
            workbook.worksheets.find((ws) => {
              const headerRow = ws.getRow(1);
              const wsHeaders: string[] = [];
              headerRow.eachCell({ includeEmpty: true }, (cell) => {
                wsHeaders.push(
                  cell.text?.toString?.() ?? cell.value?.toString?.() ?? ''
                );
              });
              const filledHeaders = wsHeaders.map(h => h.trim()).filter(Boolean);
              if (!filledHeaders.length) return false;

              const isGuide = filledHeaders
                .map(h => _vNorm(h))
                .every(h => guideSheetHeaders.has(h));
              if (isGuide) return false;

              // Use normalized comparison
              return filledHeaders.some(h =>
                expectedColumns.some(col => _vNorm(col) === _vNorm(h))
              );
            }) ?? firstSheet;

          const allowedFields = new Set<string>(expectedColumns);
          const data = readSheetRows(selectedSheet, allowedFields);

          const requiredErrors = buildRequiredErrorDetails(data, allFields, undefined, skipCommentValidation);
          if (requiredErrors.length > 0) {
            showRequiredUploadErrors(requiredErrors);
            return;
          }

          await sendData({
            data,
            totalRecords: data.length,
          });
        }

      } catch (error) {
        console.error('Error enviando los datos al servidor cargar:', error);

        if (axios.isAxiosError(error)) {
          console.error('Detalles del error:', error.response?.data);
          console.error(
            'Detalles del error JSON:',
            JSON.stringify(error.response?.data ?? {}, null, 2)
          );

          const normalizedErrors = normalizeBackendValidationErrors(
            error.response?.data
          );
          if (Array.isArray(normalizedErrors) && normalizedErrors.length > 0) {
            localStorage.setItem('errorDetails', JSON.stringify(normalizedErrors));
            if (typeof window !== 'undefined') window.location.href = '/logs';
          } else {
            showNotification({
              title: 'Error de validación',
              message: 'No se pudieron procesar los errores. Contacta con soporte.',
              color: 'red',
            });
          }
        }
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className={classes.wrapper}>
      {showSuccessAnimation ? (
        <div className={classes.animationWrapper}>
          <Lottie animationData={successAnimation} loop={false} />
        </div>
      ) : (
        <>
          <Dropzone
            openRef={openRef}
            onDrop={handleFileDrop}
            className={classes.dropzone}
            radius="md"
            accept={[MIME_TYPES.xlsx, MIME_TYPES.xls]}
            maxSize={30 * 1024 ** 2}
          >
            <div style={{ pointerEvents: 'none' }}>
              <Group justify="center">
                <Dropzone.Accept>
                  <IconDownload
                    style={{ width: rem(50), height: rem(50) }}
                    color={theme.colors.blue[6]}
                    stroke={1.5}
                  />
                </Dropzone.Accept>
                <Dropzone.Reject>
                  <IconX
                    style={{ width: rem(50), height: rem(50) }}
                    color={theme.colors.red[6]}
                    stroke={1.5}
                  />
                </Dropzone.Reject>
                <Dropzone.Idle>
                  <IconCloudUpload style={{ width: rem(50), height: rem(50) }} stroke={1.5} />
                </Dropzone.Idle>
              </Group>

              <Text ta="center" fw={700} fz="lg" mt="xl">
                <Dropzone.Accept>Suelta la plantilla aquí</Dropzone.Accept>
                <Dropzone.Reject>Los archivos no deben pesar más de 30MB</Dropzone.Reject>
                <Dropzone.Idle>Subir Plantilla</Dropzone.Idle>
              </Text>
              <Text ta="center" fz="sm" mt="xs" c="dimmed">
                Arrastra y suelta los archivos aquí para subirlos. Solo se aceptan archivos en formato <i>.xlsx</i>, <i>.xls</i>, o <i>.csv</i> que pesen menos de 30MB.
              </Text>
            </div>
          </Dropzone>

          <Button className={classes.control} size="md" radius="xl" loading={isSendingDraft} onClick={() => openRef.current?.()}>
            Seleccionar archivos
          </Button>
        </>
      )}


    </div>
  );
}
