"use client";

import { Paper, Text, Group, Tooltip } from "@mantine/core";
import { faseColors } from "../constants";
import type { BarRow } from "../types";

const StackedBar = ({ row }: { row: BarRow }) => {
  const vals = [
    row.fase_0, row.fase_1, row.fase_2, row.fase_3, row.fase_4, row.fase_5, row.fase_6,
    row.fase_contingencia,
  ];
  const total = vals.reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: "flex", height: "28px", borderRadius: "6px", overflow: "hidden", width: "100%" }}>
      {vals.map((v, i) => v > 0 && (
        <div key={i} style={{
          width: `${(v / total) * 100}%`,
          backgroundColor: faseColors[i]?.color ?? "#ced4da",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "12px", fontWeight: 600, color: "#333",
        }}>
          {v}
        </div>
      ))}
    </div>
  );
};

const BarTable = ({ title, data }: { title: string; data: BarRow[] }) => (
  <Paper withBorder radius="md" p="md" mb="lg">
    <Text fw={700} ta="center" mb="md" size="sm">{title}</Text>
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {data.length === 0 ? (
        <Text ta="center" c="dimmed" size="sm">Sin datos para el filtro seleccionado</Text>
      ) : data.map((row, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Text size="xs" style={{ width: "160px", flexShrink: 0 }}>{row.nombre}:</Text>
          <div style={{ flex: 1 }}><StackedBar row={row} /></div>
        </div>
      ))}
    </div>
    <Group gap="md" mt="md" justify="center" wrap="wrap">
      {faseColors.map((f) => (
        <Tooltip key={f.fase} label={f.fullName} withArrow>
          <Group gap={4}>
            <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: f.color }} />
            <Text size="xs">{f.label}</Text>
          </Group>
        </Tooltip>
      ))}
    </Group>
  </Paper>
);

export default BarTable;
