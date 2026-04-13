"use client";

import { useState, useEffect } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Stack, Loader,
  Center, ThemeIcon, ActionIcon, Box, Divider, Collapse, Button,
  TextInput, Pagination, SimpleGrid, ScrollArea,
} from "@mantine/core";
import {
  IconHistory, IconArrowLeft, IconChevronDown, IconChevronUp,
  IconSearch, IconClock, IconUser, IconTag, IconArrowRight,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";

interface EntradaHistorial {
  _id: string;
  indicador_id: string;
  indicador_codigo: string;
  indicador_nombre: string;
  modificado_por: string;
  antes: Record<string, any>;
  despues: Record<string, any>;
  campos_cambiados: string[];
  createdAt: string;
}

const BLUE = {
  main: "#1d4ed8", soft: "#eff6ff", border: "#bfdbfe", dark: "#1e3a5f",
};

// Campos legibles
const LABEL: Record<string, string> = {
  avance: "Avance (%)", observaciones: "Observaciones", periodos: "Periodos",
  meta_final_2029: "Meta 2029", responsable: "Responsable", nombre: "Nombre",
  codigo: "Código", peso: "Peso (%)", tipo_calculo: "Tipo cálculo",
  tipo_seguimiento: "Tipo seguimiento", entregable: "Entregable",
  fecha_inicio: "Fecha inicio", fecha_fin: "Fecha fin",
};

function ValorCampo({ valor }: { valor: any }) {
  if (valor === null || valor === undefined) return <Text size="xs" c="dimmed">—</Text>;
  if (Array.isArray(valor)) {
    return (
      <Stack gap={2}>
        {valor.map((v, i) => (
          <Text key={i} size="xs" style={{ fontFamily: "monospace", background: "#f8fafc", padding: "2px 6px", borderRadius: 4 }}>
            {typeof v === "object" ? JSON.stringify(v) : String(v)}
          </Text>
        ))}
      </Stack>
    );
  }
  if (typeof valor === "object") {
    return <Text size="xs" style={{ fontFamily: "monospace" }}>{JSON.stringify(valor)}</Text>;
  }
  return <Text size="xs" fw={500}>{String(valor)}</Text>;
}

function EntradaCard({ entrada }: { entrada: EntradaHistorial }) {
  const [abierto, setAbierto] = useState(false);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("es-CO", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const camposVisibles = entrada.campos_cambiados.filter(c =>
    !["avances_por_anio", "avance_total_real", "updatedAt"].includes(c)
  );

  return (
    <Paper withBorder radius="md" p="md" style={{
      borderLeft: `4px solid ${BLUE.main}`,
      background: `linear-gradient(90deg, ${BLUE.soft} 0%, white 100%)`,
    }}>
      {/* Header */}
      <Group justify="space-between" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={36} radius="xl" color="blue" variant="light">
            <IconHistory size={18} />
          </ThemeIcon>
          <Box>
            <Group gap={6}>
              <Text size="xs" fw={700} c="dimmed">{entrada.indicador_codigo}</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="sm" fw={700} style={{ color: BLUE.dark }}>{entrada.indicador_nombre}</Text>
            </Group>
            <Group gap={8} mt={4}>
              <Badge size="xs" color="blue" variant="light" leftSection={<IconClock size={9} />}>
                {formatDate(entrada.createdAt)}
              </Badge>
              {entrada.modificado_por && (
                <Badge size="xs" color="indigo" variant="light" leftSection={<IconUser size={9} />}>
                  {entrada.modificado_por}
                </Badge>
              )}
              {camposVisibles.length > 0 && (
                <Badge size="xs" color="orange" variant="light" leftSection={<IconTag size={9} />}>
                  {camposVisibles.length} campo{camposVisibles.length !== 1 ? "s" : ""} cambiado{camposVisibles.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </Group>
          </Box>
        </Group>
        <ActionIcon variant="subtle" color="blue" onClick={() => setAbierto(v => !v)}>
          {abierto ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </ActionIcon>
      </Group>

      {/* Detalle colapsable */}
      <Collapse in={abierto}>
        <Divider my="sm" />
        {camposVisibles.length === 0 ? (
          <Text size="xs" c="dimmed">Sin cambios significativos registrados</Text>
        ) : (
          <Stack gap="xs">
            {camposVisibles.map(campo => (
              <Paper key={campo} withBorder radius="sm" p="sm" style={{ background: "white" }}>
                <Text size="xs" fw={700} c="blue" mb={6}>
                  {LABEL[campo] ?? campo}
                </Text>
                <SimpleGrid cols={2} spacing="xs">
                  {/* Antes */}
                  <Box style={{
                    background: "#fff5f5", borderRadius: 6, padding: "8px 10px",
                    border: "1px solid #fecaca",
                  }}>
                    <Text size="xs" c="red" fw={600} mb={4}>Antes</Text>
                    <ValorCampo valor={entrada.antes?.[campo]} />
                  </Box>
                  {/* Después */}
                  <Box style={{
                    background: "#f0fdf4", borderRadius: 6, padding: "8px 10px",
                    border: "1px solid #bbf7d0",
                  }}>
                    <Text size="xs" c="green" fw={600} mb={4}>Después</Text>
                    <ValorCampo valor={entrada.despues?.[campo]} />
                  </Box>
                </SimpleGrid>
              </Paper>
            ))}
          </Stack>
        )}
      </Collapse>
    </Paper>
  );
}

export default function HistorialPage() {
  const router = useRouter();
  const [historial, setHistorial] = useState<EntradaHistorial[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchHistorial = async (p = 1) => {
    setLoading(true);
    try {
      const res = await axios.get(PDI_ROUTES.historial(), { params: { page: p, limit: 20 } });
      setHistorial(res.data.historial);
      setTotalPages(res.data.pages);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHistorial(page); }, [page]);

  const filtrado = historial.filter(h =>
    !search ||
    h.indicador_nombre.toLowerCase().includes(search.toLowerCase()) ||
    h.indicador_codigo.toLowerCase().includes(search.toLowerCase()) ||
    h.modificado_por.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
        <Container size="xl" py="xl">
          {/* Header */}
          <Group mb="lg" justify="space-between">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={40} radius="xl" color="blue" variant="light">
                <IconHistory size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Historial de Versiones</Title>
                <Text size="xs" c="dimmed">Registro de cambios en indicadores PDI — antes y después</Text>
              </div>
            </Group>
          </Group>

          <Divider mb="lg" />

          {/* Buscador */}
          <TextInput
            placeholder="Buscar por indicador, código o usuario..."
            leftSection={<IconSearch size={15} />}
            value={search}
            onChange={e => setSearch(e.currentTarget.value)}
            mb="md"
            style={{ maxWidth: 420 }}
          />

          {/* Lista */}
          {loading ? (
            <Center py="xl"><Loader color="blue" /></Center>
          ) : filtrado.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <ThemeIcon size={56} radius="xl" color="blue" variant="light">
                  <IconHistory size={28} />
                </ThemeIcon>
                <Text fw={600}>Sin registros de historial</Text>
                <Text size="sm" c="dimmed">Los cambios en indicadores aparecerán aquí</Text>
              </Stack>
            </Center>
          ) : (
            <Stack gap="sm">
              <Group justify="space-between" mb="xs">
                <Text size="xs" c="dimmed" fw={500}>{filtrado.length} registro{filtrado.length !== 1 ? "s" : ""}</Text>
                <Badge variant="outline" color="blue" radius="xl">Página {page} de {totalPages}</Badge>
              </Group>
              {filtrado.map(entrada => (
                <EntradaCard key={entrada._id} entrada={entrada} />
              ))}
              {totalPages > 1 && (
                <Center mt="md">
                  <Pagination value={page} onChange={setPage} total={totalPages} color="blue" />
                </Center>
              )}
            </Stack>
          )}
        </Container>
      </div>
    </div>
  );
}
