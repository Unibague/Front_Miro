"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Title, Button, Text, Paper, Stack, Group, Loader, Modal, TextInput, Textarea, Select, SimpleGrid, Divider, Badge,
  ActionIcon, Tooltip, Anchor, Switch,
} from "@mantine/core";
import { useParams, useRouter } from "next/navigation";
import { IconChevronLeft } from "@tabler/icons-react";
import { paramKey } from "@/app/utils/routeParams";
import axios, { isAxiosError } from "axios";
import type { Program, Dependency, Process, Phase, ProcessHistoryRecord } from "../../types";
import { LABEL_PROCESO, PERIODICIDAD_ADMISION, faseColors, etiquetaSubtipoCompacta, COLOR_PROCESO, ROW_BG_PROCESO } from "../../constants";
import {
  textoCondicionFactorFase2,
  actividadEsReunionesParciales,
  actividadEsViabilidadFinanciera,
} from "../../utils/condicionFactorFase2";
import { formatFechaDDMMYY } from "../../utils/formatFechaCorta";
import { fechaVencimientoPrograma } from "../../utils/fechaVencimientoPrograma";
import {
  esRcVigenciaTransitoriaPostAv,
  esVigenciaActivaPrograma,
  vigenciaActivaSegunYYYYMMDDoISO,
} from "../../utils/vigenciaActiva";
import { mismoId } from "../../utils/idMongoose";
import { procesoRcActivoDePrograma } from "../../utils/procesoRcUnico";
import { programCodeKey } from "../../utils/programCode";
import { filterFacultadesMen, parseDependenciesAllResponse } from "../../utils/facultadesMen";
import { processesMenRoutes } from "../../config/routes";
import { ClasificacionCineNbcSection } from "../../components/ClasificacionCineNbcSection";
import { FichaCampoLectura } from "../../components/FichaCampoLectura";

function primeraActividadEnFase(fase: Phase | undefined): string | null {
  if (!fase?.actividades?.length) return null;
  const pend = fase.actividades.find((a) => !a.completada && !a.no_aplica);
  if (pend) return pend.nombre;
  return fase.actividades[fase.actividades.length - 1]?.nombre ?? null;
}

/** Alineado con ProcesoDetalleCard: reforma curricular o renovación + reforma. */
function esSubtipoReformaOReformaConRenovacion(subtipo: string | null | undefined): boolean {
  const n = String(subtipo ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return n === "reforma curricular" || n === "renovación + reforma";
}

export default function ProgramaProcessesMenPage() {
  const params = useParams();
  const programId = paramKey(params, "programId");
  const router = useRouter();

  const [programa, setPrograma] = useState<Program | null>(null);
  const [facultades, setFacultades] = useState<Dependency[]>([]);
  const [procesos, setProcesos] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Program>>({});
  const [saving, setSaving] = useState(false);
  const [savingToggleKey, setSavingToggleKey] = useState<"activo_universidad" | "es_acreditable" | null>(null);
  const [gestionarInfoOpen, setGestionarInfoOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [fasesProg, setFasesProg] = useState<Phase[]>([]);
  const [loadingFasesProg, setLoadingFasesProg] = useState(false);
  const [historialRc, setHistorialRc] = useState<ProcessHistoryRecord[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      if (!programId) {
        setPrograma(null);
        setHistorialRc([]);
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

        const code = programCodeKey(programaData);
        const histPromise = axios
          .get<ProcessHistoryRecord[]>(`${base}/process-history`, {
            params: { program_code: code, tipo_proceso: "RC" },
            signal: ac.signal,
          })
          .then((r) => (Array.isArray(r.data) ? r.data : []))
          .catch(() => [] as ProcessHistoryRecord[]);

        /* 2) Facultades + procesos + historial RC (para contar reformas). */
        const [deps, procRes, histList] = await Promise.all([
          axios.get(`${base}/dependencies/all`, { params: { limit: 1000 }, signal: ac.signal }),
          axios.get(`${base}/processes`, {
            params: { program_code: code },
            signal: ac.signal,
          }),
          histPromise,
        ]);
        if (cancelled) return;

        setFacultades(filterFacultadesMen(parseDependenciesAllResponse(deps.data)));

        const plist = Array.isArray(procRes.data) ? (procRes.data as Process[]) : [];
        setProcesos(plist.filter((p) => p.program_code === code));
        setHistorialRc(histList);
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
          setHistorialRc([]);
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

  /** Fases RC/AV/AE/PM de este programa (nombre de fase + actividad actual). AE no se lista en tarjetas pero sigue cargándose por si se abre desde el tablero. */
  useEffect(() => {
    const code = programa ? programCodeKey(programa) : null;
    if (!code) return;
    const subs = procesos.filter((p) => {
      if (p.program_code !== code) return false;
      return p.tipo_proceso === "RC" || p.tipo_proceso === "AV" || p.tipo_proceso === "AE" || p.tipo_proceso === "PM";
    });
    if (subs.length === 0) {
      setFasesProg([]);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";
    if (!base) return;

    setLoadingFasesProg(true);
    axios
      .get<Phase[]>(`${base}/phases`, {
        signal: ac.signal,
        params: { proceso_ids: subs.map((p) => p._id).join(",") },
      })
      .then((res) => {
        if (!cancelled) setFasesProg(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setFasesProg([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFasesProg(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [programa, procesos]);


  const procesosDelPrograma = useMemo(() => {
    if (!programa) return [];
    const c = programCodeKey(programa);
    return procesos.filter((p) => p.program_code === c);
  }, [programa, procesos]);

  /** Reformas cerradas en historial + RC activos de reforma / renovación+reforma (no duplican: activo aún no está en historial). */
  const cantidadReformasPrograma = useMemo(() => {
    if (!programa) return 0;
    const code = programCodeKey(programa);
    const cerradas = historialRc.filter((h) => esSubtipoReformaOReformaConRenovacion(h.subtipo)).length;
    const activas = procesos.filter(
      (p) =>
        p.program_code === code
        && p.tipo_proceso === "RC"
        && esSubtipoReformaOReformaConRenovacion(p.subtipo),
    ).length;
    return cerradas + activas;
  }, [programa, historialRc, procesos]);

  const faseTituloYActividad = useCallback(
    (proc: Process) => {
      const faseObj = fasesProg.find((f) => mismoId(f.proceso_id, proc._id) && f.numero === proc.fase_actual);
      const fc = faseColors.find((x) => x.fase === proc.fase_actual);
      return {
        nombreFase: fc?.fullName ?? `Fase ${proc.fase_actual}`,
        actividad: primeraActividadEnFase(faseObj),
      };
    },
    [fasesProg],
  );

  const tieneProcesoGestionable = useMemo(
    () =>
      procesosDelPrograma.some((p) =>
        p.tipo_proceso === "RC" ||
        p.tipo_proceso === "AV" ||
        p.tipo_proceso === "AE" ||
        p.tipo_proceso === "PM",
      ),
    [procesosDelPrograma],
  );

  type TarjetaProc = {
    key: string;
    proc: Process | null;
    rotuloTipo: string;
  };

  const tarjetasProceso = useMemo((): TarjetaProc[] => {
    const out: TarjetaProc[] = [];
    const code = programa ? programCodeKey(programa) : "";
    const rc = code ? procesoRcActivoDePrograma(procesosDelPrograma, code) : undefined;
    const av = procesosDelPrograma.find((p) => p.tipo_proceso === "AV");
    if (!rc) {
      out.push({
        key: "RC-empty",
        proc: null,
        rotuloTipo: LABEL_PROCESO["RC"],
      });
    } else {
      const subLbl = rc.subtipo ? etiquetaSubtipoCompacta(rc.subtipo) : "";
      out.push({
        key: String(rc._id),
        proc: rc,
        rotuloTipo: subLbl ? `${LABEL_PROCESO["RC"]} — ${subLbl}` : LABEL_PROCESO["RC"],
      });
    }
    out.push({ key: "AV", proc: av ?? null, rotuloTipo: LABEL_PROCESO["AV"] });
    const pms = procesosDelPrograma.filter((p) => p.tipo_proceso === "PM");
    pms.forEach((pm, i) => {
      out.push({
        key: pm._id,
        proc: pm,
        rotuloTipo: pms.length > 1 ? `${LABEL_PROCESO["PM"]} (${i + 1})` : LABEL_PROCESO["PM"],
      });
    });
    return out;
  }, [procesosDelPrograma, programa]);

  const abrirEdicion = () => {
    if (!programa) return;
    setSaveError(null);
    setEditForm({
      dep_code_programa: programa.dep_code_programa ?? "",
      codigo_snies: programa.codigo_snies ?? "",
    });
    setEditando(true);
  };

  const guardar = async () => {
    if (!programa) return;
    setSaveError(null);
    setSaving(true);
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";
    const codProgRaw = String(editForm.dep_code_programa ?? "").trim();
    const codProg = codProgRaw || null;
    const sniesRaw = String(editForm.codigo_snies ?? "").trim();
    try {
      const payload = {
        dep_code_programa: codProg,
        codigo_snies: sniesRaw || null,
      };
      const res = await axios.put(`${base}/programs/${programa._id}`, payload);
      setPrograma(res.data);
      setEditando(false);
    } catch (e) {
      console.error(e);
      let msg = "No se pudieron guardar los cambios.";
      if (isAxiosError(e)) {
        const d = e.response?.data as { error?: string } | undefined;
        const api = d?.error != null ? String(d.error) : "";
        if (e.response?.status === 400 || e.response?.status === 409) msg = api || msg;
        else if ((e.response?.data as { code?: number })?.code === 11000 || api.toLowerCase().includes("duplicate")) {
          msg = "Ese código de programa ya está en uso por otro registro.";
        } else if (api) msg = api;
      }
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const guardarBooleanPrograma = async (
    key: "activo_universidad" | "es_acreditable",
    value: boolean,
  ) => {
    if (!programa) return;
    if (key === "activo_universidad" && programa.estado !== "Activo") return;
    setToggleError(null);
    setSavingToggleKey(key);
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await axios.put(`${base}/programs/${programa._id}`, { [key]: value });
      setPrograma(res.data);
    } catch (e) {
      console.error(e);
      let msg = "No se pudo actualizar el programa.";
      if (isAxiosError(e)) {
        const d = e.response?.data as { error?: string } | undefined;
        if (d?.error) msg = String(d.error);
      }
      setToggleError(msg);
    } finally {
      setSavingToggleKey(null);
    }
  };

  const irGestionar = () => {
    if (!tieneProcesoGestionable) {
      setGestionarInfoOpen(true);
      return;
    }
    if (!programId) return;
    router.push(processesMenRoutes.homeWithQuery({ programId, gestionar: "1" }));
  };

  const irGestionarProceso = (proc: Process) => {
    if (!programId) return;
    router.push(processesMenRoutes.homeWithQuery({
      programId,
      gestionar: "1",
      focusTipo: proc.tipo_proceso,
      focusProcess: proc._id,
    }));
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
        <Button mt="md" onClick={() => router.push(processesMenRoutes.home)}>Volver al tablero</Button>
      </Paper>
    );
  }

  const facName = facultades.find((f) => f.dep_code === programa.dep_code_facultad)?.name ?? programa.dep_code_facultad;
  const estadoMenActivo = programa.estado === "Activo";
  const activoUniversidad = estadoMenActivo ? (programa.activo_universidad ?? true) : false;
  const esAcreditable = programa.es_acreditable ?? false;

  return (
    <Stack p="md" pt="xl" maw={960} mx="auto">
      <Stack gap="sm">
        <div>
          <Tooltip label="Volver" withArrow>
            <ActionIcon
              variant="default"
              size="sm"
              mb={8}
              onClick={() => router.back()}
              aria-label="Volver"
            >
              <IconChevronLeft size={16} />
            </ActionIcon>
          </Tooltip>
          <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
            <Title order={2} style={{ flex: "1 1 10rem", minWidth: 0 }}>{programa.nombre}</Title>
            <Group gap={6} style={{ flexShrink: 0, alignSelf: "center" }}>
              <Badge color={estadoMenActivo ? "green" : "red"} variant="light">
                {estadoMenActivo ? "Activo ante MEN" : "Inactivo ante MEN"}
              </Badge>
              <Badge color={activoUniversidad && estadoMenActivo ? "teal" : "gray"} variant="light">
                {activoUniversidad && estadoMenActivo ? "Activo en universidad" : "Inactivo en universidad"}
              </Badge>
              <Badge color={esAcreditable ? "blue" : "gray"} variant="light">
                {esAcreditable ? "Acreditable" : "No acreditable"}
              </Badge>
            </Group>
          </Group>
          <Text size="sm" c="dimmed" mt={4}>
            <strong>Código del programa:</strong> {programa.dep_code_programa?.trim() || "—"}
            {programa.codigo_snies ? (
              <>
                {" · "}
                <strong>SNIES:</strong> {programa.codigo_snies}
              </>
            ) : null}
          </Text>
        </div>

        <Group justify="space-between" align="center" wrap="nowrap">
          <Button onClick={irGestionar}>Gestionar procesos del programa</Button>

          <Stack gap={6} style={{ minWidth: 320, marginLeft: "auto", alignItems: "flex-end" }}>
            <Group gap="md" align="center" wrap="nowrap" justify="flex-end" style={{ marginLeft: "auto" }}>
              <Switch
                checked={activoUniversidad}
                disabled={!estadoMenActivo || savingToggleKey === "activo_universidad"}
                label="Activo en universidad"
                styles={{
                  body: { alignItems: "center" },
                  label: { paddingTop: 0, lineHeight: 1.2 },
                }}
                onChange={(e) => {
                  void guardarBooleanPrograma("activo_universidad", e.currentTarget.checked);
                }}
              />

              <Switch
                checked={esAcreditable}
                disabled={savingToggleKey === "es_acreditable"}
                label="Programa acreditable"
                styles={{
                  body: { alignItems: "center" },
                  label: { paddingTop: 0, lineHeight: 1.2 },
                }}
                onChange={(e) => {
                  void guardarBooleanPrograma("es_acreditable", e.currentTarget.checked);
                }}
              />
            </Group>

            {toggleError && <Text size="sm" c="red">{toggleError}</Text>}
            {!estadoMenActivo && (
              <Text size="xs" c="dimmed" ta="right">
                El switch de universidad se bloquea cuando el programa está Inactivo ante MEN.
              </Text>
            )}
          </Stack>
        </Group>
      </Stack>

      <Divider />

      <Group justify="space-between">
        <Text fw={600} size="sm" c="dimmed">INFORMACIÓN GENERAL</Text>
        {!editando && <Button size="xs" variant="light" onClick={abrirEdicion}>Editar</Button>}
      </Group>

      {editando ? (
        <Stack gap="sm">
          <TextInput
            label="Código del programa"
            placeholder="Ej: 22 (opcional)"
            description="Opcional. Si lo defines o cambias, el sistema actualiza procesos activos, historial, alertas y estudiantes vinculados."
            value={editForm.dep_code_programa ?? ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setEditForm((f) => ({ ...f, dep_code_programa: v }));
            }}
          />
          <TextInput
            label="Código SNIES"
            placeholder="Opcional"
            value={editForm.codigo_snies ?? ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setEditForm((f) => ({ ...f, codigo_snies: v }));
            }}
          />

          {saveError && (
            <Text size="sm" c="red">{saveError}</Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => { setSaveError(null); setEditando(false); }}>Cancelar</Button>
            <Button size="xs" loading={saving} onClick={() => void guardar()}>Guardar</Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {[
              { label: "Código del programa", value: programa.dep_code_programa?.trim() || "—" },
              { label: "Código SNIES", value: programa.codigo_snies },
              { label: "Facultad", value: facName },
              { label: "Estado ante MEN", value: programa.estado },
              { label: "Activo en universidad", value: activoUniversidad ? "Sí" : "No" },
              { label: "Programa acreditable", value: esAcreditable ? "Sí" : "No" },
              { label: "Modalidad", value: programa.modalidad },
              { label: "Nivel académico", value: programa.nivel_academico },
              { label: "Nivel de formación", value: programa.nivel_formacion },
              { label: "Créditos", value: programa.num_creditos },
              { label: "Periodos de duración", value: programa.periodos_duracion },
              { label: "Semestres", value: programa.num_semestres },
              { label: "Periodicidad de admisión", value: programa.admision_estudiantes },
              { label: "Estudiantes (1er periodo)", value: programa.num_estudiantes_saces },
              { label: "RC totales del programa", value: programa.total_rc },
              { label: "AV totales del programa", value: programa.total_av },
              { label: "Reformas del programa", value: cantidadReformasPrograma },
            ].map(({ label, value }) => (
              <FichaCampoLectura key={label} label={label} value={value} />
            ))}
          </SimpleGrid>

          <ClasificacionCineNbcSection cine_f={programa.cine_f} nbc={programa.nbc} />
        </Stack>
      )}

      <Divider />
      <Text fw={700} size="sm" mb={4}>Resoluciones vigentes</Text>
      <Text size="xs" c="dimmed" mb="sm">
        Datos del último cierre registrado sobre el programa. Si aún no hay historial cerrado en el sistema,
        pueden mostrarse valores “planos” (SNIES/resoluciones) que existan sobre el mismo registro.
      </Text>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mb="lg">
        {(["RC", "AV"] as const).map((t) => {
          const ult = t === "RC" ? programa.ultimo_rc : programa.ultimo_av;
          const codigo =
            ult?.codigo_resolucion
            ?? (t === "RC" ? programa.codigo_resolucion_rc : programa.codigo_resolucion_av);
          const fecha =
            ult?.fecha_resolucion
            ?? (t === "RC" ? programa.fecha_resolucion_rc : programa.fecha_resolucion_av);
          const duracion =
            ult?.duracion_resolucion != null ? ult.duracion_resolucion
              : (t === "RC" ? programa.duracion_resolucion_rc : programa.duracion_resolucion_av);
          const venc = fechaVencimientoPrograma(programa, t);
          const vencGuardado = ult?.fecha_vencimiento ?? null;
          const vencCalculado =
            venc && !vencGuardado ? venc : null;
          const link = ult?.link_documento ?? null;
          const rcTransitoria = t === "RC" && esRcVigenciaTransitoriaPostAv(programa);
          const vigenciaPorFecha =
            vigenciaActivaSegunYYYYMMDDoISO(fechaVencimientoPrograma(programa, t));
          const vigenciaActiva = esVigenciaActivaPrograma(programa, t);
          const tieneDatos = !!(codigo || fecha || duracion != null || venc || link);
          const acento = COLOR_PROCESO[t];
          const fondo = ROW_BG_PROCESO[t];
          return (
            <Stack key={t} gap="xs">
            <Paper
              withBorder
              radius="md"
              p="md"
              bg={fondo}
              style={{
                borderColor: t === "RC" ? "rgba(116, 192, 252, 0.35)" : "rgba(177, 151, 252, 0.4)",
                borderLeftWidth: 5,
                borderLeftStyle: "solid",
                borderLeftColor: acento,
              }}
            >
              <Group justify="space-between" mb="xs" gap="xs" wrap="wrap">
                <Text fw={700} size="sm" c="dark.8">{LABEL_PROCESO[t]}</Text>
                <Group gap={6} wrap="wrap" justify="flex-end">
                  {rcTransitoria ? (
                    <>
                      <Badge size="xs" variant="light" color="orange">
                        Vigencia transitoria
                      </Badge>
                      {vigenciaPorFecha ? (
                        <Badge size="xs" variant="light" color="blue">
                          Vigencia activa
                        </Badge>
                      ) : null}
                    </>
                  ) : (
                    <Badge
                      size="xs"
                      variant={vigenciaActiva ? "light" : "white"}
                      color={t === "RC" ? "blue" : "violet"}
                    >
                      {vigenciaActiva ? "Vigencia activa" : "Sin vigencia activa registrada"}
                    </Badge>
                  )}
                </Group>
              </Group>
              {rcTransitoria && (
                <Text size="xs" c="dimmed" mb="xs" style={{ lineHeight: 1.45 }}>
                  {vigenciaPorFecha
                    ? "RC anterior en ficha tras acreditación con registro de oficio pendiente. Al vencer por fecha, la vigencia se prolonga en transitoria hasta registrar el oficio."
                    : "Vigencia prolongada en transitoria: registra el registro calificado de oficio desde la alerta de RC cuando el MEN lo entregue."}
                </Text>
              )}
              {!tieneDatos && (
                <Text size="xs" c="dimmed">Aún no hay datos de última resolución para este proceso.</Text>
              )}
              {tieneDatos && (
                <Stack gap={4}>
                  {codigo ? <Text size="xs"><strong>Número / código:</strong> {codigo}</Text> : null}
                  <Text size="xs"><strong>Fecha resolución:</strong> {formatFechaDDMMYY(fecha ?? null)}</Text>
                  {duracion != null ? (
                    <Text size="xs"><strong>Vigencia declarada:</strong> {duracion} años</Text>
                  ) : null}
                  <Text size="xs">
                    <strong>Vencimiento:</strong>{" "}
                    {formatFechaDDMMYY(venc)}{vencCalculado != null && !vencGuardado ? " · estimado (resolución + vigencia declarada)" : ""}
                  </Text>
                  <Group gap={6} align="baseline" wrap="wrap">
                    <Text size="xs" component="span"><strong>Documento resolución:</strong></Text>
                    {link ? (
                      <Anchor size="xs" href={link} target="_blank" rel="noopener noreferrer">Abrir PDF</Anchor>
                    ) : (
                      <Text size="xs" c="dimmed" component="span">Sin enlace guardado (el PDF se asocia al cerrar el proceso aprobado).</Text>
                    )}
                  </Group>
                </Stack>
              )}
            </Paper>
            </Stack>
          );
        })}
      </SimpleGrid>

      <Divider />
      <Group justify="space-between" mb="xs" wrap="wrap" align="center">
        <div>
          <Text fw={700} size="sm">Procesos en curso</Text>
          <Text size="xs" c="dimmed" maw={720}>
            Registro calificado, acreditación voluntaria y planes de mejora con actividad en el tablero. Si no hay RC o AV activo, la tarjeta indica «Sin proceso».
            Haz clic en una tarjeta con proceso para abrirlo en la gestión.
          </Text>
        </div>
        {loadingFasesProg ? <Loader size="xs" /> : null}
      </Group>

      <Stack gap="md" mb="md">
        {tarjetasProceso.map((t) => {
          const p = t.proc;
          const colorProceso = p ? (COLOR_PROCESO[p.tipo_proceso] ?? "#868e96") : "#dee2e6";
          const { nombreFase, actividad } = p ? faseTituloYActividad(p) : { nombreFase: "—", actividad: null as string | null };

          return (
            <Paper
              key={t.key}
              withBorder
              radius="md"
              p="md"
              bg={p ? "#fff" : "gray.0"}
              style={{
                textAlign: "left",
                borderLeft: `6px solid ${colorProceso}`,
                cursor: p ? "pointer" : "default",
                opacity: p ? 1 : 0.95,
              }}
              onClick={() => p && irGestionarProceso(p)}
            >
              <Group justify="space-between" align="flex-start" mb={6}>
                <Text fw={700} size="sm" style={{ whiteSpace: "pre-line", lineHeight: 1.35 }}>{t.rotuloTipo}</Text>
                {p ? (
                  <Badge variant="filled" color="dark" size="xs" tt="uppercase">{p.tipo_proceso}</Badge>
                ) : (
                  <Badge variant="outline" color="gray" size="xs">Sin proceso</Badge>
                )}
              </Group>
              {p && p.subtipo && (
                <Text size="xs" c="dimmed" mb={8} style={{ whiteSpace: "pre-line", wordBreak: "break-word", lineHeight: 1.35 }}>
                  Subtipo: {etiquetaSubtipoCompacta(p.subtipo)}
                </Text>
              )}
              {!p ? (
                <Text size="sm" c="dimmed">No hay proceso activo de este tipo para el programa.</Text>
              ) : (
                <>
                  <Text size="sm" fw={600}>{nombreFase}</Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    Actividad: <strong style={{ color: "#495057" }}>{actividad ?? "(sin actividades pendientes en esta fase)"}</strong>
                  </Text>
                  {(() => {
                    const cx = textoCondicionFactorFase2(p);
                    if (!cx) return null;
                    const esReu = actividadEsReunionesParciales(actividad);
                    const esVia = actividadEsViabilidadFinanciera(actividad);
                    if (!esReu && !esVia) return null;
                    const wrapText = {
                      overflowWrap: "anywhere" as const,
                      wordBreak: "break-word" as const,
                    };
                    return (
                      <Stack gap={4} mt="xs">
                        {esReu && (
                          <Text size="xs" c="dimmed" style={wrapText}>
                            <strong>{cx.baseLabel} en reuniones parciales de avance:</strong> {cx.textoReuniones ?? "—"}
                          </Text>
                        )}
                        {esVia && (
                          <Text size="xs" c="dimmed" style={wrapText}>
                            <strong>{cx.baseLabel} (viabilidad financiera):</strong> {cx.textoViabilidad ?? "—"}
                          </Text>
                        )}
                      </Stack>
                    );
                  })()}
                  <Group gap="md" mt="sm" wrap="wrap">
                    <Text size="xs" c="dimmed">Vencimiento del proceso: <strong>{formatFechaDDMMYY(p.fecha_vencimiento)}</strong></Text>
                  </Group>
                  {p.tipo_proceso === "PM" && p.parent_tipo_proceso && (
                    <Text size="xs" c="orange" mt={8}>
                      Plan ligado a proceso de {p.parent_tipo_proceso === "RC"
                        ? "registro calificado"
                        : p.parent_tipo_proceso === "AV"
                          ? "acreditación voluntaria"
                          : p.parent_tipo_proceso}
                    </Text>
                  )}
                  <Text size="xs" c="blue" mt="sm" fw={600}>Abrir gestión →</Text>
                </>
              )}
            </Paper>
          );
        })}
      </Stack>

      <Modal opened={gestionarInfoOpen} onClose={() => setGestionarInfoOpen(false)} title="Sin procesos para gestionar" centered>
        <Text size="sm">
          No hay procesos activos RC, AV, AE ni PM para este programa. Puedes crearlos desde el tablero (Agregar proceso) o desde alertas cuando corresponda.
        </Text>
        <Button mt="md" onClick={() => setGestionarInfoOpen(false)}>Entendido</Button>
      </Modal>
    </Stack>
  );
}
