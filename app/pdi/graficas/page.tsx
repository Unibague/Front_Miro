"use client";

import { useRef, useState } from "react";
import { ActionIcon, Button, Container, Group, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowLeft, IconChartBar, IconDownload } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import PdiGraficas from "../components/PdiGraficas";

export default function PdiGraficasPage() {
  const router = useRouter();
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadLogoDataUrl = async () => {
    const response = await fetch("/MIRO.png");
    const blob = await response.blob();

    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleDownloadPdf = async () => {
    if (!exportRef.current || downloadingPdf) return;

    setDownloadingPdf(true);

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const target = exportRef.current;
      const logoDataUrl = await loadLogoDataUrl().catch(() => null);

      const canvas = await html2canvas(target, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: target.scrollWidth,
        windowHeight: target.scrollHeight,
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const headerHeight = 18;
      const footerHeight = 8;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2 - headerHeight - footerHeight;
      const sliceHeightPx = Math.max(1, Math.floor((contentHeight * canvas.width) / contentWidth));
      const logoHeight = 10;
      const logoWidth = (logoHeight * 181) / 238;
      const titleY = margin + 6;

      let offsetY = 0;
      let pageNumber = 0;

      while (offsetY < canvas.height) {
        const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - offsetY);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = currentSliceHeight;

        const context = pageCanvas.getContext("2d");
        if (!context) throw new Error("No se pudo generar el contexto del PDF");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        context.drawImage(
          canvas,
          0,
          offsetY,
          canvas.width,
          currentSliceHeight,
          0,
          0,
          pageCanvas.width,
          currentSliceHeight
        );

        if (pageNumber > 0) pdf.addPage();

        if (logoDataUrl) {
          pdf.addImage(logoDataUrl, "PNG", margin, margin, logoWidth, logoHeight);
        }

        pdf.setFontSize(12);
        pdf.setTextColor(0, 0, 0);
        pdf.text("Graficas PDI", pageWidth / 2, titleY, { align: "center" });
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Pagina ${pageNumber + 1}`, pageWidth - margin, pageHeight - margin / 2, { align: "right" });

        const imageHeight = (currentSliceHeight * contentWidth) / canvas.width;
        const pageImage = pageCanvas.toDataURL("image/png");
        pdf.addImage(pageImage, "PNG", margin, margin + headerHeight, contentWidth, imageHeight);

        offsetY += currentSliceHeight;
        pageNumber += 1;
      }

      const today = new Date().toISOString().slice(0, 10);
      pdf.save(`graficas-pdi-${today}.pdf`);
    } catch (error) {
      console.error("Error al descargar PDF de graficas:", error);
    } finally {
      setDownloadingPdf(false);
    }
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
            loading={downloadingPdf}
          >
            Descargar PDF
          </Button>
        </Group>

        <div ref={exportRef} className="pdf-export-area">
          <PdiGraficas />
        </div>
      </Stack>
    </Container>
  );
}
