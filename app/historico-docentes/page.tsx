"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Container,
  FileInput,
  Group,
  Loader,
  Pagination,
  ScrollArea,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconArrowLeft, IconDownload, IconSearch, IconUpload, IconUsersGroup } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";
import { useDebouncedValue } from "@mantine/hooks";
import { useRouter } from "next/navigation";

const PAGE_SIZE = 50;
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/historico-docentes`;

interface SheetInfo {
  index: number;
  name: string;
  totalRows: number;
  headers: string[];
}

interface SheetData {
  index: number;
  name: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
  page: number;
  totalPages: number;
}

interface HistoricoData {
  _id: string;
  file_name: string;
  uploaded_by: { full_name?: string; email?: string };
  drive_file_link: string;
  drive_file_download: string;
  updatedAt: string;
  sheetsInfo: SheetInfo[];
  availableYears: string[];
  currentSheet: SheetData;
}

const displayHeader = (h: string) => {
  const normalized = h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (normalized === "ano") return "Año";
  return h;
};

export default function HistoricoDocentesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { userRole } = useRole();
  const isAdmin = userRole === "Administrador";

  const [data, setData] = useState<HistoricoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch] = useDebouncedValue(searchText, 350);

  const fetchData = useCallback(async (
    sheetIndex = 0,
    pageNum = 1,
    year: string | null = null,
    search = ""
  ) => {
    if (!session?.user?.email) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/data`, {
        params: {
          email: session.user.email,
          sheet: sheetIndex,
          page: pageNum,
          limit: PAGE_SIZE,
          ...(year ? { year } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        },
      });
      if (res.data?.data === null) {
        setData(null);
      } else {
        setData(res.data);
      }
    } catch (error) {
      console.error("Error fetching histórico docentes:", error);
      showNotification({ title: "Error", message: "No se pudo cargar el histórico.", color: "red" });
    } finally {
      setLoading(false);
    }
  }, [session?.user?.email]);

  useEffect(() => {
    fetchData(activeSheet, page, selectedYear, debouncedSearch);
  }, [fetchData, activeSheet, page, selectedYear, debouncedSearch]);

  const handleSheetChange = (value: string | null) => {
    setActiveSheet(parseInt(value ?? "0", 10));
    setPage(1);
  };

  const handleYearChange = (value: string | null) => {
    setSelectedYear(value);
    setPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.currentTarget.value);
    setPage(1);
  };

  const handleUpload = async () => {
    if (!file || !session?.user?.email) return;

    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xlsm")) {
      showNotification({ title: "Formato no válido", message: "Solo se aceptan archivos .xlsx o .xlsm.", color: "red" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("email", session.user.email);
      formData.append("excel_file", file);

      await axios.post(`${API_BASE}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      showNotification({ title: "Archivo cargado", message: "El histórico de docentes se actualizó correctamente.", color: "teal" });

      setFile(null);
      setSelectedYear(null);
      setSearchText("");
      setActiveSheet(0);
      setPage(1);
      fetchData(0, 1, null, "");
    } catch (error) {
      console.error("Error uploading:", error);
      showNotification({ title: "Error", message: "No se pudo cargar el archivo.", color: "red" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = () => {
    if (!session?.user?.email) return;
    window.open(
      `${API_BASE}/download?email=${encodeURIComponent(session.user.email)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const yearOptions = (data?.availableYears ?? []).map((y) => ({ value: y, label: y }));
  const hasFilters = !!selectedYear || !!debouncedSearch.trim();

  return (
    <Container size="xl" py="xl">
      {/* Encabezado */}
      <Group mb="md" justify="space-between" align="flex-start">
        <Group gap="xs">
          <ActionIcon
            variant="subtle"
            color="blue"
            size="md"
            onClick={() => router.back()}
            aria-label="Volver"
          >
            <IconArrowLeft size={18} />
          </ActionIcon>
          <IconUsersGroup size={28} color="#7c3aed" />
          <Title order={2}>Histórico Docentes</Title>
        </Group>

        <Group>
          {data && (
            <Tooltip label="Descargar Excel">
              <Button variant="outline" leftSection={<IconDownload size={16} />} onClick={handleDownload}>
                Descargar
              </Button>
            </Tooltip>
          )}
          {isAdmin && (
            <Group gap="xs">
              <FileInput
                placeholder="Seleccionar Excel (.xlsx)"
                value={file}
                onChange={setFile}
                accept=".xlsx,.xlsm"
                leftSection={<IconUpload size={16} />}
                style={{ minWidth: 240 }}
                clearable
              />
              <Button onClick={handleUpload} loading={uploading} disabled={!file} color="violet">
                Cargar
              </Button>
            </Group>
          )}
        </Group>
      </Group>

      {/* Sin datos */}
      {!data && !loading ? (
        <Center h={300}>
          <Stack align="center" gap="sm">
            <IconUsersGroup size={48} color="#7c3aed" opacity={0.4} />
            <Text c="dimmed" ta="center">
              {isAdmin
                ? "No hay histórico cargado aún. Sube un archivo Excel para comenzar."
                : "No hay histórico de docentes disponible."}
            </Text>
          </Stack>
        </Center>
      ) : data ? (
        <>
          {/* Filtros FUERA de las pestañas */}
          <Group mb="md" align="flex-end">
            {yearOptions.length > 0 && (
              <Select
                label="Filtrar por año"
                placeholder="Todos los años"
                data={yearOptions}
                value={selectedYear}
                onChange={handleYearChange}
                clearable
                style={{ width: 180 }}
              />
            )}
            <Box style={{ flex: 1, maxWidth: 340 }}>
              <TextInput
                label="Buscar"
                placeholder="Buscar en todos los campos..."
                value={searchText}
                onChange={handleSearchChange}
                leftSection={<IconSearch size={16} />}
              />
            </Box>
            {hasFilters && (
              <Badge variant="light" color="violet" size="lg" style={{ marginBottom: 2 }}>
                {data.currentSheet.totalRows.toLocaleString("es-CO")} resultados
              </Badge>
            )}
          </Group>

          {/* Pestañas */}
          <Tabs value={String(activeSheet)} onChange={handleSheetChange} variant="outline">
            <Tabs.List mb="md">
              {data.sheetsInfo.map((sheet) => (
                <Tabs.Tab key={sheet.index} value={String(sheet.index)}>
                  <Group gap={6}>
                    {sheet.name}
                    <Badge size="xs" variant="light" color="violet">
                      {sheet.totalRows.toLocaleString("es-CO")} filas
                    </Badge>
                  </Group>
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {data.sheetsInfo.map((sheet) => (
              <Tabs.Panel key={sheet.index} value={String(sheet.index)}>
                {data.currentSheet.index === sheet.index && (
                  <>
                    {loading ? (
                      <Center h={200}>
                        <Loader />
                      </Center>
                    ) : (
                      <>
                        <ScrollArea>
                          <Table striped withTableBorder withColumnBorders stickyHeader style={{ minWidth: 600 }}>
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th style={{ minWidth: 40, backgroundColor: "#f8f9fa" }}>
                                  <Text size="xs" c="dimmed">#</Text>
                                </Table.Th>
                                {data.currentSheet.headers.map((header, i) => (
                                  <Table.Th key={i} style={{ whiteSpace: "nowrap", backgroundColor: "#f8f9fa" }}>
                                    {displayHeader(header)}
                                  </Table.Th>
                                ))}
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {data.currentSheet.rows.length === 0 ? (
                                <Table.Tr>
                                  <Table.Td colSpan={data.currentSheet.headers.length + 1}>
                                    <Center py="md">
                                      <Text c="dimmed">No hay datos para los filtros seleccionados.</Text>
                                    </Center>
                                  </Table.Td>
                                </Table.Tr>
                              ) : (
                                data.currentSheet.rows.map((row, rowIndex) => {
                                  const globalRowNum = (data.currentSheet.page - 1) * PAGE_SIZE + rowIndex + 1;
                                  return (
                                    <Table.Tr key={rowIndex}>
                                      <Table.Td>
                                        <Text size="xs" c="dimmed">{globalRowNum}</Text>
                                      </Table.Td>
                                      {data.currentSheet.headers.map((_, colIndex) => (
                                        <Table.Td key={colIndex} style={{ whiteSpace: "nowrap" }}>
                                          {row[colIndex] ?? ""}
                                        </Table.Td>
                                      ))}
                                    </Table.Tr>
                                  );
                                })
                              )}
                            </Table.Tbody>
                          </Table>
                        </ScrollArea>

                        {data.currentSheet.totalPages > 1 && (
                          <Center mt="md">
                            <Pagination
                              value={page}
                              onChange={setPage}
                              total={data.currentSheet.totalPages}
                              siblings={1}
                              boundaries={2}
                            />
                          </Center>
                        )}

                        <Text size="xs" c="dimmed" ta="right" mt="xs">
                          Mostrando{" "}
                          {(data.currentSheet.page - 1) * PAGE_SIZE + 1}–
                          {Math.min(data.currentSheet.page * PAGE_SIZE, data.currentSheet.totalRows)}{" "}
                          de {data.currentSheet.totalRows.toLocaleString("es-CO")} registros
                        </Text>
                      </>
                    )}
                  </>
                )}
              </Tabs.Panel>
            ))}
          </Tabs>
        </>
      ) : (
        <Center h={300}>
          <Loader />
        </Center>
      )}
    </Container>
  );
}
