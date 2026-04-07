"use client";

import { Paper, Text, ScrollArea, Table, Stack, Badge } from "@mantine/core";
import FaseBadge from "./FaseBadge";
import { COLS_9 } from "../constants";
import type { ProcesoRow, Program } from "../types";

const ProcesoTable = ({ title, rows, tipoProceso, programaFiltro, onRowClick }: {
  title: string;
  rows: ProcesoRow[];
  tipoProceso: string;
  programaFiltro: string;
  onRowClick: (p: Program) => void;
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
                <Table.Tr key={i} style={{ cursor: "pointer" }} onClick={() => onRowClick(row.programa)}>
                  <Table.Td>
                    <Text size="xs" fw={600}>{row.programa.nombre}</Text>
                    <Text size="xs" c={row.programa.codigo_snies ? "dimmed" : "red"}>
                      {row.programa.codigo_snies ? `SNIES: ${row.programa.codigo_snies}` : "No tiene SNIES"}
                    </Text>
                  </Table.Td>
                  {modoPrograma
                    ? COLS_9.map((n) => <Table.Td key={n} ta="center"><Text size="xs" c="dimmed">—</Text></Table.Td>)
                    : <>
                        {mostrarRC && <Table.Td><FaseBadge fase={row.registro} /></Table.Td>}
                        {mostrarAV && <Table.Td><FaseBadge fase={row.acreditacion} /></Table.Td>}
                        {mostrarPM && (
                          <Table.Td ta="center">
                            {row.pmFase !== null ? (
                              <Stack gap={2} align="center">
                                <Badge size="xs" color="green" variant="light">Activo</Badge>
                                {row.pmLigadoA && (
                                  <Text size="xs" c="dimmed">
                                    Ligado a {row.pmLigadoA === "RC" ? "Registro" : "Acreditación"}
                                  </Text>
                                )}
                                {row.pmSubtipo && (
                                  <Text size="xs" c="dimmed" fs="italic">{row.pmSubtipo}</Text>
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
