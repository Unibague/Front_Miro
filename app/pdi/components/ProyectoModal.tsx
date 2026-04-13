"use client";

import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Group, Stack, Select, Autocomplete } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import type { Proyecto, Macroproyecto } from "../types";
import { PDI_ROUTES } from "../api";

interface Props {
  opened: boolean;
  onClose: () => void;
  selected: Proyecto | null;
  macroproyectos: Macroproyecto[];
  defaultMacroId?: string;
  onSaved: (doc: Proyecto) => void;
}

const toNum = (v: string) => Number(v.replace(',', '.'));

export default function ProyectoModal({ opened, onClose, selected, macroproyectos, defaultMacroId, onSaved }: Props) {
  const [codigo, setCodigo]               = useState("");
  const [nombre, setNombre]               = useState("");
  const [formulador, setFormulador]       = useState("");
  const [responsable, setResponsable]     = useState("");
  const [responsableEmail, setResponsableEmail] = useState("");
  const [peso, setPeso]                   = useState("");
  const [macroId, setMacroId]             = useState<string | null>(defaultMacroId ?? null);
  const [loading, setLoading]             = useState(false);
  const [usuariosData, setUsuariosData]   = useState<{ label: string; email: string }[]>([]);
  const [usuarios, setUsuarios]           = useState<string[]>([]);

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
  }, []);

  useEffect(() => {
    if (!opened) return;
    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setFormulador(selected.formulador);
      setResponsable((selected as any).responsable ?? "");
      setResponsableEmail((selected as any).responsable_email ?? "");
      setPeso(String(selected.peso));
      setMacroId(selected.macroproyecto_id._id);
    } else {
      setCodigo(""); setNombre(""); setFormulador(""); setResponsable(""); setResponsableEmail(""); setPeso("");
      setMacroId(defaultMacroId ?? null);
    }
  }, [opened]);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim() || !macroId) {
      showNotification({ title: "Error", message: "Código, nombre y macroproyecto son requeridos", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        codigo: codigo.trim(), nombre: nombre.trim(), formulador: formulador.trim(),
        responsable: responsable.trim(), responsable_email: responsableEmail.trim(),
        peso: toNum(peso), macroproyecto_id: macroId,
      };
      const res = selected
        ? await axios.put(PDI_ROUTES.proyecto(selected._id), payload)
        : await axios.post(PDI_ROUTES.proyectos(), payload);
      showNotification({ title: selected ? "Actualizado" : "Creado", message: "Proyecto guardado", color: "teal" });
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={selected ? "Editar Proyecto" : "Nuevo Proyecto"} centered>
      <Stack gap="sm">
        <Select
          label="Macroproyecto"
          placeholder="Selecciona un macroproyecto"
          data={macroproyectos.map(m => ({ value: m._id, label: `${m.codigo} - ${m.nombre}` }))}
          value={macroId}
          onChange={(v) => setMacroId(v)}
          searchable
        />
        <TextInput label="Código" placeholder="Ej: 1.1" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
        <TextInput label="Nombre" placeholder="Nombre del proyecto" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
        <TextInput label="Formulador" placeholder="Nombre del formulador" value={formulador} onChange={(e) => setFormulador(e.currentTarget.value)} />
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
        <TextInput label="Peso (%)" placeholder="Ej: 33,33" value={peso} onChange={(e) => setPeso(e.currentTarget.value)} />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button loading={loading} onClick={handleSave}>Guardar</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
