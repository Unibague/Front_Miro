import axios from 'axios';

interface FilterOption {
  value: string;
  label: string;
}

class CleanValidatorService {
  private static instance: CleanValidatorService;
  private validators: any[] = [];
  private isLoaded = false;

  private constructor() {}

  static getInstance(): CleanValidatorService {
    if (!CleanValidatorService.instance) {
      CleanValidatorService.instance = new CleanValidatorService();
    }
    return CleanValidatorService.instance;
  }

  async loadValidators(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/validators/pagination?page=1&limit=200`
      );
      
      if (response.data?.validators) {
        this.validators = response.data.validators;
        this.isLoaded = true;
        console.log(`CleanValidator - Loaded ${this.validators.length} validators`);
      }
    } catch (error) {
      console.error('CleanValidator - Error loading validators:', error);
    }
  }

  // Mapeo EXACTO de campos a validadores - TODOS LOS VALIDADORES
  private getValidatorName(fieldName: string): string | null {
    const exactMappings: Record<string, string> = {
      // DOCUMENTOS
      'ID_TIPO_DOCUMENTO': 'TIPO_DOCUMENTO',
      'TIPO_DOCUMENTO': 'TIPO_DOCUMENTO',
      'TIPO_DE_DOCUMENTO_DE_INSTITUCION_ASOCIADA': 'TIPO_DOCUMENTO',
      'ID_TIPO_DOCUMENTO_SUPERVISOR': 'TIPO_DOCUMENTO',
      'ID_EMPRESA' : 'TIPO_DOCUMENTO',
      
      // SEXO BIOLOGICO
      'ID_SEXO_BIOLOGICO': 'SEXO_BIOLOGICO',
      'SEXO_BIOLOGICO': 'SEXO_BIOLOGICO',
      
      // ESTADO CIVIL
      'ID_ESTADO_CIVIL': 'ESTADO_CIVIL',
      'ESTADO_CIVIL': 'ESTADO_CIVIL',
      
      // PAISES
      'ID_PAIS_PROCEDENCIA': 'PAIS',
      'ID_PAIS_FINANCIADOR': 'PAIS',
      'ID_PAIS_INSTITUCIONAL_ASOCIADO': 'PAIS',
      'ID PAIS INSTITUCION ASOCIADA': 'PAIS',
      'ID_PAIS_INSTITUCION_ASOCIADA': 'PAIS',
      'ID_PAIS_NACIMIENTO': 'PAIS',
      'ID_PAIS_DESTINO': 'PAIS',
      'PAIS_INSTITUCIONAL_ASOCIADO': 'PAIS',
      
      // CONVENIOS
      'TIPOLOGIA_CONVENIO': 'TIPO_CONVENIO',
      'TIPOLOGIA DE CONVENIO': 'TIPO_CONVENIO',
      'ID_TIPOLOGIA_CONVENIO': 'TIPO_CONVENIO',
      'TIPO_CONVENIO': 'TIPO_CONVENIO',
      'ID_TIPO_CONVENIO': 'TIPO_CONVENIO',
      'ORIGEN_CONVENIO': 'ORIGEN_CONVENIO',
      'ORIGEN_DE_CONVENIO': 'ORIGEN_CONVENIO',
      'ORIGEN DE CONVENIO': 'ORIGEN_CONVENIO',
      'OR_GEN_CONVENIO': 'ORIGEN_CONVENIO',
      'TIPOLOG_A_CONVENIO': 'TIPOLOGIA_CONVENIOS',
      'TIPOLOGIA CONVENIO': 'TIPOLOGIA_CONVENIOS',

      
      // ACTIVIDADES
      'ID_TIPO_ACTIVIDAD': 'ACTIVIDADES_DE_BIENESTAR',
      'TIPO_ACTIVIDAD': 'ACTIVIDADES_DE_BIENESTAR',
      'CODIGO_ACTIVIDAD': 'ACTIVIDADES_DE_BIENESTAR',
      
      // ACADEMICO/NO ACADEMICO
      'ACADEMICO_NO_ACADEMICO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      'ACADÉMICO_NO_ACADÉMICO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      'ACADEMICO NO ACADEMICO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      'ACADÉMICO NO ACADÉMICO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      'ID_ACADEMICO_NO_ACADEMICO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      'ID ACADEMICO NO ACADEMICO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      
      // BENEFICIARIOS
      'ID_TIPO_BENEFICIARIO': 'TIPO_BENEFICIARIO',
      'TIPO_BENEFICIARIO': 'TIPO_BENEFICIARIO',
      'CANTIDAD_BENEFICIARIOS_EXTERNOS': 'ACTIVIDADES_BENEFICIARIO_BIENESTAR',
      'BENEFICIARIOS': 'TIPO_BENEFICIARIO',
      'TIPO_DE_BENEFICIARIO': 'TIPO_BENEFICIARIO',
      'CATEGORIA_BENEFICIARIO': 'TIPO_BENEFICIARIO',
      'PERFIL_BENEFICIARIO': 'TIPO_BENEFICIARIO',
      
      // MOVILIDAD
      'TIPO_MOVILIDAD': 'TIPO_MOVILIDAD_ENTRANTE_ESTUDIANTES',
      'ID_TIPO_MOVILIDAD': 'TIPO_MOVILIDAD_ENTRANTE_ESTUDIANTES',
      'MODALIDAD': 'TIPO_MOVILIDAD_SALIENTE_FUNCIONARIOS',
      'ID_MODALIDAD': 'TIPO_MOVILIDAD_SALIENTE_FUNCIONARIOS',
      
      // ALCANCE
      'ALCANCE': 'TIPO_ALCANCE',
      'ID_ALCANCE': 'TIPO_ALCANCE',
      'TIPO_ALCANCE': 'TIPO_ALCANCE',
      
      // EXTENSION
      'ID_TIPO_BENEF_EXTENSION': 'TIPO_BENEFICIARIO',
      'TIPO_BENEF_EXTENSION': 'TIPO_DE_EXTENSION',
      'TIPO_DE_EXTENSION': 'TIPO_DE_EXTENSION',
      
      // APOYO
      'TIPO_DE_APOYO_FINANCIERO_ACAD_MICO_OTROS_APOYOS': 'TIPO_DE_APOYO',
      'TIPO DE APOYO (FINANCIERO, ACADÉMICO, OTROS APOYOS)': 'TIPO_DE_APOYO',
      'TIPO_DE_APOYO': 'TIPO_DE_APOYO',
      'ID_TIPO_DE_APOYO': 'TIPO_DE_APOYO',
      
      // RECURSOS
      'TIPO_RECURSO': 'TIPO_RECURSOS',
      'ID_TIPO_RECURSO': 'TIPO_RECURSOS',
      'TIPO_RECURSOS': 'TIPO_RECURSOS',
      
      // CONSULTORIA
      'ID_SECTOR_CONSULTORIA': 'SECTOR_CONSULTORIA',
      'ID SECTOR CONSULTORIA': 'SECTOR_CONSULTORIA',
      'SECTOR_CONSULTORIA': 'SECTOR_CONSULTORIA',
      'CODIGO_CONSULTORIA': 'SECTOR_CONSULTORIA',
      'TIPO_CONSULTORIA': 'SECTOR_CONSULTORIA',
      
      // NIVEL ESTUDIO
      'ID_MAXIMO_NIVEL_ESTUDIO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      'MAXIMO_NIVEL_ESTUDIO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      'NIVEL_ESTUDIO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      'TIPO_ACADEMICO_NO_ACADEMICO': 'TIPO_ACADEMICO_NO_ACADEMICO',
      
      // ESTRATEGIAS
      'TIPOLOGIA_ESTRATEGIAS': 'TIPOLOGIA_ESTRATEGIAS',
      'ID_TIPOLOGIA_ESTRATEGIAS': 'TIPOLOGIA_ESTRATEGIAS',
      'TIPO_ESTRATEGIAS': 'TIPOLOGIA_ESTRATEGIAS',
      
      // FUENTES
      'ID_FUENTE_NACIONAL_INVESTIGACION': 'TIPO_FUENTE _NACIONAL_INVESTIGACION',
      'ID_FUENTE_INTERNACIONAL': 'ID_FUENTE_INTERNACIONAL',
      'FUENTE_NACIONAL': 'TIPO_FUENTE _NACIONAL_INVESTIGACION',
      'FUENTE_INTERNACIONAL': 'ID_FUENTE_INTERNACIONAL',
      'ID_FUENTE_NACIONAL_INVESTIG' : 'ID_FUENTE_NACIONAL_INVESTIGACION',
      
      // IMPACTO
      'ID_IMPACTO': 'TIPO_IMPACTO',
      'TIPO_IMPACTO': 'TIPO_IMPACTO',
      'IMPACTO': 'TIPO_IMPACTO',
      
      // CAMPOS S/N Y OTROS ESPECIFICOS
      'ACTIVO_NO_ACTIVO': 'SI_NO',
      'PRORROGABLE': 'SI_NO',
      'ACTIVIDAD_FORMACION': 'SI_NO',
      'ACTIVIDAD_INVESTIGACION': 'SI_NO',
      'ACTIVIDAD_EXTENSION': 'SI_NO',
      'ACTIVIDAD_ADMINISTRATIVA': 'SI_NO',
      'OTRAS_ACTIVIDADES_COOPERACION': 'SI_NO',
      'ES_UNA_ACTIVIDAD_DE_COOPERACI_N_NACIONAL': 'SI_NO',
      'ES_UNA_ACTIVIDAD_DE_COOPERACI_N_INTERNACIONAL': 'SI_NO',
      'PROMUEVE_LA_COMPRENSI_N_DE_LA_REALIDAD_SOCIAL': 'SI_NO',
      'PROMUEVE_LA_EMPAT_A': 'SI_NO',
      'PROMUEVE_LA_TICA': 'SI_NO',
      'PROMUEVE_LAS_HABILIDADES_BLANDAS': 'SI_NO',
      'PROMUEVE_EL_RELACIONAMIENTO_CON_OTRAS_CULTURAS_Y_LENGUAS': 'SI_NO',
      'DESARROLLA_CAPACIDADES_PARA_EL_DEL_TRABAJO_AUT_NOMO': 'SI_NO',
      'CONTRIBUYE_A_LA_PERMANENCIA': 'SI_NO',
      'CONTRIBUYE_A_LA_GRADUACI_N': 'SI_NO',
      'PROMUEVE_EL_DESARROLLO_PROFESORAL': 'SI_NO',
      'PROMUEVE_LA_FORMACI_N_INTEGRAL': 'SI_NO',
      
      //DERECHO PECUNIARIO
      'ID_TIPO_DERECHO_PECUNIARIO' : 'TIPO_DERECHOS_PECUNIARIOS',

      //ESTIMULOS
      'TIPOD_DE_EST_MULO' : 'TIPO_ESTIMULO',
      'NOMBRE_DEL_EST_MULO' : 'NOMBRE_ESTIMULO',
      'ID_TIPO_ESTIMULO' : 'TIPO_ESTIMULO',
      'TIPO_ESTIMULO' : 'TIPO_ESTIMULO',
      'NOMBRE_ESTIMULO' : 'NOMBRE_ESTIMULO',
 //dedicación
      'ID_DEDICACION' : 'DEDICACION'
    };

    return exactMappings[fieldName] || null;
  }

  async enrichWithDescriptions(fieldName: string, actualValues: string[]): Promise<FilterOption[]> {
    await this.loadValidators();

    // Opciones básicas
    const basicOptions: FilterOption[] = actualValues.map(value => ({
      value,
      label: value
    }));

    // Campos S/N
    if (actualValues.every(value => /^[SN]$/.test(value))) {
      return actualValues.map(value => ({
        value,
        label: value === 'S' ? 'S - Sí' : 'N - No'
      }));
    }

    // Solo procesar si son IDs numéricos o códigos de país
    const areIds = actualValues.every(value => /^\d{1,3}$/.test(value));
    const areCountryCodes = actualValues.every(value => /^[A-Z]{2}$/.test(value));
    
    if (!areIds && !areCountryCodes) {
      return basicOptions;
    }

    // Obtener validador específico
    const validatorName = this.getValidatorName(fieldName);
    if (!validatorName) {
      console.log(`CleanValidator - No mapping for field: ${fieldName}`);
      return basicOptions;
    }

    console.log(`CleanValidator - Field '${fieldName}' -> Validator '${validatorName}'`);
    
    // Debug específico para TIPOLOGIA_CONVENIO
    if (fieldName.includes('TIPOLOGIA') && fieldName.includes('CONVENIO')) {
      console.log(`TIPOLOGIA_CONVENIO DEBUG - Field: ${fieldName}`);
      console.log(`TIPOLOGIA_CONVENIO DEBUG - Validator: ${validatorName}`);
      console.log(`TIPOLOGIA_CONVENIO DEBUG - Values to process:`, actualValues);
    }

    const validator = this.validators.find(v => v.name === validatorName);
    if (!validator) {
      console.log(`CleanValidator - Validator '${validatorName}' not found`);
      return basicOptions;
    }

    if (!validator.columns) {
      console.log(`CleanValidator - Validator '${validatorName}' has no columns`);
      return basicOptions;
    }

    // Buscar columnas
    const idColumn = validator.columns.find((col: any) => col.is_validator === true);
    const descColumn = validator.columns.find((col: any) => {
      const colName = col.name.toUpperCase();
      return !col.is_validator && (
        colName.includes('DESCRIPCION') || 
        colName.includes('DESCRIPCIÓN') || 
        colName.includes('NOMBRE') ||
        colName.includes('DESC') ||
        colName.includes('CONVENIO') ||
        colName.includes('ACTIVIDAD') ||
        colName.includes('ACADEMICO') ||
        colName.includes('ESTIMULO')
      );
    });

    if (!idColumn?.values || !descColumn?.values) {
      console.log(`CleanValidator - Missing columns in '${validatorName}'`);
      console.log('Available columns:', validator.columns.map((col: any) => ({
        name: col.name,
        isValidator: col.is_validator,
        hasValues: !!col.values,
        valueCount: col.values?.length || 0,
        sampleValues: col.values?.slice(0, 3)
      })));
      
      // Debug específico para TIPOLOGIA_CONVENIOS
      if (validatorName === 'TIPOLOGIA_CONVENIOS') {
        console.log(`TIPOLOGIA_CONVENIOS STRUCTURE DEBUG:`);
        console.log(`  - ID Column found: ${!!idColumn}`);
        console.log(`  - ID Column has values: ${!!idColumn?.values}`);
        console.log(`  - DESC Column found: ${!!descColumn}`);
        console.log(`  - DESC Column has values: ${!!descColumn?.values}`);
        if (idColumn) console.log(`  - ID Column name: ${idColumn.name}`);
        if (descColumn) console.log(`  - DESC Column name: ${descColumn.name}`);
      }
      
      return basicOptions;
    }

    console.log(`CleanValidator - Using columns: ID='${idColumn.name}', DESC='${descColumn.name}'`);

    // Crear mapeo
    const valueMap = new Map<string, string>();
    idColumn.values.forEach((id: string, index: number) => {
      const desc = descColumn.values[index];
      if (desc) {
        valueMap.set(id.toString(), desc);
      }
    });

    // Enriquecer valores
    const enrichedOptions = actualValues.map(value => {
      const description = valueMap.get(value);
      if (description) {
        return {
          value,
          label: `${value} - ${description}`
        };
      } else {
        console.log(`CleanValidator - No description for value '${value}' in '${validatorName}'`);
        return {
          value,
          label: value
        };
      }
    });

    const enrichedCount = enrichedOptions.filter(opt => opt.label !== opt.value).length;
    console.log(`CleanValidator - Enriched ${enrichedCount}/${actualValues.length} values for '${fieldName}'`);
    
    return enrichedOptions;
  }
}

export default CleanValidatorService;