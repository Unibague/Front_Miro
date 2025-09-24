'use client';

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Button,
  Group,
  Text,
  Table,
  ActionIcon,
  ScrollArea,
  Title,
  TextInput,
  NumberInput,
  Center,
  Textarea,
  Switch,
  Tooltip,
  rem,
  MultiSelect,
} from "@mantine/core";
import { IconTrash, IconEye, IconPlus, IconCancel, IconRefresh } from "@tabler/icons-react";
import { DateInput } from "@mantine/dates";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { ValidatorModal } from "../../../../../components/Validators/ValidatorModal";
import "dayjs/locale/es";

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  validate_with?: { id: string; name: string } | string;
  comment?: string;
  multiple?: boolean;
}

interface Template {
  _id: string;
  name: string;
  fields: Field[];
}

interface PublishedTemplateResponse {
  name: string;
  template: Template;
}

interface ValidatorData {
  name: string;
  _id: string;
  columns: { name: string; is_validator: boolean; values: any[] }[];
}

const ProducerTemplateUpdatePage = ({
  params,
}: {
  params: { id_template: string };
}) => {
  const { id_template } = params;
  const { data: session } = useSession();
  const router = useRouter();
  const [publishedTemplateName, setPublishedTemplateName] =
    useState<string>("");
  const [template, setTemplate] = useState<Template | null>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [validatorModalOpen, setValidatorModalOpen] = useState(false);
  const [validatorData, setValidatorData] = useState<ValidatorData | null>(
    null
  );
  const [validatorExists, setValidatorExists] = useState<
    Record<string, boolean>
  >({});
  const [loading, setLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [multiSelectOptions, setMultiSelectOptions] = useState<Record<string, string[]>>({});
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [activeFieldName, setActiveFieldName] = useState<string | null>(null);
  const [currentValidatorId, setCurrentValidatorId] = useState<string>("");
  
  useEffect(() => {
    if (id_template) {
      fetchTemplateAndData();
    }
  }, [id_template]);

  const fetchTemplateAndData = async () => {
    try {
      const templateResponse = await axios.get<PublishedTemplateResponse>(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${id_template}`
      );
      setPublishedTemplateName(templateResponse.data.name);
      setTemplate(templateResponse.data.template);
      const dataResponse = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/uploaded/${id_template}`,
        {
          params: { email: session?.user?.email },
        }
      );

      console.log('Data response:', dataResponse.data);
      console.log('Template fields:', templateResponse.data.template.fields);
      
      const transformedRows = transformData(dataResponse.data.data, templateResponse.data.template);
      
      console.log('Transformed rows:', transformedRows);
      setRows(transformedRows);

      const validatorCheckPromises = templateResponse.data.template.fields.map(
        async (field) => {
          if (field.validate_with) {
            try {
              let validatorId = '';
              if (typeof field.validate_with === 'string') {
                const parts = field.validate_with.split(' - ');
                validatorId = parts.length >= 2 ? parts[1].trim() : '';
              } else {
                validatorId = field.validate_with.id;
              }
              
              if (validatorId) {
                const validatorResponse = await axios.get(
                  `${process.env.NEXT_PUBLIC_API_URL}/validators/id?id=${validatorId}`
                );
                return { [field.name]: !!validatorResponse.data.validator };
              }
            } catch {
              return { [field.name]: false };
            }
          }
          return { [field.name]: false };
        }
      );

      const validatorChecks = await Promise.all(validatorCheckPromises);
      const validatorCheckResults = validatorChecks.reduce(
        (acc, curr) => ({ ...acc, ...curr }),
        {}
      );
      setValidatorExists(validatorCheckResults);

      const multiSelectOptionsPromises = templateResponse.data.template.fields
      .filter(field => field.multiple && field.validate_with)
      .map(async (field) => {
        try {
          let validatorId = '';
          let columnToValidate = '';
          
          if (typeof field.validate_with === 'string') {
            const parts = field.validate_with.split(' - ');
            if (parts.length >= 2) {
              validatorId = parts[1].trim();
              columnToValidate = parts[1].trim().toLowerCase();
            }
          } else if (field.validate_with?.id) {
            validatorId = field.validate_with.id;
            columnToValidate = field.validate_with.name.split(" - ")[1]?.toLowerCase();
          }
          
          if (!validatorId) {
            return { [field.name]: [] };
          }
          
          const validatorResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id?id=${validatorId}`);
          const validatorColumns = validatorResponse.data.validator.columns || [];
          const validatorColumn = validatorColumns.find(
            (col: { is_validator: boolean; name: string }) =>
              col.is_validator && col.name.toLowerCase() === columnToValidate
          );
          if (validatorColumn) {
            console.log("Columna encontrada para validación:", validatorColumn.name);
          } else {
            console.log("No se encontró una columna coincidente para:", columnToValidate);
          }
          const values = validatorColumn ? validatorColumn.values.map((v: any) => v.toString()) : [];
          const uniqueValues = Array.from(new Set(values)) as string[];
          return {
            [field.name]: uniqueValues
          };
        } catch (error) {
          console.error(`Error obteniendo opciones para ${field.name}:`, error);
          return { [field.name]: [] };
        }
      });

    const multiSelectOptionsArray = await Promise.all(multiSelectOptionsPromises);
    const multiSelectOptions = multiSelectOptionsArray.reduce((acc, curr) => ({ ...acc, ...curr }), {});
    setMultiSelectOptions(multiSelectOptions);
    } catch (error) {
      console.error("Error fetching template or data:", error);
      showNotification({
        title: "Error",
        message: "No se pudo cargar la plantilla o los datos.",
        color: "red",
      });
    }
  };

const transformData = (data: any[], template: Template): Record<string, any>[] => {
  if (!data.length || !template?.fields.length) return [];
  
  // Extraer valores de la estructura de Mongoose
  const firstFieldData = data[0];
  const firstFieldValues = firstFieldData?._doc?.values || firstFieldData?.values || [];
  const rowCount = firstFieldValues.length;
  
  const transformedRows: Record<string, any>[] = Array.from({ length: rowCount }, () => ({}));

  // Mapear cada campo de la plantilla con los datos correspondientes
  data.forEach((fieldData) => {
    const fieldName = fieldData?._doc?.field_name || fieldData?.field_name;
    const fieldValues = fieldData?._doc?.values || fieldData?.values || [];
    const field = template.fields.find(f => f.name === fieldName);
    
    if (field && fieldValues.length > 0) {
      fieldValues.forEach((value: any, rowIndex: number) => {
        if (rowIndex < rowCount) {
          if (field.multiple) {
            if (Array.isArray(value)) {
              transformedRows[rowIndex][field.name] = value.map(v => v.toString());
            } else if (typeof value === "string" && value.includes(",")) {
              transformedRows[rowIndex][field.name] = value.split(",").map(v => v.trim());
            } else {
              transformedRows[rowIndex][field.name] = [value?.toString() || ""];
            }
          } else {
            let processedValue = value;
            
            // Si es un array, tomar el primer elemento
            if (Array.isArray(value) && value.length > 0) {
              processedValue = value[0];
            }
            
            // Intentar parsear JSON si es string
            if (typeof processedValue === 'string') {
              try {
                const parsed = JSON.parse(processedValue);
                if (parsed && typeof parsed === 'object' && parsed.text) {
                  processedValue = parsed.text;
                }
              } catch {
                // No es JSON válido, mantener como string
              }
            }
            
            // Manejar objetos de email (hyperlinks)
            if (processedValue && typeof processedValue === 'object' && processedValue.text) {
              transformedRows[rowIndex][field.name] = processedValue.text;
            }
            // Validar fechas para evitar valores inválidos
            else if (field.datatype === 'Fecha' && processedValue) {
              const dateValue = new Date(processedValue);
              transformedRows[rowIndex][field.name] = isNaN(dateValue.getTime()) ? null : dateValue;
            }
            // Convertir strings a números para campos con validadores de tipo entero
            else if (field.validate_with && field.datatype === 'Entero' && processedValue) {
              const numValue = parseInt(String(processedValue), 10);
              transformedRows[rowIndex][field.name] = isNaN(numValue) ? processedValue : numValue;
            }
            else {
              transformedRows[rowIndex][field.name] = processedValue;
            }
          }
        }
      });
    }
  });

  return transformedRows;
};

  const validateFields = () => {
    const newErrors: Record<string, string[]> = {};

    rows.forEach((row, rowIndex) => {
      template?.fields.forEach((field) => {
        if (field.required && (row[field.name] === null || row[field.name] === undefined)) {
          if (!newErrors[field.name]) {
            newErrors[field.name] = [];
          }
          newErrors[field.name][rowIndex] = "Este campo es obligatorio.";
        }
      });
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (rowIndex: number, fieldName: string, value: any) => {
    const updatedRows = [...rows];
  
    if (Array.isArray(value)) {
      updatedRows[rowIndex][fieldName] = value.map(v => v.toString()); 
    } else {
      updatedRows[rowIndex][fieldName] = value === "" ? null : value;
    }
  
    setRows(updatedRows);
  
    const updatedErrors = { ...errors };
    if (updatedErrors[fieldName]) {
      delete updatedErrors[fieldName];
      setErrors(updatedErrors);
    }
  };

  const addRow = () => {
    const newRow: Record<string, any> = {};
    template?.fields.forEach((field) => {
      newRow[field.name] = null;
    });
    const newRows = [...rows, newRow];
    setRows(newRows);
    
    // Auto-seleccionar el primer campo con validador de la nueva fila
    const newRowIndex = newRows.length - 1;
    const firstFieldWithValidator = template?.fields.find(f => f.validate_with);
    
    if (firstFieldWithValidator) {
      setActiveRowIndex(newRowIndex);
      setActiveFieldName(firstFieldWithValidator.name);
    }
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleValidatorOpen = async (validatorId: string, rowIndex: number, fieldName: string) => {
    console.log('handleValidatorOpen - validatorId:', validatorId, 'rowIndex:', rowIndex, 'fieldName:', fieldName);
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/validators/id?id=${validatorId}`
      );
      setValidatorData(response.data.validator);
      setCurrentValidatorId(validatorId);
      setActiveRowIndex(rowIndex);
      setActiveFieldName(fieldName);
      console.log('Valores establecidos - activeRowIndex:', rowIndex, 'activeFieldName:', fieldName);
      setValidatorModalOpen(true);
    } catch (error) {
      console.error('Error en handleValidatorOpen:', error);
      showNotification({
        title: "Error",
        message: "No se pudieron cargar los datos de validación",
        color: "red",
      });
    }
  };

  const handleSubmit = async () => {
    if (!validateFields()) {
      showNotification({
        title: "Error de Validación",
        message: "Por favor completa los campos obligatorios.",
        color: "red",
      });
      return;
    }

    try {
      setLoading(true);
      await axios.put(
        `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/producer/load`,
        {
          email: session?.user?.email,
          pubTem_id: id_template,
          data: rows,
          edit: true,
        }
      );
      showNotification({
        title: "Éxito",
        message: "Datos actualizados exitosamente",
        color: "teal",
      });
      router.push("/producer/templates");
    } catch (error) {
      console.error("Error submitting data:", error);
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        const validationErrors = error.response.data.details;
        const errorObject: Record<string, string[]> = {};

        validationErrors.forEach((error: { column: string, errors: { register: number, message: string }[] }) => {
          error.errors.forEach(err => {
            if (!errorObject[error.column]) {
              errorObject[error.column] = [];
            }
            errorObject[error.column][err.register - 1] = err.message;
          });
        });

        setErrors(errorObject);
        showNotification({
          title: "Error de Validación",
          message: "Algunos campos contienen errores. Por favor revisa y corrige.",
          color: "red",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const renderInputField = (
    field: Field,
    row: Record<string, any>,
    rowIndex: number
  ) => {
    const fieldError = errors[field.name]?.[rowIndex];
    const commonProps = {
      value: row[field.name] || "",
      onChange: (e: React.ChangeEvent<HTMLInputElement> | number) =>
        handleInputChange(rowIndex, field.name, typeof e === "number" ? e : e.currentTarget.value),
      required: field.required,
      placeholder: field.comment,
      style: { width: "100%" },
      error: Boolean(fieldError),
    };

    if (field.multiple && field.validate_with) {
      return (
        <MultiSelect
          value={Array.isArray(row[field.name]) ? row[field.name].map(String) : []}
          onChange={(value) => handleInputChange(rowIndex, field.name, value)}
          data={Array.from(new Set(multiSelectOptions[field.name] || [])).map(value => ({ value: String(value), label: String(value) }))}
          searchable
          placeholder={field.comment || "Seleccione opciones"}
          style={{ width: "100%" }}
          error={fieldError ? fieldError : undefined}
        />
      );
    }

    switch (field.datatype) {
      case "Entero":
      case "Decimal":
      case "Porcentaje":
        let numericValue = "";
        if (row[field.name] !== null && row[field.name] !== undefined) {
          const rawValue = typeof row[field.name] === 'object' ? "" : String(row[field.name]);
          numericValue = field.datatype === "Porcentaje" ? (rawValue ? `${rawValue}%` : "") : rawValue;
        }

        return (
          <NumberInput
            {...commonProps}
            value={numericValue}
            min={0}
            step={field.datatype === "Porcentaje" ? 1 : 1}
            hideControls
            onChange={(value) => handleInputChange(rowIndex, field.name, value)}
            error={fieldError ? fieldError : undefined}
          />
        );
      case "Texto Largo":
        return (
          <Textarea
            {...commonProps}
            resize="vertical"
            value={row[field.name] === null ? "" : row[field.name]}
            onChange={(e) => handleInputChange(rowIndex, field.name, e.target.value)}
            error={fieldError ? fieldError : undefined}
          />
        );
      case "Texto Corto":
      case "Link":
        return (
          <TextInput
            {...commonProps}
            value={row[field.name] === null ? "" : row[field.name]}
            onChange={(e) => handleInputChange(rowIndex, field.name, e.target.value)}
            error={fieldError ? fieldError : undefined}
          />
        );
      case "True/False":
        return (
          <Switch
            {...commonProps}
            checked={row[field.name] === true}
            onChange={(event) => handleInputChange(rowIndex, field.name, event.currentTarget.checked)}
            error={fieldError ? fieldError : undefined}
          />
        );
      case "Fecha":
        let dateValue = null;
        if (row[field.name]) {
          const tempDate = new Date(row[field.name]);
          dateValue = isNaN(tempDate.getTime()) ? null : tempDate;
        }
        return (
          <DateInput
            {...commonProps}
            value={dateValue}
            locale="es"
            valueFormat="DD/MM/YYYY"
            onChange={(date) => handleInputChange(rowIndex, field.name, date)}
            error={fieldError ? fieldError : undefined}
          />
        );
      default:
        return (
          <TextInput
            {...commonProps}
            value={row[field.name] === null ? "" : row[field.name]}
            onChange={(e) => handleInputChange(rowIndex, field.name, e.target.value)}
            error={fieldError ? fieldError : undefined}
          />
        );
    }
  };

  if (!template) {
    return (
      <Text ta="center" c="dimmed">
        Cargando Información...
      </Text>
    );
  }

  return (
    <Container size="xl">
      <Title ta="center" mb="md">
        {`Editar Plantilla: ${publishedTemplateName}`}
      </Title>
      {rows.length === 0 && (
  <Text ta="center" color="red" size="sm" mb="md">
    Plantilla reportada en cero
  </Text>
)}
      <Tooltip
        label="Desplázate horizontalmente para ver todas las columnas"
        position="bottom"
        withArrow
        transitionProps={{ transition: "slide-up", duration: 300 }}
      >
        <ScrollArea viewportRef={scrollAreaRef}>
          <ScrollArea type="always" offsetScrollbars>
            <Table mb={"xs"} withTableBorder withColumnBorders withRowBorders>
              <Table.Thead>
                <Table.Tr>
                  {template.fields.map((field) => (
                    <Table.Th key={field.name} style={{ minWidth: '250px' }}>
                      <Group>
                        {field.name} {field.required && <Text span color="red">*</Text>}

                      </Group>
                    </Table.Th>
                  ))}
                  <Table.Th maw={rem(70)}><Center>Acciones</Center></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row, rowIndex) => (
                  <Table.Tr key={rowIndex}>
                    {template.fields.map((field) => (
                      <Table.Td key={field.name} style={{ minWidth: '250px' }}>
                        <Group align="center">
                          {renderInputField(field, row, rowIndex)}
                          {field.validate_with && (
                            <ActionIcon
                              size={"sm"}
                              onClick={() => {
                                console.log('Botón ojo clickeado - field:', field.name);
                                console.log('field.validate_with completo:', field.validate_with);
                                
                                // Extraer ID del validador del string
                                let validatorId = '';
                                if (typeof field.validate_with === 'string') {
                                  // Formato esperado: "NOMBRE_VALIDADOR - ID_VALIDADOR"
                                  const parts = field.validate_with.split(' - ');
                                  if (parts.length >= 2) {
                                    validatorId = parts[1].trim();
                                  }
                                } else if (field.validate_with?.id) {
                                  validatorId = field.validate_with.id;
                                }
                                
                                console.log('ID extraído:', validatorId);
                                
                                if (validatorId) {
                                  setActiveRowIndex(rowIndex);
                                  setActiveFieldName(field.name);
                                  handleValidatorOpen(validatorId, rowIndex, field.name);
                                } else {
                                  console.error('No se pudo extraer ID del validador para campo:', field.name);
                                  console.error('validate_with:', field.validate_with);
                                  showNotification({
                                    title: "Error",
                                    message: `No se pudo obtener ID del validador para ${field.name}`,
                                    color: "red",
                                  });
                                }
                              }}
                              title="Ver valores aceptados"
                              color={activeRowIndex === rowIndex && activeFieldName === field.name ? "green" : "blue"}
                              variant={activeRowIndex === rowIndex && activeFieldName === field.name ? "filled" : "light"}
                            >
                              <IconEye />
                            </ActionIcon>
                          )}
                        </Group>
                      </Table.Td>
                    ))}
                    <Table.Td maw={rem(70)}>
                      <Center>
                        <Button
                          size={"xs"} 
                          color="red"
                          onClick={() => removeRow(rowIndex)}
                          rightSection={<IconTrash />}
                        >
                          Borrar
                        </Button>
                      </Center>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </ScrollArea>
      </Tooltip>
      <Group justify="center" mt={rem(50)}>
        <Button
          color={"red"}
          variant="outline"
          onClick={() => router.push('/producer/templates')}
          leftSection={<IconCancel/>}
          loading={loading}
        >
          Cancelar
        </Button>
        <Group>
          <Button
            variant="light"
            onClick={addRow}
            leftSection={<IconPlus/>}
          >
            Agregar Fila
          </Button>
          <Button 
            onClick={handleSubmit}
            rightSection={<IconRefresh/>}
            loading={loading}
          >
            Actualizar
          </Button>
        </Group>
      </Group>
      <ValidatorModal
        opened={validatorModalOpen}
        onClose={() => {
          setValidatorModalOpen(false);
          setActiveRowIndex(null);
          setActiveFieldName(null);
          setCurrentValidatorId("");
        }}
        validatorId={currentValidatorId}
        onCopy={(value: string) => {
          if (activeRowIndex !== null && activeFieldName !== null) {
            const updatedRows = [...rows];
            updatedRows[activeRowIndex][activeFieldName] = value;
            setRows(updatedRows);
            console.log('Valor colocado en fila:', activeRowIndex, 'campo:', activeFieldName);
          }
          setValidatorModalOpen(false);
          setActiveRowIndex(null);
          setActiveFieldName(null);
          setCurrentValidatorId("");
        }}
      />

    </Container>
  );
};

export default ProducerTemplateUpdatePage;
