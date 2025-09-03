"use client";

import { useEffect, useState, FormEvent } from "react";
import { Container, Table, Button, Pagination, Center, TextInput, Group, Modal, Select, Tooltip, Text, Checkbox } from "@mantine/core";
import axios,{ AxiosError } from "axios";
import { showNotification } from "@mantine/notifications";
import { IconEdit, IconTrash, IconDownload, IconUser, IconArrowRight, IconCirclePlus, IconArrowsTransferDown, IconArrowBigUpFilled, IconArrowBigDownFilled, IconCopy } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ExcelJS from "exceljs";
import { saveAs } from 'file-saver';
import { useDisclosure } from '@mantine/hooks';
import { useSort } from "../../hooks/useSort";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { DatePickerInput } from "@mantine/dates";
import { shouldAddWorksheet, sanitizeSheetName } from "@/app/utils/templateUtils";
import { usePeriod } from "@/app/context/PeriodContext";

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
        setPeriods(data.periods);
        setProducers(data.producers);
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
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/templates/delete`, { data: { id } });
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

  const handleDownload = async (template: Template, validators = template.validators) => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(template.name);
    const helpWorksheet = workbook.addWorksheet("Guía");

    helpWorksheet.columns = [{ width: 30 }, { width: 120 }];
    const helpHeaderRow = helpWorksheet.addRow(["Campo", "Comentario del campo"]);
    helpHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF00" },
      };
    });
    template.fields.forEach((field) => {
      const commentText = field.comment ? field.comment.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : "";
      const helpRow = helpWorksheet.addRow([field.name, commentText]);
      helpRow.getCell(2).alignment = { wrapText: true };
    });


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
      if (field.comment) {
        const commentText = field.comment.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        cell.note = {
          texts: [
            { font: { size: 12, color: { argb: 'FF0000' } }, text: commentText }
          ],
          editAs: 'oneCells',
        };
        
      }
    });

    worksheet.columns.forEach(column => {
      column.width = 20;
    });

    worksheet.getRow(1000);

    template.fields.forEach((field, index) => {
      const colNumber = index + 1;
      const maxRows = 1000;
      for (let i = 2; i <= maxRows; i++) {
        const row = worksheet.getRow(i);
        const cell = row.getCell(colNumber);
    
        switch (field.datatype) {
          case 'Entero':
            cell.dataValidation = {
              type: 'whole',
              operator: 'between',
              formulae: [1, 9999999999999999999999999999999],
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
      }
    });

    validators.forEach((validator) => {
      const sanitizedName = sanitizeSheetName(validator.name);
      if (!shouldAddWorksheet(workbook, sanitizedName)) {
        return;
      }
      
      const validatorSheet = workbook.addWorksheet(sanitizedName);
      // Agregar encabezados basados en las claves del primer objeto de "values"
      const header = Object.keys(validator.values[0]);
      const validatorHeaderRow = validatorSheet.addRow(header);
  
      // Estilizar la fila de encabezado
      validatorHeaderRow.eachCell((cell) => {
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
      });
  
      // Agregar las filas con los valores
      validator.values.forEach((value: any) => {
        const row = validatorSheet.addRow(Object.values(value));
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });
  
      // Ajustar el ancho de las columnas
      validatorSheet.columns.forEach((column) => {
        column.width = 20;
      });
    });
  
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    saveAs(blob, `${template.file_name}.xlsx`);
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
      console.log('Template successfully published');
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
