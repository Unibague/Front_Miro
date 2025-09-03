"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Container, TextInput, Button, Group, Table, Select, Tooltip, Center } from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { IconCancel, IconCirclePlus, IconGripVertical, IconDeviceFloppy } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

interface Template {
  _id: string;
  name: string;
}

const CreateCategoryPage = () => {
  const [categoryName, setCategoryName] = useState<string>('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fields, setFields] = useState<any[]>([{ templateId: "", sequence: 1 }]);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Fetch templates for the category
    const fetchTemplates = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/all/no-pagination`);
        setTemplates(response.data.templates);
      } catch (error) {
        console.error("Error fetching templates:", error);
      }
    };
    fetchTemplates();
  }, []);

  const handleFieldChange = (index: number, field: string, value: any) => {
    const updatedFields = [...fields];
    updatedFields[index] = { ...updatedFields[index], [field]: value };
    setFields(updatedFields);
  };

  const addField = () => {
    setFields([...fields, { templateId: "", sequence: 1 }]);
  };

  const removeField = (index: number) => {
    const updatedFields = fields.filter((_, i) => i !== index);
    setFields(updatedFields);
  };

  const handleSave = async () => {
    if (!categoryName || fields.length === 0 || fields.some(field => !field.templateId)) {
      showNotification({
        title: "Error",
        message: "Ingrese el nombre de la categoría y asigne al menos una plantilla.",
        color: "red",
      });
      return;
    }

    try {
      // Crear la categoría
      const categoryResponse = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/categories/create`, {
        name: categoryName,
        templates: fields, // Enviar plantillas junto con la categoría
      });

      showNotification({
        title: "Categoría creada",
        message: "La categoría se ha creado exitosamente.",
        color: "teal",
      });

      router.push("/templates/categories"); // Redirigir después de guardar
    } catch (error) {
      console.error("Error saving category:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al crear la categoría.",
        color: "red",
      });
    }
  };


  return (
    <Container size="xl">
      <TextInput
        label="Nombre de la Categoría"
        value={categoryName}
        onChange={(e) => setCategoryName(e.currentTarget.value)}
        placeholder="Ingrese el nombre de la categoría"
        mb="md"
        required
      />
      <DragDropContext onDragEnd={() => {}}>
        <Droppable droppableId="fields">
          {(provided) => (
            <Table stickyHeader withTableBorder {...provided.droppableProps} ref={provided.innerRef}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Arrastrar</Table.Th>
                  <Table.Th>Nombre de la Plantilla</Table.Th>
                  <Table.Th>Secuencia</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {fields.map((field, index) => (
                  <Draggable key={index} draggableId={`field-${index}`} index={index}>
                    {(provided) => (
                      <Table.Tr ref={provided.innerRef} {...provided.draggableProps}>
                        <Table.Td {...provided.dragHandleProps}>
                          <Center>
                            <IconGripVertical size={18} />
                          </Center>
                        </Table.Td>
                        <Table.Td>
                        <Select
                            value={field.templateId}
                            onChange={(value) => handleFieldChange(index, "templateId", value)}
                            data={templates.map((template) => ({
                              value: template._id,
                              label: template.name,
                            }))}
                            searchable
                            clearable
                            placeholder="Buscar y seleccionar plantilla"
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            type="number"
                            value={field.sequence}
                            onChange={(e) => handleFieldChange(index, "sequence", parseInt(e.currentTarget.value))}
                            min={1}
                            placeholder="Secuencia"
                          />
                        </Table.Td>
                        <Table.Td>
                          <Button color="red" onClick={() => removeField(index)}>Eliminar</Button>
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
        <Button leftSection={<IconCirclePlus />} onClick={addField}>
          Añadir Plantilla
        </Button>
      </Group>
      <Group mt="md" style={{ justifyContent: "flex-end" }}>
        <Button onClick={handleSave} leftSection={<IconDeviceFloppy />}>
          Guardar
        </Button>
        <Button
          variant="light"
          leftSection={<IconCancel />}
          onClick={() => router.back()}
          color="red"
        >
          Cancelar
        </Button>
      </Group>
    </Container>
  );
};

export default CreateCategoryPage;
