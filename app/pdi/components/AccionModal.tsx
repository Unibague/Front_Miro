"use client";

import { useEffect, useState } from "react";
import {
  Modal, TextInput, Button, Group, Stack, NumberInput,
  Divider, Text, SimpleGrid, MultiSelect,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import "dayjs/locale/es";
import type { Accion } from "../types";
import { PDI_ROUTES } from "../api";
import { usePdiConfig } from "../hooks/usePdiConfig";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";

interface Props {
  opened: boolean;
  onClose: () => void;
  selected: Accion | null;
  defaultProyectoId: string;
  onSaved: (doc: Accion) => void;
}

function buildAniosMap(anios: number[], source?: Record<string, number>): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  anios.forEach(a => { result[String(a)] = source?.[String(a)] ?? 0; });
  return result;
}

export default function AccionModal({ opened, onClose, selected, defaultProyectoId, onSaved }: Props) {
  const { config } = usePdiConfig();
  const { setHasChanges, confirmNavigation } = useUnsavedChanges();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [numIndicadores, setNumIndicadores] = useState<number | string>(0);
  const [presupuesto, setPresupuesto] = useState<number | string>(0);
  const [presupuestoAnios, setPresupuestoAnios] = useState<Record<string, number | string>>({});
  const [ejecutadoAnios, setEjecutadoAnios] = useState<Record<string, number | string>>({});
  const [responsablesSeleccionados, setResponsablesSeleccionados] = useState<string[]>([]);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [usuariosData, setUsuariosData] = useState<{ label: string; email: string }[]>([]);
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
    if (!opened) { setHasChanges(false); return; }
    if (selected) {
      setCodigo(selected.codigo);
      setNombre(selected.nombre);
      setNumIndicadores(selected.num_indicadores ?? 0);
      setPresupuesto(selected.presupuesto ?? 0);
      setPresupuestoAnios(buildAniosMap(config.anios, selected.presupuesto_por_anio));
      setEjecutadoAnios(buildAniosMap(config.anios, selected.presupuesto_ejecutado_por_anio));
      if (Array.isArray(selected.responsables) && selected.responsables.length > 0) {
        setResponsablesSeleccionados(selected.responsables.map((r) => r.nombre));
      } else if (selected.responsable) {
        setResponsablesSeleccionados([selected.responsable]);
      } else {
        setResponsablesSeleccionados([]);
      }
      return;
    }
    setCodigo("");
    setNombre("");
    setNumIndicadores(0);
    setPresupuesto(0);
    setPresupuestoAnios(buildAniosMap(config.anios));
    setEjecutadoAnios(buildAniosMap(config.anios));
    setResponsablesSeleccionados([]);
  }, [opened, selected, config.anios]);

  const pesoAuto = selected
    ? selected.peso
    : (config.acciones_por_proyecto > 0 ? parseFloat((100 / config.acciones_por_proyecto).toFixed(6)) : 0);

  const totalPresupuesto = Object.values(presupuestoAnios).reduce<number>((s, v) => s + (Number(v) || 0), 0);

  const toNumberMap = (m: Record<string, number | string>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number(v) || 0]));

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Codigo y nombre son requeridos", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const responsables = responsablesSeleccionados.map((nombreResp) => {
        const usuario = usuariosData.find((u) => u.label === nombreResp);
        return { nombre: nombreResp.trim(), email: usuario?.email.trim().toLowerCase() || "" };
      });

      const payload = {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        alcance: selected?.alcance ?? "",
        peso: pesoAuto,
        num_indicadores: Number(numIndicadores) || 0,
        presupuesto: Number(presupuesto) || 0,
        presupuesto_por_anio: toNumberMap(presupuestoAnios),
        presupuesto_ejecutado_por_anio: toNumberMap(ejecutadoAnios),
        proyecto_id: defaultProyectoId,
        responsables,
        fecha_inicio: selected?.fecha_inicio ?? null,
        fecha_fin: selected?.fecha_fin ?? null,
      };

      const res = selected
        ? await axios.put(PDI_ROUTES.accion(selected._id), payload)
        : await axios.post(PDI_ROUTES.acciones(), payload);

      showNotification({ title: selected ? "Actualizado" : "Creada", message: "Accion estrategica guardada", color: "teal" });
      setHasChanges(false);
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  const cols = { base: 2, sm: Math.min(Math.max(config.anios.length, 1), 4) } as any;

  return (
    <Modal opened={opened} onClose={() => confirmNavigation(onClose)} title={selected ? "Editar Accion Estrategica" : "Nueva Accion Estrategica"} centered size="lg">
      <Stack gap="sm">
        <Group grow>
          <TextInput label="Codigo" value={codigo} onChange={(e) => { setCodigo(e.currentTarget.value); setHasChanges(true); }} />
          <NumberInput label="Número de indicadores" value={numIndicadores} onChange={(v) => { setNumIndicadores(v); setHasChanges(true); }} min={0} step={1} allowDecimal={false} />
        </Group>
        <TextInput label="Nombre" value={nombre} onChange={(e) => { setNombre(e.currentTarget.value); setHasChanges(true); }} />
        <MultiSelect
          label="Responsables de la Acción"
          description="Quienes reportan el avance de esta acción. El responsable del proyecto evaluará lo que reporten."
          placeholder="Seleccionar uno o más responsables..."
          value={responsablesSeleccionados}
          onChange={(valores) => {
            setResponsablesSeleccionados(valores);
            setHasChanges(true);
          }}
          data={usuarios}
          searchable
          clearable
          limit={8}
        />
        <NumberInput
          label="Presupuesto global (COP)"
          value={presupuesto}
          onChange={(v) => { setPresupuesto(v); setHasChanges(true); }}
          min={0}
          thousandSeparator="."
          decimalSeparator=","
          prefix="$ "
        />

        {config.anios.length > 0 && (
          <>
            <Divider mt="xs" />
            <Text size="sm" fw={500} mt="xs">Presupuesto asignado por año</Text>
            <SimpleGrid cols={cols} spacing="sm" mt={6}>
              {config.anios.map(anio => (
                <NumberInput
                  key={anio}
                  label={String(anio)}
                  value={presupuestoAnios[String(anio)] ?? 0}
                  onChange={v => { setPresupuestoAnios(prev => ({ ...prev, [String(anio)]: v })); setHasChanges(true); }}
                  min={0}
                  thousandSeparator="."
                  decimalSeparator=","
                  prefix="$ "
                />
              ))}
            </SimpleGrid>
            {totalPresupuesto > 0 && (
              <Text size="xs" c={totalPresupuesto > (Number(presupuesto) || 0) ? "red" : "dimmed"} ta="right" mt={6}>
                Total: $ {totalPresupuesto.toLocaleString("es-CO")}
                {Number(presupuesto) > 0 && ` / $ ${Number(presupuesto).toLocaleString("es-CO")}`}
                {totalPresupuesto > (Number(presupuesto) || 0) && "  ⚠ Supera el presupuesto global"}
              </Text>
            )}
          </>
        )}
      </Stack>

      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={() => confirmNavigation(onClose)}>Cancelar</Button>
        <Button loading={loading} onClick={handleSave}>Guardar</Button>
      </Group>
    </Modal>
  );
}
