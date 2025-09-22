"use client";

import { useState, useEffect } from "react";
import { Paper, Stack, Title, Group, Button, MultiSelect, Text, ActionIcon, Box, Badge, Divider, ScrollArea, Tooltip, Select, Radio, Autocomplete, Combobox, useCombobox, InputBase, Input, TextInput } from "@mantine/core";
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
  savedFilters?: Record<string, any[]>;
  templates?: any[];
}

const FilterSidebar = ({ onFiltersChange, isVisible, onToggle, templateId, templateData, savedFilters, templates }: FilterSidebarProps) => {
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
      // Campos con muy pocos valores únicos - usar radio
      else if (uniqueValues.length <= 5) {
        inputType = 'radio';
      }
      // Campos con pocos valores - usar dropdown
      else if (uniqueValues.length <= 10) {
        inputType = 'dropdown';
      }
      // Campos con muchos valores - usar autocomplete (mejor para buscar)
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
    
    // Usar Set para garantizar valores únicos desde el inicio
    const uniqueValues = new Set<string>();
    
    data.forEach(row => {
      const value = row[fieldName];
      if (value === null || value === undefined || value === '') return;
      
      let stringValue: string;
      // Si es objeto, extraer texto o convertir a string
      if (typeof value === 'object') {
        stringValue = value.text ? value.text.toString() : JSON.stringify(value);
      } else {
        stringValue = value.toString();
      }
      
      const trimmedValue = stringValue.trim();
      if (trimmedValue) {
        uniqueValues.add(trimmedValue);
      }
    });
    
    // Convertir Set a array de opciones
    return Array.from(uniqueValues)
      .sort((a, b) => a.localeCompare(b))
      .map(value => ({
        value,
        label: value
      }));
  };

  const loadFilterOptions = (filters: any[], data: any[]) => {
    const newOptions: Record<string, FilterOption[]> = {};
    
    filters.forEach(filter => {
      if (!filter.sourceField) return;
      
      const options = generateFilterOptions(filter.sourceField, data);
      
      // Solo usar sourceField como clave para evitar duplicados
      newOptions[filter.sourceField] = options;
    });
    
    setFilterOptions(newOptions);
  };

  useEffect(() => {
    if (templateData && templateData.length > 0) {
      let filtersToUse = [];
      
      // Si hay configuración guardada para alguna plantilla, usarla
      if (savedFilters && Object.keys(savedFilters).length > 0) {
        // Buscar configuración guardada para cualquier plantilla
        const allSavedFilters = Object.values(savedFilters).flat();
        
        if (allSavedFilters.length > 0) {
          // Usar solo los filtros que están marcados como visibles
          const visibleFilters = allSavedFilters.filter(filter => filter.isVisible === true);
          
          console.log('Filtros guardados:', allSavedFilters.length, 'visibles:', visibleFilters.length);
          console.log('Filtros visibles:', visibleFilters.map(f => f.fieldName));
          
          if (visibleFilters.length > 0) {
            // Convertir filtros guardados al formato esperado
            filtersToUse = visibleFilters.map((filter, index) => {
              const colors = ['blue', 'green', 'orange', 'purple', 'red', 'teal', 'pink', 'indigo'];
              const icons = [IconBuilding, IconWorld, IconSchool, IconUser, IconSearch, IconFilter];
              
              return {
                _id: filter._id,
                name: filter.fieldName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                label: filter.fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                type: 'select',
                source: 'template_fields',
                sourceField: filter.fieldName, // Mantener el nombre original del campo
                isActive: true,
                order: filter.order || index + 1,
                icon: icons[index % icons.length],
                color: colors[index % colors.length],
                inputType: filter.filterType || 'dropdown',
                originalFieldName: filter.fieldName // Agregar referencia al nombre original
              };
            }).sort((a, b) => a.order - b.order);
          }
        }
      }
      
      // Si no hay configuración guardada o no hay filtros visibles, generar dinámicamente
      if (filtersToUse.length === 0) {
        filtersToUse = generateDynamicFilters(templateData);
      }
      
      console.log('FilterSidebar - Loaded', filtersToUse.length, 'filters');
      console.log('FilterSidebar - Active filters:', filtersToUse.map(f => ({ name: f.name, sourceField: f.sourceField })));
      
      setActiveFilters(filtersToUse);
      
      // Limpiar valores de filtros cuando cambia la configuración
      setFilterValues({});
      
      // Cargar opciones para cada filtro
      loadFilterOptions(filtersToUse, templateData);
    }
  }, [templateData, templateId, savedFilters, templates]);

  const handleFilterChange = (filterName: string, values: string[]) => {
    console.log('FilterSidebar - handleFilterChange:', { filterName, values });
    const newFilterValues = {
      ...filterValues,
      [filterName]: values
    };
    console.log('FilterSidebar - newFilterValues:', newFilterValues);
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
          zIndex: 101,
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
        zIndex: 100,
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
          <Group justify="space-between" align="center" mb="sm">
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
          
          <Group justify="space-between" align="center">
            <Button 
              variant="outline" 
              color="white"
              onClick={clearFilters} 
              size="xs"
              leftSection={<IconTrash size={14} />}
            >
              Limpiar Filtros
            </Button>
            <Text size="xs" c="white" opacity={0.8}>
              {getActiveFilterCount() === 0 
                ? 'Sin filtros aplicados' 
                : `${getActiveFilterCount()} filtro${getActiveFilterCount() > 1 ? 's' : ''} aplicado${getActiveFilterCount() > 1 ? 's' : ''}`
              }
            </Text>
          </Group>
        </Box>
        
        {/* Filters Content */}
        <ScrollArea 
          style={{ height: 'calc(100vh - 160px)' }}
          p="md"
          scrollbarSize={6}
          type="never"
        >
          <Stack gap="lg">
            {activeFilters.length === 0 ? (
              <Box ta="center" py="xl">
                <IconSearch size={48} color="#adb5bd" />
                <Text size="sm" c="dimmed" mt="md">Cargando filtros....</Text>
              </Box>
            ) : (
              activeFilters.map((filter) => {
                const Icon = filter.icon;
                const hasValues = filterValues[filter.name]?.length > 0;
                const options = filterOptions[filter.sourceField] || filterOptions[filter.name] || [];
                
                // Debug para filtros específicos
                if (['CODIGO ACTIVIDAD', 'ID TIPO ACTIVIDAD', 'DESCRIPCION ACTIVIDAD', 'FECHA INICIO', 'FECHA FINAL'].includes(filter.label)) {
                  console.log(`${filter.label} Debug:`, {
                    name: filter.name,
                    sourceField: filter.sourceField,
                    inputType: filter.inputType,
                    optionsLength: options.length,
                    sampleOptions: options.slice(0, 2),
                    currentValue: filterValues[filter.name]
                  });
                }
                
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
                          {filterValues[filter.name]?.length || 0}
                        </Badge>
                      )}
                    </Group>
                    
                    {filter.inputType === 'autocomplete' && (
                      <TextInput
                        placeholder={`Buscar ${filter.label.toLowerCase()}...`}
                        value={filterValues[filter.name]?.[0] || ''}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          if (value && value.trim()) {
                            handleFilterChange(filter.name, [value.trim()]);
                          } else {
                            handleFilterChange(filter.name, []);
                          }
                        }}
                        size="xs"
                        radius="md"
                        leftSection={<IconSearch size={14} />}
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
                        onChange={(value) => {
                          console.log(`DROPDOWN ${filter.label} onChange:`, value);
                          handleFilterChange(filter.name, value ? [value] : []);
                        }}
                        searchable
                        clearable
                        size="xs"
                        radius="md"
                        maxDropdownHeight={200}
                        rightSection={<IconChevronDown size={14} />}
                        styles={{
                          input: {
                            border: `1px solid var(--mantine-color-${filter.color}-3)`,
                            fontSize: '12px',
                            '&:focus': {
                              borderColor: `var(--mantine-color-${filter.color}-6)`
                            }
                          },
                          dropdown: {
                            maxHeight: '200px',
                            overflowY: 'auto',
                            zIndex: 10000
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
                          },
                          dropdown: {
                            zIndex: 10000
                          }
                        }}
                      />
                    )}
                    
                    {filter.inputType === 'date' && (
                      <DatePickerInput
                        placeholder={`Seleccionar ${filter.label.toLowerCase()}...`}
                        value={filterValues[filter.name]?.[0] ? (() => {
                          try {
                            return new Date(filterValues[filter.name][0]);
                          } catch {
                            return null;
                          }
                        })() : null}
                        onChange={(date) => {
                          console.log(`DATE FILTER ${filter.label} onChange:`, {
                            date,
                            filterName: filter.name,
                            sourceField: filter.sourceField,
                            isValidDate: date instanceof Date && !isNaN(date.getTime())
                          });
                          
                          if (date && date instanceof Date && !isNaN(date.getTime())) {
                            const dateString = date.toISOString().split('T')[0];
                            console.log(`DATE FILTER ${filter.label} sending dateString:`, dateString);
                            handleFilterChange(filter.name, [dateString]);
                          } else {
                            console.log(`DATE FILTER ${filter.label} clearing filter`);
                            handleFilterChange(filter.name, []);
                          }
                        }}
                        clearable
                        size="xs"
                        radius="md"
                        leftSection={<IconCalendar size={14} />}
                        valueFormat="DD/MM/YYYY"
                        styles={{
                          input: {
                            border: `1px solid var(--mantine-color-${filter.color}-3)`,
                            fontSize: '12px',
                            cursor: 'pointer',
                            '&:focus': {
                              borderColor: `var(--mantine-color-${filter.color}-6)`
                            }
                          }
                        }}
                        popoverProps={{
                          zIndex: 9999,
                          withinPortal: true
                        }}
                      />
                    )}
                  </Box>
                );
              })
            )}
          </Stack>
        </ScrollArea>
        

      </Paper>
    </Box>
  );
};

export default FilterSidebar;