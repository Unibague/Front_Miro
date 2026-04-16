"use client";

import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Group, Stack, Select, Tabs, NumberInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import "dayjs/locale/es";
import type { Proyecto, Macroproyecto } from "../types";
import { PDI_ROUTES } from "../api";

interface Props {
  opened: boolean;
  onClose: () => void;
  selected: Proyecto | null;
  macroproyectos: Macroproyecto[];
  defaultMacroId?: string;
  onSaved: (doc: Proyecto) => void;
  onCreated?: (doc: Proyecto) => void;
}

const toNum = (v: string) => Number(v.replace(",", "."));

export default function ProyectoModal({
  opened,
  onClose,
  selected,
  macroproyectos,
  defaultMacroId,
  onSaved,
  onCreated,
}: Props) {
  const [codigo, setCodigo]         = useState("");
  const [nombre, setNombre]         = useState("");
  const [formulador, setFormulador] = useState("");
  const [peso, setPeso]               = useState("");
  const [macroId, setMacroId]         = useState<string | null>(defaultMacroId ?? null);
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin]       = useState<Date | null>(null);
  const [presupuesto, setPresupuesto]               = useState<number | string>("");
  const [presupuestoEjecutado, setPresupuestoEjecutado] = useState<number | string>("");
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setFormulador(selected.formulador);
      setPeso(String(selected.peso));
      setMacroId(selected.macroproyecto_id._id);
      setFechaInicio(selected.fecha_inicio ? new Date(selected.fecha_inicio) : null);
      setFechaFin(selected.fecha_fin ? new Date(selected.fecha_fin) : null);
      setPresupuesto(selected.presupuesto ?? "");
      setPresupuestoEjecutado(selected.presupuesto_ejecutado ?? "");
      return;
    }
    setCodigo(""); setNombre(""); setFormulador(""); setPeso("");
    setMacroId(defaultMacroId ?? null);
    setFechaInicio(null); setFechaFin(null);
    setPresupuesto(""); setPresupuestoEjecutado("");
  }, [opened, selected, defaultMacroId]);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim() || !macroId) {
      showNotification({ title: "Error", message: "Código, nombre y macroproyecto son requeridos", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        codigo:      codigo.trim(),
        nombre:      nombre.trim(),
        descripcion: selected?.descripcion ?? "",
        formulador:  formulador.trim(),
        responsable: "",
        responsable_email: "",
        peso: toNum(peso),
        macroproyecto_id: macroId,
        fecha_inicio: fechaInicio ? fechaInicio.toISOString() : null,
        fecha_fin:    fechaFin    ? fechaFin.toISOString()    : null,
        presupuesto:          presupuesto          !== "" ? Number(presupuesto)          : 0,
        presupuesto_ejecutado: presupuestoEjecutado !== "" ? Number(presupuestoEjecutado) : 0,
      };
      const res = selected
        ? await axios.put(PDI_ROUTES.proyecto(selected._id), payload)
        : await axios.post(PDI_ROUTES.proyectos(), payload);
      showNotification({ title: selected ? "Actualizado" : "Creado", message: "Proyecto guardado", color: "teal" });
      onSaved(res.data);
      onClose();
      if (!selected) onCreated?.(res.data);
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={selected ? "Editar Proyecto" : "Nuevo Proyecto"} centered size="lg">
      <Tabs defaultValue="general">
        <Tabs.List mb="sm">
          <Tabs.Tab value="general">General</Tabs.Tab>
          <Tabs.Tab value="presupuesto">Presupuesto y fechas</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="general">
          <Stack gap="sm">
            <Select
              label="Macroproyecto"
              placeholder="Selecciona un macroproyecto"
              data={macroproyectos.map((m) => ({ value: m._id, label: `${m.codigo} - ${m.nombre}` }))}
              value={macroId}
              onChange={setMacroId}
              searchable
            />
            <Group grow>
              <TextInput label="Código" placeholder="Ej: 1.1" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
              <TextInput label="Peso (%)" placeholder="Ej: 33,33" value={peso} onChange={(e) => setPeso(e.currentTarget.value)} />
            </Group>
            <TextInput label="Nombre" placeholder="Nombre del proyecto" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
            <TextInput label="Formulador" placeholder="Nombre del formulador" value={formulador} onChange={(e) => setFormulador(e.currentTarget.value)} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="presupuesto">
          <Stack gap="sm">
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
            <Group grow>
              <NumberInput
                label="Presupuesto asignado (COP)"
                placeholder="Ej: 50000000"
                value={presupuesto}
                onChange={setPresupuesto}
                thousandSeparator="."
                decimalSeparator=","
                min={0}
              />
              <NumberInput
                label="Presupuesto ejecutado (COP)"
                placeholder="Ej: 25000000"
                value={presupuestoEjecutado}
                onChange={setPresupuestoEjecutado}
                thousandSeparator="."
                decimalSeparator=","
                min={0}
              />
            </Group>
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
