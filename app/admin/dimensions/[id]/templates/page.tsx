"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Container, Title, Text, Group, Badge, Card, Stack,
  Loader, Center, ActionIcon, TextInput,
  ThemeIcon, SimpleGrid, Select, Collapse, ScrollArea,
  Avatar,
} from "@mantine/core";
import {
  IconArrowLeft, IconSearch, IconTemplate,
  IconCalendar, IconChartBar, IconShield,
  IconBuilding, IconChevronDown, IconChevronUp,
} from "@tabler/icons-react";
import axios from "axios";
import { paramId } from "@/app/utils/routeParams";
import { usePeriod } from "@/app/context/PeriodContext";

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
  responsible_producers: Dep[];
  fecha_final?: string | null;
  loaded_data: LoadedEntry[];
}

interface Dimension {
  _id: string;
  name: string;
  responsible?: { _id: string; dep_code: string; name: string; responsible?: string | null; visualizers?: string[] };
}

function TemplateCardItem({ t }: { t: TemplateCard }) {
  const [openProducers, setOpenProducers] = useState(false);
  const [openAssociated, setOpenAssociated] = useState(false);

  return (
    <Card withBorder radius="xl" p={0} style={{ overflow: "hidden" }}>
      <div style={{ height: 4, background: "var(--mantine-color-blue-5)" }} />

      <Stack gap={0} p="md">
        {/* Header */}
        <div style={{ marginBottom: 12 }}>
          <Text fw={700} size="sm" lineClamp={2} mb={2}>{t.name}</Text>
          {t.file_description && (
            <Text size="xs" c="dimmed" lineClamp={1}>{t.file_description}</Text>
          )}
          {t.fecha_final && (
            <Group gap={4} mt={4}>
              <IconCalendar size={11} color="var(--mantine-color-dimmed)" />
              <Text size="xs" c="dimmed">
                {new Date(t.fecha_final).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
              </Text>
            </Group>
          )}
        </div>

        {/* Productores que deben llenar */}
        <div style={{ marginBottom: 8 }}>
          <Group
            gap={6}
            mb={6}
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => setOpenProducers((o) => !o)}
          >
            <IconBuilding size={13} color="var(--mantine-color-blue-6)" />
            <Text size="xs" fw={700} c="blue" tt="uppercase" style={{ letterSpacing: 0.5, flex: 1 }}>
              Productores ({t.producers.length})
            </Text>
            {openProducers ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
          </Group>
          <Collapse in={openProducers}>
            <ScrollArea.Autosize mah={240}>
              <Stack gap={4}>
                {t.producers.length === 0 ? (
                  <Text size="xs" c="dimmed">Sin productores asignados</Text>
                ) : (
                  t.producers.map((p) => (
                    <Group
                      key={p._id}
                      gap="xs"
                      wrap="nowrap"
                      p="xs"
                      style={{
                        borderRadius: 8,
                        background: "var(--mantine-color-blue-light)",
                        border: "1px solid var(--mantine-color-blue-3)",
                      }}
                    >
                      <Avatar size={28} radius="xl" color="blue" variant="filled">
                        <IconBuilding size={14} />
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={600} lineClamp={1}>{p.name}</Text>
                        {(p.visualizers?.[0] || p.responsible) && (
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {p.visualizers?.[0] || p.responsible}
                          </Text>
                        )}
                      </div>
                    </Group>
                  ))
                )}
              </Stack>
            </ScrollArea.Autosize>
          </Collapse>
        </div>

        {/* Productores asociados (responsible_producers) */}
        <div>
          <Group
            gap={6}
            mb={6}
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => setOpenAssociated((o) => !o)}
          >
            <IconShield size={13} color="var(--mantine-color-violet-6)" />
            <Text size="xs" fw={700} c="violet" tt="uppercase" style={{ letterSpacing: 0.5, flex: 1 }}>
              Productores asociados ({t.responsible_producers.length})
            </Text>
            {openAssociated ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
          </Group>
          <Collapse in={openAssociated}>
            <ScrollArea.Autosize mah={200}>
              <Stack gap={4}>
                {t.responsible_producers.length === 0 ? (
                  <Text size="xs" c="dimmed">Sin productores asociados</Text>
                ) : (
                  t.responsible_producers.map((rp) => (
                    <Group
                      key={rp._id}
                      gap="xs"
                      wrap="nowrap"
                      p="xs"
                      style={{
                        borderRadius: 8,
                        background: "var(--mantine-color-violet-light)",
                        border: "1px solid var(--mantine-color-violet-3)",
                      }}
                    >
                      <Avatar size={28} radius="xl" color="violet" variant="filled">
                        <IconShield size={14} />
                      </Avatar>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={600} lineClamp={1}>{rp.name}</Text>
                        {(rp.visualizers?.[0] || rp.responsible) && (
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {rp.visualizers?.[0] || rp.responsible}
                          </Text>
                        )}
                      </div>
                    </Group>
                  ))
                )}
              </Stack>
            </ScrollArea.Autosize>
          </Collapse>
        </div>
      </Stack>
    </Card>
  );
}

export default function DimensionTemplatesPage() {
  const params = useParams();
  const router = useRouter();
  const id = paramId(params);
  const { selectedPeriodId, availablePeriods } = usePeriod();

  const [dimension, setDimension] = useState<Dimension | null>(null);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [localPeriodId, setLocalPeriodId] = useState<string | null>(null);

  const activePeriodId = localPeriodId ?? selectedPeriodId;

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
        const depsByCode = new Map(allDeps.map((d) => [String(d.dep_code), d]));
        const resolveId = (pid: any): Dep | undefined =>
          depsById.get(String(pid)) || depsByCode.get(String(pid));

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
                `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/by-template/${t._id}`,
                { params: activePeriodId ? { periodId: activePeriodId } : {} }
              );
              loadedData = pubRes.data?.loaded_data || [];
            } catch {}

            return {
              ...t,
              producers: (t.producers || []).map(resolveId).filter(Boolean) as Dep[],
              responsible_producers: (t.responsible_producers || []).map(resolveId).filter(Boolean) as Dep[],
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
  }, [id, activePeriodId]);

  const filtered = templates
    .filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  const totalPlantillas = templates.length;

  const liderDimension =
    dimension?.responsible?.visualizers?.[0] ||
    dimension?.responsible?.responsible ||
    null;

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">

        {/* Header */}
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
                {liderDimension && (
                  <Badge variant="outline" color="gray" size="sm">Líder: {liderDimension}</Badge>
                )}
              </Group>
            )}
          </div>
        </Group>

        {/* Stats */}
        {!loading && (
          <Card withBorder radius="lg" p="md" style={{ maxWidth: 200 }}>
            <Group justify="space-between" align="center">
              <div>
                <Text size="xs" c="dimmed">Total plantillas</Text>
                <Title order={3} c="blue">{totalPlantillas}</Title>
              </div>
              <ThemeIcon color="blue" variant="light" size="lg" radius="md">
                <IconChartBar size={16} />
              </ThemeIcon>
            </Group>
          </Card>
        )}

        {/* Filtros */}
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Buscar plantilla..."
            leftSection={<IconSearch size={15} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
          />
          <Select
            placeholder="Periodo"
            clearable
            value={localPeriodId ?? selectedPeriodId}
            onChange={(v) => setLocalPeriodId(v)}
            data={availablePeriods.map((p) => ({ value: p._id, label: p.name }))}
            leftSection={<IconCalendar size={15} />}
            style={{ width: 180 }}
          />
        </Group>

        {/* Cards */}
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
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {filtered.map((t) => (
              <TemplateCardItem key={t._id} t={t} />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </Container>
  );
}
