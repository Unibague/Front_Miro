"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Stack, NavLink, Text, Divider, ThemeIcon } from "@mantine/core";
import {
  IconChartBarPopular, IconHistory, IconCalendarStats,
  IconLayoutDashboard, IconGitPullRequest, IconForms, IconReportAnalytics,
  IconCurrencyDollar, IconTarget,
} from "@tabler/icons-react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { useRole } from "@/app/context/RoleContext";
import { PDI_ROUTES } from "../api";

type PdiNavItem = {
  label: string;
  icon: React.ElementType;
  path: string;
  permissionKey: string;
  color: string;
  exact: boolean;
  requiresMacroLeader?: boolean;
};

type PdiNavGroup = {
  section: string;
  items: PdiNavItem[];
};

const normalizeText = (value?: string | null) => String(value ?? "").toLowerCase().trim();


// Links exclusivos para administrador
const ADMIN_LINKS: PdiNavGroup[] = [
  {
    section: "CONTROL",
    items: [
      { label: "Gestión PDI", icon: IconChartBarPopular, path: "/pdi", permissionKey: "pdi", color: "violet", exact: true },
      { label: "Gestión de cambios", icon: IconGitPullRequest, path: "/pdi/cambios", permissionKey: "pdi", color: "violet", exact: true },
      { label: "Presupuesto", icon: IconCurrencyDollar, path: "/pdi/presupuesto", permissionKey: "pdi", color: "violet", exact: true },
    ],
  },
  {
    section: "FORMULARIOS",
    items: [
      { label: "Campos PDI", icon: IconForms, path: "/pdi/formularios", permissionKey: "pdiForms", color: "teal", exact: false },
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

// Links para responsables (sin perfil o con permiso explícito)
const RESPONSABLE_LINKS: PdiNavGroup[] = [
  {
    section: "MI PDI",
    items: [
      { label: "Mi PDI", icon: IconTarget, path: "/pdi/mis-indicadores", permissionKey: "pdiMine", color: "violet", exact: true },
    ],
  },
  {
    section: "VISTAS",
    items: [
      { label: "Tablero de control", icon: IconLayoutDashboard, path: "/pdi/dashboard", permissionKey: "pdiDashboard", color: "blue", exact: true },
      { label: "Historial PDI", icon: IconHistory, path: "/pdi/historial", permissionKey: "pdi", color: "blue", exact: false },
      { label: "Presupuesto", icon: IconCurrencyDollar, path: "/pdi/presupuesto", permissionKey: "pdi", color: "violet", exact: true },
    ],
  },
  {
    section: "INFORMES",
    items: [
      { label: "Informes de avance", icon: IconReportAnalytics, path: "/pdi/informes", permissionKey: "pdi", color: "violet", exact: false, requiresMacroLeader: true },
    ],
  },
];

export default function PdiSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const { data: session, status } = useSession();
  const { userRole } = useRole();
  const [isMacroLeader, setIsMacroLeader] = useState(false);

  const isImpersonating = !!(session?.user as any)?.originalUserEmail;
  const isAdmin = userRole === "Administrador" && !isImpersonating;

  useEffect(() => {
    if (isAdmin) {
      setIsMacroLeader(true);
      return;
    }

    if (status !== "authenticated" || !session?.user?.email) {
      setIsMacroLeader(false);
      return;
    }

    const email = normalizeText(session.user.email);
    let active = true;

    axios.get(PDI_ROUTES.informesLista())
      .then((res) => {
        if (!active) return;
        const macros: any[] = Array.isArray(res.data) ? res.data : [];
        // Solo lider_email estricto — evita falsos positivos por coincidencia de nombre
        setIsMacroLeader(macros.some((m) =>
          m.lider_email && normalizeText(m.lider_email) === email
        ));
      })
      .catch(() => {
        if (active) setIsMacroLeader(false);
      });

    return () => {
      active = false;
    };
  }, [isAdmin, session?.user, status]);

  // Sin perfiles: admin ve todo; responsables solo ven informes si lideran un macroproyecto.
  const links = useMemo(() => {
    const source = isAdmin ? ADMIN_LINKS : RESPONSABLE_LINKS;
    return source
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.requiresMacroLeader || isMacroLeader),
      }))
      .filter((group) => group.items.length > 0);
  }, [isAdmin, isMacroLeader]);

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

      {links.map((group) => {
        const visibleItems = group.items;
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
