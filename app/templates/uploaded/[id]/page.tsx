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
} from "@mantine/core";
import { useSession } from "next-auth/react";
import { IconCheck, IconX, IconArrowLeft, IconCheckupList, IconTableRow } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/es";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import { useSearchParams } from "next/navigation";

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
  const [templateName, setTemplateName] = useState("");
  const [resumeData, setResumeData] = useState<ResumeData[]>()
  const [dependencies, setDependencies] = useState<Dependency[]>([])
  const searchParams = useSearchParams();
  const [resume, setResume] = useState<boolean>(
    searchParams.get("resume") === "true"
  );
  const { data: session } = useSession();

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

const renderCellContent = (value: any) => {
  if (typeof value === "boolean") {
    return value ? (
      <IconCheck color="green" size={25} />
    ) : (
      <IconX color="red" size={25} />
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
      return value.text;
    }

    // Si es objeto con número Mongo
    const mongoNumeric = value?.$numberInt || value?.$numberDouble;
    if (mongoNumeric !== undefined) return mongoNumeric;

    // Por defecto: mostramos objeto como string
    return JSON.stringify(value);
  }

  return value ?? "";
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
    <Container size={"lg"}>
      <Title ta="center">{`Datos Cargados para: ${templateName}`}</Title>
      <Group mb="md">
        <Button
          variant="outline"
          leftSection={<IconArrowLeft />}
          onClick={() => router.replace("/templates/published")}
        >
          Ir atrás
        </Button>
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
        <Tooltip
          label="Desplázate horizontalmente para ver más"
          position="bottom"
          withArrow
          transitionProps={{ transition: "slide-up", duration: 300 }}
        >
          <ScrollArea>
            <Table mb={"md"} striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  {Object.keys(tableData[0]).map((fieldName, index) => (
                    <Table.Th key={index} style={{ minWidth: "200px" }}>
                      <Center>{fieldName}</Center>
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tableData.map((rowData, rowIndex) => (
                  <Table.Tr key={rowIndex}>
                    {Object.keys(rowData).map((fieldName, cellIndex) => (
                      <Table.Td key={cellIndex} style={{ minWidth: "200px" }}>
                        <Center>{renderCellContent(rowData[fieldName])}</Center>
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Tooltip>
      )}
    </Container>
  );
};

export default UploadedTemplatePage;
