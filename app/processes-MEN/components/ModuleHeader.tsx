import { Box, Group, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

type ModuleHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export default function ModuleHeader({ title, subtitle, description, actions }: ModuleHeaderProps) {
  return (
    <Box mb="xl" style={{ width: "100%" }}>
      <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
        <Box style={{ minWidth: 0 }}>
          <Title order={2} lh={1.2}>
            {title}
          </Title>
          {subtitle && <Text size="sm" fw={600} c="dimmed" mt={4}>{subtitle}</Text>}
          {description && <Text size="sm" c="dimmed" mt={4}>{description}</Text>}
        </Box>
        {actions && <Group gap="sm">{actions}</Group>}
      </Group>
    </Box>
  );
}
