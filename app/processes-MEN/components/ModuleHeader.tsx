import { ActionIcon, Box, Divider, Group, Text, ThemeIcon, Title, Tooltip } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import type { ElementType, ReactNode } from "react";

type ModuleHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Icono del encabezado (mismo patrón que PDI y Consulta). */
  icon?: ElementType;
  color?: string;
  onBack?: () => void;
  backLabel?: string;
};

export default function ModuleHeader({
  title,
  subtitle,
  description,
  actions,
  icon: Icon,
  color = "green",
  onBack,
  backLabel = "Volver",
}: ModuleHeaderProps) {
  return (
    <Box mb="lg" style={{ width: "100%" }}>
      <Group justify="space-between" align="center" gap="md" wrap="wrap" mb="lg">
        <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
          {onBack && (
            <Tooltip label={backLabel} withArrow>
              <ActionIcon variant="subtle" onClick={onBack} aria-label={backLabel}>
                <IconArrowLeft size={18} />
              </ActionIcon>
            </Tooltip>
          )}
          {Icon && (
            <ThemeIcon size={42} radius="xl" color={color} variant="light" style={{ flexShrink: 0 }}>
              <Icon size={22} />
            </ThemeIcon>
          )}
          <Box style={{ minWidth: 0 }}>
            <Title order={3} lh={1.2}>
              {title}
            </Title>
            {subtitle && <Text size="sm" fw={600} c="dimmed" mt={2}>{subtitle}</Text>}
            {description && <Text size="xs" c="dimmed" mt={2}>{description}</Text>}
          </Box>
        </Group>
        {actions && <Group gap="sm">{actions}</Group>}
      </Group>
      <Divider />
    </Box>
  );
}
