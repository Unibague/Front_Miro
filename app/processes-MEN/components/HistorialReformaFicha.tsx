"use client";

import { Divider, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import type { ProcessHistoryRecord } from "../types";
import { formatoCodigoProgramaUsuario, formatoCodigoSnies } from "../utils/programDisplay";import { ClasificacionCineNbcSection } from "./ClasificacionCineNbcSection";
import { FichaCampoLectura } from "./FichaCampoLectura";

type FichaSnapshot = NonNullable<ProcessHistoryRecord["programa_ficha_al_cierre"]>;

export default function HistorialReformaFicha({
  ficha,
  codigoProgramaRespaldo,
}: {
  ficha: FichaSnapshot;
  /** Si el snapshot antiguo no trae `dep_code_programa`, se usa el de la lista de programas cargada (no el `program_code` técnico). */
  codigoProgramaRespaldo?: string | null;
}) {
  const codigoProg =
    formatoCodigoProgramaUsuario(ficha.dep_code_programa ?? codigoProgramaRespaldo);
  return (
    <Stack gap="sm">
      <Divider label="Ficha del programa al cierre" labelPosition="left" color="orange" />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <FichaCampoLectura
          label="Código del programa"
          value={codigoProg}
        />
        <FichaCampoLectura label="Nombre del programa" value={ficha.nombre} />
        <FichaCampoLectura label="Código SNIES" value={formatoCodigoSnies(ficha.codigo_snies)} />
        <FichaCampoLectura label="Modalidad" value={ficha.modalidad} />
        <FichaCampoLectura label="Nivel académico" value={ficha.nivel_academico} />
        <FichaCampoLectura label="Nivel de formación" value={ficha.nivel_formacion} />
        <FichaCampoLectura label="N° de créditos" value={ficha.num_creditos} />
        <FichaCampoLectura label="Periodos de duración" value={ficha.periodos_duracion} />
        <FichaCampoLectura label="N° de semestres" value={ficha.num_semestres} />
        <FichaCampoLectura label="Admisión de estudiantes" value={ficha.admision_estudiantes} />
        <FichaCampoLectura label="N° estudiantes SACES" value={ficha.num_estudiantes_saces} />
      </SimpleGrid>
      <ClasificacionCineNbcSection
        cine_f={ficha.cine_f ?? undefined}
        nbc={ficha.nbc ?? undefined}
      />
    </Stack>
  );
}

export function HistorialReformaCambios({
  cambios,
}: {
  cambios: NonNullable<ProcessHistoryRecord["programa_cambios"]>;
}) {
  if (!cambios.length) {
    return (
      <Paper withBorder radius="sm" p="sm" style={{ backgroundColor: "#fff8f0", borderColor: "#fd7e14" }}>
        <Text size="xs" c="dimmed">
          No hubo cambios respecto a la ficha anterior al cerrar este proceso.
        </Text>
      </Paper>
    );
  }
  return (
    <Paper withBorder radius="sm" p="sm" style={{ backgroundColor: "#fff8f0", borderColor: "#fd7e14" }}>
      <Text size="xs" c="orange" fw={700} mb="xs">
        Campos que cambiaron respecto a la ficha anterior:
      </Text>
      <Stack gap={6}>
        {cambios.map((c, i) => (
          <Text key={i} size="xs">
            <strong>{c.label}:</strong>{" "}
            <span style={{ textDecoration: "line-through", color: "#868e96" }}>{c.antes ?? "—"}</span>
            {" → "}
            <span style={{ color: "#2b8a3e", fontWeight: 600 }}>{c.despues ?? "—"}</span>
          </Text>
        ))}
      </Stack>
    </Paper>
  );
}
