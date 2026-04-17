"use client";

import { Text, Stack } from "@mantine/core";
import { faseColors } from "../constants";

const FaseBadge = ({ fase, actividad }: { fase: number | null; actividad?: string | null }) => {
  if (fase === null || fase === undefined)
    return <Text size="xs" c="dimmed" ta="center">—</Text>;

  const info  = faseColors[fase];
  const color = info?.color ?? "#ced4da";
  const fullName = info?.fullName ?? `Fase ${fase}`;

  return (
    <Stack gap={4} align="center" style={{ maxWidth: 240 }}>
      <div style={{ backgroundColor: color, borderRadius: "6px", padding: "2px 10px", width: "100%" }}>
        <Text size="xs" fw={600} c="#333" ta="center">{fullName}</Text>
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
