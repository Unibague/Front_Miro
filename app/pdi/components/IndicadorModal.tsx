"use client";

import { useEffect, useState } from "react";
import {
  Modal, TextInput, Button, Group, Stack,
  Textarea, Select, MultiSelect, Tabs, Text, ActionIcon, Paper, Autocomplete,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import axios from "axios";
import "dayjs/locale/es";
import type { Indicador, Periodo } from "../types";
import { PDI_ROUTES } from "../api";
import dynamic from "next/dynamic";

const EvidenciasPanel = dynamic(() => import("./EvidenciasPanel"), { ssr: false });

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
  avance: string;
}

export default function IndicadorModal({ opened, onClose, selected, defaultAccionId, onSaved }: Props) {
  const [codigo, setCodigo]                     = useState("");
  const [nombre, setNombre]                     = useState("");
  const [indicadorResultado, setIndicadorResultado] = useState("");
  const [peso, setPeso]                         = useState("");
  const [responsable, setResponsable]           = useState("");
  const [responsableEmail, setResponsableEmail] = useState("");
  const [entregable, setEntregable]             = useState("");
  const [observaciones, setObservaciones]       = useState("");
  const [tipoSeguimiento, setTipoSeguimiento]   = useState("");
  const [cortesSegimiento, setCortesSegimiento] = useState<string[]>([]); // cortes en los que se hace seguimiento
  const [tipoCalculo, setTipoCalculo]           = useState("promedio");
  const [metaFinal, setMetaFinal]               = useState("");  // string libre
  const [periodos, setPeriodos]                 = useState<PeriodoForm[]>([]);
  const [usuarios, setUsuarios]                 = useState<string[]>([]);
  const [loading, setLoading]                   = useState(false);
  const [cortesData, setCortesData]             = useState<{ nombre: string; descripcion: string }[]>([]);
  const [cortes, setCortes]                     = useState<string[]>([]);

  const [usuariosData, setUsuariosData] = useState<{ label: string; email: string }[]>([]);

  // Cargar usuarios y cortes
  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/all`)
      .then(res => {
        const lista = Array.isArray(res.data) ? res.data : (res.data.users ?? []);
        const data = lista
          .filter((u: any) => u.full_name)
          .map((u: any) => ({ label: u.full_name as string, email: (u.email ?? "") as string }));
        const unicos = Array.from(new Map<string, { label: string; email: string }>(data.map((u: { label: string; email: string }) => [u.label, u])).values());
        setUsuariosData(unicos);
        setUsuarios(unicos.map((u: { label: string; email: string }) => u.label));
      })
      .catch(() => {});
    axios.get(PDI_ROUTES.cortesActivos())
      .then(res => {
        setCortesData(res.data.map((c: any) => ({ nombre: c.nombre, descripcion: c.descripcion ?? "" })));
        setCortes(res.data.map((c: any) => c.nombre));
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
      setResponsableEmail((selected as any).responsable_email ?? "");
      setEntregable(selected.entregable ?? "");
      setObservaciones(selected.observaciones ?? "");
      setTipoSeguimiento(selected.tipo_seguimiento ?? "");
      // fecha_seguimiento guardada como string separado por comas → array
      setCortesSegimiento(
        selected.fecha_seguimiento
          ? selected.fecha_seguimiento.split(",").map(s => s.trim()).filter(Boolean)
          : []
      );
      setTipoCalculo(selected.tipo_calculo ?? "promedio");
      setMetaFinal(selected.meta_final_2029 != null ? String(selected.meta_final_2029) : "");
      setPeriodos((selected.periodos ?? []).map(p => ({
        periodo: p.periodo,
        meta:    p.meta    != null ? String(p.meta)    : "",
        avance:  p.avance  != null ? String(p.avance)  : "",
      })));
    } else {
      setCodigo(""); setNombre(""); setIndicadorResultado(""); setPeso("");
      setResponsable(""); setResponsableEmail(""); setEntregable("");
      setObservaciones(""); setTipoSeguimiento(""); setCortesSegimiento([]);
      setTipoCalculo("promedio"); setMetaFinal("");
      // Precargar periodos desde los cortes activos
      setPeriodos(cortesData.map(c => ({ periodo: c.nombre, meta: "", avance: "" })));
    }
  }, [opened]);

  const addPeriodo = () => setPeriodos(p => [...p, { periodo: "", meta: "", avance: "" }]);
  const removePeriodo = (idx: number) => setPeriodos(p => p.filter((_, i) => i !== idx));
  const updatePeriodo = (idx: number, field: keyof PeriodoForm, value: string) =>
    setPeriodos(p => p.map((item, i) => i === idx ? { ...item, [field]: value } : item));

  // Si los cortes cargan después de abrir el modal en modo nuevo, precargar periodos
  useEffect(() => {
    if (!opened || selected || cortesData.length === 0 || periodos.length > 0) return;
    setPeriodos(cortesData.map(c => ({ periodo: c.nombre, meta: "", avance: "" })));
  }, [cortesData, opened]);

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
        responsable_email:    responsableEmail.trim(),
        entregable:           entregable.trim(),
        fecha_inicio:         null,
        fecha_fin:            null,
        observaciones:        observaciones.trim(),
        tipo_seguimiento:     tipoSeguimiento.trim(),
        fecha_seguimiento:    cortesSegimiento.join(", "), // guardado como string separado por comas
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
          {selected && <Tabs.Tab value="evidencias">Evidencias</Tabs.Tab>}
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
              onChange={val => {
                setResponsable(val);
                const found = usuariosData.find(u => u.label === val);
                setResponsableEmail(found?.email ?? "");
              }}
              data={usuarios}
              limit={8}
            />
            <Textarea label="Entregable / Evidencia verificable" value={entregable} onChange={(e) => setEntregable(e.currentTarget.value)} rows={2} />
            <Textarea label="Observaciones" value={observaciones} onChange={(e) => setObservaciones(e.currentTarget.value)} rows={2} />
          </Stack>
        </Tabs.Panel>

        {/* ── Seguimiento ── */}
        <Tabs.Panel value="seguimiento">
          <Stack gap="sm">
            <Select
              label="Tipo de seguimiento"
              description="Frecuencia con la que se reporta este indicador"
              placeholder="Selecciona el tipo"
              data={[
                { value: "Semestral", label: "Semestral" },
                { value: "Anual",     label: "Anual" },
                { value: "Trimestral", label: "Trimestral" },
                { value: "Mensual",   label: "Mensual" },
              ]}
              value={tipoSeguimiento || null}
              onChange={v => setTipoSeguimiento(v ?? "")}
              clearable
            />
            <MultiSelect
              label="Cortes de seguimiento"
              description="Selecciona en cuáles cortes del año se califica este indicador"
              placeholder={cortes.length ? "Selecciona los cortes..." : "Sin cortes activos"}
              data={cortesData.map(c => ({
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
            <Group justify="space-between" align="flex-start" mb={4}>
              <div>
                <Text size="sm" fw={600}>Periodos de corte</Text>
                <Text size="xs" c="dimmed">
                  {selected
                    ? "Periodos guardados en este indicador"
                    : cortes.length > 0
                      ? `Se precargaron ${cortes.length} corte(s) activo(s) — agrega la meta de cada uno`
                      : "No hay cortes activos — crea cortes en la sección Cortes PDI"
                  }
                </Text>
              </div>
              <Button size="xs" leftSection={<IconPlus size={13} />} variant="light" onClick={addPeriodo}>
                Agregar corte extra
              </Button>
            </Group>

            {periodos.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="sm">
                Sin periodos — {cortes.length === 0 ? "crea cortes en Cortes PDI primero" : "recarga el modal"}
              </Text>
            )}

            {periodos.map((p, idx) => {
              const descripcion = cortesData.find(c => c.nombre === p.periodo)?.descripcion;
              return (
                <Paper key={idx} withBorder radius="md" p="sm">
                  <Group gap="xs" align="flex-end">
                    <div style={{ flex: 1 }}>
                      <Text size="xs" fw={700}>{p.periodo}</Text>
                      {descripcion && <Text size="xs" c="dimmed">{descripcion}</Text>}
                      {/* Si el periodo no viene de un corte conocido, mostrar selector */}
                      {!cortesData.find(c => c.nombre === p.periodo) && (
                        <Select
                          label="Corte"
                          placeholder="Selecciona un corte"
                          data={cortes}
                          value={p.periodo || null}
                          onChange={v => updatePeriodo(idx, "periodo", v ?? "")}
                          searchable
                          allowDeselect={false}
                          size="xs"
                          nothingFoundMessage="Sin cortes activos"
                        />
                      )}
                    </div>
                    <TextInput
                      label="Meta"
                      placeholder="Ej: 100"
                      value={p.meta}
                      onChange={e => updatePeriodo(idx, "meta", e.currentTarget.value)}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                    <TextInput
                      label="Avance"
                      placeholder="Ej: 80"
                      value={p.avance}
                      onChange={e => updatePeriodo(idx, "avance", e.currentTarget.value)}
                      style={{ flex: 1 }}
                      size="sm"
                    />
                    <ActionIcon color="red" variant="subtle" onClick={() => removePeriodo(idx)} mb={2}>
                      <IconTrash size={15} />
                    </ActionIcon>
                  </Group>
                </Paper>
              );
            })}
          </Stack>
        </Tabs.Panel>
        {/* ── Evidencias ── */}
        {selected && (
          <Tabs.Panel value="evidencias">
            <EvidenciasPanel indicadorId={selected._id} />
          </Tabs.Panel>
        )}
      </Tabs>

      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button loading={loading} onClick={handleSave}>Guardar</Button>
      </Group>
    </Modal>
  );
}
