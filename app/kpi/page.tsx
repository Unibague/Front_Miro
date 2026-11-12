"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import * as XLSX from "xlsx";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Divider,
  FileButton,
  Group,
  List,
  Loader,
  Menu,
  Modal,
  MultiSelect,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDatabaseImport,
  IconDots,
  IconDownload,
  IconEye,
  IconFileSpreadsheet,
  IconPresentationAnalytics,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";

interface KpiPlantilla {
  _id: string;
  name: string;
  file_name: string;
  uploaded_by?: string;
  updatedAt?: string;
  last_run_at?: string;
  last_run_by?: string;
}

interface HojaResumen {
  hoja: string;
  plantilla: string;
  periodos: string[];
  filas: number;
  columnas: number;
  sinCoincidencia: string[];
  formulasExtendidas: string[];
}

interface Resumen {
  hojas: HojaResumen[];
  hojasSinCambios: string[];
  advertencias: string[];
}

interface Resultado {
  blob: Blob;
  fileName: string;
  resumen: Resumen | null;
}

interface HojaPreview {
  name: string;
  html: string;
  filled: boolean;
}

const API = `${process.env.NEXT_PUBLIC_API_URL}/kpi/plantillas`;
// .xlsx y .xlsm se llenan sin perder nada; los demás se convierten a .xlsx al subirlos
const KPI_EXTENSIONS = [".xlsx", ".xlsm", ".xls", ".xlsb", ".ods", ".csv"];
const XLSX_ACCEPT = KPI_EXTENSIONS.join(",");

const getErrorMessage = async (error: any, fallback: string) => {
  const data = error?.response?.data;
  // Con responseType "blob" los errores del backend también llegan como Blob
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed?.error || fallback;
    } catch {
      return fallback;
    }
  }
  return data?.error || fallback;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const getFileNameFromHeader = (header: string | undefined, fallback: string) => {
  if (!header) return fallback;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = header.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : fallback;
};

const isXlsx = (file: File) => {
  const name = file.name.toLowerCase();
  if (KPI_EXTENSIONS.some((ext) => name.endsWith(ext))) return true;
  showNotification({
    title: "Formato no válido",
    message: `La plantilla debe ser una hoja de cálculo (${KPI_EXTENSIONS.join(", ")}).`,
    color: "orange",
  });
  return false;
};

const CONVERTED_MESSAGE =
  "Se convirtió a .xlsx para poder llenarla. Conserva valores y fórmulas, pero no gráficos ni tablas dinámicas: si tiene, súbela como .xlsx.";

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "";

// Tablas HTML (una por hoja) recortadas al rango con contenido
const buildPreview = async (blob: Blob, hojasLlenas: string[]): Promise<HojaPreview[]> => {
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true });
  const hojas = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    let maxRow = 0;
    let maxCol = 0;
    Object.keys(sheet).forEach((address) => {
      if (address.startsWith("!")) return;
      const cell = sheet[address];
      if (cell?.v === undefined || cell?.v === null || String(cell.v).trim() === "") return;
      const { r, c } = XLSX.utils.decode_cell(address);
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, c);
    });
    sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
    const html = XLSX.utils.sheet_to_html(sheet, { header: "", footer: "" });
    return { name, html, filled: hojasLlenas.includes(name) };
  });
  return [...hojas.filter((h) => h.filled), ...hojas.filter((h) => !h.filled)];
};

export default function KpiPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";

  const [plantillas, setPlantillas] = useState<KpiPlantilla[]>([]);
  const [periodos, setPeriodos] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [trayendoId, setTrayendoId] = useState<string | null>(null);
  const [periodosPorPlantilla, setPeriodosPorPlantilla] = useState<Record<string, string[]>>({});
  const [resultados, setResultados] = useState<Record<string, Resultado | undefined>>({});

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewHojas, setPreviewHojas] = useState<HojaPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [hojaActiva, setHojaActiva] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState<KpiPlantilla | null>(null);

  const loadData = async () => {
    if (!email) return;
    try {
      const [plantillasRes, opcionesRes] = await Promise.all([
        axios.get(API, { params: { email } }),
        axios.get(`${API}/opciones`, { params: { email } }),
      ]);
      setPlantillas(plantillasRes.data);
      setPeriodos(opcionesRes.data.periodos ?? []);
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible cargar el módulo KPI."),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const ocupado = uploading || replacingId !== null || trayendoId !== null;

  const enviarArchivo = async (file: File, plantilla?: KpiPlantilla) => {
    const formData = new FormData();
    formData.append("template_file", file);
    formData.append("email", email);
    const config = { headers: { "Content-Type": "multipart/form-data" } };
    return plantilla
      ? axios.put(`${API}/${plantilla._id}`, formData, config)
      : axios.post(API, formData, config);
  };

  const handleUpload = async (file: File | null) => {
    if (!file || !isXlsx(file)) return;
    setUploading(true);
    try {
      const { data } = await enviarArchivo(file);
      showNotification({
        title: "Plantilla cargada",
        message: data?.converted ? `${file.name}. ${CONVERTED_MESSAGE}` : file.name,
        color: "teal",
        autoClose: data?.converted ? 10000 : undefined,
      });
      await loadData();
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible cargar la plantilla."),
        color: "red",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleReplace = async (plantilla: KpiPlantilla, file: File | null) => {
    if (!file || !isXlsx(file)) return;
    setReplacingId(plantilla._id);
    try {
      const { data } = await enviarArchivo(file, plantilla);
      setResultados((prev) => ({ ...prev, [plantilla._id]: undefined }));
      showNotification({
        title: "Plantilla reemplazada",
        message: data?.converted ? `${file.name}. ${CONVERTED_MESSAGE}` : file.name,
        color: "teal",
        autoClose: data?.converted ? 10000 : undefined,
      });
      await loadData();
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible reemplazar la plantilla."),
        color: "red",
      });
    } finally {
      setReplacingId(null);
    }
  };

  const traerInformacion = async (plantilla: KpiPlantilla) => {
    setTrayendoId(plantilla._id);
    setResultados((prev) => ({ ...prev, [plantilla._id]: undefined }));
    try {
      const response = await axios.post(
        `${API}/${plantilla._id}/traer`,
        { email, periodIds: periodosPorPlantilla[plantilla._id] ?? [] },
        { responseType: "blob" }
      );
      const resumenHeader = response.headers["x-kpi-resumen"];
      setResultados((prev) => ({
        ...prev,
        [plantilla._id]: {
          blob: response.data,
          fileName: getFileNameFromHeader(response.headers["content-disposition"], `${plantilla.name}.xlsx`),
          resumen: resumenHeader ? JSON.parse(decodeURIComponent(resumenHeader)) : null,
        },
      }));
      showNotification({
        title: "Información cargada",
        message: "La plantilla ya tiene la información del sistema. Puedes verla o descargarla.",
        color: "teal",
      });
      await loadData();
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible traer la información."),
        color: "red",
      });
    } finally {
      setTrayendoId(null);
    }
  };

  const handleDownloadOriginal = async (plantilla: KpiPlantilla) => {
    try {
      const response = await axios.get(`${API}/${plantilla._id}/archivo`, {
        params: { email },
        responseType: "blob",
      });
      downloadBlob(response.data, plantilla.file_name);
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible descargar la plantilla."),
        color: "red",
      });
    }
  };

  const handleDelete = async () => {
    if (!eliminar) return;
    try {
      await axios.delete(`${API}/${eliminar._id}`, { params: { email } });
      showNotification({ title: "Plantilla eliminada", message: eliminar.name, color: "teal" });
      setEliminar(null);
      await loadData();
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible eliminar la plantilla."),
        color: "red",
      });
    }
  };

  const abrirVista = async (id: string) => {
    const resultado = resultados[id];
    if (!resultado) return;
    setPreviewId(id);
    setPreviewLoading(true);
    try {
      const hojas = await buildPreview(resultado.blob, resultado.resumen?.hojas.map((h) => h.hoja) ?? []);
      setPreviewHojas(hojas);
      setHojaActiva(hojas[0]?.name ?? null);
    } catch (error) {
      showNotification({ title: "Error", message: "No fue posible mostrar la vista previa.", color: "red" });
      setPreviewId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconArrowLeft size={16} />}
          onClick={() => router.push("/dashboard?view=gestion")}
          style={{ alignSelf: "flex-start" }}
        >
          Volver al módulo
        </Button>

        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Title order={2}>KPI</Title>
            <Text c="dimmed" size="sm" mt={4}>
              Carga tus plantillas de indicadores y llénalas con la información de las plantillas del sistema.
              Las fórmulas, gráficos y formatos del archivo se conservan.
            </Text>
          </div>
          <FileButton onChange={handleUpload} accept={XLSX_ACCEPT}>
            {(props) => (
              <Button
                {...props}
                color="red"
                leftSection={<IconUpload size={16} />}
                loading={uploading}
                disabled={ocupado && !uploading}
              >
                Cargar plantilla
              </Button>
            )}
          </FileButton>
        </Group>

        {plantillas.length === 0 ? (
          <Paper withBorder radius="lg" p="xl">
            <Stack align="center" gap="xs">
              <ThemeIcon size={56} radius="xl" variant="light" color="red">
                <IconPresentationAnalytics size={30} />
              </ThemeIcon>
              <Text fw={600}>Aún no hay plantillas KPI</Text>
              <Text size="sm" c="dimmed" ta="center" maw={520}>
                Usa “Cargar plantilla” para subir una hoja de cálculo (.xlsx, .xlsm, .xls, .ods o .csv). Cada hoja cuyos encabezados se llamen igual que los
                campos de una plantilla del sistema se llenará con la información cargada por los productores.
              </Text>
            </Stack>
          </Paper>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            {plantillas.map((plantilla) => {
              const resultado = resultados[plantilla._id];
              const trayendo = trayendoId === plantilla._id;

              return (
                <Card key={plantilla._id} withBorder radius="lg" padding="lg">
                  <Group justify="space-between" wrap="nowrap" align="flex-start" mb="sm">
                    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                      <ThemeIcon size={42} radius="md" variant="light" color="red">
                        <IconFileSpreadsheet size={24} />
                      </ThemeIcon>
                      <div style={{ minWidth: 0 }}>
                        <Text fw={700} size="lg" truncate>{plantilla.name}</Text>
                        {resultado ? (
                          <Badge color="red" variant="light" size="sm">Con información del sistema</Badge>
                        ) : (
                          <Badge color="gray" variant="light" size="sm">Plantilla cargada</Badge>
                        )}
                      </div>
                    </Group>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" disabled={ocupado} aria-label="Opciones">
                          <IconDots size={18} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => handleDownloadOriginal(plantilla)}>
                          Descargar original
                        </Menu.Item>
                        <FileButton onChange={(file) => handleReplace(plantilla, file)} accept={XLSX_ACCEPT}>
                          {(props) => (
                            <Menu.Item {...props} leftSection={<IconRefresh size={14} />} closeMenuOnClick={false}>
                              Reemplazar Excel
                            </Menu.Item>
                          )}
                        </FileButton>
                        <Menu.Divider />
                        <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setEliminar(plantilla)}>
                          Eliminar
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>

                  <Text size="xs" c="dimmed" truncate>
                    {plantilla.file_name}
                    {plantilla.uploaded_by ? ` · ${plantilla.uploaded_by}` : ""}
                  </Text>
                  {plantilla.last_run_at && (
                    <Text size="xs" c="dimmed">Última consulta: {formatDate(plantilla.last_run_at)}</Text>
                  )}

                  <Divider my="md" />

                  <MultiSelect
                    label="Períodos"
                    description="Déjalo vacío para traer la información de todos los períodos."
                    placeholder="Todos los períodos"
                    data={periodos}
                    value={periodosPorPlantilla[plantilla._id] ?? []}
                    onChange={(value) => setPeriodosPorPlantilla((prev) => ({ ...prev, [plantilla._id]: value }))}
                    disabled={ocupado}
                    clearable
                    searchable
                    nothingFoundMessage="Sin resultados"
                    mb="sm"
                  />
                  <Button
                    fullWidth
                    color="red"
                    leftSection={<IconDatabaseImport size={16} />}
                    loading={trayendo || replacingId === plantilla._id}
                    disabled={ocupado && !trayendo}
                    onClick={() => traerInformacion(plantilla)}
                  >
                    {resultado ? "Volver a traer información" : "Traer información"}
                  </Button>
                  {trayendo && (
                    <Text size="xs" c="dimmed" ta="center" mt={6}>
                      Trayendo la información de las plantillas y llenando el Excel. Puede tardar un minuto…
                    </Text>
                  )}

                  {resultado?.resumen && (
                    <Stack gap="xs" mt="md">
                      {resultado.resumen.hojas.map((hoja) => (
                        <Paper key={hoja.hoja} withBorder radius="md" p="xs">
                          <Group justify="space-between" wrap="nowrap" gap="xs">
                            <Text size="sm" fw={600} truncate>{hoja.hoja}</Text>
                            <Badge variant="light" color="red" style={{ flexShrink: 0 }}>{hoja.filas} filas</Badge>
                          </Group>
                          <Text size="xs" c="dimmed">
                            Plantilla: {hoja.plantilla}
                            {hoja.periodos.length > 0 ? ` · ${hoja.periodos.join(", ")}` : ""}
                          </Text>
                          {hoja.formulasExtendidas.length > 0 && (
                            <Text size="xs" c="dimmed">Fórmulas extendidas: {hoja.formulasExtendidas.join(", ")}</Text>
                          )}
                          {hoja.sinCoincidencia.length > 0 && (
                            <Text size="xs" c="orange">Columnas sin dato en el sistema: {hoja.sinCoincidencia.join(", ")}</Text>
                          )}
                        </Paper>
                      ))}
                      {resultado.resumen.hojasSinCambios.length > 0 && (
                        <Text size="xs" c="dimmed">
                          Hojas que se dejaron igual (cálculos, tableros, gráficos): {resultado.resumen.hojasSinCambios.join(", ")}
                        </Text>
                      )}
                      {resultado.resumen.advertencias.length > 0 && (
                        <Alert color="yellow" icon={<IconAlertTriangle size={18} />} title="Revisa">
                          <List size="sm" spacing={4}>
                            {resultado.resumen.advertencias.map((advertencia, index) => (
                              <List.Item key={index}>{advertencia}</List.Item>
                            ))}
                          </List>
                        </Alert>
                      )}
                    </Stack>
                  )}

                  {resultado && (
                    <SimpleGrid cols={2} spacing="sm" mt="md">
                      <Button variant="light" color="red" leftSection={<IconEye size={16} />} onClick={() => abrirVista(plantilla._id)}>
                        Ver
                      </Button>
                      <Button color="red" leftSection={<IconDownload size={16} />} onClick={() => downloadBlob(resultado.blob, resultado.fileName)}>
                        Descargar
                      </Button>
                    </SimpleGrid>
                  )}
                </Card>
              );
            })}
          </SimpleGrid>
        )}
      </Stack>

      <Modal
        opened={previewId !== null}
        onClose={() => setPreviewId(null)}
        size="95%"
        title={<Text fw={700}>{plantillas.find((p) => p._id === previewId)?.name} · vista previa</Text>}
      >
        {previewLoading ? (
          <Center py="xl"><Loader /></Center>
        ) : (
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              Las hojas llenas con información del sistema aparecen primero. Los resultados de las fórmulas se
              recalculan al abrir el archivo descargado en Excel.
            </Text>
            <Tabs value={hojaActiva} onChange={setHojaActiva}>
              <ScrollArea type="auto" offsetScrollbars>
                <Tabs.List style={{ flexWrap: "nowrap" }}>
                  {previewHojas.map((hoja) => (
                    <Tabs.Tab key={hoja.name} value={hoja.name} color={hoja.filled ? "red" : "gray"}>
                      {hoja.name}
                      {hoja.filled && <Badge ml={6} size="xs" color="red" variant="light">Datos</Badge>}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </ScrollArea>
              {previewHojas.map((hoja) => (
                <Tabs.Panel key={hoja.name} value={hoja.name} pt="sm">
                  <Paper withBorder radius="md">
                    <ScrollArea h="65vh" type="auto">
                      <div className="kpi-preview" dangerouslySetInnerHTML={{ __html: hoja.html }} />
                    </ScrollArea>
                  </Paper>
                </Tabs.Panel>
              ))}
            </Tabs>
          </Stack>
        )}
      </Modal>

      <Modal opened={eliminar !== null} onClose={() => setEliminar(null)} title="Eliminar plantilla" centered>
        <Text size="sm">
          ¿Eliminar la plantilla <b>{eliminar?.name}</b>? Se borrará el archivo cargado. La información de las
          plantillas del sistema no se modifica.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setEliminar(null)}>Cancelar</Button>
          <Button color="red" onClick={handleDelete}>Eliminar</Button>
        </Group>
      </Modal>

      <style jsx global>{`
        .kpi-preview table {
          border-collapse: collapse;
          font-size: 12px;
        }
        .kpi-preview td {
          border: 1px solid var(--mantine-color-default-border);
          padding: 4px 8px;
          white-space: nowrap;
          max-width: 320px;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: top;
        }
        .kpi-preview td:empty {
          min-width: 24px;
        }
      `}</style>
    </Container>
  );
}
