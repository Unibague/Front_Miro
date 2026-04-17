"use client";

import { Paper, Text, ScrollArea, Table, Stack, Badge, Anchor } from "@mantine/core";
import FaseBadge from "./FaseBadge";
import { COLS_9 } from "../constants";
import type { ProcesoRow, Program } from "../types";

const ProcesoTable = ({ title, rows, tipoProceso, programaFiltro }: {
  title: string;
  rows: ProcesoRow[];
  tipoProceso: string;
  programaFiltro: string;
}) => {
  const modoPrograma = programaFiltro !== "Todos";
  const mostrarRC    = !modoPrograma && (tipoProceso === "Todos" || tipoProceso === "Registro calificado");
  const mostrarAV    = !modoPrograma && (tipoProceso === "Todos" || tipoProceso === "Acreditación voluntaria");
  const mostrarPM    = !modoPrograma && tipoProceso === "Todos";
  const colSpan      = modoPrograma ? 10 : 1 + (mostrarRC ? 1 : 0) + (mostrarAV ? 1 : 0) + (mostrarPM ? 1 : 0);

  return (
    <Paper withBorder radius="md" p="md" mb="lg">
      <Text fw={700} ta="center" mb="md" size="sm">{title}</Text>
      <ScrollArea>
        <Table withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ minWidth: 180 }}> </Table.Th>
              {modoPrograma
                ? COLS_9.map((n) => <Table.Th key={n} ta="center">{n}</Table.Th>)
                : <>
                    {mostrarRC && <Table.Th ta="center">Registro calificado</Table.Th>}
                    {mostrarAV && <Table.Th ta="center">Acreditación voluntaria</Table.Th>}
                    {mostrarPM && <Table.Th ta="center">Plan de mejoramiento</Table.Th>}
                  </>
              }
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={colSpan}>
                  <Text ta="center" c="dimmed" size="sm">Sin datos para el filtro seleccionado</Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              rows.map((row, i) => (
                <Table.Tr key={i}>
                  <Table.Td style={{ verticalAlign: "middle" }}>
                    <Stack align="center" gap={4} justify="center">
                      <Anchor href={`/date-review/program/${row.programa._id}`} size="xs" fw={600} underline="hover" ta="center" display="block">
                        {row.programa.nombre}
                      </Anchor>
                      <Text size="xs" c={row.programa.codigo_snies ? "dimmed" : "red"} ta="center">
                        {row.programa.codigo_snies ? `SNIES: ${row.programa.codigo_snies}` : "No tiene SNIES"}
                      </Text>
                    </Stack>
                  </Table.Td>
                  {modoPrograma
                    ? COLS_9.map((n) => (
                        <Table.Td key={n} style={{ verticalAlign: "middle", textAlign: "center" }}>
                          <Text size="xs" c="dimmed">—</Text>
                        </Table.Td>
                      ))
                    : <>
                        {mostrarRC && (
                          <Table.Td style={{ verticalAlign: "middle" }}>
                            <Stack align="center" justify="center">
                              <FaseBadge fase={row.registro} actividad={row.actividadRc ?? null} />
                            </Stack>
                          </Table.Td>
                        )}
                        {mostrarAV && (
                          <Table.Td style={{ verticalAlign: "middle" }}>
                            <Stack align="center" justify="center">
                              <FaseBadge fase={row.acreditacion} actividad={row.actividadAv ?? null} />
                            </Stack>
                          </Table.Td>
                        )}
                        {mostrarPM && (
                          <Table.Td style={{ verticalAlign: "middle", textAlign: "center" }}>
                            {row.pmFase !== null ? (
                              <Stack gap={2} align="center">
                                <Badge size="xs" color="green" variant="light">Activo</Badge>
                                {row.pmLigadoA && (
                                  <Text size="xs" c="dimmed" ta="center">
                                    Ligado a {row.pmLigadoA === "RC" ? "Registro" : "Acreditación"}
                                  </Text>
                                )}
                                {row.pmSubtipo && (
                                  <Text size="xs" c="dimmed" fs="italic" ta="center">{row.pmSubtipo}</Text>
                                )}
                              </Stack>
                            ) : (
                              <Text size="xs" c="dimmed" ta="center">Sin plan activo</Text>
                            )}
                          </Table.Td>
                        )}
                      </>
                  }
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
};

export default ProcesoTable;
