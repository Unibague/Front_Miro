"use client";

import { useEffect, useState } from "react";
import { Container, Table, TextInput, Select, Group, Title, Badge, Text, Pagination, Center } from "@mantine/core";
import { IconSearch, IconFilter } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";

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

const AuditPage = () => {
  const { data: session } = useSession();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchAuditLogs = async (page: number, search: string, entityType?: string) => {
    setLoading(true);
    try {
      const params: any = { page, limit: 15, search };
      if (entityType) params.entityType = entityType;
      
      const url = `${process.env.NEXT_PUBLIC_API_URL}/audit/logs`;
      console.log('🔍 Fetching audit logs from:', url, 'with params:', params);
      
      const response = await axios.get(url, {
        params,
        headers: {
          'user-email': session?.user?.email || ''
        }
      });
      
      setAuditLogs(response.data.logs || []);
      setTotalPages(response.data.pages || 1);
    } catch (error) {
      console.error("Errr fething audit logs:", error);
      setAuditLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs(page, search, filterType);
  }, [page]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setPage(1);
      fetchAuditLogs(1, search, filterType);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [search, filterType]);

  const translateAction = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create': return 'Crear';
      case 'update': return 'Actualizar';
      case 'delete': return 'Eliminar';
      case 'upload': return 'Subir';
      case 'impersonate': return 'Impersonar';
      default: return action;
    }
  };

  const translateEntityType = (entityType: string) => {
    switch (entityType) {
      case 'TEMPLATE':
      case 'template': return 'Plantilla';
      case 'DIMENSION':
      case 'dimension': return 'Ámbito';
      case 'DEPENDENCY': return 'Dependencia';
      case 'REPORT': return 'Informe';
      case 'producerReport': return 'Informe Productor';
      case 'publishedTemplate': return 'Plantilla Publicada';
      case 'publishedProducerReport': return 'Informe Productor Publicado';
      case 'publishedTemplateData': return 'Plantilla Publicada';
      case 'USER':
      case 'user': return 'Usuario';
      default: return entityType;
    }
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create': return 'green';
      case 'update': return 'blue';
      case 'delete': return 'red';
      case 'upload': return 'teal';
      case 'impersonate': return 'purple';
      default: return 'gray';
    }
  };

  const getEntityTypeColor = (entityType: string) => {
    switch (entityType) {
      case 'TEMPLATE':
      case 'template': return 'violet';
      case 'DIMENSION':
      case 'dimension': return 'orange';
      case 'DEPENDENCY': return 'cyan';
      case 'REPORT': return 'blue';
      case 'producerReport': return 'green';
      case 'publishedTemplate': return 'grape';
      case 'publishedProducerReport': return 'teal';
      case 'publishedTemplateData': return 'grape';
      case 'USER':
      case 'user': return 'pink';
      default: return 'gray';
    }
  };

  const formatDetails = (details?: string, action?: string, entityType?: string) => {
    if (!details) return 'Sin detalles';
    
    try {
      const parsed = JSON.parse(details);
      
      // Manejo para informes
      if (parsed.reportId && parsed.reportName) {
        return `Eliminó el informe "${parsed.reportName}"`;
      }
      
      // Manejo para plantillas
      if (parsed.templateId && parsed.templateName) {
        return `Eliminó la plantilla "${parsed.templateName}"`;
      }
      
      // Manejo para usuarios
      if (parsed.userEmail && parsed.statusChange) {
        const actionText = parsed.statusChange === 'activated' ? 'activó' : 'desactivó';
        return `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} al usuario ${parsed.userEmail}`;
      }
      
      // Manejo para dimensiones
      if (parsed.dimensionName && parsed.responsibleDependency) {
        const actionText = action?.toLowerCase() === 'create' ? 'Creó' : action?.toLowerCase() === 'delete' ? 'Eliminó' : 'Actualizó';
        return `${actionText} el ámbito "${parsed.dimensionName}" asignado a ${parsed.responsibleDependency}`;
      }
      
      // Manejo para impersonación
      if (parsed.targetUser) {
        return `Impersonó al usuario ${parsed.targetUser}`;
      }
      
      // Manejo para plantillas publicadas
      if (parsed.publishedTemplateId && parsed.templateName) {
        const actionText = action?.toLowerCase() === 'delete' ? 'Eliminó' : 'Actualizó';
        return `${actionText} la plantilla publicada "${parsed.templateName}" de la dependencia ${parsed.dependency}`;
      }
      
      return details;
    } catch {
      return details;
    }
  };

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
        <Text size="sm">{log.entity_type === 'user' && log.entity_name === 'Unknown' ? (
          (() => {
            try {
              const parsed = JSON.parse(log.details || '{}');
              if (parsed.userEmail && parsed.statusChange) {
                const status = parsed.statusChange === 'activated' ? 'A' : 'I';
                return `Usuario ${status}/I`;
              }
            } catch {}
            return log.entity_name;
          })()
        ) : log.entity_name}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="sm">{new Date(log.timestamp).toLocaleString('es-ES')}</Text>
      </Table.Td>
      <Table.Td>
        <Text size="xs" c="dimmed" lineClamp={2}>
          {formatDetails(log.details, log.action, log.entity_type)}
        </Text>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Container size="xl">
      <Title ta="center" mt="md" mb="md">
        Historial de Trazabilidad
      </Title>
      
      <Text ta="center" mb="lg" c="dimmed">
        Consulta el historial de cambios realizados en el sistema
      </Text>

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
            { value: 'TEMPLATE', label: 'Plantillas' },
            { value: 'DIMENSION', label: 'Ámbitos' },
            { value: 'DEPENDENCY', label: 'Dependencias' },
            { value: 'REPORT', label: 'Informes' },
            { value: 'producerReport', label: 'Informes Productor' },
            { value: 'publishedTemplate', label: 'Plantillas Publicadas' },
            { value: 'publishedTemplateData', label: 'Plantillas Publicadas' },
            { value: 'publishedProducerReport', label: 'Informes Productor Publicados' },
            { value: 'user', label: 'Usuarios' },
          ]}
          value={filterType}
          onChange={(value) => setFilterType(value || '')}
          leftSection={<IconFilter size={16} />}
          clearable
          style={{ minWidth: 250 }}
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
                No se encontraron registros
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Center mt="md">
        <Pagination
          value={page}
          onChange={setPage}
          total={totalPages}
          siblings={1}
          boundaries={3}
        />
      </Center>
    </Container>
  );
};

export default AuditPage;