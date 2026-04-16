"use client";

import { useEffect, useRef, useState } from "react";
import {
  Stack, Group, Text, Button, TextInput, Paper,
  Badge, ActionIcon, Loader, Tooltip, Box, Progress, Modal, Select, Textarea,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconUpload, IconTrash, IconFileTypePdf, IconEye,
  IconCalendar, IconUser, IconTag, IconDownload, IconX,
  IconExternalLink, IconShieldCheck, IconCheck, IconAlertTriangle,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import dynamic from "next/dynamic";
import axios from "axios";
import type { Evidencia } from "../types";
import { PDI_ROUTES } from "../api";

// PdfVisor cargado SOLO en el cliente — nunca toca SSR
const PdfVisor = dynamic(() => import("./PdfVisor"), {
  ssr: false,
  loading: () => (
    <Box style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <Loader size="md" color="blue" />
    </Box>
  ),
});

interface Props {
  indicadorId: string;
  readOnly?: boolean;        // true = admin puede aprobar/rechazar, false = responsable sube
  periodos?: { periodo: string }[];
}

const ESTADO_COLOR: Record<string, string> = {
  "En Revisión": "yellow",
  "Aprobado":    "green",
  "Rechazado":   "red",
};
const ESTADO_ICON: Record<string, React.ReactNode> = {
  "En Revisión": <IconAlertTriangle size={11} />,
  "Aprobado":    <IconCheck size={11} />,
  "Rechazado":   <IconX size={11} />,
};

const BLUE = {
  dark:   "#1e3a5f",
  main:   "#1d4ed8",
  light:  "#3b82f6",
  soft:   "#eff6ff",
  border: "#bfdbfe",
  muted:  "#93c5fd",
};

export default function EvidenciasPanel({ indicadorId, readOnly = false, periodos = [] }: Props) {
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [visorEv, setVisorEv]       = useState<Evidencia | null>(null);

  const [file, setFile]             = useState<File | null>(null);
  const [periodo, setPeriodo]       = useState("");
  const [descripcion, setDescripcion] = useState("");
  const fileInputRef                = useRef<HTMLInputElement>(null);

  // Para el panel de revisión (admin)
  const [revision, setRevision] = useState<Record<string, { estado: string; comentario: string }>>({});

  const handleEstado = async (evId: string) => {
    const r = revision[evId];
    if (!r?.estado) return;
    try {
      const res = await axios.patch(PDI_ROUTES.evidenciaEstado(indicadorId, evId), {
        estado: r.estado,
        comentario_revision: r.comentario ?? "",
      });
      setEvidencias(prev => prev.map(e => e._id === evId ? { ...e, ...res.data } : e));
      setRevision(prev => ({ ...prev, [evId]: { estado: "", comentario: "" } }));
      showNotification({ title: "Guardado", message: `Evidencia marcada como ${r.estado}`, color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo actualizar el estado", color: "red" });
    }
  };

  const fetchEvidencias = async () => {
    try {
      const res = await axios.get(PDI_ROUTES.evidencias(indicadorId));
      setEvidencias(res.data);
    } catch {
      showNotification({ title: "Error", message: "No se pudieron cargar las evidencias", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (indicadorId) fetchEvidencias(); }, [indicadorId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf") {
      showNotification({ title: "Formato inválido", message: "Solo se permiten archivos PDF", color: "orange" });
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      showNotification({ title: "Archivo muy grande", message: "El PDF no puede superar 20 MB", color: "orange" });
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      showNotification({ title: "Sin archivo", message: "Selecciona un PDF primero", color: "orange" });
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("periodo", periodo);
    formData.append("descripcion", descripcion);
    try {
      const res = await axios.post(PDI_ROUTES.evidencias(indicadorId), formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      const nueva = res.data;
      // Eliminar automáticamente evidencias rechazadas del mismo periodo
      const rechazadasMismoPeriodo = evidencias.filter(
        e => e.estado === "Rechazado" && e.periodo === periodo
      );
      await Promise.all(
        rechazadasMismoPeriodo.map(e => axios.delete(PDI_ROUTES.evidencia(indicadorId, e._id)))
      );
      setEvidencias((prev) => [
        ...prev.filter(e => !(e.estado === "Rechazado" && e.periodo === periodo)),
        nueva,
      ]);
      setFile(null); setPeriodo(""); setDescripcion("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      showNotification({ title: "¡Listo!", message: "Evidencia subida correctamente", color: "teal" });
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al subir", color: "red" });
    } finally {
      setUploading(false); setUploadProgress(0);
    }
  };

  const handleDelete = (evId: string) => {
    modals.openConfirmModal({
      title: "Eliminar evidencia",
      centered: true,
      radius: "lg",
      children: (
        <Text size="sm" c="dimmed">
          Esta acción no se puede deshacer. ¿Estás seguro de que deseas eliminar esta evidencia?
        </Text>
      ),
      labels: { confirm: "Eliminar", cancel: "Cancelar" },
      confirmProps: { color: "red", radius: "md" },
      cancelProps: { radius: "md", variant: "default" },
      onConfirm: async () => {
        try {
          await axios.delete(PDI_ROUTES.evidencia(indicadorId, evId));
          setEvidencias((prev) => prev.filter((e) => e._id !== evId));
          showNotification({ title: "Eliminada", message: "Evidencia eliminada", color: "teal" });
        } catch {
          showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
        }
      },
    });
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });

  if (loading) return (
    <Group justify="center" py="xl"><Loader size="sm" color="blue" /></Group>
  );

  return (
    <>
      <Stack gap="md">
        {/* ── Zona de subida ── */}
        {!readOnly && (
          <Stack gap="xs">
            {/* Selector de archivo */}
            <Box
              onClick={() => fileInputRef.current?.click()}
              style={{
                cursor: "pointer",
                border: `2px dashed ${file ? "#7c3aed" : "#e2e8f0"}`,
                borderRadius: 12,
                padding: "20px 16px",
                background: file ? "#faf5ff" : "var(--mantine-color-default-hover)",
                transition: "border-color 0.2s, background 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <Box style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: file ? "#ede9fe" : "#f1f5f9",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <IconFileTypePdf size={24} color={file ? "#7c3aed" : "#94a3b8"} />
              </Box>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={600} c={file ? "violet" : "dimmed"} truncate="end">
                  {file ? file.name : "Seleccionar PDF"}
                </Text>
                <Text size="xs" c="dimmed">
                  {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Máximo 20 MB · Solo PDF"}
                </Text>
              </Box>
              {file && (
                <ActionIcon
                  size="sm" variant="subtle" color="red" radius="xl"
                  onClick={(e) => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                >
                  <IconX size={13} />
                </ActionIcon>
              )}
            </Box>
            <input ref={fileInputRef} type="file" accept="application/pdf"
              style={{ display: "none" }} onChange={handleFileChange} />

            {/* Campos de metadata */}
            <Group grow align="flex-start">
              {periodos.length > 0 ? (
                <Select
                  label="Periodo"
                  placeholder="Selecciona el periodo"
                  value={periodo || null}
                  onChange={(v) => setPeriodo(v ?? "")}
                  data={periodos.map((p) => ({ value: p.periodo, label: p.periodo }))}
                  size="sm"
                  radius="md"
                  clearable
                />
              ) : (
                <TextInput
                  label="Periodo"
                  placeholder="Ej: 2026A"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.currentTarget.value)}
                  size="sm"
                  radius="md"
                />
              )}
              <TextInput
                label="Descripción"
                placeholder="Descripción de la evidencia"
                value={descripcion}
                onChange={(e) => setDescripcion(e.currentTarget.value)}
                size="sm"
                radius="md"
              />
            </Group>

            {uploading && (
              <Box>
                <Text size="xs" c="dimmed" mb={4}>Subiendo {uploadProgress}%</Text>
                <Progress value={uploadProgress} color="violet" size="xs" radius="xl" animated />
              </Box>
            )}

            <Button
              leftSection={<IconUpload size={14} />}
              color="violet"
              variant={file ? "filled" : "light"}
              loading={uploading}
              onClick={handleUpload}
              disabled={!file}
              size="sm"
              radius="md"
              fullWidth
            >
              Subir evidencia
            </Button>
          </Stack>
        )}

        {/* ── Lista de evidencias ── */}
        {evidencias.length === 0 ? (
          <Paper withBorder radius="md" p="xl" ta="center"
            style={{ borderStyle: "dashed", borderColor: BLUE.border, background: BLUE.soft }}>
            <Box style={{
              background: "#dbeafe", borderRadius: "50%", width: 64, height: 64,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px",
            }}>
              <IconFileTypePdf size={32} color={BLUE.main} />
            </Box>
            <Text fw={600} size="sm" style={{ color: BLUE.dark }}>Sin evidencias registradas</Text>
            {!readOnly && (
              <Text c="dimmed" size="xs" mt={4}>Sube el primer PDF para este indicador</Text>
            )}
          </Paper>
        ) : (
          <Stack gap="xs">
            {evidencias.map((ev) => {
              const estado = ev.estado ?? "En Revisión";
              const rechazada = estado === "Rechazado";

              // Responsable ve evidencia rechazada: solo aviso, sin archivo ni botón
              if (!readOnly && rechazada) return (
                <Paper key={ev._id} withBorder radius="md" p="sm" style={{
                  borderLeft: "4px solid var(--mantine-color-red-5)",
                  background: "#fef2f2",
                }}>
                  <Group gap={8} align="flex-start">
                    <IconX size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                    <Box>
                      <Text size="sm" fw={700} c="red">
                        Evidencia rechazada{ev.periodo ? ` — ${ev.periodo}` : ""} — debes subir una nueva evidencia
                      </Text>
                      {ev.comentario_revision && (
                        <Text size="xs" c="dimmed" mt={2}>Motivo: {ev.comentario_revision}</Text>
                      )}
                    </Box>
                  </Group>
                </Paper>
              );

              return (
              <Paper key={ev._id} withBorder radius="md" p="sm" style={{
                borderLeft: `4px solid var(--mantine-color-${ESTADO_COLOR[estado]}-5)`,
              }}>
                {/* Cabecera: archivo + acciones */}
                <Group justify="space-between" wrap="nowrap" mb={readOnly ? "xs" : 0}>
                  <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Box style={{ background: "#f3f4f6", borderRadius: 10, padding: 10, flexShrink: 0 }}>
                      <IconFileTypePdf size={22} color={BLUE.main} />
                    </Box>
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate="end" title={ev.nombre_original}>
                        {ev.nombre_original}
                      </Text>
                      {ev.descripcion && <Text size="xs" c="dimmed" truncate="end">{ev.descripcion}</Text>}
                      <Group gap="xs" mt={4} wrap="wrap">
                        <Badge size="xs" color={ESTADO_COLOR[estado]} variant="light" leftSection={ESTADO_ICON[estado]}>
                          {estado}
                        </Badge>
                        {ev.periodo && <Badge size="xs" color="blue" variant="light" leftSection={<IconTag size={10} />}>{ev.periodo}</Badge>}
                        {ev.subido_por && <Badge size="xs" color="indigo" variant="light" leftSection={<IconUser size={10} />}>{ev.subido_por}</Badge>}
                        <Badge size="xs" color="gray" variant="light" leftSection={<IconCalendar size={10} />}>{formatDate(ev.fecha_subida)}</Badge>
                      </Group>
                    </Box>
                  </Group>
                  <Group gap="xs" wrap="nowrap">
                    <Tooltip label="Ver PDF" withArrow>
                      <ActionIcon color="blue" variant="light" size="md" onClick={() => setVisorEv(ev)}><IconEye size={16} /></ActionIcon>
                    </Tooltip>
                    <Tooltip label="Descargar" withArrow>
                      <ActionIcon component="a" href={ev.url} download={ev.nombre_original} color="indigo" variant="light" size="md"><IconDownload size={16} /></ActionIcon>
                    </Tooltip>
                    {!readOnly && (
                      <Tooltip label="Eliminar" withArrow>
                        <ActionIcon color="red" variant="light" size="md" onClick={() => handleDelete(ev._id)}><IconTrash size={16} /></ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Group>

                {/* Panel de revisión — solo admin (readOnly=true) */}
                {readOnly && (
                  <Box mt="xs" style={{ borderTop: "1px solid var(--mantine-color-default-border)", paddingTop: 8 }}>
                    <Group align="flex-end" gap="sm">
                      <Select
                        label="Cambiar estado"
                        size="xs"
                        radius="md"
                        style={{ width: 150 }}
                        data={["En Revisión", "Aprobado", "Rechazado"]}
                        value={revision[ev._id]?.estado ?? estado}
                        onChange={(v) => setRevision(prev => ({ ...prev, [ev._id]: { ...prev[ev._id], estado: v ?? "" } }))}
                      />
                      <TextInput
                        label="Comentario (opcional)"
                        placeholder="Motivo del rechazo o nota..."
                        size="xs"
                        radius="md"
                        style={{ flex: 1 }}
                        value={revision[ev._id]?.comentario ?? ""}
                        onChange={(e) => setRevision(prev => ({ ...prev, [ev._id]: { ...prev[ev._id], comentario: e.currentTarget.value } }))}
                      />
                      <Button size="xs" radius="md" color="violet" onClick={() => handleEstado(ev._id)}>
                        Guardar
                      </Button>
                    </Group>
                    {ev.comentario_revision && (
                      <Text size="xs" c="dimmed" mt={6}>Nota: <b>{ev.comentario_revision}</b></Text>
                    )}
                  </Box>
                )}

                {/* Aviso de rechazo — solo responsable (readOnly=false) */}
                {!readOnly && rechazada && (
                  <Box mt="xs" p="xs" style={{ background: "#fef2f2", borderRadius: 8, border: "1px solid #fecaca" }}>
                    <Text size="xs" c="red" fw={600}>Evidencia rechazada — debes subir una nueva</Text>
                    {ev.comentario_revision && (
                      <Text size="xs" c="dimmed" mt={2}>Motivo: {ev.comentario_revision}</Text>
                    )}
                    <Button
                      size="xs" variant="light" color="red" mt="xs"
                      leftSection={<IconUpload size={12} />}
                      onClick={() => { setPeriodo(ev.periodo ?? ""); fileInputRef.current?.click(); }}
                    >
                      Subir nueva evidencia para {ev.periodo || "este periodo"}
                    </Button>
                  </Box>
                )}
              </Paper>
              );
            })}
          </Stack>
        )}
      </Stack>

      {/* ── Modal visor PDF ── */}
      <Modal
        opened={!!visorEv}
        onClose={() => setVisorEv(null)}
        size="90vw"
        padding={0}
        withCloseButton={false}
        centered
        radius="xl"
        styles={{
          content: { overflow: "hidden", boxShadow: "0 25px 60px rgba(29,78,216,0.3)" },
          body: { padding: 0, display: "flex", flexDirection: "column", height: "92vh" },
        }}
      >
        {visorEv && (
          <>
            {/* Header azul */}
            <Box style={{
              background: `linear-gradient(135deg, ${BLUE.dark} 0%, ${BLUE.main} 60%, ${BLUE.light} 100%)`,
              padding: "16px 20px", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <Group gap="sm">
                <Box style={{
                  background: "rgba(255,255,255,0.18)", borderRadius: 10,
                  padding: "8px 10px", display: "flex", alignItems: "center",
                }}>
                  <IconFileTypePdf size={22} color="white" />
                </Box>
                <Box>
                  <Text fw={700} size="sm" c="white" style={{ lineHeight: 1.2, maxWidth: 500 }}
                    title={visorEv.nombre_original}>
                    {visorEv.nombre_original}
                  </Text>
                  <Group gap={6} mt={3}>
                    {visorEv.periodo && (
                      <Badge size="xs" style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
                        {visorEv.periodo}
                      </Badge>
                    )}
                    {visorEv.subido_por && (
                      <Badge size="xs" style={{ background: "rgba(255,255,255,0.2)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}
                        leftSection={<IconUser size={9} />}>
                        {visorEv.subido_por}
                      </Badge>
                    )}
                    <Badge size="xs" style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.2)" }}
                      leftSection={<IconCalendar size={9} />}>
                      {formatDate(visorEv.fecha_subida)}
                    </Badge>
                  </Group>
                </Box>
              </Group>

              <Group gap={8}>
                <Tooltip label="Abrir en nueva pestaña" withArrow>
                  <ActionIcon component="a" href={visorEv.url} target="_blank" rel="noopener noreferrer"
                    size="lg" radius="md" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
                    <IconExternalLink size={17} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Descargar PDF" withArrow>
                  <ActionIcon component="a" href={visorEv.url} download={visorEv.nombre_original}
                    size="lg" radius="md" style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
                    <IconDownload size={17} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Cerrar" withArrow>
                  <ActionIcon onClick={() => setVisorEv(null)} size="lg" radius="md"
                    style={{ background: "rgba(239,68,68,0.3)", color: "#fca5a5" }}>
                    <IconX size={17} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Box>

            {/* Visor — todas las páginas una debajo de la otra */}
            <Box style={{ flex: 1, overflow: "hidden" }}>
              <PdfVisor url={visorEv.url} nombre={visorEv.nombre_original} />
            </Box>
          </>
        )}
      </Modal>
    </>
  );
}
