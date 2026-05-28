"use client";

import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Group, Stack, Autocomplete, NumberInput } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import type { Macroproyecto } from "../types";
import { PDI_ROUTES } from "../api";
import { usePdiConfig } from "../hooks/usePdiConfig";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";

interface Props {
  opened: boolean;
  onClose: () => void;
  selected: Macroproyecto | null;
  onSaved: (doc: Macroproyecto) => void;
}

export default function MacroproyectoModal({ opened, onClose, selected, onSaved }: Props) {
  const { config } = usePdiConfig();
  const { setHasChanges, confirmNavigation } = useUnsavedChanges();
  const [codigo, setCodigo]               = useState("");
  const [nombre, setNombre]               = useState("");
  const [lider, setLider]                 = useState("");
  const [liderEmail, setLiderEmail]       = useState("");
  const [numProyectos, setNumProyectos]   = useState<number | string>(0);
  const [usuarios, setUsuarios]           = useState<{ name: string; email: string }[]>([]);
  const [loading, setLoading]             = useState(false);

  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/all`)
      .then((res) => {
        const lista = Array.isArray(res.data) ? res.data : (res.data.users ?? []);
        const vistosEmail = new Set<string>();
        const vistosNombre = new Set<string>();
        const unicos: { name: string; email: string }[] = [];
        for (const u of lista) {
          if (u.full_name && u.email && !vistosEmail.has(u.email) && !vistosNombre.has(u.full_name)) {
            vistosEmail.add(u.email);
            vistosNombre.add(u.full_name);
            unicos.push({ name: u.full_name, email: u.email });
          }
        }
        setUsuarios(unicos);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!opened) { setHasChanges(false); return; }
    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setLider(selected.lider ?? "");
      setLiderEmail(selected.lider_email ?? "");
      setNumProyectos(selected.num_proyectos ?? 0);
    } else {
      setCodigo(""); setNombre(""); setLider(""); setLiderEmail(""); setNumProyectos(0);
    }
  }, [opened]);

  const handleLiderChange = (name: string) => {
    setHasChanges(true);
    setLider(name);
    const found = usuarios.find((u) => u.name === name);
    if (found) setLiderEmail(found.email);
    else setLiderEmail("");
  };

  const pesoAuto = selected
    ? selected.peso
    : (config.num_macroproyectos > 0 ? parseFloat((100 / config.num_macroproyectos).toFixed(6)) : 0);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Código y nombre son requeridos", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        codigo:        codigo.trim(),
        nombre:        nombre.trim(),
        lider:         lider.trim(),
        lider_email:   liderEmail.trim().toLowerCase(),
        peso:          pesoAuto,
        num_proyectos: Number(numProyectos) || 0,
      };
      const res = selected
        ? await axios.put(PDI_ROUTES.macroproyecto(selected._id), payload)
        : await axios.post(PDI_ROUTES.macroproyectos(), payload);
      showNotification({ title: selected ? "Actualizado" : "Creado", message: "Macroproyecto guardado", color: "teal" });
      setHasChanges(false);
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={() => confirmNavigation(onClose)} title={selected ? "Editar Macroproyecto" : "Nuevo Macroproyecto"} centered>
      <Stack gap="sm">
        <TextInput label="Código" placeholder="Ej: 1" value={codigo} onChange={(e) => { setCodigo(e.currentTarget.value); setHasChanges(true); }} />
        <TextInput label="Nombre" placeholder="Nombre del macroproyecto" value={nombre} onChange={(e) => { setNombre(e.currentTarget.value); setHasChanges(true); }} />
        <Autocomplete
          label="Líder"
          placeholder="Buscar usuario..."
          value={lider}
          onChange={handleLiderChange}
          data={usuarios.map((u) => u.name)}
          limit={8}
        />
        {liderEmail && (
          <TextInput label="Email del líder" value={liderEmail} readOnly styles={{ input: { color: "gray" } }} />
        )}
        <NumberInput
          label="Número de proyectos"
          description="El peso de cada proyecto se calculará como 100 / n"
          placeholder="Ej: 3"
          value={numProyectos}
          onChange={(v) => { setNumProyectos(v); setHasChanges(true); }}
          min={0}
          step={1}
          allowDecimal={false}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={() => confirmNavigation(onClose)}>Cancelar</Button>
          <Button loading={loading} onClick={handleSave}>Guardar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
