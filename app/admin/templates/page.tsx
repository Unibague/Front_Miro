"use client";

import { useEffect, useState, FormEvent } from "react";
import { Container, Table, Button, Pagination, Center, TextInput, Group, Modal, Select, Tooltip, Text, Checkbox } from "@mantine/core";
import axios,{ AxiosError } from "axios";
import { showNotification } from "@mantine/notifications";
import { IconEdit, IconTrash, IconDownload, IconUser, IconArrowRight, IconCirclePlus, IconArrowsTransferDown, IconArrowBigUpFilled, IconArrowBigDownFilled, IconCopy, IconHistory, IconFileSpreadsheet } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ExcelJS from "exceljs";
import { saveAs } from 'file-saver';
import { useDisclosure } from '@mantine/hooks';
import { useSort } from "../../hooks/useSort";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { DatePickerInput } from "@mantine/dates";
import { applyFieldCommentNote, applyValidatorDropdowns, buildStyledHelpWorksheet, sanitizeSheetName } from "@/app/utils/templateUtils";
import { usePeriod } from "@/app/context/PeriodContext";
import { logTemplateChange } from "@/app/utils/auditUtils";

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  validate_with?: string;
  comment?: string;
}

interface Validator { 
  name: string;
  values: any[];
}

interface Dependency {
  _id: string;
  dep_code: string;
  name: string;
  responsible: string;
}

interface Dimension {
  _id: string;
  name: string;
  responsible: Dependency;
}

interface Template {
  _id: string;
  name: string;
  file_name: string;
  file_description: string;
  fields: Field[];
  active: boolean;
  dimensions: [Dimension];
  created_by: {
    email: string;
    full_name: string;
  };
  validators: Validator[]
  published: boolean;
}

interface Period {
  _id: string;
  name: string;
  producer_start_date: Date;
  producer_end_date: Date;
}

interface Producer {
  dep_code: string;
  name: string;
}

const AdminTemplatesPage = () => {
  const { selectedPeriodId } = usePeriod();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { data: session } = useSession();
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [modalOpen, { open, close }] = useDisclosure(false);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [selectedProducers, setSelectedProducers] = useState<string[]>([]);
  const [publicationName, setPublicationName] = useState<string>('');
  const [deadline, setDeadline] = useState<Date | null>();
  const [customDeadline, setCustomDeadline] = useState<boolean>(false);
  const [downloadingAll, setDownloadingAll] = useState(false);

  const { sortedItems: sortedTemplates, handleSort, sortConfig } = useSort<Template>(templates, { key: null, direction: "asc" });

  const fetchTemplates = async (page: number, search: string) => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/all`, {
        params: { page, limit: 10, search, periodId: selectedPeriodId },
      });
      if (response.data) {
        console.log(response.data.templates);
        setTemplates(response.data.templates || []);
        setTotalPages(response.data.pages || 1);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      setTemplates([]);
    }
  };

  useEffect(() => {
    fetchTemplates(page, search);
  }, [page]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchTemplates(page, search);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const email = session?.user?.email;
        const { data } = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/feedOptions`, {
          params: { email },
        });
        
        console.log('🔍 Full API response:', data);
        console.log('📅 Periods array:', data.periods);
        console.log('📅 Periods length:', data.periods?.length);
        
        setPeriods(data.periods || []);
        setProducers(data.producers || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };
    if (modalOpen && selectedTemplate) {
      fetchData();
    }
  }, [modalOpen, session, selectedTemplate]);

  const handleDelete = async (id: string) => {
    try {
      const templateToDelete = templates.find(t => t._id === id);
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/templates/delete`, { data: { id } });
      
      // Registrar en auditoría
      if (templateToDelete && session?.user?.email) {
        await logTemplateChange(
          id,
          templateToDelete.name,
          'delete',
          session.user.email,
          {
            templateId: id,
            templateName: templateToDelete.name,
            action: 'Eliminó la plantilla'
          }
        );
      }
      
      showNotification({
        title: "Eliminado",
        message: "Plantilla eliminada exitosamente",
        color: "teal",
      });
      fetchTemplates(page, search);
    } catch (error) {
      if (axios.isAxiosError(error)) {
    const mensaje = error.response?.data?.mensaje || "Hubo un error al eliminar la plantilla";
    showNotification({ title: "Error borrando plantilla", message: mensaje, color: "red" });
  } else {
    showNotification({ title: "Error borrando plantilla", message: "Error inesperado", color: "red" });
  }
    }
  };

  const resolveUniqueSheetName = (workbook: ExcelJS.Workbook, rawName: string, fallback: string): string => {
    const base = sanitizeSheetName(rawName || fallback) || fallback;
    let candidate = base;
    let counter = 1;

    while (workbook.getWorksheet(candidate)) {
      const suffix = `_${counter}`;
      candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
      counter += 1;
    }

    return candidate;
  };

  const applyFieldValidationByDatatype = (cell: ExcelJS.Cell, field: Field) => {
    switch (field.datatype) {
      case 'Entero':
        cell.dataValidation = {
          type: 'whole',
          operator: 'between',
          formulae: [1, 9999999999999999999999999999999],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un numero entero.'
        };
        break;
      case 'Decimal':
        cell.dataValidation = {
          type: 'decimal',
          operator: 'between',
          formulae: [0.0, 9999999999999999999999999999999],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un numero decimal.'
        };
        break;
      case 'Porcentaje':
        cell.dataValidation = {
          type: 'decimal',
          operator: 'between',
          formulae: [0.0, 100.0],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un numero decimal entre 0.0 y 100.0.'
        };
        break;
      case 'Texto Corto':
        cell.dataValidation = {
          type: 'textLength',
          operator: 'lessThanOrEqual',
          formulae: [60],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un texto de hasta 60 caracteres.'
        };
        break;
      case 'Texto Largo':
        cell.dataValidation = {
          type: 'textLength',
          operator: 'lessThanOrEqual',
          formulae: [500],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un texto de hasta 500 caracteres.'
        };
        break;
      case 'True/False':
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Si,No"'],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
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
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce una fecha valida en el formato DD/MM/AAAA.'
        };
        cell.numFmt = 'DD/MM/YYYY';
        break;
      case 'Link':
        cell.dataValidation = {
          type: 'textLength',
          operator: 'greaterThan',
          formulae: [0],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Por favor, introduce un enlace valido.'
        };
        break;
      default:
        break;
    }

    if (field.comment && cell.dataValidation) {
      const normalizedComment = field.comment.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      const promptBase = normalizedComment.slice(0, 220);
      const promptText = normalizedComment.length > 220
        ? `${promptBase}... (ver hoja Guia)`
        : promptBase;
      cell.dataValidation = {
        ...cell.dataValidation,
        showInputMessage: true,
        promptTitle: field.name.slice(0, 32),
        prompt: promptText,
      };
    }
  };

  const populateTemplateWorksheet = (
    workbook: ExcelJS.Workbook,
    template: Template,
    worksheetName: string,
    includeHelpSheet = false,
    validators = template.validators
  ) => {
    if (includeHelpSheet) {
      buildStyledHelpWorksheet(workbook, template.fields);
    }

    const worksheet = workbook.addWorksheet(worksheetName);

    const headerRow = worksheet.addRow(template.fields.map(field => field.name));
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '0f1f39' },
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };

      const field = template.fields[colNumber - 1];
      applyFieldCommentNote(cell, field.comment);
    });

    worksheet.columns.forEach(column => {
      column.width = 20;
    });

    const maxRows = 1000;
    worksheet.getRow(maxRows);

    template.fields.forEach((field, index) => {
      const colNumber = index + 1;
      for (let rowNumber = 2; rowNumber <= maxRows; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const cell = row.getCell(colNumber);
        applyFieldValidationByDatatype(cell, field);
      }
    });

    applyValidatorDropdowns({
      workbook,
      worksheet,
      fields: template.fields,
      validators,
      startRow: 2,
      endRow: maxRows,
    });
  };

  const addSummaryWorksheets = (workbook: ExcelJS.Workbook, allTemplates: Template[]) => {
    const summary = workbook.addWorksheet('Plantillas');
    const fieldsDetail = workbook.addWorksheet('Campos Plantillas');

    summary.addRow(['Plantilla', 'Creado Por', 'Ambitos', 'Campos', 'Publicada']);
    allTemplates.forEach((template) => {
      summary.addRow([
        template.name,
        template.created_by?.full_name || '',
        template.dimensions?.map((dim) => dim.name).join(', ') || '',
        template.fields?.length || 0,
        template.published ? 'Si' : 'No',
      ]);
    });

    fieldsDetail.addRow(['Plantilla', 'Campo', 'Tipo de dato', 'Requerido', 'Validador', 'Respuesta posible', 'Comentario']);

    const normalizeToken = (value: string): string =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();

    const toOptionText = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (typeof value === 'object' && '$numberInt' in (value as Record<string, unknown>)) {
        return String((value as Record<string, unknown>).$numberInt ?? '').trim();
      }
      return String(value).trim();
    };

    const buildOptionsForField = (template: Template, validateWith?: string): string[] => {
      if (!validateWith) return [];
      const parts = validateWith.split(' - ');
      const validatorName = parts[0]?.trim();
      const preferredColumn = parts.slice(1).join(' - ').trim();
      if (!validatorName) return [];

      const validator = (template.validators || []).find(
        (item) => normalizeToken(item.name) === normalizeToken(validatorName)
      );
      if (!validator || !Array.isArray(validator.values)) return [];

      const result: string[] = [];
      const seen = new Set<string>();

      validator.values.forEach((row: Record<string, unknown>) => {
        const keys = Object.keys(row || {});
        if (!keys.length) return;

        const valueKey = preferredColumn
          ? keys.find((key) => normalizeToken(key) === normalizeToken(preferredColumn))
          : keys[0];
        const mainKey = valueKey || keys[0];
        const mainValue = row[mainKey];
        const mainText = toOptionText(mainValue);
        if (!mainText) return;

        const descKey = keys.find((key) => {
          if (key === mainKey) return false;
          const normalized = normalizeToken(key);
          return normalized.includes('DESCRIPCION') || normalized.includes('NOMBRE') || normalized.startsWith('DESC');
        });
        const descText = descKey ? toOptionText(row[descKey]) : '';
        const option = descText ? `${mainText} - ${descText}` : mainText;
        if (!option || seen.has(option)) return;
        seen.add(option);
        result.push(option);
      });

      return result;
    };

    const optionsByValidator = new Map<string, string[]>();
    const rowValidatorKey = new Map<number, string>();

    allTemplates.forEach((template) => {
      template.fields.forEach((field) => {
        const validateWith = (field.validate_with || '').trim();
        const detailRow = fieldsDetail.addRow([
          template.name,
          field.name,
          field.datatype,
          field.required ? 'Si' : 'No',
          validateWith,
          '',
          field.comment || '',
        ]);

        if (!validateWith) return;
        rowValidatorKey.set(detailRow.number, validateWith);
        if (!optionsByValidator.has(validateWith)) {
          optionsByValidator.set(validateWith, buildOptionsForField(template, validateWith));
        }
      });
    });

    if (optionsByValidator.size > 0) {
      const optionsSheet = workbook.addWorksheet('_OpcionesValidador');
      optionsSheet.state = 'veryHidden';

      const validatorColumns = new Map<string, { col: number; total: number }>();
      let col = 1;
      Array.from(optionsByValidator.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'es'))
        .forEach(([validatorKey, options]) => {
          optionsSheet.getCell(1, col).value = validatorKey;
          options.forEach((option, idx) => {
            optionsSheet.getCell(idx + 2, col).value = option;
          });
          validatorColumns.set(validatorKey, { col, total: options.length });
          col += 1;
        });

      const toColLetter = (index: number): string => {
        let n = index;
        let letters = '';
        while (n > 0) {
          const rem = (n - 1) % 26;
          letters = String.fromCharCode(65 + rem) + letters;
          n = Math.floor((n - 1) / 26);
        }
        return letters;
      };

      rowValidatorKey.forEach((validatorKey, row) => {
        const info = validatorColumns.get(validatorKey);
        if (!info || info.total === 0) return;
        const colLetter = toColLetter(info.col);
        const listRange = `'_OpcionesValidador'!$${colLetter}$2:$${colLetter}$${info.total + 1}`;
        fieldsDetail.getCell(row, 6).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [listRange],
          showErrorMessage: true,
          errorTitle: 'Valor no valido',
          error: 'Selecciona una respuesta posible de la lista.',
        };
      });
    }

    [summary, fieldsDetail].forEach((sheet) => {
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F1F39' },
      };
      sheet.columns.forEach((column) => {
        column.width = 30;
      });
    });
  };

  const fetchAllTemplatesForExport = async () => {
    const allTemplates: Template[] = [];
    let currentPage = 1;
    let pages = 1;
    const limit = 100;

    do {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/all`, {
        params: { page: currentPage, limit, search: '', periodId: selectedPeriodId },
      });

      allTemplates.push(...(response.data?.templates || []));
      pages = response.data?.pages || 1;
      currentPage += 1;
    } while (currentPage <= pages);

    return allTemplates;
  };

  const handleDownload = async (template: Template) => {
    const workbook = new ExcelJS.Workbook();
    const worksheetName = resolveUniqueSheetName(workbook, template.name, 'Plantilla_1');
    populateTemplateWorksheet(workbook, template, worksheetName, true);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    saveAs(blob, `${template.file_name}.xlsx`);
  };

  const handleDownloadAllTemplates = async () => {
    setDownloadingAll(true);
    try {
      const allTemplates = await fetchAllTemplatesForExport();

      if (!allTemplates.length) {
        showNotification({
          title: 'Sin datos',
          message: 'No hay plantillas para exportar en este periodo.',
          color: 'yellow',
        });
        return;
      }

      const workbook = new ExcelJS.Workbook();
      addSummaryWorksheets(workbook, allTemplates);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const dateTag = new Date().toISOString().slice(0, 10);
      saveAs(blob, `plantillas_consolidadas_${dateTag}.xlsx`);

      showNotification({
        title: 'Exportacion completada',
        message: 'Se descargo el Excel con las hojas Plantillas y Campos Plantillas.',
        color: 'teal',
      });
    } catch (error) {
      console.error('Error exporting templates:', error);
      showNotification({
        title: 'Error',
        message: 'No fue posible descargar el consolidado de plantillas.',
        color: 'red',
      });
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/publish`, {
        name: publicationName,
        template_id: selectedTemplate?._id,
        period_id: selectedPeriod,
        user_email: session?.user?.email,
        deadline: customDeadline ? deadline : periods.find(period => period._id === selectedPeriod)?.producer_end_date,
      });
      console.log('Template successfully pubished');
      showNotification({
        title: "Publicación Exitosa",
        message: "La plantilla ha sido publicada exitosamente",
        color: "teal",
      });
      close();
    } catch (error) {
      console.error('Error publishing template:', error);
      showNotification({
        title: "Error",
        message: "Hubo un error al publicar la plantilla",
        color: "red",
      });
    }
  };

  const rows = sortedTemplates.map((template) => (
    <Table.Tr key={template._id}>
      <Table.Td>{template.name}</Table.Td>
      <Table.Td>
        <Text size="sm">{template.created_by.full_name}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{template?.dimensions?.map(dim => dim.name).join(", ")}</Text>
      </Table.Td>
      <Table.Td>
        <Center>
          <Group gap={3}>
            <Tooltip
              label="Descargar plantilla"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button variant="outline" onClick={() => handleDownload(template)}>
                <IconDownload size={16} />
              </Button>
            </Tooltip>
            <Tooltip
              label="Duplicar plantilla"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button
                variant="outline"
                color="orange"
                onClick={() => router.push(`/templates/duplicate/${template._id}`)}
              >
                <IconCopy size={16} />
              </Button>
            </Tooltip>
            <Tooltip
              label="Editar plantilla"
              transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button
                variant="outline"
                onClick={() => router.push(`/templates/update/${template._id}`)}
              >
                <IconEdit size={16} />
              </Button>
            </Tooltip>

            <Tooltip
                  label="Borrar plantilla"
                  transitionProps={{ transition: 'fade-up', duration: 300 }}
            >
              <Button color="red" variant="outline" onClick={() => handleDelete(template._id)}>
                <IconTrash size={16} />
              </Button>
            </Tooltip>
          </Group>
        </Center>
      </Table.Td>
      <Table.Td>
        <Center>
          <Tooltip
                  label={template.published ? "Plantilla ya asignada en el periodo" :
                    "Asignar plantilla a periodo"}
                  transitionProps={{ transition: 'fade-up', duration: 300 }}
          >
            <Button 
              disabled={template.published}
              variant="outline" 
              onClick={() => { 
              setSelectedTemplate(template);
              setPublicationName(template.name)
              open(); 
              console.log("Modal open state:", modalOpen);
            }}>
              <IconUser size={16} />
            </Button>
          </Tooltip>
        </Center>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <DateConfig/>
      <TextInput
        placeholder="Buscar en todas las plantillas"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
      <Group>
        <Button
          onClick={() => router.push('/templates/create')}
          leftSection={<IconCirclePlus/>}
        >
          Crear Nueva Plantilla
        </Button>
        <Button
    onClick={() => router.push('/templates/categories')}  
    leftSection={<IconArrowsTransferDown size={16} />}
  >
    Categorizar Plantillas
  </Button>

        <Button
          onClick={handleDownloadAllTemplates}
          variant="light"
          leftSection={<IconFileSpreadsheet size={16} />}
          loading={downloadingAll}
        >
          Descargar Todas las Plantillas
        </Button>

        <Button 
          ml={"auto"} 
          onClick={() => router.push('/templates/published')}
          variant="outline"
          rightSection={<IconArrowRight size={16} />}>
          Ir a Plantillas Publicadas
        </Button>
      </Group>
      <Table striped withTableBorder mt="md">
      <Table.Thead>
        <Table.Tr>
          <Table.Th onClick={() => handleSort("name")} style={{ cursor: "pointer" }}>
            <Center inline>
              Nombre
              {sortConfig.key === "name" ? (
                sortConfig.direction === "asc" ? 
                <IconArrowBigUpFilled size={16} style={{ marginLeft: '5px' }} /> 
                : 
                <IconArrowBigDownFilled size={16} style={{ marginLeft: '5px' }} />
              ) : (
                <IconArrowsTransferDown size={16} style={{ marginLeft: '5px' }} />
              )}
            </Center>
          </Table.Th>

          <Table.Th onClick={() => handleSort("created_by.full_name")} style={{ cursor: "pointer" }}>
            <Center inline>
              Creado Por
              {sortConfig.key === "created_by.full_name" ? (
                sortConfig.direction === "asc" ? 
                <IconArrowBigUpFilled size={16} style={{ marginLeft: '5px' }} /> 
                : 
                <IconArrowBigDownFilled size={16} style={{ marginLeft: '5px' }} />
              ) : (
                <IconArrowsTransferDown size={16} style={{ marginLeft: '5px' }} />
              )}
            </Center>
          </Table.Th>

          <Table.Th onClick={() => handleSort("file_description")} style={{ cursor: "pointer" }}>
            <Center inline>
              Ámbitos
              {sortConfig.key === "file_description" ? (
                sortConfig.direction === "asc" ? 
                <IconArrowBigUpFilled size={16} style={{ marginLeft: '5px' }} /> 
                : 
                <IconArrowBigDownFilled size={16} style={{ marginLeft: '5px' }} />
              ) : (
                <IconArrowsTransferDown size={16} style={{ marginLeft: '5px' }} />
              )}
            </Center>
          </Table.Th>
          <Table.Th>
            <Center>Acciones</Center>
          </Table.Th>

          <Table.Th>
            <Center>Asignar</Center>
          </Table.Th>
        </Table.Tr>
      </Table.Thead>
        <Table.Tbody>{rows}</Table.Tbody>
      </Table>
      <Center>
        <Pagination
          mt={15}
          value={page}
          onChange={setPage}
          total={totalPages}
          siblings={1}
          boundaries={3}
        />
      </Center>
      <Modal
        opened={modalOpen}
        onClose={() => {
          close()
          setSelectedTemplate(null)
          setSelectedPeriod('')
          setCustomDeadline(false)
          setDeadline(null)
        }}
        title="Asignar Plantilla"
        overlayProps={{
          backgroundOpacity: 0.55,
          blur: 3,
        }}
      >
        <form onSubmit={handleSubmit}>
          <TextInput label="Nombre de la Publicación" placeholder="Ingrese el nombre de la publicación" value={publicationName} onChange={(e) => setPublicationName(e.currentTarget.value)} />
          <TextInput label="Nombre de la Plantilla" value={selectedTemplate?.name || ''} disabled />
          <Select
            label="Periodo"
            placeholder="Seleccione un periodo"
            data={periods.map(period => ({ value: period._id, label: period.name }))}
            value={selectedPeriod}
            onChange={(value) => {
              setSelectedPeriod(value || '')
              setDeadline(new Date(periods.find(period => period._id === value)?.producer_end_date || ""))
            }}
          />
          {
          selectedPeriod &&
          <>
            <Text size="sm" mt={'xs'} c='dimmed'>Fecha Límite: {deadline ? dateToGMT(deadline) : "No disponible"}</Text>
            <Checkbox
              mt={'sm'}
              mb={'xs'}
              label="Establecer un plazo inferior al establecido en el periodo"
              checked={customDeadline}
              onChange={(event) => setCustomDeadline(event.currentTarget.checked)}
            />
          </>
          }
          {
            customDeadline &&
            <DatePickerInput
              locale="es"
              label="Fecha Límite"
              value={deadline}
              onChange={setDeadline}
              maxDate={selectedPeriod ? 
                  new Date(periods.find(period => period._id === selectedPeriod)?.producer_end_date 
                  || "") : undefined}
              minDate={selectedPeriod ?
                  new Date(periods.find(period => period._id === selectedPeriod)?.producer_start_date 
                  || "") : undefined 
              }
            />
          }
          <Group justify="flex-end" mt="md">
            <Button type="submit">Asignar</Button>
          </Group>
        </form>
      </Modal>
    </Container>
  );
};

export default AdminTemplatesPage;
