"use client";

import { Text, Stack } from "@mantine/core";
import { infoFasePorNumero } from "../constants";

const FaseBadge = ({ fase, actividad }: { fase: number | null; actividad?: string | null }) => {
  if (fase === null || fase === undefined)
    return <Text size="xs" c="dimmed" ta="center" fs="italic">Sin proceso activo</Text>;

  const info = infoFasePorNumero(fase);
  const color = info?.color ?? "#ced4da";
  const label = info?.label ?? `Fase ${fase}`;
  const fullName = info?.fullName ?? `Fase ${fase}`;

  return (
    <Stack gap={4} align="center" justify="center" w="100%" maw={220} mx="auto">
      <div
        title={fullName}
        style={{
          backgroundColor: color,
          borderRadius: "6px",
          padding: "4px 10px",
          maxWidth: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <Text size="xs" fw={600} c="#333" ta="center" style={{ lineHeight: 1.25, width: "100%" }}>
          {label}
        </Text>
      </div>
      {actividad ? (
        <Text size="sm" c="dimmed" ta="center" lineClamp={3} style={{ lineHeight: 1.35 }}>
          {actividad}
        </Text>
      ) : null}
    </Stack>
  );
};

export default FaseBadge;
