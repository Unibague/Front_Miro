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
import { IconCheck, IconX, IconArrowLeft, IconCheckupList, IconTableRow, IconFilter } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/es";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { useSearchParams } from "next/navigation";
import FilterSidebar from "@/app/components/FilterSidebar";

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

const renderCellContent = (value: any) => {
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
  const handleFiltersChange = (filters: Record<string, string[]>) => {
    setAppliedFilters(filters);
    
    if (Object.keys(filters).length === 0 || Object.values(filters).every(arr => arr.length === 0)) {
      setTableData(originalTableData);
      return;
    }
    
    let filteredData = [...originalTableData];
    
    Object.entries(filters).forEach(([filterName, values]) => {
      if (values.length > 0) {
        filteredData = filteredData.filter(row => {
          // Buscar el campo correspondiente en la fila
          const fieldNames = Object.keys(row);
          const matchingField = fieldNames.find(field => 
            field.toLowerCase().replace(/[^a-z0-9]/g, '_') === filterName
          );
          
          if (matchingField) {
            const fieldValue = row[matchingField];
            
            // Manejar diferentes tipos de datos
            let cellText = '';
            if (fieldValue === null || fieldValue === undefined) {
              cellText = '';
            } else if (typeof fieldValue === 'object') {
              // Si es objeto, extraer texto o convertir a JSON
              if (fieldValue.text) {
                cellText = fieldValue.text.toString();
              } else {
                cellText = JSON.stringify(fieldValue);
              }
            } else {
              cellText = fieldValue.toString();
            }
            
            return values.some(value => {
              const searchValue = value.toLowerCase().trim();
              const cellValue = cellText.toLowerCase().trim();
              
              // Coincidencia exacta, parcial o contenida
              return cellValue === searchValue || 
                     cellValue.includes(searchValue) ||
                     searchValue.includes(cellValue) ||
                     // Para fechas, buscar coincidencias parciales
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
            <Anchor 
              href={`${process.env.NEXT_PUBLIC_API_URL}/pTemplates/dimension/export/${id}?email=${session?.user?.email}`}
              target="_blank"
              size="sm"
            >
              📥 Descargar datos completos
            </Anchor>
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
              <Table striped withTableBorder fontSize="sm" style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
                <Table.Thead 
                  style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: '#f8f9fa',
                    zIndex: 10
                  }}
                >
                  <Table.Tr>
                    {Object.keys(tableData[0]).map((fieldName, index) => (
                      <Table.Th 
                        key={index} 
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
                  {tableData.map((rowData, rowIndex) => (
                    <Table.Tr key={rowIndex}>
                      {Object.keys(rowData).map((fieldName, cellIndex) => (
                        <Table.Td 
                          key={cellIndex} 
                          style={{ 
                            minWidth: "140px", 
                            maxWidth: "180px",
                            padding: "10px 8px",
                            verticalAlign: "top",
                            border: '1px solid #dee2e6'
                          }}
                        >
                          {renderCellContent(rowData[fieldName])}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
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
