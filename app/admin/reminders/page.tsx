"use client";

import {
  Button,
  Container,
  Group,
  Modal,
  NumberInput,
  Text,
  Title,
  Table,
  ActionIcon,
  Box,
  Center,
  Tooltip,
  TextInput,
  ScrollArea
} from "@mantine/core";
import { useState, useEffect } from "react";
import axios from "axios";
import { IconTrash, IconPlus, IconEdit } from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";

export default function AdminRemindersPage() {
  const [opened, setOpened] = useState(false);
  const [daysBefore, setDaysBefore] = useState<number | "">(1);
  const [reminders, setReminders] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newDays, setNewDays] = useState<number | "">(1);
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);

  const fetchReminders = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/reminders`);
      setReminders(response.data);
    } catch (error) {
      console.error("Error al cargar recordatorios", error);
    }
  };

  const createReminder = async () => {
    try {
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/reminders`, { daysBefore });
      setOpened(false);
      setDaysBefore(1);
      fetchReminders();
      showNotification({
        title: "Recordatorio creado",
        message: `Se enviará un correo ${daysBefore} día(s) antes del vencimiento.`,
        color: "teal",
      });
    } catch (error) {
      console.error("Error al crear recordatorio", error);
      showNotification({
        title: "Error",
        message: "No se pudo crear el recordatorio",
        color: "red",
      });
    }
  };

  const deleteReminder = async (id: string) => {
    if (!window.confirm("¿Seguro que deseas eliminar este recordatorio?")) return;
    try {
      await axios.delete(`${process.env.NEXT_PUBLIC_API_URL}/reminders/${id}`);
      fetchReminders();
    } catch (error) {
      console.error("Error al eliminar recordatorio", error);
    }
  };

  const updateReminder = async (id: string) => {
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/reminders/${id}`, {
        daysBefore: newDays,
      });
      setEditingId(null);
      fetchReminders();
      showNotification({
        title: "Recordatorio actualizado",
        message: `Se enviará un correo ${newDays} día(s) antes.`,
        color: "teal",
      });
    } catch (error) {
      console.error("Error actualizando recordatorio", error);
      showNotification({
        title: "Error",
        message: "No se pudo actualizar el recordatorio",
        color: "red",
      });
    }
  };

  const sendReminders = async (tipo: "plantilla" | "informe") => {
  const confirmMsg = tipo === "informe"
    ? "¿Estás seguro de que quieres enviar los recordatorios de informes de productor ahora?"
    : "¿Estás seguro de que quieres enviar los recordatorios de plantillas de productor ahora?";

  if (!window.confirm(confirmMsg)) return;

  setSending(true);
  try {
    const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/reminders/send-now?type=${tipo}`);
    const enviados = response.data.sent || 0;

    showNotification({
      title: "Envío completado",
      message: `Se enviaron recordatorios a ${enviados} persona(s). También se ha enviado correo de confirmación a miro@unibague.edu.co`,
      color: "teal"
    });
  } catch (error) {
    console.error("Error al enviar recordatorios:", error);
    showNotification({
      title: "Error",
      message: "Ocurrió un error al enviar los recordatorios.",
      color: "red",
    });
  } finally {
    setSending(false);
  }
};


  const sendRemindersNow = async () => {
  if (!window.confirm("¿Estás seguro de que quieres enviar los recordatorios de plantillas de productor ahora??")) return;

  setSending(true);
  try {
    const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/reminders/send-reminders`);
    const enviados = response.data.enviados || 0;

    showNotification({
      title: "Envío completado",
      message: `Se enviaron recordatorios a ${enviados} persona(s).`,
      color: "teal",
    });
  } catch (error) {
    console.error("Error al enviar recordatorios:", error);
    showNotification({
      title: "Error",
      message: "Ocurrió un error al enviar los recordatorios.",
      color: "red",
    });
  } finally {
    setSending(false);
  }
};

  const sendPublishedProducerReportsReminder = async () => {
  if (!window.confirm("¿Estás seguro de que quieres enviar los recordatorios de informes de productor ahora??")) return;

  setSending(true);
  try {
    const response = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/reminders/send-publishedProducerReports-reminders`);
    const enviados = response.data || 0;
    showNotification({
      title: "Envío completado",
      message: `Se enviaron recordatorios a ${enviados} persona(s). También se ha enviado correo de confirmación a miro@unibague.edu.co`,
      color: "teal"
    });
  } catch (error) {
    console.error("Error al enviar recordatorios:", error);
    showNotification({
      title: "Error",
      message: "Ocurrió un error al enviar los recordatorios.",
      color: "red",
    });
  } finally {
    setSending(false);
  }
};

  useEffect(() => {
    fetchReminders();
  }, []);

  return (
    <Container size="xl">
      <Title ta="center" mt="md" mb="md">
        Recordatorios por correo
      </Title>

      <Text ta="center" mb="lg" color="dimmed">
        Define recordatorios que se enviarán por correo antes del vencimiento de las plantillas.
      </Text>

      <Group justify="space-between" align="center" mb="md">
        <Button leftSection={<IconPlus size={18} />} onClick={() => setOpened(true)}>
          Nuevo Recordatorio
        </Button>

        <Group gap="sm">
          <Button
            variant="light"
            color="orange"
            loading={sending}
            onClick={() => sendReminders("plantilla")}
          >
            Enviar recordatorio plantillas productor
          </Button>

          <Button
            variant="light"
            color="violet"
            loading={sending}
            onClick={() => sendReminders("informe")}
          >
            Enviar recordatorio informes productor
          </Button>
        </Group>
      </Group>
      {sending && (
        <Text ta="center" c="orange" fw={500} mb="sm">
          ⏳ Enviando recordatorios... por favor no cierres ni abandones esta pantalla hasta que se complete la operación.
        </Text>
      )}

      <ScrollArea>
        <Table striped withTableBorder highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ textAlign: "center" }}>Días antes del vencimiento</Table.Th>
              <Table.Th style={{ textAlign: "center" }}>Última modificación</Table.Th>
              <Table.Th style={{ textAlign: "center" }}>Acciones</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {reminders
              .filter((r) =>
                r.daysBefore.toString().includes(search.trim())
              )
              .map((reminder) => (
                <Table.Tr key={reminder._id}>
                  <Table.Td style={{ textAlign: "center" }}>
                    {editingId === reminder._id ? (
                      <NumberInput
                        value={newDays}
                        onChange={(val) => setNewDays(typeof val === "number" ? val : "")}
                        min={0}
                        size="xs"
                        style={{ maxWidth: 80, margin: "auto" }}
                      />
                    ) : (
                      `${reminder.daysBefore} día(s)`
                    )}
                  </Table.Td>
                  <Table.Td style={{ textAlign: "center" }}>
                    {new Date(reminder.updatedAt).toLocaleString("es-CO")}
                  </Table.Td>
                  <Table.Td style={{ textAlign: "center" }}>
                    <Group justify="center" gap={4}>
                      {editingId === reminder._id ? (
                        <>
                          <Button size="xs" onClick={() => updateReminder(reminder._id)}>
                            Guardar
                          </Button>
                          <Button size="xs" variant="default" onClick={() => setEditingId(null)}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Tooltip label="Editar" withArrow>
                            <ActionIcon
                              variant="outline"
                              color="blue"
                              onClick={() => {
                                setEditingId(reminder._id);
                                setNewDays(reminder.daysBefore);
                              }}
                            >
                              <IconEdit size={18} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="Eliminar" withArrow>
                            <ActionIcon color="red" variant="outline" onClick={() => deleteReminder(reminder._id)}>
                              <IconTrash size={18} />
                            </ActionIcon>
                          </Tooltip>
                        </>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Nuevo Recordatorio"
        overlayProps={{ blur: 2, opacity: 0.3 }}
      >
        <Box>
          <NumberInput
            label="Días antes del vencimiento"
            description="El correo se enviará este número de días antes de la fecha límite de entrega."
            placeholder="Ej: 3"
            value={daysBefore}
            onChange={(val) => setDaysBefore(typeof val === "number" ? val : "")}
            min={0}
            required
          />

          <Button mt="md" fullWidth onClick={createReminder} disabled={daysBefore === ""}>
            Crear recordatorio
          </Button>
        </Box>
      </Modal>
    </Container>
  );
}
