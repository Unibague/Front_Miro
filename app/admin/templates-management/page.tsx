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
import { useSort } from "@/app/hooks/useSort";
import { usePeriod } from "@/app/context/PeriodContext";
import { sanitizeSheetName, shouldAddWorksheet } from "@/app/utils/templateUtils";
import FilterSidebarSimple from "@/app/components/FilterSidebarSimple";

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
  
  // Verificar acceso
  useEffect(() => {
    if (userRole && !['Administrador', 'Responsable', 'Productor'].includes(userRole)) {
      router.push('/dashboard');
    }
  }, [userRole, router]);
  const [templates, setTemplates] = useState<PublishedTemplate[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [opened, setOpened] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PublishedTemplate | null>(null)
  
  // Filter states
  const [sidebarVisible, setSidebarVisible] = useState(false);
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
        filterByUserScope: true, // Nuevo parámetro para filtrar por ámbito del usuario
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
        const sortedTemplates = sortTemplatesWithVisited(response.data.templates || []);
        setTemplates(sortedTemplates);
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





  // Sort templates to show visited ones first
  const sortTemplatesWithVisited = (templates: PublishedTemplate[]) => {
    const visitedTemplates = JSON.parse(localStorage.getItem('visited_templates') || '[]');
    
    return templates.sort((a, b) => {
      const aVisited = visitedTemplates.includes(a._id);
      const bVisited = visitedTemplates.includes(b._id);
      
      if (aVisited && !bVisited) return -1;
      if (!aVisited && bVisited) return 1;
      return 0;
    });
  };

  // Load search from localStorage on component mount
  useEffect(() => {
    const savedSearch = localStorage.getItem('templates_search');
    if (savedSearch) {
      setSearch(savedSearch);
    }
  }, []);

  // Save search to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('templates_search', search);
  }, [search]);

  // Fetch templates with debounced search
  useEffect(() => {
    if (!session?.user?.email) return;
    
    const delayDebounceFn = setTimeout(() => {
      fetchTemplates(page, search, appliedFilters);
    }, search ? 500 : 0); // No delay if search is empty, 500ms delay if there's search text

    return () => clearTimeout(delayDebounceFn);
  }, [page, search, session, selectedPeriodId, appliedFilters]);

  const handleFiltersChange = (filters: Record<string, string[]>) => {
    setAppliedFilters(filters);
  };

  const generateFiltersForTemplate = (template: PublishedTemplate): TemplateFilter[] => {
    const fields = template.template.fields || [];
    const filters = fields.map((field, index) => {
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
    
    // Agregar manualmente el filtro DEPENDENCIA
    filters.push({
      _id: `${template._id}_DEPENDENCIA`,
      templateId: template._id,
      fieldName: 'DEPENDENCIA',
      isVisible: true,
      filterType: 'dropdown',
      order: fields.length
    });
    
    return filters;
  };

  const openFilterModal = (template: PublishedTemplate) => {
    setSelectedTemplateForFilters(template);
    
    // Intentar cargar configuración guardada desde localStorage
    const savedConfig = localStorage.getItem(`template_filters_${template._id}`);
    
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        setTemplateFilters(prev => ({
          ...prev,
          [template._id]: config.filters
        }));
      } catch (error) {
        console.error('Error loading saved filter config:', error);
        // Si hay error, generar filtros por defecto
        const generatedFilters = generateFiltersForTemplate(template);
        setTemplateFilters(prev => ({
          ...prev,
          [template._id]: generatedFilters
        }));
      }
    } else if (!templateFilters[template._id]) {
      // Si no hay configuración guardada, generar filtros por defecto
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

  const toggleAllFilters = (templateId: string, activateAll: boolean) => {
    setTemplateFilters(prev => ({
      ...prev,
      [templateId]: prev[templateId]?.map(filter => ({
        ...filter,
        isVisible: activateAll
      })) || []
    }));
    
    showNotification({
      title: "Actualizado",
      message: `Todos los filtros ${activateAll ? 'activados' : 'desactivados'} exitosamente`,
      color: "teal",
    });
  };

  const areAllFiltersActive = (templateId: string): boolean => {
    const filters = templateFilters[templateId] || [];
    return filters.length > 0 && filters.every(filter => filter.isVisible);
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
            filterByUserScope: true, // Filtrar por ámbito del usuario
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
                onClick={() => {
                  // Mark template as visited
                  const visitedTemplates = JSON.parse(localStorage.getItem('visited_templates') || '[]');
                  if (!visitedTemplates.includes(publishedTemplate._id)) {
                    visitedTemplates.push(publishedTemplate._id);
                    localStorage.setItem('visited_templates', JSON.stringify(visitedTemplates));
                  }
                  router.push(`/templates/uploaded/${publishedTemplate._id}?resume=true`);
                }}
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
                    // Mark template as visited
                    const visitedTemplates = JSON.parse(localStorage.getItem('visited_templates') || '[]');
                    if (!visitedTemplates.includes(publishedTemplate._id)) {
                      visitedTemplates.push(publishedTemplate._id);
                      localStorage.setItem('visited_templates', JSON.stringify(visitedTemplates));
                    }
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
      <FilterSidebarSimple 
        onFiltersChange={handleFiltersChange}
        isVisible={sidebarVisible}
        onToggle={() => setSidebarVisible(!sidebarVisible)}
        savedFilters={templateFilters}
        templates={templates}
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
            
            {/* Switch General para Activar/Desactivar Todos */}
            <Card p="md" withBorder style={{ backgroundColor: '#f8f9fa' }}>
              <Group justify="space-between">
                <Group>
                  <IconFilter size={20} color="blue" />
                  <div>
                    <Text fw={600} size="md">Control General de Filtros</Text>
                    <Text size="xs" c="dimmed">
                      Activa o desactiva todos los filtros de una vez
                    </Text>
                  </div>
                </Group>
                
                <Switch
                  size="lg"
                  checked={areAllFiltersActive(selectedTemplateForFilters._id)}
                  onChange={(event) => 
                    toggleAllFilters(
                      selectedTemplateForFilters._id, 
                      event.currentTarget.checked
                    )
                  }
                  label={areAllFiltersActive(selectedTemplateForFilters._id) ? "Desactivar todos" : "Activar todos"}
                  thumbIcon={
                    areAllFiltersActive(selectedTemplateForFilters._id) ? (
                      <IconEye size={16} />
                    ) : (
                      <IconEyeOff size={16} />
                    )
                  }
                  color="blue"
                />
              </Group>
            </Card>
            
            <Divider label="Filtros Individuales" labelPosition="center" />
            
            {(() => {
              const filters = templateFilters[selectedTemplateForFilters._id] || [];
              
              return filters.map((filter) => {
                const templateField = selectedTemplateForFilters.template.fields.find(f => f.name === filter.fieldName);
                const isVisible = filter.isVisible ?? true;
                
                return (
                  <Card key={filter.fieldName} p="sm" withBorder>
                    <Group justify="space-between">
                      <Group>
                        <IconFilter size={16} color={isVisible ? "green" : "gray"} />
                        <div>
                          <Text fw={500}>{filter.fieldName.replace(/_/g, ' ')}</Text>
                          <Text size="xs" c="dimmed">
                            {templateField ? (
                              `Tipo: ${templateField.datatype} ${templateField.required ? '(Requerido)' : ''}`
                            ) : (
                              filter.fieldName === 'DEPENDENCIA' ? 'Campo de dependencia' : 'Campo adicional'
                            )}
                          </Text>
                        </div>
                      </Group>
                      
                      <Group>
                        <Switch
                          checked={isVisible}
                          onChange={(event) => 
                            updateFilterVisibility(
                              selectedTemplateForFilters._id, 
                              filter.fieldName, 
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
              });
            })()}
            
            <Group justify="flex-end" mt="md">
              <Button 
                variant="outline" 
                onClick={() => setFilterModalOpened(false)}
              >
                Cerrar
              </Button>
              <Button 
                onClick={async () => {
                  try {
                    const filtersToSave = templateFilters[selectedTemplateForFilters._id] || [];
                    
                    // Aquí deberías implementar la llamada a la API para guardar los filtros
                    // Por ahora, solo guardamos en localStorage como solución temporal
                    const filterConfig = {
                      templateId: selectedTemplateForFilters._id,
                      filters: filtersToSave
                    };
                    
                    localStorage.setItem(
                      `template_filters_${selectedTemplateForFilters._id}`, 
                      JSON.stringify(filterConfig)
                    );
                    
                    showNotification({
                      title: "Guardado",
                      message: "Configuración de filtros guardada exitosamente",
                      color: "green",
                    });
                    
                    // Force FilterSidebar to reload with new configuration
                    setAppliedFilters({});
                    setFilterModalOpened(false);
                  } catch (error) {
                    showNotification({
                      title: "Error",
                      message: "Error al guardar la configuración de filtros",
                      color: "red",
                    });
                  }
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