"use client";

import { Stack, NavLink, Text, Divider, ThemeIcon } from "@mantine/core";
import { IconFolders, IconLayoutDashboard } from "@tabler/icons-react";
import { useRouter, usePathname } from "next/navigation";

// El link a "Tablero" queda oculto por ahora (a pedido del usuario), sin
// borrar la página: se reactiva poniendo esto en true.
const SHOW_TABLERO_LINK = false;

// Menu lateral del modulo "Consulta de Información", igual en espiritu al
// PdiSidebar: navegacion fija a la izquierda, resaltando la ruta activa.
// Solo 2 secciones: "Información enviada por Ámbitos" (muestra los ámbitos
// como carpetas en el centro; al entrar a una se elige Plantillas/Informes)
// y "Tablero" (estadisticas de la informacion reportada, por ámbito).
export default function ConsultaInfoSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const currentPath = pathname ?? "";

  return (
    <Stack
      gap={4}
      p="sm"
      style={{
        width: 250,
        minWidth: 250,
        borderRight: "1px solid var(--mantine-color-default-border)",
        minHeight: "100vh",
        paddingTop: 16,
      }}
    >
      <Stack gap={2} px={8} pb={8}>
        <ThemeIcon size={32} radius="xl" color="grape" variant="light">
          <IconFolders size={18} />
        </ThemeIcon>
        <Text size="xs" fw={700} c="grape" mt={4}>Consulta de Información</Text>
      </Stack>

      <Divider />
      <NavLink
        label="Información enviada por Ámbitos"
        leftSection={<IconFolders size={16} />}
        active={currentPath.startsWith("/historico-docentes/ambito")}
        color="violet"
        onClick={() => router.push("/historico-docentes/ambitos")}
        style={{ borderRadius: 8 }}
      />

      {SHOW_TABLERO_LINK && (
        <>
          <Divider />
          <NavLink
            label="Tablero"
            leftSection={<IconLayoutDashboard size={16} />}
            active={currentPath === "/historico-docentes/tablero"}
            color="blue"
            onClick={() => router.push("/historico-docentes/tablero")}
            style={{ borderRadius: 8 }}
          />
        </>
      )}
    </Stack>
  );
}
