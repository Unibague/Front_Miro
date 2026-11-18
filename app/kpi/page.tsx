"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import * as XLSX from "xlsx";
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
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
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconDatabase,
  IconDatabaseImport,
  IconDots,
  IconDownload,
  IconEye,
  IconFileSpreadsheet,
  IconFolder,
  IconFolderPlus,
  IconFolderShare,
  IconPencil,
  IconSettings,
  IconPresentationAnalytics,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { usePeriod } from "@/app/context/PeriodContext";

interface KpiPlantilla {
  _id: string;
  name: string;
  file_name: string;
  uploaded_by?: string;
  updatedAt?: string;
  last_run_at?: string;
  last_run_by?: string;
  folder?: string | null;
  mapeo?: Array<{ hoja: string; fuente: string; fuente_label?: string }>;
}

interface HojaConfig {
  hoja: string;
  fuente: string | null;
  sugerida: string | null;
  encabezados: string[];
  // Por cada archivo, la hoja de ese archivo que mejor corresponde a esta hoja
  porArchivo: Record<string, string>;
}

interface FuenteOpcion {
  value: string;
  label: string;
  group: string;
  hoja: string;
  archivos: string[];
}

// La vista previa solo muestra las primeras filas de cada hoja: las plantillas
// con fórmulas preparadas para miles de filas trabarían el navegador.
const PREVIEW_ROWS = 200;

interface KpiCarpeta {
  _id: string;
  name: string;
}

interface KpiBaseHoja {
  name: string;
  headers: string[];
  totalRows: number;
  derived_from?: string | null;
}

interface KpiBase {
  _id: string;
  name: string;
  file_name: string;
  uploaded_by?: string;
  createdAt?: string;
  sheets: KpiBaseHoja[];
}

interface HojaResumen {
  hoja: string;
  plantilla: string;
  periodos: string[];
  filas: number;
  columnas: number;
  sinCoincidencia: string[];
  formulasExtendidas: string[];
  // Hoja demasiado grande para Excel: Miró hizo sus cálculos y no copió sus filas
  calculada?: boolean;
}

interface Resumen {
  hojas: HojaResumen[];
  hojasSinCambios: string[];
  advertencias: string[];
  calculo?: { celdas: number; hojas: string[] } | null;
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
  const status = error?.response?.status;
  // Sin respuesta JSON (tiempo de espera agotado, servidor caído…) se indica el código
  const withStatus = status ? `${fallback} (código ${status})` : `${fallback} Revisa tu conexión e intenta de nuevo.`;
  const data = error?.response?.data;
  // Con responseType "blob" los errores del backend también llegan como Blob
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      return parsed?.error || parsed?.message || withStatus;
    } catch {
      return withStatus;
    }
  }
  return data?.error || data?.message || withStatus;
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

const resumirPeriodos = (periodos: string[]) => {
  if (periodos.length === 0) return "sin período";
  if (periodos.length <= 6) return periodos.join(", ");
  return `${periodos[0]} a ${periodos[periodos.length - 1]} (${periodos.length} períodos)`;
};

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "";

// Tablas HTML (una por hoja) recortadas al rango con contenido
const buildPreview = async (blob: Blob, hojasLlenas: string[]): Promise<HojaPreview[]> => {
  const workbook = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true, sheetRows: PREVIEW_ROWS });
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

  const { selectedPeriodId } = usePeriod();

  const [plantillas, setPlantillas] = useState<KpiPlantilla[]>([]);
  const [carpetas, setCarpetas] = useState<KpiCarpeta[]>([]);
  const [carpetaActual, setCarpetaActual] = useState<string | null>(null);
  const [carpetaModal, setCarpetaModal] = useState<{ carpeta: KpiCarpeta | null } | null>(null);
  const [nombreCarpeta, setNombreCarpeta] = useState("");
  const [guardandoCarpeta, setGuardandoCarpeta] = useState(false);
  const [eliminarCarpeta, setEliminarCarpeta] = useState<KpiCarpeta | null>(null);
  const [moverPlantilla, setMoverPlantilla] = useState<KpiPlantilla | null>(null);
  const [moverDestino, setMoverDestino] = useState<string | null>(null);

  const [configPlantilla, setConfigPlantilla] = useState<KpiPlantilla | null>(null);
  const [configHojas, setConfigHojas] = useState<HojaConfig[]>([]);
  const [configFuentes, setConfigFuentes] = useState<FuenteOpcion[]>([]);
  const [configValores, setConfigValores] = useState<Record<string, string | null>>({});
  const [configArchivos, setConfigArchivos] = useState<Record<string, string | null>>({});
  const [configLoading, setConfigLoading] = useState(false);
  const [configGuardando, setConfigGuardando] = useState(false);
  const [loading, setLoading] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [trayendoId, setTrayendoId] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, Resultado | undefined>>({});

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewHojas, setPreviewHojas] = useState<HojaPreview[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [hojaActiva, setHojaActiva] = useState<string | null>(null);
  const [eliminar, setEliminar] = useState<KpiPlantilla | null>(null);

  const [tab, setTab] = useState<string | null>("plantillas");
  const [bases, setBases] = useState<KpiBase[]>([]);
  const [uploadingBase, setUploadingBase] = useState(false);
  const [progresoBase, setProgresoBase] = useState<{ actual: number; total: number } | null>(null);
  const [eliminarBase, setEliminarBase] = useState<KpiBase | null>(null);

  const loadData = async () => {
    if (!email || !selectedPeriodId) return;
    try {
      const [plantillasRes, basesRes] = await Promise.all([
        axios.get(API, { params: { email, periodId: selectedPeriodId } }),
        axios.get(`${API}/bases`, { params: { email } }),
      ]);
      setPlantillas(plantillasRes.data.plantillas ?? []);
      setCarpetas(plantillasRes.data.carpetas ?? []);
      setBases(basesRes.data);
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
    setCarpetaActual(null);
    setResultados({});
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, selectedPeriodId]);

  const carpetaAbierta = carpetas.find((carpeta) => carpeta._id === carpetaActual) ?? null;
  const plantillasVisibles = plantillas.filter((plantilla) => (plantilla.folder ?? null) === carpetaActual);
  const contarPlantillas = (carpetaId: string) => plantillas.filter((plantilla) => plantilla.folder === carpetaId).length;

  const abrirCarpetaModal = (carpeta: KpiCarpeta | null) => {
    setNombreCarpeta(carpeta?.name ?? "");
    setCarpetaModal({ carpeta });
  };

  const guardarCarpeta = async () => {
    if (!carpetaModal || !nombreCarpeta.trim()) return;
    setGuardandoCarpeta(true);
    try {
      if (carpetaModal.carpeta) {
        await axios.patch(`${API}/carpetas/${carpetaModal.carpeta._id}`, { email, name: nombreCarpeta });
      } else {
        await axios.post(`${API}/carpetas`, { email, name: nombreCarpeta, periodId: selectedPeriodId });
      }
      setCarpetaModal(null);
      await loadData();
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible guardar la carpeta."),
        color: "red",
      });
    } finally {
      setGuardandoCarpeta(false);
    }
  };

  const handleDeleteCarpeta = async () => {
    if (!eliminarCarpeta) return;
    try {
      await axios.delete(`${API}/carpetas/${eliminarCarpeta._id}`, { params: { email } });
      showNotification({ title: "Carpeta eliminada", message: eliminarCarpeta.name, color: "teal" });
      setEliminarCarpeta(null);
      await loadData();
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible eliminar la carpeta."),
        color: "red",
      });
    }
  };

  const handleMove = async () => {
    if (!moverPlantilla) return;
    try {
      await axios.patch(`${API}/${moverPlantilla._id}/carpeta`, { email, folderId: moverDestino });
      showNotification({ title: "Plantilla movida", message: moverPlantilla.name, color: "teal" });
      setMoverPlantilla(null);
      await loadData();
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible mover la plantilla."),
        color: "red",
      });
    }
  };

  const ocupado = uploading || uploadingBase || replacingId !== null || trayendoId !== null;

  const enviarArchivo = async (file: File, plantilla?: KpiPlantilla) => {
    const formData = new FormData();
    formData.append("template_file", file);
    formData.append("email", email);
    if (!plantilla) {
      formData.append("periodId", selectedPeriodId ?? "");
      if (carpetaActual) formData.append("folderId", carpetaActual);
    }
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
        { email },
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
        message: "La plantilla ya tiene la información. Puedes verla o descargarla.",
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

  // Se pueden elegir varios archivos a la vez; se suben uno por uno
  const handleUploadBase = async (files: File[]) => {
    const validos = files.filter(isXlsx);
    if (!validos.length) return;
    setUploadingBase(true);
    const cargadas: string[] = [];
    const fallidas: string[] = [];
    let porPeriodo = 0;
    try {
      for (const [index, file] of validos.entries()) {
        setProgresoBase({ actual: index + 1, total: validos.length });
        try {
          const formData = new FormData();
          formData.append("base_file", file);
          formData.append("email", email);
          const { data } = await axios.post(`${API}/bases`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          porPeriodo += (data?.sheets ?? []).filter((hoja: KpiBaseHoja) => hoja.derived_from).length;
          cargadas.push(file.name);
        } catch (error) {
          fallidas.push(`${file.name}: ${await getErrorMessage(error, "No fue posible cargarla.")}`);
        }
      }
      if (cargadas.length) {
        showNotification({
          title: cargadas.length === 1 ? "Base cargada" : `${cargadas.length} bases cargadas`,
          message: porPeriodo
            ? `${cargadas.join(", ")}. ${porPeriodo} hoja(s) con períodos en columnas también quedaron como filas (PERIODO / VALOR).`
            : cargadas.join(", "),
          color: "teal",
          autoClose: porPeriodo ? 10000 : undefined,
        });
      }
      if (fallidas.length) {
        showNotification({
          title: fallidas.length === 1 ? "Una base no se cargó" : `${fallidas.length} bases no se cargaron`,
          message: fallidas.join(" · "),
          color: "red",
          autoClose: false,
        });
      }
      await loadData();
    } finally {
      setUploadingBase(false);
      setProgresoBase(null);
    }
  };

  const handleDownloadBase = async (base: KpiBase) => {
    try {
      const response = await axios.get(`${API}/bases/${base._id}/archivo`, {
        params: { email },
        responseType: "blob",
      });
      downloadBlob(response.data, base.file_name);
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible descargar la base."),
        color: "red",
      });
    }
  };

  const handleDeleteBase = async () => {
    if (!eliminarBase) return;
    try {
      await axios.delete(`${API}/bases/${eliminarBase._id}`, { params: { email } });
      showNotification({ title: "Base eliminada", message: eliminarBase.name, color: "teal" });
      setEliminarBase(null);
      await loadData();
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible eliminar la base."),
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

  const abrirConfiguracion = async (plantilla: KpiPlantilla) => {
    setConfigPlantilla(plantilla);
    setConfigLoading(true);
    try {
      const { data } = await axios.get(`${API}/${plantilla._id}/hojas`, { params: { email } });
      setConfigHojas(data.hojas ?? []);
      setConfigFuentes(data.fuentes ?? []);
      setConfigValores(Object.fromEntries((data.hojas ?? []).map((hoja: HojaConfig) => [hoja.hoja, hoja.fuente])));
      // Archivo de la fuente ya configurada (para mostrarlo en la primera lista)
      setConfigArchivos(Object.fromEntries((data.hojas ?? []).map((hoja: HojaConfig) => [
        hoja.hoja,
        (data.fuentes ?? []).find((fuente: FuenteOpcion) => fuente.value === hoja.fuente)?.archivos[0] ?? null,
      ])));
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible leer las hojas de la plantilla."),
        color: "red",
      });
      setConfigPlantilla(null);
    } finally {
      setConfigLoading(false);
    }
  };

  const guardarConfiguracion = async () => {
    if (!configPlantilla) return;
    setConfigGuardando(true);
    try {
      const mapeo = Object.entries(configValores)
        .filter(([, fuente]) => fuente)
        .map(([hoja, fuente]) => ({ hoja, fuente }));
      await axios.put(`${API}/${configPlantilla._id}/hojas`, { email, mapeo });
      showNotification({ title: "Hojas configuradas", message: `${mapeo.length} hoja(s) se llenarán al traer la información.`, color: "teal" });
      setResultados((prev) => ({ ...prev, [configPlantilla._id]: undefined }));
      setConfigPlantilla(null);
      await loadData();
    } catch (error) {
      showNotification({
        title: "Error",
        message: await getErrorMessage(error, "No fue posible guardar la configuración."),
        color: "red",
      });
    } finally {
      setConfigGuardando(false);
    }
  };

  // Opciones agrupadas (Bases externas / Consulta de Información) para el Select
  // Primera lista: archivos (Bases externas / Consulta de Información)
  const archivosAgrupados = Object.entries(
    configFuentes.reduce<Record<string, Set<string>>>((groups, fuente) => {
      fuente.archivos.forEach((archivo) => (groups[fuente.group] ??= new Set()).add(archivo));
      return groups;
    }, {})
  ).map(([group, archivos]) => ({
    group,
    items: [...archivos].sort((a, b) => a.localeCompare(b, "es")).map((archivo) => ({ value: archivo, label: archivo })),
  }));
  // Segunda lista: hojas del archivo elegido
  const hojasDeArchivo = (archivo: string | null) =>
    configFuentes
      .filter((fuente) => archivo && fuente.archivos.includes(archivo))
      .map((fuente) => ({ value: fuente.value, label: fuente.hoja }));
  const elegirArchivo = (hoja: HojaConfig, archivo: string | null) => {
    setConfigArchivos((prev) => ({ ...prev, [hoja.hoja]: archivo }));
    // Miró elige sola la hoja del archivo que corresponde (por encabezados y nombre)
    const hojaSugerida = archivo ? hoja.porArchivo?.[archivo] ?? hojasDeArchivo(archivo)[0]?.value ?? null : null;
    setConfigValores((prev) => ({ ...prev, [hoja.hoja]: hojaSugerida }));
  };
  const etiquetaFuente = (value: string | null) => configFuentes.find((fuente) => fuente.value === value)?.label;
  const hojasConfiguradas = Object.values(configValores).filter(Boolean).length;

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

        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Title order={2}>KPI</Title>
          {tab === "bases" ? (
            <FileButton onChange={handleUploadBase} accept={XLSX_ACCEPT} multiple>
              {(props) => (
                <Button
                  {...props}
                  color="red"
                  leftSection={<IconUpload size={16} />}
                  disabled={ocupado}
                  rightSection={uploadingBase ? <Loader size="xs" color="white" /> : undefined}
                >
                  {progresoBase ? `Cargando ${progresoBase.actual} de ${progresoBase.total}…` : "Cargar bases"}
                </Button>
              )}
            </FileButton>
          ) : (
            // Las plantillas siempre van dentro de una carpeta: primero se crea la
            // carpeta y, ya dentro de ella, se cargan las plantillas.
            !carpetaActual ? (
              <Button
                color="red"
                leftSection={<IconFolderPlus size={16} />}
                disabled={ocupado || !selectedPeriodId}
                onClick={() => abrirCarpetaModal(null)}
              >
                Nueva carpeta
              </Button>
            ) : (
              <FileButton onChange={handleUpload} accept={XLSX_ACCEPT}>
                {(props) => (
                  <Button
                    {...props}
                    color="red"
                    leftSection={<IconUpload size={16} />}
                    loading={uploading}
                    disabled={(ocupado && !uploading) || !selectedPeriodId}
                  >
                    Cargar plantilla
                  </Button>
                )}
              </FileButton>
            )
          )}
        </Group>

        <Tabs value={tab} onChange={setTab} color="red">
          <Tabs.List>
            <Tabs.Tab value="plantillas" leftSection={<IconPresentationAnalytics size={16} />}>
              Plantillas KPI
            </Tabs.Tab>
            <Tabs.Tab value="bases" leftSection={<IconDatabase size={16} />}>
              Bases externas
              {bases.length > 0 && <Badge ml={6} size="xs" color="red" variant="light">{bases.length}</Badge>}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="plantillas" pt="lg">
            <Stack gap="lg">
              {carpetaAbierta && (
                <Breadcrumbs>
                  <Anchor component="button" type="button" size="sm" onClick={() => setCarpetaActual(null)}>
                    Carpetas
                  </Anchor>
                  <Group gap={6}>
                    <IconFolder size={16} />
                    <Text size="sm" fw={600}>{carpetaAbierta.name}</Text>
                  </Group>
                </Breadcrumbs>
              )}

              {!carpetaActual && carpetas.length > 0 && (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                  {carpetas.map((carpeta) => (
                    <Card
                      key={carpeta._id}
                      withBorder
                      radius="lg"
                      padding="md"
                      style={{ cursor: "pointer" }}
                      onClick={() => setCarpetaActual(carpeta._id)}
                    >
                      <Group justify="space-between" wrap="nowrap">
                        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                          <ThemeIcon size={42} radius="md" variant="light" color="yellow">
                            <IconFolder size={24} />
                          </ThemeIcon>
                          <div style={{ minWidth: 0 }}>
                            <Text fw={700} truncate>{carpeta.name}</Text>
                            <Text size="xs" c="dimmed">{contarPlantillas(carpeta._id)} plantilla(s)</Text>
                          </div>
                        </Group>
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              disabled={ocupado}
                              aria-label="Opciones de la carpeta"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <IconDots size={18} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                            <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => abrirCarpetaModal(carpeta)}>
                              Renombrar
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setEliminarCarpeta(carpeta)}>
                              Eliminar
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Card>
                  ))}
                </SimpleGrid>
              )}

              {plantillasVisibles.length === 0 ? (
                (carpetaActual || carpetas.length === 0) && (
                  <Paper withBorder radius="lg" p="xl">
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={56} radius="xl" variant="light" color="red">
                        {carpetaActual ? <IconFolder size={30} /> : <IconPresentationAnalytics size={30} />}
                      </ThemeIcon>
                      <Text fw={600}>{carpetaActual ? "Esta carpeta está vacía" : "Aún no hay carpetas en este período"}</Text>
                      <Text size="sm" c="dimmed" ta="center" maw={520}>
                        {carpetaActual
                          ? "Usa “Cargar plantilla” para agregar una plantilla a esta carpeta."
                          : "Crea una carpeta con “Nueva carpeta” y, dentro de ella, carga tus plantillas."}
                      </Text>
                    </Stack>
                  </Paper>
                )
              ) : (
                <>
                {!carpetaActual && (
                  <Alert color="yellow" icon={<IconAlertTriangle size={18} />}>
                    Estas plantillas no están en ninguna carpeta. Usa “Mover a carpeta” en el menú de cada una para
                    organizarlas.
                  </Alert>
                )}
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                  {plantillasVisibles.map((plantilla) => {
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
                              <Menu.Item leftSection={<IconSettings size={14} />} onClick={() => abrirConfiguracion(plantilla)}>
                                Configurar hojas
                              </Menu.Item>
                              <Menu.Item
                                leftSection={<IconFolderShare size={14} />}
                                disabled={carpetas.length === 0}
                                onClick={() => {
                                  setMoverDestino(plantilla.folder ?? null);
                                  setMoverPlantilla(plantilla);
                                }}
                              >
                                Mover a carpeta
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

                        {plantilla.last_run_at && (
                          <Text size="xs" c="dimmed">Última consulta: {formatDate(plantilla.last_run_at)}</Text>
                        )}

                        <Divider my="md" />

                        <Button
                          fullWidth
                          variant="light"
                          color={plantilla.mapeo?.length ? "gray" : "orange"}
                          leftSection={<IconSettings size={16} />}
                          disabled={ocupado}
                          onClick={() => abrirConfiguracion(plantilla)}
                          mb="xs"
                        >
                          {plantilla.mapeo?.length
                            ? `${plantilla.mapeo.length} hoja(s) configurada(s)`
                            : "Configurar hojas"}
                        </Button>
                        <Button
                          fullWidth
                          color="red"
                          leftSection={<IconDatabaseImport size={16} />}
                          loading={trayendo || replacingId === plantilla._id}
                          disabled={(ocupado && !trayendo) || !plantilla.mapeo?.length}
                          onClick={() => traerInformacion(plantilla)}
                        >
                          {resultado ? "Volver a traer información" : "Traer información"}
                        </Button>
                        {trayendo && (
                          <Text size="xs" c="dimmed" ta="center" mt={6}>
                            Llenando el Excel. Puede tardar un minuto…
                          </Text>
                        )}

                        {resultado?.resumen && (
                          <Stack gap="xs" mt="md">
                            {resultado.resumen.hojas.map((hoja) => (
                              <Paper key={hoja.hoja} withBorder radius="md" p="xs">
                                <Group justify="space-between" wrap="nowrap" gap="xs">
                                  <Text size="sm" fw={600} truncate>{hoja.hoja}</Text>
                                  <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                                    {hoja.calculada && <Badge variant="light" color="grape">Calculada en Miró</Badge>}
                                    <Badge variant="light" color="red">{hoja.filas.toLocaleString("es-CO")} filas</Badge>
                                  </Group>
                                </Group>
                                {hoja.calculada && (
                                  <Text size="xs" c="dimmed">
                                    Por su tamaño, Miró hizo los cálculos de esta hoja: sus filas quedan en el Excel con los
                                    valores ya calculados (sin fórmulas), para que el archivo abra rápido.
                                  </Text>
                                )}
                                <Text size="xs" c="dimmed">
                                  Origen: {hoja.plantilla}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  Períodos: {resumirPeriodos(hoja.periodos)}
                                </Text>
                                {hoja.formulasExtendidas.length > 0 && (
                                  <Text size="xs" c="dimmed">Fórmulas extendidas: {hoja.formulasExtendidas.join(", ")}</Text>
                                )}
                                {hoja.sinCoincidencia.length > 0 && (
                                  <Text size="xs" c="orange">Columnas sin dato en el sistema: {hoja.sinCoincidencia.join(", ")}</Text>
                                )}
                              </Paper>
                            ))}
                            {resultado.resumen.calculo && resultado.resumen.calculo.celdas > 0 && (
                              <Text size="xs" c="dimmed">
                                Celdas calculadas en Miró: {resultado.resumen.calculo.celdas.toLocaleString("es-CO")} (en{" "}
                                {resultado.resumen.calculo.hojas.join(", ")}). Las demás fórmulas se recalculan al abrir el archivo.
                              </Text>
                            )}
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
                </>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="bases" pt="lg">
            <Stack gap="md">
              <Alert color="blue" variant="light" icon={<IconDatabase size={18} />}>
                <Text size="sm">
                  Carga aquí bases que no están en Miró, como las de SPADIES. Al traer información en una plantilla KPI,
                  cada hoja cuyos encabezados se llamen igual que los de una hoja de estas bases se llena con sus datos.
                  Las hojas con un período por columna (1998-1, 1998-2…) también quedan como filas en la hoja
                  “(por período)” con las columnas PERIODO y VALOR, para compararlas por período con lo calculado.
                  Si cargas una versión nueva de una base, se usa la más reciente.
                </Text>
              </Alert>

              {bases.length === 0 ? (
                <Paper withBorder radius="lg" p="xl">
                  <Stack align="center" gap="xs">
                    <ThemeIcon size={56} radius="xl" variant="light" color="red">
                      <IconDatabase size={30} />
                    </ThemeIcon>
                    <Text fw={600}>Aún no hay bases externas</Text>
                    <Text size="sm" c="dimmed" ta="center" maw={520}>
                      Usa “Cargar bases” para subir una o varias hojas de cálculo (.xlsx, .xlsm, .xls, .ods o .csv).
                    </Text>
                  </Stack>
                </Paper>
              ) : (
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                  {bases.map((base) => (
                    <Card key={base._id} withBorder radius="lg" padding="lg">
                      <Group justify="space-between" wrap="nowrap" align="flex-start" mb="sm">
                        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                          <ThemeIcon size={42} radius="md" variant="light" color="red">
                            <IconDatabase size={24} />
                          </ThemeIcon>
                          <div style={{ minWidth: 0 }}>
                            <Text fw={700} size="lg" truncate>{base.name}</Text>
                          </div>
                        </Group>
                        <Menu position="bottom-end" withinPortal>
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" disabled={ocupado} aria-label="Opciones">
                              <IconDots size={18} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => handleDownloadBase(base)}>
                              Descargar original
                            </Menu.Item>
                            <Menu.Divider />
                            <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => setEliminarBase(base)}>
                              Eliminar
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>

                      <Divider my="sm" />
                      <Stack gap={6}>
                        {base.sheets.filter((hoja) => hoja.headers.length > 0).map((hoja) => (
                          <Paper key={hoja.name} withBorder radius="md" p="xs">
                            <Group justify="space-between" wrap="nowrap" gap="xs">
                              <Text size="sm" fw={600} truncate>{hoja.name}</Text>
                              <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                                {hoja.derived_from && <Badge size="xs" color="grape" variant="light">Por período</Badge>}
                                <Badge size="xs" color="red" variant="light">{hoja.totalRows} filas</Badge>
                              </Group>
                            </Group>
                            <Text size="xs" c="dimmed" lineClamp={2}>
                              Encabezados: {hoja.headers.join(", ")}
                            </Text>
                          </Paper>
                        ))}
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
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
              Las hojas llenas aparecen primero y se muestran solo sus primeras {PREVIEW_ROWS} filas. Los resultados de
              las fórmulas se recalculan al abrir el archivo descargado en Excel.
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
          ¿Eliminar la plantilla <b>{eliminar?.name}</b>? Se borrará el archivo cargado. La información de
          Miró no se modifica.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setEliminar(null)}>Cancelar</Button>
          <Button color="red" onClick={handleDelete}>Eliminar</Button>
        </Group>
      </Modal>

      <Modal
        opened={configPlantilla !== null}
        onClose={() => setConfigPlantilla(null)}
        size="xl"
        title={<Text fw={700}>Configurar hojas · {configPlantilla?.name}</Text>}
      >
        {configLoading ? (
          <Center py="xl"><Loader /></Center>
        ) : (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Para cada hoja de datos elige el archivo: Miró busca dentro de él la hoja que corresponde (puedes cambiarla).
              Deja en “No llenar” las hojas de cálculo, parámetros y resultados: esas no se tocan.
            </Text>
            <Text size="sm">{hojasConfiguradas} de {configHojas.length} hojas se llenarán</Text>
            <ScrollArea h="55vh" type="auto" offsetScrollbars>
              <Stack gap={6}>
                {configHojas.map((hoja) => {
                  const valor = configValores[hoja.hoja] ?? null;
                  const sugerencia = hoja.sugerida && hoja.sugerida !== valor ? etiquetaFuente(hoja.sugerida) : null;
                  const repetida = valor ? configHojas.filter((otra) => configValores[otra.hoja] === valor).length > 1 : false;
                  return (
                    <Paper key={hoja.hoja} withBorder radius="md" p="xs">
                      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <Text size="sm" fw={600} truncate>{hoja.hoja}</Text>
                          {sugerencia && (
                            <Anchor
                              component="button"
                              type="button"
                              size="xs"
                              onClick={() => {
                                setConfigValores((prev) => ({ ...prev, [hoja.hoja]: hoja.sugerida }));
                                setConfigArchivos((prev) => ({
                                  ...prev,
                                  [hoja.hoja]: configFuentes.find((fuente) => fuente.value === hoja.sugerida)?.archivos[0] ?? null,
                                }));
                              }}
                            >
                              Sugerida: {sugerencia}
                            </Anchor>
                          )}
                          {repetida && (
                            <Text size="xs" c="orange">
                              Esta misma fuente está elegida en otra hoja: revisa que sea la correcta.
                            </Text>
                          )}
                        </div>
                        <Stack gap={4} w={360} style={{ flexShrink: 0 }}>
                          <Select
                            size="xs"
                            placeholder="No llenar"
                            aria-label={`Archivo para ${hoja.hoja}`}
                            data={archivosAgrupados}
                            value={configArchivos[hoja.hoja] ?? null}
                            onChange={(archivo) => elegirArchivo(hoja, archivo)}
                            searchable
                            clearable
                            nothingFoundMessage="Sin resultados"
                            comboboxProps={{ withinPortal: true }}
                          />
                          {configArchivos[hoja.hoja] && (
                            <Select
                              size="xs"
                              aria-label={`Hoja del archivo para ${hoja.hoja}`}
                              leftSection={<Text size="xs" c="dimmed" pl={6}>Hoja</Text>}
                              leftSectionWidth={44}
                              data={hojasDeArchivo(configArchivos[hoja.hoja])}
                              value={valor}
                              onChange={(value) => setConfigValores((prev) => ({ ...prev, [hoja.hoja]: value }))}
                              allowDeselect={false}
                              comboboxProps={{ withinPortal: true }}
                            />
                          )}
                        </Stack>
                      </Group>
                    </Paper>
                  );
                })}
              </Stack>
            </ScrollArea>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfigPlantilla(null)}>Cancelar</Button>
              <Button color="red" loading={configGuardando} disabled={hojasConfiguradas === 0} onClick={guardarConfiguracion}>
                Guardar
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={carpetaModal !== null}
        onClose={() => setCarpetaModal(null)}
        title={carpetaModal?.carpeta ? "Renombrar carpeta" : "Nueva carpeta"}
        centered
      >
        <TextInput
          label="Nombre"
          placeholder="Ej. Deserción"
          value={nombreCarpeta}
          onChange={(event) => setNombreCarpeta(event.currentTarget.value)}
          onKeyDown={(event) => event.key === "Enter" && guardarCarpeta()}
          maxLength={120}
          data-autofocus
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setCarpetaModal(null)}>Cancelar</Button>
          <Button color="red" loading={guardandoCarpeta} disabled={!nombreCarpeta.trim()} onClick={guardarCarpeta}>
            Guardar
          </Button>
        </Group>
      </Modal>

      <Modal opened={eliminarCarpeta !== null} onClose={() => setEliminarCarpeta(null)} title="Eliminar carpeta" centered>
        <Text size="sm">
          ¿Eliminar la carpeta <b>{eliminarCarpeta?.name}</b>? Solo se pueden eliminar carpetas vacías.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setEliminarCarpeta(null)}>Cancelar</Button>
          <Button color="red" onClick={handleDeleteCarpeta}>Eliminar</Button>
        </Group>
      </Modal>

      <Modal opened={moverPlantilla !== null} onClose={() => setMoverPlantilla(null)} title="Mover a carpeta" centered>
        <Select
          label={`Carpeta para “${moverPlantilla?.name ?? ""}”`}
          data={carpetas.map((carpeta) => ({ value: carpeta._id, label: carpeta.name }))}
          value={moverDestino}
          onChange={setMoverDestino}
          placeholder="Elige una carpeta"
          allowDeselect={false}
          comboboxProps={{ withinPortal: true }}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setMoverPlantilla(null)}>Cancelar</Button>
          <Button color="red" disabled={!moverDestino} onClick={handleMove}>Mover</Button>
        </Group>
      </Modal>

      <Modal opened={eliminarBase !== null} onClose={() => setEliminarBase(null)} title="Eliminar base" centered>
        <Text size="sm">
          ¿Eliminar la base <b>{eliminarBase?.name}</b>? Las plantillas KPI dejarán de traer su información.
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setEliminarBase(null)}>Cancelar</Button>
          <Button color="red" onClick={handleDeleteBase}>Eliminar</Button>
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
