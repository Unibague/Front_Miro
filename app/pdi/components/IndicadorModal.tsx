"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Modal, TextInput, Button, Group, Stack,
  Textarea, Select, MultiSelect, Tabs, ActionIcon, Paper,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { showNotification } from "@mantine/notifications";
import { IconPlus, IconTrash, IconGripVertical } from "@tabler/icons-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import axios from "axios";
import "dayjs/locale/es";
import { useSession } from "next-auth/react";
import type { Accion, Indicador, Proyecto } from "../types";
import { PDI_ROUTES } from "../api";
import { usePdiConfig } from "../hooks/usePdiConfig";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";
import {
  extractNumberSegment,
  getEntityId,
  getFirstAvailableNumber,
  getIndicatorPrefix,
  normalizePdiCode,
} from "../code-validation";
import { hasDecimalDot, normalizeDecimalComma } from "../avance-utils";

interface Props {
  opened: boolean;
  onClose: () => void;
  selected: Indicador | null;
  defaultAccionId: string;
  onSaved: (doc: Indicador) => void;
}

interface PeriodoForm {
  periodo: string;
  meta: string;
  avanceInicial: number | string | null;
  fechaInicio: Date | null;
  fechaFin: Date | null;
}

function SortablePeriodoItem({ id, p, idx, periodoOptions, onUpdatePeriodo, onRemovePeriodo }: {
  id: string;
  p: PeriodoForm;
  idx: number;
  periodoOptions: { value: string; label: string }[];
  onUpdatePeriodo: (idx: number, field: keyof PeriodoForm, value: string) => void;
  onRemovePeriodo: (idx: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <Paper ref={setNodeRef} style={style} withBorder radius="md" p="sm">
      <Group align="end" wrap="nowrap">
        <ActionIcon variant="subtle" color="gray" style={{ cursor: "grab", touchAction: "none" }} {...attributes} {...listeners}>
          <IconGripVertical size={16} />
        </ActionIcon>
        <Select
          label="Periodo"
          placeholder={periodoOptions.length ? "Selecciona un corte" : "Sin cortes activos"}
          data={periodoOptions}
          value={p.periodo || null}
          onChange={(value) => onUpdatePeriodo(idx, "periodo", value ?? "")}
          style={{ flex: 1 }}
          searchable
          clearable
          nothingFoundMessage="Sin cortes disponibles"
        />
        <TextInput
          label="Meta"
          placeholder="Meta"
          value={p.meta}
          onChange={(e) => onUpdatePeriodo(idx, "meta", e.currentTarget.value)}
          onBlur={(e) => {
            const normalizado = normalizeDecimalComma(e.currentTarget.value);
            if (normalizado !== e.currentTarget.value) {
              onUpdatePeriodo(idx, "meta", normalizado);
              showNotification({
                title: "Formato de número",
                message: "Los decimales deben ir con coma (,), se corrigió automáticamente.",
                color: "yellow",
              });
            }
          }}
          error={hasDecimalDot(p.meta) ? "Usa coma (,) en vez de punto" : undefined}
          style={{ width: 120 }}
        />
        <ActionIcon color="red" variant="light" onClick={() => onRemovePeriodo(idx)}>
          <IconTrash size={16} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}

export default function IndicadorModal({ opened, onClose, selected, defaultAccionId, onSaved }: Props) {
  const { config } = usePdiConfig();
  const { data: session } = useSession();
  const { setHasChanges, confirmNavigation } = useUnsavedChanges();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [entregable, setEntregable] = useState("");
  const [formula, setFormula] = useState("");
  const [tipoSeguimiento, setTipoSeguimiento] = useState("");
  const [cortesSegimiento, setCortesSegimiento] = useState<string[]>([]);
  const [tipoCalculo, setTipoCalculo] = useState("promedio");
  const [metaFinal, setMetaFinal] = useState("");
  const [presupuesto, setPresupuesto] = useState<number | string>("");
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin] = useState<Date | null>(null);
  const [periodos, setPeriodos] = useState<PeriodoForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [cortesData, setCortesData] = useState<{ nombre: string; descripcion: string }[]>([]);
  const [cortes, setCortes] = useState<string[]>([]);
  const [accionPadre, setAccionPadre] = useState<Accion | null>(null);
  const [proyectoPadre, setProyectoPadre] = useState<Proyecto | null>(null);
  const [indicadoresPdi, setIndicadoresPdi] = useState<Indicador[]>([]);
  const [indicadoresLoaded, setIndicadoresLoaded] = useState(false);
  const [jerarquiaLoaded, setJerarquiaLoaded] = useState(false);

  useEffect(() => {
    axios.get(PDI_ROUTES.cortesActivos())
      .then((res) => {
        const sorted = [...res.data].sort((a: any, b: any) =>
          a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: "base" })
        );
        // Deduplicar por nombre para evitar opciones duplicadas en Mantine
        const vistos = new Set<string>();
        const unicos = sorted.filter((c: any) => {
          if (vistos.has(c.nombre)) return false;
          vistos.add(c.nombre);
          return true;
        });
        setCortesData(unicos.map((c: any) => ({ nombre: c.nombre, descripcion: c.descripcion ?? "" })));
        setCortes(unicos.map((c: any) => c.nombre));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!opened) { setHasChanges(false); return; }

    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setEntregable(selected.entregable ?? "");
      setFormula(selected.formula ?? "");
      setTipoSeguimiento(selected.tipo_seguimiento ?? "");
      setCortesSegimiento(
        selected.fecha_seguimiento
          ? selected.fecha_seguimiento.split(",").map((s) => s.trim()).filter(Boolean)
          : []
      );
      setTipoCalculo(selected.tipo_calculo ?? "promedio");
      setMetaFinal(selected.meta_final_2029 != null ? normalizeDecimalComma(String(selected.meta_final_2029)) : "");
      setPresupuesto(selected.presupuesto ?? "");
      setFechaInicio(selected.fecha_inicio ? new Date(selected.fecha_inicio) : null);
      setFechaFin(selected.fecha_fin ? new Date(selected.fecha_fin) : null);
      setPeriodos((selected.periodos ?? []).map((p) => ({
        periodo: p.periodo,
        meta: p.meta != null ? normalizeDecimalComma(String(p.meta)) : "",
        avanceInicial: p.avance ?? 0,
        fechaInicio: (p as any).fecha_inicio ? new Date((p as any).fecha_inicio) : null,
        fechaFin: (p as any).fecha_fin ? new Date((p as any).fecha_fin) : null,
      })));
      return;
    }

    setCodigo("");
    setNombre("");
    setEntregable("");
    setFormula("");
    setTipoSeguimiento("");
    setCortesSegimiento([]);
    setTipoCalculo("promedio");
    setMetaFinal("");
    setPresupuesto("");
    setFechaInicio(null);
    setFechaFin(null);
    setPeriodos(cortesData.map((c) => ({ periodo: c.nombre, meta: "", avanceInicial: 0, fechaInicio: null, fechaFin: null })));
  }, [opened, selected, cortesData, setHasChanges]);

  useEffect(() => {
    if (!opened || selected || cortesData.length === 0 || periodos.length > 0) return;
    setPeriodos(cortesData.map((c) => ({ periodo: c.nombre, meta: "", avanceInicial: 0, fechaInicio: null, fechaFin: null })));
  }, [cortesData, opened, periodos.length, selected]);

  const periodoSelectNames = useMemo(
    () => (cortesSegimiento.length > 0 ? cortesSegimiento : cortes),
    [cortes, cortesSegimiento]
  );

  const periodoSelectOptions = useMemo(() => {
    return periodoSelectNames.map((nombre) => ({
      value: nombre,
      label: nombre,
    }));
  }, [periodoSelectNames]);

  useEffect(() => {
    if (!opened || selected || periodoSelectNames.length === 0) return;

    setPeriodos((prev) => {
      const anteriores = new Map(prev.map((item) => [item.periodo, item]));
      return periodoSelectNames.map((periodo) =>
        anteriores.get(periodo) ?? { periodo, meta: "", avanceInicial: 0, fechaInicio: null, fechaFin: null }
      );
    });
  }, [opened, periodoSelectNames, selected]);

  const getPeriodoOptions = (idx: number) => {
    const usados = new Set(
      periodos
        .filter((_, i) => i !== idx)
        .map((item) => item.periodo)
        .filter(Boolean)
    );
    const current = periodos[idx]?.periodo;
    const options = periodoSelectOptions.filter((option) => option.value === current || !usados.has(option.value));

    if (current && !options.some((option) => option.value === current)) {
      options.push({ value: current, label: current });
    }

    return options;
  };

  const getNextPeriodo = (items: PeriodoForm[]) => {
    const usados = new Set(items.map((item) => item.periodo).filter(Boolean));
    return periodoSelectOptions.find((option) => !usados.has(option.value))?.value ?? "";
  };

  const canAddPeriodo = periodoSelectOptions.some((option) => !periodos.some((p) => p.periodo === option.value));

  const addPeriodo = () => setPeriodos((p) => [...p, { periodo: getNextPeriodo(p), meta: "", avanceInicial: 0, fechaInicio: null, fechaFin: null }]);
  const updatePeriodoDate = (idx: number, field: "fechaInicio" | "fechaFin", value: Date | null) =>
    setPeriodos((p) => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  const removePeriodo = (idx: number) => setPeriodos((p) => p.filter((_, i) => i !== idx));
  const updatePeriodo = (idx: number, field: keyof PeriodoForm, value: string) =>
    setPeriodos((p) => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  const pesoAuto = selected
    ? selected.peso
    : (config.indicadores_por_accion > 0 ? parseFloat((100 / config.indicadores_por_accion).toFixed(6)) : 0);

  useEffect(() => {
    if (!opened || !defaultAccionId) {
      setAccionPadre(null);
      setProyectoPadre(null);
      setIndicadoresPdi([]);
      setIndicadoresLoaded(false);
      setJerarquiaLoaded(false);
      return;
    }

    if (!selected) setCodigo("");
    setIndicadoresLoaded(false);
    // Mientras la accion/proyecto padre aun no cargan, expectedIndicatorPrefix
    // queda vacio y codigoError mostraria un falso "jerarquia invalida" en rojo
    // por una fraccion de segundo. jerarquiaLoaded evita ese parpadeo.
    setJerarquiaLoaded(false);
    axios.get(PDI_ROUTES.accion(defaultAccionId))
      .then((res) => {
        const accion = res.data as Accion;
        setAccionPadre(accion);
        const proyectoId = getEntityId(accion.proyecto_id);
        if (!proyectoId) {
          setProyectoPadre(null);
          return;
        }
        return axios.get(PDI_ROUTES.proyecto(proyectoId))
          .then((proyectoRes) => setProyectoPadre(proyectoRes.data))
          .catch(() => setProyectoPadre(null));
      })
      .catch(() => {
        setAccionPadre(null);
        setProyectoPadre(null);
      })
      .finally(() => setJerarquiaLoaded(true));

    axios.get(PDI_ROUTES.indicadores())
      .then((res) => setIndicadoresPdi(Array.isArray(res.data) ? res.data : []))
      .catch(() => setIndicadoresPdi([]))
      .finally(() => setIndicadoresLoaded(true));
  }, [opened, defaultAccionId, selected]);

  const expectedIndicatorPrefix = useMemo(
    () => getIndicatorPrefix(proyectoPadre?.macroproyecto_id?.codigo, proyectoPadre?.codigo, accionPadre?.codigo),
    [accionPadre?.codigo, proyectoPadre?.codigo, proyectoPadre?.macroproyecto_id?.codigo]
  );

  const codigoNormalizado = normalizePdiCode(codigo);
  const codigoError = useMemo(() => {
    if (!codigo.trim()) return null;
    // Mientras la accion/proyecto padre siguen cargando (petición en curso al
    // abrir el modal), expectedIndicatorPrefix aún está vacío: no mostrar el
    // error de "jerarquía inválida" hasta saber si realmente lo es.
    if (!jerarquiaLoaded) return null;
    if (!expectedIndicatorPrefix) return "No se pudo validar el indicador porque la jerarquia seleccionada no tiene codigos M/P/A validos.";
    if (!/^M[1-9]\d*-P[1-9]\d*-A[1-9]\d*-I[1-9]\d*$/.test(codigoNormalizado)) {
      return "El codigo del indicador debe tener formato M#-P#-A#-I# (por ejemplo, M2-P3-A1-I1).";
    }
    if (!codigoNormalizado.startsWith(expectedIndicatorPrefix)) {
      return `Para la accion ${accionPadre?.codigo} el codigo debe iniciar con ${expectedIndicatorPrefix}.`;
    }

    const duplicado = indicadoresPdi.find((indicador) =>
      indicador._id !== selected?._id && normalizePdiCode(indicador.codigo) === codigoNormalizado
    );
    if (duplicado) return `Ya existe un indicador con el codigo ${duplicado.codigo}.`;

    const numero = extractNumberSegment(codigoNormalizado, "I");
    if (!numero) return null;

    const indicadoresAccion = indicadoresPdi.filter((indicador) =>
      indicador._id !== selected?._id && getEntityId(indicador.accion_id) === defaultAccionId
    );
    const mismoNumero = indicadoresAccion.find((indicador) =>
      extractNumberSegment(indicador.codigo, "I") === numero
    );
    if (mismoNumero) {
      return `Ya existe un indicador con la numeracion I${numero} dentro de esta accion (${mismoNumero.codigo}).`;
    }

    const numerosUsados = new Set(
      indicadoresAccion
        .map((indicador) => extractNumberSegment(indicador.codigo, "I"))
        .filter((value): value is number => value !== null)
    );
    const numeroOriginal = extractNumberSegment(selected?.codigo, "I");
    const conservaNumero = Boolean(
      selected &&
      getEntityId(selected.accion_id) === defaultAccionId &&
      numeroOriginal === numero
    );
    if (conservaNumero) return null;

    const esperado = getFirstAvailableNumber(numerosUsados);
    if (numero !== esperado) {
      return `La numeracion no es consecutiva. El siguiente codigo esperado es ${expectedIndicatorPrefix}${esperado}.`;
    }

    return null;
  }, [accionPadre?.codigo, codigo, codigoNormalizado, defaultAccionId, expectedIndicatorPrefix, indicadoresPdi, jerarquiaLoaded, selected]);

  useEffect(() => {
    if (!opened || selected || !expectedIndicatorPrefix || !indicadoresLoaded || codigo.trim()) return;
    const numerosUsados = new Set(
      indicadoresPdi
        .filter((indicador) => getEntityId(indicador.accion_id) === defaultAccionId)
        .map((indicador) => extractNumberSegment(indicador.codigo, "I"))
        .filter((value): value is number => value !== null)
    );
    setCodigo(`${expectedIndicatorPrefix}${getFirstAvailableNumber(numerosUsados)}`);
  }, [codigo, defaultAccionId, expectedIndicatorPrefix, indicadoresLoaded, indicadoresPdi, opened, selected]);

  const toNum = (val: string) => {
    const normalizado = val
      .replace(/%/g, "")
      .replace(/\s+/g, "")
      .replace(",", ".");
    return isNaN(Number(normalizado)) ? null : Number(normalizado);
  };

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Código y nombre son requeridos", color: "red" });
      return;
    }
    if (codigoError) {
      showNotification({ title: "Codigo invalido", message: codigoError, color: "red" });
      return;
    }

    if (hasDecimalDot(metaFinal) || periodos.some((p) => hasDecimalDot(p.meta))) {
      showNotification({
        title: "Formato de número inválido",
        message: "Los decimales deben escribirse con coma (,), no con punto (.). Corrige la meta antes de guardar.",
        color: "red",
      });
      return;
    }

    const nombresPeriodos = periodos.map((p) => p.periodo.trim()).filter(Boolean);
    const periodosDuplicados = nombresPeriodos.filter((periodo, idx) => nombresPeriodos.indexOf(periodo) !== idx);

    if (nombresPeriodos.length !== periodos.length) {
      showNotification({ title: "Error", message: "Selecciona un corte para cada meta de periodo", color: "red" });
      return;
    }

    if (periodosDuplicados.length > 0) {
      showNotification({ title: "Error", message: "No repitas cortes en las metas de periodo", color: "red" });
      return;
    }

    // Para "Acumulado" el avance se calcula como Σ avances de los periodos ÷
    // Meta final 2029, así que la suma de las metas por periodo debe coincidir
    // con la meta final: de lo contrario el % de cumplimiento nunca podría
    // llegar realmente a 100% (o se saturaría antes de tiempo).
    if (tipoCalculo === "acumulado") {
      const metaFinalNum = toNum(metaFinal);
      const metasPeriodos = periodos.map((p) => (p.meta.trim() !== "" ? toNum(p.meta) : null));
      const todasNumericas = metasPeriodos.length > 0 && metasPeriodos.every((v) => v !== null);

      if (metaFinalNum !== null && todasNumericas) {
        const sumaMetas = metasPeriodos.reduce((acc: number, v) => acc + (v ?? 0), 0);
        const diferencia = Math.round((sumaMetas - metaFinalNum) * 100) / 100;
        if (Math.abs(diferencia) > 0.01) {
          showNotification({
            title: "Metas por periodo no cuadran con la Meta final 2029",
            message: `La suma de las metas por periodo es ${sumaMetas} pero la Meta final 2029 es ${metaFinalNum} (diferencia: ${diferencia > 0 ? "+" : ""}${diferencia}). Para indicadores "Acumulado" ambas deben coincidir.`,
            color: "red",
            autoClose: 8000,
          });
          return;
        }
      }
    }

    // Para "Último valor" el avance se calcula contra la Meta final 2029, así
    // que la meta del último corte con meta definida (no necesariamente el
    // último corte de la lista, sino el último que efectivamente tenga meta
    // cargada) debe coincidir con esa meta final.
    if (tipoCalculo === "ultimo_valor") {
      const metaFinalNum = toNum(metaFinal);
      const periodosConMeta = [...periodos]
        .filter((p) => p.periodo.trim() !== "" && p.meta.trim() !== "")
        .sort((a, b) => a.periodo.localeCompare(b.periodo));

      if (metaFinalNum !== null && periodosConMeta.length > 0) {
        const ultimoPeriodo = periodosConMeta[periodosConMeta.length - 1];
        const metaUltimoPeriodo = toNum(ultimoPeriodo.meta);
        if (metaUltimoPeriodo !== null) {
          const diferencia = Math.round((metaUltimoPeriodo - metaFinalNum) * 100) / 100;
          if (Math.abs(diferencia) > 0.01) {
            showNotification({
              title: "La meta del último corte no coincide con la Meta final 2029",
              message: `El corte ${ultimoPeriodo.periodo} (el último con meta cargada) tiene meta ${metaUltimoPeriodo}, pero la Meta final 2029 es ${metaFinalNum} (diferencia: ${diferencia > 0 ? "+" : ""}${diferencia}). Para indicadores "Último valor" ambas deben coincidir.`,
              color: "red",
              autoClose: 8000,
            });
            return;
          }
        }
      }
    }

    setLoading(true);
    try {
      const periodosPayload = periodos.map((p) => ({
        periodo: p.periodo.trim(),
        meta: p.meta !== "" ? (p.meta.includes("%") ? p.meta : (toNum(p.meta) !== null ? toNum(p.meta) : p.meta)) : null,
        avance: p.avanceInicial ?? 0,
        fecha_inicio: p.fechaInicio ? p.fechaInicio.toISOString() : null,
        fecha_fin: p.fechaFin ? p.fechaFin.toISOString() : null,
      }));

      const payload = {
        codigo: codigoNormalizado,
        nombre: nombre.trim(),
        indicador_resultado: "",
        peso: pesoAuto,
        responsable: "",
        responsable_email: "",
        entregable: entregable.trim(),
        formula: formula.trim(),
        presupuesto: presupuesto !== "" ? Number(presupuesto) : 0,
        fecha_inicio: fechaInicio ? fechaInicio.toISOString() : null,
        fecha_fin: fechaFin ? fechaFin.toISOString() : null,
        observaciones: "",
        tipo_seguimiento: tipoSeguimiento.trim(),
        fecha_seguimiento: cortesSegimiento.join(", "),
        tipo_calculo: tipoCalculo,
        meta_final_2029: metaFinal !== "" ? (metaFinal.includes("%") ? metaFinal : (toNum(metaFinal) !== null ? toNum(metaFinal) : metaFinal)) : null,
        accion_id: defaultAccionId,
        periodos: periodosPayload,
      };

      const res = selected
        ? await axios.put(PDI_ROUTES.indicador(selected._id), { ...payload, modificado_por: session?.user?.email ?? "" })
        : await axios.post(PDI_ROUTES.indicadores(), payload);

      showNotification({ title: selected ? "Actualizado" : "Creado", message: "Indicador guardado", color: "teal" });
      setHasChanges(false);
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPeriodos((items) => {
        const oldIdx = items.findIndex((_, i) => `periodo-${i}` === active.id);
        const newIdx = items.findIndex((_, i) => `periodo-${i}` === over.id);
        setHasChanges(true);
        return arrayMove(items, oldIdx, newIdx);
      });
    }
  };

  return (
    <Modal opened={opened} onClose={() => confirmNavigation(onClose)} title={selected ? "Editar Indicador" : "Nuevo Indicador"} centered size="lg">
      <Tabs defaultValue="general">
        <Tabs.List mb="sm">
          <Tabs.Tab value="general">General</Tabs.Tab>
          <Tabs.Tab value="seguimiento">Seguimiento</Tabs.Tab>
          <Tabs.Tab value="periodos">Metas Periodos ({periodos.length})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="general">
          <Stack gap="sm">
            <Group grow>
              <TextInput
                label="Codigo"
                placeholder={expectedIndicatorPrefix ? `${expectedIndicatorPrefix}1` : "Ej: M2-P3-A1-I1"}
                value={codigo}
                error={codigoError ?? undefined}
                description={expectedIndicatorPrefix ? `Debe iniciar con ${expectedIndicatorPrefix}` : undefined}
                onChange={(e) => { setCodigo(e.currentTarget.value); setHasChanges(true); }}
              />
              <TextInput label="Peso (%)" value={String(pesoAuto)} readOnly styles={{ input: { color: "gray" } }} />
            </Group>
            <TextInput label="Nombre" placeholder="Nombre del indicador" value={nombre} onChange={(e) => { setNombre(e.currentTarget.value); setHasChanges(true); }} />
            <Textarea
              label="Entregable / Evidencia verificable"
              value={entregable}
              onChange={(e) => { setEntregable(e.currentTarget.value); setHasChanges(true); }}
              rows={2}
            />
            <Textarea
              label="Fórmula"
              placeholder="Describe cómo se calcula el indicador"
              value={formula}
              onChange={(e) => { setFormula(e.currentTarget.value); setHasChanges(true); }}
              rows={2}
            />
            <Group grow>
              <DatePickerInput
                label="Fecha de inicio"
                placeholder="dd/mm/aaaa"
                value={fechaInicio}
                onChange={(v) => { setFechaInicio(v); setHasChanges(true); }}
                locale="es"
                valueFormat="DD/MM/YYYY"
                clearable
              />
              <DatePickerInput
                label="Fecha de finalización"
                placeholder="dd/mm/aaaa"
                value={fechaFin}
                onChange={(v) => { setFechaFin(v); setHasChanges(true); }}
                locale="es"
                valueFormat="DD/MM/YYYY"
                clearable
                minDate={fechaInicio ?? undefined}
              />
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="seguimiento">
          <Stack gap="sm">
            <MultiSelect
              label="Cortes de seguimiento"
              description="Selecciona en cuáles cortes del año se califica este indicador"
              placeholder={cortes.length ? "Selecciona los cortes..." : "Sin cortes activos"}
              data={cortesData.map((c) => ({
                value: c.nombre,
                label: c.descripcion ? `${c.nombre} — ${c.descripcion}` : c.nombre,
              }))}
              value={cortesSegimiento}
              onChange={(v) => { setCortesSegimiento(v); setHasChanges(true); }}
              searchable
              clearable
              nothingFoundMessage="Sin cortes activos — crea uno en Cortes PDI"
            />
            <Select
              label="Tipo de cálculo"
              description="Cómo se consolida el avance de los periodos"
              data={[
                { value: "promedio", label: "Promedio" },
                { value: "acumulado", label: "Acumulado" },
                { value: "ultimo_valor", label: "Último valor" },
              ]}
              value={tipoCalculo}
              onChange={(v) => { setTipoCalculo(v ?? "promedio"); setHasChanges(true); }}
            />
            <TextInput
              label={`Meta final ${config.anio_fin}`}
              placeholder="Ej: 100 o 'Implementado'"
              value={metaFinal}
              onChange={(e) => { setMetaFinal(e.currentTarget.value); setHasChanges(true); }}
              onBlur={(e) => {
                const normalizado = normalizeDecimalComma(e.currentTarget.value);
                if (normalizado !== e.currentTarget.value) {
                  setMetaFinal(normalizado);
                  showNotification({
                    title: "Formato de número",
                    message: "Los decimales deben ir con coma (,), se corrigió automáticamente.",
                    color: "yellow",
                  });
                }
              }}
              error={hasDecimalDot(metaFinal) ? "Usa coma (,) en vez de punto" : undefined}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="periodos">
          <Stack gap="sm">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={periodos.map((_, i) => `periodo-${i}`)}
                strategy={verticalListSortingStrategy}
              >
                {periodos.map((p, idx) => (
                  <SortablePeriodoItem
                    key={`periodo-${idx}`}
                    id={`periodo-${idx}`}
                    p={p}
                    idx={idx}
                    periodoOptions={getPeriodoOptions(idx)}
                    onUpdatePeriodo={updatePeriodo}
                    onRemovePeriodo={removePeriodo}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <Button variant="light" leftSection={<IconPlus size={14} />} onClick={addPeriodo} disabled={!canAddPeriodo}>
              Agregar periodo
            </Button>
          </Stack>
        </Tabs.Panel>

      </Tabs>

      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={() => confirmNavigation(onClose)}>Cancelar</Button>
        <Button loading={loading} disabled={Boolean(codigoError)} onClick={handleSave}>Guardar</Button>
      </Group>
    </Modal>
  );
}
