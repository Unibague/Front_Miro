"use client";

import { useState } from "react";
import { Modal, Stack, Text, Table, Group, Badge, Button, ScrollArea } from "@mantine/core";
import type { PQR, Program } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  pqrs: PQR[];
  programas: Program[];
}

const TH_BG = "#dbe4ff";
const TR_BG = "#f8f9ff";

const FIELD_LABELS: Record<string, string> = {
  nombre_solicitud:      "Solicitud",
  hora:                  "Hora",
  numero_radicado:       "N° radicado",
  medio_realizado:       "Medio / cuál",
  observacion_respuesta: "Observación / Respuesta",
};

export default function PQRHistorialModal({ opened, onClose, pqrs, programas }: Props) {
  const [viewModal, setViewModal] = useState<{ label: string; value: string } | null>(null);

  const getNombrePrograma = (id?: string | null) =>
    id ? (programas.find(p => p._id === id)?.nombre ?? "Programa") : null;

  const cerrados = pqrs.filter(p => p.cerrado);

  const verTexto = (field: string, value: string | null | undefined) => {
    if (!value) return;
    setViewModal({ label: FIELD_LABELS[field] ?? field, value });
  };

  const TEXT_LIMIT = 22;

  /* Celda de texto: corto → solo lectura inline, largo → botón Ver */
  const textCell = (pqr: PQR, field: keyof PQR) => {
    const value = pqr[field] as string | null | undefined;
    const isLong = value && value.length > TEXT_LIMIT;

    if (isLong) {
      return (
        <Group justify="center">
          <Button size="xs" variant="light" color="blue" px={6}
            onClick={() => verTexto(field as string, value)}>
            Ver
          </Button>
        </Group>
      );
    }

    return (
      <Text size="xs" style={{ color: value ? "#212529" : "#adb5bd" }}>
        {value || "—"}
      </Text>
    );
  };

  return (
    <>
      <Modal opened={opened} onClose={onClose} title="Historial de PQR" size="95vw" radius="md" centered
        styles={{ body: { padding: "12px 16px" } }}>
        {cerrados.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xl">No hay PQRs cerrados en el historial.</Text>
        ) : (
          <Table withTableBorder withColumnBorders style={{ width: "100%", tableLayout: "fixed" }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ backgroundColor: TH_BG, width: "20%" }}><Text size="xs" fw={700}>Solicitud</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "13%" }}><Text size="xs" fw={700} ta="center">Referente</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "9%" }}><Text size="xs" fw={700} ta="center">Fecha rad.</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "7%" }}><Text size="xs" fw={700} ta="center">Hora</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "10%" }}><Text size="xs" fw={700} ta="center">N° radicado</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "13%" }}><Text size="xs" fw={700} ta="center">Medio</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "9%" }}><Text size="xs" fw={700} ta="center">Fecha resp.</Text></Table.Th>
                <Table.Th style={{ backgroundColor: TH_BG, width: "19%" }}><Text size="xs" fw={700} ta="center">Obs. / Respuesta</Text></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cerrados.map((pqr, idx) => (
                <Table.Tr key={pqr._id} style={{ backgroundColor: idx % 2 === 0 ? "#fff" : TR_BG }}>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px" }}>
                    <Stack gap={2}>
                      {textCell(pqr, "nombre_solicitud")}
                      <Badge size="xs" color="gray" variant="outline">Cerrado</Badge>
                    </Stack>
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px", textAlign: "center" }}>
                    {pqr.programa_id ? (
                      <Text size="xs" style={{ color: "#1971c2", wordBreak: "break-word" }}>
                        {getNombrePrograma(pqr.programa_id)}
                      </Text>
                    ) : (
                      <Badge size="xs" color="teal" variant="light">MEN directo</Badge>
                    )}
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px", textAlign: "center" }}>
                    <Text size="xs" c={pqr.fecha_radicacion ? "dark" : "dimmed"}>{pqr.fecha_radicacion ?? "—"}</Text>
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
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px", textAlign: "center" }}>
                    <Text size="xs" c={pqr.fecha_respuesta ? "dark" : "dimmed"}>{pqr.fecha_respuesta ?? "—"}</Text>
                  </Table.Td>
                  <Table.Td style={{ verticalAlign: "middle", padding: "6px 8px", textAlign: "center" }}>
                    {pqr.observacion_respuesta ? (
                      <Button size="xs" variant="light" color="blue" px={6}
                        onClick={() => verTexto("observacion_respuesta", pqr.observacion_respuesta)}>
                        Ver
                      </Button>
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Modal>

      {/* Modal solo lectura */}
      <Modal
        opened={!!viewModal}
        onClose={() => setViewModal(null)}
        title={viewModal?.label ?? "Detalle"}
        centered size="sm" radius="md" zIndex={300}>
        <Stack gap="sm">
          <ScrollArea mah={300} style={{
            backgroundColor: "#f8f9fa", borderRadius: 6,
            border: "1px solid #dee2e6", padding: "10px 12px",
          }}>
            <Text size="sm" style={{ whiteSpace: "pre-wrap", userSelect: "text" }}>
              {viewModal?.value}
            </Text>
          </ScrollArea>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setViewModal(null)}>Cerrar</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
