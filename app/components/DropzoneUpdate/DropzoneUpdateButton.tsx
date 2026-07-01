import { useEffect, useRef, useState } from 'react';
import { Text, Group, Button, rem, useMantineTheme } from '@mantine/core';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { IconCloudUpload, IconX, IconDownload } from '@tabler/icons-react';
import ExcelJS from 'exceljs';
import axios from 'axios';
import { useSession } from 'next-auth/react';
import classes from './DropzoneUpdateButton.module.css';
import { showNotification } from '@mantine/notifications';
import Lottie from 'lottie-react';
import successAnimation from "../../../public/lottie/success.json";
import { endOfDayGMT5 } from '../DateConfig';
import { getEffectiveRequired, isBlankRequiredValue } from '../../utils/requiredFields';

interface DropzoneButtonProps {
  pubTemId: string;
  endDate: Date | undefined;
  onClose: () => void;
  edit?: boolean;
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

const buildRequiredErrorDetails = (
  rows: Record<string, any>[],
  fields: any[]
) => fields
  .filter((field) => getEffectiveRequired(field))
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
      column: field.name,
      errors,
    };
  })
  .filter((detail) => detail.errors.length > 0);

const showRequiredUploadErrors = (details: any[]) => {
  localStorage.setItem('errorDetails', JSON.stringify(details));
  if (typeof window !== 'undefined') window.open('/logs', '_blank');

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

export function DropzoneUpdateButton({ pubTemId, endDate, onClose, edit = false }: DropzoneButtonProps) {
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

    const data: Record<string, any>[] = [];
    let hasInvalidColumns = false;

    const templateMeta = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${pubTemId}`);
    
    const fieldTypes: Record<string, string> = {};
    const fieldMultiples: Record<string, boolean> = {};
    const fieldValidatorLookup: Record<string, Map<string, string>> = {};

    const _vNorm = (s: string) =>
      String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    const _vStr = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      if (typeof v === 'object' && '$numberInt' in (v as any)) return String((v as any).$numberInt ?? '').trim();
      return String(v).trim();
    };

    const validators: any[] = templateMeta.data.template.validators || [];

    templateMeta.data.template.fields.forEach((f: any) => {
      fieldTypes[f.name] = f.datatype;
      fieldMultiples[f.name] = !!f.multiple;
      if (!f.validate_with || f.multiple) return;
      const validateWithStr = typeof f.validate_with === 'string'
        ? f.validate_with
        : (f.validate_with as any)?.name ?? '';
      if (!validateWithStr) return;

      const parts = validateWithStr.split(' - ');
      const validatorName = parts[0]?.trim();
      const preferredColumn = parts.slice(1).join(' - ').trim();
      if (!validatorName) return;

      const validator = validators.find((v: any) => _vNorm(v.name) === _vNorm(validatorName));
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

      if (lookup.size > 0) fieldValidatorLookup[f.name] = lookup;
    });

    const expectedColumns = Object.keys(fieldTypes);
    const guideHeaders = new Set(['CAMPO', 'COMENTARIO DEL CAMPO']);
    const sheet = workbook.worksheets.find((worksheet) => {
      const headerRow = worksheet.getRow(1);
      const worksheetHeaders: string[] = [];

      headerRow.eachCell({ includeEmpty: true }, (cell) => {
        worksheetHeaders.push(cell.text?.toString?.() ?? cell.value?.toString?.() ?? '');
      });

      const filledHeaders = worksheetHeaders.map((header) => header.trim()).filter(Boolean);
      if (filledHeaders.length === 0) return false;

      const normalizedHeaders = filledHeaders.map((header) => _vNorm(header));
      const isGuideSheet = normalizedHeaders.every((header) => guideHeaders.has(header));
      if (isGuideSheet) return false;

      return filledHeaders.some((header) => expectedColumns.includes(header));
    }) ?? workbook.worksheets[0];

    if (sheet) {
      let headers: string[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          headers = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            headers.push(cell.text?.toString?.() ?? cell.value?.toString?.() ?? '');
          });
          
          //  Validar columnas antes de procesar datos
          const invalidColumns = headers.filter(header => header && !expectedColumns.includes(header));
          
          if (invalidColumns.length > 0) {
            const errorDetails = invalidColumns.map(col => ({
              column: col,
              errors: [{
                register: 1,
                message: `Columna '${col}' no existe en la plantilla. Columnas válidas: ${expectedColumns.join(', ')}`,
                value: col
              }]
            }));
            
            localStorage.setItem("errorDetails", JSON.stringify(errorDetails));
            if (typeof window !== "undefined") window.open("/logs", "_blank");
            hasInvalidColumns = true;
            return;
          }
        } else {
          const rowData: Record<string, any> = {};

          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber === 0) return;

            const key = headers[colNumber - 1];
            const tipo = fieldTypes[key];
            const multiple = fieldMultiples[key];

            if (!key || tipo === undefined) return;

            let parsedValue: any = normalizeExcelCellValue(cell.value);
            
            // 🚨 Manejar errores de Excel específicamente
            if (typeof cell.value === 'object' && cell.value !== null && 'error' in cell.value) {
              parsedValue = `ERROR: ${cell.value.error}`;
            }
            // 🔍 Detectar si tiene hipervínculo
            else if (tipo === "Link" && (cell as any).hyperlink) {
              parsedValue = String(normalizeExcelCellValue(cell.value) || normalizeExcelCellValue((cell as any).hyperlink) || '');
            } else if (multiple) {
              // 🧠 Si es múltiple, trata el valor como string, incluso si el tipo de dato es numérico
              const rawValue = normalizeExcelCellValue(cell.value);
              const raw = String(rawValue ?? "").trim();
              parsedValue = raw.split(",").map(v => v.trim()).filter(Boolean);
            } else {
              // 🔑 Resolver código del validador ANTES de convertir el tipo
              // Soporta: "CC - Cédula de ciudadanía" → "CC", "1 - Financiero" → "1", "FINANCIERO" → "1"
              if (fieldValidatorLookup[key]) {
                const rawStr = _vStr(normalizeExcelCellValue(cell.value));
                if (rawStr) {
                  const found = fieldValidatorLookup[key].get(_vNorm(rawStr));
                  if (found !== undefined) parsedValue = found;
                }
              }

              switch (tipo) {
                case "Entero":
                  if (typeof parsedValue === 'object' && parsedValue !== null) {
                    parsedValue = normalizeExcelCellValue(parsedValue);
                  } else {
                    parsedValue = parseInt(String(parsedValue));
                    if (isNaN(parsedValue)) parsedValue = String(parsedValue);
                  }
                  break;

                case "Decimal":
                case "Porcentaje":
                  if (typeof parsedValue === 'object' && parsedValue !== null) {
                    parsedValue = normalizeExcelCellValue(parsedValue);
                  } else {
                    parsedValue = parseFloat(String(parsedValue));
                    if (isNaN(parsedValue)) parsedValue = String(parsedValue);
                  }
                  break;

                case "Fecha":
                  if (typeof parsedValue === 'object' && parsedValue !== null) {
                    parsedValue = normalizeExcelCellValue(parsedValue);
                  } else {
                    const dateValue = new Date(String(parsedValue));
                    parsedValue = isNaN(dateValue.getTime()) ? String(parsedValue) : dateValue.toISOString();
                  }
                  break;

                case "True/False":
                  if (typeof parsedValue === 'object' && parsedValue !== null) {
                    parsedValue = normalizeExcelCellValue(parsedValue);
                  } else {
                    parsedValue = String(parsedValue).toLowerCase() === "si" || parsedValue === true;
                  }
                  break;

                case "Texto Corto":
                case "Texto Largo":
                  parsedValue = String(normalizeExcelCellValue(parsedValue) ?? "");
                  break;

                case "Fecha Inicial / Fecha Final":
                  if (typeof parsedValue === 'object' && parsedValue !== null) {
                    parsedValue = normalizeExcelCellValue(parsedValue);
                  } else {
                    try {
                      parsedValue = JSON.parse(String(parsedValue));
                      if (!Array.isArray(parsedValue) || parsedValue.length !== 2) throw new Error();
                    } catch {
                      parsedValue = String(parsedValue);
                    }
                  }
                  break;

                default:
                  parsedValue = normalizeExcelCellValue(parsedValue);
              }
            }

            rowData[key] = parsedValue;
          });

          // Sanitizar datos antes de agregar
          const sanitizedRowData = Object.fromEntries(
            Object.entries(rowData).map(([key, value]) => [
              key,
              typeof value === 'object' && value !== null && !Array.isArray(value) ?
                normalizeExcelCellValue(value) : normalizeExcelCellValue(value)
            ])
          );

          data.push(sanitizedRowData);
        }
      });
    }

    // Si hay columnas inválidas, no continuar con el procesamiento
    if (hasInvalidColumns) {
      return;
    }

    // Sanitización final agresiva
    const finalSanitizedData = data.map(row => {
      const sanitizedRow: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        if (value === null || value === undefined) {
          sanitizedRow[key] = null;
        } else if (Array.isArray(value)) {
          sanitizedRow[key] = value.map(v => 
            typeof v === 'object' && v !== null ? normalizeExcelCellValue(v) : normalizeExcelCellValue(v)
          );
        } else if (typeof value === 'object') {
          sanitizedRow[key] = normalizeExcelCellValue(value);
        } else {
          sanitizedRow[key] = normalizeExcelCellValue(value);
        }
      }
      return sanitizedRow;
    });

    const requiredErrors = buildRequiredErrorDetails(
      finalSanitizedData,
      templateMeta.data.template.fields || []
    );
    if (requiredErrors.length > 0) {
      showRequiredUploadErrors(requiredErrors);
      return;
    }

    try {
      if (!session?.user?.email) throw new Error('Usuario no autenticado');

      const response = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`, {
        email: session.user.email,
        pubTem_id: pubTemId,
        data: finalSanitizedData,
        edit,
      });

      setShowSuccessAnimation(true);
      showNotification({
        title: 'Carga exitosa',
        message: `Se han cargado ${response.data.recordsLoaded} registros correctamente.`,
        color: 'teal',
      });

      setTimeout(() => {
        setShowSuccessAnimation(false);
        onClose();
      }, 3000);
    } catch (error) {
      console.error('Error enviando los datos al servidor:', error);
      if (axios.isAxiosError(error)) {
        console.error('Detalles del error:', error.response?.data);
        console.error(
          'Detalles del error JSON:',
          JSON.stringify(error.response?.data ?? {}, null, 2)
        );

        const normalizedErrors = normalizeBackendValidationErrors(error.response?.data);
        if (Array.isArray(normalizedErrors) && normalizedErrors.length > 0) {
          localStorage.setItem("errorDetails", JSON.stringify(normalizedErrors));
          if (typeof window !== "undefined") window.open("/logs", "_blank");
        } else {
          showNotification({
            title: "Error de validación",
            message: "No se pudieron procesar los errores.",
            color: "red",
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
