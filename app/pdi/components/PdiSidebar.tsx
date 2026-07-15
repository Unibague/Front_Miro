"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Stack, NavLink, Text, Divider, ThemeIcon } from "@mantine/core";
import {
  IconChartBarPopular, IconHistory, IconCalendarStats,
  IconLayoutDashboard, IconGitPullRequest, IconForms, IconReportAnalytics,
  IconCurrencyDollar, IconTarget, IconNetwork,
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
      { label: "Red de nodos", icon: IconNetwork, path: "/pdi/dashboard/red-nodos", permissionKey: "pdiDashboard", color: "blue", exact: true },
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
      { label: "Red de nodos", icon: IconNetwork, path: "/pdi/dashboard/red-nodos", permissionKey: "pdiDashboard", color: "blue", exact: true },
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

  // El menú debe reflejar el rol ACTIVO de la cuenta que se está viendo (la
  // impersonada, si aplica) — igual que el resto de las páginas de PDI y la
  // insignia de rol del navbar. Antes se forzaba a "no admin" durante
  // cualquier impersonación, lo que rompía el menú para cuentas que sí
  // tienen rol Administrador (p. ej. alguien con doble rol Administrador +
  // Responsable, cada uno con su propio perfil).
  const isAdmin = userRole === "Administrador";

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
        // Buscar si el usuario es líder en CUALQUIER posición (legacy o nuevo array)
        setIsMacroLeader(macros.some((m) => {
          // Formato legacy
          if (m.lider_email && normalizeText(m.lider_email) === email) return true;
          // Formato nuevo - búsqueda en array lideres
          if (m.lideres && Array.isArray(m.lideres)) {
            return m.lideres.some((l: { nombre?: string; email?: string }) => 
              (l.email && normalizeText(l.email) === email) ||
              (l.nombre && normalizeText(l.nombre) === email)
            );
          }
          return false;
        }));
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
