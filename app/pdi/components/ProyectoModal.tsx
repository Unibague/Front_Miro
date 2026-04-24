"use client";

import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Group, Stack, Select, Autocomplete } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useSession } from "next-auth/react";
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
  const { data: session } = useSession();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [responsable, setResponsable] = useState("");
  const [responsableEmail, setResponsableEmail] = useState("");
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [usuariosData, setUsuariosData] = useState<{ label: string; email: string }[]>([]);
  const [proposito, setProposito] = useState("");
  const [peso, setPeso] = useState("");
  const [macroId, setMacroId] = useState<string | null>(defaultMacroId ?? null);
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/all`)
      .then((res) => {
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
      setProposito(selected.descripcion ?? "");
      setPeso(String(selected.peso));
      setMacroId(selected.macroproyecto_id._id);
      setFechaInicio(selected.fecha_inicio ? new Date(selected.fecha_inicio) : null);
      setFechaFin(selected.fecha_fin ? new Date(selected.fecha_fin) : null);
      return;
    }

    setCodigo("");
    setNombre("");
    setResponsable("");
    setResponsableEmail("");
    setProposito("");
    setPeso("");
    setMacroId(defaultMacroId ?? null);
    setFechaInicio(null);
    setFechaFin(null);
  }, [opened, selected, defaultMacroId]);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim() || !macroId) {
      showNotification({ title: "Error", message: "Codigo, nombre y macroproyecto son requeridos", color: "red" });
      return;
    }

    const sessionUser = session?.user as { full_name?: string; name?: string; email?: string } | undefined;
    const formulador = selected?.formulador
      ?? sessionUser?.full_name
      ?? sessionUser?.name
      ?? responsable.trim()
      ?? sessionUser?.email
      ?? "";

    if (!formulador.trim()) {
      showNotification({ title: "Error", message: "No se pudo determinar el formulador del proyecto", color: "red" });
      return;
    }

    setLoading(true);
    try {
      const payload = {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        descripcion: proposito.trim(),
        formulador: formulador.trim(),
        responsable: responsable.trim(),
        responsable_email: responsableEmail.trim(),
        peso: toNum(peso),
        macroproyecto_id: macroId,
        fecha_inicio: fechaInicio ? fechaInicio.toISOString() : null,
        fecha_fin: fechaFin ? fechaFin.toISOString() : null,
        presupuesto: selected?.presupuesto ?? 0,
        presupuesto_ejecutado: selected?.presupuesto_ejecutado ?? 0,
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
          <TextInput label="Codigo" placeholder="Ej: 1.1" value={codigo} onChange={(e) => setCodigo(e.currentTarget.value)} />
          <TextInput label="Peso (%)" placeholder="Ej: 33,33" value={peso} onChange={(e) => setPeso(e.currentTarget.value)} />
        </Group>
        <TextInput label="Nombre" placeholder="Nombre del proyecto" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
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
        <TextInput label="Propósito" placeholder="Propósito del proyecto" value={proposito} onChange={(e) => setProposito(e.currentTarget.value)} />
      </Stack>

      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>Cancelar</Button>
        <Button loading={loading} onClick={handleSave}>Guardar</Button>
      </Group>
    </Modal>
  );
}
