"use client";

import { useState, useEffect, useMemo } from "react";
import { Modal, Stack, Paper, Box, Group, Text, Badge, Collapse, Loader, Anchor, ThemeIcon, Progress } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconCircleCheck, IconCircleMinus, IconHistory, IconPaperclip } from "@tabler/icons-react";
import axios from "axios";
import type { Process, Phase, Actividad, ProcessDocument } from "../types";
import { infoFasePorNumero } from "../constants";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";

const actividadResuelta = (a: Actividad) => !!a.completada || !!a.no_aplica;

const fmtDocFecha = (iso?: string | null) =>
  iso ? formatFechaDDMMYY(iso) : null;

function groupDocsByPhase(
  all: ProcessDocument[],
  phases: Phase[],
): {
  phaseOnly: Map<string, ProcessDocument[]>;
  byActividad: Map<string, ProcessDocument[]>;
  bySub: Map<string, ProcessDocument[]>;
} {
  const phaseOnly = new Map<string, ProcessDocument[]>();
  const byActividad = new Map<string, ProcessDocument[]>();
  const bySub = new Map<string, ProcessDocument[]>();
  const phaseIds = new Set(phases.map((p) => String(p._id)));

  for (const d of all) {
    const pid = d.phase_id != null ? String(d.phase_id) : "";
    if (!pid || !phaseIds.has(pid)) continue;
    if (d.subactividad_id) {
      const k = String(d.subactividad_id);
      const list = bySub.get(k) ?? [];
      list.push(d);
      bySub.set(k, list);
    } else if (d.actividad_id) {
      const k = String(d.actividad_id);
      const list = byActividad.get(k) ?? [];
      list.push(d);
      byActividad.set(k, list);
    } else {
      const list = phaseOnly.get(pid) ?? [];
      list.push(d);
      phaseOnly.set(pid, list);
    }
  }
  return { phaseOnly, byActividad, bySub };
}

export type HistorialActivoModalProps = {
  opened: boolean;
  onClose: () => void;
  proceso: Process;
  fases: Phase[];
};

export default function HistorialActivoModal({ opened, onClose, proceso, fases }: HistorialActivoModalProps) {
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState<ProcessDocument[]>([]);
  const [openFase, setOpenFase] = useState<number | null>(null);
  const [openAct, setOpenAct] = useState<string | null>(null);

  useEffect(() => {
    if (!opened || !proceso._id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/process-documents/by-process`, {
          params: { process_id: proceso._id },
        });
        if (!cancelled) setDocs(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setDocs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, proceso._id]);

  useEffect(() => {
    if (!opened) {
      setOpenFase(null);
      setOpenAct(null);
    }
  }, [opened]);

  const grouped = useMemo(() => groupDocsByPhase(docs, fases), [docs, fases]);

  /** Fases anteriores a la actual (completas) + fase actual solo con actividades ya resueltas. */
  const filasFases = useMemo(() => {
    const sorted = [...fases].sort((a, b) => a.numero - b.numero);
    const out: Array<{ fase: Phase; actividades: Actividad[] }> = [];
    for (const fase of sorted) {
      if (fase.numero > proceso.fase_actual) continue;
      if (fase.numero < proceso.fase_actual) {
        out.push({ fase, actividades: fase.actividades });
      } else {
        const resueltas = fase.actividades.filter(actividadResuelta);
        if (resueltas.length > 0) out.push({ fase, actividades: resueltas });
      }
    }
    return out;
  }, [fases, proceso.fase_actual]);

  /** Enlace a un documento con icono de clip y fecha de carga. */
  const DocLink = ({ d }: { d: ProcessDocument }) => (
    <Group gap={6} align="center" wrap="nowrap">
      <IconPaperclip size={13} color="var(--mantine-color-blue-6)" style={{ flexShrink: 0 }} />
      <Anchor href={d.view_link} target="_blank" size="xs" fw={500} truncate="end">
        {d.name}
      </Anchor>
      {d.createdAt && <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>· {fmtDocFecha(d.createdAt)}</Text>}
    </Group>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      radius="lg"
      title={
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon color="blue" variant="light" size="lg" radius="md"><IconHistory size={20} /></ThemeIcon>
          <Box>
            <Text fw={700} size="sm">Historial activo</Text>
            <Text size="xs" c="dimmed">Fases superadas y actividades hechas en la fase actual · solo lectura</Text>
          </Box>
        </Group>
      }
    >
      <Stack gap="sm">
        {loading ? (
          <Loader size="sm" mx="auto" />
        ) : filasFases.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="md">
            Aún no hay fases anteriores ni actividades marcadas como hechas en la fase actual.
          </Text>
        ) : (
          <Stack gap="xs">
            {filasFases.map(({ fase, actividades }) => {
              const total = fase.actividades.length;
              const resueltas = fase.actividades.filter(actividadResuelta).length;
              const phaseDocs = grouped.phaseOnly.get(String(fase._id)) ?? [];
              const esPasada = fase.numero < proceso.fase_actual;

              return (
                <Paper key={fase._id} withBorder radius="md" style={{ overflow: "hidden" }}>
                  <Box
                    px="sm"
                    py={10}
                    style={{
                      cursor: "pointer",
                      backgroundColor: openFase === fase.numero ? "var(--mantine-color-default-hover)" : undefined,
                      borderBottom: openFase === fase.numero ? "1px solid var(--mantine-color-default-border)" : "none",
                    }}
                    onClick={() => setOpenFase((prev) => (prev === fase.numero ? null : fase.numero))}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        {openFase === fase.numero
                          ? <IconChevronDown size={16} color="var(--mantine-color-dimmed)" />
                          : <IconChevronRight size={16} color="var(--mantine-color-dimmed)" />}
                        <Badge
                          radius="sm"
                          style={{ flexShrink: 0 }}
                          styles={{ root: { backgroundColor: infoFasePorNumero(fase.numero)?.color ?? "var(--mantine-color-gray-3)", color: infoFasePorNumero(fase.numero)?.textColor ?? "#1a1b1e" } }}
                        >
                          Fase {fase.numero}
                        </Badge>
                        <Text size="sm" fw={600} truncate="end">{fase.nombre}</Text>
                        {!esPasada && (
                          <Badge size="xs" color="blue" variant="light" style={{ flexShrink: 0 }}>
                            Fase actual
                          </Badge>
                        )}
                      </Group>
                      <Group gap={8} wrap="nowrap" style={{ flexShrink: 0 }}>
                        <Progress value={total > 0 ? (resueltas / total) * 100 : 0} color={resueltas === total && total > 0 ? "teal" : "blue"} size="sm" radius="xl" w={70} />
                        <Text size="xs" c="dimmed" fw={600}>{resueltas}/{total}</Text>
                      </Group>
                    </Group>
                  </Box>

                  <Collapse in={openFase === fase.numero}>
                    <Box px="sm" pt="xs" pb="sm">
                      {phaseDocs.length > 0 && (
                        <Box mb="xs">
                          <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                            Documentos de la fase
                          </Text>
                          <Stack gap={2}>
                            {phaseDocs.map((d) => <DocLink key={d._id} d={d} />)}
                          </Stack>
                        </Box>
                      )}

                      <Stack gap={4}>
                        {actividades.map((act) => {
                          const actKey = `${fase.numero}-${act._id}`;
                          const actNa = !!act.no_aplica;
                          const actLista = act.completada || actNa;
                          const actDocs = grouped.byActividad.get(String(act._id)) ?? [];
                          const hayDocsEnSubs = act.subactividades.some(
                            (s) => (grouped.bySub.get(String(s._id)) ?? []).length > 0,
                          );

                          return (
                            <Paper
                              key={act._id}
                              withBorder
                              radius="sm"
                              style={{ overflow: "hidden", borderLeft: `3px solid var(--mantine-color-${actNa ? "orange" : actLista ? "teal" : "gray"}-5)` }}
                            >
                              <Box
                                px="sm"
                                py={8}
                                style={{ cursor: "pointer" }}
                                onClick={() => setOpenAct((prev) => (prev === actKey ? null : actKey))}
                              >
                                <Group justify="space-between" wrap="nowrap" align="flex-start">
                                  <Group gap="xs" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                                    {openAct === actKey
                                      ? <IconChevronDown size={14} color="var(--mantine-color-dimmed)" style={{ marginTop: 2, flexShrink: 0 }} />
                                      : <IconChevronRight size={14} color="var(--mantine-color-dimmed)" style={{ marginTop: 2, flexShrink: 0 }} />}
                                    {actNa
                                      ? <IconCircleMinus size={16} color="var(--mantine-color-orange-6)" style={{ flexShrink: 0 }} />
                                      : <IconCircleCheck size={16} color={`var(--mantine-color-${actLista ? "teal" : "gray"}-6)`} style={{ flexShrink: 0 }} />}
                                    <Text
                                      size="sm"
                                      fw={500}
                                      c={actNa ? "orange" : undefined}
                                    >
                                      {act.nombre}
                                    </Text>
                                    {actNa && (
                                      <Badge size="xs" color="orange" variant="light">
                                        No aplica
                                      </Badge>
                                    )}
                                  </Group>
                                  {act.fecha_completado && !actNa && (
                                    <Text size="xs" c="teal" fw={600} style={{ flexShrink: 0 }}>
                                      {formatFechaDDMMYY(act.fecha_completado)}
                                    </Text>
                                  )}
                                </Group>
                                {act.responsables && (
                                  <Text size="xs" c="dimmed" pl={44}>
                                    {act.responsables}
                                  </Text>
                                )}
                              </Box>

                              <Collapse in={openAct === actKey}>
                                <Box px="sm" pt={6} pb="sm" style={{ backgroundColor: "var(--mantine-color-default-hover)" }}>
                                  {act.observaciones && (
                                    <Paper withBorder radius="sm" p={6} mb={6} style={{ backgroundColor: "var(--mantine-color-yellow-light)" }}>
                                      <Text size="xs" c="dimmed">
                                        Observaciones:
                                      </Text>
                                      <Text size="xs">{act.observaciones}</Text>
                                    </Paper>
                                  )}

                                  <Box mb={act.subactividades.length > 0 ? "xs" : 0}>
                                    <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                                      Documentos
                                    </Text>
                                    {actDocs.length > 0 ? (
                                      <Stack gap={2}>
                                        {actDocs.map((d) => <DocLink key={d._id} d={d} />)}
                                      </Stack>
                                    ) : hayDocsEnSubs ? (
                                      <Text size="xs" c="dimmed">
                                        Los archivos están en las subactividades (ver abajo).
                                      </Text>
                                    ) : (
                                      <Text size="xs" c="dimmed">
                                        Sin documentos
                                      </Text>
                                    )}
                                  </Box>

                                  {act.subactividades.length > 0 && (
                                    <Stack gap={4} mt="xs">
                                      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                                        Subactividades
                                      </Text>
                                      {act.subactividades.map((sub) => {
                                        const subNa = !!sub.no_aplica || actNa;
                                        const subLista = sub.completada || subNa;
                                        const subDocs = grouped.bySub.get(String(sub._id)) ?? [];
                                        return (
                                          <Paper key={sub._id} withBorder radius="sm" px="sm" py={6}>
                                            <Group justify="space-between" mb={subDocs.length > 0 || sub.observaciones ? 4 : 0} wrap="nowrap">
                                              <Group gap="xs" wrap="nowrap">
                                                {subNa
                                                  ? <IconCircleMinus size={14} color="var(--mantine-color-orange-6)" style={{ flexShrink: 0 }} />
                                                  : <IconCircleCheck size={14} color={`var(--mantine-color-${subLista ? "teal" : "gray"}-6)`} style={{ flexShrink: 0 }} />}
                                                <Text
                                                  size="xs"
                                                  c={subNa ? "orange" : undefined}
                                                >
                                                  {sub.nombre}
                                                </Text>
                                                {subNa && (
                                                  <Badge size="xs" color="orange" variant="light">
                                                    {actNa && !sub.no_aplica ? "N/A (actividad)" : "No aplica"}
                                                  </Badge>
                                                )}
                                              </Group>
                                              {sub.fecha_completado && !subNa && (
                                                <Text size="xs" c="teal" fw={600} style={{ flexShrink: 0 }}>
                                                  {formatFechaDDMMYY(sub.fecha_completado)}
                                                </Text>
                                              )}
                                            </Group>
                                            {sub.observaciones && (
                                              <Text size="xs" c="dimmed" pl={20} mb={2}>
                                                Observaciones: {sub.observaciones}
                                              </Text>
                                            )}
                                            {subDocs.length > 0 && (
                                              <Box pl={20}>
                                                <Stack gap={2}>
                                                  {subDocs.map((d) => <DocLink key={d._id} d={d} />)}
                                                </Stack>
                                              </Box>
                                            )}
                                          </Paper>
                                        );
                                      })}
                                    </Stack>
                                  )}
                                </Box>
                              </Collapse>
                            </Paper>
                          );
                        })}
                      </Stack>
                    </Box>
                  </Collapse>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}
