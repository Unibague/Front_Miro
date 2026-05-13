"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Container, Title, Text, Paper, Group, Badge, Stack, Loader, Center,
  ActionIcon, Box, Divider, Collapse, Pagination, Select,
  ThemeIcon, SimpleGrid,
} from "@mantine/core";
import {
  IconHistory, IconArrowLeft, IconChevronDown, IconChevronUp,
  IconArrowNarrowRight, IconClock,
} from "@tabler/icons-react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { PDI_ROUTES } from "../api";
import PdiSidebar from "../components/PdiSidebar";

// ── Interfaces ───────────────────────────────────────────────────────────────

interface EntradaHistorial {
  _id: string;
  indicador_codigo: string;
  indicador_nombre: string;
  modificado_por: string;
  modificado_por_nombre: string;
  corte: string;
  antes: Record<string, any>;
  despues: Record<string, any>;
  campos_cambiados: string[];
  createdAt: string;
}

interface CorteItem    { _id: string; nombre: string; descripcion: string; fecha_inicio: string | null; fecha_fin: string | null; }
interface MacroItem    { _id: string; codigo: string; nombre: string; }
interface ProyectoItem { _id: string; codigo: string; nombre: string; }

// ── Campos internos que no se muestran ──────────────────────────────────────

const OCULTOS = new Set([
  "avances_por_anio", "avance_total_real", "updatedAt", "createdAt",
  "accion_id", "_id", "indicador_id",
]);

const LABEL: Record<string, string> = {
  avance: "Avance (%)", observaciones: "Observaciones",
  meta_final_2029: "Meta final", responsable: "Responsable",
  nombre: "Nombre", codigo: "Código", peso: "Peso (%)",
  tipo_calculo: "Tipo de cálculo", entregable: "Entregable",
  fecha_inicio: "Fecha inicio", fecha_fin: "Fecha fin",
  presupuesto: "Presupuesto", tipo_seguimiento: "Tipo seguimiento",
  responsable_email: "Email responsable",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const getMacroCod = (c: string) => c.split("-")[0] ?? "";
const getProyCod  = (c: string) => c.split("-").slice(0, 2).join("-");

const nombreEditor = (e: EntradaHistorial) =>
  e.modificado_por_nombre || e.modificado_por || "";

function fmt(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function esObjectId(v: any) {
  return typeof v === "string" && /^[a-f0-9]{24}$/.test(v);
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// 0, null, "" y undefined son equivalentes para "sin avance"
function sinDato(v: any) {
  return v === null || v === undefined || v === "" || v === 0 || v === "0";
}

// Tipo de cambio que ocurrió en los periodos
function tipoAccionPeriodos(antes: any[], despues: any[]): "aprobado" | "rechazado" | "enviado" | "avance" | "otro" {
  for (const dp of despues) {
    const ap = antes.find(x => x.periodo === dp.periodo);
    if (dp.estado_reporte === "Aprobado"  && ap?.estado_reporte !== "Aprobado")  return "aprobado";
    if (dp.estado_reporte === "Rechazado" && ap?.estado_reporte !== "Rechazado") return "rechazado";
    if (dp.estado_reporte === "Enviado"   && ap?.estado_reporte !== "Enviado")   return "enviado";
  }
  const hayAvance = despues.some(dp => {
    const ap = antes.find(x => x.periodo === dp.periodo);
    return ap && !(sinDato(dp.avance) && sinDato(ap.avance)) && fmt(dp.avance) !== fmt(ap.avance);
  });
  return hayAvance ? "avance" : "otro";
}

interface PeriodoCambio {
  periodo: string;
  diffs: { campo: string; av: string; dv: string }[];
  reportado_por?: string;
}

// Devuelve SOLO los periodos donde algo relevante cambió, sin falsos positivos
function periodosDiff(antes: any[], despues: any[], tipo: string, corteActivo = ""): PeriodoCambio[] {
  const EXTRAS: [string, string][] = [
    ["Resultados", "resultados_alcanzados"],
    ["Logros", "logros"],
    ["Alertas", "alertas"],
    ["Justificación", "justificacion_retrasos"],
  ];

  const buildDiffs = (dp: any, ap: any, incluirEstado: boolean) => {
    const diffs: { campo: string; av: string; dv: string }[] = [];
    if (!(sinDato(dp.avance) && sinDato(ap.avance)) && fmt(dp.avance) !== fmt(ap.avance))
      diffs.push({ campo: "Avance", av: fmt(ap.avance), dv: fmt(dp.avance) });
    if (fmt(dp.meta) !== fmt(ap.meta))
      diffs.push({ campo: "Meta", av: fmt(ap.meta), dv: fmt(dp.meta) });
    for (const [label, key] of EXTRAS) {
      if (fmt(dp[key]) !== fmt(ap[key]))
        diffs.push({ campo: label, av: fmt(ap[key]), dv: fmt(dp[key]) });
    }
    if (incluirEstado && dp.estado_reporte !== ap.estado_reporte)
      diffs.push({ campo: "Estado", av: fmt(ap.estado_reporte), dv: fmt(dp.estado_reporte) });
    return diffs;
  };

  // Aprobado / Rechazado: solo el periodo que cambió a ese estado
  if (tipo === "aprobado" || tipo === "rechazado") {
    const estadoTarget = tipo === "aprobado" ? "Aprobado" : "Rechazado";
    return despues
      .filter(dp => dp.estado_reporte === estadoTarget && antes.find(x => x.periodo === dp.periodo)?.estado_reporte !== estadoTarget)
      .map(dp => {
        const ap = antes.find(x => x.periodo === dp.periodo) ?? {};
        const diffs = buildDiffs(dp, ap, true);
        return diffs.length ? { periodo: dp.periodo, diffs, reportado_por: dp.reportado_por } : null;
      })
      .filter(Boolean) as PeriodoCambio[];
  }

  // Enviado: prioridad a periodos con datos reales modificados (avance/meta/cualitativos)
  if (tipo === "enviado") {
    const candidatos = despues.filter(dp => dp.estado_reporte === "Enviado" && antes.find(x => x.periodo === dp.periodo)?.estado_reporte !== "Enviado");
    // 1. Periodos con avance u otros datos reales cambiados
    const conDatosReales = candidatos
      .map(dp => {
        const ap = antes.find(x => x.periodo === dp.periodo) ?? {};
        const diffs = buildDiffs(dp, ap, false); // sin incluir estado
        return diffs.length ? { periodo: dp.periodo, diffs, reportado_por: dp.reportado_por } : null;
      })
      .filter(Boolean) as PeriodoCambio[];

    if (conDatosReales.length) return conDatosReales;

    // 2. Si ninguno tiene datos reales, mostrar solo el periodo del corte activo
    const delCorte = candidatos.find(dp => dp.periodo === corteActivo);
    if (delCorte) {
      const ap = antes.find(x => x.periodo === delCorte.periodo) ?? {};
      return [{ periodo: delCorte.periodo, diffs: buildDiffs(delCorte, ap, true), reportado_por: delCorte.reportado_por }];
    }

    // 3. Último recurso: mostrar solo el primero
    if (candidatos.length) {
      const dp = candidatos[0];
      const ap = antes.find(x => x.periodo === dp.periodo) ?? {};
      return [{ periodo: dp.periodo, diffs: buildDiffs(dp, ap, true), reportado_por: dp.reportado_por }];
    }
    return [];
  }

  // Avance / otro: periodos con cualquier cambio real
  return despues
    .map(dp => {
      const ap = antes.find(x => x.periodo === dp.periodo) ?? {};
      const diffs = buildDiffs(dp, ap, dp.estado_reporte !== ap.estado_reporte);
      return diffs.length ? { periodo: dp.periodo, diffs, reportado_por: dp.reportado_por } : null;
    })
    .filter(Boolean) as PeriodoCambio[];
}

// Devuelve evidencias agregadas, quitadas y con estado cambiado
function evidenciasDiff(antes: any[], despues: any[]) {
  const key = (e: any) => String(e._id ?? e.filename ?? e.nombre_original);
  const antesMap = new Map(antes.map(e => [key(e), e]));
  const despuesMap = new Map(despues.map(e => [key(e), e]));
  return {
    agregadas:     despues.filter(e => !antesMap.has(key(e))),
    quitadas:      antes.filter(e => !despuesMap.has(key(e))),
    estadoCambiado: despues
      .filter(e => antesMap.has(key(e)) && antesMap.get(key(e))!.estado !== e.estado)
      .map(e => ({ nombre: e.nombre_original, av: antesMap.get(key(e))!.estado, dv: e.estado })),
  };
}

function detectarAccion(e: EntradaHistorial): { texto: string; color: string; tipo: string } {
  if (e.campos_cambiados.includes("periodos")) {
    const ap: any[] = Array.isArray(e.antes?.periodos)  ? e.antes.periodos  : [];
    const dp: any[] = Array.isArray(e.despues?.periodos) ? e.despues.periodos : [];
    const tipo = tipoAccionPeriodos(ap, dp);
    if (tipo === "aprobado")  return { texto: "Aprobado por líder",  color: "teal",   tipo };
    if (tipo === "rechazado") return { texto: "Rechazado por líder", color: "red",    tipo };
    if (tipo === "enviado")   return { texto: "Reporte enviado",     color: "blue",   tipo };
    if (tipo === "avance")    return { texto: "Avance actualizado",      color: "violet", tipo };
    return { texto: "Editado por administrador", color: "orange", tipo };
  }
  if (e.campos_cambiados.includes("evidencias")) return { texto: "Evidencia adjuntada",      color: "indigo", tipo: "evidencias" };
  return { texto: "Editado por administrador", color: "orange", tipo: "otro" };
}

// ── Detalle expandido ────────────────────────────────────────────────────────

function FilaCambio({ campo, av, dv }: { campo: string; av: string; dv: string }) {
  return (
    <Group gap={0} wrap="nowrap" style={{ borderBottom: "1px solid var(--mantine-color-default-border)" }} py={6} px={10}>
      <Text size="xs" c="dimmed" style={{ minWidth: 130, flexShrink: 0 }}>{campo}</Text>
      <Text size="xs" c="dimmed" style={{ minWidth: 90 }}>{av}</Text>
      <IconArrowNarrowRight size={13} style={{ flexShrink: 0, margin: "0 6px", color: "var(--mantine-color-dimmed)" }} />
      <Text size="xs" fw={600}>{dv}</Text>
    </Group>
  );
}

function DetalleCambios({ entrada }: { entrada: EntradaHistorial }) {
  const accion = detectarAccion(entrada);
  const campos = entrada.campos_cambiados.filter(c => !OCULTOS.has(c));
  const bloques: React.ReactNode[] = [];

  for (const campo of campos) {
    const vA = entrada.antes?.[campo];
    const vD = entrada.despues?.[campo];

    // Periodos
    if (campo === "periodos") {
      const ap  = Array.isArray(vA) ? vA : [];
      const dp  = Array.isArray(vD) ? vD : [];
      const cambios = periodosDiff(ap, dp, accion.tipo, entrada.corte);
      if (!cambios.length) continue;

      // Contexto: quién hizo qué
      const primerPeriodo = cambios[0];
      const reportadoPor  = primerPeriodo?.reportado_por
        ?? dp.find((d: any) => d.reportado_por)?.reportado_por;

      const nombre      = nombreEditor(entrada);
      const aprobador   = nombre || null;
      const mismaPersona = !aprobador || aprobador === reportadoPor;
      const accionLabel  = accion.tipo === "aprobado" ? "Aprobado" : "Rechazado";

      const contexto = (accion.tipo === "aprobado" || accion.tipo === "rechazado") ? (
        <Group gap={6} mb={10} px={2}>
          <Text size="xs" c="dimmed">{accionLabel} por</Text>
          {mismaPersona && reportadoPor ? (
            <Text size="xs" fw={600}>
              {reportadoPor}
              <Text span size="xs" c="dimmed" fw={400}> (quien reportó)</Text>
            </Text>
          ) : (
            <>
              <Text size="xs" fw={600}>{aprobador ?? "—"}</Text>
              {reportadoPor && (
                <>
                  <Text size="xs" c="dimmed">· Reportado por</Text>
                  <Text size="xs" fw={600}>{reportadoPor}</Text>
                </>
              )}
            </>
          )}
        </Group>
      ) : accion.tipo === "enviado" && reportadoPor ? (
        <Group gap={6} mb={10} px={2}>
          <Text size="xs" c="dimmed">Enviado por</Text>
          <Text size="xs" fw={600}>{reportadoPor}</Text>
        </Group>
      ) : accion.tipo === "avance" && nombre ? (
        <Group gap={6} mb={10} px={2}>
          <Text size="xs" c="dimmed">Actualizado por</Text>
          <Text size="xs" fw={600}>{nombre}</Text>
        </Group>
      ) : accion.tipo === "otro" && nombre ? (
        <Group gap={6} mb={10} px={2}>
          <Badge size="xs" color="orange" variant="light" radius="sm">Administrador</Badge>
          <Text size="xs" fw={600}>{nombre}</Text>
        </Group>
      ) : null;

      bloques.push(
        <Box key="periodos">
          {contexto}
          <Stack gap={6}>
            {cambios.map(({ periodo, diffs }) => (
              <Paper key={periodo} withBorder radius="sm">
                <Box px={10} py={5} style={{ background: "var(--mantine-color-default-hover)", borderRadius: "var(--mantine-radius-sm) var(--mantine-radius-sm) 0 0" }}>
                  <Text size="xs" fw={700}>{periodo}</Text>
                </Box>
                {diffs.map(d => <FilaCambio key={d.campo} campo={d.campo} av={d.av} dv={d.dv} />)}
              </Paper>
            ))}
          </Stack>
        </Box>
      );
      continue;
    }

    // Evidencias
    if (campo === "evidencias") {
      const { agregadas, quitadas, estadoCambiado } = evidenciasDiff(
        Array.isArray(vA) ? vA : [],
        Array.isArray(vD) ? vD : [],
      );
      if (!agregadas.length && !quitadas.length && !estadoCambiado.length) continue;
      bloques.push(
        <Box key="evidencias">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb={6} style={{ letterSpacing: "0.05em" }}>
            Evidencias
          </Text>
          <Stack gap={4}>
            {agregadas.map((e: any, i: number) => (
              <Group key={i} gap={8} px={10} py={6} style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 6 }}>
                <Badge size="xs" color="blue" variant="light">Agregada</Badge>
                <Text size="xs" style={{ flex: 1 }}>{e.nombre_original ?? "—"}</Text>
                {e.subido_por && <Text size="xs" c="dimmed">por {e.subido_por}</Text>}
              </Group>
            ))}
            {quitadas.map((e: any, i: number) => (
              <Group key={i} gap={8} px={10} py={6} style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 6 }}>
                <Badge size="xs" color="gray" variant="light">Eliminada</Badge>
                <Text size="xs">{e.nombre_original ?? "—"}</Text>
              </Group>
            ))}
            {estadoCambiado.map((e, i) => (
              <Group key={i} gap={8} px={10} py={6} wrap="nowrap" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 6 }}>
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>Estado</Text>
                <Text size="xs" style={{ flex: 1 }} lineClamp={1}>{e.nombre}</Text>
                <Text size="xs" c="dimmed">{e.av}</Text>
                <IconArrowNarrowRight size={13} style={{ flexShrink: 0 }} />
                <Text size="xs" fw={600}>{e.dv}</Text>
              </Group>
            ))}
          </Stack>
        </Box>
      );
      continue;
    }

    // Caso especial: accion_id → mostrar reasignación con código/nombre
    if (campo === "accion_id") {
      const nueva = typeof vD === "object" && vD !== null ? vD : null;
      if (nueva?.codigo || nueva?.nombre) {
        bloques.push(
          <Paper key="accion_id" withBorder radius="sm">
            <FilaCambio
              campo="Acción estratégica"
              av="(anterior)"
              dv={[nueva.codigo, nueva.nombre].filter(Boolean).join(" — ")}
            />
          </Paper>
        );
      }
      continue;
    }

    // Ignorar IDs crudos y objetos técnicos sin info útil
    if (esObjectId(vA)) continue;
    if (typeof vA === "object" && vA !== null && "_id" in vA) continue;
    if (typeof vD === "object" && vD !== null && "_id" in vD && !("codigo" in vD) && !("nombre" in vD)) continue;

    const textoA = fmt(vA);
    const textoD = fmt(vD);
    if (textoA === textoD) continue;

    bloques.push(
      <Paper key={campo} withBorder radius="sm">
        <FilaCambio campo={LABEL[campo] ?? campo} av={textoA} dv={textoD} />
      </Paper>
    );
  }

  // Campos técnicos sin representación visual → listar qué se tocó
  const camposTecnicos = campos
    .filter(c => !OCULTOS.has(c) && c !== "periodos" && c !== "evidencias" && c !== "accion_id")
    .filter(c => {
      const vA = entrada.antes?.[c];
      return esObjectId(vA) || (typeof vA === "object" && vA !== null && "_id" in vA);
    });

  if (camposTecnicos.length && !bloques.length) {
    bloques.push(
      <Group key="_tecnico" gap={6} wrap="wrap">
        <Text size="xs" c="dimmed">Campos actualizados:</Text>
        {camposTecnicos.map(c => (
          <Badge key={c} size="xs" color="orange" variant="outline" radius="sm">
            {LABEL[c] ?? c}
          </Badge>
        ))}
      </Group>
    );
  }

  if (!bloques.length) return null;
  return <Stack gap="md">{bloques}</Stack>;
}

// ── Tarjeta de entrada ───────────────────────────────────────────────────────

// Determina rápido si hay algo visible que expandir
function hayDetalle(entrada: EntradaHistorial): boolean {
  const campos = entrada.campos_cambiados.filter(c => !OCULTOS.has(c));
  if (!campos.length) return false;
  if (campos.includes("periodos")) {
    const ap = Array.isArray(entrada.antes?.periodos)  ? entrada.antes.periodos  : [];
    const dp = Array.isArray(entrada.despues?.periodos) ? entrada.despues.periodos : [];
    const tipo = tipoAccionPeriodos(ap, dp);
    return periodosDiff(ap, dp, tipo, entrada.corte).length > 0;
  }
  if (campos.includes("evidencias")) return true;
  // accion_id con objeto poblado
  if (campos.includes("accion_id")) {
    const vD = entrada.despues?.accion_id;
    if (typeof vD === "object" && vD !== null && (vD.codigo || vD.nombre)) return true;
  }
  return campos.some(c => {
    const vA = entrada.antes?.[c];
    const vD = entrada.despues?.[c];
    if (esObjectId(vA)) return false;
    if (typeof vA === "object" && vA !== null && "_id" in vA) return false;
    if (typeof vD === "object" && vD !== null && "_id" in vD && !("codigo" in vD) && !("nombre" in vD)) return false;
    return fmt(vA) !== fmt(vD);
  });
}

function EntradaCambio({ entrada }: { entrada: EntradaHistorial }) {
  const [open, setOpen] = useState(false);
  const accion  = detectarAccion(entrada);
  const expandir = hayDetalle(entrada);

  return (
    <Paper withBorder radius="md" p="md" shadow="xs">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap={12} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <ThemeIcon size={34} radius="xl" color={accion.tipo === "otro" ? "orange" : "blue"} variant="light" style={{ flexShrink: 0 }}>
            <IconHistory size={16} />
          </ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Group gap={6} mb={4} wrap="nowrap">
              <Text size="xs" fw={700} c="dimmed" style={{ whiteSpace: "nowrap" }}>
                {entrada.indicador_codigo}
              </Text>
              <Text size="sm" fw={600} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entrada.indicador_nombre}
              </Text>
            </Group>
            <Group gap={12} wrap="wrap">
              <Group gap={4}>
                <IconClock size={11} color="var(--mantine-color-dimmed)" />
                <Text size="xs" c="dimmed">{formatFecha(entrada.createdAt)}</Text>
              </Group>
              {entrada.corte && (
                <Badge size="xs" variant="outline" color="gray" radius="sm">
                  {entrada.corte}
                </Badge>
              )}
              <Badge size="xs" color={accion.color} variant="light" radius="sm">
                {accion.texto}
              </Badge>
            </Group>
          </Box>
        </Group>

        {expandir && (
          <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setOpen(v => !v)} style={{ flexShrink: 0 }}>
            {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </ActionIcon>
        )}
      </Group>

      {expandir && (
        <Collapse in={open}>
          <Divider my="md" />
          <DetalleCambios entrada={entrada} />
        </Collapse>
      )}
    </Paper>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function HistorialPage() {
  const router = useRouter();

  const [historial, setHistorial]       = useState<EntradaHistorial[]>([]);
  const [loading, setLoading]           = useState(true);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);

  const [macros, setMacros]             = useState<MacroItem[]>([]);
  const [proyectos, setProyectos]       = useState<ProyectoItem[]>([]);
  const [cortes, setCortes]             = useState<CorteItem[]>([]);

  const [filtroMacro, setFiltroMacro]       = useState<string | null>(null);
  const [filtroProyecto, setFiltroProyecto] = useState<string | null>(null);
  const [filtroCorteId, setFiltroCorteId]   = useState<string | null>(null); // _id del corte

  useEffect(() => {
    axios.get(PDI_ROUTES.macroproyectos()).then(r => setMacros(r.data)).catch(() => {});
    axios.get(PDI_ROUTES.cortes()).then(r => setCortes(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    setFiltroProyecto(null);
    if (!filtroMacro) { setProyectos([]); return; }
    axios.get(PDI_ROUTES.proyectos(), { params: { macroproyecto_id: filtroMacro } })
      .then(r => setProyectos(r.data)).catch(() => {});
  }, [filtroMacro]);

  useEffect(() => {
    setLoading(true);
    const corteSeleccionado = cortes.find(c => c._id === filtroCorteId) ?? null;
    const params: Record<string, any> = { page, limit: 20 };
    if (corteSeleccionado) {
      // Filtrar por nombre del corte (campo almacenado) Y por rango de fechas si están disponibles
      params.corte = corteSeleccionado.nombre;
      if (corteSeleccionado.fecha_inicio) params.fechaInicio = corteSeleccionado.fecha_inicio;
      if (corteSeleccionado.fecha_fin)    params.fechaFin    = corteSeleccionado.fecha_fin;
    }
    axios.get(PDI_ROUTES.historial(), { params })
      .then(r => { setHistorial(r.data.historial); setTotalPages(r.data.pages); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, filtroCorteId, cortes]);

  const handleFiltroCorte = (v: string | null) => { setFiltroCorteId(v); setPage(1); };
  const handleFiltroMacro = (v: string | null) => { setFiltroMacro(v); setPage(1); };

  const macroCodigo    = macros.find(m => m._id === filtroMacro)?.codigo      ?? null;
  const proyectoCodigo = proyectos.find(p => p._id === filtroProyecto)?.codigo ?? null;

  const filtrado = useMemo(() => historial.filter(h => {
    if (macroCodigo    && getMacroCod(h.indicador_codigo) !== macroCodigo)    return false;
    if (proyectoCodigo && getProyCod(h.indicador_codigo)  !== proyectoCodigo) return false;
    if (!hayDetalle(h)) return false;
    return true;
  }), [historial, macroCodigo, proyectoCodigo]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <PdiSidebar />
      <div style={{ flex: 1, overflow: "auto" }}>
        <Container size="xl" py="xl">

          {/* Header */}
          <Group justify="space-between" mb="xl" align="flex-start">
            <Group gap={10}>
              <ActionIcon variant="subtle" onClick={() => router.push("/pdi")}>
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon size={42} radius="xl" color="blue" variant="light">
                <IconHistory size={22} />
              </ThemeIcon>
              <div>
                <Title order={3}>Historial PDI</Title>
                <Text size="sm" c="dimmed">Registro de cambios</Text>
              </div>
            </Group>
          </Group>

          {/* Filtros */}
          <SimpleGrid cols={{ base: 1, sm: 3 }} mb="md">
            <Select
              placeholder="Macroproyecto"
              data={macros.map(m => ({ value: m._id, label: `${m.codigo} — ${m.nombre}` }))}
              value={filtroMacro}
              onChange={handleFiltroMacro}
              clearable
              size="sm"
            />
            <Select
              placeholder="Proyecto"
              data={proyectos.map(p => ({ value: p._id, label: `${p.codigo} — ${p.nombre}` }))}
              value={filtroProyecto}
              onChange={setFiltroProyecto}
              clearable
              disabled={!filtroMacro}
              size="sm"
            />
            <Select
              placeholder="Periodo"
              data={cortes.map(c => ({
                value: c._id,
                label: c.descripcion ? `${c.nombre} — ${c.descripcion}` : c.nombre,
              }))}
              value={filtroCorteId}
              onChange={handleFiltroCorte}
              clearable
              size="sm"
            />
          </SimpleGrid>

          <Divider mb="lg" />

          {/* Lista */}
          {loading ? (
            <Center py="xl"><Loader color="blue" /></Center>
          ) : filtrado.length === 0 ? (
            <Center py="xl">
              <Stack align="center" gap="xs">
                <ThemeIcon size={56} radius="xl" color="blue" variant="light">
                  <IconHistory size={28} />
                </ThemeIcon>
                <Text fw={600}>Sin registros</Text>
                <Text size="sm" c="dimmed">Los cambios en indicadores aparecerán aquí</Text>
              </Stack>
            </Center>
          ) : (
            <Stack gap="sm">
              <Group justify="space-between" mb="xs">
                <Text size="sm" c="dimmed" fw={500}>
                  {filtrado.length} registro{filtrado.length !== 1 ? "s" : ""}
                </Text>
                {totalPages > 1 && (
                  <Text size="xs" c="dimmed">Página {page} de {totalPages}</Text>
                )}
              </Group>

              {filtrado.map(e => <EntradaCambio key={e._id} entrada={e} />)}

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
