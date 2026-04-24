"use client";

import { useEffect, useState } from "react";
import {
  Stack, Paper, Group, Badge, ThemeIcon, Text, Textarea,
  Button, ActionIcon, FileButton, Center, Loader,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconForms, IconExternalLink, IconTrash, IconUpload,
} from "@tabler/icons-react";
import axios from "axios";
import { PDI_ROUTES } from "../api";

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
}

export default function FormulariosIndicadorPanel({
  indicadorId,
  email,
  corteActivo,
}: {
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
      showNotification({
        title: enviar ? "Enviado" : "Guardado",
        message: enviar ? "Formulario enviado correctamente" : "Borrador guardado",
        color: "teal",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar", color: "red" });
    } finally {
      setSaving(prev => ({ ...prev, [form._id]: false }));
    }
  };

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

  if (loading) return <Center py="xl"><Loader size="sm" /></Center>;

  if (formularios.length === 0) return (
    <Paper withBorder radius="xl" p="xl">
      <Center>
        <Stack align="center" gap="xs">
          <ThemeIcon size={48} radius="xl" color="teal" variant="light">
            <IconForms size={24} />
          </ThemeIcon>
          <Text fw={600}>Sin formularios asignados</Text>
          <Text size="sm" c="dimmed" ta="center">
            El administrador aún no ha creado formularios para este indicador.
          </Text>
        </Stack>
      </Center>
    </Paper>
  );

  return (
    <Stack gap="lg">
      {formularios.map(form => {
        const resp = respuestas[form._id];
        const enviado = resp?.estado === "Enviado";
        return (
          <Paper key={form._id} withBorder radius="xl" p="lg"
            style={{ borderLeft: `4px solid ${enviado ? "#0d9488" : "#7c3aed"}` }}>
            <Group justify="space-between" mb="md">
              <Group gap={8}>
                <ThemeIcon size={32} radius="xl" color={enviado ? "teal" : "violet"} variant="light">
                  <IconForms size={16} />
                </ThemeIcon>
                <div>
                  <Text fw={700}>{form.nombre}</Text>
                  {form.descripcion && <Text size="xs" c="dimmed">{form.descripcion}</Text>}
                </div>
              </Group>
              <Badge color={enviado ? "teal" : resp ? "yellow" : "gray"} variant="light">
                {enviado ? "Enviado" : resp ? "Borrador" : "Sin responder"}
              </Badge>
            </Group>

            {enviado && (
              <Paper withBorder radius="md" p="sm" mb="md"
                style={{ background: "rgba(13,148,136,0.06)", borderColor: "#0d9488" }}>
                <Text size="sm" c="teal" fw={600}>
                  Este formulario ya fue enviado y no puede modificarse.
                  {resp?.fecha_envio && ` Enviado el ${new Date(resp.fecha_envio).toLocaleDateString("es-CO")}.`}
                </Text>
              </Paper>
            )}

            <Stack gap="sm">
              {form.campos.map(campo => {
                const archivoCampo = getRespuestaCampo(form._id, campo._id);
                return (
                  <Paper key={campo._id} withBorder radius="md" p="md"
                    style={{ opacity: enviado ? 0.8 : 1, background: enviado ? "rgba(248,250,252,0.8)" : "#fff" }}>
                    <Group gap={6} mb={6}>
                      <Text size="sm" fw={700}>{campo.etiqueta}</Text>
                      {campo.requerido && <Badge size="xs" color="red" variant="dot">Requerido</Badge>}
                    </Group>
                    {campo.descripcion && <Text size="xs" c="dimmed" mb={8}>{campo.descripcion}</Text>}

                    {campo.tipo === "texto_largo" ? (
                      <Textarea
                        placeholder={enviado ? "" : "Escribe aquí..."}
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
                            <Button size="sm" variant="light" color="blue"
                              leftSection={<IconExternalLink size={14} />}
                              component="a" href={archivoCampo.url} target="_blank">
                              {archivoCampo.nombre_original || "Ver PDF"}
                            </Button>
                            {!enviado && (
                              <ActionIcon size="md" variant="subtle" color="red"
                                onClick={() => handleDeletePDF(form, campo)}>
                                <IconTrash size={15} />
                              </ActionIcon>
                            )}
                          </Group>
                        ) : !enviado ? (
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

            {!enviado && (
              <Group justify="flex-end" mt="lg" gap={8}>
                <Button variant="default" radius="xl"
                  loading={saving[form._id]}
                  onClick={() => handleGuardar(form, false)}>
                  Guardar borrador
                </Button>
                <Button color="teal" radius="xl"
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
