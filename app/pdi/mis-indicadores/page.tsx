"use client";

import { useState, useEffect } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Button, Stack,
  Loader, Center, Progress, ThemeIcon, ActionIcon, Box, SimpleGrid,
  Divider, TextInput, Textarea, Modal, Tabs,
} from "@mantine/core";
import {
  IconArrowLeft, IconTarget, IconChartBarPopular,
  IconEdit, IconChevronDown, IconChevronUp,
  IconCheck, IconAlertTriangle, IconX,
  IconListCheck, IconTrendingUp, IconFlag, IconFileTypePdf,
} from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PDI_ROUTES } from "../api";
import type { Indicador, Periodo } from "../types";
import dynamic from "next/dynamic";

const EvidenciasPanel = dynamic(() => import("../components/EvidenciasPanel"), { ssr: false });

const SEMAFORO_COLOR: Record<string, string> = { verde: "green", amarillo: "yellow", rojo: "red" };
const SEMAFORO_LABEL: Record<string, string> = {
  verde: "En cumplimiento", amarillo: "Requiere atención", rojo: "Crítico",
};
const SEMAFORO_ICON: Record<string, React.ReactNode> = {
  verde: <IconCheck size={13} />,
  amarillo: <IconAlertTriangle size={13} />,
  rojo: <IconX size={13} />,
};

// ── Modal completo del responsable ────────────────────────────────────────
function ResponsableIndicadorModal({ opened, onClose, indicador, onSaved }: {
  opened: boolean;
  onClose: () => void;
  indicador: Indicador;
  onSaved: (ind: Indicador) => void;
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
    // Permitir escribir libremente: números, punto, coma, vacío
    if (value !== "" && !/^[\d.,]*$/.test(value)) return;
    setAvancesStr(prev => ({ ...prev, [periodo]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const periodosPayload = periodos.map(p => ({
        periodo: p.periodo,
        meta: p.meta,
        avance: avancesStr[p.periodo] !== ""
          ? Number(avancesStr[p.periodo].replace(",", "."))
          : null,
      }));
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
                  { label: "Meta 2029", value: indicador.meta_final_2029 ?? "—" },
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
              periodos.map(p => (
                <Paper key={p.periodo} withBorder radius="md" p="sm"
                  style={{ borderLeft: "3px solid #7c3aed" }}>
                  <Group justify="space-between" align="flex-end">
                    <Box>
                      <Text size="sm" fw={700}>{p.periodo}</Text>
                      <Text size="xs" c="dimmed">Meta: <b>{p.meta ?? "—"}</b></Text>
                    </Box>
                    <TextInput
                      label="Avance"
                      placeholder="Ej: 80"
                      value={avancesStr[p.periodo] ?? ""}
                      onChange={e => updateAvanceStr(p.periodo, e.currentTarget.value)}
                      style={{ width: 120 }}
                      size="sm"
                    />
                  </Group>
                  {avancesStr[p.periodo] !== "" && p.meta != null && Number(p.meta) > 0 && (
                    <Progress
                      value={Math.min((Number(avancesStr[p.periodo].replace(",", ".")) / Number(p.meta)) * 100, 100)}
                      color="blue" size="xs" radius="xl" mt={8}
                    />
                  )}
                </Paper>
              ))
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
              <Button loading={loading} onClick={handleSave} color="violet">Guardar avances</Button>
            </Group>
          </Stack>
        </Tabs.Panel>

        {/* ── Evidencias ── */}
        <Tabs.Panel value="evidencias">
          <EvidenciasPanel indicadorId={indicador._id} />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
}

// ── Card de indicador ──────────────────────────────────────────────────────
function MiIndicadorCard({ indicador: indInicial, onUpdated }: {
  indicador: Indicador;
  onUpdated: (ind: Indicador) => void;
}) {
  const [ind, setInd] = useState(indInicial);
  const [open, setOpen] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);

  useEffect(() => { setInd(indInicial); }, [indInicial]);

  const handleSaved = (updated: Indicador) => {
    setInd(updated);
    onUpdated(updated);
  };

  const barColor = ind.avance >= 70 ? "#22c55e" : ind.avance >= 40 ? "#f59e0b" : "#ef4444";

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
          <Text size="2rem" fw={800} lh={1}>{ind.avance}%</Text>
          <Text size="xs" c="dimmed">Avance consolidado</Text>
        </div>
        {ind.meta_final_2029 != null && (
          <div style={{ textAlign: "right" }}>
            <Text size="lg" fw={700}>{ind.meta_final_2029}</Text>
            <Text size="xs" c="dimmed">Meta 2029</Text>
          </div>
        )}
      </Group>

      <Box style={{ height: 10, borderRadius: 99, background: "var(--mantine-color-default-hover)", overflow: "hidden", marginBottom: 12 }}>
        <Box style={{ height: "100%", width: `${ind.avance}%`, background: barColor, borderRadius: 99, transition: "width .4s" }} />
      </Box>

      {/* Mini stats */}
      <SimpleGrid cols={3} mb="md">
        {[
          { label: "Peso", value: `${ind.peso}%` },
          { label: "Seguimiento", value: ind.tipo_seguimiento || "—" },
          { label: "Avance real", value: ind.avance_total_real != null ? `${ind.avance_total_real}%` : "—" },
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
        onSaved={handleSaved}
      />
    </Paper>
  );
}

// ── Página principal ───────────────────────────────────────────────────────
export default function MisIndicadoresPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;
    const email = (session.user.email ?? "").toLowerCase().trim();

    Promise.all([
      axios.get(PDI_ROUTES.indicadores()),
      axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users?email=${encodeURIComponent(email)}`),
    ])
      .then(([resInd, resUser]) => {
        const todos: Indicador[] = resInd.data;
        const fullName = (resUser.data?.full_name ?? "").toLowerCase().trim();
        const mios = todos.filter(i => {
          if (!i.responsable) return false;
          // 1. match exacto por email dedicado (indicadores nuevos)
          if ((i as any).responsable_email?.toLowerCase().trim() === email) return true;
          // 2. match exacto por full_name real del usuario en BD
          if (fullName && i.responsable.toLowerCase().trim() === fullName) return true;
          // 3. match por email en campo responsable (algunos admins guardan el email)
          if (i.responsable.toLowerCase().trim() === email) return true;
          return false;
        });
        setIndicadores(mios);
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
            <Text size="xs" c="dimmed">Indicadores asignados a ti — actualiza el avance</Text>
          </div>
        </Group>
        <Button variant="light" color="violet" leftSection={<IconChartBarPopular size={15} />}
          onClick={() => router.push("/pdi")}>
          Ver PDI completo
        </Button>
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
                onUpdated={updated => setIndicadores(prev => prev.map(i => i._id === updated._id ? updated : i))}
              />
            ))}
          </SimpleGrid>
        </>
      )}
    </Container>
  );
}
