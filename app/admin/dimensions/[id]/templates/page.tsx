"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Container, Title, Text, Group, Badge, Card, Grid, Stack,
  Loader, Center, ActionIcon, TextInput, Progress,
  Divider, ThemeIcon, SimpleGrid, Select,
} from "@mantine/core";
import {
  IconArrowLeft, IconSearch, IconTemplate,
  IconCalendar, IconCheck, IconClock, IconX,
  IconUser, IconBuilding, IconChartBar, IconShield,
} from "@tabler/icons-react";
import axios from "axios";
import { paramId } from "@/app/utils/routeParams";

interface Dep {
  _id: string;
  dep_code: string;
  name: string;
  responsible?: string | null;
  visualizers?: string[];
}

interface LoadedEntry {
  dependency: string;
  send_by?: { full_name: string; email: string };
  loaded_date?: string;
}

interface TemplateCard {
  _id: string;
  name: string;
  file_description?: string;
  producers: Dep[];
  fecha_final?: string | null;
  loaded_data: LoadedEntry[];
}

interface Dimension {
  _id: string;
  name: string;
  responsible?: {
    _id: string;
    dep_code: string;
    name: string;
    responsible?: string | null;
    visualizers?: string[];
  };
}

export default function DimensionTemplatesPage() {
  const params = useParams();
  const router = useRouter();
  const id = paramId(params);

  const [dimension, setDimension] = useState<Dimension | null>(null);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [dimRes, tplRes, depsRes] = await Promise.all([
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions/${id}`),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/all`, { params: { limit: 1000 } }),
          axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`, { params: { limit: 100000 } }),
        ]);

        setDimension(dimRes.data);

        const allDeps: Dep[] = depsRes.data.dependencies || [];
        const depsById = new Map(allDeps.map((d) => [String(d._id), d]));

        const filtered = (tplRes.data.templates || []).filter((t: any) =>
          (t.dimensions || []).some((d: any) =>
            (typeof d === "string" ? d : String(d._id)) === id
          )
        );

        const withStatus = await Promise.all(
          filtered.map(async (t: any) => {
            let loadedData: LoadedEntry[] = [];
            try {
              const pubRes = await axios.get(
                `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/by-template/${t._id}`
              );
              loadedData = pubRes.data?.loaded_data || [];
            } catch {}

            return {
              ...t,
              producers: (t.producers || [])
                .map((pid: any) => depsById.get(String(pid)))
                .filter(Boolean) as Dep[],
              loaded_data: loadedData,
            };
          })
        );

        setTemplates(withStatus);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const getStats = (t: TemplateCard, responsibleDepCode?: string) => {
    const loadedCodes = new Set(t.loaded_data.map((ld) => ld.dependency));
    const total = t.producers.length;
    const done = t.producers.filter((p) => loadedCodes.has(p.dep_code)).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const responsibleLoaded = responsibleDepCode ? loadedCodes.has(responsibleDepCode) : null;
    return { total, done, pct, loadedCodes, responsibleLoaded };
  };

  const responsibleDepCode = dimension?.responsible?.dep_code;

  const filtered = templates
    .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    .filter((t) => {
      if (!statusFilter) return true;
      const { done, total } = getStats(t, responsibleDepCode);
      if (statusFilter === "completa") return done === total && total > 0;
      if (statusFilter === "progreso") return done > 0 && done < total;
      if (statusFilter === "pendiente") return done === 0;
      return true;
    });

  const totalStats = {
    total: templates.length,
    completas: templates.filter((t) => { const s = getStats(t, responsibleDepCode); return s.done === s.total && s.total > 0; }).length,
    progreso: templates.filter((t) => { const s = getStats(t, responsibleDepCode); return s.done > 0 && s.done < s.total; }).length,
    pendientes: templates.filter((t) => getStats(t, responsibleDepCode).done === 0).length,
  };

  const liderDimension =
    dimension?.responsible?.visualizers?.[0] ||
    dimension?.responsible?.responsible ||
    null;

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">

        {/* ── Header ── */}
        <Group align="flex-start" gap="sm">
          <ActionIcon variant="subtle" color="blue" size="lg" mt={4}
            onClick={() => router.push("/admin/dimensions")}>
            <IconArrowLeft size={18} />
          </ActionIcon>
          <div style={{ flex: 1 }}>
            <Group gap="xs" align="center">
              <ThemeIcon size="lg" radius="md" color="blue" variant="light">
                <IconTemplate size={18} />
              </ThemeIcon>
              <Title order={2}>Plantillas del ámbito</Title>
            </Group>
            {dimension && (
              <Group gap="xs" mt={4}>
                <Badge variant="light" color="blue" size="sm">{dimension.name}</Badge>
                {dimension.responsible?.name && (
                  <Badge variant="outline" color="violet" size="sm">
                    Dep. responsable: {dimension.responsible.name}
                  </Badge>
                )}
                {liderDimension && (
                  <Badge variant="outline" color="gray" size="sm">
                    Líder: {liderDimension}
                  </Badge>
                )}
              </Group>
            )}
          </div>
        </Group>

        {/* ── Stats clicables ── */}
        {!loading && (
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
            {[
              { label: "Total plantillas", value: totalStats.total, color: "blue", icon: <IconChartBar size={18} />, filter: null },
              { label: "Completadas", value: totalStats.completas, color: "teal", icon: <IconCheck size={18} />, filter: "completa" },
              { label: "En progreso", value: totalStats.progreso, color: "yellow", icon: <IconClock size={18} />, filter: "progreso" },
              { label: "Sin cargar", value: totalStats.pendientes, color: "red", icon: <IconX size={18} />, filter: "pendiente" },
            ].map((s) => (
              <Card
                key={s.label}
                withBorder
                radius="md"
                p="md"
                style={{
                  cursor: "pointer",
                  outline: statusFilter === s.filter ? `2px solid var(--mantine-color-${s.color}-5)` : undefined,
                }}
                onClick={() => setStatusFilter(statusFilter === s.filter ? null : s.filter)}
              >
                <Group justify="space-between" align="center">
                  <div>
                    <Text size="xs" c="dimmed" mb={2}>{s.label}</Text>
                    <Title order={2} c={s.color}>{s.value}</Title>
                  </div>
                  <ThemeIcon color={s.color} variant="light" size="xl" radius="md">
                    {s.icon}
                  </ThemeIcon>
                </Group>
              </Card>
            ))}
          </SimpleGrid>
        )}

        {/* ── Filtros ── */}
        <Group gap="sm">
          <TextInput
            placeholder="Buscar plantilla..."
            leftSection={<IconSearch size={15} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, maxWidth: 360 }}
          />
          <Select
            placeholder="Filtrar por estado"
            clearable
            value={statusFilter}
            onChange={setStatusFilter}
            data={[
              { value: "completa", label: "✓ Completadas" },
              { value: "progreso", label: "⏳ En progreso" },
              { value: "pendiente", label: "✗ Sin cargar" },
            ]}
            style={{ width: 200 }}
          />
        </Group>

        {/* ── Tarjetas ── */}
        {loading ? (
          <Center py="xl"><Loader /></Center>
        ) : filtered.length === 0 ? (
          <Center py="xl">
            <Stack align="center" gap="xs">
              <ThemeIcon size={48} radius="xl" color="gray" variant="light">
                <IconTemplate size={24} />
              </ThemeIcon>
              <Text c="dimmed">No hay plantillas que coincidan.</Text>
            </Stack>
          </Center>
        ) : (
          <Grid gutter="md">
            {filtered.map((t) => {
              const { total, done, pct, loadedCodes, responsibleLoaded } = getStats(t, responsibleDepCode);
              const color = pct === 100 ? "teal" : pct > 0 ? "yellow" : "red";
              const responsibleEntry = responsibleDepCode
                ? t.loaded_data.find((ld) => ld.dependency === responsibleDepCode)
                : null;

              return (
                <Grid.Col key={t._id} span={{ base: 12, md: 6, xl: 4 }}>
                  <Card withBorder radius="lg" p={0} h="100%" style={{ overflow: "hidden" }}>

                    {/* Cabecera */}
                    <div style={{
                      background: `var(--mantine-color-${color}-light)`,
                      borderBottom: `2px solid var(--mantine-color-${color}-3)`,
                      padding: "14px 16px 10px",
                    }}>
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Text fw={700} size="sm" lineClamp={2} style={{ flex: 1 }}>
                          {t.name}
                        </Text>
                        <Badge color={color} variant="filled" size="sm" style={{ flexShrink: 0 }}>
                          {pct}%
                        </Badge>
                      </Group>
                      {t.file_description && (
                        <Text size="xs" c="dimmed" mt={4} lineClamp={1}>{t.file_description}</Text>
                      )}
                    </div>

                    <Stack gap="md" p="md">

                      {/* Barra de progreso productores */}
                      <div>
                        <Group justify="space-between" mb={6}>
                          <Text size="xs" c="dimmed">Progreso productores</Text>
                          <Text size="xs" fw={700} c={color}>{done} / {total}</Text>
                        </Group>
                        <Progress value={pct} color={color} size="md" radius="xl" animated={pct > 0 && pct < 100} />
                      </div>

                      {/* Estado del responsable del ámbito */}
                      {dimension?.responsible && (
                        <>
                          <Divider label={
                            <Group gap={4}>
                              <IconShield size={12} />
                              <Text size="xs" fw={600}>Responsable del ámbito</Text>
                            </Group>
                          } labelPosition="left" />
                          <Card
                            withBorder
                            radius="sm"
                            p="xs"
                            style={{
                              borderColor: responsibleLoaded
                                ? "var(--mantine-color-teal-3)"
                                : "var(--mantine-color-red-3)",
                              background: responsibleLoaded
                                ? "var(--mantine-color-teal-light)"
                                : "var(--mantine-color-red-light)",
                            }}
                          >
                            <Group justify="space-between" wrap="nowrap" gap="xs">
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <Text size="xs" fw={600} lineClamp={1}>
                                  {dimension.responsible.name}
                                </Text>
                                {liderDimension && (
                                  <Group gap={4} mt={2}>
                                    <IconUser size={11} color="var(--mantine-color-dimmed)" />
                                    <Text size="xs" c="dimmed" lineClamp={1}>{liderDimension}</Text>
                                  </Group>
                                )}
                                {responsibleLoaded && responsibleEntry?.send_by && (
                                  <Group gap={4} mt={2}>
                                    <IconCheck size={11} color="var(--mantine-color-teal-6)" />
                                    <Text size="xs" c="teal" lineClamp={1}>
                                      {responsibleEntry.send_by.full_name}
                                      {responsibleEntry.loaded_date && ` · ${new Date(responsibleEntry.loaded_date).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}`}
                                    </Text>
                                  </Group>
                                )}
                              </div>
                              <Badge
                                size="xs"
                                color={responsibleLoaded ? "teal" : "red"}
                                variant="filled"
                                style={{ flexShrink: 0 }}
                              >
                                {responsibleLoaded ? "✓ Llenó" : "Pendiente"}
                              </Badge>
                            </Group>
                          </Card>
                        </>
                      )}

                      <Divider label={
                        <Group gap={4}>
                          <IconBuilding size={12} />
                          <Text size="xs" fw={600}>Productores asignados</Text>
                        </Group>
                      } labelPosition="left" />

                      {/* Productores */}
                      {t.producers.length === 0 ? (
                        <Text size="xs" c="dimmed">Sin productores asignados</Text>
                      ) : (
                        <Stack gap={6}>
                          {t.producers.map((p) => {
                            const cargada = loadedCodes.has(p.dep_code);
                            const entry = t.loaded_data.find((ld) => ld.dependency === p.dep_code);
                            const lider = p.visualizers?.[0] || p.responsible || null;

                            return (
                              <Card
                                key={p._id}
                                withBorder
                                radius="sm"
                                p="xs"
                                style={{
                                  borderColor: cargada
                                    ? "var(--mantine-color-teal-3)"
                                    : "var(--mantine-color-orange-3)",
                                  background: cargada
                                    ? "var(--mantine-color-teal-light)"
                                    : "var(--mantine-color-orange-light)",
                                }}
                              >
                                <Group justify="space-between" wrap="nowrap" gap="xs">
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text size="xs" fw={600} lineClamp={1}>{p.name}</Text>
                                    {lider && (
                                      <Group gap={4} mt={2}>
                                        <IconUser size={11} color="var(--mantine-color-dimmed)" />
                                        <Text size="xs" c="dimmed" lineClamp={1}>{lider}</Text>
                                      </Group>
                                    )}
                                    {cargada && entry?.send_by && (
                                      <Group gap={4} mt={2}>
                                        <IconCheck size={11} color="var(--mantine-color-teal-6)" />
                                        <Text size="xs" c="teal" lineClamp={1}>
                                          {entry.send_by.full_name}
                                          {entry.loaded_date && ` · ${new Date(entry.loaded_date).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}`}
                                        </Text>
                                      </Group>
                                    )}
                                  </div>
                                  <Badge
                                    size="xs"
                                    color={cargada ? "teal" : "orange"}
                                    variant="filled"
                                    style={{ flexShrink: 0 }}
                                  >
                                    {cargada ? "✓" : "⏳"}
                                  </Badge>
                                </Group>
                              </Card>
                            );
                          })}
                        </Stack>
                      )}

                      {/* Fecha límite */}
                      {t.fecha_final && (
                        <>
                          <Divider />
                          <Group gap={6}>
                            <IconCalendar size={13} color="var(--mantine-color-dimmed)" />
                            <Text size="xs" c="dimmed">
                              Fecha límite:{" "}
                              <Text span fw={600} c="dark">
                                {new Date(t.fecha_final).toLocaleDateString("es-CO", {
                                  day: "2-digit", month: "long", year: "numeric",
                                })}
                              </Text>
                            </Text>
                          </Group>
                        </>
                      )}
                    </Stack>
                  </Card>
                </Grid.Col>
              );
            })}
          </Grid>
        )}
      </Stack>
    </Container>
  );
}
