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
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { IconExternalLink, IconHistory, IconPlus, IconUpload } from "@tabler/icons-react";
import axios from "axios";
import type { ProcessHistoryRecord, Program, ResolucionAnteriorPrograma } from "../types";
import { LABEL_PROCESO, etiquetaSubtipoCompacta } from "../constants";
import { docResolucionEnHistorial } from "../utils/historialResolucionVigente";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";
import { dateParserEspanol } from "../utils/parseFlexibleDate";

type Props = {
  opened: boolean;
  onClose: () => void;
  programa: Program;
  programCode: string;
};

const TIPOS = ["RC", "AV"] as const;

type TipoProceso = (typeof TIPOS)[number];
type ObservacionTarget =
  | { kind: "anterior"; id: string; titulo: string; texto: string }
  | { kind: "historial"; id: string; titulo: string; texto: string };

function labelTipo(tipo: TipoProceso): string {
  return tipo === "RC" ? "Registro calificado" : "Acreditación voluntaria";
}

export default function HistoricoProgramaModal({ opened, onClose, programa, programCode }: Props) {
  const [records, setRecords] = useState<ProcessHistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resolucionesAnteriores, setResolucionesAnteriores] = useState<ResolucionAnteriorPrograma[]>([]);
  const [addingPrevious, setAddingPrevious] = useState(false);
  const [previousType, setPreviousType] = useState<TipoProceso | null>(null);
  const [previousDate, setPreviousDate] = useState<Date | null>(null);
  const [previousFile, setPreviousFile] = useState<File | null>(null);
  const [savingPrevious, setSavingPrevious] = useState(false);
  const [observacionTarget, setObservacionTarget] = useState<ObservacionTarget | null>(null);
  const [observacionTexto, setObservacionTexto] = useState("");
  const [savingObservacion, setSavingObservacion] = useState(false);

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const [historyRes, programRes] = await Promise.all([
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-history`, {
            params: { program_code: programCode },
          }),
          axios.get<Program>(`${process.env.NEXT_PUBLIC_API_URL}/programs/${programa._id}`),
        ]);
        const list = Array.isArray(historyRes.data) ? historyRes.data as ProcessHistoryRecord[] : [];
        if (!cancelled) {
          setRecords(
            list
              .filter((record) => TIPOS.includes(record.tipo_proceso as TipoProceso))
              .sort((a, b) => String(b.fecha_resolucion ?? b.cerrado_en).localeCompare(String(a.fecha_resolucion ?? a.cerrado_en))),
          );
          setResolucionesAnteriores(programRes.data.resoluciones_anteriores ?? []);
        }
      } catch {
        if (!cancelled) {
          setRecords([]);
          setResolucionesAnteriores([]);
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
  }, [opened, programCode, programa._id]);

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

  const uploadPreviousResolution = async () => {
    if (!previousType || !previousDate || !previousFile || savingPrevious) return;
    setSavingPrevious(true);
    setMessage(null);
    try {
      const fecha = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}-${String(previousDate.getDate()).padStart(2, "0")}`;
      const formData = new FormData();
      formData.append("file", previousFile);
      formData.append("tipo_proceso", previousType);
      formData.append("fecha_resolucion", fecha);
      const response = await axios.post<Program>(
        `${process.env.NEXT_PUBLIC_API_URL}/programs/${programa._id}/resoluciones-anteriores`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setResolucionesAnteriores(response.data.resoluciones_anteriores ?? []);
      setPreviousType(null);
      setPreviousDate(null);
      setPreviousFile(null);
      setAddingPrevious(false);
      setMessage("Resolución anterior cargada correctamente.");
    } catch (error) {
      console.error("Error cargando resolución anterior:", error);
      setMessage(axios.isAxiosError(error)
        ? error.response?.data?.error || "No se pudo cargar la resolución anterior."
        : "No se pudo cargar la resolución anterior.");
    } finally {
      setSavingPrevious(false);
    }
  };

  const saveResolutionObservation = async () => {
    if (!observacionTarget || savingObservacion) return;
    setSavingObservacion(true);
    setMessage(null);
    try {
      if (observacionTarget.kind === "anterior") {
        const response = await axios.patch<Program>(
          `${process.env.NEXT_PUBLIC_API_URL}/programs/${programa._id}/resoluciones-anteriores/${observacionTarget.id}/observaciones`,
          { observaciones: observacionTexto },
        );
        setResolucionesAnteriores(response.data.resoluciones_anteriores ?? []);
      } else {
        const response = await axios.patch<{
          historial: ProcessHistoryRecord;
          advertencia: string | null;
        }>(
          `${process.env.NEXT_PUBLIC_API_URL}/process-history/${observacionTarget.id}/observaciones-resolucion`,
          { observaciones: observacionTexto },
        );
        const updated = response.data.historial;
        setRecords((current) => current.map((record) => record._id === updated._id ? updated : record));
        if (response.data.advertencia) {
          setObservacionTarget(null);
          setMessage(response.data.advertencia);
          return;
        }
      }
      setObservacionTarget(null);
      setMessage("Observaciones de resolución guardadas.");
    } catch (error) {
      console.error("Error guardando observaciones de resolución:", error);
      setMessage("No se pudieron guardar las observaciones de esta resolución.");
    } finally {
      setSavingObservacion(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (!savingPrevious) {
          setAddingPrevious(false);
          setObservacionTarget(null);
          onClose();
        }
      }}
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
          Procesos y resoluciones anteriores registrados para {programa.nombre}. Las resoluciones históricas no modifican la vigente.
        </Text>
        {message && <Text size="sm" c={message.startsWith("No") ? "red" : "green"}>{message}</Text>}
        <Group justify="flex-end">
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => setAddingPrevious((current) => !current)}
          >
            Subir resolución anterior
          </Button>
        </Group>
        {addingPrevious && (
          <Paper withBorder radius="sm" p="sm">
            <Stack gap="sm">
              <Text fw={600} size="sm">Nueva resolución anterior</Text>
              <Select
                label="Tipo de resolución"
                placeholder="Selecciona RC o AV"
                data={[
                  { value: "RC", label: "Registro calificado" },
                  { value: "AV", label: "Acreditación voluntaria" },
                ]}
                value={previousType}
                onChange={(value) => setPreviousType(value as TipoProceso | null)}
                allowDeselect={false}
                disabled={savingPrevious}
              />
              <DateInput
                label="Fecha de la resolución"
                placeholder="dd/mm/aaaa"
                value={previousDate}
                onChange={setPreviousDate}
                valueFormat="DD/MM/YYYY"
                dateParser={dateParserEspanol}
                maxDate={new Date()}
                disabled={savingPrevious}
                required
              />
              <input
                type="file"
                accept="application/pdf,.pdf"
                disabled={savingPrevious}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  if (file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
                    setPreviousFile(file);
                    setMessage(null);
                  } else if (file) {
                    setPreviousFile(null);
                    setMessage("El archivo debe ser un PDF.");
                  }
                }}
              />
              {previousFile && <Text size="xs" c="dimmed">{previousFile.name}</Text>}
              <Group justify="flex-end">
                <Button
                  size="xs"
                  variant="default"
                  disabled={savingPrevious}
                  onClick={() => {
                    setAddingPrevious(false);
                    setPreviousType(null);
                    setPreviousDate(null);
                    setPreviousFile(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  size="xs"
                  loading={savingPrevious}
                  disabled={!previousType || !previousDate || !previousFile}
                  onClick={() => void uploadPreviousResolution()}
                >
                  Guardar resolución
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}
        {loading ? (
          <Loader size="sm" mx="auto" />
        ) : recordsByType.every(({ records: items, tipo }) => (
          items.length === 0 && !resolucionesAnteriores.some((item) => item.tipo_proceso === tipo)
        )) ? (
          <Text size="sm" c="dimmed" ta="center" py="md">Este programa aún no tiene procesos cerrados.</Text>
        ) : (
          recordsByType.map(({ tipo, records: items }) => (
            <Stack key={tipo} gap="xs">
              <Divider label={labelTipo(tipo)} labelPosition="left" />
              {resolucionesAnteriores.some((item) => item.tipo_proceso === tipo) && (
                <Stack gap="xs">
                  <Text size="xs" fw={600} c="dimmed">Resoluciones anteriores</Text>
                  {resolucionesAnteriores
                    .filter((item) => item.tipo_proceso === tipo)
                    .sort((a, b) => b.fecha_resolucion.localeCompare(a.fecha_resolucion))
                    .map((item) => (
                      <Paper key={item._id} withBorder radius="sm" p="sm">
                        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                          <Text size="sm" fw={600}>{formatFechaDDMMYY(item.fecha_resolucion)}</Text>
                          <Anchor href={item.view_link} target="_blank" rel="noopener noreferrer" size="xs">
                            <Group gap={4} wrap="nowrap">
                              <IconExternalLink size={13} />
                              <span>{item.name || "Ver resolución"}</span>
                            </Group>
                          </Anchor>
                        </Group>
                        <Button
                          size="xs"
                          variant="light"
                          mt="xs"
                          onClick={() => {
                            setObservacionTarget({
                              kind: "anterior",
                              id: item._id,
                              titulo: `${labelTipo(tipo)} — ${formatFechaDDMMYY(item.fecha_resolucion)}`,
                              texto: item.observaciones ?? "",
                            });
                            setObservacionTexto(item.observaciones ?? "");
                          }}
                        >
                          {item.observaciones?.trim() ? "Ver / editar observaciones" : "Agregar observaciones"}
                        </Button>
                      </Paper>
                    ))}
                </Stack>
              )}
              {items.length === 0 ? (
                resolucionesAnteriores.some((item) => item.tipo_proceso === tipo)
                  ? null
                  : <Text size="xs" c="dimmed">Sin procesos ni resoluciones anteriores.</Text>
              ) : (
                <Divider label="Procesos cerrados" labelPosition="left" />
              )}
              {items.length > 0 && (
                items.map((record) => {
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
                          <Button
                            size="xs"
                            variant="light"
                            w="fit-content"
                            onClick={() => {
                              setObservacionTarget({
                                kind: "historial",
                                id: record._id,
                                titulo: `${labelTipo(tipo)} — ${record.subtipo || "Proceso cerrado"}`,
                                texto: record.observaciones_resolucion ?? "",
                              });
                              setObservacionTexto(record.observaciones_resolucion ?? "");
                            }}
                          >
                            {record.observaciones_resolucion?.trim() ? "Ver / editar observaciones" : "Agregar observaciones"}
                          </Button>
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
                })
              )}
            </Stack>
          ))
        )}
      </Stack>
      <Modal
        opened={observacionTarget !== null}
        onClose={() => {
          if (!savingObservacion) setObservacionTarget(null);
        }}
        title={`Observaciones — ${observacionTarget?.titulo ?? "Resolución"}`}
        centered
        size="md"
      >
        <Stack>
          <Textarea
            label="Observaciones de esta resolución"
            placeholder="Escribe observaciones..."
            minRows={4}
            autosize
            value={observacionTexto}
            onChange={(event) => setObservacionTexto(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="default"
              disabled={savingObservacion}
              onClick={() => setObservacionTarget(null)}
            >
              Cancelar
            </Button>
            <Button size="xs" loading={savingObservacion} onClick={() => void saveResolutionObservation()}>
              Guardar observaciones
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
}
