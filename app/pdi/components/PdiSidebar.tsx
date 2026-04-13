"use client";

import { Stack, NavLink, Text, Divider, ThemeIcon } from "@mantine/core";
import { IconChartBar, IconChartBarPopular } from "@tabler/icons-react";
import { useRouter, usePathname } from "next/navigation";

export default function PdiSidebar() {
  const router  = useRouter();
  const pathname = usePathname();

  return (
    <Stack
      gap={4}
      p="sm"
      style={{
        width: 200,
        minWidth: 200,
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

      <Text size="xs" c="dimmed" fw={600} px={8} pt={8}>VISTAS</Text>

      <NavLink
        label="Gráficas PDI"
        leftSection={<IconChartBar size={16} />}
        active={pathname === "/pdi/graficas"}
        color="violet"
        onClick={() => router.push("/pdi/graficas")}
        style={{ borderRadius: 8 }}
      />
    </Stack>
  );
}
