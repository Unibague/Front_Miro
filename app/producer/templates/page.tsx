"use client";

import { useEffect, useRef, useState } from "react";
import {
  Container,
  Table,
  Button,
  Pagination,
  Center,
  TextInput,
  Modal,
  Title,
  Group,
  Tooltip,
  Text,
  Badge,
  Select,
  CopyButton,
  Stack,
  Divider,
} from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowBigDownFilled,
  IconArrowBigUpFilled,
  IconArrowRight,
  IconArrowsTransferDown,
  IconBulb,
  IconChecks,
  IconDownload,
  IconEdit,
  IconPencil,
  IconUpload,
  IconQrcode,
} from "@tabler/icons-react";
import QRCode from "react-qr-code";
import { useSession } from "next-auth/react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { format } from "fecha";
import DateConfig, { dateNow, dateToGMT } from "@/app/components/DateConfig";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSort } from "../../hooks/useSort";
import ProducerUploadedTemplatesPage from "./uploaded/ProducerUploadedTemplates";
import { usePeriod } from "@/app/context/PeriodContext";
import {
  applyFieldCommentNote,
  applyValidatorDropdowns,
  applyWorkbookSheetDropdowns,
  extractWorkbookCommentsFromBase64,
  loadWorkbookFromBase64,
  sanitizeSheetName,
} from "@/app/utils/templateUtils";
import dayjs from "dayjs";
import "dayjs/locale/es";
import PublishedTemplatesPage from "@/app/responsible/children-dependencies/reports/page";

const DropzoneButton = dynamic(
  () =>
    import("@/app/components/Dropzone/DropzoneButton").then(
      (mod) => mod.DropzoneButton
    ),
  { ssr: false }
);

interface Category {
  name: string;
}

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  validate_with?: string;
  comment?: string;
  multiple:boolean;
  dropdown_options?: string[];
  header_row?: number;
  column?: number;
}

interface Dimension {
  _id: string;
  name: string;
}

interface Category{
  _id: string,
  name:string,
  templateSequence: number
}

interface Producer {
  _id: string;
  dep_code: string;
  name: string;
}

interface Template {
  _id: string;
  name: string;
  file_name: string;
  dimensions: [Dimension];
  file_description: string;
  fields: Field[];
  workbook_sheets?: TemplateWorksheet[];
  original_workbook_base64?: string;
  active: boolean;
  category: Category;
  producers?: Producer[];
}

interface TemplateWorksheet {
  name: string;
  fields: Field[];
  preserveOriginalContent?: boolean;
  rawRows?: any[][];
  cellNotes?: { row: number; col: number; note: string }[];
  columnWidths?: number[];
  producers?: string[];
  shared?: boolean;
}

interface FilledFieldData {
  field_name: string;
  values: any[];
}

interface ProducerData {
  dependency: string;
  send_by: any;
  loaded_date: Date;
  filled_data: FilledFieldData[];
}

interface Validator {
  name: string;
  values: any[];
}

interface Period {
  name: string;
  producer_end_date: Date;
}

interface PublishedTemplate {
  _id: string;
  name: string;
  published_by: any;
  template: Template;
  period: Period;
  producers_dep_code: string[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  loaded_data: ProducerData[];
  validators: Validator[];
  deadline: string | Date;
  isPending: boolean;
  category_name?: string;
      sequence: number;
}

const ProducerTemplatesPage = () => {
  const { selectedPeriodId } = usePeriod();
  const router = useRouter();
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<PublishedTemplate[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20); // Nuevo estado para el tamaño de página
  const [producerEndDate, setProducerEndDate] = useState<Date | undefined>();
  const [nextDeadline, setNextDeadline] = useState<Date | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [uploadModalOpen, { open: openUploadModal, close: closeUploadModal }] =
    useDisclosure(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [qrTemplateName, setQrTemplateName] = useState('');
  const qrRef = useRef<HTMLDivElement>(null);

  const getQrBaseUrl = () => {
    const configuredUrl = process.env.NEXT_PUBLIC_QR_BASE_URL?.trim().replace(/\/+$/, "");
    const currentOrigin = window.location.origin.replace(/\/+$/, "");
    if (!configuredUrl) return currentOrigin;
    try {
      const host = new URL(configuredUrl).hostname;
      const isDockerInternalIp = /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      return isDockerInternalIp ? currentOrigin : configuredUrl;
    } catch {
      return currentOrigin;
    }
  };

  const downloadQR = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, size, size);
      const link = document.createElement('a');
      link.download = `QR_${qrTemplateName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
  };
  const [userDependencies, setUserDependencies] = useState<{value: string, label: string}[]>([]);
  const [selectedDependency, setSelectedDependency] = useState<string>('');
  const { sortedItems: sortedTemplates, handleSort, sortConfig } = useSort<PublishedTemplate>(templates, { key: null, direction: "asc" });

  // const fetchPublishedTemplates = async () => {
  //   try {
  //     const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/categories/published-templates`);
  //     if (response.data) {
  //       setTemplates(response.data.publishedTemplates); // Suponiendo que el JSON contiene la lista en "publishedTemplates"
  //     }
  //   } catch (error) {
  //     console.error("Error al obtener los templates publicados:", error);
  //   }
  // };
  
  // useEffect(() => {
  //   fetchPublishedTemplates();
  // }, []);
  
  const fetchTemplates = async (page?: number, search?: string, filterByDependency?: string, limit?: number) => {
    try {
      const params: any = {
        email: session?.user?.email,
        page,
        limit: limit || pageSize, // Usar el pageSize seleccionado
        search,
        periodId: selectedPeriodId,
      };
      
      if (filterByDependency) {
        params.filterByDependency = filterByDependency;
      }
      
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/available`,
        { params }
      );
      if (response.data) {
        setTemplates(response.data.templates || []);
        setTotalPages(response.data.pages || 1);
        setPendingCount(response.data.templates.length || 0);
      }
    } catch (error) {
      setTemplates([]);
      setPendingCount(0);
    }
  };

  const fetchUserDependencies = async () => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/users-with-dependencies`
      );
      const userData = response.data.find((user: any) => user.email === session?.user?.email);
      if (userData) {
        const depsResponse = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/user-dependencies/dependencies-list`
        );
        
        // Separar dependencia principal de las adicionales
        const mainDep = depsResponse.data.find((dep: any) => dep.dep_code === userData.dep_code);
        const additionalDeps = depsResponse.data
          .filter((dep: any) => (userData.additional_dependencies || []).includes(dep.dep_code))
          .map((dep: any) => ({
            value: dep.dep_code,
            label: `${dep.dep_code} - ${dep.name}`
          }));
        
        // Poner la dependencia principal primero
        const availableDeps = [
          { value: mainDep.dep_code, label: `${mainDep.dep_code} - ${mainDep.name}` },
          ...additionalDeps
        ];
        
        setUserDependencies(availableDeps);
      }
    } catch (error) {
      console.error('Error fetching user dependencies:', error);
    }
  };

  useEffect(() => {
    console.log("Template con categoría:", PublishedTemplatesPage);  // Verifica que category esté poblado correctamente
  }, [PublishedTemplatesPage]);
  

  useEffect(() => {
    console.log("ID de período seleccionado en la page:", selectedPeriodId);
    if (session?.user?.email && selectedPeriodId) {
      fetchTemplates(page, search, selectedDependency, pageSize);
      fetchUserDependencies();
    }
  }, [page, search, session, selectedPeriodId, selectedDependency, pageSize]); // Agregar pageSize a las dependencias  

  const refreshTemplates = () => {
    if (session?.user?.email) {
      fetchTemplates(page, search, selectedDependency, pageSize);
    }
  };
  
  // Función para manejar el cambio de tamaño de página
  const handlePageSizeChange = (newPageSize: string | null) => {
    if (newPageSize) {
      setPageSize(parseInt(newPageSize));
      setPage(1); // Resetear a la primera página cuando cambie el tamaño
    }
  };

  const getCurrentDependencyTitle = () => {
    if (!selectedDependency) {
      // Mostrar la dependencia principal (siempre la primera en la lista)
      const mainDependency = userDependencies[0];
      return mainDependency ? mainDependency.label.split(' - ')[1] : 'Cargando...';
    }
    const dependency = userDependencies.find(dep => dep.value === selectedDependency);
    return dependency ? dependency.label.split(' - ')[1] : selectedDependency;
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchTemplates(page, search, selectedDependency, pageSize);
    }
  }, [page, session]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (session?.user?.email) {
        fetchTemplates(page, search, selectedDependency, pageSize);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  useEffect(() => {
    if (templates.length === 0) {
      setNextDeadline(null);
      return;
    }

    const deadlines = templates
      .map((t) => new Date(t.deadline))
      .filter((date) => !isNaN(date.getTime()));

    if (deadlines.length > 0) {
      setNextDeadline(new Date(Math.min(...deadlines.map((date) => date.getTime()))));
    } else {
      setNextDeadline(null);
    }
  }, [templates]);
  

  const handleDownload = async (publishedTemplate: PublishedTemplate) => {
    const { template, validators } = publishedTemplate;
    const workbookSheets = (template.workbook_sheets || []).filter(
      (sheet) => sheet.preserveOriginalContent || sheet.rawRows?.length || sheet.fields?.length > 0
    );

    // Mapa de ID de productor → dep_code para resolver las hojas
    const producerIdMap = new Map<string, string>();
    (template.producers || []).forEach((p) => {
      if (p._id && p.dep_code) producerIdMap.set(p._id.toString(), p.dep_code);
    });

    // dep_codes del usuario actual (principal + adicionales)
    const userDepCodes = new Set(userDependencies.map((d) => d.value));

    // Hojas editables: solo si tiene productores asignados Y el usuario es uno de ellos
    // Hojas sin productores (ej. INFO) → siempre bloqueadas
    const canUserEditSheet = (sheet: TemplateWorksheet): boolean => {
      if (!sheet.producers || sheet.producers.length === 0) return false;
      return sheet.producers.some((producerId) => {
        const depCode = producerIdMap.get(producerId.toString());
        return depCode !== undefined && userDepCodes.has(depCode);
      });
    };

    const applySheetTabColor = (ws: ExcelJS.Worksheet, editable: boolean) => {
      ws.properties.tabColor = { argb: editable ? 'FF00B050' : 'FFC00000' };
    };

    // Pre-rellena una hoja compartida con los datos ya subidos por otro productor
    const prefillSharedSheet = (ws: ExcelJS.Worksheet, sheet: TemplateWorksheet, startDataRow: number) => {
      if (!sheet.shared) return;
      // Buscar qué dep_codes están asignados a esta hoja
      const sheetDepCodes = new Set(
        (sheet.producers || []).map((id) => producerIdMap.get(id.toString())).filter(Boolean) as string[]
      );
      // Encontrar datos cargados por alguno de esos productores
      const uploadedEntry = publishedTemplate.loaded_data?.find((ld) => sheetDepCodes.has(ld.dependency));
      if (!uploadedEntry || !uploadedEntry.filled_data?.length) return;

      const fieldValueMap = new Map<string, any[]>();
      uploadedEntry.filled_data.forEach((fd) => fieldValueMap.set(fd.field_name, fd.values));

      const maxRows = Math.max(...sheet.fields.map((f) => (fieldValueMap.get(f.name) || []).length), 0);
      for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
        const wsRow = ws.getRow(startDataRow + rowIdx);
        sheet.fields.forEach((field, colIdx) => {
          wsRow.getCell(colIdx + 1).value = fieldValueMap.get(field.name)?.[rowIdx] ?? null;
        });
      }
    };

    if (template.original_workbook_base64) {
      const workbook = await loadWorkbookFromBase64(template.original_workbook_base64);
      const originalCommentsBySheet = await extractWorkbookCommentsFromBase64(template.original_workbook_base64);

      // Re-apply all notes extracted via JSZip (ExcelJS may not load note text from xlsx correctly)
      for (const [sheetName, sheetComments] of originalCommentsBySheet.entries()) {
        const ws = workbook.getWorksheet(sheetName);
        if (!ws) continue;
        for (const [cellRef, noteText] of sheetComments.entries()) {
          if (noteText) applyFieldCommentNote(ws.getCell(cellRef), noteText);
        }
      }

      // Also apply cellNotes stored in the template snapshot (fallback for older imports)
      (template.workbook_sheets || []).forEach((sheet) => {
        const ws = workbook.getWorksheet(sheet.name);
        if (!ws || !sheet.cellNotes?.length) return;
        sheet.cellNotes.forEach((note) => {
          if (note?.row && note?.col && note?.note) {
            applyFieldCommentNote(ws.getCell(note.row, note.col), note.note);
          }
        });
      });

      applyWorkbookSheetDropdowns({
        workbook,
        workbookSheets,
        validators,
        originalCommentsBySheet,
      });

      // Pre-rellenar hojas compartidas y bloqueadas con datos de otros productores
      for (const sheet of workbookSheets) {
        if (!canUserEditSheet(sheet) && sheet.shared) {
          const ws = workbook.getWorksheet(sheet.name);
          if (ws) {
            // Detectar la primera fila de datos (la siguiente al encabezado)
            const headerRow = sheet.fields.length > 0 && sheet.fields[0].header_row
              ? sheet.fields[0].header_row
              : 1;
            prefillSharedSheet(ws, sheet, headerRow + 1);
          }
        }
      }

      // Aplicar color de pestaña y proteger hojas según permisos
      for (const sheet of workbookSheets) {
        const editable = canUserEditSheet(sheet);
        const ws = workbook.getWorksheet(sheet.name);
        if (ws) {
          applySheetTabColor(ws, editable);
          if (!editable) await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      saveAs(blob, `${template.file_name}.xlsx`);
      return;
    }

    const workbook = new ExcelJS.Workbook();

    if (workbookSheets.length > 0) {
      // Mapa de nombre original de hoja → nombre real en el workbook (puede tener sufijo por deduplicación)
      const sheetNameMap = new Map<string, string>();

      for (let sheetIndex = 0; sheetIndex < workbookSheets.length; sheetIndex++) {
        const sheet = workbookSheets[sheetIndex];
        const baseName = sanitizeSheetName(sheet.name || `Hoja_${sheetIndex + 1}`) || `Hoja_${sheetIndex + 1}`;
        let worksheetName = baseName;
        let counter = 1;
        while (workbook.getWorksheet(worksheetName)) {
          const suffix = `_${counter}`;
          worksheetName = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
          counter += 1;
        }
        sheetNameMap.set(sheet.name, worksheetName);

        if (sheet.preserveOriginalContent) {
          const worksheet = workbook.addWorksheet(worksheetName);
          (sheet.rawRows || []).forEach((row) => worksheet.addRow(row || []));
          (sheet.columnWidths || []).forEach((width, index) => {
            worksheet.getColumn(index + 1).width = width || 20;
          });
          (sheet.cellNotes || []).forEach((note) => {
            if (!note?.row || !note?.col || !note?.note) return;
            worksheet.getCell(note.row, note.col).note = note.note;
          });
          applyValidatorDropdowns({
            workbook,
            worksheet,
            fields: sheet.fields,
            validators,
            startRow: 2,
            endRow: 1000,
          });
          continue;
        }

        const worksheet = workbook.addWorksheet(worksheetName);
        const headerRow = worksheet.addRow(sheet.fields.map((field) => field.name));
        headerRow.eachCell((cell, colNumber) => {
          cell.font = { bold: true, color: { argb: "FFFFFF" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "0f1f39" },
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = { vertical: "middle", horizontal: "center" };

          const field = sheet.fields[colNumber - 1];
          applyFieldCommentNote(cell, field.comment);
        });

        worksheet.columns.forEach((column) => {
          column.width = 20;
        });

        applyValidatorDropdowns({
          workbook,
          worksheet,
          fields: sheet.fields,
          validators,
          startRow: 2,
          endRow: 1000,
        });
      }

      // Pre-rellenar hojas compartidas y bloqueadas con datos de otros productores
      for (const sheet of workbookSheets) {
        if (!canUserEditSheet(sheet) && sheet.shared) {
          const actualName = sheetNameMap.get(sheet.name) || sheet.name;
          const ws = workbook.getWorksheet(actualName);
          if (ws) prefillSharedSheet(ws, sheet, 2);
        }
      }

      // Aplicar color de pestaña y proteger hojas según permisos
      for (const sheet of workbookSheets) {
        const editable = canUserEditSheet(sheet);
        const actualName = sheetNameMap.get(sheet.name) || sheet.name;
        const ws = workbook.getWorksheet(actualName);
        if (ws) {
          applySheetTabColor(ws, editable);
          if (!editable) await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      saveAs(blob, `${template.file_name}.xlsx`);
      return;
    }

    // Crear la hoja principal basada en el template
    const worksheet = workbook.addWorksheet(template.name);
    const headerRow = worksheet.addRow(
      template.fields.map((field) => field.name)
    );
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "0f1f39" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };

      const field = template.fields[colNumber - 1];
      applyFieldCommentNote(cell, field.comment);
    });

    template.fields.forEach((field, index) => {
      const colNumber = index + 1;
      const maxRows = 1000;
      for (let i = 2; i <= maxRows; i++) {
        const row = worksheet.getRow(i);
        const cell = row.getCell(colNumber);

        // 💡 Forzar formato de texto si el tipo es Texto Corto o Texto Largo
if (field.multiple || field.datatype === "Texto Corto" || field.datatype === "Texto Largo") {
  cell.numFmt = "@";
}

  // ⛔️ Omitir validaciones si es campo múltiple
if (field.multiple) {
  continue; // skip validations
}
    
        switch (field.datatype) {
          case 'Entero':
            cell.dataValidation = {
              type: 'whole',
              operator: 'greaterThanOrEqual',
              formulae: [0],
              showErrorMessage: true,
              errorTitle: 'Valor no válido',
              error: 'Por favor, introduce un número entero.'
            };
            break;
          case 'Decimal':
            cell.dataValidation = {
              type: 'decimal',
              operator: 'between',
              formulae: [0.0, 9999999999999999999999999999999],
              showErrorMessage: true,
              errorTitle: 'Valor no válido',
              error: 'Por favor, introduce un número decimal.'
            };
            break;
          case 'Porcentaje':
            cell.dataValidation = {
              type: 'decimal',
              operator: 'between',
              formulae: [0.0, 100.0],
              showErrorMessage: true,
              errorTitle: 'Valor no válido',
              error: 'Por favor, introduce un número decimal entre 0.0 y 100.0.'
            };
            break;
          case 'Texto Corto':
            cell.dataValidation = {
              type: 'textLength',
              operator: 'lessThanOrEqual',
              formulae: [60],
              showErrorMessage: true,
              errorTitle: 'Valor no válido',
              error: 'Por favor, introduce un texto de hasta 60 caracteres.'
            };
            break;
          case 'Texto Largo':
            cell.dataValidation = {
              type: 'textLength',
              operator: 'lessThanOrEqual',
              formulae: [500],
              showErrorMessage: true,
              errorTitle: 'Valor no válido',
              error: 'Por favor, introduce un texto de hasta 500 caracteres.'
            };
            break;
          case 'True/False':
            cell.dataValidation = {
              type: 'list',
              allowBlank: true,
              formulae: ['"Si,No"'],
              showErrorMessage: true,
              errorTitle: 'Valor no válido',
              error: 'Por favor, selecciona Si o No.'
            };
            break;
          case 'Fecha':
          case 'Fecha Inicial / Fecha Final':
            cell.dataValidation = {
              type: 'date',
              operator: 'between',
              formulae: [new Date(1900, 0, 1), new Date(9999, 11, 31)],
              showErrorMessage: true,
              errorTitle: 'Valor no válido',
              error: 'Por favor, introduce una fecha válida en el formato DD/MM/AAAA.'
            };
            cell.numFmt = 'DD/MM/YYYY';
            break;
          case 'Link':
            cell.dataValidation = {
              type: 'textLength',
              operator: 'greaterThan',
              formulae: [0],
              showErrorMessage: true,
              errorTitle: 'Valor no válido',
              error: 'Por favor, introduce un enlace válido.'
            };
            break;
          default:
            break;
        }

        if (field.comment && cell.dataValidation) {
          const normalizedComment = field.comment.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
          const promptBase = normalizedComment.slice(0, 220);
          const promptText = normalizedComment.length > 220
            ? `${promptBase}...`
            : promptBase;
          cell.dataValidation = {
            ...cell.dataValidation,
            showInputMessage: true,
            promptTitle: field.name.slice(0, 32),
            prompt: promptText,
          };
        }
      }
    });

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    applyValidatorDropdowns({
      workbook,
      worksheet,
      fields: template.fields,
      validators,
      startRow: 2,
      endRow: 1000,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    saveAs(blob, `${template.file_name}.xlsx`);
  };

  const categoryColors = [
    'blue', 
    'cyan', 
    'grape', 
    'indigo', 
    'violet', 
    'teal', 
    'green'
  ];
  
  const getCategoryColor = (categoryName: any) => {
    if (!categoryName || categoryName === 'Sin categoría') return 'gray';
    
    // Simple hash function to generate consistent colors
    const hashCode = (str: any) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32-bit integer
      }
      return Math.abs(hash);
    };
  
    // Use the hash to select a color from the predefined palette
    return categoryColors[hashCode(categoryName) % categoryColors.length];
  };

  const handleUploadClick = async (publishedTemplate: PublishedTemplate) => {
    if(handleDisableUpload(publishedTemplate)) {
      showNotification({
        title: "Error",
        message: "El periodo ya se encuentra cerrado",
        color: "red",
      })
      return;
    }
    
    // Verificar si ya tiene información cargada
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/hasData/${publishedTemplate._id}`, {
        params: { email: session?.user?.email },
      });
      const hasData = response.data.hasData;
      
      if (hasData) {
        // Mostrar modal de advertencia si ya tiene datos
        modals.openConfirmModal({
          title: "⚠️ Plantilla con información existente",
          centered: true,
          children: (
            <Text size="sm">
              Esta plantilla ya contiene información cargada previamente.
              <br /><br />
              <strong>¿Estás seguro de que deseas reemplazar la información existente?</strong>
              <br /><br />
              Esta acción <strong>eliminará todos los datos actuales</strong> y los reemplazará con la nueva información que subas.
            </Text>
          ),
          labels: { confirm: "Sí, reemplazar información", cancel: "Cancelar" },
          confirmProps: { color: "red" },
          onConfirm: () => {
            setSelectedTemplateId(publishedTemplate._id);
            openUploadModal();
          },
        });
      } else {
        // Mostrar modal de confirmación normal si no tiene datos
        modals.openConfirmModal({
          title: "Confirmar carga de información",
          centered: true,
          children: (
            <Text size="sm">
              ¿Estás seguro de que deseas cargar información en la plantilla <strong>&quot;{publishedTemplate.name}&quot;</strong>?
              <br /><br />
              Asegúrate de que el archivo Excel tenga el formato correcto y contenga toda la información necesaria.
            </Text>
          ),
          labels: { confirm: "Sí, cargar información", cancel: "Cancelar" },
          confirmProps: { color: "blue" },
          onConfirm: () => {
            setSelectedTemplateId(publishedTemplate._id);
            openUploadModal();
          },
        });
      }
    } catch (error) {
      console.error("Error verificando datos:", error);
      // En caso de error, proceder normalmente
      setSelectedTemplateId(publishedTemplate._id);
      openUploadModal();
    }
  };

  const handleEmptySubmit = async (pubTemId: string) => {
    // Verificar si ya tiene información cargada
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/hasData/${pubTemId}`);
      const hasData = response.data.hasData;
      
      if (hasData) {
        // Mostrar modal de advertencia si ya tiene datos
        modals.openConfirmModal({
          title: "⚠️ Reemplazar información existente",
          centered: true,
          children: (
            <Text size="sm">
              Esta plantilla ya contiene información cargada previamente.
              <br /><br />
              <strong>¿Estás seguro de que deseas enviar en ceros?</strong>
              <br /><br />
              Esta acción <strong>eliminará todos los datos actuales</strong> y los reemplazará con ceros.
            </Text>
          ),
          labels: { confirm: "Sí, enviar en ceros", cancel: "Cancelar" },
          confirmProps: { color: "red" },
          onConfirm: async () => {
            try {
              await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/submitEmpty`, {
                pubTemId,
                email: session?.user?.email
              });
              showNotification({
                title: "Enviado",
                message: "Se ha enviado la información en ceros",
                color: "teal",
              });
              refreshTemplates();
            } catch (error) {
              console.error("Error enviando en ceros:", error);
              showNotification({
                title: "Error",
                message: "Hubo un error al enviar en ceros",
                color: "red",
              });
            }
          },
        });
      } else {
        // Mostrar confirmación normal si no tiene datos
        modals.openConfirmModal({
          title: "Confirmar envío en ceros",
          centered: true,
          children: (
            <Text size="sm">
              ¿Estás seguro de que deseas enviar esta plantilla con información en ceros?
              <br /><br />
              Esto significa que reportarás que no tienes datos para esta plantilla en este periodo.
            </Text>
          ),
          labels: { confirm: "Sí, enviar en ceros", cancel: "Cancelar" },
          confirmProps: { color: "orange" },
          onConfirm: async () => {
            try {
              await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/submitEmpty`, {
                pubTemId,
                email: session?.user?.email
              });
              showNotification({
                title: "Enviado",
                message: "Se ha enviado la información en ceros",
                color: "teal",
              });
              refreshTemplates();
            } catch (error) {
              console.error("Error enviando en ceros:", error);
              showNotification({
                title: "Error",
                message: "Hubo un error al enviar en ceros",
                color: "red",
              });
            }
          },
        });
      }
    } catch (error) {
      console.error("Error verificando datos:", error);
      // En caso de error, proceder normalmente
      try {
        await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/submitEmpty`, {
          pubTemId,
          email: session?.user?.email
        });
        showNotification({
          title: "Enviado",
          message: "Se ha enviado la información en ceros",
          color: "teal",
        });
        refreshTemplates();
      } catch (error) {
        console.error("Error enviando en ceros:", error);
        showNotification({
          title: "Error",
          message: "Hubo un error al enviar en ceros",
          color: "red",
        });
      }
    }
  }
  const handleGenerateQR = async (pubTemId: string, templateName: string) => {
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/qr/generate`,
        { pubTemId, email: session?.user?.email }
      );
      const token = response.data.token;
      const baseUrl = getQrBaseUrl();
      const formUrl = `${baseUrl}/public/form/${token}`;
      setQrUrl(formUrl);
      setQrTemplateName(templateName);
      setQrModalOpen(true);
    } catch (error) {
      showNotification({
        title: 'Error',
        message: 'No se pudo generar el código QR',
        color: 'red',
      });
    }
  };

  const handleDisableUpload = (publishedTemplate: PublishedTemplate) => {
    const now = new Date();
    const deadline = new Date(publishedTemplate.deadline);
    
    // Establecer la hora del deadline al final del día (23:59:59
    deadline.setHours(23, 59, 59, 999);
    
    return now > deadline;
  };

  const rows = sortedTemplates.map((publishedTemplate) => {
    //console.log("Published Template:", publishedTemplate); // Agregar el log aquí para inspeccionar los datos
    const uploadDisable = handleDisableUpload(publishedTemplate);
    return (
      <Table.Tr key={publishedTemplate._id}>
<Table.Td>
  <Badge 
    size="lg"
    variant="light" 
    color={getCategoryColor(publishedTemplate.template.category.name)}
    fullWidth
    rightSection={
      publishedTemplate.template.category.templateSequence ? (
        <Text size="lg" fw={700}>
          #{publishedTemplate.template.category.templateSequence}
        </Text>
      ) : null
    }
  >
     {publishedTemplate.template.category.name || 'Sin categoría'}
  </Badge>
</Table.Td>

        <Table.Td>{publishedTemplate.period.name}</Table.Td>
        <Table.Td>{publishedTemplate.name}</Table.Td>
        <Table.Td>
  <Text ta="justify">
    {publishedTemplate.template.file_description}
  </Text>
</Table.Td>

        <Table.Td>{publishedTemplate.template.dimensions.map(dim => dim.name).join(', ')}</Table.Td>
        <Table.Td fw={700}>
          {dateToGMT(publishedTemplate.deadline ?? publishedTemplate.period.producer_end_date)}
        </Table.Td>
        <Table.Td>
          <Center>
            <Group gap="xs">
              <Tooltip
                label="Descargar plantilla"
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="outline"
                  onClick={() => handleDownload(publishedTemplate)}
                >
                  <IconDownload size={16} />
                </Button>
              </Tooltip>
              <Tooltip
                label="Generar código QR"
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="outline"
                  color="violet"
                  onClick={() => handleGenerateQR(publishedTemplate._id, publishedTemplate.name)}
                >
                  <IconQrcode size={16} />
                </Button>
              </Tooltip>
            </Group>
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
            <Group>
              <Tooltip
                label={
                  uploadDisable
                    ? "El periodo ya se encuentra cerrado"
                    : "Realizar envío en ceros"
                }
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="outline"
                  color="green"
                  onClick={() => handleEmptySubmit(publishedTemplate._id)}
                  disabled={uploadDisable}
                >
                  Reporte en cero
                </Button>
              </Tooltip>
              <Tooltip
                label={
                  uploadDisable
                    ? "El periodo ya se encuentra cerrado"
                    : "Cargar plantilla (Hoja de cálculo)"
                }
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="outline"
                  color="green"
                  onClick={() => handleUploadClick(publishedTemplate)}
                  disabled={uploadDisable}
                >
                  <IconUpload size={16} />
                </Button>
              </Tooltip>
              <Tooltip
                label={
                  uploadDisable
                    ? "El periodo ya se encuentra cerrado"
                    : "Edición en línea"
                }
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="outline"
                  color="green"
                  onClick={() =>
                    router.push(
                      `/producer/templates/form/${publishedTemplate._id}`
                    )
                  }
                  disabled={uploadDisable}
                >
                  <IconPencil size={16} />
                </Button>
              </Tooltip>
            </Group>
          </Center>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Container size="xl">
      <DateConfig />
      <Title ta="center" mb={"md"}>
        Plantillas Pendientes
      </Title>
      <Title order={3} ta="center" mb={"md"} c="blue">
        {getCurrentDependencyTitle()}
      </Title>
      <Text ta="center" mt="sm" mb="md">
    Tienes <strong>{pendingCount}</strong> plantilla
    {pendingCount === 1 ? "" : "s"} pendiente
    {pendingCount === 1 ? "" : "s"}.
    <br />
    {nextDeadline ? (
      <>
        La fecha de vencimiento es el{" "}
        <strong>{dayjs(nextDeadline).format("DD/MM/YYYY")}</strong>.
      </>
    ) : (
      <>No hay fecha de vencimiento próxima.</>
    )}
  </Text>
      <Group mb="md">
        <TextInput
          placeholder="Buscar plantillas"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          placeholder="Filtrar por dependencia"
          data={[
            { value: '', label: 'Todas las dependencias' },
            ...userDependencies
          ]}
          value={selectedDependency}
          onChange={(value) => setSelectedDependency(value || '')}
          clearable
          searchable
          style={{ minWidth: 300 }}
        />
        <Select
          label="Plantillas por página"
          placeholder="Seleccionar cantidad"
          data={[
            { value: '10', label: '10 por página' },
            { value: '15', label: '15 por página' },
            { value: '20', label: '20 por página' },
            { value: '25', label: '25 por página' },
            { value: '50', label: '50 por página' }
          ]}
          value={pageSize.toString()}
          onChange={handlePageSizeChange}
          style={{ minWidth: 150 }}
        />
      </Group>
      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
          <Table.Th
  onClick={() => handleSort("template.category.name")}
  style={{ cursor: "pointer" }}
>
  <Center inline>
    Categoría/Secuencia
    {sortConfig.key === "template.category.name" ? (
      sortConfig.direction === "asc" ? (
        <IconArrowBigUpFilled size={16} style={{ marginLeft: "5px" }} />
      ) : (
        <IconArrowBigDownFilled size={16} style={{ marginLeft: "5px" }} />
      )
    ) : (
      <IconArrowsTransferDown size={16} style={{ marginLeft: "5px" }} />
    )}
  </Center>
</Table.Th>


          <Table.Th onClick={() => handleSort("period.name")} style={{ cursor: "pointer" }}>
              <Center inline>
                Periodo
                {sortConfig.key === "period.name" ? (
                  sortConfig.direction === "asc" ? (
                    <IconArrowBigUpFilled size={16} style={{ marginLeft: "5px" }} />
                  ) : (
                    <IconArrowBigDownFilled size={16} style={{ marginLeft: "5px" }} />
                  )
                ) : (
                  <IconArrowsTransferDown size={16} style={{ marginLeft: "5px" }} />
                )}
              </Center>
            </Table.Th>
            <Table.Th onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
              <Center inline>
                Nombre
                {sortConfig.key === "name" ? (
                  sortConfig.direction === "asc" ? (
                    <IconArrowBigUpFilled size={16} style={{ marginLeft: "5px" }} />
                  ) : (
                    <IconArrowBigDownFilled size={16} style={{ marginLeft: "5px" }} />
                  )
                ) : (
                  <IconArrowsTransferDown size={16} style={{ marginLeft: "5px" }} />
                )}
              </Center>
            </Table.Th>
            <Table.Th onClick={() => handleSort("template.dimension.file_description")} style={{ cursor: "pointer" }}>
            <Center inline>
                Descripción
                {sortConfig.key === "template.dimension.file_description" ? (
                  sortConfig.direction === "asc" ? (
                    <IconArrowBigUpFilled size={16} style={{ marginLeft: "5px" }} />
                  ) : (
                    <IconArrowBigDownFilled size={16} style={{ marginLeft: "5px" }} />
                  )
                ) : (
                  <IconArrowsTransferDown size={16} style={{ marginLeft: "5px" }} />
                )}
              </Center>
            </Table.Th>
            <Table.Th onClick={() => handleSort("template.dimension.name")} style={{ cursor: "pointer" }}>
              <Center inline>
                Ámbito
                {sortConfig.key === "template.dimension.name" ? (
                  sortConfig.direction === "asc" ? (
                    <IconArrowBigUpFilled size={16} style={{ marginLeft: "5px" }} />
                  ) : (
                    <IconArrowBigDownFilled size={16} style={{ marginLeft: "5px" }} />
                  )
                ) : (
                  <IconArrowsTransferDown size={16} style={{ marginLeft: "5px" }} />
                )}
              </Center>
            </Table.Th>
            <Table.Th>
              <Center inline>
                Fecha Límite
              </Center>
            </Table.Th>
            <Table.Th>
              <Center>Descargar</Center>
            </Table.Th>
            <Table.Th>
              <Center>Subir Información</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {templates.length > 0 ? (
            rows
          ) : (
            <Table.Tr>
              <Table.Td colSpan={7}>
                <Center>
                  <p>No hay registros para este período.</p>
                </Center>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>
      <Center>
        <Group mt={15} align="center">
          <Pagination
            value={page}
            onChange={setPage}
            total={totalPages}
            siblings={1}
            boundaries={3}
          />
          <Text size="sm" c="dimmed">
            Mostrando {pageSize} plantillas por página
          </Text>
        </Group>
      </Center>

      <Modal
        opened={uploadModalOpen}
        onClose={closeUploadModal}
        title="Subir Información"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        size="50%"
        centered
        withCloseButton={false}
      >
        {selectedTemplateId && (
          <DropzoneButton
            pubTemId={selectedTemplateId}
            endDate={producerEndDate}
            onClose={closeUploadModal}
            onUploadSuccess={refreshTemplates}
          />
        )}
      </Modal>
      <ProducerUploadedTemplatesPage
        fetchTemp={fetchTemplates}
        selectedDependency={selectedDependency}
        userDependencies={userDependencies}
      />

      <Modal
        opened={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title={`Código QR — ${qrTemplateName}`}
        centered
        size="md"
      >
        <Stack align="center" gap="md">
          <div ref={qrRef}>
            <QRCode value={qrUrl} size={220} />
          </div>
          <Divider w="100%" />
          <Text size="xs" ta="center" style={{ wordBreak: 'break-all' }}>
            <a href={qrUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1c7ed6' }}>
              {qrUrl}
            </a>
          </Text>
          <Group>
            <Button leftSection={<IconDownload size={16} />} color="blue" onClick={downloadQR}>
              Descargar QR
            </Button>
            <CopyButton value={qrUrl}>
              {({ copied, copy }) => (
                <Button color={copied ? 'teal' : 'violet'} onClick={copy}>
                  {copied ? 'Enlace copiado' : 'Copiar enlace'}
                </Button>
              )}
            </CopyButton>
            <Button variant="outline" onClick={() => setQrModalOpen(false)}>
              Cerrar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
};

export default ProducerTemplatesPage;
