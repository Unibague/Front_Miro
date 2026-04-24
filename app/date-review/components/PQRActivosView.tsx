"use client";

import { useState } from "react";
import {
  Stack, Text, Group, Button, Table,
  Textarea, Anchor, Divider, Badge, Modal,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import axios from "axios";
import DropzoneCustomComponent from "@/app/components/DropzoneCustomDrop/DropzoneCustomDrop";
import type { PQR, Program, ProcessDocument } from "../types";
import { dateParserEspanol } from "../utils/parseFlexibleDate";

export type PQRActivosViewProps = {
  pqrs: PQR[];
  programas: Program[];
  onUpdate: (updated: PQR) => void;
  onCerrar: (id: string) => void;
};

const TH_BG = "#dbe4ff";
const TR_BG = "#f8f9ff";

const FIELD_LABELS: Record<string, string> = {
  nombre_solicitud:      "Solicitud",
  hora:                  "Hora",
  numero_radicado:       "N° radicado",
  medio_realizado:       "Medio / cuál",
  observacion_respuesta: "Observación / Respuesta",
  cedula_encargado:     "Cédula del encargado",
};

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

  const textCell = (pqr: PQR, field: keyof PQR) => {
    const value = pqr[field] as string | null | undefined;
    const isLong = value && value.length > TEXT_LIMIT;

    if (isLong) {
      return (
        <Group justify="center">
          <Button size="xs" variant="light" color="blue" px={6}
            onClick={() => abrirTexto(pqr, field as string)}>
            Ver
          </Button>
        </Group>
      );
    }

    return (
      <Text size="xs" style={{
        cursor: "pointer", padding: "2px 6px", borderRadius: 4,
        border: "1px dashed #ced4da", display: "block",
        color: value ? "#212529" : "#adb5bd",
      }}
        title="Clic para editar"
        onClick={() => abrirTexto(pqr, field as string)}>
        {value || "—"}
      </Text>
    );
  };

  const dateCell = (pqr: PQR, field: keyof PQR, label: string) => {
    const value = pqr[field] as string | null | undefined;
    return (
      <Text size="xs" ta="center" style={{
        cursor: "pointer", padding: "2px 4px", borderRadius: 4,
        border: "1px dashed #4dabf7", backgroundColor: "#e7f5ff",
        color: value ? "#1c7ed6" : "#adb5bd", display: "block",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}
        title="Clic para editar fecha"
        onClick={() => abrirFecha(pqr, field as string, label)}>
        {value || "Sin fecha"}
      </Text>
    );
  };

  const obsCell = (pqr: PQR) => {
    const value = pqr.observacion_respuesta;
    return (
      <Button size="xs" variant={value ? "light" : "subtle"} color={value ? "blue" : "gray"}
        px={6} onClick={() => abrirTexto(pqr, "observacion_respuesta")}
        title={value ?? "Sin observaciones"}>
        {value ? "Ver" : "—"}
      </Button>
    );
  };

  const activosPqrs = pqrs.filter(p => !p.cerrado);

  return (
    <>
      <Stack gap="sm" style={{ width: "100%" }}>
        {activosPqrs.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">
            No hay PQRs activos. Usa «+ Agregar PQR» en el menú para crear uno.
          </Text>
        ) : (
          <Table withTableBorder withColumnBorders style={{ width: "100%", tableLayout: "fixed" }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ backgroundColor: TH_BG, width: "17%" }}><Text size="xs" fw={700}>Solicitud</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "12%" }}><Text size="xs" fw={700} ta="center">Referente</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "10%" }}><Text size="xs" fw={700} ta="center">Cédula encargado</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "8%" }}><Text size="xs" fw={700} ta="center">Fecha rad.</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "6%" }}><Text size="xs" fw={700} ta="center">Hora</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "8%" }}><Text size="xs" fw={700} ta="center">N° radicado</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "10%" }}><Text size="xs" fw={700} ta="center">Medio</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "8%" }}><Text size="xs" fw={700} ta="center">Fecha resp.</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "6%" }}><Text size="xs" fw={700} ta="center">Obs.</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "5%" }}><Text size="xs" fw={700} ta="center">Docs</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "5%" }}><Text size="xs" fw={700} ta="center">Acciones</Text></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {activosPqrs.map((pqr, idx) => (
                <Table.Tr key={pqr._id} style={{ backgroundColor: idx % 2 === 0 ? "#fff" : TR_BG }}>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px" }}>
                    {textCell(pqr, "nombre_solicitud")}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px" }}>
                    {pqr.programa_id ? (
                      <Text size="xs" style={{ color: "#1971c2", wordBreak: "break-word" }}>
                        {getNombrePrograma(pqr.programa_id) ?? "Programa"}
                      </Text>
                    ) : (
                      <Badge size="xs" color="teal" variant="light">MEN directo</Badge>
                    )}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px" }}>
                    {textCell(pqr, "cedula_encargado")}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px" }}>
                    {dateCell(pqr, "fecha_radicacion", "Fecha de radicación")}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px" }}>
                    {textCell(pqr, "hora")}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px" }}>
                    {textCell(pqr, "numero_radicado")}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px" }}>
                    {textCell(pqr, "medio_realizado")}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px" }}>
                    {dateCell(pqr, "fecha_respuesta", "Fecha de respuesta")}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 4px", textAlign: "center" }}>
                    {obsCell(pqr)}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 4px", textAlign: "center" }}>
                    <Button size="xs" variant="subtle" color="gray" px={4} onClick={() => abrirDocs(pqr._id)}>
                      📎
                    </Button>
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 4px", textAlign: "center" }}>
                    <Button size="xs" variant="light" color="orange" px={4}
                      onClick={() => setConfirmarCierreId(pqr._id)}>
                      Cerrar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>

      <Modal
        opened={!!confirmarCierreId}
        onClose={() => setConfirmarCierreId(null)}
        title="Cerrar PQR"
        centered size="sm" radius="md" zIndex={300}>
        <Stack gap="md">
          <Text size="sm">
            ¿Estás seguro de que deseas cerrar este PQR? Se moverá al <strong>historial</strong> y no podrá editarse.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmarCierreId(null)}>Cancelar</Button>
            <Button color="orange" onClick={() => { onCerrar(confirmarCierreId!); setConfirmarCierreId(null); }}>
              Sí, cerrar PQR
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!editModal}
        onClose={() => setEditModal(null)}
        title={editModal?.label ?? "Editar"}
        centered size="sm" radius="md" zIndex={300}>
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
            <Button loading={saving} onClick={guardarTexto}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!dateEditModal}
        onClose={() => setDateEditModal(null)}
        title={dateEditModal?.label ?? "Editar fecha"}
        centered size="xs" radius="md" zIndex={300}>
        <Stack gap="sm">
          <DateInput
            value={dateValue}
            onChange={setDateValue}
            valueFormat="DD/MM/YYYY"
            dateParser={dateParserEspanol}
            clearable
            placeholder="dd/mm/aaaa o elegir en el calendario"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDateEditModal(null)}>Cancelar</Button>
            <Button loading={savingDate} onClick={guardarFecha}>Guardar</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={!!docsModalPqrId}
        onClose={() => { setDocsModalPqrId(null); setDocs([]); }}
        title="Documentos del PQR" centered size="md" radius="md" zIndex={300}>
        <Stack gap="md">
          <DropzoneCustomComponent
            text={uploadingDoc ? "Subiendo documento..." : "Haz clic o arrastra un archivo para subirlo"}
            onDrop={subirDoc}
          />
          {loadingDocs ? (
            <Text size="sm" c="dimmed" ta="center">Cargando documentos...</Text>
          ) : docs.length > 0 ? (
            <>
              <Divider label="Documentos subidos" labelPosition="center" />
              <Stack gap="xs">
                {docs.map(doc => (
                  <Group key={doc._id} justify="space-between" align="center">
                    <Anchor size="sm" href={doc.view_link} target="_blank" rel="noopener noreferrer">
                      📄 {doc.name}
                    </Anchor>
                    <Button size="xs" variant="subtle" color="red" p={4}
                      loading={deletingDocId === doc._id}
                      onClick={() => eliminarDoc(doc._id)}>
                      🗑
                    </Button>
                  </Group>
                ))}
              </Stack>
            </>
          ) : (
            <Text size="xs" c="dimmed" ta="center">Sin documentos subidos.</Text>
          )}
        </Stack>
      </Modal>
    </>
  );
}
