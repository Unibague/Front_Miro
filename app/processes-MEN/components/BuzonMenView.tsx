"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSession } from "next-auth/react";
import {
  Stack, Group, Text, Button, Paper, Table, Badge, Modal, TextInput, Textarea,
  Alert, Loader, ScrollArea, ThemeIcon, Box, SimpleGrid, ActionIcon, Tooltip, MultiSelect,
} from "@mantine/core";
import {
  IconArrowRight, IconMail, IconSend, IconRefresh, IconSpeakerphone, IconShieldCheck, IconUsers, IconEye,
  IconCircleCheck, IconAlertTriangle, IconRestore, IconInbox, IconTemplate, IconEdit, IconDeviceFloppy,
  IconClock,
} from "@tabler/icons-react";

type TipoMensaje = "general" | "administradores" | "responsables";

type MensajeBuzon = {
  _id: string;
  tipo: TipoMensaje;
  asunto: string;
  cuerpo: string;
  destinatarios: string[];
  programas?: string[];
  sin_correo?: string[];
  modo_prueba?: boolean;
  automatico?: boolean;
  copia?: string[];
  enviado_por: string;
  estado: "enviado" | "error";
  error?: string | null;
  createdAt: string;
};

/** correo: el registrado en el organigrama; lideres: los de su dependencia vinculada. */
type UnidadLinea = { _id: string; nombre: string; tipo: string; correo: string; lideres: string[] };

const correosDe = (u: UnidadLinea) => [u.correo, ...(u.lideres ?? [])].filter(Boolean);

/** Proceso RC/AV en curso de un programa, con las fechas que van en el correo. */
type FilaProceso = {
  programa: string;
  tipo_proceso: "RC" | "AV";
  subtipo: string;
  fecha_vencimiento: string | null;
  fecha_inicio: string | null;
  fecha_documento_par: string | null;
  fecha_radicado_men: string | null;
};

/** Programa del organigrama con su línea de abajo hacia arriba: programa, área, escuela, facultad. */
type ProgramaLinea = UnidadLinea & { nivel: string | null; linea: UnidadLinea[]; procesos: FilaProceso[] };

type ClavePlantilla = "responsables" | "administradores";

type Plantilla = {
  asunto: string;
  cuerpo: string;
  personalizada: boolean;
  updatedAt?: string;
  actualizado_por?: string;
  variables: Record<string, string>;
  defecto: { asunto: string; cuerpo: string };
};

/** Mensajes predeterminados: el de responsables va a cada programa; el de administradores es el resumen con la radicación. */
const PLANTILLAS_INFO: Record<ClavePlantilla, { titulo: string; descripcion: string; color: string; icon: typeof IconMail }> = {
  responsables: {
    titulo: "Para responsables",
    descripcion: "Llega automáticamente el día de inicio a cada programa y su línea, con las fechas de su proceso.",
    color: "teal",
    icon: IconUsers,
  },
  administradores: {
    titulo: "Para administradores",
    descripcion: "Aviso automático al administrador 15 días antes de la fecha de inicio, con todas las fechas y la radicación.",
    color: "violet",
    icon: IconShieldCheck,
  },
};

type VistaPrevia = { titulo: string; asunto: string; html: string; programa: string | null };

type EstadoAviso = { fecha: string; estado: "pendiente" | "hoy" | "enviado" | "vencido"; enviado_en?: string };

/** Envíos automáticos de un proceso: aviso al administrador y recordatorio el día de inicio. */
type EnvioProgramado = {
  proceso_id: string;
  programa: string;
  tipo_proceso: "RC" | "AV";
  subtipo: string;
  fecha_inicio: string;
  aviso_admin: EstadoAviso;
  aviso_programa: EstadoAviso;
};

type Automatico = {
  /** administradores: miembros de los perfiles de rol Administrador dedicados al módulo MEN */
  config: { perfiles: string[]; administradores: { email: string; nombre: string; perfiles: string[] }[] };
  dias_aviso_admin: number;
  calendario: EnvioProgramado[];
};

const ESTADO_AVISO: Record<EstadoAviso["estado"], { label: string; color: string }> = {
  pendiente: { label: "Programado", color: "blue" },
  hoy: { label: "Se envía hoy", color: "orange" },
  enviado: { label: "Enviado", color: "teal" },
  vencido: { label: "Fecha pasada", color: "gray" },
};

const formatFecha = (ymd: string) => {
  const [y, m, d] = String(ymd).slice(0, 10).split("-");
  return y && m && d ? `${d}-${m}-${y}` : "—";
};

const facultadDe = (p: ProgramaLinea) => p.linea.find((u) => u.tipo === "Facultad")?.nombre ?? "Sin facultad";

/** Correos únicos de la línea de los programas y unidades de esa línea sin correo. */
const resolverLinea = (programas: ProgramaLinea[]) => {
  const correos = new Set<string>();
  const sinCorreo = new Map<string, string>();
  programas.forEach((p) => p.linea.forEach((u) => {
    const deUnidad = correosDe(u);
    deUnidad.forEach((c) => correos.add(c));
    if (!deUnidad.length) sinCorreo.set(u._id, `${u.nombre} (${u.tipo})`);
  }));
  return { correos: [...correos], sinCorreo: [...sinCorreo.values()] };
};

/** Cada tipo de envío con su mensaje predeterminado (se reemplazan por los prototipos definitivos). */
const TIPOS: Record<TipoMensaje, {
  label: string;
  boton: string;
  descripcion: string;
  color: string;
  icon: typeof IconMail;
  asunto: string;
  cuerpo: string;
}> = {
  general: {
    label: "General",
    boton: "Recordatorio general",
    descripcion: "Para todos los programas y su línea: área, escuela y facultad.",
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
    descripcion: "Aviso automático al administrador antes de la fecha de inicio.",
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
    descripcion: "Elige los programas; cada uno recibe las fechas de su proceso.",
    color: "teal",
    icon: IconUsers,
    asunto: "Aviso para responsables – Procesos de calidad MEN",
    cuerpo: `Cordial saludo,

Le recordamos revisar el estado de los procesos de calidad MEN de su programa y cargar oportunamente la información y los documentos pendientes.

Agradecemos su atención.

Sistema Miró – Universidad de Ibagué`,
  },
};

/** Tipos que se pueden enviar hoy; "administradores" queda solo para mostrar mensajes antiguos del historial. */
const TIPOS_ENVIO: TipoMensaje[] = ["general", "responsables"];

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

/** Ayuda con las variables {{...}} que admite un mensaje predeterminado. */
function VariablesPlantilla({ variables }: { variables: Record<string, string> }) {
  return (
    <Paper radius="md" p="xs" style={{ backgroundColor: "var(--mantine-color-default-hover)" }}>
      <Text size="xs" fw={600} mb={4}>Variables disponibles</Text>
      <Stack gap={2}>
        {Object.entries(variables).map(([variable, descripcion]) => (
          <Text key={variable} size="xs">
            <Text span ff="monospace" fw={600}>{variable}</Text> <Text span c="dimmed">— {descripcion}</Text>
          </Text>
        ))}
      </Stack>
    </Paper>
  );
}

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

  const [programas, setProgramas] = useState<ProgramaLinea[]>([]);
  const [programasElegidos, setProgramasElegidos] = useState<string[]>([]);

  const cargarProgramas = async () => {
    if (!email) return;
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/men-mailbox/programas`, { params: { email } });
      setProgramas(Array.isArray(res.data?.programas) ? res.data.programas : []);
    } catch {
      setProgramas([]);
    }
  };

  useEffect(() => { cargarProgramas(); }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const opcionesProgramas = useMemo(() => {
    const grupos = new Map<string, { value: string; label: string }[]>();
    programas.forEach((p) => {
      const facultad = facultadDe(p);
      if (!grupos.has(facultad)) grupos.set(facultad, []);
      grupos.get(facultad)!.push({ value: p._id, label: p.nivel ? `${p.nombre} · ${p.nivel}` : p.nombre });
    });
    return [...grupos.entries()].map(([group, items]) => ({ group, items }));
  }, [programas]);

  // Programas a los que va el mensaje abierto: todos en el general, los elegidos en responsables
  const programasDestino = useMemo(() => {
    if (tipoEnvio === "general") return programas;
    if (tipoEnvio === "responsables") return programas.filter((p) => programasElegidos.includes(p._id));
    return [];
  }, [tipoEnvio, programas, programasElegidos]);

  const lineaDestino = useMemo(() => resolverLinea(tipoEnvio === "responsables"
    ? programasDestino.filter((p) => p.procesos?.length)
    : programasDestino), [tipoEnvio, programasDestino]);

  // Responsables: solo se notifica a los programas con un proceso RC/AV en curso
  const sinProceso = useMemo(
    () => (tipoEnvio === "responsables" ? programasDestino.filter((p) => !p.procesos?.length) : []),
    [tipoEnvio, programasDestino],
  );

  /* ── Mensajes predeterminados ── */
  const [plantillas, setPlantillas] = useState<Record<ClavePlantilla, Plantilla> | null>(null);
  const [editando, setEditando] = useState<{ clave: ClavePlantilla; asunto: string; cuerpo: string } | null>(null);
  const [guardandoPlantilla, setGuardandoPlantilla] = useState(false);
  const [errorPlantilla, setErrorPlantilla] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [cargandoVista, setCargandoVista] = useState<string | null>(null);

  const cargarPlantillas = async () => {
    if (!email) return;
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/men-mailbox/plantillas`, { params: { email } });
      setPlantillas(res.data);
    } catch {
      setPlantillas(null);
    }
  };

  useEffect(() => { cargarPlantillas(); }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Vista previa con datos reales; sin asunto/cuerpo usa la plantilla guardada. */
  const verPlantilla = async (
    clave: ClavePlantilla,
    origen: string,
    datos: { asunto?: string; cuerpo?: string; programas?: string[] } = {},
  ) => {
    setCargandoVista(origen);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/men-mailbox/vista-previa`, { email, clave, ...datos });
      setVista({ titulo: PLANTILLAS_INFO[clave].titulo, ...res.data });
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.error ?? e.message : "No se pudo armar la vista previa";
      if (origen === "editar") setErrorPlantilla(msg);
      else if (origen === "envio") setErrorEnvio(msg);
      else setErrorCarga(msg);
    } finally {
      setCargandoVista(null);
    }
  };

  const guardarPlantilla = async () => {
    if (!editando) return;
    setGuardandoPlantilla(true);
    setErrorPlantilla(null);
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/men-mailbox/plantillas/${editando.clave}`, {
        email, asunto: editando.asunto, cuerpo: editando.cuerpo,
      });
      await cargarPlantillas();
      setOkEnvio(`Mensaje predeterminado «${PLANTILLAS_INFO[editando.clave].titulo}» guardado.`);
      setEditando(null);
    } catch (e) {
      setErrorPlantilla(axios.isAxiosError(e) ? e.response?.data?.error ?? e.message : "No se pudo guardar");
    } finally {
      setGuardandoPlantilla(false);
    }
  };

  /* ── Envío automático ── */
  const [automatico, setAutomatico] = useState<Automatico | null>(null);
  const [verAnteriores, setVerAnteriores] = useState(false);

  const cargarAutomatico = async () => {
    if (!email) return;
    try {
      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/men-mailbox/automatico`, { params: { email } });
      setAutomatico(res.data);
    } catch {
      setAutomatico(null);
    }
  };

  useEffect(() => { cargarAutomatico(); }, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const calendarioVisible = useMemo(() => {
    const lista = automatico?.calendario ?? [];
    return verAnteriores
      ? lista
      : lista.filter((c) => c.aviso_admin.estado !== "vencido" || c.aviso_programa.estado !== "vencido");
  }, [automatico, verAnteriores]);
  const totalAnteriores = (automatico?.calendario.length ?? 0) - (automatico?.calendario ?? [])
    .filter((c) => c.aviso_admin.estado !== "vencido" || c.aviso_programa.estado !== "vencido").length;

  /** Texto con que se abre el envío: el de responsables sale del mensaje predeterminado guardado. */
  const textoInicial = (tipo: TipoMensaje) =>
    tipo === "responsables" && plantillas
      ? { asunto: plantillas.responsables.asunto, cuerpo: plantillas.responsables.cuerpo }
      : { asunto: TIPOS[tipo].asunto, cuerpo: TIPOS[tipo].cuerpo };

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
    setAsunto(textoInicial(tipo).asunto);
    setCuerpo(textoInicial(tipo).cuerpo);
    setProgramasElegidos([]);
    setErrorEnvio(null);
  };

  const enviar = async () => {
    if (!tipoEnvio) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/men-mailbox/enviar`, {
        adminEmail: email,
        tipo: tipoEnvio,
        asunto,
        cuerpo,
        programas: tipoEnvio === "responsables" ? programasElegidos : undefined,
      });
      const total = res.data?.destinatarios?.length ?? lineaDestino.correos.length;
      const porPrograma = tipoEnvio === "responsables"
        ? ` Se armaron ${res.data?.correos_enviados ?? 0} correo(s), uno por proceso.`
        : "";
      setOkEnvio(`Mensaje «${TIPOS[tipoEnvio].label}» enviado a ${total} correo(s) de los programas y su línea, con copia a los administradores del MEN.${porPrograma}`);
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

      {/* Tipos de envío */}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {TIPOS_ENVIO.map((tipo) => {
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

      {/* Envío automático */}
      <Paper withBorder radius="lg" p="md">
        <Group gap="sm" wrap="nowrap" align="flex-start" mb="sm">
          <ThemeIcon size={32} radius="xl" variant="light" color="orange"><IconClock size={17} /></ThemeIcon>
          <Box>
            <Text fw={700}>Envío automático</Text>
            <Text size="xs" c="dimmed">
              Todos los días a las 7:00 a. m.: {automatico?.dias_aviso_admin ?? 15} días antes de la fecha de inicio de cada proceso le llega
              el aviso al administrador, y el día de inicio, el programa y su línea reciben sus fechas.
            </Text>
          </Box>
        </Group>

        <Box>
          <Text size="sm" fw={600}>Administradores del módulo MEN</Text>
          <Text size="xs" c="dimmed" mb={6}>
            Según el perfil{automatico?.config.perfiles.length ? ` «${automatico.config.perfiles.join("», «")}»` : ""}: reciben el aviso 15 días antes
            y copia de todo lo que se envía a los programas. Los administradores de otros perfiles no lo reciben.
          </Text>
          <Group gap={6}>
            {automatico?.config.administradores.map((a) => (
              <Tooltip key={a.email} label={a.email} withArrow>
                <Badge variant="light" color="violet" tt="none" leftSection={<IconShieldCheck size={11} />}>{a.nombre || a.email}</Badge>
              </Tooltip>
            ))}
          </Group>
        </Box>

        {automatico && automatico.config.administradores.length === 0 && (
          <Alert color="orange" variant="light" radius="md" mt="sm" py="xs" icon={<IconAlertTriangle size={16} />}>
            No hay administradores en un perfil del módulo MEN. Asígnalos en Configuración → Gestionar perfiles: sin ellos no se envían los avisos ni las copias.
          </Alert>
        )}

        <Group justify="space-between" mt="md" mb={6}>
          <Text size="sm" fw={600}>Calendario de envíos</Text>
          {totalAnteriores > 0 && (
            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setVerAnteriores((v) => !v)}>
              {verAnteriores ? "Ocultar procesos con fechas pasadas" : `Ver procesos con fechas pasadas (${totalAnteriores})`}
            </Button>
          )}
        </Group>
        {calendarioVisible.length === 0 ? (
          <Text size="xs" c="dimmed">
            No hay procesos RC o AV con fecha de inicio próxima. Cuando un proceso tenga fecha de inicio futura, aparecerá aquí.
          </Text>
        ) : (
          <ScrollArea type="auto">
            <Table verticalSpacing={6} horizontalSpacing="sm" style={{ minWidth: 680 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={TH_STYLE}>Programa</Table.Th>
                  <Table.Th style={TH_STYLE}>Proceso</Table.Th>
                  <Table.Th style={TH_STYLE}>Inicio</Table.Th>
                  <Table.Th style={TH_STYLE}>Aviso al administrador</Table.Th>
                  <Table.Th style={TH_STYLE}>Recordatorio a programas</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {calendarioVisible.map((c) => (
                  <Table.Tr key={c.proceso_id}>
                    <Table.Td><Text size="sm" fw={600}>{c.programa}</Text></Table.Td>
                    <Table.Td>
                      <Badge size="sm" variant="light" color={c.tipo_proceso === "AV" ? "violet" : "blue"} tt="none">
                        {c.tipo_proceso}{c.subtipo ? ` · ${c.subtipo}` : ""}
                      </Badge>
                    </Table.Td>
                    <Table.Td><Text size="sm">{formatFecha(c.fecha_inicio)}</Text></Table.Td>
                    {[c.aviso_admin, c.aviso_programa].map((a, i) => (
                      <Table.Td key={i}>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm">{formatFecha(a.fecha)}</Text>
                          <Badge size="xs" variant="light" color={ESTADO_AVISO[a.estado].color} tt="none">{ESTADO_AVISO[a.estado].label}</Badge>
                        </Group>
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Paper>

      {/* Mensajes predeterminados */}
      <Paper withBorder radius="lg" p="md">
        <Group gap="sm" mb="sm" wrap="nowrap">
          <ThemeIcon size={32} radius="xl" variant="light" color="gray"><IconTemplate size={17} /></ThemeIcon>
          <Box>
            <Text fw={700}>Mensajes predeterminados</Text>
            <Text size="xs" c="dimmed">
              Las fechas se toman del proceso RC o AV de cada programa. La radicación solo aparece en el mensaje para administradores.
            </Text>
          </Box>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {(Object.keys(PLANTILLAS_INFO) as ClavePlantilla[]).map((clave) => {
            const info = PLANTILLAS_INFO[clave];
            const p = plantillas?.[clave];
            return (
              <Paper key={clave} withBorder radius="md" p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${info.color}-5)` }}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <ThemeIcon size={36} radius="xl" variant="light" color={info.color} style={{ flexShrink: 0 }}>
                    <info.icon size={18} />
                  </ThemeIcon>
                  <Box style={{ minWidth: 0, flex: 1 }}>
                    <Group gap={6}>
                      <Text fw={700} size="sm">{info.titulo}</Text>
                      {p && (
                        <Badge size="xs" variant="light" color={p.personalizada ? info.color : "gray"} tt="none">
                          {p.personalizada ? "Editado" : "Original"}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">{info.descripcion}</Text>
                    {p && <Text size="xs" mt={4} lineClamp={1}><Text span c="dimmed">Asunto:</Text> {p.asunto}</Text>}
                    {p?.personalizada && p.updatedAt && (
                      <Text size="xs" c="dimmed">Editado {formatFechaHora(p.updatedAt)}{p.actualizado_por ? ` por ${p.actualizado_por}` : ""}</Text>
                    )}
                  </Box>
                </Group>
                <Group gap="xs" mt="sm" justify="flex-end">
                  <Button size="xs" variant="light" color={info.color} leftSection={<IconEye size={14} />}
                    loading={cargandoVista === `ver-${clave}`} disabled={!p}
                    onClick={() => verPlantilla(clave, `ver-${clave}`)}>
                    Ver
                  </Button>
                  <Button size="xs" color={info.color} leftSection={<IconEdit size={14} />} disabled={!p}
                    onClick={() => { setErrorPlantilla(null); if (p) setEditando({ clave, asunto: p.asunto, cuerpo: p.cuerpo }); }}>
                    Editar
                  </Button>
                </Group>
              </Paper>
            );
          })}
        </SimpleGrid>
      </Paper>

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
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          {m.automatico && <Badge size="xs" variant="light" color="gray" tt="none" leftSection={<IconClock size={10} />}>Auto</Badge>}
                          <Text size="xs">{m.enviado_por}</Text>
                        </Group>
                      </Table.Td>
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
            {tipoEnvio === "responsables" && (
              <MultiSelect
                label="Programas"
                description="Se envía al programa y a su línea: área, escuela y facultad"
                placeholder={programasElegidos.length ? "" : "Buscar programa..."}
                data={opcionesProgramas}
                value={programasElegidos}
                onChange={setProgramasElegidos}
                searchable
                clearable
                hidePickedOptions
                maxDropdownHeight={280}
                nothingFoundMessage="No hay programas con ese nombre"
                required
              />
            )}
            <Paper withBorder radius="md" p="sm">
                <Group justify="space-between" mb={programasDestino.length ? "xs" : 0}>
                  <Text size="sm" fw={600}>Destinatarios</Text>
                  <Group gap={6}>
                    <Badge variant="light" tt="none">{programasDestino.length} programa(s)</Badge>
                    <Badge variant="light" color="teal" tt="none">{lineaDestino.correos.length} correo(s)</Badge>
                  </Group>
                </Group>
                {programasDestino.length === 0 ? (
                  <Text size="xs" c="dimmed">
                    {tipoEnvio === "responsables" ? "Elige al menos un programa." : "No hay programas en el organigrama."}
                  </Text>
                ) : (
                  <ScrollArea.Autosize mah={220} type="auto">
                    <Stack gap={8}>
                      {programasDestino.map((p) => (
                        <Box key={p._id}>
                          <Group gap={4} wrap="wrap">
                            {p.linea.map((u, i) => (
                              <Group key={u._id} gap={4} wrap="nowrap">
                                {i > 0 && <IconArrowRight size={12} color="var(--mantine-color-dimmed)" />}
                                <Tooltip withArrow multiline label={correosDe(u).length ? (
                                  <>
                                    {u.correo && <div>Organigrama: {u.correo}</div>}
                                    {u.lideres?.length > 0 && <div>Líder(es): {u.lideres.join(", ")}</div>}
                                  </>
                                ) : "Sin correo ni líder"}>
                                  <Badge size="sm" tt="none" variant={correosDe(u).length ? "light" : "outline"} color={correosDe(u).length ? "blue" : "gray"}>
                                    {u.nombre}
                                  </Badge>
                                </Tooltip>
                              </Group>
                            ))}
                          </Group>
                          {tipoEnvio === "responsables" && (
                            <Text size="xs" mt={2} c={p.procesos?.length ? "dimmed" : "orange"}>
                              {p.procesos?.length
                                ? p.procesos.map((f) => `${f.tipo_proceso}${f.subtipo ? ` ${f.subtipo}` : ""} · vence ${f.fecha_vencimiento ?? "sin fecha"}`).join("  |  ")
                                : "Sin proceso RC o AV en curso: no se le enviará"}
                            </Text>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </ScrollArea.Autosize>
                )}
                {!!automatico?.config.administradores.length && (
                  <Text size="xs" c="dimmed" mt="xs">
                    Con copia a los administradores del MEN: {automatico.config.administradores.map((a) => a.email).join(", ")}
                  </Text>
                )}
                {lineaDestino.sinCorreo.length > 0 && (
                  <Alert color="orange" variant="light" radius="md" mt="xs" py="xs" icon={<IconAlertTriangle size={16} />}>
                    {lineaDestino.sinCorreo.length} unidad(es) no tienen correo ni líder y no recibirán el mensaje. Registra el correo en Configuración → Organigrama o vincula la dependencia.
                  </Alert>
                )}
              </Paper>
            {tipoEnvio === "responsables" && sinProceso.length > 0 && (
              <Alert color="orange" variant="light" radius="md" py="xs" icon={<IconAlertTriangle size={16} />}>
                {sinProceso.length} programa(s) no tienen un proceso RC o AV en curso y no recibirán el mensaje.
              </Alert>
            )}
            <TextInput label="Asunto" value={asunto} onChange={(e) => setAsunto(e.currentTarget.value)} required />
            <Textarea label="Mensaje" value={cuerpo} onChange={(e) => setCuerpo(e.currentTarget.value)}
              autosize minRows={8} maxRows={18} required
              description={tipoEnvio === "responsables"
                ? "Cada programa recibe este texto con sus propias fechas en {{tabla}}."
                : undefined} />
            {tipoEnvio === "responsables" && plantillas && <VariablesPlantilla variables={plantillas.responsables.variables} />}
            {errorEnvio && <Alert color="red" variant="light" radius="md" icon={<IconAlertTriangle size={16} />}>{errorEnvio}</Alert>}
            <Group justify="space-between">
              <Group gap="xs">
                <Button variant="subtle" size="xs" color="gray" leftSection={<IconRestore size={14} />}
                  onClick={() => { setAsunto(textoInicial(tipoEnvio).asunto); setCuerpo(textoInicial(tipoEnvio).cuerpo); }}>
                  Restaurar mensaje predeterminado
                </Button>
                {tipoEnvio === "responsables" && (
                  <Button variant="subtle" size="xs" color="teal" leftSection={<IconEye size={14} />}
                    loading={cargandoVista === "envio"} disabled={lineaDestino.correos.length === 0}
                    onClick={() => verPlantilla("responsables", "envio", { asunto, cuerpo, programas: programasElegidos })}>
                    Vista previa
                  </Button>
                )}
              </Group>
              <Group gap="xs">
                <Button variant="default" onClick={() => setTipoEnvio(null)} disabled={enviando}>Cancelar</Button>
                <Button color={tipoActual.color} leftSection={<IconSend size={16} />} onClick={enviar} loading={enviando}
                  disabled={!asunto.trim() || !cuerpo.trim()
                    || lineaDestino.correos.length === 0}>
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
              {detalle.modo_prueba && <Badge variant="light" color="yellow" tt="none">Modo prueba</Badge>}
            </Group>
            {!!detalle.programas?.length && (
              <Text size="sm"><Text span c="dimmed">Programas ({detalle.programas.length}):</Text> {detalle.programas.join(", ")}</Text>
            )}
            <Text size="sm">
              <Text span c="dimmed">{detalle.modo_prueba ? "Destinatarios (habrían recibido):" : "Destinatarios:"}</Text> {detalle.destinatarios.join(", ")}
            </Text>
            {!!detalle.copia?.length && (
              <Text size="sm"><Text span c="dimmed">Copia a administradores del MEN:</Text> {detalle.copia.join(", ")}</Text>
            )}
            {!!detalle.sin_correo?.length && (
              <Text size="sm"><Text span c="orange">Sin correo, no recibieron:</Text> {detalle.sin_correo.join(", ")}</Text>
            )}
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

      {/* Editar mensaje predeterminado */}
      <Modal
        opened={!!editando}
        onClose={() => !guardandoPlantilla && setEditando(null)}
        title={editando && (
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size="lg" radius="md" variant="light" color={PLANTILLAS_INFO[editando.clave].color}><IconEdit size={20} /></ThemeIcon>
            <Box>
              <Text fw={700} size="sm">Mensaje predeterminado · {PLANTILLAS_INFO[editando.clave].titulo}</Text>
              <Text size="xs" c="dimmed">{PLANTILLAS_INFO[editando.clave].descripcion}</Text>
            </Box>
          </Group>
        )}
        size="lg"
        radius="lg"
        centered
      >
        {editando && plantillas && (
          <Stack gap="sm">
            <TextInput label="Asunto" required value={editando.asunto}
              onChange={(e) => setEditando({ ...editando, asunto: e.currentTarget.value })} />
            <Textarea label="Mensaje" required autosize minRows={10} maxRows={20} value={editando.cuerpo}
              description="Escribe {{tabla}} donde deben ir las fechas del proceso."
              onChange={(e) => setEditando({ ...editando, cuerpo: e.currentTarget.value })} />
            <VariablesPlantilla variables={plantillas[editando.clave].variables} />
            {errorPlantilla && <Alert color="red" variant="light" radius="md" icon={<IconAlertTriangle size={16} />}>{errorPlantilla}</Alert>}
            <Group justify="space-between">
              <Group gap="xs">
                <Button variant="subtle" size="xs" color="gray" leftSection={<IconRestore size={14} />}
                  onClick={() => setEditando({ ...editando, ...plantillas[editando.clave].defecto })}>
                  Restaurar texto original
                </Button>
                <Button variant="subtle" size="xs" color={PLANTILLAS_INFO[editando.clave].color} leftSection={<IconEye size={14} />}
                  loading={cargandoVista === "editar"}
                  onClick={() => verPlantilla(editando.clave, "editar", { asunto: editando.asunto, cuerpo: editando.cuerpo })}>
                  Vista previa
                </Button>
              </Group>
              <Group gap="xs">
                <Button variant="default" onClick={() => setEditando(null)} disabled={guardandoPlantilla}>Cancelar</Button>
                <Button color={PLANTILLAS_INFO[editando.clave].color} leftSection={<IconDeviceFloppy size={16} />}
                  loading={guardandoPlantilla} onClick={guardarPlantilla}
                  disabled={!editando.asunto.trim() || !editando.cuerpo.trim()}>
                  Guardar
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Vista previa con datos reales (por encima de las demás ventanas) */}
      <Modal
        opened={!!vista}
        onClose={() => setVista(null)}
        zIndex={400}
        title={vista && (
          <Box>
            <Text fw={700} size="sm">Vista previa · {vista.titulo}</Text>
            <Text size="xs" c="dimmed">
              {vista.programa
                ? `Así le llegará a ${vista.programa}, con sus fechas`
                : "Lo que va entre [corchetes] se llena con los datos de cada programa al enviar"}
            </Text>
          </Box>
        )}
        size="xl"
        radius="lg"
        centered
      >
        {vista && (
          <Stack gap="sm">
            <Text size="sm"><Text span c="dimmed">Asunto:</Text> <b>{vista.asunto}</b></Text>
            <Paper withBorder radius="md" p="md" bg="white" style={{ color: "#212529", overflowX: "auto" }}>
              {/* HTML armado en el servidor: el texto de la plantilla llega escapado */}
              <div dangerouslySetInnerHTML={{ __html: vista.html }} />
            </Paper>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
