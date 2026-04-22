"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Box, Button, Center, Container, Group,
  Loader, Paper, Progress, Select, SimpleGrid, Stack, Text, ThemeIcon, Title, Divider, Textarea,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowLeft, IconFileTypePdf, IconTarget, IconEdit,
  IconAlertTriangle, IconCheckbox, IconClockHour4, IconForms, IconShieldCheck, IconShieldX,
} from "@tabler/icons-react";
import axios from "axios";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";
import type { Indicador, Periodo, EstadoReporte, RespuestaFormulario } from "../../types";
import { PDI_ROUTES } from "../../api";
import PdiSidebar from "../../components/PdiSidebar";
import EvidenciasPanel from "../../components/EvidenciasPanel";
import ReporteAvanceModal from "../../components/ReporteAvanceModal";
import { usePdiConfig } from "../../hooks/usePdiConfig";

const ESTADO_COLORS: Record<EstadoReporte, string> = {
  Borrador:  "gray",
  Enviado:   "blue",
  Aprobado:  "teal",
  Rechazado: "red",
};

const SEMAFORO_COLORS: Record<string, string> = {
  verde:    "#40c057",
  amarillo: "#fab005",
  rojo:     "#fa5252",
};
const isAdmin = (role: string) => role === "Administrador";

function getIndicadorAvanceMostrado(indicador: Indicador) {
  const metaFinal = indicador.meta_final_2029 != null ? Number(indicador.meta_final_2029) : null;
  const avanceActual = indicador.avance != null ? Number(indicador.avance) : null;

  if (indicador.tipo_calculo === "ultimo_valor" && metaFinal && avanceActual != null) {
    return Math.round((avanceActual / metaFinal) * 100 * 100) / 100;
  }

  return indicador.avance_total_real ?? indicador.avance;
}

const formatCOP = (value?: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value ?? 0);

function normalizePeriodo(value?: string | null) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function getPeriodoPreferido(periodos: Periodo[], preferredPeriodo?: string | null) {
  const preferred = normalizePeriodo(preferredPeriodo);
  if (!preferred) return null;
  return periodos.find((p) => normalizePeriodo(p.periodo) === preferred) ?? null;
}

function getPeriodosReportados(periodos: Periodo[]) {
  return periodos.filter((p) =>
    p.estado_reporte !== "Borrador" ||
    Boolean(p.fecha_envio) ||
    Boolean(String(p.reportado_por ?? "").trim()) ||
    p.avance != null
  );
}

function resolvePeriodoForRespuesta(periodos: Periodo[], respuesta: RespuestaFormulario, preferredPeriodo?: string | null) {
  const corteNormalizado = normalizePeriodo(respuesta.corte);
  const matchExacto = periodos.find((p) => normalizePeriodo(p.periodo) === corteNormalizado);
  if (matchExacto) return matchExacto;

  const preferido = getPeriodoPreferido(periodos, preferredPeriodo);
  if (preferido && (!corteNormalizado || normalizePeriodo(preferido.periodo) === corteNormalizado)) {
    return preferido;
  }

  const email = respuesta.respondido_por?.toLowerCase().trim();
  const fechaRespuesta = respuesta.fecha_envio ? new Date(respuesta.fecha_envio).getTime() : null;

  const candidatosMismoResponsable = periodos.filter((p) =>
    Boolean(email) && p.reportado_por?.toLowerCase().trim() === email
  );

  if (candidatosMismoResponsable.length === 1) return candidatosMismoResponsable[0];

  if (candidatosMismoResponsable.length > 1 && fechaRespuesta != null) {
    return candidatosMismoResponsable
      .slice()
      .sort((a, b) => {
        const fechaA = a.fecha_envio ? new Date(a.fecha_envio).getTime() : 0;
        const fechaB = b.fecha_envio ? new Date(b.fecha_envio).getTime() : 0;
        return Math.abs(fechaA - fechaRespuesta) - Math.abs(fechaB - fechaRespuesta);
      })[0];
  }

  const periodosReportados = getPeriodosReportados(periodos);
  if (periodosReportados.length === 1) return periodosReportados[0];

  const candidatosConFecha = periodos.filter((p) => Boolean(p.fecha_envio));
  if (candidatosConFecha.length === 1) return candidatosConFecha[0];

  if (candidatosConFecha.length > 1 && fechaRespuesta != null) {
    return candidatosConFecha
      .slice()
      .sort((a, b) => {
        const fechaA = a.fecha_envio ? new Date(a.fecha_envio).getTime() : 0;
        const fechaB = b.fecha_envio ? new Date(b.fecha_envio).getTime() : 0;
        return Math.abs(fechaA - fechaRespuesta) - Math.abs(fechaB - fechaRespuesta);
      })[0];
  }

  return null;
}

function PeriodoCard({
  p,
  onReportar,
  admin = false,
  evidenciasPeriodo = [],
}: {
  p: Periodo;
  onReportar: (periodo: string) => void;
  admin?: boolean;
  evidenciasPeriodo?: Indicador["evidencias"];
}) {
  const avanceNum = p.avance != null ? Number(p.avance) : null;
  const metaNum   = p.meta   != null ? Number(p.meta)   : null;
  const pct       = avanceNum != null && metaNum && metaNum > 0
    ? Math.min(Math.round((avanceNum / metaNum) * 100), 100)
    : null;

  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between" mb="xs">
        <Group gap={8}>
          <Text fw={700} size="sm">{p.periodo}</Text>
          <Badge color={ESTADO_COLORS[p.estado_reporte ?? "Borrador"]} variant="light" size="xs">
            {p.estado_reporte ?? "Borrador"}
          </Badge>
        </Group>
        {!admin && (
          <Button
            size="xs"
            variant="light"
            leftSection={<IconEdit size={13} />}
            onClick={() => onReportar(p.periodo)}
          >
            Reportar
          </Button>
        )}
      </Group>

      <Group gap={24} mb="xs">
        <div>
          <Text size="xs" c="dimmed">Meta</Text>
          <Text fw={600} size="sm">{p.meta ?? "—"}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">Avance</Text>
          <Text fw={600} size="sm">{avanceNum ?? "—"}</Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">Presupuesto ejecutado</Text>
          <Text fw={600} size="sm">{formatCOP(p.presupuesto_ejecutado ?? 0)}</Text>
        </div>
        {pct !== null && (
          <div style={{ flex: 1 }}>
            <Text size="xs" c="dimmed" mb={4}>Cumplimiento</Text>
            <Progress value={pct} size="sm" color={pct >= 90 ? "teal" : pct >= 60 ? "yellow" : "red"} />
            <Text size="xs" c="dimmed" mt={2}>{pct}%</Text>
          </div>
        )}
      </Group>

      {evidenciasPeriodo.length > 0 && (
        <Paper withBorder radius="md" p="sm" mb="xs" style={{ background: "var(--mantine-color-default-hover)" }}>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>Evidencia enviada</Text>
          <Stack gap={6}>
            {evidenciasPeriodo.map((ev) => (
              <Group key={ev._id} justify="space-between" wrap="nowrap">
                <Box style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate="end">{ev.nombre_original}</Text>
                  <Group gap={8} mt={4}>
                    <Badge size="xs" variant="light" color={ev.estado === "Aprobado" ? "teal" : ev.estado === "Rechazado" ? "red" : "blue"}>
                      {ev.estado}
                    </Badge>
                    <Text size="xs" c="dimmed">{new Date(ev.fecha_subida).toLocaleDateString("es-CO")}</Text>
                  </Group>
                </Box>
                <Button component="a" href={ev.url} target="_blank" rel="noopener noreferrer" size="xs" variant="light">
                  Ver PDF
                </Button>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}

      {p.resultados_alcanzados && (
        <Box mb="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">Resultados alcanzados</Text>
          <Text size="sm">{p.resultados_alcanzados}</Text>
        </Box>
      )}
      {p.logros && (
        <Box mb="xs">
          <Group gap={4} mb={2}>
            <IconCheckbox size={13} color="#40c057" />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Logros</Text>
          </Group>
          <Text size="sm">{p.logros}</Text>
        </Box>
      )}
      {p.alertas && (
        <Box mb="xs">
          <Group gap={4} mb={2}>
            <IconAlertTriangle size={13} color="orange" />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Alertas</Text>
          </Group>
          <Text size="sm" c="orange">{p.alertas}</Text>
        </Box>
      )}
      {p.justificacion_retrasos && (
        <Box>
          <Group gap={4} mb={2}>
            <IconClockHour4 size={13} color="#fa5252" />
            <Text size="xs" fw={600} c="dimmed" tt="uppercase">Justificación de retrasos</Text>
          </Group>
          <Text size="sm" c="dimmed">{p.justificacion_retrasos}</Text>
        </Box>
      )}
      {p.reportado_por && (
        <Text size="xs" c="dimmed" mt="xs">Reportado por: {p.reportado_por}
          {p.fecha_envio && ` · ${new Date(p.fecha_envio).toLocaleDateString("es-CO")}`}
        </Text>
      )}
    </Paper>
  );
}

const AVAL_COLOR: Record<string, string> = { Pendiente: "yellow", Aprobado: "teal", Rechazado: "red" };
const AVAL_LABEL: Record<string, string> = { Pendiente: "En revisión", Aprobado: "Aprobado", Rechazado: "Rechazado" };

function FormulariosRespuestasPanel({
  indicadorId,
  canAval = false,
  liderEmail = "",
}: {
  indicadorId: string;
  canAval?: boolean;
  liderEmail?: string;
}) {
  const [respuestas, setRespuestas] = useState<RespuestaFormulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () => {
    if (!indicadorId) return;
    setLoading(true);
    axios.get(PDI_ROUTES.formularioRespuestasPorIndicador(), { params: { indicador_id: indicadorId } })
      .then((r) => setRespuestas(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [indicadorId]);

  const handleAval = async (r: RespuestaFormulario, estado_aval: "Aprobado" | "Rechazado") => {
    const formId = typeof r.formulario_id === "string" ? r.formulario_id : (r.formulario_id as any)._id;
    setSavingId(r._id);
    try {
      await axios.put(PDI_ROUTES.formularioAval(formId, r._id), {
        estado_aval,
        aval_por: liderEmail,
        aval_comentario: comentarios[r._id] ?? "",
      });
      load();
      showNotification({
        title: estado_aval,
        message: `Formulario ${estado_aval.toLowerCase()} correctamente`,
        color: estado_aval === "Aprobado" ? "teal" : "red",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar el aval", color: "red" });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <Center py="sm"><Loader size="sm" /></Center>;
  if (respuestas.length === 0) return (
    <Text size="sm" c="dimmed" ta="center" py="sm">No hay formularios enviados para este indicador.</Text>
  );

  const formularioNombre = (r: RespuestaFormulario) =>
    typeof r.formulario_id === "string" ? "Formulario" : (r.formulario_id as any).nombre ?? "Formulario";

  return (
    <Stack gap="sm">
      {respuestas.map((r) => {
        const expanded = expandedId === r._id;
        const avalEstado = r.estado_aval;
        const puedoAval = canAval
          && r.estado === "Enviado"
          && r.estado_aval === "Pendiente"
          && r.lider_email_aval?.toLowerCase().trim() === liderEmail.toLowerCase().trim();
        return (
          <Paper key={r._id} withBorder radius="md" p="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div style={{ flex: 1, minWidth: 0 }}>
                <Group gap={8} mb={4}>
                  <Text fw={700} size="sm">{formularioNombre(r)}</Text>
                  <Badge size="xs" color={r.estado === "Enviado" ? "blue" : "gray"} variant="light">{r.estado}</Badge>
                  {avalEstado && (
                    <Badge size="xs" color={AVAL_COLOR[avalEstado]} variant="light"
                      leftSection={avalEstado === "Aprobado" ? <IconShieldCheck size={11} /> : avalEstado === "Rechazado" ? <IconShieldX size={11} /> : undefined}>
                      Aval: {avalEstado}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">Enviado por: <b>{r.respondido_por}</b> · Corte: <b>{r.corte}</b></Text>
                {r.fecha_envio && <Text size="xs" c="dimmed">Fecha: {new Date(r.fecha_envio).toLocaleDateString("es-CO")}</Text>}
                {avalEstado === "Aprobado" && r.aval_por && <Text size="xs" c="teal">Avalado por: {r.aval_por}{r.aval_fecha ? ` · ${new Date(r.aval_fecha).toLocaleDateString("es-CO")}` : ""}</Text>}
                {avalEstado === "Rechazado" && r.aval_comentario && <Text size="xs" c="red">Motivo: {r.aval_comentario}</Text>}
              </div>
              {r.estado === "Enviado" && (
                <Button size="xs" variant="subtle" color="violet"
                  onClick={() => setExpandedId(expanded ? null : r._id)}>
                  {expanded ? "Ocultar" : "Ver respuestas"}
                </Button>
              )}
            </Group>
            {expanded && (
              <Stack gap="xs" mt="sm">
                {r.respuestas.map((resp, i) => (
                  <Paper key={i} withBorder radius="sm" p="sm" style={{ background: "var(--mantine-color-default-hover)" }}>
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
            {puedoAval && (
              <>
                <Textarea
                  placeholder="Comentario para el responsable (opcional)..."
                  value={comentarios[r._id] ?? ""}
                  onChange={(e) => setComentarios((prev) => ({ ...prev, [r._id]: e.currentTarget.value }))}
                  rows={2}
                  radius="md"
                  mt="sm"
                  mb="sm"
                  size="xs"
                />
                <Group gap="sm" justify="flex-end">
                  <Button size="xs" color="red" variant="light" radius="xl"
                    loading={savingId === r._id}
                    leftSection={<IconShieldX size={13} />}
                    onClick={() => handleAval(r, "Rechazado")}>
                    Rechazar
                  </Button>
                  <Button size="xs" color="teal" radius="xl"
                    loading={savingId === r._id}
                    leftSection={<IconShieldCheck size={13} />}
                    onClick={() => handleAval(r, "Aprobado")}>
                    Aprobar
                  </Button>
                </Group>
              </>
            )}
          </Paper>
        );
      })}
    </Stack>
  );
}

function LiderRevisionPanel({
  indicadorId,
  periodos,
  liderEmail = "",
}: {
  indicadorId: string;
  periodos: Periodo[];
  liderEmail?: string;
}) {
  const [respuestas, setRespuestas] = useState<RespuestaFormulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () => {
    if (!indicadorId) return;
    setLoading(true);
    axios.get(PDI_ROUTES.formularioRespuestasPorIndicador(), { params: { indicador_id: indicadorId } })
      .then((r) => setRespuestas(r.data.filter((item: RespuestaFormulario) => item.estado === "Enviado")))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [indicadorId]);

  const handleAval = async (r: RespuestaFormulario, estado_aval: "Aprobado" | "Rechazado") => {
    const formId = typeof r.formulario_id === "string" ? r.formulario_id : (r.formulario_id as any)._id;
    setSavingId(r._id);
    try {
      await axios.put(PDI_ROUTES.formularioAval(formId, r._id), {
        estado_aval,
        aval_por: liderEmail,
        aval_comentario: comentarios[r._id] ?? "",
      });
      load();
      showNotification({
        title: estado_aval,
        message: `Formulario ${estado_aval.toLowerCase()} correctamente`,
        color: estado_aval === "Aprobado" ? "teal" : "red",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar el aval", color: "red" });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <Center py="sm"><Loader size="sm" /></Center>;
  if (respuestas.length === 0) {
    return (
      <Paper withBorder radius="xl" p="lg">
        <Text size="sm" c="dimmed" ta="center">No hay reportes enviados para este indicador.</Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {respuestas
        .slice()
        .sort((a, b) => b.corte.localeCompare(a.corte))
        .map((r) => {
          const periodo = resolvePeriodoForRespuesta(periodos, r);
          const periodoMostrado = periodo?.periodo ?? "Sin periodo asociado";
          const avanceNum = periodo?.avance != null ? Number(periodo.avance) : null;
          const metaNum = periodo?.meta != null ? Number(periodo.meta) : null;
          const pct = avanceNum != null && metaNum && metaNum > 0
            ? Math.min(Math.round((avanceNum / metaNum) * 100), 100)
            : null;
          const avalEstado = r.estado_aval ?? "Pendiente";
          const puedoAval =
            avalEstado === "Pendiente" &&
            r.lider_email_aval?.toLowerCase().trim() === liderEmail.toLowerCase().trim();
          const formularioNombre =
            typeof r.formulario_id === "string" ? "Formulario" : (r.formulario_id as any).nombre ?? "Formulario";

          return (
            <Paper key={r._id} withBorder radius="xl" p="lg" shadow="xs">
              <Group justify="space-between" align="flex-start" mb="md" wrap="wrap">
                <div>
                  <Group gap={8} mb={6}>
                    <Badge color="violet" variant="filled" radius="xl">{periodoMostrado}</Badge>
                    <Badge color="grape" variant="light" radius="xl">Formulario de evidencias</Badge>
                    <Badge
                      color={AVAL_COLOR[avalEstado]}
                      variant="light"
                      radius="xl"
                      leftSection={
                        avalEstado === "Aprobado"
                          ? <IconShieldCheck size={12} />
                          : avalEstado === "Rechazado"
                          ? <IconShieldX size={12} />
                          : <IconClockHour4 size={12} />
                      }
                    >
                      Estado: {AVAL_LABEL[avalEstado]}
                    </Badge>
                  </Group>
                  <Text fw={700}>Reporte enviado por {r.respondido_por}</Text>
                  <Text size="sm" c="dimmed">
                    {r.fecha_envio ? `Enviado el ${new Date(r.fecha_envio).toLocaleDateString("es-CO")}` : "Sin fecha de envio"}
                  </Text>
                </div>
              </Group>

              <Text fw={700} size="lg" mb="sm">Evaluación por periodo</Text>
              <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" mb="md">
                {[
                  { label: "Periodo", value: periodoMostrado },
                  { label: "Meta", value: periodo?.meta ?? "Sin dato" },
                  { label: "Avance reportado", value: avanceNum ?? "Sin dato" },
                  { label: "Cumplimiento", value: pct != null ? `${pct}%` : "Sin dato" },
                ].map((item) => (
                  <Box
                    key={item.label}
                    style={{
                      padding: "12px 10px",
                      borderRadius: 14,
                      border: "1px solid rgba(124,58,237,0.08)",
                      background: "var(--mantine-color-default-hover)",
                    }}
                  >
                    <Text size="xs" c="dimmed">{item.label}</Text>
                    <Text fw={700} mt={4}>{item.value}</Text>
                  </Box>
                ))}
              </SimpleGrid>

              <Paper
                withBorder
                radius="md"
                p="lg"
                mb="md"
                style={{
                  background: "#fff",
                  borderColor: "#d9d9d9",
                  boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                }}
              >
                <Group justify="space-between" mb="md" wrap="wrap">
                  <div>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">Documento Word reportado</Text>
                    <Title order={6}>{formularioNombre}</Title>
                    <Text size="xs" c="dimmed" mt={4}>Periodo: {periodoMostrado}</Text>
                  </div>
                  <Badge variant="outline" color="gray" radius="xl">Vista tipo Word</Badge>
                </Group>

                <Stack gap="sm">
                  {r.respuestas.map((resp, i) => (
                    <Box key={`${r._id}-${i}`} pb="sm" style={{ borderBottom: i < r.respuestas.length - 1 ? "1px solid #ececec" : "none" }}>
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={4}>{resp.etiqueta}</Text>
                      {resp.tipo === "texto_largo" ? (
                        <Text size="sm" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                          {resp.valor_texto || "Sin respuesta"}
                        </Text>
                      ) : resp.url ? (
                        <Group justify="space-between" wrap="wrap">
                          <Text size="sm" fw={600}>{resp.nombre_original || "Documento adjunto"}</Text>
                          <Button
                            size="xs"
                            variant="light"
                            color="blue"
                            component="a"
                            href={resp.url}
                            target="_blank"
                            leftSection={<IconFileTypePdf size={13} />}
                          >
                            Abrir anexo
                          </Button>
                        </Group>
                      ) : (
                        <Text size="sm" c="dimmed">Sin archivo adjunto</Text>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Paper>

              {avalEstado === "Aprobado" && r.aval_por && (
                <Text size="sm" c="teal" mb="sm">
                  Avalado por: {r.aval_por}{r.aval_fecha ? ` · ${new Date(r.aval_fecha).toLocaleDateString("es-CO")}` : ""}
                </Text>
              )}
              {avalEstado === "Rechazado" && r.aval_comentario && (
                <Text size="sm" c="red" mb="sm">Motivo del rechazo: {r.aval_comentario}</Text>
              )}

              {puedoAval && (
                <>
                  <Paper
                    withBorder
                    radius="md"
                    p="md"
                    mb="sm"
                    style={{ background: "rgba(250,204,21,0.08)", borderColor: "rgba(234,179,8,0.28)" }}
                  >
                    <Group gap={8} wrap="wrap">
                      <IconClockHour4 size={16} color="#ca8a04" />
                      <Text fw={700} c="yellow.8">Evaluación pendiente</Text>
                      <Text size="sm" c="dimmed">Puedes dejarlo en revisión o cambiar su estado a aprobado o rechazado.</Text>
                    </Group>
                  </Paper>
                  <Textarea
                    placeholder="Comentario de evaluacion para el responsable (opcional)..."
                    value={comentarios[r._id] ?? ""}
                    onChange={(e) => setComentarios((prev) => ({ ...prev, [r._id]: e.currentTarget.value }))}
                    rows={3}
                    radius="md"
                    mb="sm"
                  />
                  <Group gap="sm" justify="flex-end">
                    <Button
                      size="sm"
                      variant="default"
                      radius="xl"
                      leftSection={<IconClockHour4 size={14} />}
                      onClick={() => showNotification({ title: "En revisión", message: "El reporte sigue pendiente de evaluación.", color: "yellow" })}
                    >
                      Mantener en revisión
                    </Button>
                    <Button
                      size="sm"
                      color="red"
                      variant="light"
                      radius="xl"
                      loading={savingId === r._id}
                      leftSection={<IconShieldX size={14} />}
                      onClick={() => handleAval(r, "Rechazado")}
                    >
                      Rechazar evaluacion
                    </Button>
                    <Button
                      size="sm"
                      color="teal"
                      radius="xl"
                      loading={savingId === r._id}
                      leftSection={<IconShieldCheck size={14} />}
                      onClick={() => handleAval(r, "Aprobado")}
                    >
                      Aprobar evaluación
                    </Button>
                  </Group>
                </>
              )}
            </Paper>
          );
        })}
    </Stack>
  );
}

function LiderRevisionPanelV2({
  indicadorId,
  periodos,
  liderEmail = "",
  permitirEvaluacion = false,
  readOnly = false,
  onlyApproved = false,
  preferredPeriodo = "",
}: {
  indicadorId: string;
  periodos: Periodo[];
  liderEmail?: string;
  permitirEvaluacion?: boolean;
  readOnly?: boolean;
  onlyApproved?: boolean;
  preferredPeriodo?: string;
}) {
  const [respuestas, setRespuestas] = useState<RespuestaFormulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [estadosSeleccionados, setEstadosSeleccionados] = useState<Record<string, "Pendiente" | "Aprobado" | "Rechazado">>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () => {
    if (!indicadorId) return;
    setLoading(true);
    axios.get(PDI_ROUTES.formularioRespuestasPorIndicador(), { params: { indicador_id: indicadorId } })
      .then((r) => setRespuestas(
        r.data.filter((item: RespuestaFormulario) =>
          item.estado === "Enviado" && (!onlyApproved || item.estado_aval === "Aprobado")
        )
      ))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [indicadorId, onlyApproved]);

  const handleAval = async (r: RespuestaFormulario) => {
    const formId = typeof r.formulario_id === "string" ? r.formulario_id : (r.formulario_id as any)._id;
    const estadoSeleccionado = estadosSeleccionados[r._id] ?? "Pendiente";

    if (estadoSeleccionado === "Pendiente") {
      return;
    }

    setSavingId(r._id);
    try {
      await axios.put(PDI_ROUTES.formularioAval(formId, r._id), {
        estado_aval: estadoSeleccionado,
        aval_por: liderEmail,
        aval_comentario: comentarios[r._id] ?? "",
      });
      load();
      showNotification({
        title: estadoSeleccionado,
        message: `Formulario ${estadoSeleccionado.toLowerCase()} correctamente`,
        color: estadoSeleccionado === "Aprobado" ? "teal" : "red",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar el aval", color: "red" });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <Center py="sm"><Loader size="sm" /></Center>;
  if (respuestas.length === 0) {
    return (
      <Paper withBorder radius="xl" p="lg">
        <Text size="sm" c="dimmed" ta="center">No hay reportes enviados para este indicador.</Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {respuestas
        .slice()
        .sort((a, b) => {
          const periodoA = resolvePeriodoForRespuesta(periodos, a, preferredPeriodo);
          const periodoB = resolvePeriodoForRespuesta(periodos, b, preferredPeriodo);
          const claveA = normalizePeriodo(periodoA?.periodo ?? a.corte);
          const claveB = normalizePeriodo(periodoB?.periodo ?? b.corte);
          return claveB.localeCompare(claveA);
        })
        .map((r) => {
          const periodo = resolvePeriodoForRespuesta(periodos, r, preferredPeriodo);
          const periodoMostrado = periodo?.periodo ?? "Sin periodo asociado";
          const avanceNum = periodo?.avance != null ? Number(periodo.avance) : null;
          const metaNum = periodo?.meta != null ? Number(periodo.meta) : null;
          const pct = avanceNum != null && metaNum && metaNum > 0
            ? Math.min(Math.round((avanceNum / metaNum) * 100), 100)
            : null;
          const avalEstado = r.estado_aval ?? "Pendiente";
          const puedoAval =
            !readOnly &&
            avalEstado === "Pendiente" &&
            (
              permitirEvaluacion ||
              r.lider_email_aval?.toLowerCase().trim() === liderEmail.toLowerCase().trim()
            );
          const estadoSeleccionado = estadosSeleccionados[r._id] ?? avalEstado;
          const formularioNombre =
            typeof r.formulario_id === "string" ? "Formulario" : (r.formulario_id as any).nombre ?? "Formulario";

          return (
            <Paper key={r._id} withBorder radius="xl" p="lg" shadow="sm">
              <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap">
                <div>
                  <Group gap={8} mb={6}>
                    <Badge color="violet" variant="filled" radius="xl">{periodoMostrado}</Badge>
                    <Badge
                      color={AVAL_COLOR[avalEstado]}
                      variant="light"
                      radius="xl"
                      leftSection={
                        avalEstado === "Aprobado"
                          ? <IconShieldCheck size={12} />
                          : avalEstado === "Rechazado"
                          ? <IconShieldX size={12} />
                          : <IconClockHour4 size={12} />
                      }
                    >
                      Estado: {AVAL_LABEL[avalEstado]}
                    </Badge>
                  </Group>
                  <Text fw={700}>Reporte enviado por {r.respondido_por}</Text>
                  <Text size="sm" c="dimmed">
                    {r.fecha_envio ? `Enviado el ${new Date(r.fecha_envio).toLocaleDateString("es-CO")}` : "Sin fecha de envio"}
                  </Text>
                </div>
              </Group>

              <div>
                <Title order={5} mb="sm">Avance por periodo</Title>
                <Paper withBorder radius="xl" p="md" mb="lg" style={{ borderLeft: "4px solid #7c3aed", background: "#fff" }}>
                  <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                    <div>
                      <Group gap={8}>
                        <Text size="lg" fw={800}>{periodoMostrado}</Text>
                        <Badge size="sm" radius="xl" color={AVAL_COLOR[avalEstado]} variant="light">
                          {AVAL_LABEL[avalEstado]}
                        </Badge>
                      </Group>
                      <Text size="sm" c="dimmed" mt={4}>Meta definida: <b>{periodo?.meta ?? "Sin dato"}</b></Text>
                    </div>
                    <Box
                      style={{
                        minWidth: 160,
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: "var(--mantine-color-default-hover)",
                        border: "1px solid rgba(124,58,237,0.08)",
                      }}
                    >
                      <Text size="xs" c="dimmed">Avance reportado</Text>
                      <Text fw={700} mt={2}>{avanceNum ?? "Sin dato"}</Text>
                    </Box>
                  </Group>
                  {pct != null && (
                    <>
                      <Group justify="space-between" mb={4}>
                        <Text size="xs" c="dimmed">Progreso del periodo</Text>
                        <Text size="xs" fw={700}>{pct}%</Text>
                      </Group>
                      <Progress value={pct} color="violet" size="sm" radius="xl" />
                    </>
                  )}
                </Paper>
              </div>

              <Divider mb="lg" />

              <div>
                <Group gap={8} mb="md">
                  <ThemeIcon size={32} radius="xl" color="violet" variant="light">
                    <IconForms size={16} />
                  </ThemeIcon>
                  <div>
                    <Title order={5}>Formulario de evidencias</Title>
                    <Text size="xs" c="dimmed">
                      {`${formularioNombre} · vista tipo Word del formulario enviado por el responsable`}
                    </Text>
                  </div>
                </Group>

                <Paper
                  withBorder
                  radius="xl"
                  p="lg"
                  mb="lg"
                  style={{
                    background: "#fff",
                    borderColor: "#d9d9d9",
                    boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
                  }}
                >
                  <Group justify="space-between" mb="md" wrap="wrap">
                    <div>
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">Documento evaluado</Text>
                      <Title order={6}>{formularioNombre}</Title>
                      <Text size="xs" c="dimmed" mt={4}>Periodo: {periodoMostrado}</Text>
                    </div>
                    <Group gap="xs">
                      <Badge variant="outline" color="gray" radius="xl">Formato Word</Badge>
                      {r.word_url && (
                          <Button
                            size="xs"
                            variant="light"
                            color="blue"
                            component="a"
                            href={r.word_url}
                            download={r.word_filename || true}
                          >
                            Descargar Word
                          </Button>
                      )}
                    </Group>
                  </Group>

               
                </Paper>
              </div>

              <Paper withBorder radius="xl" p="lg" style={{ background: "rgba(124,58,237,0.03)", borderColor: "#ede9fe" }}>
                <Title order={5} mb="sm">{readOnly ? "Aprobación del líder" : "Evaluación del líder"}</Title>
                <Text size="sm" c="dimmed" mb="md">
                  {readOnly
                    ? "Vista de solo lectura del estado aprobado por el líder y sus observaciones."
                    : "Define el estado del formulario y registra observaciones para el responsable."}
                </Text>

                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" mb="md">
                  <Select
                    label="Estado de evaluación"
                    data={[
                      { value: "Pendiente", label: "En revisión" },
                      { value: "Rechazado", label: "Rechazado" },
                      { value: "Aprobado", label: "Aprobado" },
                    ]}
                    value={estadoSeleccionado}
                    disabled={readOnly || !puedoAval}
                    onChange={(value) => {
                      if (!value) return;
                      setEstadosSeleccionados((prev) => ({
                        ...prev,
                        [r._id]: value as "Pendiente" | "Aprobado" | "Rechazado",
                      }));
                    }}
                  />
                  <Box
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "var(--mantine-color-default-hover)",
                      alignSelf: "end",
                    }}
                  >
                    <Text size="xs" c="dimmed">Estado actual</Text>
                    <Text fw={700} mt={4}>{AVAL_LABEL[avalEstado]}</Text>
                  </Box>
                </SimpleGrid>

                <Textarea
                  label="Observaciones"
                  placeholder="Escribe aquí las observaciones para el responsable..."
                  value={comentarios[r._id] ?? r.aval_comentario ?? ""}
                  onChange={(e) => setComentarios((prev) => ({ ...prev, [r._id]: e.currentTarget.value }))}
                  rows={4}
                  radius="md"
                  disabled={readOnly || !puedoAval}
                  mb="md"
                />

                {!puedoAval && (
                  <Paper withBorder radius="md" p="sm" mb="md" style={{ background: "var(--mantine-color-default-hover)" }}>
                    <Text size="sm" c="dimmed">
                      {avalEstado === "Pendiente"
                        ? "Este formulario sigue en revisión."
                        : `La evaluación ya fue cerrada con estado ${AVAL_LABEL[avalEstado].toLowerCase()}.`}
                    </Text>
                  </Paper>
                )}

                {(r.aval_por || r.aval_comentario) && (
                  <Paper
                    withBorder
                    radius="md"
                    p="sm"
                    mb="md"
                    style={{ background: avalEstado === "Rechazado" ? "rgba(239,68,68,0.04)" : "rgba(13,148,136,0.04)" }}
                  >
                    {r.aval_por && (
                      <Text size="sm" c={avalEstado === "Rechazado" ? "red" : "teal"}>
                        Evaluado por: {r.aval_por}{r.aval_fecha ? ` · ${new Date(r.aval_fecha).toLocaleDateString("es-CO")}` : ""}
                      </Text>
                    )}
                    {r.aval_comentario && (
                      <Text size="sm" mt={4}>Observaciones registradas: {r.aval_comentario}</Text>
                    )}
                  </Paper>
                )}

                {puedoAval && (
                  <Group justify="flex-end">
                    <Button
                      color={estadoSeleccionado === "Aprobado" ? "teal" : "red"}
                      radius="xl"
                      loading={savingId === r._id}
                      disabled={estadoSeleccionado === "Pendiente"}
                      leftSection={
                        estadoSeleccionado === "Aprobado"
                          ? <IconShieldCheck size={14} />
                          : <IconShieldX size={14} />
                      }
                      onClick={() => handleAval(r)}
                    >
                      Guardar evaluación
                    </Button>
                  </Group>
                )}
              </Paper>
            </Paper>
          );
        })}
    </Stack>
  );
}

export default function IndicadorEvidenciasPage() {
  const router      = useRouter();
  const params      = useParams();
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const searchParams = useSearchParams();
  const indicadorId = params?.indicadorId as string;
  const { config } = usePdiConfig();
  const { userRole } = useRole();
  const { data: session } = useSession();
  const vieneDeMisIndicadores =
    currentPath.startsWith("/pdi/mis-indicadores/") ||
    searchParams.get("origen") === "mis-indicadores";
  const fuerzaVistaEvaluacion = searchParams.get("modo") === "evaluar";
  const preferredPeriodo = searchParams.get("periodo") ?? "";
  const admin = !vieneDeMisIndicadores && isAdmin(userRole);

  const [indicador, setIndicador] = useState<Indicador | null>(null);
  const [loading, setLoading]     = useState(true);
  const [reportePeriodo, setReportePeriodo] = useState<string | null>(null);
  const [isLider, setIsLider]     = useState(false);
  const [liderEmail, setLiderEmail] = useState("");

  const load = () => {
    if (!indicadorId) return;
    axios.get(PDI_ROUTES.indicador(indicadorId))
      .then((res) => setIndicador(res.data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [indicadorId]);

  useEffect(() => {
    if (!indicadorId || !session?.user?.email) return;
    const email = session.user.email.toLowerCase().trim();
    axios.get(PDI_ROUTES.formularioLiderEmailIndicador(), { params: { indicador_id: indicadorId } })
      .then((r) => {
        const le = (r.data.lider_email ?? "").toLowerCase().trim();
        if (le && le === email) {
          setIsLider(true);
          setLiderEmail(le);
        }
      })
      .catch(() => {});
  }, [indicadorId, session?.user?.email]);

  const mostrarVistaLider = isLider || fuerzaVistaEvaluacion;
  const emailSesion = (session?.user?.email ?? "").toLowerCase().trim();
  const semColor = indicador ? SEMAFORO_COLORS[indicador.semaforo] : "#aaa";
  const avanceMostrado = indicador ? getIndicadorAvanceMostrado(indicador) : null;
  const evidenciasPendientes = indicador?.evidencias?.filter((ev) => ev.estado === "En Revisión") ?? [];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!vieneDeMisIndicadores && <PdiSidebar />}
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="lg" py="xl">

          {/* Header */}
          <Group gap={10} mb="lg">
            <ActionIcon variant="subtle" onClick={() => router.back()}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <ThemeIcon size={42} radius="xl" color="violet" variant="light">
              <IconTarget size={20} />
            </ThemeIcon>
            <div>
              <Title order={3}>Indicador de resultado</Title>
              <Text size="sm" c="dimmed">{config.nombre} - Seguimiento, reportes y evidencias</Text>
            </div>
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : !indicador ? (
            <Center py="xl"><Text c="dimmed">No se encontró el indicador</Text></Center>
          ) : (
            <Stack gap="lg">

              {/* Ficha del indicador */}
              <Paper withBorder radius="xl" p="xl" shadow="sm">
                <Group gap={12} align="flex-start" mb="md">
                  <div
                    style={{
                      width: 12, height: 12, borderRadius: "50%",
                      background: semColor, marginTop: 6, flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <Text size="xs" fw={700} c="dimmed">{indicador.codigo}</Text>
                    <Title order={4}>{indicador.nombre}</Title>
                  </div>
                  <Badge color={indicador.semaforo === "verde" ? "teal" : indicador.semaforo === "amarillo" ? "yellow" : "red"} variant="light">
                    {`${avanceMostrado}%`}
                  </Badge>
                </Group>

                <Group gap={32}>
                  <div>
                    <Text size="xs" c="dimmed">Meta final {config.anio_fin}</Text>
                    <Text fw={600}>{indicador.meta_final_2029 ?? "—"}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Tipo de cálculo</Text>
                    <Text fw={600}>{indicador.tipo_calculo}</Text>
                  </div>
                  {indicador.responsable && (
                    <div>
                      <Text size="xs" c="dimmed">Responsable</Text>
                      <Text fw={600}>{indicador.responsable}</Text>
                    </div>
                  )}
                </Group>

                {indicador.entregable && (
                  <Paper withBorder radius="md" p="md" mt="md" style={{ background: "var(--mantine-color-default-hover)" }}>
                    <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>Entregable / Evidencia verificable</Text>
                    <Text size="sm" fw={600}>{indicador.entregable}</Text>
                  </Paper>
                )}
              </Paper>

              {mostrarVistaLider ? (
                <div>
                  <Title order={5} mb="sm">
                    <Group gap={6}>
                      <IconForms size={18} />
                      Revision de reportes por periodo
                    </Group>
                  </Title>
                  <Text size="sm" c="dimmed" mb="md">
                    Aqui puedes revisar cada corte reportado por el responsable y leer el formulario enviado en una vista tipo documento.
                  </Text>
                  <LiderRevisionPanelV2
                    indicadorId={indicador._id}
                    periodos={indicador.periodos}
                    liderEmail={liderEmail || emailSesion}
                    permitirEvaluacion={mostrarVistaLider}
                    preferredPeriodo={preferredPeriodo}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <Group justify="space-between" mb="sm">
                      <Title order={5}>{admin ? "Reportes y evidencias por periodo" : "Reportes de avance por corte"}</Title>
                      {!admin && (
                        <Button
                          size="xs"
                          variant="light"
                          color="violet"
                          leftSection={<IconEdit size={13} />}
                          onClick={() => setReportePeriodo("nuevo")}
                        >
                          Nuevo periodo
                        </Button>
                      )}
                    </Group>

                    {indicador.periodos.length === 0 ? (
                      <Paper withBorder radius="md" p="lg">
                        <Text c="dimmed" ta="center" size="sm">
                          {admin
                            ? "Este indicador todavía no tiene periodos reportados."
                            : "Sin reportes registrados. Haz clic en \"Nuevo periodo\" para agregar el primer corte."}
                        </Text>
                      </Paper>
                    ) : (
                      <Stack gap="sm">
                        {[...indicador.periodos]
                          .sort((a, b) => a.periodo.localeCompare(b.periodo))
                          .map((p) => (
                            <PeriodoCard
                              key={p.periodo}
                              p={p}
                              admin={admin}
                              evidenciasPeriodo={(indicador.evidencias ?? []).filter((ev) => ev.periodo === p.periodo)}
                              onReportar={(per) => setReportePeriodo(per)}
                            />
                          ))}
                      </Stack>
                    )}
                  </div>

                  <Divider />

                  {(!admin || evidenciasPendientes.length > 0) && (
                    <div>
                      <Title order={5} mb="sm">
                        <Group gap={6}>
                          <IconFileTypePdf size={18} />
                          {admin ? "Evidencias enviadas para revisión" : "Evidencias documentales"}
                        </Group>
                      </Title>
                      <EvidenciasPanel indicadorId={indicador._id} readOnly={admin} periodos={indicador.periodos} />
                    </div>
                  )}

                  {admin && (
                    <>
                      <Divider />
                      <div>
                        <Title order={5} mb="sm">
                          <Group gap={6}>
                            <IconForms size={18} />
                            Formularios aprobados por el líder
                          </Group>
                        </Title>
                        <LiderRevisionPanelV2
                          indicadorId={indicador._id}
                          periodos={indicador.periodos}
                          liderEmail={liderEmail || emailSesion}
                          readOnly
                          onlyApproved
                          preferredPeriodo={preferredPeriodo}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </Stack>
          )}
        </Container>
      </div>

      {/* Modal de reporte de avance */}
      {!admin && indicador && reportePeriodo && (
        <ReporteAvanceModal
          opened={!!reportePeriodo}
          onClose={() => setReportePeriodo(null)}
          indicador={indicador}
          periodo={reportePeriodo === "nuevo" ? "" : reportePeriodo}
          onSaved={(updated) => {
            setIndicador(updated);
            setReportePeriodo(null);
          }}
        />
      )}
    </div>
  );
}
