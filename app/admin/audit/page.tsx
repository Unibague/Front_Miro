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
  const [dependencyNames, setDependencyNames] = useState<Record<string, string>>({});

  const fetchAuditLogs = async (page: number, search: string, entityType?: string) => {
    setLoading(true);
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL}/audit/logs`;
      
      // Mapeo de filtros combinados
      const combinedFilters: { [key: string]: string[] } = {
        'dimensions': ['dimension', 'DIMENSION'],
        'templates': ['template', 'TEMPLATE', 'publishedTemplate', 'publishedTemplateData'],
        'reports': ['producerReport', 'publishedProducerReport', 'REPORT']
      };
      
      if (entityType && combinedFilters[entityType]) {
        // Hacer múltiples peticiones para filtros combinados
        const promises = combinedFilters[entityType].map(type => 
          axios.get(url, {
            params: { page: 1, limit: 100, search, entityType: type },
            headers: { 'user-email': session?.user?.email || '' }
          })
        );
        
        const responses = await Promise.all(promises);
        const allLogs = responses.flatMap(response => response.data.logs || []);
        
        // Ordenar por timestamp descendente
        allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        // Paginar manualmente
        const startIndex = (page - 1) * 15;
        const endIndex = startIndex + 15;
        const paginatedLogs = allLogs.slice(startIndex, endIndex);
        
        setAuditLogs(paginatedLogs);
        setTotalPages(Math.ceil(allLogs.length / 15));
      } else {
        // Petición normal para otros filtros
        const params: any = { page, limit: 15, search };
        if (entityType && entityType !== '') {
          params.entityType = entityType;
        }
        
        const response = await axios.get(url, {
          params,
          headers: { 'user-email': session?.user?.email || '' }
        });
        
        setAuditLogs(response.data.logs || []);
        setTotalPages(response.data.totalPages || response.data.pages || 1);
      }
    } catch (error) {
      console.error("Error fetchin audit logs:", error);
      setAuditLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDependencyNames = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dependencies/all`);
      const deps = response.data.dependencies || [];
      const nameMap: Record<string, string> = {};
      deps.forEach((dep: any) => {
        nameMap[dep.dep_code] = dep.name;
      });
      setDependencyNames(nameMap);
    } catch (error) {
      console.error('Error fetching dependency names:', error);
    }
  };

  useEffect(() => {
    fetchDependencyNames();
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
      case 'dependency': return 'Dependencia';
      case 'dependency_permission': return 'Permisos de Dependencia';
      case 'userDependencies': return 'Permisos de Dependencia';
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
      case 'impersonate': return 'grape';
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
      case 'dependency': return 'cyan';
      case 'dependency_permission': return 'indigo';
      case 'userDependencies': return 'indigo';
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
      
      // Manejo para cambios de campos
      if (parsed.fieldName && parsed.action) {
        return `${parsed.action} el campo "${parsed.fieldName}" en la plantilla "${parsed.templateName || 'plantilla'}"`;
      }
      
      // Manejo para cambios de productores
      if (parsed.producerName && parsed.action) {
        return parsed.action;
      }
      
      // Manejo para cambios de dimensiones
      if (parsed.dimensionName && parsed.action) {
        return parsed.action;
      }
      
      // Manejo para cambios generales de plantilla
      if (parsed.field && parsed.action) {
        return parsed.action;
      }
      
      // Manejo para usuarios - cambio de estado
      if (parsed.userEmail && parsed.statusChange) {
        const actionText = parsed.statusChange === 'activated' ? 'activó' : 'desactivó';
        return `${actionText.charAt(0).toUpperCase() + actionText.slice(1)} al usuario ${parsed.userEmail}`;
      }
      
      // Manejo para usuarios - cambio de roles
      if (parsed.userEmail && parsed.newRoles) {
        const roles = Array.isArray(parsed.newRoles) ? parsed.newRoles.join(', ') : parsed.newRoles;
        return `Actualizó los roles del usuario ${parsed.userEmail} a: ${roles}`;
      }
      
      // Manejo para dimensiones
      if (parsed.dimensionName && parsed.responsibleDependency) {
        const actionText = action?.toLowerCase() === 'create' ? 'Creó' : action?.toLowerCase() === 'delete' ? 'Eliminó' : 'Actualizó';
        return `${actionText} el ámbito "${parsed.dimensionName}" asignado a ${parsed.responsibleDependency}`;
      }
      
      // Manejo para cambios de permisos de dependencias (nuevo formato)
      if (parsed.userEmail && parsed.dependencyChanges) {
        let dependencyChanges;
        try {
          dependencyChanges = typeof parsed.dependencyChanges === 'string' 
            ? JSON.parse(parsed.dependencyChanges) 
            : parsed.dependencyChanges;
        } catch {
          dependencyChanges = parsed.dependencyChanges;
        }
        
        let message = `Actualizó permisos de dependencias para ${parsed.userEmail}`;
        
        if (dependencyChanges.added && dependencyChanges.added.length > 0) {
          const addedNames = dependencyChanges.added.map((code: string) => 
            dependencyNames[code] || code
          );
          message += `. Agregó: ${addedNames.join(', ')}`;
        }
        if (dependencyChanges.removed && dependencyChanges.removed.length > 0) {
          const removedNames = dependencyChanges.removed.map((code: string) => 
            dependencyNames[code] || code
          );
          message += `. Eliminó: ${removedNames.join(', ')}`;
        }
        
        return message;
      }
      
      // Manejo para cambios de permisos de dependencias (formato anterior)
      if (parsed.targetUser && parsed.changes) {
        const { added, removed } = parsed.changes;
        let message = `Actualizó permisos de ${parsed.targetUser.name || parsed.targetUser.email}`;
        
        if (added && added.length > 0) {
          const addedNames = added.map((code: string) => 
            dependencyNames[code] || code
          );
          message += `. Agregó: ${addedNames.join(', ')}`;
        }
        if (removed && removed.length > 0) {
          const removedNames = removed.map((code: string) => 
            dependencyNames[code] || code
          );
          message += `. Eliminó: ${removedNames.join(', ')}`;
        }
        
        return message;
      }
      
      // Manejo para cambios de dependencias
      if (parsed.dependencyCode && parsed.changes) {
        let message = `Actualizó dependencia ${parsed.dependencyCode}`;
        const changes = parsed.changes;
        
        if (changes.responsible) {
          message += `. Responsable: ${changes.responsible.old || 'Sin asignar'} → ${changes.responsible.new || 'Sin asignar'}`;
        }
        if (changes.producers) {
          if (changes.producers.added && changes.producers.added.length > 0) {
            message += `. Agregó productores: ${changes.producers.added.join(', ')}`;
          }
          if (changes.producers.removed && changes.producers.removed.length > 0) {
            message += `. Eliminó productores: ${changes.producers.removed.join(', ')}`;
          }
        }
        
        return message;
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
      
      // Manejo para creación de plantillas
      if (parsed.templateName && parsed.fieldsCount && action?.toLowerCase() === 'create') {
        return `Creó la plantilla "${parsed.templateName}" con ${parsed.fieldsCount} campos`;
      }
      
      return details;
    } catch {
      // Fallback para logs antiguos que pueden tener códigos de dependencias sin mapear
      if (details && typeof details === 'string') {
        // Buscar y reemplazar códigos de dependencias por nombres
        let processedDetails = details;
        Object.entries(dependencyNames).forEach(([code, name]) => {
          // Reemplazar códigos que aparecen como texto plano
          const codeRegex = new RegExp(`\\b${code}\\b`, 'g');
          processedDetails = processedDetails.replace(codeRegex, name);
        });
        return processedDetails;
      }
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
            { value: 'dimensions', label: 'Ámbitos' },
            { value: 'templates', label: 'Plantillas' },
            { value: 'reports', label: 'Informes' },
            { value: 'dependency', label: 'Dependencias' },
            { value: 'dependency_permission', label: 'Permisos de Dependencias' },
            { value: 'userDependencies', label: 'Permisos de Dependencias' },
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

export default AuditPage;