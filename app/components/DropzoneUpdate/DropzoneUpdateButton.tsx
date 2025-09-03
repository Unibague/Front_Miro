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
import { dateNow } from '../DateConfig';

interface DropzoneButtonProps {
  pubTemId: string;
  endDate: Date | undefined;
  onClose: () => void;
  edit?: boolean;
}

export function DropzoneUpdateButton({ pubTemId, endDate, onClose, edit = false }: DropzoneButtonProps) {
  const theme = useMantineTheme();
  const openRef = useRef<() => void>(null);
  const { data: session } = useSession();
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);

const handleFileDrop = async (files: File[]) => {
  if (endDate && new Date(endDate) < dateNow()) {
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

    templateMeta.data.template.fields.forEach((f: any) => {
      fieldTypes[f.name] = f.datatype;
      fieldMultiples[f.name] = !!f.multiple;
    });

    const sheet = workbook.worksheets[0];
    if (sheet) {
      let headers: string[] = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          headers = [];
          row.eachCell({ includeEmpty: true }, (cell) => {
            headers.push(cell.text?.toString?.() ?? cell.value?.toString?.() ?? '');
          });
          
          // 🚨 Validar columnas antes de procesar datos
          const expectedColumns = Object.keys(fieldTypes);
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

            let parsedValue: any = cell.value;
            
            // 🚨 Manejar errores de Excel específicamente
            if (typeof cell.value === 'object' && cell.value !== null && 'error' in cell.value) {
              parsedValue = `ERROR: ${cell.value.error}`;
            }
            // 🔍 Detectar si tiene hipervínculo
            else if (tipo === "Link" && (cell as any).hyperlink) {
              const hyperlink = (cell as any).hyperlink;
              parsedValue = typeof hyperlink === 'object' ? 
                (hyperlink.hyperlink || hyperlink.text || JSON.stringify(hyperlink)) : 
                String(hyperlink);
            } else if (multiple) {
              // 🧠 Si es múltiple, trata el valor como string, incluso si el tipo de dato es numérico
              let rawValue = cell.value;
              if (typeof rawValue === 'object' && rawValue !== null) {
                rawValue = JSON.stringify(rawValue);
              }
              const raw = String(rawValue ?? "").trim();
              parsedValue = raw.split(",").map(v => v.trim()).filter(Boolean);
            } else {
              switch (tipo) {
                case "Entero":
                  if (typeof cell.value === 'object' && cell.value !== null) {
                    parsedValue = String(cell.value);
                  } else {
                    parsedValue = parseInt(String(cell.value));
                    if (isNaN(parsedValue)) parsedValue = String(cell.value);
                  }
                  break;

                case "Decimal":
                case "Porcentaje":
                  if (typeof cell.value === 'object' && cell.value !== null) {
                    parsedValue = String(cell.value);
                  } else {
                    parsedValue = parseFloat(String(cell.value));
                    if (isNaN(parsedValue)) parsedValue = String(cell.value);
                  }
                  break;

                case "Fecha":
                  if (typeof cell.value === 'object' && cell.value !== null) {
                    parsedValue = String(cell.value);
                  } else {
                    const dateValue = new Date(String(cell.value));
                    parsedValue = isNaN(dateValue.getTime()) ? String(cell.value) : dateValue.toISOString();
                  }
                  break;

                case "True/False":
                  if (typeof cell.value === 'object' && cell.value !== null) {
                    parsedValue = String(cell.value);
                  } else {
                    parsedValue = String(cell.value).toLowerCase() === "si" || cell.value === true;
                  }
                  break;

                case "Texto Corto":
                case "Texto Largo":
                  parsedValue = typeof cell.value === 'object' && cell.value !== null ? 
                    JSON.stringify(cell.value) : String(cell.value ?? "");
                  break;

                case "Fecha Inicial / Fecha Final":
                  if (typeof cell.value === 'object' && cell.value !== null) {
                    parsedValue = JSON.stringify(cell.value);
                  } else {
                    try {
                      parsedValue = JSON.parse(String(cell.value));
                      if (!Array.isArray(parsedValue) || parsedValue.length !== 2) throw new Error();
                    } catch {
                      parsedValue = String(cell.value);
                    }
                  }
                  break;

                default:
                  // Asegurar que no se envíen objetos complejos
                  parsedValue = typeof cell.value === 'object' && cell.value !== null ? 
                    JSON.stringify(cell.value) : cell.value;
              }
            }

            rowData[key] = parsedValue;
          });

          // Sanitizar datos antes de agregar
          const sanitizedRowData = Object.fromEntries(
            Object.entries(rowData).map(([key, value]) => [
              key,
              typeof value === 'object' && value !== null && !Array.isArray(value) ?
                JSON.stringify(value) : value
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
            typeof v === 'object' && v !== null ? String(v) : v
          );
        } else if (typeof value === 'object') {
          sanitizedRow[key] = String(value);
        } else {
          sanitizedRow[key] = value;
        }
      }
      return sanitizedRow;
    });

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
        const details = error.response?.data.details;
        if (Array.isArray(details)) {
          localStorage.setItem("errorDetails", JSON.stringify(details));
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
