"use client";

import { useEffect, useState } from "react";
import {
  Stack, Text, Divider, ScrollArea, Avatar, Group, Progress,
  Badge, Loader, Center, ThemeIcon, Tooltip,
} from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import axios from "axios";
import { PDI_ROUTES } from "../api";
import type { Indicador } from "../types";

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };

interface ResponsableStats {
  nombre: string;
  total: number;
  avancePromedio: number;
  semaforos: { verde: number; amarillo: number; rojo: number };
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function avatarColor(name: string) {
  const colors = ["violet", "blue", "teal", "orange", "pink", "grape", "cyan", "indigo"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export default function PdiResumenSidebar() {
  const [responsables, setResponsables] = useState<ResponsableStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(PDI_ROUTES.indicadores())
      .then(res => {
        const indicadores: Indicador[] = res.data;
        const map: Record<string, { avances: number[]; semaforos: string[] }> = {};
        for (const ind of indicadores) {
          const key = ind.responsable?.trim() || "Sin responsable";
          if (!map[key]) map[key] = { avances: [], semaforos: [] };
          map[key].avances.push(ind.avance);
          map[key].semaforos.push(ind.semaforo);
        }
        const stats: ResponsableStats[] = Object.entries(map).map(([nombre, { avances, semaforos }]) => ({
          nombre,
          total: avances.length,
          avancePromedio: Math.round(avances.reduce((a, b) => a + b, 0) / avances.length),
          semaforos: {
            verde: semaforos.filter(s => s === "verde").length,
            amarillo: semaforos.filter(s => s === "amarillo").length,
            rojo: semaforos.filter(s => s === "rojo").length,
          },
        }));
        stats.sort((a, b) => b.avancePromedio - a.avancePromedio);
        setResponsables(stats);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Stack
      gap={0}
      style={{
        width: 240,
        minWidth: 240,
        borderLeft: "1px solid var(--mantine-color-default-border)",
        minHeight: "100vh",
        backgroundColor: "var(--mantine-color-body)",
      }}
    >
      <Stack gap={4} p="sm" pb={8}>
        <Group gap={8}>
          <ThemeIcon size={28} radius="xl" color="teal" variant="light">
            <IconUsers size={15} />
          </ThemeIcon>
          <div>
            <Text size="xs" fw={700} c="teal">Responsables</Text>
            <Text size="xs" c="dimmed">Progreso por indicador</Text>
          </div>
        </Group>
      </Stack>

      <Divider />

      <ScrollArea style={{ flex: 1 }} p="sm">
        {loading ? (
          <Center py="xl"><Loader size="sm" /></Center>
        ) : responsables.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" py="md">Sin datos</Text>
        ) : (
          <Stack gap={12} pt={4}>
            {responsables.map(r => (
              <Stack key={r.nombre} gap={4}>
                <Group gap={8} wrap="nowrap">
                  <Avatar size={28} radius="xl" color={avatarColor(r.nombre)} variant="filled">
                    {initials(r.nombre)}
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Tooltip label={r.nombre} position="top-start" withArrow>
                      <Text size="xs" fw={600} truncate>{r.nombre}</Text>
                    </Tooltip>
                    <Text size="xs" c="dimmed">{r.total} indicador{r.total !== 1 ? "es" : ""}</Text>
                  </div>
                  <Text size="xs" fw={700} c={
                    r.avancePromedio >= 90 ? "green" : r.avancePromedio >= 60 ? "yellow" : "red"
                  }>{r.avancePromedio}%</Text>
                </Group>
                <Progress
                  value={r.avancePromedio}
                  color={r.avancePromedio >= 90 ? "green" : r.avancePromedio >= 60 ? "yellow" : "red"}
                  size="sm"
                  radius="xl"
                />
                <Group gap={4}>
                  {r.semaforos.verde > 0 && (
                    <Badge size="xs" color="green" variant="light">{r.semaforos.verde} ✓</Badge>
                  )}
                  {r.semaforos.amarillo > 0 && (
                    <Badge size="xs" color="yellow" variant="light">{r.semaforos.amarillo} !</Badge>
                  )}
                  {r.semaforos.rojo > 0 && (
                    <Badge size="xs" color="red" variant="light">{r.semaforos.rojo} ✗</Badge>
                  )}
                </Group>
              </Stack>
            ))}
          </Stack>
        )}
      </ScrollArea>
    </Stack>
  );
}
