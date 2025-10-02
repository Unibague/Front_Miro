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
} from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowBigDownFilled,
  IconArrowBigUpFilled,
  IconArrowLeft,
  IconArrowsTransferDown,
  IconDownload,
  IconEdit,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useDisclosure } from "@mantine/hooks";
import { format } from "fecha";
import DateConfig, { dateNow, dateToGMT } from "@/app/components/DateConfig";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSort } from "../../../hooks/useSort";
import { usePeriod } from "@/app/context/PeriodContext";
import { sanitizeSheetName, shouldAddWorksheet } from "@/app/utils/templateUtils"; 

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
}

interface Template {
  _id: string;
  name: string;
  file_name: string;
  dimensions: [any];
  file_description: string;
  fields: Field[];
  active: boolean;
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
}

interface ProducerUploadedTemplatesPageProps {
  fetchTemp: () => void;
  selectedDependency?: string;
  userDependencies?: {value: string, label: string}[];
}

const ProducerUploadedTemplatesPage = ({ fetchTemp, selectedDependency, userDependencies }: ProducerUploadedTemplatesPageProps) => {
  const { selectedPeriodId } = usePeriod();
  const router = useRouter();
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<PublishedTemplate[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [producerEndDate, setProducerEndDate] = useState<Date | undefined>(
    undefined
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [uploadModalOpen, { open: openUploadModal, close: closeUploadModal }] =
    useDisclosure(false);
  const { sortedItems: sortedTemplates, handleSort, sortConfig } = useSort<PublishedTemplate>(templates, { key: null, direction: "asc" });

  const fetchTemplates = async (page: number, search: string, filterByDependency?: string) => {
    try {
      const params: any = {
        email: session?.user?.email, 
        page, 
        limit: 10, 
        search,
        periodId: selectedPeriodId,
      };
      
      if (filterByDependency) {
        params.filterByDependency = filterByDependency;
      }
      
      console.log('Parámetros enviados:', params);
      console.log('selectedDependency desde props:', selectedDependency);
      console.log('filterByDependency calculado:', filterByDependency);
      
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
        setProducerEndDate(undefined);
      }
    } catch (error) {
      setTemplates([]);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      const filterDep = selectedDependency && selectedDependency !== '' ? selectedDependency : undefined;
      fetchTemplates(page, search, filterDep);
    }
  }, [page, search, session, selectedPeriodId, selectedDependency]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (session?.user?.email) {
        const filterDep = selectedDependency && selectedDependency !== '' ? selectedDependency : undefined;
        fetchTemplates(page, search, filterDep);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  const handleDownload = async (publishedTemplate: PublishedTemplate) => {
    const { template, validators } = publishedTemplate;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(template.name);
    const helpWorksheet = workbook.addWorksheet("Guía");

    helpWorksheet.columns = [{ width: 30 }, { width: 150 }];
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

    // Campos de tipo fecha para formatear correctamente
    const dateFields = new Set(
      template.fields
        .filter(f => f.datatype === "Fecha" || f.datatype === "Fecha Inicial / Fecha Final")
        .map(f => f.name)
    );

    // Obtener el dep_code del usuario actual desde la API
    const userResp = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users?email=${session?.user?.email}`);
    const depCode = userResp.data.dep_code;

    // Buscar en loaded_data el bloque correcto
    const filledData: any = publishedTemplate.loaded_data.find(
      (entry) => entry.dependency === depCode
    );

    if (!filledData) {
      showNotification({
        title: "Sin datos cargados",
        message: "No se encontraron datos cargados para tu dependencia.",
        color: "yellow",
      });
      return;
    }

    // Usar la misma lógica que published templates - crear headers con los campos de la plantilla
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

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    if (filledData) {
      console.log('=== DEBUGGING DOWNLOAD ===');
      console.log('Template fields:', template.fields.map(f => f.name));
      console.log('Filled data fields:', filledData.filled_data.map((fd: any) => fd.field_name));
      console.log('ALL filled data:', filledData.filled_data);
      console.log('Total template fields:', template.fields.length);
      console.log('Total filled data fields:', filledData.filled_data.length);
      
      const firstFilled = filledData?.filled_data.find((fd: any) => Array.isArray(fd.values) && fd.values.length > 0);
      const numRows = firstFilled ? firstFilled.values.length : 0;
      console.log('Number of rows to process:', numRows);
      
      for (let i = 0; i < numRows; i++) {
        const rowValues = template.fields.map((field) => {
          // Búsqueda exacta primero
          let fieldData = filledData.filled_data.find(
            (data: FilledFieldData) => data.field_name === field.name
          );
          
          // Si no encuentra coincidencia exacta, buscar de forma flexible
          if (!fieldData) {
            const normalizedFieldName = field.name.toLowerCase().trim();
            fieldData = filledData.filled_data.find(
              (data: FilledFieldData) => data.field_name.toLowerCase().trim() === normalizedFieldName
            );
          }

          let value = (fieldData?.values && fieldData.values[i] !== undefined)
            ? fieldData.values[i]
            : null;
            
          // Debug para campos específicos
          if (field.name.includes('ESTRATEGIA') || field.name.includes('FLEXIBILIZACIÓN')) {
            console.log(`Field: ${field.name}`);
            console.log(`Found fieldData:`, fieldData);
            console.log(`Value at index ${i}:`, value);
          }

          // Manejar hipervínculos de Excel y objetos complejos
          if (value && typeof value === 'object' && value !== null) {
            // Manejar hipervínculos de Excel primero
            if (value.hyperlink || value.text || value.formula) {
              value = value.text || value.hyperlink || value.formula;
            }
            // Si es un array, unir elementos
            else if (Array.isArray(value)) {
              if (value.length === 0) {
                value = '';
              } else {
                value = value.map(item => {
                  if (typeof item === 'object' && item !== null) {
                    // Manejar hipervínculos de Excel en arrays
                    if (item.hyperlink || item.text || item.formula) {
                      return item.text || item.hyperlink || item.formula;
                    }
                    const possibleEmailKeys = ['email', 'value', 'label', 'mail', 'correo', 'address', 'emailAddress'];
                    const itemEmailKey = possibleEmailKeys.find(key => item[key] && typeof item[key] === 'string');
                    return itemEmailKey ? item[itemEmailKey] : (item.text || JSON.stringify(item));
                  }
                  return item;
                }).join(', ');
              }
            }
            // Buscar propiedades de email de forma más exhaustiva
            else {
              const possibleEmailKeys = ['email', 'value', 'label', 'mail', 'correo', 'address', 'emailAddress'];
              const emailKey = possibleEmailKeys.find(key => value[key] && typeof value[key] === 'string');
              
              if (emailKey) {
                value = value[emailKey];
              } else {
                // Intentar extraer cualquier valor string del objeto
                const objectValues = Object.values(value).filter(val => typeof val === 'string' && val.length > 0);
                if (objectValues.length > 0) {
                  const firstStringValue = objectValues[0] as string;
                  // Si parece un email, usarlo
                  if (firstStringValue.includes('@') || firstStringValue.includes('.com') || firstStringValue.includes('.edu')) {
                    value = firstStringValue;
                  } else {
                    value = JSON.stringify(value);
                  }
                } else {
                  value = JSON.stringify(value);
                }
              }
            }
          }

          if (
            value &&
            (field.datatype === "Fecha" || field.datatype === "Fecha Inicial / Fecha Final")
          ) {
            try {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                value = date.toISOString().slice(0, 10); // YYYY-MM-DD
              }
            } catch {
              // Si falla el parseo, deja el valor tal cual
            }
          }

          return value;
        });
        
        // Solo agregar la fila si tiene al menos un valor no vacío
        const hasNonEmptyValue = rowValues.some(val => 
          val !== null && val !== undefined && val !== '' && val !== 'null'
        );
        
        if (hasNonEmptyValue) {
          worksheet.addRow(rowValues);
        }
      }
    } 

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

    // Crear una hoja por cada validador en el array
    validators.forEach((validator) => {
      const sanitizedName = sanitizeSheetName(validator.name);
      if (!shouldAddWorksheet(workbook, sanitizedName)) return;
      const validatorSheet = workbook.addWorksheet(sanitizedName);

      const header = Object.keys(validator.values[0]);
      const validatorHeaderRow = validatorSheet.addRow(header);
      validatorHeaderRow.eachCell((cell) => {
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
      });

      validator.values.forEach((value) => {
        const row = validatorSheet.addRow(Object.values(value));
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });

      validatorSheet.columns.forEach((column) => {
        column.width = 20;
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    saveAs(blob, `${template.file_name}.xlsx`);
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
        const filterDep = selectedDependency && selectedDependency !== '' ? selectedDependency : undefined;
        fetchTemplates(page, search, filterDep);
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
    router.push(`/producer/templates/form/update/${publishedTemplateId}`);
  };

  const handleDisableUpload = (publishedTemplate: PublishedTemplate) => {
    return (
      new Date(dateNow().toDateString()) >
      new Date(publishedTemplate.period.producer_end_date)
    );
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
          {dateToGMT(publishedTemplate.period.producer_end_date)}
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
            </Group>
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
            <Tooltip
                label={
                  uploadDisable
                    ? "El periodo ya se encuentra cerrado"
                    : "Eliminar envío"
                }
              position="top"
              transitionProps={{ transition: "fade-up", duration: 200 }}
            >
              <Button
                variant="outline"
                color="red"
                onClick={() => handleDeleteClick(publishedTemplate._id)}
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
      <TextInput
        placeholder="Buscar plantillas"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
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
        opened={uploadModalOpen}
        onClose={() => {
          closeUploadModal();
          const filterDep = selectedDependency && selectedDependency !== '' ? selectedDependency : undefined;
          fetchTemplates(page, search, filterDep);
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
