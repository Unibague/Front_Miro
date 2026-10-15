"use client";

import { useState } from "react";
import { ActionIcon, Badge, Box, Group, Modal, ScrollArea, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconArrowBackUp, IconSearch } from "@tabler/icons-react";
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

export function getMotivoDevolucion(item: ReporteDevuelto) {
  const partes = [...(item.devolucion.razones ?? [])];
  if (item.devolucion.comentario?.trim()) partes.push(item.devolucion.comentario.trim());
  return partes.join(" · ") || "Sin motivo registrado";
}

export function getIndicadorIdDevuelto(item: ReporteDevuelto) {
  return item.indicador_id_ref
    || (typeof item.indicador_id === "object" ? item.indicador_id?._id : item.indicador_id)
    || "";
}

// Bandeja del panel del administrador con los reportes devueltos (por el líder del
// macroproyecto o Planeación) que aún no se han corregido. Mismo estilo discreto
// que las bandejas de pendientes.
export default function AlertasDevoluciones({ devueltos }: { devueltos: ReporteDevuelto[] }) {
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const total = devueltos.length;

  const abrir = (item: ReporteDevuelto) => {
    const indicadorId = getIndicadorIdDevuelto(item);
    if (!indicadorId) return;
    const params = new URLSearchParams({ modo: "planeacion", origen: "alertas-devoluciones" });
    if (item.corte) params.set("periodo", item.corte);
    params.set("respuesta_id", item.respuesta_id ?? item._id);
    router.push(`/pdi/indicadores/${encodeURIComponent(indicadorId)}?${params.toString()}`);
  };

  const titulo = (item: ReporteDevuelto) => {
    const indicador = typeof item.indicador_id === "object" ? item.indicador_id : null;
    return item.accion?.codigo ? `Acción ${item.accion.codigo}` : indicador?.codigo ?? "Acción";
  };

  return (
    <Box mt="lg" style={{ borderTop: "1px solid var(--mantine-color-default-border)", paddingTop: 16 }}>
      <Group justify="space-between" align="center" mb="sm">
        <Group gap="sm" align="center">
          <ThemeIcon size={36} radius="xl" color={total > 0 ? "red" : "teal"} variant="light">
            <IconArrowBackUp size={18} />
          </ThemeIcon>
          <Box>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase" lh={1}>Acciones devueltas</Text>
            <Text size="sm" fw={700} lh={1.2} mt={2}>Pendientes de corrección por el responsable</Text>
          </Box>
        </Group>
        <Group gap={8}>
          {total > 0 ? (
            <>
              <Badge color="red" variant="filled" radius="xl" size="md">
                {total} devuelta{total !== 1 ? "s" : ""}
              </Badge>
              <ActionIcon variant="light" color="red" size="md" onClick={() => setModal(true)} title="Ver todas">
                <IconSearch size={14} />
              </ActionIcon>
            </>
          ) : (
            <Badge color="teal" variant="light" radius="xl" size="md">Sin devoluciones</Badge>
          )}
        </Group>
      </Group>

      {total === 0 ? (
        <Text size="sm" c="dimmed">No hay acciones devueltas pendientes de corrección.</Text>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="xs">
            {devueltos.slice(0, 8).map((item) => (
              <Box
                key={item._id}
                role="button"
                tabIndex={0}
                onClick={() => abrir(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(item); }
                }}
                title={`Motivo: ${getMotivoDevolucion(item)}`}
                style={{
                  background: "rgba(250,82,82,0.06)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  borderLeft: "3px solid #fa5252",
                  cursor: "pointer",
                }}
              >
                <Text size="xs" fw={800} c="red.7" lh={1.2}>{titulo(item)}</Text>
                <Text size="xs" lh={1.4} lineClamp={1}>Motivo: {getMotivoDevolucion(item)}</Text>
                <Text size="10px" c="dimmed" mt={2}>Corte: {item.corte} · {item.devolucion.nivel_label}</Text>
              </Box>
            ))}
          </SimpleGrid>
          {total > 8 && (
            <Text size="xs" c="red.7" fw={600} mt="xs" style={{ cursor: "pointer" }} onClick={() => setModal(true)}>
              + {total - 8} más — ver todas
            </Text>
          )}
        </>
      )}

      <Modal
        opened={modal}
        onClose={() => setModal(false)}
        size="lg"
        radius="lg"
        title={<Text fw={700} size="sm">Acciones devueltas pendientes de corrección</Text>}
      >
        <ScrollArea h={440} offsetScrollbars>
          <Stack gap={10}>
            {devueltos.map((item) => {
              const indicador = typeof item.indicador_id === "object" ? item.indicador_id : null;
              return (
                <Box
                  key={item._id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { setModal(false); abrir(item); }}
                  style={{ cursor: "pointer" }}
                >
                  <Group gap={6} align="center">
                    <Text size="xs" fw={800} c="red.7" lh={1.2}>{titulo(item)}</Text>
                    <Badge color="red" variant="light" size="xs" radius="xl">Corte {item.corte}</Badge>
                    <Badge color="gray" variant="light" size="xs" radius="xl">{item.devolucion.nivel_label}</Badge>
                  </Group>
                  <Text size="xs" lh={1.4} mt={2}>{item.accion?.nombre ?? indicador?.nombre}</Text>
                  <Text size="xs" mt={2}><b>Motivo:</b> {getMotivoDevolucion(item)}</Text>
                  <Text size="10px" c="dimmed" mt={2}>
                    {[
                      indicador?.codigo && `Indicador ${indicador.codigo}`,
                      item.devolucion.por && `Por: ${item.devolucion.por}`,
                      item.devolucion.fecha && new Date(item.devolucion.fecha).toLocaleDateString("es-CO"),
                      item.respondido_por && `Responsable: ${item.respondido_por}`,
                    ].filter(Boolean).join(" · ")}
                  </Text>
                </Box>
              );
            })}
          </Stack>
        </ScrollArea>
      </Modal>
    </Box>
  );
}
