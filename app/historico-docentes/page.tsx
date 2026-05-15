"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
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
import {
  IconArrowLeft,
  IconChevronLeft,
  IconFileSpreadsheet,
  IconFolder,
  IconSearch,
  IconCheck,
  IconPencil,
  IconTrash,
  IconX,
  IconUpload,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";
import { usePeriod } from "@/app/context/PeriodContext";
import { useDebouncedValue } from "@mantine/hooks";
import { useRouter } from "next/navigation";

const PAGE_SIZE = 50;
const API_BASE = `${process.env.NEXT_PUBLIC_API_URL}/historico-docentes`;

type Category = "snies" | "plantillas" | "informes";

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

interface FileItem {
  _id: string;
  file_name: string;
  uploaded_by: { full_name?: string; email?: string };
  createdAt: string;
  updatedAt: string;
  category: string;
  sheetsInfo: { index: number; name: string; totalRows: number }[];
}

const CATEGORY_LABELS: Record<Category, string> = {
  snies: "Histórico Docentes (SNIES)",
  plantillas: "Plantillas",
  informes: "Informes",
};

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  snies: <IconUsersGroup size={16} />,
  plantillas: <IconFolder size={16} />,
  informes: <IconFileSpreadsheet size={16} />,
};

const displayHeader = (h: string) => {
  const normalized = h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (normalized === "ano") return "Año";
  return h;
};

export default function ConsultaInformacionPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { userRole } = useRole();
  const isAdmin = userRole === "Administrador";
  const { selectedPeriodId } = usePeriod();

  const [activeCategory, setActiveCategory] = useState<Category>("plantillas");

  // Estado para SNIES (archivo único)
  const [sniesData, setSniesData] = useState<HistoricoData | null>(null);
  const [sniesLoading, setSniesLoading] = useState(false);
  const [sniesSheet, setSniesSheet] = useState(0);
  const [sniesPage, setSniesPage] = useState(1);
  const [sniesYear, setSniesYear] = useState<string | null>(null);
  const [sniesSearch, setSniesSearch] = useState("");
  const [debouncedSniesSearch] = useDebouncedValue(sniesSearch, 350);

  // Estado para Plantillas/Informes (múltiples archivos)
  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [fileListLoading, setFileListLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileData, setFileData] = useState<HistoricoData | null>(null);
  const [fileDataLoading, setFileDataLoading] = useState(false);
  const [fileSheet, setFileSheet] = useState(0);
  const [filePage, setFilePage] = useState(1);
  const [fileYear, setFileYear] = useState<string | null>(null);
  const [fileSearch, setFileSearch] = useState("");
  const [debouncedFileSearch] = useDebouncedValue(fileSearch, 350);

  // Estado de carga compartido
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Edición inline de nombre
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // ── SNIES fetch ──────────────────────────────────────────────
  const fetchSnies = useCallback(
    async (sheetIndex = 0, pageNum = 1, year: string | null = null, search = "") => {
      if (!session?.user?.email) return;
      setSniesLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/data`, {
          params: {
            email: session.user.email,
            category: "snies",
            sheet: sheetIndex,
            page: pageNum,
            limit: PAGE_SIZE,
            ...(year ? { year } : {}),
            ...(search.trim() ? { search: search.trim() } : {}),
          },
        });
        setSniesData(res.data?.data === null ? null : res.data);
      } catch {
        showNotification({ title: "Error", message: "No se pudo cargar el histórico SNIES.", color: "red" });
      } finally {
        setSniesLoading(false);
      }
    },
    [session?.user?.email]
  );

  // ── Lista de archivos fetch ───────────────────────────────────
  const fetchFileList = useCallback(
    async (category: Category, periodId?: string | null) => {
      if (!session?.user?.email || category === "snies") return;
      setFileListLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/list`, {
          params: { email: session.user.email, category, ...(periodId ? { periodId } : {}) },
        });
        setFileList(res.data.files || []);
      } catch {
        showNotification({ title: "Error", message: "No se pudo cargar la lista de archivos.", color: "red" });
      } finally {
        setFileListLoading(false);
      }
    },
    [session?.user?.email]
  );

  // ── Datos de un archivo específico ───────────────────────────
  const fetchFileData = useCallback(
    async (fileId: string, sheetIndex = 0, pageNum = 1, year: string | null = null, search = "") => {
      if (!session?.user?.email) return;
      setFileDataLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/data`, {
          params: {
            email: session.user.email,
            id: fileId,
            sheet: sheetIndex,
            page: pageNum,
            limit: PAGE_SIZE,
            ...(year ? { year } : {}),
            ...(search.trim() ? { search: search.trim() } : {}),
          },
        });
        setFileData(res.data?.data === null ? null : res.data);
      } catch {
        showNotification({ title: "Error", message: "No se pudo cargar el archivo.", color: "red" });
      } finally {
        setFileDataLoading(false);
      }
    },
    [session?.user?.email]
  );

  // Efectos por categoría y período
  useEffect(() => {
    if (activeCategory === "snies") {
      setSniesData(null);
      setSniesSheet(0);
      setSniesPage(1);
      setSniesYear(null);
      setSniesSearch("");
      fetchSnies(0, 1, null, "");
    } else {
      setFileList([]);
      setSelectedFile(null);
      setFileData(null);
      fetchFileList(activeCategory, selectedPeriodId);
    }
    setFile(null);
  }, [activeCategory, selectedPeriodId, fetchSnies, fetchFileList]);

  // SNIES: refetch al cambiar filtros
  useEffect(() => {
    if (activeCategory === "snies") {
      fetchSnies(sniesSheet, sniesPage, sniesYear, debouncedSniesSearch);
    }
  }, [sniesSheet, sniesPage, sniesYear, debouncedSniesSearch]);

  // Archivo seleccionado: refetch al cambiar filtros
  useEffect(() => {
    if (selectedFile) {
      fetchFileData(selectedFile._id, fileSheet, filePage, fileYear, debouncedFileSearch);
    }
  }, [fileSheet, filePage, fileYear, debouncedFileSearch, selectedFile]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleSelectFile = (item: FileItem) => {
    setSelectedFile(item);
    setFileData(null);
    setFileSheet(0);
    setFilePage(1);
    setFileYear(null);
    setFileSearch("");
    fetchFileData(item._id, 0, 1, null, "");
  };

  const handleRename = async (item: FileItem) => {
    if (!editingName.trim() || editingName.trim() === item.file_name) {
      setEditingId(null);
      return;
    }
    try {
      await axios.patch(`${API_BASE}/${item._id}/rename`, { file_name: editingName.trim() });
      setFileList(prev => prev.map(f => f._id === item._id ? { ...f, file_name: editingName.trim() } : f));
      setEditingId(null);
    } catch {
      showNotification({ title: "Error", message: "No se pudo renombrar el archivo.", color: "red" });
    }
  };

  const handleDeleteFile = async (item: FileItem) => {
    if (!session?.user?.email) return;
    try {
      await axios.delete(`${API_BASE}/${item._id}`, {
        params: { email: session.user.email },
      });
      showNotification({ title: "Eliminado", message: `"${item.file_name}" fue eliminado.`, color: "teal" });
      if (selectedFile?._id === item._id) {
        setSelectedFile(null);
        setFileData(null);
      }
      fetchFileList(activeCategory);
    } catch {
      showNotification({ title: "Error", message: "No se pudo eliminar el archivo.", color: "red" });
    }
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
      formData.append("category", activeCategory);
      if (activeCategory !== "snies" && selectedPeriodId) {
        formData.append("periodId", selectedPeriodId);
      }
      formData.append("excel_file", file);
      await axios.post(`${API_BASE}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      showNotification({
        title: "Archivo cargado",
        message: `"${file.name}" fue cargado en ${CATEGORY_LABELS[activeCategory]}.`,
        color: "teal",
      });
      setFile(null);
      if (activeCategory === "snies") {
        fetchSnies(0, 1, null, "");
      } else {
        fetchFileList(activeCategory);
      }
    } catch {
      showNotification({ title: "Error", message: "No se pudo cargar el archivo.", color: "red" });
    } finally {
      setUploading(false);
    }
  };


  // ── Render tabla de datos ─────────────────────────────────────
  const renderDataTable = (
    data: HistoricoData,
    loading: boolean,
    sheet: number,
    page: number,
    year: string | null,
    search: string,
    onSheetChange: (v: string | null) => void,
    onPageChange: (v: number) => void,
    onYearChange: (v: string | null) => void,
    onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  ) => {
    const yearOptions = (data.availableYears ?? []).map((y) => ({ value: y, label: y }));
    const hasFilters = !!year || !!search.trim();

    return (
      <>
        <Group mb="md" align="flex-end">
          {yearOptions.length > 0 && (
            <Select
              label="Filtrar por año"
              placeholder="Todos los años"
              data={yearOptions}
              value={year}
              onChange={onYearChange}
              clearable
              style={{ width: 180 }}
            />
          )}
          <Box style={{ flex: 1, maxWidth: 340 }}>
            <TextInput
              label="Buscar"
              placeholder="Buscar en todos los campos..."
              value={search}
              onChange={onSearchChange}
              leftSection={<IconSearch size={16} />}
            />
          </Box>
          {hasFilters && (
            <Badge variant="light" color="violet" size="lg">
              {data.currentSheet.totalRows.toLocaleString("es-CO")} resultados
            </Badge>
          )}
        </Group>

        <Tabs value={String(sheet)} onChange={onSheetChange} variant="outline">
          <Tabs.List mb="md">
            {data.sheetsInfo.map((s) => (
              <Tabs.Tab key={s.index} value={String(s.index)}>
                <Group gap={6}>
                  {s.name}
                  <Badge size="xs" variant="light" color="violet">
                    {s.totalRows.toLocaleString("es-CO")} filas
                  </Badge>
                </Group>
              </Tabs.Tab>
            ))}
          </Tabs.List>

          {data.sheetsInfo.map((s) => (
            <Tabs.Panel key={s.index} value={String(s.index)}>
              {data.currentSheet.index === s.index && (
                loading ? (
                  <Center h={200}><Loader /></Center>
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
                              const num = (data.currentSheet.page - 1) * PAGE_SIZE + rowIndex + 1;
                              return (
                                <Table.Tr key={rowIndex}>
                                  <Table.Td><Text size="xs" c="dimmed">{num}</Text></Table.Td>
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
                        <Pagination value={page} onChange={onPageChange} total={data.currentSheet.totalPages} siblings={1} boundaries={2} />
                      </Center>
                    )}
                    <Text size="xs" c="dimmed" ta="right" mt="xs">
                      Mostrando {(data.currentSheet.page - 1) * PAGE_SIZE + 1}–
                      {Math.min(data.currentSheet.page * PAGE_SIZE, data.currentSheet.totalRows)} de{" "}
                      {data.currentSheet.totalRows.toLocaleString("es-CO")} registros
                    </Text>
                  </>
                )
              )}
            </Tabs.Panel>
          ))}
        </Tabs>
      </>
    );
  };

  // ── Render pestaña SNIES ──────────────────────────────────────
  const renderSnies = () => {
    if (sniesLoading && !sniesData) return <Center h={300}><Loader /></Center>;
    if (!sniesData) return (
      <Center h={260}>
        <Stack align="center" gap="sm">
          <IconUsersGroup size={48} color="#7c3aed" opacity={0.3} />
          <Text c="dimmed" ta="center">
            {isAdmin ? "No hay histórico SNIES cargado. Sube un archivo Excel." : "No hay datos SNIES disponibles."}
          </Text>
        </Stack>
      </Center>
    );
    return renderDataTable(
      sniesData, sniesLoading,
      sniesSheet, sniesPage, sniesYear, sniesSearch,
      (v) => { setSniesSheet(parseInt(v ?? "0", 10)); setSniesPage(1); },
      setSniesPage,
      (v) => { setSniesYear(v); setSniesPage(1); },
      (e) => { setSniesSearch(e.currentTarget.value); setSniesPage(1); }
    );
  };

  // ── Render pestaña Plantillas/Informes ────────────────────────
  const renderMultiFile = () => {
    if (selectedFile && fileData) {
      return (
        <>
          <Group mb="md">
            <ActionIcon variant="subtle" onClick={() => { setSelectedFile(null); setFileData(null); }}>
              <IconChevronLeft size={20} />
            </ActionIcon>
            <div>
              <Text fw={600}>{selectedFile.file_name}</Text>
              <Text size="xs" c="dimmed">
                Subido por {selectedFile.uploaded_by?.full_name || selectedFile.uploaded_by?.email} ·{" "}
                {new Date(selectedFile.createdAt).toLocaleDateString("es-CO")}
              </Text>
            </div>
          </Group>
          {renderDataTable(
            fileData, fileDataLoading,
            fileSheet, filePage, fileYear, fileSearch,
            (v) => { setFileSheet(parseInt(v ?? "0", 10)); setFilePage(1); },
            setFilePage,
            (v) => { setFileYear(v); setFilePage(1); },
            (e) => { setFileSearch(e.currentTarget.value); setFilePage(1); }
          )}
        </>
      );
    }

    if (selectedFile && fileDataLoading) {
      return <Center h={200}><Loader /></Center>;
    }

    if (fileListLoading) return <Center h={200}><Loader /></Center>;

    return (
      <Stack gap="sm">
        {fileList.length === 0 ? (
          <Center h={200}>
            <Stack align="center" gap="sm">
              {CATEGORY_ICONS[activeCategory]}
              <Text c="dimmed" ta="center">
                {isAdmin
                  ? `No hay archivos en "${CATEGORY_LABELS[activeCategory]}". Sube un Excel para comenzar.`
                  : `No hay archivos disponibles en "${CATEGORY_LABELS[activeCategory]}".`}
              </Text>
            </Stack>
          </Center>
        ) : (
          fileList.map((item) => (
            <Card key={item._id} withBorder padding="sm" radius="md">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                  <IconFileSpreadsheet size={28} color="#7c3aed" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === item._id ? (
                      <Group gap={4} wrap="nowrap">
                        <TextInput
                          value={editingName}
                          onChange={(e) => setEditingName(e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(item);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          size="xs"
                          style={{ flex: 1 }}
                          autoFocus
                        />
                        <ActionIcon size="sm" color="teal" variant="subtle" onClick={() => handleRename(item)}>
                          <IconCheck size={14} />
                        </ActionIcon>
                        <ActionIcon size="sm" color="gray" variant="subtle" onClick={() => setEditingId(null)}>
                          <IconX size={14} />
                        </ActionIcon>
                      </Group>
                    ) : (
                      <Group gap={4} wrap="nowrap">
                        <Text fw={500} truncate style={{ flex: 1 }}>{item.file_name}</Text>
                        {isAdmin && (
                          <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => { setEditingId(item._id); setEditingName(item.file_name); }}>
                            <IconPencil size={13} />
                          </ActionIcon>
                        )}
                      </Group>
                    )}
                    <Text size="xs" c="dimmed">
                      {item.sheetsInfo.length} hoja(s) ·{" "}
                      {item.sheetsInfo.reduce((a, s) => a + s.totalRows, 0).toLocaleString("es-CO")} filas ·{" "}
                      {new Date(item.createdAt).toLocaleDateString("es-CO")}
                    </Text>
                  </div>
                </Group>
                <Group gap="xs" style={{ flexShrink: 0 }}>
                  <Button size="xs" variant="light" color="violet" onClick={() => handleSelectFile(item)}>
                    Consultar
                  </Button>
                  {isAdmin && (
                    <Tooltip label="Eliminar">
                      <ActionIcon variant="subtle" color="red" onClick={() => handleDeleteFile(item)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
            </Card>
          ))
        )}
      </Stack>
    );
  };

  return (
    <Container size="xl" py="xl">
      {/* Encabezado */}
      <Group mb="lg" justify="space-between" align="flex-start">
        <Group gap="xs">
          <ActionIcon variant="subtle" color="blue" size="md" onClick={() => router.back()} aria-label="Volver">
            <IconArrowLeft size={18} />
          </ActionIcon>
          <IconUsersGroup size={28} color="#7c3aed" />
          <Title order={2}>Consulta de Información</Title>
        </Group>

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
              Cargar en {CATEGORY_LABELS[activeCategory].split(" ")[0]}
            </Button>
          </Group>
        )}
      </Group>

      {/* Pestañas principales */}
      <Tabs
        value={activeCategory}
        onChange={(v) => v && setActiveCategory(v as Category)}
        variant="pills"
        mb="lg"
      >
        <Tabs.List>
          {(["plantillas", "informes", "snies"] as Category[]).map((cat) => (
            <Tabs.Tab key={cat} value={cat} leftSection={CATEGORY_ICONS[cat]}>
              {CATEGORY_LABELS[cat]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {/* Contenido según categoría */}
      {activeCategory === "snies" ? renderSnies() : renderMultiFile()}
    </Container>
  );
}
