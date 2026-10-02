"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { IconExternalLink, IconHistory, IconUpload } from "@tabler/icons-react";
import axios from "axios";
import type { ProcessHistoryRecord, Program } from "../types";
import { LABEL_PROCESO, etiquetaSubtipoCompacta } from "../constants";
import { docResolucionEnHistorial } from "../utils/historialResolucionVigente";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";

type Props = {
  opened: boolean;
  onClose: () => void;
  programa: Program;
  programCode: string;
};

const TIPOS = ["RC", "AV"] as const;

type TipoProceso = (typeof TIPOS)[number];

function labelTipo(tipo: TipoProceso): string {
  return tipo === "RC" ? "Registro calificado" : "Acreditación voluntaria";
}

export default function HistoricoProgramaModal({ opened, onClose, programa, programCode }: Props) {
  const [records, setRecords] = useState<ProcessHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-history`);
        const list = Array.isArray(res.data) ? res.data as ProcessHistoryRecord[] : [];
        if (!cancelled) {
          setRecords(
            list
              .filter((record) => record.program_code === programCode && TIPOS.includes(record.tipo_proceso as TipoProceso))
              .sort((a, b) => String(b.cerrado_en).localeCompare(String(a.cerrado_en))),
          );
        }
      } catch {
        if (!cancelled) {
          setRecords([]);
          setMessage("No se pudo cargar el histórico de procesos.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [opened, programCode]);

  const recordsByType = useMemo(
    () => TIPOS.map((tipo) => ({
      tipo,
      records: records.filter((record) => record.tipo_proceso === tipo),
    })),
    [records],
  );

  const uploadResolution = async (record: ProcessHistoryRecord, file: File) => {
    setUploadingId(record._id);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.patch(
        `${process.env.NEXT_PUBLIC_API_URL}/process-history/${record._id}/resolucion-pdf`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      const updated = res.data?.historial as ProcessHistoryRecord | undefined;
      if (updated) {
        setRecords((current) => current.map((item) => item._id === updated._id ? updated : item));
      }
      setMessage("Resolución cargada correctamente.");
    } catch {
      setMessage("No se pudo cargar la resolución.");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={(
        <Group gap="xs">
          <IconHistory size={19} />
          <Text fw={700}>Histórico de procesos</Text>
        </Group>
      )}
      centered
      size="lg"
      radius="md"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Procesos registrados para {programa.nombre}. Puedes consultar y cargar la resolución de cada cierre.
        </Text>
        {message && <Text size="sm" c={message.startsWith("No") ? "red" : "green"}>{message}</Text>}
        {loading ? (
          <Loader size="sm" mx="auto" />
        ) : recordsByType.every(({ records: items }) => items.length === 0) ? (
          <Text size="sm" c="dimmed" ta="center" py="md">Este programa aún no tiene procesos cerrados.</Text>
        ) : (
          recordsByType.map(({ tipo, records: items }) => (
            <Stack key={tipo} gap="xs">
              <Divider label={labelTipo(tipo)} labelPosition="left" />
              {items.length === 0 ? (
                <Text size="xs" c="dimmed">Sin procesos registrados.</Text>
              ) : items.map((record) => {
                const resolution = docResolucionEnHistorial(record, programa);
                const state = record.estado_solicitud ?? "APROBADO";
                return (
                  <Paper key={record._id} withBorder radius="sm" p="sm">
                    <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
                      <Stack gap={4} style={{ minWidth: 0 }}>
                        <Group gap="xs" wrap="wrap">
                          <Badge color={tipo === "RC" ? "blue" : "violet"} variant="light">
                            {LABEL_PROCESO[tipo]}
                          </Badge>
                          <Badge color="gray" variant="outline">
                            {record.subtipo ? etiquetaSubtipoCompacta(record.subtipo) : "Sin subtipo"}
                          </Badge>
                          <Badge color={state === "APROBADO" ? "teal" : state === "NEGADO" ? "red" : "gray"} variant="light">
                            {state}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          Cerrado: {record.cerrado_en ? formatFechaDDMMYY(record.cerrado_en) : "—"}
                        </Text>
                        <Text size="xs"><strong>Tipo de proceso:</strong> {labelTipo(tipo)}</Text>
                        <Text size="xs"><strong>Subtipo de proceso:</strong> {record.subtipo || "—"}</Text>
                        {resolution ? (
                          <Anchor href={resolution.view_link} target="_blank" rel="noopener noreferrer" size="xs">
                            <Group gap={4} wrap="nowrap">
                              <IconExternalLink size={13} />
                              <span>{resolution.name || "Ver resolución"}</span>
                            </Group>
                          </Anchor>
                        ) : (
                          <Text size="xs" c="dimmed">Sin resolución cargada.</Text>
                        )}
                      </Stack>
                      <Button
                        component="label"
                        size="xs"
                        variant="light"
                        loading={uploadingId === record._id}
                        leftSection={<IconUpload size={14} />}
                      >
                        {resolution ? "Cambiar la resolución" : "Cargar la resolución"}
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          hidden
                          disabled={uploadingId !== null}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            if (file) void uploadResolution(record, file);
                          }}
                        />
                      </Button>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          ))
        )}
      </Stack>
    </Modal>
  );
}
