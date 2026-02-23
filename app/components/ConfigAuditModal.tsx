"use client"
import { Modal, Text, Table, Badge, ScrollArea, Center, Loader } from "@mantine/core";
import { IconClock, IconUser } from "@tabler/icons-react";
import axios from "axios";
import { useEffect, useState } from "react";

interface AuditEntry {
  _id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  action: string;
  changes: Array<{
    field: string;
    old_value: any;
    new_value: any;
    description?: string;
  }>;
  user: {
    email: string;
    full_name: string;
  };
  timestamp: string;
}

interface ConfigAuditModalProps {
  opened: boolean;
  onClose: () => void;
  entityType: 'template' | 'report' | 'producer-report';
  entityId: string;
  entityName: string;
}

export default function ConfigAuditModal({ opened, onClose, entityType, entityId, entityName }: ConfigAuditModalProps) {
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAuditHistory = async () => {
    if (!entityId) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/config-audit/${entityType}/${entityId}`);
      setAuditHistory(response.data.audits || []);
    } catch (error) {
      console.error("Error fetching audit history:", error);
      setAuditHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened) {
      fetchAuditHistory();
    }
  }, [opened, entityId]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('es-ES');
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'object') {
      // Si es un array, mostrar la cantidad de elementos
      if (Array.isArray(value)) {
        return `${value.length} elementos`;
      }
      // Si es un objeto, mostrar solo las claves principales
      const keys = Object.keys(value);
      if (keys.length > 3) {
        return `Objeto con ${keys.length} propiedades`;
      }
      return keys.join(', ');
    }
    return String(value);
  };

  const getActionMessage = (action: string) => {
    switch (action) {
      case 'create': return 'Creó la plantilla';
      case 'update': return 'Actualizó la plantilla';
      case 'delete': return 'Eliminó la plantilla';
      default: return action;
    }
  };

  const rows = (auditHistory || []).filter(entry => entry && entry._id).map((entry) => (
    <Table.Tr key={entry._id}>
      <Table.Td>
        <Text size="sm" fw={500}>
          <IconUser size={14} style={{ marginRight: 4 }} />
          {entry.user.full_name}
        </Text>
        <Text size="xs" c="dimmed">{entry.user.email}</Text>
      </Table.Td>
      <Table.Td>
        <Badge color="blue" variant="light">{getActionMessage(entry.action)}</Badge>
      </Table.Td>
      <Table.Td>
        {entry.changes.map((change, idx) => (
          <div key={idx} style={{ marginBottom: 8 }}>
            <Text size="sm" fw={500}>{change.field}:</Text>
            <Text size="xs" c="red">Anterior: {formatValue(change.old_value)}</Text>
            <Text size="xs" c="green">Nuevo: {formatValue(change.new_value)}</Text>
          </div>
        ))}
      </Table.Td>
      <Table.Td>
        <Text size="sm">
          <IconClock size={14} style={{ marginRight: 4 }} />
          {formatDate(entry.timestamp)}
        </Text>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Text fw={700}>Trazabilidad de Configuración - {entityName}</Text>}
      size="xl"
      overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
    >
      {loading ? (
        <Center p="xl">
          <Loader />
        </Center>
      ) : (
        <ScrollArea h={400}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Usuario</Table.Th>
                <Table.Th>Acción</Table.Th>
                <Table.Th>Cambios</Table.Th>
                <Table.Th>Fecha</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length > 0 ? rows : (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Center>
                      <Text c="dimmed">No hay historial de cambios</Text>
                    </Center>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Modal>
  );
}