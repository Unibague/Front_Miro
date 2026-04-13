"use client";

import { useState } from "react";
import { Modal, Stack, TextInput, Switch, Select, Button, Group, Text } from "@mantine/core";
import axios from "axios";
import type { Program, PQR } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  programas: Program[];
  onCreado: (pqr: PQR) => void;
}

export default function AgregarPQRModal({ opened, onClose, programas, onCreado }: Props) {
  const [nombre, setNombre]           = useState("");
  const [ligado, setLigado]           = useState(false);
  const [programaId, setProgramaId]   = useState<string | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const programaOpts = programas.map(p => ({
    value: p._id,
    label: `${p.nombre} (${p.dep_code_facultad})`,
  }));

  const handleClose = () => {
    setNombre("");
    setLigado(false);
    setProgramaId(null);
    setError(null);
    onClose();
  };

  const handleCrear = async () => {
    if (!nombre.trim()) { setError("El nombre de la solicitud es requerido."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/pqr`, {
        nombre_solicitud: nombre.trim(),
        programa_id: ligado ? programaId : null,
      });
      onCreado(res.data as PQR);
      handleClose();
    } catch {
      setError("No se pudo crear el PQR. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal opened={opened} onClose={handleClose} title="Agregar PQR" centered size="md" radius="md">
      <Stack gap="md">
        <TextInput
          label="Nombre / descripción de la solicitud"
          placeholder="Ej: Solicitud acto administrativo de Ing. Civil"
          value={nombre}
          onChange={e => setNombre(e.currentTarget.value)}
          required
          onKeyDown={e => e.key === "Enter" && handleCrear()}
        />

        <Switch
          label="¿Ligado a un programa académico?"
          checked={ligado}
          onChange={e => { setLigado(e.currentTarget.checked); if (!e.currentTarget.checked) setProgramaId(null); }}
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
          <Button variant="default" onClick={handleClose}>Cancelar</Button>
          <Button loading={loading} onClick={handleCrear}>Crear PQR</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
