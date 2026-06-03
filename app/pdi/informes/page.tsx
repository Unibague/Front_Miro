"use client";

import { useEffect, useState } from "react";
import {
  ActionIcon, Badge, Box, Button, Center, Collapse, Container,
  Group, Loader, Paper, Progress, Select, Stack, Text, ThemeIcon, Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconArrowLeft, IconBrandGoogleDrive, IconChevronDown, IconChevronRight,
  IconFileWord, IconReportAnalytics,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";
import { useRole } from "@/app/context/RoleContext";

interface ProyectoResumen {
  _id: string;
  codigo: string;
  nombre: string;
  avance: number;
  responsable: string;
  informe_drive_web_view_link: string | null;
  acciones: AccionResumen[];
}

interface AccionResumen {
  _id: string;
  codigo: string;
  nombre: string;
  avance: number;
  responsable: string;
  indicadores: IndicadorResumen[];
}

interface IndicadorResumen {
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
  lider_email?: string;
  informe_drive_web_view_link: string | null;
  proyectos: ProyectoResumen[];
}

const normalizeText = (value?: string | null) => String(value ?? "").toLowerCase().trim();

function matchesCurrentUser(email: string, fullName: string, name?: string | null, emailValue?: string | null) {
  const normalizedName = normalizeText(name);
  return (
    Boolean(emailValue) && normalizeText(emailValue) === email
  ) || (
    Boolean(fullName) && normalizedName === fullName
  ) || (
    Boolean(email) && normalizedName === email
  );
}

function semaforoColor(avance: number) {
  if (avance >= 90) return "teal";
  if (avance >= 60) return "yellow";
  return "red";
}

// ── Fila de proyecto ──────────────────────────────────────────────────────────

function FilaIndicador({ indicador, corteGlobal }: { indicador: IndicadorResumen; corteGlobal: string }) {
  const [loading, setLoading] = useState(false);

  const descargar = async () => {
    setLoading(true);
    try {
      const params = corteGlobal ? { params: { corte: corteGlobal } } : {};
      const { data } = await axios.get(PDI_ROUTES.informeIndicador(indicador._id), params);
      window.open(data.url, "_blank");
      showNotification({
        title: "Informe generado",
        message: `${indicador.nombre}${corteGlobal ? ` - ${corteGlobal}` : " - Todos los periodos"}`,
        color: "teal",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo generar el informe", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder radius="md" p="xs" style={{ background: "#fff" }}>
      <Group justify="space-between" wrap="nowrap">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group gap={8} mb={2}>
            <Text size="xs" c="dimmed" fw={600}>{indicador.codigo}</Text>
            <Badge size="xs" color={semaforoColor(indicador.avance)} variant="light">
              {indicador.avance ?? 0}%
            </Badge>
          </Group>
          <Text fw={600} size="sm" truncate="end">{indicador.nombre}</Text>
          {indicador.responsable && <Text size="xs" c="dimmed">Responsable: {indicador.responsable}</Text>}
        </Box>
        <Button
          size="xs"
          variant="subtle"
          color="violet"
          radius="xl"
          loading={loading}
          leftSection={<IconFileWord size={13} />}
          onClick={descargar}
        >
          Evidencias
        </Button>
      </Group>
    </Paper>
  );
}

function FilaAccion({ accion, corteGlobal }: { accion: AccionResumen; corteGlobal: string }) {
  const [abierto, setAbierto] = useState(false);
  const [loading, setLoading] = useState(false);

  const descargar = async () => {
    setLoading(true);
    try {
      const params = corteGlobal ? { params: { corte: corteGlobal } } : {};
      const { data } = await axios.get(PDI_ROUTES.informeAccion(accion._id), params);
      window.open(data.url, "_blank");
      showNotification({
        title: "Informe generado",
        message: `${accion.nombre}${corteGlobal ? ` - ${corteGlobal}` : " - Todos los periodos"}`,
        color: "teal",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo generar el informe", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder radius="lg" p="sm" style={{ background: "rgba(255,255,255,0.95)" }}>
      <Group justify="space-between" wrap="nowrap" mb={abierto ? "xs" : 0}>
        <Group gap={8} style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
          <ActionIcon variant="subtle" size="sm" onClick={() => setAbierto((v) => !v)}>
            {abierto ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
          </ActionIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={8} mb={2}>
              <Text size="xs" c="dimmed" fw={700}>{accion.codigo}</Text>
              <Badge size="xs" color={semaforoColor(accion.avance)} variant="light">{accion.avance ?? 0}%</Badge>
              <Badge size="xs" variant="dot" color="indigo">
                {accion.indicadores.length} indicador{accion.indicadores.length !== 1 ? "es" : ""}
              </Badge>
            </Group>
            <Text fw={700} size="sm" truncate="end">{accion.nombre}</Text>
            {accion.responsable && <Text size="xs" c="dimmed">Responsable: {accion.responsable}</Text>}
          </Box>
        </Group>
        <Button
          size="xs"
          variant="light"
          color="violet"
          radius="xl"
          loading={loading}
          leftSection={<IconFileWord size={13} />}
          onClick={descargar}
        >
          Informe accion
        </Button>
      </Group>

      <Collapse in={abierto}>
        {accion.indicadores.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xs">Sin indicadores registrados</Text>
        ) : (
          <Stack gap={6} mt="xs" pl="lg">
            {accion.indicadores.map((i) => (
              <FilaIndicador key={i._id} indicador={i} corteGlobal={corteGlobal} />
            ))}
          </Stack>
        )}
      </Collapse>
    </Paper>
  );
}

function FilaProyecto({ proyecto, corteGlobal }: { proyecto: ProyectoResumen; corteGlobal: string }) {
  const [abierto, setAbierto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [driveLink, setDriveLink] = useState<string | null>(proyecto.informe_drive_web_view_link);

  const descargar = async () => {
    setLoading(true);
    try {
      const params = corteGlobal ? { params: { corte: corteGlobal } } : {};
      const { data } = await axios.get(PDI_ROUTES.informeProyecto(proyecto._id), params);
      setDriveLink(data.drive_web_view_link || data.url);
      window.open(data.drive_web_view_link || data.url, "_blank");
      showNotification({
        title: "Informe guardado en Drive",
        message: `${proyecto.nombre}${corteGlobal ? ` — ${corteGlobal}` : " — Todos los periodos"}`,
        color: "teal",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo generar el informe", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder radius="lg" p="sm" style={{ background: "rgba(248,250,252,0.9)" }}>
      <Group justify="space-between" wrap="nowrap" mb={abierto ? "xs" : 0}>
        <Group gap={8} style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
          <ActionIcon variant="subtle" size="sm" onClick={() => setAbierto((v) => !v)}>
            {abierto ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
          </ActionIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={8} mb={4}>
              <Text size="xs" c="dimmed" fw={600}>{proyecto.codigo}</Text>
              <Badge size="xs" color={semaforoColor(proyecto.avance)} variant="light">
                {proyecto.avance}%
              </Badge>
              <Badge size="xs" variant="dot" color="blue">
                {proyecto.acciones.length} accion{proyecto.acciones.length !== 1 ? "es" : ""}
              </Badge>
            </Group>
            <Text fw={600} size="sm" truncate="end">{proyecto.nombre}</Text>
            {proyecto.responsable && (
              <Text size="xs" c="dimmed" mt={2}>Responsable: {proyecto.responsable}</Text>
            )}
            <Progress value={proyecto.avance} color={semaforoColor(proyecto.avance)} size="xs" radius="xl" mt={6} />
          </Box>
        </Group>
        <Group gap={6} wrap="nowrap">
          {driveLink && (
            <ActionIcon
              component="a"
              href={driveLink}
              target="_blank"
              variant="subtle"
              color="teal"
              size="sm"
              title="Ver informe en Drive"
            >
              <IconBrandGoogleDrive size={16} />
            </ActionIcon>
          )}
          <Button
            size="xs"
            variant="light"
            color="violet"
            radius="xl"
            loading={loading}
            leftSection={<IconFileWord size={13} />}
            onClick={descargar}
          >
            {driveLink ? "Regenerar informe" : "Generar informe"}
          </Button>
        </Group>
      </Group>

      <Collapse in={abierto}>
        {proyecto.acciones.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="xs">Sin acciones registradas</Text>
        ) : (
          <Stack gap="xs" mt="xs" pl="lg">
            {proyecto.acciones.map((a) => (
              <FilaAccion key={a._id} accion={a} corteGlobal={corteGlobal} />
            ))}
          </Stack>
        )}
      </Collapse>
    </Paper>
  );
}

// ── Fila de macroproyecto ─────────────────────────────────────────────────────

function FilaMacro({ macro, corteGlobal }: { macro: MacroResumen; corteGlobal: string }) {
  const [abierto, setAbierto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [driveLink, setDriveLink] = useState<string | null>(macro.informe_drive_web_view_link);

  const descargar = async () => {
    setLoading(true);
    try {
      const params = corteGlobal ? { params: { corte: corteGlobal } } : {};
      const { data } = await axios.get(PDI_ROUTES.informeMacro(macro._id), params);
      setDriveLink(data.drive_web_view_link || data.url);
      window.open(data.drive_web_view_link || data.url, "_blank");
      showNotification({
        title: "Informe guardado en Drive",
        message: `${macro.nombre}${corteGlobal ? ` — ${corteGlobal}` : " — Todos los periodos"}`,
        color: "teal",
      });
    } catch {
      showNotification({ title: "Error", message: "No se pudo generar el informe", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper withBorder radius="xl" p="md" shadow="xs">
      <Group justify="space-between" wrap="nowrap" mb={abierto ? "sm" : 0}>
        <Group gap={10} style={{ flex: 1, minWidth: 0 }} wrap="nowrap">
          <ActionIcon variant="subtle" size="sm" onClick={() => setAbierto((v) => !v)}>
            {abierto ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </ActionIcon>
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={8} mb={2}>
              <Text size="xs" c="dimmed" fw={700}>{macro.codigo}</Text>
              <Badge size="sm" color={semaforoColor(macro.avance)} variant="light">{macro.avance}%</Badge>
              <Badge size="xs" variant="dot" color="violet">
                {macro.proyectos.length} proyecto{macro.proyectos.length !== 1 ? "s" : ""}
              </Badge>
            </Group>
            <Text fw={700} size="md" truncate="end">{macro.nombre}</Text>
            {macro.lider && <Text size="xs" c="dimmed">Líder: {macro.lider}</Text>}
            <Progress value={macro.avance} color={semaforoColor(macro.avance)} size="sm" radius="xl" mt={6} />
          </Box>
        </Group>
        <Group gap={8} wrap="nowrap">
          {driveLink && (
            <ActionIcon
              component="a"
              href={driveLink}
              target="_blank"
              variant="light"
              color="teal"
              size="lg"
              radius="xl"
              title="Ver informe en Drive"
            >
              <IconBrandGoogleDrive size={18} />
            </ActionIcon>
          )}
          <Button
            size="sm"
            variant="filled"
            color="violet"
            radius="xl"
            loading={loading}
            leftSection={<IconFileWord size={15} />}
            onClick={descargar}
          >
            {driveLink ? "Regenerar informe" : "Generar informe"}
          </Button>
        </Group>
      </Group>

      <Collapse in={abierto}>
        {macro.proyectos.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="sm">Sin proyectos registrados</Text>
        ) : (
          <Stack gap="xs" mt="xs" pl="md">
            {macro.proyectos.map((p) => (
              <FilaProyecto key={p._id} proyecto={p} corteGlobal={corteGlobal} />
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
  const { data: session, status } = useSession();
  const { userRole } = useRole();
  const isAdmin = userRole === "Administrador";
  const [macros, setMacros]       = useState<MacroResumen[]>([]);
  const [cortes, setCortes]       = useState<string[]>([]);
  const [corteGlobal, setCorteGlobal] = useState<string>("");
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return;
    const email = (session.user.email ?? "").toLowerCase().trim();

    setLoading(true);
    Promise.all([
      axios.get(PDI_ROUTES.informesLista()),
      axios.get(PDI_ROUTES.informesCortes()),
      isAdmin ? Promise.resolve(null) : axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users?email=${encodeURIComponent(email)}`),
    ])
      .then(([rLista, rCortes, rUser]) => {
        const todos: MacroResumen[] = rLista.data ?? [];
        if (isAdmin) {
          setMacros(todos);
        } else {
          const nombre = normalizeText(
            rUser?.data?.full_name ||
            (session.user as { full_name?: string })?.full_name ||
            session.user?.name
          );
          setMacros(todos.filter((m) => {
            return matchesCurrentUser(email, nombre, m.lider, m.lider_email);
          }));
        }
        setCortes(rCortes.data ?? []);
      })
      .catch(() => showNotification({ title: "Error", message: "No se pudo cargar la lista", color: "red" }))
      .finally(() => setLoading(false));
  }, [status, session, isAdmin]);

  const opcionesCorte = [
    { value: "", label: "Todos los periodos" },
    ...cortes.map((c) => ({ value: c, label: c })),
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="lg" py="xl">

          {/* Header */}
          <Group justify="space-between" mb="xl" align="center">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push(isAdmin ? "/pdi" : "/pdi/mis-indicadores")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={42} radius="xl" color="violet" variant="light">
                <IconReportAnalytics size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Informes de avance PDI</Title>
                <Text size="sm" c="dimmed">Genera informes Word consolidados</Text>
              </div>
            </Group>
            <Group gap={10} align="center">
              <Text size="sm" fw={600} c="violet">Filtrar por periodo:</Text>
              <Select
                size="sm"
                radius="xl"
                placeholder="Todos los periodos"
                data={opcionesCorte}
                value={corteGlobal}
                onChange={(v) => setCorteGlobal(v ?? "")}
                style={{ width: 200 }}
                comboboxProps={{ withinPortal: true }}
              />
              {corteGlobal && (
                <Badge color="violet" variant="light" radius="xl" size="lg">
                  {corteGlobal}
                </Badge>
              )}
            </Group>
          </Group>

          {loading ? (
            <Center py="xl"><Loader /></Center>
          ) : macros.length === 0 ? (
            <Center py="xl">
              <Text c="dimmed">
                {isAdmin ? "No hay macroproyectos registrados" : "No tienes macroproyectos liderados para generar informes de avance"}
              </Text>
            </Center>
          ) : (
            <Stack gap="md">
              {macros.map((m) => (
                <FilaMacro key={m._id} macro={m} corteGlobal={corteGlobal} />
              ))}
            </Stack>
          )}

        </Container>
      </div>
    </div>
  );
}
