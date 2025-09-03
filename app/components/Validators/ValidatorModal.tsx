import { useState, useEffect } from "react";
import {
  Modal,
  Text,
  Table,
  ScrollArea,
  ActionIcon,
  Center,
  TextInput,
  Group,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { IconCopy, IconSearch } from "@tabler/icons-react";

interface ValidatorModalProps {
  opened: boolean;
  onClose: () => void;
  validatorId: string;
  onCopy: (value: string) => void;
}

interface ValidatorData {
  name: string;
  columns: { name: string; is_validator: boolean; values: any[] }[];
}

export const ValidatorModal = ({ opened, onClose, validatorId, onCopy }: ValidatorModalProps) => {
  const [validatorData, setValidatorData] = useState<ValidatorData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchValidatorData = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id?id=${validatorId}`);
        setValidatorData(response.data.validator);
      } catch (error) {
        showNotification({
          title: "Error",
          message: "No se pudieron cargar los datos de validación",
          color: "red",
        });
      }
    };

    if (validatorId) {
      fetchValidatorData();
    }
  }, [validatorId]);

  const handleCopy = (value: string) => {
    navigator.clipboard.writeText(value);
  
    if (onCopy) {
      onCopy(value); 
    }
  
    showNotification({
      title: "Valor copiado",
      message: `"${value}" ha sido copiado al portapapeles`,
      color: "teal",
    });
  };
  

  return (
    <Modal opened={opened} onClose={onClose} title="Valores aceptados" size="lg">
      {validatorData ? (
        <>
          <Group mb="sm" justify="end">
          <TextInput
  placeholder="Buscar"
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.currentTarget.value)}
  leftSection={<IconSearch size={16} />}
  style={{ width: "100%" }}
/>

          </Group>

          <ScrollArea style={{ height: 300 }}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Valores aceptados</Table.Th>
                  <Table.Th>Descripción</Table.Th>
                  <Table.Th>Copiar</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {validatorData.columns.map((column, columnIndex) => {
                  if (column.is_validator) {
                    const descriptions =
                      validatorData.columns.find((col) => !col.is_validator)?.values || [];

                    return column.values
                      .map((value, valueIndex) => {
                        const description = descriptions[valueIndex] || "";
                        const matchesSearch =
                          value.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
                          description.toString().toLowerCase().includes(searchTerm.toLowerCase());

                        if (!matchesSearch) return null;

                        return (
                          <Table.Tr key={`${columnIndex}-${valueIndex}`}>
                            <Table.Td>{value}</Table.Td>
                            <Table.Td>{description}</Table.Td>
                            <Table.Td>
                              <Center>
                                <ActionIcon onClick={() => handleCopy(value)}>
                                  <IconCopy size={16} />
                                </ActionIcon>
                              </Center>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })
                      .filter(Boolean);
                  }
                  return null;
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </>
      ) : (
        <Text ta="center" c="dimmed">
          Cargando...
        </Text>
      )}
    </Modal>
  );
};
