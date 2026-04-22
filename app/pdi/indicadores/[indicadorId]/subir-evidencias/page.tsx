"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Button, Center, Container, Divider,
  FileButton, Group, Loader, Paper, Progress, Stack,
  Text, Textarea, TextInput, ThemeIcon, Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowLeft, IconCheck, IconExternalLink,
  IconForms, IconLock, IconTarget, IconTrash, IconUpload,
} from "@tabler/icons-react";
import axios from "axios";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PDI_ROUTES } from "@/app/pdi/api";
import type { Indicador, Periodo } from "@/app/pdi/types";
import PdiSidebar from "@/app/pdi/components/PdiSidebar";
import { usePdiConfig } from "@/app/pdi/hooks/usePdiConfig";

// ── Tipos locales ────────────────────────────────────────────────────────────

interface CorteVigente { _id: string; nombre: string; }

interface CampoFormulario {
  _id: string;
  etiqueta: string;
  tipo: "texto_largo" | "archivo_pdf";
  descripcion?: string;
  requerido?: boolean;
}

interface FormularioPDI {
  _id: string;
  nombre: string;
  descripcion?: string;
  alcance: string;
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
  word_filename?: string;
  word_url?: string;
  estado_aval?: "Pendiente" | "Aprobado" | "Rechazado" | null;
  lider_email_aval?: string;
  aval_por?: string;
  aval_comentario?: string;
  aval_fecha?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SEMAFORO_COLORS: Record<string, string> = {
  verde: "#40c057", amarillo: "#fab005", rojo: "#fa5252",
};

function esPeriodoEditable(periodo: string, cortes: CorteVigente[]) {
  if (!cortes.length) return true;
  return cortes.some(c => c.nombre === periodo);
}

function parseAvance(val: string): number | null {
  if (val === "") return null;
  const n = Number(val.replace("%", "").replace(",", ".").trim());
  return isNaN(n) ? null : n;
}

function getAvanceMostrado(ind: Indicador): number {
  return ind.avance_total_real ?? ind.avance ?? 0;
}

function formatFechaCorta(fecha?: string | null) {
  if (!fecha) return "";
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-CO");
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function SubirEvidenciasPage() {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const indicadorId = params?.indicadorId as string;
  const { data: session, status } = useSession();
  const { config } = usePdiConfig();
  const vieneDeMisIndicadores = pathname.startsWith("/pdi/mis-indicadores/");
  const esLiderDesdeListado = searchParams.get("esLider") === "1";

  // Indicador y cortes
  const [indicador, setIndicador] = useState<Indicador | null>(null);
  const [loadingInd, setLoadingInd] = useState(true);
  const [cortesVigentes, setCortesVigentes] = useState<CorteVigente[]>([]);

  // Avances
  const [avancesStr, setAvancesStr] = useState<Record<string, string>>({});

  // Formularios
  const [formularios, setFormularios] = useState<FormularioPDI[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, RespuestaFormulario | null>>({});
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [loadingForms, setLoadingForms] = useState(true);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [esLiderDelIndicador, setEsLiderDelIndicador] = useState(false);

  const email = (session?.user?.email ?? "").toLowerCase().trim();
  const corteActivo = cortesVigentes[0]?.nombre ?? "";

  // ── Calcular si ya está todo enviado ──────────────────────────────────────
  const todosEnviados =
    formularios.length > 0 &&
    formularios.every(f => respuestas[f._id]?.estado === "Enviado");
  const tieneFormulariosRechazados = formularios.some(
    f => respuestas[f._id]?.estado_aval === "Rechazado"
  );
  const todosLosEnviadosAprobados =
    formularios.length > 0 &&
    formularios.every((f) => {
      const resp = respuestas[f._id];
      return resp?.estado === "Enviado" && resp?.estado_aval === "Aprobado";
    });

  // ── Carga indicador ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!indicadorId) return;
    axios.get(PDI_ROUTES.indicador(indicadorId))
      .then(r => {
        setIndicador(r.data);
        const strs: Record<string, string> = {};
        (r.data.periodos ?? []).forEach((p: Periodo) => {
          strs[p.periodo] = p.avance != null ? String(p.avance) : "";
        });
        setAvancesStr(strs);
      })
      .catch(() => {})
      .finally(() => setLoadingInd(false));
    axios.get(PDI_ROUTES.cortesVigentes())
      .then(r => setCortesVigentes(r.data))
      .catch(() => {});
  }, [indicadorId]);

  useEffect(() => {
    if (!indicadorId || !email) return;
    axios.get(PDI_ROUTES.formularioLiderEmailIndicador(), { params: { indicador_id: indicadorId } })
      .then((r) => {
        const liderEmail = (r.data?.lider_email ?? "").toLowerCase().trim();
        setEsLiderDelIndicador(Boolean(liderEmail) && liderEmail === email);
      })
      .catch(() => setEsLiderDelIndicador(false));
  }, [indicadorId, email]);

  // ── Carga formularios ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!indicadorId || !email || !corteActivo) return;
    setLoadingForms(true);
    axios.get(PDI_ROUTES.formularios(), { params: { indicador_id: indicadorId } })
      .then(async r => {
        const forms: FormularioPDI[] = r.data.filter((f: any) => f.activo);
        setFormularios(forms);
        await recargarRespuestas(forms);
      })
      .catch(() => {})
      .finally(() => setLoadingForms(false));
  }, [indicadorId, email, corteActivo]);

  // ── Helpers formulario ────────────────────────────────────────────────────
  const getTexto = (formId: string, campoId: string) => textos[`${formId}-${campoId}`] ?? "";
  const setTexto = (formId: string, campoId: string, val: string) =>
    setTextos(prev => ({ ...prev, [`${formId}-${campoId}`]: val }));
  const getRespuestaCampo = (formId: string, campoId: string): RespuestaCampo | undefined =>
    respuestas[formId]?.respuestas.find(r => r.campo_id === campoId);
  const recargarRespuestas = async (formsOverride?: FormularioPDI[]) => {
    const formsToLoad = formsOverride ?? formularios;
    if (!indicadorId || !email || !corteActivo || formsToLoad.length === 0) return;
    const respMap: Record<string, RespuestaFormulario | null> = {};
    const textMap: Record<string, string> = {};

    await Promise.all(formsToLoad.map(async (f) => {
      try {
        const res = await axios.get(PDI_ROUTES.formularioRespuestas(f._id), {
          params: { respondido_por: email, corte: corteActivo, indicador_id: indicadorId },
        });
        const resp: RespuestaFormulario | null = res.data[0] ?? null;
        respMap[f._id] = resp;
        if (resp) {
          resp.respuestas.forEach((r) => {
            if (r.tipo === "texto_largo") textMap[`${f._id}-${r.campo_id}`] = r.valor_texto;
          });
        }
      } catch {
        respMap[f._id] = null;
      }
    }));

    setRespuestas(respMap);
    setTextos(textMap);
  };

  // ── Guardar avances ───────────────────────────────────────────────────────
  const guardarAvances = async () => {
    if (!indicador) return;
    const periodosPayload = (indicador.periodos ?? []).map((p: Periodo) => {
      const val = parseAvance(avancesStr[p.periodo] ?? "");
      return {
        periodo: p.periodo, meta: p.meta,
        presupuesto_ejecutado: p.presupuesto_ejecutado ?? 0,
        avance: val === 0 && !esPeriodoEditable(p.periodo, cortesVigentes) ? null : val,
        resultados_alcanzados: p.resultados_alcanzados ?? "",
        logros: p.logros ?? "", alertas: p.alertas ?? "",
        justificacion_retrasos: p.justificacion_retrasos ?? "",
        estado_reporte: p.estado_reporte ?? "Borrador",
        fecha_envio: p.fecha_envio ?? null,
        reportado_por: p.reportado_por ?? "",
      };
    });
    const res = await axios.put(PDI_ROUTES.indicador(indicador._id), {
      periodos: periodosPayload,
      accion_id: typeof indicador.accion_id === "string"
        ? indicador.accion_id : (indicador.accion_id as any)._id,
    });
    setIndicador(res.data);
  };

  // ── Guardar respuesta formulario ──────────────────────────────────────────
  const guardarFormulario = async (form: FormularioPDI, enviar: boolean) => {
    const respuestasPayload = form.campos.map(c => ({
      campo_id: c._id, etiqueta: c.etiqueta, tipo: c.tipo,
      valor_texto: c.tipo === "texto_largo" ? getTexto(form._id, c._id) : "",
      nombre_original: getRespuestaCampo(form._id, c._id)?.nombre_original ?? "",
      filename: getRespuestaCampo(form._id, c._id)?.filename ?? "",
      url: getRespuestaCampo(form._id, c._id)?.url ?? "",
    }));
    const res = await axios.post(PDI_ROUTES.formularioRespuestas(form._id), {
      respondido_por: email, corte: corteActivo,
      indicador_id: indicadorId,
      respuestas: respuestasPayload,
      estado: enviar ? "Enviado" : "Borrador",
    });
    setRespuestas(prev => ({ ...prev, [form._id]: res.data }));
    return res.data;
  };

  // ── Subir PDF ─────────────────────────────────────────────────────────────
  const handleUploadPDF = async (form: FormularioPDI, campo: CampoFormulario, file: File | null) => {
    if (!file) return;
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
      setRespuestas(prev => {
        const r = prev[form._id];
        if (!r) return prev;
        const idx = r.respuestas.findIndex(rr => rr.campo_id === campo._id);
        const updated = [...r.respuestas];
        if (idx >= 0) updated[idx] = { ...updated[idx], ...res.data };
        else updated.push({ campo_id: campo._id, etiqueta: campo.etiqueta, tipo: campo.tipo, valor_texto: "", ...res.data });
        return { ...prev, [form._id]: { ...r, respuestas: updated } };
      });
      showNotification({ title: "Subido", message: "PDF subido correctamente", color: "teal" });
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

  // ── Acción: guardar borrador (solo avances) ───────────────────────────────
  const handleGuardarBorrador = async () => {
    setSavingDraft(true);
    try {
      await guardarAvances();
      await Promise.all(formularios.map(f => guardarFormulario(f, false)));
      showNotification({ title: "Borrador guardado", message: "Puedes continuar más tarde", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar", color: "red" });
    } finally {
      setSavingDraft(false);
    }
  };

  // ── Acción: guardar avances + enviar formulario ───────────────────────────
  const handleEnviarTodo = async () => {
    setSending(true);
    try {
      await guardarAvances();
      await Promise.all(formularios.map(f => guardarFormulario(f, true)));
      await recargarRespuestas();
      showNotification({
        title: "Enviado",
        message: "Avances y formulario enviados correctamente. El reporte quedó en revisión del líder.",
        color: "teal",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo enviar", color: "red" });
    } finally {
      setSending(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (status === "loading" || loadingInd) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {!vieneDeMisIndicadores && <PdiSidebar />}
        <Center style={{ flex: 1 }}><Loader /></Center>
      </div>
    );
  }

  if (!indicador) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {!vieneDeMisIndicadores && <PdiSidebar />}
        <Center style={{ flex: 1 }}><Text c="dimmed">No se encontró el indicador</Text></Center>
      </div>
    );
  }

  const avanceActual = getAvanceMostrado(indicador);
  const semColor = SEMAFORO_COLORS[indicador.semaforo] ?? "#aaa";
  const hayPeriodosEditables = indicador.periodos.some((p: Periodo) =>
    esPeriodoEditable(p.periodo, cortesVigentes)
  );
  const bloqueado = todosEnviados && !tieneFormulariosRechazados;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!vieneDeMisIndicadores && <PdiSidebar />}
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="md" py="xl">

          {/* Header */}
          <Group gap={10} mb="lg">
            <ActionIcon variant="subtle" onClick={() => router.back()}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <ThemeIcon size={42} radius="xl" color="violet" variant="light">
              <IconTarget size={20} />
            </ThemeIcon>
            <div>
              <Title order={3}>Avances y evidencias</Title>
              <Text size="sm" c="dimmed">{config.nombre}</Text>
            </div>
          </Group>

          <Stack gap="lg">

            {/* Ficha indicador */}
            <Paper withBorder radius="xl" p="lg" shadow="sm">
              <Group gap={10} mb="sm">
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: semColor, flexShrink: 0, marginTop: 4,
                }} />
                <div>
                  <Text size="xs" fw={700} c="dimmed">{indicador.codigo}</Text>
                  <Text fw={700} size="md">{indicador.nombre}</Text>
                </div>
              </Group>
              <div style={{
                display: "flex", gap: 0, borderRadius: 12,
                overflow: "hidden", border: "1px solid #ede9fe", background: "#faf8ff",
              }}>
                {[
                  { label: `Meta ${config.anio_fin}`, value: String(indicador.meta_final_2029 ?? "—") },
                  { label: "Seguimiento", value: indicador.tipo_seguimiento || "Semestral" },
                  { label: "Cálculo", value: (indicador.tipo_calculo ?? "—").replace(/_/g, " ") },
                  { label: "Avance actual", value: `${avanceActual}%` },
                ].map((s, i, arr) => (
                  <div key={s.label} style={{
                    flex: 1, padding: "10px 14px",
                    borderRight: i < arr.length - 1 ? "1px solid #ede9fe" : "none",
                  }}>
                    <Text size="xs" fw={600} c="violet.6">{s.label}</Text>
                    <Text size="md" fw={600} c="dimmed" mt={2} style={{ textTransform: "capitalize" }}>{s.value}</Text>
                  </div>
                ))}
              </div>
            </Paper>

            {/* Banner enviado */}
            {(bloqueado || tieneFormulariosRechazados) && (
              <Paper withBorder radius="xl" p="md"
                style={{
                  background: tieneFormulariosRechazados ? "rgba(239,68,68,0.06)" : "rgba(13,148,136,0.06)",
                  borderColor: tieneFormulariosRechazados ? "#ef4444" : "#0d9488",
                  borderLeft: `4px solid ${tieneFormulariosRechazados ? "#ef4444" : "#0d9488"}`,
                }}>
                <Group gap={8}>
                  <IconLock size={18} color={tieneFormulariosRechazados ? "#ef4444" : "#0d9488"} />
                  <Text fw={700} c={tieneFormulariosRechazados ? "red" : "teal"}>
                    {tieneFormulariosRechazados
                      ? "Reporte rechazado. Revisa las observaciones del líder, ajusta el formulario y vuelve a enviarlo."
                      : todosLosEnviadosAprobados
                        ? "Reporte aprobado."
                        : "Reporte enviado. El líder del macroproyecto revisará y avalará tu evidencia."}
                  </Text>
                </Group>
              </Paper>
            )}

            {/* Avance por periodo */}
            <div>
              <Title order={5} mb="sm">Avance por periodo</Title>
              {indicador.periodos.length === 0 ? (
                <Paper withBorder radius="lg" p="md">
                  <Text size="sm" c="dimmed" ta="center">Sin periodos registrados</Text>
                </Paper>
              ) : (
                <Stack gap="sm">
                  {indicador.periodos.map((p: Periodo) => {
                    const editable = esPeriodoEditable(p.periodo, cortesVigentes) && !bloqueado;
                    const metaNumerica = p.meta != null ? parseAvance(String(p.meta)) : null;
                    const avanceNumerico = parseAvance(avancesStr[p.periodo] ?? "");
                    const porcentaje = metaNumerica && metaNumerica > 0 && avanceNumerico != null
                      ? Math.min((avanceNumerico / metaNumerica) * 100, 100)
                      : null;
                    return (
                      <Paper key={p.periodo} withBorder radius="xl" p="md" style={{
                        borderLeft: `4px solid ${editable ? "#7c3aed" : "#cbd5e1"}`,
                        background: editable ? "#fff" : "rgba(248,250,252,0.96)",
                      }}>
                        <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                          <div>
                            <Group gap={8}>
                              <Text size="lg" fw={800}>{p.periodo}</Text>
                              <Badge size="sm" radius="xl" color={editable ? "violet" : "gray"} variant="light">
                                {bloqueado ? "Bloqueado" : editable ? "Abierto" : "Cerrado"}
                              </Badge>
                            </Group>
                            <Text size="sm" c="dimmed" mt={4}>Meta definida: <b>{p.meta ?? "—"}</b></Text>
                          </div>
                          <TextInput
                            label="Avance reportado"
                            placeholder={editable ? "Ej: 1" : ""}
                            value={avancesStr[p.periodo] ?? ""}
                            onChange={(e) => {
                              const nextValue = e?.currentTarget?.value ?? "";
                              if (!editable || bloqueado) return;
                              if (/[^0-9.,%\s]/.test(nextValue)) return;
                              setAvancesStr((prev) => ({ ...prev, [p.periodo]: nextValue }));
                            }}
                            style={{ width: 150 }}
                            size="sm"
                            disabled={!editable || bloqueado}
                          />
                        </Group>
                        {porcentaje != null && (
                          <>
                            <Group justify="space-between" mb={4}>
                              <Text size="xs" c="dimmed">Progreso del periodo</Text>
                              <Text size="xs" fw={700}>{Math.round(porcentaje)}%</Text>
                            </Group>
                            <Progress value={porcentaje} color={editable ? "violet" : "gray"} size="sm" radius="xl" />
                          </>
                        )}
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </div>

            <Divider />

            {/* Formulario de evidencias */}
            <div>
              <Group gap={8} mb="md">
                <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                  <IconForms size={16} />
                </ThemeIcon>
                <div>
                  <Title order={5}>Formulario de evidencias</Title>
                  <Text size="xs" c="dimmed">
                    {corteActivo ? `Corte activo: ${corteActivo}` : "Completa las evidencias del indicador"}
                  </Text>
                </div>
              </Group>

              {loadingForms ? (
                <Center py="md"><Loader size="sm" /></Center>
              ) : formularios.length === 0 ? (
                <Paper withBorder radius="xl" p="xl">
                  <Center>
                    <Stack align="center" gap="xs">
                      <ThemeIcon size={48} radius="xl" color="gray" variant="light">
                        <IconForms size={24} />
                      </ThemeIcon>
                      <Text fw={600} c="dimmed">Sin formularios asignados</Text>
                    </Stack>
                  </Center>
                </Paper>
              ) : (
                <Stack gap="lg">
                  {formularios.map(form => {
                    const resp = respuestas[form._id];
                    const enviado = resp?.estado === "Enviado";
                    const estadoAval = resp?.estado_aval ?? (enviado ? "Pendiente" : null);
                    const fechaAval = formatFechaCorta(resp?.aval_fecha);
                    const fechaEnvio = formatFechaCorta(resp?.fecha_envio);
                    const avalLabel =
                      estadoAval === "Aprobado"
                        ? "Aprobado"
                        : estadoAval === "Rechazado"
                          ? "Rechazado"
                          : estadoAval === "Pendiente"
                            ? "En revisión"
                            : null;
                    return (
                      <Paper key={form._id} withBorder radius="xl" p="lg"
                        style={{
                          borderLeft: `4px solid ${
                            estadoAval === "Rechazado"
                              ? "#ef4444"
                              : estadoAval === "Aprobado"
                                ? "#16a34a"
                                : enviado
                                  ? "#0d9488"
                                  : "#7c3aed"
                          }`,
                        }}>
                        <Group justify="space-between" mb="md">
                          <Text fw={700} size="md">{form.nombre}</Text>
                          <Group gap={8}>
                            <Badge color={enviado ? "teal" : resp ? "yellow" : "gray"} variant="light">
                              {enviado ? "Enviado" : resp ? "Borrador" : "Sin responder"}
                            </Badge>
                            {avalLabel && (
                              <Badge
                                color={
                                  estadoAval === "Aprobado"
                                    ? "green"
                                    : estadoAval === "Rechazado"
                                      ? "red"
                                      : "yellow"
                                }
                                variant="light"
                              >
                                {avalLabel}
                              </Badge>
                            )}
                          </Group>
                        </Group>
                        {resp?.estado === "Enviado" && (
                          <Paper
                            withBorder
                            radius="md"
                            p="sm"
                            mb="md"
                            style={{
                              background:
                                estadoAval === "Rechazado"
                                  ? "rgba(254,242,242,0.95)"
                                  : estadoAval === "Aprobado"
                                    ? "rgba(240,253,244,0.95)"
                                    : "rgba(255,251,235,0.95)",
                              borderColor:
                                estadoAval === "Rechazado"
                                  ? "#fecaca"
                                  : estadoAval === "Aprobado"
                                    ? "#bbf7d0"
                                    : "#fde68a",
                            }}
                          >
                            <Stack gap={6}>
                              <Text size="sm" fw={700}>
                                {estadoAval === "Aprobado"
                                  ? "Evaluación del líder: Aprobado"
                                  : estadoAval === "Rechazado"
                                    ? "Evaluación del líder: Rechazado"
                                    : "Evaluación del líder: En revisión"}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {fechaEnvio ? `Enviado el ${fechaEnvio}. ` : ""}
                                {resp?.aval_por ? `Evaluado por ${resp.aval_por}` : resp?.lider_email_aval ? `Líder asignado: ${resp.lider_email_aval}` : ""}
                                {fechaAval ? ` · ${fechaAval}` : ""}
                              </Text>
                              {resp?.aval_comentario && (
                                <Text size="sm">{resp.aval_comentario}</Text>
                              )}
                              {estadoAval === "Rechazado" && (
                                <Text size="sm" c="red" fw={600}>
                                  El líder rechazó este envío. Puedes corregir el formulario y volver a reportar.
                                </Text>
                              )}
                              {estadoAval === "Aprobado" && resp.word_url && (
                                <Button
                                  size="xs"
                                  variant="light"
                                  color="blue"
                                  component="a"
                                  href={resp.word_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ alignSelf: "flex-start" }}
                                >
                                  Descargar Word aprobado
                                </Button>
                              )}
                            </Stack>
                          </Paper>
                        )}
                        <Stack gap="sm">
                          {form.campos.map(campo => {
                            const archivoCampo = getRespuestaCampo(form._id, campo._id);
                            return (
                              <Paper key={campo._id} withBorder radius="md" p="md"
                                style={{ background: bloqueado ? "rgba(248,250,252,0.8)" : "#fff" }}>
                                <Group gap={6} mb={6}>
                                  <Text size="sm" fw={700}>{campo.etiqueta}</Text>
                                  {campo.requerido && <Badge size="xs" color="red" variant="dot">Requerido</Badge>}
                                </Group>
                                {campo.descripcion && (
                                  <Text size="xs" c="dimmed" mb={8}>{campo.descripcion}</Text>
                                )}
                                {campo.tipo === "texto_largo" ? (
                                  <Textarea
                                    placeholder={bloqueado ? "" : "Escribe aquí..."}
                                    value={getTexto(form._id, campo._id)}
                                    onChange={e => !bloqueado && setTexto(form._id, campo._id, e.currentTarget.value)}
                                    rows={4}
                                    disabled={bloqueado}
                                    autosize
                                    minRows={3}
                                  />
                                ) : (
                                  <Group gap={8}>
                                    {archivoCampo?.url ? (
                                      <Group gap={6}>
                                        <Button size="sm" variant="light" color="blue"
                                          leftSection={<IconExternalLink size={14} />}
                                          component="a" href={archivoCampo.url} target="_blank">
                                          {archivoCampo.nombre_original || "Ver PDF"}
                                        </Button>
                                        {!bloqueado && (
                                          <ActionIcon size="md" variant="subtle" color="red"
                                            onClick={() => handleDeletePDF(form, campo)}>
                                            <IconTrash size={15} />
                                          </ActionIcon>
                                        )}
                                      </Group>
                                    ) : !bloqueado ? (
                                      <FileButton onChange={file => handleUploadPDF(form, campo, file)} accept="application/pdf">
                                        {props => (
                                          <Button size="sm" variant="light" color="teal"
                                            leftSection={<IconUpload size={14} />}
                                            loading={uploading[`${form._id}-${campo._id}`]}
                                            {...props}>
                                            Subir PDF
                                          </Button>
                                        )}
                                      </FileButton>
                                    ) : (
                                      <Text size="sm" c="dimmed">Sin archivo adjunto</Text>
                                    )}
                                  </Group>
                                )}
                              </Paper>
                            );
                          })}
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              )}
            </div>

            {/* Botones únicos al final */}
            {!bloqueado && formularios.length > 0 && (
              <Paper withBorder radius="xl" p="lg"
                style={{ background: "rgba(124,58,237,0.03)", borderColor: "#ede9fe" }}>
                <Text size="sm" c="dimmed" mb="md" ta="center">
                  {tieneFormulariosRechazados
                    ? "Tu envío fue rechazado. Corrige la información, actualiza los avances y vuelve a enviarlo para una nueva revisión."
                    : "Guarda un borrador para continuar después, o envía el reporte cuando todo esté listo."}
                  <b>
                    {tieneFormulariosRechazados
                      ? " Cuando vuelvas a enviarlo, el líder del macroproyecto recibirá nuevamente tu reporte."
                      : " Una vez enviado, el líder del macroproyecto recibirá tu reporte para revisión."}
                  </b>
                </Text>
                <Group justify="center" gap="md">
                  <Button
                    variant="default"
                    radius="xl"
                    loading={savingDraft}
                    disabled={sending || !hayPeriodosEditables}
                    onClick={handleGuardarBorrador}
                  >
                    Guardar borrador
                  </Button>
                  <Button
                    color="violet"
                    radius="xl"
                    size="md"
                    loading={sending}
                    disabled={savingDraft || !hayPeriodosEditables}
                    leftSection={<IconCheck size={16} />}
                    onClick={handleEnviarTodo}
                  >
                    Enviar
                  </Button>
                </Group>
              </Paper>
            )}

          </Stack>
        </Container>
      </div>
    </div>
  );
}
