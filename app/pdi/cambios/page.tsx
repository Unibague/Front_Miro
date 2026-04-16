"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Button, Center, Container, Group, Loader,
  Modal, Paper, Select, Stack, Text, Textarea, TextInput,
  ThemeIcon, Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowLeft, IconCheck, IconGitPullRequest, IconPlus, IconX,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import type { SolicitudCambio, TipoCambio, TipoEntidad, EstadoCambio } from "../types";

// ── Config ────────────────────────────────────────────────────────────────

const TIPO_CAMBIO_LABEL: Record<TipoCambio, string> = {
  alcance:      "Alcance",
  meta:         "Meta / Indicador",
  cronograma:   "Cronograma / Fechas",
  presupuesto:  "Presupuesto",
  responsable:  "Responsable",
  otro:         "Otro",
};

const TIPO_ENTIDAD_LABEL: Record<TipoEntidad, string> = {
  macroproyecto: "Macroproyecto",
  proyecto:      "Proyecto",
  accion:        "Acción estratégica",
  indicador:     "Indicador",
};

const ESTADO_COLOR: Record<EstadoCambio, string> = {
  "Pendiente":    "gray",
  "En Revisión":  "blue",
  "Aprobado":     "teal",
  "Rechazado":    "red",
};

// ── Formulario nueva solicitud ────────────────────────────────────────────

function NuevaSolicitudModal({
  opened, onClose, onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  onCreated: (s: SolicitudCambio) => void;
}) {
  const [entidadTipo, setEntidadTipo]   = useState<TipoEntidad | null>(null);
  const [entidadCodigo, setEntidadCodigo] = useState("");
  const [entidadNombre, setEntidadNombre] = useState("");
  const [tipoCambio, setTipoCambio]     = useState<TipoCambio | null>(null);
  const [campoAfectado, setCampoAfectado] = useState("");
  const [descripcion, setDescripcion]   = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [valorAnterior, setValorAnterior] = useState("");
  const [valorPropuesto, setValorPropuesto] = useState("");
  const [solicitadoPor, setSolicitadoPor] = useState("");
  const [periodo, setPeriodo]           = useState("");
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    if (!opened) {
      setEntidadTipo(null); setEntidadCodigo(""); setEntidadNombre("");
      setTipoCambio(null); setCampoAfectado(""); setDescripcion("");
      setJustificacion(""); setValorAnterior(""); setValorPropuesto("");
      setSolicitadoPor(""); setPeriodo("");
    }
  }, [opened]);

  const handleSave = async () => {
    if (!entidadTipo || !tipoCambio || !descripcion.trim() || !solicitadoPor.trim()) {
      showNotification({ title: "Error", message: "Entidad, tipo de cambio, descripción y solicitante son requeridos", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(PDI_ROUTES.cambios(), {
        entidad_tipo:    entidadTipo,
        entidad_codigo:  entidadCodigo.trim(),
        entidad_nombre:  entidadNombre.trim(),
        tipo_cambio:     tipoCambio,
        campo_afectado:  campoAfectado.trim(),
        descripcion:     descripcion.trim(),
        justificacion:   justificacion.trim(),
        valor_anterior:  valorAnterior.trim() || null,
        valor_propuesto: valorPropuesto.trim() || null,
        solicitado_por:  solicitadoPor.trim(),
        periodo:         periodo.trim(),
      });
      showNotification({ title: "Solicitud creada", message: "La solicitud fue registrada exitosamente", color: "teal" });
      onCreated(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Nueva solicitud de cambio" centered size="lg">
      <Stack gap="sm">
        <Group grow>
          <Select
            label="Entidad"
            placeholder="Selecciona"
            data={Object.entries(TIPO_ENTIDAD_LABEL).map(([v, l]) => ({ value: v, label: l }))}
            value={entidadTipo}
            onChange={(v) => setEntidadTipo(v as TipoEntidad)}
          />
          <Select
            label="Tipo de cambio"
            placeholder="Selecciona"
            data={Object.entries(TIPO_CAMBIO_LABEL).map(([v, l]) => ({ value: v, label: l }))}
            value={tipoCambio}
            onChange={(v) => setTipoCambio(v as TipoCambio)}
          />
        </Group>
        <Group grow>
          <TextInput label="Código de la entidad" placeholder="Ej: 1.2.3" value={entidadCodigo} onChange={(e) => setEntidadCodigo(e.currentTarget.value)} />
          <TextInput label="Nombre de la entidad" placeholder="Nombre del proyecto/acción..." value={entidadNombre} onChange={(e) => setEntidadNombre(e.currentTarget.value)} />
        </Group>
        <Group grow>
          <TextInput label="Campo afectado" placeholder="Ej: fecha_fin, presupuesto..." value={campoAfectado} onChange={(e) => setCampoAfectado(e.currentTarget.value)} />
          <TextInput label="Periodo (opcional)" placeholder="Ej: 2026A" value={periodo} onChange={(e) => setPeriodo(e.currentTarget.value)} />
        </Group>
        <Textarea label="Descripción del cambio" placeholder="Describa detalladamente el cambio solicitado..." value={descripcion} onChange={(e) => setDescripcion(e.currentTarget.value)} rows={3} required />
        <Textarea label="Justificación" placeholder="¿Por qué se solicita este cambio?" value={justificacion} onChange={(e) => setJustificacion(e.currentTarget.value)} rows={2} />
        <Group grow>
          <TextInput label="Valor anterior" placeholder="Valor actual" value={valorAnterior} onChange={(e) => setValorAnterior(e.currentTarget.value)} />
          <TextInput label="Valor propuesto" placeholder="Nuevo valor" value={valorPropuesto} onChange={(e) => setValorPropuesto(e.currentTarget.value)} />
        </Group>
        <TextInput label="Solicitado por" placeholder="Nombre del solicitante" value={solicitadoPor} onChange={(e) => setSolicitadoPor(e.currentTarget.value)} required />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={loading} onClick={handleSave}>Enviar solicitud</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── Modal de revisión ─────────────────────────────────────────────────────

function RevisionModal({
  solicitud, opened, onClose, onRevisada,
}: {
  solicitud: SolicitudCambio | null;
  opened: boolean;
  onClose: () => void;
  onRevisada: (s: SolicitudCambio) => void;
}) {
  const [comentario, setComentario] = useState("");
  const [revisadoPor, setRevisadoPor] = useState("");
  const [loading, setLoading]       = useState(false);

  useEffect(() => { if (!opened) { setComentario(""); setRevisadoPor(""); } }, [opened]);

  const handleRevision = async (estado: "Aprobado" | "Rechazado") => {
    if (!solicitud) return;
    if (!revisadoPor.trim()) {
      showNotification({ title: "Error", message: "Indica quién está revisando", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const res = await axios.patch(PDI_ROUTES.cambioRevision(solicitud._id), {
        estado,
        revisado_por: revisadoPor.trim(),
        comentario_revision: comentario.trim(),
      });
      showNotification({ title: `Solicitud ${estado}`, message: `La solicitud fue ${estado.toLowerCase()}`, color: estado === "Aprobado" ? "teal" : "red" });
      onRevisada(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al revisar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  if (!solicitud) return null;

  return (
    <Modal opened={opened} onClose={onClose} title="Revisar solicitud de cambio" centered size="md">
      <Stack gap="sm">
        <Paper withBorder radius="md" p="sm">
          <Group gap={8} mb={4}>
            <Badge color="blue" variant="light" size="xs">{TIPO_CAMBIO_LABEL[solicitud.tipo_cambio]}</Badge>
            <Badge color="gray" variant="light" size="xs">{TIPO_ENTIDAD_LABEL[solicitud.entidad_tipo]}</Badge>
            {solicitud.entidad_codigo && <Text size="xs" fw={600}>{solicitud.entidad_codigo}</Text>}
          </Group>
          <Text size="sm" fw={600}>{solicitud.descripcion}</Text>
          {solicitud.justificacion && <Text size="xs" c="dimmed" mt={4}>{solicitud.justificacion}</Text>}
          {(solicitud.valor_anterior || solicitud.valor_propuesto) && (
            <Group gap={16} mt={8}>
              {solicitud.valor_anterior != null && (
                <div>
                  <Text size="xs" c="dimmed">Valor anterior</Text>
                  <Text size="sm">{String(solicitud.valor_anterior)}</Text>
                </div>
              )}
              {solicitud.valor_propuesto != null && (
                <div>
                  <Text size="xs" c="dimmed">Valor propuesto</Text>
                  <Text size="sm" fw={600}>{String(solicitud.valor_propuesto)}</Text>
                </div>
              )}
            </Group>
          )}
          <Text size="xs" c="dimmed" mt={6}>Solicitado por: {solicitud.solicitado_por}</Text>
        </Paper>
        <TextInput label="Revisado por" placeholder="Tu nombre" value={revisadoPor} onChange={(e) => setRevisadoPor(e.currentTarget.value)} required />
        <Textarea label="Comentario de revisión" placeholder="Justificación de la decisión..." value={comentario} onChange={(e) => setComentario(e.currentTarget.value)} rows={3} />
        <Group justify="flex-end" mt="sm" gap="sm">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button color="red" variant="light" leftSection={<IconX size={14} />} loading={loading} onClick={() => handleRevision("Rechazado")}>
            Rechazar
          </Button>
          <Button color="teal" leftSection={<IconCheck size={14} />} loading={loading} onClick={() => handleRevision("Aprobado")}>
            Aprobar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── Página principal ──────────────────────────────────────────────────────

export default function CambiosPage() {
  const router = useRouter();

  const [solicitudes, setSolicitudes] = useState<SolicitudCambio[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
  const [nuevaOpen, setNuevaOpen]     = useState(false);
  const [revisionSol, setRevisionSol] = useState<SolicitudCambio | null>(null);

  const cargar = async (estado?: string | null) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (estado) params.estado = estado;
      const res = await axios.get(PDI_ROUTES.cambios(), { params });
      setSolicitudes(res.data.data ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(filtroEstado); }, [filtroEstado]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="xl" py="xl">

          {/* Header */}
          <Group justify="space-between" mb="xl">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={42} radius="xl" color="violet" variant="light">
                <IconGitPullRequest size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Gestión de cambios PDI</Title>
                <Text size="sm" c="dimmed">Solicitudes de modificación a proyectos, metas, fechas y presupuesto</Text>
              </div>
            </Group>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setNuevaOpen(true)}>
              Nueva solicitud
            </Button>
          </Group>

          {/* Filtros */}
          <Group mb="md" gap="sm">
            {([null, "Pendiente", "En Revisión", "Aprobado", "Rechazado"] as (EstadoCambio | null)[]).map((e) => (
              <Badge
                key={e ?? "todos"}
                color={e ? ESTADO_COLOR[e] : "violet"}
                variant={filtroEstado === e ? "filled" : "light"}
                style={{ cursor: "pointer" }}
                onClick={() => setFiltroEstado(e)}
              >
                {e ?? "Todos"}
              </Badge>
            ))}
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : solicitudes.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="sm">
                <ThemeIcon size={60} radius="xl" color="gray" variant="light">
                  <IconGitPullRequest size={30} />
                </ThemeIcon>
                <Text c="dimmed">No hay solicitudes de cambio{filtroEstado ? ` en estado "${filtroEstado}"` : ""}</Text>
              </Stack>
            </Center>
          ) : (
            <Stack gap="sm">
              {solicitudes.map((s) => (
                <Paper key={s._id} withBorder radius="md" p="md">
                  <Group justify="space-between" mb="xs">
                    <Group gap={8}>
                      <Badge color={ESTADO_COLOR[s.estado]} variant="light" size="sm">{s.estado}</Badge>
                      <Badge color="violet" variant="light" size="sm">{TIPO_CAMBIO_LABEL[s.tipo_cambio]}</Badge>
                      <Badge color="gray" variant="light" size="sm">{TIPO_ENTIDAD_LABEL[s.entidad_tipo]}</Badge>
                      {s.entidad_codigo && <Text size="xs" fw={700} c="dimmed">{s.entidad_codigo}</Text>}
                      {s.entidad_nombre && <Text size="xs" c="dimmed">{s.entidad_nombre}</Text>}
                    </Group>
                    {(s.estado === "Pendiente" || s.estado === "En Revisión") && (
                      <Button size="xs" variant="light" color="violet" onClick={() => setRevisionSol(s)}>
                        Revisar
                      </Button>
                    )}
                  </Group>

                  <Text size="sm" fw={600} mb={4}>{s.descripcion}</Text>
                  {s.justificacion && <Text size="xs" c="dimmed" mb={4}>{s.justificacion}</Text>}

                  {(s.valor_anterior != null || s.valor_propuesto != null) && (
                    <Group gap={24} mb={4}>
                      {s.valor_anterior != null && (
                        <Text size="xs">Antes: <strong>{String(s.valor_anterior)}</strong></Text>
                      )}
                      {s.valor_propuesto != null && (
                        <Text size="xs">Propuesto: <strong>{String(s.valor_propuesto)}</strong></Text>
                      )}
                    </Group>
                  )}

                  <Group justify="space-between" mt={4}>
                    <Text size="xs" c="dimmed">
                      Solicitado por {s.solicitado_por} · {new Date(s.fecha_solicitud).toLocaleDateString("es-CO")}
                    </Text>
                    {s.revisado_por && (
                      <Text size="xs" c="dimmed">
                        Revisado por {s.revisado_por}
                        {s.fecha_revision && ` · ${new Date(s.fecha_revision).toLocaleDateString("es-CO")}`}
                      </Text>
                    )}
                  </Group>
                  {s.comentario_revision && (
                    <Paper withBorder radius="sm" p="xs" mt="xs" style={{ background: "var(--mantine-color-default-hover)" }}>
                      <Text size="xs"><strong>Comentario:</strong> {s.comentario_revision}</Text>
                    </Paper>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </Container>
      </div>

      <NuevaSolicitudModal
        opened={nuevaOpen}
        onClose={() => setNuevaOpen(false)}
        onCreated={(s) => setSolicitudes((prev) => [s, ...prev])}
      />

      <RevisionModal
        solicitud={revisionSol}
        opened={!!revisionSol}
        onClose={() => setRevisionSol(null)}
        onRevisada={(updated) => {
          setSolicitudes((prev) => prev.map((s) => s._id === updated._id ? updated : s));
          setRevisionSol(null);
        }}
      />
    </div>
  );
}
