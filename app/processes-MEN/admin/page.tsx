"use client";

import { useState, useRef } from "react";
import {
  Paper, Title, Text, Button, Group, Stack, Alert,
  Table, Badge, Divider, Anchor, Box,
} from "@mantine/core";

type ImportadoRow = {
  fila: number;
  program_code: string;
  tipo_proceso: string;
  history_id: string;
  alerta_creada: boolean;
  alerta_id: string | null;
};

type ErrorRow = {
  fila: number;
  error?: string;
  advertencia?: string;
};

type ImportResult = {
  message: string;
  importados: ImportadoRow[];
  errores: ErrorRow[];
};

export default function AdminImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo]         = useState<File | null>(null);
  const [loading, setLoading]         = useState(false);
  const [resultado, setResultado]     = useState<ImportResult | null>(null);
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [msgRevertir, setMsgRevertir] = useState<string | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL;

  /* ── Descargar plantilla ── */
  const descargarPlantilla = () => {
    window.open(`${API}/process-history/plantilla`, "_blank");
  };

  /* ── Importar Excel ── */
  const importar = async () => {
    if (!archivo) return;
    setLoading(true);
    setResultado(null);
    setMsgRevertir(null);
    const form = new FormData();
    form.append("archivo", archivo);
    try {
      const r = await fetch(`${API}/process-history/importar`, { method: "POST", body: form });
      const data: ImportResult = await r.json();
      setResultado(data);
    } catch (e) {
      setResultado({ message: "Error de conexión.", importados: [], errores: [{ fila: 0, error: String(e) }] });
    } finally {
      setLoading(false);
    }
  };

  /* ── Revertir lo importado ── */
  const revertir = async () => {
    if (!resultado || resultado.importados.length === 0) return;
    if (!confirm(`¿Seguro que quieres borrar los ${resultado.importados.length} registro(s) importados y sus alertas?`)) return;
    setRevirtiendo(true);
    try {
      const ids = resultado.importados.map(r => r.history_id);
      const resp = await fetch(`${API}/process-history/revertir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history_ids: ids }),
      });
      const data = await resp.json();
      setMsgRevertir(data.message ?? "Revertido.");
      setResultado(null);
      setArchivo(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setMsgRevertir("Error al revertir: " + String(e));
    } finally {
      setRevirtiendo(false);
    }
  };

  return (
    <Box p="xl" maw={900} mx="auto">
      <Stack gap="lg">
        {/* Encabezado discreto */}
        <Stack gap={2}>
          <Title order={4} c="dimmed" fw={500}>Importación de historial</Title>
          <Text size="xs" c="dimmed">
            Herramienta de carga masiva. No compartir enlace.{" "}
            <Anchor href="/processes-MEN" size="xs">← Volver</Anchor>
          </Text>
        </Stack>

        <Divider />

        {/* Paso 1 */}
        <Paper withBorder p="md" radius="md">
          <Stack gap="xs">
            <Text fw={600} size="sm">1. Descarga la plantilla</Text>
            <Text size="xs" c="dimmed">
              Contiene las hojas PROCESOS (obligatoria), INFO_CASO, ACTIVIDADES y SUBACTIVIDADES.
              Los nombres de actividades RC y AV ya están incluidos como referencia.
            </Text>
            <Button variant="light" size="xs" w="fit-content" onClick={descargarPlantilla}>
              ⬇ Descargar plantilla .xlsx
            </Button>
          </Stack>
        </Paper>

        {/* Paso 2 */}
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Text fw={600} size="sm">2. Sube el archivo lleno</Text>
            <Text size="xs" c="dimmed">
              Formatos aceptados: .xlsx — una fila por proceso en la hoja PROCESOS.
            </Text>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              style={{ fontSize: 13 }}
              onChange={e => {
                setArchivo(e.target.files?.[0] ?? null);
                setResultado(null);
                setMsgRevertir(null);
              }}
            />
            <Group gap="xs">
              <Button
                size="xs"
                disabled={!archivo || loading}
                loading={loading}
                onClick={importar}
              >
                Importar
              </Button>
              {archivo && (
                <Text size="xs" c="dimmed">{archivo.name}</Text>
              )}
            </Group>
          </Stack>
        </Paper>

        {/* Resultado */}
        {resultado && (
          <Paper withBorder p="md" radius="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Text fw={600} size="sm">Resultado</Text>
                {resultado.importados.length > 0 && (
                  <Button
                    size="xs" color="red" variant="light"
                    loading={revirtiendo}
                    onClick={revertir}
                  >
                    Revertir importación
                  </Button>
                )}
              </Group>

              <Alert
                color={resultado.errores.length > 0 ? "orange" : "green"}
                variant="light"
                p="xs"
              >
                <Text size="xs">{resultado.message}</Text>
              </Alert>

              {/* Importados */}
              {resultado.importados.length > 0 && (
                <Stack gap={4}>
                  <Text size="xs" fw={600}>Importados ({resultado.importados.length})</Text>
                  <Table fz="xs" withTableBorder withColumnBorders>
                    <Table.Thead>
                        <Table.Tr>
                        <Table.Th>Fila</Table.Th>
                        <Table.Th>program_code (enlace BD)</Table.Th>
                        <Table.Th>Tipo</Table.Th>
                        <Table.Th>History ID</Table.Th>
                        <Table.Th>Alerta</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {resultado.importados.map((row, i) => (
                        <Table.Tr key={i}>
                          <Table.Td>{row.fila}</Table.Td>
                          <Table.Td>{row.program_code}</Table.Td>
                          <Table.Td>
                            <Badge size="xs" variant="light">{row.tipo_proceso}</Badge>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" ff="monospace" style={{ wordBreak: "break-all" }}>
                              {row.history_id}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {row.alerta_creada
                              ? <Badge size="xs" color="green">✓</Badge>
                              : <Badge size="xs" color="gray">—</Badge>}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              )}

              {/* Errores */}
              {resultado.errores.length > 0 && (
                <Stack gap={4}>
                  <Text size="xs" fw={600} c="red">Errores / advertencias ({resultado.errores.length})</Text>
                  {resultado.errores.map((e, i) => (
                    <Alert key={i} color={e.advertencia ? "yellow" : "red"} variant="light" p="xs">
                      <Text size="xs">
                        <strong>Fila {e.fila}:</strong> {e.error ?? e.advertencia}
                      </Text>
                    </Alert>
                  ))}
                </Stack>
              )}
            </Stack>
          </Paper>
        )}

        {/* Mensaje de revertir */}
        {msgRevertir && (
          <Alert color="blue" variant="light" p="xs">
            <Text size="xs">{msgRevertir}</Text>
          </Alert>
        )}
      </Stack>
    </Box>
  );
}
