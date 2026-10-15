"use client";

import { useState } from "react";
import { Alert, Badge, Box, Group, Modal, ScrollArea, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconArrowBackUp } from "@tabler/icons-react";
import { useRouter } from "next/navigation";

export interface ReporteDevuelto {
  _id: string;
  respuesta_id?: string;
  indicador_id_ref?: string;
  formulario_id_ref?: string;
  corte?: string;
  respondido_por?: string;
  indicador_id?: { _id?: string; codigo?: string; nombre?: string } | string | null;
  accion?: { _id?: string; codigo?: string; nombre?: string } | null;
  devolucion: {
    nivel: "proyecto" | "lider" | "planeacion";
    nivel_label: string;
    por?: string;
    comentario?: string;
    razones?: string[];
    fecha?: string | null;
  };
}

const NIVEL_COLOR: Record<string, string> = { proyecto: "grape", lider: "orange", planeacion: "red" };

function getMotivo(item: ReporteDevuelto) {
  const partes = [...(item.devolucion.razones ?? [])];
  if (item.devolucion.comentario?.trim()) partes.push(item.devolucion.comentario.trim());
  return partes.join(" · ") || "Sin motivo registrado";
}

function DevolucionItem({ item, onOpen, full = false }: { item: ReporteDevuelto; onOpen: () => void; full?: boolean }) {
  const indicador = typeof item.indicador_id === "object" ? item.indicador_id : null;
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      }}
      style={{
        background: "rgba(250,82,82,0.06)",
        borderRadius: 10,
        padding: "10px 12px",
        borderLeft: "3px solid #fa5252",
        cursor: "pointer",
      }}
    >
      <Group gap={6} wrap="wrap" mb={2}>
        <Text size="xs" fw={800} c="red.7" lh={1.2}>
          {item.accion?.codigo ? `Acción ${item.accion.codigo}` : indicador?.codigo ?? "Acción"}
        </Text>
        <Badge size="xs" radius="xl" variant="light" color={NIVEL_COLOR[item.devolucion.nivel] ?? "red"}>
          Devuelto por {item.devolucion.nivel_label}
        </Badge>
        {item.corte && <Badge size="xs" radius="xl" variant="outline" color="gray">Corte {item.corte}</Badge>}
      </Group>
      <Text size="xs" fw={600} lh={1.4} lineClamp={full ? undefined : 1}>{item.accion?.nombre ?? indicador?.nombre}</Text>
      {indicador?.codigo && (
        <Text size="10px" c="dimmed" lineClamp={1}>Indicador {indicador.codigo}</Text>
      )}
      <Text size="xs" mt={4} lineClamp={full ? undefined : 2}>
        <b>Motivo:</b> {getMotivo(item)}
      </Text>
      <Text size="10px" c="dimmed" mt={2}>
        {[
          item.devolucion.por && `Por: ${item.devolucion.por}`,
          item.devolucion.fecha && new Date(item.devolucion.fecha).toLocaleDateString("es-CO"),
          item.respondido_por && `Responsable: ${item.respondido_por}`,
        ].filter(Boolean).join(" · ")}
      </Text>
    </Box>
  );
}

// Alertas del panel del administrador: reportes devueltos (por el responsable del
// proyecto, el líder del macroproyecto o Planeación) que aún no se han corregido.
export default function AlertasDevoluciones({ devueltos }: { devueltos: ReporteDevuelto[] }) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  if (!devueltos.length) return null;

  const abrir = (item: ReporteDevuelto) => {
    const indicadorId = item.indicador_id_ref
      || (typeof item.indicador_id === "object" ? item.indicador_id?._id : item.indicador_id);
    if (!indicadorId) return;
    const params = new URLSearchParams({ modo: "planeacion", origen: "alertas-devoluciones" });
    if (item.corte) params.set("periodo", item.corte);
    if (item.respuesta_id ?? item._id) params.set("respuesta_id", item.respuesta_id ?? item._id);
    router.push(`/pdi/indicadores/${encodeURIComponent(indicadorId)}?${params.toString()}`);
  };

  return (
    <>
      <Alert
        mt="lg"
        radius="lg"
        color="red"
        variant="light"
        icon={<IconAlertTriangle size={18} />}
        title={
          <Group gap={8}>
            <Text fw={700} size="sm">
              {devueltos.length} acci{devueltos.length !== 1 ? "ones devueltas" : "ón devuelta"} pendiente{devueltos.length !== 1 ? "s" : ""} de corrección
            </Text>
            {devueltos.length > 4 && (
              <Text size="xs" c="red.7" fw={600} style={{ cursor: "pointer" }} onClick={() => setModal(true)}>
                Ver todas
              </Text>
            )}
          </Group>
        }
      >
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" mt={4}>
          {devueltos.slice(0, 4).map((item) => (
            <DevolucionItem key={item._id} item={item} onOpen={() => abrir(item)} />
          ))}
        </SimpleGrid>
      </Alert>

      <Modal
        opened={modal}
        onClose={() => setModal(false)}
        size="lg"
        radius="lg"
        title={
          <Group gap="xs">
            <IconArrowBackUp size={18} color="#fa5252" />
            <Text fw={700} size="sm">Acciones devueltas</Text>
          </Group>
        }
      >
        <ScrollArea h={460} offsetScrollbars>
          <Stack gap="xs">
            {devueltos.map((item) => (
              <DevolucionItem key={item._id} item={item} full onOpen={() => { setModal(false); abrir(item); }} />
            ))}
          </Stack>
        </ScrollArea>
      </Modal>
    </>
  );
}
