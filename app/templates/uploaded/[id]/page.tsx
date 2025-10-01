"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";
import {
  Container,
  Table,
  Title,
  Text,
  ScrollArea,
  Center,
  Tooltip,
  Button,
  Group,
  Badge,
  Box,
  ActionIcon,
  Anchor,
} from "@mantine/core";
import { useSession } from "next-auth/react";
import { IconCheck, IconX, IconArrowLeft, IconCheckupList, IconTableRow, IconFilter, IconDownload } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/es";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { useSearchParams } from "next/navigation";
import FilterSidebar from "@/app/components/FilterSidebar";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { showNotification } from "@mantine/notifications";

interface RowData {
  [key: string]: any;
}

interface User {
  full_name: string,
  email: string
}

interface Dependency {
  dep_code: string,
  name: string,
  responsible: string
  visualizers: string[]
}

interface ResumeData {
  dependency: string,
  send_by: User
}

const UploadedTemplatePage = () => {
  const router = useRouter();
  const { id } = useParams();
  const [tableData, setTableData] = useState<RowData[]>([]);
  const [originalTableData, setOriginalTableData] = useState<RowData[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [resumeData, setResumeData] = useState<ResumeData[]>()
  const [dependencies, setDependencies] = useState<Dependency[]>([])
  const searchParams = useSearchParams();
  const [resume, setResume] = useState<boolean>(
    searchParams.get("resume") === "true"
  );
  const { data: session } = useSession();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string[]>>({});
  const [savedFilters, setSavedFilters] = useState<Record<string, any[]>>({});

  const fetchDependenciesNames = async (depCodes: string[]) => {
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/dependencies/names`,
        {
          codes: depCodes,
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching dependency names:", error);
      return [];
    }
  };

  useEffect(() => {
    const fetchTemplateName = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${id}`
        );
        console.log(response.data)
        const templateName = response.data.name || "Plantilla sin nombre";
        setTemplateName(templateName);
        const sentData = response.data.publishedTemplate.loaded_data ?? []
        const sentDepedencies = sentData.map((data:any) => {
          return {dependency: data.dependency, send_by: data.send_by}
        })
        setResumeData(sentDepedencies)
        setDependencies(response.data.publishedTemplate.template.producers)
      } catch (error) {
        console.error("Error fetching template name:", error);
      }
    };

    const fetchUploadedData = async () => {
      if (id && session?.user?.email) {
        try {
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/dimension/mergedData`,
            {
              params: {
                pubTem_id: id,
                email: session?.user?.email,
              },
            }
          );

          const data = response.data.data;
          console.log('Raw data from API:', response.data);
          console.log('Processed data:', data);

          if (Array.isArray(data) && data.length > 0) {
            const depCodes = data.map((row: RowData) => row.Dependencia);
            const dependencyNames = await fetchDependenciesNames(depCodes);

            const updatedData = data.map((row: RowData) => {
              const dependencyName = dependencyNames.find(
                (dep: { code: string; name: string }) =>
                  dep.code === row.Dependencia
              );
              return {
                ...row,
                Dependencia: dependencyName
                  ? dependencyName.name
                  : row.Dependencia,
              };
            });

            console.log('Final table data:', updatedData);
            console.log('Sample row keys:', updatedData[0] ? Object.keys(updatedData[0]) : 'No data');
            
            // Analizar datos de evidencias
            const evidenciasStats = updatedData.reduce((stats, row) => {
              const evidencias = (row as any)['EVIDENCIAS'] || (row as any)['Evidencias'] || (row as any)['evidencias'];
              if (evidencias && evidencias !== '' && evidencias !== undefined) {
                stats.withData++;
                if (stats.samples.length < 3) {
                  stats.samples.push(evidencias);
                }
              } else {
                stats.withoutData++;
              }
              return stats;
            }, { withData: 0, withoutData: 0, samples: [] as any[] });
            
            console.log('Evidencias analysis:', evidenciasStats);
            setTableData(updatedData);
            setOriginalTableData(updatedData);
          } else {
            console.error("Invalid data format received from API.");
          }
        } catch (error) {
          console.error("Error fetching uploaded data:", error);
        }
      }
    };

    fetchTemplateName();
    fetchUploadedData();
    
    // Cargar configuración de filtros guardada
    if (id) {
      const savedConfig = localStorage.getItem(`template_filters_${id}`);
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          setSavedFilters({ [id as string]: config.filters });
        } catch (error) {
          console.error('Error loading saved filter config:', error);
        }
      }
    }
  }, [id, session]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("resume", `${resume}`);
    window.history.pushState(null, "", `?${params.toString()}`);
  }, [resume]);

const isValidDateString = (value: string) => {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value) || // ISO completo
    /^\d{4}-\d{2}-\d{2}$/.test(value) ||                          // YYYY-MM-DD
    /^\d{4}\/\d{2}\/\d{2}$/.test(value)                           // YYYY/MM/DD
  );
};

const truncateText = (text: string, maxLines: number = 3) => {
  if (!text || typeof text !== 'string') return text;
  
  const words = text.split(' ');
  const wordsPerLine = 8; // Aproximadamente 8 palabras por línea
  const maxWords = maxLines * wordsPerLine;
  
  if (words.length <= maxWords) {
    return text;
  }
  
  return words.slice(0, maxWords).join(' ') + '...';
};

const renderCellContent = (value: any, fieldName?: string) => {
  // Remover log repetitivo de evidencias
  // if (fieldName && (fieldName.toLowerCase().includes('evidencia') || fieldName.toLowerCase().includes('evidence'))) {
  //   console.log('Rendering Evidencias field:', { fieldName, value, valueType: typeof value });
  // }
  
  // Manejar valores undefined, null o cadenas vacías
  if (value === undefined || value === null || value === '') {
    return (
      <Text size="sm" c="dimmed">
        Sin datos
      </Text>
    );
  }
  
  if (typeof value === "boolean") {
    return value ? (
      <IconCheck color="green" size={20} />
    ) : (
      <IconX color="red" size={20} />
    );
  }

  if (
    typeof value === "string" &&
    isValidDateString(value) &&
    isNaN(Number(value)) &&
    dayjs(value).isValid()
  ) {
    return dateToGMT(value, "YYYY/MM/DD");
  }

  if (typeof value === "object" && value !== null) {
    // Si es un array, mostrar elementos separados por comas
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <Text size="sm">-</Text>;
      }
      
      const arrayText = value.map(item => {
        if (typeof item === 'object' && item !== null) {
          // Manejar hipervínculos de Excel
          if (item.hyperlink || item.text || item.formula) {
            return item.text || item.hyperlink || item.formula;
          }
          const possibleEmailKeys = ['email', 'value', 'label', 'mail', 'correo', 'address', 'emailAddress'];
          const itemEmailKey = possibleEmailKeys.find(key => item[key] && typeof item[key] === 'string');
          return itemEmailKey ? item[itemEmailKey] : (item.text || JSON.stringify(item));
        }
        return item;
      }).join(', ');
      
      if (arrayText.length > 50) {
        return (
          <Tooltip label={arrayText} multiline maw={300}>
            <Text size="sm" lineClamp={3}>
              {truncateText(arrayText)}
            </Text>
          </Tooltip>
        );
      }
      
      return (
        <Text size="sm">
          {arrayText}
        </Text>
      );
    }
    
    // Manejar hipervínculos de Excel primero
    if (value.hyperlink || value.text || value.formula) {
      const displayText = value.text || value.hyperlink || value.formula;
      if (displayText.length > 50) {
        return (
          <Tooltip label={displayText} multiline maw={300}>
            <Text size="sm" lineClamp={3}>
              {truncateText(displayText)}
            </Text>
          </Tooltip>
        );
      }
      return (
        <Text size="sm">
          {displayText}
        </Text>
      );
    }
    
    // Si tiene un campo .text, mostramos solo ese
    if (typeof value.text === "string") {
      return (
        <Tooltip label={value.text} multiline maw={300}>
          <Text size="sm" lineClamp={3}>
            {truncateText(value.text)}
          </Text>
        </Tooltip>
      );
    }

    // Si es objeto con número Mongo
    const mongoNumeric = value?.$numberInt || value?.$numberDouble;
    if (mongoNumeric !== undefined) return mongoNumeric;

    // Buscar propiedades de email de forma más exhaustiva
    const possibleEmailKeys = ['email', 'value', 'label', 'mail', 'correo', 'address', 'emailAddress'];
    const emailKey = possibleEmailKeys.find(key => value[key] && typeof value[key] === 'string');
    
    if (emailKey) {
      const emailValue = value[emailKey];
      return (
        <Text size="sm">
          {emailValue}
        </Text>
      );
    }

    // Intentar extraer cualquier valor string del objeto
    const objectValues = Object.values(value).filter(val => typeof val === 'string' && val.length > 0);
    if (objectValues.length > 0) {
      const firstStringValue = objectValues[0] as string;
      // Si parece un email, mostrarlo
      if (firstStringValue.includes('@') || firstStringValue.includes('.com') || firstStringValue.includes('.edu')) {
        return (
          <Text size="sm">
            {firstStringValue}
          </Text>
        );
      }
    }

    // Por defecto: mostramos objeto como string
    const jsonString = JSON.stringify(value);
    return (
      <Tooltip label={jsonString} multiline maw={300}>
        <Text size="sm" lineClamp={3}>
          {truncateText(jsonString)}
        </Text>
      </Tooltip>
    );
  }

  const stringValue = (value ?? "").toString();
  
  if (stringValue.length > 50) {
    return (
      <Tooltip label={stringValue} multiline maw={300}>
        <Text size="sm" lineClamp={3}>
          {truncateText(stringValue)}
        </Text>
      </Tooltip>
    );
  }

  return (
    <Text size="sm">
      {stringValue}
    </Text>
  );
};
  const handleDownloadFiltered = async () => {
    try {
      await downloadExcel(tableData, `${templateName}_filtrado`);
    } catch (error) {
      console.error("Error downloading filtered data:", error);
      showNotification({
        title: "Error",
        message: "Error al descargar los datos filtrados",
        color: "red",
      });
    }
  };

  const handleDownloadAll = async () => {
    try {
      await downloadExcel(originalTableData, `${templateName}_completo`);
    } catch (error) {
      console.error("Error downloading all data:", error);
      showNotification({
        title: "Error",
        message: "Error al descargar todos los datos",
        color: "red",
      });
    }
  };

  const downloadExcel = async (data: RowData[], fileName: string) => {
    if (data.length === 0) {
      showNotification({
        title: "Sin datos",
        message: "No hay datos para descargar",
        color: "orange",
      });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(templateName || "Datos");

    // Obtener las columnas del primer registro
    const columns = Object.keys(data[0]);
    
    // Crear encabezados
    const headerRow = worksheet.addRow(columns);
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

    // Agregar datos
    data.forEach((row) => {
      const rowValues = columns.map(column => {
        const value = row[column];
        
        // Manejar diferentes tipos de datos
        if (value === null || value === undefined) {
          return "";
        }
        
        if (typeof value === "boolean") {
          return value ? "Sí" : "No";
        }
        
        if (typeof value === "object") {
          // Manejar hipervínculos de Excel primero
          if (value.hyperlink || value.text || value.formula) {
            return value.text || value.hyperlink || value.formula;
          }
          
          // Si es un array, unir elementos
          if (Array.isArray(value)) {
            if (value.length === 0) {
              return "";
            }
            return value.map(item => {
              if (typeof item === 'object' && item !== null) {
                // Manejar hipervínculos de Excel
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
          
          // Si tiene texto, usar ese
          if (value.text) {
            return value.text;
          }
          
          // Si es número de Mongo
          const mongoNumeric = value?.$numberInt || value?.$numberDouble;
          if (mongoNumeric !== undefined) {
            return mongoNumeric;
          }
          
          // Buscar propiedades de email de forma más exhaustiva
          const possibleEmailKeys = ['email', 'value', 'label', 'mail', 'correo', 'address', 'emailAddress'];
          const emailKey = possibleEmailKeys.find(key => value[key] && typeof value[key] === 'string');
          
          if (emailKey) {
            return value[emailKey];
          }
          
          // Intentar extraer cualquier valor string del objeto
          const objectValues = Object.values(value).filter(val => typeof val === 'string' && val.length > 0);
          if (objectValues.length > 0) {
            const firstStringValue = objectValues[0] as string;
            // Si parece un email, usarlo
            if (firstStringValue.includes('@') || firstStringValue.includes('.com') || firstStringValue.includes('.edu')) {
              return firstStringValue;
            }
          }
          
          // Por defecto, convertir a JSON
          return JSON.stringify(value);
        }
        
        // Para fechas, formatear
        if (typeof value === "string" && isValidDateString(value) && dayjs(value).isValid()) {
          return dayjs(value).format("YYYY/MM/DD");
        }
        
        return value.toString();
      });
      
      const dataRow = worksheet.addRow(rowValues);
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    // Ajustar ancho de columnas
    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    // Generar y descargar archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    saveAs(blob, `${fileName}.xlsx`);
    
    showNotification({
      title: "Éxito",
      message: `Archivo ${fileName}.xlsx descargado exitosamente`,
      color: "green",
    });
  };

  const handleFiltersChange = (filters: Record<string, string[]>) => {
    setAppliedFilters(filters);
    
    if (Object.keys(filters).length === 0 || Object.values(filters).every(arr => arr.length === 0)) {
      setTableData(originalTableData);
      return;
    }
    
    let filteredData = [...originalTableData];
    
    Object.entries(filters).forEach(([filterName, values]) => {
      if (values.length > 0) {
        console.log('Aplicando filtro:', filterName, 'con valores:', values);
        filteredData = filteredData.filter(row => {
          // Buscar el campo correspondiente en la fila
          const fieldNames = Object.keys(row);
          
          // Primero intentar encontrar por transformación inversa (filterName -> fieldName)
          let matchingField = fieldNames.find(field => 
            field.toLowerCase().replace(/[^a-z0-9]/g, '_') === filterName
          );
          
          // Si no se encuentra, intentar coincidencia exacta
          if (!matchingField) {
            matchingField = fieldNames.find(field => field === filterName);
          }
          
          // Si no se encuentra, intentar coincidencia directa
          if (!matchingField) {
            matchingField = fieldNames.find(field => 
              field.toLowerCase() === filterName.toLowerCase()
            );
          }
          
          // Si aún no se encuentra, intentar sin espacios ni caracteres especiales
          if (!matchingField) {
            matchingField = fieldNames.find(field => 
              field.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === 
              filterName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
            );
          }
          
          if (!matchingField) {
            console.log('CAMPO NO ENCONTRADO - Buscado:', filterName, 'Disponibles:', fieldNames.slice(0, 10));
            return true; // Si no encuentra el campo, no filtrar
          }
          
          console.log('Campo buscado:', filterName, 'Campo encontrado:', matchingField);
          
          if (matchingField) {
            const fieldValue = row[matchingField];
            
            // Manejar diferentes tipos de datos
            let cellText = '';
            if (fieldValue === null || fieldValue === undefined) {
              cellText = '';
            } else if (typeof fieldValue === 'object') {
              // Manejar hipervínculos de Excel primero
              if (fieldValue.hyperlink || fieldValue.text || fieldValue.formula) {
                cellText = (fieldValue.text || fieldValue.hyperlink || fieldValue.formula).toString();
              } else if (fieldValue.text) {
                cellText = fieldValue.text.toString();
              } else {
                // Buscar propiedades de email de forma más exhaustiva
                const possibleEmailKeys = ['email', 'value', 'label', 'mail', 'correo', 'address', 'emailAddress'];
                const emailKey = possibleEmailKeys.find(key => fieldValue[key] && typeof fieldValue[key] === 'string');
                
                if (emailKey) {
                  cellText = fieldValue[emailKey].toString();
                } else if (Array.isArray(fieldValue)) {
                  if (fieldValue.length === 0) {
                    cellText = '';
                  } else {
                    cellText = fieldValue.map(item => {
                      if (typeof item === 'object' && item !== null) {
                        // Manejar hipervínculos de Excel
                        if (item.hyperlink || item.text || item.formula) {
                          return item.text || item.hyperlink || item.formula;
                        }
                        const itemEmailKey = possibleEmailKeys.find(key => item[key] && typeof item[key] === 'string');
                        return itemEmailKey ? item[itemEmailKey] : (item.text || JSON.stringify(item));
                      }
                      return item;
                    }).join(', ');
                  }
                } else {
                  // Intentar extraer cualquier valor string del objeto
                  const objectValues = Object.values(fieldValue).filter(val => typeof val === 'string' && val.length > 0);
                  if (objectValues.length > 0) {
                    const firstStringValue = objectValues[0] as string;
                    // Si parece un email, usarlo
                    if (firstStringValue.includes('@') || firstStringValue.includes('.com') || firstStringValue.includes('.edu')) {
                      cellText = firstStringValue;
                    } else {
                      cellText = JSON.stringify(fieldValue);
                    }
                  } else {
                    cellText = JSON.stringify(fieldValue);
                  }
                }
              }
            } else {
              cellText = fieldValue.toString();
            }
            
            return values.some(value => {
              const searchValue = value.toLowerCase().trim();
              const cellValue = cellText.toLowerCase().trim();
              
              // Para filtros de fecha, hacer comparación especial
              if (filterName.includes('fecha') || filterName.includes('date')) {
                console.log('DATE FILTER COMPARISON:', {
                  filterName,
                  searchValue,
                  cellValue,
                  fieldValue,
                  matchingField
                });
                
                // Si el valor de búsqueda es una fecha (YYYY-MM-DD)
                if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                  // Convertir ambos valores a fechas para comparar
                  try {
                    const searchDate = new Date(value);
                    let cellDate;
                    
                    if (typeof fieldValue === 'string' && isValidDateString(fieldValue)) {
                      cellDate = new Date(fieldValue);
                    } else if (fieldValue instanceof Date) {
                      cellDate = fieldValue;
                    } else {
                      return false;
                    }
                    
                    // Comparar solo las fechas (sin hora)
                    const searchDateStr = searchDate.toISOString().split('T')[0];
                    const cellDateStr = cellDate.toISOString().split('T')[0];
                    
                    console.log('Date comparison:', { searchDateStr, cellDateStr, match: searchDateStr === cellDateStr });
                    
                    return searchDateStr === cellDateStr;
                  } catch (error) {
                    console.log('Date parsing error:', error);
                    return false;
                  }
                }
              }
              
              // Para otros tipos de filtros, usar lógica normal
              return cellValue === searchValue || 
                     cellValue.includes(searchValue) ||
                     searchValue.includes(cellValue) ||
                     // Para fechas como texto, buscar coincidencias parciales
                     (cellValue.includes('-') && searchValue.includes('-') && 
                      cellValue.split('-').some(part => searchValue.includes(part))) ||
                     // Para texto largo, buscar palabras individuales
                     searchValue.split(' ').some(word => 
                       word.length > 2 && cellValue.includes(word)
                     );
            });
          }
          
          return true;
        });
      }
    });
    
    setTableData(filteredData);
  };

  const resumeRows = dependencies.map((dependency) => {
    const hasSentData = resumeData?.some(data => data.dependency===dependency.dep_code)
    return (
      <Table.Tr key={dependency.dep_code} c={!hasSentData ? "red" : undefined}>
        <Table.Td>{dependency.name}</Table.Td>
        <Table.Td>
          {dependency.visualizers.length > 0 ? (
            <Group gap={5}>
              {dependency.visualizers.slice(0, 1).map((v, index) => (
                <Text key={index}> {v} </Text>
              ))}
              {dependency.visualizers.length > 1 && (
                <Badge variant="outline">
                  +{dependency.visualizers.length - 1} más
                </Badge>
              )}
            </Group>
          ) : (
            <Text> No definido </Text>
          )}
        </Table.Td>
        <Table.Td>{hasSentData ? "✓ Enviado" : "✗ No enviado"}</Table.Td>
      </Table.Tr>
    );
  })

  return (
    <Box style={{ display: 'flex', minHeight: '100vh' }}>
      <FilterSidebar 
        onFiltersChange={handleFiltersChange}
        isVisible={sidebarVisible}
        onToggle={() => setSidebarVisible(!sidebarVisible)}
        templateId={id as string}
        templateData={originalTableData}
        savedFilters={savedFilters}
      />
      
      <Box 
        style={{ 
          flex: 1, 
          marginLeft: sidebarVisible ? '20%' : '0',
          transition: 'margin-left 0.3s ease',
          padding: '20px'
        }}
      >
        <Container size={"xl"} style={{ maxWidth: '100%', width: '100%' }}>
          <Group justify="space-between" mb="md">
            <Title ta="center">{`Datos Cargados para: ${templateName}`}</Title>
            <ActionIcon 
              variant="outline" 
              size="lg"
              onClick={() => setSidebarVisible(!sidebarVisible)}
            >
              <IconFilter size={20} />
            </ActionIcon>
          </Group>
          
          <Group mb="md">
            <Button
              variant="outline"
              leftSection={<IconArrowLeft />}
              onClick={() => router.back()}
            >
              Ir atrás
            </Button>
            {Object.keys(appliedFilters).length > 0 && (
              <Text size="sm" c="dimmed">
                Mostrando {tableData.length} de {originalTableData.length} registros
              </Text>
            )}
          </Group>
      <Group gap={0} mb={'xs'}>
        <Button
          variant={resume ? "outline" : "light"}
          onClick={() => setResume(!resume)}
          style={{ 
            borderTopLeftRadius: 50, 
            borderTopRightRadius: 0, 
            borderBottomLeftRadius: 50, 
            borderBottomRightRadius: 0
          }}
          leftSection={<IconCheckupList/>}
        >
          Resumen de Envíos
        </Button>
        <Button
          variant={resume ? "light" : "outline"}
          onClick={() => setResume(!resume)}
          style={{ 
            borderTopLeftRadius: 0, 
            borderTopRightRadius: 50, 
            borderBottomLeftRadius: 0, 
            borderBottomRightRadius: 50
          }}
          leftSection={<IconTableRow/>}
        >
          Información Cargada
        </Button>
      </Group>
      
      {resume ? 
      <Table mb={"md"} striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>
              Dependencia
            </Table.Th>
            <Table.Th>
              Líder(es)
            </Table.Th>
            <Table.Th>
              Estado de envío
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {resumeRows}
        </Table.Tbody>
      </Table>
      : tableData.length === 0 ? (
        <Text ta={"center"}>No hay datos cargados para esta plantilla.</Text>
      ) : (
        <Box>
          <Group justify="space-between" mb="md">
            <Text size="sm" c="dimmed">
              {tableData.length} registro{tableData.length !== 1 ? 's' : ''} encontrado{tableData.length !== 1 ? 's' : ''}
            </Text>
            <Group gap="xs">
              <Button
                variant="outline"
                size="sm"
                leftSection={<IconDownload size={16} />}
                onClick={() => handleDownloadFiltered()}
                disabled={tableData.length === 0}
              >
                 Descargar datos {Object.keys(appliedFilters).length > 0 ? 'filtrados' : 'completos'}
              </Button>
              {Object.keys(appliedFilters).length > 0 && (
                <Button
                  variant="subtle"
                  size="sm"
                  leftSection={<IconDownload size={16} />}
                  onClick={() => handleDownloadAll()}
                >
                   Descargar todos los datos
                </Button>
              )}
            </Group>
          </Group>
          
          <Box 
            style={{
              height: 'calc(100vh - 280px)',
              border: '1px solid #e9ecef',
              borderRadius: '8px',
              overflow: 'hidden'
            }}
          >
            <ScrollArea 
              style={{ height: '100%' }}
              scrollbarSize={8}
            >
              <Table striped withTableBorder style={{ minWidth: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <Table.Thead 
                  style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: '#f8f9fa',
                    zIndex: 10
                  }}
                >
                  <Table.Tr>
                    {tableData.length > 0 && Object.keys(tableData[0]).map((fieldName, index) => (
                      <Table.Th 
                        key={`header-${index}`} 
                        style={{ 
                          minWidth: "140px", 
                          maxWidth: "180px",
                          padding: "12px 8px",
                          backgroundColor: '#f8f9fa',
                          border: '1px solid #dee2e6',
                          borderBottom: '2px solid #dee2e6'
                        }}
                      >
                        <Text size="xs" fw={700} ta="center" c="dark">
                          {fieldName.replace(/_/g, ' ')}
                        </Text>
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {tableData.map((rowData, rowIndex) => {
                    const fieldNames = Object.keys(tableData[0]);
                    return (
                      <Table.Tr key={`row-${rowIndex}`}>
                        {fieldNames.map((fieldName, cellIndex) => (
                          <Table.Td 
                            key={`cell-${rowIndex}-${cellIndex}`} 
                            style={{ 
                              minWidth: "140px", 
                              maxWidth: "180px",
                              padding: "10px 8px",
                              verticalAlign: "top",
                              border: '1px solid #dee2e6'
                            }}
                          >
                            {renderCellContent(rowData[fieldName], fieldName)}
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Box>
        </Box>
      )}
        </Container>
      </Box>
    </Box>
  );
};

export default UploadedTemplatePage;
