"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Container,
  Divider,
  FileButton,
  Group,
  List,
  Loader,
  Modal,
  Paper,
  ScrollArea,
  Select,
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
  IconInfoCircle,
  IconBuildingBank,
  IconDatabaseSearch,
  IconDownload,
  IconEye,
  IconFileSpreadsheet,
  IconSchool,
  IconUpload,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";

type TipoPlantilla = "programa" | "institucion";

interface CnaPlantilla {
  _id: string;
  tipo: TipoPlantilla;
  file_name: string;
  uploaded_by?: string;
  updatedAt?: string;
}

interface PlantillaSlot {
  tipo: TipoPlantilla;
  label: string;
  plantilla: CnaPlantilla | null;
}

interface Periodo {
  _id: string;
  name: string;
  fuentes: string[];
}

interface ResumenGeneracion {
  periodos: Array<{ periodo: string; detalle: string[] }>;
  hojas: string[];
  notas?: string[];
  advertencias: string[];
}

interface Resultado {
  blob: Blob;
  fileName: string;
  resumen: ResumenGeneracion | null;
}

interface HojaPreview {
  name: string;
  html: string;
  filled: boolean;
}

const API = `${process.env.NEXT_PUBLIC_API_URL}/cna/plantillas`;

// Orden en pantalla: primero institución, luego programas
const ORDEN: TipoPlantilla[] = ["institucion", "programa"];

const TIPO_ICON: Record<TipoPlantilla, typeof IconSchool> = {
  programa: IconSchool,
  institucion: IconBuildingBank,
};

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

// Convierte el Excel generado en tablas HTML (una por hoja), recortando las
// filas y columnas vacías que las plantillas CNA traen hasta la fila 1000.
const buildPreview = async (blob: Blob, hojasLlenas: string[]): Promise<HojaPreview[]> => {
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array" });
  const normalizar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  const llenas = hojasLlenas.map(normalizar);

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
    const normalized = normalizar(name);
    return { name, html, filled: llenas.some((h) => normalized.includes(h)) };
  });

  return [...hojas.filter((h) => h.filled), ...hojas.filter((h) => !h.filled)];
};

export default function CnaPlantillasPage() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";

  const [slots, setSlots] = useState<PlantillaSlot[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [dependencias, setDependencias] = useState<Array<{ value: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);

  const [dependencia, setDependencia] = useState<string | null>(null);
  const [programas, setProgramas] = useState<Array<{ value: string; label: string }>>([]);
  const [programa, setPrograma] = useState<string | null>(null);

  const [uploadingTipo, setUploadingTipo] = useState<TipoPlantilla | null>(null);
  const [consultandoTipo, setConsultandoTipo] = useState<TipoPlantilla | null>(null);
  const [resultados, setResultados] = useState<Partial<Record<TipoPlantilla, Resultado>>>({});

  const [previewTipo, setPreviewTipo] = useState<TipoPlantilla | null>(null);
  const [previewHojas, setPreviewHojas] = useState<HojaPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [hojaActiva, setHojaActiva] = useState<string | null>(null);

  const loadData = async (): Promise<PlantillaSlot[]> => {
    if (!email) return [];
    try {
      const [plantillasRes, opcionesRes] = await Promise.all([
        axios.get(API, { params: { email } }),
        axios.get(`${API}/opciones`, { params: { email } }),
      ]);
      setSlots(plantillasRes.data);
      setPeriodos(opcionesRes.data.periodos);
      setDependencias(opcionesRes.data.dependencias);
      setProgramas(opcionesRes.data.programas ?? []);
      return plantillasRes.data;
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible cargar el módulo CNA."),
        color: "red",
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const periodosDisponibles = useMemo(() => periodos.map((p) => p.name).join(", "), [periodos]);

  const slotsOrdenados = useMemo(
    () => ORDEN.map((tipo) => slots.find((s) => s.tipo === tipo)).filter(Boolean) as PlantillaSlot[],
    [slots]
  );

  // Siempre se consulta toda la información disponible (todos los períodos)
  const consultarSnies = async (plantilla: CnaPlantilla) => {
    const tipo = plantilla.tipo;
    setConsultandoTipo(tipo);
    setResultados((prev) => ({ ...prev, [tipo]: undefined }));
    try {
      const response = await axios.post(
        `${API}/${plantilla._id}/generar`,
        {
          email,
          depCode: tipo === "programa" ? dependencia || "" : "",
          programaSnies: tipo === "programa" ? programa || "" : "",
        },
        { responseType: "blob" }
      );

      const resumenHeader = response.headers["x-cna-resumen"];
      setResultados((prev) => ({
        ...prev,
        [tipo]: {
          blob: response.data,
          fileName: getFileNameFromHeader(response.headers["content-disposition"], `CNA_${tipo}.xlsx`),
          resumen: resumenHeader ? JSON.parse(decodeURIComponent(resumenHeader)) : null,
        },
      }));
      showNotification({
        title: "Información SNIES consultada",
        message: "La plantilla ya está llena. Puedes verla o descargarla.",
        color: "teal",
      });
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible consultar la información SNIES."),
        color: "red",
      });
    } finally {
      setConsultandoTipo(null);
    }
  };

  const handleUpload = async (tipo: TipoPlantilla, file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      showNotification({
        title: "Formato no válido",
        message: "La plantilla debe estar en formato .xlsx. Si la tienes en .xls, ábrela en Excel y guárdala como .xlsx.",
        color: "orange",
      });
      return;
    }

    const formData = new FormData();
    formData.append("template_file", file);
    formData.append("tipo", tipo);
    formData.append("email", email);

    setUploadingTipo(tipo);
    try {
      const { data: plantilla } = await axios.post(API, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      showNotification({ title: "Plantilla cargada", message: file.name, color: "teal" });
      await loadData();
      // Apenas se sube el Excel se consulta la información SNIES
      setUploadingTipo(null);
      await consultarSnies(plantilla);
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible subir la plantilla."),
        color: "red",
      });
    } finally {
      setUploadingTipo(null);
    }
  };

  const handleDownloadOriginal = async (plantilla: CnaPlantilla) => {
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

  const abrirVista = async (tipo: TipoPlantilla) => {
    const resultado = resultados[tipo];
    if (!resultado) return;
    setPreviewTipo(tipo);
    setPreviewLoading(true);
    try {
      const hojas = await buildPreview(resultado.blob, resultado.resumen?.hojas ?? []);
      setPreviewHojas(hojas);
      setHojaActiva(hojas[0]?.name ?? null);
    } catch (error) {
      showNotification({ title: "Error", message: "No fue posible mostrar la vista previa.", color: "red" });
      setPreviewTipo(null);
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
    <Container size="md" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>CNA · Cuadros maestros</Title>
          <Text c="dimmed" size="sm" mt={4}>
            Sube cada plantilla Excel y consulta la información reportada en SNIES para llenarla.
          </Text>
        </div>

        {slotsOrdenados.map(({ tipo, label, plantilla }) => {
          const Icon = TIPO_ICON[tipo];
          const resultado = resultados[tipo];
          const consultando = consultandoTipo === tipo;
          const ocupado = uploadingTipo !== null || consultandoTipo !== null;

          return (
            <Card key={tipo} withBorder radius="lg" padding="lg">
              <Group gap="sm" mb="md" wrap="nowrap">
                <ThemeIcon size={42} radius="md" variant="light" color="orange">
                  <Icon size={24} />
                </ThemeIcon>
                <div style={{ minWidth: 0 }}>
                  <Text fw={700} size="lg">{label}</Text>
                  {resultado ? (
                    <Badge color="orange" variant="light" size="sm">Plantilla llena con SNIES</Badge>
                  ) : plantilla ? (
                    <Badge color="teal" variant="light" size="sm">Plantilla cargada</Badge>
                  ) : (
                    <Badge color="gray" variant="light" size="sm">Sin plantilla</Badge>
                  )}
                </div>
              </Group>

              {/* 1. Plantilla */}
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>1. Plantilla Excel</Text>
              <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                {plantilla ? (
                  <Box style={{ minWidth: 0, flex: 1 }}>
                    <Group gap={8} wrap="nowrap">
                      <IconFileSpreadsheet size={18} color="#2f9e44" style={{ flexShrink: 0 }} />
                      <Text size="sm" fw={600} truncate>{plantilla.file_name}</Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {plantilla.updatedAt ? `Actualizada el ${new Date(plantilla.updatedAt).toLocaleDateString("es-CO")}` : ""}
                      {plantilla.uploaded_by ? ` · ${plantilla.uploaded_by}` : ""}
                    </Text>
                  </Box>
                ) : (
                  <Text size="sm" c="dimmed" style={{ flex: 1 }}>
                    Sube el archivo Excel (.xlsx). Apenas se cargue se consultará la información SNIES.
                  </Text>
                )}
                <Group gap="xs">
                  {plantilla && (
                    <Button variant="subtle" size="sm" leftSection={<IconDownload size={16} />} onClick={() => handleDownloadOriginal(plantilla)}>
                      Original
                    </Button>
                  )}
                  <FileButton
                    onChange={(file) => handleUpload(tipo, file)}
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  >
                    {(props) => (
                      <Button
                        {...props}
                        variant="light"
                        size="sm"
                        leftSection={<IconUpload size={16} />}
                        loading={uploadingTipo === tipo}
                        disabled={ocupado && uploadingTipo !== tipo}
                      >
                        {plantilla ? "Reemplazar Excel" : "Subir Excel"}
                      </Button>
                    )}
                  </FileButton>
                </Group>
              </Group>

              <Divider my="md" />

              {/* 2. Consulta SNIES */}
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>2. Información SNIES</Text>
              <Stack gap="sm" mb="sm">
                
                {tipo === "programa" && (
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <Select
                      label="Programa académico"
                      description="Filtra Inscritos, Admitidos y Matriculados por el código SNIES del programa."
                      placeholder="Selecciona el programa"
                      data={programas}
                      value={programa}
                      onChange={setPrograma}
                      disabled={!plantilla}
                      clearable
                      searchable
                      nothingFoundMessage="Sin resultados"
                    />
                    <Select
                      label="Dependencia de los profesores (opcional)"
                      description="Filtra los profesores por su dependencia en Integra."
                      placeholder="Toda la institución"
                      data={dependencias}
                      value={dependencia}
                      onChange={setDependencia}
                      disabled={!plantilla}
                      clearable
                      searchable
                      nothingFoundMessage="Sin resultados"
                    />
                  </SimpleGrid>
                )}
              </Stack>
              <Button
                fullWidth
                color="orange"
                leftSection={<IconDatabaseSearch size={16} />}
                loading={consultando}
                disabled={!plantilla || (ocupado && !consultando)}
                onClick={() => plantilla && consultarSnies(plantilla)}
              >
                {resultado ? "Volver a consultar información SNIES" : "Consultar información SNIES"}
              </Button>
              {consultando && (
                <Text size="xs" c="dimmed" ta="center" mt={6}>
                  Consultando SNIES y llenando la plantilla. Puede tardar un minuto…
                </Text>
              )}

              <Divider my="md" />

              {/* 3. Resultado */}
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>3. Plantilla llena</Text>
              {resultado?.resumen && resultado.resumen.periodos.length > 0 && (
                <Stack gap={6} mb="sm">
                  <Text size="sm">
                    Hojas diligenciadas: <b>{resultado.resumen.hojas.join(", ")}</b>
                  </Text>
                  <Group gap="xs">
                    {resultado.resumen.periodos.map((p) => (
                      <Badge key={p.periodo} variant="light" color="orange">
                        {p.periodo}: {p.detalle.join(" · ")}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
              )}
              {resultado?.resumen && resultado.resumen.periodos.length === 0 && (
                <Text size="sm" c="dimmed" mb="sm">No se encontró información SNIES para llenar la plantilla.</Text>
              )}
              {resultado?.resumen?.notas?.map((nota, index) => (
                <Alert key={index} color="blue" icon={<IconInfoCircle size={18} />} mb="sm">
                  <Text size="sm">{nota}</Text>
                </Alert>
              ))}
              {resultado?.resumen && resultado.resumen.advertencias.length > 0 && (
                <Alert color="yellow" icon={<IconAlertTriangle size={18} />} title="Revisa antes de enviar al CNA" mb="sm">
                  <List size="sm" spacing={4}>
                    {resultado.resumen.advertencias.map((advertencia, index) => (
                      <List.Item key={index}>{advertencia}</List.Item>
                    ))}
                  </List>
                </Alert>
              )}
              {!resultado && (
                <Text size="sm" c="dimmed" mb="sm">
                  Consulta la información SNIES para habilitar la vista previa y la descarga.
                </Text>
              )}
              <SimpleGrid cols={2} spacing="sm">
                <Button
                  variant="light"
                  leftSection={<IconEye size={16} />}
                  disabled={!resultado}
                  onClick={() => abrirVista(tipo)}
                >
                  Ver plantilla llena
                </Button>
                <Button
                  leftSection={<IconDownload size={16} />}
                  disabled={!resultado}
                  onClick={() => resultado && downloadBlob(resultado.blob, resultado.fileName)}
                >
                  Descargar
                </Button>
              </SimpleGrid>
            </Card>
          );
        })}
      </Stack>

      <Modal
        opened={previewTipo !== null}
        onClose={() => setPreviewTipo(null)}
        size="95%"
        title={<Text fw={700}>{slots.find((s) => s.tipo === previewTipo)?.label} · vista previa</Text>}
      >
        {previewLoading ? (
          <Center py="xl"><Loader /></Center>
        ) : (
          <Stack gap="sm">
            <Text size="xs" c="dimmed">
              Las hojas diligenciadas con SNIES aparecen primero. Los totales que la plantilla calcula con
              fórmulas se ven al abrir el archivo descargado en Excel.
            </Text>
            <Tabs value={hojaActiva} onChange={setHojaActiva}>
              <ScrollArea type="auto" offsetScrollbars>
                <Tabs.List style={{ flexWrap: "nowrap" }}>
                  {previewHojas.map((hoja) => (
                    <Tabs.Tab key={hoja.name} value={hoja.name} color={hoja.filled ? "orange" : "gray"}>
                      {hoja.name}
                      {hoja.filled && <Badge ml={6} size="xs" color="orange" variant="light">SNIES</Badge>}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </ScrollArea>
              {previewHojas.map((hoja) => (
                <Tabs.Panel key={hoja.name} value={hoja.name} pt="sm">
                  <Paper withBorder radius="md">
                    <ScrollArea h="65vh" type="auto">
                      <div className="cna-preview" dangerouslySetInnerHTML={{ __html: hoja.html }} />
                    </ScrollArea>
                  </Paper>
                </Tabs.Panel>
              ))}
            </Tabs>
          </Stack>
        )}
      </Modal>

      <style jsx global>{`
        .cna-preview table {
          border-collapse: collapse;
          font-size: 12px;
        }
        .cna-preview td {
          border: 1px solid var(--mantine-color-default-border);
          padding: 4px 8px;
          white-space: nowrap;
          max-width: 320px;
          overflow: hidden;
          text-overflow: ellipsis;
          vertical-align: top;
        }
        .cna-preview td:empty {
          min-width: 24px;
        }
      `}</style>
    </Container>
  );
}
