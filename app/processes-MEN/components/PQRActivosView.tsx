"use client";

import { useState } from "react";
import {
  Stack, Text, Group, Button, Table, TextInput, ScrollArea, Paper, Box, ThemeIcon, ActionIcon, Tooltip,
  Textarea, Divider, Badge, Modal,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import {
  IconSearch, IconPaperclip, IconMessageCircle, IconCircleCheck, IconFileText, IconExternalLink, IconTrash,
  IconFolderOpen, IconInbox, IconSchool, IconBuildingBank, IconCalendar, IconPencil,
} from "@tabler/icons-react";
import axios from "axios";
import DropzoneCustomComponent from "@/app/components/DropzoneCustomDrop/DropzoneCustomDrop";
import type { PQR, Program, ProcessDocument } from "../types";
import { dateParserEspanol } from "../utils/parseFlexibleDate";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";
import PQRImportDetails from "./PQRImportDetails";

export type PQRActivosViewProps = {
  pqrs: PQR[];
  programas: Program[];
  onUpdate: (updated: PQR) => void;
  onCerrar: (id: string) => void;
};

const FIELD_LABELS: Record<string, string> = {
  nombre_solicitud:      "Solicitud",
  hora:                  "Hora",
  numero_radicado:       "N° radicado",
  medio_realizado:       "Medio / cuál",
  observacion_respuesta: "Observación / Respuesta",
  cedula_encargado:     "Cédula del encargado",
};

const TH_STYLE = {
  color: "var(--mantine-color-dimmed)",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: 0.3,
  backgroundColor: "var(--mantine-color-default-hover)",
};

const normalizar = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function PQRActivosView({ pqrs, programas, onUpdate, onCerrar }: PQRActivosViewProps) {
  const [confirmarCierreId, setConfirmarCierreId] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{
    pqr: PQR; field: string; label: string; multiline: boolean;
  } | null>(null);
  const [editValue, setEditValue]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [dateEditModal, setDateEditModal] = useState<{
    pqr: PQR; field: string; label: string;
  } | null>(null);
  const [dateValue, setDateValue]   = useState<Date | null>(null);
  const [savingDate, setSavingDate] = useState(false);
  const [docsModalPqrId, setDocsModalPqrId] = useState<string | null>(null);
  const [docs, setDocs]             = useState<ProcessDocument[]>([]);
  const [loadingDocs, setLoadingDocs]   = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const getNombrePrograma = (id?: string | null) =>
    id ? (programas.find(p => p._id === id)?.nombre ?? null) : null;

  const abrirTexto = (pqr: PQR, field: string) => {
    setEditModal({ pqr, field, label: FIELD_LABELS[field] ?? field, multiline: false });
    setEditValue((pqr[field as keyof PQR] as string | null) ?? "");
  };

  const abrirFecha = (pqr: PQR, field: string, label: string) => {
    const raw = pqr[field as keyof PQR] as string | null | undefined;
    setDateEditModal({ pqr, field, label });
    setDateValue(raw ? new Date(raw + "T12:00:00") : null);
  };

  const guardarTexto = async () => {
    if (!editModal) return;
    setSaving(true);
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pqr/${editModal.pqr._id}`, {
        [editModal.field]: editValue || null,
      });
      onUpdate(res.data as PQR);
      setEditModal(null);
    } catch { /* silencioso */ }
    finally { setSaving(false); }
  };

  const guardarFecha = async () => {
    if (!dateEditModal) return;
    setSavingDate(true);
    const fechaStr = dateValue ? dateValue.toISOString().split("T")[0] : null;
    try {
      const res = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/pqr/${dateEditModal.pqr._id}`, {
        [dateEditModal.field]: fechaStr,
      });
      onUpdate(res.data as PQR);
      setDateEditModal(null);
    } catch { /* silencioso */ }
    finally { setSavingDate(false); }
  };

  const abrirDocs = async (pqrId: string) => {
    setDocsModalPqrId(pqrId);
    setLoadingDocs(true);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents`, {
        params: { process_id: pqrId },
      });
      setDocs(Array.isArray(res.data) ? res.data as ProcessDocument[] : []);
    } catch { setDocs([]); }
    finally { setLoadingDocs(false); }
  };

  const subirDoc = async (files: File[]) => {
    if (!docsModalPqrId || files.length === 0) return;
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("doc_type", "pqr");
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/process-documents/process/${docsModalPqrId}`,
        formData, { headers: { "Content-Type": "multipart/form-data" } }
      );
      setDocs(prev => [res.data as ProcessDocument, ...prev]);
    } catch { /* silencioso */ }
    finally { setUploadingDoc(false); }
  };

  const eliminarDoc = async (docId: string) => {
    setDeletingDocId(docId);
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/${docId}`);
      setDocs(prev => prev.filter(d => d._id !== docId));
    } catch { /* silencioso */ }
    finally { setDeletingDocId(null); }
  };

  const TEXT_LIMIT = 22;

  /** Valor editable: se resalta al pasar el mouse y abre el editor con un clic. */
  const textCell = (pqr: PQR, field: keyof PQR, opts?: { fw?: number; size?: string }) => {
    const value = pqr[field] as string | null | undefined;
    const isLong = !!value && value.length > TEXT_LIMIT && field !== "nombre_solicitud";
    return (
      <Tooltip label={`Editar ${(FIELD_LABELS[field as string] ?? String(field)).toLowerCase()}`} withArrow openDelay={400}>
        <Text
          size={opts?.size ?? "xs"}
          fw={opts?.fw}
          className="men-editable"
          c={value ? undefined : "dimmed"}
          fs={value ? undefined : "italic"}
          lineClamp={field === "nombre_solicitud" ? 2 : 1}
          onClick={() => abrirTexto(pqr, field as string)}
        >
          {value ? (isLong ? `${value.slice(0, TEXT_LIMIT)}…` : value) : "Agregar"}
        </Text>
      </Tooltip>
    );
  };

  const dateCell = (pqr: PQR, field: keyof PQR, label: string) => {
    const value = pqr[field] as string | null | undefined;
    return (
      <Tooltip label={`Editar ${label.toLowerCase()}`} withArrow openDelay={400}>
        <Badge
          variant={value ? "light" : "outline"}
          color={value ? "teal" : "gray"}
          radius="sm"
          tt="none"
          leftSection={<IconCalendar size={12} />}
          style={{ cursor: "pointer" }}
          onClick={() => abrirFecha(pqr, field as string, label)}
        >
          {value ? formatFechaDDMMYY(value) : "Sin fecha"}
        </Badge>
      </Tooltip>
    );
  };

  const activosPqrs = pqrs.filter(p => !p.cerrado);
  const visibles = activosPqrs.filter((p) => {
    if (!busqueda.trim()) return true;
    const q = normalizar(busqueda.trim());
    return [p.nombre_solicitud, p.numero_radicado, p.cedula_encargado, getNombrePrograma(p.programa_id)]
      .some((v) => v && normalizar(String(v)).includes(q));
  });

  return (
    <>
      <Stack gap="md" style={{ width: "100%" }}>
        <Group justify="space-between" wrap="wrap" gap="sm">
          <TextInput
            placeholder="Buscar por solicitud, radicado, cédula o programa..."
            leftSection={<IconSearch size={16} />}
            value={busqueda}
            onChange={(e) => setBusqueda(e.currentTarget.value)}
            radius="xl"
            w={380}
          />
          <Badge size="lg" variant="light" color="teal" tt="none">
            {visibles.length} {visibles.length === 1 ? "PQR activo" : "PQRs activos"}
          </Badge>
        </Group>

        {activosPqrs.length === 0 ? (
          <Paper withBorder radius="lg" p="xl" style={{ borderStyle: "dashed" }}>
            <Stack align="center" gap={6}>
              <ThemeIcon size={48} radius="xl" variant="light" color="teal"><IconInbox size={24} /></ThemeIcon>
              <Text fw={600}>No hay PQRs activos</Text>
              <Text size="sm" c="dimmed">Usa «Agregar PQR» en el menú para registrar una nueva solicitud.</Text>
            </Stack>
          </Paper>
        ) : (
          <Paper withBorder radius="lg" style={{ overflow: "hidden" }}>
            <ScrollArea type="auto">
              <Table verticalSpacing="sm" horizontalSpacing="sm" style={{ minWidth: 1000 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ ...TH_STYLE, width: "30%" }}>Solicitud</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>Fecha rad.</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>Hora</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>N° radicado</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>Medio</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>Fecha resp.</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center", width: 210 }}>Acciones</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {visibles.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Text size="sm" c="dimmed" ta="center" py="md">No hay PQRs que coincidan con la búsqueda.</Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                  {visibles.map((pqr) => {
                    const programa = getNombrePrograma(pqr.programa_id);
                    return (
                      <Table.Tr key={pqr._id} className="men-fila-pqr" style={{ boxShadow: "inset 4px 0 var(--mantine-color-teal-4)" }}>
                        <Table.Td style={{ paddingLeft: 16 }}>
                          {textCell(pqr, "nombre_solicitud", { fw: 700, size: "sm" })}
                          <Group gap={6} mt={4} wrap="wrap">
                            {pqr.programa_id ? (
                              <Badge size="sm" variant="light" color="blue" tt="none" leftSection={<IconSchool size={11} />}>
                                {programa ?? "Programa"}
                              </Badge>
                            ) : (
                              <Badge size="sm" variant="light" color="teal" tt="none" leftSection={<IconBuildingBank size={11} />}>
                                MEN directo
                              </Badge>
                            )}
                            <Group gap={4} wrap="nowrap">
                              <Text size="xs" c="dimmed">C.C.</Text>
                              {textCell(pqr, "cedula_encargado")}
                            </Group>
                          </Group>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>{dateCell(pqr, "fecha_radicacion", "Fecha de radicación")}</Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>{textCell(pqr, "hora")}</Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>{textCell(pqr, "numero_radicado")}</Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>{textCell(pqr, "medio_realizado")}</Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>{dateCell(pqr, "fecha_respuesta", "Fecha de respuesta")}</Table.Td>
                        <Table.Td>
                          <Group gap={6} justify="center" wrap="nowrap">
                            <Tooltip label={pqr.observacion_respuesta ? "Ver observación / respuesta" : "Agregar observación / respuesta"} withArrow>
                              <ActionIcon
                                variant={pqr.observacion_respuesta ? "light" : "subtle"}
                                color={pqr.observacion_respuesta ? "blue" : "gray"}
                                size="lg"
                                aria-label="Observación"
                                onClick={() => abrirTexto(pqr, "observacion_respuesta")}
                              >
                                <IconMessageCircle size={17} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="Documentos del PQR" withArrow>
                              <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Documentos" onClick={() => abrirDocs(pqr._id)}>
                                <IconPaperclip size={17} />
                              </ActionIcon>
                            </Tooltip>
                            <Button size="xs" variant="light" color="orange" radius="md" leftSection={<IconCircleCheck size={14} />}
                              onClick={() => setConfirmarCierreId(pqr._id)}>
                              Cerrar
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        )}
        <Text size="xs" c="dimmed">
          <IconPencil size={12} style={{ verticalAlign: "-2px" }} /> Haz clic en cualquier dato de la tabla para editarlo.
        </Text>
      </Stack>
      <style>{`
        .men-editable { cursor: pointer; padding: 2px 6px; border-radius: 6px; display: inline-block; transition: background-color 100ms ease; }
        .men-editable:hover { background-color: var(--mantine-color-blue-light); }
        .men-fila-pqr:hover > td { background-color: var(--mantine-color-default-hover); }
      `}</style>

      <Modal
        opened={!!confirmarCierreId}
        onClose={() => setConfirmarCierreId(null)}
        title={<Text fw={700}>Cerrar PQR</Text>}
        centered size="sm" radius="lg" zIndex={300}>
        <Stack gap="md">
          <Text size="sm">
            ¿Seguro que deseas cerrar este PQR? Se moverá al <strong>historial</strong> y ya no podrá editarse.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmarCierreId(null)}>Cancelar</Button>
            <Button color="orange" leftSection={<IconCircleCheck size={16} />} onClick={() => { onCerrar(confirmarCierreId!); setConfirmarCierreId(null); }}>
              Sí, cerrar PQR
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!editModal}
        onClose={() => setEditModal(null)}
        title={<Text fw={700}>{editModal?.label ?? "Editar"}</Text>}
        centered size="md" radius="lg" zIndex={300}>
        <Stack gap="sm">
          <Textarea
            placeholder={`Escribe ${editModal?.label.toLowerCase()}...`}
            value={editValue}
            onChange={e => setEditValue(e.currentTarget.value)}
            autosize minRows={2} maxRows={10}
            autoFocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEditModal(null)}>Cancelar</Button>
            <Button color="teal" loading={saving} onClick={guardarTexto}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!dateEditModal}
        onClose={() => setDateEditModal(null)}
        title={<Text fw={700}>{dateEditModal?.label ?? "Editar fecha"}</Text>}
        centered size="xs" radius="lg" zIndex={300}>
        <Stack gap="sm">
          <DateInput
            value={dateValue}
            onChange={setDateValue}
            valueFormat="DD/MM/YYYY"
            dateParser={dateParserEspanol}
            clearable
            leftSection={<IconCalendar size={16} />}
            placeholder="dd/mm/aaaa o elegir en el calendario"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDateEditModal(null)}>Cancelar</Button>
            <Button color="teal" loading={savingDate} onClick={guardarFecha}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!docsModalPqrId}
        onClose={() => { setDocsModalPqrId(null); setDocs([]); }}
        title={
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon color="teal" variant="light" size="lg" radius="md"><IconFolderOpen size={20} /></ThemeIcon>
            <Box>
              <Text fw={700} size="sm">Documentos del PQR</Text>
              <Text size="xs" c="dimmed" lineClamp={1}>{pqrs.find(p => p._id === docsModalPqrId)?.nombre_solicitud ?? ""}</Text>
            </Box>
          </Group>
        }
        centered size="lg" radius="lg" zIndex={300}>
        <Stack gap="md">
          <DropzoneCustomComponent
            text={uploadingDoc ? "Subiendo documento..." : "Haz clic o arrastra un archivo para subirlo"}
            onDrop={subirDoc}
          />
          {!!pqrs.find(pqr => pqr._id === docsModalPqrId)?.importacion_fuentes?.length && (
            <>
              <Divider label="Información y enlaces del Excel" />
              <PQRImportDetails pqr={pqrs.find(pqr => pqr._id === docsModalPqrId)!} />
            </>
          )}
          <Group justify="space-between">
            <Text size="sm" fw={700}>Archivos cargados</Text>
            {!loadingDocs && <Badge variant="light" color="gray">{docs.length}</Badge>}
          </Group>
          {loadingDocs ? (
            <Text size="sm" c="dimmed" ta="center">Cargando documentos...</Text>
          ) : docs.length > 0 ? (
            <Stack gap="xs">
              {docs.map(doc => (
                <Paper key={doc._id} withBorder radius="md" px="sm" py="xs">
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                      <ThemeIcon size={32} radius="md" variant="light" color="teal" style={{ flexShrink: 0 }}><IconFileText size={17} /></ThemeIcon>
                      <Text size="sm" fw={600} truncate="end">{doc.name}</Text>
                    </Group>
                    <Group gap={4} wrap="nowrap">
                      <Button component="a" href={doc.view_link} target="_blank" rel="noopener noreferrer"
                        size="xs" variant="light" color="teal" radius="md" leftSection={<IconExternalLink size={14} />}>
                        Abrir
                      </Button>
                      <Tooltip label="Eliminar documento" withArrow>
                        <ActionIcon variant="subtle" color="red" aria-label="Eliminar documento"
                          loading={deletingDocId === doc._id} onClick={() => eliminarDoc(doc._id)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Paper withBorder radius="md" p="lg" style={{ borderStyle: "dashed" }}>
              <Stack align="center" gap={6}>
                <ThemeIcon size={40} radius="xl" variant="light" color="gray"><IconFileText size={20} /></ThemeIcon>
                <Text size="sm" c="dimmed">Aún no hay documentos en este PQR.</Text>
              </Stack>
            </Paper>
          )}
        </Stack>
      </Modal>
    </>
  );
}
