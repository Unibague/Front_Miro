"use client";

import { useEffect, useRef, useState } from "react";
import {
  Stack, Group, Text, Button, TextInput, Textarea, Paper,
  Badge, ActionIcon, Loader, Tooltip, Box, Progress, Modal,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconUpload, IconTrash, IconFileTypePdf, IconEye,
  IconCalendar, IconUser, IconTag, IconDownload, IconX,
  IconExternalLink, IconShieldCheck,
} from "@tabler/icons-react";
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
  readOnly?: boolean;
}

const BLUE = {
  dark:   "#1e3a5f",
  main:   "#1d4ed8",
  light:  "#3b82f6",
  soft:   "#eff6ff",
  border: "#bfdbfe",
  muted:  "#93c5fd",
};

export default function EvidenciasPanel({ indicadorId, readOnly = false }: Props) {
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [visorEv, setVisorEv]       = useState<Evidencia | null>(null);

  const [file, setFile]             = useState<File | null>(null);
  const [periodo, setPeriodo]       = useState("");
  const [descripcion, setDescripcion] = useState("");
  const fileInputRef                = useRef<HTMLInputElement>(null);

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
      setEvidencias((prev) => [...prev, res.data]);
      setFile(null); setPeriodo(""); setDescripcion("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      showNotification({ title: "¡Listo!", message: "Evidencia subida correctamente", color: "teal" });
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al subir", color: "red" });
    } finally {
      setUploading(false); setUploadProgress(0);
    }
  };

  const handleDelete = async (evId: string) => {
    if (!confirm("¿Eliminar esta evidencia?")) return;
    try {
      await axios.delete(PDI_ROUTES.evidencia(indicadorId, evId));
      setEvidencias((prev) => prev.filter((e) => e._id !== evId));
      showNotification({ title: "Eliminada", message: "Evidencia eliminada", color: "gray" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo eliminar", color: "red" });
    }
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
          <Paper withBorder radius="md" p="md" style={{
            background: `linear-gradient(135deg, ${BLUE.soft} 0%, #e0f2fe 100%)`,
            borderColor: BLUE.border, borderStyle: "dashed", borderWidth: 2,
          }}>
            <Stack gap="sm">
              <Group gap="xs">
                <IconUpload size={18} color={BLUE.main} />
                <Text fw={600} size="sm" style={{ color: BLUE.main }}>Subir nueva evidencia (PDF)</Text>
              </Group>

              <Box onClick={() => fileInputRef.current?.click()} style={{
                cursor: "pointer", border: `2px dashed ${BLUE.border}`, borderRadius: 8,
                padding: "14px 16px", background: file ? BLUE.soft : "white",
                transition: "all 0.2s", display: "flex", alignItems: "center", gap: 12,
              }}>
                <Box style={{ background: file ? BLUE.soft : "#f0f9ff", borderRadius: 10, padding: 10, flexShrink: 0 }}>
                  <IconFileTypePdf size={28} color={file ? BLUE.main : BLUE.muted} />
                </Box>
                <Box>
                  <Text size="sm" fw={file ? 600 : 400} style={{ color: file ? BLUE.main : "#64748b" }}>
                    {file ? file.name : "Haz clic para seleccionar un PDF"}
                  </Text>
                  {file
                    ? <Text size="xs" c="dimmed">{(file.size / 1024 / 1024).toFixed(2)} MB</Text>
                    : <Text size="xs" c="dimmed">Máximo 20 MB · Solo archivos PDF</Text>
                  }
                </Box>
              </Box>
              <input ref={fileInputRef} type="file" accept="application/pdf"
                style={{ display: "none" }} onChange={handleFileChange} />

              <Group grow>
                <TextInput label="Periodo" placeholder="Ej: 2026A" value={periodo}
                  onChange={(e) => setPeriodo(e.currentTarget.value)} size="sm" />
                <Textarea label="Descripción" placeholder="Breve descripción de la evidencia"
                  value={descripcion} onChange={(e) => setDescripcion(e.currentTarget.value)}
                  rows={2} size="sm" />
              </Group>

              {uploading && (
                <Box>
                  <Text size="xs" c="dimmed" mb={4}>Subiendo... {uploadProgress}%</Text>
                  <Progress value={uploadProgress} color="blue" size="sm" radius="xl" animated />
                </Box>
              )}

              <Button leftSection={<IconUpload size={15} />} color="blue"
                loading={uploading} onClick={handleUpload} disabled={!file} size="sm">
                Subir evidencia
              </Button>
            </Stack>
          </Paper>
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
            <Text c="dimmed" size="xs" mt={4}>Sube el primer PDF para este indicador</Text>
          </Paper>
        ) : (
          <Stack gap="xs">
            <Group gap={6}>
              <IconShieldCheck size={14} color={BLUE.main} />
              <Text size="xs" fw={600} style={{ color: BLUE.main }}>
                {evidencias.length} evidencia{evidencias.length !== 1 ? "s" : ""} registrada{evidencias.length !== 1 ? "s" : ""}
              </Text>
            </Group>
            {evidencias.map((ev) => (
              <Paper key={ev._id} withBorder radius="md" p="sm" style={{
                borderLeft: `4px solid ${BLUE.main}`,
                background: `linear-gradient(90deg, ${BLUE.soft} 0%, #ffffff 100%)`,
              }}>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Box style={{ background: "#dbeafe", borderRadius: 10, padding: 10, flexShrink: 0 }}>
                      <IconFileTypePdf size={22} color={BLUE.main} />
                    </Box>
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate="end" title={ev.nombre_original}
                        style={{ color: BLUE.dark }}>
                        {ev.nombre_original}
                      </Text>
                      {ev.descripcion && (
                        <Text size="xs" c="dimmed" truncate="end">{ev.descripcion}</Text>
                      )}
                      <Group gap="xs" mt={4} wrap="wrap">
                        {ev.periodo && (
                          <Badge size="xs" color="blue" variant="light" leftSection={<IconTag size={10} />}>
                            {ev.periodo}
                          </Badge>
                        )}
                        {ev.subido_por && (
                          <Badge size="xs" color="indigo" variant="light" leftSection={<IconUser size={10} />}>
                            {ev.subido_por}
                          </Badge>
                        )}
                        <Badge size="xs" color="gray" variant="light" leftSection={<IconCalendar size={10} />}>
                          {formatDate(ev.fecha_subida)}
                        </Badge>
                      </Group>
                    </Box>
                  </Group>

                  <Group gap="xs" wrap="nowrap">
                    <Tooltip label="Ver PDF" withArrow>
                      <ActionIcon color="blue" variant="light" size="md" onClick={() => setVisorEv(ev)}>
                        <IconEye size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Descargar" withArrow>
                      <ActionIcon component="a" href={ev.url} download={ev.nombre_original}
                        color="indigo" variant="light" size="md">
                        <IconDownload size={16} />
                      </ActionIcon>
                    </Tooltip>
                    {!readOnly && (
                      <Tooltip label="Eliminar" withArrow>
                        <ActionIcon color="red" variant="light" size="md" onClick={() => handleDelete(ev._id)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Group>
              </Paper>
            ))}
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
