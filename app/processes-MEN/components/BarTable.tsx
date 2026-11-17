"use client";

import { useState } from "react";
import { Paper, Text, Group, Tooltip, Modal, Stack, Badge, Box, ThemeIcon, Table, ScrollArea, UnstyledButton, CloseButton } from "@mantine/core";
import { IconRoute, IconSchool, IconChevronRight } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { faseColors } from "../constants";
import type { BarRow, Program, Process } from "../types";
import { procesoRcActivoDePrograma } from "../utils/procesoRcUnico";
import { programCodeKey } from "../utils/programCode";
import { lineasAuxPrograma } from "../utils/programDisplay";

type BarTableProps = {
  title: string;
  data: BarRow[];
  tipoProceso: "RC" | "AV";
  programas: Program[];
  procesos: Process[];
  onOpenPrograms?: (programs: Program[]) => void;
};

function segmentIndexToFaseActual(seg: number): { min: number; max: number } {
  if (seg === 6) return { min: 7, max: 99 }; // no renovación (fase ≥7)
  if (seg === 7) return { min: -1, max: -1 }; // PM — se maneja aparte
  return { min: seg, max: seg };
}

/** Proceso cuyo subtipo debe mostrarse al listar programas por segmento de la barra (RC activo, AV o PM en seg. 7). */
function procesoParaSubtipoEnSegmento(
  programCode: string,
  segmentIndex: number,
  tipo: "RC" | "AV",
  procesos: Process[],
): Process | undefined {
  if (segmentIndex === 7 && tipo === "AV") {
    return procesos.find((x) => x.program_code === programCode && x.tipo_proceso === "PM");
  }
  if (tipo === "RC") return procesoRcActivoDePrograma(procesos, programCode);
  return procesos.find((x) => x.program_code === programCode && x.tipo_proceso === tipo);
}

function programsInSegment(
  depCode: string,
  segmentIndex: number,
  tipo: "RC" | "AV",
  programas: Program[],
  procesos: Process[],
  rowProgramCode?: string,
): Program[] {
  // Segmento 7 = Plan de mejoramiento (solo AV): programas con PM activo
  if (segmentIndex === 7 && tipo === "AV") {
    return programas.filter((p) => {
      if (rowProgramCode && programCodeKey(p) !== rowProgramCode) return false;
      if (!rowProgramCode && p.dep_code_facultad !== depCode) return false;
      return procesos.some((x) => x.program_code === programCodeKey(p) && x.tipo_proceso === "PM");
    });
  }
  const { min } = segmentIndexToFaseActual(segmentIndex);
  return programas.filter((p) => {
    if (rowProgramCode && programCodeKey(p) !== rowProgramCode) return false;
    if (!rowProgramCode && p.dep_code_facultad !== depCode) return false;
    const proc =
      tipo === "RC"
        ? procesoRcActivoDePrograma(procesos, programCodeKey(p))
        : procesos.find((x) => x.program_code === programCodeKey(p) && x.tipo_proceso === tipo);
    if (!proc) return false;
    const n = Number(proc.fase_actual) || 0;
    if (segmentIndex === 6) return n >= 7; // no renovación (fase 7+)
    return n === min;
  });
}

/** Valores por columna: índices 0-5 = fases, 6 = contingencia (fase 7+), 7 = plan de mejoramiento (solo AV). */
function valoresFila(row: BarRow, tipoProceso: "RC" | "AV"): number[] {
  const base = [row.fase_0, row.fase_1, row.fase_2, row.fase_3, row.fase_4, row.fase_5, row.fase_contingencia + row.fase_6];
  return tipoProceso === "AV" ? [...base, row.fase_pm] : base;
}

/** «FACULTAD DE CIENCIAS, INGENIERIA E INNOVACION» → «Facultad de Ciencias, Ingenieria e Innovacion». */
const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "e", "en", "a"]);
function nombreLegible(nombre: string): string {
  return nombre
    .toLocaleLowerCase("es")
    .split(" ")
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toLocaleUpperCase("es") + w.slice(1)))
    .join(" ");
}

const nombreCortoFase = (i: number) => faseColors[i]?.fullName.split(" - ")[1] ?? faseColors[i]?.label ?? "";

type ModalCtx = { programs: Program[]; facultyName: string; segmentIndex: number };

const BarTable = ({ title, data, tipoProceso, programas, procesos }: BarTableProps) => {
  const router = useRouter();
  const [modalCtx, setModalCtx] = useState<ModalCtx | null>(null);

  const tipoLabel = tipoProceso === "RC" ? "Registro calificado" : "Acreditación voluntaria";
  const columnas = tipoProceso === "AV" ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6];
  const filas = data.map((row) => ({ row, vals: valoresFila(row, tipoProceso) }));
  const totalesColumna = columnas.map((i) => filas.reduce((acc, f) => acc + (f.vals[i] ?? 0), 0));
  const totalGeneral = totalesColumna.reduce((a, b) => a + b, 0);

  const abrir = (row: BarRow, i: number) =>
    setModalCtx({
      programs: programsInSegment(row.dep_code, i, tipoProceso, programas, procesos, row.program_code),
      facultyName: nombreLegible(row.nombre),
      segmentIndex: i,
    });

  return (
    <>
      <Paper withBorder radius="lg" p="lg" mb="lg">
        <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap" gap="sm">
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <ThemeIcon size={36} radius="xl" variant="light" color="green">
              <IconRoute size={19} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="lg" lh={1.2}>{title}</Text>
              <Text size="xs" c="dimmed" mt={2}>En qué fase va cada proceso activo. Haz clic en un número para ver los programas.</Text>
            </Box>
          </Group>
          <Group gap="xs">
            <Badge variant="light" color={tipoProceso === "RC" ? "blue" : "violet"}>{tipoLabel}</Badge>
            <Badge variant="light" color="green">{totalGeneral} {totalGeneral === 1 ? "proceso" : "procesos"}</Badge>
          </Group>
        </Group>

        {data.length === 0 ? (
          <Text ta="center" c="dimmed" size="sm" py="lg">Sin datos para el filtro seleccionado</Text>
        ) : (
          <>
            {/* Recorrido de fases: total de procesos en cada paso */}
            <Paper radius="md" p="md" mb="lg" style={{ backgroundColor: "var(--mantine-color-default-hover)" }}>
              <ScrollArea type="auto" offsetScrollbars>
                <Group gap={0} wrap="nowrap" align="flex-start" style={{ minWidth: 640 }}>
                  {[0, 1, 2, 3, 4, 5].map((i) => {
                    const n = totalesColumna[i];
                    const fase = faseColors[i];
                    return (
                      <Box key={i} style={{ flex: 1, position: "relative", textAlign: "center" }}>
                        {i > 0 && (
                          <Box style={{ position: "absolute", top: 21, right: "50%", width: "100%", height: 2, backgroundColor: "#bfe5c8", zIndex: 0 }} />
                        )}
                        <Tooltip label={`${fase?.fullName}: ${n} ${n === 1 ? "proceso" : "procesos"}`} withArrow>
                          <Box
                            style={{
                              position: "relative",
                              zIndex: 1,
                              margin: "0 auto",
                              width: 44,
                              height: 44,
                              borderRadius: 99,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: 16,
                              backgroundColor: n > 0 ? fase?.color : "var(--mantine-color-body)",
                              color: n > 0 ? fase?.textColor : "var(--mantine-color-dimmed)",
                              border: `2px solid ${n > 0 ? fase?.borderColor : "var(--mantine-color-default-border)"}`,
                            }}
                          >
                            {n}
                          </Box>
                        </Tooltip>
                        <Text size="xs" fw={700} mt={8}>Fase {i}</Text>
                        <Text size="xs" c="dimmed" lh={1.2} px={4}>{nombreCortoFase(i)}</Text>
                      </Box>
                    );
                  })}
                  <Box style={{ width: 1, alignSelf: "stretch", backgroundColor: "var(--mantine-color-default-border)", margin: "0 12px" }} />
                  {columnas.slice(6).map((i) => {
                    const n = totalesColumna[i];
                    const fase = faseColors[i];
                    return (
                      <Box key={i} style={{ width: 110, textAlign: "center", flexShrink: 0 }}>
                        <Tooltip label={fase?.fullName} withArrow>
                          <Box
                            style={{
                              margin: "0 auto",
                              width: 44,
                              height: 44,
                              borderRadius: 99,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: 16,
                              backgroundColor: fase?.color,
                              color: fase?.textColor,
                              border: `2px solid ${fase?.borderColor}`,
                            }}
                          >
                            {n}
                          </Box>
                        </Tooltip>
                        <Text size="xs" fw={700} mt={8}>{fase?.label}</Text>
                      </Box>
                    );
                  })}
                </Group>
              </ScrollArea>
            </Paper>

            {/* Detalle por facultad */}
            <ScrollArea type="auto" offsetScrollbars>
              <Table verticalSpacing={6} horizontalSpacing="xs" style={{ minWidth: 760 }}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 260 }}>
                      <Text size="xs" c="dimmed" fw={700} tt="uppercase">{data[0]?.program_code ? "Programa" : "Facultad"}</Text>
                    </Table.Th>
                    {columnas.map((i) => (
                      <Table.Th key={i} style={{ textAlign: "center" }}>
                        <Tooltip label={faseColors[i]?.fullName} withArrow>
                          <Text size="xs" c="dimmed" fw={700} tt="uppercase">{i <= 5 ? `Fase ${i}` : i === 6 ? "Conting." : "PM"}</Text>
                        </Tooltip>
                      </Table.Th>
                    ))}
                    <Table.Th style={{ textAlign: "center", width: 60 }}>
                      <Text size="xs" c="dimmed" fw={700} tt="uppercase">Total</Text>
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filas.map(({ row, vals }, k) => {
                    const total = vals.reduce((a, b) => a + b, 0);
                    return (
                      <Table.Tr key={k}>
                        <Table.Td>
                          <Text size="sm" fw={600} lh={1.25}>{nombreLegible(row.nombre)}</Text>
                        </Table.Td>
                        {columnas.map((i) => {
                          const v = vals[i] ?? 0;
                          const fase = faseColors[i];
                          if (v === 0) {
                            return (
                              <Table.Td key={i} style={{ textAlign: "center" }}>
                                <Text size="sm" c="dimmed">–</Text>
                              </Table.Td>
                            );
                          }
                          return (
                            <Table.Td key={i} style={{ textAlign: "center", padding: 4 }}>
                              <Tooltip label={`${fase?.fullName}: ${v} ${v === 1 ? "programa" : "programas"} · clic para ver`} withArrow>
                                <UnstyledButton
                                  onClick={() => abrir(row, i)}
                                  aria-label={`${fase?.label}: ${v} programas en ${nombreLegible(row.nombre)}`}
                                  style={{
                                    width: "100%",
                                    minWidth: 40,
                                    height: 32,
                                    borderRadius: 99,
                                    backgroundColor: fase?.color,
                                    border: `1px solid ${fase?.borderColor}`,
                                    color: fase?.textColor,
                                    fontWeight: 800,
                                    fontSize: 14,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {v}
                                </UnstyledButton>
                              </Tooltip>
                            </Table.Td>
                          );
                        })}
                        <Table.Td style={{ textAlign: "center" }}>
                          <Text size="sm" fw={800} c={total > 0 ? undefined : "dimmed"}>{total}</Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </>
        )}
      </Paper>

      <Modal
        opened={modalCtx !== null}
        onClose={() => setModalCtx(null)}
        centered
        radius="lg"
        size="lg"
        padding={0}
        withCloseButton={false}
      >
        {modalCtx && (() => {
          const fase = faseColors[modalCtx.segmentIndex];
          const nombreFase = modalCtx.segmentIndex <= 5
            ? `Fase ${modalCtx.segmentIndex} · ${nombreCortoFase(modalCtx.segmentIndex)}`
            : fase?.label ?? `Segmento ${modalCtx.segmentIndex}`;
          return (
            <>
              {/* Encabezado con el color de la fase */}
              <Box px="lg" py="md" style={{ backgroundColor: fase?.color, borderBottom: `1px solid ${fase?.borderColor}` }}>
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Box style={{ minWidth: 0 }}>
                    <Text size="xs" fw={800} tt="uppercase" style={{ color: fase?.textColor, letterSpacing: 0.4 }}>
                      {nombreFase}
                    </Text>
                    <Text fw={700} size="lg" lh={1.25} mt={2} style={{ color: fase?.textColor }}>
                      {modalCtx.facultyName}
                    </Text>
                    <Group gap={6} mt={6}>
                      <Badge size="sm" variant="white" color={tipoProceso === "RC" ? "blue" : "violet"} tt="none">{tipoLabel}</Badge>
                      <Badge size="sm" variant="white" color="dark" tt="none">
                        {modalCtx.programs.length} {modalCtx.programs.length === 1 ? "programa" : "programas"}
                      </Badge>
                    </Group>
                  </Box>
                  <CloseButton onClick={() => setModalCtx(null)} aria-label="Cerrar" style={{ color: fase?.textColor }} />
                </Group>
              </Box>

              <Box p="md">
                {modalCtx.programs.length === 0 ? (
                  <Text size="sm" c="dimmed" ta="center" py="md">
                    {modalCtx.segmentIndex === 0
                      ? `Ningún programa con ${tipoLabel} activo en esta facultad.`
                      : "No hay programas en este tramo."}
                  </Text>
                ) : (
                  <ScrollArea.Autosize mah="60vh">
                    <Stack gap="xs">
                      {modalCtx.programs.map((p) => {
                        const proc = procesoParaSubtipoEnSegmento(programCodeKey(p), modalCtx.segmentIndex, tipoProceso, procesos);
                        const subtipo = proc?.subtipo && String(proc.subtipo).trim() !== "" ? String(proc.subtipo).trim() : null;
                        const irAFicha = () => {
                          setModalCtx(null);
                          router.push(`/processes-MEN/program/${p._id}`);
                        };
                        return (
                          <UnstyledButton key={p._id} onClick={irAFicha} className="men-programa-fase" style={{ borderRadius: 10 }}>
                            <Paper withBorder radius="md" p="sm" style={{ borderLeft: `4px solid ${fase?.borderColor}`, backgroundColor: "transparent" }}>
                              <Group justify="space-between" wrap="nowrap" gap="sm">
                                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                                  <ThemeIcon size={36} radius="xl" variant="light" color="green" style={{ flexShrink: 0 }}>
                                    <IconSchool size={18} />
                                  </ThemeIcon>
                                  <Box style={{ minWidth: 0 }}>
                                    <Text fw={700} size="sm">{p.nombre}</Text>
                                    <Text size="xs" c="dimmed">{lineasAuxPrograma(p).join(" · ")}</Text>
                                    {subtipo && (
                                      <Badge size="xs" variant="outline" color="gray" tt="none" mt={4}>{subtipo}</Badge>
                                    )}
                                  </Box>
                                </Group>
                                <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
                                  <Text size="xs" c="green.7" fw={700}>Ver ficha</Text>
                                  <IconChevronRight size={16} color="var(--mantine-color-green-7)" />
                                </Group>
                              </Group>
                            </Paper>
                          </UnstyledButton>
                        );
                      })}
                    </Stack>
                  </ScrollArea.Autosize>
                )}
              </Box>
              <style>{`.men-programa-fase:hover > div { background-color: var(--mantine-color-default-hover) !important; }`}</style>
            </>
          );
        })()}
      </Modal>
    </>
  );
};

export default BarTable;
