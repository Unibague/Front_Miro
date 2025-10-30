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
      // Campos de evidencias - siempre usar autocomplete
      else if (fieldLower.includes('evidencia')) {
        inputType = 'autocomplete';
      }
      // Campos de email y dirección - usar autocomplete
      else if (fieldLower.includes('email') || fieldLower.includes('direccion')) {
        inputType = 'autocomplete';
      }
      // Campos con signos de interrogación - usar radio
      else if (fieldName.includes('?')) {
        inputType = 'radio';
      }
      // Campos que promueven, contribuyen, desarrollan - usar radio
      else if (fieldLower.includes('promueve') || fieldLower.includes('contribuye') || fieldLower.includes('desarrolla')) {
        inputType = 'radio';
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
               uniqueValues.every(val => val != null && (/^\d{1,3}$/.test(val.toString()) || /^[A-Z]{2,3}$/.test(val.toString())))) {
        inputType = 'radio';
      }
      // Campos de país específicamente - usar radio
      else if (fieldLower.includes('pais') && uniqueValues.length > 0 && uniqueValues.length <= 15) {
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
    
    // Verificar si los valores parecen ser IDs de validadores (números cortos, códigos de país, o valores S/N)
    const areValidatorIds = valuesArray.every(value => {
      // Números de 1-3 dígitos (IDs de validadores típicos) O códigos de país (2-3 letras) O valores S/N
      return /^\d{1,3}$/.test(value) || /^[A-Z]{2,3}$/.test(value) || /^[SN]$/.test(value);
    });
    
    // También verificar que el nombre del campo sugiera que es un validador
    const fieldLower = fieldName.toLowerCase();
    
    // Excluir campos que claramente NO son validadores (excepto beneficiarios)
    const isExcludedField = (fieldLower.includes('dias') ||
                           fieldLower.includes('valor') ||
                           fieldLower.includes('numero') ||
                           fieldLower.includes('num') ||
                           fieldLower.includes('cantidad') ||
                           fieldLower.includes('monto') ||
                           fieldLower.includes('precio') ||
                           fieldLower.includes('costo')) &&
                           !fieldLower.includes('beneficiarios');
    
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
                                  fieldLower.includes('enfoques') ||
                                  fieldLower.includes('promueve') ||
                                  fieldLower.includes('contribuye') ||
                                  fieldLower.includes('desarrolla') ||
                                  fieldLower.includes('beneficiarios') ||
                                  fieldLower.includes('apoyo') ||
                                  fieldLower.includes('cooperaci') ||
                                  fieldLower.includes('formaci')
                                  );
    
    console.log(`VALIDATOR DEBUG - Field: ${fieldName}`);
    console.log(`VALIDATOR DEBUG - areValidatorIds: ${areValidatorIds}`);
    console.log(`VALIDATOR DEBUG - fieldSuggestsValidator: ${fieldSuggestsValidator}`);
    console.log(`VALIDATOR DEBUG - valuesArray:`, valuesArray);
    
    // Debug específico para campos problemáticos
    if (['TIPO_MOVILIDAD', 'ID_PAIS_PROCEDENCIA', 'ID_PAIS_FINANCIADOR'].includes(fieldName)) {
      console.log(`SPECIFIC DEBUG - ${fieldName}:`);
      console.log(`  - fieldLower: ${fieldLower}`);
      console.log(`  - isExcludedField: ${isExcludedField}`);
      console.log(`  - areValidatorIds: ${areValidatorIds}`);
      console.log(`  - fieldSuggestsValidator: ${fieldSuggestsValidator}`);
      console.log(`  - valuesArray:`, valuesArray);
      console.log(`  - Will process as validator: ${areValidatorIds && valuesArray.length > 0 && fieldSuggestsValidator}`);
    }
    
    // Manejo especial para campos S/N (Sí/No)
    const isSNField = valuesArray.length <= 2 && valuesArray.every(value => /^[SN]$/.test(value));
    if (isSNField) {
      console.log(`VALIDATOR DEBUG - S/N field detected: ${fieldName}`);
      return valuesArray.map(value => ({
        value,
        label: value === 'S' ? 'S - Sí' : 'N - No'
      }));
    }
    
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
          
          // Buscar validadores con mapeo directo primero
          const fieldNameClean = fieldName.toLowerCase().replace(/[^a-z]/g, '');
          console.log(`VALIDATOR DEBUG - Field name cleaned: ${fieldNameClean}`);
          
          // Mapeo directo específico
          const directMappings: Record<string, string> = {
            'modalidad': 'TIPO_MOVILIDAD_SALIENTE_FUNCIONARIOS',
            'tipomovilidad': 'TIPO_MOVILIDAD_ENTRANTE_ESTUDIANTES', 
            'idsexobiologico': 'SEXO_BIOLOGICO',
            'idestadocivil': 'ESTADO_CIVIL',
            'idtipodocumento': 'TIPO_DOCUMENTO',
            'idfuentenacionalinvestig': 'TIPO_FUENTE _NACIONAL_INVESTIGACION',
            'idfuenteinternacional': 'ID_FUENTE_INTERNACIONAL',
            'idpaisnacimiento': 'PAIS',
            'idpaisprocedencia': 'PAIS', 
            'idpaisfinanciador': 'PAIS',
            'idpaisdestino': 'PAIS',
            'idtipoactividad': 'ACTIVIDADES_DE_BIENESTAR',
            'tipoactividad': 'ACTIVIDADES_DE_BIENESTAR',
            'laestrategiacorrespondeaunap': 'TIPO_BENEFICIARIO',
            'laestrategiaseenmarcaenalg': 'TIPOLOGIA_ESTRATEGIAS',
            'laestrategiatienealgunodelo': 'TIPO_ALCANCE',
            'cantidadbeneficiariosextern': 'ACTIVIDADES_BENEFICIARIO_BIENESTAR'
          };
          
          const directMatch = directMappings[fieldNameClean];
          console.log(`VALIDATOR DEBUG - Direct mapping for ${fieldNameClean}: ${directMatch}`);
          
          // Debug específico para campos problemáticos
          if (['tipomovilidad', 'idpaisprocedencia', 'idpaisfinanciador'].includes(fieldNameClean)) {
            console.log(`SPECIFIC MAPPING DEBUG - ${fieldNameClean}:`);
            console.log(`  - Looking for validator: ${directMatch}`);
            console.log(`  - Available validators:`, validators.map((v: any) => v.name));
            const foundValidator = validators.find((v: any) => v.name === directMatch);
            console.log(`  - Validator found: ${foundValidator ? 'YES' : 'NO'}`);
            if (foundValidator) {
              console.log(`  - Validator structure:`, foundValidator);
              const idColumn = foundValidator.columns?.find((col: any) => col.is_validator === true);
              const descColumn = foundValidator.columns?.find((col: any) => 
                col.name.includes('DESCRIPCION') || col.name.includes('DESCRIPCIÓN') || col.name.startsWith('DESC')
              );
              console.log(`  - ID column values:`, idColumn?.values);
              console.log(`  - DESC column values:`, descColumn?.values);
              console.log(`  - Looking for value: ${valuesArray[0]} in validator`);
            }
            if (!foundValidator && directMatch) {
              const similarValidators = validators.filter((v: any) => 
                v.name.toLowerCase().includes('movilidad') || 
                v.name.toLowerCase().includes('pais') ||
                v.name.toLowerCase().includes('tipo')
              );
              console.log(`  - Similar validators:`, similarValidators.map((v: any) => v.name));
            }
          }
          
          let candidateValidators: any[] = [];
          
          if (directMatch) {
            // Buscar el validador específico
            const specificValidator = validators.find((v: any) => v.name === directMatch);
            if (specificValidator) {
              candidateValidators = [specificValidator];
              console.log(`VALIDATOR DEBUG - Found direct match: ${specificValidator.name}`);
              
              // Debug adicional para campos específicos
              if (['tipomovilidad', 'idpaisprocedencia', 'idpaisfinanciador'].includes(fieldNameClean)) {
                console.log(`VALIDATOR STRUCTURE DEBUG - ${specificValidator.name}:`);
                console.log(`  - Columns:`, specificValidator.columns?.map((c: any) => ({ name: c.name, is_validator: c.is_validator })));
                const idCol = specificValidator.columns?.find((col: any) => col.is_validator === true);
                const descCol = specificValidator.columns?.find((col: any) => 
                  col.name.includes('DESCRIPCION') || col.name.includes('DESCRIPCIÓN') || col.name.startsWith('DESC')
                );
                console.log(`  - ID values:`, idCol?.values);
                console.log(`  - DESC values:`, descCol?.values);
                console.log(`  - Searching for:`, valuesArray);
              }
            } else {
              console.log(`VALIDATOR DEBUG - Direct match not found for: ${directMatch}`);
              
              // Para campos de países, buscar validadores de países
              if (fieldNameClean.includes('pais')) {
                console.log(`VALIDATOR DEBUG - Searching for country validators`);
                const countryValidators = validators.filter((v: any) => 
                  v.name.toLowerCase().includes('pais') || 
                  v.name.toLowerCase().includes('country') ||
                  v.name.toLowerCase().includes('departamento') ||
                  v.name.toLowerCase().includes('municipio')
                );
                console.log(`VALIDATOR DEBUG - Country validators found:`, countryValidators.map((v: any) => v.name));
                if (countryValidators.length > 0) {
                  candidateValidators = countryValidators;
                }
              }
              // Para campos de tipo movilidad, buscar validadores de movilidad
              else if (fieldNameClean.includes('movilidad')) {
                console.log(`VALIDATOR DEBUG - Searching for movilidad validators`);
                const movilidadValidators = validators.filter((v: any) => 
                  v.name.toLowerCase().includes('movilidad')
                );
                console.log(`VALIDATOR DEBUG - Movilidad validators found:`, movilidadValidators.map((v: any) => v.name));
                if (movilidadValidators.length > 0) {
                  candidateValidators = movilidadValidators;
                }
              }
              // Para campos de beneficiarios, buscar el validador que contenga todos los IDs
              if (fieldNameClean.includes('beneficiario')) {
                console.log(`VALIDATOR DEBUG - Searching for validator with all beneficiario IDs:`, valuesArray);
                const beneficiaryValidators = validators.filter((v: any) => 
                  v.name.includes('BENEFICIARIO') || v.name.includes('ACTIVIDADES')
                );
                
                // Buscar el validador que contenga más IDs de los requeridos
                let bestValidator = null;
                let maxMatches = 0;
                
                for (const validator of beneficiaryValidators) {
                  if (validator.columns && validator.columns.length >= 2) {
                    const idCol = validator.columns.find((col: any) => col.is_validator === true);
                    if (idCol && idCol.values) {
                      const matches = valuesArray.filter(id => 
                        idCol.values.some((val: any) => val.toString() === id || parseInt(val) === parseInt(id))
                      ).length;
                      
                      console.log(`VALIDATOR DEBUG - ${validator.name} matches ${matches}/${valuesArray.length} IDs`);
                      if (matches > maxMatches) {
                        maxMatches = matches;
                        bestValidator = validator;
                      }
                    }
                  }
                }
                
                if (bestValidator) {
                  console.log(`VALIDATOR DEBUG - Best validator for beneficiarios: ${bestValidator.name} (${maxMatches}/${valuesArray.length} matches)`);
                  candidateValidators = [bestValidator];
                }
              }
              // Para ID_TIPO_ACTIVIDAD, buscar validadores específicos de actividades
              else if (fieldNameClean.includes('actividad')) {
                const activityValidators = validators.filter((v: any) => 
                  v.name.includes('ACTIVIDADES_') && !v.name.includes('BENEFICIARIO')
                );
                console.log(`VALIDATOR DEBUG - Activity validators found:`, activityValidators.map((v: any) => v.name));
                if (activityValidators.length > 0) {
                  candidateValidators = [activityValidators[0]]; // Usar el primero encontrado
                }
              } else {
                // Buscar validadores que contengan la palabra clave
                const partialMatches = validators.filter((v: any) => 
                  v.name.toLowerCase().includes('actividad') || 
                  v.name.toLowerCase().includes('tipo')
                );
                console.log(`VALIDATOR DEBUG - Partial matches for actividad/tipo:`, partialMatches.map((v: any) => v.name));
                if (partialMatches.length > 0) {
                  candidateValidators = partialMatches;
                }
              }
            }
          }
          
          // Si no hay mapeo directo, buscar candidatos (más restrictivo)
          if (candidateValidators.length === 0) {
            console.log(`VALIDATOR DEBUG - No direct match found, searching candidates for ${fieldNameClean}`);
            
            // Primero buscar por similitud de nombre
            const nameBasedCandidates = validators.filter((validator: any) => {
              if (!validator.columns || validator.columns.length < 2) return false;
              
              const validatorName = validator.name.toLowerCase();
              const hasNameSimilarity = 
                (fieldNameClean.includes('sexo') && validatorName.includes('sexo')) ||
                (fieldNameClean.includes('estado') && validatorName.includes('estado')) ||
                (fieldNameClean.includes('documento') && validatorName.includes('documento')) ||
                (fieldNameClean.includes('fuente') && validatorName.includes('fuente')) ||
                (fieldNameClean.includes('pais') && (validatorName.includes('departamento') || validatorName.includes('municipio'))) ||
                (fieldNameClean.includes('actividad') && validatorName.includes('actividad')) ||
                (fieldNameClean.includes('tipo') && validatorName.includes('tipo')) ||
                (fieldNameClean.includes('estrategia') && validatorName.includes('estrategia')) ||
                (fieldNameClean.includes('beneficiario') && validatorName.includes('beneficiario')) ||
                (fieldNameClean.includes('apoyo') && validatorName.includes('apoyo')) ||
                (fieldNameClean.includes('alcance') && validatorName.includes('alcance'));
              
              return hasNameSimilarity;
            });
            
            console.log(`VALIDATOR DEBUG - Name-based candidates:`, nameBasedCandidates.map((v: any) => v.name));
            
            // Luego filtrar por coincidencias de valores
            candidateValidators = nameBasedCandidates.filter((validator: any) => {
              const idColumn = validator.columns.find((col: any) => col.is_validator === true);
              if (!idColumn || !idColumn.values) return false;
              
              const hasMatchingValues = valuesArray.some(fieldValue => {
                const exactMatch = idColumn.values.some((validatorValue: any) => 
                  validatorValue.toString() === fieldValue || parseInt(validatorValue) === parseInt(fieldValue)
                );
                const numericValue = parseInt(fieldValue);
                const indexMatch = !isNaN(numericValue) && 
                                  numericValue >= 1 && 
                                  numericValue <= idColumn.values.length;
                return exactMatch || indexMatch;
              });
              
              console.log(`VALIDATOR DEBUG - Validator ${validator.name} has matching values: ${hasMatchingValues}`);
              return hasMatchingValues;
            });
          }
          
          console.log(`VALIDATOR DEBUG - Found ${candidateValidators.length} candidate validators for ${fieldName}:`);
          candidateValidators.forEach((v: any) => {
            console.log(`  - ${v.name} (values: ${v.columns?.find((c: any) => c.is_validator)?.values?.slice(0, 5) || 'none'})`);
          });
          
          // Si hay muchos candidatos, seleccionar el más apropiado
          if (candidateValidators.length > 1) {
            console.log(`VALIDATOR DEBUG - Multiple candidates found, selecting best match for ${fieldNameClean}`);
            
            // Para campos de actividad, priorizar validadores de actividades
            if (fieldNameClean.includes('actividad')) {
              const activitySpecific = candidateValidators.filter((v: any) => 
                v.name.includes('ACTIVIDADES_') && !v.name.includes('BENEFICIARIO')
              );
              if (activitySpecific.length > 0) {
                candidateValidators = [activitySpecific[0]];
                console.log(`VALIDATOR DEBUG - Selected activity-specific validator: ${activitySpecific[0].name}`);
              }
            }
            // Para campos de estrategia, priorizar validadores de estrategias
            else if (fieldNameClean.includes('estrategia')) {
              const strategySpecific = candidateValidators.filter((v: any) => 
                v.name.includes('ESTRATEGIA') || v.name.includes('TIPOLOGIA')
              );
              if (strategySpecific.length > 0) {
                candidateValidators = [strategySpecific[0]];
                console.log(`VALIDATOR DEBUG - Selected strategy-specific validator: ${strategySpecific[0].name}`);
              }
            }
            // Para campos de beneficiarios, priorizar validadores de beneficiarios
            else if (fieldNameClean.includes('beneficiario')) {
              const beneficiarySpecific = candidateValidators.filter((v: any) => 
                v.name.includes('BENEFICIARIO')
              );
              if (beneficiarySpecific.length > 0) {
                candidateValidators = [beneficiarySpecific[0]];
                console.log(`VALIDATOR DEBUG - Selected beneficiary-specific validator: ${beneficiarySpecific[0].name}`);
              }
            }
            
            // Si aún hay muchos, usar el primero
            if (candidateValidators.length > 1) {
              candidateValidators = [candidateValidators[0]];
              console.log(`VALIDATOR DEBUG - Using first candidate: ${candidateValidators[0].name}`);
            }
          }
          
          // Usar el candidato seleccionado
          const relevantValidator = candidateValidators[0];
          
          if (!relevantValidator) {
            console.log(`VALIDATOR DEBUG - No matching validator found for ${fieldName}`);
            return valuesArray.map(value => ({ value, label: value }));
          }
          
          console.log(`VALIDATOR DEBUG - Using validator: ${relevantValidator.name} for field: ${fieldName}`);
          
          // Debug específico para CANTIDAD_BENEFICIARIOS_EXTERNOS
          if (fieldName === 'CANTIDAD_BENEFICIARIOS_EXTERNOS') {
            console.log(`CANTIDAD_BENEFICIARIOS_EXTERNOS DEBUG - Validator structure:`, relevantValidator);
            console.log(`CANTIDAD_BENEFICIARIOS_EXTERNOS DEBUG - Values to process:`, valuesArray);
          }
          
          // Mapear cada ID a su descripción correspondiente usando el validador correcto
          const mappedOptions = valuesArray.map(id => {
            if (fieldName === 'MODALIDAD') {
              console.log(`MODALIDAD DEBUG - Processing ID: ${id} with validator: ${relevantValidator.name}`);
              console.log(`MODALIDAD DEBUG - Validator full structure:`, relevantValidator);
            } else if (fieldName === 'CANTIDAD_BENEFICIARIOS_EXTERNOS') {
              console.log(`CANTIDAD_BENEFICIARIOS_EXTERNOS DEBUG - Processing ID: ${id}`);
            } else {
              console.log(`VALIDATOR DEBUG - Processing ID: ${id} with validator: ${relevantValidator.name}`);
            }
            
            if (relevantValidator.columns && relevantValidator.columns.length >= 2) {
              // Buscar las columnas de ID y DESCRIPCION (pueden tener nombres diferentes)
              const idColumn = relevantValidator.columns.find((col: any) => 
                col.is_validator === true && col.values && col.values.length > 0
              );
              const descripcionColumn = relevantValidator.columns.find((col: any) => 
                (col.name.includes('DESCRIPCION') || col.name.includes('DESCRIPCIÓN') || col.name.startsWith('DESC')) && 
                col.values && col.values.length > 0
              );
              
              if (idColumn && descripcionColumn) {
                if (fieldName === 'MODALIDAD') {
                  console.log(`MODALIDAD DEBUG - ID column (${idColumn.name}):`, idColumn.values);
                  console.log(`MODALIDAD DEBUG - DESCRIPCION column (${descripcionColumn.name}):`, descripcionColumn.values);
                  console.log(`MODALIDAD DEBUG - ID column full structure:`, idColumn);
                  console.log(`MODALIDAD DEBUG - DESCRIPCION column full structure:`, descripcionColumn);
                } else if (fieldName === 'CANTIDAD_BENEFICIARIOS_EXTERNOS') {
                  console.log(`CANTIDAD_BENEFICIARIOS_EXTERNOS DEBUG - ID column (${idColumn.name}):`, idColumn.values);
                  console.log(`CANTIDAD_BENEFICIARIOS_EXTERNOS DEBUG - DESCRIPCION column (${descripcionColumn.name}):`, descripcionColumn.values);
                  console.log(`CANTIDAD_BENEFICIARIOS_EXTERNOS DEBUG - ID column full structure:`, idColumn);
                  console.log(`CANTIDAD_BENEFICIARIOS_EXTERNOS DEBUG - DESCRIPCION column full structure:`, descripcionColumn);
                } else {
                  console.log(`VALIDATOR DEBUG - ID column (${idColumn.name}):`, idColumn.values);
                  console.log(`VALIDATOR DEBUG - DESCRIPCION column (${descripcionColumn.name}):`, descripcionColumn.values);
                }
                
                // Buscar el índice del ID con múltiples estrategias
                let index = -1;
                
                // Estrategia 1: Búsqueda exacta por valor
                index = idColumn.values.findIndex((value: any) => 
                  value.toString() === id || parseInt(value) === parseInt(id)
                );
                console.log(`VALIDATOR DEBUG - Exact match search for ${id}: index ${index}`);
                
                // Estrategia 2: Búsqueda por índice (base 1)
                if (index === -1) {
                  const numericId = parseInt(id);
                  if (!isNaN(numericId) && numericId >= 1 && numericId <= idColumn.values.length) {
                    index = numericId - 1;
                    console.log(`VALIDATOR DEBUG - Using ${id} as index (base 1), converted to ${index}`);
                  }
                }
                
                // Estrategia 3: Búsqueda por índice directo (base 0)
                if (index === -1) {
                  const numericId = parseInt(id);
                  if (!isNaN(numericId) && numericId >= 0 && numericId < idColumn.values.length) {
                    index = numericId;
                    console.log(`VALIDATOR DEBUG - Using ${id} as direct index (base 0): ${index}`);
                  }
                }
                
                console.log(`VALIDATOR DEBUG - Final index for ID ${id}: ${index}`);
                console.log(`VALIDATOR DEBUG - Available ID values:`, idColumn.values);
                console.log(`VALIDATOR DEBUG - ID column length:`, idColumn.values.length);
                
                if (index !== -1 && index < descripcionColumn.values.length) {
                  const codigo = idColumn.values[index];
                  const descripcion = descripcionColumn.values[index];
                  console.log(`VALIDATOR DEBUG - Found mapping: ${codigo} - ${descripcion}`);
                  return {
                    value: id,
                    label: `${codigo} - ${descripcion}`
                  };
                } else {
                  console.log(`VALIDATOR DEBUG - No mapping found for ID ${id}. Index: ${index}, descripcionColumn length: ${descripcionColumn.values.length}`);
                  if (index !== -1) {
                    console.log(`VALIDATOR DEBUG - Available descriptions:`, descripcionColumn.values);
                  }
                }
              }
            }
            
            console.log(`VALIDATOR DEBUG - No description found for ${id} in ${relevantValidator.name}`);
            
            // Estrategia de fallback: buscar en otros validadores de beneficiarios
            if (fieldNameClean.includes('beneficiario')) {
              console.log(`VALIDATOR DEBUG - Trying fallback search for beneficiario field`);
              const otherBeneficiaryValidators = validators.filter((v: any) => 
                v.name.includes('BENEFICIARIO') && v.name !== relevantValidator.name
              );
              
              for (const fallbackValidator of otherBeneficiaryValidators) {
                console.log(`VALIDATOR DEBUG - Trying fallback validator: ${fallbackValidator.name}`);
                if (fallbackValidator.columns && fallbackValidator.columns.length >= 2) {
                  const fallbackIdColumn = fallbackValidator.columns.find((col: any) => col.is_validator === true);
                  const fallbackDescColumn = fallbackValidator.columns.find((col: any) => 
                    (col.name.includes('DESCRIPCION') || col.name.includes('DESCRIPCIÓN') || col.name.startsWith('DESC'))
                  );
                  
                  if (fallbackIdColumn && fallbackDescColumn) {
                    const fallbackIndex = fallbackIdColumn.values.findIndex((value: any) => 
                      value.toString() === id || parseInt(value) === parseInt(id)
                    );
                    
                    if (fallbackIndex !== -1 && fallbackIndex < fallbackDescColumn.values.length) {
                      const codigo = fallbackIdColumn.values[fallbackIndex];
                      const descripcion = fallbackDescColumn.values[fallbackIndex];
                      console.log(`VALIDATOR DEBUG - Found in fallback validator: ${codigo} - ${descripcion}`);
                      return {
                        value: id,
                        label: `${codigo} - ${descripcion}`
                      };
                    }
                  }
                }
              }
            }
            
            console.log(`VALIDATOR DEBUG - No description found for ${id} in any validator`);
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
              
              // Determinar el tipo de input dinámicamente
              const fieldName = filter.fieldName;
              const fieldLower = fieldName.toLowerCase();
              const uniqueValues = [...new Set(templateData.map(row => row[fieldName]).filter(val => val != null && val !== ''))];
              
              let dynamicInputType = 'dropdown';
              
              // Aplicar la misma lógica que en generateDynamicFilters
              if (fieldLower.includes('fecha') || fieldLower.includes('date') || 
                  fieldLower.includes('time') || fieldLower.includes('hora')) {
                dynamicInputType = 'date';
              }
              else if (fieldLower.includes('evidencia')) {
                dynamicInputType = 'autocomplete';
              }
              else if (fieldLower.includes('email') || fieldLower.includes('direccion')) {
                dynamicInputType = 'autocomplete';
              }
              else if (fieldName.includes('?')) {
                dynamicInputType = 'radio';
              }
              else if (fieldLower.includes('promueve') || fieldLower.includes('contribuye') || fieldLower.includes('desarrolla')) {
                dynamicInputType = 'radio';
              }
              else if ((fieldLower.includes('id') || fieldLower.includes('tipo') || 
                        fieldLower.includes('estado') || fieldLower.includes('sexo') ||
                        fieldLower.includes('biologico') || fieldLower.includes('civil') ||
                        fieldLower.includes('fuente') || fieldLower.includes('pais') ||
                        fieldLower.includes('movilidad') || fieldLower.includes('impacto') ||
                        fieldLower.includes('estrategia') || fieldLower.includes('flexibilizaci') ||
                        fieldLower.includes('enfoques')) &&
                       uniqueValues.length > 0 && uniqueValues.length <= 20 &&
                       uniqueValues.every(val => val != null && (/^\d{1,3}$/.test(val.toString()) || /^[A-Z]{2,3}$/.test(val.toString())))) {
                dynamicInputType = 'radio';
              }
              else if (fieldLower.includes('pais') && uniqueValues.length > 0 && uniqueValues.length <= 15) {
                dynamicInputType = 'radio';
              }
              else if (uniqueValues.length <= 5) {
                dynamicInputType = 'radio';
              }
              else if (uniqueValues.length <= 10) {
                dynamicInputType = 'dropdown';
              }
              else {
                dynamicInputType = 'autocomplete';
              }
              
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
                inputType: dynamicInputType, // Usar el tipo dinámico calculado
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
          <Stack gap="sm">
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
                    currentValue: filterValues[filter.name],
                    allFilterValues: filterValues,
                    filterExists: filter.name in filterValues
                  });
                }
                
                return (
                  <Box key={filter._id} p="xs" style={{
                    backgroundColor: 'white',
                    borderRadius: '6px',
                    border: `1px solid var(--mantine-color-${filter.color}-2)`,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    width: '100%',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    wordBreak: 'break-word'
                  }}>
                    <Group mb="xs" gap="xs" wrap="nowrap">
                      <Box p={4} style={{
                        backgroundColor: `var(--mantine-color-${filter.color}-1)`,
                        borderRadius: '6px',
                        flexShrink: 0
                      }}>
                        <Icon size={20} color={`var(--mantine-color-${filter.color}-6)`} />
                      </Box>
                      <Text fw={600} size="xs" c={filter.color} style={{ 
                        flex: 1, 
                        minWidth: 0,
                        lineHeight: 1.2,
                        wordBreak: 'break-word',
                        hyphens: 'auto'
                      }}>
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
                        onChange={(value) => {
                          console.log(`RADIO ${filter.label} onChange:`, { value, filterName: filter.name });
                          handleFilterChange(filter.name, value ? [value] : []);
                        }}
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