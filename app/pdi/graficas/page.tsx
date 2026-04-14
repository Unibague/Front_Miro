"use client";

import { ActionIcon, Button, Container, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowLeft, IconChartBar, IconDownload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import PdiGraficas from "../components/PdiGraficas";

export default function PdiGraficasPage() {
  const router = useRouter();

  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" gap={10} className="no-print">
          <Group gap={10}>
            <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
              <IconArrowLeft size={18} />
            </ActionIcon>
            <ThemeIcon size={40} radius="xl" color="violet" variant="light">
              <IconChartBar size={22} />
            </ThemeIcon>
            <div>
              <Title order={3}>Graficas PDI</Title>
              <Text size="xs" c="dimmed">
                Visualizacion del Plan de Desarrollo Institucional
              </Text>
            </div>
          </Group>

          <Button
            leftSection={<IconDownload size={16} />}
            onClick={handleDownloadPdf}
            variant="light"
            color="violet"
          >
            Descargar PDF
          </Button>
        </Group>

        <div className="pdf-export-area">
          <PdiGraficas />
        </div>
      </Stack>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          body {
            background: #fff;
          }

          .no-print {
            display: none !important;
          }

          .pdf-export-area {
            width: 100% !important;
          }

          .pdf-export-area .mantine-Paper-root {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .pdf-export-area .recharts-responsive-container {
            min-height: 220px !important;
          }
        }
      `}</style>
    </Container>
  );
}
