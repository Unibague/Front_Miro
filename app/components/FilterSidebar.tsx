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
      // Campos que parecen ser IDs de validadores - usar radio para mostrar descripciones
      else if ((fieldLower.includes('id') || fieldLower.includes('tipo') || 
                fieldLower.includes('estado') || fieldLower.includes('sexo') ||
                fieldLower.includes('biologico') || fieldLower.includes('civil') ||
                fieldLower.includes('fuente') || fieldLower.includes('pais') ||
                fieldLower.includes('movilidad') || fieldLower.includes('impacto') ||
                fieldLower.includes('estrategia') || fieldLower.includes('flexibilizaci') ||
                fieldLower.includes('enfoques')) &&
               uniqueValues.length > 0 && uniqueValues.length <= 20 &&
               uniqueValues.every(val => val != null && /^\d{1,3}$/.test(val.toString()))) {
        inputType = 'radio';
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
        label: fieldName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
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

  const generateFilterOptions = async (fieldName: string, data: any[]) => {
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
    
    const valuesArray = Array.from(uniqueValues).sort((a, b) => a.localeCompare(b));
    
    // Verificar si los valores parecen ser IDs de validadores (números cortos, no documentos)
    const areValidatorIds = valuesArray.every(value => {
      // Solo números de 1-3 dígitos (IDs de validadores típicos)
      return /^\d{1,3}$/.test(value);
    });
    
    // También verificar que el nombre del campo sugiera que es un validador
    const fieldLower = fieldName.toLowerCase();
    
    // Excluir campos que claramente NO son validadores
    const isExcludedField = fieldLower.includes('dias') ||
                           fieldLower.includes('valor') ||
                           fieldLower.includes('numero') ||
                           fieldLower.includes('num') ||
                           fieldLower.includes('cantidad') ||
                           fieldLower.includes('monto') ||
                           fieldLower.includes('precio') ||
                           fieldLower.includes('costo');
    
    const fieldSuggestsValidator = !isExcludedField && (
                                  fieldLower.includes('id') || 
                                  fieldLower.includes('tipo') ||
                                  fieldLower.includes('estado') ||
                                  fieldLower.includes('sexo') ||
                                  fieldLower.includes('biologico') ||
                                  fieldLower.includes('civil') ||
                                  fieldLower.includes('fuente') ||
                                  fieldLower.includes('pais') ||
                                  fieldLower.includes('movilidad') ||
                                  fieldLower.includes('impacto') ||
                                  fieldLower.includes('estrategia') ||
                                  fieldLower.includes('flexibilizaci') ||
                                  fieldLower.includes('enfoques')
                                  );
    
    console.log(`VALIDATOR DEBUG - Field: ${fieldName}`);
    console.log(`VALIDATOR DEBUG - areValidatorIds: ${areValidatorIds}`);
    console.log(`VALIDATOR DEBUG - fieldSuggestsValidator: ${fieldSuggestsValidator}`);
    console.log(`VALIDATOR DEBUG - valuesArray:`, valuesArray);
    
    if (areValidatorIds && valuesArray.length > 0 && fieldSuggestsValidator) {
      try {
        console.log(`VALIDATOR DEBUG - Fetching validators for field: ${fieldName}`);
        // Obtener todos los validadores disponibles
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/validators/pagination?page=1&limit=200`
        );
        
        if (response.data && response.data.validators) {
          const validators = response.data.validators;
          console.log(`VALIDATOR DEBUG - Found ${validators.length} validators`);
          console.log(`VALIDATOR DEBUG - First validator structure:`, validators[0]);
          
          // Buscar el validador más apropiado para este campo
          const candidateValidators = validators.filter((validator: any) => {
            if (!validator.columns || validator.columns.length < 2) return false;
            
            const idColumn = validator.columns.find((col: any) => col.is_validator === true);
            if (!idColumn || !idColumn.values) return false;
            
            // Verificar coincidencias
            const hasMatchingValues = valuesArray.some(fieldValue => {
              const exactMatch = idColumn.values.some((validatorValue: any) => 
                validatorValue.toString() === fieldValue
              );
              const numericValue = parseInt(fieldValue);
              const indexMatch = !isNaN(numericValue) && 
                                numericValue >= 1 && 
                                numericValue <= idColumn.values.length;
              return exactMatch || indexMatch;
            });
            
            return hasMatchingValues;
          });
          
          console.log(`VALIDATOR DEBUG - Found ${candidateValidators.length} candidate validators for ${fieldName}:`, 
                     candidateValidators.map((v: any) => v.name));
          
          // Seleccionar el validador más apropiado basado en similitud de nombres
          const relevantValidator = candidateValidators.find((validator: any) => {
            const validatorName = validator.name.toLowerCase();
            const fieldNameClean = fieldName.toLowerCase().replace(/[^a-z]/g, '');
            
            // Buscar coincidencias específicas en el nombre
            const nameMatches = [
              fieldNameClean.includes('documento') && validatorName.includes('documento'),
              fieldNameClean.includes('sexo') && validatorName.includes('sexo'),
              fieldNameClean.includes('estado') && validatorName.includes('estado'),
              fieldNameClean.includes('civil') && validatorName.includes('civil'),
              fieldNameClean.includes('movilidad') && validatorName.includes('movilidad'),
              fieldNameClean.includes('modalidad') && validatorName.includes('movilidad'),
              fieldNameClean.includes('fuente') && validatorName.includes('fuente'),
              fieldNameClean.includes('nacional') && validatorName.includes('nacional'),
              fieldNameClean.includes('internacional') && validatorName.includes('internacional'),
              fieldNameClean.includes('pais') && (validatorName.includes('departamento') || validatorName.includes('municipio')),
              fieldNameClean.includes('impacto') && validatorName.includes('movilidad'),
              fieldNameClean.includes('estrategia') && validatorName.includes('estrategia'),
              fieldNameClean.includes('flexibilizaci') && validatorName.includes('flexibilizacion'),
              fieldNameClean.includes('enfoque') && validatorName.includes('enfoque')
            ];
            
            return nameMatches.some(match => match === true);
          }) || candidateValidators[0]; // Fallback al primer candidato si no hay coincidencia de nombre
          
          if (!relevantValidator) {
            console.log(`VALIDATOR DEBUG - No matching validator found for ${fieldName}`);
            return valuesArray.map(value => ({ value, label: value }));
          }
          
          console.log(`VALIDATOR DEBUG - Using validator: ${relevantValidator.name} for field: ${fieldName}`);
          
          // Mapear cada ID a su descripción correspondiente usando el validador correcto
          const mappedOptions = valuesArray.map(id => {
            console.log(`VALIDATOR DEBUG - Processing ID: ${id} with validator: ${relevantValidator.name}`);
            
            if (relevantValidator.columns && relevantValidator.columns.length >= 2) {
              // Buscar las columnas de ID y DESCRIPCION (pueden tener nombres diferentes)
              const idColumn = relevantValidator.columns.find((col: any) => 
                col.is_validator === true && col.values && col.values.length > 0
              );
              const descripcionColumn = relevantValidator.columns.find((col: any) => 
                (col.name.includes('DESCRIPCION') || col.name.includes('DESCRIPCIÓN')) && 
                col.values && col.values.length > 0
              );
              
              if (idColumn && descripcionColumn) {
                console.log(`VALIDATOR DEBUG - ID column (${idColumn.name}):`, idColumn.values);
                console.log(`VALIDATOR DEBUG - DESCRIPCION column (${descripcionColumn.name}):`, descripcionColumn.values);
                
                // Buscar el índice del ID
                let index = idColumn.values.findIndex((value: any) => value.toString() === id);
                
                // Si no se encuentra por valor exacto, usar como índice (base 1)
                if (index === -1) {
                  const numericId = parseInt(id);
                  if (!isNaN(numericId) && numericId >= 1 && numericId <= idColumn.values.length) {
                    index = numericId - 1;
                    console.log(`VALIDATOR DEBUG - Using ${id} as index, converted to ${index}`);
                  }
                }
                
                if (index !== -1 && index < descripcionColumn.values.length) {
                  const codigo = idColumn.values[index];
                  const descripcion = descripcionColumn.values[index];
                  console.log(`VALIDATOR DEBUG - Found mapping: ${codigo} - ${descripcion}`);
                  return {
                    value: id,
                    label: `${codigo} - ${descripcion}`
                  };
                }
              }
            }
            
            console.log(`VALIDATOR DEBUG - No description found for ${id}`);
            return { value: id, label: id };
          });
          
          console.log(`VALIDATOR DEBUG - Final mapped options:`, mappedOptions);
          return mappedOptions;
        }
      } catch (error) {
        console.error('Error obteniendo descripciones de validadores:', error);
      }
    }
    
    // Si no son IDs de validadores, devolver opciones normales
    console.log(`VALIDATOR DEBUG - Returning normal options for ${fieldName}:`, valuesArray);
    return valuesArray.map(value => ({
      value,
      label: value
    }));
  };

  const loadFilterOptions = async (filters: any[], data: any[]) => {
    const newOptions: Record<string, FilterOption[]> = {};
    
    // Procesar filtros de forma asíncrona
    const optionPromises = filters.map(async (filter) => {
      if (!filter.sourceField) return;
      
      const options = await generateFilterOptions(filter.sourceField, data);
      return { sourceField: filter.sourceField, options };
    });
    
    const resolvedOptions = await Promise.all(optionPromises.filter(Boolean));
    
    resolvedOptions.forEach((result: any) => {
      if (!result) return;
      const { sourceField, options } = result;
      if (sourceField && options) {
        newOptions[sourceField] = options;
      }
    });
    
    setFilterOptions(newOptions);
  };

  useEffect(() => {
    if (templateData && templateData.length > 0) {
      let filtersToUse: (FilterConfig & { icon: any; color: string; inputType: string })[] = [];
      
      // Si hay configuración guardada para alguna plantilla, usarla
      if (savedFilters && Object.keys(savedFilters).length > 0) {
        // Buscar configuración guardada para cualquier plantilla
        const allSavedFilters = Object.values(savedFilters).flat();
        
        if (allSavedFilters.length > 0) {
          // Usar solo los filtros que están marcados como visible
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
                label: filter.fieldName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
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
                      <Autocomplete
                        placeholder={`Buscar ${filter.label.toLowerCase()}...`}
                        data={options.map(opt => opt.label)}
                        value={(() => {
                          const currentValue = filterValues[filter.name]?.[0];
                          if (currentValue) {
                            const option = options.find(opt => opt.value === currentValue);
                            return option ? option.label : currentValue;
                          }
                          return '';
                        })()}
                        onChange={(value) => {
                          if (value && value.trim()) {
                            // Buscar el valor correspondiente al label seleccionado
                            const option = options.find(opt => opt.label === value);
                            const valueToUse = option ? option.value : value.trim();
                            handleFilterChange(filter.name, [valueToUse]);
                          } else {
                            handleFilterChange(filter.name, []);
                          }
                        }}
                        size="xs"
                        radius="md"
                        leftSection={<IconSearch size={14} />}
                        limit={10}
                        maxDropdownHeight={200}
                        styles={{
                          input: {
                            border: `1px solid var(--mantine-color-${filter.color}-3)`,
                            fontSize: '12px',
                            '&:focus': {
                              borderColor: `var(--mantine-color-${filter.color}-6)`
                            }
                          },
                          dropdown: {
                            zIndex: 10000
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