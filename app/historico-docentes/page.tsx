"use client";

import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
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
  Modal,
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
  IconFileTypePdf,
  IconPaperclip,
  IconEye,
  IconDownload,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";
import { usePeriod } from "@/app/context/PeriodContext";
import { useDebouncedValue } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import FilterSidebar from "@/app/components/FilterSidebar";

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
  file_type: "excel" | "pdf";
  anexosCount: number;
  anexosNames: string[];
  sheetsInfo: { index: number; name: string; totalRows: number }[];
}

interface Anexo {
  _id: string;
  file_name: string;
  uploaded_by: { full_name?: string; email?: string };
  createdAt: string;
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

  // Anexos
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [anexosLoading, setAnexosLoading] = useState(false);
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [uploadingAnexo, setUploadingAnexo] = useState(false);

  // Vista Excel de anexo
  const [xlsxModal, setXlsxModal] = useState<{ name: string; sheets: { name: string; headers: string[]; rows: string[][] }[] } | null>(null);
  const [xlsxSheet, setXlsxSheet] = useState(0);
  const [xlsxLoading, setXlsxLoading] = useState(false);

  // Búsqueda en lista de archivos
  const [listSearch, setListSearch] = useState("");

  // Filtros sidebar
  const [filterVisible, setFilterVisible] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [allRowsLoading, setAllRowsLoading] = useState(false);

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
    // Limpiar filtros y selección al cambiar de categoría
    setSelectedFile(null);
    setFileData(null);
    setActiveFilters({});
    setAllRows([]);
    setFilterVisible(false);
    setListSearch("");

    if (activeCategory === "snies") {
      setSniesData(null);
      setSniesSheet(0);
      setSniesPage(1);
      setSniesYear(null);
      setSniesSearch("");
      fetchSnies(0, 1, null, "");
    } else {
      setFileList([]);
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

  // Archivo seleccionado: refetch al cambiar filtros (solo Excel)
  useEffect(() => {
    if (selectedFile && selectedFile.file_type !== "pdf") {
      fetchFileData(selectedFile._id, fileSheet, filePage, fileYear, debouncedFileSearch);
    }
  }, [fileSheet, filePage, fileYear, debouncedFileSearch, selectedFile]);

  // Cargar todos los datos para filtros cuando cambia la hoja (archivo seleccionado)
  useEffect(() => {
    if (selectedFile && selectedFile.file_type !== "pdf" && fileData?.currentSheet?.headers?.length) {
      fetchAllRows(selectedFile._id, fileData.currentSheet.headers);
    }
  }, [selectedFile?._id, fileSheet, fileData?.currentSheet?.headers?.length]);

  // Cargar todos los datos SNIES para filtros cuando los datos están disponibles
  useEffect(() => {
    if (activeCategory !== "snies" || !sniesData?.currentSheet?.headers?.length || !session?.user?.email) return;
    const headers = sniesData.currentSheet.headers;
    setAllRowsLoading(true);
    axios.get(`${API_BASE}/data`, {
      params: { email: session.user.email, category: "snies", sheet: sniesSheet, page: 1, limit: 99999 },
    }).then(res => {
      const rawRows: string[][] = res.data?.currentSheet?.rows || [];
      setAllRows(rawRows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))));
    }).catch(() => setAllRows([])).finally(() => setAllRowsLoading(false));
  }, [activeCategory, sniesData?.currentSheet?.headers?.length, sniesSheet, session?.user?.email]);

  // ── Fetch anexos ──────────────────────────────────────────────
  const fetchAnexos = useCallback(async (fileId: string) => {
    setAnexosLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/${fileId}/anexos`);
      setAnexos(res.data.anexos || []);
    } catch {
      setAnexos([]);
    } finally {
      setAnexosLoading(false);
    }
  }, []);

  // ── Handlers ──────────────────────────────────────────────────
  const handleSelectFile = (item: FileItem) => {
    setSelectedFile(item);
    setFileData(null);
    setFileSheet(0);
    setFilePage(1);
    setFileYear(null);
    setFileSearch("");
    setAnexos([]);
    setActiveFilters({});
    setAllRows([]);
    setFilterVisible(false);
    if (item.file_type === "pdf") {
      fetchAnexos(item._id);
    } else {
      fetchFileData(item._id, 0, 1, null, "");
      fetchAnexos(item._id);
    }
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
    const isPdf = ext.endsWith(".pdf");
    const isExcel = ext.endsWith(".xlsx") || ext.endsWith(".xlsm");
    if (!isPdf && !isExcel) {
      showNotification({ title: "Formato no válido", message: "Solo se aceptan .xlsx, .xlsm o .pdf.", color: "red" });
      return;
    }
    if (isPdf && activeCategory !== "informes") {
      showNotification({ title: "Formato no válido", message: "Los PDF solo se pueden cargar en Informes.", color: "red" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("email", session.user.email);
      formData.append("category", activeCategory);
      if (activeCategory !== "snies" && selectedPeriodId) formData.append("periodId", selectedPeriodId);
      formData.append("excel_file", file);
      await axios.post(`${API_BASE}/upload`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      showNotification({ title: "Archivo cargado", message: `"${file.name}" fue cargado en ${CATEGORY_LABELS[activeCategory]}.`, color: "teal" });
      setFile(null);
      if (activeCategory === "snies") fetchSnies(0, 1, null, "");
      else fetchFileList(activeCategory);
    } catch {
      showNotification({ title: "Error", message: "No se pudo cargar el archivo.", color: "red" });
    } finally {
      setUploading(false);
    }
  };

  const handleUploadAnexo = async () => {
    if (!anexoFile || !session?.user?.email || !selectedFile) return;
    setUploadingAnexo(true);
    try {
      const formData = new FormData();
      formData.append("email", session.user.email);
      formData.append("anexo_file", anexoFile);
      await axios.post(`${API_BASE}/${selectedFile._id}/anexos`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      showNotification({ title: "Anexo adjuntado", message: `"${anexoFile.name}" fue adjuntado correctamente.`, color: "teal" });
      setAnexoFile(null);
      fetchAnexos(selectedFile._id);
      setFileList(prev => prev.map(f => f._id === selectedFile._id ? { ...f, anexosCount: f.anexosCount + 1 } : f));
    } catch {
      showNotification({ title: "Error", message: "No se pudo adjuntar el anexo.", color: "red" });
    } finally {
      setUploadingAnexo(false);
    }
  };

  const handleDeleteAnexo = async (anexoId: string) => {
    if (!selectedFile) return;
    try {
      await axios.delete(`${API_BASE}/${selectedFile._id}/anexos/${anexoId}`);
      setAnexos(prev => prev.filter(a => a._id !== anexoId));
      setFileList(prev => prev.map(f => f._id === selectedFile._id ? { ...f, anexosCount: Math.max(0, f.anexosCount - 1) } : f));
      showNotification({ title: "Anexo eliminado", message: "El anexo fue eliminado.", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo eliminar el anexo.", color: "red" });
    }
  };

  // Carga todos los datos del archivo para el sidebar de filtros
  const fetchAllRows = useCallback(async (fileId: string, headers: string[]) => {
    if (!session?.user?.email || headers.length === 0) return;
    setAllRowsLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/data`, {
        params: { email: session.user.email, id: fileId, sheet: fileSheet, page: 1, limit: 99999 },
      });
      const rawRows: string[][] = res.data?.currentSheet?.rows || [];
      setAllRows(rawRows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))));
    } catch {
      setAllRows([]);
    } finally {
      setAllRowsLoading(false);
    }
  }, [session?.user?.email, fileSheet]);

  // Filas filtradas client-side
  const filteredRows = useMemo(() => {
    if (!fileData) return [];
    const hasFilters = Object.values(activeFilters).some(v => v.length > 0);
    if (!hasFilters) return fileData.currentSheet.rows;
    const headers = fileData.currentSheet.headers;
    return fileData.currentSheet.rows.filter(row => {
      return Object.entries(activeFilters).every(([filterName, values]) => {
        if (!values.length) return true;
        const colIdx = headers.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]/g, "_") === filterName || h === filterName);
        if (colIdx === -1) return true;
        return values.includes(row[colIdx] ?? "");
      });
    });
  }, [fileData, activeFilters]);

  const handleViewExcelAnexo = async (a: Anexo) => {
    if (!selectedFile) return;
    setXlsxLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/${selectedFile._id}/anexos/${a._id}?download=1`, { responseType: "arraybuffer" });
      const wb = XLSX.read(new Uint8Array(res.data), { type: "array" });
      const sheets = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name];
        const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
        const headers = (data[0] || []).map(String);
        const rows = data.slice(1).map(r => headers.map((_, i) => String(r[i] ?? "")));
        return { name, headers, rows };
      });
      setXlsxModal({ name: a.file_name, sheets });
      setXlsxSheet(0);
    } catch {
      showNotification({ title: "Error", message: "No se pudo leer el archivo Excel.", color: "red" });
    } finally {
      setXlsxLoading(false);
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

    const hasActiveFilters = Object.values(activeFilters).some(v => v.length > 0);
    const canFilter = allRows.length > 0;
    const displayRows = hasActiveFilters ? filteredRows : data.currentSheet.rows;

    return (
      <>
        {canFilter && (
          <FilterSidebar
            isVisible={filterVisible}
            onToggle={() => setFilterVisible(v => !v)}
            onFiltersChange={setActiveFilters}
            templateData={allRows}
          />
        )}
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
          {canFilter && (
            <Button
              variant={hasActiveFilters ? "filled" : "light"}
              color="blue"
              leftSection={<IconSearch size={16} />}
              onClick={() => setFilterVisible(v => !v)}
              loading={allRowsLoading}
              size="sm"
            >
              Filtros {hasActiveFilters && `(${Object.values(activeFilters).flat().length})`}
            </Button>
          )}
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
                          {displayRows.length === 0 ? (
                            <Table.Tr>
                              <Table.Td colSpan={data.currentSheet.headers.length + 1}>
                                <Center py="md">
                                  <Text c="dimmed">No hay datos para los filtros seleccionados.</Text>
                                </Center>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            displayRows.map((row, rowIndex) => {
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

  // ── Render sección de anexos ──────────────────────────────────
  const renderAnexos = () => (
    <Box mt="xl">
      <Group mb="sm" justify="space-between">
        <Group gap={6}>
          <IconPaperclip size={18} color="#7c3aed" />
          <Text fw={600} size="sm">Anexos</Text>
          {anexos.length > 0 && <Badge size="xs" variant="light" color="violet">{anexos.length}</Badge>}
        </Group>
      </Group>
      {isAdmin && (
        <Group mb="sm" gap="xs">
          <FileInput
            placeholder="Seleccionar PDF o Excel"
            accept=".pdf,.xlsx,.xlsm"
            value={anexoFile}
            onChange={setAnexoFile}
            leftSection={<IconPaperclip size={16} />}
            style={{ flex: 1, maxWidth: 340 }}
            clearable
            size="xs"
          />
          <Button size="xs" color="violet" loading={uploadingAnexo} disabled={!anexoFile} onClick={handleUploadAnexo} leftSection={<IconPaperclip size={14} />}>
            Adjuntar
          </Button>
        </Group>
      )}
      {anexosLoading ? <Center h={60}><Loader size="sm" /></Center> : (
        <Stack gap={6}>
          {anexos.length === 0 ? (
            <Text size="xs" c="dimmed">Sin anexos adjuntos.</Text>
          ) : (
            anexos.map(a => (
              <Group key={a._id} justify="space-between" wrap="nowrap" style={{ background: "var(--mantine-color-gray-0)", borderRadius: 8, padding: "6px 10px" }}>
                <Group gap={8} style={{ minWidth: 0 }}>
                  {a.file_name.toLowerCase().endsWith(".pdf")
                    ? <IconFileTypePdf size={18} color="#e03131" style={{ flexShrink: 0 }} />
                    : <IconFileSpreadsheet size={18} color="#7c3aed" style={{ flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <Text size="xs" fw={500} truncate>{a.file_name}</Text>
                    <Text size="xs" c="dimmed">{new Date(a.createdAt).toLocaleDateString("es-CO")} · {a.uploaded_by?.full_name || a.uploaded_by?.email}</Text>
                  </div>
                </Group>
                <Group gap={4} style={{ flexShrink: 0 }}>
                  {a.file_name.toLowerCase().endsWith(".pdf") ? (
                    <Tooltip label="Ver">
                      <ActionIcon size="sm" variant="subtle" color="blue" component="a" href={`${API_BASE}/${selectedFile!._id}/anexos/${a._id}`} target="_blank">
                        <IconEye size={14} />
                      </ActionIcon>
                    </Tooltip>
                  ) : (
                    <Tooltip label="Ver">
                      <ActionIcon size="sm" variant="subtle" color="blue" loading={xlsxLoading} onClick={() => handleViewExcelAnexo(a)}>
                        <IconEye size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Tooltip label="Descargar">
                    <ActionIcon size="sm" variant="subtle" color="violet" component="a" href={`${API_BASE}/${selectedFile!._id}/anexos/${a._id}?download=1`} download={a.file_name}>
                      <IconDownload size={14} />
                    </ActionIcon>
                  </Tooltip>
                  {isAdmin && (
                    <Tooltip label="Eliminar">
                      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDeleteAnexo(a._id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>
            ))
          )}
        </Stack>
      )}
    </Box>
  );

  // ── Render pestaña Plantillas/Informes ────────────────────────
  const renderMultiFile = () => {
    if (selectedFile) {
      const isPdf = selectedFile.file_type === "pdf";

      if (isPdf || fileData) {
        return (
          <>
            <Group mb="md" justify="space-between" wrap="nowrap">
              <Group gap="sm" style={{ minWidth: 0, flex: 1 }}>
                <ActionIcon variant="subtle" style={{ flexShrink: 0 }} onClick={() => { setSelectedFile(null); setFileData(null); setAnexos([]); }}>
                  <IconChevronLeft size={20} />
                </ActionIcon>
                <div style={{ minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    {isPdf ? <IconFileTypePdf size={18} color="#e03131" style={{ flexShrink: 0 }} /> : <IconFileSpreadsheet size={18} color="#7c3aed" style={{ flexShrink: 0 }} />}
                    <Text fw={600} truncate>{selectedFile.file_name}</Text>
                  </Group>
                </div>
              </Group>
              {isPdf && (
                <Group gap="xs" style={{ flexShrink: 0 }}>
                  <Button size="xs" variant="light" color="red" leftSection={<IconEye size={14} />} component="a" href={`${API_BASE}/${selectedFile._id}/pdf`} target="_blank">
                    Ver PDF
                  </Button>
                  <Button size="xs" variant="subtle" color="red" leftSection={<IconDownload size={14} />} component="a" href={`${API_BASE}/${selectedFile._id}/pdf`} download={selectedFile.file_name}>
                    Descargar
                  </Button>
                </Group>
              )}
            </Group>

            {isPdf ? null : fileData ? (
              renderDataTable(
                fileData, fileDataLoading,
                fileSheet, filePage, fileYear, fileSearch,
                (v) => { setFileSheet(parseInt(v ?? "0", 10)); setFilePage(1); },
                setFilePage,
                (v) => { setFileYear(v); setFilePage(1); },
                (e) => { setFileSearch(e.currentTarget.value); setFilePage(1); }
              )
            ) : (
              <Center h={200}><Loader /></Center>
            )}

            {activeCategory === "informes" && renderAnexos()}
          </>
        );
      }

      if (fileDataLoading) return <Center h={200}><Loader /></Center>;
    }

    if (fileListLoading) return <Center h={200}><Loader /></Center>;

    return (
      <Stack gap="sm">
        {fileList.length > 0 && (
          <TextInput
            placeholder="Buscar por nombre..."
            value={listSearch}
            onChange={e => setListSearch(e.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            style={{ maxWidth: 340 }}
            clearable
          />
        )}
        {visibleFiles.length === 0 ? (
          <Center h={200}>
            <Stack align="center" gap="sm">
              {CATEGORY_ICONS[activeCategory]}
              <Text c="dimmed" ta="center">
                {listSearch.trim()
                  ? `Sin resultados para "${listSearch}".`
                  : isAdmin
                    ? `No hay archivos en "${CATEGORY_LABELS[activeCategory]}". ${activeCategory === "informes" ? "Sube un Excel o PDF." : "Sube un Excel para comenzar."}`
                    : `No hay archivos disponibles en "${CATEGORY_LABELS[activeCategory]}".`}
              </Text>
            </Stack>
          </Center>
        ) : (
          visibleFiles.map((item) => {
            const isPdf = item.file_type === "pdf";
            return (
              <Card key={item._id} withBorder padding="sm" radius="md">
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                    {isPdf
                      ? <IconFileTypePdf size={28} color="#e03131" style={{ flexShrink: 0 }} />
                      : <IconFileSpreadsheet size={28} color="#7c3aed" style={{ flexShrink: 0 }} />}
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
                          <ActionIcon size="sm" color="teal" variant="subtle" onClick={() => handleRename(item)}><IconCheck size={14} /></ActionIcon>
                          <ActionIcon size="sm" color="gray" variant="subtle" onClick={() => setEditingId(null)}><IconX size={14} /></ActionIcon>
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
                        {isPdf
                          ? `PDF · ${new Date(item.createdAt).toLocaleDateString("es-CO")}`
                          : `${item.sheetsInfo.length} hoja(s) · ${item.sheetsInfo.reduce((a, s) => a + s.totalRows, 0).toLocaleString("es-CO")} filas · ${new Date(item.createdAt).toLocaleDateString("es-CO")}`}
                      </Text>
                    {item.anexosCount > 0 && (
                      <Group gap={4} mt={2} wrap="wrap">
                        <IconPaperclip size={12} color="#7c3aed" />
                        {(item.anexosNames || []).map((name, i) => (
                          <Text key={i} size="xs" c="violet" style={{ fontStyle: "italic" }}>{name}</Text>
                        ))}
                      </Group>
                    )}
                    </div>
                  </Group>
                  <Group gap="xs" style={{ flexShrink: 0 }}>
                    <Button size="xs" variant="light" color={isPdf ? "red" : "violet"} onClick={() => handleSelectFile(item)}>
                      {isPdf ? "Ver" : "Consultar"}
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
            );
          })
        )}
      </Stack>
    );
  };

  const activeXlsxSheet = xlsxModal?.sheets[xlsxSheet];
  const visibleFiles = fileList.filter(f =>
    !listSearch.trim() || f.file_name.toLowerCase().includes(listSearch.trim().toLowerCase())
  );

  return (
    <>
    <Modal
      opened={!!xlsxModal}
      onClose={() => setXlsxModal(null)}
      title={<Text fw={600} size="sm" truncate>{xlsxModal?.name}</Text>}
      size="90%"
      styles={{ body: { padding: 0 } }}
    >
      {xlsxModal && (
        <Stack gap={0}>
          {xlsxModal.sheets.length > 1 && (
            <Tabs value={String(xlsxSheet)} onChange={v => setXlsxSheet(parseInt(v ?? "0", 10))} variant="outline" style={{ padding: "8px 16px 0" }}>
              <Tabs.List>
                {xlsxModal.sheets.map((s, i) => (
                  <Tabs.Tab key={i} value={String(i)}>{s.name}</Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          )}
          <ScrollArea style={{ maxHeight: "70vh" }} p="md">
            {activeXlsxSheet && (
              <Table striped withTableBorder withColumnBorders stickyHeader style={{ minWidth: 600, fontSize: 12 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ backgroundColor: "#f8f9fa" }}><Text size="xs" c="dimmed">#</Text></Table.Th>
                    {activeXlsxSheet.headers.map((h, i) => (
                      <Table.Th key={i} style={{ whiteSpace: "nowrap", backgroundColor: "#f8f9fa" }}>{h || `Col ${i + 1}`}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {activeXlsxSheet.rows.map((row, ri) => (
                    <Table.Tr key={ri}>
                      <Table.Td><Text size="xs" c="dimmed">{ri + 1}</Text></Table.Td>
                      {row.map((cell, ci) => (
                        <Table.Td key={ci} style={{ whiteSpace: "nowrap" }}>{cell}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </ScrollArea>
        </Stack>
      )}
    </Modal>
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
              placeholder={activeCategory === "informes" ? "Excel (.xlsx) o PDF" : "Seleccionar Excel (.xlsx)"}
              value={file}
              onChange={setFile}
              accept={activeCategory === "informes" ? ".xlsx,.xlsm,.pdf" : ".xlsx,.xlsm"}
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
    </>
  );
}
