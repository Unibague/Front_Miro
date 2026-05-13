"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Box, Button, Center, Collapse, Container,
  Group, Loader, Paper, Progress, Stack, Text, ThemeIcon, Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowLeft, IconChevronDown, IconChevronRight,
  IconFileWord, IconRefresh, IconReportAnalytics,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";

// ── Tipos locales ─────────────────────────────────────────────────────────────

interface ProyectoResumen {
  _id: string;
  codigo: string;
  nombre: string;
  avance: number;
  responsable: string;
}

interface MacroResumen {
  _id: string;
  codigo: string;
  nombre: string;
  avance: number;
  lider: string;
  proyectos: ProyectoResumen[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function semaforoColor(avance: number) {
  if (avance >= 90) return "teal";
  if (avance >= 60) return "yellow";
  return "red";
}

// ── Fila de proyecto ──────────────────────────────────────────────────────────

function FilaProyecto({ proyecto }: { proyecto: ProyectoResumen }) {
  const [loading, setLoading] = useState(false);

  const descargar = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(PDI_ROUTES.informeProyecto(proyecto._id));
      window.open(data.url, "_blank");
      showNotification({ title: "Informe generado", message: proyecto.nombre, color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo generar el informe", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder radius="lg" p="sm" style={{ background: "rgba(248,250,252,0.9)" }}>
      <Group justify="space-between" wrap="nowrap">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap={8} mb={4}>
            <Text size="xs" c="dimmed" fw={600}>{proyecto.codigo}</Text>
            <Badge size="xs" color={semaforoColor(proyecto.avance)} variant="light">
              {proyecto.avance}%
            </Badge>
          </Group>
          <Text fw={600} size="sm" truncate="end">{proyecto.nombre}</Text>
          {proyecto.responsable && (
            <Text size="xs" c="dimmed" mt={2}>Responsable: {proyecto.responsable}</Text>
          )}
          <Progress
            value={proyecto.avance}
            color={semaforoColor(proyecto.avance)}
            size="xs"
            radius="xl"
            mt={6}
          />
        </Box>
        <Button
          size="xs"
          variant="light"
          color="violet"
          radius="xl"
          loading={loading}
          leftSection={<IconFileWord size={13} />}
          onClick={descargar}
        >
          Informe
        </Button>
      </Group>
    </Paper>
  );
}

// ── Fila de macroproyecto ─────────────────────────────────────────────────────

function FilaMacro({ macro }: { macro: MacroResumen }) {
  const [abierto, setAbierto] = useState(false);
  const [loading, setLoading] = useState(false);

  const descargar = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(PDI_ROUTES.informeMacro(macro._id));
      window.open(data.url, "_blank");
      showNotification({ title: "Informe generado", message: macro.nombre, color: "teal" });
    } catch {
      showNotification({ title: "Error", message: "No se pudo generar el informe", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder radius="xl" p="md" shadow="xs">
      {/* Cabecera del macro */}
      <Group justify="space-between" wrap="nowrap" mb={abierto ? "sm" : 0}>
        <Group gap={10} style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setAbierto((v) => !v)}
          >
            {abierto ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </ActionIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={8} mb={2}>
              <Text size="xs" c="dimmed" fw={700}>{macro.codigo}</Text>
              <Badge size="sm" color={semaforoColor(macro.avance)} variant="light">
                {macro.avance}%
              </Badge>
              <Badge size="xs" variant="dot" color="violet">
                {macro.proyectos.length} proyecto{macro.proyectos.length !== 1 ? "s" : ""}
              </Badge>
            </Group>
            <Text fw={700} size="md" truncate="end">{macro.nombre}</Text>
            {macro.lider && <Text size="xs" c="dimmed">Líder: {macro.lider}</Text>}
            <Progress
              value={macro.avance}
              color={semaforoColor(macro.avance)}
              size="sm"
              radius="xl"
              mt={6}
            />
          </Box>
        </Group>

        <Button
          size="sm"
          variant="filled"
          color="violet"
          radius="xl"
          loading={loading}
          leftSection={<IconFileWord size={15} />}
          onClick={descargar}
        >
          Informe completo
        </Button>
      </Group>

      {/* Proyectos hijos */}
      <Collapse in={abierto}>
        {macro.proyectos.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="sm">
            Sin proyectos registrados
          </Text>
        ) : (
          <Stack gap="xs" mt="xs" pl="md">
            {macro.proyectos.map((p) => (
              <FilaProyecto key={p._id} proyecto={p} />
            ))}
          </Stack>
        )}
      </Collapse>
    </Paper>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function InformesPage() {
  const router = useRouter();
  const [macros, setMacros] = useState<MacroResumen[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(PDI_ROUTES.informesLista());
      setMacros(data ?? []);
    } catch {
      showNotification({ title: "Error", message: "No se pudo cargar la lista", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="lg" py="xl">

          {/* Header */}
          <Group justify="space-between" mb="xl">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={42} radius="xl" color="violet" variant="light">
                <IconReportAnalytics size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Informes de avance PDI</Title>
                <Text size="sm" c="dimmed">
                  Genera informes Word consolidados por proyecto o macroproyecto
                </Text>
              </div>
            </Group>
            <ActionIcon variant="light" color="violet" size="lg" onClick={cargar} title="Actualizar">
              <IconRefresh size={18} />
            </ActionIcon>
          </Group>

          {/* Leyenda */}
          <Paper withBorder radius="xl" p="md" mb="xl" style={{ background: "rgba(124,58,237,0.04)", borderColor: "#ede9fe" }}>
            <Group gap={24} wrap="wrap">
              <Group gap={6}>
                <IconFileWord size={16} color="#7c3aed" />
                <Text size="sm" c="dimmed">
                  <b>Informe completo</b> — incluye todos los proyectos, acciones e indicadores del macroproyecto
                </Text>
              </Group>
              <Group gap={6}>
                <IconFileWord size={16} color="#7c3aed" />
                <Text size="sm" c="dimmed">
                  <b>Informe</b> (por proyecto) — incluye acciones e indicadores del proyecto seleccionado
                </Text>
              </Group>
            </Group>
          </Paper>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : macros.length === 0 ? (
            <Center py="xl">
              <Text c="dimmed">No hay macroproyectos registrados</Text>
            </Center>
          ) : (
            <Stack gap="md">
              {macros.map((m) => (
                <FilaMacro key={m._id} macro={m} />
              ))}
            </Stack>
          )}

        </Container>
      </div>
    </div>
  );
}
