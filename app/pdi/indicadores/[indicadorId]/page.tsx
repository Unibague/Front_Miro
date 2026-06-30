"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Box, Button, Center, Container, Group,
  Loader, Paper, Progress, Select, MultiSelect, TextInput, SimpleGrid, Stack, Text, ThemeIcon, Title, Divider, Textarea,
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
import type { Indicador, Periodo, EstadoReporte, RespuestaCampo, RespuestaFormulario } from "../../types";
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
  Validado:  "green",
};

const SEMAFORO_COLORS: Record<string, string> = {
  verde:    "#40c057",
  amarillo: "#fab005",
  rojo:     "#fa5252",
};
const isAdmin = (role: string) => role === "Administrador";

function getIndicadorAvanceMostrado(indicador: Indicador) {
  return indicador.avance_total_real ?? indicador.avance;
}

const formatCOP = (value?: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value ?? 0);

function normalizePeriodo(value?: string | null) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function deduplicarRespuestas(items: RespuestaFormulario[]): RespuestaFormulario[] {
  const mapa = new Map<string, RespuestaFormulario>();
  for (const r of items) {
    const clave = normalizePeriodo(r.corte);
    const prev = mapa.get(clave);
    if (!prev) {
      mapa.set(clave, r);
    } else {
      const fechaR = r.fecha_envio ? new Date(r.fecha_envio).getTime() : (r as any).createdAt ? new Date((r as any).createdAt).getTime() : 0;
      const fechaPrev = prev.fecha_envio ? new Date(prev.fecha_envio).getTime() : (prev as any).createdAt ? new Date((prev as any).createdAt).getTime() : 0;
      if (fechaR > fechaPrev) mapa.set(clave, r);
    }
  }
  return Array.from(mapa.values());
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

function isAutoApprovedByLeader(respondidoPor?: string | null, liderEmail?: string | null) {
  const responsable = String(respondidoPor ?? "").toLowerCase().trim();
  const lider = String(liderEmail ?? "").toLowerCase().trim();
  return Boolean(responsable) && Boolean(lider) && responsable === lider;
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

function getDocumentosFormulario(respuesta: RespuestaFormulario) {
  if (Array.isArray(respuesta.documentos) && respuesta.documentos.length > 0) return respuesta.documentos;
  if (respuesta.documento_url || respuesta.documento_nombre_original || respuesta.documento_filename) {
    return [{
      _id: "legacy",
      nombre_original: respuesta.documento_nombre_original,
      filename: respuesta.documento_filename,
      url: respuesta.documento_url,
    }];
  }
  return [];
}

function getRespuestaCampoKey(respuesta: RespuestaCampo, index: number) {
  return String(respuesta.campo_id || respuesta._id || index);
}

function getRespuestaCampoValor(respuesta: RespuestaCampo) {
  const value = String(respuesta.valor_texto ?? "").trim();
  if (respuesta.tipo === "checkbox") return value === "true" ? "Si" : value === "false" ? "No" : "";
  return value;
}

function getComentariosCamposPayload(
  respuesta: RespuestaFormulario,
  comentariosCampos: Record<string, Record<string, string>>
) {
  const comentariosRespuesta = comentariosCampos[respuesta._id] ?? {};
  return respuesta.respuestas
    .map((campo, index) => {
      const campoKey = getRespuestaCampoKey(campo, index);
      return {
        campo_id: campo.campo_id,
        comentario_lider: comentariosRespuesta[campoKey] ?? campo.comentario_lider ?? "",
      };
    })
    .filter((item) => item.comentario_lider.trim());
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
  const estadoMostradoAdmin =
    admin && p.estado_reporte !== "Aprobado"
      ? "Aprobado"
      : (p.estado_reporte ?? "Borrador");

  if (admin) {
    return (
      <Paper
        withBorder
        radius="xl"
        p="md"
        style={{
          borderLeft: "4px solid #cbd5e1",
          background: "rgba(248,250,252,0.96)",
        }}
      >
        <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
          <div>
            <Group gap={8}>
              <Text size="lg" fw={800}>{p.periodo}</Text>
              <Badge size="sm" radius="xl" color={ESTADO_COLORS[estadoMostradoAdmin]} variant="light">
                {estadoMostradoAdmin}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>Meta definida: <b>{p.meta ?? "—"}</b></Text>
          </div>

          <Box
            style={{
              minWidth: 160,
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(124,58,237,0.08)",
              border: "1px solid rgba(124,58,237,0.18)",
            }}
          >
            <Text size="xs" c="violet" fw={700}>Avance reportado</Text>
            <Text fw={700} mt={2} c="violet">{avanceNum ?? "Sin dato"}</Text>
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

        {evidenciasPeriodo.length > 0 && (
          <Paper withBorder radius="md" p="sm" mt="md" style={{ background: "var(--mantine-color-default-hover)" }}>
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
      </Paper>
    );
  }

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
      .then((r) => setRespuestas(deduplicarRespuestas(r.data)))
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
                  onChange={(e) => { const v = e.currentTarget.value; setComentarios((prev) => ({ ...prev, [r._id]: v })); }}
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
      .then((r) => setRespuestas(deduplicarRespuestas(r.data.filter((item: RespuestaFormulario) => item.estado === "Enviado"))))
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
          const documentosFormulario = getDocumentosFormulario(r);

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

              <Text fw={700} size="lg" mb="sm" style={{ background: "linear-gradient(90deg, #7c3aed, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Evaluación por periodo</Text>
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
                    placeholder="Comentario de evaluación para el responsable (opcional)..."
                    value={comentarios[r._id] ?? ""}
                    onChange={(e) => { const v = e.currentTarget.value; setComentarios((prev) => ({ ...prev, [r._id]: v })); }}
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
                      Rechazar evaluación
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
  onlyEvaluated = false,
  preferredPeriodo = "",
}: {
  indicadorId: string;
  periodos: Periodo[];
  liderEmail?: string;
  permitirEvaluacion?: boolean;
  readOnly?: boolean;
  onlyApproved?: boolean;
  onlyEvaluated?: boolean;
  preferredPeriodo?: string;
}) {
  const [respuestas, setRespuestas] = useState<RespuestaFormulario[]>([]);
  const [loading, setLoading] = useState(true);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [comentariosCampos, setComentariosCampos] = useState<Record<string, Record<string, string>>>({});
  const [estadosSeleccionados, setEstadosSeleccionados] = useState<Record<string, "Pendiente" | "Aprobado" | "Rechazado">>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [razonesSeleccionadas, setRazonesSeleccionadas] = useState<Record<string, string[]>>({});
  const [otrosCuales, setOtrosCuales] = useState<Record<string, string>>({});
  const [razonesDisponibles, setRazonesDisponibles] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    axios.get(PDI_ROUTES.razonesRechazo())
      .then((res) => {
        const base = (res.data as { _id: string; texto: string }[]).map((r) => ({ value: r.texto, label: r.texto }));
        setRazonesDisponibles([...base, { value: "Otro", label: "Otro ¿Cuál?" }]);
      })
      .catch(() => {});
  }, []);

  const load = () => {
    if (!indicadorId) return;
    setLoading(true);
    axios.get(PDI_ROUTES.formularioRespuestasPorIndicador(), { params: { indicador_id: indicadorId } })
      .then((r) => setRespuestas(
        deduplicarRespuestas(r.data.filter((item: RespuestaFormulario) =>
          item.estado === "Enviado" && (!onlyApproved || item.estado_aval === "Aprobado" || isAutoApprovedByLeader(item.respondido_por, item.lider_email_aval))
          && (!onlyEvaluated || (item.estado_aval != null && item.estado_aval !== "Pendiente"))
        ))
      ))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [indicadorId, onlyApproved, onlyEvaluated]);

  const handleAval = async (r: RespuestaFormulario) => {
    const formId = typeof r.formulario_id === "string" ? r.formulario_id : (r.formulario_id as any)._id;
    const estadoSeleccionado = estadosSeleccionados[r._id] ?? "Pendiente";
    const comentarioAval = estadoSeleccionado === "Rechazado" ? (comentarios[r._id] ?? "").trim() : "";
    const razones = estadoSeleccionado === "Rechazado" ? (razonesSeleccionadas[r._id] ?? []) : [];
    const otroCual = estadoSeleccionado === "Rechazado" && razones.includes("Otro") ? (otrosCuales[r._id] ?? "").trim() : "";

    if (estadoSeleccionado === "Pendiente") {
      return;
    }

    if (estadoSeleccionado === "Rechazado" && razones.length === 0) {
      showNotification({ title: "Requerido", message: "Selecciona al menos una razón de rechazo", color: "orange" });
      return;
    }

    if (estadoSeleccionado === "Rechazado" && razones.includes("Otro") && !otroCual) {
      showNotification({ title: "Requerido", message: 'Especifica el "Otro ¿Cuál?"', color: "orange" });
      return;
    }

    setSavingId(r._id);
    try {
      await axios.put(PDI_ROUTES.formularioAval(formId, r._id), {
        estado_aval: estadoSeleccionado,
        aval_por: liderEmail,
        aval_comentario: comentarioAval,
        aval_razones: razones,
        aval_otro_cual: otroCual,
        comentarios_campos: estadoSeleccionado === "Rechazado"
          ? getComentariosCamposPayload(r, comentariosCampos)
          : [],
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
          const documentosFormulario = getDocumentosFormulario(r);

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
                <Title order={5} mb="sm" style={{ background: "linear-gradient(90deg, #7c3aed, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Avance por periodo</Title>
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
                    <Title order={5} style={{ background: "linear-gradient(90deg, #7c3aed, #6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Formulario de evidencias</Title>
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
                      {r.word_url && (
                          <Button
                            size="xs"
                            variant="light"
                            color="blue"
                            component="a"
                            href={r.word_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver reporte
                          </Button>
                      )}
                    </Group>
                  </Group>

                  <Paper withBorder radius="md" p="md" style={{ background: "var(--mantine-color-default-hover)" }}>
                    <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                      <div>
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase">Evidencias adjuntas</Text>
                        <Text size="sm" fw={600} mt={3}>
                          {documentosFormulario.length > 0
                            ? `${documentosFormulario.length} archivo(s) PDF`
                            : "Sin evidencia adjunta"}
                        </Text>
                        <Text size="xs" c="dimmed" mt={2}>PDF enviado por el responsable</Text>
                      </div>
                      {documentosFormulario.length > 0 ? (
                        <Group gap="xs" wrap="wrap">
                          {documentosFormulario.filter((doc) => !!doc.url).map((doc, index) => (
                            <Button
                              key={doc._id ?? `${doc.url}-${index}`}
                              size="xs"
                              variant="light"
                              color="violet"
                              component="a"
                              href={doc.url!}
                              target="_blank"
                              rel="noreferrer"
                              leftSection={<IconFileTypePdf size={13} />}
                            >
                              {documentosFormulario.length > 1 ? `Abrir evidencia ${index + 1}` : "Abrir evidencia"}
                            </Button>
                          ))}
                        </Group>
                      ) : (
                        <Badge color="gray" variant="light">Sin archivo</Badge>
                      )}
                    </Group>
                  </Paper>
                </Paper>
              </div>

              <Paper withBorder radius="xl" p="lg" style={{ background: "rgba(124,58,237,0.03)", borderColor: "#ede9fe" }}>
                <Title order={5} mb="sm" style={{ background: "linear-gradient(90deg, #0891b2, #6366f1)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{readOnly ? "Aprobación del líder" : "Evaluación del líder"}</Title>
                <Text size="sm" c="dimmed" mb="md">
                  {readOnly
                    ? "Vista de solo lectura del estado definido por el líder."
                    : "Define el estado del formulario. Las observaciones solo aplican cuando rechazas el reporte."}
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

                {estadoSeleccionado === "Rechazado" && (
                  <Stack gap="sm" mb="md">
                    {razonesDisponibles.length > 1 && (
                      <MultiSelect
                        label="Razones de rechazo"
                        placeholder="Selecciona una o varias razones..."
                        data={razonesDisponibles}
                        value={razonesSeleccionadas[r._id] ?? []}
                        onChange={(vals) => {
                          setRazonesSeleccionadas((prev) => ({ ...prev, [r._id]: vals }));
                          if (!vals.includes("Otro")) setOtrosCuales((prev) => ({ ...prev, [r._id]: "" }));
                        }}
                        disabled={readOnly || !puedoAval}
                        radius="md"
                      />
                    )}
                    {(razonesSeleccionadas[r._id] ?? []).includes("Otro") && (
                      <TextInput
                        label='Especifica "Otro ¿Cuál?"'
                        placeholder="Escribe aquí..."
                        value={otrosCuales[r._id] ?? ""}
                        onChange={(e) => { const v = e.currentTarget.value; setOtrosCuales((prev) => ({ ...prev, [r._id]: v })); }}
                        disabled={readOnly || !puedoAval}
                        radius="md"
                      />
                    )}
                    <Textarea
                      label="Observaciones del rechazo"
                      placeholder="Escribe aquí el motivo del rechazo para el responsable..."
                      value={comentarios[r._id] ?? r.aval_comentario ?? ""}
                      onChange={(e) => { const v = e.currentTarget.value; setComentarios((prev) => ({ ...prev, [r._id]: v })); }}
                      rows={4}
                      radius="md"
                      disabled={readOnly || !puedoAval}
                    />

                    <Paper withBorder radius="lg" p="md" style={{ background: "#fff", borderColor: "#fee2e2" }}>
                      <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                        <div>
                          <Text size="sm" fw={700}>Formulario enviado por el responsable</Text>
                          <Text size="xs" c="dimmed">
                            Revisa las respuestas en linea. Solo puedes agregar comentarios; las respuestas no se editan.
                          </Text>
                        </div>
                        <Badge color="red" variant="light">Comentarios por campo</Badge>
                      </Group>

                      <Stack gap="sm">
                        {r.respuestas.map((respuestaCampo, index) => {
                          const campoKey = getRespuestaCampoKey(respuestaCampo, index);
                          const valorCampo = getRespuestaCampoValor(respuestaCampo);
                          const comentarioCampo =
                            comentariosCampos[r._id]?.[campoKey] ?? respuestaCampo.comentario_lider ?? "";

                          return (
                            <Paper
                              key={campoKey}
                              withBorder
                              radius="md"
                              p="sm"
                              style={{ background: "var(--mantine-color-default-hover)" }}
                            >
                              <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>
                                {respuestaCampo.etiqueta || `Pregunta ${index + 1}`}
                              </Text>

                              {respuestaCampo.url ? (
                                <Button
                                  size="xs"
                                  variant="light"
                                  color="blue"
                                  component="a"
                                  href={respuestaCampo.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  leftSection={<IconFileTypePdf size={13} />}
                                  mb="sm"
                                >
                                  {respuestaCampo.nombre_original || "Abrir archivo"}
                                </Button>
                              ) : (
                                <Text size="sm" mb="sm" style={{ whiteSpace: "pre-wrap" }}>
                                  {valorCampo || <span style={{ color: "#94a3b8" }}>Sin respuesta</span>}
                                </Text>
                              )}

                              <Textarea
                                label="Comentario del lider"
                                placeholder="Comentario puntual para esta respuesta..."
                                value={comentarioCampo}
                                onChange={(e) => {
                                  const value = e.currentTarget.value;
                                  setComentariosCampos((prev) => ({
                                    ...prev,
                                    [r._id]: {
                                      ...(prev[r._id] ?? {}),
                                      [campoKey]: value,
                                    },
                                  }));
                                }}
                                minRows={2}
                                autosize
                                radius="md"
                                disabled={readOnly || !puedoAval}
                              />
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Paper>
                  </Stack>
                )}

                {!puedoAval && (
                  <Paper withBorder radius="md" p="sm" mb="md" style={{ background: "var(--mantine-color-default-hover)" }}>
                    <Text size="sm" c="dimmed">
                      {avalEstado === "Pendiente"
                        ? "Este formulario sigue en revisión."
                        : `La evaluación ya fue cerrada con estado ${AVAL_LABEL[avalEstado].toLowerCase()}.`}
                    </Text>
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

const PLAN_COLOR: Record<string, string> = { Validado: "teal", Devuelto: "orange" };
const PLAN_LABEL: Record<string, string> = {
  Validado: "Validado por Planeación",
  Devuelto: "Devuelto con observaciones por Planeación",
};

function PlaneacionRevisionPanel({
  indicadorId,
  periodos,
  adminEmail = "",
  preferredPeriodo = "",
}: {
  indicadorId: string;
  periodos: Periodo[];
  adminEmail?: string;
  preferredPeriodo?: string;
}) {
  const [respuestas, setRespuestas] = useState<RespuestaFormulario[]>([]);
  const [loading, setLoading]       = useState(true);
  const [estados, setEstados]       = useState<Record<string, "Validado" | "Devuelto">>({});
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [savingId, setSavingId]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    axios.get(PDI_ROUTES.formularioRespuestasPorIndicador(), { params: { indicador_id: indicadorId } })
      .then((res) => setRespuestas(
        deduplicarRespuestas((res.data as RespuestaFormulario[]).filter(
          (item) => item.estado === "Enviado" && item.estado_aval === "Aprobado"
        ))
      ))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [indicadorId]);

  const handleEvaluar = async (r: RespuestaFormulario) => {
    const estado = estados[r._id];
    if (!estado) {
      showNotification({ title: "Requerido", message: "Selecciona el estado de evaluación", color: "orange" });
      return;
    }
    const formId = typeof r.formulario_id === "string" ? r.formulario_id : (r.formulario_id as any)._id;
    setSavingId(r._id);
    try {
      await axios.put(PDI_ROUTES.formularioPlaneacion(formId, r._id), {
        estado,
        por: adminEmail,
        comentario: comentarios[r._id] ?? "",
      });
      load();
      showNotification({
        title: estado === "Validado" ? "Validado por Planeación" : "Devuelto",
        message: `Formulario ${estado === "Validado" ? "validado y consolidado" : "devuelto con observaciones"} correctamente`,
        color: estado === "Validado" ? "teal" : "orange",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar la evaluación de Planeación", color: "red" });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <Center py="sm"><Loader size="sm" /></Center>;
  if (respuestas.length === 0) {
    return (
      <Paper withBorder radius="xl" p="lg">
        <Text size="sm" c="dimmed" ta="center">
          No hay reportes aprobados por el líder pendientes de revisión por Planeación.
        </Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {respuestas
        .slice()
        .sort((a, b) => {
          const pa = resolvePeriodoForRespuesta(periodos, a, preferredPeriodo);
          const pb = resolvePeriodoForRespuesta(periodos, b, preferredPeriodo);
          return normalizePeriodo(pb?.periodo ?? b.corte).localeCompare(normalizePeriodo(pa?.periodo ?? a.corte));
        })
        .map((r) => {
          const periodo        = resolvePeriodoForRespuesta(periodos, r, preferredPeriodo);
          const periodoMostrado = periodo?.periodo ?? "Sin periodo asociado";
          const avanceNum      = periodo?.avance != null ? Number(periodo.avance) : null;
          const metaNum        = periodo?.meta   != null ? Number(periodo.meta)   : null;
          const pct            = avanceNum != null && metaNum && metaNum > 0
            ? Math.min(Math.round((avanceNum / metaNum) * 100), 100) : null;
          const planEstado     = r.aval_planeacion ?? null;
          const puedoEvaluar   = !planEstado || planEstado === "Pendiente";
          const estadoSel      = estados[r._id] ?? "";
          const formularioNombre = typeof r.formulario_id === "string" ? "Formulario" : (r.formulario_id as any).nombre ?? "Formulario";
          const documentosFormulario = getDocumentosFormulario(r);

          return (
            <Paper key={r._id} withBorder radius="xl" p="lg" shadow="sm">
              <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap">
                <div>
                  <Group gap={8} mb={6}>
                    <Badge color="violet" variant="filled" radius="xl">{periodoMostrado}</Badge>
                    <Badge color="teal" variant="light" radius="xl" leftSection={<IconShieldCheck size={12} />}>
                      Aprobado por el líder
                    </Badge>
                    {planEstado && planEstado !== "Pendiente" && (
                      <Badge color={PLAN_COLOR[planEstado]} variant="filled" radius="xl">
                        {PLAN_LABEL[planEstado]}
                      </Badge>
                    )}
                  </Group>
                  <Text fw={700}>Reporte enviado por {r.respondido_por}</Text>
                  <Text size="sm" c="dimmed">
                    {r.fecha_envio ? `Enviado el ${new Date(r.fecha_envio).toLocaleDateString("es-CO")}` : "Sin fecha de envío"}
                  </Text>
                </div>
              </Group>

              {/* Avance */}
              <Paper withBorder radius="xl" p="md" mb="lg" style={{ borderLeft: "4px solid #7c3aed", background: "#fff" }}>
                <Group justify="space-between" align="flex-start" mb="sm" wrap="wrap">
                  <div>
                    <Text size="lg" fw={800}>{periodoMostrado}</Text>
                    <Text size="sm" c="dimmed" mt={4}>Meta definida: <b>{periodo?.meta ?? "Sin dato"}</b></Text>
                  </div>
                  <Box style={{ minWidth: 160, padding: "8px 12px", borderRadius: 10, background: "var(--mantine-color-default-hover)" }}>
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

              <Divider mb="lg" />

              {/* Documento */}
              <Paper withBorder radius="xl" p="lg" mb="lg" style={{ background: "#fff", borderColor: "#d9d9d9", boxShadow: "0 10px 24px rgba(15,23,42,0.05)" }}>
                <Group justify="space-between" mb="md" wrap="wrap">
                  <div>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">Documento evaluado</Text>
                    <Title order={6}>{formularioNombre}</Title>
                    <Text size="xs" c="dimmed" mt={4}>Periodo: {periodoMostrado}</Text>
                  </div>
                  <Group gap="xs">
                    {r.word_url && (
                      <Button size="xs" variant="light" color="blue" component="a" href={r.word_url} target="_blank" rel="noreferrer">
                        Ver reporte
                      </Button>
                    )}
                  </Group>
                </Group>
                <Paper withBorder radius="md" p="md" style={{ background: "var(--mantine-color-default-hover)" }}>
                  <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                    <div>
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">Evidencias adjuntas</Text>
                      <Text size="sm" fw={600} mt={3}>
                        {documentosFormulario.length > 0 ? `${documentosFormulario.length} archivo(s)` : "Sin evidencia adjunta"}
                      </Text>
                    </div>
                    {documentosFormulario.length > 0 && (
                      <Group gap="xs" wrap="wrap">
                        {documentosFormulario.filter(d => !!d.url).map((d, i) => (
                          <Button key={d._id ?? i} size="xs" variant="light" color="violet" component="a" href={d.url!} target="_blank" rel="noreferrer" leftSection={<IconFileTypePdf size={13} />}>
                            {documentosFormulario.length > 1 ? `Abrir evidencia ${i + 1}` : "Abrir evidencia"}
                          </Button>
                        ))}
                      </Group>
                    )}
                  </Group>
                </Paper>
              </Paper>

              {/* Panel de evaluación Planeación */}
              <Paper withBorder radius="xl" p="lg" style={{ background: "rgba(0,128,100,0.03)", borderColor: "#c3fae8" }}>
                <Title order={5} mb="xs">
                  {puedoEvaluar ? "Evaluación de Planeación" : "Estado de Planeación"}
                </Title>
                <Text size="sm" c="dimmed" mb="md">
                  {puedoEvaluar
                    ? "El reporte fue aprobado por el líder. Define si queda validado o si requiere ajustes."
                    : "Evaluación de Planeación ya registrada."}
                </Text>

                {planEstado && planEstado !== "Pendiente" && (
                  <Paper withBorder radius="md" p="sm" mb="md" style={{ background: planEstado === "Validado" ? "rgba(18,184,134,0.06)" : "rgba(255,146,43,0.06)", borderColor: planEstado === "Validado" ? "#c3fae8" : "#ffe8cc" }}>
                    <Group gap={8}>
                      {planEstado === "Validado" ? <IconShieldCheck size={16} color="#0ca678" /> : <IconShieldX size={16} color="#e8590c" />}
                      <div>
                        <Text size="sm" fw={700}>{PLAN_LABEL[planEstado]}</Text>
                        {r.aval_planeacion_por && <Text size="xs" c="dimmed">Por: {r.aval_planeacion_por}</Text>}
                        {r.aval_planeacion_comentario && <Text size="sm" mt={4}>{r.aval_planeacion_comentario}</Text>}
                      </div>
                    </Group>
                  </Paper>
                )}

                {puedoEvaluar && (
                  <Stack gap="sm">
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                      <Select
                        label="Estado de evaluación"
                        placeholder="Selecciona..."
                        data={[
                          { value: "Validado", label: "Validado por Planeación" },
                          { value: "Devuelto", label: "Devuelto con observaciones por Planeación" },
                        ]}
                        value={estadoSel || null}
                        onChange={(val) => {
                          if (!val) return;
                          setEstados((prev) => ({ ...prev, [r._id]: val as "Validado" | "Devuelto" }));
                        }}
                        radius="md"
                      />
                      <Box style={{ padding: "12px 14px", borderRadius: 12, background: "var(--mantine-color-default-hover)", alignSelf: "end" }}>
                        <Text size="xs" c="dimmed">Estado actual de Planeación</Text>
                        <Text fw={700} mt={4}>{planEstado ? PLAN_LABEL[planEstado] : "Sin evaluar"}</Text>
                      </Box>
                    </SimpleGrid>

                    {estadoSel === "Devuelto" && (
                      <Textarea
                        label="Observaciones de Planeación"
                        placeholder="Describe qué debe ajustar o complementar el responsable..."
                        value={comentarios[r._id] ?? ""}
                        onChange={(e) => { const v = e.currentTarget.value; setComentarios((prev) => ({ ...prev, [r._id]: v })); }}
                        rows={3}
                        radius="md"
                      />
                    )}

                    <Group justify="flex-end">
                      <Button
                        color={estadoSel === "Validado" ? "teal" : "orange"}
                        radius="xl"
                        loading={savingId === r._id}
                        disabled={!estadoSel}
                        leftSection={estadoSel === "Validado" ? <IconShieldCheck size={14} /> : <IconShieldX size={14} />}
                        onClick={() => handleEvaluar(r)}
                      >
                        Guardar evaluación de Planeación
                      </Button>
                    </Group>
                  </Stack>
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
  const origen = searchParams?.get("origen") ?? "";
  const modo = searchParams?.get("modo") ?? "";
  const preferredPeriodo = searchParams?.get("periodo") ?? "";
  const indicadorId = params?.indicadorId as string;
  const { config } = usePdiConfig();
  const { userRole } = useRole();
  const { data: session } = useSession();
  const vieneDeMisIndicadores =
    currentPath.startsWith("/pdi/mis-indicadores/") ||
    origen === "mis-indicadores";
  const fuerzaVistaEvaluacion = modo === "evaluar";
  const admin = !vieneDeMisIndicadores && isAdmin(userRole);

  const [indicador, setIndicador] = useState<Indicador | null>(null);
  const [loading, setLoading]     = useState(true);
  const [reportePeriodo, setReportePeriodo] = useState<string | null>(null);
  const [isLider, setIsLider]     = useState(false);
  const [liderEmail, setLiderEmail] = useState("");
  const [cortesVigentes, setCortesVigentes] = useState<Array<{ nombre: string; estado: string }>>([]);

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
        setLiderEmail(le);
        if (le && le === email) {
          setIsLider(true);
        } else {
          setIsLider(false);
        }
      })
      .catch(() => {});
  }, [indicadorId, session?.user?.email]);

  useEffect(() => {
    axios.get(PDI_ROUTES.cortesVigentes())
      .then(r => setCortesVigentes(r.data))
      .catch(() => {});
  }, []);

  const mostrarVistaLider = isLider || fuerzaVistaEvaluacion;
  const emailSesion = (session?.user?.email ?? "").toLowerCase().trim();
  const corteActivo = indicador
    ? (cortesVigentes.find((c) =>
        (indicador.periodos ?? []).some((p) => normalizePeriodo(p.periodo) === normalizePeriodo(c.nombre))
      )?.nombre ?? null)
    : null;
  const semColor = indicador ? SEMAFORO_COLORS[indicador.semaforo] : "#aaa";
  const avanceMostrado = indicador ? getIndicadorAvanceMostrado(indicador) : null;
  const periodosVisibles = indicador
    ? (
        admin
          ? getPeriodosReportados(indicador.periodos ?? [])
          : (indicador.periodos ?? [])
      )
    : [];
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
              <Title order={3} style={{ background: "linear-gradient(90deg, #7c3aed, #3b82f6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>{admin && !mostrarVistaLider ? "Avances y evidencias" : "Indicador de resultado"}</Title>
              <Text size="sm" c="dimmed">
                {admin && !mostrarVistaLider ? config.nombre : `${config.nombre} - Seguimiento, reportes y evidencias`}
              </Text>
            </div>
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : !indicador ? (
            <Center py="xl"><Text c="dimmed">No se encontró el indicador</Text></Center>
          ) : (
            <Stack gap="lg">

              {/* Ficha del indicador */}
              <Paper withBorder radius="xl" p={admin && !mostrarVistaLider ? "lg" : "xl"} shadow="sm">
                <Group gap={12} align="flex-start" mb="md">
                  <div
                    style={{
                      width: admin && !mostrarVistaLider ? 10 : 12,
                      height: admin && !mostrarVistaLider ? 10 : 12,
                      borderRadius: "50%",
                      background: semColor,
                      marginTop: admin && !mostrarVistaLider ? 4 : 6,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <Text size="xs" fw={700} c="dimmed">{indicador.codigo}</Text>
                    {admin && !mostrarVistaLider ? (
                      <Text fw={700} size="md">{indicador.nombre}</Text>
                    ) : (
                      <Title order={4}>{indicador.nombre}</Title>
                    )}
                  </div>
                  {(!admin || mostrarVistaLider) && (
                    <Badge color={indicador.semaforo === "verde" ? "teal" : indicador.semaforo === "amarillo" ? "yellow" : "red"} variant="light">
                      {`${avanceMostrado}%`}
                    </Badge>
                  )}
                </Group>

                {admin && !mostrarVistaLider ? (
                  <div style={{
                    display: "flex",
                    gap: 0,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid #ede9fe",
                    background: "#faf8ff",
                  }}>
                    {[
                      { label: `Meta ${config.anio_fin}`, value: String(indicador.meta_final_2029 ?? "—") },
                      { label: "Seguimiento", value: indicador.tipo_seguimiento || "Semestral" },
                      { label: "Avance actual", value: `${avanceMostrado}%` },
                    ].map((s, i, arr) => (
                      <div key={s.label} style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRight: i < arr.length - 1 ? "1px solid #ede9fe" : "none",
                      }}>
                        <Text size="xs" fw={600} c="violet.6">{s.label}</Text>
                        <Text size="md" fw={600} c="dimmed" mt={2} style={{ textTransform: "capitalize" }}>{s.value}</Text>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{
                    display: "flex",
                    gap: 0,
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid #ede9fe",
                    background: "#faf8ff",
                  }}>
                    {[
                      { label: `Meta ${config.anio_fin}`, value: String(indicador.meta_final_2029 ?? "—") },
                      { label: "Seguimiento", value: indicador.tipo_seguimiento || "Semestral" },
                      { label: "Avance actual", value: `${avanceMostrado}%` },
                      ...(indicador.responsable ? [{ label: "Responsable", value: indicador.responsable }] : []),
                    ].map((s, i, arr) => (
                      <div key={s.label} style={{
                        flex: 1,
                        padding: "10px 14px",
                        borderRight: i < arr.length - 1 ? "1px solid #ede9fe" : "none",
                      }}>
                        <Text size="xs" fw={600} c="violet.6">{s.label}</Text>
                        <Text size="md" fw={600} c="dimmed" mt={2} style={{ textTransform: "capitalize" }}>{s.value}</Text>
                      </div>
                    ))}
                  </div>
                )}

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
                  {!admin && corteActivo && (() => {
                    const periodoActivo = (indicador.periodos ?? []).find(
                      p => normalizePeriodo(p.periodo) === normalizePeriodo(corteActivo)
                    );
                    const avanceNum = periodoActivo?.avance != null ? Number(periodoActivo.avance) : null;
                    const metaNum   = periodoActivo?.meta   != null ? Number(periodoActivo.meta)   : null;
                    const pct = avanceNum != null && metaNum && metaNum > 0
                      ? Math.min(Math.round((avanceNum / metaNum) * 100), 100)
                      : null;
                    const yaReportado = periodoActivo?.estado_reporte && periodoActivo.estado_reporte !== "Borrador";
                    return (
                      <Paper
                        withBorder
                        radius="xl"
                        p="lg"
                        style={{
                          borderLeft: "4px solid #7c3aed",
                          background: "linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(124,58,237,0.02) 100%)",
                        }}
                      >
                        <Group justify="space-between" align="flex-start" wrap="wrap" mb={pct != null ? "md" : 0}>
                          <div>
                            <Group gap={8} mb={6}>
                              <Badge color="violet" variant="filled" radius="xl" size="lg">
                                Corte activo: {corteActivo}
                              </Badge>
                              {periodoActivo?.estado_reporte && periodoActivo.estado_reporte !== "Borrador" && (
                                <Badge color={ESTADO_COLORS[periodoActivo.estado_reporte]} variant="light" radius="xl">
                                  {periodoActivo.estado_reporte}
                                </Badge>
                              )}
                            </Group>
                            <Text fw={700} size="md">
                              {yaReportado ? "Reporte enviado para este corte" : "Este es el corte activo a reportar"}
                            </Text>
                            <Group gap={16} mt={4}>
                              <Text size="sm" c="dimmed">Meta: <b>{periodoActivo?.meta ?? "—"}</b></Text>
                              {avanceNum != null && <Text size="sm" c="dimmed">Avance reportado: <b>{avanceNum}</b></Text>}
                              {pct != null && <Text size="sm" c="dimmed">Cumplimiento: <b>{pct}%</b></Text>}
                            </Group>
                          </div>
                          <Button
                            color="violet"
                            radius="xl"
                            leftSection={<IconEdit size={14} />}
                            onClick={() => setReportePeriodo(corteActivo)}
                          >
                            {yaReportado ? "Actualizar reporte" : "Reportar este corte"}
                          </Button>
                        </Group>
                        {pct != null && (
                          <Progress value={pct} color="violet" size="sm" radius="xl" />
                        )}
                      </Paper>
                    );
                  })()}

                  {!admin && (
                  <div>
                    <Group justify="space-between" mb="sm">
                      <Title order={5}>{admin ? "Avance por periodo" : "Reportes de avance por corte"}</Title>
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

                    {periodosVisibles.length === 0 ? (
                      <Paper withBorder radius="md" p="lg">
                        <Text c="dimmed" ta="center" size="sm">
                          {admin
                            ? "Este indicador todavía no tiene periodos reportados."
                            : "Sin reportes registrados. Haz clic en \"Nuevo periodo\" para agregar el primer corte."}
                        </Text>
                      </Paper>
                    ) : (
                      <Stack gap="sm">
                        {[...periodosVisibles]
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
                  )}

                  {!admin && <Divider />}

                  {!admin && (
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
                        <Title order={5} mb="xs">
                          <Group gap={6}>
                            <IconForms size={18} />
                            Revisión y validación por Planeación
                          </Group>
                        </Title>
                        <Text size="sm" c="dimmed" mb="md">
                          Solo se muestran reportes ya aprobados por el líder del macroproyecto. Planeación puede validarlos o devolverlos con observaciones.
                        </Text>
                        <PlaneacionRevisionPanel
                          indicadorId={indicador._id}
                          periodos={indicador.periodos}
                          adminEmail={emailSesion}
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
