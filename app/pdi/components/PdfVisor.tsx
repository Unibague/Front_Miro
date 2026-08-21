"use client";

import { useEffect, useRef, useState } from "react";
import { Box, Text, Button, Loader, Group, ActionIcon } from "@mantine/core";
import {
  IconFileTypePdf, IconExternalLink,
  IconChevronLeft, IconChevronRight, IconZoomIn, IconZoomOut,
} from "@tabler/icons-react";

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const BLUE = {
  dark: "#1e3a5f", main: "#1d4ed8", soft: "#eff6ff", border: "#bfdbfe", muted: "#93c5fd",
};

interface Props {
  url: string;
  nombre: string;
}

export default function PdfVisor({ url, nombre }: Props) {
  const containerRef            = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage]         = useState(1);
  const [scale, setScale]       = useState(1.3);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const pdfRef                  = useRef<any>(null);
  const canvasRef               = useRef<HTMLCanvasElement>(null);
  const renderTaskRef           = useRef<any>(null);

  // Cargar pdfjs desde CDN como módulo ES
  const loadPdfJs = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).__pdfjs__) { resolve((window as any).__pdfjs__); return; }
      const script = document.createElement("script");
      script.type = "module";
      script.textContent = `
        import * as pdfjsLib from "${PDFJS_CDN}";
        pdfjsLib.GlobalWorkerOptions.workerSrc = "${WORKER_CDN}";
        window.__pdfjs__ = pdfjsLib;
        window.dispatchEvent(new Event("pdfjsready"));
      `;
      window.addEventListener("pdfjsready", () => resolve((window as any).__pdfjs__), { once: true });
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  // Renderizar una página en el canvas
  const renderPage = async (pdf: any, pageNum: number, sc: number) => {
    if (!canvasRef.current) return;
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }
    try {
      const pg      = await pdf.getPage(pageNum);
      const viewport = pg.getViewport({ scale: sc });
      const canvas  = canvasRef.current;
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      const ctx     = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const task = pg.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") console.error(e);
    }
  };

  // Cargar PDF
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    loadPdfJs().then(async (pdfjsLib) => {
      try {
        const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setPage(1);
        await renderPage(pdf, 1, scale);
        setLoading(false);
      } catch (e) {
        if (!cancelled) { console.error(e); setError(true); setLoading(false); }
      }
    }).catch(() => { if (!cancelled) { setError(true); setLoading(false); } });

    return () => { cancelled = true; };
  }, [url]);

  // Re-renderizar al cambiar página o zoom
  useEffect(() => {
    if (pdfRef.current && !loading) renderPage(pdfRef.current, page, scale);
  }, [page, scale]);

  if (error) return (
    <Box style={{ textAlign: "center", padding: "60px 20px" }}>
      <IconFileTypePdf size={48} color={BLUE.muted} />
      <Text size="sm" c="dimmed" mt="sm">No se pudo cargar el PDF</Text>
      <Button component="a" href={url} target="_blank" size="xs"
        color="blue" variant="light" mt="md" leftSection={<IconExternalLink size={13} />}>
        Abrir en nueva pestaña
      </Button>
    </Box>
  );

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Barra de controles */}
      <Box style={{
        background: BLUE.soft, borderBottom: `1px solid ${BLUE.border}`,
        padding: "8px 20px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <Group gap={8}>
          <ActionIcon size="sm" variant="light" color="blue" radius="md"
            disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <IconChevronLeft size={14} />
          </ActionIcon>
          <Text size="sm" fw={500} style={{ color: BLUE.dark, minWidth: 90, textAlign: "center" }}>
            {loading ? "Cargando..." : `Página ${page} de ${numPages}`}
          </Text>
          <ActionIcon size="sm" variant="light" color="blue" radius="md"
            disabled={page >= numPages} onClick={() => setPage(p => p + 1)}>
            <IconChevronRight size={14} />
          </ActionIcon>
        </Group>
        <Group gap={8}>
          <ActionIcon size="sm" variant="light" color="blue" radius="md"
            disabled={scale <= 0.6} onClick={() => setScale(s => +(s - 0.2).toFixed(1))}>
            <IconZoomOut size={14} />
          </ActionIcon>
          <Text size="xs" fw={600} style={{ color: BLUE.main, minWidth: 44, textAlign: "center" }}>
            {Math.round(scale * 100)}%
          </Text>
          <ActionIcon size="sm" variant="light" color="blue" radius="md"
            disabled={scale >= 2.5} onClick={() => setScale(s => +(s + 0.2).toFixed(1))}>
            <IconZoomIn size={14} />
          </ActionIcon>
        </Group>
      </Box>

      {/* Área del canvas */}
      <Box ref={containerRef} style={{
        flex: 1, overflow: "auto", background: "#f1f5f9",
        display: "flex", justifyContent: "center",
        alignItems: loading ? "center" : "flex-start",
        padding: "24px 16px",
      }}>
        {loading ? (
          <Box style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Loader size="md" color="blue" />
            <Text size="sm" c="dimmed">Cargando documento...</Text>
          </Box>
        ) : (
          <Box style={{ boxShadow: "0 4px 24px rgba(0,0,0,0.12)", borderRadius: 4, overflow: "hidden", background: "white" }}>
            <canvas ref={canvasRef} style={{ display: "block" }} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
