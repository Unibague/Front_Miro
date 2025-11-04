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
  
  // Verificar acceso
  useEffect(() => {
    if (userRole && !['Administrador', 'Responsable', 'Productor'].includes(userRole)) {
      router.push('/dashboard');
    }
  }, [userRole, router]);
  const [templates, setTemplates] = useState<PublishedTemplate[]>([]);
  const [allTemplates, setAllTemplates] = useState<PublishedTemplate[]>([]);
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
  
  // Multi-template selection states
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [isDownloadingMultiple, setIsDownloadingMultiple] = useState(false);
  
  // Field selection states
  const [fieldConfigModalOpened, setFieldConfigModalOpened] = useState(false);
  const [availableFields, setAvailableFields] = useState<{field: string, template: string, selected: boolean, order: number}[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  const { sortedItems: sortedTemplates, handleSort, sortConfig } = useSort<PublishedTemplate>(templates, { key: null, direction: "asc" });

  const fetchAllTemplates = async () => {
    try {
      const email = session?.user?.email;
      if (!email) return;
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/dimension`, {
        params: {
          page: 1,
          limit: 1000, // Obtener todas las plantillas
          email,
          periodId: selectedPeriodId,
          filterByUserScope: true,
        }
      });
      
      if (response.data) {
        setAllTemplates(response.data.templates || []);
      }
    } catch (error) {
      console.error("Error fetching all templates:", error);
    }
  };

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

  // Fetch all templates when period or session changes
  useEffect(() => {
    if (session?.user?.email && selectedPeriodId) {
      fetchAllTemplates();
    }
  }, [session, selectedPeriodId]);

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

  const openFieldConfigModal = () => {
    if (selectedTemplateIds.length === 0) {
      showNotification({
        title: "Error",
        message: "Selecciona al menos una plantilla",
        color: "red",
      });
      return;
    }
    
    // Generar clave única para la configuración basada en las plantillas seleccionadas
    const configKey = `field_config_${selectedTemplateIds.sort().join('_')}`;
    
    // Intentar cargar configuración guardada
    const savedConfig = localStorage.getItem(configKey);
    
    // Generar lista de campos disponibles de todas las plantillas seleccionadas
    const selectedTemplates = allTemplates.filter(t => selectedTemplateIds.includes(t._id));
    const allFields: {field: string, template: string, selected: boolean, order: number}[] = [];
    
    selectedTemplates.forEach((template, templateIndex) => {
      template.template.fields.forEach((field, fieldIndex) => {
        allFields.push({
          field: field.name,
          template: template.name,
          selected: true, // Por defecto seleccionado
          order: templateIndex * 100 + fieldIndex
        });
      });
      // Agregar campo DEPENDENCIA
      allFields.push({
        field: 'DEPENDENCIA',
        template: template.name,
        selected: true, // Por defecto seleccionado
        order: templateIndex * 100 + 999
      });
    });
    
    // Si hay configuración guardada, aplicarla
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        const savedSelectedFields = config.selectedFields || [];
        const savedFieldsOrder = config.fieldsOrder || {};
        
        // Actualizar campos con configuración guardada
        allFields.forEach(field => {
          const fieldKey = `${field.template}|${field.field}`;
          field.selected = savedSelectedFields.includes(fieldKey);
          if (savedFieldsOrder[fieldKey] !== undefined) {
            field.order = savedFieldsOrder[fieldKey];
          }
        });
        
        setSelectedFields(savedSelectedFields);
      } catch (error) {
        console.error('Error loading saved field config:', error);
        // Si hay error, usar configuración por defecto
        setSelectedFields(allFields.filter(f => f.selected).map(f => `${f.template}|${f.field}`));
      }
    } else {
      // Sin configuración guardada, usar todos los campos seleccionados por defecto
      setSelectedFields(allFields.filter(f => f.selected).map(f => `${f.template}|${f.field}`));
    }
    
    setAvailableFields(allFields);
    setFieldConfigModalOpened(true);
  };
  
  const handleMultipleTemplatesDownload = async () => {
    if (selectedFields.length === 0) {
      showNotification({
        title: "Error",
        message: "Selecciona al menos un campo para incluir",
        color: "red",
      });
      return;
    }

    setIsDownloadingMultiple(true);
    
    try {
      // Validaciones iniciales
      if (!allTemplates || allTemplates.length === 0) {
        throw new Error('No hay plantillas disponibles');
      }
      
      if (!selectedTemplateIds || selectedTemplateIds.length === 0) {
        throw new Error('No hay plantillas seleccionadas');
      }
      
      const selectedTemplates = allTemplates.filter(t => t && t._id && selectedTemplateIds.includes(t._id));
      
      if (selectedTemplates.length === 0) {
        throw new Error('Las plantillas seleccionadas no se encontraron');
      }
      
      console.log('Creating workbook...');
      const workbook = new ExcelJS.Workbook();
      
      // Crear hoja única combinada
      console.log('Creating worksheet...');
      const combinedSheet = workbook.addWorksheet("Datos_Combinados");
      
      // Validar availableFields
      if (!availableFields || availableFields.length === 0) {
        throw new Error('No hay campos disponibles configurados');
      }
      
      // Obtener campos seleccionados en orden
      const fieldsToInclude = availableFields
        .filter(f => f && f.field && f.template && selectedFields.includes(`${f.template}|${f.field}`))
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map(f => ({ field: f.field, template: f.template }));
      
      if (fieldsToInclude.length === 0) {
        throw new Error('No hay campos válidos para incluir');
      }
      
      console.log('Fields to include:', fieldsToInclude);
      
      // Crear encabezados con prefijo de plantilla
      const headers = ['PLANTILLA_ORIGEN']; // Agregar columna de origen primero
      fieldsToInclude.forEach(f => {
        if (f.field && f.template) {
          headers.push(`${f.template}_${f.field}`);
        }
      });
      
      console.log('Creating headers:', headers);
      
      if (!headers || headers.length === 0) {
        throw new Error('No se pudieron crear los encabezados');
      }
      
      const headerRow = combinedSheet.addRow(headers);
      
      // Aplicar estilos a los encabezados de forma segura
      if (headerRow && headerRow.eachCell) {
        headerRow.eachCell((cell) => {
          if (cell) {
            cell.font = { bold: true, color: { argb: "FFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0f1f39" } };
            cell.border = {
              top: { style: "thin" }, left: { style: "thin" },
              bottom: { style: "thin" }, right: { style: "thin" }
            };
          }
        });
      }
      
      // Procesar datos de cada plantilla
      let totalRowsAdded = 0;
      
      for (const template of selectedTemplates) {
        try {
          if (!template || !template._id || !template.name) {
            console.error('Invalid template:', template);
            continue;
          }
          
          if (!session?.user?.email) {
            throw new Error('No hay sesión de usuario válida');
          }
          
          console.log(`Processing template: ${template.name} (ID: ${template._id})`);
          
          const params: any = {
            pubTem_id: template._id,
            email: session.user.email,
            filterByUserScope: true,
          };
          
          // Aplicar filtros
          if (appliedFilters && Object.keys(appliedFilters).length > 0) {
            Object.entries(appliedFilters).forEach(([key, values]) => {
              if (values.length > 0) {
                params[key] = values.join(',');
              }
            });
            console.log('Applied filters:', appliedFilters);
          }
          
          console.log('Request params:', params);
          
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/dimension/mergedData`,
            { params }
          );
          
          console.log(`Response for ${template.name}:`, {
            status: response.status,
            dataExists: !!response.data,
            dataLength: response.data?.data?.length || 0
          });
          
          const data = response.data.data;
          if (!data || data.length === 0) {
            console.log(`No data found for template: ${template.name}`);
            // Agregar fila vacía para mostrar que la plantilla fue procesada
            const emptyRow = [template.name];
            fieldsToInclude.forEach(() => emptyRow.push('Sin datos'));
            combinedSheet.addRow(emptyRow);
            continue;
          }
          
          console.log(`Processing ${data.length} rows for ${template.name}`);
          console.log('Sample data row:', data[0]);
          
          // Agregar datos de esta plantilla
          data.forEach((row: any, rowIndex: number) => {
            try {
              if (!row || typeof row !== 'object') {
                console.warn(`Invalid row data at index ${rowIndex}:`, row);
                return;
              }
              
              const combinedRow = [template.name || 'Sin nombre']; // Columna de origen
              
              fieldsToInclude.forEach(({ field, template: fieldTemplate }) => {
                if (fieldTemplate === template.name) {
                  const fieldValue = row[field];
                  // Convertir valores a string seguro para Excel
                  let safeValue = '';
                  if (fieldValue !== undefined && fieldValue !== null) {
                    safeValue = typeof fieldValue === 'object' ? JSON.stringify(fieldValue) : String(fieldValue);
                  }
                  combinedRow.push(safeValue);
                } else {
                  combinedRow.push(''); // Campo vacío si no pertenece a esta plantilla
                }
              });
              
              // Validar que combinedRow tenga el número correcto de columnas
              if (combinedRow.length !== headers.length) {
                console.warn(`Row length mismatch: expected ${headers.length}, got ${combinedRow.length}`);
                // Ajustar la longitud
                while (combinedRow.length < headers.length) {
                  combinedRow.push('');
                }
                combinedRow.splice(headers.length);
              }
              
              combinedSheet.addRow(combinedRow);
              totalRowsAdded++;
            } catch (rowError) {
              console.error(`Error processing row ${rowIndex}:`, rowError);
            }
          });
          
          console.log(`Added ${data.length} rows for ${template.name}`);
          
        } catch (error) {
          console.error(`Error processing template ${template.name}:`, error);
          if (axios.isAxiosError(error)) {
            console.error('Axios error details:', {
              status: error.response?.status,
              statusText: error.response?.statusText,
              data: error.response?.data
            });
          }
          
          // Agregar fila de error
          const errorRow = [template.name];
          fieldsToInclude.forEach(() => errorRow.push('Error al cargar'));
          combinedSheet.addRow(errorRow);
        }
      }
      
      console.log(`Total rows added to Excel: ${totalRowsAdded}`);
      
      if (totalRowsAdded === 0) {
        // Agregar mensaje si no hay datos
        const noDataRow = ['Sin datos disponibles'];
        fieldsToInclude.forEach(() => noDataRow.push(''));
        combinedSheet.addRow(noDataRow);
      }
      
      combinedSheet.columns.forEach((column) => {
        column.width = 25;
      });
      
      // Descargar archivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      const fileName = `Datos_Combinados_${new Date().toISOString().slice(0, 10)}.xlsx`;
      saveAs(blob, fileName);
      
      showNotification({
        title: "Éxito",
        message: `Descarga completada: ${selectedTemplates.length} plantillas procesadas, ${totalRowsAdded} filas de datos`,
        color: "green",
      });
      
    } catch (error) {
      console.error("Error downloading combined data:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al generar los datos combinados",
        color: "red",
      });
    } finally {
      setIsDownloadingMultiple(false);
    }
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
      <FilterSidebar 
        onFiltersChange={handleFiltersChange}
        isVisible={sidebarVisible}
        onToggle={() => setSidebarVisible(!sidebarVisible)}
        savedFilters={templateFilters}
        templates={templates}
        key={JSON.stringify(templateFilters)} // Force re-render when filters change
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
          
          {/* Selector múltiple de plantillas */}
          <Paper p="md" withBorder mb="md">
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={600} size="md">Descarga Múltiple con Filtros</Text>
                <Badge variant="filled" color="blue">
                  {selectedTemplateIds.length} seleccionadas
                </Badge>
              </Group>
              
              <MultiSelect
                placeholder="Selecciona plantillas para descargar"
                data={allTemplates.map(t => ({ value: t._id, label: t.name }))}
                value={selectedTemplateIds}
                onChange={setSelectedTemplateIds}
                searchable
                clearable
                maxDropdownHeight={200}
              />
              
              <Group justify="flex-end">
                <Button
                  variant="outline"
                  onClick={() => setSelectedTemplateIds([])}
                  disabled={selectedTemplateIds.length === 0}
                  size="sm"
                >
                  Limpiar Selección
                </Button>
                <Button
                  variant="outline"
                  leftSection={<IconSettings size={16} />}
                  onClick={openFieldConfigModal}
                  disabled={selectedTemplateIds.length === 0}
                  size="sm"
                >
                  Configurar Campos
                </Button>
                <Button
                  leftSection={<IconDownload size={16} />}
                  onClick={handleMultipleTemplatesDownload}
                  disabled={selectedFields.length === 0 || isDownloadingMultiple}
                  loading={isDownloadingMultiple}
                  size="sm"
                >
                  {isDownloadingMultiple ? 'Generando...' : 'Generar Datos Combinados'}
                </Button>
              </Group>
              
              {selectedTemplateIds.length > 0 && (
                <Text size="xs" c="dimmed">
                  Se aplicarán los filtros activos del panel lateral a todas las plantillas seleccionadas
                </Text>
              )}
            </Stack>
          </Paper>
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
      
      {/* Modal de Configuración de Campos */}
      <Modal
        opened={fieldConfigModalOpened}
        onClose={() => setFieldConfigModalOpened(false)}
        title="Configurar Campos para Descarga"
        size="lg"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Selecciona y ordena los campos que quieres incluir en la descarga combinada:
          </Text>
          
          <Group justify="space-between">
            <Badge variant="filled" color="blue">
              {selectedFields.length} campos seleccionados
            </Badge>
            <Group>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  const allFieldKeys = availableFields.map(f => `${f.template}|${f.field}`);
                  setSelectedFields(allFieldKeys);
                  setAvailableFields(prev => prev.map(f => ({ ...f, selected: true })));
                }}
              >
                Seleccionar Todos
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  setSelectedFields([]);
                  setAvailableFields(prev => prev.map(f => ({ ...f, selected: false })));
                }}
              >
                Deseleccionar Todos
              </Button>
            </Group>
          </Group>
          
          <Paper p="sm" withBorder style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <Stack gap="xs">
              {availableFields
                .sort((a, b) => a.order - b.order)
                .map((field, index) => {
                  const fieldKey = `${field.template}|${field.field}`;
                  const isSelected = selectedFields.includes(fieldKey);
                  
                  return (
                    <Card key={fieldKey} p="xs" withBorder style={{ 
                      backgroundColor: isSelected ? '#e3f2fd' : 'white',
                      border: isSelected ? '2px solid #2196f3' : '1px solid #e0e0e0'
                    }}>
                      <Group justify="space-between">
                        <Group>
                          <Switch
                            checked={isSelected}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              if (checked) {
                                setSelectedFields(prev => [...prev, fieldKey]);
                              } else {
                                setSelectedFields(prev => prev.filter(f => f !== fieldKey));
                              }
                              setAvailableFields(prev => 
                                prev.map(f => 
                                  f.field === field.field && f.template === field.template 
                                    ? { ...f, selected: checked }
                                    : f
                                )
                              );
                            }}
                            size="sm"
                          />
                          <div>
                            <Text fw={500} size="sm">{field.field}</Text>
                            <Text size="xs" c="dimmed">de {field.template}</Text>
                          </div>
                        </Group>
                        
                        <Group gap="xs">
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => {
                              const sortedFields = availableFields.sort((a, b) => a.order - b.order);
                              const currentIndex = sortedFields.findIndex(f => f.field === field.field && f.template === field.template);
                              
                              if (currentIndex > 0) {
                                setAvailableFields(prev => {
                                  const newFields = [...prev];
                                  const currentField = newFields.find(f => f.field === field.field && f.template === field.template);
                                  const prevField = sortedFields[currentIndex - 1];
                                  const prevFieldInArray = newFields.find(f => f.field === prevField.field && f.template === prevField.template);
                                  
                                  if (currentField && prevFieldInArray) {
                                    // Intercambiar órdenes
                                    const tempOrder = currentField.order;
                                    currentField.order = prevFieldInArray.order;
                                    prevFieldInArray.order = tempOrder;
                                  }
                                  
                                  return newFields;
                                });
                              }
                            }}
                            disabled={availableFields.sort((a, b) => a.order - b.order).findIndex(f => f.field === field.field && f.template === field.template) === 0}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => {
                              const sortedFields = availableFields.sort((a, b) => a.order - b.order);
                              const currentIndex = sortedFields.findIndex(f => f.field === field.field && f.template === field.template);
                              
                              if (currentIndex < sortedFields.length - 1) {
                                setAvailableFields(prev => {
                                  const newFields = [...prev];
                                  const currentField = newFields.find(f => f.field === field.field && f.template === field.template);
                                  const nextField = sortedFields[currentIndex + 1];
                                  const nextFieldInArray = newFields.find(f => f.field === nextField.field && f.template === nextField.template);
                                  
                                  if (currentField && nextFieldInArray) {
                                    // Intercambiar órdenes
                                    const tempOrder = currentField.order;
                                    currentField.order = nextFieldInArray.order;
                                    nextFieldInArray.order = tempOrder;
                                  }
                                  
                                  return newFields;
                                });
                              }
                            }}
                            disabled={availableFields.sort((a, b) => a.order - b.order).findIndex(f => f.field === field.field && f.template === field.template) === availableFields.length - 1}
                          >
                            ↓
                          </Button>
                        </Group>
                      </Group>
                    </Card>
                  );
                })
              }
            </Stack>
          </Paper>
          
          <Group justify="flex-end">
            <Button 
              variant="outline" 
              onClick={() => setFieldConfigModalOpened(false)}
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                // Guardar configuración en localStorage
                const configKey = `field_config_${selectedTemplateIds.sort().join('_')}`;
                const fieldsOrder: Record<string, number> = {};
                
                availableFields.forEach(field => {
                  const fieldKey = `${field.template}|${field.field}`;
                  fieldsOrder[fieldKey] = field.order;
                });
                
                const configToSave = {
                  selectedFields,
                  fieldsOrder,
                  timestamp: new Date().toISOString()
                };
                
                localStorage.setItem(configKey, JSON.stringify(configToSave));
                
                setFieldConfigModalOpened(false);
                showNotification({
                  title: "Configuración Guardada",
                  message: `${selectedFields.length} campos configurados para descarga`,
                  color: "green",
                });
              }}
              disabled={selectedFields.length === 0}
            >
              Aplicar Configuración
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
};

export default TemplatesWithFiltersPage;