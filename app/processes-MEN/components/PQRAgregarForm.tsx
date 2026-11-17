"use client";

import { useState } from "react";
import { Stack, TextInput, Select, Button, Group, Text, SegmentedControl, SimpleGrid, Box, ThemeIcon, Alert } from "@mantine/core";
import { IconPlus, IconFileText, IconId, IconSchool, IconBuildingBank, IconAlertCircle } from "@tabler/icons-react";
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
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={38} radius="xl" variant="light" color="teal"><IconPlus size={20} /></ThemeIcon>
          <Box>
            <Text fw={700} size="lg" lh={1.2}>Nueva solicitud PQR</Text>
            <Text size="xs" c="dimmed">Registra una petición, queja o reclamo ante el Ministerio de Educación.</Text>
          </Box>
        </Group>
      )}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" verticalSpacing="md">
      <TextInput
        label="Nombre / descripción de la solicitud"
        placeholder="Ej: Solicitud acto administrativo de Ing. Civil"
        leftSection={<IconFileText size={16} />}
        value={nombre}
        onChange={e => setNombre(e.currentTarget.value)}
        required
        onKeyDown={e => e.key === "Enter" && void handleCrear()}
      />
      <Box>
        <Text size="sm" fw={500} mb={6}>¿A quién corresponde?</Text>
        <SegmentedControl
          fullWidth
          radius="md"
          color="teal"
          value={ligado ? "programa" : "men"}
          onChange={(v) => {
            const esPrograma = v === "programa";
            setLigado(esPrograma);
            if (!esPrograma) setProgramaId(null);
          }}
          data={[
            { value: "men", label: <Group gap={6} justify="center" wrap="nowrap"><IconBuildingBank size={15} /><span>Directo con el MEN</span></Group> },
            { value: "programa", label: <Group gap={6} justify="center" wrap="nowrap"><IconSchool size={15} /><span>Ligado a un programa</span></Group> },
          ]}
        />
      </Box>
        {ligado && (
          <Select
            label="Programa"
            placeholder="Busca y selecciona un programa..."
            leftSection={<IconSchool size={16} />}
            data={programaOpts}
            value={programaId}
            onChange={setProgramaId}
            searchable
            clearable
          />
        )}
        <TextInput
          label="Cédula del encargado"
          placeholder="Ej: 1.234.567.890"
          leftSection={<IconId size={16} />}
          value={cedulaEncargado}
          onChange={e => setCedulaEncargado(e.currentTarget.value)}
        />
      </SimpleGrid>
      {error && (
        <Alert color="red" variant="light" radius="md" icon={<IconAlertCircle size={16} />} py="xs">
          {error}
        </Alert>
      )}
      <Group justify="flex-end" mt="xs">
        {onCancel && <Button variant="default" onClick={onCancel}>Cancelar</Button>}
        <Button color="teal" leftSection={<IconPlus size={16} />} loading={loading} onClick={() => void handleCrear()}>
          Crear PQR
        </Button>
      </Group>
    </Stack>
  );
}
