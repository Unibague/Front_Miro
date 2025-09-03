"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Container, TextInput, Button, Group, Table, Select, Tooltip, Center } from "@mantine/core";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { IconCancel, IconCirclePlus, IconGripVertical, IconDeviceFloppy } from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useParams } from "next/navigation";

interface Template {
  _id: string;
  name: string;
}

const EditCategoryPage = () => {
  const [categoryName, setCategoryName] = useState<string>('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const { data: session } = useSession();
  const router = useRouter();
  const { categoryId } = useParams();

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/all/no-pagination`);
        setTemplates(response.data.templates);
      } catch (error) {
        console.error("Error fetching templates:", error);
      }
    };

    const fetchCategory = async () => {
      if (categoryId) {
        try {
          const response = await axios.get(
            `${process.env.NEXT_PUBLIC_API_URL}/categories/${categoryId}`
          );
          const category = response.data;
          setCategoryName(category.name);
          // Mapeamos las plantillas asociadas con sus secuencias
          const templateFields = category.templates.map((template: any) => ({
            templateId: template.templateId._id,
            sequence: template.sequence,
          }));
          setFields(templateFields);
        } catch (error) {
          console.error("Error fetching category:", error);
        }
      }
    };

    fetchTemplates();
    fetchCategory();
  }, [categoryId]);

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
      // Crear el cuerpo de la solicitud con todas las plantillas
      const categoryData = {
        name: categoryName,
        templates: fields.map(field => ({
          templateId: field.templateId,
          sequence: field.sequence
        }))
      };
  
      // Enviar la actualización de la categoría
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/categories/${categoryId}`, categoryData);
  
      showNotification({
        title: "Categoría actualizada",
        message: "La categoría se ha actualizado exitosamente.",
        color: "teal",
      });
  
      router.push("/templates/categories"); // Redirigir después de guardar
  
    } catch (error) {
      console.error("Error updating category:", error);
      showNotification({
        title: "Error",
        message: "Hubo un error al actualizar la categoría.",
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

export default EditCategoryPage;
