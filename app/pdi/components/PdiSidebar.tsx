"use client";

import { Stack, NavLink, Text, Divider, ThemeIcon } from "@mantine/core";
import {
  IconChartBar, IconChartBarPopular, IconHistory, IconCalendarStats,
  IconLayoutDashboard, IconGitPullRequest, IconCalendarEvent, IconForms,
} from "@tabler/icons-react";
import { useRouter, usePathname } from "next/navigation";

export default function PdiSidebar() {
  const router   = useRouter();
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <Stack
      gap={4}
      p="sm"
      style={{
        width: 210,
        minWidth: 210,
        borderRight: "1px solid var(--mantine-color-default-border)",
        minHeight: "100vh",
        paddingTop: 16,
      }}
    >
      <Stack gap={2} px={8} pb={8}>
        <ThemeIcon size={32} radius="xl" color="violet" variant="light">
          <IconChartBarPopular size={18} />
        </ThemeIcon>
        <Text size="xs" fw={700} c="violet" mt={4}>Panel PDI</Text>
      </Stack>

      <Divider />

      <Text size="xs" c="dimmed" fw={600} px={8} pt={8}>CONTROL</Text>

      <NavLink
        label="Tablero de control"
        leftSection={<IconLayoutDashboard size={16} />}
        active={currentPath === "/pdi/dashboard"}
        color="violet"
        onClick={() => router.push("/pdi/dashboard")}
        style={{ borderRadius: 8 }}
      />

      <NavLink
        label="Gestión de cambios"
        leftSection={<IconGitPullRequest size={16} />}
        active={currentPath === "/pdi/cambios"}
        color="violet"
        onClick={() => router.push("/pdi/cambios")}
        style={{ borderRadius: 8 }}
      />

      <Divider />

      <Text size="xs" c="dimmed" fw={600} px={8} pt={8}>FORMULARIOS</Text>

      <NavLink
        label="Formularios PDI"
        leftSection={<IconForms size={16} />}
        active={currentPath.startsWith("/pdi/formularios")}
        color="teal"
        onClick={() => router.push("/pdi/formularios")}
        style={{ borderRadius: 8 }}
      />

      <Divider />

      <Text size="xs" c="dimmed" fw={600} px={8} pt={8}>VISTAS</Text>

      <NavLink
        label="Gráficas PDI"
        leftSection={<IconChartBar size={16} />}
        active={currentPath === "/pdi/graficas"}
        color="blue"
        onClick={() => router.push("/pdi/graficas")}
        style={{ borderRadius: 8 }}
      />

      <NavLink
        label="Historial de versiones"
        leftSection={<IconHistory size={16} />}
        active={currentPath === "/pdi/historial"}
        color="blue"
        onClick={() => router.push("/pdi/historial")}
        style={{ borderRadius: 8 }}
      />

      <NavLink
        label="Cortes PDI"
        leftSection={<IconCalendarStats size={16} />}
        active={currentPath === "/pdi/cortes"}
        color="blue"
        onClick={() => router.push("/pdi/cortes")}
        style={{ borderRadius: 8 }}
      />

      <NavLink
        label="Historial de Cortes"
        leftSection={<IconCalendarEvent size={16} />}
        active={currentPath === "/pdi/historial-cortes"}
        color="violet"
        onClick={() => router.push("/pdi/historial-cortes")}
        style={{ borderRadius: 8 }}
      />
    </Stack>
  );
}
