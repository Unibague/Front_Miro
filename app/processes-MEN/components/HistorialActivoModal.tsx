"use client";

import { useState, useEffect, useMemo } from "react";
import { Modal, Stack, Paper, Box, Group, Text, Badge, Collapse, Loader, Anchor } from "@mantine/core";
import axios from "axios";
import type { Process, Phase, Actividad, ProcessDocument } from "../types";
import { faseColors } from "../constants";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";

const actividadResuelta = (a: Actividad) => !!a.completada || !!a.no_aplica;

const fmtDocFecha = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : null;

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

  const labelFase = (num: number) =>
    faseColors.find((fc) => fc.fase === num)?.fullName ?? `Fase ${num}`;

  return (
    <Modal opened={opened} onClose={onClose} title="Historial activo" size="lg" radius="md">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Fases ya superadas y actividades completadas en la fase actual. Solo lectura: actividades, subactividades y enlaces a documentos.
        </Text>
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
                <Paper key={fase._id} withBorder radius="sm" style={{ overflow: "hidden" }}>
                  <Box
                    px="sm"
                    py={8}
                    style={{
                      cursor: "pointer",
                      backgroundColor: "#f8f9fa",
                      borderBottom: openFase === fase.numero ? "1px solid #dee2e6" : "none",
                    }}
                    onClick={() => setOpenFase((prev) => (prev === fase.numero ? null : fase.numero))}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="xs">
                        <Text size="xs" fw={700}>
                          {openFase === fase.numero ? "▾" : "▸"} {labelFase(fase.numero)} — {fase.nombre}
                        </Text>
                        <Badge size="xs" color={resueltas === total && total > 0 ? "green" : "orange"} variant="light">
                          {resueltas}/{total} resueltas
                        </Badge>
                        {!esPasada && (
                          <Badge size="xs" color="gray" variant="outline">
                            fase actual (solo hechas)
                          </Badge>
                        )}
                      </Group>
                    </Group>
                  </Box>

                  <Collapse in={openFase === fase.numero}>
                    <Box px="sm" pt="xs" pb="sm">
                      {phaseDocs.length > 0 && (
                        <Box mb="xs">
                          <Text size="xs" c="dimmed" fw={600} mb={4}>
                            Documentos de la fase
                          </Text>
                          <Stack gap={2}>
                            {phaseDocs.map((d) => (
                              <Group key={d._id} gap={6} align="center">
                                <Anchor href={d.view_link} target="_blank" size="xs" fw={500}>
                                  📎 {d.name}
                                </Anchor>
                                {d.createdAt && (
                                  <Text size="xs" c="dimmed">
                                    · {fmtDocFecha(d.createdAt)}
                                  </Text>
                                )}
                              </Group>
                            ))}
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
                            <Paper key={act._id} withBorder radius="xs" style={{ overflow: "hidden" }}>
                              <Box
                                px="sm"
                                py={6}
                                style={{ cursor: "pointer", backgroundColor: actLista ? "#f0fff4" : "#fff" }}
                                onClick={() => setOpenAct((prev) => (prev === actKey ? null : actKey))}
                              >
                                <Group justify="space-between">
                                  <Group gap="xs">
                                    <Text size="xs">{openAct === actKey ? "▾" : "▸"}</Text>
                                    <input type="checkbox" checked={actLista} readOnly style={{ width: 13, height: 13 }} />
                                    <Text
                                      size="xs"
                                      fw={500}
                                      td={actLista ? "line-through" : undefined}
                                      c={actNa ? "orange" : act.completada ? "dimmed" : undefined}
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
                                    <Text size="xs" c="teal">
                                      ✓ {formatFechaDDMMYY(act.fecha_completado)}
                                    </Text>
                                  )}
                                </Group>
                                {act.responsables && (
                                  <Text size="xs" c="dimmed" pl={34}>
                                    {act.responsables}
                                  </Text>
                                )}
                              </Box>

                              <Collapse in={openAct === actKey}>
                                <Box px="sm" pt={6} pb="sm" style={{ backgroundColor: "#fafafa" }}>
                                  {act.observaciones && (
                                    <Paper withBorder radius="xs" p={6} mb={6} style={{ backgroundColor: "#fff9db" }}>
                                      <Text size="xs" c="dimmed">
                                        Observaciones:
                                      </Text>
                                      <Text size="xs">{act.observaciones}</Text>
                                    </Paper>
                                  )}

                                  <Box mb={act.subactividades.length > 0 ? "xs" : 0}>
                                    <Text size="xs" c="dimmed" fw={600} mb={4}>
                                      Documentos
                                    </Text>
                                    {actDocs.length > 0 ? (
                                      <Stack gap={2}>
                                        {actDocs.map((d) => (
                                          <Group key={d._id} gap={6} align="center">
                                            <Anchor href={d.view_link} target="_blank" size="xs" fw={500}>
                                              📎 {d.name}
                                            </Anchor>
                                            {d.createdAt && (
                                              <Text size="xs" c="dimmed">
                                                · {fmtDocFecha(d.createdAt)}
                                              </Text>
                                            )}
                                          </Group>
                                        ))}
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
                                      <Text size="xs" c="dimmed" fw={600}>
                                        Subactividades
                                      </Text>
                                      {act.subactividades.map((sub) => {
                                        const subNa = !!sub.no_aplica || actNa;
                                        const subLista = sub.completada || subNa;
                                        const subDocs = grouped.bySub.get(String(sub._id)) ?? [];
                                        return (
                                          <Paper key={sub._id} withBorder radius="xs" p={6} style={{ backgroundColor: subLista ? "#f8f9fa" : "#fff" }}>
                                            <Group justify="space-between" mb={subDocs.length > 0 || sub.observaciones ? 4 : 0}>
                                              <Group gap="xs">
                                                <input type="checkbox" checked={sub.completada && !subNa} readOnly style={{ width: 12, height: 12 }} />
                                                <Text
                                                  size="xs"
                                                  td={subLista ? "line-through" : undefined}
                                                  c={subNa ? "orange" : sub.completada ? "dimmed" : undefined}
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
                                                <Text size="xs" c="teal">
                                                  ✓ {formatFechaDDMMYY(sub.fecha_completado)}
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
                                                  {subDocs.map((d) => (
                                                    <Group key={d._id} gap={6} align="center">
                                                      <Anchor href={d.view_link} target="_blank" size="xs" fw={500}>
                                                        📎 {d.name}
                                                      </Anchor>
                                                      {d.createdAt && (
                                                        <Text size="xs" c="dimmed">
                                                          · {fmtDocFecha(d.createdAt)}
                                                        </Text>
                                                      )}
                                                    </Group>
                                                  ))}
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
