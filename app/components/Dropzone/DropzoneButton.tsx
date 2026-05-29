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

interface DropzoneButtonProps {
  pubTemId: string;
  endDate: Date | undefined;
  onClose: () => void;
  onUploadSuccess: () => void;
}

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


export function DropzoneButton({ pubTemId, endDate, onClose, onUploadSuccess }: DropzoneButtonProps) {
  const theme = useMantineTheme();
  const openRef = useRef<() => void>(null);
  const { data: session } = useSession();
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

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
      const sheetFields: any[] = workbookSheets.flatMap((s: any) => s.fields || []);
      const allFields: any[] = topFields.length > 0 ? topFields : sheetFields;

      // Build field type map and validator lookup
      const fieldTypeMap: Record<string, string> = {};
      const fieldValidatorLookup: Record<string, Map<string, string>> = {};

      allFields.forEach((field: any) => {
        fieldTypeMap[field.name] = field.datatype;
        if (!field.validate_with || field.multiple) return;

        const validateWithStr =
          typeof field.validate_with === 'string'
            ? field.validate_with
            : (field.validate_with as any)?.name ?? '';
        if (!validateWithStr) return;

        const parts = validateWithStr.split(' - ');
        const validatorName = parts[0]?.trim();
        const preferredColumn = parts.slice(1).join(' - ').trim();
        if (!validatorName) return;

        const validator = validators.find(
          (v: any) => _vNorm(v.name) === _vNorm(validatorName)
        );
        if (!validator || !Array.isArray(validator.values)) return;

        const lookup = new Map<string, string>();
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

        if (lookup.size > 0) fieldValidatorLookup[field.name] = lookup;
      });

      // Helper: parse a single cell value based on field type
      const parseCellValue = (cell: ExcelJS.Cell, key: string): any => {
        const tipo = fieldTypeMap[key];
        const multiple = allFields.find((f: any) => f.name === key)?.multiple;
        let parsedValue: any = cell.value;

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
          const hyperlink = (cell as any).hyperlink;
          return typeof hyperlink === 'object'
            ? hyperlink.hyperlink || hyperlink.text || JSON.stringify(hyperlink)
            : String(hyperlink);
        }

        // Handle multiple-value fields
        if (multiple) {
          let rawValue = cell.value;
          if (typeof rawValue === 'object' && rawValue !== null)
            rawValue = JSON.stringify(rawValue);
          return String(rawValue ?? '')
            .trim()
            .split(',')
            .map(v => v.trim())
            .filter(Boolean);
        }

        // Resolve validator code before type conversion
        if (fieldValidatorLookup[key]) {
          const rawStr = _vStr(cell.value);
          if (rawStr) {
            const found = fieldValidatorLookup[key].get(_vNorm(rawStr));
            if (found !== undefined) parsedValue = found;
          }
        }

        switch (tipo) {
          case 'Entero': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              return String(parsedValue);
            const intVal = parseInt(String(parsedValue));
            return isNaN(intVal) ? String(parsedValue) : intVal;
          }

          case 'Decimal':
          case 'Porcentaje': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              return String(parsedValue);
            const floatVal = parseFloat(String(parsedValue));
            return isNaN(floatVal) ? String(parsedValue) : floatVal;
          }

          case 'Fecha': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              return String(parsedValue);
            const dateValue = new Date(String(parsedValue));
            return isNaN(dateValue.getTime())
              ? String(parsedValue)
              : dateValue.toISOString();
          }

          case 'True/False': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              return String(parsedValue);
            return String(parsedValue).toLowerCase() === 'si' || parsedValue === true;
          }

          case 'Texto Corto':
          case 'Texto Largo': {
            return typeof parsedValue === 'object' && parsedValue !== null
              ? JSON.stringify(parsedValue)
              : String(parsedValue ?? '');
          }

          case 'Fecha Inicial / Fecha Final': {
            if (typeof parsedValue === 'object' && parsedValue !== null)
              return JSON.stringify(parsedValue);
            try {
              const parsed = JSON.parse(String(parsedValue));
              if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error();
              return parsed;
            } catch {
              return String(parsedValue);
            }
          }

          default: {
            return typeof parsedValue === 'object' && parsedValue !== null
              ? JSON.stringify(parsedValue)
              : parsedValue;
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
              typeof v === 'object' && v !== null ? String(v) : v
            );
          } else if (typeof value === 'object') {
            result[key] = String(value);
          } else {
            result[key] = value;
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

      try {
        if (!session?.user?.email) throw new Error('Usuario no autenticado');

        console.log('[Dropzone] workbookTemplateSheets:', workbookTemplateSheets.map((s: any) => s.name));
        console.log('[Dropzone] Excel worksheets:', workbook.worksheets.map(ws => ws.name));

        if (workbookTemplateSheets.length > 0) {
          // === MULTI-SHEET MODE ===
          const sheetsData: { name: string; data: Record<string, any>[] }[] = [];

          for (const wbSheet of workbookTemplateSheets) {
            if (!wbSheet.fields?.length) continue;

            const allowedFields = new Set<string>(
              wbSheet.fields.map((f: any) => f.name)
            );
            const expectedCols: string[] = Array.from(allowedFields);

            // Find matching Excel sheet by normalized name or by header overlap
            const matchingWorksheet = workbook.worksheets.find((ws) => {
              if (_vNorm(ws.name) === _vNorm(wbSheet.name)) return true;

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

              // Use normalized comparison so accents/casing don't block matching
              return filledHeaders.some(h =>
                expectedCols.some(col => _vNorm(col) === _vNorm(h))
              );
            });

            console.log(`[Dropzone] Sheet "${wbSheet.name}" → match: ${matchingWorksheet ? matchingWorksheet.name : 'NOT FOUND'}`);

            if (!matchingWorksheet) continue;

            const rows = readSheetRows(matchingWorksheet, allowedFields, wbSheet.name);
            console.log(`[Dropzone] Sheet "${wbSheet.name}" → ${rows.length} rows`);
            if (rows.length > 0) {
              sheetsData.push({ name: wbSheet.name, data: rows });
            }
          }

          console.log('[Dropzone] sheetsData:', sheetsData.map(s => ({ name: s.name, rows: s.data.length })));

          if (sheetsData.length === 0) {
            const templateNames = workbookTemplateSheets.map((s: any) => s.name).join(', ');
            const excelNames = workbook.worksheets.map(ws => ws.name).join(', ');
            showNotification({
              title: 'No se encontraron hojas coincidentes',
              message: `Plantilla espera: [${templateNames}]. Excel tiene: [${excelNames}]. Verifica que el archivo sea la plantilla descargada.`,
              color: 'orange',
              autoClose: 10000,
            });
            return;
          }

          const response = await axios.put(
            `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`,
            {
              email: session.user.email,
              pubTem_id: pubTemId,
              sheetsData,
              asDraft: true,
            }
          );

          const recordsLoaded = response.data.recordsLoaded;
          setShowSuccessAnimation(true);
          showNotification({
            title: 'Borrador cargado.',
            message: `Se han precargado ${recordsLoaded} registros. Revisa la informacion en edicion en linea y haz clic en Guardar para confirmar.`,
            color: 'teal',
          });

          setTimeout(() => {
            setShowSuccessAnimation(false);
            onUploadSuccess();
            onClose();
          }, 3000);

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

          const response = await axios.put(
            `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`,
            {
              email: session.user.email,
              pubTem_id: pubTemId,
              data,
              asDraft: true,
            }
          );

          const recordsLoaded = response.data.recordsLoaded;
          setShowSuccessAnimation(true);
          showNotification({
            title: 'Borrador cargado.',
            message: `Se han precargado ${recordsLoaded} registros. Revisa la informacion en edicion en linea y haz clic en Guardar para confirmar.`,
            color: 'teal',
          });

          setTimeout(() => {
            setShowSuccessAnimation(false);
            onUploadSuccess();
            onClose();
          }, 3000);
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
            if (typeof window !== 'undefined') window.open('/logs', '_blank');
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

          <Button className={classes.control} size="md" radius="xl" onClick={() => openRef.current?.()}>
            Seleccionar archivos
          </Button>
        </>
      )}
    </div>
  );
}
