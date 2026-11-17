"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import {
  Stack, Group, Text, Button, Paper, Table, Badge, Modal, TextInput, Textarea,
  Alert, Loader, ScrollArea, ThemeIcon, Box, SimpleGrid, ActionIcon, Tooltip,
} from "@mantine/core";
import {
  IconMail, IconSend, IconRefresh, IconSpeakerphone, IconShieldCheck, IconUsers, IconEye,
  IconCircleCheck, IconAlertTriangle, IconFlask, IconRestore, IconInbox,
} from "@tabler/icons-react";

type TipoMensaje = "general" | "administradores" | "responsables";

type MensajeBuzon = {
  _id: string;
  tipo: TipoMensaje;
  asunto: string;
  cuerpo: string;
  destinatarios: string[];
  enviado_por: string;
  estado: "enviado" | "error";
  error?: string | null;
  createdAt: string;
};

/** Cada tipo de envío con su mensaje predeterminado (se reemplazan por los prototipos definitivos). */
const TIPOS: Record<TipoMensaje, {
  label: string;
  boton: string;
  descripcion: string;
  destino: string;
  color: string;
  icon: typeof IconMail;
  asunto: string;
  cuerpo: string;
}> = {
  general: {
    label: "General",
    boton: "Recordatorio general",
    descripcion: "Recordatorio para todos los involucrados en los procesos MEN.",
    destino: "todos los involucrados",
    color: "blue",
    icon: IconSpeakerphone,
    asunto: "Recordatorio general – Procesos de calidad MEN",
    cuerpo: `Cordial saludo,

Le recordamos revisar el estado de los procesos de calidad MEN a su cargo y mantener al día la información y los documentos requeridos.

Agradecemos su atención.

Sistema Miró – Universidad de Ibagué`,
  },
  administradores: {
    label: "Administradores",
    boton: "Enviar a administradores",
    descripcion: "Mensaje para los administradores del módulo MEN.",
    destino: "los administradores",
    color: "violet",
    icon: IconShieldCheck,
    asunto: "Aviso para administradores – Procesos de calidad MEN",
    cuerpo: `Cordial saludo,

Les informamos que hay procesos de calidad MEN que requieren revisión y seguimiento por parte de la administración.

Agradecemos su atención.

Sistema Miró – Universidad de Ibagué`,
  },
  responsables: {
    label: "Responsables",
    boton: "Enviar a responsables",
    descripcion: "Mensaje para los responsables de los programas.",
    destino: "los responsables de los programas",
    color: "teal",
    icon: IconUsers,
    asunto: "Aviso para responsables – Procesos de calidad MEN",
    cuerpo: `Cordial saludo,

Le recordamos revisar el estado de los procesos de calidad MEN de su programa y cargar oportunamente la información y los documentos pendientes.

Agradecemos su atención.

Sistema Miró – Universidad de Ibagué`,
  },
};

const TH_STYLE = {
  color: "var(--mantine-color-dimmed)",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: 0.3,
  backgroundColor: "var(--mantine-color-default-hover)",
};

const formatFechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

const infoTipo = (tipo: string | undefined) => TIPOS[(tipo as TipoMensaje)] ?? TIPOS.general;

export default function BuzonMenView() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";

  const [mensajes, setMensajes] = useState<MensajeBuzon[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [tipoEnvio, setTipoEnvio] = useState<TipoMensaje | null>(null);
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [okEnvio, setOkEnvio] = useState<string | null>(null);

  const [detalle, setDetalle] = useState<MensajeBuzon | null>(null);

  const cargarMensajes = async () => {
    if (!email) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/men-mailbox`, { params: { email } });
      setMensajes(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setErrorCarga(axios.isAxiosError(e) ? e.response?.data?.message ?? e.message : "Error cargando el buzón");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarMensajes(); }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const abrirEnvio = (tipo: TipoMensaje) => {
    setTipoEnvio(tipo);
    setAsunto(TIPOS[tipo].asunto);
    setCuerpo(TIPOS[tipo].cuerpo);
    setErrorEnvio(null);
  };

  const enviar = async () => {
    if (!tipoEnvio) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/men-mailbox/enviar`, {
        adminEmail: email,
        tipo: tipoEnvio,
        asunto,
        cuerpo,
      });
      setOkEnvio(`Mensaje «${TIPOS[tipoEnvio].label}» enviado a ${email} (modo prueba).`);
      setTipoEnvio(null);
    } catch (e) {
      setErrorEnvio(axios.isAxiosError(e)
        ? e.response?.data?.detalle ?? e.response?.data?.error ?? e.response?.data?.message ?? e.message
        : "No se pudo enviar el mensaje");
    } finally {
      setEnviando(false);
      cargarMensajes();
    }
  };

  const tipoActual = tipoEnvio ? TIPOS[tipoEnvio] : null;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Box>
          <Text fw={700} size="xl" lh={1.2}>Buzón</Text>
          <Text size="sm" c="dimmed" mt={4}>
            Envía recordatorios y consulta el historial de mensajes enviados.
          </Text>
        </Box>
        <Button variant="default" radius="md" leftSection={<IconRefresh size={16} />} onClick={cargarMensajes} loading={cargando}>
          Actualizar
        </Button>
      </Group>

      <Alert color="yellow" variant="light" radius="md" icon={<IconFlask size={18} />} title="Modo prueba">
        Por ahora todos los mensajes llegan solo a tu correo ({email || "administrador"}). El envío a administradores y responsables se activará más adelante.
      </Alert>

      {/* Tres tipos de envío */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        {(Object.keys(TIPOS) as TipoMensaje[]).map((tipo) => {
          const t = TIPOS[tipo];
          return (
            <Paper key={tipo} radius="lg" p="md" style={{ backgroundColor: `var(--mantine-color-${t.color}-light)` }}>
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon size={40} radius="xl" variant="white" color={t.color} style={{ flexShrink: 0 }}>
                  <t.icon size={20} />
                </ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                  <Text fw={700}>{t.boton}</Text>
                  <Text size="xs" c="dimmed">{t.descripcion}</Text>
                </Box>
              </Group>
              <Button
                mt="md"
                fullWidth
                radius="md"
                color={t.color}
                leftSection={<IconSend size={16} />}
                onClick={() => abrirEnvio(tipo)}
                disabled={!email}
              >
                {t.boton}
              </Button>
            </Paper>
          );
        })}
      </SimpleGrid>

      {okEnvio && (
        <Alert color="teal" variant="light" radius="md" icon={<IconCircleCheck size={18} />} withCloseButton onClose={() => setOkEnvio(null)}>
          {okEnvio}
        </Alert>
      )}
      {errorCarga && <Alert color="red" variant="light" radius="md">{errorCarga}</Alert>}

      {/* Historial */}
      <Paper withBorder radius="lg" style={{ overflow: "hidden" }}>
        <Group gap="sm" p="md" pb="sm" wrap="nowrap">
          <ThemeIcon size={32} radius="xl" variant="light" color="blue"><IconInbox size={17} /></ThemeIcon>
          <Box>
            <Text fw={700}>Mensajes enviados</Text>
            <Text size="xs" c="dimmed">{mensajes.length} {mensajes.length === 1 ? "mensaje" : "mensajes"} · los más recientes primero</Text>
          </Box>
        </Group>
        {cargando && mensajes.length === 0 ? (
          <Group justify="center" py="xl"><Loader size="sm" /></Group>
        ) : mensajes.length === 0 ? (
          <Stack align="center" gap={6} py="xl">
            <ThemeIcon size={48} radius="xl" variant="light" color="gray"><IconMail size={24} /></ThemeIcon>
            <Text size="sm" c="dimmed">Aún no se han enviado mensajes.</Text>
          </Stack>
        ) : (
          <ScrollArea type="auto">
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover style={{ minWidth: 820 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={TH_STYLE}>Fecha</Table.Th>
                  <Table.Th style={TH_STYLE}>Tipo</Table.Th>
                  <Table.Th style={TH_STYLE}>Asunto</Table.Th>
                  <Table.Th style={TH_STYLE}>Enviado por</Table.Th>
                  <Table.Th style={TH_STYLE}>Estado</Table.Th>
                  <Table.Th style={{ ...TH_STYLE, width: 60 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {mensajes.map((m) => {
                  const t = infoTipo(m.tipo);
                  return (
                    <Table.Tr key={m._id} style={{ boxShadow: `inset 4px 0 var(--mantine-color-${t.color}-4)` }}>
                      <Table.Td><Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{formatFechaHora(m.createdAt)}</Text></Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color={t.color} tt="none" leftSection={<t.icon size={11} />}>{t.label}</Badge>
                      </Table.Td>
                      <Table.Td><Text size="sm" fw={600} lineClamp={1}>{m.asunto}</Text></Table.Td>
                      <Table.Td><Text size="xs">{m.enviado_por}</Text></Table.Td>
                      <Table.Td>
                        {m.estado === "enviado" ? (
                          <Badge size="sm" variant="light" color="teal" tt="none" leftSection={<IconCircleCheck size={11} />}>Enviado</Badge>
                        ) : (
                          <Tooltip label={m.error ?? "Error al enviar"} withArrow multiline w={260}>
                            <Badge size="sm" variant="light" color="red" tt="none" leftSection={<IconAlertTriangle size={11} />}>Error</Badge>
                          </Tooltip>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="Ver mensaje" withArrow>
                          <ActionIcon variant="light" color={t.color} aria-label="Ver mensaje" onClick={() => setDetalle(m)}>
                            <IconEye size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Paper>

      {/* Envío */}
      <Modal
        opened={tipoEnvio !== null}
        onClose={() => !enviando && setTipoEnvio(null)}
        title={tipoActual && (
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size="lg" radius="md" variant="light" color={tipoActual.color}><tipoActual.icon size={20} /></ThemeIcon>
            <Box>
              <Text fw={700} size="sm">{tipoActual.boton}</Text>
              <Text size="xs" c="dimmed">{tipoActual.descripcion}</Text>
            </Box>
          </Group>
        )}
        size="lg"
        radius="lg"
        centered
      >
        {tipoEnvio && tipoActual && (
          <Stack gap="sm">
            <Alert color="yellow" variant="light" radius="md" icon={<IconFlask size={16} />} py="xs">
              Modo prueba: este mensaje llegará solo a tu correo ({email}). Más adelante se enviará a {tipoActual.destino}.
            </Alert>
            <TextInput label="Asunto" value={asunto} onChange={(e) => setAsunto(e.currentTarget.value)} required />
            <Textarea label="Mensaje" value={cuerpo} onChange={(e) => setCuerpo(e.currentTarget.value)}
              autosize minRows={8} maxRows={18} required />
            {errorEnvio && <Alert color="red" variant="light" radius="md" icon={<IconAlertTriangle size={16} />}>{errorEnvio}</Alert>}
            <Group justify="space-between">
              <Button variant="subtle" size="xs" color="gray" leftSection={<IconRestore size={14} />}
                onClick={() => { setAsunto(tipoActual.asunto); setCuerpo(tipoActual.cuerpo); }}>
                Restaurar mensaje predeterminado
              </Button>
              <Group gap="xs">
                <Button variant="default" onClick={() => setTipoEnvio(null)} disabled={enviando}>Cancelar</Button>
                <Button color={tipoActual.color} leftSection={<IconSend size={16} />} onClick={enviar} loading={enviando}
                  disabled={!asunto.trim() || !cuerpo.trim()}>
                  Enviar
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Detalle */}
      <Modal
        opened={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle && (
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size="lg" radius="md" variant="light" color={infoTipo(detalle.tipo).color}><IconMail size={20} /></ThemeIcon>
            <Box>
              <Text fw={700} size="sm">{detalle.asunto}</Text>
              <Text size="xs" c="dimmed">{formatFechaHora(detalle.createdAt)} · Enviado por {detalle.enviado_por}</Text>
            </Box>
          </Group>
        )}
        size="lg"
        radius="lg"
        centered
      >
        {detalle && (
          <Stack gap="sm">
            <Group gap={6} wrap="wrap">
              <Badge variant="light" color={infoTipo(detalle.tipo).color} tt="none">{infoTipo(detalle.tipo).label}</Badge>
              {detalle.estado === "enviado"
                ? <Badge variant="light" color="teal" tt="none">Enviado</Badge>
                : <Badge variant="light" color="red" tt="none">Error</Badge>}
            </Group>
            <Text size="sm"><Text span c="dimmed">Destinatarios:</Text> {detalle.destinatarios.join(", ")}</Text>
            {detalle.error && (
              <Alert color="red" variant="light" radius="md" icon={<IconAlertTriangle size={16} />} title="No se pudo enviar">
                {detalle.error}
              </Alert>
            )}
            <Paper withBorder p="md" radius="md" style={{ backgroundColor: "var(--mantine-color-default-hover)" }}>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{detalle.cuerpo}</Text>
            </Paper>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
