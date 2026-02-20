"use client";

import { useState, useEffect } from "react";
import { Container, Title, Card, Text, Button, Group, Table, Modal, TextInput, Select, Switch, Accordion, Badge, Checkbox, Stack, Divider } from "@mantine/core";
import { IconPlus, IconEdit, IconTrash, IconTemplate, IconFilter, IconEye, IconEyeOff } from "@tabler/icons-react";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useSession } from "next-auth/react";

interface Template {
  _id: string;
  name: string;
  createdAt: string;
  fields?: TemplateField[];
  publishedTemplate?: {
    template: {
      fields: TemplateField[];
    };
  };
  template?: {
    fields: TemplateField[];
  };
}

interface TemplateField {
  name: string;
  type: string;
  required: boolean;
}

interface TemplateFilter {
  _id: string;
  templateId: string;
  fieldName: string;
  isVisible: boolean;
  filterType: 'autocomplete' | 'dropdown' | 'radio' | 'multiselect' | 'date';
  order: number;
}

const FiltersPage = () => {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateFilters, setTemplateFilters] = useState<Record<string, TemplateFilter[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = async () => {
    try {
      setError(null);
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/pTemplates-filtered/all`, {
        params: { 
          email: session?.user?.email,
          periodId: '671fb0cc5468f4fe93a75e65'
        }
      });
      console.log('API Response:', response.data);
      setTemplates(response.data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
      setError("Error al cargar las plantillas");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplateData = async (templateId: string) => {
    try {
      // Los datos ya están disponibles en el template, no necesitamos hacer otra llamada
      const template = templates.find(t => t._id === templateId);
      if (template) {
        const fields = template.publishedTemplate?.template?.fields || template.fields || template.template?.fields || [];
        const generatedFilters = generateFiltersForTemplate({
          _id: templateId,
          name: template.name,
          createdAt: template.createdAt,
          fields: fields
        });
        
        setTemplateFilters(prev => ({
          ...prev,
          [templateId]: generatedFilters
        }));
      }
    } catch (error) {
      console.error("Error fetching template data:", error);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      fetchTemplates();
    }
  }, [session]);

  const updateFilterVisibility = async (templateId: string, fieldName: string, isVisible: boolean) => {
    try {
      // Por ahora solo actualizar estado local
      // En el futuro se puede conectar con el backend para persistir
      setTemplateFilters(prev => ({
        ...prev,
        [templateId]: prev[templateId]?.map(filter => 
          filter.fieldName === fieldName 
            ? { ...filter, isVisible }
            : filter
        ) || []
      }));
      
      showNotification({
        title: "Actualizado",
        message: `Filtro ${isVisible ? 'activado' : 'desactivado'} exitosamente`,
        color: "teal",
      });
    } catch (error) {
      console.error("Error updating filter:", error);
      showNotification({
        title: "Error",
        message: "Error al actualizar el filtro",
        color: "red",
      });
    }
  };

  const generateFiltersForTemplate = (template: Template): TemplateFilter[] => {
    const fields = template.fields || template.publishedTemplate?.template?.fields || template.template?.fields || [];
    return fields.map((field, index) => {
      const fieldLower = field.name.toLowerCase();
      let filterType: 'autocomplete' | 'dropdown' | 'radio' | 'multiselect' | 'date' = 'dropdown';
      
      if (fieldLower.includes('fecha') || fieldLower.includes('date')) {
        filterType = 'date';
      } else if (fieldLower.includes('descripcion') || fieldLower.includes('nombre')) {
        filterType = 'autocomplete';
      } else {
        filterType = 'dropdown';
      }
      
      return {
        _id: `${template._id}_${field.name}`,
        templateId: template._id,
        fieldName: field.name,
        isVisible: true,
        filterType,
        order: index
      };
    });
  };

  if (loading) {
    return (
      <Container size="xl">
        <Title ta="center" mt="md" mb="md">Cargando...</Title>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl">
        <Title ta="center" mt="md" mb="md">Error</Title>
        <Card withBorder p="md">
          <Text ta="center" c="red">{error}</Text>
          <Group justify="center" mt="md">
            <Button onClick={() => fetchTemplates()}>Reintentar</Button>
          </Group>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Title ta="center" mt="md" mb="md">
        Gestión de Filtros por Plantilla
      </Title>
      
      <Card withBorder mb="md">
        <Group justify="space-between">
          <Text>Configura qué filtros aparecen en cada plantilla</Text>
          <Badge variant="light" size="lg">
            {templates.length} Plantillas
          </Badge>
        </Group>
      </Card>

      <Accordion variant="separated">
        {templates && templates.length > 0 ? templates.map((template) => {
          const filters = templateFilters[template._id] || generateFiltersForTemplate(template);
          const visibleFilters = filters.filter(f => f.isVisible).length;
          
          return (
            <Accordion.Item key={template._id} value={template._id}>
              <Accordion.Control
                icon={<IconTemplate size={20} />}
                onClick={() => {
                  if (!templateFilters[template._id]) {
                    fetchTemplateData(template._id);
                  }
                }}
              >
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>{template.name}</Text>
                    <Text size="sm" c="dimmed">
                      {(template.fields || template.publishedTemplate?.template?.fields || template.template?.fields || []).length} campos disponibles
                    </Text>
                  </div>
                  <Badge 
                    variant="filled" 
                    color={visibleFilters > 0 ? "green" : "gray"}
                  >
                    {visibleFilters} filtros activos
                  </Badge>
                </Group>
              </Accordion.Control>
              
              <Accordion.Panel>
                <Stack gap="md">
                  <Text size="sm" c="dimmed">
                    Selecciona qué campos quieres que aparezcan como filtros:
                  </Text>
                  
                  <Divider />
                  
                  {(template.fields || template.publishedTemplate?.template?.fields || template.template?.fields || []).map((field, index) => {
                    const filter = filters.find(f => f.fieldName === field.name);
                    const isVisible = filter?.isVisible ?? true;
                    
                    return (
                      <Card key={field.name} p="sm" withBorder>
                        <Group justify="space-between">
                          <Group>
                            <IconFilter size={16} color={isVisible ? "green" : "gray"} />
                            <div>
                              <Text fw={500}>{field.name.replace(/_/g, ' ')}</Text>
                              <Text size="xs" c="dimmed">
                                Tipo: {field.type} {field.required && '(Requerido)'}
                              </Text>
                            </div>
                          </Group>
                          
                          <Group>
                            <Badge 
                              variant="light" 
                              color={isVisible ? "green" : "gray"}
                              size="sm"
                            >
                              {filter?.filterType || 'dropdown'}
                            </Badge>
                            
                            <Switch
                              checked={isVisible}
                              onChange={(event) => 
                                updateFilterVisibility(
                                  template._id, 
                                  field.name, 
                                  event.currentTarget.checked
                                )
                              }
                              thumbIcon={
                                isVisible ? (
                                  <IconEye size={12} />
                                ) : (
                                  <IconEyeOff size={12} />
                                )
                              }
                            />
                          </Group>
                        </Group>
                      </Card>
                    );
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          );
        }) : (
          <Card withBorder p="md">
            <Text ta="center" c="dimmed">
              No hay plantillas disponibles
            </Text>
          </Card>
        )}
      </Accordion>
    </Container>
  );
};

export default FiltersPage;