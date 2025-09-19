"use client";

import { useEffect, useState } from "react";
import {
  Container,
  Table,
  Button,
  Pagination,
  Center,
  TextInput,
  Title,
  Text,
  Tooltip,
  Group,
  Progress,
  rem,
  Stack,
  MultiSelect,
  Paper,
  Grid,
  Modal,
  Card,
  Switch,
  Badge,
  Divider,
} from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications"
import { IconArrowLeft, IconDownload, IconTableRow, IconArrowBigUpFilled, IconArrowBigDownFilled, IconArrowsTransferDown, IconTrash, IconArrowRight, IconFilter, IconSettings, IconEye, IconEyeOff } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { useRouter } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";
import { useSort } from "../../hooks/useSort";
import { usePeriod } from "@/app/context/PeriodContext";
import { sanitizeSheetName, shouldAddWorksheet } from "@/app/utils/templateUtils";
import FilterSidebar from "@/app/components/FilterSidebar";

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  validate_with?: string;
  comment?: string;
}

interface Dimension {
  _id: string;
  name: string;
}

interface Dependency {
  _id: string;
  name: string;
}

interface Template {
  _id: string;
  name: string;
  file_name: string;
  dimensions: [Dimension];
  file_description: string;
  fields: Field[];
  producers: [Dependency]
  active: boolean;
}

interface Validator {
  name: string;
  values: any[];
}

interface PublishedTemplate {
  _id: string;
  name: string;
  published_by: any;
  template: Template;
  period: any;
  producers_dep_code: string[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  loaded_data: any[];
  validators: Validator[];
  deadline: Date;
}

interface TemplateFilter {
  _id: string;
  templateId: string;
  fieldName: string;
  isVisible: boolean;
  filterType: 'autocomplete' | 'dropdown' | 'radio' | 'multiselect' | 'date';
  order: number;
}



const TemplatesWithFiltersPage = () => {
  const { userRole, setUserRole } = useRole();
  const router = useRouter();
  const { selectedPeriodId } = usePeriod();
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<PublishedTemplate[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PublishedTemplate | null>(null)
  
  // Filter states
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string[]>>({});
  
  // Filter management modal states
  const [filterModalOpened, setFilterModalOpened] = useState(false);
  const [selectedTemplateForFilters, setSelectedTemplateForFilters] = useState<PublishedTemplate | null>(null);
  const [templateFilters, setTemplateFilters] = useState<Record<string, TemplateFilter[]>>({});

  const { sortedItems: sortedTemplates, handleSort, sortConfig } = useSort<PublishedTemplate>(templates, { key: null, direction: "asc" });

  const fetchTemplates = async (page: number, search: string, filters?: Record<string, string[]>) => {
    try {
      const email = session?.user?.email;
      if (!email) return;
      
      const params: any = { 
        page,
        limit: 10,
        search,
        email,
        periodId: selectedPeriodId,
      };
      
      // Add filter parameters
      if (filters) {
        Object.entries(filters).forEach(([key, values]) => {
          if (values.length > 0) {
            params[key] = values.join(',');
          }
        });
      }
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/dimension`, {
        params
      });
      
      if (response.data) {
        setTemplates(response.data.templates || []);
        setTotalPages(response.data.pages || 1);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al obtener las plantillas",
        color: "red",
      });
      setTemplates([]);
    }
  };





  useEffect(() => {
    if (session?.user?.email) {
      fetchTemplates(page, search, appliedFilters);
    }
  }, [page, search, session, selectedPeriodId, appliedFilters]);

  const handleFiltersChange = (filters: Record<string, string[]>) => {
    setAppliedFilters(filters);
  };

  const generateFiltersForTemplate = (template: PublishedTemplate): TemplateFilter[] => {
    const fields = template.template.fields || [];
    return fields.map((field, index) => {
      const fieldLower = field.name.toLowerCase();
      let filterType: 'autocomplete' | 'dropdown' | 'radio' | 'multiselect' | 'date' = 'dropdown';
      
      if (fieldLower.includes('fecha') || fieldLower.includes('date')) {
        filterType = 'date';
      } else if (fieldLower.includes('descripcion') || fieldLower.includes('nombre')) {
        filterType = 'autocomplete';
      } else {
        filterType = 'dropdown';
      }
      
      return {
        _id: `${template._id}_${field.name}`,
        templateId: template._id,
        fieldName: field.name,
        isVisible: true,
        filterType,
        order: index
      };
    });
  };

  const openFilterModal = (template: PublishedTemplate) => {
    setSelectedTemplateForFilters(template);
    if (!templateFilters[template._id]) {
      const generatedFilters = generateFiltersForTemplate(template);
      setTemplateFilters(prev => ({
        ...prev,
        [template._id]: generatedFilters
      }));
    }
    setFilterModalOpened(true);
  };

  const updateFilterVisibility = (templateId: string, fieldName: string, isVisible: boolean) => {
    setTemplateFilters(prev => ({
      ...prev,
      [templateId]: prev[templateId]?.map(filter => 
        filter.fieldName === fieldName 
          ? { ...filter, isVisible }
          : filter
      ) || []
    }));
    
    showNotification({
      title: "Actualizado",
      message: `Filtro ${isVisible ? 'activado' : 'desactivado'} exitosamente`,
      color: "teal",
    });
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/delete`,
        {
          params: { id, email: session?.user?.email },
        }
      );

      if (response.data) {
        showNotification({
          title: "Éxito",
          message: "Plantilla eliminada exitosamente",
          color: "green",
        });
        fetchTemplates(page, search, appliedFilters);
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al eliminar la plantilla",
        color: "red",
      });
    }
  };

  const handleDownload = async (
    publishedTemplate: PublishedTemplate,
    validators = publishedTemplate.validators
  ) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/dimension/mergedData`,
        {
          params: {
            pubTem_id: publishedTemplate._id,
            email: session?.user?.email,
          },
        }
      );

      const data = response.data.data;
      const { template } = publishedTemplate;

      // Campos de tipo fecha para formatear correctamente
      const dateFields = new Set(
        template.fields
          .filter(f => f.datatype === "Fecha" || f.datatype === "Fecha Inicial / Fecha Final")
          .map(f => f.name)
      );

      console.log("Template: ", template);
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

      const headerRow = worksheet.addRow(Object.keys(data[0]));
      headerRow.eachCell((cell) => {
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

      worksheet.columns.forEach((column) => {
        column.width = 20;
      });

      // Add the data to the worksheet starting from the second row
      data.forEach((row: any) => {
        const formattedRow = Object.entries(row).map(([key, value]) => {
          if (value && dateFields.has(key)) {
            if (
              typeof value === 'string' ||
              typeof value === 'number' ||
              value instanceof Date
            ) {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                return date.toISOString().slice(0, 10); // YYYY-MM-DD
              }
            }
          }
          return value;
        });

        worksheet.addRow(formattedRow);
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
    } catch (error) {
      console.error("Error downloading merged data:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al descargar los datos",
        color: "red",
      });
    }
  };

  const giveReportPercentage = (pTemplate: PublishedTemplate) => {
    return (
      (pTemplate.loaded_data.length / pTemplate.producers_dep_code.length) * 100
    );
  };

  const rows = sortedTemplates.map((publishedTemplate) => {
    let progress = {
      total: publishedTemplate.template.producers.length,
      value: publishedTemplate.loaded_data.length,
      percentage:
        (publishedTemplate.loaded_data.length /
          publishedTemplate.template.producers.length) *
        100
    };

    return (
      <Table.Tr key={publishedTemplate._id}>
        <Table.Td>{publishedTemplate.period.name}</Table.Td>
        <Table.Td>{publishedTemplate.name}</Table.Td>
        <Table.Td>
          <Center>
            {dateToGMT(publishedTemplate.deadline ?? publishedTemplate.period.producer_end_date)}
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
            {dateToGMT(publishedTemplate.updatedAt)}
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
            <Tooltip
              label="Presiona para ver detalles"
              transitionProps={{ transition: "slide-up", duration: 300 }}
              withArrow
            >
              <Stack
                gap={0} style={{ cursor: "pointer" }}
                onClick={()=>router.push(`/templates/uploaded/${publishedTemplate._id}?resume=true`)}
              >
                <Progress.Root
                  mt={"xs"}
                  size={"md"}
                  radius={"md"}
                  w={rem(200)}
                >
                  <Progress.Section
                  value={progress.percentage}
                  />
                </Progress.Root>
                <Text size="sm" ta={"center"} mt={rem(5)}>
                  {progress.value} de{" "}
                  {progress.total}
                </Text>
              </Stack>
            </Tooltip>
          </Center>
        </Table.Td>
        <Table.Td>
          <Center>
            <Group gap={'xs'}>
              <Tooltip
                label="Ver información enviada"
                transitionProps={{ transition: "slide-up", duration: 300 }}
                withArrow
              >
                <Button
                  variant="outline"
                  onClick={() => {
                    router.push(`/templates/uploaded/${publishedTemplate._id}?resume=false`);
                  }}
                  disabled={publishedTemplate.loaded_data.length === 0}
                >
                  <IconTableRow size={18} />
                </Button>
              </Tooltip>
              <Tooltip
                label="Descargar información enviada"
                transitionProps={{ transition: "slide-up", duration: 300 }}
                withArrow
              >
                <Button
                  variant="outline"
                  onClick={() => handleDownload(publishedTemplate)}
                  disabled={publishedTemplate.loaded_data.length === 0}
                >
                  <IconDownload size={18} />
                </Button>
              </Tooltip>
              { userRole === "Administrador" && (
                <>
                  <Tooltip
                    label="Gestionar filtros de plantilla"
                    transitionProps={{ transition: "slide-up", duration: 300 }}
                    withArrow
                  >
                    <Button
                      variant="outline"
                      onClick={() => openFilterModal(publishedTemplate)}
                      color="blue"
                    >
                      <IconSettings size={18} />
                    </Button>
                  </Tooltip>
                  <Tooltip
                    label={ publishedTemplate.loaded_data?.length > 0 ?
                      "No puedes eliminar una plantilla con información enviada"
                      : "Eliminar plantilla publicada"
                    }
                    transitionProps={{ transition: "slide-up", duration: 300 }}
                    withArrow
                  >
                    <Button
                      variant="outline"
                      onClick={() => handleDelete(publishedTemplate._id)}
                      color="red"
                      disabled={publishedTemplate.loaded_data?.length > 0}
                    >
                      <IconTrash size={18} />
                    </Button>
                  </Tooltip>
                </>
              )}
            </Group>
          </Center>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <FilterSidebar 
        onFiltersChange={handleFiltersChange}
        isVisible={sidebarVisible}
        onToggle={() => setSidebarVisible(!sidebarVisible)}
      />
      
      <div 
        style={{ 
          flex: 1, 
          marginLeft: sidebarVisible ? '22%' : '0',
          transition: 'margin-left 0.3s ease',
          padding: '20px'
        }}
      >
        <Container size="xl">
          <DateConfig/>
          
          <Group justify="space-between" mb="md">
            <Title ta="center">
              Gestión de Plantillas con Filtros
            </Title>
            <Button 
              variant="outline"
              leftSection={<IconFilter size={16} />} 
              onClick={() => setSidebarVisible(!sidebarVisible)}
            >
              {sidebarVisible ? 'Ocultar' : 'Mostrar'} Filtros
            </Button>
          </Group>
          <TextInput
            placeholder="Buscar plantillas"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            mb="md"
          />
          <Group justify="space-between">
            {
              userRole === "Administrador" && ( 
                <>
                <Button
                  onClick={() =>
                    router.push("/admin/templates/")
                  }
                  variant="outline"
                  leftSection={<IconArrowLeft size={16} />}
                >
                  Ir a Configuración de Plantillas
                </Button>

                <Button
                  onClick={() =>
                    router.push("/templates/published/update")
                  }
                  variant="outline"
                  leftSection={<IconArrowRight size={16} />}
                >
                  Cambiar fechas de entrega plantillas
                </Button>
                </>
              )
            }
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
                    Plazo Máximo
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
                <Table.Th onClick={() => handleSort("updatedAt")} style={{ cursor: "pointer" }}>
                  <Center inline>
                    Última Modificación
                    {sortConfig.key === "updatedAt" ? (
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
                  <Center>Progreso</Center>
                </Table.Th>
                <Table.Th>
                  <Center>Acciones</Center>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length > 0 ? rows : (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                      No hay plantillas publicadas en el periodo
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
        </Container>
      </div>
      
      {/* Modal de Gestión de Filtros */}
      <Modal
        opened={filterModalOpened}
        onClose={() => setFilterModalOpened(false)}
        title={`Gestionar Filtros - ${selectedTemplateForFilters?.name}`}
        size="lg"
      >
        {selectedTemplateForFilters && (
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Selecciona qué campos quieres que aparezcan como filtros para esta plantilla:
            </Text>
            
            <Divider />
            
            {selectedTemplateForFilters.template.fields.map((field, index) => {
              const filters = templateFilters[selectedTemplateForFilters._id] || [];
              const filter = filters.find(f => f.fieldName === field.name);
              const isVisible = filter?.isVisible ?? true;
              
              return (
                <Card key={field.name} p="sm" withBorder>
                  <Group justify="space-between">
                    <Group>
                      <IconFilter size={16} color={isVisible ? "green" : "gray"} />
                      <div>
                        <Text fw={500}>{field.name.replace(/_/g, ' ')}</Text>
                        <Text size="xs" c="dimmed">
                          Tipo: {field.datatype} {field.required && '(Requerido)'}
                        </Text>
                      </div>
                    </Group>
                    
                    <Group>
                      <Badge 
                        variant="light" 
                        color={isVisible ? "green" : "gray"}
                        size="sm"
                      >
                        {filter?.filterType || 'dropdown'}
                      </Badge>
                      
                      <Switch
                        checked={isVisible}
                        onChange={(event) => 
                          updateFilterVisibility(
                            selectedTemplateForFilters._id, 
                            field.name, 
                            event.currentTarget.checked
                          )
                        }
                        thumbIcon={
                          isVisible ? (
                            <IconEye size={12} />
                          ) : (
                            <IconEyeOff size={12} />
                          )
                        }
                      />
                    </Group>
                  </Group>
                </Card>
              );
            })}
            
            <Group justify="flex-end" mt="md">
              <Button 
                variant="outline" 
                onClick={() => setFilterModalOpened(false)}
              >
                Cerrar
              </Button>
              <Button 
                onClick={() => {
                  showNotification({
                    title: "Guardado",
                    message: "Configuración de filtros guardada exitosamente",
                    color: "green",
                  });
                  setFilterModalOpened(false);
                }}
              >
                Guardar Cambios
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </div>
  );
};

export default TemplatesWithFiltersPage;