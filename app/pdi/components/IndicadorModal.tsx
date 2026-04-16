"use client";

import { useEffect, useState } from "react";
import {
  Modal, TextInput, Button, Group, Stack,
  Textarea, Select, MultiSelect, Tabs, ActionIcon, Paper,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { showNotification } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import axios from "axios";
import "dayjs/locale/es";
import type { Indicador, Periodo } from "../types";
import { PDI_ROUTES } from "../api";
import { usePdiConfig } from "../hooks/usePdiConfig";

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

export default function IndicadorModal({ opened, onClose, selected, defaultAccionId, onSaved }: Props) {
  const { config } = usePdiConfig();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [peso, setPeso] = useState("");
  const [entregable, setEntregable] = useState("");
  const [tipoSeguimiento, setTipoSeguimiento] = useState("");
  const [cortesSegimiento, setCortesSegimiento] = useState<string[]>([]);
  const [tipoCalculo, setTipoCalculo] = useState("promedio");
  const [metaFinal, setMetaFinal] = useState("");
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin] = useState<Date | null>(null);
  const [periodos, setPeriodos] = useState<PeriodoForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [cortesData, setCortesData] = useState<{ nombre: string; descripcion: string }[]>([]);
  const [cortes, setCortes] = useState<string[]>([]);

  useEffect(() => {
    axios.get(PDI_ROUTES.cortesActivos())
      .then((res) => {
        const sorted = [...res.data].sort((a: any, b: any) =>
          a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: "base" })
        );
        setCortesData(sorted.map((c: any) => ({ nombre: c.nombre, descripcion: c.descripcion ?? "" })));
        setCortes(sorted.map((c: any) => c.nombre));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!opened) return;

    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setPeso(String(selected.peso));
      setEntregable(selected.entregable ?? "");
      setTipoSeguimiento(selected.tipo_seguimiento ?? "");
      setCortesSegimiento(
        selected.fecha_seguimiento
          ? selected.fecha_seguimiento.split(",").map((s) => s.trim()).filter(Boolean)
          : []
      );
      setTipoCalculo(selected.tipo_calculo ?? "promedio");
      setMetaFinal(selected.meta_final_2029 != null ? String(selected.meta_final_2029) : "");
      setFechaInicio(selected.fecha_inicio ? new Date(selected.fecha_inicio) : null);
      setFechaFin(selected.fecha_fin ? new Date(selected.fecha_fin) : null);
      setPeriodos((selected.periodos ?? []).map((p) => ({
        periodo: p.periodo,
        meta: p.meta != null ? String(p.meta) : "",
        avanceInicial: p.avance ?? 0,
        fechaInicio: (p as any).fecha_inicio ? new Date((p as any).fecha_inicio) : null,
        fechaFin: (p as any).fecha_fin ? new Date((p as any).fecha_fin) : null,
      })));
      return;
    }

    setCodigo("");
    setNombre("");
    setPeso("");
    setEntregable("");
    setTipoSeguimiento("");
    setCortesSegimiento([]);
    setTipoCalculo("promedio");
    setMetaFinal("");
    setFechaInicio(null);
    setFechaFin(null);
    setPeriodos(cortesData.map((c) => ({ periodo: c.nombre, meta: "", avanceInicial: 0, fechaInicio: null, fechaFin: null })));
  }, [opened, selected, cortesData]);

  useEffect(() => {
    if (!opened || selected || cortesData.length === 0 || periodos.length > 0) return;
    setPeriodos(cortesData.map((c) => ({ periodo: c.nombre, meta: "", avanceInicial: 0, fechaInicio: null, fechaFin: null })));
  }, [cortesData, opened, periodos.length, selected]);

  const addPeriodo = () => setPeriodos((p) => [...p, { periodo: "", meta: "", avanceInicial: 0, fechaInicio: null, fechaFin: null }]);
  const updatePeriodoDate = (idx: number, field: "fechaInicio" | "fechaFin", value: Date | null) =>
    setPeriodos((p) => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  const removePeriodo = (idx: number) => setPeriodos((p) => p.filter((_, i) => i !== idx));
  const updatePeriodo = (idx: number, field: keyof PeriodoForm, value: string) =>
    setPeriodos((p) => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  const toNum = (val: string) => {
    const normalizado = val.replace(",", ".");
    return isNaN(Number(normalizado)) ? null : Number(normalizado);
  };

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Código y nombre son requeridos", color: "red" });
      return;
    }

    setLoading(true);
    try {
      const periodosPayload = periodos.map((p) => ({
        periodo: p.periodo,
        meta: p.meta !== "" ? (toNum(p.meta) !== null ? toNum(p.meta) : p.meta) : null,
        avance: p.avanceInicial ?? 0,
        fecha_inicio: p.fechaInicio ? p.fechaInicio.toISOString() : null,
        fecha_fin: p.fechaFin ? p.fechaFin.toISOString() : null,
      }));

      const payload = {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        indicador_resultado: "",
        peso: toNum(peso),
        responsable: "",
        responsable_email: "",
        entregable: entregable.trim(),
        fecha_inicio: fechaInicio ? fechaInicio.toISOString() : null,
        fecha_fin: fechaFin ? fechaFin.toISOString() : null,
        observaciones: "",
        tipo_seguimiento: tipoSeguimiento.trim(),
        fecha_seguimiento: cortesSegimiento.join(", "),
        tipo_calculo: tipoCalculo,
        meta_final_2029: metaFinal !== "" ? (toNum(metaFinal) !== null ? toNum(metaFinal) : metaFinal) : null,
        accion_id: defaultAccionId,
        periodos: periodosPayload,
      };

      const res = selected
        ? await axios.put(PDI_ROUTES.indicador(selected._id), payload)
        : await axios.post(PDI_ROUTES.indicadores(), payload);

      showNotification({ title: selected ? "Actualizado" : "Creado", message: "Indicador guardado", color: "teal" });
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={selected ? "Editar Indicador" : "Nuevo Indicador"} centered size="lg">
      <Tabs defaultValue="general">
        <Tabs.List mb="sm">
          <Tabs.Tab value="general">General</Tabs.Tab>
          <Tabs.Tab value="seguimiento">Seguimiento</Tabs.Tab>
          <Tabs.Tab value="periodos">Metas Periodos ({periodos.length})</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="general">
          <Stack gap="sm">
            <Group grow>
              <TextInput label="Código" placeholder="Ej: 1.1.1.1" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
              <TextInput label="Peso (%)" placeholder="Ej: 33,33" value={peso} onChange={(e) => setPeso(e.currentTarget.value)} />
            </Group>
            <TextInput label="Nombre" placeholder="Nombre del indicador" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
            <Textarea
              label="Entregable / Evidencia verificable"
              value={entregable}
              onChange={(e) => setEntregable(e.currentTarget.value)}
              rows={2}
            />
            <Group grow>
              <DatePickerInput
                label="Fecha de inicio"
                placeholder="dd/mm/aaaa"
                value={fechaInicio}
                onChange={setFechaInicio}
                locale="es"
                valueFormat="DD/MM/YYYY"
                clearable
              />
              <DatePickerInput
                label="Fecha de finalización"
                placeholder="dd/mm/aaaa"
                value={fechaFin}
                onChange={setFechaFin}
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
            <Select
              label="Tipo de seguimiento"
              description="Frecuencia con la que se reporta este indicador"
              placeholder="Selecciona el tipo"
              data={[
                { value: "Semestral", label: "Semestral" },
                { value: "Anual", label: "Anual" },
                { value: "Trimestral", label: "Trimestral" },
                { value: "Mensual", label: "Mensual" },
              ]}
              value={tipoSeguimiento || null}
              onChange={(v) => setTipoSeguimiento(v ?? "")}
              clearable
            />
            <MultiSelect
              label="Cortes de seguimiento"
              description="Selecciona en cuáles cortes del año se califica este indicador"
              placeholder={cortes.length ? "Selecciona los cortes..." : "Sin cortes activos"}
              data={cortesData.map((c) => ({
                value: c.nombre,
                label: c.descripcion ? `${c.nombre} — ${c.descripcion}` : c.nombre,
              }))}
              value={cortesSegimiento}
              onChange={setCortesSegimiento}
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
              onChange={(v) => setTipoCalculo(v ?? "promedio")}
            />
            <TextInput
              label={`Meta final ${config.anio_fin}`}
              placeholder="Ej: 100 o 'Implementado'"
              value={metaFinal}
              onChange={(e) => setMetaFinal(e.currentTarget.value)}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="periodos">
          <Stack gap="sm">
            {periodos.map((p, idx) => (
              <Paper key={idx} withBorder radius="md" p="sm">
                <Group align="end" wrap="nowrap">
                  <TextInput
                    label="Periodo"
                    placeholder="Ej: 2026-1"
                    value={p.periodo}
                    onChange={(e) => updatePeriodo(idx, "periodo", e.currentTarget.value)}
                    style={{ flex: 1 }}
                  />
                  <TextInput
                    label="Meta"
                    placeholder="Meta"
                    value={p.meta}
                    onChange={(e) => updatePeriodo(idx, "meta", e.currentTarget.value)}
                    style={{ width: 120 }}
                  />
                  <ActionIcon color="red" variant="light" onClick={() => removePeriodo(idx)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Paper>
            ))}
            <Button variant="light" leftSection={<IconPlus size={14} />} onClick={addPeriodo}>
              Agregar periodo
            </Button>
          </Stack>
        </Tabs.Panel>

      </Tabs>

      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button loading={loading} onClick={handleSave}>Guardar</Button>
      </Group>
    </Modal>
  );
}
