"use client";

import { useState, useEffect, useRef } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Button, Stack,
  Loader, Center, Progress, ThemeIcon, ActionIcon, Box, SimpleGrid,
  Divider, TextInput, Modal, Tabs, Select, Textarea, FileButton,
} from "@mantine/core";
import {
  IconArrowLeft, IconTarget,
  IconEdit, IconChevronDown, IconChevronUp,
  IconCheck, IconAlertTriangle, IconX,
  IconListCheck, IconTrendingUp, IconFlag, IconFileTypePdf, IconGitPullRequest,
  IconForms, IconUpload, IconTrash, IconExternalLink, IconShieldCheck,
} from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PDI_ROUTES } from "../api";
import type { Indicador, Periodo, Accion, Proyecto, SolicitudCambio, TipoCambio, TipoEntidad, EstadoCambio, RespuestaFormulario as RespuestaFormularioAval } from "../types";
import dynamic from "next/dynamic";
import { usePdiConfig } from "../hooks/usePdiConfig";

const EvidenciasPanel = dynamic(() => import("../components/EvidenciasPanel"), { ssr: false });

interface CorteVigente {
  _id: string;
  nombre: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

interface AccionResponsableView {
  accion: Accion;
  indicadores: Indicador[];
}

interface ProyectoResponsableView {
  proyecto: Proyecto;
  acciones: AccionResponsableView[];
}

interface CambioEntityContext {
  id: string;
  tipo: TipoEntidad;
  codigo: string;
  nombre: string;
  valorPresupuesto?: number;
  metasPeriodo?: Array<{
    value: string;
    label: string;
    periodo: string;
    metaActual: string;
    indicadorId: string;
    indicadorCodigo: string;
    indicadorNombre: string;
    fechaInicio: string | null;
    fechaFin: string | null;
  }>;
}

function matchesUserResponsable(email: string, fullName: string, responsable?: string, responsableEmail?: string) {
  if (responsableEmail?.toLowerCase().trim() === email) return true;
  if (fullName && responsable?.toLowerCase().trim() === fullName) return true;
  if (responsable?.toLowerCase().trim() === email) return true;
  return false;
}

function getAccionId(indicador: Indicador) {
  return typeof indicador.accion_id === "string" ? indicador.accion_id : indicador.accion_id?._id;
}

function sortByCodigo<T extends { codigo: string }>(a: T, b: T) {
  return a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: "base" });
}

function esPeriodoEditable(periodo: string, cortesVigentes: CorteVigente[]): boolean {
  // Si no hay cortes configurados con fechas, todo es editable
  if (!cortesVigentes.length) return true;
  return cortesVigentes.some(c => c.nombre === periodo);
}

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "En cumplimiento", amarillo: "Requiere atención", rojo: "Crítico",
};
const SEMAFORO_ICON: Record<string, React.ReactNode> = {
  verde: <IconCheck size={13} />,
  amarillo: <IconAlertTriangle size={13} />,
  rojo: <IconX size={13} />,
};
const TIPO_CAMBIO_LABEL: Record<"meta" | "presupuesto", string> = {
  meta: "Meta por periodo",
  presupuesto: "Presupuesto",
};
const ESTADO_CAMBIO_COLOR: Record<EstadoCambio, string> = {
  Pendiente: "gray",
  "En Revisión": "blue",
  Aprobado: "teal",
  Rechazado: "red",
};
const formatAnioRange = (anioInicio?: number, anioFin?: number) =>
  anioInicio && anioFin ? `${anioInicio} - ${anioFin}` : "Sin rango definido";
const formatCOP = (value?: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value ?? 0);
const formatFecha = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const formatFechaInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

function getIndicadorAvanceMostrado(ind: Indicador) {
  return ind.avance_total_real ?? ind.avance;
}

function getIndicadorAvanceTotalReal(ind: Indicador) {
  return ind.avance_total_real != null ? Number(ind.avance_total_real) : (Number(ind.avance) || 0);
}

function getIndicadorAvancePonderado(ind: Indicador) {
  return Math.min(Math.max(Number(ind.avance) || 0, 0), 100);
}

function indicadorUsaPorcentaje(ind: Indicador) {
  if (typeof ind.meta_final_2029 === "string" && ind.meta_final_2029.includes("%")) return true;
  return ind.periodos.some((p) => typeof p.meta === "string" && p.meta.includes("%"));
}

function formatIndicadorTotalActual(ind: Indicador) {
  if (ind.avance == null) return "—";
  return indicadorUsaPorcentaje(ind) ? `${ind.avance}%` : String(ind.avance);
}

function formatPeriodoAvance(ind: Indicador, avance: Periodo["avance"]) {
  if (avance == null) return "—";
  return indicadorUsaPorcentaje(ind) ? `${avance}%` : String(avance);
}

function getProgressColor(avance: number) {
  if (avance >= 90) return "green";
  if (avance >= 60) return "orange";
  return "red";
}

function getPeriodoSugeridoParaEvaluacion(indicador: Indicador) {
  const periodosOrdenados = [...(indicador.periodos ?? [])].sort((a, b) => b.periodo.localeCompare(a.periodo));

  const conReporte = periodosOrdenados.find((p) =>
    p.estado_reporte !== "Borrador" ||
    Boolean(p.fecha_envio) ||
    Boolean(String(p.reportado_por ?? "").trim()) ||
    p.avance != null
  );

  return conReporte?.periodo ?? periodosOrdenados[0]?.periodo ?? "";
}

function getSemaforoByAvance(avance: number) {
  if (avance >= 90) return "verde";
  if (avance >= 60) return "amarillo";
  return "rojo";
}

function normalizePeso(peso: number) {
  const value = Number(peso) || 0;
  return value <= 1 ? value * 100 : value;
}

function getWeightedProgress<T extends { peso: number }>(items: T[], getValue: (item: T) => number) {
  return Math.round(
    items.reduce((acc, item) => acc + getValue(item) * normalizePeso(item.peso), 0) / 100
  );
}

// ── Panel de formularios del indicador ───────────────────────────────────
interface CampoFormulario {
  _id: string;
  etiqueta: string;
  tipo: "texto_largo" | "archivo_pdf";
  requerido: boolean;
  descripcion: string;
}
interface FormularioPDI {
  _id: string;
  nombre: string;
  descripcion: string;
  alcance?: "indicador" | "general";
  indicador_id?: { _id: string; codigo: string; nombre: string } | null;
  campos: CampoFormulario[];
}
interface RespuestaCampo {
  campo_id: string;
  etiqueta: string;
  tipo: string;
  valor_texto: string;
  nombre_original: string;
  filename: string;
  url: string;
}
interface RespuestaFormulario {
  _id: string;
  formulario_id: string;
  indicador_id?: string;
  respondido_por: string;
  corte: string;
  respuestas: RespuestaCampo[];
  estado: "Borrador" | "Enviado";
  fecha_envio?: string | null;
}

function FormulariosIndicadorPanel({ indicadorId, email, corteActivo }: {
  indicadorId: string;
  email: string;
  corteActivo: string;
}) {
  const [formularios, setFormularios] = useState<FormularioPDI[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaFormulario | null>>({});
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    axios.get(PDI_ROUTES.formularios(), { params: { indicador_id: indicadorId } })
      .then(async r => {
        const forms: FormularioPDI[] = r.data.filter((f: any) => f.activo);
        setFormularios(forms);
        // Cargar respuestas existentes para cada formulario
        const respMap: Record<string, RespuestaFormulario | null> = {};
        const textMap: Record<string, string> = {};
        await Promise.all(forms.map(async f => {
          try {
            const res = await axios.get(PDI_ROUTES.formularioRespuestas(f._id), {
              params: { respondido_por: email, corte: corteActivo, indicador_id: indicadorId },
            });
            const resp: RespuestaFormulario | null = res.data[0] ?? null;
            respMap[f._id] = resp;
            if (resp) {
              resp.respuestas.forEach(r => {
                if (r.tipo === "texto_largo") textMap[`${f._id}-${r.campo_id}`] = r.valor_texto;
              });
            }
          } catch { respMap[f._id] = null; }
        }));
        setRespuestas(respMap);
        setTextos(textMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [indicadorId, email, corteActivo]);

  const getTexto = (formId: string, campoId: string) => textos[`${formId}-${campoId}`] ?? "";
  const setTexto = (formId: string, campoId: string, val: string) =>
    setTextos(prev => ({ ...prev, [`${formId}-${campoId}`]: val }));

  const getRespuestaCampo = (formId: string, campoId: string): RespuestaCampo | undefined =>
    respuestas[formId]?.respuestas.find(r => r.campo_id === campoId);

  const handleGuardar = async (form: FormularioPDI, enviar = false) => {
    setSaving(prev => ({ ...prev, [form._id]: true }));
    try {
      const respuestasPayload = form.campos.map(c => ({
        campo_id: c._id,
        etiqueta: c.etiqueta,
        tipo: c.tipo,
        valor_texto: c.tipo === "texto_largo" ? (getTexto(form._id, c._id) ?? "") : "",
        nombre_original: getRespuestaCampo(form._id, c._id)?.nombre_original ?? "",
        filename: getRespuestaCampo(form._id, c._id)?.filename ?? "",
        url: getRespuestaCampo(form._id, c._id)?.url ?? "",
      }));
      const res = await axios.post(PDI_ROUTES.formularioRespuestas(form._id), {
        respondido_por: email,
        corte: corteActivo,
        indicador_id: indicadorId,
        respuestas: respuestasPayload,
        estado: enviar ? "Enviado" : "Borrador",
      });
      setRespuestas(prev => ({ ...prev, [form._id]: res.data }));
      showNotification({ title: enviar ? "Enviado" : "Guardado", message: enviar ? "Formulario enviado" : "Borrador guardado", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar", color: "red" });
    } finally {
      setSaving(prev => ({ ...prev, [form._id]: false }));
    }
  };

  const handleUploadPDF = async (form: FormularioPDI, campo: CampoFormulario, file: File | null) => {
    if (!file) return;
    // Primero asegurar que existe la respuesta
    let respActual = respuestas[form._id];
    if (!respActual) {
      try {
        const res = await axios.post(PDI_ROUTES.formularioRespuestas(form._id), {
          respondido_por: email, corte: corteActivo, indicador_id: indicadorId,
          respuestas: form.campos.map(c => ({
            campo_id: c._id, etiqueta: c.etiqueta, tipo: c.tipo,
            valor_texto: "", nombre_original: "", filename: "", url: "",
          })),
          estado: "Borrador",
        });
        respActual = res.data;
        setRespuestas(prev => ({ ...prev, [form._id]: res.data }));
      } catch { return; }
    }
    setUploading(prev => ({ ...prev, [`${form._id}-${campo._id}`]: true }));
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const res = await axios.post(
        PDI_ROUTES.formularioArchivo(form._id, respActual!._id, campo._id),
        fd, { headers: { "Content-Type": "multipart/form-data" } }
      );
      // Actualizar respuesta local
      setRespuestas(prev => {
        const r = prev[form._id];
        if (!r) return prev;
        const idx = r.respuestas.findIndex(rr => rr.campo_id === campo._id);
        const updated = [...r.respuestas];
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], ...res.data };
        } else {
          updated.push({ campo_id: campo._id, etiqueta: campo.etiqueta, tipo: campo.tipo, valor_texto: "", ...res.data });
        }
        return { ...prev, [form._id]: { ...r, respuestas: updated } };
      });
      showNotification({ title: "Subido", message: "Archivo PDF subido correctamente", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo subir el archivo", color: "red" });
    } finally {
      setUploading(prev => ({ ...prev, [`${form._id}-${campo._id}`]: false }));
    }
  };

  const handleDeletePDF = async (form: FormularioPDI, campo: CampoFormulario) => {
    const resp = respuestas[form._id];
    if (!resp) return;
    try {
      await axios.delete(PDI_ROUTES.formularioArchivo(form._id, resp._id, campo._id));
      setRespuestas(prev => {
        const r = prev[form._id];
        if (!r) return prev;
        return {
          ...prev,
          [form._id]: {
            ...r,
            respuestas: r.respuestas.map(rr =>
              rr.campo_id === campo._id
                ? { ...rr, filename: "", nombre_original: "", url: "" }
                : rr
            ),
          },
        };
      });
      showNotification({ title: "Eliminado", message: "Archivo eliminado", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
    }
  };

  if (loading) return <Center py="md"><Loader size="sm" /></Center>;

  if (formularios.length === 0) return (
    <Paper withBorder radius="lg" p="lg">
      <Center>
        <Stack align="center" gap="xs">
          <ThemeIcon size={44} radius="xl" color="teal" variant="light"><IconForms size={22} /></ThemeIcon>
          <Text fw={600} size="sm">Sin formularios asignados</Text>
          <Text size="xs" c="dimmed" ta="center">El administrador aún no ha creado formularios para este indicador</Text>
        </Stack>
      </Center>
    </Paper>
  );

  return (
    <Stack gap="md">
      {formularios.map(form => {
        const resp = respuestas[form._id];
        const enviado = resp?.estado === "Enviado";
        return (
          <Paper key={form._id} withBorder radius="xl" p="lg"
            style={{ borderLeft: `4px solid ${enviado ? "#0d9488" : "#7c3aed"}` }}>
            <Group justify="space-between" mb={8}>
              <Group gap={8}>
                <ThemeIcon size={28} radius="xl" color={enviado ? "teal" : "violet"} variant="light">
                  <IconForms size={14} />
                </ThemeIcon>
                <div>
                  <Text fw={700} size="sm">{form.nombre}</Text>
                  {form.descripcion && <Text size="xs" c="dimmed">{form.descripcion}</Text>}
                  {form.alcance === "general" && (
                    <Badge size="xs" color="blue" variant="light" mt={4}>Formulario general</Badge>
                  )}
                </div>
              </Group>
              <Badge color={enviado ? "teal" : resp ? "yellow" : "gray"} variant="light" size="sm">
                {enviado ? "Enviado" : resp ? "Borrador" : "Sin responder"}
              </Badge>
            </Group>

            <Stack gap="sm">
              {form.campos.map(campo => {
                const archivoCampo = getRespuestaCampo(form._id, campo._id);
                return (
                  <Paper key={campo._id} withBorder radius="md" p="sm"
                    style={{ opacity: enviado ? 0.75 : 1 }}>
                    <Group gap={6} mb={6}>
                      <Text size="xs" fw={700}>{campo.etiqueta}</Text>
                      {campo.requerido && <Badge size="xs" color="red" variant="light">Requerido</Badge>}
                    </Group>
                    {campo.descripcion && <Text size="xs" c="dimmed" mb={6}>{campo.descripcion}</Text>}

                    {campo.tipo === "texto_largo" ? (
                      <Textarea
                        placeholder="Escribe aquí..."
                        value={getTexto(form._id, campo._id)}
                        onChange={e => setTexto(form._id, campo._id, e.currentTarget.value)}
                        rows={4}
                        disabled={enviado}
                        autosize
                        minRows={3}
                      />
                    ) : (
                      <Group gap={8}>
                        {archivoCampo?.url ? (
                          <Group gap={6}>
                            <Button size="xs" variant="light" color="blue"
                              leftSection={<IconExternalLink size={12} />}
                              component="a" href={archivoCampo.url} target="_blank">
                              {archivoCampo.nombre_original || "Ver PDF"}
                            </Button>
                            {!enviado && (
                              <ActionIcon size="sm" variant="subtle" color="red"
                                onClick={() => handleDeletePDF(form, campo)}>
                                <IconTrash size={13} />
                              </ActionIcon>
                            )}
                          </Group>
                        ) : (
                          !enviado && (
                            <FileButton
                              onChange={file => handleUploadPDF(form, campo, file)}
                              accept="application/pdf">
                              {props => (
                                <Button size="xs" variant="light" color="teal"
                                  leftSection={<IconUpload size={12} />}
                                  loading={uploading[`${form._id}-${campo._id}`]}
                                  {...props}>
                                  Subir PDF
                                </Button>
                              )}
                            </FileButton>
                          )
                        )}
                        {!archivoCampo?.url && <Text size="xs" c="dimmed">Sin archivo</Text>}
                      </Group>
                    )}
                  </Paper>
                );
              })}
            </Stack>

            {!enviado && (
              <Group justify="flex-end" mt="md" gap={8}>
                <Button size="xs" variant="default" radius="xl"
                  loading={saving[form._id]}
                  onClick={() => handleGuardar(form, false)}>
                  Guardar borrador
                </Button>
                <Button size="xs" color="teal" radius="xl"
                  loading={saving[form._id]}
                  onClick={() => handleGuardar(form, true)}>
                  Enviar formulario
                </Button>
              </Group>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}

// ── Modal completo del responsable ────────────────────────────────────────
function ResponsableIndicadorModal({ opened, onClose, indicador, cortesVigentes, onSaved, anioMeta, email }: {
  opened: boolean;
  onClose: () => void;
  indicador: Indicador;
  cortesVigentes: CorteVigente[];
  onSaved: (ind: Indicador) => void;
  anioMeta: number;
  email: string;
}) {
  const router = useRouter();
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [avancesStr, setAvancesStr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const avanceActual = getIndicadorAvanceMostrado(indicador);

  useEffect(() => {
    if (opened) {
      setPeriodos(indicador.periodos.map(p => ({ ...p })));
      // Inicializar strings de avance para cada periodo
      const strs: Record<string, string> = {};
      indicador.periodos.forEach(p => {
        strs[p.periodo] = p.avance != null ? String(p.avance) : "";
      });
      setAvancesStr(strs);
    }
  }, [opened, indicador]);

  const updateAvanceStr = (periodo: string, value: string) => {
    // Permitir números, punto, coma y % (para metas en porcentaje)
    if (value !== "" && !/^[\d.,% ]*$/.test(value)) return;
    setAvancesStr(prev => ({ ...prev, [periodo]: value }));
  };

  // Normaliza "2%", "2,5%", "2.5" → número
  const parseAvance = (val: string): number | null => {
    if (val === "") return null;
    const limpio = val.replace("%", "").replace(",", ".").trim();
    const n = Number(limpio);
    return isNaN(n) ? null : n;
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const periodosPayload = periodos.map(p => {
        const val = parseAvance(avancesStr[p.periodo] ?? "");
        return {
          periodo: p.periodo,
          meta: p.meta,
          presupuesto_ejecutado: p.presupuesto_ejecutado ?? 0,
          avance: (val === 0 && !esPeriodoEditable(p.periodo, cortesVigentes)) ? null : val,
          resultados_alcanzados: p.resultados_alcanzados ?? "",
          logros: p.logros ?? "",
          alertas: p.alertas ?? "",
          justificacion_retrasos: p.justificacion_retrasos ?? "",
          estado_reporte: p.estado_reporte ?? "Borrador",
          fecha_envio: p.fecha_envio ?? null,
          reportado_por: p.reportado_por ?? "",
        };
      });
      const res = await axios.put(PDI_ROUTES.indicador(indicador._id), {
        periodos: periodosPayload,
        accion_id: typeof indicador.accion_id === "string"
          ? indicador.accion_id
          : indicador.accion_id._id,
      });
      showNotification({ title: "Guardado", message: "Avance actualizado", color: "teal" });
      onSaved(res.data);
      onClose();
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="sm" align="flex-start">
          <ThemeIcon size={36} radius="xl" color="violet" variant="light">
            <IconTarget size={18} />
          </ThemeIcon>
          <div style={{ flex: 1 }}>
            <Text size="lg" fw={800} lh={1.2}>{indicador.nombre}</Text>
            <Text size="sm" c="dimmed" mt={2}>{indicador.codigo}</Text>
          </div>
        </Group>
      }
      centered
      size="lg"
      radius="xl"
      padding="md"
    >
      <Stack gap="md">
        <Paper
          withBorder
          radius="xl"
          p="md"
          style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(59,130,246,0.04) 100%)",
          }}
        >
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Text size="xs" tt="uppercase" fw={700} c="violet">Gestion responsable</Text>
              <Text size="sm" c="dimmed" mt={4}>
                Actualiza avances por periodo y organiza las evidencias del indicador.
              </Text>
            </div>
            <Badge color={SEMAFORO_COLOR[indicador.semaforo]} variant="light" radius="xl">
              {SEMAFORO_LABEL[indicador.semaforo]}
            </Badge>
          </Group>
        </Paper>

        <Stack gap="md">
          <div style={{
            display: "flex",
            gap: 0,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid #ede9fe",
            background: "#faf8ff",
          }}>
            {[
              { label: `Meta ${anioMeta}`, value: String(indicador.meta_final_2029 ?? "—") },
              { label: "Seguimiento", value: indicador.tipo_seguimiento || "Semestral" },
              { label: "Cálculo", value: (indicador.tipo_calculo ?? "—").replace(/_/g, " ") },
              { label: indicador.avance_total_real != null ? "Avance total real" : "Avance actual", value: `${avanceActual}%` },
            ].map((s, i, arr) => (
              <div key={s.label} style={{
                flex: 1,
                padding: "12px 16px",
                borderRight: i < arr.length - 1 ? "1px solid #ede9fe" : "none",
              }}>
                <Text size="xs" fw={600} c="violet.6">{s.label}</Text>
                <Text size="lg" fw={600} c="dimmed" mt={2} style={{ textTransform: "capitalize" }}>{s.value}</Text>
              </div>
            ))}
          </div>

          {periodos.length === 0 ? (
            <Paper withBorder radius="lg" p="md">
              <Text size="sm" c="dimmed" ta="center">Sin periodos registrados</Text>
            </Paper>
          ) : (
            periodos.map((p) => {
              const editable = esPeriodoEditable(p.periodo, cortesVigentes);
              const metaNumerica = p.meta != null ? parseAvance(String(p.meta)) : null;
              const avanceNumerico = parseAvance(avancesStr[p.periodo] ?? "");
              const porcentaje = metaNumerica && metaNumerica > 0 && avanceNumerico != null
                ? Math.min((avanceNumerico / metaNumerica) * 100, 100)
                : null;

              return (
                <Paper
                  key={p.periodo}
                  withBorder
                  radius="xl"
                  p="md"
                  style={{
                    borderLeft: `4px solid ${editable ? "#7c3aed" : "#cbd5e1"}`,
                    background: editable ? "rgba(255,255,255,0.96)" : "rgba(248,250,252,0.96)",
                  }}
                >
                  <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                    <div>
                      <Group gap={8}>
                        <Text size="lg" fw={800}>{p.periodo}</Text>
                        <Badge size="sm" radius="xl" color={editable ? "violet" : "gray"} variant="light">
                          {editable ? "Abierto" : "Cerrado"}
                        </Badge>
                      </Group>
                      <Text size="sm" c="dimmed" mt={4}>Meta definida: <b>{p.meta ?? "—"}</b></Text>
                    </div>
                    <TextInput
                      label="Avance reportado"
                      placeholder={editable
                        ? (String(p.meta ?? "").includes("%") ? "Ej: 2%" : "Ej: 1")
                        : "Periodo cerrado"}
                      value={avancesStr[p.periodo] ?? ""}
                      onChange={(e) => editable && updateAvanceStr(p.periodo, e.currentTarget.value)}
                      style={{ width: 150 }}
                      size="sm"
                      disabled={!editable}
                    />
                  </Group>

                  {porcentaje != null && (
                    <>
                      <Group justify="space-between" mb={6}>
                        <Text size="xs" c="dimmed">Progreso del periodo</Text>
                        <Text size="xs" fw={700}>{Math.round(porcentaje)}%</Text>
                      </Group>
                      <Progress
                        value={porcentaje}
                        color={editable ? "violet" : "gray"}
                        size="sm"
                        radius="xl"
                      />
                    </>
                  )}
                </Paper>
              );
            })
          )}

          <Button
            variant="light"
            color="violet"
            radius="xl"
            fullWidth
            leftSection={<IconForms size={16} />}
            onClick={() => { onClose(); router.push(`/pdi/indicadores/${indicador._id}`); }}
          >
            Subir evidencias y formularios
          </Button>

          <Group justify="flex-end" pt="xs" style={{ borderTop: "1px solid var(--mantine-color-gray-2)" }}>
            <Button variant="default" radius="xl" onClick={onClose}>Cancelar</Button>
            <Button
              loading={loading}
              onClick={handleSave}
              color="violet"
              radius="xl"
              disabled={periodos.length > 0 && periodos.every(p => !esPeriodoEditable(p.periodo, cortesVigentes))}
            >
              Guardar avances
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Modal>
  );
}

// ── Card de indicador ──────────────────────────────────────────────────────
function MiIndicadorCard({ indicador: indInicial, cortesVigentes, onUpdated, aniosPdi, anioMeta, email, esLider = false, esResponsable = true }: {
  indicador: Indicador;
  cortesVigentes: CorteVigente[];
  onUpdated: (ind: Indicador) => void;
  aniosPdi: number[];
  anioMeta: number;
  email: string;
  esLider?: boolean;
  esResponsable?: boolean;
}) {
  const router = useRouter();
  const [ind, setInd] = useState(indInicial);
  const [open, setOpen] = useState(false);
  const [showAnios, setShowAnios] = useState(false);

  useEffect(() => { setInd(indInicial); }, [indInicial]);

  const handleSaved = (updated: Indicador) => {
    setInd(updated);
    onUpdated(updated);
  };

  // Para indicadores acumulados/último_valor, avance_total_real es el % real de cumplimiento
  const avanceMostrado = getIndicadorAvanceMostrado(ind);
  const avanceBarra = Math.min(Math.max(avanceMostrado, 0), 100);
  const avanceVisible = avanceBarra;
  const avanceTotalReal = getIndicadorAvanceTotalReal(ind);
  const barColor = avanceMostrado >= 70 ? "#22c55e" : avanceMostrado >= 40 ? "#f59e0b" : "#ef4444";
  const periodoSugeridoEvaluacion = getPeriodoSugeridoParaEvaluacion(ind);

  return (
    <Paper withBorder radius="xl" p="lg" shadow="xs"
      style={{ transition: "box-shadow .2s, transform .2s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.10)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      {/* Header */}
      <Group justify="space-between" align="flex-start" mb="xs">
        <Group gap={8}>
          <ThemeIcon size={32} radius="xl" color="violet" variant="light">
            <IconTarget size={17} />
          </ThemeIcon>
          <div>
            <Text size="xs" fw={700} c="dimmed">{ind.codigo}</Text>
            <Text fw={700} size="sm" style={{ lineHeight: 1.3 }}>{ind.nombre}</Text>
          </div>
        </Group>
        <Badge
          color={SEMAFORO_COLOR[ind.semaforo]}
          variant="light" size="sm" radius="xl"
          leftSection={SEMAFORO_ICON[ind.semaforo]}
        >
          {SEMAFORO_LABEL[ind.semaforo]}
        </Badge>
      </Group>

      {ind.indicador_resultado && (
        <Text size="xs" c="dimmed" mb="sm">{ind.indicador_resultado}</Text>
      )}

      {/* Avance */}
      <Group justify="space-between" align="flex-end" mb={6}>
        <div>
          <Text size="2rem" fw={800} lh={1}>{avanceVisible}%</Text>
        </div>
        {ind.meta_final_2029 != null && (
          <div style={{ textAlign: "right" }}>
            <Text size="lg" fw={700}>{ind.meta_final_2029}</Text>
            <Text size="xs" c="dimmed">Meta {anioMeta}</Text>
          </div>
        )}
      </Group>

      <Group gap={8} align="center" mb={showAnios ? 6 : 12}>
        <Box style={{ flex: 1, height: 10, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden" }}>
          <Box style={{ height: "100%", width: `${avanceBarra}%`, background: barColor, borderRadius: 99, transition: "width .4s" }} />
        </Box>
        <ActionIcon
          size="xs" variant="subtle" color="violet"
          onClick={() => setShowAnios(v => !v)}
          title="Ver avance por año"
        >
          <IconChevronDown size={13} style={{ transform: showAnios ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </ActionIcon>
      </Group>

      {showAnios && (
        <>
          <Group gap={6} mb={6} wrap="wrap">
            {(aniosPdi.length ? aniosPdi.map(String) : Object.keys(ind.avances_por_anio ?? {}).sort()).map((anio) => {
              const val = ind.avances_por_anio?.[anio];
              const tieneData = val != null;
              return (
                <Box
                  key={anio}
                  style={{
                    background: "rgba(124,58,237,0.07)",
                    border: "1px solid rgba(124,58,237,0.18)",
                    borderRadius: 8,
                    padding: "3px 10px",
                    textAlign: "center",
                    minWidth: 60,
                  }}
                >
                  <Text size="10px" c="dimmed" fw={700}>{anio}</Text>
                  <Text size="xs" fw={800} c={tieneData ? "violet" : "dimmed"}>
                    {tieneData ? `${Number(val).toFixed(1)}%` : "0.0%"}
                  </Text>
                </Box>
              );
            })}
          </Group>
          <Box
            mb="md"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(59,130,246,0.12)",
              border: "1px solid rgba(59,130,246,0.22)",
            }}
          >
            <Text size="10px" fw={800} c="blue">
              AVANCE TOTAL REAL
            </Text>
            <Text size="sm" fw={900} c="blue">
              {avanceTotalReal}%
            </Text>
          </Box>
        </>
      )}

      {/* Mini stats */}
      <SimpleGrid cols={3} mb="md">
        {[
          { label: "Peso", value: `${ind.peso}%` },
          { label: "Seguimiento", value: ind.tipo_seguimiento || "Semestral" },
          { label: "Total actual", value: formatIndicadorTotalActual(ind) },
        ].map(s => (
          <Box key={s.label} style={{ textAlign: "center", background: "var(--mantine-color-default-hover)", borderRadius: 12, padding: "8px 4px" }}>
            <Text fw={700} size="sm" lh={1}>{s.value}</Text>
            <Text size="xs" c="dimmed" mt={2}>{s.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      {ind.observaciones && (
        <Text size="xs" c="dimmed" mb="sm">Obs: {ind.observaciones}</Text>
      )}

      {(ind.fecha_inicio || ind.fecha_fin) && (
        <Text size="xs" c="dimmed" mb="sm">
          Vigencia: <b>{formatFecha(ind.fecha_inicio) ?? "Sin inicio"}</b> a <b>{formatFecha(ind.fecha_fin) ?? "Sin fin"}</b>
        </Text>
      )}

      {/* Contexto */}
      <Text size="xs" c="dimmed" mb="sm">
        Acción: <b>{typeof ind.accion_id === "string" ? ind.accion_id : ind.accion_id.nombre}</b>
      </Text>

      {/* Resumen periodos colapsable */}
      {ind.periodos.length > 0 && (
        <>
          <Button
            variant="light" color="violet" radius="xl" size="xs" fullWidth
            rightSection={open ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
            onClick={() => setOpen(v => !v)}
          >
            {open ? "Ocultar periodos" : `Ver periodos (${ind.periodos.length})`}
          </Button>
          {open && (
            <Stack gap={6} mt="sm">
              {ind.periodos.map(p => (
                <Paper key={p.periodo} withBorder radius="md" p="sm">
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>{p.periodo}</Text>
                    <Group gap={12}>
                      <Text size="xs" c="dimmed">Meta: <b>{p.meta ?? "—"}</b></Text>
                      <Text size="xs" c="dimmed">Avance: <b>{formatPeriodoAvance(ind, p.avance)}</b></Text>
                    </Group>
                  </Group>
                  {p.avance != null && p.meta != null && Number(p.meta) > 0 && (
                    <Progress
                      value={Math.min((Number(p.avance) / Number(p.meta)) * 100, 100)}
                      color="violet" size="xs" radius="xl" mt={6}
                    />
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </>
      )}

      {/* Botón principal de gestión */}
      <Stack gap="xs" mt="sm">
        {esResponsable && (
          <Button
            fullWidth
            variant="gradient"
            gradient={{ from: "violet", to: "blue", deg: 135 }}
            radius="xl"
            size="sm"
            leftSection={<IconEdit size={15} />}
            onClick={() => router.push(`/pdi/mis-indicadores/${ind._id}/subir-evidencias?origen=mis-indicadores&esLider=${esLider ? "1" : "0"}`)}
          >
            Actualizar avances y evidencias
          </Button>
        )}
        {esLider && !esResponsable && (
          <Button
            fullWidth
            variant="light"
            color="teal"
            radius="xl"
            size="sm"
            leftSection={<IconListCheck size={15} />}
            onClick={() => router.push(
              `/pdi/mis-indicadores/${ind._id}?modo=evaluar&origen=mis-indicadores${periodoSugeridoEvaluacion ? `&periodo=${encodeURIComponent(periodoSugeridoEvaluacion)}` : ""}`
            )}
          >
            Ver reportes y evaluar
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

function SolicitudCambioModal({
  opened,
  onClose,
  entity,
  requesterName,
  requesterEmail,
}: {
  opened: boolean;
  onClose: () => void;
  entity: CambioEntityContext | null;
  requesterName: string;
  requesterEmail: string;
}) {
  const [solicitudes, setSolicitudes] = useState<SolicitudCambio[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tipoCambio, setTipoCambio] = useState<"meta" | "presupuesto" | "cronograma">("meta");
  const [indicadorSeleccionado, setIndicadorSeleccionado] = useState<string | null>(null);
  const [metaSeleccionada, setMetaSeleccionada] = useState<string | null>(null);
  const [justificacion, setJustificacion] = useState("");
  const [valorAnterior, setValorAnterior] = useState("");
  const [valorPropuesto, setValorPropuesto] = useState("");
  const [fechaInicioPropuesta, setFechaInicioPropuesta] = useState("");
  const [fechaFinPropuesta, setFechaFinPropuesta] = useState("");

  const indicadoresDisponibles = Array.from(new Map(
    (entity?.metasPeriodo ?? []).map((meta) => [meta.indicadorId, {
      value: meta.indicadorId,
      label: `${meta.indicadorCodigo} · ${meta.indicadorNombre}`,
      codigo: meta.indicadorCodigo,
      nombre: meta.indicadorNombre,
      fechaInicio: meta.fechaInicio,
      fechaFin: meta.fechaFin,
    }])
  ).values());

  const metasFiltradas = (entity?.metasPeriodo ?? []).filter((meta) =>
    !indicadorSeleccionado || meta.indicadorId === indicadorSeleccionado
  );

  const indicadorActual = indicadoresDisponibles.find((indicador) => indicador.value === indicadorSeleccionado);

  useEffect(() => {
    if (!opened || !entity) return;
    setLoading(true);
    axios.get(PDI_ROUTES.cambios(), { params: { entidad_id: entity.id, entidad_tipo: entity.tipo } })
      .then((res) => setSolicitudes(res.data?.data ?? []))
      .catch(() => setSolicitudes([]))
      .finally(() => setLoading(false));
  }, [opened, entity]);

  useEffect(() => {
    if (!opened || !entity) return;
    setTipoCambio(entity.metasPeriodo?.length ? "meta" : "presupuesto");
    setIndicadorSeleccionado(entity.metasPeriodo?.[0]?.indicadorId ?? null);
    setMetaSeleccionada(entity.metasPeriodo?.[0]?.value ?? null);
    setJustificacion("");
    setValorAnterior("");
    setValorPropuesto("");
    setFechaInicioPropuesta("");
    setFechaFinPropuesta("");
  }, [opened, entity]);

  useEffect(() => {
    if (!metasFiltradas.length) {
      setMetaSeleccionada(null);
      return;
    }
    if (!metasFiltradas.some((meta) => meta.value === metaSeleccionada)) {
      setMetaSeleccionada(metasFiltradas[0]?.value ?? null);
    }
  }, [metaSeleccionada, metasFiltradas]);

  useEffect(() => {
    if (!entity) return;

    if (tipoCambio === "presupuesto") {
      setValorAnterior(entity.valorPresupuesto != null ? formatCOP(entity.valorPresupuesto) : "");
      return;
    }

    if (tipoCambio === "cronograma") {
      setValorAnterior(
        `Inicio: ${formatFecha(indicadorActual?.fechaInicio) ?? "Sin inicio"} · Fin: ${formatFecha(indicadorActual?.fechaFin) ?? "Sin fin"}`
      );
      return;
    }

    const metaActual = entity.metasPeriodo?.find((meta) => meta.value === metaSeleccionada);
    setValorAnterior(metaActual?.metaActual ?? "");
  }, [entity, tipoCambio, metaSeleccionada, indicadorActual]);

  const handleSave = async () => {
    if (!entity || !justificacion.trim()) {
      showNotification({ title: "Error", message: "Completa la justificacion de la solicitud", color: "red" });
      return;
    }

    const metaActual = entity.metasPeriodo?.find((meta) => meta.value === metaSeleccionada);
    if (tipoCambio === "meta" && !metaActual) {
      showNotification({ title: "Error", message: "Selecciona la meta del periodo a modificar", color: "red" });
      return;
    }
    if (tipoCambio !== "cronograma" && !valorPropuesto.trim()) {
      showNotification({ title: "Error", message: "Completa el nuevo valor solicitado", color: "red" });
      return;
    }
    if (tipoCambio === "cronograma" && !indicadorActual) {
      showNotification({ title: "Error", message: "Selecciona el indicador a modificar", color: "red" });
      return;
    }
    if (tipoCambio === "cronograma" && !fechaInicioPropuesta && !fechaFinPropuesta) {
      showNotification({ title: "Error", message: "Ingresa al menos una fecha nueva para el indicador", color: "red" });
      return;
    }

    setSaving(true);
    try {
      const valorPropuestoCronograma = `Inicio: ${fechaInicioPropuesta || "Sin cambio"} · Fin: ${fechaFinPropuesta || "Sin cambio"}`;
      const payload = {
        entidad_tipo: entity.tipo,
        entidad_id: entity.id,
        entidad_codigo: entity.codigo,
        entidad_nombre: entity.nombre,
        tipo_cambio: tipoCambio as TipoCambio,
        campo_afectado: tipoCambio === "presupuesto"
          ? "presupuesto"
          : tipoCambio === "cronograma"
            ? `cronograma_${indicadorActual?.codigo ?? "indicador"}`
            : `meta_${metaActual?.periodo ?? ""}`,
        descripcion: tipoCambio === "presupuesto"
          ? `Solicitud de ajuste de presupuesto para ${entity.codigo}`
          : tipoCambio === "cronograma"
            ? `Solicitud de ajuste de fechas para ${indicadorActual?.codigo ?? "indicador"} en ${entity.codigo}`
            : `Solicitud de ajuste de meta para ${metaActual?.indicadorCodigo ?? "indicador"} · ${metaActual?.periodo ?? ""}`,
        justificacion: justificacion.trim(),
        valor_anterior: valorAnterior.trim() || null,
        valor_propuesto: tipoCambio === "cronograma"
          ? valorPropuestoCronograma
          : tipoCambio === "presupuesto" && valorPropuesto.trim()
          ? formatCOP(Number(valorPropuesto.trim().replace(/[^\d]/g, "")))
          : valorPropuesto.trim() || null,
        solicitado_por: requesterName || "Responsable PDI",
        solicitado_email: requesterEmail,
        periodo: tipoCambio === "meta" ? (metaActual?.periodo ?? "") : "",
      };
      const res = await axios.post(PDI_ROUTES.cambios(), payload);
      setSolicitudes((prev) => [res.data, ...prev]);
      setJustificacion("");
      setValorPropuesto("");
      setFechaInicioPropuesta("");
      setFechaFinPropuesta("");
      showNotification({ title: "Solicitud creada", message: "Se registro la solicitud de cambio", color: "teal" });
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "No se pudo crear la solicitud", color: "red" });
    } finally {
      setSaving(false);
    }
  };

  if (!entity) return null;

  return (
    <Modal opened={opened} onClose={onClose} centered size="xl" radius="xl" title="Gestion de cambios">
      <Stack gap="md">
        <Paper withBorder radius="xl" p="md" style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(59,130,246,0.04) 100%)" }}>
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              <Text size="xs" fw={700} c="violet" tt="uppercase">{entity.tipo}</Text>
              <Text fw={800} size="lg">{entity.codigo}:{entity.nombre}</Text>
              <Text size="sm" c="dimmed" mt={4}>
                Puedes solicitar cambios de meta por periodo, presupuesto o fechas de un indicador.
              </Text>
            </div>
            <Badge color="violet" variant="light" radius="xl">{solicitudes.length} solicitud{solicitudes.length === 1 ? "" : "es"}</Badge>
          </Group>
        </Paper>

        <Paper withBorder radius="xl" p="md">
          <Text fw={700} mb="sm">Nueva solicitud</Text>
          <Stack gap="sm">
            <Select
              label="Que deseas modificar"
              data={[
                ...(entity.metasPeriodo?.length ? [{ value: "meta", label: TIPO_CAMBIO_LABEL.meta }] : []),
                ...(entity.metasPeriodo?.length ? [{ value: "cronograma", label: "Fechas del indicador" }] : []),
                { value: "presupuesto", label: TIPO_CAMBIO_LABEL.presupuesto },
              ]}
              value={tipoCambio}
              onChange={(v) => setTipoCambio((v as "meta" | "presupuesto" | "cronograma") ?? "presupuesto")}
            />
            {(tipoCambio === "meta" || tipoCambio === "cronograma") && (
              <Select
                label="Indicador"
                placeholder="Selecciona el indicador"
                data={indicadoresDisponibles}
                value={indicadorSeleccionado}
                onChange={setIndicadorSeleccionado}
                searchable
              />
            )}
            {tipoCambio === "meta" && (
              <>
                <Select
                  label="Meta por periodo"
                  placeholder="Selecciona el periodo"
                  data={metasFiltradas}
                  value={metaSeleccionada}
                  onChange={setMetaSeleccionada}
                />
                <Paper withBorder radius="lg" p="sm" style={{ background: "rgba(248,245,255,0.75)" }}>
                  <Text size="xs" fw={700} c="violet" tt="uppercase" mb={4}>Contexto de la meta</Text>
                  <Text size="sm"><b>Indicador:</b> {entity.metasPeriodo?.find((meta) => meta.value === metaSeleccionada)?.indicadorCodigo ?? "Sin dato"} · {entity.metasPeriodo?.find((meta) => meta.value === metaSeleccionada)?.indicadorNombre ?? ""}</Text>
                  <Text size="sm"><b>Periodo:</b> {entity.metasPeriodo?.find((meta) => meta.value === metaSeleccionada)?.periodo ?? "Sin dato"}</Text>
                  <Text size="sm"><b>Meta actual:</b> {entity.metasPeriodo?.find((meta) => meta.value === metaSeleccionada)?.metaActual ?? "Sin dato"}</Text>
                </Paper>
              </>
            )}
            {tipoCambio === "cronograma" && (
              <Paper withBorder radius="lg" p="sm" style={{ background: "rgba(248,245,255,0.75)" }}>
                <Text size="xs" fw={700} c="violet" tt="uppercase" mb={4}>Fechas actuales del indicador</Text>
                <Text size="sm"><b>Indicador:</b> {indicadorActual?.codigo ?? "Sin dato"} · {indicadorActual?.nombre ?? ""}</Text>
                <Text size="sm"><b>Inicio actual:</b> {formatFecha(indicadorActual?.fechaInicio) ?? "Sin inicio"}</Text>
                <Text size="sm"><b>Fin actual:</b> {formatFecha(indicadorActual?.fechaFin) ?? "Sin fin"}</Text>
              </Paper>
            )}
            <TextInput
              label={tipoCambio === "presupuesto" ? "Valor actual del presupuesto" : tipoCambio === "cronograma" ? "Fechas actuales" : "Meta actual"}
              value={valorAnterior}
              readOnly
            />
            {tipoCambio === "cronograma" ? (
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <TextInput
                  type="date"
                  label="Nueva fecha de inicio"
                  value={fechaInicioPropuesta}
                  onChange={(e) => setFechaInicioPropuesta(e.currentTarget.value)}
                  placeholder={formatFechaInput(indicadorActual?.fechaInicio)}
                />
                <TextInput
                  type="date"
                  label="Nueva fecha de fin"
                  value={fechaFinPropuesta}
                  onChange={(e) => setFechaFinPropuesta(e.currentTarget.value)}
                  placeholder={formatFechaInput(indicadorActual?.fechaFin)}
                />
              </SimpleGrid>
            ) : (
              <TextInput
                label={tipoCambio === "presupuesto" ? "Nuevo presupuesto solicitado" : "Nuevo valor de la meta"}
                placeholder={tipoCambio === "presupuesto" ? "Ej: 8.000.000" : "Ej: 12% o 300"}
                value={valorPropuesto}
                onChange={(e) => {
                  if (tipoCambio === "presupuesto") {
                    const raw = e.currentTarget.value.replace(/[^\d]/g, "");
                    setValorPropuesto(
                      raw ? new Intl.NumberFormat("es-CO").format(Number(raw)) : ""
                    );
                  } else {
                    setValorPropuesto(e.currentTarget.value);
                  }
                }}
              />
            )}
            <Textarea
              label="Justificacion"
              placeholder={tipoCambio === "cronograma"
                ? "Explica por que necesitas cambiar las fechas del indicador."
                : "Explica por que necesitas este cambio."}
              value={justificacion}
              onChange={(e) => setJustificacion(e.currentTarget.value)}
              rows={3}
            />
            <Group justify="flex-end">
              <Button variant="default" radius="xl" onClick={onClose}>Cerrar</Button>
              <Button radius="xl" color="violet" loading={saving} onClick={handleSave}>Enviar solicitud</Button>
            </Group>
          </Stack>
        </Paper>

        <Paper withBorder radius="xl" p="md">
          <Text fw={700} mb="sm">Trazabilidad de solicitudes</Text>
          {loading ? (
            <Center py="md"><Loader size="sm" /></Center>
          ) : solicitudes.length === 0 ? (
            <Text size="sm" c="dimmed">No hay solicitudes registradas para esta entidad.</Text>
          ) : (
            <Stack gap="sm">
              {solicitudes.map((sol) => (
                <Paper key={sol._id} withBorder radius="lg" p="sm" style={{ background: "rgba(255,255,255,0.9)" }}>
                  <Group justify="space-between" align="flex-start" mb={6}>
                    <div>
                      <Group gap={8}>
                        <Badge color="violet" variant="light" size="sm">
                          {sol.tipo_cambio === "meta"
                            ? TIPO_CAMBIO_LABEL.meta
                            : sol.tipo_cambio === "cronograma"
                              ? "Fechas del indicador"
                              : TIPO_CAMBIO_LABEL.presupuesto}
                        </Badge>
                        <Badge color={ESTADO_CAMBIO_COLOR[sol.estado]} variant="light" size="sm">{sol.estado}</Badge>
                      </Group>
                      <Text fw={600} mt={6}>{sol.descripcion}</Text>
                    </div>
                    <Text size="xs" c="dimmed">{new Date(sol.fecha_solicitud).toLocaleDateString("es-CO")}</Text>
                  </Group>
                  {sol.justificacion && <Text size="sm" c="dimmed">{sol.justificacion}</Text>}
                  {(sol.valor_anterior != null || sol.valor_propuesto != null) && (
                    <Group gap="lg" mt={8}>
                      {sol.valor_anterior != null && <Text size="xs" c="dimmed">Anterior: <b>{String(sol.valor_anterior)}</b></Text>}
                      {sol.valor_propuesto != null && <Text size="xs" c="dimmed">Propuesto: <b>{String(sol.valor_propuesto)}</b></Text>}
                      {sol.periodo && <Text size="xs" c="dimmed">Periodo: <b>{sol.periodo}</b></Text>}
                    </Group>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </Paper>
      </Stack>
    </Modal>
  );
}

function AccionResponsableCard({ accion, indicadores, cortesVigentes, onUpdated, aniosPdi, anioMeta, onSolicitarCambio, email, esLider = false, esResponsable = true }: {
  accion: Accion;
  indicadores: Indicador[];
  cortesVigentes: CorteVigente[];
  onUpdated: (ind: Indicador) => void;
  aniosPdi: number[];
  anioMeta: number;
  onSolicitarCambio: (entity: CambioEntityContext) => void;
  email: string;
  esLider?: boolean;
  esResponsable?: boolean;
}) {
  const avanceAccion = indicadores.length
    ? getWeightedProgress(indicadores, (indicador) => getIndicadorAvancePonderado(indicador))
    : Number(accion.avance) || 0;
  const semaforoAccion = getSemaforoByAvance(avanceAccion);
  const avanceAccionBarra = Math.min(Math.max(avanceAccion, 0), 100);
  return (
    <Paper withBorder radius="xl" p="lg" style={{ background: "rgba(255,255,255,0.72)" }}>
      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        <Group gap="md" align="flex-start" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={40} radius="xl" color="blue" variant="light">
            <IconTrendingUp size={20} />
          </ThemeIcon>
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <Text size="xs" fw={700} c="dimmed">{accion.codigo}</Text>
            <Text fw={700} size="lg" style={{ lineHeight: 1.25 }}>{accion.nombre}</Text>
            {accion.responsable && (
              <Text size="xs" c="dimmed" mt={4}>Responsable: <b>{accion.responsable}</b></Text>
            )}
          </div>
        </Group>
        <Group gap="sm">
          <Button
            variant="light"
            color="violet"
            radius="xl"
            size="xs"
            leftSection={<IconGitPullRequest size={14} />}
            onClick={() => onSolicitarCambio({
              id: accion._id,
              tipo: "accion",
              codigo: accion.codigo,
              nombre: accion.nombre,
              valorPresupuesto: accion.presupuesto,
              metasPeriodo: indicadores.flatMap((indicador) =>
                indicador.periodos.map((periodo) => ({
                  value: `${indicador._id}-${periodo.periodo}`,
                  label: `${indicador.codigo} · ${periodo.periodo} · Actual: ${String(periodo.meta ?? "Sin dato")}`,
                  periodo: periodo.periodo,
                  metaActual: String(periodo.meta ?? "Sin dato"),
                  indicadorId: indicador._id,
                  indicadorCodigo: indicador.codigo,
                  indicadorNombre: indicador.nombre,
                  fechaInicio: indicador.fecha_inicio,
                  fechaFin: indicador.fecha_fin,
                }))
              ),
            })}
          >
            Solicitar cambio
          </Button>
          <Badge color={SEMAFORO_COLOR[semaforoAccion]} variant="light" radius="xl">
            {SEMAFORO_LABEL[semaforoAccion]}
          </Badge>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm" mb="md">
        {[
          { label: "Avance", value: `${avanceAccion}%` },
          { label: "Peso", value: `${accion.peso}%` },
          { label: "Indicadores", value: indicadores.length },
        ].map((item) => (
          <Box
            key={item.label}
            style={{
              textAlign: "center",
              background: "var(--mantine-color-default-hover)",
              borderRadius: 14,
              padding: "10px 6px",
            }}
          >
            <Text fw={800} size="lg" lh={1}>{item.value}</Text>
            <Text size="xs" c="dimmed" mt={4}>{item.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      <Box mb="md">
        <Group justify="space-between" mb={6}>
          <Text size="xs" c="dimmed">Avance de la acción</Text>
          <Text size="xs" fw={700}>{avanceAccion}%</Text>
        </Group>
        <Progress value={avanceAccionBarra} color={getProgressColor(avanceAccion)} size="md" radius="xl" />
      </Box>

      {indicadores.length === 0 ? (
        <Paper withBorder radius="lg" p="md" style={{ background: "rgba(124,58,237,0.04)" }}>
          <Text fw={600}>Sin indicadores visibles en esta accion</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Tienes esta accion asociada, pero todavia no hay indicadores vinculados a tu vista.
          </Text>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
          {indicadores.map((ind) => (
            <MiIndicadorCard
              key={ind._id}
              indicador={ind}
              cortesVigentes={cortesVigentes}
              aniosPdi={aniosPdi}
              anioMeta={anioMeta}
              onUpdated={onUpdated}
              email={email}
              esLider={esLider}
              esResponsable={esResponsable}
            />
          ))}
        </SimpleGrid>
      )}
    </Paper>
  );
}

function ProyectoResponsableCard({ vista, cortesVigentes, onUpdated, aniosPdi, anioMeta, onSolicitarCambio, email, esLiderProyecto = false, esResponsableProyecto = false }: {
  vista: ProyectoResponsableView;
  cortesVigentes: CorteVigente[];
  onUpdated: (ind: Indicador) => void;
  aniosPdi: number[];
  anioMeta: number;
  onSolicitarCambio: (entity: CambioEntityContext) => void;
  email: string;
  esLiderProyecto?: boolean;
  esResponsableProyecto?: boolean;
}) {
  const indicadoresCount = vista.acciones.reduce((acc, item) => acc + item.indicadores.length, 0);
  const accionesConAvance = vista.acciones.map((item) => ({
    ...item.accion,
    avance: item.indicadores.length
      ? getWeightedProgress(item.indicadores, (indicador) => getIndicadorAvancePonderado(indicador))
      : Number(item.accion.avance) || 0,
  }));
  const avanceProyecto = accionesConAvance.length
    ? getWeightedProgress(accionesConAvance, (accion) => Number(accion.avance) || 0)
    : Number(vista.proyecto.avance) || 0;
  const semaforoProyecto = getSemaforoByAvance(avanceProyecto);
  const avanceProyectoBarra = Math.min(Math.max(avanceProyecto, 0), 100);

  return (
    <Paper
      withBorder
      radius="xl"
      p="xl"
      shadow="xs"
      style={{
        background: "linear-gradient(180deg, rgba(124,58,237,0.04) 0%, rgba(255,255,255,0.96) 28%)",
      }}
    >
      <Group justify="space-between" align="flex-start" mb="lg">
        <Group gap="md" align="flex-start">
          <ThemeIcon size={48} radius="xl" color="violet" variant="light">
            <IconListCheck size={24} />
          </ThemeIcon>
          <div>
            <Text size="xs" fw={700} c="dimmed">{vista.proyecto.codigo}</Text>
            <Title order={4} style={{ lineHeight: 1.2 }}>{vista.proyecto.nombre}</Title>
            <Group gap="md" mt={6} wrap="wrap">
              {vista.proyecto.responsable && (
                <Text size="xs" c="dimmed">Responsable: <b>{vista.proyecto.responsable}</b></Text>
              )}
            </Group>
          </div>
        </Group>
        <Group gap="sm" align="center">
          <Badge color={SEMAFORO_COLOR[semaforoProyecto]} variant="light" radius="xl" size="lg">
            {SEMAFORO_LABEL[semaforoProyecto]}
          </Badge>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm" mb="lg">
        {[
          { label: "Avance", value: `${avanceProyecto}%` },
          { label: "Peso", value: `${vista.proyecto.peso}%` },
          { label: "Acciones", value: vista.acciones.length },
          { label: "Indicadores", value: indicadoresCount },
          { label: "Presupuesto", value: vista.proyecto.presupuesto > 0 ? formatCOP(vista.proyecto.presupuesto) : "Pendiente" },
        ].map((item) => (
          <Box
            key={item.label}
            style={{
              textAlign: "center",
              background: "rgba(255,255,255,0.82)",
              border: "1px solid rgba(124,58,237,0.08)",
              borderRadius: 16,
              padding: "12px 8px",
            }}
          >
            <Text fw={800} size="1.2rem" lh={1}>{item.value}</Text>
            <Text size="xs" c="dimmed" mt={4}>{item.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      <Box mb="lg">
        <Group justify="space-between" mb={6}>
          <Text size="xs" c="dimmed">Avance del proyecto</Text>
          <Text size="xs" fw={700}>{avanceProyecto}%</Text>
        </Group>
        <Progress value={avanceProyectoBarra} color={getProgressColor(avanceProyecto)} size="md" radius="xl" />
      </Box>

      {vista.acciones.length === 0 ? (
        <Paper withBorder radius="lg" p="md">
          <Text fw={600}>No hay acciones visibles en este proyecto</Text>
          <Text size="sm" c="dimmed" mt={4}>
            El proyecto esta asociado a tu vista, pero aun no tiene acciones o indicadores asignados para mostrar aqui.
          </Text>
        </Paper>
      ) : (
        <Stack gap="lg">
          {vista.acciones.map((item) => (
            <AccionResponsableCard
              key={item.accion._id}
              accion={item.accion}
              indicadores={item.indicadores}
              cortesVigentes={cortesVigentes}
              aniosPdi={aniosPdi}
              anioMeta={anioMeta}
              onUpdated={onUpdated}
              onSolicitarCambio={onSolicitarCambio}
              email={email}
              esLider={esLiderProyecto}
              esResponsable={esResponsableProyecto}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
}

// ── Panel de avales pendientes (vista del lider) ──────────────────────────
function AvalesPendientesPanel({ liderEmail, onAvalDone }: { liderEmail: string; onAvalDone: () => void }) {
  const [avales, setAvales] = useState<RespuestaFormularioAval[]>([]);
  const [loading, setLoading] = useState(true);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!liderEmail) return;
    setLoading(true);
    axios.get(PDI_ROUTES.formularioRespuestasPendientesAval(), { params: { lider_email: liderEmail } })
      .then((r) => setAvales(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [liderEmail]);

  const handleAval = async (respuesta: RespuestaFormularioAval, estado_aval: "Aprobado" | "Rechazado") => {
    const formId = typeof respuesta.formulario_id === "string"
      ? respuesta.formulario_id
      : (respuesta.formulario_id as any)._id;
    setSavingId(respuesta._id);
    try {
      await axios.put(PDI_ROUTES.formularioAval(formId, respuesta._id), {
        estado_aval,
        aval_por: liderEmail,
        aval_comentario: comentarios[respuesta._id] ?? "",
      });
      setAvales((prev) => prev.filter((a) => a._id !== respuesta._id));
      showNotification({ title: estado_aval, message: `Formulario ${estado_aval.toLowerCase()} correctamente`, color: estado_aval === "Aprobado" ? "teal" : "red" });
      onAvalDone();
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar el aval", color: "red" });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <Center py="md"><Loader size="sm" /></Center>;
  if (avales.length === 0) return null;

  const formularioNombre = (r: RespuestaFormularioAval) =>
    typeof r.formulario_id === "string" ? "Formulario" : (r.formulario_id as any).nombre ?? "Formulario";
  const indicadorNombre = (r: RespuestaFormularioAval) =>
    !r.indicador_id ? "—" : typeof r.indicador_id === "string" ? r.indicador_id : `${(r.indicador_id as any).codigo} · ${(r.indicador_id as any).nombre}`;
  const getCampos = (r: RespuestaFormularioAval): any[] =>
    typeof r.formulario_id === "string" ? [] : (r.formulario_id as any).campos ?? [];

  return (
    <Paper withBorder radius="xl" p="xl" mb="xl"
      style={{ borderLeft: "4px solid #7c3aed", background: "linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(255,255,255,0.98) 100%)" }}>
      <Group gap={10} mb="lg">
        <ThemeIcon size={38} radius="xl" color="violet" variant="light">
          <IconShieldCheck size={20} />
        </ThemeIcon>
        <div>
          <Text fw={800} size="lg">Formularios pendientes de aval</Text>
          <Text size="xs" c="dimmed">Como líder del macroproyecto, debes revisar y avalar estos formularios enviados por responsables.</Text>
        </div>
        <Badge color="violet" variant="filled" radius="xl" ml="auto">{avales.length}</Badge>
      </Group>

      <Stack gap="md">
        {avales.map((r) => {
          const expanded = expandedId === r._id;
          const campos = getCampos(r);
          return (
            <Paper key={r._id} withBorder radius="lg" p="md" style={{ background: "rgba(255,255,255,0.95)" }}>
              <Group justify="space-between" align="flex-start" mb="sm" wrap="nowrap">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={700} size="sm">{formularioNombre(r)}</Text>
                  <Text size="xs" c="dimmed">Indicador: <b>{indicadorNombre(r)}</b></Text>
                  <Text size="xs" c="dimmed">Enviado por: <b>{r.respondido_por}</b> · Corte: <b>{r.corte}</b></Text>
                  {r.fecha_envio && (
                    <Text size="xs" c="dimmed">Fecha envío: {new Date(r.fecha_envio).toLocaleDateString("es-CO")}</Text>
                  )}
                </div>
                <Button
                  size="xs" variant="subtle" color="violet"
                  rightSection={expanded ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
                  onClick={() => setExpandedId(expanded ? null : r._id)}
                >
                  {expanded ? "Ocultar" : "Ver respuestas"}
                </Button>
              </Group>

              {expanded && (
                <Stack gap="sm" mb="md">
                  {r.respuestas.length === 0 ? (
                    <Text size="xs" c="dimmed">Sin respuestas registradas</Text>
                  ) : r.respuestas.map((resp, i) => (
                    <Paper key={i} withBorder radius="md" p="sm" style={{ background: "rgba(248,245,255,0.8)" }}>
                      <Text size="xs" fw={700} mb={4}>{resp.etiqueta}</Text>
                      {resp.tipo === "texto_largo"
                        ? <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{resp.valor_texto || <span style={{ color: "#aaa" }}>Sin respuesta</span>}</Text>
                        : resp.url
                          ? <Button size="xs" variant="light" color="blue" component="a" href={resp.url} target="_blank" leftSection={<IconFileTypePdf size={13} />}>
                              {resp.nombre_original || "Ver archivo"}
                            </Button>
                          : <Text size="xs" c="dimmed">Sin archivo</Text>
                      }
                    </Paper>
                  ))}
                </Stack>
              )}

              <Textarea
                placeholder="Comentario para el responsable (opcional)..."
                value={comentarios[r._id] ?? ""}
                onChange={(e) => setComentarios((prev) => ({ ...prev, [r._id]: e.currentTarget.value }))}
                rows={2}
                radius="md"
                mb="sm"
                size="xs"
              />
              <Group gap="sm" justify="flex-end">
                <Button size="xs" color="red" variant="light" radius="xl"
                  loading={savingId === r._id}
                  leftSection={<IconX size={13} />}
                  onClick={() => handleAval(r, "Rechazado")}>
                  Rechazar
                </Button>
                <Button size="xs" color="teal" radius="xl"
                  loading={savingId === r._id}
                  leftSection={<IconCheck size={13} />}
                  onClick={() => handleAval(r, "Aprobado")}>
                  Aprobar
                </Button>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </Paper>
  );
}

export default function MisIndicadoresPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { config } = usePdiConfig();
  const [proyectosVista, setProyectosVista] = useState<ProyectoResponsableView[]>([]);
  const [loading, setLoading] = useState(true);
  const [cortesVigentes, setCortesVigentes] = useState<CorteVigente[]>([]);
  const [cambioModalAbierto, setCambioModalAbierto] = useState(false);
  const [cambioEntity, setCambioEntity] = useState<CambioEntityContext | null>(null);
  const [macroIdsLiderados, setMacroIdsLiderados] = useState<Set<string>>(new Set());
  const [macroNombresLiderados, setMacroNombresLiderados] = useState<string[]>([]);
  const [userFullName, setUserFullName] = useState("");

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;
    const email = (session.user.email ?? "").toLowerCase().trim();

    Promise.all([
      axios.get(PDI_ROUTES.macroproyectos()),
      axios.get(PDI_ROUTES.indicadores()),
      axios.get(PDI_ROUTES.acciones()),
      axios.get(PDI_ROUTES.proyectos()),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users?email=${encodeURIComponent(email)}`),
      axios.get(PDI_ROUTES.cortesVigentes()),
    ])
      .then(([resMacros, resInd, resAcc, resProy, resUser, resCortes]) => {
        const todosMacros: Array<{ _id: string; codigo: string; nombre: string; lider?: string }> = resMacros.data;
        const todosIndicadores: Indicador[] = resInd.data;
        const todasAcciones: Accion[] = resAcc.data;
        const todosProyectos: Proyecto[] = resProy.data;
        const fullName = (resUser.data?.full_name ?? "").toLowerCase().trim();

        const accionesById = new Map(todasAcciones.map((accion) => [accion._id, accion]));
        const proyectosById = new Map(todosProyectos.map((proyecto) => [proyecto._id, proyecto]));
        const macrosById = new Map(todosMacros.map((macro) => [macro._id, macro]));
        const macroIdsSet = new Set(
          todosMacros
            .filter((macro) => matchesUserResponsable(email, fullName, macro.lider))
            .map((macro) => macro._id)
        );
        const macroNombres = todosMacros
          .filter((macro) => matchesUserResponsable(email, fullName, macro.lider))
          .map((macro) => macro.nombre)
          .filter(Boolean);
        setMacroIdsLiderados(macroIdsSet);
        setMacroNombresLiderados(macroNombres);
        setUserFullName(fullName);

        const indicadoresRelacionados = todosIndicadores
          .filter((indicador) => {
            const accion = accionesById.get(getAccionId(indicador) ?? "");
            const proyecto = accion?.proyecto_id?._id ? proyectosById.get(accion.proyecto_id._id) : undefined;
            const macro = proyecto?.macroproyecto_id?._id ? macrosById.get(proyecto.macroproyecto_id._id) : undefined;

            return (
              matchesUserResponsable(email, fullName, indicador.responsable, indicador.responsable_email) ||
              (accion && matchesUserResponsable(email, fullName, accion.responsable, accion.responsable_email)) ||
              (proyecto && matchesUserResponsable(email, fullName, proyecto.responsable, proyecto.responsable_email)) ||
              (macro && macroIdsSet.has(macro._id))
            );
          })
          .sort(sortByCodigo);

        const accionesRelacionadas = todasAcciones
          .filter((accion) => {
            const proyecto = accion.proyecto_id?._id ? proyectosById.get(accion.proyecto_id._id) : undefined;
            const macro = proyecto?.macroproyecto_id?._id ? macrosById.get(proyecto.macroproyecto_id._id) : undefined;
            const tieneIndicadores = indicadoresRelacionados.some((indicador) => getAccionId(indicador) === accion._id);

            return (
              tieneIndicadores ||
              matchesUserResponsable(email, fullName, accion.responsable, accion.responsable_email) ||
              (proyecto && matchesUserResponsable(email, fullName, proyecto.responsable, proyecto.responsable_email)) ||
              (macro && macroIdsSet.has(macro._id))
            );
          })
          .sort(sortByCodigo);

        const proyectosRelacionados = todosProyectos
          .filter((proyecto) => {
            const tieneAcciones = accionesRelacionadas.some((accion) => accion.proyecto_id?._id === proyecto._id);
            const tieneIndicadores = indicadoresRelacionados.some((indicador) => {
              const accion = accionesById.get(getAccionId(indicador) ?? "");
              return accion?.proyecto_id?._id === proyecto._id;
            });

            return (
              tieneAcciones ||
              tieneIndicadores ||
              matchesUserResponsable(email, fullName, proyecto.responsable, proyecto.responsable_email) ||
              macroIdsSet.has(proyecto.macroproyecto_id?._id)
            );
          })
          .sort(sortByCodigo);

        const vista: ProyectoResponsableView[] = proyectosRelacionados.map((proyecto) => ({
          proyecto,
          acciones: accionesRelacionadas
            .filter((accion) => accion.proyecto_id?._id === proyecto._id)
            .map((accion) => ({
              accion,
              indicadores: indicadoresRelacionados
                .filter((indicador) => getAccionId(indicador) === accion._id)
                .sort(sortByCodigo),
            })),
        }));

        setProyectosVista(vista);
        setCortesVigentes(resCortes.data);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [status, session]);

  const indicadores = proyectosVista.flatMap((proyecto) => proyecto.acciones.flatMap((accion) => accion.indicadores));
  const acciones = proyectosVista.flatMap((proyecto) => proyecto.acciones.map((accion) => accion.accion));
  const alertas = indicadores.filter((indicador) => indicador.semaforo === "rojo" || indicador.semaforo === "amarillo").length;
  const requesterName =
    (session?.user as { full_name?: string } | undefined)?.full_name ||
    session?.user?.name ||
    session?.user?.email ||
    "Responsable PDI";
  const requesterEmail = session?.user?.email ?? "";

  const isLider = macroIdsLiderados.size > 0;
  const macroLiderLabel = macroNombresLiderados.length === 1
    ? macroNombresLiderados[0]
    : macroNombresLiderados.length > 1
    ? `${macroNombresLiderados[0]} y ${macroNombresLiderados.length - 1} mas`
    : "Macroproyecto";
  const isDirectlyResponsable = proyectosVista.some(v =>
    matchesUserResponsable(requesterEmail, userFullName, v.proyecto.responsable, v.proyecto.responsable_email)
  );

  const pageTitle = isLider && !isDirectlyResponsable
    ? "Mi Macroproyecto PDI"
    : isLider
    ? "Mi PDI"
    : "Mis Proyectos PDI";

  const statCards = isLider
    ? [
        { label: "Macroproyectos que lidero", value: macroIdsLiderados.size, color: "violet", icon: <IconListCheck size={22} /> },
        { label: "Proyectos a cargo", value: proyectosVista.length, color: "blue", icon: <IconTrendingUp size={22} /> },
        { label: "Indicadores para evaluar", value: indicadores.length, color: "green", icon: <IconTarget size={22} /> },
        { label: "Requieren atención", value: alertas, color: "red", icon: <IconFlag size={22} /> },
      ]
    : [
        { label: "Mis proyectos", value: proyectosVista.length, color: "violet", icon: <IconListCheck size={22} /> },
        { label: "Mis acciones", value: acciones.length, color: "blue", icon: <IconTrendingUp size={22} /> },
        { label: "Mis indicadores", value: indicadores.length, color: "green", icon: <IconTarget size={22} /> },
        { label: "Requieren atención", value: alertas, color: "red", icon: <IconFlag size={22} /> },
      ];

  const handleIndicadorUpdated = (updated: Indicador) => {
    setProyectosVista((prev) =>
      prev.map((proyectoVista) => ({
        ...proyectoVista,
        acciones: proyectoVista.acciones.map((accionVista) => ({
          ...accionVista,
          indicadores: accionVista.indicadores.map((indicador) => indicador._id === updated._id ? updated : indicador),
        })),
      }))
    );
  };

  const unifiedStatCards = [
    { label: "Proyectos a cargo", value: proyectosVista.length, color: "violet", icon: <IconListCheck size={22} /> },
    { label: "Acciones", value: acciones.length, color: "blue", icon: <IconTrendingUp size={22} /> },
    { label: "Indicadores", value: indicadores.length, color: "green", icon: <IconTarget size={22} /> },
    { label: "Requieren atención", value: alertas, color: "red", icon: <IconFlag size={22} /> },
  ];

  const handleSolicitarCambio = (entity: CambioEntityContext) => {
    setCambioEntity(entity);
    setCambioModalAbierto(true);
  };

  return (
    <Container size="xl" py="xl">
      <Group mb="lg" justify="space-between">
        <Group gap={10}>
          <ActionIcon variant="subtle" onClick={() => router.push("/reports")}>
            <IconArrowLeft size={18} />
          </ActionIcon>
          <ThemeIcon size={40} radius="xl" color="violet" variant="light">
            <IconTarget size={22} />
          </ThemeIcon>
          <div>
            <Title order={3}>{pageTitle}</Title>
            <Text size="xs" c="dimmed">{config.nombre} - {formatAnioRange(config.anio_inicio, config.anio_fin)}</Text>
          </div>
        </Group>
      </Group>

      <Divider mb="lg" />

      {isLider && (
        <Paper
          withBorder
          radius="xl"
          p="md"
          mb="lg"
          style={{
            background: "rgba(20,184,166,0.06)",
            borderColor: "rgba(13,148,136,0.28)",
          }}
        >
          <Group gap="sm" wrap="wrap">
            <ThemeIcon size={38} radius="xl" color="teal" variant="light">
              <IconShieldCheck size={20} />
            </ThemeIcon>
            <div>
              <Text fw={800} c="teal.7">
                {macroLiderLabel} · Lider del macroproyecto
              </Text>
             
            </div>
          </Group>
        </Paper>
      )}

      {requesterEmail && (
        <AvalesPendientesPanel
          liderEmail={requesterEmail}
          onAvalDone={() => {}}
        />
      )}

      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="xl">
        {unifiedStatCards.map((s) => (
          <Paper key={s.label} withBorder radius="lg" p="lg" shadow="xs">
            <Group justify="space-between" align="flex-start" mb="sm">
              <ThemeIcon size={48} radius="xl" color={s.color} variant="light">
                {s.icon}
              </ThemeIcon>
              <Badge color={s.color} variant="light" size="sm" radius="xl">PDI</Badge>
            </Group>
            <Text size="xs" c="dimmed" mb={2}>{s.label}</Text>
            <Text size="1.8rem" fw={800} lh={1}>{s.value}</Text>
          </Paper>
        ))}
      </SimpleGrid>

      {loading ? (
        <Center py="xl"><Loader /></Center>
      ) : proyectosVista.length === 0 ? (
        <Center py="xl">
          <Stack align="center" gap="xs">
            <ThemeIcon size={56} radius="xl" color="violet" variant="light">
              <IconTarget size={28} />
            </ThemeIcon>
            <Text fw={600}>No tienes proyectos PDI asociados</Text>
            <Text size="sm" c="dimmed">
              El administrador debe asignarte a un proyecto, acción o indicador para verlo en esta vista.
            </Text>
          </Stack>
        </Center>
      ) : (
        <>
          <Group justify="space-between" mb="md">
            <div>
              <Text fw={700} size="xl">
                {isLider && !isDirectlyResponsable
                  ? "Proyectos y acciones de tu macroproyecto"
                  : isLider
                  ? "Tus proyectos, acciones e indicadores"
                  : "Tus proyectos, acciones e indicadores"}
              </Text>
              <Text size="sm" c="dimmed">
                {isLider && isDirectlyResponsable
                  ? "Tienes un rol mixto: reportas como responsable y también puedes revisar avales como líder del macroproyecto."
                  : isLider
                  ? "Como líder puedes revisar los reportes enviados por los responsables y avalarlos."
                  : "Vista jerárquica para gestionar y reportar el avance del PDI."}
              </Text>
            </div>
            <Badge variant="outline" color="violet" radius="xl">
              {proyectosVista.length} proyecto{proyectosVista.length === 1 ? "" : "s"}
            </Badge>
          </Group>
          <Stack gap="lg">
            {proyectosVista.map((vista) => {
              const esResponsableProyecto = matchesUserResponsable(
                requesterEmail,
                userFullName,
                vista.proyecto.responsable,
                vista.proyecto.responsable_email
              );
              const esLiderProyecto = macroIdsLiderados.has(vista.proyecto.macroproyecto_id?._id);
              return (
                <ProyectoResponsableCard
                  key={vista.proyecto._id}
                  vista={vista}
                  cortesVigentes={cortesVigentes}
                  aniosPdi={config.anios}
                  anioMeta={config.anio_fin}
                  onUpdated={handleIndicadorUpdated}
                  onSolicitarCambio={handleSolicitarCambio}
                  email={requesterEmail}
                  esLiderProyecto={esLiderProyecto}
                  esResponsableProyecto={esResponsableProyecto}
                />
              );
            })}
          </Stack>
        </>
      )}

      <SolicitudCambioModal
        opened={cambioModalAbierto}
        onClose={() => setCambioModalAbierto(false)}
        entity={cambioEntity}
        requesterName={requesterName}
        requesterEmail={requesterEmail}
      />
    </Container>
  );
}
