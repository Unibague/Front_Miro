"use client";

import { useState, useRef, useEffect, FormEvent, ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Container,
  TextInput,
  Button,
  Group,
  Title,
  Paper,
  Center,
  Checkbox,
  Modal,
  Select,
  Box,
  ScrollArea,
  Stack,
  Tooltip,
  Text,
  ActionIcon
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconBulb,
  IconGripVertical,
  IconPlus,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import axios from "axios";
import { useSession } from "next-auth/react";
import styles from "./AdminValidationUpdatePage.module.css";
import { paramId } from "@/app/utils/routeParams";
import { usePeriod } from "@/app/context/PeriodContext";

interface Column {
  name: string;
  is_validator: boolean;
  type: string;
  values: (string | number)[];
  uiId: string;
}

let uiIdSequence = 0;
const createUiId = (prefix: "column" | "row") => `${prefix}-${Date.now()}-${uiIdSequence++}`;

interface SortableColumnProps {
  id: string;
  className?: string;
  children: ReactNode;
}

const SortableColumn = ({ id, className, children }: SortableColumnProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <Box
      ref={setNodeRef}
      mb="md"
      m={5}
      className={className}
      style={{
        minWidth: 200,
        maxWidth: 250,
        position: "relative",
        zIndex: isDragging ? 2 : undefined,
        opacity: isDragging ? 0.75 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Center pt="xs">
        <Tooltip label="Arrastrar columna" withArrow>
          <ActionIcon
            type="button"
            variant="subtle"
            color="gray"
            size="lg"
            aria-label="Arrastrar columna"
            style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={22} />
          </ActionIcon>
        </Tooltip>
      </Center>
      {children}
    </Box>
  );
};

interface SortableRowActionsProps {
  id: string;
  rowIndex: number;
  onRemove: () => void;
}

const SortableRowActions = ({ id, rowIndex, onRemove }: SortableRowActionsProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <Center
      ref={setNodeRef}
      mb={20}
      style={{
        zIndex: isDragging ? 3 : undefined,
        opacity: isDragging ? 0.75 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <Tooltip label="Arrastrar fila" withArrow>
          <ActionIcon
            type="button"
            variant="outline"
            size="lg"
            aria-label={`Arrastrar fila ${rowIndex + 1}`}
            style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none" }}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Eliminar fila" withArrow>
          <ActionIcon
            type="button"
            color="red"
            variant="outline"
            size="lg"
            aria-label={`Eliminar fila ${rowIndex + 1}`}
            onClick={onRemove}
          >
            <IconTrash size={20} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Center>
  );
};

const AdminValidationUpdatePage = () => {
  const router = useRouter();
  const params = useParams();
  const id = paramId(params);
  const { data: session } = useSession();
  const { selectedPeriodId } = usePeriod();

  const [name, setName] = useState<string>("");
  const [columns, setColumns] = useState<Column[]>([]);
  const [rowIds, setRowIds] = useState<string[]>([]);
  const [newValues, setNewValues] = useState<(string | number)[]>([]);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [currentColumnIndex, setCurrentColumnIndex] = useState<number | null>(null);
  const [showTooltip, setShowTooltip] = useState<boolean>(false);
  const [tooltipContent, setTooltipContent] = useState<string>("");
  const [isFormValid, setIsFormValid] = useState<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    const fetchValidation = async () => {
      if (!id || !selectedPeriodId) return;
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id`, {
          params: { id: id, periodId: selectedPeriodId }
        });
        const { validator } = response.data;
        setName(validator.name);
        const loadedColumns: Column[] = validator.columns.map((column: Omit<Column, "uiId">) => ({
          ...column,
          uiId: createUiId("column"),
        }));
        setColumns(loadedColumns);
        setRowIds(Array.from(
          { length: loadedColumns[0]?.values.length ?? 0 },
          () => createUiId("row")
        ));
        setNewValues(validator.columns.map(() => ""));
        setShowTooltip(validator.columns.length > 4);
      } catch (error) {
        console.error("Error fetching validation:", error);
      }
    };

    fetchValidation();
  }, [id, selectedPeriodId]);

  useEffect(() => {
  }, [columns]);

  const handleAddColumn = () => {
    const rowCount = columns[0]?.values.length ?? rowIds.length;
    const newColumns = [...columns, {
      name: "",
      is_validator: false,
      type: "",
      values: Array(rowCount).fill(""),
      uiId: createUiId("column"),
    }];
    setColumns(newColumns);
    setNewValues([...newValues, ""]);

    setShowTooltip(newColumns.length > 4);
  };

  const handleRemoveColumn = (index: number) => {
    const newColumns = columns.slice();
    newColumns.splice(index, 1);
    setColumns(newColumns);
    const newValuesArray = newValues.slice();
    newValuesArray.splice(index, 1);
    setNewValues(newValuesArray);
    setShowTooltip(newColumns.length > 4);
  };

  const handleColumnDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = columns.findIndex(column => column.uiId === active.id);
    const newIndex = columns.findIndex(column => column.uiId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    setColumns(arrayMove(columns, oldIndex, newIndex));
    setNewValues(arrayMove(newValues, oldIndex, newIndex));
  };

  const handleChangeColumn = (index: number, field: string, value: string | boolean) => {
    const newColumns = columns.slice();
    newColumns[index] = { ...newColumns[index], [field]: value };
    setColumns(newColumns);
  };

  const handleChangeValue = (index: number, value: string | number) => {
    const newValuesArray = newValues.slice();
    newValuesArray[index] = value;
    setNewValues(newValuesArray);
  };

  const handleAddValue = () => {
    // Verificar si hay valores duplicados en alguna columna
    const hasDuplicates = columns.some(column => {
      const values = column.values.filter(v => v !== "" && v !== null && v !== undefined);
      return values.length !== new Set(values.map(v => String(v).toLowerCase())).size;
    });

    if (hasDuplicates) {
      showNotification({
        title: "Error",
        message: "No se puede agregar una nueva fila mientras haya valores duplicados en las columnas",
        color: "red",
      });
      return;
    }

    const newColumns = columns.map(column => ({
      ...column,
      values: [...column.values, ""],
    }));
    setColumns(newColumns);
    setRowIds([...rowIds, createUiId("row")]);
    setNewValues(Array(newColumns.length).fill(""));
  };

  const handleRemoveValue = (valIndex: number) => {
    const newColumns = columns.map(column => ({
      ...column,
      values: column.values.filter((_, i) => i !== valIndex),
    }));
    setColumns(newColumns);
    setRowIds(rowIds.filter((_, index) => index !== valIndex));
  };

  const handleRowDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = rowIds.indexOf(String(active.id));
    const newIndex = rowIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    setRowIds(arrayMove(rowIds, oldIndex, newIndex));
    setColumns(columns.map(column => ({
      ...column,
      values: arrayMove(column.values, oldIndex, newIndex),
    })));
  };

  const handleOpenModal = (index: number) => {
    setCurrentColumnIndex(index);
    setModalOpen(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isFormValid) {
      setShowTooltip(true);
      return;
    }

    if (!selectedPeriodId) {
      showNotification({
        title: "Periodo requerido",
        message: "Selecciona un periodo antes de actualizar la validación",
        color: "orange",
      });
      return;
    }

    // Convert values to their respective types before saving
    const columnsToSave = columns.map(({ uiId: _uiId, ...column }) => ({
      ...column,
      values: column.values.map(value => column.type === 'Número' ? Number(value) : String(value))
    }));

    try {
      await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/validators/update`, {
        id,
        name,
        columns: columnsToSave,
        adminEmail: session?.user?.email,
        periodId: selectedPeriodId,
      });
      showNotification({
        title: "Validación actualizada",
        message: "La validación ha sido actualizada exitosamente",
        color: "teal",
      });
      router.push("/admin/validations");
    } catch (error) {
      console.error("Error updating validation:", error);
      let errorMessage = "Hubo un error al actualizar la validación";
      const backendMessage = axios.isAxiosError(error) ? error.response?.data?.status : null;

      if (backendMessage === "Columns name cannot contain '-' character") {
        errorMessage = "El nombre de las columnas no puede tener un guión '-'";
      }
      showNotification({
        title: "Error",
        message: errorMessage,
        color: "red",
      });
    }
  };

  useEffect(() => {
    const validateForm = () => {
      if (!name) {
        setTooltipContent("El nombre de la validación es obligatorio.");
        setIsFormValid(false);
        return;
      }
      if (columns.length === 0) {
        setTooltipContent("Debe agregar al menos una columna.");
        setIsFormValid(false);
        return;
      }
      let hasValidator = false;
      for (const column of columns) {
        if (!column.name) {
          setTooltipContent("Todos los nombres de las columnas son obligatorios.");
          setIsFormValid(false);
          return;
        }
        if (!column.type) {
          setTooltipContent("Debe seleccionar un tipo para todas las columnas.");
          setIsFormValid(false);
          return;
        }
        if (column.values.length === 0) {
          setTooltipContent("Cada columna debe tener al menos un valor.");
          setIsFormValid(false);
          return;
        }
        if (column.is_validator) {
          hasValidator = true;
        }
        for (const value of column.values) {
          if (value === "" || value === null || value === undefined) {
            setTooltipContent("Todos los valores de las columnas deben estar llenos.");
            setIsFormValid(false);
            return;
          }
        }
        // Verificar duplicados en la columna
        const nonEmptyValues = column.values.filter(v => v !== "" && v !== null && v !== undefined);
        const uniqueValues = new Set(nonEmptyValues.map(v => String(v).toLowerCase()));
        if (nonEmptyValues.length !== uniqueValues.size) {
          setTooltipContent(`La columna "${column.name}" tiene valores duplicados.`);
          setIsFormValid(false);
          return;
        }
      }
      if (!hasValidator) {
        setTooltipContent("Debe marcar al menos una columna como validadora.");
        setIsFormValid(false);
        return;
      }
      setTooltipContent("Correcto.");
      setIsFormValid(true);
    };

    validateForm();
  }, [name, columns]);

  return (
    <Container size="xl">
      <Title ta={"center"} order={2} my="lg">Actualizar Validación</Title>
      <Paper radius="md" p="xl" withBorder shadow="xs">
        <form onSubmit={handleSubmit}>
          <TextInput
            label="Nombre de la Validación"
            placeholder="Ingrese el nombre de la validación"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
            mb="md"
          />
          <Text c="dimmed" size="xs" ta={"center"} mt="md" >
            <IconBulb color="#797979" size={20}></IconBulb>
            <br/>
            Para el nombre de las columnas no uses &quot;-&quot;, en su lugar usa &quot;_&quot;
          </Text>
          <Center mb="md" mt="md">
            <Button type="button" onClick={handleAddColumn} leftSection={<IconPlus size={20} />}>
              Agregar Columna
            </Button>
          </Center>
          <Text c="dimmed" size="sm" ta="center" mb="sm">
            Arrastra las columnas desde el control superior y las filas desde el control
            lateral. Los valores de cada fila se desplazan siempre juntos.
          </Text>
          <Tooltip
            label="Desplázate horizontalmente para ver todas las columnas"
            position="bottom"
            withArrow
            opened={showTooltip}
            transitionProps={{ transition: "slide-up", duration: 300 }}
          >
            <ScrollArea
              style={{ maxWidth: '100%', overflowX: 'auto' }}
              viewportRef={scrollAreaRef}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleColumnDragEnd}
              >
                <SortableContext
                  items={columns.map(column => column.uiId)}
                  strategy={horizontalListSortingStrategy}
                >
                  <Group wrap="nowrap" align="start">
                    {columns.map((column, colIndex) => (
                      <SortableColumn
                        id={column.uiId}
                        key={column.uiId}
                        className={column.is_validator ? styles.validatorColumn : ""}
                      >
                        <Stack p="xs" gap="xs">
                          <TextInput
                            placeholder="Nombre de la columna"
                            value={column.name}
                            onChange={(event) => handleChangeColumn(colIndex, 'name', event.currentTarget.value)}
                            required
                          />
                          <Center>
                            <Group gap="xs" wrap="nowrap">
                              <Tooltip label="Configurar columna" withArrow>
                                <ActionIcon
                                  type="button"
                                  variant="outline"
                                  size="lg"
                                  aria-label={`Configurar columna ${column.name || colIndex + 1}`}
                                  onClick={() => handleOpenModal(colIndex)}
                                >
                                  <IconSettings size={20} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Eliminar columna" withArrow>
                                <ActionIcon
                                  type="button"
                                  color="red"
                                  variant="outline"
                                  size="lg"
                                  aria-label={`Eliminar columna ${column.name || colIndex + 1}`}
                                  onClick={() => handleRemoveColumn(colIndex)}
                                >
                                  <IconTrash size={20} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Center>
                          {column.values.map((value, valIndex) => (
                            <Group grow key={rowIds[valIndex] ?? valIndex} mb="xs">
                              <TextInput
                                value={String(value)}
                                placeholder="Ingresa un valor"
                                onChange={(event) => {
                                  const newColumns = columns.slice();
                                  const newValue = column.type === 'Número' ? Number(event.currentTarget.value) : event.currentTarget.value;
                                  newColumns[colIndex].values[valIndex] = newValue;
                                  setColumns(newColumns);
                                }}
                              />
                            </Group>
                          ))}
                        </Stack>
                      </SortableColumn>
                    ))}
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleRowDragEnd}
                    >
                      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
                        <Box mt={151} style={{ minWidth: 90, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          {rowIds.map((rowId, valIndex) => (
                            <SortableRowActions
                              id={rowId}
                              key={rowId}
                              rowIndex={valIndex}
                              onRemove={() => handleRemoveValue(valIndex)}
                            />
                          ))}
                        </Box>
                      </SortableContext>
                    </DndContext>
                  </Group>
                </SortableContext>
              </DndContext>
            </ScrollArea>
          </Tooltip>
          <Center mt={45}>
            <Button type="button" onClick={handleAddValue} leftSection={<IconPlus size={20} />}>
              Agregar Fila
            </Button>
          </Center>
          <Center mt="md">
            <Tooltip
              label={tooltipContent}
              position="right"
              withArrow
              transitionProps={{ transition: "fade-left", duration: 300 }}
            >
              <div>
                <Button type="submit" disabled={!isFormValid}>
                  Actualizar Validación
                </Button>
              </div>
            </Tooltip>
          </Center>
        </form>
      </Paper>
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Configuración de Columna"
      >
        {currentColumnIndex !== null && columns[currentColumnIndex] && (
          <>
            <Select
              label="Tipo"
              placeholder="Seleccione el tipo."
              value={columns[currentColumnIndex].type || ""}
              onChange={(value) => handleChangeColumn(currentColumnIndex, 'type', value || '')}
              data={[
                { value: 'Texto', label: 'Texto' },
                { value: 'Número', label: 'Número' },
              ]}
              required
            />
            <Checkbox
              label="Es Validador"
              checked={columns[currentColumnIndex].is_validator}
              onChange={(event) => handleChangeColumn(currentColumnIndex, 'is_validator', event.currentTarget.checked)}
              mt="md"
            />
          </>
        )}
      </Modal>
    </Container>
  );
};

export default AdminValidationUpdatePage;
