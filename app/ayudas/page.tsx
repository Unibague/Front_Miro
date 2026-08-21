"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Box,
  Button,
  Card,
  Center,
  FileInput,
  Group,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Badge,
  ActionIcon,
  Tooltip,
  Divider,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";
import {
  IconUpload,
  IconTrash,
  IconPlayerPlay,
  IconFileTypePdf,
  IconVideo,
  IconPencil,
} from "@tabler/icons-react";

interface Ayuda {
  _id: string;
  title: string;
  description: string;
  type: "video" | "pdf";
  filename: string;
  originalName: string;
  uploadedBy: string;
  size: number;
  createdAt: string;
}

const API = process.env.NEXT_PUBLIC_API_URL!;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AyudasPage() {
  const { data: session } = useSession();
  const { userRole } = useRole();
  const isAdmin = userRole === "Administrador";

  const [ayudas, setAyudas] = useState<Ayuda[]>([]);
  const [loading, setLoading] = useState(true);

  // Visor
  const [viewer, setViewer] = useState<Ayuda | null>(null);

  // Upload form
  const [uploadOpen, setUploadOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Edit
  const [editTarget, setEditTarget] = useState<Ayuda | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<Ayuda | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAyudas = async () => {
    try {
      const res = await axios.get(`${API}/ayudas`);
      setAyudas(res.data);
    } catch {
      showNotification({ title: "Error", message: "No se pudieron cargar las ayudas.", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAyudas();
  }, []);

  const handleUpload = async () => {
    if (!title.trim()) return showNotification({ title: "Campo requerido", message: "Escribe un título.", color: "orange" });
    if (!file) return showNotification({ title: "Campo requerido", message: "Selecciona un archivo.", color: "orange" });

    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim());
    form.append("description", description.trim());
    form.append("uploadedBy", session?.user?.email || "desconocido");

    try {
      await axios.post(`${API}/ayudas`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      showNotification({ title: "Subido", message: "El recurso se publicó correctamente.", color: "teal" });
      setUploadOpen(false);
      setTitle("");
      setDescription("");
      setFile(null);
      fetchAyudas();
    } catch (err: any) {
      showNotification({ title: "Error", message: err?.response?.data?.error || "No se pudo subir el archivo.", color: "red" });
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (a: Ayuda) => {
    setEditTarget(a);
    setEditTitle(a.title);
    setEditDescription(a.description);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    if (!editTitle.trim()) return showNotification({ title: "Campo requerido", message: "Escribe un título.", color: "orange" });
    setSaving(true);
    try {
      const res = await axios.put(`${API}/ayudas/${editTarget._id}`, {
        title: editTitle.trim(),
        description: editDescription.trim(),
      });
      setAyudas((prev) => prev.map((a) => (a._id === editTarget._id ? res.data : a)));
      showNotification({ title: "Guardado", message: "Recurso actualizado.", color: "teal" });
      setEditTarget(null);
    } catch (err: any) {
      showNotification({ title: "Error", message: err?.response?.data?.error || "No se pudo guardar.", color: "red" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/ayudas/${deleteTarget._id}`);
      showNotification({ title: "Eliminado", message: "El recurso fue eliminado.", color: "teal" });
      setDeleteTarget(null);
      fetchAyudas();
    } catch {
      showNotification({ title: "Error", message: "No se pudo eliminar.", color: "red" });
    } finally {
      setDeleting(false);
    }
  };

  // Los archivos estáticos están en la raíz del servidor Express (no bajo /api/d),
  // se acceden vía el proxy de Next.js en /api/uploads/
  const fileUrl = (filename: string) => `/api/uploads/ayudas/${filename}`;

  return (
    <Box p="xl" maw={1200} mx="auto">
      <Stack align="center" mb="lg" gap={4}>
        <Title order={2} ta="center">Ayudas</Title>
        <Text size="sm" c="dimmed" ta="center">
          Encuentra aquí manuales, videos tutoriales y materiales de apoyo para el uso del sistema.
        </Text>
        {isAdmin && (
          <Button mt="sm" leftSection={<IconUpload size={16} />} onClick={() => setUploadOpen(true)}>
            Subir recurso
          </Button>
        )}
      </Stack>

      <Divider mb="xl" />

      {loading ? (
        <Center h={200}><Loader /></Center>
      ) : ayudas.length === 0 ? (
        <Center h={200}>
          <Text c="dimmed">No hay recursos de ayuda disponibles aún.</Text>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
          {ayudas.map((a) => (
            <Card key={a._id} shadow="sm" padding="md" radius="md" withBorder>
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Badge
                    color={a.type === "video" ? "blue" : "red"}
                    leftSection={a.type === "video" ? <IconVideo size={12} /> : <IconFileTypePdf size={12} />}
                    size="sm"
                  >
                    {a.type === "video" ? "Video" : "PDF"}
                  </Badge>
                  {isAdmin && (
                    <Group gap={4} wrap="nowrap">
                      <Tooltip label="Editar">
                        <ActionIcon color="blue" variant="subtle" size="sm" onClick={() => openEdit(a)}>
                          <IconPencil size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Eliminar">
                        <ActionIcon color="red" variant="subtle" size="sm" onClick={() => setDeleteTarget(a)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Group>

                <Text fw={600} size="sm" lineClamp={2}>{a.title}</Text>

                {a.description && (
                  <Text size="xs" c="dimmed" lineClamp={2}>{a.description}</Text>
                )}

                <Text size="xs" c="dimmed">{formatSize(a.size)} · {formatDate(a.createdAt)}</Text>

                <Button
                  variant="light"
                  size="xs"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={() => setViewer(a)}
                  fullWidth
                >
                  {a.type === "video" ? "Ver video" : "Ver PDF"}
                </Button>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {/* Modal visor */}
      <Modal
        opened={!!viewer}
        onClose={() => setViewer(null)}
        title={viewer?.title}
        size={viewer?.type === "pdf" ? "90%" : "70%"}
        centered
      >
        {viewer?.type === "video" ? (
          <video
            controls
            autoPlay
            style={{ width: "100%", borderRadius: 8, maxHeight: "70vh" }}
            src={fileUrl(viewer.filename)}
          />
        ) : viewer?.type === "pdf" ? (
          <iframe
            src={fileUrl(viewer!.filename)}
            style={{ width: "100%", height: "75vh", border: "none", borderRadius: 8 }}
            title={viewer!.title}
          />
        ) : null}
      </Modal>

      {/* Modal upload (solo admin) */}
      <Modal
        opened={uploadOpen}
        onClose={() => { if (!uploading) { setUploadOpen(false); setTitle(""); setDescription(""); setFile(null); } }}
        title="Subir recurso de ayuda"
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Título"
            placeholder="Nombre del recurso"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Textarea
            label="Descripción (opcional)"
            placeholder="Breve descripción de este recurso"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FileInput
            label="Archivo"
            placeholder="Seleccionar PDF o video"
            required
            accept="application/pdf,video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska"
            value={file}
            onChange={setFile}
            leftSection={<IconUpload size={14} />}
          />
          {file && (
            <Text size="xs" c="dimmed">{file.name} · {formatSize(file.size)}</Text>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => { setUploadOpen(false); setTitle(""); setDescription(""); setFile(null); }} disabled={uploading}>
              Cancelar
            </Button>
            <Button onClick={handleUpload} loading={uploading}>
              Subir
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal editar */}
      <Modal
        opened={!!editTarget}
        onClose={() => { if (!saving) setEditTarget(null); }}
        title="Editar recurso"
        centered
      >
        <Stack gap="sm">
          <TextInput
            label="Título"
            required
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <Textarea
            label="Descripción (opcional)"
            rows={3}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setEditTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSaveEdit} loading={saving}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modal confirmar eliminación */}
      <Modal
        opened={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        title="Confirmar eliminación"
        centered
        size="sm"
      >
        <Text size="sm">¿Eliminar <strong>{deleteTarget?.title}</strong>? Esta acción no se puede deshacer.</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
          <Button color="red" onClick={handleDelete} loading={deleting}>Eliminar</Button>
        </Group>
      </Modal>
    </Box>
  );
}
