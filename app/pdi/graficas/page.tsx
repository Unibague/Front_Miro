"use client";

import { Container, Group, Title, Text, ThemeIcon, ActionIcon } from "@mantine/core";
import { IconChartBar, IconArrowLeft } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import PdiGraficas from "../components/PdiGraficas";

export default function PdiGraficasPage() {
  const router = useRouter();

  return (
    <Container size="xl" py="xl">
      <Group mb="lg" gap={10}>
        <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <ThemeIcon size={40} radius="xl" color="violet" variant="light">
          <IconChartBar size={22} />
        </ThemeIcon>
        <div>
          <Title order={3}>Gráficas PDI</Title>
          <Text size="xs" c="dimmed">Visualización del Plan de Desarrollo</Text>
        </div>
      </Group>

      <PdiGraficas />
    </Container>
  );
}
