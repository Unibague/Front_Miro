"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Button, Text, Paper, Stack, Group, Loader, Modal, TextInput, Textarea, Select, SimpleGrid, Badge,
  Switch, ThemeIcon, Box, Grid,
} from "@mantine/core";
import { useParams, useRouter } from "next/navigation";
import {
  IconSchool, IconEdit, IconInfoCircle, IconFileCertificate, IconProgress, IconHistory,
  IconSettings, IconArrowRight, IconFileTypePdf, IconNotes, IconId, IconCircleCheck, IconCalendarTime, IconBooks,
} from "@tabler/icons-react";
import type { ElementType, ReactNode } from "react";
import classes from "./ProgramFicha.module.css";
import { paramKey } from "@/app/utils/routeParams";
import axios, { isAxiosError } from "axios";
import type { Program, Dependency, Process, Phase, ProcessHistoryRecord } from "../../types";
import { LABEL_PROCESO, PERIODICIDAD_ADMISION, faseColors, etiquetaSubtipoCompacta } from "../../constants";

/** Color del tipo de proceso (mismo esquema que tablero, alertas y gestión). */
const TIPO_COLOR: Record<string, string> = { RC: "blue", AV: "violet", AE: "teal", PM: "grape" };

/** Bloque de la ficha: tarjeta con icono y título, como las secciones de PDI. */
function SeccionFicha({ icon: Icon, color, titulo, descripcion, accion, children, variante, etiqueta }: {
  icon: ElementType;
  color: string;
  titulo: string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  children: ReactNode;
  variante?: "general" | "procesos" | "resoluciones";
  etiqueta?: string;
}) {
  return (
    <Paper withBorder radius="lg" p="lg" className={variante ? classes[variante] : undefined}>
      <Group justify="space-between" align="flex-start" mb="md" wrap="wrap" gap="sm" className={variante ? classes.sectionHeader : undefined}>
        <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0, flex: 1 }}>
          <ThemeIcon size={variante ? 40 : 34} radius={variante ? "md" : "xl"} variant={variante === "procesos" ? "filled" : "light"} color={color} style={{ flexShrink: 0 }}>
            <Icon size={18} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            {etiqueta && <Text size="xs" fw={700} tt="uppercase" c={color} mb={4} style={{ letterSpacing: "0.08em" }}>{etiqueta}</Text>}
            <Text fw={700} size="lg" lh={1.2}>{titulo}</Text>
            {descripcion && <Text size="xs" c="dimmed" mt={2}>{descripcion}</Text>}
          </Box>
        </Group>
        {accion}
      </Group>
      {children}
    </Paper>
  );
}

/** Par etiqueta / valor dentro de las tarjetas de resolución. */
function DatoResolucion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Text size="xs" c="dimmed" fw={600}>{label}</Text>
      <Text size="sm" fw={600} component="div">{children}</Text>
    </Box>
  );
}
import {
  textoCondicionFactorFase2,
  actividadEsReunionesParciales,
  actividadEsViabilidadFinanciera,
} from "../../utils/condicionFactorFase2";
import { formatFechaDDMMYY } from "../../utils/formatFechaCorta";
import { nombreLegible } from "../../utils/nombreLegible";
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
import { ClasificacionCineNbcSection, type CineFEdit, type NbcEdit } from "../../components/ClasificacionCineNbcSection";
import HistoricoProgramaModal from "../../components/HistoricoProgramaModal";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";
import ModuleHeader from "../../components/ModuleHeader";

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

function valorPeriodoDuracion(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return !normalized || /^\d+$/.test(normalized) ? "Semestral" : normalized;
}

function etiquetaEnfoque(value: string | null | undefined): string | null | undefined {
  return value === "Ambos" ? "Investigación y Profundización" : value;
}

function cineParaEdicion(cine: Program["cine_f"]): CineFEdit {
  return {
    campo_amplio: cine?.campo_amplio ?? "",
    campo_especifico: cine?.campo_especifico ?? "",
    campo_detallado: cine?.campo_detallado ?? "",
  };
}

function nbcParaEdicion(nbc: Program["nbc"]): NbcEdit {
  return {
    area_conocimiento: nbc?.area_conocimiento ?? "",
    nbc: nbc?.nbc ?? "",
  };
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
  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [observacionResolucionTarget, setObservacionResolucionTarget] = useState<{
    tipo: "RC" | "AV";
    texto: string;
  } | null>(null);
  const [observacionResolucionTexto, setObservacionResolucionTexto] = useState("");
  const [savingObservacionResolucion, setSavingObservacionResolucion] = useState(false);
  const [observacionResolucionMsg, setObservacionResolucionMsg] = useState<string | null>(null);
  const { setHasChanges, confirmNavigation } = useUnsavedChanges();

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
      out.push({ key: "RC-empty", proc: null, rotuloTipo: LABEL_PROCESO["RC"] });
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
      periodos_duracion: valorPeriodoDuracion(programa.periodos_duracion),
      enfoque: etiquetaEnfoque(programa.enfoque) ?? "",
      cine_f: cineParaEdicion(programa.cine_f),
      nbc: nbcParaEdicion(programa.nbc),
    });
    setEditando(true);
  };

  const guardar = async () => {
    if (!programa) return;
    if (!window.confirm("¿Está seguro de que desea guardar los cambios de la información del programa?")) return;
    setSaveError(null);
    setSaving(true);
    setHasChanges(false);
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";
    const codProgRaw = String(editForm.dep_code_programa ?? "").trim();
    const codProg = codProgRaw || null;
    const sniesRaw = String(editForm.codigo_snies ?? "").trim();
    try {
      const payload = {
        dep_code_programa: codProg,
        codigo_snies: sniesRaw || null,
        periodos_duracion: valorPeriodoDuracion(String(editForm.periodos_duracion ?? "")),
        enfoque: String(editForm.enfoque ?? "").trim() || null,
        cine_f: cineParaEdicion(editForm.cine_f),
        nbc: nbcParaEdicion(editForm.nbc),
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

  const abrirObservacionesResolucion = (tipo: "RC" | "AV", texto?: string) => {
    setObservacionResolucionTarget({ tipo, texto: LABEL_PROCESO[tipo] });
    setObservacionResolucionTexto(texto ?? "");
    setObservacionResolucionMsg(null);
  };

  const guardarObservacionesResolucion = async () => {
    if (!programa || !observacionResolucionTarget) return;
    setSavingObservacionResolucion(true);
    setObservacionResolucionMsg(null);
    try {
      const { tipo } = observacionResolucionTarget;
      const res = await axios.patch<{
        program: Program;
        advertencia: string | null;
      }>(
        `${process.env.NEXT_PUBLIC_API_URL}/programs/${programa._id}/resoluciones/${tipo}/observaciones`,
        { observaciones: observacionResolucionTexto },
      );
      setPrograma(res.data.program);
      setObservacionResolucionMsg(res.data.advertencia ?? "Observaciones guardadas.");
      if (res.data.advertencia) {
        setObservacionResolucionMsg(res.data.advertencia);
        return;
      }
      setObservacionResolucionTarget(null);
    } catch (e) {
      console.error(e);
      setObservacionResolucionMsg("No se pudieron guardar las observaciones.");
    } finally {
      setSavingObservacionResolucion(false);
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
    <Stack p="md" pt="xl" maw={1560} mx="auto" w="100%">
      <Stack gap="sm">
        <div>
          <ModuleHeader
            title={programa.nombre}
            icon={IconSchool}
            color="green"
            onBack={() => confirmNavigation(() => {
              router.push(processesMenRoutes.homeWithQuery({ vista: "informacion" }));
            }, { isBackNavigation: true })}
            backLabel="Volver a información del programa"
            description="Consulta la información académica y administrativa, y el estado de los procesos de calidad del programa."
            actions={
              <Button color="green" radius="md" leftSection={<IconSettings size={16} />} onClick={irGestionar}>
                Gestionar procesos del programa
              </Button>
            }
          />
        </div>

        <Paper withBorder radius="lg" px="md" py="sm" mt={-8}>
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <Group gap="xs" wrap="wrap">
            <Badge size="lg" color={estadoMenActivo ? "teal" : "red"} variant="light" tt="none"
              leftSection={estadoMenActivo ? <IconCircleCheck size={14} /> : null}>
              {estadoMenActivo ? "Activo ante el MEN" : "Inactivo ante el MEN"}
            </Badge>
            <Text size="xs" c="dimmed">{nombreLegible(facName)}</Text>
          </Group>

          <Stack gap={4} style={{ marginLeft: "auto", alignItems: "flex-end" }}>
            <Group gap="lg" align="center" wrap="wrap" justify="flex-end">
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
        </Paper>
      </Stack>

      <Grid gutter="md" align="flex-start">
      <Grid.Col span={{ base: 12, lg: 7 }}>
      <SeccionFicha
        icon={IconInfoCircle}
        color="blue"
        titulo="Información general"
        variante="general"
        etiqueta="Datos del programa"
        descripcion="Datos académicos y administrativos del programa."
        accion={!editando && (
          <Button size="xs" variant="light" leftSection={<IconEdit size={14} />} onClick={abrirEdicion}>Editar</Button>
        )}
      >
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
          <Select
            label="Periodos de duración"
            data={[...PERIODICIDAD_ADMISION]}
            value={String(editForm.periodos_duracion ?? "Semestral")}
            onChange={(value) => setEditForm((f) => ({ ...f, periodos_duracion: value ?? "Semestral" }))}
            allowDeselect={false}
          />
          <Select
            label="Enfoque"
            data={["Investigación", "Profundización", "Investigación y Profundización", "No aplica"]}
            value={String(editForm.enfoque ?? "") || null}
            onChange={(value) => setEditForm((f) => ({ ...f, enfoque: value }))}
            clearable
          />
          <ClasificacionCineNbcSection
            mode="edit"
            cine_f={cineParaEdicion(editForm.cine_f)}
            nbc={nbcParaEdicion(editForm.nbc)}
            onChangeCine={(key, value) => setEditForm((f) => ({
              ...f,
              cine_f: { ...cineParaEdicion(f.cine_f), [key]: value },
            }))}
            onChangeNbc={(key, value) => setEditForm((f) => ({
              ...f,
              nbc: { ...nbcParaEdicion(f.nbc), [key]: value },
            }))}
          />

          {saveError && (
            <Text size="sm" c="red">{saveError}</Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => { setSaveError(null); setHasChanges(false); setEditando(false); }}>Cancelar</Button>
            <Button size="xs" loading={saving} onClick={() => void guardar()}>Guardar</Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" verticalSpacing="sm">
            {([
              { titulo: "Identificación", icon: IconId, color: "blue", campos: [
                { label: "Código del programa", value: programa.dep_code_programa?.trim() || "—" },
                { label: "Código SNIES", value: programa.codigo_snies },
                { label: "Facultad", value: nombreLegible(facName) },
                { label: "Modalidad", value: programa.modalidad },
              ] },
              { titulo: "Estado", icon: IconCircleCheck, color: "teal", campos: [
                { label: "Estado ante MEN", value: programa.estado },
                { label: "Activo en universidad", value: activoUniversidad ? "Sí" : "No" },
                { label: "Programa acreditable", value: esAcreditable ? "Sí" : "No" },
              ] },
              { titulo: "Formación", icon: IconSchool, color: "violet", campos: [
                { label: "Nivel académico", value: programa.nivel_academico },
                { label: "Nivel de formación", value: programa.nivel_formacion },
                { label: "Enfoque", value: etiquetaEnfoque(programa.enfoque) },
                { label: "Créditos", value: programa.num_creditos },
              ] },
              { titulo: "Duración y admisión", icon: IconCalendarTime, color: "orange", campos: [
                { label: "Periodos de duración", value: valorPeriodoDuracion(programa.periodos_duracion) },
                { label: "Semestres", value: programa.num_semestres },
                { label: "Periodicidad de admisión", value: programa.admision_estudiantes },
                { label: "Estudiantes (1er periodo)", value: programa.num_estudiantes_saces },
              ] },
              { titulo: "Trayectoria", icon: IconHistory, color: "grape", campos: [
                { label: "RC totales", value: programa.total_rc },
                { label: "AV totales", value: programa.total_av },
                { label: "Reformas", value: cantidadReformasPrograma },
              ] },
              { titulo: "Clasificación CINE F 2013 AC", icon: IconBooks, color: "cyan", campos: [
                { label: "Campo amplio", value: programa.cine_f?.campo_amplio },
                { label: "Campo específico", value: programa.cine_f?.campo_especifico },
                { label: "Campo detallado", value: programa.cine_f?.campo_detallado },
              ] },
              { titulo: "Núcleo básico del conocimiento", icon: IconBooks, color: "indigo", campos: [
                { label: "Área de conocimiento", value: programa.nbc?.area_conocimiento },
                { label: "NBC", value: programa.nbc?.nbc },
              ] },
            ] as const).map((grupo) => (
              <Paper key={grupo.titulo} withBorder radius="md" p="sm">
                <Group gap={8} mb={6} wrap="nowrap">
                  <ThemeIcon size={26} radius="xl" variant="light" color={grupo.color}><grupo.icon size={15} /></ThemeIcon>
                  <Text size="sm" fw={700}>{grupo.titulo}</Text>
                </Group>
                <Stack gap={0}>
                  {grupo.campos.map((campo, idx) => (
                    <Group
                      key={campo.label}
                      justify="space-between"
                      wrap="nowrap"
                      gap="sm"
                      py={6}
                      style={{ borderTop: idx === 0 ? undefined : "1px solid var(--mantine-color-default-border)" }}
                    >
                      <Text size="xs" c="dimmed">{campo.label}</Text>
                      <Text size="sm" fw={600} ta="right" style={{ overflowWrap: "anywhere" }}>
                        {campo.value === null || campo.value === undefined || campo.value === "" ? "—" : String(campo.value)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            ))}
          </SimpleGrid>

        </Stack>
      )}
      </SeccionFicha>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 5 }}>
      <Stack gap="md">

      <Box style={{ order: 2 }}>
      <SeccionFicha
        icon={IconFileCertificate}
        color="violet"
        titulo="Resoluciones vigentes"
        variante="resoluciones"
        descripcion="Datos del último cierre registrado. Si aún no hay historial cerrado, se muestran los valores registrados en el programa (SNIES/resoluciones)."
        accion={
          <Button variant="light" size="xs" color="gray" leftSection={<IconHistory size={14} />} onClick={() => setHistoricoOpen(true)}>
            Ver histórico de procesos
          </Button>
        }
      >

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 1, xl: 2 }} spacing="md">
        {(["RC", "AV"] as const).map((t) => {
          const ult = t === "RC" ? programa.ultimo_rc : programa.ultimo_av;
          const proceso = procesosDelPrograma.find((p) => p.tipo_proceso === t);
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
          const tipoColor = TIPO_COLOR[t];
          return (
            <Stack key={t} gap="xs">
            <Paper
              withBorder
              radius="md"
              p="md"
              style={{ borderTop: `3px solid var(--mantine-color-${tipoColor}-5)`, height: "100%" }}
            >
              <Group justify="space-between" mb="sm" gap="xs" wrap="wrap">
                <Group gap={8} wrap="nowrap">
                  <Badge variant="light" color={tipoColor}>{t}</Badge>
                  <Text fw={700} size="sm">{LABEL_PROCESO[t]}</Text>
                </Group>
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
                      size="sm"
                      variant={vigenciaActiva ? "dot" : "outline"}
                      color={vigenciaActiva ? "teal" : "gray"}
                    >
                      {vigenciaActiva ? "Vigencia activa" : "Sin vigencia activa registrada"}
                    </Badge>
                  )}
                </Group>
              </Group>
              <Stack gap={2} mb="sm">
                <Text size="xs" c="dimmed">Subtipo: <Text span size="xs" fw={600} c="var(--mantine-color-text)">{proceso?.subtipo?.trim() || "—"}</Text></Text>
                {t === "RC" && proceso?.subtipo?.trim().toLowerCase() === "registro calificado de oficio" && (
                  <Text size="xs" c="blue"><strong>Registro calificado otorgado de oficio</strong></Text>
                )}
              </Stack>
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
                <Stack gap="sm">
                  <SimpleGrid cols={2} spacing="sm" verticalSpacing="sm">
                    <DatoResolucion label="Número / código">{codigo || "—"}</DatoResolucion>
                    <DatoResolucion label="Fecha resolución">{formatFechaDDMMYY(fecha ?? null)}</DatoResolucion>
                    <DatoResolucion label="Vigencia declarada">{duracion != null ? `${duracion} años` : "—"}</DatoResolucion>
                    <DatoResolucion label="Vencimiento">
                      {formatFechaDDMMYY(venc)}
                      {vencCalculado != null && !vencGuardado && (
                        <Text size="xs" c="dimmed" fw={400}>Estimado (resolución + vigencia)</Text>
                      )}
                    </DatoResolucion>
                  </SimpleGrid>
                  {link ? (
                    <Button
                      component="a"
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="xs"
                      variant="light"
                      color="red"
                      w="fit-content"
                      leftSection={<IconFileTypePdf size={14} />}
                    >
                      Abrir PDF de la resolución
                    </Button>
                  ) : (
                    <Text size="xs" c="dimmed">Sin PDF guardado (se asocia al cerrar el proceso aprobado).</Text>
                  )}
                </Stack>
              )}
              <Button
                size="xs"
                variant="subtle"
                color={tipoColor}
                w="fit-content"
                mt="sm"
                px={0}
                leftSection={<IconNotes size={14} />}
                onClick={() => abrirObservacionesResolucion(t, ult?.observaciones)}
              >
                {ult?.observaciones?.trim() ? "Ver / editar observaciones" : "Agregar observaciones"}
              </Button>
            </Paper>
            </Stack>
          );
        })}
      </SimpleGrid>
      </SeccionFicha>
      </Box>

      <Box style={{ order: 1 }}>
      <SeccionFicha
        icon={IconProgress}
        color="green"
        titulo="Procesos en curso"
        variante="procesos"
        etiqueta="Seguimiento de trámites"
        descripcion="Consulta la fase y la actividad pendiente de cada proceso activo."
        accion={loadingFasesProg ? <Loader size="xs" /> : (
          <Badge color="green" variant="light" size="lg" tt="none">
            {tarjetasProceso.filter((t) => t.proc).length} en curso
          </Badge>
        )}
      >

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 1, xl: 2 }} spacing="md">
        {tarjetasProceso.map((t) => {
          const p = t.proc;
          const colorProceso = p ? (TIPO_COLOR[p.tipo_proceso] ?? "gray") : "gray";
          const { nombreFase, actividad } = p ? faseTituloYActividad(p) : { nombreFase: "—", actividad: null as string | null };

          return (
            <Paper
              key={t.key}
              withBorder
              radius="md"
              p="md"
              className={p ? classes.activeProcess : classes.emptyProcess}
              style={{
                textAlign: "left",
                borderLeft: `4px solid var(--mantine-color-${colorProceso}-${p ? 5 : 3})`,
                backgroundColor: p ? undefined : "var(--mantine-color-default-hover)",
                cursor: p ? "pointer" : "default",
                display: "flex",
                flexDirection: "column",
              }}
              onClick={() => p && irGestionarProceso(p)}
            >
              <Group justify="space-between" align="flex-start" mb={6}>
                <Text fw={700} size="sm" style={{ whiteSpace: "pre-line", lineHeight: 1.35 }}>{t.rotuloTipo}</Text>
                {p ? (
                  <Badge variant="light" color={colorProceso} size="sm" tt="uppercase">{p.tipo_proceso}</Badge>
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
                <Stack gap={6} mt="xs">
                  <ThemeIcon color="gray" variant="light" radius="xl" size={30}><IconProgress size={17} /></ThemeIcon>
                  <Text size="sm" c="dimmed">No hay un trámite en curso.</Text>
                </Stack>
              ) : (
                <>
                  <Text size="xs" fw={700} c={colorProceso} tt="uppercase" mt="xs">Fase actual</Text>
                  <Text size="sm" fw={600}>{nombreFase}</Text>
                  <Text size="xs" c="dimmed" mt={2}>
                    Actividad: <strong style={{ color: "var(--mantine-color-text)" }}>{actividad ?? "(sin actividades pendientes en esta fase)"}</strong>
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
                    <Text size="xs" c="dimmed">Vencimiento de la vigencia: <strong style={{ color: "var(--mantine-color-text)" }}>{formatFechaDDMMYY(p.fecha_vencimiento)}</strong></Text>
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
                  <Group gap={4} mt="auto" pt="sm">
                    <Text size="xs" c={colorProceso} fw={700}>Abrir gestión</Text>
                    <IconArrowRight size={13} color={`var(--mantine-color-${colorProceso}-6)`} />
                  </Group>
                </>
              )}
            </Paper>
          );
        })}
      </SimpleGrid>
      </SeccionFicha>
      </Box>
      </Stack>
      </Grid.Col>
      </Grid>

      <Modal opened={gestionarInfoOpen} onClose={() => setGestionarInfoOpen(false)} title="Sin procesos para gestionar" centered>
        <Text size="sm">
          No hay procesos activos RC, AV, AE ni PM para este programa. Puedes crearlos desde el tablero (Agregar proceso) o desde alertas cuando corresponda.
        </Text>
        <Button mt="md" onClick={() => setGestionarInfoOpen(false)}>Entendido</Button>
      </Modal>

      <Modal
        opened={observacionResolucionTarget !== null}
        onClose={() => setObservacionResolucionTarget(null)}
        title={`Observaciones — ${observacionResolucionTarget?.texto ?? "Resolución"}`}
        centered
        size="md"
      >
        <Stack>
          <Textarea
            label="Observaciones de esta resolución"
            placeholder="Escribe observaciones..."
            minRows={4}
            autosize
            value={observacionResolucionTexto}
            onChange={(event) => {
              setObservacionResolucionTexto(event.currentTarget.value);
              setObservacionResolucionMsg(null);
            }}
          />
          {observacionResolucionMsg && (
            <Text size="xs" c={observacionResolucionMsg.startsWith("No") ? "red" : "green"}>
              {observacionResolucionMsg}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setObservacionResolucionTarget(null)}>
              Cancelar
            </Button>
            <Button size="xs" loading={savingObservacionResolucion} onClick={() => void guardarObservacionesResolucion()}>
              Guardar observaciones
            </Button>
          </Group>
        </Stack>
      </Modal>

      <HistoricoProgramaModal
        opened={historicoOpen}
        onClose={() => setHistoricoOpen(false)}
        programa={programa}
        programCode={programCodeKey(programa)}
      />
    </Stack>
  );
}
