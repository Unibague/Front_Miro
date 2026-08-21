"use client";

import { Divider, Paper, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import type { CineF, Nbc } from "../types";
import { FichaCampoLectura } from "./FichaCampoLectura";

export type CineFEdit = {
  campo_amplio: string;
  campo_especifico: string;
  campo_detallado: string;
};

export type NbcEdit = {
  area_conocimiento: string;
  nbc: string;
};

type ReadProps = {
  mode?: "read";
  cine_f?: CineF | null;
  nbc?: Nbc | null;
  showDivider?: boolean;
};

type EditProps = {
  mode: "edit";
  cine_f: CineFEdit;
  nbc: NbcEdit;
  onChangeCine: (key: keyof CineFEdit, value: string) => void;
  onChangeNbc: (key: keyof NbcEdit, value: string) => void;
  showDivider?: boolean;
};

export type ClasificacionCineNbcSectionProps = ReadProps | EditProps;

/**
 * CINE F y NBC en cuadros compactos (como el resto de la ficha),
 * agrupados en dos cajas grises.
 */
export function ClasificacionCineNbcSection(props: ClasificacionCineNbcSectionProps) {
  const showDivider = props.showDivider !== false;
  const isEdit = props.mode === "edit";

  return (
    <>
      {showDivider && <Divider label="Clasificación CINE F — NBC" labelPosition="left" />}
      <Stack gap="md">
        <Paper withBorder radius="sm" p="sm" bg="gray.0">
          <Text fw={600} size="xs" c="dimmed" mb="xs" tt="uppercase">
            CINE F — 2013 AC
          </Text>
          {isEdit ? (
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <TextInput
                label="Campo amplio"
                size="sm"
                value={props.cine_f.campo_amplio}
                onChange={(e) => props.onChangeCine("campo_amplio", e.currentTarget.value)}
              />
              <TextInput
                label="Campo específico"
                size="sm"
                value={props.cine_f.campo_especifico}
                onChange={(e) => props.onChangeCine("campo_especifico", e.currentTarget.value)}
              />
              <TextInput
                label="Campo detallado"
                size="sm"
                value={props.cine_f.campo_detallado}
                onChange={(e) => props.onChangeCine("campo_detallado", e.currentTarget.value)}
              />
            </SimpleGrid>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
              <FichaCampoLectura label="Campo amplio" value={props.cine_f?.campo_amplio} />
              <FichaCampoLectura label="Campo específico" value={props.cine_f?.campo_especifico} />
              <FichaCampoLectura label="Campo detallado" value={props.cine_f?.campo_detallado} />
            </SimpleGrid>
          )}
        </Paper>

        <Paper withBorder radius="sm" p="sm" bg="gray.0">
          <Text fw={600} size="xs" c="dimmed" mb="xs" tt="uppercase">
            NBC — Núcleo básico del conocimiento
          </Text>
          {isEdit ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label="Área de conocimiento"
                size="sm"
                value={props.nbc.area_conocimiento}
                onChange={(e) => props.onChangeNbc("area_conocimiento", e.currentTarget.value)}
              />
              <TextInput
                label="NBC"
                size="sm"
                value={props.nbc.nbc}
                onChange={(e) => props.onChangeNbc("nbc", e.currentTarget.value)}
              />
            </SimpleGrid>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <FichaCampoLectura label="Área de conocimiento" value={props.nbc?.area_conocimiento} />
              <FichaCampoLectura label="NBC" value={props.nbc?.nbc} />
            </SimpleGrid>
          )}
        </Paper>
      </Stack>
    </>
  );
}
