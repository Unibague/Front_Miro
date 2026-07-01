"use client";

import { useEffect, useState } from "react";
import {
  Container,
  Table,
  Button,
  Pagination,
  Center,
  TextInput,
  Modal,
  Tooltip,
  Title,
  Group,
  Divider,
  Select,
  Text,
} from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowBigDownFilled,
  IconArrowBigUpFilled,
  IconArrowLeft,
  IconArrowsTransferDown,
  IconChecks,
  IconDownload,
  IconEdit,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { useSession } from "next-auth/react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useDisclosure } from "@mantine/hooks";
import { format } from "fecha";
import DateConfig, { dateToGMT, endOfDayGMT5 } from "@/app/components/DateConfig";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSort } from "../../../hooks/useSort";
import { usePeriod } from "@/app/context/PeriodContext";
import { applyFieldCommentNote, applyValidatorDropdowns, fetchValidatorOptionsForFields, loadWorkbookFromBase64, extractWorkbookCommentsFromBase64 } from "@/app/utils/templateUtils";

const DropzoneUpdateButton = dynamic(
  () =>
    import("@/app/components/DropzoneUpdate/DropzoneUpdateButton").then(
      (mod) => mod.DropzoneUpdateButton
    ),
  { ssr: false }
);

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  validate_with?: string;
  comment?: string;
  header_row?: number;
  column?: number;
  dropdown_options?: string[];
}

interface SheetCellNote {
  row: number;
  col: number;
  note: string;
}

interface WorkbookSheet {
  name: string;
  fields?: Field[];
  preserveOriginalContent?: boolean;
  rawRows?: any[][];
  cellNotes?: SheetCellNote[];
  columnWidths?: number[];
}

interface Template {
  _id: string;
  name: string;
  file_name: string;
  dimensions: [any];
  file_description: string;
  fields: Field[];
  validators?: Validator[];
  workbook_sheets?: WorkbookSheet[];
  original_workbook_base64?: string;
  active: boolean;
}

interface FilledFieldData {
  field_name: string;
  values: any[];
  sheet_name?: string;
  sheet?: string;
  sheetName?: string;
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
  is_active: boolean;
}

interface PublishedTemplate {
  _id: string;
  name: string;
  published_by: any;
  template: Template;
  period: Period;
  deadline?: Date;
  producers_dep_code: string[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  loaded_data: ProducerData[];
  validators: Validator[];
  responsible_producers?: string[];
  final_submitted?: boolean;
  final_submitted_date?: string;
  isEncargado?: boolean;
}

interface ProducerUploadedTemplatesPageProps {
  fetchTemp: () => void;
  selectedCategory?: string | null;
  userDependencies?: {value: string, label: string}[];
  isAdmin?: boolean;
  refreshKey?: number;
}

const cloneExcelValue = <T,>(value: T): T => {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
};

const getConfiguredFieldPosition = (field: Field, fieldIndex: number) => {
  const configuredColumn = Number(field.column);
  const configuredHeaderRow = Number(field.header_row);

  return {
    col: Number.isFinite(configuredColumn) && configuredColumn > 0
      ? configuredColumn
      : fieldIndex + 1,
    headerRow: Number.isFinite(configuredHeaderRow) && configuredHeaderRow > 0
      ? configuredHeaderRow
      : 1,
  };
};

const getSheetDataStartRow = (fields: Field[]) => {
  const headerRows = fields
    .map((field, index) => getConfiguredFieldPosition(field, index).headerRow)
    .filter((row) => Number.isFinite(row) && row > 0);

  return (headerRows.length ? Math.min(...headerRows) : 1) + 1;
};

const copyCellPresentation = (target: ExcelJS.Cell, source: ExcelJS.Cell) => {
  target.style = cloneExcelValue(source.style || {});
  if (source.dataValidation) target.dataValidation = cloneExcelValue(source.dataValidation);
  if (source.note) target.note = cloneExcelValue(source.note);
};

const toExcelCellValue = (value: any): ExcelJS.CellValue => {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    if ("text" in value || "hyperlink" in value) return value as ExcelJS.CellValue;
    return JSON.stringify(value);
  }
  return value as ExcelJS.CellValue;
};

const ProducerUploadedTemplatesPage = ({ fetchTemp, selectedCategory, userDependencies, isAdmin = false, refreshKey = 0 }: ProducerUploadedTemplatesPageProps) => {
  const { selectedPeriodId } = usePeriod();
  const router = useRouter();
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<PublishedTemplate[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(10); // Nuevo estado para el tamaño de página
  const [producerEndDate, setProducerEndDate] = useState<Date | undefined>(
    undefined
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [uploadModalOpen, { open: openUploadModal, close: closeUploadModal }] =
    useDisclosure(false);
  const { sortedItems: sortedTemplates, handleSort, sortConfig } = useSort<PublishedTemplate>(templates, { key: null, direction: "asc" });

  const isResponsibleForTemplate = (publishedTemplate: PublishedTemplate): boolean => {
    if (typeof publishedTemplate.isEncargado === 'boolean') return publishedTemplate.isEncargado;
    const responsibleIds = publishedTemplate.responsible_producers || [];
    if (responsibleIds.length === 0) return false;
    const userDepCodes = new Set((userDependencies || []).map((dependency) => dependency.value));
    const depId = (publishedTemplate.template as any)?.producers?.find(
      (p: any) => userDepCodes.has(p.dep_code)
    )?._id;
    return depId ? responsibleIds.includes(depId) : false;
  };

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
            email: session?.user?.email,
          });
          showNotification({ title: "Enviado al SNIES", message: "El envío final al módulo SNIES se realizó exitosamente", color: "blue" });
          fetchTemplates(page, search);
        } catch (error: any) {
          const msg = error?.response?.data?.status || "Hubo un error al realizar el envío final";
          showNotification({ title: "Error", message: msg, color: "red" });
        }
      },
    });
  };

  const fetchTemplates = async (page: number, search: string, filterByCategory?: string | null, limit?: number) => {
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
      
      console.log('Parámetros enviados:', params);
      console.log('selectedCategory desde props:', selectedCategory);
      console.log('filterByCategory calculado:', filterByCategory);
      
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/uploaded`,
        { params }
      );
      
      console.log('Respuesta del backend:', response.data);
      if (response.data && response.data.templates && response.data.templates.length > 0) {
        const template = response.data.templates[0];
        const deadline = template?.period?.producer_end_date || template?.period?.deadline;
        if (deadline) {
          const dateObj = new Date(deadline);
          setProducerEndDate(!isNaN(dateObj.getTime()) ? dateObj : undefined);
        } else {
          setProducerEndDate(undefined);
        }
        setTemplates(response.data.templates || []);
        setTotalPages(response.data.pages || 1);
      } else {
        setTemplates([]);
        setTotalPages(1);
        setProducerEndDate(undefined);
      }
    } catch (error) {
      setTemplates([]);
      setTotalPages(1);
    }
  };

  // Función para manejar el cambio de tamaño de página
  const handlePageSizeChange = (newPageSize: string | null) => {
    if (newPageSize) {
      setPageSize(parseInt(newPageSize));
      setPage(1); // Resetear a la primera página cuando cambie el tamaño
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchTemplates(page, search, selectedCategory, pageSize);
    }
  }, [page, search, session, selectedPeriodId, selectedCategory, pageSize]);

  useEffect(() => {
    if (!refreshKey || !session?.user?.email || !selectedPeriodId) return;

    if (page !== 1) {
      setPage(1);
      return;
    }

    fetchTemplates(1, search, selectedCategory, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (session?.user?.email) {
        fetchTemplates(page, search, selectedCategory, pageSize);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const handleDownload = async (publishedTemplate: PublishedTemplate) => {
    // Obtener dep_code del usuario y plantilla fresca en paralelo
    const [userResp, freshTemplateResponse] = await Promise.all([
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users?email=${session?.user?.email}`),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${publishedTemplate._id}`),
    ]);
    const depCode: string = userResp.data.dep_code;
    const freshTemplate = freshTemplateResponse.data.template as Template | null | undefined;
    const validators = freshTemplate?.validators ?? publishedTemplate.validators;
    const periodId: string = (publishedTemplate.period as any)?._id ?? String(publishedTemplate.period ?? '');
    const allFieldsForValidators = [
      ...(freshTemplate?.fields || []),
      ...((freshTemplate?.workbook_sheets || []).flatMap((s: any) => s.fields || [])),
    ];
    const preloadedValidatorOptions = periodId
      ? await fetchValidatorOptionsForFields(allFieldsForValidators, periodId, process.env.NEXT_PUBLIC_API_URL!)
      : {};

    // Buscar datos del usuario
    const filledData: any = publishedTemplate.loaded_data.find(
      (entry) => entry.dependency === depCode || (entry as any).dependency_code === depCode
    );

    if (!filledData) {
      showNotification({ title: "Sin datos cargados", message: "No se encontraron datos cargados para tu dependencia.", color: "yellow" });
      return;
    }

    const allFilledData: FilledFieldData[] = filledData.filled_data || [];

    // Fill the saved data into the configured cells while preserving the base worksheet content.
    const populateSheet = (ws: ExcelJS.Worksheet, fields: any[], sheetName?: string) => {
      if (!fields?.length) return;

      let relevant = sheetName
        ? allFilledData.filter(fd => (fd.sheet_name || fd.sheet || fd.sheetName) === sheetName)
        : allFilledData;
      if (relevant.length === 0 && sheetName) {
        const sheetFieldNames = new Set(fields.map((field: Field) => field.name));
        relevant = allFilledData.filter(fd => sheetFieldNames.has(fd.field_name));
      }

      const numRows = relevant.reduce((max, fd) => (
        Math.max(max, Array.isArray(fd.values) ? fd.values.length : 0)
      ), 0);
      if (!numRows) return;

      const startRow = getSheetDataStartRow(fields);
      const templateRow = ws.getRow(startRow);

      if (numRows > 1) {
        ws.insertRows(startRow + 1, Array.from({ length: numRows - 1 }, () => []));
      }

      for (let i = 0; i < numRows; i++) {
        const dataRow = startRow + i;
        fields.forEach((field: any, colIdx: number) => {
          const { col: fieldCol } = getConfiguredFieldPosition(field, colIdx);
          const fd = relevant.find((d: FilledFieldData) => d.field_name === field.name);
          const val = fd?.values?.[i] ?? null;
          const targetCell = ws.getCell(dataRow, fieldCol);
          copyCellPresentation(targetCell, templateRow.getCell(fieldCol));
          targetCell.value = toExcelCellValue(val);
        });
      }
    };

    // === RUTA 1: workbook base64 (preserva estructura original) ===
    if (freshTemplate?.original_workbook_base64) {
      const workbook = await loadWorkbookFromBase64(freshTemplate.original_workbook_base64);
      const commentsBySheet = await extractWorkbookCommentsFromBase64(freshTemplate.original_workbook_base64);
      for (const [sheetName, sheetComments] of commentsBySheet.entries()) {
        const ws = workbook.getWorksheet(sheetName);
        if (!ws) continue;
        for (const [cellRef, noteText] of sheetComments.entries()) {
          if (noteText) applyFieldCommentNote(ws.getCell(cellRef), noteText, { preserveText: true });
        }
      }
      const workbookSheets: any[] = freshTemplate.workbook_sheets || [];
      if (workbookSheets.length > 0) {
        for (const sheet of workbookSheets) {
          const ws = workbook.getWorksheet(sheet.name);
          if (!ws || !sheet.fields?.length) continue;
          populateSheet(ws, sheet.fields, sheet.name);
        }
      } else if (freshTemplate.fields?.length) {
        const ws = workbook.getWorksheet(freshTemplate.name) || workbook.worksheets[0];
        if (ws) populateSheet(ws, freshTemplate.fields);
      }
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: "application/octet-stream" }), `${freshTemplate.file_name || publishedTemplate.name}.xlsx`);
      return;
    }

    // === RUTA 2: multi-hoja sin base64 ===
    const workbookSheets: any[] = freshTemplate?.workbook_sheets || [];
    if (workbookSheets.length > 0) {
      const workbook = new ExcelJS.Workbook();
      for (const sheet of workbookSheets) {
        if (sheet.preserveOriginalContent) {
          const ws = workbook.addWorksheet(sheet.name);
          (sheet.rawRows || []).forEach((row: any) => ws.addRow(row || []));
          (sheet.columnWidths || []).forEach((width: number, index: number) => {
            ws.getColumn(index + 1).width = width || 20;
          });
          (sheet.cellNotes || []).forEach((note: SheetCellNote) => {
            if (note?.row && note?.col && note?.note) {
              applyFieldCommentNote(ws.getCell(note.row, note.col), note.note, { preserveText: true });
            }
          });
          populateSheet(ws, sheet.fields || [], sheet.name);
          applyValidatorDropdowns({ workbook, worksheet: ws, fields: sheet.fields || [], validators, startRow: 2, endRow: 1000, preloadedValidatorOptions });
          continue;
        }
        const ws = workbook.addWorksheet(sheet.name);
        const headerRow = ws.addRow(sheet.fields.map((f: Field) => f.name));
        headerRow.eachCell((cell, colIdx) => {
          cell.font = { bold: true, color: { argb: "FFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0f1f39" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          applyFieldCommentNote(cell, sheet.fields[colIdx - 1]?.comment);
        });
        ws.columns.forEach(c => { c.width = 20; });
        populateSheet(ws, sheet.fields, sheet.name);
        applyValidatorDropdowns({ workbook, worksheet: ws, fields: sheet.fields, validators, startRow: 2, endRow: 1000, preloadedValidatorOptions });
      }
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: "application/octet-stream" }), `${freshTemplate?.file_name || publishedTemplate.name}.xlsx`);
      return;
    }

    // === RUTA 3: hoja única (lógica anterior) ===
    const template: Template = freshTemplate ?? publishedTemplate.template;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(template.name);

    const headerRow = worksheet.addRow(template.fields.map((field) => field.name));
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0f1f39" } };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      applyFieldCommentNote(cell, template.fields[colNumber - 1]?.comment);
    });
    worksheet.columns.forEach(c => { c.width = 20; });

    populateSheet(worksheet, template.fields);
    applyValidatorDropdowns({ workbook, worksheet, fields: template.fields, validators, startRow: 2, endRow: 1000, preloadedValidatorOptions });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: "application/octet-stream" }), `${template.file_name}.xlsx`);
  };

  const handleEditClick = (publishedTemplateId: string) => {
    setSelectedTemplateId(publishedTemplateId);
    openUploadModal();
  };

  const handleDeleteClick = async (publishedTemplateId: string) => {
    try {
      const response = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/delete`,
        {
          params: {
            pubTem_id: publishedTemplateId,
            email: session?.user?.email,
          },
        }
      );
      if (response.data) {
        showNotification({
          title: "Información eliminada",
          message: "La información ha sido eliminada exitosamente",
          color: "blue",
        });
        fetchTemplates(page, search, selectedCategory, pageSize);
        fetchTemp();
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      showNotification({
        title: "Error",
        message: "Ocurrió un error al eliminar la información",
        color: "red",
      });
    }
  };

  const handleDirectEditClick = (publishedTemplateId: string) => {
    router.push(`/producer/templates/form/${publishedTemplateId}?from=uploaded`);
  };

  const handleDisableUpload = (publishedTemplate: PublishedTemplate) => {
    if (isAdmin || (session?.user as any)?.role === "Administrador") return false;
    if (!publishedTemplate.period.is_active) return true;
    const effectiveDeadline = publishedTemplate.deadline ?? publishedTemplate.period.producer_end_date;
    if (!effectiveDeadline) return false;
    return endOfDayGMT5(new Date(effectiveDeadline)) < new Date();
  };

  const truncateString = (str: string, maxLength: number = 20): string => {
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  };

  const rows = sortedTemplates.map((publishedTemplate) => {
    const uploadDisable = handleDisableUpload(publishedTemplate);
    return (
      <Table.Tr key={publishedTemplate._id}>
        <Table.Td>{publishedTemplate.period.name}</Table.Td>
        <Table.Td>{publishedTemplate.template.dimensions.map(dim => dim.name).join(', ')}</Table.Td>
        <Table.Td>{publishedTemplate.name}</Table.Td>
        <Table.Td>
          {dateToGMT(publishedTemplate.deadline ?? publishedTemplate.period.producer_end_date)}
        </Table.Td>
    
        <Table.Td>
          {publishedTemplate.loaded_data && publishedTemplate.loaded_data.length > 0 
            ? dateToGMT(publishedTemplate.loaded_data[0].loaded_date)
            : 'Sin fecha'
          }
        </Table.Td>
        <Table.Td>
          <Center>
            <Group gap={"xs"}>
              <Tooltip
                label="Descargar información enviada"
                position="top"
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
                label={
                  uploadDisable
                    ? "El periodo ya se encuentra cerrado"
                    : "Editar plantilla (Hoja de cálculo)"
                }
                position="top"
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="outline"
                  color="teal"
                  onClick={() => handleEditClick(publishedTemplate._id)}
                  disabled={uploadDisable}
                >
                  <IconEdit size={16} />
                </Button>
              </Tooltip>
              <Tooltip
                label={
                  uploadDisable
                    ? "El periodo ya se encuentra cerrado"
                    : "Edición en línea"
                }
                position="top"
                transitionProps={{ transition: "fade-up", duration: 300 }}
              >
                <Button
                  variant="outline"
                  color="teal"
                  onClick={() => handleDirectEditClick(publishedTemplate._id)}
                  disabled={uploadDisable}
                >
                  <IconPencil size={16} />
                </Button>
              </Tooltip>
              {isResponsibleForTemplate(publishedTemplate) && (
                <Tooltip
                  label={
                    publishedTemplate.final_submitted
                      ? "Ya se realizó el envío final al SNIES"
                      : "Envío final al SNIES"
                  }
                  position="top"
                  transitionProps={{ transition: "fade-up", duration: 300 }}
                >
                  <Button
                    variant={publishedTemplate.final_submitted ? "filled" : "outline"}
                    color="blue"
                    onClick={() => handleConfirmFinalSubmit(publishedTemplate._id)}
                    disabled={!!publishedTemplate.final_submitted}
                  >
                    <IconChecks size={16} />
                  </Button>
                </Tooltip>
              )}
            </Group>
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
            <Tooltip
                label={
                  uploadDisable
                    ? "El periodo ya se encuentra cerrado"
                    : publishedTemplate.final_submitted
                      ? "Eliminar envío (también reseteará el estado SNIES)"
                      : "Eliminar envío"
                }
              position="top"
              transitionProps={{ transition: "fade-up", duration: 200 }}
            >
              <Button
                variant="outline"
                color="red"
                onClick={() =>
                  modals.openConfirmModal({
                    title: "Eliminar información",
                    children: (
                      <Text size="sm">
                        ¿Estás seguro de que deseas eliminar la información de esta plantilla?
                        {publishedTemplate.final_submitted && (
                          <Text size="sm" c="orange" fw={600} mt={4}>
                            Esta plantilla ya fue enviada al SNIES. Eliminarla también reseteará ese estado.
                          </Text>
                        )}
                        <Text size="sm" c="dimmed" mt={4}>Esta acción no se puede deshacer.</Text>
                      </Text>
                    ),
                    labels: { confirm: "Sí, eliminar", cancel: "Cancelar" },
                    confirmProps: { color: "red" },
                    onConfirm: () => handleDeleteClick(publishedTemplate._id),
                  })
                }
                disabled={uploadDisable}
              >
                <IconTrash size={16} />
              </Button>
            </Tooltip>
          </Center>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <Container size="xl">
      <Divider label="Proceso de cargue de plantillas" mt={20} mb={10}/>
      <DateConfig />
      <Title ta="center" mb={"md"}>
        Plantillas con Información
      </Title>
      <Group mb="md">
        <TextInput
          placeholder="Buscar plantillas"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Select
          label="Plantillas por página"
          placeholder="Seleccionar cantidad"
          data={[
            { value: '5', label: '5 por página' },
            { value: '10', label: '10 por página' },
            { value: '15', label: '15 por página' },
            { value: '20', label: '20 por página' },
            { value: '25', label: '25 por página' }
          ]}
          value={pageSize.toString()}
          onChange={handlePageSizeChange}
          style={{ minWidth: 150 }}
        />
      </Group>
      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
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
            <Table.Th onClick={() => handleSort("period.producer_end_date")} style={{ cursor: "pointer" }}>
              <Center inline>
                Fecha Límite
                {sortConfig.key === "period.producer_end_date" ? (
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
            <Table.Th onClick={() => handleSort("loaded_data[0].loaded_date")} style={{ cursor: "pointer" }}>
              <Center inline>
                Fecha de Cargue
                {sortConfig.key === "loaded_data[0].loaded_date" ? (
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
              <Center>Acciones</Center>
            </Table.Th>
            <Table.Th>
              <Center>Eliminar Información</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {templates.length > 0 ? (
            rows
          ) : (
            <Table.Tr>
              <Table.Td colSpan={8}>
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
        onClose={() => {
          closeUploadModal();
          fetchTemplates(page, search, selectedCategory, pageSize);
        }}
        title="Editar Información"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
        size="50%"
        centered
        withCloseButton={false}
      >
        {selectedTemplateId && producerEndDate && (
          <DropzoneUpdateButton
            pubTemId={selectedTemplateId}
            endDate={producerEndDate}
            onClose={closeUploadModal}
            edit
          />
        )}
        {selectedTemplateId && !producerEndDate && (
          <div>Cargando información de fecha...</div>
        )}
      </Modal>
    </Container>
  );
};

export default ProducerUploadedTemplatesPage;
