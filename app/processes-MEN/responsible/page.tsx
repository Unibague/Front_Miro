"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Title, Text, Paper, Box, Stack, Group, Loader, Badge, Anchor,
  Select, Collapse, Divider, ThemeIcon, Container, Textarea, Button,
  ActionIcon, Tooltip,
} from "@mantine/core";
import {
  IconChevronDown, IconChevronRight, IconCircleCheck,
  IconCircle, IconAlertCircle, IconBan, IconClipboardList,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import axios from "axios";
import { useRole } from "@/app/context/RoleContext";
import type { Dependency, Program, Process, Phase } from "../types";
import { LABEL_PROCESO, faseColors, COLOR_PROCESO, ROW_BG_PROCESO } from "../constants";
import { formatFechaDDMMYY } from "../utils/formatFechaCorta";
import { procesoRcActivoDePrograma } from "../utils/procesoRcUnico";
import { programCodeKey } from "../utils/programCode";
import { processesMenRoutes } from "../config/routes";

type Task = {
  _id: string;
  titulo: string;
  descripcion: string;
  dep_code: string;
  nombre_dependencia: string;
  email_responsable: string | null;
  fecha_limite: string | null;
  completada: boolean;
  fecha_completada: string | null;
  observacion_respuesta: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctFase(fases: Phase[]): number {
  if (!fases.length) return 0;
  const total = fases.reduce((s, f) => s + (f.actividades?.length ?? 0), 0);
  const done = fases.reduce(
    (s, f) => s + (f.actividades?.filter((a) => a.completada || a.no_aplica).length ?? 0),
    0,
  );
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function nombreFaseActual(proc: Process, fases: Phase[]): string {
  const fc = faseColors.find((x) => x.fase === proc.fase_actual);
  if (fc) return fc.fullName;
  const f = fases.find((f) => f.numero === proc.fase_actual);
  return f?.nombre ?? `Fase ${proc.fase_actual}`;
}

// ── Fila de actividad ─────────────────────────────────────────────────────────

function ActividadRow({ act }: { act: Phase["actividades"][number] }) {
  const lista = act.completada || act.no_aplica;
  return (
    <Group gap="xs" align="flex-start" wrap="nowrap">
      <ThemeIcon
        size={18}
        radius="xl"
        color={act.no_aplica ? "orange" : act.completada ? "green" : "gray"}
        variant="light"
        style={{ flexShrink: 0, marginTop: 2 }}
      >
        {act.no_aplica ? (
          <IconBan size={11} />
        ) : act.completada ? (
          <IconCircleCheck size={11} />
        ) : (
          <IconCircle size={11} />
        )}
      </ThemeIcon>
      <Box style={{ minWidth: 0 }}>
        <Text
          size="xs"
          fw={500}
          td={lista ? "line-through" : undefined}
          c={act.no_aplica ? "orange" : act.completada ? "dimmed" : undefined}
          style={{ wordBreak: "break-word" }}
        >
          {act.nombre}
          {act.no_aplica && (
            <Badge size="xs" color="orange" variant="light" ml={6}>No aplica</Badge>
          )}
        </Text>
        {act.responsables && <Text size="xs" c="dimmed">{act.responsables}</Text>}
        {act.fecha_completado && !act.no_aplica && (
          <Text size="xs" c="teal">✓ {formatFechaDDMMYY(act.fecha_completado)}</Text>
        )}
        {act.observaciones && (
          <Text size="xs" c="dimmed" fs="italic">{act.observaciones}</Text>
        )}
      </Box>
    </Group>
  );
}

// ── Fila de fase ──────────────────────────────────────────────────────────────

function FaseRow({ fase, faseActual }: { fase: Phase; faseActual: number }) {
  const [open, setOpen] = useState(fase.numero === faseActual);
  const completadas = fase.actividades?.filter((a) => a.completada || a.no_aplica).length ?? 0;
  const total = fase.actividades?.length ?? 0;
  const esActual = fase.numero === faseActual;

  return (
    <Paper withBorder radius="sm" style={{ overflow: "hidden" }}>
      <Box
        px="sm"
        py={8}
        style={{
          cursor: "pointer",
          backgroundColor: esActual ? "var(--mantine-color-blue-light)" : "#f8f9fa",
          borderBottom: open ? "1px solid #dee2e6" : "none",
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Group justify="space-between">
          <Group gap="xs">
            <Text size="xs" fw={700}>
              {open ? "▾" : "▸"} Fase {fase.numero} — {fase.nombre}
            </Text>
            {esActual && <Badge size="xs" color="blue" variant="filled">En curso</Badge>}
          </Group>
          <Badge
            size="xs"
            color={completadas === total && total > 0 ? "green" : "orange"}
            variant="light"
          >
            {completadas}/{total} actividades
          </Badge>
        </Group>
      </Box>
      <Collapse in={open}>
        <Box px="sm" pt="xs" pb="sm">
          {(fase.actividades ?? []).length === 0 ? (
            <Text size="xs" c="dimmed">Sin actividades.</Text>
          ) : (
            <Stack gap={4}>
              {(fase.actividades ?? []).map((act, i) => (
                <ActividadRow key={i} act={act} />
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── Tarjeta de proceso ────────────────────────────────────────────────────────

function ProcesoCard({ proc, fases }: { proc: Process; fases: Phase[] }) {
  const [open, setOpen] = useState(false);
  const color = COLOR_PROCESO[proc.tipo_proceso] ?? "#868e96";
  const bg = ROW_BG_PROCESO[proc.tipo_proceso] ?? "#fafbff";
  const pct = pctFase(fases);
  const nombreFase = nombreFaseActual(proc, fases);
  const badgeColor =
    proc.tipo_proceso === "RC" ? "blue"
    : proc.tipo_proceso === "AV" ? "violet"
    : proc.tipo_proceso === "PM" ? "grape"
    : "teal";

  return (
    <Paper
      withBorder
      radius="md"
      mb="sm"
      style={{ borderLeft: `5px solid ${color}`, background: bg, overflow: "hidden" }}
    >
      <Box px="md" py="sm" style={{ cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
            <Badge size="sm" variant="filled" color={badgeColor}>{proc.tipo_proceso}</Badge>
            <Text
              size="sm"
              fw={600}
              style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {LABEL_PROCESO[proc.tipo_proceso]}
              {proc.subtipo ? ` — ${proc.subtipo}` : ""}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Text size="xs" c="dimmed">{pct}% completado</Text>
            <Text size="xs" c="dimmed">Vence: {formatFechaDDMMYY(proc.fecha_vencimiento)}</Text>
          </Group>
        </Group>
        <Text size="xs" c="dimmed" mt={4} pl={24}>{nombreFase}</Text>
      </Box>

      <Collapse in={open}>
        <Divider />
        <Box px="md" py="sm">
          {fases.length === 0 ? (
            <Text size="xs" c="dimmed">Sin fases registradas.</Text>
          ) : (
            <Stack gap="xs">
              {fases.map((fase) => (
                <FaseRow key={fase._id} fase={fase} faseActual={proc.fase_actual} />
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ProcessesMenResponsiblePage() {
  const { data: session } = useSession();
  const { userRole } = useRole();

  const [facultades, setFacultades] = useState<Dependency[]>([]);
  const [allDeps, setAllDeps] = useState<Dependency[]>([]);
  const [programas, setProgramas] = useState<Program[]>([]);
  const [procesos, setProcesos] = useState<Process[]>([]);
  const [fases, setFases] = useState<Phase[]>([]);
  const [userDeps, setUserDeps] = useState<Dependency[]>([]);

  const [filtroFacultad, setFiltroFacultad] = useState<string>("Todos");
  const [filtroPrograma, setFiltroPrograma] = useState<string>("Todos");

  const [loading, setLoading] = useState(true);
  const [loadingFases, setLoadingFases] = useState(false);

  // Tareas asignadas al usuario
  const [tasks, setTasks] = useState<Task[]>([]);
  const [savingTask, setSavingTask] = useState<string | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});

  const email = session?.user?.email ?? "";

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!email) return;
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";

    const run = async () => {
      setLoading(true);
      try {
        const [depsRes, progsRes, procsRes] = await Promise.all([
          axios.get(`${base}/dependencies/all`, { params: { limit: 1000 } }),
          axios.get(`${base}/programs`),
          axios.get(`${base}/processes`),
        ]);

        const allDeps: Dependency[] = Array.isArray(depsRes.data)
          ? depsRes.data
          : (depsRes.data?.dependencies ?? []);

        // Dependencias donde el usuario es miembro o visualizador
        const myDeps = allDeps.filter(
          (d) =>
            (Array.isArray((d as any).members) && (d as any).members.includes(email)) ||
            (Array.isArray((d as any).visualizers) && (d as any).visualizers.includes(email)),
        );
        setUserDeps(myDeps);

        const facs = allDeps.filter((d) => d.name.toUpperCase().includes("FACULTAD"));
        setAllDeps(allDeps);
        setFacultades(facs);

        const progs: Program[] = Array.isArray(progsRes.data) ? progsRes.data : [];
        setProgramas(progs);

        const procs: Process[] = Array.isArray(procsRes.data) ? procsRes.data : [];
        setProcesos(procs.filter((p) => p.tipo_proceso !== "ALERTA"));

        // Cargar tareas asignadas a las dependencias del usuario
        const depCodes = myDeps.map((d) => d.dep_code);
        const tareasRes = await Promise.all(
          depCodes.map((dc) =>
            axios.get(`${base}/task-assignments`, { params: { dep_code: dc } })
              .then((r) => (Array.isArray(r.data) ? r.data : []) as Task[])
              .catch(() => [] as Task[])
          )
        );
        const todasTareas = tareasRes.flat();
        // Deduplicar por _id
        const uniqueTareas = Array.from(new Map(todasTareas.map((t) => [t._id, t])).values());
        setTasks(uniqueTareas);

        // Subir la jerarquía desde la dependencia del usuario hasta encontrar una FACULTAD
        const depMap = new Map(allDeps.map((d) => [d.dep_code, d]));
        const facCodesDelUsuario = new Set<string>();

        for (const myDep of myDeps) {
          let current: Dependency | undefined = myDep;
          while (current) {
            if (current.name.toUpperCase().includes("FACULTAD")) {
              facCodesDelUsuario.add(current.dep_code);
              break;
            }
            current = current.dep_father ? depMap.get(current.dep_father) : undefined;
          }
        }

        // Pre-seleccionar facultad si el usuario pertenece a una sola
        if (facCodesDelUsuario.size === 1) {
          const facCode = [...facCodesDelUsuario][0];
          const fac = facs.find((f) => f.dep_code === facCode);
          if (fac) setFiltroFacultad(fac.name);
        }
      } catch (e) {
        console.error("Error cargando procesos MEN responsable:", e);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [email]);

  // ── Programas filtrados ────────────────────────────────────────────────────
  const programasFiltrados = useMemo(() => {
    let list = programas;

    if (filtroFacultad !== "Todos") {
      const fac = facultades.find((f) => f.name === filtroFacultad);
      if (fac) list = list.filter((p) => p.dep_code_facultad === fac.dep_code);
    } else if (userDeps.length > 0) {
      // Subir la jerarquía dep_father hasta encontrar una FACULTAD
      const allDepsMap = new Map<string, Dependency>(
        allDeps.map((d) => [d.dep_code, d]),
      );
      const myFacCodes = new Set<string>();
      for (const myDep of userDeps) {
        let current: Dependency | undefined = myDep;
        let depth = 0;
        while (current && depth < 10) {
          if (current.name.toUpperCase().includes("FACULTAD")) {
            myFacCodes.add(current.dep_code);
            break;
          }
          current = current.dep_father ? allDepsMap.get(current.dep_father) : undefined;
          depth++;
        }
      }
      if (myFacCodes.size > 0) list = list.filter((p) => myFacCodes.has(p.dep_code_facultad));
    }

    if (filtroPrograma !== "Todos") {
      list = list.filter((p) => p.nombre === filtroPrograma);
    }

    return list;
  }, [programas, facultades, allDeps, userDeps, filtroFacultad, filtroPrograma]);

  // ── Cargar fases cuando cambia la selección ────────────────────────────────
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";
    const codes = new Set(programasFiltrados.map((p) => programCodeKey(p)));
    const ids = procesos.filter((p) => codes.has(p.program_code)).map((p) => p._id);

    if (ids.length === 0) { setFases([]); return; }

    let cancelled = false;
    setLoadingFases(true);

    const CHUNK = 80;
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

    Promise.all(
      chunks.map((batch) =>
        axios
          .get(`${base}/phases`, { params: { proceso_ids: batch.join(",") } })
          .then((r) => (Array.isArray(r.data) ? r.data : []) as Phase[])
          .catch(() => [] as Phase[]),
      ),
    )
      .then((results) => { if (!cancelled) setFases(results.flat()); })
      .finally(() => { if (!cancelled) setLoadingFases(false); });

    return () => { cancelled = true; };
  }, [programasFiltrados, procesos]);

  // ── Opciones de selects ────────────────────────────────────────────────────
  const opcionesFacultad = useMemo(
    () => ["Todos", ...facultades.map((f) => f.name).sort((a, b) => a.localeCompare(b, "es"))],
    [facultades],
  );

  const opcionesPrograma = useMemo(() => {
    const base =
      filtroFacultad !== "Todos"
        ? programas.filter((p) => {
            const fac = facultades.find((f) => f.name === filtroFacultad);
            return fac ? p.dep_code_facultad === fac.dep_code : true;
          })
        : programas;
    return ["Todos", ...base.map((p) => p.nombre).sort((a, b) => a.localeCompare(b, "es"))];
  }, [programas, facultades, filtroFacultad]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const toggleTask = async (task: Task) => {
    setSavingTask(task._id);
    try {
      const res = await axios.put(`${base}/task-assignments/${task._id}`, {
        completada: !task.completada,
        observacion_respuesta: respuestas[task._id] ?? task.observacion_respuesta,
      });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? res.data : t)));
    } catch (e) {
      console.error(e);
    } finally {
      setSavingTask(null);
    }
  };

  const guardarRespuesta = async (task: Task) => {
    setSavingTask(task._id);
    try {
      const res = await axios.put(`${base}/task-assignments/${task._id}`, {
        observacion_respuesta: respuestas[task._id] ?? "",
      });
      setTasks((prev) => prev.map((t) => (t._id === task._id ? res.data : t)));
    } catch (e) {
      console.error(e);
    } finally {
      setSavingTask(null);
    }
  };

  if (loading) {
    return (
      <Container py="xl">
        <Stack align="center" gap="md" mih={300}>
          <Loader size="md" />
          <Text size="sm" c="dimmed">Cargando información de procesos…</Text>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>Procesos de calidad MEN</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Estado de fases y actividades de los programas de tu facultad/dependencia.
            {userRole === "Responsable" || userRole === "Productor"
              ? " Solo lectura — no puedes crear ni cerrar procesos."
              : ""}
          </Text>
        </div>

        {/* Tareas asignadas */}
        {tasks.length > 0 && (
          <Paper withBorder radius="lg" p="md">
            <Group gap="xs" mb="sm">
              <IconClipboardList size={20} />
              <Title order={4}>Tareas asignadas</Title>
              <Badge size="sm" color="blue" variant="light">
                {tasks.filter((t) => !t.completada).length} pendientes
              </Badge>
            </Group>
            <Stack gap="sm">
              {tasks.map((task) => (
                <Paper
                  key={task._id}
                  withBorder
                  radius="md"
                  p="sm"
                  style={{
                    borderLeft: `4px solid ${task.completada ? "#40c057" : "#228be6"}`,
                    background: task.completada ? "#f0fff4" : undefined,
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                      <Tooltip label={task.completada ? "Marcar pendiente" : "Marcar completada"} withArrow>
                        <ActionIcon
                          variant="subtle"
                          color={task.completada ? "green" : "gray"}
                          loading={savingTask === task._id}
                          onClick={() => toggleTask(task)}
                        >
                          {task.completada
                            ? <IconCircleCheck size={20} />
                            : <IconCircle size={20} />}
                        </ActionIcon>
                      </Tooltip>
                      <Box style={{ minWidth: 0 }}>
                        <Text
                          size="sm"
                          fw={600}
                          td={task.completada ? "line-through" : undefined}
                          c={task.completada ? "dimmed" : undefined}
                        >
                          {task.titulo}
                        </Text>
                        {task.descripcion && (
                          <Text size="xs" c="dimmed">{task.descripcion}</Text>
                        )}
                        <Group gap="md" mt={2} wrap="wrap">
                          {task.fecha_limite && (
                            <Text
                              size="xs"
                              c={!task.completada && task.fecha_limite < new Date().toISOString().split("T")[0] ? "red" : "dimmed"}
                            >
                              Límite: {formatFechaDDMMYY(task.fecha_limite)}
                            </Text>
                          )}
                          {task.completada && task.fecha_completada && (
                            <Text size="xs" c="teal">
                              Completada: {formatFechaDDMMYY(task.fecha_completada)}
                            </Text>
                          )}
                        </Group>
                      </Box>
                    </Group>
                    <Badge size="xs" color={task.completada ? "green" : "blue"} variant="light" style={{ flexShrink: 0 }}>
                      {task.completada ? "Hecha" : "Pendiente"}
                    </Badge>
                  </Group>

                  {/* Respuesta / observación */}
                  <Box mt="xs" pl={36}>
                    <Textarea
                      placeholder="Escribe una observación o respuesta (opcional)..."
                      size="xs"
                      rows={2}
                      value={respuestas[task._id] ?? task.observacion_respuesta}
                      onChange={(e) =>
                        setRespuestas((prev) => ({ ...prev, [task._id]: e.currentTarget.value }))
                      }
                    />
                    {(respuestas[task._id] !== undefined && respuestas[task._id] !== task.observacion_respuesta) && (
                      <Button
                        size="xs"
                        variant="light"
                        mt={4}
                        loading={savingTask === task._id}
                        onClick={() => guardarRespuesta(task)}
                      >
                        Guardar respuesta
                      </Button>
                    )}
                  </Box>
                </Paper>
              ))}
            </Stack>
          </Paper>
        )}

        {/* Filtros */}
        <Paper withBorder radius="md" p="md">
          <Group gap="md" wrap="wrap">
            <Select
              label="Facultad"
              data={opcionesFacultad}
              value={filtroFacultad}
              onChange={(v) => { setFiltroFacultad(v ?? "Todos"); setFiltroPrograma("Todos"); }}
              style={{ minWidth: 220 }}
              styles={{ input: { cursor: "pointer" } }}
            />
            <Select
              label="Programa"
              data={opcionesPrograma}
              value={filtroPrograma}
              onChange={(v) => setFiltroPrograma(v ?? "Todos")}
              searchable
              style={{ minWidth: 260 }}
            />
          </Group>
        </Paper>

        {loadingFases && (
          <Group gap="xs">
            <Loader size="xs" />
            <Text size="xs" c="dimmed">Cargando fases…</Text>
          </Group>
        )}

        {/* Lista de programas */}
        {programasFiltrados.length === 0 ? (
          <Paper withBorder radius="md" p="xl">
            <Text c="dimmed" ta="center">
              No se encontraron programas con los filtros actuales.
            </Text>
          </Paper>
        ) : (
          <Stack gap="xl">
            {programasFiltrados.map((prog) => {
              const code = programCodeKey(prog);
              const procsProg = procesos.filter((p) => p.program_code === code);
              const rc = procesoRcActivoDePrograma(procsProg, code);
              const av = procsProg.find((p) => p.tipo_proceso === "AV");
              const ae = procsProg.find((p) => p.tipo_proceso === "AE");
              const pms = procsProg.filter((p) => p.tipo_proceso === "PM");
              const tieneProc = rc || av || ae || pms.length > 0;

              return (
                <Paper key={prog._id} withBorder radius="lg" p="md">
                  <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
                    <div>
                      <Group gap="xs" align="center">
                        <Anchor
                          href={processesMenRoutes.program(prog._id)}
                          fw={700}
                          size="md"
                          c="dark"
                          underline="hover"
                        >
                          {prog.nombre}
                        </Anchor>
                        <Badge
                          size="xs"
                          color={prog.estado === "Activo" ? "teal" : "gray"}
                          variant="filled"
                        >
                          {prog.estado}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {prog.nivel_academico ?? "—"} · {prog.modalidad ?? "—"}
                        {prog.dep_code_programa ? ` · Cód: ${prog.dep_code_programa}` : ""}
                      </Text>
                    </div>
                    {!tieneProc && (
                      <Badge
                        size="sm"
                        color="gray"
                        variant="outline"
                        leftSection={<IconAlertCircle size={12} />}
                      >
                        Sin procesos activos
                      </Badge>
                    )}
                  </Group>

                  <Divider mb="sm" />

                  {!tieneProc ? (
                    <Text size="sm" c="dimmed">
                      Este programa no tiene procesos RC, AV, AE ni PM activos.
                    </Text>
                  ) : (
                    <Stack gap="xs">
                      {rc && (
                        <ProcesoCard
                          proc={rc}
                          fases={fases.filter((f) => f.proceso_id === rc._id)}
                        />
                      )}
                      {av && (
                        <ProcesoCard
                          proc={av}
                          fases={fases.filter((f) => f.proceso_id === av._id)}
                        />
                      )}
                      {ae && (
                        <ProcesoCard
                          proc={ae}
                          fases={fases.filter((f) => f.proceso_id === ae._id)}
                        />
                      )}
                      {pms.map((pm) => (
                        <ProcesoCard
                          key={pm._id}
                          proc={pm}
                          fases={fases.filter((f) => f.proceso_id === pm._id)}
                        />
                      ))}
                    </Stack>
                  )}
                </Paper>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Container>
  );
}
