"use client";

import {
  Box, Select, SimpleGrid, Stack, Text, TextInput,
} from "@mantine/core";
import { ClasificacionCineNbcSection } from "./ClasificacionCineNbcSection";
import {
  CAMPOS_REFORMA_UI,
  type ProgramaEditReformaState,
} from "../utils/programaEditReforma";

type Props = {
  value: ProgramaEditReformaState;
  onChange: (next: ProgramaEditReformaState) => void;
  /** Ej. tras intentar cerrar el proceso si el código institucional ya existe en otro programa. */
  codigoProgramaError?: string;
};

export default function FichaProgramaReformaPanel({
  value,
  onChange,
  codigoProgramaError,
}: Props) {
  const patch = <K extends keyof ProgramaEditReformaState>(key: K, v: ProgramaEditReformaState[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <Box px="md" py="sm" style={{ borderBottom: "1px solid #dee2e6", backgroundColor: "#fafafa" }}>
      <Text size="sm" fw={600} mb={4}>
        Ficha del programa
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        Edita la información del programa. Los cambios se aplican a la ficha al cerrar el proceso como aprobado.
      </Text>

      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {CAMPOS_REFORMA_UI.map((c) => {
            const val = value[c.key];
            if (c.tipo === "select") {
              return (
                <Select
                  key={c.key}
                  label={c.label}
                  size="sm"
                  data={c.opciones ?? []}
                  value={String(val ?? "") || null}
                  onChange={(v) => patch(c.key, v ?? "")}
                  clearable
                />
              );
            }
            return (
              <TextInput
                key={c.key}
                label={c.label}
                size="sm"
                type={c.tipo === "number" ? "number" : "text"}
                value={val === null || val === undefined ? "" : String(val)}
                error={c.key === "dep_code_programa" ? codigoProgramaError : undefined}
                onChange={(e) => patch(c.key, e.currentTarget.value)}
              />
            );
          })}
        </SimpleGrid>

        <ClasificacionCineNbcSection
          mode="edit"
          showDivider
          cine_f={value.cine_f}
          nbc={value.nbc}
          onChangeCine={(key, v) =>
            onChange({ ...value, cine_f: { ...value.cine_f, [key]: v } })
          }
          onChangeNbc={(key, v) =>
            onChange({ ...value, nbc: { ...value.nbc, [key]: v } })
          }
        />
      </Stack>
    </Box>
  );
}
