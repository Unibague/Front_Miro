"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import axios from "axios";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
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
  Tooltip,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconChevronLeft,
  IconFileSpreadsheet,
  IconSearch,
  IconCheck,
  IconPencil,
  IconTrash,
  IconX,
  IconUpload,
  IconFileTypePdf,
  IconPaperclip,
  IconEye,
  IconDownload,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";
import { usePeriod } from "@/app/context/PeriodContext";

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

const displayHeader = (h: string) => {
  const normalized = h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (normalized === "ano") return "Año";
  return h;
};

const ANEXO_ACTION_ICON_SIZE = 14;
const ANEXO_ACTION_PROPS = { size: "sm" as const, variant: "subtle" as const };

interface FileLibraryPanelProps {
  category: "plantillas" | "informes";
  /** Ámbito al que se restringe esta biblioteca (subida y listado). */
  dimensionId: string;
}

// Version de la biblioteca de archivos (subir Excel/PDF, ver hojas, adjuntar
// anexos) del modulo "Consulta de Información", pero acotada a UN ámbito:
// misma funcionalidad que existia en la pestaña "Plantillas"/"Informes" de
// /historico-docentes, solo que aqui cada archivo queda etiquetado con el
// ámbito (dimensionId) al subirlo, y el listado solo trae los de ese ámbito.
export default function FileLibraryPanel({ category, dimensionId }: FileLibraryPanelProps) {
  const { data: session } = useSession();
  const { userRole } = useRole();
  const isAdmin = userRole === "Administrador";
  const { selectedPeriodId } = usePeriod();

  const [fileList, setFileList] = useState<FileItem[]>([]);
  const [fileListLoading, setFileListLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileData, setFileData] = useState<HistoricoData | null>(null);
  const [fileDataLoading, setFileDataLoading] = useState(false);
  const [fileSheet, setFileSheet] = useState(0);
  const [filePage, setFilePage] = useState(1);
  const [fileYear, setFileYear] = useState<string | null>(null);
  const [fileSearch, setFileSearch] = useState("");

  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [anexosLoading, setAnexosLoading] = useState(false);
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [uploadingAnexo, setUploadingAnexo] = useState(false);

  const [editingAnexoId, setEditingAnexoId] = useState<string | null>(null);
  const [editingAnexoName, setEditingAnexoName] = useState("");

  const [xlsxModal, setXlsxModal] = useState<{ name: string; sheets: { name: string; headers: string[]; rows: string[][] }[] } | null>(null);
  const [xlsxSheet, setXlsxSheet] = useState(0);
  const [xlsxLoading, setXlsxLoading] = useState(false);

  const [listSearch, setListSearch] = useState("");

  const fetchFileList = useCallback(async () => {
    if (!session?.user?.email) return;
    setFileListLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/list`, {
        params: {
          email: session.user.email,
          category,
          dimensionId,
          ...(selectedPeriodId ? { periodId: selectedPeriodId } : {}),
        },
      });
      setFileList(res.data.files || []);
    } catch {
      showNotification({ title: "Error", message: "No se pudo cargar la lista de archivos.", color: "red" });
    } finally {
      setFileListLoading(false);
    }
  }, [session?.user?.email, category, dimensionId, selectedPeriodId]);

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

  useEffect(() => {
    setSelectedFile(null);
    setFileData(null);
    setListSearch("");
    fetchFileList();
  }, [fetchFileList]);

  useEffect(() => {
    if (selectedFile && selectedFile.file_type !== "pdf") {
      fetchFileData(selectedFile._id, fileSheet, filePage, fileYear, fileSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileSheet, filePage, fileYear, fileSearch, selectedFile]);

  const handleSelectFile = (item: FileItem) => {
    setSelectedFile(item);
    setFileData(null);
    setFileSheet(0);
    setFilePage(1);
    setFileYear(null);
    setFileSearch("");
    setAnexos([]);
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
      setFileList((prev) => prev.map((f) => (f._id === item._id ? { ...f, file_name: editingName.trim() } : f)));
      setEditingId(null);
    } catch {
      showNotification({ title: "Error", message: "No se pudo renombrar el archivo.", color: "red" });
    }
  };

  const handleDeleteFile = async (item: FileItem) => {
    if (!session?.user?.email) return;
    try {
      await axios.delete(`${API_BASE}/${item._id}`, { params: { email: session.user.email } });
      showNotification({ title: "Eliminado", message: `"${item.file_name}" fue eliminado.`, color: "teal" });
      if (selectedFile?._id === item._id) {
        setSelectedFile(null);
        setFileData(null);
      }
      fetchFileList();
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
    if (isPdf && category !== "informes") {
      showNotification({ title: "Formato no válido", message: "Los PDF solo se pueden cargar en Informes.", color: "red" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("email", session.user.email);
      formData.append("category", category);
      formData.append("dimensionId", dimensionId);
      if (selectedPeriodId) formData.append("periodId", selectedPeriodId);
      formData.append("excel_file", file);
      await axios.post(`${API_BASE}/upload`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      showNotification({ title: "Archivo cargado", message: `"${file.name}" fue cargado en este ámbito.`, color: "teal" });
      setFile(null);
      fetchFileList();
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
      setFileList((prev) => prev.map((f) => (f._id === selectedFile._id ? { ...f, anexosCount: f.anexosCount + 1 } : f)));
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
      setAnexos((prev) => prev.filter((a) => a._id !== anexoId));
      setFileList((prev) => prev.map((f) => (f._id === selectedFile._id ? { ...f, anexosCount: Math.max(0, f.anexosCount - 1) } : f)));
      showNotification({ title: "Anexo eliminado", message: "El anexo fue eliminado.", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo eliminar el anexo.", color: "red" });
    }
  };

  const handleRenameAnexo = async (a: Anexo) => {
    if (!selectedFile) return;
    if (!editingAnexoName.trim() || editingAnexoName.trim() === a.file_name) {
      setEditingAnexoId(null);
      return;
    }
    try {
      await axios.patch(`${API_BASE}/${selectedFile._id}/anexos/${a._id}/rename`, { file_name: editingAnexoName.trim() });
      setAnexos((prev) => prev.map((x) => (x._id === a._id ? { ...x, file_name: editingAnexoName.trim() } : x)));
      setFileList((prev) =>
        prev.map((f) =>
          f._id === selectedFile._id
            ? { ...f, anexosNames: f.anexosNames.map((n) => (n === a.file_name ? editingAnexoName.trim() : n)) }
            : f
        )
      );
      setEditingAnexoId(null);
    } catch {
      showNotification({ title: "Error", message: "No se pudo renombrar el anexo.", color: "red" });
    }
  };

  const handleViewExcelAnexo = async (a: Anexo) => {
    if (!selectedFile) return;
    setXlsxLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/${selectedFile._id}/anexos/${a._id}?download=1`, { responseType: "arraybuffer" });
      const wb = XLSX.read(new Uint8Array(res.data), { type: "array" });
      const sheets = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
        const headers = (data[0] || []).map(String);
        const rows = data.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? "")));
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

  const activeXlsxSheet = xlsxModal?.sheets[xlsxSheet];
  const visibleFiles = fileList.filter(
    (f) => !listSearch.trim() || f.file_name.toLowerCase().includes(listSearch.trim().toLowerCase())
  );

  const renderDataTable = (data: HistoricoData, loading: boolean) => (
    <>
      <Group mb="md" align="flex-end">
        <Box style={{ flex: 1, maxWidth: 340 }}>
          <TextInput
            label="Buscar"
            placeholder="Buscar en todos los campos..."
            value={fileSearch}
            onChange={(e) => { setFileSearch(e.currentTarget.value); setFilePage(1); }}
            leftSection={<IconSearch size={16} />}
          />
        </Box>
      </Group>

      <Tabs value={String(fileSheet)} onChange={(v) => { setFileSheet(parseInt(v ?? "0", 10)); setFilePage(1); }} variant="outline">
        <Tabs.List mb="md">
          {data.sheetsInfo.map((s) => (
            <Tabs.Tab key={s.index} value={String(s.index)}>
              <Group gap={6}>
                {s.name}
                <Badge size="xs" variant="light" color="violet">{s.totalRows.toLocaleString("es-CO")} filas</Badge>
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
                              <Center py="md"><Text c="dimmed">No hay datos.</Text></Center>
                            </Table.Td>
                          </Table.Tr>
                        ) : (
                          data.currentSheet.rows.map((row, rowIndex) => {
                            const num = (data.currentSheet.page - 1) * PAGE_SIZE + rowIndex + 1;
                            return (
                              <Table.Tr key={rowIndex}>
                                <Table.Td><Text size="xs" c="dimmed">{num}</Text></Table.Td>
                                {data.currentSheet.headers.map((_, colIndex) => (
                                  <Table.Td key={colIndex} style={{ whiteSpace: "nowrap" }}>{row[colIndex] ?? ""}</Table.Td>
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
                      <Pagination value={filePage} onChange={setFilePage} total={data.currentSheet.totalPages} siblings={1} boundaries={2} />
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
            anexos.map((a) => (
              <Group key={a._id} justify="space-between" wrap="nowrap" style={{ background: "var(--mantine-color-gray-0)", borderRadius: 8, padding: "6px 10px" }}>
                <Group gap={8} style={{ minWidth: 0, flex: 1 }}>
                  {a.file_name.toLowerCase().endsWith(".pdf")
                    ? <IconFileTypePdf size={18} color="#e03131" style={{ flexShrink: 0 }} />
                    : <IconFileSpreadsheet size={18} color="#7c3aed" style={{ flexShrink: 0 }} />}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {editingAnexoId === a._id ? (
                      <Group gap={4} wrap="nowrap">
                        <TextInput
                          value={editingAnexoName}
                          onChange={(e) => setEditingAnexoName(e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameAnexo(a);
                            if (e.key === "Escape") setEditingAnexoId(null);
                          }}
                          size="xs"
                          style={{ flex: 1 }}
                          autoFocus
                        />
                        <ActionIcon size="sm" color="teal" variant="subtle" onClick={() => handleRenameAnexo(a)}><IconCheck size={14} /></ActionIcon>
                        <ActionIcon size="sm" color="gray" variant="subtle" onClick={() => setEditingAnexoId(null)}><IconX size={14} /></ActionIcon>
                      </Group>
                    ) : (
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={500} truncate style={{ flex: 1 }}>{a.file_name}</Text>
                        {isAdmin && (
                          <ActionIcon {...ANEXO_ACTION_PROPS} color="gray" onClick={() => { setEditingAnexoId(a._id); setEditingAnexoName(a.file_name); }}>
                            <IconPencil size={ANEXO_ACTION_ICON_SIZE} />
                          </ActionIcon>
                        )}
                      </Group>
                    )}
                  </div>
                </Group>
                <Group gap={4} style={{ flexShrink: 0 }}>
                  {a.file_name.toLowerCase().endsWith(".pdf") ? (
                    <Tooltip label="Ver">
                      <ActionIcon {...ANEXO_ACTION_PROPS} color="gray" component="a" href={`${API_BASE}/${selectedFile!._id}/anexos/${a._id}`} target="_blank">
                        <IconEye size={ANEXO_ACTION_ICON_SIZE} />
                      </ActionIcon>
                    </Tooltip>
                  ) : (
                    <Tooltip label="Ver">
                      <ActionIcon {...ANEXO_ACTION_PROPS} color="gray" loading={xlsxLoading} onClick={() => handleViewExcelAnexo(a)}>
                        <IconEye size={ANEXO_ACTION_ICON_SIZE} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Tooltip label="Descargar">
                    <ActionIcon {...ANEXO_ACTION_PROPS} color="gray" component="a" href={`${API_BASE}/${selectedFile!._id}/anexos/${a._id}?download=1`} download={a.file_name}>
                      <IconDownload size={ANEXO_ACTION_ICON_SIZE} />
                    </ActionIcon>
                  </Tooltip>
                  {isAdmin && (
                    <Tooltip label="Eliminar">
                      <ActionIcon {...ANEXO_ACTION_PROPS} color="red" onClick={() => handleDeleteAnexo(a._id)}>
                        <IconTrash size={ANEXO_ACTION_ICON_SIZE} />
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

  return (
    <Box>
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
              <Tabs value={String(xlsxSheet)} onChange={(v) => setXlsxSheet(parseInt(v ?? "0", 10))} variant="outline" style={{ padding: "8px 16px 0" }}>
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

      {isAdmin && (
        <Group mb="md" gap="xs" justify="flex-end">
          <FileInput
            placeholder={category === "informes" ? "Excel (.xlsx) o PDF" : "Seleccionar Excel (.xlsx)"}
            value={file}
            onChange={setFile}
            accept={category === "informes" ? ".xlsx,.xlsm,.pdf" : ".xlsx,.xlsm"}
            leftSection={<IconUpload size={16} />}
            style={{ minWidth: 240 }}
            clearable
          />
          <Button onClick={handleUpload} loading={uploading} disabled={!file} color="violet">
            Cargar en {category === "informes" ? "Informes" : "Plantillas"}
          </Button>
        </Group>
      )}

      {selectedFile ? (
        (() => {
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
                  {isPdf ? (
                    <Group gap="xs" style={{ flexShrink: 0 }}>
                      <Button size="xs" variant="light" color="red" leftSection={<IconEye size={14} />} component="a" href={`${API_BASE}/${selectedFile._id}/pdf`} target="_blank">
                        Ver PDF
                      </Button>
                      <Button size="xs" variant="subtle" color="red" leftSection={<IconDownload size={14} />} component="a" href={`${API_BASE}/${selectedFile._id}/pdf`} download={selectedFile.file_name}>
                        Descargar
                      </Button>
                    </Group>
                  ) : (
                    <Button
                      size="xs"
                      variant="subtle"
                      color="violet"
                      leftSection={<IconDownload size={14} />}
                      component="a"
                      href={`${API_BASE}/download?email=${encodeURIComponent(session?.user?.email ?? "")}&id=${selectedFile._id}`}
                      download={selectedFile.file_name}
                    >
                      Descargar Excel
                    </Button>
                  )}
                </Group>

                {isPdf ? null : fileData ? renderDataTable(fileData, fileDataLoading) : <Center h={200}><Loader /></Center>}

                {category === "informes" && renderAnexos()}
              </>
            );
          }
          if (fileDataLoading) return <Center h={200}><Loader /></Center>;
          return null;
        })()
      ) : fileListLoading ? (
        <Center h={200}><Loader /></Center>
      ) : (
        <Stack gap="sm">
          {fileList.length > 0 && (
            <TextInput
              placeholder="Buscar por nombre..."
              value={listSearch}
              onChange={(e) => setListSearch(e.currentTarget.value)}
              leftSection={<IconSearch size={16} />}
              style={{ maxWidth: 340 }}
            />
          )}
          {visibleFiles.length === 0 ? (
            <Center h={200}>
              <Stack align="center" gap="sm">
                <IconFileSpreadsheet size={40} color="#7c3aed" opacity={0.3} />
                <Text c="dimmed" ta="center">
                  {listSearch.trim()
                    ? `Sin resultados para "${listSearch}".`
                    : isAdmin
                      ? `No hay archivos en este ámbito. ${category === "informes" ? "Sube un Excel o PDF." : "Sube un Excel para comenzar."}`
                      : "No hay archivos disponibles en este ámbito."}
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
                      <Tooltip label="Descargar">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color={isPdf ? "red" : "violet"}
                          component="a"
                          href={`${API_BASE}/download?email=${encodeURIComponent(session?.user?.email ?? "")}&id=${item._id}`}
                          download={item.file_name}
                        >
                          <IconDownload size={15} />
                        </ActionIcon>
                      </Tooltip>
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
      )}
    </Box>
  );
}
