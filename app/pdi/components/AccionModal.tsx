"use client";

import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Group, Stack, Autocomplete, Tabs, NumberInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import "dayjs/locale/es";
import type { Accion } from "../types";
import { PDI_ROUTES } from "../api";

interface Props {
  opened: boolean;
  onClose: () => void;
  selected: Accion | null;
  defaultProyectoId: string;
  onSaved: (doc: Accion) => void;
}

const toNum = (v: string) => Number(v.replace(',', '.'));

export default function AccionModal({ opened, onClose, selected, defaultProyectoId, onSaved }: Props) {
  const [codigo, setCodigo]                         = useState("");
  const [nombre, setNombre]                         = useState("");
  const [responsable, setResponsable]               = useState("");
  const [responsableEmail, setResponsableEmail]     = useState("");
  const [usuarios, setUsuarios]                     = useState<string[]>([]);
  const [usuariosData, setUsuariosData]             = useState<{ label: string; email: string }[]>([]);
  const [peso, setPeso]                             = useState("");
  const [fechaInicio, setFechaInicio]               = useState<Date | null>(null);
  const [fechaFin, setFechaFin]                     = useState<Date | null>(null);
  const [presupuesto, setPresupuesto]               = useState<number | string>("");
  const [presupuestoEjecutado, setPresupuestoEjecutado] = useState<number | string>("");
  const [loading, setLoading]                       = useState(false);

  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/all`)
      .then(res => {
        const lista = Array.isArray(res.data) ? res.data : (res.data.users ?? []);
        const data = lista
          .filter((u: any) => u.full_name)
          .map((u: any) => ({ label: u.full_name as string, email: (u.email ?? "") as string }));
        const unicos = Array.from(
          new Map<string, { label: string; email: string }>(data.map((u: { label: string; email: string }) => [u.label, u])).values()
        );
        setUsuariosData(unicos);
        setUsuarios(unicos.map((u: { label: string; email: string }) => u.label));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setResponsable(selected.responsable ?? "");
      setResponsableEmail(selected.responsable_email ?? "");
      setPeso(String(selected.peso));
      setFechaInicio(selected.fecha_inicio ? new Date(selected.fecha_inicio) : null);
      setFechaFin(selected.fecha_fin ? new Date(selected.fecha_fin) : null);
      setPresupuesto(selected.presupuesto ?? "");
      setPresupuestoEjecutado(selected.presupuesto_ejecutado ?? "");
    } else {
      setCodigo(""); setNombre(""); setResponsable(""); setResponsableEmail(""); setPeso("");
      setFechaInicio(null); setFechaFin(null); setPresupuesto(""); setPresupuestoEjecutado("");
    }
  }, [opened, selected]);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Código y nombre son requeridos", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        codigo:    codigo.trim(),
        nombre:    nombre.trim(),
        alcance:   selected?.alcance ?? "",
        responsable:       responsable.trim(),
        responsable_email: responsableEmail.trim(),
        peso: toNum(peso),
        proyecto_id: defaultProyectoId,
        fecha_inicio: fechaInicio ? fechaInicio.toISOString() : null,
        fecha_fin:    fechaFin    ? fechaFin.toISOString()    : null,
        presupuesto:           presupuesto          !== "" ? Number(presupuesto)          : 0,
        presupuesto_ejecutado: presupuestoEjecutado !== "" ? Number(presupuestoEjecutado) : 0,
      };
      const res = selected
        ? await axios.put(PDI_ROUTES.accion(selected._id), payload)
        : await axios.post(PDI_ROUTES.acciones(), payload);
      showNotification({ title: selected ? "Actualizado" : "Creada", message: "Acción estratégica guardada", color: "teal" });
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={selected ? "Editar Acción Estratégica" : "Nueva Acción Estratégica"} centered size="lg">
      <Tabs defaultValue="general">
        <Tabs.List mb="sm">
          <Tabs.Tab value="general">General</Tabs.Tab>
          <Tabs.Tab value="presupuesto">Presupuesto y fechas</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="general">
          <Stack gap="sm">
            <Group grow>
              <TextInput label="Código" placeholder="Ej: 1.1.1" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
              <TextInput label="Peso (%)" placeholder="Ej: 33,33" value={peso} onChange={(e) => setPeso(e.currentTarget.value)} />
            </Group>
            <TextInput label="Nombre" placeholder="Nombre de la acción" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
            <Autocomplete
              label="Responsable"
              placeholder="Buscar usuario..."
              value={responsable}
              onChange={(val) => {
                setResponsable(val);
                const found = usuariosData.find((u) => u.label === val);
                setResponsableEmail(found?.email ?? "");
              }}
              data={usuarios}
              limit={8}
            />
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
                placeholder="Ej: 20000000"
                value={presupuesto}
                onChange={setPresupuesto}
                thousandSeparator="."
                decimalSeparator=","
                min={0}
              />
              <NumberInput
                label="Presupuesto ejecutado (COP)"
                placeholder="Ej: 10000000"
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
