"use client";

import { useState, useEffect } from "react";
import { Paper, Stack, Title, Group, Button, MultiSelect, Text, ActionIcon, Box, Badge, Divider, ScrollArea, Tooltip, Select, Radio, Autocomplete, Combobox, useCombobox, InputBase, Input } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { IconFilter, IconX, IconBuilding, IconSchool, IconWorld, IconUser, IconSearch, IconTrash, IconChevronDown, IconCalendar } from "@tabler/icons-react";
import axios from "axios";
import { useSession } from "next-auth/react";
import { usePeriod } from "@/app/context/PeriodContext";

interface FilterConfig {
  _id: string;
  name: string;
  label: string;
  type: string;
  source: string;
  sourceField: string;
  isActive: boolean;
  order: number;
  hasSubfilter?: boolean;
  subfilterConfig?: {
    source: string;
    sourceField: string;
    dependsOn: string;
  };
}

interface FilterOption {
  value: string;
  label: string;
}

interface FilterSidebarProps {
  onFiltersChange: (filters: Record<string, string[]>) => void;
  isVisible: boolean;
  onToggle: () => void;
  templateId?: string;
  templateData?: any[];
}

const FilterSidebar = ({ onFiltersChange, isVisible, onToggle, templateId, templateData }: FilterSidebarProps) => {
  const { data: session } = useSession();
  const { selectedPeriodId } = usePeriod();
  const [activeFilters, setActiveFilters] = useState<(FilterConfig & { icon: any; color: string; inputType: string })[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  const [filterOptions, setFilterOptions] = useState<Record<string, FilterOption[]>>({});
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  const [availableDependencies, setAvailableDependencies] = useState<FilterOption[]>([]);

  // Generar filtros dinámicos basados en los datos de la plantilla
  const generateDynamicFilters = (data: any[]) => {
    if (!data || data.length === 0) return [];
    
    const sampleRow = data[0];
    const fieldNames = Object.keys(sampleRow);
    const colors = ['blue', 'green', 'orange', 'purple', 'red', 'teal', 'pink', 'indigo'];
    const icons = [IconBuilding, IconWorld, IconSchool, IconUser, IconSearch, IconFilter];
    
    const filters: (FilterConfig & { icon: any; color: string; inputType: string })[] = [];
    
    fieldNames.forEach((fieldName, index) => {
      // Saltar campos que no son útiles para filtrar
      if (['_id', 'id', 'createdAt', 'updatedAt'].includes(fieldName)) return;
      
      // Obtener valores únicos para determinar el tipo de input
      const uniqueValues = [...new Set(data.map(row => row[fieldName]).filter(val => val != null && val !== ''))];
      
      let inputType = 'dropdown';
      
      // Determinar tipo de input basado en el nombre del campo y cantidad de valores
      const fieldLower = fieldName.toLowerCase();
      
      // Campos de fecha
      if (fieldLower.includes('fecha') || fieldLower.includes('date') || 
          fieldLower.includes('time') || fieldLower.includes('hora')) {
        inputType = 'date';
      }
      // Campos de texto largo
      else if (fieldLower.includes('dependencia') || fieldLower.includes('nombre') ||
          fieldLower.includes('descripcion') || fieldLower.includes('observacion') ||
          fieldLower.includes('objetivo') || fieldLower.includes('actividad') ||
          fieldLower.includes('comentario') || fieldLower.includes('detalle') ||
          fieldLower.includes('text') || fieldLower.includes('nota')) {
        inputType = 'autocomplete';
      } 
      // Campos con pocos valores únicos
      else if (uniqueValues.length <= 3) {
        inputType = 'radio';
      } 
      // Campos con valores medios
      else if (uniqueValues.length <= 8) {
        inputType = 'dropdown';
      } 
      // Campos con muchos valores
      else if (uniqueValues.length <= 15) {
        inputType = 'multiselect';
      } 
      // Campos con muchísimos valores
      else {
        inputType = 'autocomplete';
      }
      
      filters.push({
        _id: `dynamic_${index}`,
        name: fieldName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        label: fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: 'select',
        source: 'template_fields',
        sourceField: fieldName,
        isActive: true,
        order: index + 1,
        icon: icons[index % icons.length],
        color: colors[index % colors.length],
        inputType: inputType
      });
    });
    
    return filters;
  };

  const generateFilterOptions = (fieldName: string, data: any[]) => {
    if (!data || data.length === 0) return [];
    
    // Extraer valores únicos y filtrar nulos/vacíos
    const uniqueValues = [...new Set(
      data.map(row => {
        const value = row[fieldName];
        if (value === null || value === undefined || value === '') return null;
        
        // Si es objeto, extraer texto o convertir a string
        if (typeof value === 'object') {
          return value.text ? value.text.toString() : JSON.stringify(value);
        }
        
        return value.toString();
      }).filter(val => val !== null)
    )];
    
    // Crear opciones únicas usando Map para evitar duplicados por value
    const optionsMap = new Map();
    
    uniqueValues.forEach(value => {
      const stringValue = value.toString().trim();
      if (stringValue && !optionsMap.has(stringValue)) {
        optionsMap.set(stringValue, {
          value: stringValue,
          label: stringValue
        });
      }
    });
    
    return Array.from(optionsMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  };

  const loadFilterOptions = (filters: any[], data: any[]) => {
    const newOptions: Record<string, FilterOption[]> = {};
    
    filters.forEach(filter => {
      const options = generateFilterOptions(filter.sourceField, data);
      newOptions[filter.name] = options;
    });
    
    setFilterOptions(newOptions);
  };

  useEffect(() => {
    if (templateData && templateData.length > 0) {
      // Generar filtros dinámicos basados en los datos de la plantilla
      const dynamicFilters = generateDynamicFilters(templateData);
      setActiveFilters(dynamicFilters);
      
      // Cargar opciones para cada filtro
      loadFilterOptions(dynamicFilters, templateData);
    }
  }, [templateData, templateId]);

  const handleFilterChange = (filterName: string, values: string[]) => {
    const newFilterValues = {
      ...filterValues,
      [filterName]: values
    };
    setFilterValues(newFilterValues);
    onFiltersChange(newFilterValues);
  };

  const clearFilters = () => {
    setFilterValues({});
    onFiltersChange({});
  };

  const getActiveFilterCount = () => {
    return Object.values(filterValues).reduce((count, values) => count + values.length, 0);
  };

  if (!isVisible) {
    return (
      <ActionIcon
        variant="filled"
        color="blue"
        size="lg"
        onClick={onToggle}
        style={{
          position: 'fixed',
          left: '20px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 1001,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}
      >
        <IconFilter size={20} />
      </ActionIcon>
    );
  }

  return (
    <Box
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        width: '20%',
        zIndex: 1000,
        backgroundColor: '#f8f9fa',
        borderRight: '2px solid #e9ecef',
        boxShadow: '2px 0 10px rgba(0,0,0,0.1)'
      }}
    >
      <Paper 
        p={0} 
        style={{ 
          height: '100%', 
          borderRadius: 0,
          backgroundColor: 'transparent'
        }}
      >
        {/* Header */}
        <Box 
          p="lg" 
          style={{
            backgroundColor: '#495057',
            color: 'white'
          }}
        >
          <Group justify="space-between" align="center">
            <Group>
              <IconFilter size={24} />
              <Title order={3} c="white">Filtros</Title>
              {getActiveFilterCount() > 0 && (
                <Badge 
                  variant="filled" 
                  color="yellow" 
                  size="lg"
                  style={{ color: '#333' }}
                >
                  {getActiveFilterCount()}
                </Badge>
              )}
            </Group>
            <Tooltip label="Cerrar filtros">
              <ActionIcon 
                variant="subtle" 
                onClick={onToggle}
                c="white"
                size="lg"
              >
                <IconX size={20} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Box>
        
        {/* Filters Content */}
        <ScrollArea 
          style={{ height: 'calc(100vh - 140px)' }}
          p="md"
          scrollbarSize={6}
          type="never"
        >
          <Stack gap="lg">
            {activeFilters.length === 0 ? (
              <Box ta="center" py="xl">
                <IconSearch size={48} color="#adb5bd" />
                <Text size="sm" c="dimmed" mt="md">Cargando filtros...</Text>
              </Box>
            ) : (
              activeFilters.map((filter) => {
                const Icon = filter.icon;
                const hasValues = filterValues[filter.name]?.length > 0;
                const options = filterOptions[filter.name] || [];
                
                return (
                  <Box key={filter._id} p="sm" style={{
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: `1px solid var(--mantine-color-${filter.color}-2)`,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                    width: '100%',
                    maxWidth: '100%',
                    overflow: 'hidden'
                  }}>
                    <Group mb="xs" gap="xs" wrap="nowrap">
                      <Box p={4} style={{
                        backgroundColor: `var(--mantine-color-${filter.color}-1)`,
                        borderRadius: '6px',
                        flexShrink: 0
                      }}>
                        <Icon size={20} color={`var(--mantine-color-${filter.color}-6)`} />
                      </Box>
                      <Text fw={600} size="sm" c={filter.color} style={{ flex: 1, minWidth: 0 }}>
                        {filter.label}
                      </Text>
                      {hasValues && (
                        <Badge 
                          size="sm" 
                          variant="filled" 
                          color={filter.color}
                          style={{ marginLeft: 'auto' }}
                        >
                          {filterValues[filter.name].length}
                        </Badge>
                      )}
                    </Group>
                    
                    {filter.inputType === 'autocomplete' && (
                      <Autocomplete
                        placeholder={`Buscar ${filter.label.toLowerCase()}...`}
                        data={options.map(opt => opt.label)}
                        value={filterValues[filter.name]?.[0] || ''}
                        onChange={(value) => {
                          if (value && value.trim()) {
                            // Siempre usar el valor ingresado para filtrado de texto
                            handleFilterChange(filter.name, [value.trim()]);
                          } else {
                            handleFilterChange(filter.name, []);
                          }
                        }}
                        onBlur={(event) => {
                          const value = event.currentTarget.value;
                          if (value && value.trim()) {
                            handleFilterChange(filter.name, [value.trim()]);
                          }
                        }}
                        size="xs"
                        radius="md"
                        leftSection={<IconSearch size={14} />}
                        limit={8}
                        styles={{
                          input: {
                            border: `1px solid var(--mantine-color-${filter.color}-3)`,
                            fontSize: '12px',
                            '&:focus': {
                              borderColor: `var(--mantine-color-${filter.color}-6)`
                            }
                          }
                        }}
                      />
                    )}
                    
                    {filter.inputType === 'radio' && (
                      <Radio.Group
                        value={filterValues[filter.name]?.[0] || ''}
                        onChange={(value) => handleFilterChange(filter.name, value ? [value] : [])}
                      >
                        <Stack gap={4} mt="xs">
                          {options.map((option) => (
                            <Radio
                              key={option.value}
                              value={option.value}
                              label={option.label}
                              color={filter.color}
                              size="xs"
                              styles={{
                                label: { fontSize: '12px', fontWeight: 500 },
                                radio: {
                                  '&:checked': {
                                    backgroundColor: `var(--mantine-color-${filter.color}-6)`
                                  }
                                }
                              }}
                            />
                          ))}
                        </Stack>
                      </Radio.Group>
                    )}
                    
                    {filter.inputType === 'dropdown' && (
                      <Select
                        placeholder={`Seleccionar ${filter.label.toLowerCase()}...`}
                        data={options}
                        value={filterValues[filter.name]?.[0] || null}
                        onChange={(value) => handleFilterChange(filter.name, value ? [value] : [])}
                        searchable
                        clearable
                        size="xs"
                        radius="md"
                        rightSection={<IconChevronDown size={14} />}
                        styles={{
                          input: {
                            border: `1px solid var(--mantine-color-${filter.color}-3)`,
                            fontSize: '12px',
                            '&:focus': {
                              borderColor: `var(--mantine-color-${filter.color}-6)`
                            }
                          }
                        }}
                      />
                    )}
                    
                    {filter.inputType === 'multiselect' && (
                      <MultiSelect
                        placeholder={`Seleccionar ${filter.label.toLowerCase()}...`}
                        data={options}
                        value={filterValues[filter.name] || []}
                        onChange={(values) => handleFilterChange(filter.name, values)}
                        searchable
                        clearable
                        size="xs"
                        radius="md"
                        styles={{
                          input: {
                            border: `1px solid var(--mantine-color-${filter.color}-3)`,
                            fontSize: '12px',
                            '&:focus': {
                              borderColor: `var(--mantine-color-${filter.color}-6)`
                            }
                          },
                          pill: {
                            backgroundColor: `var(--mantine-color-${filter.color}-1)`,
                            color: `var(--mantine-color-${filter.color}-8)`,
                            border: `1px solid var(--mantine-color-${filter.color}-3)`,
                            fontSize: '11px'
                          }
                        }}
                      />
                    )}
                    
                    {filter.inputType === 'date' && (
                      <DatePickerInput
                        placeholder={`Seleccionar ${filter.label.toLowerCase()}...`}
                        value={filterValues[filter.name]?.[0] ? new Date(filterValues[filter.name][0]) : null}
                        onChange={(date) => {
                          if (date) {
                            const dateString = date.toISOString().split('T')[0];
                            handleFilterChange(filter.name, [dateString]);
                          } else {
                            handleFilterChange(filter.name, []);
                          }
                        }}
                        clearable
                        size="xs"
                        radius="md"
                        leftSection={<IconCalendar size={14} />}
                        styles={{
                          input: {
                            border: `1px solid var(--mantine-color-${filter.color}-3)`,
                            fontSize: '12px',
                            '&:focus': {
                              borderColor: `var(--mantine-color-${filter.color}-6)`
                            }
                          }
                        }}
                      />
                    )}
                  </Box>
                );
              })
            )}
          </Stack>
        </ScrollArea>
        
        {/* Footer Actions */}
        <Box 
          p="md" 
          style={{
            borderTop: '1px solid #e9ecef',
            backgroundColor: 'white'
          }}
        >
          <Stack gap="xs">
            <Button 
              variant="light" 
              color="red"
              onClick={clearFilters} 
              size="sm"
              leftSection={<IconTrash size={16} />}
              disabled={getActiveFilterCount() === 0}
              fullWidth
            >
              Limpiar Filtros
            </Button>
            
            <Text size="xs" c="dimmed" ta="center">
              {getActiveFilterCount() === 0 
                ? 'Sin filtros aplicados' 
                : `${getActiveFilterCount()} filtro${getActiveFilterCount() > 1 ? 's' : ''} aplicado${getActiveFilterCount() > 1 ? 's' : ''}`
              }
            </Text>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
};

export default FilterSidebar;