"use client";

import { useState, useEffect } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Button, Stack,
  Loader, Center, Progress, ThemeIcon, ActionIcon, Box, SimpleGrid,
  Divider, TextInput, Textarea, Modal, Tabs, Tooltip,
} from "@mantine/core";
import {
  IconArrowLeft, IconTarget,
  IconEdit, IconChevronDown, IconChevronUp,
  IconCheck, IconAlertTriangle, IconX,
  IconListCheck, IconTrendingUp, IconFlag, IconFileTypePdf,
  IconLock,
} from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PDI_ROUTES } from "../api";
import type { Indicador, Periodo } from "../types";
import dynamic from "next/dynamic";
import { usePdiConfig } from "../hooks/usePdiConfig";

const EvidenciasPanel = dynamic(() => import("../components/EvidenciasPanel"), { ssr: false });

interface CorteVigente {
  _id: string;
  nombre: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
}

function esPeriodoEditable(periodo: string, cortesVigentes: CorteVigente[]): boolean {
  // Si no hay cortes configurados con fechas, todo es editable
  if (!cortesVigentes.length) return true;
  return cortesVigentes.some(c => c.nombre === periodo);
}

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "En cumplimiento", amarillo: "Requiere atención", rojo: "Crítico",
};
const SEMAFORO_ICON: Record<string, React.ReactNode> = {
  verde: <IconCheck size={13} />,
  amarillo: <IconAlertTriangle size={13} />,
  rojo: <IconX size={13} />,
};
const formatAnioRange = (anioInicio?: number, anioFin?: number) =>
  anioInicio && anioFin ? `${anioInicio} - ${anioFin}` : "Sin rango definido";

// ── Modal completo del responsable ────────────────────────────────────────
function ResponsableIndicadorModal({ opened, onClose, indicador, cortesVigentes, onSaved, anioMeta }: {
  opened: boolean;
  onClose: () => void;
  indicador: Indicador;
  cortesVigentes: CorteVigente[];
  onSaved: (ind: Indicador) => void;
  anioMeta: number;
}) {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [avancesStr, setAvancesStr] = useState<Record<string, string>>({});
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (opened) {
      setPeriodos(indicador.periodos.map(p => ({ ...p })));
      // Inicializar strings de avance para cada periodo
      const strs: Record<string, string> = {};
      indicador.periodos.forEach(p => {
        strs[p.periodo] = p.avance != null ? String(p.avance) : "";
      });
      setAvancesStr(strs);
      setObs(indicador.observaciones ?? "");
    }
  }, [opened, indicador]);

  const updateAvanceStr = (periodo: string, value: string) => {
    // Permitir números, punto, coma y % (para metas en porcentaje)
    if (value !== "" && !/^[\d.,% ]*$/.test(value)) return;
    setAvancesStr(prev => ({ ...prev, [periodo]: value }));
  };

  // Normaliza "2%", "2,5%", "2.5" → número
  const parseAvance = (val: string): number | null => {
    if (val === "") return null;
    const limpio = val.replace("%", "").replace(",", ".").trim();
    const n = Number(limpio);
    return isNaN(n) ? null : n;
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const periodosPayload = periodos.map(p => {
        const val = parseAvance(avancesStr[p.periodo] ?? "");
        return {
          periodo: p.periodo,
          meta: p.meta,
          avance: (val === 0 && !esPeriodoEditable(p.periodo, cortesVigentes)) ? null : val,
        };
      });
      const res = await axios.put(PDI_ROUTES.indicador(indicador._id), {
        periodos: periodosPayload,
        observaciones: obs.trim(),
        accion_id: typeof indicador.accion_id === "string"
          ? indicador.accion_id
          : indicador.accion_id._id,
      });
      showNotification({ title: "Guardado", message: "Avance actualizado", color: "teal" });
      onSaved(res.data);
      onClose();
    } catch {
      showNotification({ title: "Error", message: "No se pudo guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap={8}>
          <ThemeIcon size={28} radius="xl" color="violet" variant="light">
            <IconTarget size={15} />
          </ThemeIcon>
          <div>
            <Text size="sm" fw={700}>{indicador.nombre}</Text>
            <Text size="xs" c="dimmed">{indicador.codigo}</Text>
          </div>
        </Group>
      }
      centered
      size="lg"
    >
      <Tabs defaultValue="avances">
        <Tabs.List mb="sm">
          <Tabs.Tab value="avances">Avances por periodo</Tabs.Tab>
          <Tabs.Tab value="evidencias" leftSection={<IconFileTypePdf size={14} />}>
            Evidencias
          </Tabs.Tab>
        </Tabs.List>

        {/* ── Avances ── */}
        <Tabs.Panel value="avances">
          <Stack gap="sm">
            {/* Info del indicador */}
            <Paper withBorder radius="md" p="sm" style={{ background: "#f8f5ff" }}>
              <SimpleGrid cols={2}>
                {[
                  { label: `Meta ${anioMeta}`, value: indicador.meta_final_2029 ?? "-" },
                  { label: "Tipo cálculo", value: indicador.tipo_calculo ?? "—" },
                  { label: "Seguimiento", value: indicador.tipo_seguimiento || "—" },
                  { label: "Avance actual", value: `${indicador.avance}%` },
                ].map(s => (
                  <Box key={s.label}>
                    <Text size="xs" c="dimmed">{s.label}</Text>
                    <Text size="sm" fw={600}>{String(s.value)}</Text>
                  </Box>
                ))}
              </SimpleGrid>
            </Paper>

            {/* Periodos */}
            {periodos.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="sm">Sin periodos registrados</Text>
            ) : (
              periodos.map(p => {
                const editable = esPeriodoEditable(p.periodo, cortesVigentes);
                return (
                <Paper key={p.periodo} withBorder radius="md" p="sm"
                  style={{ borderLeft: `3px solid ${editable ? "#7c3aed" : "#adb5bd"}` }}>
                  <Group justify="space-between" align="flex-end">
                    <Box>
                      <Group gap={6}>
                        <Text size="sm" fw={700}>{p.periodo}</Text>
                        {!editable && (
                          <Tooltip label="Este periodo ya cerró, no se puede modificar" withArrow>
                            <Badge size="xs" color="red" variant="light" leftSection={<IconLock size={9} />}>
                              Cerrado
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">Meta: <b>{p.meta ?? "—"}</b></Text>
                    </Box>
                    <TextInput
                      label="Avance"
                      placeholder={editable
                        ? (String(p.meta ?? "").includes("%") ? "Ej: 2%" : "Ej: 1")
                        : "Periodo cerrado"}
                      value={avancesStr[p.periodo] ?? ""}
                      onChange={e => editable && updateAvanceStr(p.periodo, e.currentTarget.value)}
                      style={{ width: 130 }}
                      size="sm"
                      disabled={!editable}
                    />
                  </Group>
                  {(avancesStr[p.periodo] ?? "") !== "" && p.meta != null && parseAvance(String(p.meta)) !== null && Number(parseAvance(String(p.meta))) > 0 && (
                    <Progress
                      value={Math.min(((parseAvance(avancesStr[p.periodo] ?? "") ?? 0) / Number(parseAvance(String(p.meta)))) * 100, 100)}
                      color={editable ? "violet" : "gray"} size="xs" radius="xl" mt={8}
                    />
                  )}
                </Paper>
                );
              })
            )}

            <Textarea
              label="Observaciones"
              placeholder="Notas o comentarios sobre el avance..."
              value={obs}
              onChange={e => setObs(e.currentTarget.value)}
              rows={3}
            />

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>Cancelar</Button>
              <Button
                loading={loading}
                onClick={handleSave}
                color="violet"
                disabled={periodos.length > 0 && periodos.every(p => !esPeriodoEditable(p.periodo, cortesVigentes))}
              >
                Guardar avances
              </Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* ── Evidencias ── */}
        <Tabs.Panel value="evidencias">
          <EvidenciasPanel indicadorId={indicador._id} periodos={indicador.periodos} />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

// ── Card de indicador ──────────────────────────────────────────────────────
function MiIndicadorCard({ indicador: indInicial, cortesVigentes, onUpdated, aniosPdi, anioMeta }: {
  indicador: Indicador;
  cortesVigentes: CorteVigente[];
  onUpdated: (ind: Indicador) => void;
  aniosPdi: number[];
  anioMeta: number;
}) {
  const [ind, setInd] = useState(indInicial);
  const [open, setOpen] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [showAnios, setShowAnios] = useState(false);

  useEffect(() => { setInd(indInicial); }, [indInicial]);

  const handleSaved = (updated: Indicador) => {
    setInd(updated);
    onUpdated(updated);
  };

  // Para indicadores acumulados/último_valor, avance_total_real es el % real de cumplimiento
  const avanceMostrado = ind.avance_total_real != null ? ind.avance_total_real : ind.avance;
  const barColor = avanceMostrado >= 70 ? "#22c55e" : avanceMostrado >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <Paper withBorder radius="xl" p="lg" shadow="xs"
      style={{ transition: "box-shadow .2s, transform .2s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.10)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >
      {/* Header */}
      <Group justify="space-between" align="flex-start" mb="xs">
        <Group gap={8}>
          <ThemeIcon size={32} radius="xl" color="violet" variant="light">
            <IconTarget size={17} />
          </ThemeIcon>
          <div>
            <Text size="xs" fw={700} c="dimmed">{ind.codigo}</Text>
            <Text fw={700} size="sm" style={{ lineHeight: 1.3 }}>{ind.nombre}</Text>
          </div>
        </Group>
        <Badge
          color={SEMAFORO_COLOR[ind.semaforo]}
          variant="light" size="sm" radius="xl"
          leftSection={SEMAFORO_ICON[ind.semaforo]}
        >
          {SEMAFORO_LABEL[ind.semaforo]}
        </Badge>
      </Group>

      {ind.indicador_resultado && (
        <Text size="xs" c="dimmed" mb="sm">{ind.indicador_resultado}</Text>
      )}

      {/* Avance */}
      <Group justify="space-between" align="flex-end" mb={6}>
        <div>
          <Text size="2rem" fw={800} lh={1}>{avanceMostrado}%</Text>
          <Text size="xs" c="dimmed">Avance consolidado</Text>
        </div>
        {ind.meta_final_2029 != null && (
          <div style={{ textAlign: "right" }}>
            <Text size="lg" fw={700}>{ind.meta_final_2029}</Text>
            <Text size="xs" c="dimmed">Meta {anioMeta}</Text>
          </div>
        )}
      </Group>

      <Group gap={8} align="center" mb={showAnios ? 6 : 12}>
        <Box style={{ flex: 1, height: 10, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden" }}>
          <Box style={{ height: "100%", width: `${Math.min(avanceMostrado, 100)}%`, background: barColor, borderRadius: 99, transition: "width .4s" }} />
        </Box>
        <ActionIcon
          size="xs" variant="subtle" color="violet"
          onClick={() => setShowAnios(v => !v)}
          title="Ver avance por año"
        >
          <IconChevronDown size={13} style={{ transform: showAnios ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
        </ActionIcon>
      </Group>

      {showAnios && (
        <Group gap={6} mb="md" wrap="wrap">
          {(aniosPdi.length ? aniosPdi.map(String) : Object.keys(ind.avances_por_anio ?? {}).sort()).map((anio) => {
            const val = ind.avances_por_anio?.[anio];
            const tieneData = val != null;
            return (
              <Box
                key={anio}
                style={{
                  background: "rgba(124,58,237,0.07)",
                  border: "1px solid rgba(124,58,237,0.18)",
                  borderRadius: 8,
                  padding: "3px 10px",
                  textAlign: "center",
                  minWidth: 60,
                }}
              >
                <Text size="10px" c="dimmed" fw={700}>{anio}</Text>
                <Text size="xs" fw={800} c={tieneData ? "violet" : "dimmed"}>{tieneData ? `${Number(val).toFixed(1)}%` : "-"}</Text>
              </Box>
            );
          })}
        </Group>
      )}

      {/* Mini stats */}
      <SimpleGrid cols={3} mb="md">
        {[
          { label: "Peso", value: `${ind.peso}%` },
          { label: "Seguimiento", value: ind.tipo_seguimiento || "—" },
          { label: "Tipo cálculo", value: ind.tipo_calculo || "—" },
        ].map(s => (
          <Box key={s.label} style={{ textAlign: "center", background: "var(--mantine-color-default-hover)", borderRadius: 12, padding: "8px 4px" }}>
            <Text fw={700} size="sm" lh={1}>{s.value}</Text>
            <Text size="xs" c="dimmed" mt={2}>{s.label}</Text>
          </Box>
        ))}
      </SimpleGrid>

      {ind.observaciones && (
        <Text size="xs" c="dimmed" mb="sm">Obs: {ind.observaciones}</Text>
      )}

      {/* Contexto */}
      <Text size="xs" c="dimmed" mb="sm">
        Acción: <b>{typeof ind.accion_id === "string" ? ind.accion_id : ind.accion_id.nombre}</b>
      </Text>

      {/* Resumen periodos colapsable */}
      {ind.periodos.length > 0 && (
        <>
          <Button
            variant="light" color="violet" radius="xl" size="xs" fullWidth
            rightSection={open ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
            onClick={() => setOpen(v => !v)}
          >
            {open ? "Ocultar periodos" : `Ver periodos (${ind.periodos.length})`}
          </Button>
          {open && (
            <Stack gap={6} mt="sm">
              {ind.periodos.map(p => (
                <Paper key={p.periodo} withBorder radius="md" p="sm">
                  <Group justify="space-between">
                    <Text size="sm" fw={700}>{p.periodo}</Text>
                    <Group gap={12}>
                      <Text size="xs" c="dimmed">Meta: <b>{p.meta ?? "—"}</b></Text>
                      <Text size="xs" c="dimmed">Avance: <b>{p.avance ?? "—"}</b></Text>
                    </Group>
                  </Group>
                  {p.avance != null && p.meta != null && Number(p.meta) > 0 && (
                    <Progress
                      value={Math.min((Number(p.avance) / Number(p.meta)) * 100, 100)}
                      color="violet" size="xs" radius="xl" mt={6}
                    />
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </>
      )}

      {/* Botón principal de gestión */}
      <Button
        mt="sm"
        fullWidth
        variant="gradient"
        gradient={{ from: "violet", to: "blue", deg: 135 }}
        radius="xl"
        size="sm"
        leftSection={<IconEdit size={15} />}
        onClick={() => setModalAbierto(true)}
      >
        Actualizar avances y evidencias
      </Button>

      <ResponsableIndicadorModal
        opened={modalAbierto}
        onClose={() => setModalAbierto(false)}
        indicador={ind}
        cortesVigentes={cortesVigentes}
        onSaved={handleSaved}
        anioMeta={anioMeta}
      />
    </Paper>
  );
}

// ── Página principal ───────────────────────────────────────────────────────
export default function MisIndicadoresPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { config } = usePdiConfig();
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [loading, setLoading] = useState(true);
  const [cortesVigentes, setCortesVigentes] = useState<CorteVigente[]>([]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;
    const email = (session.user.email ?? "").toLowerCase().trim();

    Promise.all([
      axios.get(PDI_ROUTES.indicadores()),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users?email=${encodeURIComponent(email)}`),
      axios.get(PDI_ROUTES.cortesVigentes()),
    ])
      .then(([resInd, resUser, resCortes]) => {
        const todos: Indicador[] = resInd.data;
        const fullName = (resUser.data?.full_name ?? "").toLowerCase().trim();

        const matchesUser = (responsable?: string, responsable_email?: string) => {
          if (responsable_email?.toLowerCase().trim() === email) return true;
          if (fullName && responsable?.toLowerCase().trim() === fullName) return true;
          if (responsable?.toLowerCase().trim() === email) return true;
          return false;
        };

        const mios = todos.filter(i => {
          // 1. Responsable directo del indicador
          if (matchesUser(i.responsable, (i as any).responsable_email)) return true;
          // 2. Responsable de la acción padre
          const accion = typeof i.accion_id === "object" && i.accion_id !== null ? i.accion_id as any : null;
          if (accion && matchesUser(accion.responsable, accion.responsable_email)) return true;
          return false;
        });
        setIndicadores(mios);
        setCortesVigentes(resCortes.data);
      })
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [status, session]);

  const avanceGlobal = indicadores.length
    ? Math.round(indicadores.reduce((s, i) => s + i.avance, 0) / indicadores.length)
    : 0;
  const criticos = indicadores.filter(i => i.semaforo === "rojo").length;
  const enProgreso = indicadores.filter(i => i.semaforo === "amarillo").length;
  const cumplidos = indicadores.filter(i => i.semaforo === "verde").length;

  const statCards = [
    { label: "Mis indicadores", value: indicadores.length, color: "violet", icon: <IconTarget size={22} /> },
    { label: "Avance promedio", value: `${avanceGlobal}%`, color: "blue", icon: <IconTrendingUp size={22} /> },
    { label: "En cumplimiento", value: cumplidos, color: "green", icon: <IconListCheck size={22} /> },
    { label: "Requieren atención", value: criticos + enProgreso, color: "red", icon: <IconFlag size={22} /> },
  ];

  return (
    <Container size="xl" py="xl">
      {/* Header */}
      <Group mb="lg" justify="space-between">
        <Group gap={10}>
          <ActionIcon variant="subtle" onClick={() => router.push("/reports")}>
            <IconArrowLeft size={18} />
          </ActionIcon>
          <ThemeIcon size={40} radius="xl" color="violet" variant="light">
            <IconTarget size={22} />
          </ThemeIcon>
          <div>
            <Title order={3}>Mis Indicadores PDI</Title>
            <Text size="xs" c="dimmed">{config.nombre} - {formatAnioRange(config.anio_inicio, config.anio_fin)}</Text>
          </div>
        </Group>
      </Group>

      <Divider mb="lg" />

      {/* Stats */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} mb="xl">
        {statCards.map(s => (
          <Paper key={s.label} withBorder radius="lg" p="lg" shadow="xs">
            <Group justify="space-between" align="flex-start" mb="sm">
              <ThemeIcon size={48} radius="xl" color={s.color} variant="light">
                {s.icon}
              </ThemeIcon>
              <Badge color={s.color} variant="light" size="sm" radius="xl">PDI</Badge>
            </Group>
            <Text size="xs" c="dimmed" mb={2}>{s.label}</Text>
            <Text size="1.8rem" fw={800} lh={1}>{s.value}</Text>
          </Paper>
        ))}
      </SimpleGrid>

      {/* Lista */}
      {loading ? (
        <Center py="xl"><Loader /></Center>
      ) : indicadores.length === 0 ? (
        <Center py="xl">
          <Stack align="center" gap="xs">
            <ThemeIcon size={56} radius="xl" color="violet" variant="light">
              <IconTarget size={28} />
            </ThemeIcon>
            <Text fw={600}>No tienes indicadores asignados</Text>
            <Text size="sm" c="dimmed">El administrador debe asignarte como responsable de un indicador</Text>
          </Stack>
        </Center>
      ) : (
        <>
          <Group justify="space-between" mb="md">
            <Text fw={700} size="xl">Tus indicadores</Text>
            <Badge variant="outline" color="violet" radius="xl">{indicadores.length} asignados</Badge>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
            {indicadores.map(ind => (
              <MiIndicadorCard
                key={ind._id}
                indicador={ind}
                cortesVigentes={cortesVigentes}
                aniosPdi={config.anios}
                anioMeta={config.anio_fin}
                onUpdated={updated => setIndicadores(prev => prev.map(i => i._id === updated._id ? updated : i))}
              />
            ))}
          </SimpleGrid>
        </>
      )}
    </Container>
  );
}
