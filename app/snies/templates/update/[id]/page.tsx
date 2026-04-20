"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Accordion,
  Button,
  Center,
  Checkbox,
  Container,
  Group,
  Loader,
  MultiSelect,
  rem,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { IconCirclePlus, IconDeviceFloppy, IconGripVertical } from "@tabler/icons-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { paramId } from "@/app/utils/routeParams";

interface Field {
  name: string;
  worksheet_name?: string;
  insert_after?: string;
  datatype: string;
  required: boolean;
  multiple: boolean;
  validate_with?: string;
  comment?: string;
  field_origin?: "snies_original" | "snies_extra";
  visible_for_producer?: boolean;
  export_to_snies?: boolean;
}

interface Dependency {
  _id: string;
  name: string;
}

interface Dimension {
  _id: string;
  name: string;
}

interface ValidatorOption {
  name: string;
  type: string;
  validator_name?: string;
  column_name?: string;
  columns?: string[];
  preview_values?: string[];
}

type ValidatorSelectOption = {
  value: string;
  label: string;
  option: ValidatorOption;
};

interface WorkbookSheet {
  worksheetName: string;
  headers: string[];
  visual_fields?: Array<{
    name: string;
    field_origin: "snies_original" | "snies_extra";
    visible_for_producer: boolean;
    export_to_snies: boolean;
  }>;
}

type FieldKey =
  | "name"
  | "worksheet_name"
  | "insert_after"
  | "datatype"
  | "required"
  | "validate_with"
  | "comment"
  | "visible_for_producer"
  | "export_to_snies";

const allowedDataTypes = [
  "Entero",
  "Decimal",
  "Porcentaje",
  "Texto Corto",
  "Texto Largo",
  "True/False",
  "Fecha",
  "Fecha Inicial / Fecha Final",
  "Link",
];

export default function UpdateSniesTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const id = paramId(params);
  const { data: session } = useSession();

  const [name, setName] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileDescription, setFileDescription] = useState("");
  const [active, setActive] = useState(true);
  const [fields, setFields] = useState<Field[]>([
    {
      name: "",
      datatype: "",
      required: true,
      validate_with: "",
      comment: "",
      multiple: false,
      field_origin: "snies_extra",
      visible_for_producer: true,
      export_to_snies: false,
    },
  ]);
  const [workbookSheets, setWorkbookSheets] = useState<WorkbookSheet[]>([]);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);
  const [validatorOptions, setValidatorOptions] = useState<ValidatorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedOriginalWorksheet, setSelectedOriginalWorksheet] = useState<string>("");
  const [selectedOriginalField, setSelectedOriginalField] = useState<string>("");
  const worksheetOptions = workbookSheets.map((sheet) => ({
    value: sheet.worksheetName,
    label: sheet.worksheetName,
  }));
  const validatorSelectOptions: ValidatorSelectOption[] = validatorOptions.map((option) => ({
    value: option.name,
    label: option.name,
    option,
  }));
  const additionalFieldEntries = fields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => field.field_origin !== "snies_original");
  const originalWorksheetOptions = workbookSheets.map((sheet) => ({
    value: sheet.worksheetName,
    label: sheet.worksheetName,
  }));
  const originalFieldOptions = (
    workbookSheets.find((sheet) => sheet.worksheetName === selectedOriginalWorksheet)?.visual_fields || []
  )
    .filter((field) => field.field_origin === "snies_original")
    .map((field) => ({
      value: field.name,
      label: field.name,
    }));

  useEffect(() => {
    const fetchTemplate = async () => {
      if (!id || !session?.user?.email) return;

      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/snies/templates/${id}`, {
          params: { email: session.user.email },
        });

        setName(response.data.name || "");
        setFileName(response.data.file_name || "");
        setFileDescription(response.data.file_description || "");
        setActive(response.data.active ?? true);
        setFields(
          response.data.fields?.length
            ? response.data.fields
            : [{
                name: "",
                worksheet_name: "",
                insert_after: "",
                datatype: "",
                required: true,
                validate_with: "",
                comment: "",
                field_origin: "snies_extra",
                visible_for_producer: true,
                export_to_snies: false,
                multiple: false,
              }]
        );
        setWorkbookSheets(response.data.workbook_sheets || []);
        if (response.data.workbook_sheets?.length) {
          const firstWorksheet = response.data.workbook_sheets[0]?.worksheetName || "";
          setSelectedOriginalWorksheet(firstWorksheet);
        }
        setSelectedDimensions(response.data.dimensions || []);
        setSelectedDependencies(response.data.producers || []);
      } catch (error) {
        console.error("Error fetching SNIES template:", error);
        showNotification({
          title: "Error",
          message: "No fue posible cargar la plantilla SNIES.",
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    };

    const fetchDimensions = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions`);
        setDimensions(response.data || []);
      } catch (error) {
        console.error("Error fetching dimensions:", error);
      }
    };

    const fetchDependencies = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/all/${session?.user?.email}`
        );
        setDependencies(response.data || []);
      } catch (error) {
        console.error("Error fetching dependencies:", error);
      }
    };

    const fetchValidatorOptions = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/options`);
        setValidatorOptions(response.data.options || []);
      } catch (error) {
        console.error("Error fetching validator options:", error);
      }
    };

    if (session?.user?.email) {
      fetchTemplate();
      fetchDimensions();
      fetchDependencies();
      fetchValidatorOptions();
    }
  }, [id, session?.user?.email]);

  const handleFieldChange = (index: number, field: FieldKey, value: string | boolean) => {
    const updatedFields = [...fields];
    updatedFields[index] = { ...updatedFields[index], [field]: value };

    if (field === "worksheet_name") {
      updatedFields[index].insert_after = "";
    }

    if (field === "validate_with") {
      const selectedOption = validatorOptions.find((option) => option.name === value);

      if (selectedOption) {
        if (selectedOption.type === "Número") {
          updatedFields[index].datatype = "Entero";
        } else if (selectedOption.type === "Texto") {
          updatedFields[index].datatype = "Texto Largo";
        }
      }
    }

    setFields(updatedFields);
  };

  const addField = () => {
    setFields([
      ...fields,
      {
        name: "",
        worksheet_name: workbookSheets[0]?.worksheetName || "",
        insert_after: "",
        datatype: "",
        required: true,
        validate_with: "",
        comment: "",
        field_origin: "snies_extra",
        visible_for_producer: true,
        export_to_snies: false,
        multiple: false,
      },
    ]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, currentIndex) => currentIndex !== index));
  };

  const getOriginalFieldConfig = (worksheetName: string, fieldName: string): Field => {
    const existingField = fields.find(
      (field) =>
        field.field_origin === "snies_original" &&
        field.worksheet_name === worksheetName &&
        field.name === fieldName
    );

    return (
      existingField || {
        name: fieldName,
        worksheet_name: worksheetName,
        datatype: "Texto Corto",
        required: true,
        validate_with: "",
        comment: "",
        multiple: false,
        field_origin: "snies_original",
        visible_for_producer: true,
        export_to_snies: true,
      }
    );
  };

  const handleOriginalFieldChange = (
    worksheetName: string,
    fieldName: string,
    fieldKey: FieldKey,
    value: string | boolean
  ) => {
    const existingIndex = fields.findIndex(
      (field) =>
        field.field_origin === "snies_original" &&
        field.worksheet_name === worksheetName &&
        field.name === fieldName
    );

    if (existingIndex >= 0) {
      handleFieldChange(existingIndex, fieldKey, value);
      return;
    }

    const selectedOption = fieldKey === "validate_with"
      ? validatorOptions.find((option) => option.name === value)
      : undefined;

    setFields((currentFields) => [
      ...currentFields,
      {
        ...getOriginalFieldConfig(worksheetName, fieldName),
        [fieldKey]: value,
        datatype: selectedOption
          ? selectedOption.type === "Número"
            ? "Entero"
            : "Texto Largo"
          : "Texto Corto",
      },
    ]);
  };

  useEffect(() => {
    const availableFields = (
      workbookSheets.find((sheet) => sheet.worksheetName === selectedOriginalWorksheet)?.visual_fields || []
    )
      .filter((field) => field.field_origin === "snies_original")
      .map((field) => field.name);

    if (!availableFields.length) {
      setSelectedOriginalField("");
      return;
    }

    if (!availableFields.includes(selectedOriginalField)) {
      setSelectedOriginalField(availableFields[0]);
    }
  }, [selectedOriginalWorksheet, selectedOriginalField, workbookSheets]);

  const onDragEnd = ({ source, destination }: DropResult) => {
    if (!destination) return;
    const originalFields = fields.filter((field) => field.field_origin === "snies_original");
    const extraFields = fields.filter((field) => field.field_origin !== "snies_original");
    const reorderedExtraFields = Array.from(extraFields);
    const [removed] = reorderedExtraFields.splice(source.index, 1);
    reorderedExtraFields.splice(destination.index, 0, removed);
    setFields([...originalFields, ...reorderedExtraFields]);
  };

  const getInsertAfterOptions = (worksheetName?: string, currentFieldName?: string) => {
    if (!worksheetName) {
      return [{ value: "", label: "Al final de la hoja" }];
    }

    const sheet = workbookSheets.find((item) => item.worksheetName === worksheetName);
    const sheetHeaders = sheet?.headers || [];

    const additionalFields = fields
      .filter(
        (field) =>
          field.worksheet_name === worksheetName &&
          field.name &&
          field.name !== currentFieldName
      )
      .map((field) => field.name);

    const uniqueOptions = [...new Set([...sheetHeaders, ...additionalFields])];

    return [
      { value: "", label: "Al final de la hoja" },
      ...uniqueOptions.map((fieldName) => ({
        value: fieldName,
        label: `Después de: ${fieldName}`,
      })),
    ];
  };

  const handleSave = async () => {
    if (!session?.user?.email) return;

    if (!name.trim() || !fileName.trim() || selectedDimensions.length === 0 || selectedDependencies.length === 0) {
      showNotification({
        title: "Faltan datos",
        message: "Debes completar nombre, archivo, ámbitos y productores.",
        color: "red",
      });
      return;
    }

    const duplicatedAdditionalField = fields.find((field) => {
      if (field.field_origin === "snies_original") {
        return false;
      }

      const normalizedName = field.name.trim().toUpperCase();
      const sheet = workbookSheets.find((item) => item.worksheetName === field.worksheet_name);
      const originalHeaders = (sheet?.visual_fields || [])
        .filter((item) => item.field_origin === "snies_original")
        .map((item) => item.name.trim().toUpperCase());

      return Boolean(normalizedName && originalHeaders.includes(normalizedName));
    });

    if (duplicatedAdditionalField) {
      showNotification({
        title: "Campo duplicado",
        message: `El campo "${duplicatedAdditionalField.name}" ya existe como campo SNIES original en la hoja ${duplicatedAdditionalField.worksheet_name}.`,
        color: "red",
      });
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/snies/templates/${id}`, {
        email: session.user.email,
        name: name.trim(),
        file_name: fileName.trim(),
        file_description: fileDescription.trim(),
        active,
        dimensions: selectedDimensions,
        producers: selectedDependencies,
        fields,
      });

      showNotification({
        title: "Plantilla actualizada",
        message: "La configuración SNIES se guardó correctamente.",
        color: "teal",
      });

      router.push("/snies/templates");
    } catch (error) {
      console.error("Error updating SNIES template:", error);
      showNotification({
        title: "Error",
        message: "No fue posible guardar la plantilla SNIES.",
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Center style={{ height: "100vh" }}>
        <Loader size="xl" />
      </Center>
    );
  }

  return (
    <Container size="xl" py="xl">
      <TextInput
        label="Nombre"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        mb="md"
      />
      <TextInput
        label="Nombre del Archivo"
        value={fileName}
        onChange={(event) => setFileName(event.currentTarget.value)}
        mb="md"
      />
      <TextInput
        label="Descripción del Archivo"
        value={fileDescription}
        onChange={(event) => setFileDescription(event.currentTarget.value)}
        mb="md"
      />
      <MultiSelect
        label="Ámbitos"
        placeholder="Seleccionar Ámbitos"
        data={dimensions.map((dimension) => ({ value: dimension._id, label: dimension.name }))}
        value={selectedDimensions}
        onChange={setSelectedDimensions}
        searchable
        mb="md"
      />
      <MultiSelect
        label="Productores"
        placeholder="Seleccionar productores"
        data={dependencies.map((dependency) => ({ value: dependency._id, label: dependency.name }))}
        value={selectedDependencies}
        onChange={setSelectedDependencies}
        searchable
        mb="md"
      />
      <Switch
        label="Activo"
        checked={active}
        onChange={(event) => setActive(event.currentTarget.checked)}
        mb="md"
      />

      <Accordion mb="xl" variant="contained">
        {workbookSheets.map((sheet, index) => (
            <Accordion.Item key={`${sheet.worksheetName}-${index}`} value={`${sheet.worksheetName}-${index}`}>
            <Accordion.Control>
              {sheet.worksheetName}
            </Accordion.Control>
            <Accordion.Panel>
              <Table withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Campo detectado en la hoja</Table.Th>
                    <Table.Th>Origen</Table.Th>
                    <Table.Th>Exporta a SNIES</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(sheet.visual_fields || []).length > 0 ? (
                    (sheet.visual_fields || []).map((field, headerIndex) => (
                      <Table.Tr key={`${sheet.worksheetName}-${headerIndex}`}>
                        <Table.Td>{headerIndex + 1}</Table.Td>
                        <Table.Td>{field.name}</Table.Td>
                        <Table.Td>{field.field_origin === "snies_original" ? "SNIES original" : "Campo adicional"}</Table.Td>
                        <Table.Td>{field.export_to_snies ? "Si" : "No"}</Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={4}>No se detectaron campos en esta hoja.</Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

      <Group mb="xs">
        <strong>Configurar campos originales SNIES</strong>
      </Group>
      <Group grow align="end" mb="md">
        <Select
          label="Hoja"
          placeholder="Selecciona una hoja"
          data={originalWorksheetOptions}
          value={selectedOriginalWorksheet}
          onChange={(value) => {
            setSelectedOriginalWorksheet(value || "");
            setSelectedOriginalField("");
          }}
          searchable
        />
        <Select
          label="Campo original"
          placeholder="Selecciona un campo"
          data={originalFieldOptions}
          value={selectedOriginalField}
          onChange={(value) => setSelectedOriginalField(value || "")}
          searchable
          disabled={!selectedOriginalWorksheet}
        />
      </Group>
      {selectedOriginalWorksheet && selectedOriginalField ? (
        <Table withTableBorder mb="xl">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Hoja</Table.Th>
              <Table.Th>Campo original</Table.Th>
              <Table.Th w={rem(320)}>Validar con Base de Datos</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>{selectedOriginalWorksheet}</Table.Td>
              <Table.Td>{selectedOriginalField}</Table.Td>
              <Table.Td>
                <Select
                  placeholder="Validar con"
                  data={validatorSelectOptions}
                  value={getOriginalFieldConfig(selectedOriginalWorksheet, selectedOriginalField).validate_with || ""}
                  onChange={(value) =>
                    handleOriginalFieldChange(
                      selectedOriginalWorksheet,
                      selectedOriginalField,
                      "validate_with",
                      value || ""
                    )
                  }
                  searchable
                  clearable
                  maxDropdownHeight={260}
                  comboboxProps={{ withinPortal: true }}
                  renderOption={({ option }) => {
                    const validatorOption = option as ValidatorSelectOption;
                    const columnsLabel = validatorOption.option?.columns?.length
                      ? validatorOption.option.columns.join(", ")
                      : "Sin columnas relacionadas";
                    const previewLabel = validatorOption.option?.preview_values?.length
                      ? validatorOption.option.preview_values.join(", ")
                      : "Sin valores de ejemplo";

                    return (
                      <Stack gap={2}>
                        <Text size="sm" fw={600}>
                          {option.label}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Columnas: {columnsLabel}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Valores: {previewLabel}
                        </Text>
                      </Stack>
                    );
                  }}
                />
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      ) : null}

      <Group mb="xs">
        <strong>Campos adicionales configurables</strong>
      </Group>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="snies-fields">
          {(provided) => (
            <Table withTableBorder {...provided.droppableProps} ref={provided.innerRef}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Arrastrar</Table.Th>
                  <Table.Th>Hoja</Table.Th>
                  <Table.Th>Posición</Table.Th>
                  <Table.Th>Nombre Campo</Table.Th>
                  <Table.Th>Tipo de Campo</Table.Th>
                  <Table.Th>¿Obligatorio?</Table.Th>
                  <Table.Th w={rem(280)}>Validar con Base de Datos</Table.Th>
                  <Table.Th w={rem(120)}>Lo llena productor</Table.Th>
                  <Table.Th w={rem(120)}>Exporta a SNIES</Table.Th>
                  <Table.Th>Comentario del Campo / Pista</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {additionalFieldEntries.map(({ field, index }, draggableIndex) => (
                  <Draggable key={`snies-field-${index}`} draggableId={`snies-field-${index}`} index={draggableIndex}>
                    {(draggableProvided) => (
                      <Table.Tr ref={draggableProvided.innerRef} {...draggableProvided.draggableProps}>
                        <Table.Td {...draggableProvided.dragHandleProps}>
                          <Center>
                            <IconGripVertical size={18} />
                          </Center>
                        </Table.Td>
                        <Table.Td w={rem(220)}>
                          <Select
                            placeholder="Selecciona hoja"
                            data={worksheetOptions}
                            value={field.worksheet_name || ""}
                            onChange={(value) => handleFieldChange(index, "worksheet_name", value || "")}
                            searchable
                          />
                        </Table.Td>
                        <Table.Td w={rem(260)}>
                          <Select
                            placeholder="Selecciona posiciÃƒÂ³n"
                            data={getInsertAfterOptions(field.worksheet_name, field.name)}
                            value={field.insert_after || ""}
                            onChange={(value) => handleFieldChange(index, "insert_after", value || "")}
                            disabled={!field.worksheet_name}
                            searchable
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            value={field.name}
                            onChange={(event) => handleFieldChange(index, "name", event.currentTarget.value)}
                          />
                        </Table.Td>
                        <Table.Td w={rem(160)}>
                          <Select
                            data={allowedDataTypes}
                            value={field.datatype}
                            onChange={(value) => handleFieldChange(index, "datatype", value || "")}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Center>
                            <Checkbox
                              checked={field.required}
                              onChange={(event) => handleFieldChange(index, "required", event.currentTarget.checked)}
                            />
                          </Center>
                        </Table.Td>
                        <Table.Td w={rem(280)}>
                          <Select
                            placeholder="Validar con"
                            data={validatorSelectOptions}
                            value={field.validate_with || ""}
                            onChange={(value) => handleFieldChange(index, "validate_with", value || "")}
                            searchable
                            clearable
                            maxDropdownHeight={260}
                            comboboxProps={{ withinPortal: true }}
                            renderOption={({ option }) => {
                              const validatorOption = option as ValidatorSelectOption;
                              const columnsLabel = validatorOption.option?.columns?.length
                                ? validatorOption.option.columns.join(", ")
                                : "Sin columnas relacionadas";
                              const previewLabel = validatorOption.option?.preview_values?.length
                                ? validatorOption.option.preview_values.join(", ")
                                : "Sin valores de ejemplo";

                              return (
                                <Stack gap={2}>
                                  <Text size="sm" fw={600}>
                                    {option.label}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    Columnas: {columnsLabel}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    Valores: {previewLabel}
                                  </Text>
                                </Stack>
                              );
                            }}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Center>
                            <Checkbox
                              checked={field.visible_for_producer ?? true}
                              onChange={(event) => handleFieldChange(index, "visible_for_producer", event.currentTarget.checked)}
                            />
                          </Center>
                        </Table.Td>
                        <Table.Td>
                          <Center>
                            <Checkbox
                              checked={field.export_to_snies ?? false}
                              onChange={(event) => handleFieldChange(index, "export_to_snies", event.currentTarget.checked)}
                            />
                          </Center>
                        </Table.Td>
                        <Table.Td>
                          <Textarea
                            value={field.comment || ""}
                            onChange={(event) => handleFieldChange(index, "comment", event.currentTarget.value)}
                            autosize
                            minRows={1}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Button color="red" onClick={() => removeField(index)}>
                            Eliminar
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </Table.Tbody>
            </Table>
          )}
        </Droppable>
      </DragDropContext>

      <Group mt="md">
        <Button onClick={addField} leftSection={<IconCirclePlus size={16} />}>
          AÃƒÂ±adir Campo
        </Button>
      </Group>
      <Group justify="center" mt="xl">
        <Button onClick={handleSave} loading={saving} leftSection={<IconDeviceFloppy size={16} />}>
          Guardar
        </Button>
        <Button variant="outline" onClick={() => router.push("/snies/templates")}>
          Cancelar
        </Button>
      </Group>
    </Container>
  );
}
