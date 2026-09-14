"use client";

import { useEffect, useState } from "react";
import { Stack, NavLink, Text, Divider, ThemeIcon, ActionIcon, Tooltip, Box } from "@mantine/core";
import { IconFolders, IconLayoutDashboard, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { useRouter, usePathname } from "next/navigation";

// El link a "Tablero" se puede ocultar sin borrar la pagina poniendo esto en
// false.
const SHOW_TABLERO_LINK = true;

const SIDEBAR_STORAGE_KEY = "miro-consulta-info-sidebar-collapsed";

// Menu lateral del modulo "Consulta de Información", igual en espiritu al
// PdiSidebar: navegacion fija a la izquierda, resaltando la ruta activa.
// Solo 2 secciones: "Tablero de estadísticas" (estadisticas de la informacion
// reportada, por ámbito) e "Información consolidada por ámbitos" (muestra
// los ámbitos como carpetas en el centro; al entrar a una se elige
// Plantillas/Informes).
//
// Es colapsable con una flecha centrada verticalmente sobre el borde derecho
// (en vez de arriba, como en PdiSidebar), para dejar más espacio al centro
// cuando no se necesita el menu. La preferencia se recuerda en localStorage.
export default function ConsultaInfoSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <Box style={{ position: "relative", flexShrink: 0, display: "flex", alignSelf: "stretch" }}>
      <Stack
        gap={4}
        p={collapsed ? 0 : "sm"}
        style={{
          width: collapsed ? 0 : 250,
          minWidth: collapsed ? 0 : 250,
          overflow: "hidden",
          borderRight: collapsed ? "none" : "1px solid var(--mantine-color-default-border)",
          alignSelf: "stretch",
          paddingTop: collapsed ? 0 : 16,
          transition: "width 180ms ease, min-width 180ms ease, padding 180ms ease",
        }}
      >
        <Stack gap={2} px={8} pb={8} style={{ whiteSpace: "nowrap" }}>
          <ThemeIcon size={32} radius="xl" color="grape" variant="light">
            <IconFolders size={18} />
          </ThemeIcon>
          <Text size="xs" fw={700} c="grape" mt={4}>Consulta de Información</Text>
        </Stack>

        <Stack gap={4} style={{ whiteSpace: "nowrap" }}>
          {SHOW_TABLERO_LINK && (
            <>
              <Divider />
              <NavLink
                label="Tablero de estadísticas"
                leftSection={<IconLayoutDashboard size={16} />}
                active={currentPath === "/historico-docentes/tablero"}
                color="blue"
                onClick={() => router.push("/historico-docentes/tablero")}
                style={{ borderRadius: 8 }}
              />
            </>
          )}

          <Divider />
          <NavLink
            label="Información consolidada por ámbitos"
            leftSection={<IconFolders size={16} />}
            active={currentPath.startsWith("/historico-docentes/ambito")}
            color="violet"
            onClick={() => router.push("/historico-docentes/ambitos")}
            style={{ borderRadius: 8 }}
          />
        </Stack>
      </Stack>

      <Tooltip label={collapsed ? "Mostrar menú" : "Ocultar menú"} position="right" withArrow>
        <ActionIcon
          variant="filled"
          color="grape"
          radius="xl"
          size="sm"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Mostrar menú" : "Ocultar menú"}
          style={{
            // "fixed" (en vez de "absolute") para que quede centrada en el
            // viewport y siga visible aunque el contenido de un ámbito
            // expandido haga la página mucho más alta que la pantalla — con
            // "absolute" quedaba centrada respecto a TODA la página y se iba
            // fuera de vista al expandir un acordeón largo.
            position: "fixed",
            top: "50vh",
            left: collapsed ? -12 : 238,
            transform: "translateY(-50%)",
            zIndex: 100,
            border: "1px solid var(--mantine-color-default-border)",
            boxShadow: "var(--mantine-shadow-sm)",
            transition: "left 180ms ease",
          }}
        >
          {collapsed ? <IconChevronRight size={14} /> : <IconChevronLeft size={14} />}
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}
