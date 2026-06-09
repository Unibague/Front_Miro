"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Container, Title, Text, Group, Badge, Card, Stack,
  Loader, Center, ActionIcon, TextInput, Progress,
  ThemeIcon, SimpleGrid, Select, Table,
} from "@mantine/core";
import {
  IconArrowLeft, IconSearch, IconTemplate,
  IconCalendar, IconCheck, IconClock, IconX,
  IconUser, IconBuilding, IconChartBar, IconShield,
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

  const { selectedPeriodId } = usePeriod();
  const [dimension, setDimension] = useState<Dimension | null>(null);
  const [templates, setTemplates] = useState<TemplateCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!id || !selectedPeriodId) return;
    const load = async () => {
      setTemplates([]);
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
            let found = false;
            try {
              const pubRes = await axios.get(
                `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/by-template/${t._id}`,
                { params: { periodId: selectedPeriodId } }
              );
              found = pubRes.data?.found ?? true;
              loadedData = pubRes.data?.loaded_data || [];
            } catch {}

            if (!found) return null;

            return {
              ...t,
              producers: (t.producers || [])
                .map((pid: any) => depsById.get(String(pid)))
                .filter(Boolean) as Dep[],
              responsible_producers: (t.responsible_producers || [])
                .map((pid: any) => depsById.get(String(pid)))
                .filter(Boolean) as Dep[],
              loaded_data: loadedData,
            };
          })
        );

        setTemplates(withStatus.filter(Boolean) as TemplateCard[]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, selectedPeriodId]);

  const getStats = (t: TemplateCard, responsibleDepCode?: string) => {
    const loadedCodes = new Set(t.loaded_data.map((ld) => ld.dependency));
    const total = t.producers.length;
    const done = t.producers.filter((p) => loadedCodes.has(p.dep_code)).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const responsibleLoaded = responsibleDepCode ? loadedCodes.has(responsibleDepCode) : null;
    return { total, done, pct, loadedCodes, responsibleLoaded };
  };

  const responsibleDepCode = dimension?.responsible?.dep_code;

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

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

        {/* ── Filtros ── */}
        <Group gap="sm">
          <TextInput
            placeholder="Buscar plantilla..."
            leftSection={<IconSearch size={15} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, maxWidth: 360 }}
          />
        </Group>

        {/* ── Tabla ── */}
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
          <Table striped withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 200 }}>Plantilla</Table.Th>
                <Table.Th style={{ minWidth: 180 }}>Productor encargado</Table.Th>
                <Table.Th>Productores asociados</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((t) => {
                const { total, done, pct, loadedCodes } = getStats(t, responsibleDepCode);
                const color = pct === 100 ? "teal" : pct > 0 ? "yellow" : "red";
                const encargado = t.responsible_producers?.[0] ?? null;

                return (
                  <Table.Tr key={t._id}>
                    <Table.Td style={{ verticalAlign: "top", paddingTop: 12 }}>
                      <Text fw={700} size="sm">{t.name}</Text>
                      {t.file_description && (
                        <Text size="xs" c="dimmed" lineClamp={2} mt={2}>{t.file_description}</Text>
                      )}
                    </Table.Td>
                    <Table.Td style={{ verticalAlign: "middle" }}>
                      {encargado ? (
                        <Text size="sm" fw={500}>{encargado.name}</Text>
                      ) : (
                        <Text size="xs" c="dimmed">Sin asignar</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="wrap">
                        {t.producers.length === 0 ? (
                          <Text size="xs" c="dimmed">Sin productores</Text>
                        ) : t.producers.map((p) => {
                          const cargada = loadedCodes.has(p.dep_code);
                          const entry = t.loaded_data.find((ld) => ld.dependency === p.dep_code);
                          return (
                            <Badge
                              key={p._id}
                              variant={cargada ? "filled" : "light"}
                              color={cargada ? "teal" : "blue"}
                              size="sm"
                              title={cargada && entry?.send_by ? `${entry.send_by.full_name}${entry.loaded_date ? ` · ${new Date(entry.loaded_date).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}` : ""}` : undefined}
                            >
                              {cargada ? "✓ " : ""}{p.name}
                            </Badge>
                          );
                        })}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Container>
  );
}
