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
  Title,
  Group,
  Tooltip,
  Text,
  Badge,
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
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { useDisclosure } from "@mantine/hooks";
import { format } from "fecha";
import DateConfig, { dateNow, dateToGMT } from "@/app/components/DateConfig";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSort } from "../../hooks/useSort";
import ProducerUploadedTemplatesPage from "./uploaded/ProducerUploadedTemplates";
import { usePeriod } from "@/app/context/PeriodContext";
import { sanitizeSheetName, shouldAddWorksheet } from "@/app/utils/templateUtils";
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

interface Template {
  _id: string;
  name: string;
  file_name: string;
  dimensions: [Dimension];
  file_description: string;
  fields: Field[];
  active: boolean;
  category: Category
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
  const [producerEndDate, setProducerEndDate] = useState<Date | undefined>();
  const [nextDeadline, setNextDeadline] = useState<Date | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [uploadModalOpen, { open: openUploadModal, close: closeUploadModal }] =
    useDisclosure(false);
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
  
  const fetchTemplates = async (page?: number, search?: string) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/available`,
        {
          params: {
            email: session?.user?.email,
            page,
            limit: 20,
            search,
            periodId: selectedPeriodId,
          },
        }
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

  useEffect(() => {
    console.log("Template con categoría:", PublishedTemplatesPage);  // Verifica que category esté poblado correctamente
  }, [PublishedTemplatesPage]);
  

  useEffect(() => {
    console.log("ID de período seleccionado en la page:", selectedPeriodId);
    if (session?.user?.email && selectedPeriodId) {
      fetchTemplates(page, search);
    }
  }, [page, search, session, selectedPeriodId]);  

  const refreshTemplates = () => {
    if (session?.user?.email) {
      fetchTemplates(page, search);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchTemplates(page, search);
    }
  }, [page, session]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (session?.user?.email) {
        fetchTemplates(page, search);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search]);

  useEffect(() => {
    if (session?.user?.email && selectedPeriodId) {
      fetchTemplates(page, search);
    }
  }, [page, search, session, selectedPeriodId]);

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
    const workbook = new ExcelJS.Workbook();

    // Crear la hoja principal basada en el template
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
      }
    });

    worksheet.columns.forEach((column) => {
      column.width = 20;
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

  const handleUploadClick = (publishedTemplate: PublishedTemplate) => {
    if(handleDisableUpload(publishedTemplate)) {
      showNotification({
        title: "Error",
        message: "El periodo ya se encuentra cerrado",
        color: "red",
      })
      return;
    }
    setSelectedTemplateId(publishedTemplate._id);
    openUploadModal();
  };

  const handleEmptySubmit = async (pubTemId: string) => {
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
  const handleDisableUpload = (publishedTemplate: PublishedTemplate) => {
    return (
      new Date(dateNow().toDateString()) >
      new Date(publishedTemplate.deadline)
    );
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
      <TextInput
        placeholder="Buscar plantillas  "
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        mb="md"
      />
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
      <ProducerUploadedTemplatesPage fetchTemp={fetchTemplates} />
    </Container>
  );
};

export default ProducerTemplatesPage;
