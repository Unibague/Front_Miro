"use client";

import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Group, Stack, NumberInput } from "@mantine/core";
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

const toNum = (v: string) => Number(v.replace(",", "."));

export default function AccionModal({ opened, onClose, selected, defaultProyectoId, onSaved }: Props) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [responsable, setResponsable] = useState("");
  const [responsableEmail, setResponsableEmail] = useState("");
  const [peso, setPeso] = useState("");
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin] = useState<Date | null>(null);
  const [presupuesto, setPresupuesto] = useState<number | string>("");
  const [loading, setLoading] = useState(false);

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
      return;
    }

    setCodigo("");
    setNombre("");
    setResponsable("");
    setResponsableEmail("");
    setPeso("");
    setFechaInicio(null);
    setFechaFin(null);
    setPresupuesto("");
  }, [opened, selected]);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Codigo y nombre son requeridos", color: "red" });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        alcance: selected?.alcance ?? "",
        peso: toNum(peso),
        proyecto_id: defaultProyectoId,
        fecha_inicio: fechaInicio ? fechaInicio.toISOString() : null,
        fecha_fin: fechaFin ? fechaFin.toISOString() : null,
        presupuesto: presupuesto !== "" ? Number(presupuesto) : 0,
        presupuesto_ejecutado: 0,
      };

      if (selected) {
        Object.assign(payload, {
          responsable: selected.responsable ?? "",
          responsable_email: selected.responsable_email ?? "",
        });
      } else {
        Object.assign(payload, {
          responsable: "",
          responsable_email: "",
        });
      }

      const res = selected
        ? await axios.put(PDI_ROUTES.accion(selected._id), payload)
        : await axios.post(PDI_ROUTES.acciones(), payload);

      showNotification({ title: selected ? "Actualizado" : "Creada", message: "Accion estrategica guardada", color: "teal" });
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={selected ? "Editar Accion Estrategica" : "Nueva Accion Estrategica"} centered size="lg">
      <Stack gap="sm">
        <Group grow>
          <TextInput label="Codigo" placeholder="Ej: 1.1.1" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
          <TextInput label="Peso (%)" placeholder="Ej: 33,33" value={peso} onChange={(e) => setPeso(e.currentTarget.value)} />
        </Group>
        <TextInput label="Nombre" placeholder="Nombre de la accion" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
        <NumberInput
          label="Presupuesto asignado (COP)"
          placeholder="Ej: 20000000"
          value={presupuesto}
          onChange={setPresupuesto}
          thousandSeparator="."
          decimalSeparator=","
          min={0}
        />
      </Stack>

      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button loading={loading} onClick={handleSave}>Guardar</Button>
      </Group>
    </Modal>
  );
}
