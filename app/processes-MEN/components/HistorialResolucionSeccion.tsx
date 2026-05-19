"use client";

import {
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
} from "@mantine/core";
import { IconExternalLink, IconFileTypePdf } from "@tabler/icons-react";
import type { ProcessHistoryRecord, Program } from "../types";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";
import {
  docConstanciaReformaEnHistorial,
  docResolucionEnHistorial,
  historialEsResolucionVigentePrograma,
} from "../utils/historialResolucionVigente";
import {
  esSubtipoReformaCurricularSoloHistorial,
  esSubtipoRenovacionReformaHistorial,
  esSubtipoReformaHistorial,
} from "../utils/programaEditReforma";
import { infoFasePorNumero } from "../constants";

type DocSnap = { name: string; view_link: string };
type VigenteSnap = NonNullable<ProcessHistoryRecord["resolucion_vigente_snapshot"]>;

function subtipoHistorialEsNoRenovacion(subtipo: string | null | undefined): boolean {
  const sub = String(subtipo ?? "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return sub === "no renovacion" || sub.includes("no renovacion");
}

function TarjetaDocumento({
  doc,
  badge,
  titulo,
  color = "blue",
}: {
  doc: DocSnap;
  badge: string;
  titulo: string;
  color?: string;
}) {
  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      style={{
        borderColor: `var(--mantine-color-${color}-4)`,
        backgroundColor: `var(--mantine-color-${color}-0)`,
      }}
    >
      <Group align="center" wrap="nowrap" gap="sm">
        <ThemeIcon size={40} radius="md" variant="light" color={color} style={{ flexShrink: 0 }}>
          <IconFileTypePdf size={22} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
          <Badge size="sm" variant="filled" color={color} w="fit-content">
            {badge}
          </Badge>
          <Text size="xs" fw={600} c={`${color}.8`} lineClamp={2}>
            {titulo}
          </Text>
        </Stack>
        <Button
          component="a"
          href={doc.view_link}
          target="_blank"
          rel="noopener noreferrer"
          variant="filled"
          color={color}
          size="sm"
          leftSection={<IconExternalLink size={15} />}
          title={doc.name}
          styles={{
            root: { flexShrink: 0, justifyContent: "center", textAlign: "center" },
            label: { textAlign: "center" },
          }}
        >
          Ver documento
        </Button>
      </Group>
    </Paper>
  );
}

function MetaResolucion({
  codigo,
  fecha,
  duracion,
}: {
  codigo: string | null;
  fecha: string | null;
  duracion: number | null;
}) {
  return (
    <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
      <Paper withBorder radius="sm" p="sm">
        <Text size="xs" c="dimmed" mb={4}>Código resolución</Text>
        <Text size="sm" fw={600}>{codigo?.trim() ? codigo : "—"}</Text>
      </Paper>
      <Paper withBorder radius="sm" p="sm">
        <Text size="xs" c="dimmed" mb={4}>Fecha resolución</Text>
        <Text size="sm" fw={600}>{fecha ? formatFechaDDMMYY(fecha) : "—"}</Text>
      </Paper>
      <Paper withBorder radius="sm" p="sm">
        <Text size="xs" c="dimmed" mb={4}>Duración</Text>
        <Text size="sm" fw={600}>
          {duracion != null && !Number.isNaN(duracion) ? `${duracion} años` : "—"}
        </Text>
      </Paper>
    </SimpleGrid>
  );
}

/** RC vigente al gestionar reforma (snapshot o fallback ficha actual). */
function vigenteReformaDesdeHistorial(
  record: ProcessHistoryRecord,
  programa?: Program,
): VigenteSnap | null {
  if (record.resolucion_vigente_snapshot) {
    return record.resolucion_vigente_snapshot;
  }
  const ult = programa?.ultimo_rc;
  if (!ult) return null;
  const documentos = ult.link_documento
    ? [{ name: "Resolución vigente (ficha del programa)", view_link: String(ult.link_documento) }]
    : [];
  return {
    codigo_resolucion: ult.codigo_resolucion ?? null,
    fecha_resolucion: ult.fecha_resolucion ?? null,
    fecha_vencimiento: ult.fecha_vencimiento ?? null,
    duracion_resolucion: ult.duracion_resolucion ?? null,
    documentos,
  };
}

function BloqueVigenteReforma({
  vig,
  nota,
}: {
  vig: VigenteSnap;
  nota?: string;
}) {
  const docVig = vig.documentos?.[0];
  return (
    <Stack gap="sm">
      {nota ? <Text size="xs" c="dimmed">{nota}</Text> : null}
      {docVig ? (
        <TarjetaDocumento
          doc={docVig}
          badge="Resolución vigente al momento del trámite"
          titulo="RC que seguía vigente en la ficha (la reforma no lo sustituye)"
          color="indigo"
        />
      ) : (
        <Paper withBorder p="sm" radius="md" c="dimmed">
          <Text size="sm">Sin PDF de resolución vigente archivado.</Text>
        </Paper>
      )}
      <MetaResolucion
        codigo={vig.codigo_resolucion}
        fecha={vig.fecha_resolucion}
        duracion={vig.duracion_resolucion ?? null}
      />
      {vig.fecha_vencimiento ? (
        <Text size="xs" c="dimmed">
          Vencimiento vigente al cierre: <strong>{formatFechaDDMMYY(vig.fecha_vencimiento)}</strong>
        </Text>
      ) : null}
    </Stack>
  );
}

type Props = {
  record: ProcessHistoryRecord;
  programaHist: Program | undefined;
  registrosTipo: ProcessHistoryRecord[];
  onCambiarPdf: () => void;
};

export default function HistorialResolucionSeccion({
  record,
  programaHist,
  registrosTipo,
  onCambiarPdf,
}: Props) {
  const esRcNoRenov =
    record.tipo_proceso === "RC" && subtipoHistorialEsNoRenovacion(record.subtipo);

  const docPdfCierre = docResolucionEnHistorial(record, programaHist);
  const docConstancia = docConstanciaReformaEnHistorial(record);
  const puedeCambiarPdf =
    (record.tipo_proceso === "RC" || record.tipo_proceso === "AV")
    && (record.estado_solicitud ?? "APROBADO") !== "NEGADO"
    && (record.estado_solicitud ?? "APROBADO") !== "CANCELADO";
  const esRenovReformaHist = esSubtipoRenovacionReformaHistorial(record.subtipo);
  const esReformaSolaHist = esSubtipoReformaCurricularSoloHistorial(record.subtipo);
  const esReformaRc =
    record.tipo_proceso === "RC" && esSubtipoReformaHistorial(record.subtipo);
  const ocultarMetaResolucion =
    record.tipo_proceso === "RC"
    && esSubtipoReformaHistorial(record.subtipo)
    && !record.codigo_resolucion
    && !record.fecha_resolucion;
  const esVigenteProg = historialEsResolucionVigentePrograma(record, programaHist, registrosTipo);
  const vigenteReforma = esReformaRc ? vigenteReformaDesdeHistorial(record, programaHist) : null;

  if (esRcNoRenov) {
    const vig = record.resolucion_vigente_snapshot;
    const docsVig = vig?.documentos ?? [];
    const docVig = docsVig[0];

    return (
      <>
        <Divider label="Resolución vigente al momento del trámite" labelPosition="left" />
        <Stack gap="sm">
          {docVig ? (
            <TarjetaDocumento
              doc={docVig}
              badge="Resolución vigente (al gestionar)"
              titulo="Documento MEN vigente antes del cierre"
              color="indigo"
            />
          ) : (
            <Paper withBorder p="sm" radius="md" c="dimmed">
              <Text size="sm">Sin documento de resolución vigente archivado.</Text>
            </Paper>
          )}
          <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
            <Paper withBorder radius="sm" p="sm">
              <Text size="xs" c="dimmed" mb={4}>Código</Text>
              <Text size="sm" fw={600}>{vig?.codigo_resolucion ?? "—"}</Text>
            </Paper>
            <Paper withBorder radius="sm" p="sm">
              <Text size="xs" c="dimmed" mb={4}>Fecha de resolución</Text>
              <Text size="sm" fw={600}>
                {vig?.fecha_resolucion ? formatFechaDDMMYY(vig.fecha_resolucion) : "—"}
              </Text>
            </Paper>
            <Paper withBorder radius="sm" p="sm">
              <Text size="xs" c="dimmed" mb={4}>Fecha de vencimiento</Text>
              <Text size="sm" fw={600}>
                {vig?.fecha_vencimiento
                  ? formatFechaDDMMYY(vig.fecha_vencimiento)
                  : record.fecha_vencimiento
                    ? formatFechaDDMMYY(record.fecha_vencimiento)
                    : "—"}
              </Text>
            </Paper>
          </SimpleGrid>
        </Stack>

        <Divider label="Respuesta al cierre (no renovación)" labelPosition="left" mt="sm" />
        <Stack gap="sm">
          {(record.documentos_proceso ?? [])[0] ? (
            <TarjetaDocumento
              doc={(record.documentos_proceso ?? [])[0]}
              badge="Respuesta MEN al cierre"
              titulo="Documento de respuesta del trámite"
              color="teal"
            />
          ) : null}
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <Paper withBorder radius="sm" p="sm">
              <Text size="xs" c="dimmed" mb={4}>Fecha de respuesta</Text>
              <Text size="sm" fw={600}>
                {record.fecha_resolucion ? formatFechaDDMMYY(record.fecha_resolucion) : "—"}
              </Text>
            </Paper>
            <Paper withBorder radius="sm" p="sm">
              <Text size="xs" c="dimmed" mb={4}>Fase al cierre</Text>
              <Text size="sm" fw={600}>
                {infoFasePorNumero(7)?.fullName ?? "Plan de contingencia (no renovación)"}
              </Text>
            </Paper>
          </SimpleGrid>
        </Stack>
      </>
    );
  }

  /* Reforma curricular: constancia del cierre + RC vigente (sin cambiarlo). */
  if (esReformaSolaHist) {
    return (
      <>
        <Divider label="Documento del cierre" labelPosition="left" />
        <Text size="xs" c="dimmed" mb="xs">
          Constancia de aprobación del Ministerio. Actualiza la ficha del programa;{" "}
          <strong>no</strong> reemplaza la resolución RC vigente.
        </Text>
        <Stack gap="md">
          {docConstancia ? (
            <TarjetaDocumento
              doc={docConstancia}
              badge="Constancia del cierre"
              titulo="Aprobación del Ministerio — reforma curricular"
              color="teal"
            />
          ) : (
            <Paper withBorder p="sm" radius="md" c="dimmed">
              <Text size="sm">Sin constancia archivada en este cierre.</Text>
            </Paper>
          )}

          {vigenteReforma ? (
            <>
              <Divider label="Resolución vigente al momento de la reforma" labelPosition="left" />
              <BloqueVigenteReforma
                vig={vigenteReforma}
                nota="Referencia del RC que seguía vigente cuando se gestionó la reforma (código, fechas y PDF)."
              />
            </>
          ) : null}
        </Stack>
      </>
    );
  }

  /* Renovación + reforma: constancia, vigente al inicio, nueva resolución del cierre. */
  if (esRenovReformaHist) {
    return (
      <>
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <Divider label="Resolución y documentos del cierre" labelPosition="left" style={{ flex: 1 }} />
          {puedeCambiarPdf && (
            <Button size="xs" variant="light" onClick={onCambiarPdf}>
              Cambiar PDF
            </Button>
          )}
        </Group>
        <Stack gap="md">
          {docConstancia ? (
            <TarjetaDocumento
              doc={docConstancia}
              badge="Constancia del cierre"
              titulo="Constancia de la reforma curricular"
              color="teal"
            />
          ) : null}

          {vigenteReforma ? (
            <>
              <Divider label="Resolución vigente antes del cierre" labelPosition="left" />
              <BloqueVigenteReforma
                vig={vigenteReforma}
                nota="RC que estaba vigente al abrir el trámite, antes de la nueva resolución del cierre."
              />
            </>
          ) : null}

          {docPdfCierre || record.codigo_resolucion || record.fecha_resolucion ? (
            <>
              <Divider label="Nueva resolución MEN (cierre)" labelPosition="left" />
              <Text size="xs" c="dimmed" mb="xs">
                Resolución otorgada al cerrar la renovación con reforma; pasa a ser la vigente del programa.
              </Text>
              {docPdfCierre ? (
                <TarjetaDocumento
                  doc={docPdfCierre}
                  badge="Resolución del cierre"
                  titulo="Documento MEN — renovación + reforma"
                />
              ) : null}
              <MetaResolucion
                codigo={record.codigo_resolucion}
                fecha={record.fecha_resolucion}
                duracion={record.duracion_resolucion}
              />
            </>
          ) : null}

          {esVigenteProg && (
            <Text size="xs" c="dimmed">
              Este cierre alimenta la resolución vigente del programa en la ficha.
            </Text>
          )}
        </Stack>
      </>
    );
  }

  const hayDocumentos = !!(docPdfCierre || docConstancia);
  const hayMeta = !ocultarMetaResolucion;
  if (!hayDocumentos && !hayMeta && !puedeCambiarPdf) return null;

  return (
    <>
      <Group justify="space-between" align="center" wrap="wrap" gap="xs">
        <Divider label="Resolución" labelPosition="left" style={{ flex: 1 }} />
        {puedeCambiarPdf && (
          <Button size="xs" variant="light" onClick={onCambiarPdf}>
            Cambiar PDF
          </Button>
        )}
      </Group>

      <Stack gap="sm">
        {docPdfCierre ? (
          <TarjetaDocumento
            doc={docPdfCierre}
            badge="Resolución vigente"
            titulo="Documento oficial MEN — resolución del cierre"
          />
        ) : docConstancia ? (
          <TarjetaDocumento
            doc={docConstancia}
            badge="Documento del cierre"
            titulo="Constancia / documento de la reforma"
            color="violet"
          />
        ) : puedeCambiarPdf ? (
          <Paper withBorder p="md" radius="md" style={{ borderStyle: "dashed", backgroundColor: "#f8f9fa" }}>
            <Text size="sm" c="dimmed" ta="center">
              No hay PDF de resolución archivado. Usa «Cambiar PDF» para adjuntarlo.
            </Text>
          </Paper>
        ) : null}

        {hayMeta && (
          <MetaResolucion
            codigo={record.codigo_resolucion}
            fecha={record.fecha_resolucion}
            duracion={record.duracion_resolucion}
          />
        )}

        {esVigenteProg && (
          <Text size="xs" c="dimmed">
            Este cierre alimenta la resolución vigente del programa. Al cambiar el PDF también se actualiza la ficha.
          </Text>
        )}
      </Stack>
    </>
  );
}
