"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Center,
  Container,
  Group,
  ScrollArea,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowLeft } from "@tabler/icons-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { paramId } from "@/app/utils/routeParams";
import { useSession } from "next-auth/react";

interface SourceTemplate {
  template_id: string;
  template_name: string;
}

interface ConnectedDataResponse {
  template: {
    _id: string;
    name: string;
    file_name: string;
  };
  sourceTemplates: SourceTemplate[];
  sheets: Array<{
    worksheetName: string;
    sourceTemplate: SourceTemplate | null;
    headers: string[];
    rows: Array<Record<string, string>>;
    excludedIdentifications?: string[];
    preserveOriginalContent?: boolean;
  }>;
}

export default function SniesTemplateDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [data, setData] = useState<ConnectedDataResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const templateId = paramId(params);
  const pubTemId = searchParams?.get("pubTemId") ?? null;

  const fetchConnectedData = async () => {
    if (!session?.user?.email || !templateId) return;

    setLoading(true);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/snies/templates/${templateId}/connected-data`,
        {
          params: {
            email: session.user.email,
            ...(pubTemId ? { pubTemId } : {}),
          },
        }
      );

      setData(response.data);
    } catch (error) {
      console.error("Error fetching SNIES connected data:", error);
      showNotification({
        title: "Error",
        message: "No fue posible cargar la información consolidada SNIES.",
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnectedData();
  }, [session?.user?.email, templateId, pubTemId]);

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/snies/templates/published");
  };

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="md">
        <Title order={1}>
          {data ? `Datos SNIES para: ${data.template.name}` : "Cargando plantilla SNIES..."}
        </Title>
      </Group>

      <Group mb="md">
        <Button variant="outline" leftSection={<IconArrowLeft size={16} />} onClick={handleGoBack}>
          Volver
        </Button>
      </Group>


      {!data && !loading && (
        <Center>
          <Text c="dimmed">No se encontró información SNIES para esta plantilla.</Text>
        </Center>
      )}

      {data && (
        <Box
          style={{
            height: "calc(100vh - 240px)",
            border: "1px solid #e9ecef",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          <Tabs
            defaultValue={data.sheets[0]?.worksheetName || "sin-hojas"}
            style={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <Tabs.List>
              {data.sheets.map((sheet) => (
                <Tabs.Tab key={sheet.worksheetName} value={sheet.worksheetName}>
                  {sheet.worksheetName}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {data.sheets.map((sheet) => (
              <Tabs.Panel
                key={sheet.worksheetName}
                value={sheet.worksheetName}
                style={{ flex: 1, minHeight: 0, paddingTop: 12, display: "flex", flexDirection: "column" }}
              >
                {sheet.excludedIdentifications && sheet.excludedIdentifications.length > 0 && (
                  <Alert
                    icon={<IconAlertTriangle size={16} />}
                    color="yellow"
                    title="Estudiantes no incluidos por no estar matriculados"
                    mb="sm"
                  >
                    Las siguientes cédulas no aparecen en la plantilla de Matriculados del período actual, por lo que no
                    se incluyen en este reporte: {sheet.excludedIdentifications.join(", ")}.
                  </Alert>
                )}

                <ScrollArea style={{ flex: 1, minHeight: 0 }} scrollbarSize={8}>
                  <Table striped withTableBorder style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <Table.Thead
                      style={{
                        position: "sticky",
                        top: 0,
                        backgroundColor: "#f8f9fa",
                        zIndex: 10,
                      }}
                    >
                      <Table.Tr>
                        {sheet.headers.map((header) => (
                          <Table.Th
                            key={header}
                            style={{
                              minWidth: "160px",
                              maxWidth: "220px",
                              padding: "12px 8px",
                              backgroundColor: "#f8f9fa",
                              border: "1px solid #dee2e6",
                              borderBottom: "2px solid #dee2e6",
                            }}
                          >
                            <Text size="xs" fw={700} ta="center" c="dark">
                              {header}
                            </Text>
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {sheet.rows.length > 0 ? (
                        sheet.rows.map((row, rowIndex) => (
                          <Table.Tr key={`${sheet.worksheetName}-row-${rowIndex}`}>
                            {sheet.headers.map((header) => (
                              <Table.Td
                                key={`${sheet.worksheetName}-${rowIndex}-${header}`}
                                style={{
                                  minWidth: "160px",
                                  maxWidth: "220px",
                                  padding: "10px 8px",
                                  verticalAlign: "top",
                                  border: "1px solid #dee2e6",
                                }}
                              >
                                <Text size="sm">{String(row[header] ?? "") || "Sin datos"}</Text>
                              </Table.Td>
                            ))}
                          </Table.Tr>
                        ))
                      ) : (
                        <Table.Tr>
                          <Table.Td colSpan={sheet.headers.length || 1}>
                            <Center>
                              <Text c="dimmed">
                                {sheet.preserveOriginalContent
                                  ? "La hoja INFO se conserva exactamente como viene en la plantilla."
                                  : sheet.sourceTemplate
                                  ? "No hay datos conectados para esta hoja."
                                  : "Esta hoja no tiene una plantilla publicada asociada por nombre."}
                              </Text>
                            </Center>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Tabs.Panel>
            ))}
          </Tabs>
        </Box>
      )}
    </Container>
  );
}
