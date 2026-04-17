"use client";

import { useEffect, useState } from "react";
import {
  Title, Button, Text, Paper, Stack, Group, Loader, Modal, TextInput, Select, SimpleGrid, Divider, Badge,
} from "@mantine/core";
import { useParams, useRouter } from "next/navigation";
import axios, { isAxiosError } from "axios";
import type { Program, Dependency, Process } from "../../types";
import { LABEL_PROCESO, PERIODICIDAD_ADMISION } from "../../constants";
import { formatFechaDDMMYY } from "../../utils/formatFechaCorta";

export default function ProgramaDateReviewPage() {
  const params = useParams<{ programId?: string | string[] }>();
  const programId = Array.isArray(params.programId) ? params.programId[0] : params.programId;
  const router = useRouter();

  const [programa, setPrograma] = useState<Program | null>(null);
  const [facultades, setFacultades] = useState<Dependency[]>([]);
  const [procesos, setProcesos] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Program>>({});
  const [saving, setSaving] = useState(false);
  const [gestionarInfoOpen, setGestionarInfoOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      if (!programId) {
        setPrograma(null);
        setLoadError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);
      const base = process.env.NEXT_PUBLIC_API_URL ?? "";
      if (!base) {
        setLoadError(
          "Falta NEXT_PUBLIC_API_URL en el front (ej. http://localhost:PUERTO/api/d según tu Back_Miro en desarrollo).",
        );
        setPrograma(null);
        setLoading(false);
        return;
      }

      try {
        /*1) Programa primero: la UI deja de “quedar en blanco” si /processes es lento o enorme. */
        const progRes = await axios.get<Program>(`${base}/programs/${encodeURIComponent(programId)}`, {
          signal: ac.signal,
        });
        if (cancelled) return;

        const programaData = progRes.data;
        setPrograma(programaData);
        setLoading(false);

        const code = programaData?.dep_code_programa;
        /* 2) Facultades + solo procesos de este programa (el backend filtra por program_code). */
        const [deps, procRes] = await Promise.all([
          axios.get(`${base}/dependencies/all`, { params: { limit: 1000 }, signal: ac.signal }),
          axios.get(`${base}/processes`, {
            params: code ? { program_code: code } : {},
            signal: ac.signal,
          }),
        ]);
        if (cancelled) return;

        const raw = deps.data;
        const all: Dependency[] = Array.isArray(raw) ? raw : (raw?.dependencies ?? []);
        setFacultades(all.filter((d) => (d.name ?? "").toUpperCase().includes("FACULTAD")));

        const plist = Array.isArray(procRes.data) ? (procRes.data as Process[]) : [];
        setProcesos(code ? plist.filter((p) => p.program_code === code) : plist);
      } catch (e) {
        if (isAxiosError(e) && (e.code === "ERR_CANCELED" || e.message === "canceled")) return;
        console.error(e);
        if (!cancelled) {
          let msg = "No se pudo cargar el programa.";
          if (isAxiosError(e)) {
            const st = e.response?.status;
            const data = e.response?.data;
            const apiErr =
              data && typeof data === "object" && "error" in data
                ? String((data as { error: unknown }).error)
                : null;
            if (st === 404) msg = apiErr || "Programa no encontrado.";
            else if (st === 500) {
              msg =
                "El servidor devolvió error 500. Mira la terminal del API (Back_Miro): suele ser fallo de base de datos o excepción no controlada. ";
              msg += apiErr ? `Detalle: ${apiErr}` : "Revisa que MongoDB esté arriba y DB_URI en el .env del backend.";
            } else if (st === 400) msg = apiErr || "Solicitud no válida.";
            else if (e.code === "ERR_NETWORK" || !e.response) {
              msg =
                "No hay respuesta del API. Comprueba que el backend esté en marcha y que NEXT_PUBLIC_API_URL apunte al prefijo correcto (en dev suele ser …/api/d).";
            } else if (apiErr) msg = apiErr;
          }
          setLoadError(msg);
          setPrograma(null);
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [programId]);

  const activosRcAv = procesos.filter((p) => p.tipo_proceso === "RC" || p.tipo_proceso === "AV");

  const abrirEdicion = () => {
    if (!programa) return;
    setEditForm({
      nombre: programa.nombre,
      codigo_snies: programa.codigo_snies,
      dep_code_facultad: programa.dep_code_facultad,
      modalidad: programa.modalidad,
      nivel_academico: programa.nivel_academico,
      nivel_formacion: programa.nivel_formacion,
      num_creditos: programa.num_creditos,
      num_semestres: programa.num_semestres,
      estado: programa.estado,
      admision_estudiantes: programa.admision_estudiantes,
      num_estudiantes_saces: programa.num_estudiantes_saces,
    });
    setEditando(true);
  };

  const guardar = async () => {
    if (!programa) return;
    setSaving(true);
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";
    try {
      const res = await axios.put(`${base}/programs/${programa._id}`, editForm);
      setPrograma(res.data);
      setEditando(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const irGestionar = () => {
    if (activosRcAv.length === 0) {
      setGestionarInfoOpen(true);
      return;
    }
    if (!programId) return;
    router.push(`/date-review?programId=${encodeURIComponent(programId)}&gestionar=1`);
  };

  if (loading) {
    return (
      <Stack p="xl" align="center" gap="md" mih={280}>
        <Loader size="md" />
        <Text size="sm" c="dimmed">Cargando programa…</Text>
      </Stack>
    );
  }
  if (!programa) {
    return (
      <Paper p="xl" m="md" maw={560}>
        <Text fw={600} mb="xs">{loadError ? "Error al cargar" : "No se encontró el programa"}</Text>
        {loadError ? (
          <Text size="sm" c="red">{loadError}</Text>
        ) : (
          <Text size="sm" c="dimmed">El id no existe o no tienes acceso a ese recurso.</Text>
        )}
        <Button mt="md" onClick={() => router.push("/date-review")}>Volver al tablero</Button>
      </Paper>
    );
  }

  const facName = facultades.find((f) => f.dep_code === programa.dep_code_facultad)?.name ?? programa.dep_code_facultad;

  return (
    <Stack p="md" pt="xl" maw={960} mx="auto">
      <Group justify="space-between" align="flex-start" wrap="wrap">
        <div>
          <Button variant="subtle" size="xs" mb={8} onClick={() => router.back()}>
            ← Volver
          </Button>
          <Group gap="sm" align="center">
            <Title order={2}>{programa.nombre}</Title>
            <Badge color={programa.estado === "Activo" ? "green" : "red"} variant="light">{programa.estado}</Badge>
          </Group>
          {programa.codigo_snies && (
            <Text size="sm" c="dimmed" mt={4}>SNIES: {programa.codigo_snies}</Text>
          )}
        </div>
        <Button onClick={irGestionar}>Gestionar procesos del programa</Button>
      </Group>

      <Divider />

      <Group justify="space-between">
        <Text fw={600} size="sm" c="dimmed">INFORMACIÓN GENERAL</Text>
        {!editando && <Button size="xs" variant="light" onClick={abrirEdicion}>Editar</Button>}
      </Group>

      {editando ? (
        <Stack gap="sm">
          <TextInput label="Nombre del programa" value={editForm.nombre ?? ""}
            onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.currentTarget.value }))} />
          <TextInput label="Código SNIES" value={editForm.codigo_snies ?? ""}
            onChange={(e) => setEditForm((f) => ({ ...f, codigo_snies: e.currentTarget.value || null }))} />
          <Select label="Facultad" data={facultades.map((f) => ({ value: f.dep_code, label: f.name }))}
            value={editForm.dep_code_facultad ?? null}
            onChange={(v) => setEditForm((f) => ({ ...f, dep_code_facultad: v ?? "" }))}
            styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
          <SimpleGrid cols={2} spacing="sm">
            <Select label="Modalidad" data={["Presencial", "Virtual", "Híbrido"]}
              value={editForm.modalidad ?? null} onChange={(v) => setEditForm((f) => ({ ...f, modalidad: v }))}
              styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
            <Select label="Nivel académico" data={["Pregrado", "Posgrado"]}
              value={editForm.nivel_academico ?? null} onChange={(v) => setEditForm((f) => ({ ...f, nivel_academico: v }))}
              styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
            <Select label="Nivel de formación"
              data={["Técnico", "Tecnológico", "Profesional", "Especialización", "Maestría", "Doctorado"]}
              value={editForm.nivel_formacion ?? null} onChange={(v) => setEditForm((f) => ({ ...f, nivel_formacion: v }))}
              styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
            <Select label="Estado" data={["Activo", "Inactivo"]}
              value={editForm.estado ?? null} onChange={(v) => setEditForm((f) => ({ ...f, estado: v ?? "Activo" }))}
              styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
            <Select label="Periodicidad de admisión" data={[...PERIODICIDAD_ADMISION]}
              value={editForm.admision_estudiantes ?? null}
              onChange={(v) => setEditForm((f) => ({ ...f, admision_estudiantes: v ?? null }))}
              clearable
              styles={{ input: { caretColor: "transparent", cursor: "pointer" } }} />
            <TextInput label="Admisión estudiantes (número)" type="number"
              value={editForm.num_estudiantes_saces != null ? String(editForm.num_estudiantes_saces) : ""}
              onChange={(e) => setEditForm((f) => ({ ...f, num_estudiantes_saces: Number(e.currentTarget.value || 0) }))} />
            <TextInput label="Créditos" type="number" value={editForm.num_creditos ?? ""}
              onChange={(e) => setEditForm((f) => ({ ...f, num_creditos: Number(e.currentTarget.value) }))} />
            <TextInput label="Semestres" type="number" value={editForm.num_semestres ?? ""}
              onChange={(e) => setEditForm((f) => ({ ...f, num_semestres: Number(e.currentTarget.value) }))} />
          </SimpleGrid>
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button size="xs" loading={saving} onClick={guardar}>Guardar</Button>
          </Group>
        </Stack>
      ) : (
        <SimpleGrid cols={2} spacing="md">
          {[
            { label: "Código SNIES", value: programa.codigo_snies },
            { label: "Facultad", value: facName },
            { label: "Modalidad", value: programa.modalidad },
            { label: "Nivel académico", value: programa.nivel_academico },
            { label: "Nivel de formación", value: programa.nivel_formacion },
            { label: "Créditos", value: programa.num_creditos },
            { label: "Semestres", value: programa.num_semestres },
            { label: "Periodicidad de admisión", value: programa.admision_estudiantes },
            { label: "Admisión estudiantes", value: programa.num_estudiantes_saces },
          ].map(({ label, value }) => (
            <Paper key={label} withBorder radius="sm" p="sm">
              <Text size="xs" c="dimmed" mb={2}>{label}</Text>
              <Text size="sm" fw={600}>{value ?? "—"}</Text>
            </Paper>
          ))}
        </SimpleGrid>
      )}

      <Divider />
      <Text fw={600} size="sm" c="dimmed">PROCESOS ACTIVOS (resumen)</Text>
      <SimpleGrid cols={2} spacing="md">
        {(["RC", "AV"] as const).map((tipo) => {
          const proc = procesos.find((p) => p.tipo_proceso === tipo);
          return (
            <Paper key={tipo} withBorder radius="sm" p="sm" style={{ backgroundColor: "var(--mantine-color-blue-light)" }}>
              <Text size="xs" fw={700} mb={6}>{LABEL_PROCESO[tipo]}</Text>
              {proc ? (
                <>
                  <Text size="xs">Fase {proc.fase_actual}</Text>
                  <Text size="xs">Venc.: {formatFechaDDMMYY(proc.fecha_vencimiento)}</Text>
                </>
              ) : (
                <Text size="xs" c="dimmed">Sin proceso activo</Text>
              )}
            </Paper>
          );
        })}
      </SimpleGrid>

      <Modal opened={gestionarInfoOpen} onClose={() => setGestionarInfoOpen(false)} title="Sin procesos activos" centered>
        <Text size="sm">No hay procesos RC o AV activos para este programa. Cree uno desde la sección Alertas o el tablero.</Text>
        <Button mt="md" onClick={() => setGestionarInfoOpen(false)}>Entendido</Button>
      </Modal>
    </Stack>
  );
}
