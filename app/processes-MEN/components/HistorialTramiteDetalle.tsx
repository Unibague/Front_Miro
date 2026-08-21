"use client";

import { useState } from "react";
import {
  Anchor,
  Box,
  Collapse,
  Divider,
  Paper,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import type { CasoFechaKey, CasoSnapshotHistorial, ProcessHistoryRecord } from "../types";
import {
  CASO_FECHA_LABELS,
  COLUMNAS_FECHA_AV,
  COLUMNAS_FECHA_PM,
  COLUMNAS_FECHA_RC_PM,
  infoFasePorNumero,
} from "../constants";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";
import { esSubtipoRcOficioHistorial, esSubtipoReformaHistorial } from "../utils/programaEditReforma";

function subtipoHistorialEsNoRenovacion(subtipo: string | null | undefined): boolean {
  const sub = String(subtipo ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return sub === "no renovacion" || sub.includes("no renovacion");
}

function esHistorialAvNoRenovacion(r: ProcessHistoryRecord): boolean {
  return r.tipo_proceso === "AV" && subtipoHistorialEsNoRenovacion(r.subtipo);
}

type DocSnap = { name: string; view_link: string; subido_en?: string | null };

const TABLA_STYLE = { width: "100%", tableLayout: "fixed" as const };
const TH_STYLE = {
  backgroundColor: "#f8f9fa",
  verticalAlign: "top" as const,
  padding: "6px 4px",
  wordBreak: "break-word" as const,
  hyphens: "auto" as const,
};
const TD_STYLE = {
  verticalAlign: "top" as const,
  padding: "10px 6px",
  wordBreak: "break-word" as const,
};
const HEAD_TEXT = { fontSize: 12, lineHeight: 1.3, fontWeight: 700 };
/** Fechas y badges — alineado con gestión activa (~12–13px). */
const FECHA_CELL = { fontSize: 13, lineHeight: 1.35, fontWeight: 600 };
const LINK_CELL = { fontSize: 12, lineHeight: 1.35 };

/** Solo observaciones (fechas del trámite del proceso). */
function CeldaObservaciones({
  obs,
  detalleKey,
  openKey,
  onToggle,
}: {
  obs: string;
  detalleKey: string;
  openKey: string | null;
  onToggle: (k: string) => void;
}) {
  const texto = obs.trim();
  const abierto = openKey === detalleKey;
  if (!texto) {
    return <Text style={{ ...FECHA_CELL, fontWeight: 400 }} c="dimmed" ta="center">—</Text>;
  }
  return (
    <Stack gap={4} align="stretch" w="100%">
      <Text
        ta="center"
        td="underline"
        style={{ ...LINK_CELL, cursor: "pointer", color: "#1971c2" }}
        onClick={() => onToggle(detalleKey)}
      >
        {abierto ? "Ocultar" : "Observaciones"}
      </Text>
      <Collapse in={abierto}>
        <Paper withBorder radius="xs" p={8} style={{ backgroundColor: "#fff9db" }}>
          <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{texto}</Text>
        </Paper>
      </Collapse>
    </Stack>
  );
}

/** Observaciones y documentos por fecha del caso (enlaces separados). */
function CeldaCasoDetalle({
  obs,
  docs,
  detalleKey,
  openObsKey,
  openDocsKey,
  onToggleObs,
  onToggleDocs,
}: {
  obs: string;
  docs: DocSnap[];
  detalleKey: string;
  openObsKey: string | null;
  openDocsKey: string | null;
  onToggleObs: (k: string) => void;
  onToggleDocs: (k: string) => void;
}) {
  const textoObs = obs.trim();
  const tieneDocs = docs.length > 0;
  const obsAbierto = openObsKey === `${detalleKey}-obs`;
  const docsAbierto = openDocsKey === `${detalleKey}-docs`;

  if (!textoObs && !tieneDocs) {
    return <Text style={{ ...FECHA_CELL, fontWeight: 400 }} c="dimmed" ta="center">—</Text>;
  }

  return (
    <Stack gap={4} align="stretch" w="100%">
      {textoObs ? (
        <>
          <Text
            ta="center"
            td="underline"
            style={{ ...LINK_CELL, cursor: "pointer", color: "#1971c2" }}
            onClick={() => onToggleObs(`${detalleKey}-obs`)}
          >
            {obsAbierto ? "Ocultar" : "Observaciones"}
          </Text>
          <Collapse in={obsAbierto}>
            <Paper withBorder radius="xs" p={8} style={{ backgroundColor: "#fff9db" }}>
              <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{textoObs}</Text>
            </Paper>
          </Collapse>
        </>
      ) : null}
      {tieneDocs ? (
        <>
          <Text
            ta="center"
            td="underline"
            style={{ ...LINK_CELL, cursor: "pointer", color: "#1971c2" }}
            onClick={() => onToggleDocs(`${detalleKey}-docs`)}
          >
            {docsAbierto ? "Ocultar" : `Docs. (${docs.length})`}
          </Text>
          <Collapse in={docsAbierto}>
            <Stack gap={2}>
              {docs.map((d, i) => (
                <Anchor key={i} href={d.view_link} target="_blank" size="sm" style={{ wordBreak: "break-word" }}>
                  📎 {d.name}
                </Anchor>
              ))}
            </Stack>
          </Collapse>
        </>
      ) : null}
    </Stack>
  );
}

function labelFaseCierre(record: ProcessHistoryRecord): string {
  if (record.fase_al_cierre === 7) {
    return infoFasePorNumero(7)?.fullName ?? "Plan de contingencia (no renovación)";
  }
  if (record.fase_al_cierre == null) return "—";
  return infoFasePorNumero(record.fase_al_cierre)?.fullName ?? `Fase ${record.fase_al_cierre}`;
}

/** Fechas del trámite con observaciones archivadas al cierre. */
export function HistorialFechasTramiteDetalle({ record }: { record: ProcessHistoryRecord }) {
  const [openDetalle, setOpenDetalle] = useState<string | null>(null);
  const toggle = (k: string) => setOpenDetalle((prev) => (prev === k ? null : k));

  if (record.tipo_proceso === "PM") {
    return (
      <>
        <Divider label="Fechas del trámite" labelPosition="left" />
        <Box style={{ overflow: "hidden" }}>
          <Table withTableBorder withColumnBorders style={TABLA_STYLE}>
            <Table.Thead>
              <Table.Tr>
                {COLUMNAS_FECHA_PM.map((col) => (
                  <Table.Th key={col.key} style={TH_STYLE}>
                    <Text ta="center" style={HEAD_TEXT}>{col.label}</Text>
                  </Table.Th>
                ))}
                <Table.Th style={TH_STYLE}>
                  <Text ta="center" style={HEAD_TEXT}>Fase al cierre</Text>
                </Table.Th>
                <Table.Th style={TH_STYLE}>
                  <Text ta="center" style={HEAD_TEXT}>Cerrado el</Text>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                {COLUMNAS_FECHA_PM.map((col) => {
                  const fecha = record[col.key as keyof ProcessHistoryRecord] as string | null;
                  const obs = String(record[col.obsKey as keyof ProcessHistoryRecord] ?? "");
                  return (
                    <Table.Td key={col.key} style={TD_STYLE}>
                      <Stack gap={4} align="center">
                        <Text ta="center" style={FECHA_CELL}>
                          {fecha ? formatFechaDDMMYY(fecha) : "—"}
                        </Text>
                        <CeldaObservaciones
                          obs={obs}
                          detalleKey={`pm-${col.key}`}
                          openKey={openDetalle}
                          onToggle={toggle}
                        />
                      </Stack>
                    </Table.Td>
                  );
                })}
                <Table.Td style={TD_STYLE}>
                  <Text ta="center" style={FECHA_CELL}>{labelFaseCierre(record)}</Text>
                </Table.Td>
                <Table.Td style={TD_STYLE}>
                  <Text ta="center" style={FECHA_CELL}>
                    {record.cerrado_en ? formatFechaDDMMYY(record.cerrado_en) : "—"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Box>
      </>
    );
  }

  if (record.tipo_proceso !== "RC" && record.tipo_proceso !== "AV" && record.tipo_proceso !== "AE") {
    return null;
  }

  const esAvNoRenov = esHistorialAvNoRenovacion(record);
  const esRcOficio = record.tipo_proceso === "RC" && esSubtipoRcOficioHistorial(record.subtipo);
  const esReforma = record.tipo_proceso === "RC" && esSubtipoReformaHistorial(record.subtipo);
  const columnas = record.tipo_proceso === "AV" ? COLUMNAS_FECHA_AV : COLUMNAS_FECHA_RC_PM;
  let columnasVisibles = esReforma
    ? columnas.filter((c) => c.key !== "fecha_vencimiento")
    : [...columnas];
  if (esAvNoRenov || esRcOficio) {
    columnasVisibles = columnas.filter((c) => c.key === "fecha_vencimiento");
  }
  const mostrarFaseAlCierre = !esRcOficio;

  return (
    <>
      <Divider
        label={esRcOficio ? "Vigencia y cierre" : "Fechas del trámite"}
        labelPosition="left"
      />
      {esRcOficio && (
        <Text size="xs" c="dimmed" mb="xs">
          Registro calificado de oficio: sin gestión de trámite. La <strong>resolución</strong> está arriba; aquí solo vigencia y fecha de cierre.
        </Text>
      )}
      {record.tipo_proceso === "RC" && esSubtipoReformaHistorial(record.subtipo) && (
        <Text size="xs" c="dimmed" mb="xs">
          Modificación: fechas gestionadas manualmente; lo relevante es la ficha y la constancia.
        </Text>
      )}
      <Box style={{ overflow: "hidden" }}>
        <Table withTableBorder withColumnBorders style={TABLA_STYLE}>
          <Table.Thead>
            <Table.Tr>
              {columnasVisibles.map((col) => (
                <Table.Th key={col.key} style={TH_STYLE}>
                  <Text ta="center" style={HEAD_TEXT}>{col.label}</Text>
                </Table.Th>
              ))}
              {mostrarFaseAlCierre && (
                <Table.Th style={TH_STYLE}>
                  <Text ta="center" style={HEAD_TEXT}>Fase al cierre</Text>
                </Table.Th>
              )}
              <Table.Th style={TH_STYLE}>
                <Text ta="center" style={HEAD_TEXT}>Cerrado el</Text>
              </Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              {columnasVisibles.map((col) => {
                const fecha = record[col.key as keyof ProcessHistoryRecord] as string | null;
                const obs = String(record[col.obsKey as keyof ProcessHistoryRecord] ?? "");
                return (
                  <Table.Td key={col.key} style={TD_STYLE}>
                    <Stack gap={4} align="center">
                      <Text ta="center" style={FECHA_CELL}>
                        {fecha ? formatFechaDDMMYY(fecha) : "—"}
                      </Text>
                      {!esRcOficio && (
                        <CeldaObservaciones
                          obs={obs}
                          detalleKey={`tram-${col.key}`}
                          openKey={openDetalle}
                          onToggle={toggle}
                        />
                      )}
                    </Stack>
                  </Table.Td>
                );
              })}
              {mostrarFaseAlCierre && (
                <Table.Td style={TD_STYLE}>
                  <Text ta="center" style={FECHA_CELL}>{labelFaseCierre(record)}</Text>
                </Table.Td>
              )}
              <Table.Td style={TD_STYLE}>
                <Text ta="center" style={FECHA_CELL}>
                  {record.cerrado_en ? formatFechaDDMMYY(record.cerrado_en) : "—"}
                </Text>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Box>
    </>
  );
}

function obsCaso(caso: CasoSnapshotHistorial, field: CasoFechaKey): string {
  const k = `obs_${field}` as keyof CasoSnapshotHistorial;
  return String(caso[k] ?? "").trim();
}

function docsCaso(caso: CasoSnapshotHistorial, field: CasoFechaKey): DocSnap[] {
  return caso.documentos_por_fecha?.[field] ?? [];
}

/** Información del caso archivada al cierre (fechas, estado, reposición, obs y docs). */
export function HistorialInformacionCaso({ record }: { record: ProcessHistoryRecord }) {
  const [openObs, setOpenObs] = useState<string | null>(null);
  const [openDocs, setOpenDocs] = useState<string | null>(null);
  const toggleObs = (k: string) => setOpenObs((prev) => (prev === k ? null : k));
  const toggleDocs = (k: string) => setOpenDocs((prev) => (prev === k ? null : k));

  const caso = record.caso_snapshot;
  if (record.tipo_proceso !== "RC" && record.tipo_proceso !== "AV" && record.tipo_proceso !== "AE") {
    return null;
  }

  if (record.tipo_proceso === "RC" && esSubtipoRcOficioHistorial(record.subtipo)) {
    return null;
  }

  if (!caso) {
    return (
      <>
        <Divider label="Información del caso" labelPosition="left" />
        <Text size="xs" c="dimmed" fs="italic">
          Este cierre se archivó antes de guardar el detalle del caso. Revisa las fases del trámite para observaciones y documentos de actividades.
        </Text>
      </>
    );
  }

  const esAvNoRenov = esHistorialAvNoRenovacion(record);
  const colsFechas: { key: CasoFechaKey; label: string }[] = esAvNoRenov
    ? [
      { key: "fecha_solicitud_radicado", label: CASO_FECHA_LABELS.fecha_solicitud_radicado },
      { key: "fecha_resolucion", label: CASO_FECHA_LABELS.fecha_resolucion },
    ]
    : [
      { key: "fecha_solicitud_radicado", label: CASO_FECHA_LABELS.fecha_solicitud_radicado },
      { key: "fecha_notificacion_completitud", label: CASO_FECHA_LABELS.fecha_notificacion_completitud },
      { key: "fecha_respuesta_completitud", label: CASO_FECHA_LABELS.fecha_respuesta_completitud },
      { key: "fecha_resolucion", label: CASO_FECHA_LABELS.fecha_resolucion },
    ];
  const muestraEstado = !esAvNoRenov;
  const mostrarApelacion = !esAvNoRenov && caso.resolucion_aprobada === false;

  const cellFont = { fontSize: 13, lineHeight: 1.35, fontWeight: 600 };

  const renderFechaCelda = (field: CasoFechaKey, bg?: string) => {
    const fecha = caso[field] as string | null | undefined;
    const isApelacion = field === "fecha_resolucion_apelacion" || field === "fecha_respuesta_men";
    return (
      <Table.Td
        key={field}
        style={{
          ...TD_STYLE,
          ...(bg ? { backgroundColor: bg } : {}),
        }}
      >
        <Stack gap={4} align="stretch">
          <Text
            fw={600}
            ta="center"
            style={{
              ...cellFont,
              padding: "4px 8px",
              borderRadius: 4,
              border: isApelacion ? "1px dashed #fd7014" : "1px dashed #4dabf7",
              backgroundColor: isApelacion ? "#fff3e0" : "#e7f5ff",
              color: fecha ? (isApelacion ? "#e67700" : "#1c7ed6") : "#adb5bd",
            }}
          >
            {fecha ? formatFechaDDMMYY(fecha) : "Sin fecha"}
          </Text>
          <CeldaCasoDetalle
            obs={obsCaso(caso, field)}
            docs={docsCaso(caso, field)}
            detalleKey={`caso-${field}`}
            openObsKey={openObs}
            openDocsKey={openDocs}
            onToggleObs={toggleObs}
            onToggleDocs={toggleDocs}
          />
        </Stack>
      </Table.Td>
    );
  };

  return (
    <>
      <Divider label="Información del caso" labelPosition="left" />
      <Box style={{ overflow: "hidden" }}>
        <Table withTableBorder withColumnBorders style={TABLA_STYLE}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={TH_STYLE}>
                <Text ta="center" style={HEAD_TEXT}>Código del caso</Text>
              </Table.Th>
              {colsFechas.map((col) => (
                <Table.Th key={col.key} style={TH_STYLE}>
                  <Text ta="center" style={HEAD_TEXT}>{col.label}</Text>
                </Table.Th>
              ))}
              {muestraEstado && (
                <Table.Th style={TH_STYLE}>
                  <Text ta="center" style={HEAD_TEXT}>Estado solicitud</Text>
                </Table.Th>
              )}
              {mostrarApelacion && (
                <>
                  <Table.Th style={{ ...TH_STYLE, backgroundColor: "#fff3e0" }}>
                    <Text ta="center" style={HEAD_TEXT}>
                      {CASO_FECHA_LABELS.fecha_resolucion_apelacion}
                    </Text>
                  </Table.Th>
                  <Table.Th style={{ ...TH_STYLE, backgroundColor: "#fff3e0" }}>
                    <Text ta="center" style={HEAD_TEXT}>
                      {CASO_FECHA_LABELS.fecha_respuesta_men}
                    </Text>
                  </Table.Th>
                </>
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td style={TD_STYLE}>
                <Text ta="center" style={FECHA_CELL}>
                  {caso.codigo_caso?.trim() ? caso.codigo_caso : "—"}
                </Text>
              </Table.Td>
              {colsFechas.map((col) => renderFechaCelda(col.key))}
              {muestraEstado && (
                <Table.Td style={TD_STYLE}>
                  <Stack gap={2} align="center" justify="center">
                    {caso.resolucion_aprobada === true && (
                      <Text style={FECHA_CELL} c="teal" ta="center">Satisfactorio</Text>
                    )}
                    {caso.resolucion_aprobada === false && (
                      <Text style={FECHA_CELL} c="red" ta="center">No satisfactorio</Text>
                    )}
                    {caso.resolucion_aprobada == null && (
                      <Text style={{ ...FECHA_CELL, fontWeight: 400 }} c="dimmed" ta="center">Sin definir</Text>
                    )}
                  </Stack>
                </Table.Td>
              )}
              {mostrarApelacion && renderFechaCelda("fecha_resolucion_apelacion", "#fff8f0")}
              {mostrarApelacion && renderFechaCelda("fecha_respuesta_men", "#fff8f0")}
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Box>
    </>
  );
}
