"use client";

import { useState } from "react";
import { Stack, TextInput, Switch, Select, Button, Group, Text } from "@mantine/core";
import axios from "axios";
import type { Program, PQR } from "../types";

type Props = {
  programas: Program[];
  onCreado: (pqr: PQR) => void;
  /** false = solo el formulario (pantalla de módulo); true = Incluir Cancelar y título. */
  showHeader?: boolean;
  onCancel?: () => void;
};

export default function PQRAgregarForm({ programas, onCreado, showHeader, onCancel }: Props) {
  const [nombre, setNombre]         = useState("");
  const [ligado, setLigado]         = useState(false);
  const [programaId, setProgramaId] = useState<string | null>(null);
  const [cedulaEncargado, setCedulaEncargado] = useState("");
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const programaOpts = programas.map(p => ({
    value: p._id,
    label: `${p.nombre} (${p.dep_code_facultad})`,
  }));

  const reset = () => {
    setNombre("");
    setLigado(false);
    setProgramaId(null);
    setCedulaEncargado("");
    setError(null);
  };

  const handleCrear = async () => {
    if (!nombre.trim()) { setError("El nombre de la solicitud es requerido."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/pqr`, {
        nombre_solicitud: nombre.trim(),
        programa_id: ligado ? programaId : null,
        cedula_encargado: cedulaEncargado.trim() || null,
      });
      onCreado(res.data as PQR);
      reset();
    } catch {
      setError("No se pudo crear el PQR. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="md">
      {showHeader && (
        <Text fw={600} size="sm">Nueva solicitud PQR</Text>
      )}
      <TextInput
        label="Nombre / descripción de la solicitud"
        placeholder="Ej: Solicitud acto administrativo de Ing. Civil"
        value={nombre}
        onChange={e => setNombre(e.currentTarget.value)}
        required
        onKeyDown={e => e.key === "Enter" && void handleCrear()}
      />
      <Switch
        label="¿Ligado a un programa académico?"
        checked={ligado}
        onChange={e => { setLigado(e.currentTarget.checked); if (!e.currentTarget.checked) setProgramaId(null); }}
      />
      <TextInput
        label="Cédula del encargado"
        placeholder="Ej: 1.234.567.890"
        value={cedulaEncargado}
        onChange={e => setCedulaEncargado(e.currentTarget.value)}
      />
      {ligado && (
        <Select
          label="Programa"
          placeholder="Busca y selecciona un programa..."
          data={programaOpts}
          value={programaId}
          onChange={setProgramaId}
          searchable
          clearable
        />
      )}
      {error && <Text size="xs" c="red">{error}</Text>}
      <Group justify="flex-end" mt="xs">
        {onCancel && <Button variant="default" onClick={onCancel}>Cancelar</Button>}
        <Button loading={loading} onClick={() => void handleCrear()}>Crear PQR</Button>
      </Group>
    </Stack>
  );
}
