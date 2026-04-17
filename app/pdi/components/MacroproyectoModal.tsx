"use client";

import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Group, Stack, Autocomplete } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import type { Macroproyecto } from "../types";
import { PDI_ROUTES } from "../api";

interface Props {
  opened: boolean;
  onClose: () => void;
  selected: Macroproyecto | null;
  onSaved: (doc: Macroproyecto) => void;
}

const toNum = (v: string) => Number(v.replace(',', '.'));

export default function MacroproyectoModal({ opened, onClose, selected, onSaved }: Props) {
  const [codigo, setCodigo]   = useState("");
  const [nombre, setNombre]   = useState("");
  const [lider, setLider]     = useState("");
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [peso, setPeso]       = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/all`)
      .then((res) => {
        const lista = Array.isArray(res.data) ? res.data : (res.data.users ?? []);
        const nombres = Array.from(
          new Set(
            lista
              .filter((u: any) => u.full_name)
              .map((u: any) => u.full_name as string)
          )
        );
        setUsuarios(nombres);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setLider(selected.lider ?? "");
      setPeso(String(selected.peso));
    } else {
      setCodigo(""); setNombre(""); setLider(""); setPeso("");
    }
  }, [opened]);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Código y nombre son requeridos", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        lider: lider.trim(),
        peso: toNum(peso),
      };
      const res = selected
        ? await axios.put(PDI_ROUTES.macroproyecto(selected._id), payload)
        : await axios.post(PDI_ROUTES.macroproyectos(), payload);
      showNotification({ title: selected ? "Actualizado" : "Creado", message: "Macroproyecto guardado", color: "teal" });
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={selected ? "Editar Macroproyecto" : "Nuevo Macroproyecto"} centered>
      <Stack gap="sm">
        <TextInput label="Código" placeholder="Ej: 1" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
        <TextInput label="Nombre" placeholder="Nombre del macroproyecto" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
        <Autocomplete
          label="Lider"
          placeholder="Buscar usuario..."
          value={lider}
          onChange={setLider}
          data={usuarios}
          limit={8}
        />
        <TextInput label="Peso (%)" placeholder="Ej: 33,33" value={peso} onChange={(e) => setPeso(e.currentTarget.value)} />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={loading} onClick={handleSave}>Guardar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
