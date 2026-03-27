"use client";

import { useEffect, useState } from "react";
import { Container, Table, TextInput, Select, Group, Title, Badge, Text, Pagination, Center, Card } from "@mantine/core";
import { IconSearch, IconFilter, IconHistory } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";

interface AuditLog {
  _id: string;
  user_email: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_name: string;
  timestamp: string;
  details?: string;
}

const TraceabilityHistoryPage = () => {
  const { data: session } = useSession();
  const { userRole } = useRole();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchAuditLogs = async (page: number, search: string, entityType?: string) => {
    if (!session?.user?.email || userRole === 'Administrador') return;
    
    setLoading(true);
    try {
      const params: any = { 
        email: session.user.email,
        page, 
        limit: 15, 
        search 
      };
      
      if (entityType && entityType !== '') {
        params.entityType = entityType;
      }
      
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/audit/logs-by-entity`, {
        params
      });
      
      setAuditLogs(response.data.logs || []);
      setTotalPages(response.data.totalPages || response.data.pages || 1);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      setAuditLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs(page, search, filterType);
  }, [page, session, userRole]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      fetchAuditLogs(1, search, filterType);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search, filterType]);

  const translateAction = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create': return 'Creó';
      case 'update': return 'Actualizó';
      case 'delete': return 'Eliminó';
      case 'upload': return 'Subió';
      default: return action;
    }
  };

  const translateEntityType = (entityType: string) => {
    switch (entityType) {
      case 'template': return 'Plantilla';
      case 'publishedTemplateData': return 'Plantilla Publicada';
      case 'producerReport': return 'Informe Productor';
      case 'publishedProducerReport': return 'Informe Publicado';
      default: return entityType;
    }
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create': return 'green';
      case 'update': return 'blue';
      case 'delete': return 'red';
      case 'upload': return 'teal';
      default: return 'gray';
    }
  };

  const getEntityTypeColor = (entityType: string) => {
    switch (entityType) {
      case 'template': return 'violet';
      case 'publishedTemplateData': return 'grape';
      case 'producerReport': return 'green';
      case 'publishedProducerReport': return 'teal';
      default: return 'gray';
    }
  };

  const formatDetails = (details?: string, action?: string) => {
    if (!details) return 'Sin detalles';
    
    try {
      const parsed = JSON.parse(details);
      
      // Cambios en plantillas
      if (parsed.templateName) {
        if (parsed.fieldsCount && action?.toLowerCase() === 'create') {
          return `Creó la plantilla "${parsed.templateName}" con ${parsed.fieldsCount} campos`;
        }
        if (parsed.action) {
          return parsed.action;
        }
        return `${translateAction(action || '')} la plantilla "${parsed.templateName}"`;
      }
      
      // Cambios en informes
      if (parsed.reportName) {
        return `${translateAction(action || '')} el informe "${parsed.reportName}"`;
      }
      
      // Cambios de campos
      if (parsed.fieldName && parsed.action) {
        return `${parsed.action} el campo "${parsed.fieldName}"`;
      }
      
      return details;
    } catch {
      return details;
    }
  };

  // Solo mostrar para Productores y Responsables
  if (userRole === 'Administrador') {
    return (
      <Container size="xl">
        <Card withBorder p="xl" mt="xl">
          <Center>
            <Text size="lg" c="dimmed">
              Esta sección está disponible solo para Productores y Responsables
            </Text>
          </Center>
        </Card>
      </Container>
    );
  }

  const rows = auditLogs.map((log) => (
    <Table.Tr key={log._id}>
      <Table.Td>
        <Text size="sm" fw={500}>{log.user_name}</Text>
        <Text size="xs" c="dimmed">{log.user_email}</Text>
      </Table.Td>
      <Table.Td>
        <Badge color={getActionColor(log.action)} variant="light">
          {translateAction(log.action)}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Badge color={getEntityTypeColor(log.entity_type)} variant="outline">
          {translateEntityType(log.entity_type)}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{log.entity_name}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{new Date(log.timestamp).toLocaleString('es-ES')}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="xs" c="dimmed" lineClamp={2}>
          {formatDetails(log.details, log.action)}
        </Text>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <Group mb="lg" align="center">
        <IconHistory size={32} color="teal" />
        <div>
          <Title order={2}>Historial de Cambios</Title>
          <Text c="dimmed">
            Cambios realizados en plantillas e informes de tus dependencias
          </Text>
        </div>
      </Group>

      <Group mb="md">
        <TextInput
          placeholder="Buscar por usuario, acción o entidad..."
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          leftSection={<IconSearch size={16} />}
          style={{ flex: 1 }}
        />
        <Select
          placeholder="Filtrar por tipo"
          data={[
            { value: '', label: 'Todos los tipos' },
            { value: 'publishedTemplateData', label: 'Plantillas' },
            { value: 'producerReport', label: 'Informes' },
          ]}
          value={filterType}
          onChange={(value) => setFilterType(value || '')}
          leftSection={<IconFilter size={16} />}
          clearable
          style={{ minWidth: 200 }}
        />
      </Group>

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Usuario</Table.Th>
            <Table.Th>Acción</Table.Th>
            <Table.Th>Tipo</Table.Th>
            <Table.Th>Entidad</Table.Th>
            <Table.Th>Fecha</Table.Th>
            <Table.Th>Detalles</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {loading ? (
            <Table.Tr>
              <Table.Td colSpan={6} style={{ textAlign: 'center' }}>
                Cargando...
              </Table.Td>
            </Table.Tr>
          ) : rows.length > 0 ? (
            rows
          ) : (
            <Table.Tr>
              <Table.Td colSpan={6} style={{ textAlign: 'center', color: 'gray' }}>
                No se encontraron cambios en tus dependencias
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {totalPages > 1 && (
        <Center mt="md">
          <Pagination
            value={page}
            onChange={setPage}
            total={totalPages}
            siblings={1}
            boundaries={3}
          />
          <Text size="xs" c="dimmed" ml="md">
            Página {page} de {totalPages} ({auditLogs.length} registros)
          </Text>
        </Center>
      )}
    </Container>
  );
};

export default TraceabilityHistoryPage;