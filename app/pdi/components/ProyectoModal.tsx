"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, TextInput, Button, Group, Stack, Select, MultiSelect, NumberInput } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useSession } from "next-auth/react";
import "dayjs/locale/es";
import type { Proyecto, Macroproyecto } from "../types";
import { PDI_ROUTES } from "../api";
import { usePdiConfig } from "../hooks/usePdiConfig";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";
import {
  extractNumberSegment,
  getEntityId,
  getFirstAvailableNumber,
  getProjectPrefix,
  normalizePdiCode,
} from "../code-validation";

interface Props {
  opened: boolean;
  onClose: () => void;
  selected: Proyecto | null;
  macroproyectos: Macroproyecto[];
  defaultMacroId?: string;
  onSaved: (doc: Proyecto) => void;
  onCreated?: (doc: Proyecto) => void;
}

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
  const { config } = usePdiConfig();
  const { setHasChanges, confirmNavigation } = useUnsavedChanges();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [responsablesSeleccionados, setResponsablesSeleccionados] = useState<string[]>([]);
  const [usuarios, setUsuarios] = useState<string[]>([]);
  const [usuariosData, setUsuariosData] = useState<{ label: string; email: string }[]>([]);
  const [proposito, setProposito] = useState("");
  const [macroId, setMacroId] = useState<string | null>(defaultMacroId ?? null);
  const [numAcciones, setNumAcciones] = useState<number | string>(0);
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFin, setFechaFin] = useState<Date | null>(null);
  const [proyectosMacro, setProyectosMacro] = useState<Proyecto[]>([]);
  const [proyectosMacroLoaded, setProyectosMacroLoaded] = useState(false);
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
      if (Array.isArray(selected.responsables) && selected.responsables.length > 0) {
        setResponsablesSeleccionados(selected.responsables.map((r) => r.nombre));
      } else if (selected.responsable) {
        setResponsablesSeleccionados([selected.responsable]);
      } else {
        setResponsablesSeleccionados([]);
      }
      setProposito(selected.descripcion ?? "");
      setMacroId(selected.macroproyecto_id._id);
      setNumAcciones(selected.num_acciones ?? 0);
      setFechaInicio(selected.fecha_inicio ? new Date(selected.fecha_inicio) : null);
      setFechaFin(selected.fecha_fin ? new Date(selected.fecha_fin) : null);
      return;
    }

    setCodigo("");
    setNombre("");
    setResponsablesSeleccionados([]);
    setProposito("");
    setMacroId(defaultMacroId ?? null);
    setNumAcciones(0);
    setFechaInicio(null);
    setFechaFin(null);
  }, [opened, selected, defaultMacroId, setHasChanges]);

  useEffect(() => {
    if (!opened || !macroId) {
      setProyectosMacro([]);
      setProyectosMacroLoaded(false);
      return;
    }

    setProyectosMacroLoaded(false);
    axios.get(PDI_ROUTES.proyectos(), { params: { macroproyecto_id: macroId } })
      .then((res) => setProyectosMacro(Array.isArray(res.data) ? res.data : []))
      .catch(() => setProyectosMacro([]))
      .finally(() => setProyectosMacroLoaded(true));
  }, [opened, macroId]);

  const pesoAuto = selected
    ? selected.peso
    : (config.proyectos_por_macro > 0 ? parseFloat((100 / config.proyectos_por_macro).toFixed(6)) : 0);

  const macroSeleccionado = useMemo(
    () => macroproyectos.find((macro) => macro._id === macroId) ?? null,
    [macroId, macroproyectos]
  );

  const expectedProjectPrefix = useMemo(
    () => getProjectPrefix(macroSeleccionado?.codigo),
    [macroSeleccionado?.codigo]
  );

  const codigoNormalizado = normalizePdiCode(codigo);
  const codigoError = useMemo(() => {
    if (!codigo.trim()) return null;
    if (!macroId) return "Selecciona un macroproyecto antes de definir el codigo.";
    if (!expectedProjectPrefix) return "El macroproyecto seleccionado no tiene un codigo M# valido.";
    if (!/^M[1-9]\d*-P[1-9]\d*$/.test(codigoNormalizado)) {
      return "El codigo del proyecto debe tener formato M#-P# (por ejemplo, M2-P3).";
    }
    if (!codigoNormalizado.startsWith(expectedProjectPrefix)) {
      return `Para el macroproyecto ${macroSeleccionado?.codigo} el codigo debe iniciar con ${expectedProjectPrefix}.`;
    }

    const duplicado = proyectosMacro.find((proyecto) =>
      proyecto._id !== selected?._id && normalizePdiCode(proyecto.codigo) === codigoNormalizado
    );
    if (duplicado) return `Ya existe un proyecto con el codigo ${duplicado.codigo}.`;

    const numero = extractNumberSegment(codigoNormalizado, "P");
    if (!numero) return null;

    const existentes = proyectosMacro.filter((proyecto) => proyecto._id !== selected?._id);
    const numerosUsados = new Set(
      existentes
        .map((proyecto) => extractNumberSegment(proyecto.codigo, "P"))
        .filter((value): value is number => value !== null)
    );
    const numeroOriginal = extractNumberSegment(selected?.codigo, "P");
    const conservaNumero = Boolean(
      selected &&
      getEntityId(selected.macroproyecto_id) === macroId &&
      numeroOriginal === numero
    );
    if (conservaNumero) return null;

    const esperado = getFirstAvailableNumber(numerosUsados);
    if (numero !== esperado) {
      return `La numeracion no es consecutiva. El siguiente codigo esperado es ${expectedProjectPrefix}${esperado}.`;
    }

    return null;
  }, [codigo, codigoNormalizado, expectedProjectPrefix, macroId, macroSeleccionado?.codigo, proyectosMacro, selected]);

  useEffect(() => {
    if (!opened || selected || !expectedProjectPrefix || !proyectosMacroLoaded || codigo.trim()) return;
    const numerosUsados = new Set(
      proyectosMacro
        .map((proyecto) => extractNumberSegment(proyecto.codigo, "P"))
        .filter((value): value is number => value !== null)
    );
    setCodigo(`${expectedProjectPrefix}${getFirstAvailableNumber(numerosUsados)}`);
  }, [codigo, expectedProjectPrefix, opened, proyectosMacro, proyectosMacroLoaded, selected]);

  const handleSave = async () => {
    if (!codigo.trim() || !nombre.trim() || !macroId) {
      showNotification({ title: "Error", message: "Codigo, nombre y macroproyecto son requeridos", color: "red" });
      return;
    }
    if (codigoError) {
      showNotification({ title: "Codigo invalido", message: codigoError, color: "red" });
      return;
    }

    const sessionUser = session?.user as { full_name?: string; name?: string; email?: string } | undefined;
    const formulador = selected?.formulador
      ?? sessionUser?.full_name
      ?? sessionUser?.name
      ?? responsablesSeleccionados[0]?.trim()
      ?? sessionUser?.email
      ?? "";

    if (!formulador.trim()) {
      showNotification({ title: "Error", message: "No se pudo determinar el formulador del proyecto", color: "red" });
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
        descripcion: proposito.trim(),
        formulador: formulador.trim(),
        responsables,
        peso: pesoAuto,
        num_acciones: Number(numAcciones) || 0,
        macroproyecto_id: macroId,
        fecha_inicio: fechaInicio ? fechaInicio.toISOString() : null,
        fecha_fin: fechaFin ? fechaFin.toISOString() : null,
      };

      const res = selected
        ? await axios.put(PDI_ROUTES.proyecto(selected._id), payload)
        : await axios.post(PDI_ROUTES.proyectos(), payload);

      showNotification({ title: selected ? "Actualizado" : "Creado", message: "Proyecto guardado", color: "teal" });
      setHasChanges(false);
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
    <Modal opened={opened} onClose={() => confirmNavigation(onClose)} title={selected ? "Editar Proyecto" : "Nuevo Proyecto"} centered size="lg">
      <Stack gap="sm">
        <Select
          label="Macroproyecto"
          placeholder="Selecciona un macroproyecto"
          data={macroproyectos.map((m) => ({ value: m._id, label: `${m.codigo} - ${m.nombre}` }))}
          value={macroId}
          onChange={(v) => { setMacroId(v); if (!selected) setCodigo(""); setHasChanges(true); }}
          searchable
        />
        <Group grow>
          <TextInput
            label="Codigo"
            placeholder={expectedProjectPrefix ? `${expectedProjectPrefix}1` : "Ej: M2-P3"}
            value={codigo}
            error={codigoError ?? undefined}
            description={expectedProjectPrefix ? `Debe iniciar con ${expectedProjectPrefix}` : undefined}
            onChange={(e) => { setCodigo(e.currentTarget.value); setHasChanges(true); }}
          />
          <NumberInput
            label="Número de acciones"
            placeholder="Ej: 4"
            value={numAcciones}
            onChange={(v) => { setNumAcciones(v); setHasChanges(true); }}
            min={0}
            step={1}
            allowDecimal={false}
          />
        </Group>
        <TextInput label="Nombre" placeholder="Nombre del proyecto" value={nombre} onChange={(e) => { setNombre(e.currentTarget.value); setHasChanges(true); }} />
        <MultiSelect
          label="Responsables del Proyecto"
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
        <TextInput label="Propósito" placeholder="Propósito del proyecto" value={proposito} onChange={(e) => { setProposito(e.currentTarget.value); setHasChanges(true); }} />
      </Stack>

      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={() => confirmNavigation(onClose)}>Cancelar</Button>
        <Button loading={loading} disabled={Boolean(codigoError)} onClick={handleSave}>Guardar</Button>
      </Group>
    </Modal>
  );
}
