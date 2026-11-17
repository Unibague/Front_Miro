"use client";

import { useState } from "react";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { IconCalendar, IconMessageCircle, IconPaperclip, IconCircleCheck, IconCircleX, IconFlag, IconHash } from "@tabler/icons-react";
import type { ElementType, ReactNode } from "react";
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
import { getCasoFechaKeyForActividad, getCasoFechaKeyForSubactividad } from "../utils/casoActividadMap";

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

/** Tarjeta de un dato del trámite: etiqueta arriba, valor destacado y acciones (observaciones / documentos) abajo. */
function TarjetaDato({
  label,
  valor,
  color = "blue",
  icon: Icon = IconCalendar,
  children,
}: {
  label: string;
  valor: ReactNode;
  color?: string;
  icon?: ElementType;
  children?: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="sm" style={{ borderTop: `3px solid var(--mantine-color-${color}-3)`, display: "flex", flexDirection: "column", gap: 6 }}>
      <Text size="xs" c="dimmed" fw={600} lh={1.3}>{label}</Text>
      <Group gap={6} wrap="nowrap" align="center">
        <Icon size={15} color={`var(--mantine-color-${color}-6)`} style={{ flexShrink: 0 }} />
        <Text size="sm" fw={700} component="div">{valor}</Text>
      </Group>
      {children}
    </Paper>
  );
}

/** Columnas de la cuadrícula de tarjetas según cuántos datos hay. */
const colsTarjetas = (n: number) => ({ base: 2, sm: Math.min(n, 3), lg: Math.min(n, 6) });

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
  if (!texto) return null;
  return (
    <Stack gap={4} align="stretch" w="100%">
      <Button size="compact-xs" variant="light" color="blue" leftSection={<IconMessageCircle size={12} />} onClick={() => onToggle(detalleKey)}>
        {abierto ? "Ocultar" : "Observaciones"}
      </Button>
      <Collapse in={abierto}>
        <Paper withBorder radius="sm" p={8} style={{ backgroundColor: "var(--mantine-color-yellow-light)" }}>
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

  if (!textoObs && !tieneDocs) return null;

  return (
    <Stack gap={4} align="stretch" w="100%">
      {textoObs ? (
        <>
          <Button size="compact-xs" variant="light" color="blue" leftSection={<IconMessageCircle size={12} />} onClick={() => onToggleObs(`${detalleKey}-obs`)}>
            {obsAbierto ? "Ocultar" : "Observaciones"}
          </Button>
          <Collapse in={obsAbierto}>
            <Paper withBorder radius="sm" p={8} style={{ backgroundColor: "var(--mantine-color-yellow-light)" }}>
              <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{textoObs}</Text>
            </Paper>
          </Collapse>
        </>
      ) : null}
      {tieneDocs ? (
        <>
          <Button size="compact-xs" variant="light" color="teal" leftSection={<IconPaperclip size={12} />} onClick={() => onToggleDocs(`${detalleKey}-docs`)}>
            {docsAbierto ? "Ocultar" : `Documentos (${docs.length})`}
          </Button>
          <Collapse in={docsAbierto}>
            <Stack gap={2}>
              {docs.map((d, i) => (
                <Anchor key={i} href={d.view_link} target="_blank" size="sm" style={{ wordBreak: "break-word" }}>
                  {d.name}
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
        <Divider styles={{ label: { fontSize: 13, fontWeight: 700, color: "var(--mantine-color-text)" } }} label="Fechas del trámite" labelPosition="left" />
        <SimpleGrid cols={colsTarjetas(COLUMNAS_FECHA_PM.length + 2)} spacing="sm">
          {COLUMNAS_FECHA_PM.map((col) => {
            const fecha = record[col.key as keyof ProcessHistoryRecord] as string | null;
            const obs = String(record[col.obsKey as keyof ProcessHistoryRecord] ?? "");
            return (
              <TarjetaDato key={col.key} label={col.label} valor={fecha ? formatFechaDDMMYY(fecha) : "—"} color="grape">
                <CeldaObservaciones obs={obs} detalleKey={`pm-${col.key}`} openKey={openDetalle} onToggle={toggle} />
              </TarjetaDato>
            );
          })}
          <TarjetaDato label="Fase al cierre" valor={labelFaseCierre(record)} color="violet" icon={IconFlag} />
          <TarjetaDato label="Cerrado el" valor={record.cerrado_en ? formatFechaDDMMYY(record.cerrado_en) : "—"} color="teal" icon={IconCircleCheck} />
        </SimpleGrid>
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
        styles={{ label: { fontSize: 13, fontWeight: 700, color: "var(--mantine-color-text)" } }} label={esRcOficio ? "Vigencia y cierre" : "Fechas del trámite"}
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
      <SimpleGrid cols={colsTarjetas(columnasVisibles.length + (mostrarFaseAlCierre ? 2 : 1))} spacing="sm">
        {columnasVisibles.map((col) => {
          const fecha = record[col.key as keyof ProcessHistoryRecord] as string | null;
          const obs = String(record[col.obsKey as keyof ProcessHistoryRecord] ?? "");
          return (
            <TarjetaDato key={col.key} label={col.label} valor={fecha ? formatFechaDDMMYY(fecha) : "—"}>
              {!esRcOficio && (
                <CeldaObservaciones obs={obs} detalleKey={`tram-${col.key}`} openKey={openDetalle} onToggle={toggle} />
              )}
            </TarjetaDato>
          );
        })}
        {mostrarFaseAlCierre && (
          <TarjetaDato label="Fase al cierre" valor={labelFaseCierre(record)} color="violet" icon={IconFlag} />
        )}
        <TarjetaDato label="Cerrado el" valor={record.cerrado_en ? formatFechaDDMMYY(record.cerrado_en) : "—"} color="teal" icon={IconCircleCheck} />
      </SimpleGrid>
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

function fechaCasoEsNoAplica(record: ProcessHistoryRecord, field: CasoFechaKey): boolean {
  return record.fases.some((fase) => fase.actividades.some((act) => {
    if (getCasoFechaKeyForActividad(fase.fase_numero, act.nombre) === field && act.no_aplica) {
      return true;
    }
    return act.subactividades.some((sub) => (
      getCasoFechaKeyForSubactividad(fase.fase_numero, sub.nombre) === field
      && (sub.no_aplica || act.no_aplica)
    ));
  }));
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
        <Divider styles={{ label: { fontSize: 13, fontWeight: 700, color: "var(--mantine-color-text)" } }} label="Información del caso" labelPosition="left" />
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

  const renderFechaCelda = (field: CasoFechaKey) => {
    const fecha = caso[field] as string | null | undefined;
    const esNoAplica = fechaCasoEsNoAplica(record, field);
    const isApelacion = field === "fecha_resolucion_apelacion" || field === "fecha_respuesta_men";
    return (
      <TarjetaDato
        key={field}
        label={CASO_FECHA_LABELS[field]}
        color={isApelacion ? "orange" : "blue"}
        valor={esNoAplica
          ? <Badge size="sm" variant="light" color="orange">N/A</Badge>
          : fecha ? formatFechaDDMMYY(fecha) : <Text span size="sm" c="dimmed" fw={400}>Sin fecha</Text>}
      >
        <CeldaCasoDetalle
          obs={obsCaso(caso, field)}
          docs={docsCaso(caso, field)}
          detalleKey={`caso-${field}`}
          openObsKey={openObs}
          openDocsKey={openDocs}
          onToggleObs={toggleObs}
          onToggleDocs={toggleDocs}
        />
      </TarjetaDato>
    );
  };

  return (
    <>
      <Divider styles={{ label: { fontSize: 13, fontWeight: 700, color: "var(--mantine-color-text)" } }} label="Información del caso" labelPosition="left" />
      <SimpleGrid cols={colsTarjetas(1 + colsFechas.length + (muestraEstado ? 1 : 0) + (mostrarApelacion ? 2 : 0))} spacing="sm">
        <TarjetaDato label="Código del caso" valor={caso.codigo_caso?.trim() ? caso.codigo_caso : "—"} color="gray" icon={IconHash} />
        {colsFechas.map((col) => renderFechaCelda(col.key))}
        {muestraEstado && (
          <TarjetaDato
            label="Estado de la solicitud"
            color={caso.resolucion_aprobada === true ? "teal" : caso.resolucion_aprobada === false ? "red" : "gray"}
            icon={caso.resolucion_aprobada === false ? IconCircleX : IconCircleCheck}
            valor={caso.resolucion_aprobada === true
              ? <Text span c="teal.7" fw={700}>Satisfactorio</Text>
              : caso.resolucion_aprobada === false
                ? <Text span c="red.7" fw={700}>No satisfactorio</Text>
                : <Text span c="dimmed" fw={400}>Sin definir</Text>}
          />
        )}
        {mostrarApelacion && renderFechaCelda("fecha_resolucion_apelacion")}
        {mostrarApelacion && renderFechaCelda("fecha_respuesta_men")}
      </SimpleGrid>
    </>
  );
}
