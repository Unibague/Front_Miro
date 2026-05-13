"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Container,
  FileInput,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconDatabase,
  IconDownload,
  IconFileSpreadsheet,
  IconHistory,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";
import axios from "axios";
import { usePeriod } from "@/app/context/PeriodContext";

type PreviewRow = {
  row_number: number;
  identificacion: string;
  nombre_identificado: string;
  fuente_persona: string;
  tipo_apoyo_detectado: string;
  nombre_apoyo_detectado: string;
  apoyos_otros_periodos: string;
  periodos_apoyo_previo: string;
  plantillas_apoyo_previo: string;
  estado_cruce: string;
  _history_count: number;
  validadores_resueltos?: Record<string, string>;
};

type PreviewResponse = {
  sheetName: string;
  columnsAdded: string[];
  validatorColumns: Array<{
    sourceField: string;
    outputColumn: string;
    validatorName: string;
    validatorColumn: string;
    descriptionColumn: string;
  }>;
  summary: {
    totalRows: number;
    withIdentification: number;
    personsFound: number;
    withPreviousSupport: number;
    withoutMatches: number;
    validatorColumns: number;
    resolvedValidatorValues: number;
  };
  rows: PreviewRow[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const getErrorMessage = (error: unknown) => {
  const maybeAxiosError = error as { response?: { data?: { message?: string } }; message?: string };
  return maybeAxiosError.response?.data?.message || maybeAxiosError.message || "No fue posible procesar la plantilla.";
};

const statusColor = (status: string) => {
  if (status === "IDENTIFICADO_CON_HISTORIAL") return "teal";
  if (status === "IDENTIFICADO" || status === "IDENTIFICADO_POR_HISTORIAL") return "blue";
  if (status === "SIN_CEDULA") return "yellow";
  return "red";
};

export default function ApoyosPlantillasPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { selectedPeriodId, availablePeriods } = usePeriod();

  const selectedPeriodName = useMemo(
    () => availablePeriods.find((period) => period._id === selectedPeriodId)?.name || "Periodo actual",
    [availablePeriods, selectedPeriodId]
  );

  const buildFormData = () => {
    if (!file) return null;
    const formData = new FormData();
    formData.append("template_file", file);
    if (selectedPeriodId) formData.append("period_id", selectedPeriodId);
    return formData;
  };

  const handlePreview = async () => {
    const formData = buildFormData();
    if (!formData || !API_URL) return;

    setLoading(true);
    try {
      const response = await axios.post<PreviewResponse>(`${API_URL}/support-templates/preview`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(response.data);
      showNotification({
        title: "Plantilla procesada",
        message: "El cruce SIGA/Iceberg finalizo correctamente.",
        color: "teal",
      });
    } catch (error) {
      showNotification({ title: "Error", message: getErrorMessage(error), color: "red" });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    const formData = buildFormData();
    if (!formData || !API_URL || !file) return;

    setDownloading(true);
    try {
      const response = await axios.post(`${API_URL}/support-templates/download`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        responseType: "blob",
      });
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${file.name.replace(/\.(xlsx|xlsm)$/i, "")}_cruzada_siga_iceberg.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      showNotification({ title: "Error", message: getErrorMessage(error), color: "red" });
    } finally {
      setDownloading(false);
    }
  };

  const summaryCards = preview
    ? [
        { label: "Filas", value: preview.summary.totalRows, icon: <IconFileSpreadsheet size={20} />, color: "blue" },
      { label: "Con cedula", value: preview.summary.withIdentification, icon: <IconSearch size={20} />, color: "cyan" },
      { label: "Personas", value: preview.summary.personsFound, icon: <IconUsers size={20} />, color: "teal" },
      { label: "Con historial", value: preview.summary.withPreviousSupport, icon: <IconHistory size={20} />, color: "orange" },
      { label: "Validadores", value: preview.summary.validatorColumns, icon: <IconDatabase size={20} />, color: "violet" },
      ]
    : [];

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Paper withBorder radius="lg" p="lg">
          <Group justify="space-between" align="flex-start">
            <Box>
              <Title order={2}>Cruce de apoyos SIGA/Iceberg</Title>
              <Text c="dimmed" size="sm" mt={4}>
                {selectedPeriodName}
              </Text>
            </Box>
            <ThemeIcon size={52} radius="xl" color="teal" variant="light">
              <IconDatabase size={28} />
            </ThemeIcon>
          </Group>
        </Paper>

        {!API_URL && (
          <Alert color="red" icon={<IconAlertCircle size={18} />}>
            No esta configurada la URL del API.
          </Alert>
        )}

        <Paper withBorder radius="lg" p="lg">
          <Stack gap="md">
            <FileInput
              label="Plantilla de apoyos"
              placeholder="Selecciona un archivo .xlsx o .xlsm"
              accept=".xlsx,.xlsm"
              value={file}
              onChange={(value) => {
                setFile(value);
                setPreview(null);
              }}
              leftSection={<IconFileSpreadsheet size={18} />}
            />
            <Group justify="flex-end">
              <Button
                variant="light"
                leftSection={<IconSearch size={18} />}
                onClick={handlePreview}
                loading={loading}
                disabled={!file || !API_URL}
              >
                Vista previa
              </Button>
              <Button
                leftSection={<IconDownload size={18} />}
                onClick={handleDownload}
                loading={downloading}
                disabled={!file || !API_URL}
              >
                Descargar plantilla cruzada
              </Button>
            </Group>
          </Stack>
        </Paper>

        {preview && (
          <>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
              {summaryCards.map((item) => (
                <Paper key={item.label} withBorder radius="lg" p="md">
                  <Group gap="sm" wrap="nowrap">
                    <ThemeIcon color={item.color} variant="light" radius="xl" size={42}>
                      {item.icon}
                    </ThemeIcon>
                    <Box>
                      <Text size="xs" c="dimmed" fw={600}>
                        {item.label}
                      </Text>
                      <Text fw={800} size="xl">
                        {item.value}
                      </Text>
                    </Box>
                  </Group>
                </Paper>
              ))}
            </SimpleGrid>

            <Paper withBorder radius="lg" p="lg">
              <Group justify="space-between" mb="md">
                <Box>
                  <Text fw={700}>Vista previa</Text>
                  <Text size="xs" c="dimmed">
                    Hoja: {preview.sheetName}
                  </Text>
                </Box>
                <Badge variant="light">{preview.rows.length} filas visibles</Badge>
              </Group>

              <Box style={{ overflowX: "auto" }}>
                <Table striped highlightOnHover withTableBorder withColumnBorders miw={1100}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Fila</Table.Th>
                      <Table.Th>Cedula</Table.Th>
                      <Table.Th>Nombre</Table.Th>
                      <Table.Th>Fuente</Table.Th>
                      <Table.Th>Tipo apoyo</Table.Th>
                      <Table.Th>Apoyo</Table.Th>
                      <Table.Th>Validadores</Table.Th>
                      <Table.Th>Otros periodos</Table.Th>
                      <Table.Th>Estado</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {preview.rows.map((row) => (
                      <Table.Tr key={`${row.row_number}-${row.identificacion}`}>
                        <Table.Td>{row.row_number}</Table.Td>
                        <Table.Td>{row.identificacion || "-"}</Table.Td>
                        <Table.Td>{row.nombre_identificado || "-"}</Table.Td>
                        <Table.Td>{row.fuente_persona || "-"}</Table.Td>
                        <Table.Td>{row.tipo_apoyo_detectado || "-"}</Table.Td>
                        <Table.Td>{row.nombre_apoyo_detectado || "-"}</Table.Td>
                        <Table.Td>
                          {Object.keys(row.validadores_resueltos || {}).length === 0 ? (
                            "-"
                          ) : (
                            <Stack gap={4}>
                              {Object.entries(row.validadores_resueltos || {}).map(([column, value]) => (
                                <Text key={column} size="xs" lineClamp={1}>
                                  <Text span fw={700}>{column.replace(/^DESC_/, "")}:</Text> {value}
                                </Text>
                              ))}
                            </Stack>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" lineClamp={2}>
                            {row.apoyos_otros_periodos || "-"}
                          </Text>
                          {row.periodos_apoyo_previo && (
                            <Text size="xs" c="dimmed" lineClamp={1}>
                              {row.periodos_apoyo_previo}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Badge color={statusColor(row.estado_cruce)} variant="light">
                            {row.estado_cruce}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Box>
            </Paper>
          </>
        )}
      </Stack>
    </Container>
  );
}
