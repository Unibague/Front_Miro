"use client";

import { useState } from "react";
import {
  Stack, Text, Table, Group, Badge, Button, ScrollArea, Modal, TextInput, Paper, ThemeIcon, ActionIcon, Tooltip,
} from "@mantine/core";
import { IconSearch, IconArchive, IconMessageCircle, IconSchool, IconBuildingBank, IconFileSpreadsheet, IconCalendar } from "@tabler/icons-react";
import type { PQR, Program } from "../types";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";
import PQRImportDetails from "./PQRImportDetails";

export type PQRHistorialViewProps = {
  pqrs: PQR[];
  programas: Program[];
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

export default function PQRHistorialView({ pqrs, programas }: PQRHistorialViewProps) {
  const [viewModal, setViewModal] = useState<{ label: string; value: string } | null>(null);
  const [importDetail, setImportDetail] = useState<PQR | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const getNombrePrograma = (id?: string | null) =>
    id ? (programas.find(p => p._id === id)?.nombre ?? "Programa") : null;

  const cerrados = pqrs.filter(p => p.cerrado);
  const visibles = cerrados.filter((p) => {
    if (!busqueda.trim()) return true;
    const q = normalizar(busqueda.trim());
    return [p.nombre_solicitud, p.numero_radicado, p.cedula_encargado, getNombrePrograma(p.programa_id)]
      .some((v) => v && normalizar(String(v)).includes(q));
  });

  const verTexto = (field: string, value: string | null | undefined) => {
    if (!value) return;
    setViewModal({ label: FIELD_LABELS[field] ?? field, value });
  };

  const TEXT_LIMIT = 22;

  const textCell = (pqr: PQR, field: keyof PQR) => {
    const value = pqr[field] as string | null | undefined;
    if (value && value.length > TEXT_LIMIT) {
      return (
        <Text size="xs" className="men-editable" onClick={() => verTexto(field as string, value)}>
          {value.slice(0, TEXT_LIMIT)}…
        </Text>
      );
    }
    return <Text size="xs" c={value ? undefined : "dimmed"}>{value || "—"}</Text>;
  };

  const fecha = (valor: string | null | undefined) => valor ? (
    <Badge variant="light" color="gray" radius="sm" tt="none" leftSection={<IconCalendar size={12} />}>{formatFechaDDMMYY(valor)}</Badge>
  ) : <Text size="xs" c="dimmed">—</Text>;

  return (
    <>
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <TextInput
            placeholder="Buscar por solicitud, radicado, cédula o programa..."
            leftSection={<IconSearch size={16} />}
            value={busqueda}
            onChange={(e) => setBusqueda(e.currentTarget.value)}
            radius="xl"
            w={380}
          />
          <Badge size="lg" variant="light" color="gray" tt="none">
            {visibles.length} {visibles.length === 1 ? "PQR cerrado" : "PQRs cerrados"}
          </Badge>
        </Group>

        {cerrados.length === 0 ? (
          <Paper withBorder radius="lg" p="xl" style={{ borderStyle: "dashed" }}>
            <Stack align="center" gap={6}>
              <ThemeIcon size={48} radius="xl" variant="light" color="gray"><IconArchive size={24} /></ThemeIcon>
              <Text fw={600}>El historial está vacío</Text>
              <Text size="sm" c="dimmed">Los PQRs que cierres aparecerán aquí.</Text>
            </Stack>
          </Paper>
        ) : (
          <Paper withBorder radius="lg" style={{ overflow: "hidden" }}>
            <ScrollArea type="auto">
              <Table verticalSpacing="sm" horizontalSpacing="sm" style={{ minWidth: 960 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ ...TH_STYLE, width: "30%" }}>Solicitud</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>Fecha rad.</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>Hora</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>N° radicado</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>Medio</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>Fecha resp.</Table.Th>
                    <Table.Th style={{ ...TH_STYLE, textAlign: "center" }}>Respuesta</Table.Th>
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
                  {visibles.map((pqr) => (
                    <Table.Tr key={pqr._id} className="men-fila-pqr" style={{ boxShadow: "inset 4px 0 var(--mantine-color-gray-4)" }}>
                      <Table.Td style={{ paddingLeft: 16 }}>
                        <Text size="sm" fw={700} lineClamp={2}>{pqr.nombre_solicitud || "—"}</Text>
                        <Group gap={6} mt={4} wrap="wrap">
                          {pqr.programa_id ? (
                            <Badge size="sm" variant="light" color="blue" tt="none" leftSection={<IconSchool size={11} />}>
                              {getNombrePrograma(pqr.programa_id)}
                            </Badge>
                          ) : (
                            <Badge size="sm" variant="light" color="teal" tt="none" leftSection={<IconBuildingBank size={11} />}>
                              MEN directo
                            </Badge>
                          )}
                          <Badge size="sm" variant="outline" color="gray" tt="none">Cerrado</Badge>
                          {pqr.cedula_encargado && <Text size="xs" c="dimmed">C.C. {pqr.cedula_encargado}</Text>}
                          {!!pqr.importacion_fuentes?.length && (
                            <Button size="compact-xs" variant="subtle" leftSection={<IconFileSpreadsheet size={13} />} onClick={() => setImportDetail(pqr)}>
                              Datos del Excel
                            </Button>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>{fecha(pqr.fecha_radicacion)}</Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>{textCell(pqr, "hora")}</Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>{textCell(pqr, "numero_radicado")}</Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>{textCell(pqr, "medio_realizado")}</Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>{fecha(pqr.fecha_respuesta)}</Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>
                        {pqr.observacion_respuesta ? (
                          <Tooltip label="Ver observación / respuesta" withArrow>
                            <ActionIcon variant="light" color="blue" size="lg" aria-label="Ver respuesta"
                              onClick={() => verTexto("observacion_respuesta", pqr.observacion_respuesta)}>
                              <IconMessageCircle size={17} />
                            </ActionIcon>
                          </Tooltip>
                        ) : (
                          <Text size="xs" c="dimmed">—</Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        )}
      </Stack>
      <style>{`
        .men-editable { cursor: pointer; padding: 2px 6px; border-radius: 6px; display: inline-block; }
        .men-editable:hover { background-color: var(--mantine-color-blue-light); }
        .men-fila-pqr:hover > td { background-color: var(--mantine-color-default-hover); }
      `}</style>

      <Modal
        opened={!!viewModal}
        onClose={() => setViewModal(null)}
        title={<Text fw={700}>{viewModal?.label ?? "Detalle"}</Text>}
        centered size="md" radius="lg" zIndex={300}>
        <Stack gap="sm">
          <ScrollArea mah={300} style={{
            backgroundColor: "var(--mantine-color-default-hover)", borderRadius: 8,
            border: "1px solid var(--mantine-color-default-border)", padding: "10px 12px",
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
      <Modal opened={!!importDetail} onClose={() => setImportDetail(null)} title={<Text fw={700}>Datos y enlaces del Excel</Text>} size="lg" radius="lg" centered zIndex={300}>
        {importDetail && <PQRImportDetails pqr={importDetail} />}
      </Modal>
    </>
  );
}
