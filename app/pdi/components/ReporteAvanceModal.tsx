"use client";

import { useEffect, useState } from "react";
import {
  Modal, Stack, Textarea, TextInput, Group, Button,
  Badge, Text, Divider, NumberInput, Alert,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconAlertTriangle, IconCheckbox } from "@tabler/icons-react";
import axios from "axios";
import type { Indicador, Periodo, EstadoReporte } from "../types";
import { PDI_ROUTES } from "../api";

interface Props {
  opened: boolean;
  onClose: () => void;
  indicador: Indicador;
  periodo: string; // ej: "2026A" — vacío para crear nuevo
  onSaved: (indicador: Indicador) => void;
}

const ESTADO_COLORS: Record<EstadoReporte, string> = {
  Borrador:  "gray",
  Enviado:   "blue",
  Aprobado:  "teal",
  Rechazado: "red",
};

export default function ReporteAvanceModal({ opened, onClose, indicador, periodo, onSaved }: Props) {
  const esNuevo = !periodo;
  const periodoActual: Periodo | undefined = indicador.periodos.find(p => p.periodo === periodo);

  const [periodoNombre, setPeriodoNombre]           = useState("");
  const [avance, setAvance]                         = useState<number | string>("");
  const [resultados, setResultados]                 = useState("");
  const [logros, setLogros]                         = useState("");
  const [alertas, setAlertas]                       = useState("");
  const [justificacion, setJustificacion]           = useState("");
  const [estadoReporte, setEstadoReporte]           = useState<EstadoReporte>("Borrador");
  const [reportadoPor, setReportadoPor]             = useState("");
  const [loading, setLoading]                       = useState(false);

  useEffect(() => {
    if (!opened) return;
    if (periodoActual) {
      setPeriodoNombre(periodoActual.periodo);
      setAvance(periodoActual.avance ?? "");
      setResultados(periodoActual.resultados_alcanzados ?? "");
      setLogros(periodoActual.logros ?? "");
      setAlertas(periodoActual.alertas ?? "");
      setJustificacion(periodoActual.justificacion_retrasos ?? "");
      setEstadoReporte(periodoActual.estado_reporte ?? "Borrador");
      setReportadoPor(periodoActual.reportado_por ?? "");
    } else {
      setPeriodoNombre(""); setAvance(""); setResultados(""); setLogros(""); setAlertas("");
      setJustificacion(""); setEstadoReporte("Borrador"); setReportadoPor("");
    }
  }, [opened, periodo, indicador]);

  const handleSave = async (nuevoEstado?: EstadoReporte) => {
    const periodoFinal = esNuevo ? periodoNombre.trim() : periodo;
    if (!periodoFinal) {
      showNotification({ title: "Error", message: "El nombre del periodo es requerido (ej: 2026A)", color: "red" });
      return;
    }
    setLoading(true);
    try {
      const res = await axios.patch(PDI_ROUTES.indicadorPeriodo(indicador._id), {
        periodo: periodoFinal,
        avance:                 avance !== "" ? Number(avance) : undefined,
        resultados_alcanzados:  resultados,
        logros,
        alertas,
        justificacion_retrasos: justificacion,
        estado_reporte:         nuevoEstado ?? estadoReporte,
        reportado_por:          reportadoPor,
      });
      showNotification({
        title: "Reporte guardado",
        message: nuevoEstado === "Enviado" ? "El reporte fue enviado para revisión" : "Borrador guardado",
        color: "teal",
      });
      onSaved(res.data);
      onClose();
    } catch (e: any) {
      showNotification({ title: "Error", message: e.response?.data?.error ?? "Error al guardar", color: "red" });
    } finally {
      setLoading(false);
    }
  };

  const estadoBloqueado = periodoActual?.estado_reporte === "Aprobado" || periodoActual?.estado_reporte === "Rechazado";
  const yaEnviado       = periodoActual?.estado_reporte === "Enviado";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap={8}>
          <Text fw={700}>Reporte de avance — {periodo}</Text>
          {periodoActual && (
            <Badge color={ESTADO_COLORS[periodoActual.estado_reporte]} variant="light" size="sm">
              {periodoActual.estado_reporte}
            </Badge>
          )}
        </Group>
      }
      centered
      size="lg"
    >
      <Stack gap="sm">
        <Text size="xs" c="dimmed" fw={600}>{indicador.codigo} — {indicador.nombre}</Text>

        {esNuevo && (
          <TextInput
            label="Nombre del periodo"
            placeholder="Ej: 2026A, 2026B, 2027A..."
            description="Formato recomendado: AñoCorte (2026A = primer semestre 2026)"
            value={periodoNombre}
            onChange={(e) => setPeriodoNombre(e.currentTarget.value)}
            required
          />
        )}

        {estadoBloqueado && (
          <Alert icon={<IconCheckbox size={16} />} color={periodoActual?.estado_reporte === "Aprobado" ? "teal" : "red"} radius="md">
            Este reporte fue <strong>{periodoActual?.estado_reporte}</strong> y no puede modificarse.
          </Alert>
        )}

        <Divider label="Avance cuantitativo" labelPosition="left" />

        <Group grow>
          <NumberInput
            label="Avance reportado"
            description={`Meta periodo: ${periodoActual?.meta ?? "—"}`}
            placeholder="Valor de avance"
            value={avance}
            onChange={setAvance}
            decimalSeparator=","
            disabled={estadoBloqueado}
          />
          <TextInput
            label="Reportado por"
            placeholder="Nombre del responsable"
            value={reportadoPor}
            onChange={(e) => setReportadoPor(e.currentTarget.value)}
            disabled={estadoBloqueado}
          />
        </Group>

        <Divider label="Reporte cualitativo" labelPosition="left" />

        <Textarea
          label="Resultados alcanzados"
          placeholder="Describa los resultados obtenidos en este periodo..."
          value={resultados}
          onChange={(e) => setResultados(e.currentTarget.value)}
          rows={3}
          disabled={estadoBloqueado}
        />
        <Textarea
          label="Logros relevantes"
          placeholder="Hitos o logros destacados del periodo..."
          value={logros}
          onChange={(e) => setLogros(e.currentTarget.value)}
          rows={2}
          disabled={estadoBloqueado}
        />
        <Textarea
          label={
            <Group gap={4}>
              <IconAlertTriangle size={14} color="orange" />
              <span>Alertas o desviaciones</span>
            </Group>
          }
          placeholder="Riesgos, alertas o desviaciones identificadas..."
          value={alertas}
          onChange={(e) => setAlertas(e.currentTarget.value)}
          rows={2}
          disabled={estadoBloqueado}
        />
        <Textarea
          label="Justificación de retrasos"
          placeholder="Si hay retrasos, explique los motivos..."
          value={justificacion}
          onChange={(e) => setJustificacion(e.currentTarget.value)}
          rows={2}
          disabled={estadoBloqueado}
        />

        {!estadoBloqueado && (
          <Group justify="flex-end" mt="md" gap="sm">
            <Button variant="default" onClick={onClose}>Cancelar</Button>
            <Button
              variant="light"
              loading={loading}
              onClick={() => handleSave("Borrador")}
            >
              Guardar borrador
            </Button>
            <Button
              loading={loading}
              color="blue"
              disabled={yaEnviado}
              onClick={() => handleSave("Enviado")}
            >
              {yaEnviado ? "Ya enviado" : "Enviar reporte"}
            </Button>
          </Group>
        )}
        {estadoBloqueado && (
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>Cerrar</Button>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}
