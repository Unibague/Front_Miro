"use client";

import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Group, Stack, Textarea } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
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
  const [codigo, setCodigo]   = useState("");
  const [nombre, setNombre]   = useState("");
  const [alcance, setAlcance] = useState("");
  const [peso, setPeso]       = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setAlcance(selected.alcance ?? "");
      setPeso(String(selected.peso));
    } else {
      setCodigo(""); setNombre(""); setAlcance(""); setPeso("");
    }
  }, [opened]);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Código y nombre son requeridos", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const payload = { codigo: codigo.trim(), nombre: nombre.trim(), alcance: alcance.trim(), peso: toNum(peso), proyecto_id: defaultProyectoId };
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
    <Modal opened={opened} onClose={onClose} title={selected ? "Editar Acción Estratégica" : "Nueva Acción Estratégica"} centered>
      <Stack gap="sm">
        <TextInput label="Código" placeholder="Ej: 1.1.1" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
        <TextInput label="Nombre" placeholder="Nombre de la acción" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
        <Textarea label="Alcance" placeholder="Descripción del alcance" value={alcance} onChange={(e) => setAlcance(e.currentTarget.value)} rows={3} />
        <TextInput label="Peso (%)" placeholder="Ej: 33,33" value={peso} onChange={(e) => setPeso(e.currentTarget.value)} />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={loading} onClick={handleSave}>Guardar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
