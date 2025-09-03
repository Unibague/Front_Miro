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
  validate_with?: { id: string; name: string };
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

      const transformedRows = transformData(dataResponse.data.data);

      setRows(transformedRows);

      const validatorCheckPromises = templateResponse.data.template.fields.map(
        async (field) => {
          if (field.validate_with) {
            try {
              const validatorResponse = await axios.get(
                `${process.env.NEXT_PUBLIC_API_URL}/validators/id?id=${field.validate_with.id}`
              );
              return { [field.name]: !!validatorResponse.data.validator };
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
          const validatorResponse = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id?id=${field.validate_with?.id}`);
          const validatorColumns = validatorResponse.data.validator.columns || [];
          const columnToValidate = field.validate_with?.name.split(" - ")[1]?.toLowerCase();
          const validatorColumn = validatorColumns.find(
            (col: { is_validator: boolean; name: string }) =>
              col.is_validator && col.name.toLowerCase() === columnToValidate
          );
          if (validatorColumn) {
            console.log("Columna encontrada para validación:", validatorColumn.name);
          } else {
            console.log("No se encontró una columna coincidente para:", columnToValidate);
          }
          return {
            [field.name]: validatorColumn ? validatorColumn.values.map((v: any) => v.toString()) : []
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

const transformData = (data: any[]): Record<string, any>[] => {
  const rowCount = data[0]?.values?.length || 0;
  const transformedRows: Record<string, any>[] = Array.from({ length: rowCount }, () => ({}));

  data.forEach((fieldData) => {
    const isMultiple = template?.fields.find(f => f.name === fieldData.field_name)?.multiple;

    fieldData.values.forEach((value: any, index: number) => {
      if (isMultiple) {
        if (Array.isArray(value)) {
          transformedRows[index][fieldData.field_name] = value.map(v => v.toString());
        } else if (typeof value === "number") {
          transformedRows[index][fieldData.field_name] = [value.toString()];
        } else if (typeof value === "string") {
          transformedRows[index][fieldData.field_name] = value.split(",").map(v => v.trim());
        } else {
          transformedRows[index][fieldData.field_name] = [];
        }
      } else {
        transformedRows[index][fieldData.field_name] = value;
      }
    });
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
    setRows([...rows, newRow]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const handleValidatorOpen = async (validatorId: string) => {
    try {
      const response = await axios.get(
        `${process.env.NEXT_PUBLIC_API_URL}/validators/id?id=${validatorId}`
      );
      setValidatorData(response.data.validator);
      setValidatorModalOpen(true);
    } catch (error) {
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
          data={multiSelectOptions[field.name] || []}
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
        const formattedValue = field.datatype === "Porcentaje" ? (row[field.name] ? `${row[field.name]}%` : "") : row[field.name];

        return (
          <NumberInput
            {...commonProps}
            value={formattedValue}
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
        return (
          <DateInput
            {...commonProps}
            value={row[field.name] ? new Date(row[field.name]) : null}
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
                        {field.validate_with && (
                          <ActionIcon
                            size={"lg"}
                            onClick={() => handleValidatorOpen(field.validate_with?.id!)}
                            title="Ver valores aceptados"
                            disabled={!validatorExists[field.name]}
                          >
                            <IconEye />
                          </ActionIcon>
                        )}
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
  onClose={() => setValidatorModalOpen(false)}
  validatorId={validatorData?._id || ""}
  onCopy={(value: string) => {
    if (activeRowIndex !== null && activeFieldName !== null) {
      const updatedRows = [...rows];
      updatedRows[activeRowIndex][activeFieldName] = value;
      setRows(updatedRows);
    }
    setValidatorModalOpen(false);
  }}
/>

    </Container>
  );
};

export default ProducerTemplateUpdatePage;
