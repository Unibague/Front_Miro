"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Modal, TextInput, Button, Group, Stack, NumberInput,
  Divider, Text, SimpleGrid, MultiSelect, ActionIcon, Box,
} from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import "dayjs/locale/es";
import type { Accion, Proyecto } from "../types";
import { PDI_ROUTES } from "../api";
import { usePdiConfig } from "../hooks/usePdiConfig";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";
import {
  extractNumberSegment,
  getActionPrefix,
  getEntityId,
  getFirstAvailableNumber,
  normalizePdiCode,
} from "../code-validation";

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

function buildNotasMap(anios: number[], source?: Record<string, string[]>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  anios.forEach(a => { result[String(a)] = [...(source?.[String(a)] ?? [])]; });
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
  const [notasAnios, setNotasAnios] = useState<Record<string, string[]>>({});
  const [responsablesSeleccionados, setResponsablesSeleccionados] = useState<string[]>([]);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [usuariosData, setUsuariosData] = useState<{ label: string; email: string }[]>([]);
  const [proyectoPadre, setProyectoPadre] = useState<Proyecto | null>(null);
  const [accionesProyecto, setAccionesProyecto] = useState<Accion[]>([]);
  const [accionesProyectoLoaded, setAccionesProyectoLoaded] = useState(false);
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
      setNotasAnios(buildNotasMap(config.anios, selected.notas_presupuesto_por_anio));
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
    setNotasAnios(buildNotasMap(config.anios));
    setResponsablesSeleccionados([]);
  }, [opened, selected, config.anios, setHasChanges]);

  useEffect(() => {
    if (!opened || !defaultProyectoId) {
      setProyectoPadre(null);
      setAccionesProyecto([]);
      setAccionesProyectoLoaded(false);
      return;
    }

    if (!selected) setCodigo("");
    setAccionesProyectoLoaded(false);
    axios.get(PDI_ROUTES.proyecto(defaultProyectoId))
      .then((res) => setProyectoPadre(res.data))
      .catch(() => setProyectoPadre(null));

    axios.get(PDI_ROUTES.acciones(), { params: { proyecto_id: defaultProyectoId } })
      .then((res) => setAccionesProyecto(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAccionesProyecto([]))
      .finally(() => setAccionesProyectoLoaded(true));
  }, [opened, defaultProyectoId, selected]);

  const pesoAuto = selected
    ? selected.peso
    : (config.acciones_por_proyecto > 0 ? parseFloat((100 / config.acciones_por_proyecto).toFixed(6)) : 0);

  const totalPresupuesto = Object.values(presupuestoAnios).reduce<number>((s, v) => s + (Number(v) || 0), 0);

  const toNumberMap = (m: Record<string, number | string>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Number(v) || 0]));

  const agregarNota = (anio: string) => {
    setNotasAnios(prev => ({ ...prev, [anio]: [...(prev[anio] ?? []), ""] }));
    setHasChanges(true);
  };
  const editarNota = (anio: string, index: number, valor: string) => {
    setNotasAnios(prev => ({
      ...prev,
      [anio]: (prev[anio] ?? []).map((n, i) => (i === index ? valor : n)),
    }));
    setHasChanges(true);
  };
  const quitarNota = (anio: string, index: number) => {
    setNotasAnios(prev => ({
      ...prev,
      [anio]: (prev[anio] ?? []).filter((_, i) => i !== index),
    }));
    setHasChanges(true);
  };
  const toNotasMapLimpio = (m: Record<string, string[]>) =>
    Object.fromEntries(
      Object.entries(m).map(([anio, notas]) => [anio, notas.map(n => n.trim()).filter(Boolean)])
    );

  const expectedActionPrefix = useMemo(
    () => getActionPrefix(proyectoPadre?.codigo),
    [proyectoPadre?.codigo]
  );

  const codigoNormalizado = normalizePdiCode(codigo);
  const codigoError = useMemo(() => {
    if (!codigo.trim()) return null;
    if (!expectedActionPrefix) return "No se pudo validar la accion porque el proyecto padre no tiene codigo M#-P# valido.";
    if (!/^M[1-9]\d*-P[1-9]\d*-A[1-9]\d*$/.test(codigoNormalizado)) {
      return "El codigo de la accion debe tener formato M#-P#-A# (por ejemplo, M2-P3-A1).";
    }
    if (!codigoNormalizado.startsWith(expectedActionPrefix)) {
      return `Para el proyecto ${proyectoPadre?.codigo} el codigo debe iniciar con ${expectedActionPrefix}.`;
    }

    const duplicada = accionesProyecto.find((accion) =>
      accion._id !== selected?._id && normalizePdiCode(accion.codigo) === codigoNormalizado
    );
    if (duplicada) return `Ya existe una accion con el codigo ${duplicada.codigo}.`;

    const numero = extractNumberSegment(codigoNormalizado, "A");
    if (!numero) return null;

    const existentes = accionesProyecto.filter((accion) => accion._id !== selected?._id);
    const numerosUsados = new Set(
      existentes
        .map((accion) => extractNumberSegment(accion.codigo, "A"))
        .filter((value): value is number => value !== null)
    );
    const numeroOriginal = extractNumberSegment(selected?.codigo, "A");
    const conservaNumero = Boolean(
      selected &&
      getEntityId(selected.proyecto_id) === defaultProyectoId &&
      numeroOriginal === numero
    );
    if (conservaNumero) return null;

    const esperado = getFirstAvailableNumber(numerosUsados);
    if (numero !== esperado) {
      return `La numeracion no es consecutiva. El siguiente codigo esperado es ${expectedActionPrefix}${esperado}.`;
    }

    return null;
  }, [accionesProyecto, codigo, codigoNormalizado, defaultProyectoId, expectedActionPrefix, proyectoPadre?.codigo, selected]);

  useEffect(() => {
    if (!opened || selected || !expectedActionPrefix || !accionesProyectoLoaded || codigo.trim()) return;
    const numerosUsados = new Set(
      accionesProyecto
        .map((accion) => extractNumberSegment(accion.codigo, "A"))
        .filter((value): value is number => value !== null)
    );
    setCodigo(`${expectedActionPrefix}${getFirstAvailableNumber(numerosUsados)}`);
  }, [accionesProyecto, accionesProyectoLoaded, codigo, expectedActionPrefix, opened, selected]);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim()) {
      showNotification({ title: "Error", message: "Codigo y nombre son requeridos", color: "red" });
      return;
    }
    if (codigoError) {
      showNotification({ title: "Codigo invalido", message: codigoError, color: "red" });
      return;
    }
    setLoading(true);
    try {
      const responsables = responsablesSeleccionados.map((nombreResp) => {
        const usuario = usuariosData.find((u) => u.label === nombreResp);
        return { nombre: nombreResp.trim(), email: usuario?.email.trim().toLowerCase() || "" };
      });

      const payload = {
        codigo: codigoNormalizado,
        nombre: nombre.trim(),
        alcance: selected?.alcance ?? "",
        peso: pesoAuto,
        num_indicadores: Number(numIndicadores) || 0,
        presupuesto: Number(presupuesto) || 0,
        presupuesto_por_anio: toNumberMap(presupuestoAnios),
        presupuesto_ejecutado_por_anio: toNumberMap(ejecutadoAnios),
        notas_presupuesto_por_anio: toNotasMapLimpio(notasAnios),
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
          <TextInput
            label="Codigo"
            placeholder={expectedActionPrefix ? `${expectedActionPrefix}1` : "Ej: M2-P3-A1"}
            value={codigo}
            error={codigoError ?? undefined}
            description={expectedActionPrefix ? `Debe iniciar con ${expectedActionPrefix}` : undefined}
            onChange={(e) => { setCodigo(e.currentTarget.value); setHasChanges(true); }}
          />
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
              {config.anios.map(anio => {
                const anioStr = String(anio);
                const notas = notasAnios[anioStr] ?? [];
                return (
                  <Box key={anio}>
                    <NumberInput
                      label={anioStr}
                      value={presupuestoAnios[anioStr] ?? 0}
                      onChange={v => { setPresupuestoAnios(prev => ({ ...prev, [anioStr]: v })); setHasChanges(true); }}
                      min={0}
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="$ "
                    />
                    <Stack gap={4} mt={6}>
                      <Text size="xs" c="dimmed">¿A dónde va dirigido? (actividades)</Text>
                      {notas.map((nota, index) => (
                        <Group key={index} gap={4} wrap="nowrap">
                          <TextInput
                            size="xs"
                            placeholder="Ej: Compra de equipos"
                            value={nota}
                            onChange={(e) => editarNota(anioStr, index, e.currentTarget.value)}
                            style={{ flex: 1 }}
                          />
                          <ActionIcon size="sm" color="red" variant="subtle" onClick={() => quitarNota(anioStr, index)}>
                            <IconX size={14} />
                          </ActionIcon>
                        </Group>
                      ))}
                      <Button
                        size="xs"
                        variant="subtle"
                        color="violet"
                        leftSection={<IconPlus size={12} />}
                        onClick={() => agregarNota(anioStr)}
                        style={{ alignSelf: "flex-start" }}
                      >
                        Agregar actividad
                      </Button>
                    </Stack>
                  </Box>
                );
              })}
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
        <Button loading={loading} disabled={Boolean(codigoError)} onClick={handleSave}>Guardar</Button>
      </Group>
    </Modal>
  );
}
