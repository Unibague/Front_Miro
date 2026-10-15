"use client";

import { useState } from "react";
import { Button, Group, Modal, Radio, Stack, Text, Textarea, Paper } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { IconArrowBackUp } from "@tabler/icons-react";
import axios from "axios";
import { PDI_ROUTES } from "../api";
import type { RespuestaFormulario } from "../types";

type Nivel = "proyecto" | "lider" | "planeacion";

const NIVEL_TEXTO: Record<Nivel, string> = {
  proyecto: "tu aprobación como responsable del proyecto",
  lider: "tu aprobación como líder del macroproyecto",
  planeacion: "la validación de Planeación",
};

const NIVEL_LABEL: Record<Nivel, string> = {
  proyecto: "Responsable del proyecto",
  lider: "Líder del macroproyecto",
  planeacion: "Planeación",
};

function getFormularioId(r: RespuestaFormulario) {
  return typeof r.formulario_id === "string" ? r.formulario_id : (r.formulario_id as any)?._id;
}

// Permite a un evaluador deshacer una aprobación ya registrada (por si se equivocó):
// volver a dejar el reporte pendiente de su evaluación o devolverlo al responsable
// de la acción para correcciones. El backend notifica por correo a los involucrados.
export default function DeshacerAprobacion({
  respuesta,
  nivel,
  por,
  onDone,
}: {
  respuesta: RespuestaFormulario;
  nivel: Nivel;
  por: string;
  onDone?: () => void;
}) {
  const [opened, setOpened] = useState(false);
  const [modo, setModo] = useState<"reabrir" | "devolver">("devolver");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const confirmar = async () => {
    if (!motivo.trim()) {
      showNotification({ title: "Requerido", message: "Indica el motivo o las correcciones a realizar", color: "orange" });
      return;
    }
    setSaving(true);
    try {
      await axios.put(PDI_ROUTES.formularioRevertir(getFormularioId(respuesta), respuesta._id), {
        nivel,
        modo,
        por,
        motivo: motivo.trim(),
      });
      showNotification({
        title: "Aprobación deshecha",
        message: modo === "devolver"
          ? "El reporte fue devuelto para correcciones y se notificó a los involucrados."
          : "El reporte quedó nuevamente pendiente de evaluación y se notificó a los involucrados.",
        color: "orange",
      });
      setOpened(false);
      setMotivo("");
      onDone?.();
    } catch (err: any) {
      showNotification({
        title: "Error",
        message: err?.response?.data?.error || "No se pudo deshacer la aprobación",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  const reversiones = respuesta.reversiones ?? [];

  return (
    <>
      {reversiones.length > 0 && (
        <Paper withBorder radius="md" p="sm" mb="sm" style={{ background: "rgba(255,146,43,0.06)", borderColor: "#ffe8cc" }}>
          <Text size="xs" fw={700} c="orange.8" tt="uppercase" mb={4}>Aprobaciones deshechas</Text>
          <Stack gap={4}>
            {reversiones.map((rev, i) => (
              <Text key={`${rev.fecha}-${i}`} size="xs">
                <b>{NIVEL_LABEL[rev.nivel]}</b>
                {" · "}{rev.modo === "devolver" ? "devuelto para correcciones" : "reabierto para nueva revisión"}
                {rev.por ? ` · ${rev.por}` : ""}
                {rev.fecha ? ` · ${new Date(rev.fecha).toLocaleDateString("es-CO")}` : ""}
                {rev.motivo ? ` — ${rev.motivo}` : ""}
              </Text>
            ))}
          </Stack>
        </Paper>
      )}

      <Group justify="flex-end">
        <Button
          variant="light"
          color="orange"
          radius="xl"
          leftSection={<IconArrowBackUp size={14} />}
          onClick={() => setOpened(true)}
        >
          Deshacer aprobación
        </Button>
      </Group>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Deshacer aprobación" radius="lg" centered>
        <Stack gap="md">
          <Text size="sm">
            Vas a deshacer {NIVEL_TEXTO[nivel]} para el corte <b>{respuesta.corte}</b>. Las evaluaciones
            posteriores (si las hay) quedarán sin efecto y se notificará por correo a los involucrados.
          </Text>
          <Radio.Group value={modo} onChange={(v) => setModo(v as "reabrir" | "devolver")} label="¿Qué deseas hacer?">
            <Stack gap="xs" mt="xs">
              <Radio value="devolver" label="Devolver al responsable de la acción para correcciones" />
              <Radio value="reabrir" label="Volver a dejarlo pendiente de mi evaluación" />
            </Stack>
          </Radio.Group>
          <Textarea
            label={modo === "devolver" ? "Correcciones requeridas" : "Motivo"}
            placeholder={modo === "devolver"
              ? "Describe qué debe corregir o complementar el responsable..."
              : "Explica por qué se deshace la aprobación..."}
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
            minRows={3}
            autosize
            required
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>Cancelar</Button>
            <Button color="orange" loading={saving} onClick={confirmar}>Confirmar</Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
