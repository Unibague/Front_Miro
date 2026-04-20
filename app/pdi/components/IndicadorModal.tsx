"use client";

import { useEffect, useState } from "react";
import {
  Modal, TextInput, Button, Group, Stack,
  Textarea, Select, Tabs, Text, ActionIcon, Paper, Autocomplete,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { showNotification } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import axios from "axios";
import "dayjs/locale/es";
import type { Indicador, Periodo } from "../types";
import { PDI_ROUTES } from "../api";

interface Props {
  opened: boolean;
  onClose: () => void;
  selected: Indicador | null;
  defaultAccionId: string;
  onSaved: (doc: Indicador) => void;
}

interface PeriodoForm {
  periodo: string;
  meta: string;       // string para aceptar texto y números
  avance: string;
}

export default function IndicadorModal({ opened, onClose, selected, defaultAccionId, onSaved }: Props) {
  const [codigo, setCodigo]                     = useState("");
  const [nombre, setNombre]                     = useState("");
  const [indicadorResultado, setIndicadorResultado] = useState("");
  const [peso, setPeso]                         = useState("");
  const [responsable, setResponsable]           = useState("");
  const [entregable, setEntregable]             = useState("");
  const [fechaInicio, setFechaInicio]           = useState<Date | null>(null);
  const [fechaFin, setFechaFin]                 = useState<Date | null>(null);
  const [observaciones, setObservaciones]       = useState("");
  const [tipoSeguimiento, setTipoSeguimiento]   = useState("");
  const [fechaSeguimiento, setFechaSeguimiento] = useState("");
  const [tipoCalculo, setTipoCalculo]           = useState("promedio");
  const [metaFinal, setMetaFinal]               = useState("");  // string libre
  const [periodos, setPeriodos]                 = useState<PeriodoForm[]>([]);
  const [usuarios, setUsuarios]                 = useState<string[]>([]);
  const [loading, setLoading]                   = useState(false);

  // Cargar usuarios para el autocomplete
  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/all`)
      .then(res => {
        const lista = Array.isArray(res.data) ? res.data : (res.data.users ?? []);
        const nombres = lista.map((u: any) => u.full_name).filter(Boolean);
        setUsuarios([...new Set(nombres as string[])]);
      })
      .catch(() => {});
  }, []);

  // Resetear form al abrir
  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setIndicadorResultado(selected.indicador_resultado ?? "");
      setPeso(String(selected.peso));
      setResponsable(selected.responsable ?? "");
      setEntregable(selected.entregable ?? "");
      setFechaInicio(selected.fecha_inicio ? new Date(selected.fecha_inicio) : null);
      setFechaFin(selected.fecha_fin ? new Date(selected.fecha_fin) : null);
      setObservaciones(selected.observaciones ?? "");
      setTipoSeguimiento(selected.tipo_seguimiento ?? "");
      setFechaSeguimiento(selected.fecha_seguimiento ?? "");
      setTipoCalculo(selected.tipo_calculo ?? "promedio");
      setMetaFinal(selected.meta_final_2029 != null ? String(selected.meta_final_2029) : "");
      setPeriodos((selected.periodos ?? []).map(p => ({
        periodo: p.periodo,
        meta:    p.meta    != null ? String(p.meta)    : "",
        avance:  p.avance  != null ? String(p.avance)  : "",
      })));
    } else {
      setCodigo(""); setNombre(""); setIndicadorResultado(""); setPeso("");
      setResponsable(""); setEntregable(""); setFechaInicio(null); setFechaFin(null);
      setObservaciones(""); setTipoSeguimiento(""); setFechaSeguimiento("");
      setTipoCalculo("promedio"); setMetaFinal(""); setPeriodos([]);
    }
  }, [opened]);

  const addPeriodo = () => setPeriodos(p => [...p, { periodo: "", meta: "", avance: "" }]);
  const removePeriodo = (idx: number) => setPeriodos(p => p.filter((_, i) => i !== idx));
  const updatePeriodo = (idx: number, field: keyof PeriodoForm, value: string) =>
    setPeriodos(p => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  // Normaliza separador decimal: reemplaza coma por punto
  const toNum = (val: string) => {
    const normalizado = val.replace(',', '.');
    return isNaN(Number(normalizado)) ? null : Number(normalizado);
  };

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Código y nombre son requeridos", color: "red" });
      return;
    }
    setLoading(true);
    try {
      // Convertir periodos: meta y avance pueden ser número o null
      const periodosPayload: Periodo[] = periodos.map(p => ({
        periodo: p.periodo,
        meta:    p.meta   !== "" ? (toNum(p.meta)   !== null ? toNum(p.meta)   : p.meta)   : null,
        avance:  p.avance !== "" ? (toNum(p.avance) !== null ? toNum(p.avance) : p.avance) : null,
      }));

      const payload = {
        codigo:               codigo.trim(),
        nombre:               nombre.trim(),
        indicador_resultado:  indicadorResultado.trim(),
        peso:                 toNum(peso),
        responsable:          responsable.trim(),
        entregable:           entregable.trim(),
        fecha_inicio:         fechaInicio ? fechaInicio.toISOString().split("T")[0] : null,
        fecha_fin:            fechaFin    ? fechaFin.toISOString().split("T")[0]    : null,
        observaciones:        observaciones.trim(),
        tipo_seguimiento:     tipoSeguimiento.trim(),
        fecha_seguimiento:    fechaSeguimiento.trim(),
        tipo_calculo:         tipoCalculo,
        meta_final_2029:      metaFinal !== "" ? (toNum(metaFinal) !== null ? toNum(metaFinal) : metaFinal) : null,
        accion_id:            defaultAccionId,
        periodos:             periodosPayload,
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
          <Tabs.Tab value="periodos">Periodos ({periodos.length})</Tabs.Tab>
        </Tabs.List>

        {/* ── General ── */}
        <Tabs.Panel value="general">
          <Stack gap="sm">
            <Group grow>
              <TextInput label="Código" placeholder="Ej: 1.1.1.1" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
              <TextInput label="Peso (%)" placeholder="Ej: 33,33" value={peso} onChange={(e) => setPeso(e.currentTarget.value)} />
            </Group>
            <TextInput label="Nombre" placeholder="Nombre del indicador" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
            <Textarea label="Indicador de resultado" placeholder="Descripción del indicador" value={indicadorResultado} onChange={(e) => setIndicadorResultado(e.currentTarget.value)} rows={2} />
            <Autocomplete
              label="Responsable"
              placeholder="Buscar usuario..."
              value={responsable}
              onChange={setResponsable}
              data={usuarios}
              limit={8}
            />
            <Textarea label="Entregable / Evidencia verificable" value={entregable} onChange={(e) => setEntregable(e.currentTarget.value)} rows={2} />
            <Group grow>
              <DateInput label="Fecha inicio" locale="es" placeholder="Selecciona fecha" value={fechaInicio} onChange={setFechaInicio} clearable />
              <DateInput label="Fecha fin" locale="es" placeholder="Selecciona fecha" value={fechaFin} onChange={setFechaFin} clearable minDate={fechaInicio ?? undefined} />
            </Group>
            <Textarea label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.currentTarget.value)} rows={2} />
          </Stack>
        </Tabs.Panel>

        {/* ── Seguimiento ── */}
        <Tabs.Panel value="seguimiento">
          <Stack gap="sm">
            <TextInput label="Tipo de seguimiento" placeholder="Ej: Semestral, Anual" value={tipoSeguimiento} onChange={(e) => setTipoSeguimiento(e.currentTarget.value)} />
            <TextInput label="Fecha de seguimiento planeación" placeholder="Ej: Junio / Diciembre" value={fechaSeguimiento} onChange={(e) => setFechaSeguimiento(e.currentTarget.value)} />
            <Select
              label="Tipo de cálculo"
              data={[
                { value: "promedio",     label: "Promedio" },
                { value: "acumulado",    label: "Acumulado" },
                { value: "ultimo_valor", label: "Último valor" },
              ]}
              value={tipoCalculo}
              onChange={(v) => setTipoCalculo(v ?? "promedio")}
            />
            <TextInput
              label="Meta final 2029"
              placeholder="Ej: 100 o 'Implementado'"
              value={metaFinal}
              onChange={(e) => setMetaFinal(e.currentTarget.value)}
            />
          </Stack>
        </Tabs.Panel>

        {/* ── Periodos ── */}
        <Tabs.Panel value="periodos">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">Periodos semestrales (Ej: 2026A, 2026B)</Text>
              <Button size="xs" leftSection={<IconPlus size={13} />} variant="light" onClick={addPeriodo}>
                Agregar periodo
              </Button>
            </Group>
            {periodos.length === 0 && <Text size="xs" c="dimmed" ta="center" py="sm">Sin periodos registrados</Text>}
            {periodos.map((p, idx) => (
              <Paper key={idx} withBorder radius="sm" p="xs">
                <Group gap="xs" align="flex-end">
                  <TextInput label="Periodo" placeholder="2026A" value={p.periodo} onChange={(e) => updatePeriodo(idx, "periodo", e.currentTarget.value)} style={{ flex: 1 }} />
                  <TextInput label="Meta" placeholder="Ej: 100 o 'Implementado'" value={p.meta} onChange={(e) => updatePeriodo(idx, "meta", e.currentTarget.value)} style={{ flex: 1 }} />
                  <TextInput label="Avance" placeholder="Ej: 80" value={p.avance} onChange={(e) => updatePeriodo(idx, "avance", e.currentTarget.value)} style={{ flex: 1 }} />
                  <ActionIcon color="red" variant="subtle" onClick={() => removePeriodo(idx)} mb={2}>
                    <IconTrash size={15} />
                  </ActionIcon>
                </Group>
              </Paper>
            ))}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button loading={loading} onClick={handleSave}>Guardar</Button>
      </Group>
    </Modal>
  );
}
