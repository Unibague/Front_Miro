"use client";

import { Text, Tooltip } from "@mantine/core";
import { faseColors } from "../constants";

const FaseBadge = ({ fase }: { fase: number | null }) => {
  if (fase === null || fase === undefined)
    return <Text size="xs" c="dimmed" ta="center">—</Text>;

  const info  = faseColors[fase];
  const color = info?.color ?? "#ced4da";
  const label = info?.fullName ?? `Fase ${fase}`;

  return (
    <Tooltip label={label} withArrow>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div style={{ backgroundColor: color, borderRadius: "6px", padding: "2px 10px" }}>
          <Text size="xs" fw={600} c="#333">Fase {fase}</Text>
        </div>
      </div>
    </Tooltip>
  );
};

export default FaseBadge;
