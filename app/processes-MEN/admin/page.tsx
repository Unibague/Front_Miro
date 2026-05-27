"use client";

import { useState, useRef } from "react";
import {
  Paper, Title, Text, Button, Group, Stack, Alert,
  Table, Badge, Divider, Anchor, Box, Tabs,
} from "@mantine/core";

type ImportadoRow = {
  fila: number;
  program_code: string;
  nombre_programa?: string;
  tipo_proceso: string;
  subtipo?: string;
  history_id: string;
  alerta_creada: boolean;
  alerta_actualizada?: boolean;
  alerta_id: string | null;
  vigencia_actualizada?: boolean;
  total_rc?: number | null;
  total_av?: number | null;
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

type ProgramaCreadoRow = {
  fila: number;
  _id: string;
  nombre: string;
  dep_code_facultad: string;
  dep_code_programa: string | null;
  advertencia?: string;
};

type ProgramaOmitidoRow = {
  fila: number;
  dep_code_programa?: string;
  nombre: string;
  razon: string;
};

type ProgramaActualizadoRow = ProgramaCreadoRow & {
  periodos_duracion?: string | null;
};

type ImportProgramasResult = {
  message: string;
  creados: ProgramaCreadoRow[];
  actualizados?: ProgramaActualizadoRow[];
  omitidos: ProgramaOmitidoRow[];
  errores: ErrorRow[];
  columnas_detectadas?: Record<string, number>;
  facultades_mapeo?: string[];
};

export default function AdminImportPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const fileVigRef = useRef<HTMLInputElement>(null);
  const fileProgRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoVig, setArchivoVig] = useState<File | null>(null);
  const [archivoProg, setArchivoProg] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingVig, setLoadingVig] = useState(false);
  const [loadingProg, setLoadingProg] = useState(false);
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [resultadoVig, setResultadoVig] = useState<ImportResult | null>(null);
  const [resultadoProg, setResultadoProg] = useState<ImportProgramasResult | null>(null);
  const [revirtiendo, setRevirtiendo] = useState(false);
  const [revirtiendoVig, setRevirtiendoVig] = useState(false);
  const [msgRevertir, setMsgRevertir] = useState<string | null>(null);

  const API = process.env.NEXT_PUBLIC_API_URL;

  const descargarPlantillaHistorial = () => {
    window.open(`${API}/process-history/plantilla`, "_blank");
  };

  const descargarPlantillaVigentes = () => {
    window.open(`${API}/process-history/vigentes/plantilla`, "_blank");
  };

  const descargarPlantillaProgramas = () => {
    window.open(`${API}/programs/import/plantilla`, "_blank");
  };

  const importarVigentes = async () => {
    if (!archivoVig) return;
    setLoadingVig(true);
    setResultadoVig(null);
    setMsgRevertir(null);
    const form = new FormData();
    form.append("archivo", archivoVig);
    try {
      const r = await fetch(`${API}/process-history/vigentes/importar`, { method: "POST", body: form });
      const data: ImportResult = await r.json();
      setResultadoVig(data);
    } catch (e) {
      setResultadoVig({ message: "Error de conexión.", importados: [], errores: [{ fila: 0, error: String(e) }] });
    } finally {
      setLoadingVig(false);
    }
  };

  const revertirVigentes = async () => {
    if (!resultadoVig || resultadoVig.importados.length === 0) return;
    if (!confirm(`¿Borrar ${resultadoVig.importados.length} vigente(s) importado(s) y sus alertas? (Revise la ficha del programa después.)`)) return;
    setRevirtiendoVig(true);
    try {
      const ids = resultadoVig.importados.map(r => r.history_id);
      const resp = await fetch(`${API}/process-history/vigentes/revertir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history_ids: ids }),
      });
      const data = await resp.json();
      setMsgRevertir(data.message ?? "Revertido.");
      setResultadoVig(null);
      setArchivoVig(null);
      if (fileVigRef.current) fileVigRef.current.value = "";
    } catch (e) {
      setMsgRevertir("Error al revertir: " + String(e));
    } finally {
      setRevirtiendoVig(false);
    }
  };

  const importarHistorial = async () => {
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

  const importarProgramas = async () => {
    if (!archivoProg) return;
    setLoadingProg(true);
    setResultadoProg(null);
    const form = new FormData();
    form.append("archivo", archivoProg);
    try {
      const r = await fetch(`${API}/programs/import/catalogo`, { method: "POST", body: form });
      const data: ImportProgramasResult = await r.json();
      setResultadoProg(data);
    } catch (e) {
      setResultadoProg({
        message: "Error de conexión.",
        creados: [],
        omitidos: [],
        errores: [{ fila: 0, error: String(e) }],
      });
    } finally {
      setLoadingProg(false);
    }
  };

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
        <Stack gap={2}>
          <Title order={4} c="dimmed" fw={500}>Carga masiva — processes-MEN</Title>
          <Text size="xs" c="dimmed">
            Herramienta de administración. No compartir enlace.{" "}
            <Anchor href="/processes-MEN" size="xs">← Volver</Anchor>
          </Text>
        </Stack>

        <Divider />

        <Tabs defaultValue="programas">
          <Tabs.List>
            <Tabs.Tab value="programas">Catálogo de programas</Tabs.Tab>
            <Tabs.Tab value="vigentes">Resoluciones en vigencia</Tabs.Tab>
            <Tabs.Tab value="historial">Historial (cierres pasados)</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="programas" pt="md">
            <Stack gap="md">
              <Alert color="blue" variant="light" p="xs">
                <Text size="xs">
                  Sube <strong>Plantilla_info_programas_con_IDs.xlsx</strong> (hoja <strong>Info base</strong>; fila 2 de ejemplo se omite).{" "}
                  <strong>ID_PROGRAMA</strong> → <code>dep_code_programa</code>; SNIES aparte. Facultad:{" "}
                  <strong>1</strong>→118, <strong>2</strong>→128, <strong>3</strong>→134 (NA → 118 con aviso). Si el nombre ya existe, se <strong>actualiza</strong> la ficha. Columna «Periodos de duración»: número; si trae «Semestral», se toma de «N.º semestres» o «Periodicidad de admisión».
                </Text>
              </Alert>

              <Paper withBorder p="md" radius="md">
                <Stack gap="xs">
                  <Text fw={600} size="sm">1. Plantilla de programas</Text>
                  <Text size="xs" c="dimmed">
                    Misma estructura que «Info base» (18 columnas). Opcional si no tienes el Excel institucional.
                  </Text>
                  <Button variant="light" size="xs" w="fit-content" onClick={descargarPlantillaProgramas}>
                    ⬇ Descargar plantilla catálogo
                  </Button>
                </Stack>
              </Paper>

              <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Text fw={600} size="sm">2. Subir Excel lleno</Text>
                  <input
                    ref={fileProgRef}
                    type="file"
                    accept=".xlsx"
                    style={{ fontSize: 13 }}
                    onChange={e => {
                      setArchivoProg(e.target.files?.[0] ?? null);
                      setResultadoProg(null);
                    }}
                  />
                  <Group gap="xs">
                    <Button
                      size="xs"
                      disabled={!archivoProg || loadingProg}
                      loading={loadingProg}
                      onClick={importarProgramas}
                    >
                      Importar programas
                    </Button>
                    {archivoProg && <Text size="xs" c="dimmed">{archivoProg.name}</Text>}
                  </Group>
                </Stack>
              </Paper>

              {resultadoProg && (
                <Paper withBorder p="md" radius="md">
                  <Stack gap="sm">
                    <Text fw={600} size="sm">Resultado catálogo</Text>
                    <Alert
                      color={resultadoProg.errores.length > 0 ? "orange" : "green"}
                      variant="light"
                      p="xs"
                    >
                      <Text size="xs">{resultadoProg.message}</Text>
                    </Alert>
                    {resultadoProg.facultades_mapeo && resultadoProg.facultades_mapeo.length > 0 && (
                      <Text size="xs" c="dimmed">
                        Mapeo 1→2→3: {resultadoProg.facultades_mapeo.map((n, i) => `${i + 1}=${n}`).join(" · ")}
                      </Text>
                    )}
                    {(resultadoProg.actualizados?.length ?? 0) > 0 && (
                      <Stack gap={4}>
                        <Text size="xs" fw={600} c="teal">
                          Actualizados ({resultadoProg.actualizados!.length}) — ya existían por nombre; se rellenaron periodos, SNIES, etc.
                        </Text>
                        <Table fz="xs" withTableBorder withColumnBorders>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Fila</Table.Th>
                              <Table.Th>Nombre</Table.Th>
                              <Table.Th>Periodos</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {resultadoProg.actualizados!.slice(0, 30).map((row, i) => (
                              <Table.Tr key={i}>
                                <Table.Td>{row.fila}</Table.Td>
                                <Table.Td>{row.nombre}</Table.Td>
                                <Table.Td>{row.periodos_duracion ?? "—"}</Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Stack>
                    )}
                    {resultadoProg.creados.length > 0 && (
                      <Stack gap={4}>
                        <Text size="xs" fw={600}>Creados ({resultadoProg.creados.length})</Text>
                        <Table fz="xs" withTableBorder withColumnBorders>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Fila</Table.Th>
                              <Table.Th>Nombre</Table.Th>
                              <Table.Th>_id</Table.Th>
                              <Table.Th>Cód. programa</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {resultadoProg.creados.slice(0, 50).map((row, i) => (
                              <Table.Tr key={i}>
                                <Table.Td>{row.fila}</Table.Td>
                                <Table.Td>{row.nombre}</Table.Td>
                                <Table.Td>
                                  <Text size="xs" ff="monospace" style={{ wordBreak: "break-all" }}>
                                    {row._id}
                                  </Text>
                                </Table.Td>
                                <Table.Td>{row.dep_code_programa ?? "—"}</Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                        {resultadoProg.creados.length > 50 && (
                          <Text size="xs" c="dimmed">… y {resultadoProg.creados.length - 50} más</Text>
                        )}
                      </Stack>
                    )}
                    {resultadoProg.omitidos.length > 0 && (
                      <Stack gap={4}>
                        <Text size="xs" fw={600} c="orange">Omitidos ({resultadoProg.omitidos.length})</Text>
                        {resultadoProg.omitidos.slice(0, 20).map((e, i) => (
                          <Alert key={i} color="yellow" variant="light" p="xs">
                            <Text size="xs"><strong>Fila {e.fila}:</strong> {e.razon}</Text>
                          </Alert>
                        ))}
                      </Stack>
                    )}
                    {resultadoProg.errores.length > 0 && (
                      <Stack gap={4}>
                        <Text size="xs" fw={600} c="red">Errores ({resultadoProg.errores.length})</Text>
                        {resultadoProg.errores.map((e, i) => (
                          <Alert key={i} color="red" variant="light" p="xs">
                            <Text size="xs"><strong>Fila {e.fila}:</strong> {e.error ?? e.advertencia}</Text>
                          </Alert>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="vigentes" pt="md">
            <Stack gap="md">
              <Alert color="green" variant="light" p="xs">
                <Text size="xs">
                  <strong>Paso 2 de migración:</strong> usa aquí el <strong>historial completo</strong> de los procesos
                  ya cerrados que <strong>siguen vigentes hoy</strong>. Guarda toda la información del trámite
                  (caso, observaciones, documentos, actividades y subactividades), actualiza la ficha del programa
                  y crea la alerta. No sustituye procesos abiertos en Gestión: impórtalos después con «Agregar proceso».
                </Text>
              </Alert>

              <Paper withBorder p="md" radius="md">
                <Stack gap="xs">
                  <Text fw={600} size="sm">1. Plantilla vigentes</Text>
                  <Text size="xs" c="dimmed">
                    Misma estructura del <strong>historial completo</strong>: hojas <strong>PROCESOS</strong>,
                    <strong> INFO_CASO</strong>, <strong>ACTIVIDADES</strong> y <strong>SUBACTIVIDADES</strong>.
                    En esta pestaña solo se admiten cierres <strong>RC, AV y AE aprobados</strong> que hoy siguen vigentes.
                  </Text>
                  <Button variant="light" size="xs" w="fit-content" color="green" onClick={descargarPlantillaVigentes}>
                    ⬇ Descargar plantilla vigentes
                  </Button>
                </Stack>
              </Paper>

              <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Text fw={600} size="sm">2. Subir Excel</Text>
                  <input
                    ref={fileVigRef}
                    type="file"
                    accept=".xlsx"
                    style={{ fontSize: 13 }}
                    onChange={e => {
                      setArchivoVig(e.target.files?.[0] ?? null);
                      setResultadoVig(null);
                      setMsgRevertir(null);
                    }}
                  />
                  <Group gap="xs">
                    <Button
                      size="xs"
                      color="green"
                      disabled={!archivoVig || loadingVig}
                      loading={loadingVig}
                      onClick={importarVigentes}
                    >
                      Importar vigentes
                    </Button>
                    {archivoVig && <Text size="xs" c="dimmed">{archivoVig.name}</Text>}
                  </Group>
                </Stack>
              </Paper>

              {resultadoVig && (
                <Paper withBorder p="md" radius="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <Text fw={600} size="sm">Resultado vigentes</Text>
                      {resultadoVig.importados.length > 0 && (
                        <Button
                          size="xs" color="red" variant="light"
                          loading={revirtiendoVig}
                          onClick={revertirVigentes}
                        >
                          Revertir
                        </Button>
                      )}
                    </Group>
                    <Alert
                      color={resultadoVig.errores.length > 0 ? "orange" : "green"}
                      variant="light"
                      p="xs"
                    >
                      <Text size="xs">{resultadoVig.message}</Text>
                    </Alert>
                    {resultadoVig.importados.length > 0 && (
                      <Table fz="xs" withTableBorder withColumnBorders>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Fila</Table.Th>
                            <Table.Th>Tipo</Table.Th>
                            <Table.Th>Programa</Table.Th>
                            <Table.Th>RC/AV #</Table.Th>
                            <Table.Th>Vigencia</Table.Th>
                            <Table.Th>Alerta</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {resultadoVig.importados.map((row, i) => (
                            <Table.Tr key={i}>
                              <Table.Td>{row.fila}</Table.Td>
                              <Table.Td>
                                <Badge size="xs" variant="light">{row.tipo_proceso}</Badge>
                              </Table.Td>
                              <Table.Td>
                                <Text size="xs" lineClamp={1}>{(row as { nombre_programa?: string }).nombre_programa ?? "—"}</Text>
                              </Table.Td>
                              <Table.Td>
                                <Text size="xs">
                                  {row.tipo_proceso === "RC" ? row.total_rc : row.total_av} total
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                {row.vigencia_actualizada
                                  ? <Badge size="xs" color="green">✓</Badge>
                                  : <Badge size="xs" color="gray">—</Badge>}
                              </Table.Td>
                              <Table.Td>
                                {row.alerta_creada
                                  ? <Badge size="xs" color="green">nueva</Badge>
                                  : (row as { alerta_actualizada?: boolean }).alerta_actualizada
                                    ? <Badge size="xs" color="teal">upd</Badge>
                                    : <Badge size="xs" color="gray">—</Badge>}
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    )}
                    {resultadoVig.errores.length > 0 && (
                      <Stack gap={4}>
                        <Text size="xs" fw={600} c="red">Errores / advertencias</Text>
                        {resultadoVig.errores.map((e, i) => (
                          <Alert key={i} color={e.advertencia ? "yellow" : "red"} variant="light" p="xs">
                            <Text size="xs"><strong>Fila {e.fila}:</strong> {e.error ?? e.advertencia}</Text>
                          </Alert>
                        ))}
                      </Stack>
                    )}
                  </Stack>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="historial" pt="md">
            <Stack gap="md">
              <Alert color="blue" variant="light" p="xs">
                <Text size="xs">
                  <strong>Archivo completo</strong> para procesos <strong>ya cerrados</strong>: hojas PROCESOS + INFO_CASO
                  (apelación, docs) + ACTIVIDADES + SUBACTIVIDADES. Va a historial con el mismo detalle que un cierre en app;
                  si es APROBADO, actualiza vigencia y contadores. La pestaña <strong>Vigentes</strong> es atajo solo para el RC/AV actual en vigencia.
                </Text>
              </Alert>
              <Paper withBorder p="md" radius="md">
                <Stack gap="xs">
                  <Text fw={600} size="sm">1. Descarga la plantilla de historial</Text>
                  <Text size="xs" c="dimmed">
                    Hojas PROCESOS, INFO_CASO, ACTIVIDADES y SUBACTIVIDADES. Requiere programas ya existentes en BD.
                  </Text>
                  <Button variant="light" size="xs" w="fit-content" onClick={descargarPlantillaHistorial}>
                    ⬇ Descargar plantilla historial
                  </Button>
                </Stack>
              </Paper>

              <Paper withBorder p="md" radius="md">
                <Stack gap="sm">
                  <Text fw={600} size="sm">2. Sube el archivo lleno</Text>
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
                      onClick={importarHistorial}
                    >
                      Importar historial
                    </Button>
                    {archivo && <Text size="xs" c="dimmed">{archivo.name}</Text>}
                  </Group>
                </Stack>
              </Paper>

              {resultado && (
                <Paper withBorder p="md" radius="md">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <Text fw={600} size="sm">Resultado historial</Text>
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
                    {resultado.importados.length > 0 && (
                      <Stack gap={4}>
                        <Text size="xs" fw={600}>Importados ({resultado.importados.length})</Text>
                        <Table fz="xs" withTableBorder withColumnBorders>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Fila</Table.Th>
                              <Table.Th>program_code</Table.Th>
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
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {msgRevertir && (
          <Alert color="blue" variant="light" p="xs">
            <Text size="xs">{msgRevertir}</Text>
          </Alert>
        )}
      </Stack>
    </Box>
  );
}
