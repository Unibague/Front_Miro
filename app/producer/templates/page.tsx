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
  IconArrowsTransferDown,
  IconArrowLeft,
  IconChecks,
  IconDownload,
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
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
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

const UNCATEGORIZED_CATEGORY_FILTER = "__uncategorized__";

const DropzoneButton = dynamic(
  () =>
    import("@/app/components/Dropzone/DropzoneButton").then(
      (mod) => mod.DropzoneButton
    ),
  { ssr: false }
);

interface Category {
  _id?: string;
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
  locked?: boolean;
}

interface Dimension {
  _id: string;
  name: string;
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
  validators?: Validator[];
  workbook_sheets?: TemplateWorksheet[];
  original_workbook_base64?: string;
  active: boolean;
  category: Category;
  producers?: Producer[];
  shared?: boolean;
  allows_qr?: boolean;
  fecha_final_productores?: string | Date;
  fecha_final_responsables?: string | Date;
  fecha_final?: string | Date;
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
  sheet_name?: string;
  sheet?: string;
  sheetName?: string;
  field_name: string;
  values: any[];
}

interface ProducerData {
  dependency: string;
  dependency_code?: string;
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
  qr_draft_data?: ProducerData[];
  validators: Validator[];
  deadline: string | Date;
  isPending: boolean;
  category_name?: string;
  responsible_producers?: string[];
  final_submitted?: boolean;
  final_submitted_date?: string;
  fecha_final_productores?: string | Date;
  fecha_final_responsables?: string | Date;
  fecha_final?: string | Date;
  isEncargado?: boolean;
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
  const [categoryOptions, setCategoryOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
  
  const fetchTemplates = async (page?: number, search?: string, filterByCategory?: string | null, limit?: number) => {
    try {
      const params: any = {
        email: session?.user?.email,
        page,
        limit: limit || pageSize, // Usar el pageSize seleccionado
        search,
        periodId: selectedPeriodId,
      };
      
      if (filterByCategory) {
        params.filterByCategory = filterByCategory;
      }
      
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/available`,
        { params }
      );
      if (response.data) {
        setTemplates(response.data.templates || []);
        setTotalPages(response.data.pages || 1);
        setPendingCount(response.data.total ?? response.data.templates?.length ?? 0);
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

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/categories/all`);
      const categories = (response.data.categories || [])
        .filter((category: Category) => category._id && category.name)
        .map((category: Category) => ({
          value: String(category._id),
          label: category.name,
        }))
        .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label));

      setCategoryOptions([
        { value: UNCATEGORIZED_CATEGORY_FILTER, label: "Sin categoría" },
        ...categories,
      ]);
    } catch (error) {
      console.error("Error fetching categories:", error);
      setCategoryOptions([{ value: UNCATEGORIZED_CATEGORY_FILTER, label: "Sin categoría" }]);
    }
  };

  useEffect(() => {
    console.log("Template con categoría:", PublishedTemplatesPage);  // Verifica que category esté poblado correctamente
  }, [PublishedTemplatesPage]);
  

  useEffect(() => {
    console.log("ID de período seleccionado en la page:", selectedPeriodId);
    if (session?.user?.email && selectedPeriodId) {
      fetchTemplates(page, search, selectedCategory, pageSize);
      fetchUserDependencies();
      fetchCategories();
    }
  }, [page, search, session, selectedPeriodId, selectedCategory, pageSize]); // Agregar pageSize a las dependencias  

  const refreshTemplates = () => {
    if (session?.user?.email) {
      fetchTemplates(page, search, selectedCategory, pageSize);
    }
  };
  
  // Función para manejar el cambio de tamaño de página
  const handlePageSizeChange = (newPageSize: string | null) => {
    if (newPageSize) {
      setPageSize(parseInt(newPageSize));
      setPage(1); // Resetear a la primera página cuando cambie el tamaño
    }
  };

  const getCurrentCategoryTitle = () => {
    if (!selectedCategory) return "Todas las categorías";
    const category = categoryOptions.find((option) => option.value === selectedCategory);
    return category?.label || "Categoría seleccionada";
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchTemplates(page, search, selectedCategory, pageSize);
    }
  }, [page, session]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (session?.user?.email) {
        fetchTemplates(page, search, selectedCategory, pageSize);
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
      .map((t) => getEffectiveDeadline(t))
      .filter((date) => !isNaN(date.getTime()));

    if (deadlines.length > 0) {
      setNextDeadline(new Date(Math.min(...deadlines.map((date) => date.getTime()))));
    } else {
      setNextDeadline(null);
    }
  }, [templates, selectedCategory]);
  

  const handleDownload = async (publishedTemplate: PublishedTemplate) => {
    const [freshTemplateResponse, userResp] = await Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${publishedTemplate._id}`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users`, { params: { email: session?.user?.email } }),
    ]);
    let template: Template = freshTemplateResponse.data.template ?? publishedTemplate.template;

    const periodId =
      (publishedTemplate as any).period?._id ??
      (publishedTemplate as any).period ??
      null;

    try {
      const freshRes = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/templates/${template._id}`,
        { params: { withValidators: 'true', ...(periodId ? { periodId } : {}) } }
      );
      if (freshRes.data?.validators) {
        template = { ...template, validators: freshRes.data.validators };
      }
    } catch {
      // si falla, se usan los validators cacheados
    }

    const validators =
      template?.validators ??
      publishedTemplate.validators;

    // Datos ya enviados por el usuario (para pre-poblar el Excel)
    const userDepCode: string = userResp.data.dep_code || '';
    const userLoadedEntry = (publishedTemplate.loaded_data || []).find(
      (entry) => entry.dependency === userDepCode || entry.dependency_code === userDepCode
    );
    const userFilledData: FilledFieldData[] = userLoadedEntry?.filled_data || [];

    // Helper: poblar hoja con datos existentes
    const populateSheetWithData = (ws: ExcelJS.Worksheet, fields: Field[], sheetName?: string) => {
      const relevant = sheetName
        ? userFilledData.filter(fd => (fd.sheet_name || fd.sheet || fd.sheetName) === sheetName)
        : userFilledData;
      if (!relevant.length) return;
      const firstFilled = relevant.find(fd => Array.isArray(fd.values) && fd.values.length > 0);
      const numRows = firstFilled?.values.length ?? 0;
      for (let i = 0; i < numRows; i++) {
        const rowValues = fields.map(field => {
          const fd = relevant.find(d => d.field_name === field.name);
          return fd?.values?.[i] ?? null;
        });
        ws.addRow(rowValues);
      }
    };
    const workbookSheets = (template.workbook_sheets || []).filter(
      (sheet) => sheet.preserveOriginalContent || sheet.rawRows?.length || sheet.fields?.length > 0
    );

    // Mapa de ID de productor → dep_code para resolver las hojas
    const producerIdMap = new Map<string, string>();
    (template.producers || []).forEach((p) => {
      if (p._id && p.dep_code) producerIdMap.set(p._id.toString(), p.dep_code);
    });

    // dep_codes del usuario actual (principal + adicionales)
    const userDepCodes = new Set((userDependencies || []).map((d) => d.value));

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

    const _now = new Date();
    const prefilledYear = _now.getFullYear();
    const prefilledSemester = _now.getMonth() < 6 ? 1 : 2; // ene-jun = 1, jul-dic = 2
    const applyPeriodPrefill = (ws: ExcelJS.Worksheet, fields: Field[]) => {
      fields.forEach((field, idx) => {
        const col = (Number.isFinite(Number(field.column)) && Number(field.column) > 0) ? Number(field.column) : idx + 1;
        const dataRow = (Number.isFinite(Number(field.header_row)) && Number(field.header_row) > 0) ? Number(field.header_row) + 1 : 2;
        if (field.name.toUpperCase() === 'AÑO') {
          const cell = ws.getCell(dataRow, col);
          if (!cell.value) cell.value = prefilledYear;
        }
        if (field.name.toUpperCase() === 'SEMESTRE') {
          const cell = ws.getCell(dataRow, col);
          if (!cell.value) cell.value = prefilledSemester;
        }
      });
    };


    if (template.original_workbook_base64) {
      const workbook = await loadWorkbookFromBase64(template.original_workbook_base64);
      const originalCommentsBySheet = await extractWorkbookCommentsFromBase64(template.original_workbook_base64);

      // Re-apply all notes extracted via JSZip (ExcelJS may not load note text from xlsx correctly)
      for (const [sheetName, sheetComments] of originalCommentsBySheet.entries()) {
        const ws = workbook.getWorksheet(sheetName);
        if (!ws) continue;
        for (const [cellRef, noteText] of sheetComments.entries()) {
          if (noteText) applyFieldCommentNote(ws.getCell(cellRef), noteText, { preserveText: true });
        }
      }

      // Also apply cellNotes stored in the template snapshot (fallback for older imports)
      (template.workbook_sheets || []).forEach((sheet) => {
        const ws = workbook.getWorksheet(sheet.name);
        if (!ws || !sheet.cellNotes?.length) return;
        sheet.cellNotes.forEach((note) => {
          if (note?.row && note?.col && note?.note) {
            applyFieldCommentNote(ws.getCell(note.row, note.col), note.note, { preserveText: true });
          }
        });
      });

      applyWorkbookSheetDropdowns({
        workbook,
        workbookSheets,
        validators,
        originalCommentsBySheet,
      });

      // Encabezados de campos añadidos (solo value + fill + font, sin border para no corromper el workbook cargado)
      for (const sheet of workbookSheets) {
        const ws = workbook.getWorksheet(sheet.name);
        if (!ws || !Array.isArray(sheet.fields)) continue;
        const hasBase = sheet.fields.some((f) => f.locked !== false);
        if (!hasBase) continue;
        sheet.fields.forEach((field, index) => {
          if (field.locked !== false) return;
          const col = Number.isFinite(Number(field.column)) && Number(field.column) > 0 ? Number(field.column) : index + 1;
          const hRow = Number.isFinite(Number(field.header_row)) && Number(field.header_row) > 0 ? Number(field.header_row) : 1;
          const cell = ws.getCell(hRow, col);
          cell.value = field.name;
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF166534" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          const colObj = ws.getColumn(col);
          if (!colObj.width || colObj.width < 20) colObj.width = 20;
        });
      }

      // Pre-poblar con datos ya enviados y luego AÑO/SEMESTRE en hojas editables
      for (const sheet of workbookSheets) {
        if (!canUserEditSheet(sheet)) continue;
        const ws = workbook.getWorksheet(sheet.name);
        if (!ws || !sheet.fields?.length) continue;
        populateSheetWithData(ws, sheet.fields, sheet.name);
        applyPeriodPrefill(ws, sheet.fields);
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
            applyFieldCommentNote(worksheet.getCell(note.row, note.col), note.note, { preserveText: true });
          });
          applyValidatorDropdowns({
            workbook,
            worksheet,
            fields: sheet.fields,
            validators,
            startRow: 2,
            endRow: 1000,
          });
          // Encabezados de campos añadidos por el usuario (color azul claro)
          const hasBase = sheet.fields.some((f) => f.locked !== false);
          if (hasBase) {
            sheet.fields.forEach((field, index) => {
              if (field.locked !== false) return;
              const col = Number.isFinite(Number(field.column)) && Number(field.column) > 0 ? Number(field.column) : index + 1;
              const hRow = Number.isFinite(Number(field.header_row)) && Number(field.header_row) > 0 ? Number(field.header_row) : 1;
              const cell = worksheet.getCell(hRow, col);
              cell.value = field.name;
              cell.font = { bold: true, color: { argb: "FFFFFF" } };
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "166534" } };
              cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
              cell.alignment = { vertical: "middle", horizontal: "center" };
              const currentWidth = worksheet.getColumn(col).width;
              if (!currentWidth || currentWidth < 20) worksheet.getColumn(col).width = 20;
            });
          }
          continue;
        }

        const worksheet = workbook.addWorksheet(worksheetName);
        const hasBaseFields = sheet.fields.some((f) => f.locked !== false);
        const headerRow = worksheet.addRow(sheet.fields.map((field) => field.name));
        headerRow.eachCell((cell, colNumber) => {
          const field = sheet.fields[colNumber - 1];
          const isAdded = hasBaseFields && field?.locked === false;
          cell.font = { bold: true, color: { argb: "FFFFFF" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: isAdded ? "166534" : "0f1f39" },
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
          cell.alignment = { vertical: "middle", horizontal: "center" };
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

        if (canUserEditSheet(sheet)) {
          populateSheetWithData(worksheet, sheet.fields, sheet.name);
          applyPeriodPrefill(worksheet, sheet.fields);
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
              formulae: [0.0, Number.MAX_SAFE_INTEGER],
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

    // Pre-poblar con datos ya enviados
    populateSheetWithData(worksheet, template.fields);

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
  // Verifica si el usuario es productor encargado de una plantilla publicada
  const isResponsibleForTemplate = (publishedTemplate: PublishedTemplate): boolean => {
    // Usar el flag calculado en el backend cuando esté disponible
    if (typeof publishedTemplate.isEncargado === 'boolean') return publishedTemplate.isEncargado;
    // Fallback local: comparar todas las dependencias del usuario con responsible_producers
    const responsibleIds = publishedTemplate.responsible_producers || [];
    if (responsibleIds.length === 0) return false;
    const userDepCodes = new Set((userDependencies || []).map((dependency) => dependency.value));
    const depId = publishedTemplate.template?.producers?.find(
      (p: any) => userDepCodes.has(p.dep_code)
    )?._id;
    return depId ? responsibleIds.includes(depId) : false;
  };

  const canGenerateQrForTemplate = (publishedTemplate: PublishedTemplate): boolean => (
    isResponsibleForTemplate(publishedTemplate) && publishedTemplate.template?.allows_qr === true
  );

  const handleConfirmFinalSubmit = async (pubTemId: string) => {
    modals.openConfirmModal({
      title: "Confirmar envío final al SNIES",
      centered: true,
      children: (
        <Text size="sm">
          ¿Estás seguro de que deseas realizar el <strong>envío final al módulo SNIES</strong>?
          <br /><br />
          Esta acción confirma que toda la información ha sido consolidada y está lista para ser procesada en el SNIES.
        </Text>
      ),
      labels: { confirm: "Sí, enviar al SNIES", cancel: "Cancelar" },
      confirmProps: { color: "blue" },
      onConfirm: async () => {
        try {
          await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/confirmFinalSubmit`, {
            pubTem_id: pubTemId,
            email: session?.user?.email
          });
          showNotification({
            title: "Enviado al SNIES",
            message: "El envío final al módulo SNIES se realizó exitosamente",
            color: "blue",
          });
          refreshTemplates();
        } catch (error: any) {
          const msg = error?.response?.data?.status || "Hubo un error al realizar el envío final";
          showNotification({ title: "Error", message: msg, color: "red" });
        }
      },
    });
  };

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

  const getEffectiveDeadline = (publishedTemplate: PublishedTemplate): Date => {
    const isEncargado = isResponsibleForTemplate(publishedTemplate);
    const raw = isEncargado
      ? (publishedTemplate.fecha_final_responsables
          ?? publishedTemplate.template?.fecha_final_responsables
          ?? publishedTemplate.deadline
          ?? publishedTemplate.period.producer_end_date)
      : (publishedTemplate.fecha_final_productores
          ?? publishedTemplate.template?.fecha_final_productores
          ?? publishedTemplate.fecha_final
          ?? publishedTemplate.template?.fecha_final
          ?? publishedTemplate.deadline
          ?? publishedTemplate.period.producer_end_date);
    // Deadline: 1:00 AM hora Colombia (UTC-5) del día límite
    const colDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(raw));
    const colMidnight = new Date(`${colDateStr}T00:00:00.000-05:00`);
    return new Date(colMidnight.getTime() + 60 * 60 * 1000); // medianoche Colombia + 1 hora
  };

  const handleDisableUpload = (publishedTemplate: PublishedTemplate) => {
    return new Date() > getEffectiveDeadline(publishedTemplate);
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
          {(() => {
            const isEncargado = isResponsibleForTemplate(publishedTemplate);
            const fecha = isEncargado
              ? (publishedTemplate.fecha_final_responsables
                  ?? publishedTemplate.template?.fecha_final_responsables
                  ?? publishedTemplate.deadline
                  ?? publishedTemplate.period.producer_end_date)
              : (publishedTemplate.fecha_final_productores
                  ?? publishedTemplate.template?.fecha_final_productores
                  ?? publishedTemplate.fecha_final
                  ?? publishedTemplate.template?.fecha_final
                  ?? publishedTemplate.deadline
                  ?? publishedTemplate.period.producer_end_date);
            const colFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' });
            const isDeadlineToday = colFmt.format(new Date(fecha)) === colFmt.format(new Date());
            return (
              <Stack gap={2}>
                <Text size="sm" fw={700} c={isDeadlineToday ? 'red' : 'blue'}>{dateToGMT(fecha)}</Text>
                {isEncargado && (
                  <Badge size="xs" color="blue" variant="light">Productor encargado</Badge>
                )}
              </Stack>
            );
          })()}
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
              {canGenerateQrForTemplate(publishedTemplate) && (
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
              )}
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
              <Tooltip
                label={
                  uploadDisable
                    ? "El periodo ya se encuentra cerrado"
                    : "Enviar información"
                }
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="filled"
                  color="green"
                  onClick={() =>
                    router.push(
                      `/producer/templates/form/${publishedTemplate._id}`
                    )
                  }
                  disabled={uploadDisable}
                  leftSection={<IconUpload size={14} />}
                >
                  Enviar
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
      <Group mb="sm">
        <Button variant="subtle" px={6} onClick={() => router.push('/dashboard?view=gestion')}>
          <IconArrowLeft size={20} />
        </Button>
      </Group>
      <Title ta="center" mb={"md"}>
        Plantillas Pendientes
      </Title>
      <Title order={3} ta="center" mb={"md"} c="blue">
        {getCurrentCategoryTitle()}
      </Title>
      <Text ta="center" mt="sm" mb="md">
    Tienes <strong>{pendingCount}</strong> plantilla
    {pendingCount === 1 ? "" : "s"} pendiente
    {pendingCount === 1 ? "" : "s"}.
  </Text>
      <Group mb="md">
        <TextInput
          placeholder="Buscar plantillas"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          placeholder="Filtrar por categoría"
          data={categoryOptions}
          value={selectedCategory}
          onChange={(value) => {
            setSelectedCategory(value);
            setPage(1);
          }}
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
    Categoría
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
            endDate={undefined}
            onClose={closeUploadModal}
            onUploadSuccess={refreshTemplates}
          />
        )}
      </Modal>
      <ProducerUploadedTemplatesPage
        fetchTemp={refreshTemplates}
        selectedCategory={selectedCategory}
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
