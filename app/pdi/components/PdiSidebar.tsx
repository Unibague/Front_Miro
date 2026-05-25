"use client";

import { Stack, NavLink, Text, Divider, ThemeIcon } from "@mantine/core";
import {
  IconChartBarPopular, IconHistory, IconCalendarStats,
  IconLayoutDashboard, IconGitPullRequest, IconForms, IconReportAnalytics,
  IconCurrencyDollar,
} from "@tabler/icons-react";
import { useRouter, usePathname } from "next/navigation";
import { useRole } from "@/app/context/RoleContext";

const SIDEBAR_LINKS = [
  {
    section: "CONTROL",
    items: [
      { label: "Dashboard", icon: IconChartBarPopular, path: "/pdi", permissionKey: "pdi", color: "violet", exact: true },
      { label: "Gestión de cambios", icon: IconGitPullRequest, path: "/pdi/cambios", permissionKey: "pdi", color: "violet", exact: true },
      { label: "Presupuesto", icon: IconCurrencyDollar, path: "/pdi/presupuesto", permissionKey: "pdi", color: "violet", exact: true },
    ],
  },
  {
    section: "FORMULARIOS",
    items: [
      { label: "Avances y evidencias", icon: IconForms, path: "/pdi/formularios", permissionKey: "pdiForms", color: "teal", exact: false },
    ],
  },
  {
    section: "VISTAS",
    items: [
      { label: "Tablero de control", icon: IconLayoutDashboard, path: "/pdi/dashboard", permissionKey: "pdiDashboard", color: "blue", exact: true },
      { label: "Historial PDI", icon: IconHistory, path: "/pdi/historial", permissionKey: "pdi", color: "blue", exact: false },
      { label: "Cortes PDI", icon: IconCalendarStats, path: "/pdi/cortes", permissionKey: "pdi", color: "blue", exact: true },
    ],
  },
  {
    section: "INFORMES",
    items: [
      { label: "Informes de avance", icon: IconReportAnalytics, path: "/pdi/informes", permissionKey: "pdi", color: "violet", exact: false },
    ],
  },
];

export default function PdiSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const { userRole, viewPermissions } = useRole();

  const hasPermission = (key: string) => {
    // Solo Administrador tiene acceso total sin restricciones
    if (userRole === "Administrador") return true;
    // Todos los demás respetan viewPermissions del cargo
    return Array.isArray(viewPermissions[key]) && viewPermissions[key].length > 0;
  };

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

      {SIDEBAR_LINKS.map((group) => {
        const visibleItems = group.items.filter((item) => hasPermission(item.permissionKey));
        if (visibleItems.length === 0) return null;

        return (
          <Stack key={group.section} gap={0}>
            <Divider />
            <Text size="xs" c="dimmed" fw={600} px={8} pt={8}>{group.section}</Text>
            {visibleItems.map((item) => (
              <NavLink
                key={item.path}
                label={item.label}
                leftSection={<item.icon size={16} />}
                active={item.exact ? currentPath === item.path : currentPath.startsWith(item.path)}
                color={item.color}
                onClick={() => router.push(item.path)}
                style={{ borderRadius: 8 }}
              />
            ))}
          </Stack>
        );
      })}
    </Stack>
  );
}
