"use client";

import {
  Text, Button, Paper, Group, Modal, Stack, Badge, Box, SimpleGrid, Anchor, Alert,
} from "@mantine/core";
import DropzoneCustomComponent from "@/app/components/DropzoneCustomDrop/DropzoneCustomDrop";
import type { Process, Program, ProcessDocument } from "../types";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";
import { LABEL_PROCESO, COLOR_PROCESO } from "../constants";

type Props = {
  proceso: Process;
  programa: Program;
  resolucionDoc: ProcessDocument | null;
  loadingResolucionDoc: boolean;
  resolucionDocModalOpen: boolean;
  setResolucionDocModalOpen: (v: boolean) => void;
  onAbrirCerrar: () => void;
  onUploadPdf: (file: File) => Promise<void>;
  modalCerrarProceso: React.ReactNode;
  modalConfirmarCierreSinResultadoCaso: React.ReactNode;
};

export default function RcOficioPostGraciaPanel({
  proceso,
  programa,
  resolucionDoc,
  loadingResolucionDoc,
  resolucionDocModalOpen,
  setResolucionDocModalOpen,
  onAbrirCerrar,
  onUploadPdf,
  modalCerrarProceso,
  modalConfirmarCierreSinResultadoCaso,
}: Props) {
  const color = COLOR_PROCESO[proceso.tipo_proceso] ?? "#868e96";
  const gracia = proceso.rc_gracia_vigente_snapshot;
  const oficio = programa.ultimo_rc;
  const linkPdfOficio = resolucionDoc?.view_link ?? oficio?.link_documento?.trim() ?? null;

  return (
    <Paper withBorder radius="md" mb="md" style={{ overflow: "hidden" }}>
      <div
        style={{
          backgroundColor: color,
          padding: "10px 16px",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <Button size="xs" variant="white" color="red" onClick={onAbrirCerrar}>
            Cerrar proceso
          </Button>
        </div>
        <Text fw={700} c="#333" size="md" ta="center">
          {LABEL_PROCESO[proceso.tipo_proceso]}
        </Text>
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          <Badge
            variant="light"
            color="dark"
            size="sm"
            style={{ backgroundColor: "rgba(255,255,255,0.85)", color: "#333", fontSize: 11 }}
          >
            Registro calificado de oficio
          </Badge>
        </Group>
      </div>

      <Alert
        color="blue"
        variant="light"
        radius={0}
        px="md"
        py="sm"
        style={{ borderBottom: "1px solid #dee2e6" }}
        title="Confirmación de registro de oficio"
      >
        Tras la acreditación con <strong>vigencia de gracia</strong>, el RC anterior seguía vigente en ficha hasta
        registrar el oficio. Los datos del <strong>nuevo RC de oficio</strong> se cargaron al crear el proceso; aquí
        solo se confirman y se archiva el trámite al cerrar. No hay calendario de gestión ni fases.
      </Alert>

      <Box px="md" py="md">
        {gracia && (gracia.codigo_resolucion || gracia.fecha_resolucion) && (
          <Paper withBorder p="sm" radius="sm" mb="md" bg="gray.0">
            <Text size="xs" fw={700} mb={8} c="dimmed" tt="uppercase">
              Referencia — RC en vigencia de gracia
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <div>
                <Text size="xs" c="dimmed">
                  Fecha resolución
                </Text>
                <Text size="sm" fw={500}>
                  {gracia.fecha_resolucion ? formatFechaDDMMYY(gracia.fecha_resolucion) : "—"}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Código
                </Text>
                <Text size="sm" fw={500}>
                  {gracia.codigo_resolucion ?? "—"}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Vencimiento (gracia)
                </Text>
                <Text size="sm" fw={500}>
                  {gracia.fecha_vencimiento ? formatFechaDDMMYY(gracia.fecha_vencimiento) : "—"}
                </Text>
              </div>
            </SimpleGrid>
            {gracia.link_documento?.trim() && (
              <Anchor
                size="xs"
                href={gracia.link_documento}
                target="_blank"
                rel="noopener noreferrer"
                mt="xs"
                display="inline-block"
              >
                Ver PDF del RC en gracia
              </Anchor>
            )}
          </Paper>
        )}

        <Paper withBorder p="md" radius="sm">
          <Text size="sm" fw={700} mb="sm" c="blue.8">
            Resolución de registro calificado de oficio
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm" mb="sm">
            <div>
              <Text size="xs" c="dimmed">
                Fecha de resolución
              </Text>
              <Text size="sm" fw={600}>
                {oficio?.fecha_resolucion ? formatFechaDDMMYY(oficio.fecha_resolucion) : "—"}
              </Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                Código
              </Text>
              <Text size="sm" fw={600}>
                {oficio?.codigo_resolucion ?? "—"}
              </Text>
            </div>
            <div>
              <Text size="xs" c="dimmed">
                Vigencia
              </Text>
              <Text size="sm" fw={600}>
                {oficio?.fecha_vencimiento ? formatFechaDDMMYY(oficio.fecha_vencimiento) : "—"}
                <Text span size="xs" c="dimmed" ml={4}>
                  (7 años)
                </Text>
              </Text>
            </div>
          </SimpleGrid>
          <Group gap="sm" align="center">
            {linkPdfOficio ? (
              <Anchor size="sm" href={linkPdfOficio} target="_blank" rel="noopener noreferrer">
                Ver PDF de oficio
              </Anchor>
            ) : (
              <Text size="xs" c="orange">
                Sin PDF adjunto
              </Text>
            )}
            <Button
              size="xs"
              variant="light"
              loading={loadingResolucionDoc}
              onClick={() => setResolucionDocModalOpen(true)}
            >
              {resolucionDoc ? "Cambiar PDF" : "Adjuntar PDF"}
            </Button>
          </Group>
        </Paper>

        <Text size="xs" c="dimmed" mt="md" ta="center">
          Cuando los datos sean correctos, usa <strong>Cerrar proceso</strong> para archivar en historial.
        </Text>
      </Box>

      <Modal
        opened={resolucionDocModalOpen}
        onClose={() => setResolucionDocModalOpen(false)}
        title="PDF — registro calificado de oficio"
        centered
        size="md"
        radius="md"
      >
        <Stack>
          {resolucionDoc && (
            <Paper withBorder p="sm" radius="sm">
              <Text size="xs" fw={600} mb={4}>
                Archivo actual
              </Text>
              <Anchor size="xs" href={resolucionDoc.view_link} target="_blank" rel="noopener noreferrer">
                {resolucionDoc.name}
              </Anchor>
            </Paper>
          )}
          <DropzoneCustomComponent
            text={
              loadingResolucionDoc
                ? "Subiendo documento..."
                : "Haz clic o arrastra el PDF de la resolución de oficio"
            }
            onDrop={async (files) => {
              const file = files[0];
              if (file) await onUploadPdf(file);
            }}
          />
        </Stack>
      </Modal>

      {modalCerrarProceso}
      {modalConfirmarCierreSinResultadoCaso}
    </Paper>
  );
}
