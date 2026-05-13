"use client";

import { useEffect, useState } from "react";
import {
  Stack, Paper, Group, Badge, ThemeIcon, Text, Textarea, TextInput,
  Button, ActionIcon, FileButton, Center, Loader, Select, Checkbox,
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
  tipo: "texto_largo" | "texto_corto" | "archivo_pdf" | "select" | "select_con_otro" | "checkbox";
  descripcion?: string;
  requerido?: boolean;
  max_caracteres?: number | null;
  opciones?: string[];
  condicional_campo_id?: string | null;
  condicional_valor?: string | null;
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
  word_filename: string;
  word_url: string;
  word_nombre_original: string;
  documento_filename: string;
  documento_url: string;
  documento_nombre_original: string;
  documento_mimetype: string;
  estado_aval?: "Pendiente" | "Aprobado" | "Rechazado" | null;
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
  const [otrosTextos, setOtrosTextos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadingDoc, setUploadingDoc] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    axios.get(PDI_ROUTES.formularios(), { params: { indicador_id: indicadorId } })
      .then(async r => {
        const forms: FormularioPDI[] = r.data.filter((f: any) => f.activo);
        setFormularios(forms);
        const respMap: Record<string, RespuestaFormulario | null> = {};
        const textMap: Record<string, string> = {};
        const otroMap: Record<string, string> = {};
        await Promise.all(forms.map(async f => {
          try {
            const res = await axios.get(PDI_ROUTES.formularioRespuestas(f._id), {
              params: { respondido_por: email, corte: corteActivo, indicador_id: indicadorId },
            });
            const resp: RespuestaFormulario | null = res.data[0] ?? null;
            respMap[f._id] = resp;
            if (resp) {
              resp.respuestas.forEach(r => {
                if (["texto_largo", "texto_corto", "select", "checkbox"].includes(r.tipo)) {
                  textMap[`${f._id}-${r.campo_id}`] = r.valor_texto ?? "";
                } else if (r.tipo === "select_con_otro" && r.valor_texto) {
                  if (r.valor_texto.startsWith("Otro: ")) {
                    textMap[`${f._id}-${r.campo_id}`] = "Otro";
                    otroMap[`${f._id}-${r.campo_id}`] = r.valor_texto.slice(6);
                  } else {
                    textMap[`${f._id}-${r.campo_id}`] = r.valor_texto;
                  }
                }
              });
            }
          } catch { respMap[f._id] = null; }
        }));
        setRespuestas(respMap);
        setTextos(textMap);
        setOtrosTextos(otroMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [indicadorId, email, corteActivo]);

  const getTexto = (formId: string, campoId: string) => textos[`${formId}-${campoId}`] ?? "";
  const setTexto = (formId: string, campoId: string, val: string) =>
    setTextos(prev => ({ ...prev, [`${formId}-${campoId}`]: val }));
  const getOtroTexto = (formId: string, campoId: string) => otrosTextos[`${formId}-${campoId}`] ?? "";
  const setOtroTexto = (formId: string, campoId: string, val: string) =>
    setOtrosTextos(prev => ({ ...prev, [`${formId}-${campoId}`]: val }));
  const getRespuestaCampo = (formId: string, campoId: string): RespuestaCampo | undefined =>
    respuestas[formId]?.respuestas.find(r => r.campo_id === campoId);

  const shouldShowCampo = (form: FormularioPDI, campo: CampoFormulario): boolean => {
    if (!campo.condicional_campo_id) return true;
    const triggerCampo = form.campos.find(c => c._id === campo.condicional_campo_id);
    if (!triggerCampo) return true;
    const val = getTexto(form._id, campo.condicional_campo_id);
    return val === (campo.condicional_valor ?? "true");
  };

  const buildValorTexto = (form: FormularioPDI, campo: CampoFormulario): string => {
    if (campo.tipo === "texto_largo" || campo.tipo === "texto_corto") return getTexto(form._id, campo._id);
    if (campo.tipo === "select") return getTexto(form._id, campo._id);
    if (campo.tipo === "select_con_otro") {
      const sel = getTexto(form._id, campo._id);
      return sel === "Otro" ? `Otro: ${getOtroTexto(form._id, campo._id)}` : sel;
    }
    if (campo.tipo === "checkbox") return getTexto(form._id, campo._id) || "false";
    return "";
  };

  const handleGuardar = async (form: FormularioPDI, enviar = false) => {
    setSaving(prev => ({ ...prev, [form._id]: true }));
    try {
      const respuestasPayload = form.campos.map(c => ({
        campo_id: c._id,
        etiqueta: c.etiqueta,
        tipo: c.tipo,
        valor_texto: buildValorTexto(form, c),
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

  const buildInitialPayload = (form: FormularioPDI) =>
    form.campos.map(c => ({
      campo_id: c._id, etiqueta: c.etiqueta, tipo: c.tipo,
      valor_texto: "", nombre_original: "", filename: "", url: "",
    }));

  const handleUploadPDF = async (form: FormularioPDI, campo: CampoFormulario, file: File | null) => {
    if (!file) return;
    let respActual = respuestas[form._id];
    if (!respActual) {
      try {
        const res = await axios.post(PDI_ROUTES.formularioRespuestas(form._id), {
          respondido_por: email, corte: corteActivo, indicador_id: indicadorId,
          respuestas: buildInitialPayload(form),
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

  const handleUploadDoc = async (form: FormularioPDI, file: File | null) => {
    if (!file) return;
    let respActual = respuestas[form._id];
    if (!respActual) {
      try {
        const res = await axios.post(PDI_ROUTES.formularioRespuestas(form._id), {
          respondido_por: email, corte: corteActivo, indicador_id: indicadorId,
          respuestas: buildInitialPayload(form),
          estado: "Borrador",
        });
        respActual = res.data;
        setRespuestas(prev => ({ ...prev, [form._id]: res.data }));
      } catch { return; }
    }
    setUploadingDoc(prev => ({ ...prev, [form._id]: true }));
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      const res = await axios.post(
        PDI_ROUTES.formularioDocumentoFinal(form._id, respActual!._id),
        fd, { headers: { "Content-Type": "multipart/form-data" } }
      );
      setRespuestas(prev => {
        const r = prev[form._id];
        if (!r) return prev;
        return { ...prev, [form._id]: { ...r, ...res.data } };
      });
      showNotification({ title: "Subido", message: "Documento de evidencia adjuntado", color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo subir el documento", color: "red" });
    } finally {
      setUploadingDoc(prev => ({ ...prev, [form._id]: false }));
    }
  };

  const handleDeleteDoc = async (form: FormularioPDI) => {
    const resp = respuestas[form._id];
    if (!resp) return;
    try {
      await axios.delete(PDI_ROUTES.formularioDocumentoFinal(form._id, resp._id));
      setRespuestas(prev => {
        const r = prev[form._id];
        if (!r) return prev;
        return {
          ...prev,
          [form._id]: {
            ...r,
            documento_filename: "",
            documento_url: "",
            documento_nombre_original: "",
            documento_mimetype: "",
          },
        };
      });
      showNotification({ title: "Eliminado", message: "Documento eliminado", color: "teal" });
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
                if (!shouldShowCampo(form, campo)) return null;
                const archivoCampo = getRespuestaCampo(form._id, campo._id);
                const maxChars = campo.max_caracteres ?? null;
                const currentLen = getTexto(form._id, campo._id).length;
                return (
                  <Paper key={campo._id} withBorder radius="md" p="md"
                    style={{ opacity: enviado ? 0.8 : 1, background: enviado ? "rgba(248,250,252,0.8)" : "#fff" }}>
                    {campo.tipo !== "checkbox" && (
                      <>
                        <Group gap={6} mb={6}>
                          <Text size="sm" fw={700}>{campo.etiqueta}</Text>
                          {campo.requerido && <Badge size="xs" color="red" variant="dot">Requerido</Badge>}
                        </Group>
                        {campo.descripcion && <Text size="xs" c="dimmed" mb={8}>{campo.descripcion}</Text>}
                      </>
                    )}

                    {campo.tipo === "texto_largo" && (
                      <Stack gap={4}>
                        <Textarea
                          placeholder={enviado ? "" : "Escribe aquí..."}
                          value={getTexto(form._id, campo._id)}
                          onChange={e => setTexto(form._id, campo._id, e.currentTarget.value)}
                          rows={4}
                          disabled={enviado}
                          autosize
                          minRows={3}
                          maxLength={maxChars ?? undefined}
                        />
                        {maxChars && (
                          <Text size="xs" ta="right" c={currentLen > maxChars * 0.9 ? (currentLen >= maxChars ? "red" : "orange") : "dimmed"}>
                            {currentLen} / {maxChars}
                          </Text>
                        )}
                      </Stack>
                    )}

                    {campo.tipo === "texto_corto" && (
                      <TextInput
                        placeholder={enviado ? "" : "Escribe aquí..."}
                        value={getTexto(form._id, campo._id)}
                        onChange={e => setTexto(form._id, campo._id, e.currentTarget.value)}
                        disabled={enviado}
                        maxLength={maxChars ?? undefined}
                      />
                    )}

                    {campo.tipo === "select" && (
                      <Select
                        placeholder="Selecciona una opción..."
                        value={getTexto(form._id, campo._id) || null}
                        onChange={v => setTexto(form._id, campo._id, v ?? "")}
                        data={(campo.opciones ?? []).map(op => ({ value: op, label: op }))}
                        disabled={enviado}
                        clearable
                      />
                    )}

                    {campo.tipo === "select_con_otro" && (
                      <Stack gap={6}>
                        <Select
                          placeholder="Selecciona una opción..."
                          value={getTexto(form._id, campo._id) || null}
                          onChange={v => {
                            setTexto(form._id, campo._id, v ?? "");
                            if (v !== "Otro") setOtroTexto(form._id, campo._id, "");
                          }}
                          data={[
                            ...(campo.opciones ?? []).map(op => ({ value: op, label: op })),
                            { value: "Otro", label: "Otro ¿Cuál?" },
                          ]}
                          disabled={enviado}
                          clearable
                        />
                        {getTexto(form._id, campo._id) === "Otro" && (
                          <TextInput
                            placeholder="Especifica..."
                            value={getOtroTexto(form._id, campo._id)}
                            onChange={e => setOtroTexto(form._id, campo._id, e.currentTarget.value)}
                            disabled={enviado}
                          />
                        )}
                      </Stack>
                    )}

                    {campo.tipo === "checkbox" && (
                      <Checkbox
                        label={campo.etiqueta}
                        description={campo.descripcion}
                        checked={getTexto(form._id, campo._id) === "true"}
                        onChange={e => setTexto(form._id, campo._id, e.currentTarget.checked ? "true" : "false")}
                        disabled={enviado}
                      />
                    )}

                    {campo.tipo === "archivo_pdf" && (
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

            {/* Evidence document upload */}
            <Paper withBorder radius="md" p="md" mt="md"
              style={{ borderColor: "#7c3aed", background: "rgba(124,58,237,0.04)" }}>
              <Group gap={6} mb={8}>
                <ThemeIcon size={22} radius="md" color="violet" variant="light">
                  <IconUpload size={12} />
                </ThemeIcon>
                <Text size="sm" fw={700}>Documento de evidencia</Text>
                <Text size="xs" c="dimmed">PDF o Word</Text>
              </Group>
              {resp?.documento_url ? (
                <Group gap={8}>
                  <Button size="xs" variant="light" color="violet"
                    leftSection={<IconExternalLink size={13} />}
                    component="a" href={resp.documento_url} target="_blank">
                    {resp.documento_nombre_original || resp.documento_filename || "Ver documento"}
                  </Button>
                  {resp?.estado_aval !== "Aprobado" && (
                    <ActionIcon size="sm" variant="subtle" color="red"
                      onClick={() => handleDeleteDoc(form)}>
                      <IconTrash size={13} />
                    </ActionIcon>
                  )}
                </Group>
              ) : (
                <FileButton
                  onChange={file => handleUploadDoc(form, file)}
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                >
                  {props => (
                    <Button size="xs" variant="light" color="violet"
                      leftSection={<IconUpload size={13} />}
                      loading={uploadingDoc[form._id]}
                      disabled={resp?.estado_aval === "Aprobado"}
                      {...props}>
                      Subir documento
                    </Button>
                  )}
                </FileButton>
              )}
            </Paper>

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
